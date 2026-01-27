import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from "../config/env.ts";

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

const OVERRIDE_HOME_ENV = "SIGNWELL_MCP_HOME";
const DEFAULT_ENV_FILENAME = "env";

export function getConfigRoot(
  options: { platform?: NodeJS.Platform; homeDir?: string } = {},
): string {
  const platform = options.platform ?? process.platform;
  const custom = process.env[OVERRIDE_HOME_ENV];
  if (custom) {
    return path.resolve(custom);
  }

  const homeDir = options.homeDir ?? os.homedir();
  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(homeDir, "AppData", "Roaming");
    return path.join(appData, "SignWell", "MCP");
  }

  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "SignWell", "MCP");
  }

  return path.join(homeDir, ".config", "signwell-mcp");
}

export function getEnvFilePath(options?: { platform?: NodeJS.Platform; homeDir?: string }): string {
  const root = getConfigRoot(options);
  return path.join(root, DEFAULT_ENV_FILENAME);
}

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
  const result: Partial<EnvValues> = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=");
    switch (key) {
      case "SIGNWELL_API_KEY":
        result.apiKey = value;
        break;
      case "SIGNWELL_API_BASE_URL":
        result.baseUrl = value;
        break;
      case "SIGNWELL_API_TIMEOUT_MS":
        result.timeoutMs = Number(value);
        break;
      default:
        break;
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
