export type SignWellErrorType =
  | "auth"
  | "not_found"
  | "validation"
  | "rate_limit"
  | "server"
  | "network"
  | "unknown";

export interface SignWellErrorOptions {
  message: string;
  type: SignWellErrorType;
  status?: number;
  requestId?: string | null;
  details?: unknown;
  cause?: unknown;
}

export class SignWellError extends Error {
  readonly type: SignWellErrorType;
  readonly status?: number;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(options: SignWellErrorOptions) {
    super(options.message);
    this.name = "SignWellError";
    this.type = options.type;
    this.status = options.status;
    this.requestId = options.requestId ?? undefined;
    this.details = options.details;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

const REQUEST_ID_HEADERS = ["x-request-id", "request-id"];

export async function mapHttpError(response: Response): Promise<SignWellError> {
  const { message, details } = await extractErrorDetails(response);
  return new SignWellError({
    message,
    type: mapStatusToType(response.status),
    status: response.status,
    requestId: extractRequestId(response),
    details,
  });
}

export function normalizeFetchError(error: unknown): SignWellError {
  if (error instanceof SignWellError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new SignWellError({
      message: "Request aborted (timeout or cancellation).",
      type: "network",
      cause: error,
    });
  }

  return new SignWellError({
    message: "Network error while calling SignWell.",
    type: "network",
    cause: error,
  });
}

function extractRequestId(response: Response): string | undefined {
  for (const header of REQUEST_ID_HEADERS) {
    const value = response.headers.get(header);
    if (value) {
      return value;
    }
  }
  return undefined;
}

async function extractErrorDetails(
  response: Response,
): Promise<{ message: string; details?: unknown }> {
  const fallback = `SignWell API request failed with status ${response.status}`;
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as Record<string, unknown>;
      const derivedMessage = pickErrorMessage(body) ?? fallback;
      return { message: derivedMessage, details: body };
    }

    const text = await response.text();
    if (text.trim().length === 0) {
      return { message: fallback };
    }
    return { message: text.trim() };
  } catch (error) {
    return { message: fallback, details: error };
  }
}

function pickErrorMessage(body: Record<string, unknown>): string | undefined {
  if (typeof body.message === "string" && body.message.trim().length > 0) {
    return body.message;
  }
  if (typeof body.error === "string" && body.error.trim().length > 0) {
    return body.error;
  }
  return undefined;
}

function mapStatusToType(status: number): SignWellErrorType {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 422) {
    return "validation";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status >= 500) {
    return "server";
  }
  if (status >= 400) {
    return "unknown";
  }
  return "unknown";
}
