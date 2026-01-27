import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { getStoredFile, registerFileTools } from "../src/tools/files.ts";

type ToolHandler = (input: Record<string, unknown>, extra?: unknown) => Promise<CallToolResult>;

function setupTools() {
  const handlers = new Map<string, ToolHandler>();
  const serverStub = {
    registerTool: (name: string, _config: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
      return {} as unknown;
    },
  } satisfies Partial<McpServer>;

  registerFileTools(serverStub as unknown as McpServer);
  return handlers;
}

function parseResult(result: CallToolResult) {
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

describe("file_store tool", () => {
  test("opens native picker when no explicit path provided", async () => {
    const handlers = setupTools();
    const handler = handlers.get("file_store");
    if (!handler) throw new Error("file_store handler missing");

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "signwell-mcp-file-store-"));
    const testFilePath = path.join(tempDir, "sample.pdf");
    const fileBody = "%PDF-1.4\nsample";
    await fs.writeFile(testFilePath, fileBody, "utf8");

    try {
      const result = await handler({ file_path: testFilePath }, {});
      const payload = parseResult(result);

      expect(payload.ok).toBe(true);
      expect(payload.type).toBe("file_store");

      const data = payload.data as { file_token: string; size_bytes: number };
      expect(typeof data.file_token).toBe("string");
      expect(data.size_bytes).toBe(Buffer.byteLength(fileBody));

      const stored = getStoredFile(data.file_token);
      expect(stored).toBeDefined();
      expect(stored?.name).toBe("sample.pdf");
      const decoded = Buffer.from(stored?.file_base64 ?? "", "base64").toString("utf8");
      expect(decoded).toBe(fileBody);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
