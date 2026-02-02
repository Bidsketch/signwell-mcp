import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from "../config/env.ts";
import { getEnvFilePath, parseEnvFile } from "../config/env-file.ts";

export type EnvValues = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
};

export type EnvWriteOptions = {
  printOnly?: boolean;
  filePathOverride?: string;
};

export type EnvWriteResult = {
  path: string;
  contents: string;
  wroteFile: boolean;
};

export { getConfigRoot, getEnvFilePath } from "../config/env-file.ts";

export async function readExistingEnv(
  filePath: string = getEnvFilePath(),
): Promise<Partial<EnvValues>> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return parseEnvContent(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function writeEnvFile(
  values: EnvValues,
  options: EnvWriteOptions = {},
): Promise<EnvWriteResult> {
  const filePath = options.filePathOverride ?? getEnvFilePath();
  const contents = formatEnv(values);

  if (options.printOnly) {
    return { path: filePath, contents, wroteFile: false };
  }

  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  await fsp.writeFile(filePath, contents, { mode: 0o600 });

  try {
    await fsp.chmod(filePath, 0o600);
  } catch {
    // Ignore chmod errors on filesystems that do not support POSIX perms.
  }

  return { path: filePath, contents, wroteFile: true };
}

export function formatEnv(values: EnvValues): string {
  const lines = ["# SignWell MCP environment variables", `SIGNWELL_API_KEY=${values.apiKey}`];

  if (values.baseUrl && values.baseUrl !== DEFAULT_BASE_URL) {
    lines.push(`SIGNWELL_API_BASE_URL=${values.baseUrl}`);
  }

  if (values.timeoutMs && values.timeoutMs !== DEFAULT_TIMEOUT_MS) {
    lines.push(`SIGNWELL_API_TIMEOUT_MS=${values.timeoutMs}`);
  }

  return `${lines.join(os.EOL)}${os.EOL}`;
}

function parseEnvContent(raw: string): Partial<EnvValues> {
  const pairs = parseEnvFile(raw);
  const result: Partial<EnvValues> = {};
  if (pairs.SIGNWELL_API_KEY) {
    result.apiKey = pairs.SIGNWELL_API_KEY;
  }
  if (pairs.SIGNWELL_API_BASE_URL) {
    result.baseUrl = pairs.SIGNWELL_API_BASE_URL;
  }
  if (pairs.SIGNWELL_API_TIMEOUT_MS) {
    const parsed = Number(pairs.SIGNWELL_API_TIMEOUT_MS);
    if (!Number.isNaN(parsed)) {
      result.timeoutMs = parsed;
    }
  }
  return result;
}

export function summarizeEnvInstructions(envPath: string): string[] {
  const commands: string[] = [];
  if (process.platform === "win32") {
    commands.push(
      `PowerShell: Get-Content -Path "${envPath}" | ForEach-Object { $parts = $_.Split('='); if ($parts.Length -eq 2) { $env:$parts[0] = $parts[1] } }`,
    );
  } else {
    commands.push(`Shell: set -a && source "${envPath}" && set +a`);
  }
  return commands;
}
