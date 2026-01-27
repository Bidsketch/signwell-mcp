import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type ResponsePayload = {
  ok: boolean;
  type: string;
  message?: string;
  data?: unknown;
  error?: unknown;
  warnings?: string[];
};

function render(payload: ResponsePayload): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    ...(payload.ok ? {} : { isError: true as const }),
  };
}

export function successResponse(params: {
  type: string;
  message?: string;
  data?: unknown;
  warnings?: string[];
}): CallToolResult {
  return render({
    ok: true,
    type: params.type,
    message: params.message,
    data: params.data,
    warnings: params.warnings,
  });
}

export function errorResponse(params: {
  type?: string;
  message: string;
  error?: unknown;
  data?: unknown;
}): CallToolResult {
  return render({
    ok: false,
    type: params.type ?? "unknown",
    message: params.message,
    error: params.error,
    data: params.data,
  });
}

export function validationError(message: string, details?: unknown): CallToolResult {
  return errorResponse({
    type: "validation",
    message,
    error: details,
  });
}
