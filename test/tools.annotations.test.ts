import { describe, expect, test } from "bun:test";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerDocumentTools } from "../src/tools/documents.ts";
import { registerFileTools } from "../src/tools/files.ts";
import { registerTemplateTools } from "../src/tools/templates.ts";
import { registerValidateTools } from "../src/tools/validate.ts";

interface ToolConfig {
  description?: string;
  inputSchema?: unknown;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  };
}

function createServerStub() {
  const configs = new Map<string, ToolConfig>();
  const serverStub = {
    registerTool: (name: string, config: ToolConfig, _handler: unknown) => {
      configs.set(name, config);
      return {} as unknown;
    },
    registerPrompt: () => ({}) as unknown,
  } satisfies Partial<McpServer>;
  return { serverStub: serverStub as unknown as McpServer, configs };
}

class MockClient {
  async get() {
    return {};
  }
  async post() {
    return {};
  }
  async put() {
    return {};
  }
  async delete() {
    return {};
  }
  async requestBuffer() {
    return new ArrayBuffer(0);
  }
}

describe("tool annotations", () => {
  const { serverStub, configs } = createServerStub();
  const client = new MockClient();

  registerFileTools(serverStub);
  registerValidateTools(serverStub);
  registerDocumentTools(serverStub, client as never);
  registerTemplateTools(serverStub, client as never);

  test("all 14 tools are registered", () => {
    expect(configs.size).toBe(14);
  });

  test("every tool has annotations", () => {
    for (const [_name, config] of configs) {
      expect(config.annotations).toBeDefined();
      const ann = config.annotations;
      const hasReadOnly = typeof ann?.readOnlyHint === "boolean";
      const hasDestructive = typeof ann?.destructiveHint === "boolean";
      expect(hasReadOnly || hasDestructive).toBe(true);
    }
  });

  const readOnlyTools = [
    "document_list",
    "document_get",
    "template_get",
    "template_list",
    "file_validate_text_tags",
  ];

  for (const name of readOnlyTools) {
    test(`${name} is read-only`, () => {
      const ann = configs.get(name)?.annotations;
      expect(ann).toBeDefined();
      expect(ann?.readOnlyHint).toBe(true);
    });
  }

  test("template_delete is destructive", () => {
    const ann = configs.get("template_delete")?.annotations;
    expect(ann).toBeDefined();
    expect(ann?.destructiveHint).toBe(true);
  });

  const mutatingNonDestructiveTools = [
    "document_create",
    "document_send_draft",
    "document_send_reminder",
    "document_completed_pdf",
    "template_create",
    "template_update",
    "template_create_document",
    "file_store",
  ];

  for (const name of mutatingNonDestructiveTools) {
    test(`${name} is mutating but not destructive`, () => {
      const ann = configs.get(name)?.annotations;
      expect(ann).toBeDefined();
      expect(ann?.readOnlyHint).toBe(false);
      expect(ann?.destructiveHint).toBe(false);
    });
  }
});
