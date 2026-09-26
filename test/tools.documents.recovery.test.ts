import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SignWellClient } from "../src/signwell/client.ts";
import { registerDocumentTools } from "../src/tools/documents.ts";

test("MCP recovery requires consent, validates recipients, and preserves API failures", async () => {
  const requests: { method: string; url: string; body: unknown }[] = [];
  let status = 200;
  const api = new SignWellClient({
    apiKey: "test-key",
    baseUrl: "https://api.signwell.test/v1",
    userAgent: "signwell-mcp/test",
    fetchImplementation: (async (url, options) => {
      requests.push({
        method: options?.method ?? "GET",
        url: String(url),
        body: options?.body ? JSON.parse(String(options.body)) : undefined,
      });
      return status === 204
        ? new Response(null, { status })
        : Response.json(
            status === 200
              ? { id: "doc_123", recipients: [{ id: "recipient_123", name: "Correct Name" }] }
              : { message: "Recipient has started signing" },
            { status },
          );
    }) as typeof fetch,
  });
  const server = new McpServer({ name: "recovery-test", version: "1" });
  registerDocumentTools(server, api);
  const client = new Client({ name: "recovery-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    return { result, text: result.content[0]?.text ?? "" };
  };
  const recipient = { id: "recipient_123", name: "Correct Name", email: "signer@example.com" };
  try {
    for (const [name, args] of [
      ["document_update_recipients", { recipients: [recipient] }],
      ["document_delete", {}],
      [
        "document_update_recipients",
        { confirm_update: true, recipients: [{ ...recipient, email: "bad" }] },
      ],
      [
        "document_update_recipients",
        { confirm_update: true, recipients: [{ ...recipient, name: " " }] },
      ],
      ["document_send_draft", { confirm_send: true, recipients: [recipient] }],
    ] as const) {
      expect((await call(name, { document_id: "doc_123", ...args })).result.isError).toBe(true);
    }
    expect(requests).toHaveLength(0);

    const updated = await call("document_update_recipients", {
      document_id: "doc_123",
      confirm_update: "true",
      recipients: [recipient],
    });
    expect(JSON.parse(updated.text)).toMatchObject({
      ok: true,
      data: { recipients: [{ name: "Correct Name" }] },
    });
    expect(requests).toEqual([
      {
        method: "PATCH",
        url: "https://api.signwell.test/v1/documents/doc_123/recipients",
        body: { recipients: [recipient] },
      },
    ]);

    status = 422;
    const refused = await call("document_update_recipients", {
      document_id: "doc_123",
      confirm_update: true,
      recipients: [recipient],
    });
    expect(refused.result.isError).toBe(true);
    expect(JSON.parse(refused.text)).toMatchObject({ ok: false, data: { status: 422 } });
    expect(requests).toHaveLength(2);

    status = 204;
    const deleted = await call("document_delete", {
      document_id: "doc_123",
      confirm_delete: "true",
    });
    expect(JSON.parse(deleted.text)).toMatchObject({ ok: true, data: { document_id: "doc_123" } });
    expect(requests[2]).toEqual({
      method: "DELETE",
      url: "https://api.signwell.test/v1/documents/doc_123",
      body: undefined,
    });
  } finally {
    await client.close();
    await server.close();
  }
});
