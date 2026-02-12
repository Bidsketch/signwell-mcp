# SignWell MCP Server

Model Context Protocol server that orchestrates SignWell's e-signature workflows.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer.
- A SignWell API key with document access (`SIGNWELL_API_KEY` environment variable).
- Optional overrides:
  - `SIGNWELL_API_BASE_URL` for non-production endpoints.
  - `SIGNWELL_API_TIMEOUT_MS` to tweak HTTP client timeouts (default 90000 ms; CLI flag `--timeout` on `setup` skips env prompts and writes this override).

## Setup

### Interactive Wizard (recommended)

1. Install dependencies if you have not already:

   ```bash
   npm install
   ```

2. Bundle the CLI so MCP clients point at the build output:

   ```bash
   npm run build
   ```

3. Run the wizard and follow the prompts:

   ```bash
   node build/index.js setup
   ```

   - Stores your SignWell secrets in `~/.config/signwell-mcp/env` on Linux, `~/Library/Application Support/SignWell/MCP/env` on macOS, or `%APPDATA%/SignWell/MCP/env` on Windows with `0700/0600` permissions.
   - Automatically updates Claude Desktop, Claude Code, Cursor, and OpenCode configuration files (backups are captured before each write) so you do not have to hunt for platform paths.
   - Prints JSON snippets for all clients plus a generic/manual flow in case you need to double-check or apply them elsewhere.
   - Use `--print` (or `-p`) to preview outputs without writing to disk, and `--yes --api-key=...` for non-interactive runs (CI, devcontainers, etc.).
   - Pass `--clients=claude-desktop,cursor` to limit which MCP clients the wizard configures; omit for "all". Use `--timeout=<ms>` only if you need a non-default HTTP timeout.
   - After bundling (`npm run build`) and publishing the package, end users can invoke the same wizard with `npx @signwell/mcp setup`. Installing globally also enables invoking `signwell-mcp setup` directly.

### Manual exports

Prefer to manage env vars yourself? Export the required values before running the server:

```bash
export SIGNWELL_API_KEY="your_api_key"
# export SIGNWELL_API_BASE_URL="https://www.signwell.com/api/v1"   # optional
```

## Installation (npm)

Once the package is published to npm (GitHub: `Bidsketch/signwell-mcp`):

- Run the setup wizard without installing anything globally:

  ```bash
  npx @signwell/mcp setup
  ```

- Install globally if you prefer a persistent binary:

  ```bash
  npm install -g @signwell/mcp
  signwell-mcp setup
  ```

After configuration, start the MCP server via `signwell-mcp` (requires Node.js v18+).

## Local Development Workflow

1. Install dependencies: `npm install`
2. Bundle the CLI entrypoint (required for MCP client configs): `npm run build`
3. Configure credentials: `node build/index.js setup` (or `npx @signwell/mcp setup` once published)
4. Start the MCP server locally: `npm start` (runs `node build/index.js`)
5. Open another terminal to run tests and linters before committing:

   ```bash
   npm test
   npm run typecheck
   npm run lint
   ```

6. When using MCP inspector or other clients, point them at `npm start` (stdio).

## Running the Server

- Development entrypoint (stdio transport):

  ```bash
  SIGNWELL_API_KEY="$SIGNWELL_API_KEY" npm start
  # or run directly:
  SIGNWELL_API_KEY="$SIGNWELL_API_KEY" node build/index.js
  ```

- CLI helpers:
  - `node build/index.js --help` prints usage and env expectations.
  - `node build/index.js --version` prints the current build.
  - `node build/index.js setup` launches the setup wizard described above when working from source.
  - Once the package is bundled/published, `npx @signwell/mcp setup` runs the wizard and `SIGNWELL_API_KEY=... npx @signwell/mcp` starts the server via the packaged binary (global installs can call `signwell-mcp ...` directly).

### MCP Inspector

Use the MCP inspector to exercise tools locally:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

### Example: `ping`

````markdown
```
$ SIGNWELL_API_KEY=dummy node build/index.js
[SignWell MCP] Ready v0.1.0 (15 tools, stdio transport).
```

Inspector call:

```json
{
  "ok": true,
  "type": "ping",
  "message": "pong",
  "data": {
    "timestamp": "2026-01-21T18:30:00.000Z"
  }
}
```
````

## Tests

Run the quality gates in order:

```bash
npm test
npm run typecheck
npm run lint
npm run format
```

## Demo

Sample MCP inspector session (sanitized IDs):

1. **Create Draft**

   ```json
   Tool: document_create
   Input: {
     "name": "Sales Agreement",
     "recipients": [{ "email": "alice@example.com" }],
     "files": [{ "name": "agreement.pdf", "file_url": "https://files.example.com/agreement.pdf" }]
   }
   Output:
   {
     "ok": true,
     "type": "document_create",
     "message": "Document draft created.",
     "data": {
       "id": "doc_123",
       "status": "draft"
     }
   }
   ```

2. **Send Draft**

   ```json
   Tool: document_send_draft
   Input: { "document_id": "doc_123", "confirm_send": true }
   Output:
   {
     "ok": true,
     "type": "document_send_draft",
     "message": "Draft sent for signing.",
     "data": { "id": "doc_123", "status": "sent" }
   }
   ```

3. **Check Status**

   ```json
   Tool: document_get
   Input: { "document_id": "doc_123" }
   Output:
   {
     "ok": true,
     "type": "document_get",
     "message": "Fetched document status.",
     "data": {
       "id": "doc_123",
       "status": "completed",
       "recipients": [{ "email": "alice@example.com", "status": "signed" }]
     }
   }
   ```

4. **Completed PDF**

   ```json
   Tool: document_completed_pdf
   Input: { "document_id": "doc_123" }
   Output:
   {
     "ok": true,
     "type": "document_completed_pdf",
     "data": {
       "pdf_url": "https://signwell-downloads.example.com/doc_123.pdf"
     }
   }
   ```

## Resources

- MCP resources: `document://{id}` and `template://{id}` expose read-only JSON snapshots that reuse the same normalization logic as the tools, so inspectors or other MCP clients can browse previously created assets quickly.

## Attaching Files & Draft Safety

- `document_create` and `template_create_document` always set `draft: true`, ensuring nothing is emailed until you intentionally call `document_send_draft`.
- Supply files via the `files` array using either `file_url` (public URL or the link your MCP client provides when you `@`-attach a file in UIs like Claude Desktop), `file_base64`, or `resource_uri`. When a `resource_uri` is provided the MCP server automatically calls `resources/read` to pull the attachment bytes and forwards them to SignWell's `/api/v1/documents/` endpoint.

## Available Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Execute the MCP server entrypoint over stdio (after `npm run build`). |
| `npm test` | Run the test suite. |
| `npm run typecheck` | Type-check the project with `tsc --noEmit`. |
| `npm run lint` | Lint source and tests using Biome. |
| `npm run format` | Apply repository formatting conventions via Biome. |
| `npm run build` | Produce an ESM bundle at `build/index.js` using esbuild. |

## Directory Layout

```
.
├── src/                # MCP server source (entrypoint + domain modules)
│   └── setup/          # Interactive setup wizard for MCP client configuration
├── test/               # Test suites
├── build/              # Bundled output (ignored in releases)
├── biome.json          # Biome lint/format configuration
└── tsconfig.json       # TypeScript compiler configuration
```
