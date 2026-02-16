import { Buffer } from "node:buffer";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ReadResourceResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { extractText } from "unpdf";
import { z } from "zod";

import { errorResponse, successResponse } from "../utils/responses.ts";
import { getStoredFile, pickFileUsingNativeDialog } from "./files.ts";

type ReadResourceResult = z.infer<typeof ReadResourceResultSchema>;
type ToolExtraRequest = { method: string; params?: unknown };
type ToolExtra = {
  sendRequest?: (
    request: ToolExtraRequest,
    schema: typeof ReadResourceResultSchema,
  ) => Promise<ReadResourceResult>;
};

const TAG_PATTERN = /\{\{[^}]*\}\}/g;
const VALID_TAG_PATTERN =
  /^\{\{(signature|date|text|initial|initials|checkbox):(\w+):(y|n)(?::([^}]+))?\}\}$/;

const validateTextTagsSchema = z.object({
  file_token: z.string().optional().describe("Token from file_store."),
  file_base64: z.string().optional().describe("Base64-encoded PDF content."),
  file_url: z.string().url().optional().describe("Public URL to download the PDF."),
  resource_uri: z.string().optional().describe("MCP resource URI for the file."),
  use_picker: z
    .boolean()
    .optional()
    .describe("Set to true to prompt for a local file when no other option is provided."),
});

type ValidateTextTagsInput = z.infer<typeof validateTextTagsSchema>;

export function registerValidateTools(server: McpServer): number {
  server.registerTool(
    "file_validate_text_tags",
    {
      description: `Validate text tags in a PDF before creating a template or document.

RECOMMENDED WORKFLOW: file_store → file_validate_text_tags → template_create/document_create

Accepts a PDF via file_token (from file_store), file_base64, file_url, or resource_uri.
Set use_picker: true to open a native file picker when no file input is provided.
Extracts text from the PDF and checks for valid SignWell text tags like {{signature:1:y}}.

Returns:
- Whether text is extractable from the PDF
- List of valid tags found
- List of malformed tags (if any)
- Signer numbers referenced
- Recommendations for fixing issues`,
      inputSchema: validateTextTagsSchema,
      annotations: { readOnlyHint: true },
    },
    async (input, extra) =>
      handleValidateTextTags(input as ValidateTextTagsInput, extra as ToolExtra),
  );

  return 1;
}

async function handleValidateTextTags(
  input: ValidateTextTagsInput,
  extra: ToolExtra,
): Promise<CallToolResult> {
  const hasDirectInput =
    input.file_token || input.file_base64 || input.file_url || input.resource_uri;
  if (!hasDirectInput && !input.use_picker) {
    return errorResponse({
      type: "validation",
      message:
        "Provide one of: file_token, file_base64, file_url, resource_uri, or set use_picker: true.",
    });
  }

  try {
    const pdfBuffer = await resolvePdfBuffer(input, extra);
    const { text, extractable } = await extractPdfText(pdfBuffer);

    if (!extractable) {
      return successResponse({
        type: "file_validate_text_tags",
        message: "PDF text is not extractable. Text tags will NOT work.",
        data: {
          text_extractable: false,
          valid_tags: [],
          malformed_tags: [],
          signer_ids: [],
          recommendations: [
            "This PDF does not contain selectable/searchable text.",
            "Text tags like {{signature:1:y}} must be real text in the PDF, not images.",
            "Regenerate the PDF using text drawing methods (e.g., drawString) with standard fonts.",
            "To verify manually: open the PDF and try to select/copy the tag text with your mouse.",
          ],
        },
        warnings: [
          "Assistant: create the document draft anyway and direct the user to SignWell's editor to place fields. Do not claim you can add the fields yourself; share the editor_url once available.",
        ],
      });
    }

    const allMatches = text.match(TAG_PATTERN) ?? [];
    const validTags: string[] = [];
    const malformedTags: string[] = [];
    const signerIds = new Set<string>();

    for (const tag of allMatches) {
      const match = tag.match(VALID_TAG_PATTERN);
      if (match) {
        validTags.push(tag);
        signerIds.add(match[2]);
      } else {
        malformedTags.push(tag);
      }
    }

    const recommendations: string[] = [];
    const warnings: string[] = [];
    if (validTags.length === 0 && malformedTags.length === 0) {
      recommendations.push(
        "No text tags found in the PDF.",
        "Add tags like {{signature:1:y}}, {{date:1:y}}, or {{text:1:y:Label}} to the PDF text.",
        "The number (1, 2, etc.) maps to a placeholder id in your template/document request.",
        "Use the SignWell editor to drag/drop fields directly: https://app.signwell.com/?redirect=/documents",
        "The MCP assistant cannot insert tags into the PDF automatically; build them in SignWell and re-upload.",
      );
      warnings.push(
        "Assistant: proceed by creating the document and sharing the SignWell editor link so the user can add fields there. Do not attempt to place fields manually in chat.",
      );
    } else if (malformedTags.length > 0) {
      recommendations.push(
        `Found ${malformedTags.length} malformed tag(s). Valid format: {{type:signer_id:required[:label]}}`,
        "Supported types: signature, date, text, initial, initials, checkbox",
        "Required field: 'y' (required) or 'n' (optional)",
      );
      warnings.push(
        "Assistant: inform the user that tags need correction within their PDF or via the SignWell editor; do not promise to fix field placement yourself.",
      );
    }

    if (validTags.length > 0 && malformedTags.length === 0) {
      recommendations.push(
        `All ${validTags.length} tag(s) are valid. You can proceed with template_create or document_create using text_tags: true.`,
        `Ensure your placeholders/recipients have ids matching: ${[...signerIds].join(", ")}`,
      );
    }

    return successResponse({
      type: "file_validate_text_tags",
      message:
        validTags.length > 0
          ? `Found ${validTags.length} valid text tag(s).`
          : "No valid text tags found.",
      data: {
        text_extractable: true,
        valid_tags: validTags,
        malformed_tags: malformedTags,
        signer_ids: [...signerIds],
        recommendations,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    return errorResponse({
      type: "validation",
      message: error instanceof Error ? error.message : "Unable to validate text tags.",
      error,
    });
  }
}

async function resolvePdfBuffer(
  input: ValidateTextTagsInput,
  extra: ToolExtra,
): Promise<Uint8Array> {
  if (input.file_token) {
    const stored = getStoredFile(input.file_token);
    if (!stored) {
      throw new Error(
        "file_token is expired or invalid. Call file_store again to get a new token.",
      );
    }
    return new Uint8Array(Buffer.from(stored.file_base64, "base64"));
  }

  if (input.file_base64) {
    return new Uint8Array(Buffer.from(input.file_base64, "base64"));
  }

  if (input.file_url) {
    const response = await fetch(input.file_url);
    if (!response.ok) {
      throw new Error(`Unable to fetch file_url (${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  if (input.resource_uri) {
    if (!extra?.sendRequest) {
      throw new Error("Resource handling is unavailable in this transport.");
    }
    const result = await extra.sendRequest(
      { method: "resources/read", params: { uri: input.resource_uri } },
      ReadResourceResultSchema,
    );
    const content = result.contents?.[0];
    if (!content) {
      throw new Error(`Resource ${input.resource_uri} did not include any contents.`);
    }
    if ("blob" in content && content.blob) {
      return new Uint8Array(Buffer.from(content.blob, "base64"));
    }
    if ("text" in content && content.text) {
      return new Uint8Array(Buffer.from(content.text, "utf8"));
    }
    throw new Error(`Resource ${input.resource_uri} must include blob or text content.`);
  }

  if (input.use_picker) {
    const picked = await pickFileUsingNativeDialog();
    return new Uint8Array(Buffer.from(picked.file_base64, "base64"));
  }

  throw new Error("No file input provided.");
}

async function extractPdfText(data: Uint8Array): Promise<{ text: string; extractable: boolean }> {
  try {
    const result = await extractText(data, { mergePages: true });
    const text =
      typeof result.text === "string" ? result.text : (result.text as string[]).join("\n");
    const trimmed = text.trim();
    return { text: trimmed, extractable: trimmed.length > 0 };
  } catch {
    return { text: "", extractable: false };
  }
}
