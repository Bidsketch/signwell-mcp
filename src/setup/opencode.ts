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
    return path.join(home, ".config", "opencode", "opencode.json");
  }

  return path.join(home, ".config", "opencode", "opencode.json");
}

export function buildOpenCodeSnippet(context: SetupRenderContext): ClientSnippet {
  const snippetObject = buildOpenCodeConfig(context);
  return {
    name: "OpenCode",
    configPath: `${getOpenCodeConfigPath()} · mcp.${context.serverName}`,
    snippet: JSON.stringify(snippetObject, null, 2),
    notes: [
      "OpenCode stores global MCP settings in ~/.config/opencode/opencode.json.",
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
  const snippet = JSON.stringify(buildOpenCodeConfig(context), null, 2);

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

  if (typeof config.$schema !== "string") {
    config.$schema = "https://opencode.ai/config.json";
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
  $schema?: string;
  mcp?: Record<string, OpenCodeEntry>;
};

type OpenCodeEntry = {
  type: "local";
  command: string[];
  enabled: true;
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
    enabled: true,
  };
  if (context.environment && Object.keys(context.environment).length > 0) {
    entry.environment = context.environment;
  }
  return entry;
}

function buildOpenCodeConfig(context: SetupRenderContext): OpenCodeConfig {
  return {
    $schema: "https://opencode.ai/config.json",
    mcp: {
      [context.serverName]: buildOpenCodeEntry(context),
    },
  };
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
