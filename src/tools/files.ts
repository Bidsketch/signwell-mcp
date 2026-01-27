import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ReadResourceResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { errorResponse, successResponse } from "../utils/responses.ts";

const execAsync = promisify(exec);
const TEST_FILE_PICKER_PATH_ENV = "SIGNWELL_MCP_TEST_PICKER_PATH";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const FILE_TTL_MS = 60 * 60 * 1000;

const selectFileSchema = z.object({
  resource_uri: z.string().optional(),
  file_url: z.string().url().optional(),
  file_path: z.string().optional(),
  name: z.string().optional(),
});

type SelectFileInput = z.infer<typeof selectFileSchema>;
type ReadResourceResult = z.infer<typeof ReadResourceResultSchema>;
type ToolExtraRequest = { method: string; params?: unknown };
type ToolExtra = {
  sendRequest?: (
    request: ToolExtraRequest,
    schema: typeof ReadResourceResultSchema,
  ) => Promise<ReadResourceResult>;
};

type StoredFile = {
  name: string;
  file_base64: string;
  size_bytes: number;
  createdAt: number;
};

const storedFiles = new Map<string, StoredFile>();

export function registerFileTools(server: McpServer): number {
  server.registerTool(
    "file_store",
    {
      description:
        "Store a file for upcoming SignWell requests. Provide either a resource_uri (for @ attachments), a file_url, or a local file_path. When no value is provided, a native file picker opens (desktop only). Returns a file_token you can pass to document/template tools.",
      inputSchema: selectFileSchema,
    },
    async (input, extra) => handleFileStore(input as SelectFileInput, extra as ToolExtra),
  );

  return 1;
}

export async function fetchResourceAsBase64(
  resourceUri: string,
  extra: ToolExtra,
): Promise<string> {
  if (!extra?.sendRequest) {
    throw new Error("Resource handling is unavailable in this transport.");
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

export function getStoredFile(token: string): StoredFile | undefined {
  cleanupExpiredFiles();
  return storedFiles.get(token);
}

export function putStoredFileForTests(token: string, file: StoredFile): void {
  storedFiles.set(token, file);
}

async function handleFileStore(input: SelectFileInput, extra: ToolExtra): Promise<CallToolResult> {
  try {
    const fileData = await loadFileData(input, extra);
    const token = randomUUID();
    storedFiles.set(token, { ...fileData, createdAt: Date.now() });
    cleanupExpiredFiles();

    return successResponse({
      type: "file_store",
      message: `Stored ${fileData.name}`,
      data: {
        file_token: token,
        name: fileData.name,
        size_bytes: fileData.size_bytes,
        expires_in_seconds: Math.floor(FILE_TTL_MS / 1000),
      },
    });
  } catch (error) {
    return errorResponse({
      type: "validation",
      message: error instanceof Error ? error.message : "Unable to store file.",
      error,
    });
  }
}

async function loadFileData(
  input: SelectFileInput,
  extra: ToolExtra,
): Promise<{ name: string; file_base64: string; size_bytes: number }> {
  if (input.resource_uri) {
    const base64 = await fetchResourceAsBase64(input.resource_uri, extra);
    const name = input.name ?? guessNameFromUri(input.resource_uri) ?? "attachment.pdf";
    return { name, file_base64: base64, size_bytes: Buffer.from(base64, "base64").byteLength };
  }

  if (input.file_url) {
    const response = await fetch(input.file_url);
    if (!response.ok) {
      throw new Error(`Unable to fetch file_url (${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    enforceSizeLimit(arrayBuffer.byteLength);
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const name = input.name ?? guessNameFromUri(input.file_url) ?? "attachment.pdf";
    return { name, file_base64: base64, size_bytes: arrayBuffer.byteLength };
  }

  if (input.file_path) {
    return readLocalFile(input.file_path, input.name);
  }

  const picked = await pickFileUsingNativeDialog(input.name);
  return picked;
}

function enforceSizeLimit(size: number): void {
  if (size > MAX_FILE_SIZE_BYTES) {
    const mb = (size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `File is ${mb}MB, exceeding the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.`,
    );
  }
}

function guessNameFromUri(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    const base = path.basename(parsed.pathname);
    return base || null;
  } catch {
    const trimmed = uri.split("/").pop();
    return trimmed || null;
  }
}

async function openNativeFilePicker(): Promise<string | null> {
  const testPath = process.env[TEST_FILE_PICKER_PATH_ENV];
  if (testPath && testPath.length > 0) {
    return testPath;
  }

  const platform = os.platform();

  if (platform === "darwin") {
    const script = [
      'set theFile to choose file with prompt "Select a document to send for signature" of type {"pdf", "doc", "docx", "png", "jpg", "jpeg"}',
      "POSIX path of theFile",
    ];
    const { stdout } = await execAsync(`osascript -e '${script[0]}' -e '${script[1]}'`, {
      timeout: 120_000,
    });
    return stdout.trim() || null;
  }

  if (platform === "win32") {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "Documents (*.pdf;*.doc;*.docx;*.png;*.jpg)|*.pdf;*.doc;*.docx;*.png;*.jpg;*.jpeg|All files (*.*)|*.*"
$dialog.Title = "Select a document to send for signature"
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.FileName
}
`.trim();
    const { stdout } = await execAsync(
      `powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, " ")}"`,
      {
        timeout: 120_000,
      },
    );
    return stdout.trim() || null;
  }

  try {
    const { stdout } = await execAsync(
      'zenity --file-selection --title="Select a document to send for signature" --file-filter="Documents | *.pdf *.doc *.docx *.png *.jpg *.jpeg"',
      { timeout: 120_000 },
    );
    return stdout.trim() || null;
  } catch {
    const { stdout } = await execAsync(
      'kdialog --getopenfilename ~ "*.pdf *.doc *.docx *.png *.jpg *.jpeg | Documents"',
      { timeout: 120_000 },
    );
    return stdout.trim() || null;
  }
}

function cleanupExpiredFiles(): void {
  const now = Date.now();
  for (const [token, file] of storedFiles.entries()) {
    if (now - file.createdAt > FILE_TTL_MS) {
      storedFiles.delete(token);
    }
  }
}

async function readLocalFile(
  filePath: string,
  nameOverride?: string,
): Promise<{
  name: string;
  file_base64: string;
  size_bytes: number;
}> {
  const stats = await fs.stat(filePath);
  enforceSizeLimit(stats.size);
  const buffer = await fs.readFile(filePath);
  return {
    name: nameOverride ?? path.basename(filePath),
    file_base64: buffer.toString("base64"),
    size_bytes: buffer.byteLength,
  };
}

export async function pickFileUsingNativeDialog(
  nameOverride?: string,
): Promise<{ name: string; file_base64: string; size_bytes: number }> {
  const filePath = await openNativeFilePicker();
  if (!filePath) {
    throw new Error("File selection cancelled.");
  }

  return readLocalFile(filePath, nameOverride);
}
