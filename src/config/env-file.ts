import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export type PathOptions = {
  platform?: NodeJS.Platform;
  homeDir?: string;
};

const OVERRIDE_HOME_ENV = "SIGNWELL_MCP_HOME";
const DEFAULT_ENV_FILENAME = "env";

export function getConfigRoot(options: PathOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const overrideRoot = process.env[OVERRIDE_HOME_ENV];
  if (overrideRoot) {
    return path.resolve(overrideRoot);
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

export function getEnvFilePath(options?: PathOptions): string {
  const root = getConfigRoot(options);
  return path.join(root, DEFAULT_ENV_FILENAME);
}

export function readEnvFileSync(
  filePath: string = getEnvFilePath(),
): Record<string, string> | undefined {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return parseEnvFile(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export function parseEnvFile(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    if (!key) {
      continue;
    }
    result[key] = rest.join("=");
  }
  return result;
}
