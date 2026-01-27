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

export function getClaudeDesktopConfigPath(
  options: { platform?: NodeJS.Platform; homeDir?: string } = {},
): string {
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? os.homedir();

  if (platform === "darwin") {
    return path.join(
      home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }

  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }

  return path.join(home, ".config", "Claude", "claude_desktop_config.json");
}

export function buildClaudeDesktopSnippet(context: SetupRenderContext): ClientSnippet {
  const configPath = getClaudeDesktopConfigPath();
  const snippetObject = buildDesktopEntry(context);

  return {
    name: "Claude Desktop",
    configPath: `${configPath} · mcpServers.${context.serverName}`,
    snippet: JSON.stringify(snippetObject, null, 2),
    notes: [
      "Open Claude Desktop → Settings → Developer → Edit Config.",
      `Add or update mcpServers.${context.serverName} with the snippet below.`,
      "Restart Claude Desktop so the change takes effect.",
    ],
  };
}

export async function applyClaudeDesktopConfig(
  context: SetupRenderContext,
  options: ClientWriteOptions = {},
): Promise<ClientWriteResult> {
  const configPath = options.filePathOverride ?? getClaudeDesktopConfigPath();
  const snippetObject = buildDesktopEntry(context);
  const snippet = JSON.stringify(snippetObject, null, 2);

  if (options.printOnly) {
    return {
      name: "Claude Desktop",
      path: configPath,
      wrote: false,
      snippet,
    };
  }

  const config = await readJsonConfig(configPath);
  const servers =
    typeof config.mcpServers === "object" && config.mcpServers !== null
      ? (config.mcpServers as Record<string, unknown>)
      : {};
  servers[context.serverName] = snippetObject;
  config.mcpServers = servers;

  await fsp.mkdir(path.dirname(configPath), { recursive: true });
  let backupPath: string | undefined;
  if (fs.existsSync(configPath)) {
    backupPath = `${configPath}.backup`;
    await fsp.copyFile(configPath, backupPath);
  }

  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  await fsp.writeFile(configPath, serialized);

  return {
    name: "Claude Desktop",
    path: configPath,
    wrote: true,
    backupPath,
    snippet,
  };
}

function buildDesktopEntry(context: SetupRenderContext) {
  const entry: {
    command: string;
    args: string[];
    cwd: string;
    metadata: { description: string };
    env?: Record<string, string>;
  } = {
    command: context.launchCommand.command,
    args: context.launchCommand.args,
    cwd: context.repositoryPath,
    metadata: {
      description: "SignWell MCP server",
    },
  };
  if (context.environment && Object.keys(context.environment).length > 0) {
    entry.env = context.environment;
  }
  return entry;
}

async function readJsonConfig(configPath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fsp.readFile(configPath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
