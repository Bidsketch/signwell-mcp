import { describe, expect, test } from "bun:test";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applyClaudeCodeConfig,
  buildClaudeCodeSnippet,
  getClaudeCodeConfigPath,
} from "../src/setup/claude-code.ts";
import {
  applyClaudeDesktopConfig,
  buildClaudeDesktopSnippet,
  getClaudeDesktopConfigPath,
} from "../src/setup/claude-desktop.ts";
import { ALL_CLIENT_KEYS, parseClientKeys } from "../src/setup/clients.ts";
import { buildPosixLaunch, buildPowerShellLaunch } from "../src/setup/command.ts";
import { applyCursorConfig, buildCursorSnippet, getCursorConfigPath } from "../src/setup/cursor.ts";
import { buildManualSnippet } from "../src/setup/manual.ts";
import {
  applyOpenCodeConfig,
  buildOpenCodeSnippet,
  getOpenCodeConfigPath,
} from "../src/setup/opencode.ts";
import type { SetupRenderContext } from "../src/setup/types.ts";

type McpServerEntry = {
  type?: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  metadata?: unknown;
};

type McpServersConfig = Record<string, unknown> & {
  mcpServers: Record<string, McpServerEntry>;
};

type LegacyClaudeCodeConfig = Record<string, unknown> & {
  servers: Record<string, unknown>;
};

type OpenCodeEntry = {
  type: "local";
  command: string[];
  enabled?: boolean;
  environment?: Record<string, string>;
};

type OpenCodeConfig = Record<string, unknown> & {
  $schema?: string;
  mcp: Record<string, OpenCodeEntry>;
};

const context: SetupRenderContext = {
  serverName: "signwell",
  envFilePath: "/tmp/signwell/env",
  repositoryPath: "/repo/signwell-mcp",
  entryPoint: "/repo/signwell-mcp/build/index.js",
  runner: "node",
  launchCommand: {
    command: "/bin/sh",
    args: ["-c", "echo"],
  },
  environment: {
    SIGNWELL_DEBUG: "1",
  },
};

const contextWithoutEnv: SetupRenderContext = {
  serverName: "signwell",
  envFilePath: "/tmp/signwell/env",
  repositoryPath: "/repo/signwell-mcp",
  entryPoint: "/repo/signwell-mcp/build/index.js",
  runner: "node",
  launchCommand: {
    command: "/bin/sh",
    args: ["-c", "echo"],
  },
};

describe("setup client snippets", () => {
  test("claude desktop path selection", () => {
    expect(getClaudeDesktopConfigPath({ platform: "darwin", homeDir: "/Users/demo" })).toContain(
      "/Users/demo/Library/Application Support/Claude",
    );
    expect(getClaudeDesktopConfigPath({ platform: "win32", homeDir: "C:/Users/demo" })).toContain(
      "Claude/claude_desktop_config.json",
    );
  });

  test("claude desktop snippet uses documented mcpServers wrapper", () => {
    const snippet = buildClaudeDesktopSnippet(context);
    const parsed = JSON.parse(snippet.snippet) as McpServersConfig;
    const server = parsed.mcpServers[context.serverName];

    expect(snippet.name).toBe("Claude Desktop");
    expect(snippet.configPath).toContain(`mcpServers.${context.serverName}`);
    expect(server.command).toBe(context.launchCommand.command);
    expect(server.args).toEqual(context.launchCommand.args);
    expect(server.env?.SIGNWELL_DEBUG).toBe("1");
    expect(server.metadata).toBeUndefined();
    expect(server.cwd).toBeUndefined();
  });

  test("claude code config path is ~/.claude.json", () => {
    const configPath = getClaudeCodeConfigPath({ homeDir: "/Users/demo" });
    expect(configPath).toBe("/Users/demo/.claude.json");
  });

  test("claude code snippet JSON includes stdio server under mcpServers", () => {
    const snippet = buildClaudeCodeSnippet(context);
    const parsed = JSON.parse(snippet.snippet) as McpServersConfig;
    const server = parsed.mcpServers[context.serverName];

    expect(snippet.name).toBe("Claude Code");
    expect(snippet.configPath).toContain(`mcpServers.${context.serverName}`);
    expect(server.type).toBe("stdio");
    expect(server.command).toBe(context.launchCommand.command);
    expect(server.env?.SIGNWELL_DEBUG).toBe("1");
  });

  test("cursor snippet emits stdio server under mcpServers", () => {
    const snippet = buildCursorSnippet(context);
    const parsed = JSON.parse(snippet.snippet) as McpServersConfig;
    const server = parsed.mcpServers[context.serverName];

    expect(snippet.name).toBe("Cursor");
    expect(snippet.configPath).toBe(getCursorConfigPath());
    expect(server.type).toBe("stdio");
    expect(server.command).toBe(context.launchCommand.command);
    expect(server.env?.SIGNWELL_DEBUG).toBe("1");
  });

  test("opencode path selection uses opencode.json", () => {
    expect(getOpenCodeConfigPath({ platform: "darwin", homeDir: "/Users/demo" })).toBe(
      "/Users/demo/.config/opencode/opencode.json",
    );
    expect(getOpenCodeConfigPath({ platform: "win32", homeDir: "C:/Users/demo" })).toBe(
      "C:/Users/demo/.config/opencode/opencode.json",
    );
  });

  test("opencode snippet references config path and local command array", () => {
    const snippet = buildOpenCodeSnippet(context);
    const parsed = JSON.parse(snippet.snippet) as OpenCodeConfig;
    const server = parsed.mcp[context.serverName];

    expect(snippet.name).toBe("OpenCode");
    expect(snippet.configPath).toContain(getOpenCodeConfigPath());
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(server.type).toBe("local");
    expect(server.command[0]).toBe(context.launchCommand.command);
    expect(server.enabled).toBe(true);
    expect(server.environment?.SIGNWELL_DEBUG).toBe("1");
  });

  test("manual snippet lists both shell families", () => {
    const snippet = buildManualSnippet({
      ...context,
      entryPoint: "/repo/index.ts",
      runner: "node",
    });
    expect(snippet.snippet).toContain("# POSIX shells");
    expect(snippet.snippet).toContain("# Windows (PowerShell)");
    expect(snippet.snippet).toContain("SIGNWELL_DEBUG=1");
  });
});

describe("launch command helpers", () => {
  test("posix launch quotes paths", () => {
    const result = buildPosixLaunch("/tmp/my env", "/repo/build/index.js", "node", true);
    expect(result).toContain(". '/tmp/my env'");
    expect(result).toContain("'/repo/build/index.js'");
  });

  test("powershell launch emits script", () => {
    const script = buildPowerShellLaunch("C:/Secrets/.env", "C:/repo/build/index.js", "node", true);
    expect(script).toContain("Test-Path");
    expect(script).toContain("'C:/repo/build/index.js'");
  });
});

describe("client config writers", () => {
  test("claude desktop writer preserves config, merges servers, and backs up existing file", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "claude-desktop-"));
    const filePath = path.join(tmpDir, "claude_desktop_config.json");
    await writeJson(filePath, {
      windowState: "maximized",
      mcpServers: {
        legacy: { command: "echo", args: ["hi"] },
        signwell: { command: "old", args: [] },
      },
    });

    try {
      const result = await applyClaudeDesktopConfig(context, { filePathOverride: filePath });
      expect(result.wrote).toBe(true);
      expect(result.backupPath).toBe(`${filePath}.backup`);

      const updated = await readJsonFile<McpServersConfig>(filePath);
      const server = updated.mcpServers[context.serverName];
      expect(updated.windowState).toBe("maximized");
      expect(updated.mcpServers.legacy.command).toBe("echo");
      expect(server.command).toBe(context.launchCommand.command);
      expect(server.env?.SIGNWELL_DEBUG).toBe("1");
      expect(server.metadata).toBeUndefined();
      expect(server.cwd).toBeUndefined();
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("claude code writer preserves config, merges mcpServers, and creates timestamped backup", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "claude-code-"));
    const filePath = path.join(tmpDir, ".claude.json");
    await writeJson(filePath, {
      firstStartTime: "2026-06-13T00:00:00.000Z",
      mcpServers: {
        other: { type: "stdio", command: "echo", args: ["hello"] },
        signwell: { type: "stdio", command: "old", args: [] },
      },
    });

    try {
      const result = await applyClaudeCodeConfig(context, { filePathOverride: filePath });
      expect(result.wrote).toBe(true);
      expect(result.name).toBe("Claude Code");
      expect(result.backupPath).toMatch(/\.claude\.json\.backup-/);

      const updated = await readJsonFile<McpServersConfig>(filePath);
      const server = updated.mcpServers[context.serverName];
      expect(updated.firstStartTime).toBe("2026-06-13T00:00:00.000Z");
      expect(updated.mcpServers.other.command).toBe("echo");
      expect(server.type).toBe("stdio");
      expect(server.command).toBe(context.launchCommand.command);
      expect(server.env?.SIGNWELL_DEBUG).toBe("1");
      expect(updated.servers).toBeUndefined();
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("claude code writer recovers stale legacy install state", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "claude-code-legacy-"));
    const filePath = path.join(tmpDir, ".claude.json");
    const legacyPath = path.join(tmpDir, ".claude", "mcp.json");
    await writeJson(legacyPath, {
      servers: {
        other: { command: "echo", args: ["hello"] },
        signwell: { command: "old", args: [] },
      },
    });

    try {
      const result = await applyClaudeCodeConfig(context, { filePathOverride: filePath });
      expect(result.wrote).toBe(true);

      const updated = await readJsonFile<McpServersConfig>(filePath);
      expect(updated.mcpServers.signwell.type).toBe("stdio");
      expect(updated.mcpServers.signwell.command).toBe(context.launchCommand.command);

      const legacy = await readJsonFile<LegacyClaudeCodeConfig>(legacyPath);
      expect(legacy.servers.other).toBeDefined();
      expect(legacy.servers.signwell).toBeUndefined();

      const legacyFiles = await fsp.readdir(path.dirname(legacyPath));
      expect(legacyFiles.some((name) => /^mcp\.json\.backup-/.test(name))).toBe(true);
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("cursor writer preserves config, merges mcpServers, and creates timestamped backup", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cursor-config-"));
    const filePath = path.join(tmpDir, "mcp.json");
    await writeJson(filePath, {
      version: 1,
      mcpServers: {
        legacy: { type: "stdio", command: "echo", args: ["hi"] },
        signwell: { type: "stdio", command: "old", args: [] },
      },
    });

    try {
      const result = await applyCursorConfig(context, { filePathOverride: filePath });
      expect(result.wrote).toBe(true);
      expect(result.backupPath).toMatch(/mcp\.json\.backup-/);

      const updated = await readJsonFile<McpServersConfig>(filePath);
      const server = updated.mcpServers[context.serverName];
      expect(updated.version).toBe(1);
      expect(updated.mcpServers.legacy.command).toBe("echo");
      expect(server.type).toBe("stdio");
      expect(server.command).toBe(context.launchCommand.command);
      expect(server.env?.SIGNWELL_DEBUG).toBe("1");
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("opencode writer preserves config, merges mcp, adds schema, and creates timestamped backup", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "opencode-config-"));
    const filePath = path.join(tmpDir, "opencode.json");
    await writeJson(filePath, {
      model: "anthropic/claude-sonnet-4-5",
      mcp: {
        legacy: {
          type: "local",
          command: ["node"],
        },
        signwell: {
          type: "local",
          command: ["old"],
        },
      },
    });

    try {
      const result = await applyOpenCodeConfig(context, { filePathOverride: filePath });
      expect(result.wrote).toBe(true);
      expect(result.backupPath).toMatch(/opencode\.json\.backup-/);

      const updated = await readJsonFile<OpenCodeConfig>(filePath);
      const server = updated.mcp[context.serverName];
      expect(updated.model).toBe("anthropic/claude-sonnet-4-5");
      expect(updated.$schema).toBe("https://opencode.ai/config.json");
      expect(updated.mcp.legacy.command[0]).toBe("node");
      expect(server.type).toBe("local");
      expect(server.command[0]).toBe(context.launchCommand.command);
      expect(server.enabled).toBe(true);
      expect(server.environment?.SIGNWELL_DEBUG).toBe("1");
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("opencode writer preserves an existing schema", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "opencode-schema-"));
    const filePath = path.join(tmpDir, "opencode.json");
    await writeJson(filePath, {
      $schema: "https://example.com/custom-schema.json",
      mcp: {},
    });

    try {
      await applyOpenCodeConfig(context, { filePathOverride: filePath });

      const updated = await readJsonFile<OpenCodeConfig>(filePath);
      expect(updated.$schema).toBe("https://example.com/custom-schema.json");
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("writers omit optional environment blocks when context has no environment", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "setup-no-env-"));
    const claudeDesktopPath = path.join(tmpDir, "claude_desktop_config.json");
    const claudeCodePath = path.join(tmpDir, ".claude.json");
    const cursorPath = path.join(tmpDir, "cursor.json");
    const openCodePath = path.join(tmpDir, "opencode.json");

    try {
      await applyClaudeDesktopConfig(contextWithoutEnv, { filePathOverride: claudeDesktopPath });
      await applyClaudeCodeConfig(contextWithoutEnv, { filePathOverride: claudeCodePath });
      await applyCursorConfig(contextWithoutEnv, { filePathOverride: cursorPath });
      await applyOpenCodeConfig(contextWithoutEnv, { filePathOverride: openCodePath });

      const claudeDesktop = await readJsonFile<McpServersConfig>(claudeDesktopPath);
      const claudeCode = await readJsonFile<McpServersConfig>(claudeCodePath);
      const cursor = await readJsonFile<McpServersConfig>(cursorPath);
      const openCode = await readJsonFile<OpenCodeConfig>(openCodePath);

      expect(claudeDesktop.mcpServers.signwell.env).toBeUndefined();
      expect(claudeCode.mcpServers.signwell.env).toBeUndefined();
      expect(cursor.mcpServers.signwell.env).toBeUndefined();
      expect(openCode.mcp.signwell.environment).toBeUndefined();
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("print-only mode returns corrected snippets without writing files", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "setup-print-only-"));
    const claudeCodePath = path.join(tmpDir, ".claude.json");
    const cursorPath = path.join(tmpDir, "mcp.json");
    const openCodePath = path.join(tmpDir, "opencode.json");

    try {
      const claudeCode = await applyClaudeCodeConfig(context, {
        filePathOverride: claudeCodePath,
        printOnly: true,
      });
      const cursor = await applyCursorConfig(context, {
        filePathOverride: cursorPath,
        printOnly: true,
      });
      const openCode = await applyOpenCodeConfig(context, {
        filePathOverride: openCodePath,
        printOnly: true,
      });

      expect(claudeCode.wrote).toBe(false);
      expect(cursor.wrote).toBe(false);
      expect(openCode.wrote).toBe(false);
      expect(await pathExists(claudeCodePath)).toBe(false);
      expect(await pathExists(cursorPath)).toBe(false);
      expect(await pathExists(openCodePath)).toBe(false);

      const claudeCodeSnippet = JSON.parse(claudeCode.snippet) as McpServersConfig;
      const cursorSnippet = JSON.parse(cursor.snippet) as McpServersConfig;
      const openCodeSnippet = JSON.parse(openCode.snippet) as OpenCodeConfig;

      expect(claudeCodeSnippet.mcpServers.signwell.type).toBe("stdio");
      expect(cursorSnippet.mcpServers.signwell.type).toBe("stdio");
      expect(openCodeSnippet.mcp.signwell.type).toBe("local");
      expect(openCodeSnippet.$schema).toBe("https://opencode.ai/config.json");
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("client selection parsing", () => {
  test("parseClientKeys returns all clients for empty input", () => {
    expect(parseClientKeys()).toEqual(ALL_CLIENT_KEYS);
    expect(parseClientKeys("all")).toEqual(ALL_CLIENT_KEYS);
    expect(parseClientKeys("   ")).toEqual(ALL_CLIENT_KEYS);
  });

  test("parseClientKeys handles subsets and ignores duplicates", () => {
    expect(parseClientKeys("cursor, opencode, cursor")).toEqual(["cursor", "opencode"]);
  });

  test("parseClientKeys rejects unknown clients", () => {
    expect(() => parseClientKeys("unknown")).toThrow(/Unknown client/);
  });
});

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fsp.readFile(filePath, "utf8")) as T;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
