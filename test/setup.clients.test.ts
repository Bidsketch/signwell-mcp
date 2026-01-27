import { describe, expect, test } from "bun:test";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildPosixLaunch, buildPowerShellLaunch } from "../src/setup/command.ts";
import { ALL_CLIENT_KEYS, parseClientKeys } from "../src/setup/clients.ts";
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
import { applyCursorConfig, buildCursorSnippet, getCursorConfigPath } from "../src/setup/cursor.ts";
import {
  applyOpenCodeConfig,
  buildOpenCodeSnippet,
  getOpenCodeConfigPath,
} from "../src/setup/opencode.ts";
import { buildManualSnippet } from "../src/setup/manual.ts";
import type { SetupRenderContext } from "../src/setup/types.ts";

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

describe("setup client snippets", () => {
  test("claude desktop path selection", () => {
    expect(getClaudeDesktopConfigPath({ platform: "darwin", homeDir: "/Users/demo" })).toContain(
      "/Users/demo/Library/Application Support/Claude",
    );
    expect(getClaudeDesktopConfigPath({ platform: "win32", homeDir: "C:/Users/demo" })).toContain(
      "Claude/claude_desktop_config.json",
    );
  });

  test("claude desktop snippet references server name", () => {
    const snippet = buildClaudeDesktopSnippet(context);
    expect(snippet.name).toBe("Claude Desktop");
    expect(snippet.snippet).toContain(context.launchCommand.command);
    expect(snippet.notes.length).toBeGreaterThan(0);
  });

  test("claude code config path is ~/.claude/mcp.json", () => {
    const configPath = getClaudeCodeConfigPath({ homeDir: "/Users/demo" });
    expect(configPath).toBe("/Users/demo/.claude/mcp.json");
  });

  test("claude code snippet JSON includes server entry under servers key", () => {
    const snippet = buildClaudeCodeSnippet(context);
    expect(snippet.name).toBe("Claude Code");
    expect(snippet.snippet).toContain(context.serverName);
    expect(snippet.configPath).toContain("servers.");
  });

  test("cursor snippet emits JSON payload", () => {
    const snippet = buildCursorSnippet(context);
    expect(snippet.snippet).toContain(context.serverName);
    expect(snippet.name).toBe("Cursor");
    expect(snippet.configPath).toBe(getCursorConfigPath());
  });

  test("opencode snippet references config path and command array", () => {
    const snippet = buildOpenCodeSnippet(context);
    expect(snippet.name).toBe("OpenCode");
    expect(snippet.configPath).toContain(getOpenCodeConfigPath());
    expect(snippet.snippet).toContain(context.launchCommand.command);
  });

  test("manual snippet lists both shell families", () => {
    const snippet = buildManualSnippet({
      ...context,
      entryPoint: "/repo/index.ts",
      runner: "bun",
    });
    expect(snippet.snippet).toContain("# POSIX shells");
    expect(snippet.snippet).toContain("# Windows (PowerShell)");
    expect(snippet.snippet).toContain("SIGNWELL_DEBUG=1");
  });
});

describe("launch command helpers", () => {
  test("posix launch quotes paths", () => {
    const result = buildPosixLaunch("/tmp/my env", "/repo/build/index.js", "node");
    expect(result).toContain(". '/tmp/my env'");
    expect(result).toContain("node '/repo/build/index.js'");
  });

  test("powershell launch emits script", () => {
    const script = buildPowerShellLaunch("C:/Secrets/.env", "C:/repo/build/index.js", "node");
    expect(script).toContain("Test-Path");
    expect(script).toContain("node ");
  });
});

describe("client config writers", () => {
  test("claude desktop writer updates config and backups existing file", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "claude-desktop-"));
    const filePath = path.join(tmpDir, "claude_desktop_config.json");

    try {
      const result = await applyClaudeDesktopConfig(context, { filePathOverride: filePath });
      expect(result.wrote).toBe(true);

      const parsed = JSON.parse(await fsp.readFile(filePath, "utf8")) as {
        mcpServers?: Record<string, unknown>;
      };
      expect(parsed.mcpServers?.[context.serverName]).toBeDefined();

      const second = await applyClaudeDesktopConfig(context, { filePathOverride: filePath });
      expect(second.backupPath).toBe(`${filePath}.backup`);
      expect(second.wrote).toBe(true);
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("claude code writer merges servers and creates timestamped backup", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "claude-code-"));
    const filePath = path.join(tmpDir, "mcp.json");
    const initial = {
      servers: {
        other: { command: "echo", args: ["hello"] },
      },
    };
    await fsp.writeFile(filePath, `${JSON.stringify(initial, null, 2)}\n`);

    try {
      const result = await applyClaudeCodeConfig(context, { filePathOverride: filePath });
      expect(result.wrote).toBe(true);
      expect(result.name).toBe("Claude Code");

      const updated = JSON.parse(await fsp.readFile(filePath, "utf8")) as {
        servers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
      };
      expect(updated.servers.other.command).toBe("echo");
      expect(updated.servers[context.serverName].command).toBe(context.launchCommand.command);
      expect(updated.servers[context.serverName].env?.SIGNWELL_DEBUG).toBe("1");

      // Second write creates timestamped backup
      const second = await applyClaudeCodeConfig(context, { filePathOverride: filePath });
      expect(second.backupPath).toMatch(/mcp\.json\.backup-/);
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("cursor writer merges config and creates timestamped backup", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cursor-config-"));
    const filePath = path.join(tmpDir, "mcp.json");
    await fsp.writeFile(
      filePath,
      JSON.stringify(
        {
          mcpServers: {
            legacy: { command: "echo", args: ["hi"] },
          },
        },
        null,
        2,
      ),
    );

    try {
      const first = await applyCursorConfig(context, { filePathOverride: filePath });
      expect(first.wrote).toBe(true);

      const second = await applyCursorConfig(context, { filePathOverride: filePath });
      expect(second.backupPath).toBeDefined();
      expect(second.backupPath).toMatch(/mcp\.json\.backup-/);

      const updated = JSON.parse(await fsp.readFile(filePath, "utf8")) as {
        mcpServers: Record<string, { command: string; args: string[] }>;
      };
      const servers = updated.mcpServers;
      expect(servers.legacy.command).toBe("echo");
      expect(servers[context.serverName].command).toBe(context.launchCommand.command);
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test("opencode writer merges config and backs up existing file", async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "opencode-config-"));
    const filePath = path.join(tmpDir, "config.json");
    await fsp.writeFile(
      filePath,
      JSON.stringify(
        {
          mcp: {
            legacy: {
              type: "local",
              command: ["node"],
            },
          },
        },
        null,
        2,
      ),
    );

    try {
      const first = await applyOpenCodeConfig(context, { filePathOverride: filePath });
      expect(first.wrote).toBe(true);

      const second = await applyOpenCodeConfig(context, { filePathOverride: filePath });
      expect(second.backupPath).toMatch(/config\.json\.backup-/);

      const updated = JSON.parse(await fsp.readFile(filePath, "utf8")) as {
        mcp: Record<string, { command: string[]; environment?: Record<string, string> }>;
      };
      expect(updated.mcp.legacy.command[0]).toBe("node");
      expect(updated.mcp[context.serverName].command[0]).toBe(context.launchCommand.command);
      expect(updated.mcp[context.serverName].environment.SIGNWELL_DEBUG).toBe("1");
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
