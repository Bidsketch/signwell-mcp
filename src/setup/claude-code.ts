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
 * Claude Code stores user-scoped MCP servers in ~/.claude.json.
 */
export function getClaudeCodeConfigPath(options: { homeDir?: string } = {}): string {
  const home = options.homeDir ?? os.homedir();
  return path.join(home, ".claude.json");
}

function getLegacyClaudeCodeConfigPath(options: { homeDir?: string } = {}): string {
  const home = options.homeDir ?? os.homedir();
  return path.join(home, ".claude", "mcp.json");
}

export function buildClaudeCodeSnippet(context: SetupRenderContext): ClientSnippet {
  const snippet = buildMcpServersSnippet(context);

  return {
    name: "Claude Code",
    configPath: `${getClaudeCodeConfigPath()} · mcpServers.${context.serverName}`,
    snippet,
    notes: [
      "Claude Code stores user-scoped MCP configuration in ~/.claude.json.",
      `Add or update mcpServers.${context.serverName} with the snippet below.`,
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
  const snippet = buildMcpServersSnippet(context);

  if (options.printOnly) {
    return {
      name: "Claude Code",
      path: configPath,
      wrote: false,
      snippet,
    };
  }

  const config = await readClaudeCodeConfig(configPath);

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

  config.mcpServers[context.serverName] = serverEntry;

  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  await fsp.writeFile(configPath, serialized);
  await cleanupLegacyClaudeCodeConfig(path.dirname(configPath), context.serverName);

  return {
    name: "Claude Code",
    path: configPath,
    wrote: true,
    backupPath,
    snippet,
  };
}

type ClaudeCodeServerEntry = {
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type ClaudeCodeConfig = Record<string, unknown> & {
  mcpServers?: Record<string, ClaudeCodeServerEntry>;
};

type LegacyClaudeCodeConfig = Record<string, unknown> & {
  servers?: Record<string, unknown>;
};

function buildMcpServersSnippet(context: SetupRenderContext): string {
  return JSON.stringify(
    {
      mcpServers: {
        [context.serverName]: buildServerEntryObject(context),
      },
    },
    null,
    2,
  );
}

function buildServerEntryObject(context: SetupRenderContext): ClaudeCodeServerEntry {
  const entry: ClaudeCodeServerEntry = {
    type: "stdio",
    command: context.launchCommand.command,
    args: context.launchCommand.args,
  };
  if (context.environment && Object.keys(context.environment).length > 0) {
    entry.env = context.environment;
  }
  return entry;
}

async function readClaudeCodeConfig(filePath: string): Promise<ClaudeCodeConfig> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    return JSON.parse(trimmed) as ClaudeCodeConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw new Error(
      `[SignWell MCP] Unable to parse Claude Code MCP config at ${filePath}: ${(error as Error).message}`,
    );
  }
}

async function cleanupLegacyClaudeCodeConfig(homeDir: string, serverName: string): Promise<void> {
  const legacyPath = getLegacyClaudeCodeConfigPath({ homeDir });

  try {
    const raw = await fsp.readFile(legacyPath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }

    const config = JSON.parse(trimmed) as LegacyClaudeCodeConfig;
    if (
      typeof config.servers !== "object" ||
      config.servers === null ||
      Array.isArray(config.servers) ||
      !Object.hasOwn(config.servers, serverName)
    ) {
      return;
    }

    const backupPath = `${legacyPath}.backup-${timestamp()}`;
    await fsp.copyFile(legacyPath, backupPath);
    delete config.servers[serverName];
    await fsp.writeFile(legacyPath, `${JSON.stringify(config, null, 2)}\n`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    // Legacy cleanup should never make a successful reinstall fail.
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
