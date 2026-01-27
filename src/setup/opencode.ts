import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import type {
  ClientSnippet,
  ClientWriteOptions,
  ClientWriteResult,
  SetupRenderContext,
} from "./types.ts";

export function getOpenCodeConfigPath(
  options: { platform?: NodeJS.Platform; homeDir?: string } = {},
): string {
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? os.homedir();

  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    return path.join(appData, "opencode", "config.json");
  }

  return path.join(home, ".config", "opencode", "config.json");
}

export function buildOpenCodeSnippet(context: SetupRenderContext): ClientSnippet {
  const snippetObject = buildOpenCodeEntry(context);
  return {
    name: "OpenCode",
    configPath: `${getOpenCodeConfigPath()} · mcp.${context.serverName}`,
    snippet: JSON.stringify(
      {
        mcp: {
          [context.serverName]: snippetObject,
        },
      },
      null,
      2,
    ),
    notes: [
      "OpenCode stores MCP settings in ~/.config/opencode/config.json (or %APPDATA%/opencode).",
      "The wizard updates this file automatically and keeps a timestamped backup per run.",
    ],
  };
}

export async function applyOpenCodeConfig(
  context: SetupRenderContext,
  options: ClientWriteOptions = {},
): Promise<ClientWriteResult> {
  const configPath = options.filePathOverride ?? getOpenCodeConfigPath();
  const entry = buildOpenCodeEntry(context);
  const snippet = JSON.stringify(entry, null, 2);

  if (options.printOnly) {
    return {
      name: "OpenCode",
      path: configPath,
      wrote: false,
      snippet,
    };
  }

  const dir = path.dirname(configPath);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });

  const config = await readOpenCodeConfig(configPath);

  let backupPath: string | undefined;
  if (fs.existsSync(configPath)) {
    backupPath = `${configPath}.backup-${timestamp()}`;
    await fsp.copyFile(configPath, backupPath);
  }

  if (typeof config.mcp !== "object" || config.mcp === null || Array.isArray(config.mcp)) {
    config.mcp = {};
  }

  config.mcp[context.serverName] = entry;

  await fsp.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  return {
    name: "OpenCode",
    path: configPath,
    wrote: true,
    backupPath,
    snippet,
  };
}

type OpenCodeConfig = {
  mcp?: Record<string, OpenCodeEntry>;
};

type OpenCodeEntry = {
  type: "local";
  command: string[];
  environment?: Record<string, string>;
};

async function readOpenCodeConfig(filePath: string): Promise<OpenCodeConfig> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    return JSON.parse(trimmed) as OpenCodeConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function buildOpenCodeEntry(context: SetupRenderContext): OpenCodeEntry {
  const entry: OpenCodeEntry = {
    type: "local",
    command: [context.launchCommand.command, ...context.launchCommand.args],
  };
  if (context.environment && Object.keys(context.environment).length > 0) {
    entry.environment = context.environment;
  }
  return entry;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
