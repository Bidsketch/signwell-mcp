import { Buffer } from "node:buffer";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ReadResourceResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { SignWellClient } from "../signwell/client.ts";
import { SignWellError } from "../signwell/errors.ts";
import { errorResponse, successResponse } from "../utils/responses.ts";
import { isDebugEnabled } from "../config/env.ts";
import { getStoredFile } from "./files.ts";

function debugLog(message: string, data?: unknown): void {
  if (isDebugEnabled()) {
    console.error(
      `[SignWell DEBUG] ${message}`,
      data !== undefined ? JSON.stringify(data, null, 2) : "",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types (based on OpenAPI spec example response)
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateLabel {
  id: string;
  name: string;
}

export interface TemplateFile {
  name: string;
  pages_number: number;
}

export interface TemplateAttachmentRequest {
  name: string;
  required: boolean;
  url: string;
}

export interface TemplatePlaceholderResponse {
  id: string;
  name: string;
  subject: string | null;
  message: string | null;
  preassigned_recipient_name?: string;
  preassigned_recipient_email?: string;
  signing_order?: number;
  attachment_requests?: TemplateAttachmentRequest[];
}

export interface TemplateCopiedPlaceholderResponse {
  id: string;
  name: string;
  subject: string | null;
  message: string | null;
  preassigned_recipient_name?: string;
  preassigned_recipient_email?: string;
}

export interface TemplateFieldResponse {
  api_id: string;
  height: string;
  page: number;
  required: boolean;
  type: string;
  value: string | boolean | null;
  width: string;
  x: number;
  y: number;
  placeholder_name?: string;
  date_format?: string;
  formula?: string;
  lock_sign_date?: boolean;
  name?: string | null;
  fixed_width?: boolean;
  label?: string;
  validation?: string;
}

export interface TemplateCheckboxGroup {
  id: string;
  group_name: string;
  recipient_id: string | null;
  checkbox_ids: string[];
  validation: string;
  required: boolean;
  min_value?: number;
  max_value?: number;
  exact_value?: number;
}

export interface TemplateResponse {
  id: string;
  archived: boolean;
  created_at: string;
  embedded_edit_url: string;
  language: string;
  name: string;
  requester_email_address: string;
  status: string;
  template_link: string;
  updated_at: string;
  allow_decline: boolean;
  allow_reassign: boolean | null;
  api_application_id: string | null;
  decline_redirect_url: string;
  expires_in: number;
  redirect_url: string;
  reminders: boolean;
  metadata: Record<string, string>;
  apply_signing_order: boolean;
  message: string;
  subject: string;
  labels: TemplateLabel[];
  fields: TemplateFieldResponse[][];
  files: TemplateFile[];
  copied_placeholders: TemplateCopiedPlaceholderResponse[];
  placeholders: TemplatePlaceholderResponse[];
  checkbox_groups: TemplateCheckboxGroup[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Schemas (based on OpenAPI spec requestBody)
// NOTE: Avoiding .refine() as it doesn't serialize to JSON Schema for MCP
// ─────────────────────────────────────────────────────────────────────────────

// File schema - must provide name and one of: file_url, file_base64, or resource_uri
const templateFileSchema = z.object({
  name: z.string().describe("REQUIRED. Filename with extension (e.g., 'contract.pdf')."),
  file_token: z
    .string()
    .optional()
    .describe(
      "Token from file_store (recommended). Use file_store first, then pass the token here.",
    ),
  file_url: z.string().optional().describe("Public URL to download the file."),
  file_base64: z.string().optional().describe("Base64-encoded file content."),
  resource_uri: z.string().optional().describe("MCP resource URI for the file."),
});

// Placeholder schema - represents a signing role
const placeholderSchema = z.object({
  id: z
    .string()
    .describe(
      "REQUIRED. Unique ID that maps to the signer number in text tags (e.g., '1' for {{signature:1:y}}, '2' for {{signature:2:y}}).",
    ),
  name: z
    .string()
    .describe(
      "REQUIRED. Role name (e.g., 'Parent/Guardian', 'Client'). Used when assigning recipients via template_create_document.",
    ),
  preassigned_recipient_name: z.string().optional().describe("Pre-assigned recipient name."),
  preassigned_recipient_email: z.string().optional().describe("Pre-assigned recipient email."),
});

const copiedPlaceholderSchema = z.object({
  name: z.string().describe("REQUIRED. Name for the CC recipient role."),
  preassigned_recipient_name: z.string().optional().describe("Pre-assigned name."),
  preassigned_recipient_email: z.string().optional().describe("Pre-assigned email."),
});

// Dropdown option - can be a simple string or an object
const dropdownOptionSchema = z.object({
  name: z.string().describe("Option display text."),
  api_id: z.string().optional().describe("Unique ID for the option."),
  is_other: z.boolean().optional().describe("Whether this is an 'Other' option."),
});

const fieldSchema = z.object({
  x: z.number().describe("Horizontal position in pixels."),
  y: z.number().describe("Vertical position in pixels."),
  page: z.number().int().min(1).describe("Page number within the file."),
  placeholder_id: z.string().min(1).describe("ID of the placeholder assigned to this field."),
  type: z
    .enum([
      "initials",
      "signature",
      "checkbox",
      "date",
      "select",
      "text",
      "dropdown",
      "autofill_company",
      "autofill_email",
      "autofill_first_name",
      "autofill_last_name",
      "autofill_name",
      "autofill_phone",
      "autofill_title",
      "autofill_date_signed",
    ])
    .describe("Field type."),
  required: z.boolean().default(true).optional(),
  label: z.string().optional().describe("Label displayed when field is empty (text/date fields)."),
  value: z
    .union([z.string(), z.number(), z.boolean()])
    .optional()
    .describe(
      "Pre-filled value. Text accepts strings/numbers, date accepts ISO8601, checkbox accepts boolean.",
    ),
  api_id: z.string().optional().describe("Unique identifier for the field."),
  name: z.string().optional().describe("Checkbox group name."),
  validation: z
    .enum([
      "no_text_validation",
      "numbers",
      "letters",
      "email_address",
      "us_phone_number",
      "us_zip_code",
      "us_ssn",
      "us_age",
      "alphanumeric",
      "us_bank_routing_number",
      "us_bank_account_number",
    ])
    .optional()
    .describe("Text field validation type."),
  fixed_width: z.boolean().optional().describe("Text fields: keep fixed width with multiline."),
  lock_sign_date: z.boolean().optional().describe("Date fields: auto-populate with sign date."),
  date_format: z
    .enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY/MM/DD", "Month DD, YYYY", "MM/DD/YYYY hh:mm:ss a"])
    .optional()
    .describe("Date field format."),
  height: z.number().optional().describe("Field height in pixels."),
  width: z.number().optional().describe("Field width in pixels."),
  options: z.array(dropdownOptionSchema).optional().describe("Dropdown options."),
  default_option: z.string().optional().describe("Default dropdown option."),
  allow_other: z.boolean().optional().describe("Allow 'Other' option in dropdown."),
});

const attachmentRequestSchema = z.object({
  name: z.string().min(1, { message: "Attachment request name is required." }),
  placeholder_id: z
    .string()
    .min(1, { message: "Placeholder ID is required for attachment request." }),
  required: z.boolean().default(true).optional(),
});

const labelSchema = z.object({
  name: z.string().min(1, { message: "Label name is required." }),
});

const checkboxGroupSchema = z.object({
  group_name: z.string().min(1, { message: "Checkbox group name is required." }),
  placeholder_id: z.string().min(1, { message: "Placeholder ID is required for checkbox group." }),
  checkbox_ids: z.array(z.string()).min(2, { message: "At least 2 checkbox IDs are required." }),
  validation: z.enum(["minimum", "maximum", "range", "exact"]).optional(),
  required: z.boolean().default(false).optional(),
  min_value: z.number().int().min(0).optional(),
  max_value: z.number().int().optional(),
  exact_value: z.number().int().optional(),
});

const createTemplateSchema = z.object({
  // ═══════════════════════════════════════════════════════════════════════════
  // REQUIRED FIELDS (per OpenAPI spec)
  // ═══════════════════════════════════════════════════════════════════════════

  files: z
    .array(templateFileSchema)
    .describe(
      "REQUIRED. Files to upload. Each needs 'name' plus one of: 'file_url', 'file_base64', or 'resource_uri'.",
    ),

  placeholders: z
    .array(placeholderSchema)
    .describe(
      "REQUIRED. Signing roles. Each needs 'id' and 'name'. For text tags, the 'id' must match tag IDs (e.g., id='signer1' matches [sig|req|signer1]).",
    ),

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORTANT: Set text_tags=true if PDF contains text tags like [sig|req|id]
  // ═══════════════════════════════════════════════════════════════════════════

  text_tags: z
    .boolean()
    .optional()
    .describe(
      "Set TRUE if PDF contains text tags like {{signature:1:y}}. Placeholder 'id' values must match the signer numbers in tags (e.g., id='1' for {{signature:1:y}}).",
    ),

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL FIELDS
  // ═══════════════════════════════════════════════════════════════════════════

  name: z.string().optional().describe("Template name (e.g., 'Permission Slip')."),
  subject: z.string().optional().describe("Email subject for signature requests."),
  message: z.string().optional().describe("Email message for signature requests (max 4000 chars)."),
  draft: z
    .boolean()
    .optional()
    .describe(
      "If true, template stays editable. If false, marked Available. Default: false per API.",
    ),

  // Copied placeholders (CC recipients)
  copied_placeholders: z
    .array(copiedPlaceholderSchema)
    .optional()
    .describe("Recipients who receive the final document after completion."),

  // Document fields
  fields: z
    .array(z.array(fieldSchema))
    .optional()
    .describe("2D array of fields: one array per file. Required if draft is false."),

  // Attachment requests
  attachment_requests: z
    .array(attachmentRequestSchema)
    .optional()
    .describe("Attachments recipients must upload."),

  // Checkbox groups
  checkbox_groups: z
    .array(checkboxGroupSchema)
    .optional()
    .describe("Grouped checkbox fields with validation."),

  // Labels
  labels: z.array(labelSchema).optional().describe("Labels for organizing templates."),

  // Expiration and reminders
  expires_in: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("Days before signature request expires (max 365)."),
  reminders: z
    .boolean()
    .default(true)
    .optional()
    .describe("Send signing reminders on day 3, 6, and 10."),

  // Signing order
  apply_signing_order: z.boolean().default(false).optional().describe("Recipients sign in order."),

  // Redirect URLs
  redirect_url: z.string().url().optional().describe("URL to redirect after successful signing."),
  decline_redirect_url: z
    .string()
    .url()
    .optional()
    .describe("URL to redirect if document is declined."),

  // Allow actions
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

  // Language
  language: z
    .enum([
      "en",
      "fr",
      "es",
      "de",
      "pl",
      "pt",
      "da",
      "nl",
      "it",
      "ru",
      "sv",
      "ar",
      "el",
      "tr",
      "sk",
    ])
    .optional()
    .describe("Language for template (ISO 639-1)."),

  // Metadata
  metadata: z
    .record(z.string(), z.string())
    .optional()
    .describe("Key-value metadata (max 50 pairs, key max 40 chars, value max 500 chars)."),

  // API application
  api_application_id: z
    .string()
    .uuid()
    .optional()
    .describe("API Application ID for settings isolation."),
});

const updateTemplateSchema = z.object({
  template_id: z.string().min(1, { message: "template_id is required." }),

  // All fields from create are optional for update
  files: z.array(templateFileSchema).optional(),
  placeholders: z.array(placeholderSchema).optional(),
  name: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().max(4000).optional(),
  draft: z.boolean().optional(),
  copied_placeholders: z.array(copiedPlaceholderSchema).optional(),
  fields: z.array(z.array(fieldSchema)).optional(),
  attachment_requests: z.array(attachmentRequestSchema).optional(),
  checkbox_groups: z.array(checkboxGroupSchema).optional(),
  labels: z.array(labelSchema).optional(),
  expires_in: z.number().int().min(1).max(365).optional(),
  reminders: z.boolean().optional(),
  apply_signing_order: z.boolean().optional(),
  redirect_url: z.string().url().optional(),
  decline_redirect_url: z.string().url().optional(),
  allow_decline: z.boolean().optional(),
  allow_reassign: z.boolean().optional(),
  language: z
    .enum([
      "en",
      "fr",
      "es",
      "de",
      "pl",
      "pt",
      "da",
      "nl",
      "it",
      "ru",
      "sv",
      "ar",
      "el",
      "tr",
      "sk",
    ])
    .optional(),
  text_tags: z.boolean().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  api_application_id: z.string().uuid().optional(),
});

const getTemplateSchema = z.object({
  template_id: z.string().min(1, { message: "template_id is required." }),
});

const listTemplatesSchema = z.object({
  page: z.number().int().min(1).default(1).optional(),
  per_page: z.number().int().min(1).max(100).default(25).optional(),
});

const deleteTemplateSchema = z.object({
  template_id: z.string().min(1, { message: "template_id is required." }),
});

const createFromTemplateSchema = z.object({
  template_id: z.string().min(1, { message: "template_id is required." }),
  name: z.string().optional().describe("Document name override."),
  recipients: z
    .array(
      z.object({
        id: z
          .string()
          .min(1, { message: "id is required." })
          .describe("Unique identifier for this recipient (e.g., 'recipient_1')."),
        placeholder_name: z
          .string()
          .min(1, { message: "placeholder_name is required." })
          .describe("The name of the placeholder from the template to assign this recipient to."),
        email: z.string().email({ message: "Recipient email must be valid." }),
        name: z.string().optional().describe("Name of the recipient."),
        passcode: z
          .string()
          .optional()
          .describe("Passcode required to view and sign the document."),
        subject: z.string().optional().describe("Custom email subject for this recipient."),
        message: z.string().optional().describe("Custom email message for this recipient."),
        send_email: z
          .boolean()
          .optional()
          .describe(
            "Only valid when embedded_signing is true. Whether to send email notification.",
          ),
        send_email_delay: z
          .number()
          .int()
          .min(0)
          .max(60)
          .optional()
          .describe(
            "Only valid when embedded_signing is true. Delay in minutes before sending email (0-60).",
          ),
      }),
    )
    .min(1, { message: "At least one recipient is required." }),
  copied_contacts: z
    .array(
      z.object({
        copied_placeholder_id: z.string().optional(),
        email: z.string().email({ message: "Copied contact email must be valid." }),
        name: z.string().optional(),
      }),
    )
    .optional(),
  message: z.string().max(4000).optional(),
  subject: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  draft: z.boolean().default(true).optional(),
  embedded_signing: z.boolean().default(false).optional(),
  embedded_signing_notifications: z.boolean().default(false).optional(),
  text_tags: z.boolean().default(false).optional(),
  custom_requester_name: z.string().optional(),
  custom_requester_email: z.string().email().optional(),
  redirect_url: z.string().url().optional(),
  decline_redirect_url: z.string().url().optional(),
  expires_in: z.number().int().min(1).max(365).optional(),
  files: z.array(templateFileSchema).optional().describe("Additional files to append."),
});

type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
type GetTemplateInput = z.infer<typeof getTemplateSchema>;
type ListTemplatesInput = z.infer<typeof listTemplatesSchema>;
type DeleteTemplateInput = z.infer<typeof deleteTemplateSchema>;
type CreateFromTemplateInput = z.infer<typeof createFromTemplateSchema>;

type ReadResourceResult = z.infer<typeof ReadResourceResultSchema>;
type ToolExtraRequest = { method: string; params?: unknown };
type ToolExtra = {
  sendRequest?: (
    request: ToolExtraRequest,
    schema: typeof ReadResourceResultSchema,
  ) => Promise<ReadResourceResult>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool Registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerTemplateTools(server: McpServer, client: SignWellClient): number {
  let count = 0;

  const register = <Schema extends z.ZodTypeAny>(
    name: string,
    description: string,
    schema: Schema,
    handler: (input: z.infer<Schema>, extra: ToolExtra) => Promise<CallToolResult>,
  ) => {
    // Debug: Log the JSON schema being registered
    if (isDebugEnabled() && typeof schema.toJSONSchema === "function") {
      debugLog(`Registering tool "${name}" with schema:`, schema.toJSONSchema());
    }

    const toolHandler = (async (input: unknown, extra: ToolExtra) => {
      // Debug: Log raw input received
      debugLog(`Tool "${name}" called with RAW input:`, input);
      debugLog(`Tool "${name}" input type:`, typeof input);
      debugLog(
        `Tool "${name}" input keys:`,
        input && typeof input === "object" ? Object.keys(input) : "N/A",
      );

      // Special handling for template_create - provide helpful error if required params missing
      if (name === "template_create") {
        const inputObj = input as Record<string, unknown> | null | undefined;
        if (
          !inputObj ||
          (typeof inputObj === "object" && !inputObj.files && !inputObj.placeholders)
        ) {
          throw new Error(
            `template_create requires 'files' and 'placeholders' arrays. Example:\n` +
              `{\n` +
              `  "name": "My Template",\n` +
              `  "files": [{"name": "doc.pdf", "file_base64": "<base64-encoded-pdf>"}],\n` +
              `  "placeholders": [{"id": "1", "name": "Signer"}],\n` +
              `  "text_tags": true\n` +
              `}\n\n` +
              `You must convert the PDF file to base64 first, then pass it in the files array.`,
          );
        }
      }

      const validated = schema.parse(input);
      debugLog(`Tool "${name}" VALIDATED input:`, validated);

      return handler(validated as z.infer<Schema>, extra);
    }) as Parameters<McpServer["registerTool"]>[2];

    server.registerTool(
      name,
      {
        description,
        inputSchema: schema,
      },
      toolHandler,
    );
    count += 1;
  };

  register(
    "template_create",
    `Create a SignWell template for reusable signature documents.

RECOMMENDED WORKFLOW:
1. file_store (provide file_path, file_url, or resource_uri) → returns file_token
2. file_validate_text_tags (pass file_token) → validates tags are extractable
3. template_create (pass file_token in files array) → creates the template

REQUIRED PARAMETERS (both are mandatory):
- files: Array with at least one file object containing "name" and one of: "file_token" (recommended), "file_base64", "file_url", or "resource_uri"
- placeholders: Array with at least one placeholder object containing "id" and "name"

STEP-BY-STEP EXAMPLE (using file_token):
1. Call file_store with {"file_path": "/path/to/doc.pdf"} → get file_token
2. Call file_validate_text_tags with {"file_token": "..."} → confirm tags are valid
3. Call this tool with:
{
  "name": "My Template",
  "files": [{"name": "doc.pdf", "file_token": "<token from file_store>"}],
  "placeholders": [{"id": "1", "name": "Signer"}],
  "text_tags": true
}

ALTERNATIVE (inline base64):
{
  "name": "My Template",
  "files": [{"name": "doc.pdf", "file_base64": "JVBERi0xLjQK..."}],
  "placeholders": [{"id": "1", "name": "Signer"}],
  "text_tags": true
}

TEXT TAGS (when text_tags: true):
Your PDF must contain these literal text strings as SELECTABLE TEXT (not images):
- {{signature:1:y}} - Signature field for placeholder id "1"
- {{date:1:y}} - Date field for placeholder id "1"
- {{text:1:y:Label}} - Text field with label
- {{initial:1:y}} - Initials field

The number in the tag (1, 2, etc.) MUST match a placeholder "id" in your request.

CRITICAL: Text tags must be SELECTABLE/SEARCHABLE text in the PDF, not rendered as images or graphics.
When generating PDFs programmatically, use text drawing methods (e.g., drawString) with standard fonts.
To verify: open the PDF and try to select/copy the tag text with your mouse. If you can't select it, SignWell can't parse it.

MULTI-SIGNER EXAMPLE:
{
  "name": "Contract",
  "files": [{"name": "contract.pdf", "file_base64": "JVBERi0xLjQK...actual base64 here..."}],
  "placeholders": [
    {"id": "1", "name": "Client"},
    {"id": "2", "name": "Vendor"}
  ],
  "text_tags": true
}

For this example, the PDF should contain: {{signature:1:y}} for Client and {{signature:2:y}} for Vendor.

COMMON ERRORS:
- Empty arguments {} = You forgot to include files and placeholders arrays
- "fields": [] in response = PDF doesn't contain valid text tags, or text_tags wasn't set to true`,
    createTemplateSchema,
    (input, extra) => handleTemplateCreate(client, input, extra),
  );

  register(
    "template_update",
    "Update an existing SignWell template. Only provide fields you want to change.",
    updateTemplateSchema,
    (input, extra) => handleTemplateUpdate(client, input, extra),
  );

  register(
    "template_get",
    "Fetch an individual SignWell template by ID.",
    getTemplateSchema,
    (input, _extra) => handleTemplateGet(client, input),
  );

  register(
    "template_list",
    "List SignWell templates with pagination.",
    listTemplatesSchema,
    (input, _extra) => handleTemplateList(client, input),
  );

  register(
    "template_delete",
    "Delete a SignWell template.",
    deleteTemplateSchema,
    (input, _extra) => handleTemplateDelete(client, input),
  );

  register(
    "template_create_document",
    `Create a document from a template (draft by default).

REQUIRED:
- template_id: The template ID to create the document from
- recipients: Array of recipient objects, each with:
  - id: Unique identifier for this recipient (e.g., "recipient_1")
  - placeholder_name: Name of the template placeholder to assign (must match exactly)
  - email: Recipient's email address
  - name: (optional) Recipient's display name

Example:
{
  "template_id": "abc123",
  "recipients": [{
    "id": "recipient_1",
    "placeholder_name": "Client",
    "email": "client@example.com",
    "name": "John Doe"
  }]
}

Set draft: false to send immediately for signing.`,
    createFromTemplateSchema,
    (input, extra) => handleCreateDocumentFromTemplate(client, input, extra),
  );

  registerTemplateResource(server, client);

  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler Functions
// ─────────────────────────────────────────────────────────────────────────────

async function handleTemplateCreate(
  client: SignWellClient,
  input: CreateTemplateInput,
  extra: ToolExtra,
): Promise<CallToolResult> {
  // Validate files have content (since we can't use .refine() for JSON Schema compatibility)
  for (const file of input.files) {
    if (!file.file_token && !file.file_url && !file.file_base64 && !file.resource_uri) {
      return errorResponse({
        type: "validation",
        message: `File "${file.name}" must have one of: file_token, file_url, file_base64, or resource_uri`,
      });
    }
  }

  // Validate placeholders have required fields
  for (const placeholder of input.placeholders) {
    if (!placeholder.id || !placeholder.name) {
      return errorResponse({
        type: "validation",
        message: "Each placeholder must have 'id' and 'name' fields",
      });
    }
  }

  try {
    const files = await resolveFileInputs(input.files, extra);
    const payload = {
      ...input,
      files,
      draft: input.draft ?? true,
    };
    const data = await client.post<TemplateResponse>("/document_templates", payload);

    const warnings: string[] = [];
    const hasFields =
      data.fields && data.fields.length > 0 && data.fields.some((f) => f.length > 0);

    if (input.text_tags && hasFields) {
      // Fields were detected immediately — text tags parsed successfully
    } else if (input.text_tags && !hasFields) {
      // SignWell often processes text tags asynchronously — fields may not
      // appear in the initial API response but will be visible in the editor.
      warnings.push(
        "NOTE: text_tags was enabled. SignWell may still be processing the tags. " +
          "Open the template in the SignWell editor to verify fields were placed correctly. " +
          "If fields are missing, ensure the PDF contains valid selectable text tags " +
          "(e.g. {{signature:1:y}}) and the signer numbers match placeholder ids. " +
          "See signwell://text-tags-guide for syntax details.",
      );
    } else if (!hasFields) {
      warnings.push(
        "WARNING: Template has no signature fields. You must either: " +
          "(1) Add fields manually via the SignWell web editor at the embedded_edit_url, or " +
          "(2) Use text_tags: true with a PDF containing text tag placeholders like {{signature:1:y}}.",
      );
    }

    return successResponse({
      type: "template_create",
      message:
        data.status === "Created" ? "Template draft created." : "Template created and available.",
      data,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    return toTemplateError(error, "Unable to create the template.");
  }
}

async function handleTemplateUpdate(
  client: SignWellClient,
  input: UpdateTemplateInput,
  extra: ToolExtra,
): Promise<CallToolResult> {
  try {
    const { template_id, files, ...rest } = input;
    const resolvedFiles = files ? await resolveFileInputs(files, extra) : undefined;
    const payload = {
      ...rest,
      ...(resolvedFiles && { files: resolvedFiles }),
    };
    const data = await client.put<TemplateResponse>(`/document_templates/${template_id}`, payload);
    return successResponse({
      type: "template_update",
      message: "Template updated.",
      data,
    });
  } catch (error) {
    return toTemplateError(error, "Unable to update the template.");
  }
}

async function handleTemplateGet(
  client: SignWellClient,
  input: GetTemplateInput,
): Promise<CallToolResult> {
  try {
    const data = await client.get<TemplateResponse>(`/document_templates/${input.template_id}`);
    return successResponse({
      type: "template_get",
      message: "Fetched template.",
      data,
    });
  } catch (error) {
    return toTemplateError(error, "Unable to fetch the template.");
  }
}

async function handleTemplateList(
  client: SignWellClient,
  input: ListTemplatesInput,
): Promise<CallToolResult> {
  try {
    const query: Record<string, string | number> = {};
    if (input.page) query.page = input.page;
    if (input.per_page) query.per_page = input.per_page;

    const data = await client.get<{ entries: TemplateResponse[] }>("/document_templates", {
      query,
    });
    return successResponse({
      type: "template_list",
      message: "Fetched templates.",
      data,
    });
  } catch (error) {
    return toTemplateError(error, "Unable to list templates.");
  }
}

async function handleTemplateDelete(
  client: SignWellClient,
  input: DeleteTemplateInput,
): Promise<CallToolResult> {
  try {
    await client.delete(`/document_templates/${input.template_id}`);
    return successResponse({
      type: "template_delete",
      message: "Template deleted.",
      data: { template_id: input.template_id },
    });
  } catch (error) {
    return toTemplateError(error, "Unable to delete the template.");
  }
}

async function handleCreateDocumentFromTemplate(
  client: SignWellClient,
  input: CreateFromTemplateInput,
  extra: ToolExtra,
): Promise<CallToolResult> {
  try {
    const { template_id, files, recipients, ...rest } = input;
    const resolvedFiles = files ? await resolveFileInputs(files, extra) : undefined;

    // Strip send_email and send_email_delay from recipients when embedded_signing is not true
    // These fields are only valid when embedded_signing is enabled
    const processedRecipients = recipients.map((recipient) => {
      if (input.embedded_signing) {
        return recipient;
      }
      // Remove embedded-signing-only fields when not using embedded signing
      const { send_email, send_email_delay, ...recipientRest } = recipient;
      return recipientRest;
    });

    const payload = {
      template_id,
      ...rest,
      recipients: processedRecipients,
      ...(resolvedFiles && { files: resolvedFiles }),
      draft: input.draft ?? true,
    };

    const data = await client.post("/document_templates/documents", payload);
    return successResponse({
      type: "template_create_document",
      message:
        input.draft === false
          ? "Document created and sent."
          : "Document draft created from template.",
      data,
    });
  } catch (error) {
    return toTemplateError(error, "Unable to create document from template.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function toTemplateError(error: unknown, fallback: string): CallToolResult {
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

async function resolveFileInputs(
  files: Array<z.infer<typeof templateFileSchema>>,
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

// ─────────────────────────────────────────────────────────────────────────────
// Resource Registration
// ─────────────────────────────────────────────────────────────────────────────

function registerTemplateResource(server: McpServer, client: SignWellClient): void {
  const readCallback = async (uri: URL) => {
    const templateId = extractTemplateId(uri);
    if (!templateId) {
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/plain",
            text: "Missing template id.",
          },
        ],
      };
    }

    try {
      const data = await client.get(`/document_templates/${templateId}`);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    } catch (error) {
      const message =
        error instanceof SignWellError
          ? `Failed to fetch SignWell template (${error.type}): ${error.message}`
          : "Unexpected error fetching SignWell template.";
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/plain",
            text: message,
          },
        ],
      };
    }
  };

  if (typeof server.registerResource === "function") {
    server.registerResource(
      "template_resource",
      "template://{template_id}",
      {
        title: "SignWell template resource",
        description: "Fetch SignWell template summary by id.",
      },
      readCallback,
    );
    return;
  }

  const legacyServer = server as unknown as {
    resource?: (
      name: string,
      uri: string,
      meta: Record<string, unknown>,
      readCb: typeof readCallback,
    ) => unknown;
  };

  if (typeof legacyServer.resource === "function") {
    legacyServer.resource(
      "template_resource",
      "template://{template_id}",
      {
        title: "SignWell template resource",
        description: "Fetch SignWell template summary by id.",
      },
      readCallback,
    );
  }
}

function extractTemplateId(uri: URL): string | null {
  const host = uri.hostname;
  const path = uri.pathname.replace(/^\/+/, "");
  if (host && host.length > 0) {
    return path ? `${host}/${path}` : host;
  }
  if (path) {
    return path;
  }
  return null;
}
