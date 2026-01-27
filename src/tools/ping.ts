import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { errorResponse, successResponse } from "../utils/responses.ts";

const pingInputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message must include at least one character.")
    .optional()
    .describe("Optional text to echo back in the pong response."),
});

export type PingInput = z.infer<typeof pingInputSchema>;

export async function handlePing(input: PingInput): Promise<CallToolResult> {
  try {
    const normalizedMessage = input.message ?? "pong";

    return successResponse({
      type: "ping",
      message: normalizedMessage,
      data: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return errorResponse({
      type: "internal",
      message: "Unable to complete ping request.",
      error,
    });
  }
}

export function registerHealthTools(server: McpServer): number {
  server.registerTool(
    "ping",
    {
      description: "Verify the SignWell MCP server is up and responding.",
      inputSchema: pingInputSchema,
    },
    async (input) => handlePing(input as PingInput),
  );

  return 1;
}
