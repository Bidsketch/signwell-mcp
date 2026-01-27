import { mapHttpError, normalizeFetchError, SignWellError } from "./errors.ts";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "DELETE"]);

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface SignWellClientOptions {
  apiKey: string;
  baseUrl: string;
  userAgent: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

export interface RequestOptions {
  path: string;
  method: HttpMethod;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  idempotent?: boolean;
  timeoutMs?: number;
}

export class SignWellClient {
  private readonly apiKey: string;
  private readonly baseUrl: URL;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SignWellClientOptions) {
    if (!options.apiKey) {
      throw new Error("SignWellClient requires an apiKey.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = new URL(`${options.baseUrl.replace(/\/+$/, "")}/`);
    this.userAgent = options.userAgent;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImplementation ?? fetch;
  }

  async get<T>(path: string, options: Omit<RequestOptions, "method" | "path"> = {}): Promise<T> {
    return this.request<T>({ ...options, path, method: "GET" });
  }

  async post<T>(
    path: string,
    body: unknown,
    options: Omit<RequestOptions, "method" | "path" | "body"> = {},
  ): Promise<T> {
    return this.request<T>({ ...options, path, method: "POST", body });
  }

  async put<T>(
    path: string,
    body: unknown,
    options: Omit<RequestOptions, "method" | "path" | "body"> = {},
  ): Promise<T> {
    return this.request<T>({ ...options, path, method: "PUT", body });
  }

  async delete<T>(path: string, options: Omit<RequestOptions, "method" | "path"> = {}): Promise<T> {
    return this.request<T>({ ...options, path, method: "DELETE" });
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const response = await this.performRequest(options);
    return (await this.parseResponse<T>(response)) as T;
  }

  async requestBuffer(options: RequestOptions): Promise<ArrayBuffer> {
    const response = await this.performRequest(options);
    return response.arrayBuffer();
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    const cleanPath = path.replace(/^\//, "");
    const url = new URL(cleanPath, this.baseUrl);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          return;
        }
        url.searchParams.append(key, String(value));
      });
    }
    return url.toString();
  }

  private buildHeaders(hasBody: boolean, extra?: Record<string, string>): Headers {
    const headers = new Headers({
      "X-Api-Key": this.apiKey,
      Accept: "application/json",
      "User-Agent": this.userAgent,
    });

    if (hasBody) {
      headers.set("Content-Type", "application/json");
    }

    if (extra) {
      Object.entries(extra).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    return headers;
  }

  private async parseResponse<T>(response: Response): Promise<T | undefined> {
    if (response.status === 204) {
      return undefined;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    const text = await response.text();
    return text as unknown as T;
  }

  private async performRequest(options: RequestOptions): Promise<Response> {
    const url = this.buildUrl(options.path, options.query);
    const headers = this.buildHeaders(options.body !== undefined, options.headers);
    const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;
    const method = options.method;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const idempotent = options.idempotent ?? (RETRYABLE_METHODS.has(method) && body === undefined);

    let lastError: SignWellError | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await this.fetchImpl(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });

        if (response.ok) {
          clearTimeout(timeout);
          return response;
        }

        const error = await mapHttpError(response);
        if (attempt < MAX_RETRIES && idempotent && shouldRetry(response.status)) {
          clearTimeout(timeout);
          await wait(getBackoffDelay(attempt));
          lastError = error;
          continue;
        }

        throw error;
      } catch (error) {
        clearTimeout(timeout);
        lastError = normalizeFetchError(error);

        if (attempt >= MAX_RETRIES || !idempotent) {
          throw lastError;
        }
        await wait(getBackoffDelay(attempt));
      }
    }

    throw lastError ?? new SignWellError({ message: "Unknown error", type: "unknown" });
  }
}

function shouldRetry(status: number): boolean {
  if (status === 429) {
    return true;
  }
  return status >= 500 && status < 600;
}

function getBackoffDelay(attempt: number): number {
  const base = 200 * 2 ** (attempt - 1);
  const jitter = Math.random() * 100;
  return base + jitter;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
