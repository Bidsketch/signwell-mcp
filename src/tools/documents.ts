import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ReadResourceResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { SignWellClient } from "../signwell/client.ts";
import { SignWellError } from "../signwell/errors.ts";
import { textToDocx } from "../utils/docx-generator.ts";
import { errorResponse, successResponse, validationError } from "../utils/responses.ts";
import { getStoredFile } from "./files.ts";

export interface DocumentResponse {
  id: string;
  name?: string;
  status?: string;
  archived?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface DocumentListResponse {
  documents: DocumentResponse[];
  current_page: number;
  next_page: number | null;
  previous_page: number | null;
  total_count: number;
  total_pages: number;
}

const recipientSchema = z.object({
  id: z.string().min(1, { message: "Recipient id is required (e.g. '1')." }),
  email: z.string().email({ message: "Recipient email must be valid." }),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  role: z.string().optional(),
});

const fileSchema = z.object({
  name: z.string().min(1, { message: "File name is required." }),
  file_token: z
    .string()
    .optional()
    .describe(
      "Token from file_store (recommended). Use file_store first, then pass the token here.",
    ),
  file_url: z.string().url().optional(),
  file_base64: z.string().optional(),
  resource_uri: z.string().optional(),
  content_text: z
    .string()
    .optional()
    .describe(
      "Plain text or Markdown content to convert to DOCX. When provided, the MCP server generates a DOCX file automatically. Use this instead of file_base64 to avoid UI freezing with large documents.",
    ),
});

const copiedContactSchema = z.object({
  email: z.string().email({ message: "Copied contact email must be valid." }),
  name: z.string().optional().describe("Name of the CC recipient."),
});

const createDocumentSchema = z.object({
  name: z.string().min(1, { message: "Document name is required." }),
  recipients: z.array(recipientSchema).min(1, { message: "At least one recipient is required." }),
  files: z.array(fileSchema).min(1, { message: "Include at least one file." }),
  subject: z.string().optional().describe("Email subject line recipients will see."),
  message: z.string().optional().describe("Email message recipients will see."),
  text_tags: z.boolean().optional(),
  apply_signing_order: z
    .boolean()
    .default(false)
    .optional()
    .describe("When true, recipients sign one at a time in the order of the recipients array."),
  copied_contacts: z
    .array(copiedContactSchema)
    .optional()
    .describe("CC recipients who receive the final signed document by email."),
  expires_in: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("Days before the signature request expires (max 365)."),
  reminders: z
    .boolean()
    .default(true)
    .optional()
    .describe("Send signing reminders on day 3, 6, and 10."),
  allow_decline: z
    .boolean()
    .default(true)
    .optional()
    .describe("Allow recipients to decline signing."),
  allow_reassign: z
    .boolean()
    .default(true)
    .optional()
    .describe("Allow recipients to reassign to someone else."),
  redirect_url: z.string().url().optional().describe("URL to redirect after successful signing."),
  decline_redirect_url: z
    .string()
    .url()
    .optional()
    .describe("URL to redirect if document is declined."),
  metadata: z
    .record(z.string(), z.string())
    .optional()
    .describe("Key-value metadata (max 50 pairs, key max 40 chars, value max 500 chars)."),
  embedded_signing: z.boolean().default(false).optional().describe("Enable embedded signing."),
  embedded_signing_notifications: z
    .boolean()
    .default(false)
    .optional()
    .describe("Send completion notifications when using embedded signing."),
  custom_requester_name: z.string().optional().describe("Custom requester name on communications."),
  custom_requester_email: z
    .string()
    .email()
    .optional()
    .describe("Custom requester email on communications."),
});

const listDocumentsSchema = z.object({
  status: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  archived: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(25),
  updated_after: z.string().min(1).optional(),
  updated_before: z.string().min(1).optional(),
});

const documentIdSchema = z.string().min(1, { message: "document_id is required." });

const getDocumentSchema = z.object({
  document_id: documentIdSchema,
});

function parseJsonEncodedString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

const sendDraftSchema = z.object({
  document_id: documentIdSchema,
  confirm_send: z.preprocess(parseJsonEncodedString, z.boolean()).default(false),
  message: z.string().optional(),
});

const reminderSchema = z.object({
  document_id: documentIdSchema,
  recipient_email: z.string().email().optional(),
  message: z.string().optional(),
});

const completedPdfSchema = z.object({
  document_id: documentIdSchema,
  mode: z.enum(["url", "base64", "file"]).default("url"),
  save_to_path: z.string().optional(),
  include_audit_page: z.boolean().default(true),
  file_format: z.enum(["pdf", "zip"]).default("pdf"),
});

type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
type ListDocumentsInput = z.infer<typeof listDocumentsSchema>;
type GetDocumentInput = z.infer<typeof getDocumentSchema>;
type SendDraftInput = z.infer<typeof sendDraftSchema>;
type ReminderInput = z.infer<typeof reminderSchema>;
type CompletedPdfInput = z.infer<typeof completedPdfSchema>;

const ALLOWED_FILE_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".pages",
  ".ppt",
  ".pptx",
  ".key",
  ".xls",
  ".xlsx",
  ".numbers",
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
  ".tif",
  ".webp",
]);

function extractExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function validateFileExtension(name: string, fileUrl?: string): string | undefined {
  const ext = extractExtension(name);
  if (!ext) {
    return `File "${name}" is missing a file extension. Supported types: ${[...ALLOWED_FILE_EXTENSIONS].join(", ")}`;
  }
  if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
    return `File "${name}" has unsupported extension "${ext}". Supported types: ${[...ALLOWED_FILE_EXTENSIONS].join(", ")}`;
  }
  if (fileUrl) {
    const urlExt = extractExtension(new URL(fileUrl).pathname);
    if (urlExt && !ALLOWED_FILE_EXTENSIONS.has(urlExt)) {
      return `File URL for "${name}" points to unsupported type "${urlExt}". Supported types: ${[...ALLOWED_FILE_EXTENSIONS].join(", ")}`;
    }
  }
  return undefined;
}

const COMPLETED_PDF_WARNING_THRESHOLD_BYTES = 5 * 1024 * 1024;
type ReadResourceResult = z.infer<typeof ReadResourceResultSchema>;
type ToolExtraRequest = { method: string; params?: unknown };
type ToolExtra = {
  sendRequest?: (
    request: ToolExtraRequest,
    schema: typeof ReadResourceResultSchema,
  ) => Promise<ReadResourceResult>;
};

function deriveEditorUrl(data: Record<string, unknown>): string | undefined {
  const id = data.id;
  if (typeof id === "string" && id.length > 0) {
    return `https://www.signwell.com/app/builder/${id}`;
  }

  return undefined;
}

function attachEditorLink(data: unknown): { payload: unknown; editorUrl?: string } {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    const editorUrl = deriveEditorUrl(record);
    if (editorUrl) {
      return {
        payload: { ...record, editor_url: editorUrl },
        editorUrl,
      };
    }
    return { payload: record };
  }
  return { payload: data };
}

export function registerDocumentTools(server: McpServer, client: SignWellClient): number {
  let count = 0;

  const register = <Schema extends z.ZodTypeAny>(
    name: string,
    description: string,
    schema: Schema,
    handler: (input: z.infer<Schema>, extra: ToolExtra) => Promise<CallToolResult>,
    annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean },
  ) => {
    const toolHandler = (async (input: unknown, extra: ToolExtra) => {
      const validated = schema.parse(input);
      return handler(validated as z.infer<Schema>, extra);
    }) as Parameters<McpServer["registerTool"]>[2];

    server.registerTool(
      name,
      {
        description,
        inputSchema: schema,
        annotations,
      },
      toolHandler,
    );
    count += 1;
  };

  register(
    "document_create",
    `Create a SignWell document (always created as a draft).

CRITICAL RULES:
- Do NOT read, parse, extract, or verify file contents before uploading. The user already knows what is in the file.
- Do NOT convert files between formats (e.g. do NOT convert .docx to .pdf). SignWell handles conversion automatically.
- The user will place signature fields in the SignWell editor. Just upload the file and return the editor link.

SUPPORTED FILE TYPES: .pdf, .doc, .docx, .pages, .ppt, .pptx, .key, .xls, .xlsx, .numbers, .jpg, .jpeg, .png, .tiff, .tif, .webp

WORKFLOW FOR USER'S EXISTING FILES:
1. file_store (call with NO arguments to open native file picker) → returns file_token
2. document_create (pass file_token in files array) → creates draft, returns editor_url

WORKFLOW FOR CLAUDE-GENERATED FILES:
1. document_create with content_text directly (RECOMMENDED) → MCP server converts to DOCX automatically
   Pass plain text or Markdown as content_text. The server generates a DOCX file without base64 overhead.
   
2. document_create with file_base64 directly (skip file_store) → creates draft, returns editor_url
   Do NOT write the file to disk and pass a file_path — sandbox paths are inaccessible. Use file_base64.
   
   Example using content_text:
   {
     "name": "Service Agreement",
     "recipients": [{"id": "1", "email": "client@example.com"}],
     "files": [{"name": "agreement.docx", "content_text": "# Service Agreement\\n\\nThis agreement between..."}]
   }

FILE ACCESS: Chat attachments and sandbox paths (/home/claude, /mnt/user-data) are inaccessible to the MCP server. Do NOT use resource_uri or sandbox file_path values. For existing files, call file_store with no arguments to open the native file picker.

REQUIRED PARAMETERS:
1. name: Document name
2. recipients: Array with at least one object containing "id" and "email"
3. files: Array with at least one file object containing:
   - "name": Filename (e.g., "contract.docx")
   - One content source (in order of preference):
     * "content_text": Plain text or Markdown to auto-convert to DOCX (RECOMMENDED for Claude-generated content)
     * "file_token": Token from file_store (recommended for user files)
     * "file_url": Public URL to the file
     * "file_base64": Base64-encoded file content
     * "resource_uri": MCP resource URI

EXAMPLE (docx via file_token — most common):
{
  "name": "NDA Agreement",
  "recipients": [{"id": "1", "email": "signer@example.com"}],
  "files": [{"name": "nda.docx", "file_token": "<token from file_store>"}]
}

EXAMPLE (pdf with text tags):
{
  "name": "Contract",
  "text_tags": true,
  "recipients": [{"id": "1", "email": "signer@example.com"}],
  "files": [{"name": "contract.pdf", "file_token": "<token from file_store>"}]
}

TEXT TAGS (optional): Set text_tags: true only if the document already contains signature placeholders like {{signature:1:y}}.
The recipient "id" MUST match the number in text tags (id:"1" matches {{signature:1:y}}).`,
    createDocumentSchema,
    (input, extra) => handleCreateDocument(client, input, extra),
    { title: "Create Document", readOnlyHint: false, destructiveHint: false },
  );

  register(
    "document_list",
    "List SignWell documents with optional filtering (status, archived, search).",
    listDocumentsSchema,
    (input, extra) => handleListDocuments(client, input, extra),
    { title: "List Documents", readOnlyHint: true },
  );

  register(
    "document_get",
    "Fetch the latest status for a SignWell document.",
    getDocumentSchema,
    (input, extra) => handleGetDocument(client, input, extra),
    { title: "Get Document", readOnlyHint: true },
  );

  register(
    "document_send_draft",
    "Send a previously created draft document (requires confirm_send).",
    sendDraftSchema,
    (input, extra) => handleSendDraft(client, input, extra),
    { title: "Send Draft", readOnlyHint: false, destructiveHint: false },
  );

  register(
    "document_send_reminder",
    "Send a reminder email for a document (optionally to a specific recipient).",
    reminderSchema,
    (input, extra) => handleSendReminder(client, input, extra),
    { title: "Send Reminder", readOnlyHint: false, destructiveHint: false },
  );

  register(
    "document_completed_pdf",
    "Fetch the completed PDF. Use mode: 'base64' to get content for displaying in an artifact or chat (embed as data:application/pdf;base64,{pdf_base64}). Default 'url' mode returns a shareable link.",
    completedPdfSchema,
    (input, extra) => handleCompletedPdf(client, input, extra),
    { title: "Completed PDF", readOnlyHint: false, destructiveHint: false },
  );

  registerDocumentPrompt(server, client);

  return count;
}

async function handleCreateDocument(
  client: SignWellClient,
  input: CreateDocumentInput,
  extra: ToolExtra,
): Promise<CallToolResult> {
  for (const file of input.files) {
    if (
      !file.file_token &&
      !file.file_url &&
      !file.file_base64 &&
      !file.resource_uri &&
      !file.content_text
    ) {
      return errorResponse({
        type: "validation",
        message: `File "${file.name}" must have one of: content_text, file_token, file_url, file_base64, or resource_uri`,
      });
    }

    const extError = validateFileExtension(file.name, file.file_url);
    if (extError) {
      return errorResponse({ type: "validation", message: extError });
    }
  }

  try {
    const files = await resolveFileInputs(input.files, extra);
    const payload = {
      ...input,
      files,
      draft: true,
    };
    const data = await client.post("/documents", payload);
    const { payload: responsePayload, editorUrl } = attachEditorLink(data);
    return successResponse({
      type: "document_create",
      message: editorUrl
        ? "Document draft created. Use the SignWell editor link to position or update fields."
        : "Document draft created.",
      data: responsePayload,
      warnings: editorUrl
        ? [
            "Assistant: share the editor_url so the user can add or adjust fields directly in SignWell. Do not promise to place fields manually within this chat.",
          ]
        : undefined,
    });
  } catch (error) {
    return toToolError(error, "Unable to create the document.");
  }
}

async function handleListDocuments(
  client: SignWellClient,
  input: ListDocumentsInput,
  _extra: ToolExtra,
): Promise<CallToolResult> {
  try {
    const query: Record<string, string | number | boolean> = {
      page: input.page,
      per_page: input.per_page,
    };

    if (input.status) {
      query.status = input.status;
    }
    if (input.search) {
      query.search = input.search;
    }
    if (typeof input.archived === "boolean") {
      query.archived = input.archived;
    }
    if (input.updated_after) {
      query.updated_after = input.updated_after;
    }
    if (input.updated_before) {
      query.updated_before = input.updated_before;
    }

    const data = await client.get<DocumentListResponse>("/documents", { query });
    return successResponse({
      type: "document_list",
      message: "Fetched documents.",
      data,
    });
  } catch (error) {
    return toToolError(error, "Unable to list documents.");
  }
}

async function handleGetDocument(
  client: SignWellClient,
  input: GetDocumentInput,
  _extra: ToolExtra,
): Promise<CallToolResult> {
  try {
    const data = await client.get(`/documents/${input.document_id}`);
    return successResponse({
      type: "document_get",
      message: "Fetched document status.",
      data,
    });
  } catch (error) {
    return toToolError(error, "Unable to fetch the document.");
  }
}

async function handleSendDraft(
  client: SignWellClient,
  input: SendDraftInput,
  _extra: ToolExtra,
): Promise<CallToolResult> {
  if (!input.confirm_send) {
    return validationError("Set confirm_send to true to send this draft.");
  }

  try {
    const payload = {
      message: input.message,
    };
    const data = await client.post(`/documents/${input.document_id}/send`, payload);
    return successResponse({
      type: "document_send_draft",
      message: "Draft sent for signing.",
      data,
    });
  } catch (error) {
    return toToolError(error, "Unable to send the draft.");
  }
}

async function handleSendReminder(
  client: SignWellClient,
  input: ReminderInput,
  _extra: ToolExtra,
): Promise<CallToolResult> {
  try {
    const payload =
      input.recipient_email || input.message
        ? {
            recipient_email: input.recipient_email,
            message: input.message,
          }
        : {};

    const data = await client.post(`/documents/${input.document_id}/remind`, payload);
    return successResponse({
      type: "document_send_reminder",
      message: input.recipient_email
        ? `Reminder sent to ${input.recipient_email}.`
        : "Reminder sent to all pending recipients.",
      data,
    });
  } catch (error) {
    return toToolError(error, "Unable to send the reminder.");
  }
}

async function handleCompletedPdf(
  client: SignWellClient,
  input: CompletedPdfInput,
  _extra: ToolExtra,
): Promise<CallToolResult> {
  try {
    // Determine effective mode: if save_to_path is provided, use file mode
    const effectiveMode = input.save_to_path ? "file" : input.mode;

    const query = {
      url_only: effectiveMode === "url",
      audit_page: input.include_audit_page,
      file_format: input.file_format,
    };

    if (effectiveMode === "url") {
      const data = await client.get<{ file_url?: string }>(
        `/documents/${input.document_id}/completed_pdf`,
        { query },
      );
      const fileUrl = data?.file_url;
      if (!fileUrl) {
        return errorResponse({
          type: "server",
          message: "SignWell did not return a file_url for this document.",
        });
      }
      return successResponse({
        type: "document_completed_pdf",
        message:
          "Completed PDF ready. Share this direct download link with the user - they can open it in their browser to view or download the signed document.",
        data: { pdf_url: fileUrl },
      });
    }

    // Download the PDF buffer for both base64 and file modes
    const buffer = await client.requestBuffer({
      method: "GET",
      path: `/documents/${input.document_id}/completed_pdf`,
      query: { ...query, url_only: false },
      headers: {
        Accept: input.file_format === "zip" ? "application/zip" : "application/pdf",
      },
    });
    const nodeBuffer = Buffer.from(buffer);

    // File mode: save to disk
    if (effectiveMode === "file" && input.save_to_path) {
      await writeFile(input.save_to_path, nodeBuffer);
      const megabytes = (nodeBuffer.byteLength / (1024 * 1024)).toFixed(2);
      return successResponse({
        type: "document_completed_pdf",
        message: `Completed PDF saved to ${input.save_to_path} (${megabytes} MB).`,
        data: { saved_to: input.save_to_path, size_bytes: nodeBuffer.byteLength },
      });
    }

    // Base64 mode: return as base64 string
    const pdfBase64 = nodeBuffer.toString("base64");
    const warnings: string[] = [];
    if (nodeBuffer.byteLength >= COMPLETED_PDF_WARNING_THRESHOLD_BYTES) {
      const megabytes = (nodeBuffer.byteLength / (1024 * 1024)).toFixed(2);
      warnings.push(
        `Base64 response is ${megabytes} MB; prefer mode: "url" to reduce payload size.`,
      );
    }

    return successResponse({
      type: "document_completed_pdf",
      message:
        'Completed PDF retrieved. Display it in an artifact using: <iframe src="data:application/pdf;base64,{pdf_base64}" width="100%" height="600px"></iframe> or provide a download link. Do NOT attempt to save to disk.',
      data: { pdf_base64: pdfBase64 },
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (error) {
    return toToolError(error, "Unable to fetch the completed PDF.");
  }
}

function toToolError(error: unknown, fallback: string): CallToolResult {
  if (error instanceof SignWellError) {
    return errorResponse({
      type: error.type,
      message: error.message ?? fallback,
      data: {
        status: error.status,
        requestId: error.requestId,
        details: error.details,
      },
      error,
    });
  }

  return errorResponse({
    type: "unknown",
    message: fallback,
    error,
  });
}

function registerDocumentPrompt(server: McpServer, client: SignWellClient): void {
  server.registerPrompt(
    "search_document",
    {
      title: "Fetch a SignWell document",
      description: "Fetch SignWell document summary by id.",
      argsSchema: { document_id: z.string() },
    },
    async ({ document_id }): Promise<GetPromptResult> => {
      const data = await client.get(`/documents/${document_id}`);
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `${JSON.stringify(data, null, 2)}\n\nSummarize this document.`,
            },
          },
        ],
      };
    },
  );
}

async function resolveFileInputs(
  files: Array<z.infer<typeof fileSchema>>,
  extra: ToolExtra,
): Promise<Array<{ name: string; file_url?: string; file_base64?: string }>> {
  return Promise.all(
    files.map(async (file) => {
      if (file.file_token) {
        const stored = getStoredFile(file.file_token);
        if (!stored) {
          throw new Error(
            `file_token for "${file.name}" is expired or invalid. Call file_store again.`,
          );
        }
        return {
          name: file.name,
          file_base64: stored.file_base64,
        };
      }

      if (file.resource_uri) {
        const file_base64 = await fetchResourceAsBase64(file.resource_uri, extra);
        return {
          name: file.name,
          file_base64,
        };
      }

      if (file.content_text) {
        const docxBuffer = await textToDocx(file.content_text);
        const docxName = file.name.endsWith(".docx") ? file.name : `${file.name}.docx`;
        return {
          name: docxName,
          file_base64: docxBuffer.toString("base64"),
        };
      }

      return {
        name: file.name,
        file_url: file.file_url,
        file_base64: file.file_base64,
      };
    }),
  );
}

async function fetchResourceAsBase64(resourceUri: string, extra: ToolExtra): Promise<string> {
  if (!extra?.sendRequest) {
    throw new Error("Resource access is unavailable in this context.");
  }

  const result = await extra.sendRequest(
    {
      method: "resources/read",
      params: { uri: resourceUri },
    },
    ReadResourceResultSchema,
  );

  const content = result.contents?.[0];
  if (!content) {
    throw new Error(`Resource ${resourceUri} did not include any contents.`);
  }

  if ("blob" in content && content.blob) {
    return content.blob;
  }

  if ("text" in content && content.text) {
    return Buffer.from(content.text, "utf8").toString("base64");
  }

  throw new Error(`Resource ${resourceUri} must include blob or text content.`);
}
