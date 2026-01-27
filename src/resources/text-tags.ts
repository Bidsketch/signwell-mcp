import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const TEXT_TAGS_GUIDE = `# SignWell Text Tags Guide

Text tags allow you to embed signature field placeholders directly in your PDF content.
SignWell scans the PDF text layer and converts these tags into interactive signature fields.

## CRITICAL: PDF Generation Requirements

**Text tags MUST be rendered as SELECTABLE/SEARCHABLE TEXT in the PDF.**

SignWell parses the PDF's text layer to find tags. If tags are rendered as images, vector graphics,
or flattened content, SignWell cannot detect them and "fields": [] will be returned.

### Requirements for programmatic PDF generation (ReportLab, PDFKit, jsPDF, etc.):

1. **Use text drawing methods** - e.g., \`canvas.drawString()\` in ReportLab, not image embedding
2. **Use standard fonts** - Stick to built-in PDF fonts (Helvetica, Times, Courier) or properly embedded fonts
3. **Verify text is selectable** - Open the PDF and try to select/copy the text tag with your mouse
4. **Do NOT flatten or rasterize** - Avoid converting text to outlines or images

### How to verify your PDF has valid text tags:
1. Open the PDF in any PDF viewer
2. Try to SELECT the text "{{signature:1:y}}" with your mouse
3. Try to COPY the selected text
4. If you can select and copy it as text, SignWell can parse it
5. If you cannot select it (it's an image or graphic), SignWell will NOT detect it

### Common mistakes that break text tags:
- Rendering text as an image/screenshot
- Using \`canvas.drawImage()\` instead of \`canvas.drawString()\`
- Flattening the PDF or converting text to outlines
- Using custom fonts that aren't properly embedded
- PDF generation libraries that rasterize text

Example PDF content (what the PDF text layer should contain):
\`\`\`
CONTRACT AGREEMENT

Client Signature: {{signature:1:y}}
Date: {{date:1:y}}

Vendor Signature: {{signature:2:y}}
Date: {{date:2:y}}
\`\`\`

**If you create a template/document with text_tags: true and the response shows "fields": [],
it means the PDF does not contain valid text tags in the correct format.**

## Syntax

\`{{field_type:signer_number:required:label:prefill:api_id:width:height}}\`

Parameters are positional and colon-separated. Omit trailing params if not needed.

## Quick Examples

- \`{{signature:1:y}}\` - Required signature, signer 1
- \`{{text:1:y:Company Name}}\` - Required text field with label
- \`{{date:1:y}}\` - Required date field
- \`{{initial:1:y}}\` - Required initials
- \`{{check:1:n}}\` - Optional checkbox
- \`{{signature:2:y}}\` - Required signature, signer 2

## Field Types

| Type | Short | Description |
|------|-------|-------------|
| signature | s | Signature field |
| initial | i | Initials field |
| date | d | Date field |
| text | - | Text input |
| check | c | Checkbox |
| autofill_name | af_n | Auto-filled name |
| autofill_email | af_e | Auto-filled email |
| autofill_date_signed | af_d_s | Auto-filled signing date |
| autofill_company | af_c | Auto-filled company |

## Parameters (Positional)

1. **Field Type** - signature, text, date, check, initial, or autofill types
2. **Signer Number** - 1, 2, 3... matches recipient \`id\` field (recipient with id: "1" = signer 1)
3. **Required** - y or n
4. **Label** - Field label (text/date only)
5. **Prefill Value** - Default value
6. **API ID** - Field identifier for API reference
7. **Width** - Pixels (integer)
8. **Height** - Pixels (integer)

### Text Field Additional Options (positions 9-10)
9. **Validation** - numbers, letters, email_address, us_phone_number, alphanumeric
10. **Fixed Width** - y or n

### Date Field Additional Options (positions 9-11)
9. **Lock Sign Date** - y to auto-fill and lock
10. **Date Format** - mm/dd/yyyy, dd/mm/yyyy, yyyy/mm/dd
11. **Formula** - e.g., sent_date + 10 days

## Important: Recipient ID Mapping

When creating a document with \`document_create\`, the recipient's \`id\` field maps to the signer number in text tags:

\`\`\`json
{
  "recipients": [
    { "id": "1", "email": "alice@example.com" },
    { "id": "2", "email": "bob@example.com" }
  ]
}
\`\`\`

- \`{{signature:1:y}}\` → Alice signs here
- \`{{signature:2:y}}\` → Bob signs here

## Complete Example

\`\`\`
NON-DISCLOSURE AGREEMENT

This Agreement is entered into by {{autofill_name:1}} ("Disclosing Party")
and {{autofill_name:2}} ("Receiving Party").

1. The parties agree to the terms herein.

DISCLOSING PARTY:
Company: {{text:1:y:Company Name}}
Signature: {{signature:1:y}}
Date: {{date:1:y}}

RECEIVING PARTY:
Company: {{text:2:y:Company Name}}
Signature: {{signature:2:y}}
Date: {{date:2:y}}
\`\`\`

## Usage with document_create

\`\`\`json
{
  "name": "NDA Agreement",
  "text_tags": true,
  "recipients": [
    { "id": "1", "email": "alice@example.com", "first_name": "Alice" },
    { "id": "2", "email": "bob@example.com", "first_name": "Bob" }
  ],
  "files": [
    { "name": "nda.pdf", "file_base64": "..." }
  ]
}
\`\`\`

## Usage with template_create

When creating templates with text tags, the placeholder \`id\` maps to the signer number:

\`\`\`json
{
  "name": "NDA Template",
  "text_tags": true,
  "placeholders": [
    { "id": "1", "name": "Disclosing Party" },
    { "id": "2", "name": "Receiving Party" }
  ],
  "files": [
    { "name": "nda.pdf", "file_base64": "..." }
  ]
}
\`\`\`

- \`{{signature:1:y}}\` → Assigned to placeholder with id "1" (Disclosing Party)
- \`{{signature:2:y}}\` → Assigned to placeholder with id "2" (Receiving Party)

When creating a document from this template using \`template_create_document\`, you assign actual recipients to the placeholders by their placeholder name:

\`\`\`json
{
  "template_id": "template-uuid",
  "recipients": [
    { "id": "recipient_1", "placeholder_name": "Disclosing Party", "email": "alice@example.com", "name": "Alice" },
    { "id": "recipient_2", "placeholder_name": "Receiving Party", "email": "bob@example.com", "name": "Bob" }
  ]
}
\`\`\`
`;

export function registerTextTagsResource(server: McpServer): void {
  const readCallback = async (uri: URL) => {
    return {
      contents: [
        {
          uri: uri.toString(),
          mimeType: "text/markdown",
          text: TEXT_TAGS_GUIDE,
        },
      ],
    };
  };

  if (typeof server.registerResource === "function") {
    server.registerResource(
      "text_tags_guide",
      "signwell://text-tags-guide",
      {
        title: "SignWell Text Tags Guide",
        description:
          "Documentation for embedding text tag placeholders in PDFs for SignWell signature fields.",
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
      "text_tags_guide",
      "signwell://text-tags-guide",
      {
        title: "SignWell Text Tags Guide",
        description:
          "Documentation for embedding text tag placeholders in PDFs for SignWell signature fields.",
      },
      readCallback,
    );
  }
}
