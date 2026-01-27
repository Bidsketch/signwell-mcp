import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  ClientSnippet,
  ClientWriteOptions,
  ClientWriteResult,
  SetupRenderContext,
} from "./types.ts";

export function getCursorConfigPath(options: { homeDir?: string } = {}): string {
  const home = options.homeDir ?? os.homedir();
  return path.join(home, ".cursor", "mcp.json");
}

export function buildCursorSnippet(context: SetupRenderContext): ClientSnippet {
  const snippetObject = buildCursorConfig(context);
  return {
    name: "Cursor",
    configPath: getCursorConfigPath(),
    snippet: JSON.stringify(snippetObject, null, 2),
    notes: [
      "Cursor now supports editing ~/.cursor/mcp.json directly; the setup wizard writes this file automatically.",
      "If you prefer manual edits, replace or merge the block below.",
      "Restart Cursor after the file changes.",
    ],
  };
}

export async function applyCursorConfig(
  context: SetupRenderContext,
  options: ClientWriteOptions = {},
): Promise<ClientWriteResult> {
  const configPath = options.filePathOverride ?? getCursorConfigPath();
  const snippetObject = buildCursorConfig(context);
  const snippet = JSON.stringify(snippetObject, null, 2);

  if (options.printOnly) {
    return {
      name: "Cursor",
      path: configPath,
      wrote: false,
      snippet,
    };
  }

  const config = await readCursorConfig(configPath);
  const dir = path.dirname(configPath);

  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });

  let backupPath: string | undefined;
  if (fs.existsSync(configPath)) {
    backupPath = `${configPath}.backup-${timestamp()}`;
    await fsp.copyFile(configPath, backupPath);
  }

  if (
    typeof config.mcpServers !== "object" ||
    config.mcpServers === null ||
    Array.isArray(config.mcpServers)
  ) {
    config.mcpServers = {};
  }

  config.mcpServers[context.serverName] = snippetObject.mcpServers[context.serverName];

  await fsp.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  return {
    name: "Cursor",
    path: configPath,
    wrote: true,
    backupPath,
    snippet,
  };
}

type CursorEntry = {
  command: string;
  args: string[];
};

type CursorConfig = {
  mcpServers?: Record<string, CursorEntry>;
};

type CursorSnippet = {
  mcpServers: Record<string, CursorEntry>;
};

async function readCursorConfig(filePath: string): Promise<CursorConfig> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    return JSON.parse(trimmed) as CursorConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function buildCursorConfig(context: SetupRenderContext): CursorSnippet {
  return {
    mcpServers: {
      [context.serverName]: {
        command: context.launchCommand.command,
        args: context.launchCommand.args,
      },
    },
  };
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
