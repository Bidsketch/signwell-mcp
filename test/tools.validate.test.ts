import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { registerValidateTools } from "../src/tools/validate.ts";
import { putStoredFileForTests } from "../src/tools/files.ts";

type ToolHandler = (input: Record<string, unknown>, extra?: unknown) => Promise<CallToolResult>;

function setupTools() {
  const handlers = new Map<string, ToolHandler>();
  const serverStub = {
    registerTool: (_name: string, _config: unknown, handler: ToolHandler) => {
      handlers.set(_name, handler);
      return {} as unknown;
    },
  } satisfies Partial<McpServer>;

  const count = registerValidateTools(serverStub as unknown as McpServer);
  return { handlers, count };
}

function parseResult(result: CallToolResult) {
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

function createMinimalPdf(text: string): string {
  const content = `BT /F1 12 Tf 100 700 Td (${text}) Tj ET`;
  const contentLen = content.length;

  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const obj2 = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
  const obj3 =
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n";
  const obj4 = `4 0 obj\n<< /Length ${contentLen} >>\nstream\n${content}\nendstream\nendobj\n`;
  const obj5 = "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";

  const header = "%PDF-1.4\n";
  const body = obj1 + obj2 + obj3 + obj4 + obj5;

  const offsets: number[] = [];
  let pos = header.length;
  offsets.push(pos);
  pos += obj1.length;
  offsets.push(pos);
  pos += obj2.length;
  offsets.push(pos);
  pos += obj3.length;
  offsets.push(pos);
  pos += obj4.length;
  offsets.push(pos);

  const xrefStart = header.length + body.length;
  let xref = "xref\n0 6\n";
  xref += "0000000000 65535 f \n";
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return header + body + xref + trailer;
}

describe("registerValidateTools", () => {
  test("registers file_validate_text_tags tool", () => {
    const { count, handlers } = setupTools();
    expect(count).toBe(1);
    expect(handlers.has("file_validate_text_tags")).toBe(true);
  });

  test("returns error when no input provided", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("file_validate_text_tags");
    if (!handler) throw new Error("handler missing");

    const result = await handler({});

    expect(result.isError).toBe(true);
    const payload = parseResult(result);
    expect(payload.type).toBe("validation");
    expect(payload.message).toContain("use_picker");
  });

  test("prompts picker when use_picker is true", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("file_validate_text_tags");
    if (!handler) throw new Error("handler missing");

    const pdfContent = createMinimalPdf("{{signature:3:y}}");
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "signwell-validate-picker-"));
    const filePath = path.join(tempDir, "picker.pdf");
    await fs.writeFile(filePath, pdfContent, "utf8");
    process.env.SIGNWELL_MCP_TEST_PICKER_PATH = filePath;

    try {
      const result = await handler({ use_picker: true });
      const payload = parseResult(result);
      expect(payload.ok).toBe(true);
      const data = payload.data as Record<string, unknown>;
      expect(data.valid_tags).toEqual(["{{signature:3:y}}"]);
      expect(data.signer_ids).toEqual(["3"]);
    } finally {
      delete process.env.SIGNWELL_MCP_TEST_PICKER_PATH;
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test("returns error for expired/missing file_token", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("file_validate_text_tags");
    if (!handler) throw new Error("handler missing");

    const result = await handler({ file_token: "nonexistent-token" });

    expect(result.isError).toBe(true);
    const payload = parseResult(result);
    expect(payload.type).toBe("validation");
    expect(payload.message).toContain("expired or invalid");
  });

  test("finds valid tags from file_token", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("file_validate_text_tags");
    if (!handler) throw new Error("handler missing");

    const pdfText = "{{signature:1:y}} {{date:1:y}} {{text:2:n:Label}}";
    const pdfContent = createMinimalPdf(pdfText);
    const pdfBase64 = Buffer.from(pdfContent).toString("base64");
    const token = `test-token-${Date.now()}`;
    putStoredFileForTests(token, {
      name: "test.pdf",
      file_base64: pdfBase64,
      size_bytes: Buffer.from(pdfContent).byteLength,
      createdAt: Date.now(),
    });

    const result = await handler({ file_token: token });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);
    expect(payload.type).toBe("file_validate_text_tags");

    const data = payload.data as Record<string, unknown>;
    expect(data.text_extractable).toBe(true);
    expect(data.valid_tags).toEqual(["{{signature:1:y}}", "{{date:1:y}}", "{{text:2:n:Label}}"]);
    expect(data.malformed_tags).toEqual([]);
    expect((data.signer_ids as string[]).sort()).toEqual(["1", "2"]);
  });

  test("finds valid tags from file_base64", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("file_validate_text_tags");
    if (!handler) throw new Error("handler missing");

    const pdfContent = createMinimalPdf("{{signature:1:y}}");
    const pdfBase64 = Buffer.from(pdfContent).toString("base64");

    const result = await handler({ file_base64: pdfBase64 });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);

    const data = payload.data as Record<string, unknown>;
    expect(data.text_extractable).toBe(true);
    expect(data.valid_tags).toEqual(["{{signature:1:y}}"]);
    expect(data.signer_ids).toEqual(["1"]);
  });

  test("reports malformed tags", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("file_validate_text_tags");
    if (!handler) throw new Error("handler missing");

    const pdfContent = createMinimalPdf("{{signature:1:y}} {{bad_type:1:y}} {{signature:2:x}}");
    const pdfBase64 = Buffer.from(pdfContent).toString("base64");

    const result = await handler({ file_base64: pdfBase64 });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);

    const data = payload.data as Record<string, unknown>;
    expect(data.valid_tags).toEqual(["{{signature:1:y}}"]);
    expect(data.malformed_tags).toEqual(["{{bad_type:1:y}}", "{{signature:2:x}}"]);
    expect((data.recommendations as string[])[0]).toContain("malformed");
    expect(payload.warnings?.some((warning) => warning.includes("inform the user"))).toBe(true);
  });

  test("reports when no tags found in extractable text", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("file_validate_text_tags");
    if (!handler) throw new Error("handler missing");

    const pdfContent = createMinimalPdf("Hello world, no tags here");
    const pdfBase64 = Buffer.from(pdfContent).toString("base64");

    const result = await handler({ file_base64: pdfBase64 });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);

    const data = payload.data as Record<string, unknown>;
    expect(data.text_extractable).toBe(true);
    expect(data.valid_tags).toEqual([]);
    expect(data.malformed_tags).toEqual([]);
    expect((data.recommendations as string[])[0]).toContain("No text tags found");
    expect(
      (data.recommendations as string[]).some(
        (rec) => rec.includes("SignWell") && rec.includes("editor"),
      ),
    ).toBe(true);
    expect(
      payload.warnings?.some(
        (warning) => warning.includes("SignWell") && warning.includes("editor"),
      ),
    ).toBe(true);
  });

  test("handles non-extractable PDF content", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("file_validate_text_tags");
    if (!handler) throw new Error("handler missing");

    // Pass garbage data that is not a valid PDF
    const garbageBase64 = Buffer.from("not a pdf at all").toString("base64");

    const result = await handler({ file_base64: garbageBase64 });

    const payload = parseResult(result);
    expect(payload.ok).toBe(true);

    const data = payload.data as Record<string, unknown>;
    expect(data.text_extractable).toBe(false);
    expect((data.recommendations as string[])[0]).toContain("not contain selectable");
    expect(payload.warnings?.some((warning) => warning.includes("create the document draft"))).toBe(
      true,
    );
  });

  test("supports initials tag type", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("file_validate_text_tags");
    if (!handler) throw new Error("handler missing");

    const pdfContent = createMinimalPdf("{{initials:1:y}} {{initial:2:n}}");
    const pdfBase64 = Buffer.from(pdfContent).toString("base64");

    const result = await handler({ file_base64: pdfBase64 });

    const payload = parseResult(result);
    const data = payload.data as Record<string, unknown>;
    expect(data.valid_tags).toEqual(["{{initials:1:y}}", "{{initial:2:n}}"]);
    expect((data.signer_ids as string[]).sort()).toEqual(["1", "2"]);
  });

  test("supports checkbox tag type", async () => {
    const { handlers } = setupTools();
    const handler = handlers.get("file_validate_text_tags");
    if (!handler) throw new Error("handler missing");

    const pdfContent = createMinimalPdf("{{checkbox:1:y}}");
    const pdfBase64 = Buffer.from(pdfContent).toString("base64");

    const result = await handler({ file_base64: pdfBase64 });

    const payload = parseResult(result);
    const data = payload.data as Record<string, unknown>;
    expect(data.valid_tags).toEqual(["{{checkbox:1:y}}"]);
  });
});
