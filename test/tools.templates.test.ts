import { describe, expect, test } from "bun:test";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { SignWellError } from "../src/signwell/errors.ts";
import { putStoredFileForTests } from "../src/tools/files.ts";
import { registerTemplateTools } from "../src/tools/templates.ts";

class MockClient {
  calls: Array<{ method: string; path: string; payload?: unknown; options?: unknown }> = [];
  responses: Record<string, unknown> = {};
  error?: SignWellError;

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

  async put(path: string, payload: unknown): Promise<Record<string, unknown>> {
    this.calls.push({ method: "put", path, payload });
    if (this.error) throw this.error;
    return (this.responses[path] as Record<string, unknown>) ?? { path, payload };
  }

  async delete(path: string): Promise<Record<string, unknown>> {
    this.calls.push({ method: "delete", path });
    if (this.error) throw this.error;
    return (this.responses[path] as Record<string, unknown>) ?? { path };
  }
}

type ToolHandler = (input: Record<string, unknown>) => Promise<CallToolResult>;
type PromptHandler = (args: Record<string, unknown>) => Promise<{
  messages: Array<{ role: string; content: { type: string; text: string } }>;
}>;

function setupTemplateTools() {
  const handlers = new Map<string, ToolHandler>();
  let promptHandler: PromptHandler | null = null;
  let promptName = "";
  const serverStub = {
    registerTool: (_name: string, _config: unknown, handler: ToolHandler) => {
      handlers.set(_name, handler);
      return {} as unknown;
    },
    registerPrompt: (_name: string, _config: unknown, cb: PromptHandler) => {
      promptName = _name;
      promptHandler = cb;
      return {} as unknown;
    },
  } satisfies Partial<McpServer>;

  const client = new MockClient();
  const count = registerTemplateTools(serverStub as unknown as McpServer, client as never);
  return { handlers, client, count, promptHandler, promptName };
}

function parseResult(result: CallToolResult) {
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

describe("registerTemplateTools", () => {
  test("registers all template tools", () => {
    const { count, handlers } = setupTemplateTools();
    expect(count).toBe(6);
    expect(Array.from(handlers.keys())).toEqual([
      "template_create",
      "template_update",
      "template_get",
      "template_list",
      "template_delete",
      "template_create_document",
    ]);
  });

  test("create document from template defaults to sending", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create_document");
    if (!handler) throw new Error("handler missing");

    const result = await handler({
      template_id: "tmp_1",
      recipients: [{ id: "recipient_1", placeholder_name: "Signer", email: "alice@example.com" }],
    });

    expect(client.calls[0]).toMatchObject({
      method: "post",
      path: "/document_templates/documents",
    });
    const body = client.calls[0]?.payload as Record<string, unknown>;
    expect(body.draft).toBe(false);

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.type).toBe("template_create_document");
    expect(payload.message).toBe(
      "Document has been sent for signing. Recipients will receive an email to sign the document.",
    );
  });

  test("template errors propagate SignWellError metadata", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create");
    if (!handler) throw new Error("handler missing");

    client.error = new SignWellError({
      message: "Auth failed",
      type: "auth",
      status: 401,
      requestId: "req_456",
    });

    const result = await handler({
      name: "Template",
      placeholders: [{ id: "signer_1", name: "Signer" }],
      files: [{ name: "doc.pdf", file_url: "https://example.com/doc.pdf" }],
    });

    expect(result.isError).toBe(true);
    const payload = parseResult(result);
    expect(payload.type).toBe("auth");
    expect(payload.data).toMatchObject({ status: 401, requestId: "req_456" });
  });

  test("template prompt delegates to SignWell client", async () => {
    const { promptHandler, promptName, client } = setupTemplateTools();
    if (!promptHandler) {
      throw new Error("prompt handler missing");
    }
    expect(promptName).toBe("search_template");

    client.responses["/document_templates/tmp_1"] = { id: "tmp_1", status: "draft" };

    const response = await promptHandler({ template_id: "tmp_1" });

    expect(client.calls.find((call) => call.method === "get")?.path).toBe(
      "/document_templates/tmp_1",
    );
    expect(response.messages).toHaveLength(1);
    expect(response.messages[0]?.role).toBe("user");
    expect(response.messages[0]?.content.text).toContain("tmp_1");
    expect(response.messages[0]?.content.text).toContain("Summarize this template");
  });

  test("template_create uses correct endpoint and defaults to draft", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create");
    if (!handler) throw new Error("handler missing");

    const result = await handler({
      name: "Test Template",
      placeholders: [{ id: "signer_1", name: "Signer" }],
      files: [{ name: "contract.pdf", file_url: "https://example.com/contract.pdf" }],
    });

    expect(client.calls[0]).toMatchObject({
      method: "post",
      path: "/document_templates",
    });
    const body = client.calls[0]?.payload as Record<string, unknown>;
    expect(body.draft).toBe(true);
    expect(body.name).toBe("Test Template");
    expect(body.placeholders).toEqual([{ id: "signer_1", name: "Signer" }]);

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.type).toBe("template_create");
  });

  test("template_create with all fields", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create");
    if (!handler) throw new Error("handler missing");

    const result = await handler({
      name: "Complete Template",
      placeholders: [
        { id: "client", name: "Client", preassigned_recipient_email: "client@example.com" },
        { id: "legal", name: "Legal Department" },
      ],
      copied_placeholders: [{ name: "CC Team", preassigned_recipient_email: "team@example.com" }],
      files: [{ name: "agreement.pdf", file_url: "https://example.com/agreement.pdf" }],
      fields: [
        [
          { x: 100, y: 200, page: 1, placeholder_id: "client", type: "signature" },
          {
            x: 300,
            y: 200,
            page: 1,
            placeholder_id: "client",
            type: "date",
            date_format: "MM/DD/YYYY",
          },
        ],
      ],
      subject: "Please sign this agreement",
      message: "Dear Client, please review and sign.",
      expires_in: 30,
      reminders: true,
      apply_signing_order: true,
      allow_decline: false,
      allow_reassign: true,
      redirect_url: "https://example.com/thanks",
      decline_redirect_url: "https://example.com/declined",
      language: "en",
      metadata: { project: "onboarding", client_id: "12345" },
      labels: [{ name: "Contracts" }, { name: "Priority" }],
      draft: false,
    });

    expect(client.calls[0]).toMatchObject({
      method: "post",
      path: "/document_templates",
    });
    const body = client.calls[0]?.payload as Record<string, unknown>;
    expect(body.draft).toBe(false);
    expect(body.subject).toBe("Please sign this agreement");
    expect(body.expires_in).toBe(30);
    expect(body.apply_signing_order).toBe(true);
    expect(body.metadata).toEqual({ project: "onboarding", client_id: "12345" });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
  });

  test("template_create tolerates Claude Code stringified arrays and booleans", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create");
    if (!handler) throw new Error("handler missing");

    const result = await handler({
      name: "Claude Template",
      placeholders: JSON.stringify([{ id: "client", name: "Client" }]),
      copied_placeholders: JSON.stringify([{ name: "CC Team" }]),
      files: JSON.stringify([
        { name: "agreement.pdf", file_url: "https://example.com/agreement.pdf" },
      ]),
      fields: JSON.stringify([
        [{ x: 100, y: 200, page: 1, placeholder_id: "client", type: "signature" }],
      ]),
      attachment_requests: JSON.stringify([{ name: "Driver License", placeholder_id: "client" }]),
      checkbox_groups: JSON.stringify([
        {
          group_name: "Consent",
          placeholder_id: "client",
          checkbox_ids: ["agree", "decline"],
          validation: "exact",
          exact_value: 1,
        },
      ]),
      labels: JSON.stringify([{ name: "Contracts" }]),
      text_tags: "true",
      draft: "false",
      reminders: "false",
      apply_signing_order: "true",
      allow_decline: "false",
      allow_reassign: "false",
    });

    const body = client.calls[0]?.payload as Record<string, unknown>;
    expect(Array.isArray(body.files)).toBe(true);
    expect(body.placeholders).toEqual([{ id: "client", name: "Client" }]);
    expect(body.copied_placeholders).toEqual([{ name: "CC Team" }]);
    expect(body.fields).toEqual([
      [{ x: 100, y: 200, page: 1, placeholder_id: "client", type: "signature", required: true }],
    ]);
    expect(body.attachment_requests).toEqual([
      { name: "Driver License", placeholder_id: "client", required: true },
    ]);
    expect(body.checkbox_groups).toEqual([
      {
        group_name: "Consent",
        placeholder_id: "client",
        checkbox_ids: ["agree", "decline"],
        validation: "exact",
        required: false,
        exact_value: 1,
      },
    ]);
    expect(body.labels).toEqual([{ name: "Contracts" }]);
    expect(body.text_tags).toBe(true);
    expect(body.draft).toBe(false);
    expect(body.reminders).toBe(false);
    expect(body.apply_signing_order).toBe(true);
    expect(body.allow_decline).toBe(false);
    expect(body.allow_reassign).toBe(false);

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
  });

  test("template_update uses PUT method and correct endpoint", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_update");
    if (!handler) throw new Error("handler missing");

    const result = await handler({
      template_id: "tmp_123",
      name: "Updated Template Name",
      expires_in: 60,
    });

    expect(client.calls[0]).toMatchObject({
      method: "put",
      path: "/document_templates/tmp_123",
    });
    const body = client.calls[0]?.payload as Record<string, unknown>;
    expect(body.name).toBe("Updated Template Name");
    expect(body.expires_in).toBe(60);
    // template_id should not be in the payload body
    expect(body.template_id).toBeUndefined();

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.type).toBe("template_update");
  });

  test("template_update tolerates Claude Code stringified arrays and booleans", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_update");
    if (!handler) throw new Error("handler missing");

    const result = await handler({
      template_id: "tmp_123",
      placeholders: JSON.stringify([{ id: "client", name: "Client" }]),
      files: JSON.stringify([
        { name: "agreement.pdf", file_url: "https://example.com/agreement.pdf" },
      ]),
      fields: JSON.stringify([
        [{ x: 100, y: 200, page: 1, placeholder_id: "client", type: "signature" }],
      ]),
      labels: JSON.stringify([{ name: "Contracts" }]),
      draft: "true",
      reminders: "false",
      apply_signing_order: "true",
      allow_decline: "false",
      allow_reassign: "true",
      text_tags: "true",
    });

    expect(client.calls[0]).toMatchObject({
      method: "put",
      path: "/document_templates/tmp_123",
    });
    const body = client.calls[0]?.payload as Record<string, unknown>;
    expect(body.files).toEqual([
      { name: "agreement.pdf", file_url: "https://example.com/agreement.pdf" },
    ]);
    expect(body.placeholders).toEqual([{ id: "client", name: "Client" }]);
    expect(body.fields).toEqual([
      [{ x: 100, y: 200, page: 1, placeholder_id: "client", type: "signature", required: true }],
    ]);
    expect(body.labels).toEqual([{ name: "Contracts" }]);
    expect(body.draft).toBe(true);
    expect(body.reminders).toBe(false);
    expect(body.apply_signing_order).toBe(true);
    expect(body.allow_decline).toBe(false);
    expect(body.allow_reassign).toBe(true);
    expect(body.text_tags).toBe(true);

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
  });

  test("template_get fetches template by id", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_get");
    if (!handler) throw new Error("handler missing");

    client.responses["/document_templates/tmp_456"] = {
      id: "tmp_456",
      name: "My Template",
      status: "Available",
    };

    const result = await handler({ template_id: "tmp_456" });

    expect(client.calls[0]).toMatchObject({
      method: "get",
      path: "/document_templates/tmp_456",
    });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.type).toBe("template_get");
  });

  test("template_list returns paginated templates", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_list");
    if (!handler) throw new Error("handler missing");

    client.responses["/document_templates"] = {
      templates: [{ id: "tmp_1", name: "Lease Template" }],
      current_page: 2,
      next_page: null,
      previous_page: 1,
      total_count: 1,
      total_pages: 2,
    };

    const result = await handler({ page: 2, per_page: 10 });

    expect(client.calls[0]).toMatchObject({
      method: "get",
      path: "/document_templates",
    });
    const options = client.calls[0]?.options as { query?: Record<string, unknown> };
    expect(options?.query).toEqual({ page: 2, per_page: 10 });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.type).toBe("template_list");
    const data = payload.data as Record<string, unknown>;
    expect(data).toHaveProperty("templates");
    expect(data).not.toHaveProperty("entries");
    expect(data.templates).toEqual([{ id: "tmp_1", name: "Lease Template" }]);
    expect(data.total_count).toBe(1);
  });

  test("template_delete removes template", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_delete");
    if (!handler) throw new Error("handler missing");

    const result = await handler({ template_id: "tmp_789" });

    expect(client.calls[0]).toMatchObject({
      method: "delete",
      path: "/document_templates/tmp_789",
    });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.type).toBe("template_delete");
    expect((payload.data as { template_id: string }).template_id).toBe("tmp_789");
  });

  test("template_create_document with all options and embedded_signing", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create_document");
    if (!handler) throw new Error("handler missing");

    const result = await handler({
      template_id: "tmp_abc",
      name: "Custom Document Name",
      recipients: [
        {
          id: "recipient_1",
          placeholder_name: "Client",
          email: "alice@example.com",
          name: "Alice",
        },
        {
          id: "recipient_2",
          placeholder_name: "Legal",
          email: "bob@example.com",
          name: "Bob",
          send_email: false,
        },
      ],
      copied_contacts: [{ email: "cc@example.com", name: "CC Person" }],
      subject: "Custom subject",
      message: "Custom message",
      metadata: { deal_id: "deal_123" },
      draft: false,
      embedded_signing: true,
      redirect_url: "https://example.com/done",
      expires_in: 14,
    });

    expect(client.calls[0]).toMatchObject({
      method: "post",
      path: "/document_templates/documents",
    });
    const body = client.calls[0]?.payload as Record<string, unknown>;
    expect(body.template_id).toBe("tmp_abc");
    expect(body.name).toBe("Custom Document Name");
    expect(body.draft).toBe(false);
    expect(body.embedded_signing).toBe(true);
    expect(body.expires_in).toBe(14);

    // send_email should be preserved when embedded_signing is true
    const recipients = body.recipients as Array<Record<string, unknown>>;
    expect(recipients[1]?.send_email).toBe(false);

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.message).toBe(
      "Document has been sent for signing. Recipients will receive an email to sign the document.",
    );
  });

  test("template_create_document strips send_email when embedded_signing is false", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create_document");
    if (!handler) throw new Error("handler missing");

    const result = await handler({
      template_id: "tmp_xyz",
      recipients: [
        {
          id: "recipient_1",
          placeholder_name: "Signer",
          email: "signer@example.com",
          name: "Signer",
          send_email: true,
          send_email_delay: 5,
        },
      ],
      // embedded_signing is not set (defaults to false)
    });

    const body = client.calls[0]?.payload as Record<string, unknown>;
    const recipients = body.recipients as Array<Record<string, unknown>>;

    // send_email and send_email_delay should be stripped when embedded_signing is false
    expect(recipients[0]?.send_email).toBeUndefined();
    expect(recipients[0]?.send_email_delay).toBeUndefined();
    // Other fields should be preserved
    expect(recipients[0]?.id).toBe("recipient_1");
    expect(recipients[0]?.email).toBe("signer@example.com");

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
  });

  test("checkbox groups validation", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create");
    if (!handler) throw new Error("handler missing");

    const result = await handler({
      name: "Template with Checkbox Groups",
      placeholders: [{ id: "signer_1", name: "Signer" }],
      files: [{ name: "form.pdf", file_url: "https://example.com/form.pdf" }],
      fields: [
        [
          { x: 100, y: 100, page: 1, placeholder_id: "signer_1", type: "checkbox", api_id: "cb_1" },
          { x: 120, y: 100, page: 1, placeholder_id: "signer_1", type: "checkbox", api_id: "cb_2" },
          { x: 140, y: 100, page: 1, placeholder_id: "signer_1", type: "checkbox", api_id: "cb_3" },
        ],
      ],
      checkbox_groups: [
        {
          group_name: "Options",
          placeholder_id: "signer_1",
          checkbox_ids: ["cb_1", "cb_2", "cb_3"],
          validation: "minimum",
          required: true,
          min_value: 1,
        },
      ],
    });

    const body = client.calls[0]?.payload as Record<string, unknown>;
    expect(body.checkbox_groups).toHaveLength(1);
    const group = (body.checkbox_groups as Array<Record<string, unknown>>)[0];
    expect(group?.group_name).toBe("Options");
    expect(group?.validation).toBe("minimum");
    expect(group?.min_value).toBe(1);

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
  });

  test("template_create resolves file_token to base64", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create");
    if (!handler) throw new Error("handler missing");

    const token = `test-template-token-${Date.now()}`;
    const fakeBase64 = Buffer.from("fake-pdf-content").toString("base64");
    putStoredFileForTests(token, {
      name: "stored.pdf",
      file_base64: fakeBase64,
      size_bytes: 16,
      createdAt: Date.now(),
    });

    const result = await handler({
      name: "Template via token",
      placeholders: [{ id: "1", name: "Signer" }],
      files: [{ name: "stored.pdf", file_token: token }],
      text_tags: true,
    });

    const body = client.calls[0]?.payload as Record<string, unknown>;
    const files = body.files as Array<Record<string, unknown>>;
    expect(files[0]?.file_base64).toBe(fakeBase64);
    expect(files[0]?.name).toBe("stored.pdf");

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
  });

  test("template_create returns error for expired file_token", async () => {
    const { handlers } = setupTemplateTools();
    const handler = handlers.get("template_create");
    if (!handler) throw new Error("handler missing");

    const result = await handler({
      name: "Template",
      placeholders: [{ id: "1", name: "Signer" }],
      files: [{ name: "doc.pdf", file_token: "expired-token" }],
    });

    expect(result.isError).toBe(true);
    const payload = parseResult(result);
    expect(payload.ok).toBe(false);
  });

  test("attachment requests validation", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create");
    if (!handler) throw new Error("handler missing");

    const result = await handler({
      name: "Template with Attachments",
      placeholders: [{ id: "client", name: "Client" }],
      files: [{ name: "contract.pdf", file_url: "https://example.com/contract.pdf" }],
      attachment_requests: [
        { name: "Driver License", placeholder_id: "client", required: true },
        { name: "Proof of Address", placeholder_id: "client", required: false },
      ],
    });

    const body = client.calls[0]?.payload as Record<string, unknown>;
    expect(body.attachment_requests).toHaveLength(2);
    const attachments = body.attachment_requests as Array<Record<string, unknown>>;
    expect(attachments[0]?.name).toBe("Driver License");
    expect(attachments[0]?.required).toBe(true);
    expect(attachments[1]?.required).toBe(false);

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
  });

  test("template_create warns when text_tags enabled but no fields parsed", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create");
    if (!handler) throw new Error("handler missing");

    // Mock response with empty fields (simulates PDF with no valid text tags)
    client.responses["/document_templates"] = {
      id: "tmp_123",
      status: "Created",
      fields: [],
      placeholders: [{ id: "1", name: "Signer" }],
    };

    const result = await handler({
      name: "Template with Text Tags",
      placeholders: [{ id: "1", name: "Signer" }],
      files: [{ name: "doc.pdf", file_url: "https://example.com/doc.pdf" }],
      text_tags: true,
    });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.warnings).toBeDefined();
    expect((payload.warnings as string[])[0]).toContain("text_tags was enabled");
    expect((payload.warnings as string[])[0]).toContain("{{signature:1:y}}");
  });

  test("template_create warns when no fields and text_tags not enabled", async () => {
    const { handlers, client } = setupTemplateTools();
    const handler = handlers.get("template_create");
    if (!handler) throw new Error("handler missing");

    // Mock response with empty fields
    client.responses["/document_templates"] = {
      id: "tmp_456",
      status: "Created",
      fields: [],
      placeholders: [{ id: "1", name: "Signer" }],
    };

    const result = await handler({
      name: "Template without Fields",
      placeholders: [{ id: "1", name: "Signer" }],
      files: [{ name: "doc.pdf", file_url: "https://example.com/doc.pdf" }],
      // text_tags not set
    });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.warnings).toBeDefined();
    expect((payload.warnings as string[])[0]).toContain("no signature fields");
    expect((payload.warnings as string[])[0]).toContain("template_builder_url");
  });
});
