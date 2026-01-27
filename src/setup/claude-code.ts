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

/**
 * Returns the path to the Claude Code CLI MCP configuration file.
 * Claude Code CLI stores MCP servers in ~/.claude/mcp.json on all platforms.
 */
export function getClaudeCodeConfigPath(options: { homeDir?: string } = {}): string {
  const home = options.homeDir ?? os.homedir();
  return path.join(home, ".claude", "mcp.json");
}

export function buildClaudeCodeSnippet(context: SetupRenderContext): ClientSnippet {
  const snippet = buildServerEntrySnippet(context);

  return {
    name: "Claude Code",
    configPath: `${getClaudeCodeConfigPath()} · servers.${context.serverName}`,
    snippet,
    notes: [
      "Claude Code CLI stores MCP configuration in ~/.claude/mcp.json.",
      `Add or update the "servers.${context.serverName}" entry with the snippet below.`,
      "Claude Code will automatically detect the new server on next startup.",
    ],
  };
}

export async function applyClaudeCodeConfig(
  context: SetupRenderContext,
  options: ClientWriteOptions = {},
): Promise<ClientWriteResult> {
  const configPath = options.filePathOverride ?? getClaudeCodeConfigPath();
  const serverEntry = buildServerEntryObject(context);
  const snippet = buildServerEntrySnippet(context);

  if (options.printOnly) {
    return {
      name: "Claude Code",
      path: configPath,
      wrote: false,
      snippet,
    };
  }

  const config = await readMcpConfig(configPath);

  // Ensure the .claude directory exists with appropriate permissions
  const dir = path.dirname(configPath);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });

  let backupPath: string | undefined;
  if (fs.existsSync(configPath)) {
    backupPath = `${configPath}.backup-${timestamp()}`;
    await fsp.copyFile(configPath, backupPath);
  }

  // Initialize servers object if needed
  if (
    typeof config.servers !== "object" ||
    config.servers === null ||
    Array.isArray(config.servers)
  ) {
    config.servers = {};
  }

  config.servers[context.serverName] = serverEntry;

  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  await fsp.writeFile(configPath, serialized);

  return {
    name: "Claude Code",
    path: configPath,
    wrote: true,
    backupPath,
    snippet,
  };
}

type ClaudeCodeServerEntry = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type ClaudeCodeMcpConfig = {
  servers?: Record<string, ClaudeCodeServerEntry>;
};

function buildServerEntrySnippet(context: SetupRenderContext): string {
  return JSON.stringify(
    {
      [context.serverName]: buildServerEntryObject(context),
    },
    null,
    2,
  );
}

function buildServerEntryObject(context: SetupRenderContext): ClaudeCodeServerEntry {
  const entry: ClaudeCodeServerEntry = {
    command: context.launchCommand.command,
    args: context.launchCommand.args,
  };
  if (context.environment && Object.keys(context.environment).length > 0) {
    entry.env = context.environment;
  }
  return entry;
}

async function readMcpConfig(filePath: string): Promise<ClaudeCodeMcpConfig> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    return JSON.parse(trimmed) as ClaudeCodeMcpConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw new Error(
      `[SignWell MCP] Unable to parse Claude Code MCP config at ${filePath}: ${(error as Error).message}`,
    );
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
