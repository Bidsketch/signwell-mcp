import { SignWellError } from "../../src/signwell/errors.ts";

export interface RecordedCall {
  method: "get" | "post" | "delete";
  path: string;
  payload?: unknown;
  options?: unknown;
}

export class MockSignWellClient {
  public calls: RecordedCall[] = [];
  public responses: Record<string, unknown> = {};
  public error?: SignWellError;

  async get(path: string, options?: unknown): Promise<Record<string, unknown>> {
    this.calls.push({ method: "get", path, options });
    if (this.error) throw this.error;
    return (this.responses[path] as Record<string, unknown>) ?? { path };
  }

  async post(path: string, payload: unknown): Promise<Record<string, unknown>> {
    this.calls.push({ method: "post", path, payload });
    if (this.error) throw this.error;
    return (this.responses[path] as Record<string, unknown>) ?? { path, payload };
  }

  async delete(path: string): Promise<Record<string, unknown>> {
    this.calls.push({ method: "delete", path });
    if (this.error) throw this.error;
    return (this.responses[path] as Record<string, unknown>) ?? { path };
  }
}

export function createSignWellError(overrides: Partial<SignWellError> = {}): SignWellError {
  return new SignWellError({
    message: overrides.message ?? "SignWell error",
    type: overrides.type ?? "server",
    status: overrides.status,
    requestId: overrides.requestId,
    details: overrides.details,
  });
}
