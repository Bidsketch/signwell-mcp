import { Buffer } from "node:buffer";
import { describe, expect, test } from "bun:test";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { SignWellError } from "../src/signwell/errors.ts";
import { registerDocumentTools } from "../src/tools/documents.ts";
import { putStoredFileForTests } from "../src/tools/files.ts";

interface MockCall {
  method: "get" | "post" | "buffer";
  path: string;
  body?: unknown;
  options?: Record<string, unknown>;
}

class MockClient {
  calls: MockCall[] = [];
  getResponse: Record<string, unknown> = {};
  postResponse: Record<string, unknown> | null = null;
  bufferResponse: ArrayBuffer = Buffer.from("pdf");

  async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    this.calls.push({ method: "post", path, body });
    if (this.postResponse) {
      return this.postResponse;
    }
    return { path, body };
  }

  async get(path: string, options?: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.calls.push({ method: "get", path, options });
    if (Object.keys(this.getResponse).length > 0) {
      return this.getResponse;
    }
    return { path, options };
  }

  async requestBuffer(options: { path: string }): Promise<ArrayBuffer> {
    this.calls.push({ method: "buffer", path: options.path, options });
    return this.bufferResponse;
  }
}

type ToolHandler = (input: Record<string, unknown>) => Promise<CallToolResult>;

type PromptHandler = (args: Record<string, unknown>) => Promise<{
  messages: Array<{ role: string; content: { type: string; text: string } }>;
}>;

function setupTools() {
  const handlers = new Map<string, ToolHandler>();
  const toolConfigs = new Map<string, { description?: string }>();
  let promptHandler: PromptHandler | null = null;
  let promptName = "";
  const serverStub = {
    registerTool: (_name: string, _config: unknown, handler: ToolHandler) => {
      handlers.set(_name, handler);
      toolConfigs.set(_name, _config as { description?: string });
      return {} as unknown;
    },
    registerPrompt: (_name: string, _config: unknown, cb: PromptHandler) => {
      promptName = _name;
      promptHandler = cb;
      return {} as unknown;
    },
  } satisfies Partial<McpServer>;

  const client = new MockClient();
  const count = registerDocumentTools(serverStub as unknown as McpServer, client as never);
  return { handlers, client, count, promptHandler, promptName, toolConfigs };
}

function parseResult(result: CallToolResult) {
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

describe("registerDocumentTools", () => {
  test("registers all document tools", () => {
    const { count, handlers } = setupTools();

    expect(count).toBe(6);
    expect(Array.from(handlers.keys())).toEqual([
      "document_create",
      "document_list",
      "document_get",
      "document_send_draft",
      "document_send_reminder",
      "document_completed_pdf",
    ]);
  });

  test("create tool defaults to draft mode", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_create");
    if (!handler) {
      throw new Error("handler missing");
    }

    const result = await handler({
      name: "Agreement",
      recipients: [{ id: "1", email: "a@example.com" }],
      files: [{ name: "doc.pdf", file_url: "https://example.com/1.pdf" }],
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toMatchObject({
      method: "post",
      path: "/documents",
    });
    expect(client.calls[0]?.body).toMatchObject({ draft: true });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.type).toBe("document_create");
    expect(payload.message).toBe("Document draft created.");
  });

  test("create tool accepts html file types supported by SignWell API", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_create");
    if (!handler) {
      throw new Error("handler missing");
    }

    for (const name of ["doc.html", "doc.htm"]) {
      const result = await handler({
        name: "Agreement",
        recipients: [{ id: "1", email: "a@example.com" }],
        files: [{ name, file_url: `https://example.com/${name}` }],
      });

      expect(result.isError).toBeUndefined();
      const payload = parseResult(result);
      expect(payload.ok).toBe(true);
      expect(payload.type).toBe("document_create");
    }

    expect(client.calls).toHaveLength(2);
    expect(client.calls.map((call) => call.body)).toEqual([
      expect.objectContaining({
        files: [expect.objectContaining({ name: "doc.html" })],
      }),
      expect.objectContaining({
        files: [expect.objectContaining({ name: "doc.htm" })],
      }),
    ]);
  });

  test("create tool description advertises html file types", () => {
    const { toolConfigs } = setupTools();

    const description = toolConfigs.get("document_create")?.description;
    expect(description).toContain(".html");
    expect(description).toContain(".htm");
  });

  test("create tool surfaces editor link when provided by API", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_create");
    if (!handler) {
      throw new Error("handler missing");
    }

    client.postResponse = {
      id: "doc-123",
      embedded_edit_url: "https://www.signwell.com/edit/document/doc-123/",
    };

    const result = await handler({
      name: "Agreement",
      text_tags: true,
      recipients: [{ id: "1", email: "a@example.com" }],
      files: [{ name: "doc.pdf", file_url: "https://example.com/1.pdf" }],
    });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.data).toHaveProperty(
      "editor_url",
      "https://www.signwell.com/app/builder/doc-123",
    );
    expect(payload.message).toContain("editor link");
    expect(payload.warnings?.[0]).toContain("editor_url");
  });

  test("create tool resolves resource_uri into base64", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_create");
    if (!handler) {
      throw new Error("handler missing");
    }

    const resourceData = Buffer.from("pdf-bytes").toString("base64");
    const extra = {
      sendRequest: async () => ({
        contents: [{ uri: "resource://local-file", blob: resourceData }],
      }),
    } as unknown as Parameters<typeof handler>[1];

    await handler(
      {
        name: "Agreement",
        recipients: [{ id: "1", email: "a@example.com" }],
        files: [{ name: "doc.pdf", resource_uri: "resource://local-file" }],
      },
      extra,
    );

    const call = client.calls[0];
    expect(call?.method).toBe("post");
    expect((call?.body as { files: Array<Record<string, unknown>> }).files[0]?.file_base64).toBe(
      resourceData,
    );
  });

  test("create tool resolves file_token into base64", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_create");
    if (!handler) {
      throw new Error("handler missing");
    }

    const token = `test-doc-token-${Date.now()}`;
    const fakeBase64 = Buffer.from("fake-pdf-for-doc").toString("base64");
    putStoredFileForTests(token, {
      name: "stored-doc.pdf",
      file_base64: fakeBase64,
      size_bytes: 16,
      createdAt: Date.now(),
    });

    await handler({
      name: "Agreement",
      recipients: [{ id: "1", email: "a@example.com" }],
      files: [{ name: "stored-doc.pdf", file_token: token }],
    });

    const call = client.calls[0];
    expect(call?.method).toBe("post");
    const files = (call?.body as { files: Array<Record<string, unknown>> }).files;
    expect(files[0]?.file_base64).toBe(fakeBase64);
    expect(files[0]?.name).toBe("stored-doc.pdf");
  });

  test("create tool returns error for expired file_token", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("document_create");
    if (!handler) {
      throw new Error("handler missing");
    }

    const result = await handler({
      name: "Agreement",
      recipients: [{ id: "1", email: "a@example.com" }],
      files: [{ name: "doc.pdf", file_token: "expired-token" }],
    });

    expect(result.isError).toBe(true);
    const payload = parseResult(result);
    expect(payload.ok).toBe(false);
  });

  test("create tool validates file has at least one source", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("document_create");
    if (!handler) {
      throw new Error("handler missing");
    }

    const result = await handler({
      name: "Agreement",
      recipients: [{ id: "1", email: "a@example.com" }],
      files: [{ name: "doc.pdf" }],
    });

    expect(result.isError).toBe(true);
    const payload = parseResult(result);
    expect(payload.type).toBe("validation");
    expect(payload.message).toContain("must have one of");
  });

  test("create tool passes text_tags to API when provided", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_create");
    if (!handler) {
      throw new Error("handler missing");
    }

    await handler({
      name: "Agreement",
      recipients: [{ id: "1", email: "a@example.com" }],
      files: [{ name: "doc.pdf", file_url: "https://example.com/1.pdf" }],
      text_tags: true,
    });

    expect(client.calls[0]?.body).toMatchObject({
      draft: true,
      text_tags: true,
    });
  });

  test("list tool forwards query params", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_list");
    if (!handler) {
      throw new Error("handler missing");
    }

    client.getResponse = {
      documents: [{ id: "doc_1", name: "Q4 Agreement", status: "completed" }],
      current_page: 2,
      next_page: null,
      previous_page: 1,
      total_count: 1,
      total_pages: 2,
    };

    const result = await handler({
      status: "completed",
      archived: false,
      page: 2,
      per_page: 10,
      search: "Q4",
    });

    const call = client.calls.find((c) => c.method === "get" && c.path === "/documents");
    expect(call?.options).toMatchObject({
      query: {
        status: "completed",
        archived: false,
        page: 2,
        per_page: 10,
        search: "Q4",
      },
    });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.type).toBe("document_list");
    const data = payload.data as Record<string, unknown>;
    expect(data).toHaveProperty("documents");
    expect(data).not.toHaveProperty("entries");
    expect(data.documents).toEqual([{ id: "doc_1", name: "Q4 Agreement", status: "completed" }]);
    expect(data.total_count).toBe(1);
  });

  test("create tool enforces recipient validation", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("document_create");
    if (!handler) {
      throw new Error("handler missing");
    }

    await expect(
      handler({
        name: "Agreement",
        recipients: [{ id: "1", email: "not-an-email" }],
        files: [{ name: "doc.pdf", file_url: "https://example.com/1.pdf" }],
      }),
    ).rejects.toThrow();
  });

  test("send draft requires confirm flag", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_send_draft");
    if (!handler) {
      throw new Error("handler missing");
    }

    const result = await handler({
      document_id: "doc_123",
      confirm_send: false,
    });

    expect(client.calls).toHaveLength(0);
    expect(result.isError).toBe(true);
    const payload = parseResult(result);
    expect(payload.type).toBe("validation");
  });

  test("send draft tolerates Claude Code stringified confirm flag", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_send_draft");
    if (!handler) {
      throw new Error("handler missing");
    }

    const result = await handler({
      document_id: "doc_123",
      confirm_send: "true",
      message: "Please sign this document.",
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toMatchObject({
      method: "post",
      path: "/documents/doc_123/send",
      body: { message: "Please sign this document." },
    });
    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.type).toBe("document_send_draft");
  });

  test("send draft rejects invalid stringified confirm flag", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_send_draft");
    if (!handler) {
      throw new Error("handler missing");
    }

    await expect(
      handler({
        document_id: "doc_123",
        confirm_send: "not-a-boolean",
      }),
    ).rejects.toThrow();
    expect(client.calls).toHaveLength(0);
  });

  test("get tool returns client response", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("document_get");
    if (!handler) {
      throw new Error("handler missing");
    }

    const result = await handler({
      document_id: "doc_1",
    });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.type).toBe("document_get");
    expect(payload.data).toMatchObject({ path: "/documents/doc_1" });
  });

  test("completed_pdf defaults to URL mode", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_completed_pdf");
    if (!handler) {
      throw new Error("handler missing");
    }
    client.getResponse = { file_url: "https://files.signwell.com/doc.pdf" };

    const result = await handler({
      document_id: "doc_pdf",
    });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({ pdf_url: "https://files.signwell.com/doc.pdf" });

    const call = client.calls.find((c) => c.method === "get");
    expect(call?.path).toBe("/documents/doc_pdf/completed_pdf");
    expect(call?.options).toMatchObject({
      query: { url_only: true, audit_page: true, file_format: "pdf" },
    });
  });

  test("completed_pdf base64 mode emits warnings for large payloads", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_completed_pdf");
    if (!handler) {
      throw new Error("handler missing");
    }
    client.bufferResponse = Buffer.alloc(6 * 1024 * 1024, 1);

    const result = await handler({
      document_id: "doc_pdf",
      mode: "base64",
      include_audit_page: false,
      file_format: "zip",
    });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.data).toHaveProperty("pdf_base64");
    expect(payload.warnings?.[0]).toContain("Base64 response");

    const call = client.calls.find((c) => c.method === "buffer");
    expect(call?.path).toBe("/documents/doc_pdf/completed_pdf");
    expect(call?.options).toMatchObject({
      query: { url_only: false, audit_page: false, file_format: "zip" },
    });
  });

  test("completed_pdf url mode errors when file_url missing", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("document_completed_pdf");
    if (!handler) {
      throw new Error("handler missing");
    }

    const result = await handler({
      document_id: "doc_pdf",
      mode: "url",
    });

    expect(result.isError).toBe(true);
    const payload = parseResult(result);
    expect(payload.type).toBe("server");
  });

  test("completed_pdf saves to file when save_to_path provided", async () => {
    const { handlers, client } = setupTools();
    const handler = handlers.get("document_completed_pdf");
    if (!handler) {
      throw new Error("handler missing");
    }

    const testContent = Buffer.from("test-pdf-content");
    client.bufferResponse = testContent;
    const testPath = `/tmp/test-signwell-${Date.now()}.pdf`;

    try {
      const result = await handler({
        document_id: "doc_pdf",
        save_to_path: testPath,
      });

      const payload = parseResult(result);
      expect(payload.ok).toBe(true);
      expect(payload.data).toMatchObject({
        saved_to: testPath,
        size_bytes: testContent.byteLength,
      });

      // Verify file was written
      const file = Bun.file(testPath);
      expect(await file.exists()).toBe(true);
      const content = await file.arrayBuffer();
      expect(Buffer.from(content).toString()).toBe("test-pdf-content");
    } finally {
      // Cleanup
      const { unlink } = await import("node:fs/promises");
      await unlink(testPath).catch(() => {});
    }
  });

  test("tool errors propagate SignWellError metadata", async () => {
    const handlers = new Map<string, ToolHandler>();
    const serverStub = {
      registerTool: (_name: string, _config: unknown, handler: ToolHandler) => {
        handlers.set(_name, handler);
        return {} as unknown;
      },
      registerPrompt: () => ({}) as unknown,
    } satisfies Partial<McpServer>;

    const client = new MockClient();
    client.post = async () => {
      throw new SignWellError({
        message: "Auth error",
        type: "auth",
        status: 401,
        requestId: "req_123",
      });
    };
    registerDocumentTools(serverStub as unknown as McpServer, client as never);

    const handler = handlers.get("document_create");
    if (!handler) {
      throw new Error("handler missing");
    }

    const result = await handler({
      name: "Agreement",
      recipients: [{ id: "1", email: "a@example.com" }],
      files: [{ name: "doc.pdf", file_url: "https://example.com/1.pdf" }],
    });

    expect(result.isError).toBe(true);
    const payload = parseResult(result);
    expect(payload.type).toBe("auth");
    expect(payload.data).toMatchObject({ requestId: "req_123", status: 401 });
  });

  test("document prompt delegates to SignWell client", async () => {
    const { promptHandler, promptName, client } = setupTools();
    if (!promptHandler) {
      throw new Error("prompt handler missing");
    }
    expect(promptName).toBe("search_document");

    client.getResponse = { id: "doc_1", status: "sent" };

    const response = await promptHandler({ document_id: "doc_1" });

    expect(client.calls.find((c) => c.method === "get")?.path).toBe("/documents/doc_1");
    expect(response.messages).toHaveLength(1);
    expect(response.messages[0]?.role).toBe("user");
    expect(response.messages[0]?.content.text).toContain("doc_1");
    expect(response.messages[0]?.content.text).toContain("Summarize this document");
  });
});
