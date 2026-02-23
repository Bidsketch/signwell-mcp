#!/usr/bin/env node

// src/index.ts
import { realpathSync } from "node:fs";
import path9 from "node:path";
import process9 from "node:process";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/config/env.ts
import process2 from "node:process";
import { z } from "zod";

// src/config/env-file.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
var OVERRIDE_HOME_ENV = "SIGNWELL_MCP_HOME";
var DEFAULT_ENV_FILENAME = "env";
function getConfigRoot(options = {}) {
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
function getEnvFilePath(options) {
  const root = getConfigRoot(options);
  return path.join(root, DEFAULT_ENV_FILENAME);
}
function readEnvFileSync(filePath = getEnvFilePath()) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return parseEnvFile(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return void 0;
    }
    throw error;
  }
}
function parseEnvFile(raw) {
  const result = {};
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

// src/config/env.ts
function isDebugEnabled() {
  return process2.env.SIGNWELL_DEBUG === "1" || process2.env.SIGNWELL_DEBUG === "true";
}
var EnvError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "EnvError";
  }
};
var DEFAULT_BASE_URL = "https://www.signwell.com/api/v1";
var DEFAULT_TIMEOUT_MS = 9e4;
var MAX_TIMEOUT_MS = 18e4;
var REQUIRED_KEYS = [
  "SIGNWELL_API_KEY",
  "SIGNWELL_API_BASE_URL",
  "SIGNWELL_API_TIMEOUT_MS"
];
var ConfigSchema = z.object({
  apiKey: z.string().min(1, { message: "SIGNWELL_API_KEY is required." }),
  baseUrl: z.string().url({ message: "SIGNWELL_API_BASE_URL must be a valid URL." }),
  timeoutMs: z.number().refine((value) => Number.isFinite(value), {
    message: "SIGNWELL_API_TIMEOUT_MS must be a valid number."
  }).int({ message: "SIGNWELL_API_TIMEOUT_MS must be an integer (milliseconds)." }).positive({ message: "SIGNWELL_API_TIMEOUT_MS must be greater than zero." }).max(MAX_TIMEOUT_MS, {
    message: `SIGNWELL_API_TIMEOUT_MS must be <= ${MAX_TIMEOUT_MS} ms.`
  })
});
function loadEnv(options = {}) {
  const quiet = options.quiet ?? detectTestMode();
  hydrateEnvFromDefaultFile();
  const envInput = {
    apiKey: clean(process2.env.SIGNWELL_API_KEY),
    baseUrl: clean(process2.env.SIGNWELL_API_BASE_URL) ?? DEFAULT_BASE_URL,
    timeoutMs: parseTimeout(clean(process2.env.SIGNWELL_API_TIMEOUT_MS)) ?? DEFAULT_TIMEOUT_MS
  };
  const result = ConfigSchema.safeParse(envInput);
  if (!result.success) {
    if (!quiet) {
      const formatted = result.error.issues.map((issue) => `- ${issue.message}`).join("\n");
      console.error("[SignWell MCP] Environment validation failed:");
      console.error(formatted);
      console.error(
        "Set SIGNWELL_API_KEY=<your_api_key> (and optional overrides) before starting the server."
      );
    }
    throw new EnvError("Invalid environment configuration. Fix the errors above and retry.");
  }
  return {
    ...result.data,
    userAgent: buildDefaultUserAgent(options.version),
    debug: isDebugEnabled()
  };
}
function clean(value) {
  if (!value) {
    return void 0;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function parseTimeout(value) {
  if (!value) {
    return void 0;
  }
  return Number(value);
}
function buildDefaultUserAgent(version) {
  return `signwell-mcp/${version ?? "dev"}`;
}
function detectTestMode() {
  return process2.env.NODE_ENV === "test";
}
function hydrateEnvFromDefaultFile() {
  const missingKeys = REQUIRED_KEYS.filter((key) => isUnset(process2.env[key]));
  if (missingKeys.length === 0) {
    return;
  }
  const fileValues = readEnvFileSync();
  if (!fileValues) {
    return;
  }
  for (const key of missingKeys) {
    const value = fileValues[key];
    if (typeof value === "string" && value.length > 0 && isUnset(process2.env[key])) {
      process2.env[key] = value;
    }
  }
}
function isUnset(value) {
  return typeof value !== "string" || value.trim().length === 0;
}

// src/setup/index.ts
import { spawn } from "node:child_process";
import fs6 from "node:fs";
import path7 from "node:path";
import process7 from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

// src/setup/claude-code.ts
import fs2 from "node:fs";
import fsp from "node:fs/promises";
import os2 from "node:os";
import path2 from "node:path";
function getClaudeCodeConfigPath(options = {}) {
  const home = options.homeDir ?? os2.homedir();
  return path2.join(home, ".claude", "mcp.json");
}
function buildClaudeCodeSnippet(context) {
  const snippet = buildServerEntrySnippet(context);
  return {
    name: "Claude Code",
    configPath: `${getClaudeCodeConfigPath()} \xB7 servers.${context.serverName}`,
    snippet,
    notes: [
      "Claude Code CLI stores MCP configuration in ~/.claude/mcp.json.",
      `Add or update the "servers.${context.serverName}" entry with the snippet below.`,
      "Claude Code will automatically detect the new server on next startup."
    ]
  };
}
async function applyClaudeCodeConfig(context, options = {}) {
  const configPath = options.filePathOverride ?? getClaudeCodeConfigPath();
  const serverEntry = buildServerEntryObject(context);
  const snippet = buildServerEntrySnippet(context);
  if (options.printOnly) {
    return {
      name: "Claude Code",
      path: configPath,
      wrote: false,
      snippet
    };
  }
  const config = await readMcpConfig(configPath);
  const dir = path2.dirname(configPath);
  await fsp.mkdir(dir, { recursive: true, mode: 448 });
  let backupPath;
  if (fs2.existsSync(configPath)) {
    backupPath = `${configPath}.backup-${timestamp()}`;
    await fsp.copyFile(configPath, backupPath);
  }
  if (typeof config.servers !== "object" || config.servers === null || Array.isArray(config.servers)) {
    config.servers = {};
  }
  config.servers[context.serverName] = serverEntry;
  const serialized = `${JSON.stringify(config, null, 2)}
`;
  await fsp.writeFile(configPath, serialized);
  return {
    name: "Claude Code",
    path: configPath,
    wrote: true,
    backupPath,
    snippet
  };
}
function buildServerEntrySnippet(context) {
  return JSON.stringify(
    {
      [context.serverName]: buildServerEntryObject(context)
    },
    null,
    2
  );
}
function buildServerEntryObject(context) {
  const entry = {
    command: context.launchCommand.command,
    args: context.launchCommand.args
  };
  if (context.environment && Object.keys(context.environment).length > 0) {
    entry.env = context.environment;
  }
  return entry;
}
async function readMcpConfig(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    return JSON.parse(trimmed);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw new Error(
      `[SignWell MCP] Unable to parse Claude Code MCP config at ${filePath}: ${error.message}`
    );
  }
}
function timestamp() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
}

// src/setup/claude-desktop.ts
import fs3 from "node:fs";
import fsp2 from "node:fs/promises";
import os3 from "node:os";
import path3 from "node:path";
import process3 from "node:process";
function getClaudeDesktopConfigPath(options = {}) {
  const platform = options.platform ?? process3.platform;
  const home = options.homeDir ?? os3.homedir();
  if (platform === "darwin") {
    return path3.join(
      home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
  }
  if (platform === "win32") {
    const appData = process3.env.APPDATA ?? path3.join(home, "AppData", "Roaming");
    return path3.join(appData, "Claude", "claude_desktop_config.json");
  }
  return path3.join(home, ".config", "Claude", "claude_desktop_config.json");
}
function buildClaudeDesktopSnippet(context) {
  const configPath = getClaudeDesktopConfigPath();
  const snippetObject = buildDesktopEntry(context);
  return {
    name: "Claude Desktop",
    configPath: `${configPath} \xB7 mcpServers.${context.serverName}`,
    snippet: JSON.stringify(snippetObject, null, 2),
    notes: [
      "Open Claude Desktop \u2192 Settings \u2192 Developer \u2192 Edit Config.",
      `Add or update mcpServers.${context.serverName} with the snippet below.`,
      "Restart Claude Desktop so the change takes effect."
    ]
  };
}
async function applyClaudeDesktopConfig(context, options = {}) {
  const configPath = options.filePathOverride ?? getClaudeDesktopConfigPath();
  const snippetObject = buildDesktopEntry(context);
  const snippet = JSON.stringify(snippetObject, null, 2);
  if (options.printOnly) {
    return {
      name: "Claude Desktop",
      path: configPath,
      wrote: false,
      snippet
    };
  }
  const config = await readJsonConfig(configPath);
  const servers = typeof config.mcpServers === "object" && config.mcpServers !== null ? config.mcpServers : {};
  servers[context.serverName] = snippetObject;
  config.mcpServers = servers;
  await fsp2.mkdir(path3.dirname(configPath), { recursive: true });
  let backupPath;
  if (fs3.existsSync(configPath)) {
    backupPath = `${configPath}.backup`;
    await fsp2.copyFile(configPath, backupPath);
  }
  const serialized = `${JSON.stringify(config, null, 2)}
`;
  await fsp2.writeFile(configPath, serialized);
  return {
    name: "Claude Desktop",
    path: configPath,
    wrote: true,
    backupPath,
    snippet
  };
}
function buildDesktopEntry(context) {
  const entry = {
    command: context.launchCommand.command,
    args: context.launchCommand.args,
    metadata: {
      description: "SignWell MCP server"
    }
  };
  if (context.isLocalDev) {
    entry.cwd = context.repositoryPath;
  }
  if (context.environment && Object.keys(context.environment).length > 0) {
    entry.env = context.environment;
  }
  return entry;
}
async function readJsonConfig(configPath) {
  try {
    const raw = await fsp2.readFile(configPath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    return JSON.parse(trimmed);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

// src/setup/cursor.ts
import fs4 from "node:fs";
import fsp3 from "node:fs/promises";
import os4 from "node:os";
import path4 from "node:path";
function getCursorConfigPath(options = {}) {
  const home = options.homeDir ?? os4.homedir();
  return path4.join(home, ".cursor", "mcp.json");
}
function buildCursorSnippet(context) {
  const snippetObject = buildCursorConfig(context);
  return {
    name: "Cursor",
    configPath: getCursorConfigPath(),
    snippet: JSON.stringify(snippetObject, null, 2),
    notes: [
      "Cursor now supports editing ~/.cursor/mcp.json directly; the setup wizard writes this file automatically.",
      "If you prefer manual edits, replace or merge the block below.",
      "Restart Cursor after the file changes."
    ]
  };
}
async function applyCursorConfig(context, options = {}) {
  const configPath = options.filePathOverride ?? getCursorConfigPath();
  const snippetObject = buildCursorConfig(context);
  const snippet = JSON.stringify(snippetObject, null, 2);
  if (options.printOnly) {
    return {
      name: "Cursor",
      path: configPath,
      wrote: false,
      snippet
    };
  }
  const config = await readCursorConfig(configPath);
  const dir = path4.dirname(configPath);
  await fsp3.mkdir(dir, { recursive: true, mode: 448 });
  let backupPath;
  if (fs4.existsSync(configPath)) {
    backupPath = `${configPath}.backup-${timestamp2()}`;
    await fsp3.copyFile(configPath, backupPath);
  }
  if (typeof config.mcpServers !== "object" || config.mcpServers === null || Array.isArray(config.mcpServers)) {
    config.mcpServers = {};
  }
  config.mcpServers[context.serverName] = snippetObject.mcpServers[context.serverName];
  await fsp3.writeFile(configPath, `${JSON.stringify(config, null, 2)}
`);
  return {
    name: "Cursor",
    path: configPath,
    wrote: true,
    backupPath,
    snippet
  };
}
async function readCursorConfig(filePath) {
  try {
    const raw = await fsp3.readFile(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    return JSON.parse(trimmed);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
function buildCursorConfig(context) {
  return {
    mcpServers: {
      [context.serverName]: {
        command: context.launchCommand.command,
        args: context.launchCommand.args
      }
    }
  };
}
function timestamp2() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
}

// src/setup/opencode.ts
import fs5 from "node:fs";
import fsp4 from "node:fs/promises";
import os5 from "node:os";
import path5 from "node:path";
import process4 from "node:process";
function getOpenCodeConfigPath(options = {}) {
  const platform = options.platform ?? process4.platform;
  const home = options.homeDir ?? os5.homedir();
  if (platform === "win32") {
    const appData = process4.env.APPDATA ?? path5.join(home, "AppData", "Roaming");
    return path5.join(appData, "opencode", "config.json");
  }
  return path5.join(home, ".config", "opencode", "config.json");
}
function buildOpenCodeSnippet(context) {
  const snippetObject = buildOpenCodeEntry(context);
  return {
    name: "OpenCode",
    configPath: `${getOpenCodeConfigPath()} \xB7 mcp.${context.serverName}`,
    snippet: JSON.stringify(
      {
        mcp: {
          [context.serverName]: snippetObject
        }
      },
      null,
      2
    ),
    notes: [
      "OpenCode stores MCP settings in ~/.config/opencode/config.json (or %APPDATA%/opencode).",
      "The wizard updates this file automatically and keeps a timestamped backup per run."
    ]
  };
}
async function applyOpenCodeConfig(context, options = {}) {
  const configPath = options.filePathOverride ?? getOpenCodeConfigPath();
  const entry = buildOpenCodeEntry(context);
  const snippet = JSON.stringify(entry, null, 2);
  if (options.printOnly) {
    return {
      name: "OpenCode",
      path: configPath,
      wrote: false,
      snippet
    };
  }
  const dir = path5.dirname(configPath);
  await fsp4.mkdir(dir, { recursive: true, mode: 448 });
  const config = await readOpenCodeConfig(configPath);
  let backupPath;
  if (fs5.existsSync(configPath)) {
    backupPath = `${configPath}.backup-${timestamp3()}`;
    await fsp4.copyFile(configPath, backupPath);
  }
  if (typeof config.mcp !== "object" || config.mcp === null || Array.isArray(config.mcp)) {
    config.mcp = {};
  }
  config.mcp[context.serverName] = entry;
  await fsp4.writeFile(configPath, `${JSON.stringify(config, null, 2)}
`);
  return {
    name: "OpenCode",
    path: configPath,
    wrote: true,
    backupPath,
    snippet
  };
}
async function readOpenCodeConfig(filePath) {
  try {
    const raw = await fsp4.readFile(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    return JSON.parse(trimmed);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
function buildOpenCodeEntry(context) {
  const entry = {
    type: "local",
    command: [context.launchCommand.command, ...context.launchCommand.args]
  };
  if (context.environment && Object.keys(context.environment).length > 0) {
    entry.environment = context.environment;
  }
  return entry;
}
function timestamp3() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
}

// src/setup/clients.ts
var CLIENT_CONFIGS = [
  {
    key: "claude-desktop",
    label: "Claude Desktop",
    buildSnippet: buildClaudeDesktopSnippet,
    applyConfig: applyClaudeDesktopConfig
  },
  {
    key: "claude-code",
    label: "Claude Code",
    buildSnippet: buildClaudeCodeSnippet,
    applyConfig: applyClaudeCodeConfig
  },
  {
    key: "cursor",
    label: "Cursor",
    buildSnippet: buildCursorSnippet,
    applyConfig: applyCursorConfig
  },
  {
    key: "opencode",
    label: "OpenCode",
    buildSnippet: buildOpenCodeSnippet,
    applyConfig: applyOpenCodeConfig
  }
];
var ALL_CLIENT_KEYS = CLIENT_CONFIGS.map((config) => config.key);
var CLIENT_CONFIG_MAP = new Map(
  CLIENT_CONFIGS.map((config) => [config.key, config])
);
var CLIENT_KEY_HELP = ALL_CLIENT_KEYS.join(", ");
function parseClientKeys(input2) {
  if (!input2) {
    return [...ALL_CLIENT_KEYS];
  }
  const trimmed = input2.trim();
  if (!trimmed || trimmed.toLowerCase() === "all") {
    return [...ALL_CLIENT_KEYS];
  }
  const tokens = trimmed.split(",").map((token) => token.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) {
    return [...ALL_CLIENT_KEYS];
  }
  const keys = [];
  for (const token of tokens) {
    if (!CLIENT_CONFIG_MAP.has(token)) {
      throw new Error(`Unknown client "${token}". Valid options: ${CLIENT_KEY_HELP}.`);
    }
    const key = token;
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}
function resolveClientConfigs(keys) {
  return keys.map((key) => {
    const config = CLIENT_CONFIG_MAP.get(key);
    if (!config) {
      throw new Error(`Unsupported client key: ${key}`);
    }
    return config;
  });
}

// src/setup/command.ts
import process5 from "node:process";
function shellQuote(value) {
  const escaped = value.replace(/'/g, () => `'\\''`);
  return `'${escaped}'`;
}
function psQuote(value) {
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}
function resolveNodeBin() {
  return process5.execPath;
}
function buildPosixLaunch(envFilePath, entryPoint, _runner, isLocalDev) {
  const envFile = shellQuote(envFilePath);
  const nodeBin = shellQuote(resolveNodeBin());
  const runCmd = isLocalDev ? `${nodeBin} ${shellQuote(entryPoint)}` : `${nodeBin} ${shellQuote(resolveNpxBin())} -y @signwell/mcp`;
  return `set -a && . ${envFile} && set +a && ${runCmd}`;
}
function buildPowerShellLaunch(envFilePath, entryPoint, _runner, isLocalDev) {
  const envFile = psQuote(envFilePath);
  const nodeBin = psQuote(resolveNodeBin());
  const scriptParts = [
    `$envFile = ${envFile}`,
    "if (Test-Path -LiteralPath $envFile) {",
    "  Get-Content -Path $envFile | ForEach-Object {",
    "    if (-not [string]::IsNullOrWhiteSpace($_) -and -not $_.Trim().StartsWith('#')) {",
    "      $pair = $_.Split('=',2)",
    "      if ($pair.Length -eq 2) {",
    "        $name = $pair[0]",
    "        $value = $pair[1]",
    "        $env:$name = $value",
    "      }",
    "    }",
    "  }",
    "}"
  ];
  const runCmd = isLocalDev ? `${nodeBin} ${psQuote(entryPoint)}` : `${nodeBin} ${psQuote(resolveNpxBin())} -y @signwell/mcp`;
  scriptParts.push(runCmd);
  return scriptParts.join("; ");
}
function resolveNpxBin() {
  const nodeDir = process5.execPath.replace(/[/\\]node([.][a-z]+)?$/i, "");
  return `${nodeDir}/npx`;
}
function buildLaunchCommand(envFilePath, entryPoint, runner, isLocalDev) {
  if (process5.platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        buildPowerShellLaunch(envFilePath, entryPoint, runner, isLocalDev)
      ]
    };
  }
  return {
    command: "/bin/sh",
    args: ["-c", buildPosixLaunch(envFilePath, entryPoint, runner, isLocalDev)]
  };
}

// src/setup/env.ts
import fsp5 from "node:fs/promises";
import os6 from "node:os";
import path6 from "node:path";
import process6 from "node:process";
async function readExistingEnv(filePath = getEnvFilePath()) {
  try {
    const raw = await fsp5.readFile(filePath, "utf8");
    return parseEnvContent(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
async function writeEnvFile(values, options = {}) {
  const filePath = options.filePathOverride ?? getEnvFilePath();
  const contents = formatEnv(values);
  if (options.printOnly) {
    return { path: filePath, contents, wroteFile: false };
  }
  const dir = path6.dirname(filePath);
  await fsp5.mkdir(dir, { recursive: true, mode: 448 });
  await fsp5.writeFile(filePath, contents, { mode: 384 });
  try {
    await fsp5.chmod(filePath, 384);
  } catch {
  }
  return { path: filePath, contents, wroteFile: true };
}
function formatEnv(values) {
  const lines = ["# SignWell MCP environment variables", `SIGNWELL_API_KEY=${values.apiKey}`];
  if (values.baseUrl && values.baseUrl !== DEFAULT_BASE_URL) {
    lines.push(`SIGNWELL_API_BASE_URL=${values.baseUrl}`);
  }
  if (values.timeoutMs && values.timeoutMs !== DEFAULT_TIMEOUT_MS) {
    lines.push(`SIGNWELL_API_TIMEOUT_MS=${values.timeoutMs}`);
  }
  return `${lines.join(os6.EOL)}${os6.EOL}`;
}
function parseEnvContent(raw) {
  const pairs = parseEnvFile(raw);
  const result = {};
  if (pairs.SIGNWELL_API_KEY) {
    result.apiKey = pairs.SIGNWELL_API_KEY;
  }
  if (pairs.SIGNWELL_API_BASE_URL) {
    result.baseUrl = pairs.SIGNWELL_API_BASE_URL;
  }
  if (pairs.SIGNWELL_API_TIMEOUT_MS) {
    const parsed = Number(pairs.SIGNWELL_API_TIMEOUT_MS);
    if (!Number.isNaN(parsed)) {
      result.timeoutMs = parsed;
    }
  }
  return result;
}
function summarizeEnvInstructions(envPath) {
  const commands = [];
  if (process6.platform === "win32") {
    commands.push(
      `PowerShell: Get-Content -Path "${envPath}" | ForEach-Object { $parts = $_.Split('='); if ($parts.Length -eq 2) { $env:$parts[0] = $parts[1] } }`
    );
  } else {
    commands.push(`Shell: set -a && source "${envPath}" && set +a`);
  }
  return commands;
}

// src/setup/manual.ts
function buildManualSnippet(context) {
  const posixCommand = buildPosixLaunch(
    context.envFilePath,
    context.entryPoint,
    context.runner,
    context.isLocalDev
  );
  const powerShellScript = buildPowerShellLaunch(
    context.envFilePath,
    context.entryPoint,
    context.runner,
    context.isLocalDev
  );
  const quotedScript = JSON.stringify(powerShellScript);
  const windowsCommand = [
    "powershell.exe",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    quotedScript
  ].join(" ");
  const snippetLines = [
    "# POSIX shells",
    posixCommand,
    "",
    "# Windows (PowerShell)",
    windowsCommand
  ].join("\n");
  const envNotes = context.environment && Object.keys(context.environment).length > 0 ? [
    "",
    "# Additional environment (set before running if needed)",
    ...Object.entries(context.environment).map(([key, value]) => `${key}=${value}`)
  ].join("\n") : "";
  return {
    name: "Manual",
    configPath: context.envFilePath,
    snippet: envNotes ? `${snippetLines}
${envNotes}` : snippetLines,
    notes: [
      "Use these commands when integrating with an MCP client that does not yet automate configuration.",
      "The env file is only readable by your user (0600) and can be sourced before launching the server."
    ]
  };
}

// src/setup/index.ts
var HELP_TEXT = `Usage:
  npx @signwell/mcp setup [options]   (installed via npm or npx)
  node build/index.js setup [options] (from a local clone)

Options:
  --print, -p          Preview without writing files
  --yes, -y            Use provided values/non-interactive defaults (requires --api-key if not stored)
  --api-key <value>    Provide the SignWell API key via CLI flag
  --base-url <value>   Override the API base URL (default ${DEFAULT_BASE_URL})
  --timeout <ms>       Set HTTP timeout override in milliseconds (default ${DEFAULT_TIMEOUT_MS}, no prompt)
  --clients <list>     Target MCP clients (claude-desktop, claude-code, cursor, opencode). Default: all
  --debug              Force SIGNWELL_DEBUG=1 in generated launch commands (otherwise inherits environment)
  --help, -h           Show this message
`;
var LOGO_LINES = [
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2557    \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557     \u2588\u2588\u2557",
  "\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D \u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u2588\u2588\u2551    \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551     \u2588\u2588\u2551",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2588\u2557\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2551 \u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551     \u2588\u2588\u2551",
  "\u255A\u2550\u2550\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2551     \u2588\u2588\u2551",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2554\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557",
  "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u255D\u255A\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
];
var SIGNWELL_API_KEY_URL = "https://www.signwell.com/app/settings/api";
async function runSetup(args, options = {}) {
  const { values } = parseArgs({
    args,
    options: {
      print: { type: "boolean", short: "p" },
      yes: { type: "boolean", short: "y" },
      help: { type: "boolean", short: "h" },
      "api-key": { type: "string" },
      "base-url": { type: "string" },
      timeout: { type: "string" },
      clients: { type: "string" },
      debug: { type: "boolean" }
    },
    allowPositionals: true
  });
  const flags = values;
  if (flags.help) {
    console.log(HELP_TEXT);
    return;
  }
  printLogo();
  await maybeOfferApiKeyPage(!flags.yes);
  const serverName = options.serverName ?? "signwell";
  const defaults = {
    baseUrl: DEFAULT_BASE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };
  const resolved = await collectEnvInputs(flags, defaults);
  const clientSelection = await resolveClientSelection(flags.clients, !flags.yes);
  const selectedClientConfigs = resolveClientConfigs(clientSelection.clientKeys);
  const envValues = toEnvValues(resolved, defaults);
  const printOnly = Boolean(flags.print);
  const envResult = await writeEnvFile(envValues, { printOnly });
  console.log(
    `[SignWell MCP] ${printOnly ? "Previewing" : "Storing"} credentials at ${envResult.path}`
  );
  if (printOnly) {
    console.log(envResult.contents.trimEnd());
  } else {
    summarizeEnvInstructions(envResult.path).forEach((line) => {
      console.log(`  - ${line}`);
    });
  }
  const entryResolution = resolveEntryPoint();
  const repositoryPath = entryResolution?.repositoryPath ?? process7.cwd();
  const runner = entryResolution?.runner ?? "node";
  const entryPoint = entryResolution?.entryPoint ?? path7.resolve(repositoryPath, "build/index.js");
  const isLocalDev = entryResolution?.isLocalDev ?? false;
  const launchEnvironment = resolveLaunchEnvironment(flags);
  if (!fs6.existsSync(entryPoint)) {
    console.warn(
      `[SignWell MCP] Build output not found at ${entryPoint}. Run "npm run build" before configuring MCP clients.`
    );
  }
  const context = {
    serverName,
    envFilePath: envResult.path,
    repositoryPath,
    entryPoint,
    runner,
    isLocalDev,
    launchCommand: buildLaunchCommand(envResult.path, entryPoint, runner, isLocalDev),
    environment: launchEnvironment
  };
  const managedSections = [];
  for (const client of selectedClientConfigs) {
    const result = await client.applyConfig(context, { printOnly });
    if (!result.wrote && !printOnly) {
      console.log(
        `[SignWell MCP] Failed to configure ${client.label}. Check permissions and try again.`
      );
    } else if (result.wrote && !printOnly) {
      console.log(`[SignWell MCP] ${client.label} configured successfully.`);
    }
    managedSections.push({ client, result });
  }
  logClientSummary(managedSections, { printOnly });
  if (clientSelection.manual) {
    printManualInstructions(context);
  }
}
async function collectEnvInputs(flags, defaults) {
  const existing = await readExistingEnv();
  const resolved = {
    apiKey: flags["api-key"] ?? existing.apiKey ?? "",
    baseUrl: flags["base-url"] ?? existing.baseUrl ?? defaults.baseUrl,
    timeoutMs: parseTimeout2(flags.timeout) ?? existing.timeoutMs ?? defaults.timeoutMs
  };
  if (flags.yes) {
    if (!resolved.apiKey) {
      throw new Error("SIGNWELL_API_KEY is required. Provide --api-key or run interactively.");
    }
    return resolved;
  }
  return promptForValues(resolved);
}
async function promptForValues(initial) {
  const rl = readline.createInterface({ input, output });
  const result = { ...initial };
  try {
    result.apiKey = await promptSecretField(rl, "SignWell API key", result.apiKey, {
      required: true
    });
  } finally {
    rl.close();
  }
  if (!result.apiKey) {
    throw new Error("SIGNWELL_API_KEY is required.");
  }
  return result;
}
async function promptSecretField(rl, label, current, options = {}) {
  while (true) {
    const masked = current ? maskSecret(current) : "";
    const defaultText = masked ? ` [${masked}]` : "";
    const hint = current ? " (press Enter to keep existing)" : options.required ? " (required)" : "";
    const promptText = `${label}${defaultText}${hint}: `;
    const answer = (await rl.question(promptText)).trim();
    if (!answer) {
      if (options.required && !current) {
        console.log("This field is required.");
        continue;
      }
      return current ?? "";
    }
    return answer;
  }
}
async function resolveClientSelection(clientsFlag, interactive) {
  if (clientsFlag) {
    if (clientsFlag.trim().toLowerCase() === "manual") {
      return { clientKeys: [], manual: true };
    }
    return { clientKeys: parseClientKeys(clientsFlag), manual: false };
  }
  if (!interactive) {
    return { clientKeys: [...ALL_CLIENT_KEYS], manual: false };
  }
  return promptClientSelection();
}
async function promptClientSelection() {
  const rl = readline.createInterface({ input, output });
  try {
    const allIndex = CLIENT_CONFIGS.length + 1;
    const manualIndex = allIndex + 1;
    console.log("\nWhich MCP client would you like to configure?");
    CLIENT_CONFIGS.forEach((client, index) => {
      console.log(`  ${index + 1}. ${client.label}`);
    });
    console.log(`  ${allIndex}. All clients (${CLIENT_KEY_HELP})`);
    console.log(`  ${manualIndex}. Manual / Other (show setup snippets only)`);
    console.log("Press Enter to configure all clients.");
    while (true) {
      const answer = (await rl.question("Enter a number selection: ")).trim();
      if (!answer) {
        return { clientKeys: [...ALL_CLIENT_KEYS], manual: false };
      }
      const selection = Number.parseInt(answer, 10);
      if (!Number.isInteger(selection) || selection < 1 || selection > manualIndex) {
        console.log(`  \u2022 "${answer}" is not a valid option. Try again.`);
        continue;
      }
      if (selection === allIndex) {
        return { clientKeys: [...ALL_CLIENT_KEYS], manual: false };
      }
      if (selection === manualIndex) {
        return { clientKeys: [], manual: true };
      }
      const client = CLIENT_CONFIGS[selection - 1];
      if (!client) {
        console.log("  \u2022 Invalid selection. Try again.");
        continue;
      }
      return { clientKeys: [client.key], manual: false };
    }
  } finally {
    rl.close();
  }
}
function logClientSummary(sections, options) {
  if (sections.length === 0) {
    return;
  }
  console.log("\n[SignWell MCP] Client configuration summary:");
  sections.forEach(({ client, result }) => {
    if (options.printOnly) {
      console.log(`  - ${client.label}: preview only (${result.path})`);
      return;
    }
    if (result.wrote) {
      const backup = result.backupPath ? ` (backup: ${result.backupPath})` : "";
      console.log(`  - ${client.label}: success \xB7 ${result.path}${backup}`);
      return;
    }
    console.log(`  - ${client.label}: failed \xB7 ${result.path}`);
  });
}
function printManualInstructions(context) {
  const section = buildManualSnippet(context);
  console.log(`
--- ${section.name} ---`);
  console.log("Manual configuration requested. Follow the instructions below.");
  console.log(`Target: ${section.configPath}`);
  for (const note of section.notes) {
    console.log(`  \u2022 ${note}`);
  }
  console.log(section.snippet);
}
function parseTimeout2(input2) {
  if (!input2) {
    return void 0;
  }
  const value = Number(input2);
  return Number.isFinite(value) && value > 0 ? value : void 0;
}
function toEnvValues(resolved, defaults) {
  return {
    apiKey: resolved.apiKey,
    baseUrl: resolved.baseUrl === defaults.baseUrl ? void 0 : resolved.baseUrl,
    timeoutMs: resolved.timeoutMs === defaults.timeoutMs ? void 0 : resolved.timeoutMs
  };
}
function printLogo() {
  console.log("\n\n\n\n");
  const margin = "     ";
  for (const line of LOGO_LINES) {
    console.log(`${margin}${line}`);
  }
  console.log("\n\n\n");
}
function resolveLaunchEnvironment(flags) {
  const env = {};
  const debugValue = flags.debug === true ? "1" : typeof process7.env.SIGNWELL_DEBUG === "string" && process7.env.SIGNWELL_DEBUG.length > 0 ? process7.env.SIGNWELL_DEBUG : void 0;
  if (debugValue) {
    env.SIGNWELL_DEBUG = debugValue;
  }
  return Object.keys(env).length > 0 ? env : void 0;
}
async function maybeOfferApiKeyPage(interactive) {
  if (!interactive) {
    return;
  }
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question("Open the SignWell API key page in your browser now? [y/N]: ")).trim().toLowerCase();
    if (answer === "y" || answer === "yes") {
      console.log("Launching https://www.signwell.com/app/settings/api ...");
      try {
        await openBrowser(SIGNWELL_API_KEY_URL);
        console.log("Browser launched. Copy your API key, then return here to continue.");
      } catch (error) {
        console.error(
          "Failed to open the browser automatically:",
          error instanceof Error ? error.message : error
        );
      }
    }
  } finally {
    rl.close();
  }
}
function openBrowser(url) {
  const platform = process7.platform;
  let command;
  let args;
  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0 || platform === "win32") {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
      }
    });
  });
}
function resolveEntryPoint() {
  const localSource = resolveLocalSourceEntry();
  if (localSource) {
    return localSource;
  }
  const localBuild = resolveLocalBuildEntry();
  if (localBuild) {
    return localBuild;
  }
  return resolveRuntimeEntryPoint();
}
function resolveLocalSourceEntry() {
  const cwd = process7.cwd();
  const entryPath = path7.resolve(cwd, "src", "index.ts");
  if (!fs6.existsSync(entryPath)) {
    return void 0;
  }
  return {
    entryPoint: path7.resolve(path7.dirname(entryPath), "..", "build", "index.js"),
    repositoryPath: inferRepositoryPath(entryPath),
    runner: "node",
    isLocalDev: true
  };
}
function resolveLocalBuildEntry() {
  const cwd = process7.cwd();
  const entryPath = path7.resolve(cwd, "build", "index.js");
  if (!fs6.existsSync(entryPath)) {
    return void 0;
  }
  return {
    entryPoint: entryPath,
    repositoryPath: inferRepositoryPath(entryPath),
    runner: "node",
    isLocalDev: true
  };
}
function resolveRuntimeEntryPoint() {
  const candidates = [];
  if (process7.argv[1]) {
    candidates.push(process7.argv[1]);
  }
  try {
    candidates.push(fileURLToPath(import.meta.url));
  } catch {
  }
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      const resolved = fs6.realpathSync(candidate);
      if (!fs6.existsSync(resolved)) {
        continue;
      }
      return {
        entryPoint: resolved,
        repositoryPath: inferRepositoryPath(resolved),
        runner: "node",
        isLocalDev: false
      };
    } catch {
    }
  }
  return void 0;
}
function inferRepositoryPath(entryPointPath) {
  let current = path7.dirname(entryPointPath);
  const visited = /* @__PURE__ */ new Set();
  while (!visited.has(current)) {
    const packageJsonPath = path7.join(current, "package.json");
    if (fs6.existsSync(packageJsonPath)) {
      return current;
    }
    visited.add(current);
    const parent = path7.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return path7.dirname(entryPointPath);
}
function maskSecret(value) {
  if (value.length <= 4) {
    return "*".repeat(value.length);
  }
  if (value.length <= 8) {
    return `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;
  }
  return `${value.slice(0, 4)}\u2026${value.slice(-4)}`;
}

// src/signwell/errors.ts
var SignWellError = class extends Error {
  type;
  status;
  requestId;
  details;
  constructor(options) {
    super(options.message);
    this.name = "SignWellError";
    this.type = options.type;
    this.status = options.status;
    this.requestId = options.requestId ?? void 0;
    this.details = options.details;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
};
var REQUEST_ID_HEADERS = ["x-request-id", "request-id"];
async function mapHttpError(response) {
  const { message, details } = await extractErrorDetails(response);
  return new SignWellError({
    message,
    type: mapStatusToType(response.status),
    status: response.status,
    requestId: extractRequestId(response),
    details
  });
}
function normalizeFetchError(error) {
  if (error instanceof SignWellError) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new SignWellError({
      message: "Request aborted (timeout or cancellation).",
      type: "network",
      cause: error
    });
  }
  return new SignWellError({
    message: "Network error while calling SignWell.",
    type: "network",
    cause: error
  });
}
function extractRequestId(response) {
  for (const header of REQUEST_ID_HEADERS) {
    const value = response.headers.get(header);
    if (value) {
      return value;
    }
  }
  return void 0;
}
async function extractErrorDetails(response) {
  const fallback = `SignWell API request failed with status ${response.status}`;
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = await response.json();
      const derivedMessage = pickErrorMessage(body) ?? fallback;
      return { message: derivedMessage, details: body };
    }
    const text = await response.text();
    if (text.trim().length === 0) {
      return { message: fallback };
    }
    return { message: text.trim() };
  } catch (error) {
    return { message: fallback, details: error };
  }
}
function pickErrorMessage(body) {
  if (typeof body.message === "string" && body.message.trim().length > 0) {
    return body.message;
  }
  if (typeof body.error === "string" && body.error.trim().length > 0) {
    return body.error;
  }
  return void 0;
}
function mapStatusToType(status) {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 422) {
    return "validation";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status >= 500) {
    return "server";
  }
  if (status >= 400) {
    return "unknown";
  }
  return "unknown";
}

// src/signwell/client.ts
var DEFAULT_TIMEOUT_MS2 = 6e4;
var MAX_RETRIES = 3;
var RETRYABLE_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS", "DELETE"]);
var SignWellClient = class {
  apiKey;
  baseUrl;
  userAgent;
  timeoutMs;
  fetchImpl;
  constructor(options) {
    if (!options.apiKey) {
      throw new Error("SignWellClient requires an apiKey.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = new URL(`${options.baseUrl.replace(/\/+$/, "")}/`);
    this.userAgent = options.userAgent;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS2;
    this.fetchImpl = options.fetchImplementation ?? fetch;
  }
  async get(path10, options = {}) {
    return this.request({ ...options, path: path10, method: "GET" });
  }
  async post(path10, body, options = {}) {
    return this.request({ ...options, path: path10, method: "POST", body });
  }
  async put(path10, body, options = {}) {
    return this.request({ ...options, path: path10, method: "PUT", body });
  }
  async delete(path10, options = {}) {
    return this.request({ ...options, path: path10, method: "DELETE" });
  }
  async request(options) {
    const response = await this.performRequest(options);
    return await this.parseResponse(response);
  }
  async requestBuffer(options) {
    const response = await this.performRequest(options);
    return response.arrayBuffer();
  }
  buildUrl(path10, query) {
    const cleanPath = path10.replace(/^\//, "");
    const url = new URL(cleanPath, this.baseUrl);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === void 0 || value === null) {
          return;
        }
        url.searchParams.append(key, String(value));
      });
    }
    return url.toString();
  }
  buildHeaders(hasBody, extra) {
    const headers = new Headers({
      "X-Api-Key": this.apiKey,
      Accept: "application/json",
      "User-Agent": this.userAgent
    });
    if (hasBody) {
      headers.set("Content-Type", "application/json");
    }
    if (extra) {
      Object.entries(extra).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }
    return headers;
  }
  async parseResponse(response) {
    if (response.status === 204) {
      return void 0;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    const text = await response.text();
    return text;
  }
  async performRequest(options) {
    const url = this.buildUrl(options.path, options.query);
    const headers = this.buildHeaders(options.body !== void 0, options.headers);
    const body = options.body !== void 0 ? JSON.stringify(options.body) : void 0;
    const method = options.method;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const idempotent = options.idempotent ?? (RETRYABLE_METHODS.has(method) && body === void 0);
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          method,
          headers,
          body,
          signal: controller.signal
        });
        if (response.ok) {
          clearTimeout(timeout);
          return response;
        }
        const error = await mapHttpError(response);
        if (attempt < MAX_RETRIES && idempotent && shouldRetry(response.status)) {
          clearTimeout(timeout);
          await wait(getBackoffDelay(attempt));
          lastError = error;
          continue;
        }
        throw error;
      } catch (error) {
        clearTimeout(timeout);
        lastError = normalizeFetchError(error);
        if (attempt >= MAX_RETRIES || !idempotent) {
          throw lastError;
        }
        await wait(getBackoffDelay(attempt));
      }
    }
    throw lastError ?? new SignWellError({ message: "Unknown error", type: "unknown" });
  }
};
function shouldRetry(status) {
  if (status === 429) {
    return true;
  }
  return status >= 500 && status < 600;
}
function getBackoffDelay(attempt) {
  const base = 200 * 2 ** (attempt - 1);
  const jitter = Math.random() * 100;
  return base + jitter;
}
async function wait(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// src/tools/documents.ts
import { Buffer as Buffer2 } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { ReadResourceResultSchema as ReadResourceResultSchema2 } from "@modelcontextprotocol/sdk/types.js";
import { z as z3 } from "zod";

// src/utils/docx-generator.ts
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
function parseMarkdown(text) {
  const lines = text.split("\n");
  const tokens = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") {
      i++;
      continue;
    }
    if (/^[-*_]{3,}$/.test(trimmed)) {
      tokens.push({ type: "horizontal_rule", content: "" });
      i++;
      continue;
    }
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      tokens.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2]
      });
      i++;
      continue;
    }
    if (trimmed.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      tokens.push({
        type: "code",
        content: codeLines.join("\n")
      });
      i++;
      continue;
    }
    if (trimmed.startsWith(">")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().slice(1).trim());
        i++;
      }
      tokens.push({
        type: "blockquote",
        content: quoteLines.join(" ")
      });
      continue;
    }
    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const isOrdered = !!orderedMatch;
      const items = [];
      while (i < lines.length) {
        const currentLine = lines[i];
        const currentTrimmed = currentLine.trim();
        const uMatch = currentTrimmed.match(/^[-*+]\s+(.+)$/);
        const oMatch = currentTrimmed.match(/^\d+\.\s+(.+)$/);
        if (isOrdered && oMatch || !isOrdered && uMatch) {
          items.push(isOrdered ? oMatch?.[1] ?? "" : uMatch?.[1] ?? "");
          i++;
        } else if (currentTrimmed === "" || currentTrimmed.startsWith("- ") || currentTrimmed.startsWith("* ") || /^\d+\./.test(currentTrimmed)) {
          break;
        } else {
          items[items.length - 1] += ` ${currentTrimmed}`;
          i++;
        }
      }
      tokens.push({
        type: "list",
        items,
        ordered: isOrdered,
        content: ""
      });
      continue;
    }
    const paraLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].trim().startsWith("#") && !lines[i].trim().startsWith(">") && !lines[i].trim().startsWith("- ") && !lines[i].trim().startsWith("* ") && !/^\d+\./.test(lines[i].trim()) && !lines[i].trim().startsWith("```")) {
      paraLines.push(lines[i]);
      i++;
    }
    tokens.push({
      type: "paragraph",
      content: paraLines.join(" ")
    });
  }
  return tokens;
}
var SIGNWELL_TAG_REGEX = /\{\{[^{}]+\}\}/g;
function splitBySignwellTags(text) {
  const segments = [];
  let lastIndex = 0;
  for (const match of text.matchAll(SIGNWELL_TAG_REGEX)) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        isSignwellTag: false
      });
    }
    segments.push({
      text: match[0],
      isSignwellTag: true
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isSignwellTag: false
    });
  }
  return segments;
}
function parseInlineFormatting(text) {
  const runs = [];
  const segments = splitBySignwellTags(text);
  for (const segment of segments) {
    if (segment.isSignwellTag) {
      runs.push(
        new TextRun({
          text: segment.text,
          color: "FFFFFF"
        })
      );
    } else {
      runs.push(...parseInlineFormattingForSegment(segment.text));
    }
  }
  return runs;
}
function parseInlineFormattingForSegment(text) {
  const runs = [];
  const remaining = text;
  let currentText = "";
  let isBold = false;
  let isItalic = false;
  const flushCurrent = () => {
    if (currentText) {
      runs.push(
        new TextRun({
          text: currentText,
          bold: isBold,
          italics: isItalic
        })
      );
      currentText = "";
    }
  };
  let i = 0;
  while (i < remaining.length) {
    const char = remaining[i];
    const nextChar = remaining[i + 1];
    if (char === "*" && nextChar === "*") {
      flushCurrent();
      isBold = !isBold;
      i += 2;
      continue;
    }
    if (char === "_" && nextChar === "_") {
      flushCurrent();
      isBold = !isBold;
      i += 2;
      continue;
    }
    if (char === "*" && nextChar !== "*") {
      flushCurrent();
      isItalic = !isItalic;
      i += 1;
      continue;
    }
    if (char === "_" && nextChar !== "_") {
      flushCurrent();
      isItalic = !isItalic;
      i += 1;
      continue;
    }
    if (char === "`") {
      flushCurrent();
      let code = "";
      i++;
      while (i < remaining.length && remaining[i] !== "`") {
        code += remaining[i];
        i++;
      }
      if (i < remaining.length) i++;
      runs.push(
        new TextRun({
          text: code,
          font: "Courier New",
          italics: true
        })
      );
      continue;
    }
    currentText += char;
    i++;
  }
  flushCurrent();
  return runs;
}
async function textToDocx(text) {
  const tokens = parseMarkdown(text);
  const paragraphs = [];
  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const level = token.level || 1;
        paragraphs.push(
          new Paragraph({
            children: parseInlineFormatting(token.content),
            heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : level === 3 ? HeadingLevel.HEADING_3 : level === 4 ? HeadingLevel.HEADING_4 : level === 5 ? HeadingLevel.HEADING_5 : HeadingLevel.HEADING_6,
            spacing: { after: 200 }
          })
        );
        break;
      }
      case "paragraph": {
        paragraphs.push(
          new Paragraph({
            children: parseInlineFormatting(token.content),
            spacing: { after: 120 }
          })
        );
        break;
      }
      case "list": {
        if (token.items) {
          for (const item of token.items) {
            paragraphs.push(
              new Paragraph({
                children: parseInlineFormatting(item),
                bullet: {
                  level: 0
                },
                spacing: { after: 80 }
              })
            );
          }
        }
        break;
      }
      case "blockquote": {
        paragraphs.push(
          new Paragraph({
            children: parseInlineFormatting(token.content),
            indent: { left: 720 },
            spacing: { after: 120 }
          })
        );
        break;
      }
      case "code": {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: token.content,
                font: "Courier New",
                size: 20
              })
            ],
            spacing: { after: 120 }
          })
        );
        break;
      }
      case "horizontal_rule": {
        paragraphs.push(
          new Paragraph({
            border: {
              bottom: {
                color: "999999",
                space: 1,
                style: "single",
                size: 6
              }
            },
            spacing: { before: 200, after: 200 }
          })
        );
        break;
      }
    }
  }
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  });
  return Packer.toBuffer(doc);
}

// src/utils/responses.ts
function render(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ],
    ...payload.ok ? {} : { isError: true }
  };
}
function successResponse(params) {
  return render({
    ok: true,
    type: params.type,
    message: params.message,
    data: params.data,
    warnings: params.warnings
  });
}
function errorResponse(params) {
  return render({
    ok: false,
    type: params.type ?? "unknown",
    message: params.message,
    error: params.error,
    data: params.data
  });
}
function validationError(message, details) {
  return errorResponse({
    type: "validation",
    message,
    error: details
  });
}

// src/tools/files.ts
import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs7 from "node:fs/promises";
import os7 from "node:os";
import path8 from "node:path";
import process8 from "node:process";
import { promisify } from "node:util";
import { ReadResourceResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { z as z2 } from "zod";
var execAsync = promisify(exec);
var TEST_FILE_PICKER_PATH_ENV = "SIGNWELL_MCP_TEST_PICKER_PATH";
var MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
var FILE_TTL_MS = 60 * 60 * 1e3;
var selectFileSchema = z2.object({
  resource_uri: z2.string().optional(),
  file_url: z2.string().url().optional(),
  file_path: z2.string().optional(),
  name: z2.string().optional()
});
var storedFiles = /* @__PURE__ */ new Map();
function registerFileTools(server) {
  server.registerTool(
    "file_store",
    {
      description: `Store a user's existing file for upcoming SignWell requests. Returns a file_token you can pass to document/template tools.

IMPORTANT: This tool is for the USER'S EXISTING FILES only. Do NOT read, parse, or convert the file \u2014 upload it as-is.

HOW TO PROVIDE THE FILE (in order of preference):
1. No arguments \u2014 Opens a native OS file picker dialog. USE THIS BY DEFAULT. Simply call file_store with no arguments and the user will select the file themselves.
2. file_path \u2014 Only if the user explicitly provides a local path on their computer (e.g. ~/Documents/contract.docx).
3. file_url \u2014 A publicly accessible URL to the file.

CHAT ATTACHMENTS: When a user uploads/attaches a file in the chat, DO NOT use resource_uri \u2014 those are sandboxed and inaccessible. Instead, call file_store with NO arguments to open the native file picker.

CLAUDE-GENERATED FILES: If YOU created the file content (e.g. generated a PDF), do NOT use file_store. Pass file_base64 directly to document_create instead.`,
      inputSchema: selectFileSchema,
      annotations: { readOnlyHint: false, destructiveHint: false }
    },
    async (input2, extra) => handleFileStore(input2, extra)
  );
  return 1;
}
async function fetchResourceAsBase64(resourceUri, extra) {
  if (!extra?.sendRequest) {
    throw new Error("Resource handling is unavailable in this transport.");
  }
  const result = await extra.sendRequest(
    {
      method: "resources/read",
      params: { uri: resourceUri }
    },
    ReadResourceResultSchema
  );
  const content = result.contents?.[0];
  if (!content) {
    throw new Error(`Resource ${resourceUri} did not include any contents.`);
  }
  if ("blob" in content && content.blob) {
    return content.blob;
  }
  if ("text" in content && content.text) {
    return Buffer.from(content.text, "utf8").toString("base64");
  }
  throw new Error(`Resource ${resourceUri} must include blob or text content.`);
}
function getStoredFile(token) {
  cleanupExpiredFiles();
  return storedFiles.get(token);
}
async function handleFileStore(input2, extra) {
  try {
    const fileData = await loadFileData(input2, extra);
    const token = randomUUID();
    storedFiles.set(token, { ...fileData, createdAt: Date.now() });
    cleanupExpiredFiles();
    return successResponse({
      type: "file_store",
      message: `Stored ${fileData.name}`,
      data: {
        file_token: token,
        name: fileData.name,
        size_bytes: fileData.size_bytes,
        expires_in_seconds: Math.floor(FILE_TTL_MS / 1e3)
      }
    });
  } catch (error) {
    return errorResponse({
      type: "validation",
      message: error instanceof Error ? error.message : "Unable to store file.",
      error
    });
  }
}
async function loadFileData(input2, extra) {
  if (input2.resource_uri) {
    const base64 = await fetchResourceAsBase64(input2.resource_uri, extra);
    const name = input2.name ?? guessNameFromUri(input2.resource_uri) ?? "attachment.pdf";
    return { name, file_base64: base64, size_bytes: Buffer.from(base64, "base64").byteLength };
  }
  if (input2.file_url) {
    const response = await fetch(input2.file_url);
    if (!response.ok) {
      throw new Error(`Unable to fetch file_url (${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    enforceSizeLimit(arrayBuffer.byteLength);
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const name = input2.name ?? guessNameFromUri(input2.file_url) ?? "attachment.pdf";
    return { name, file_base64: base64, size_bytes: arrayBuffer.byteLength };
  }
  if (input2.file_path) {
    return readLocalFile(input2.file_path, input2.name);
  }
  const picked = await pickFileUsingNativeDialog(input2.name);
  return picked;
}
function enforceSizeLimit(size) {
  if (size > MAX_FILE_SIZE_BYTES) {
    const mb = (size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `File is ${mb}MB, exceeding the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.`
    );
  }
}
function guessNameFromUri(uri) {
  try {
    const parsed = new URL(uri);
    const base = path8.basename(parsed.pathname);
    return base || null;
  } catch {
    const trimmed = uri.split("/").pop();
    return trimmed || null;
  }
}
async function openNativeFilePicker() {
  const testPath = process8.env[TEST_FILE_PICKER_PATH_ENV];
  if (testPath && testPath.length > 0) {
    return testPath;
  }
  const platform = os7.platform();
  if (platform === "darwin") {
    const script = [
      'set theFile to choose file with prompt "Select a document to send for signature" of type {"pdf", "doc", "docx", "png", "jpg", "jpeg"}',
      "POSIX path of theFile"
    ];
    const { stdout } = await execAsync(`osascript -e '${script[0]}' -e '${script[1]}'`, {
      timeout: 12e4
    });
    return stdout.trim() || null;
  }
  if (platform === "win32") {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "Documents (*.pdf;*.doc;*.docx;*.png;*.jpg)|*.pdf;*.doc;*.docx;*.png;*.jpg;*.jpeg|All files (*.*)|*.*"
$dialog.Title = "Select a document to send for signature"
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.FileName
}
`.trim();
    const { stdout } = await execAsync(
      `powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, " ")}"`,
      {
        timeout: 12e4
      }
    );
    return stdout.trim() || null;
  }
  try {
    const { stdout } = await execAsync(
      'zenity --file-selection --title="Select a document to send for signature" --file-filter="Documents | *.pdf *.doc *.docx *.png *.jpg *.jpeg"',
      { timeout: 12e4 }
    );
    return stdout.trim() || null;
  } catch {
    const { stdout } = await execAsync(
      'kdialog --getopenfilename ~ "*.pdf *.doc *.docx *.png *.jpg *.jpeg | Documents"',
      { timeout: 12e4 }
    );
    return stdout.trim() || null;
  }
}
function cleanupExpiredFiles() {
  const now = Date.now();
  for (const [token, file] of storedFiles.entries()) {
    if (now - file.createdAt > FILE_TTL_MS) {
      storedFiles.delete(token);
    }
  }
}
var SANDBOX_PATH_PATTERNS = ["/home/claude", "/mnt/user-data", "/tmp/claude"];
function isSandboxPath(filePath) {
  return SANDBOX_PATH_PATTERNS.some((p) => filePath.startsWith(p));
}
async function readLocalFile(filePath, nameOverride) {
  try {
    const stats = await fs7.stat(filePath);
    enforceSizeLimit(stats.size);
    const buffer = await fs7.readFile(filePath);
    return {
      name: nameOverride ?? path8.basename(filePath),
      file_base64: buffer.toString("base64"),
      size_bytes: buffer.byteLength
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT" && isSandboxPath(filePath)) {
      throw new Error(
        `The path "${filePath}" is inside the Claude sandbox and is not accessible to the MCP server. If you generated this file, pass its content as file_base64 directly to document_create instead of using file_store. If this is a user's existing file, call file_store with no arguments to open the native file picker.`
      );
    }
    throw error;
  }
}
async function pickFileUsingNativeDialog(nameOverride) {
  const filePath = await openNativeFilePicker();
  if (!filePath) {
    throw new Error("File selection cancelled.");
  }
  return readLocalFile(filePath, nameOverride);
}

// src/tools/documents.ts
var recipientSchema = z3.object({
  id: z3.string().min(1, { message: "Recipient id is required (e.g. '1')." }),
  email: z3.string().email({ message: "Recipient email must be valid." }),
  first_name: z3.string().optional(),
  last_name: z3.string().optional(),
  role: z3.string().optional()
});
var fileSchema = z3.object({
  name: z3.string().min(1, { message: "File name is required." }),
  file_token: z3.string().optional().describe(
    "Token from file_store (recommended). Use file_store first, then pass the token here."
  ),
  file_url: z3.string().url().optional(),
  file_base64: z3.string().optional(),
  resource_uri: z3.string().optional(),
  content_text: z3.string().optional().describe(
    "Plain text or Markdown content to convert to DOCX. When provided, the MCP server generates a DOCX file automatically. Use this instead of file_base64 to avoid UI freezing with large documents."
  )
});
var copiedContactSchema = z3.object({
  email: z3.string().email({ message: "Copied contact email must be valid." }),
  name: z3.string().optional().describe("Name of the CC recipient.")
});
var createDocumentSchema = z3.object({
  name: z3.string().min(1, { message: "Document name is required." }),
  recipients: z3.array(recipientSchema).min(1, { message: "At least one recipient is required." }),
  files: z3.array(fileSchema).min(1, { message: "Include at least one file." }),
  subject: z3.string().optional().describe("Email subject line recipients will see."),
  message: z3.string().optional().describe("Email message recipients will see."),
  text_tags: z3.boolean().optional(),
  draft: z3.boolean().optional().describe("If true, document is created as a draft and not sent. Default: false."),
  apply_signing_order: z3.boolean().default(false).optional().describe(
    "When true, recipients sign one at a time in the order of the recipients array."
  ),
  copied_contacts: z3.array(copiedContactSchema).optional().describe("CC recipients who receive the final signed document by email."),
  expires_in: z3.number().int().min(1).max(365).optional().describe("Days before the signature request expires (max 365)."),
  reminders: z3.boolean().default(true).optional().describe("Send signing reminders on day 3, 6, and 10."),
  allow_decline: z3.boolean().default(true).optional().describe("Allow recipients to decline signing."),
  allow_reassign: z3.boolean().default(true).optional().describe("Allow recipients to reassign to someone else."),
  redirect_url: z3.string().url().optional().describe("URL to redirect after successful signing."),
  decline_redirect_url: z3.string().url().optional().describe("URL to redirect if document is declined."),
  metadata: z3.record(z3.string(), z3.string()).optional().describe("Key-value metadata (max 50 pairs, key max 40 chars, value max 500 chars)."),
  embedded_signing: z3.boolean().default(false).optional().describe("Enable embedded signing."),
  embedded_signing_notifications: z3.boolean().default(false).optional().describe("Send completion notifications when using embedded signing."),
  custom_requester_name: z3.string().optional().describe("Custom requester name on communications."),
  custom_requester_email: z3.string().email().optional().describe("Custom requester email on communications.")
});
var listDocumentsSchema = z3.object({
  status: z3.string().min(1).optional(),
  search: z3.string().min(1).optional(),
  archived: z3.boolean().optional(),
  page: z3.number().int().min(1).default(1),
  per_page: z3.number().int().min(1).max(100).default(25),
  updated_after: z3.string().min(1).optional(),
  updated_before: z3.string().min(1).optional()
});
var documentIdSchema = z3.string().min(1, { message: "document_id is required." });
var getDocumentSchema = z3.object({
  document_id: documentIdSchema
});
var sendDraftSchema = z3.object({
  document_id: documentIdSchema,
  confirm_send: z3.boolean().default(false),
  message: z3.string().optional()
});
var reminderSchema = z3.object({
  document_id: documentIdSchema,
  recipient_email: z3.string().email().optional(),
  message: z3.string().optional()
});
var completedPdfSchema = z3.object({
  document_id: documentIdSchema,
  mode: z3.enum(["url", "base64", "file"]).default("url"),
  save_to_path: z3.string().optional(),
  include_audit_page: z3.boolean().default(true),
  file_format: z3.enum(["pdf", "zip"]).default("pdf")
});
var ALLOWED_FILE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".pages",
  ".ppt",
  ".pptx",
  ".key",
  ".xls",
  ".xlsx",
  ".numbers",
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
  ".tif",
  ".webp"
]);
function extractExtension(filename) {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}
function validateFileExtension(name, fileUrl) {
  const ext = extractExtension(name);
  if (!ext) {
    return `File "${name}" is missing a file extension. Supported types: ${[...ALLOWED_FILE_EXTENSIONS].join(", ")}`;
  }
  if (!ALLOWED_FILE_EXTENSIONS.has(ext)) {
    return `File "${name}" has unsupported extension "${ext}". Supported types: ${[...ALLOWED_FILE_EXTENSIONS].join(", ")}`;
  }
  if (fileUrl) {
    const urlExt = extractExtension(new URL(fileUrl).pathname);
    if (urlExt && !ALLOWED_FILE_EXTENSIONS.has(urlExt)) {
      return `File URL for "${name}" points to unsupported type "${urlExt}". Supported types: ${[...ALLOWED_FILE_EXTENSIONS].join(", ")}`;
    }
  }
  return void 0;
}
var COMPLETED_PDF_WARNING_THRESHOLD_BYTES = 5 * 1024 * 1024;
function deriveEditorUrl(data) {
  const id = data.id;
  if (typeof id === "string" && id.length > 0) {
    return `https://www.signwell.com/app/builder/${id}`;
  }
  return void 0;
}
function attachEditorLink(data) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data;
    const editorUrl = deriveEditorUrl(record);
    if (editorUrl) {
      return {
        payload: { ...record, editor_url: editorUrl },
        editorUrl
      };
    }
    return { payload: record };
  }
  return { payload: data };
}
function registerDocumentTools(server, client) {
  let count = 0;
  const register = (name, description, schema, handler, annotations) => {
    const toolHandler = (async (input2, extra) => {
      const validated = schema.parse(input2);
      return handler(validated, extra);
    });
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema,
        annotations
      },
      toolHandler
    );
    count += 1;
  };
  register(
    "document_create",
    `Create a SignWell document (always created as a draft).

CRITICAL RULES:
- Do NOT read, parse, extract, or verify file contents before uploading. The user already knows what is in the file.
- Do NOT convert files between formats (e.g. do NOT convert .docx to .pdf). SignWell handles conversion automatically.
- The user will place signature fields in the SignWell editor. Just upload the file and return the editor link.

SUPPORTED FILE TYPES: .pdf, .doc, .docx, .pages, .ppt, .pptx, .key, .xls, .xlsx, .numbers, .jpg, .jpeg, .png, .tiff, .tif, .webp

WORKFLOW FOR USER'S EXISTING FILES:
1. file_store (call with NO arguments to open native file picker) \u2192 returns file_token
2. document_create (pass file_token in files array) \u2192 creates draft, returns editor_url

WORKFLOW FOR CLAUDE-GENERATED FILES:
1. document_create with content_text directly (RECOMMENDED) \u2192 MCP server converts to DOCX automatically
   Pass plain text or Markdown as content_text. The server generates a DOCX file without base64 overhead.
   
2. document_create with file_base64 directly (skip file_store) \u2192 creates draft, returns editor_url
   Do NOT write the file to disk and pass a file_path \u2014 sandbox paths are inaccessible. Use file_base64.
   
   Example using content_text:
   {
     "name": "Service Agreement",
     "recipients": [{"id": "1", "email": "client@example.com"}],
     "files": [{"name": "agreement.docx", "content_text": "# Service Agreement\\n\\nThis agreement between..."}]
   }

FILE ACCESS: Chat attachments and sandbox paths (/home/claude, /mnt/user-data) are inaccessible to the MCP server. Do NOT use resource_uri or sandbox file_path values. For existing files, call file_store with no arguments to open the native file picker.

REQUIRED PARAMETERS:
1. name: Document name
2. recipients: Array with at least one object containing "id" and "email"
3. files: Array with at least one file object containing:
   - "name": Filename (e.g., "contract.docx")
   - One content source (in order of preference):
     * "content_text": Plain text or Markdown to auto-convert to DOCX (RECOMMENDED for Claude-generated content)
     * "file_token": Token from file_store (recommended for user files)
     * "file_url": Public URL to the file
     * "file_base64": Base64-encoded file content
     * "resource_uri": MCP resource URI

EXAMPLE (docx via file_token \u2014 most common):
{
  "name": "NDA Agreement",
  "recipients": [{"id": "1", "email": "signer@example.com"}],
  "files": [{"name": "nda.docx", "file_token": "<token from file_store>"}]
}

EXAMPLE (pdf with text tags):
{
  "name": "Contract",
  "text_tags": true,
  "recipients": [{"id": "1", "email": "signer@example.com"}],
  "files": [{"name": "contract.pdf", "file_token": "<token from file_store>"}]
}

TEXT TAGS (optional): Set text_tags: true only if the document already contains signature placeholders like {{signature:1:y}}.
The recipient "id" MUST match the number in text tags (id:"1" matches {{signature:1:y}}).`,
    createDocumentSchema,
    (input2, extra) => handleCreateDocument(client, input2, extra),
    { readOnlyHint: false, destructiveHint: false }
  );
  register(
    "document_list",
    "List SignWell documents with optional filtering (status, archived, search).",
    listDocumentsSchema,
    (input2, extra) => handleListDocuments(client, input2, extra),
    { readOnlyHint: true }
  );
  register(
    "document_get",
    "Fetch the latest status for a SignWell document.",
    getDocumentSchema,
    (input2, extra) => handleGetDocument(client, input2, extra),
    { readOnlyHint: true }
  );
  register(
    "document_send_draft",
    "Send a previously created draft document (requires confirm_send).",
    sendDraftSchema,
    (input2, extra) => handleSendDraft(client, input2, extra),
    { readOnlyHint: false, destructiveHint: false }
  );
  register(
    "document_send_reminder",
    "Send a reminder email for a document (optionally to a specific recipient).",
    reminderSchema,
    (input2, extra) => handleSendReminder(client, input2, extra),
    { readOnlyHint: false, destructiveHint: false }
  );
  register(
    "document_completed_pdf",
    "Fetch the completed PDF. Use mode: 'base64' to get content for displaying in an artifact or chat (embed as data:application/pdf;base64,{pdf_base64}). Default 'url' mode returns a shareable link.",
    completedPdfSchema,
    (input2, extra) => handleCompletedPdf(client, input2, extra),
    { readOnlyHint: false, destructiveHint: false }
  );
  registerDocumentPrompt(server, client);
  return count;
}
async function handleCreateDocument(client, input2, extra) {
  for (const file of input2.files) {
    if (!file.file_token && !file.file_url && !file.file_base64 && !file.resource_uri && !file.content_text) {
      return errorResponse({
        type: "validation",
        message: `File "${file.name}" must have one of: content_text, file_token, file_url, file_base64, or resource_uri`
      });
    }
    const extError = validateFileExtension(file.name, file.file_url);
    if (extError) {
      return errorResponse({ type: "validation", message: extError });
    }
  }
  try {
    const files = await resolveFileInputs(input2.files, extra);
    const payload = {
      ...input2,
      files,
      draft: true
    };
    const data = await client.post("/documents", payload);
    const { payload: responsePayload, editorUrl } = attachEditorLink(data);
    return successResponse({
      type: "document_create",
      message: editorUrl ? "Document draft created. Use the SignWell editor link to position or update fields." : "Document draft created.",
      data: responsePayload,
      warnings: editorUrl ? [
        "Assistant: share the editor_url so the user can add or adjust fields directly in SignWell. Do not promise to place fields manually within this chat."
      ] : void 0
    });
  } catch (error) {
    return toToolError(error, "Unable to create the document.");
  }
}
async function handleListDocuments(client, input2, _extra) {
  try {
    const query = {
      page: input2.page,
      per_page: input2.per_page
    };
    if (input2.status) {
      query.status = input2.status;
    }
    if (input2.search) {
      query.search = input2.search;
    }
    if (typeof input2.archived === "boolean") {
      query.archived = input2.archived;
    }
    if (input2.updated_after) {
      query.updated_after = input2.updated_after;
    }
    if (input2.updated_before) {
      query.updated_before = input2.updated_before;
    }
    const data = await client.get("/documents", { query });
    return successResponse({
      type: "document_list",
      message: "Fetched documents.",
      data
    });
  } catch (error) {
    return toToolError(error, "Unable to list documents.");
  }
}
async function handleGetDocument(client, input2, _extra) {
  try {
    const data = await client.get(`/documents/${input2.document_id}`);
    return successResponse({
      type: "document_get",
      message: "Fetched document status.",
      data
    });
  } catch (error) {
    return toToolError(error, "Unable to fetch the document.");
  }
}
async function handleSendDraft(client, input2, _extra) {
  if (!input2.confirm_send) {
    return validationError("Set confirm_send to true to send this draft.");
  }
  try {
    const payload = {
      message: input2.message
    };
    const data = await client.post(`/documents/${input2.document_id}/send`, payload);
    return successResponse({
      type: "document_send_draft",
      message: "Draft sent for signing.",
      data
    });
  } catch (error) {
    return toToolError(error, "Unable to send the draft.");
  }
}
async function handleSendReminder(client, input2, _extra) {
  try {
    const payload = input2.recipient_email || input2.message ? {
      recipient_email: input2.recipient_email,
      message: input2.message
    } : {};
    const data = await client.post(`/documents/${input2.document_id}/remind`, payload);
    return successResponse({
      type: "document_send_reminder",
      message: input2.recipient_email ? `Reminder sent to ${input2.recipient_email}.` : "Reminder sent to all pending recipients.",
      data
    });
  } catch (error) {
    return toToolError(error, "Unable to send the reminder.");
  }
}
async function handleCompletedPdf(client, input2, _extra) {
  try {
    const effectiveMode = input2.save_to_path ? "file" : input2.mode;
    const query = {
      url_only: effectiveMode === "url",
      audit_page: input2.include_audit_page,
      file_format: input2.file_format
    };
    if (effectiveMode === "url") {
      const data = await client.get(
        `/documents/${input2.document_id}/completed_pdf`,
        { query }
      );
      const fileUrl = data?.file_url;
      if (!fileUrl) {
        return errorResponse({
          type: "server",
          message: "SignWell did not return a file_url for this document."
        });
      }
      return successResponse({
        type: "document_completed_pdf",
        message: "Completed PDF ready. Share this direct download link with the user - they can open it in their browser to view or download the signed document.",
        data: { pdf_url: fileUrl }
      });
    }
    const buffer = await client.requestBuffer({
      method: "GET",
      path: `/documents/${input2.document_id}/completed_pdf`,
      query: { ...query, url_only: false },
      headers: {
        Accept: input2.file_format === "zip" ? "application/zip" : "application/pdf"
      }
    });
    const nodeBuffer = Buffer2.from(buffer);
    if (effectiveMode === "file" && input2.save_to_path) {
      await writeFile(input2.save_to_path, nodeBuffer);
      const megabytes = (nodeBuffer.byteLength / (1024 * 1024)).toFixed(2);
      return successResponse({
        type: "document_completed_pdf",
        message: `Completed PDF saved to ${input2.save_to_path} (${megabytes} MB).`,
        data: { saved_to: input2.save_to_path, size_bytes: nodeBuffer.byteLength }
      });
    }
    const pdfBase64 = nodeBuffer.toString("base64");
    const warnings = [];
    if (nodeBuffer.byteLength >= COMPLETED_PDF_WARNING_THRESHOLD_BYTES) {
      const megabytes = (nodeBuffer.byteLength / (1024 * 1024)).toFixed(2);
      warnings.push(
        `Base64 response is ${megabytes} MB; prefer mode: "url" to reduce payload size.`
      );
    }
    return successResponse({
      type: "document_completed_pdf",
      message: 'Completed PDF retrieved. Display it in an artifact using: <iframe src="data:application/pdf;base64,{pdf_base64}" width="100%" height="600px"></iframe> or provide a download link. Do NOT attempt to save to disk.',
      data: { pdf_base64: pdfBase64 },
      warnings: warnings.length ? warnings : void 0
    });
  } catch (error) {
    return toToolError(error, "Unable to fetch the completed PDF.");
  }
}
function toToolError(error, fallback) {
  if (error instanceof SignWellError) {
    return errorResponse({
      type: error.type,
      message: error.message ?? fallback,
      data: {
        status: error.status,
        requestId: error.requestId,
        details: error.details
      },
      error
    });
  }
  return errorResponse({
    type: "unknown",
    message: fallback,
    error
  });
}
function registerDocumentPrompt(server, client) {
  server.registerPrompt(
    "search_document",
    {
      title: "Fetch a SignWell document",
      description: "Fetch SignWell document summary by id.",
      argsSchema: { document_id: z3.string() }
    },
    async ({ document_id }) => {
      const data = await client.get(`/documents/${document_id}`);
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `${JSON.stringify(data, null, 2)}

Summarize this document.`
            }
          }
        ]
      };
    }
  );
}
async function resolveFileInputs(files, extra) {
  return Promise.all(
    files.map(async (file) => {
      if (file.file_token) {
        const stored = getStoredFile(file.file_token);
        if (!stored) {
          throw new Error(
            `file_token for "${file.name}" is expired or invalid. Call file_store again.`
          );
        }
        return {
          name: file.name,
          file_base64: stored.file_base64
        };
      }
      if (file.resource_uri) {
        const file_base64 = await fetchResourceAsBase642(file.resource_uri, extra);
        return {
          name: file.name,
          file_base64
        };
      }
      if (file.content_text) {
        const docxBuffer = await textToDocx(file.content_text);
        const docxName = file.name.endsWith(".docx") ? file.name : `${file.name}.docx`;
        return {
          name: docxName,
          file_base64: docxBuffer.toString("base64")
        };
      }
      return {
        name: file.name,
        file_url: file.file_url,
        file_base64: file.file_base64
      };
    })
  );
}
async function fetchResourceAsBase642(resourceUri, extra) {
  if (!extra?.sendRequest) {
    throw new Error("Resource access is unavailable in this context.");
  }
  const result = await extra.sendRequest(
    {
      method: "resources/read",
      params: { uri: resourceUri }
    },
    ReadResourceResultSchema2
  );
  const content = result.contents?.[0];
  if (!content) {
    throw new Error(`Resource ${resourceUri} did not include any contents.`);
  }
  if ("blob" in content && content.blob) {
    return content.blob;
  }
  if ("text" in content && content.text) {
    return Buffer2.from(content.text, "utf8").toString("base64");
  }
  throw new Error(`Resource ${resourceUri} must include blob or text content.`);
}

// src/tools/templates.ts
import { Buffer as Buffer3 } from "node:buffer";
import { ReadResourceResultSchema as ReadResourceResultSchema3 } from "@modelcontextprotocol/sdk/types.js";
import { z as z4 } from "zod";
function debugLog(message, data) {
  if (isDebugEnabled()) {
    console.error(
      `[SignWell DEBUG] ${message}`,
      data !== void 0 ? JSON.stringify(data, null, 2) : ""
    );
  }
}
var templateFileSchema = z4.object({
  name: z4.string().describe("REQUIRED. Filename with extension (e.g., 'contract.pdf')."),
  file_token: z4.string().optional().describe(
    "Token from file_store (recommended). Use file_store first, then pass the token here."
  ),
  file_url: z4.string().optional().describe("Public URL to download the file."),
  file_base64: z4.string().optional().describe("Base64-encoded file content."),
  resource_uri: z4.string().optional().describe("MCP resource URI for the file."),
  content_text: z4.string().optional().describe(
    "Plain text or Markdown content to convert to DOCX. When provided, the MCP server generates a DOCX file automatically. Use this instead of file_base64 to avoid UI freezing with large documents."
  )
});
var placeholderSchema = z4.object({
  id: z4.string().describe(
    "REQUIRED. Unique ID that maps to the signer number in text tags (e.g., '1' for {{signature:1:y}}, '2' for {{signature:2:y}})."
  ),
  name: z4.string().describe(
    "REQUIRED. Role name (e.g., 'Parent/Guardian', 'Client'). Used when assigning recipients via template_create_document."
  ),
  preassigned_recipient_name: z4.string().optional().describe("Pre-assigned recipient name."),
  preassigned_recipient_email: z4.string().optional().describe("Pre-assigned recipient email.")
});
var copiedPlaceholderSchema = z4.object({
  name: z4.string().describe("REQUIRED. Name for the CC recipient role."),
  preassigned_recipient_name: z4.string().optional().describe("Pre-assigned name."),
  preassigned_recipient_email: z4.string().optional().describe("Pre-assigned email.")
});
var dropdownOptionSchema = z4.object({
  name: z4.string().describe("Option display text."),
  api_id: z4.string().optional().describe("Unique ID for the option."),
  is_other: z4.boolean().optional().describe("Whether this is an 'Other' option.")
});
var fieldSchema = z4.object({
  x: z4.number().describe("Horizontal position in pixels."),
  y: z4.number().describe("Vertical position in pixels."),
  page: z4.number().int().min(1).describe("Page number within the file."),
  placeholder_id: z4.string().min(1).describe("ID of the placeholder assigned to this field."),
  type: z4.enum([
    "initials",
    "signature",
    "checkbox",
    "date",
    "select",
    "text",
    "dropdown",
    "autofill_company",
    "autofill_email",
    "autofill_first_name",
    "autofill_last_name",
    "autofill_name",
    "autofill_phone",
    "autofill_title",
    "autofill_date_signed"
  ]).describe("Field type."),
  required: z4.boolean().default(true).optional(),
  label: z4.string().optional().describe("Label displayed when field is empty (text/date fields)."),
  value: z4.union([z4.string(), z4.number(), z4.boolean()]).optional().describe(
    "Pre-filled value. Text accepts strings/numbers, date accepts ISO8601, checkbox accepts boolean."
  ),
  api_id: z4.string().optional().describe("Unique identifier for the field."),
  name: z4.string().optional().describe("Checkbox group name."),
  validation: z4.enum([
    "no_text_validation",
    "numbers",
    "letters",
    "email_address",
    "us_phone_number",
    "us_zip_code",
    "us_ssn",
    "us_age",
    "alphanumeric",
    "us_bank_routing_number",
    "us_bank_account_number"
  ]).optional().describe("Text field validation type."),
  fixed_width: z4.boolean().optional().describe("Text fields: keep fixed width with multiline."),
  lock_sign_date: z4.boolean().optional().describe("Date fields: auto-populate with sign date."),
  date_format: z4.enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY/MM/DD", "Month DD, YYYY", "MM/DD/YYYY hh:mm:ss a"]).optional().describe("Date field format."),
  height: z4.number().optional().describe("Field height in pixels."),
  width: z4.number().optional().describe("Field width in pixels."),
  options: z4.array(dropdownOptionSchema).optional().describe("Dropdown options."),
  default_option: z4.string().optional().describe("Default dropdown option."),
  allow_other: z4.boolean().optional().describe("Allow 'Other' option in dropdown.")
});
var attachmentRequestSchema = z4.object({
  name: z4.string().min(1, { message: "Attachment request name is required." }),
  placeholder_id: z4.string().min(1, { message: "Placeholder ID is required for attachment request." }),
  required: z4.boolean().default(true).optional()
});
var labelSchema = z4.object({
  name: z4.string().min(1, { message: "Label name is required." })
});
var checkboxGroupSchema = z4.object({
  group_name: z4.string().min(1, { message: "Checkbox group name is required." }),
  placeholder_id: z4.string().min(1, { message: "Placeholder ID is required for checkbox group." }),
  checkbox_ids: z4.array(z4.string()).min(2, { message: "At least 2 checkbox IDs are required." }),
  validation: z4.enum(["minimum", "maximum", "range", "exact"]).optional(),
  required: z4.boolean().default(false).optional(),
  min_value: z4.number().int().min(0).optional(),
  max_value: z4.number().int().optional(),
  exact_value: z4.number().int().optional()
});
var createTemplateSchema = z4.object({
  // ═══════════════════════════════════════════════════════════════════════════
  // REQUIRED FIELDS (per OpenAPI spec)
  // ═══════════════════════════════════════════════════════════════════════════
  files: z4.array(templateFileSchema).describe(
    "REQUIRED. Files to upload. Each needs 'name' plus one of: 'file_url', 'file_base64', or 'resource_uri'."
  ),
  placeholders: z4.array(placeholderSchema).describe(
    "REQUIRED. Signing roles. Each needs 'id' and 'name'. For text tags, the 'id' must match tag IDs (e.g., id='signer1' matches [sig|req|signer1])."
  ),
  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORTANT: Set text_tags=true if PDF contains text tags like [sig|req|id]
  // ═══════════════════════════════════════════════════════════════════════════
  text_tags: z4.boolean().optional().describe(
    "Set TRUE if PDF contains text tags like {{signature:1:y}}. Placeholder 'id' values must match the signer numbers in tags (e.g., id='1' for {{signature:1:y}})."
  ),
  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL FIELDS
  // ═══════════════════════════════════════════════════════════════════════════
  name: z4.string().optional().describe("Template name (e.g., 'Permission Slip')."),
  subject: z4.string().optional().describe("Email subject for signature requests."),
  message: z4.string().optional().describe("Email message for signature requests (max 4000 chars)."),
  draft: z4.boolean().optional().describe(
    "If true, template stays editable. If false, marked Available. Default: false per API."
  ),
  // Copied placeholders (CC recipients)
  copied_placeholders: z4.array(copiedPlaceholderSchema).optional().describe("Recipients who receive the final document after completion."),
  // Document fields
  fields: z4.array(z4.array(fieldSchema)).optional().describe("2D array of fields: one array per file. Required if draft is false."),
  // Attachment requests
  attachment_requests: z4.array(attachmentRequestSchema).optional().describe("Attachments recipients must upload."),
  // Checkbox groups
  checkbox_groups: z4.array(checkboxGroupSchema).optional().describe("Grouped checkbox fields with validation."),
  // Labels
  labels: z4.array(labelSchema).optional().describe("Labels for organizing templates."),
  // Expiration and reminders
  expires_in: z4.number().int().min(1).max(365).optional().describe("Days before signature request expires (max 365)."),
  reminders: z4.boolean().default(true).optional().describe("Send signing reminders on day 3, 6, and 10."),
  // Signing order
  apply_signing_order: z4.boolean().default(false).optional().describe("Recipients sign in order."),
  // Redirect URLs
  redirect_url: z4.string().url().optional().describe("URL to redirect after successful signing."),
  decline_redirect_url: z4.string().url().optional().describe("URL to redirect if document is declined."),
  // Allow actions
  allow_decline: z4.boolean().default(true).optional().describe("Allow recipients to decline signing."),
  allow_reassign: z4.boolean().default(true).optional().describe("Allow recipients to reassign to someone else."),
  // Language
  language: z4.enum([
    "en",
    "fr",
    "es",
    "de",
    "pl",
    "pt",
    "da",
    "nl",
    "it",
    "ru",
    "sv",
    "ar",
    "el",
    "tr",
    "sk"
  ]).optional().describe("Language for template (ISO 639-1)."),
  // Metadata
  metadata: z4.record(z4.string(), z4.string()).optional().describe("Key-value metadata (max 50 pairs, key max 40 chars, value max 500 chars)."),
  // API application
  api_application_id: z4.string().uuid().optional().describe("API Application ID for settings isolation.")
});
var updateTemplateSchema = z4.object({
  template_id: z4.string().min(1, { message: "template_id is required." }),
  // All fields from create are optional for update
  files: z4.array(templateFileSchema).optional(),
  placeholders: z4.array(placeholderSchema).optional(),
  name: z4.string().optional(),
  subject: z4.string().optional(),
  message: z4.string().max(4e3).optional(),
  draft: z4.boolean().optional(),
  copied_placeholders: z4.array(copiedPlaceholderSchema).optional(),
  fields: z4.array(z4.array(fieldSchema)).optional(),
  attachment_requests: z4.array(attachmentRequestSchema).optional(),
  checkbox_groups: z4.array(checkboxGroupSchema).optional(),
  labels: z4.array(labelSchema).optional(),
  expires_in: z4.number().int().min(1).max(365).optional(),
  reminders: z4.boolean().optional(),
  apply_signing_order: z4.boolean().optional(),
  redirect_url: z4.string().url().optional(),
  decline_redirect_url: z4.string().url().optional(),
  allow_decline: z4.boolean().optional(),
  allow_reassign: z4.boolean().optional(),
  language: z4.enum([
    "en",
    "fr",
    "es",
    "de",
    "pl",
    "pt",
    "da",
    "nl",
    "it",
    "ru",
    "sv",
    "ar",
    "el",
    "tr",
    "sk"
  ]).optional(),
  text_tags: z4.boolean().optional(),
  metadata: z4.record(z4.string(), z4.string()).optional(),
  api_application_id: z4.string().uuid().optional()
});
var getTemplateSchema = z4.object({
  template_id: z4.string().min(1, { message: "template_id is required." })
});
var listTemplatesSchema = z4.object({
  page: z4.number().int().min(1).default(1).optional(),
  per_page: z4.number().int().min(1).max(100).default(25).optional()
});
var deleteTemplateSchema = z4.object({
  template_id: z4.string().min(1, { message: "template_id is required." })
});
var createFromTemplateSchema = z4.object({
  template_id: z4.string().min(1, { message: "template_id is required." }),
  name: z4.string().optional().describe("Document name override."),
  recipients: z4.array(
    z4.object({
      id: z4.string().min(1, { message: "id is required." }).describe("Unique identifier for this recipient (e.g., 'recipient_1')."),
      placeholder_name: z4.string().min(1, { message: "placeholder_name is required." }).describe("The name of the placeholder from the template to assign this recipient to."),
      email: z4.string().email({ message: "Recipient email must be valid." }),
      name: z4.string().optional().describe("Name of the recipient."),
      passcode: z4.string().optional().describe("Passcode required to view and sign the document."),
      subject: z4.string().optional().describe("Custom email subject for this recipient."),
      message: z4.string().optional().describe("Custom email message for this recipient."),
      send_email: z4.boolean().optional().describe(
        "Only valid when embedded_signing is true. Whether to send email notification."
      ),
      send_email_delay: z4.number().int().min(0).max(60).optional().describe(
        "Only valid when embedded_signing is true. Delay in minutes before sending email (0-60)."
      )
    })
  ).min(1, { message: "At least one recipient is required." }),
  copied_contacts: z4.array(
    z4.object({
      copied_placeholder_id: z4.string().optional(),
      email: z4.string().email({ message: "Copied contact email must be valid." }),
      name: z4.string().optional()
    })
  ).optional(),
  message: z4.string().max(4e3).optional(),
  subject: z4.string().optional(),
  metadata: z4.record(z4.string(), z4.string()).optional(),
  draft: z4.boolean().default(false).optional(),
  embedded_signing: z4.boolean().default(false).optional(),
  embedded_signing_notifications: z4.boolean().default(false).optional(),
  text_tags: z4.boolean().default(false).optional(),
  apply_signing_order: z4.boolean().default(false).optional().describe(
    "When true, recipients sign one at a time in the order of the recipients array."
  ),
  custom_requester_name: z4.string().optional(),
  custom_requester_email: z4.string().email().optional(),
  redirect_url: z4.string().url().optional(),
  decline_redirect_url: z4.string().url().optional(),
  expires_in: z4.number().int().min(1).max(365).optional(),
  files: z4.array(templateFileSchema).optional().describe("Additional files to append.")
});
function registerTemplateTools(server, client) {
  let count = 0;
  const register = (name, description, schema, handler, annotations) => {
    if (isDebugEnabled() && typeof schema.toJSONSchema === "function") {
      debugLog(`Registering tool "${name}" with schema:`, schema.toJSONSchema());
    }
    const toolHandler = (async (input2, extra) => {
      debugLog(`Tool "${name}" called with RAW input:`, input2);
      debugLog(`Tool "${name}" input type:`, typeof input2);
      debugLog(
        `Tool "${name}" input keys:`,
        input2 && typeof input2 === "object" ? Object.keys(input2) : "N/A"
      );
      if (name === "template_create") {
        const inputObj = input2;
        if (!inputObj || typeof inputObj === "object" && !inputObj.files && !inputObj.placeholders) {
          throw new Error(
            `template_create requires 'files' and 'placeholders' arrays. Example:
{
  "name": "My Template",
  "files": [{"name": "doc.docx", "content_text": "# Agreement\\n\\nThis contract..."}],
  "placeholders": [{"id": "1", "name": "Signer"}]
}

Use "content_text" for generated content (auto-converts to DOCX). For existing files, use "file_token" from file_store.`
          );
        }
      }
      const validated = schema.parse(input2);
      debugLog(`Tool "${name}" VALIDATED input:`, validated);
      return handler(validated, extra);
    });
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema,
        annotations
      },
      toolHandler
    );
    count += 1;
  };
  register(
    "template_create",
    `Create a SignWell template for reusable signature documents.

RECOMMENDED WORKFLOW:
1. file_store (provide file_path, file_url, or resource_uri) \u2192 returns file_token
2. file_validate_text_tags (pass file_token) \u2192 validates tags are extractable
3. template_create (pass file_token in files array) \u2192 creates the template

REQUIRED PARAMETERS (both are mandatory):
- files: Array with at least one file object containing:
  * "name": Filename (e.g., "template.docx")
  * One content source (in order of preference):
    - "content_text": Plain text/Markdown to auto-convert to DOCX (RECOMMENDED for generated content)
    - "file_token": Token from file_store (recommended for uploaded files)
    - "file_base64": Base64-encoded file content
    - "file_url": Public URL to the file
    - "resource_uri": MCP resource URI
- placeholders: Array with at least one placeholder object containing "id" and "name"

STEP-BY-STEP EXAMPLE (using file_token):
1. Call file_store with {"file_path": "/path/to/doc.pdf"} \u2192 get file_token
2. Call file_validate_text_tags with {"file_token": "..."} \u2192 confirm tags are valid
3. Call this tool with:
{
  "name": "My Template",
  "files": [{"name": "doc.pdf", "file_token": "<token from file_store>"}],
  "placeholders": [{"id": "1", "name": "Signer"}],
  "text_tags": true
}

ALTERNATIVE (inline base64):
{
  "name": "My Template",
  "files": [{"name": "doc.pdf", "file_base64": "JVBERi0xLjQK..."}],
  "placeholders": [{"id": "1", "name": "Signer"}],
  "text_tags": true
}

TEXT TAGS (when text_tags: true):
Your PDF must contain these literal text strings as SELECTABLE TEXT (not images):
- {{signature:1:y}} - Signature field for placeholder id "1"
- {{date:1:y}} - Date field for placeholder id "1"
- {{text:1:y:Label}} - Text field with label
- {{initial:1:y}} - Initials field

The number in the tag (1, 2, etc.) MUST match a placeholder "id" in your request.

CRITICAL: Text tags must be SELECTABLE/SEARCHABLE text in the PDF, not rendered as images or graphics.
When generating PDFs programmatically, use text drawing methods (e.g., drawString) with standard fonts.
To verify: open the PDF and try to select/copy the tag text with your mouse. If you can't select it, SignWell can't parse it.

MULTI-SIGNER EXAMPLE:
{
  "name": "Contract",
  "files": [{"name": "contract.pdf", "file_base64": "JVBERi0xLjQK...actual base64 here..."}],
  "placeholders": [
    {"id": "1", "name": "Client"},
    {"id": "2", "name": "Vendor"}
  ],
  "text_tags": true
}

For this example, the PDF should contain: {{signature:1:y}} for Client and {{signature:2:y}} for Vendor.

COMMON ERRORS:
- Empty arguments {} = You forgot to include files and placeholders arrays
- "fields": [] in response = PDF doesn't contain valid text tags, or text_tags wasn't set to true`,
    createTemplateSchema,
    (input2, extra) => handleTemplateCreate(client, input2, extra),
    { readOnlyHint: false, destructiveHint: false }
  );
  register(
    "template_update",
    "Update an existing SignWell template. Only provide fields you want to change.",
    updateTemplateSchema,
    (input2, extra) => handleTemplateUpdate(client, input2, extra),
    { readOnlyHint: false, destructiveHint: false }
  );
  register(
    "template_get",
    "Fetch an individual SignWell template by ID.",
    getTemplateSchema,
    (input2, _extra) => handleTemplateGet(client, input2),
    { readOnlyHint: true }
  );
  register(
    "template_list",
    "List SignWell templates with pagination.",
    listTemplatesSchema,
    (input2, _extra) => handleTemplateList(client, input2),
    { readOnlyHint: true }
  );
  register(
    "template_delete",
    "Delete a SignWell template.",
    deleteTemplateSchema,
    (input2, _extra) => handleTemplateDelete(client, input2),
    { destructiveHint: true }
  );
  register(
    "template_create_document",
    `Create and send a document from a template. Templates are pre-configured and ready to send, so this tool sends the document for signing by default.

IMPORTANT: When a user asks to "send a template" or "send a document from a template", the document will be sent immediately for signing. Set draft: true ONLY if the user explicitly asks to create a draft or review before sending.

REQUIRED:
- template_id: The template ID to create the document from
- recipients: Array of recipient objects, each with:
  - id: Unique identifier for this recipient (e.g., "recipient_1")
  - placeholder_name: Name of the template placeholder to assign (must match exactly)
  - email: Recipient's email address
  - name: (optional) Recipient's display name

Example:
{
  "template_id": "abc123",
  "recipients": [{
    "id": "recipient_1",
    "placeholder_name": "Client",
    "email": "client@example.com",
    "name": "John Doe"
  }]
}`,
    createFromTemplateSchema,
    (input2, extra) => handleCreateDocumentFromTemplate(client, input2, extra),
    { readOnlyHint: false, destructiveHint: false }
  );
  registerTemplatePrompt(server, client);
  return count;
}
async function handleTemplateCreate(client, input2, extra) {
  for (const file of input2.files) {
    if (!file.file_token && !file.file_url && !file.file_base64 && !file.resource_uri && !file.content_text) {
      return errorResponse({
        type: "validation",
        message: `File "${file.name}" must have one of: file_token, file_url, file_base64, resource_uri, or content_text`
      });
    }
  }
  for (const placeholder of input2.placeholders) {
    if (!placeholder.id || !placeholder.name) {
      return errorResponse({
        type: "validation",
        message: "Each placeholder must have 'id' and 'name' fields"
      });
    }
  }
  try {
    const files = await resolveFileInputs2(input2.files, extra);
    const payload = {
      ...input2,
      files,
      draft: input2.draft ?? true
    };
    const data = await client.post("/document_templates", payload);
    data.template_builder_url = `https://www.signwell.com/app/template_builder/${data.id}`;
    const warnings = [];
    const hasFields = data.fields && data.fields.length > 0 && data.fields.some((f) => f.length > 0);
    if (input2.text_tags && hasFields) {
    } else if (input2.text_tags && !hasFields) {
      warnings.push(
        "NOTE: text_tags was enabled. SignWell may still be processing the tags. Open the template in the SignWell editor to verify fields were placed correctly. If fields are missing, ensure the PDF contains valid selectable text tags (e.g. {{signature:1:y}}) and the signer numbers match placeholder ids. See the text tags documentation for syntax details."
      );
    } else if (!hasFields) {
      warnings.push(
        "WARNING: Template has no signature fields. You must either: (1) Add fields manually via the SignWell web editor at the template_builder_url, or (2) Use text_tags: true with a PDF containing text tag placeholders like {{signature:1:y}}."
      );
    }
    return successResponse({
      type: "template_create",
      message: data.status === "Created" ? "Template draft created." : "Template created and available.",
      data,
      warnings: warnings.length > 0 ? warnings : void 0
    });
  } catch (error) {
    return toTemplateError(error, "Unable to create the template.");
  }
}
async function handleTemplateUpdate(client, input2, extra) {
  try {
    const { template_id, files, ...rest } = input2;
    const resolvedFiles = files ? await resolveFileInputs2(files, extra) : void 0;
    const payload = {
      ...rest,
      ...resolvedFiles && { files: resolvedFiles }
    };
    const data = await client.put(`/document_templates/${template_id}`, payload);
    return successResponse({
      type: "template_update",
      message: "Template updated.",
      data
    });
  } catch (error) {
    return toTemplateError(error, "Unable to update the template.");
  }
}
async function handleTemplateGet(client, input2) {
  try {
    const data = await client.get(`/document_templates/${input2.template_id}`);
    return successResponse({
      type: "template_get",
      message: "Fetched template.",
      data
    });
  } catch (error) {
    return toTemplateError(error, "Unable to fetch the template.");
  }
}
async function handleTemplateList(client, input2) {
  try {
    const query = {};
    if (input2.page) query.page = input2.page;
    if (input2.per_page) query.per_page = input2.per_page;
    const data = await client.get("/document_templates", {
      query
    });
    return successResponse({
      type: "template_list",
      message: "Fetched templates.",
      data
    });
  } catch (error) {
    return toTemplateError(error, "Unable to list templates.");
  }
}
async function handleTemplateDelete(client, input2) {
  try {
    await client.delete(`/document_templates/${input2.template_id}`);
    return successResponse({
      type: "template_delete",
      message: "Template deleted.",
      data: { template_id: input2.template_id }
    });
  } catch (error) {
    return toTemplateError(error, "Unable to delete the template.");
  }
}
async function handleCreateDocumentFromTemplate(client, input2, extra) {
  try {
    const { template_id, files, recipients, ...rest } = input2;
    const resolvedFiles = files ? await resolveFileInputs2(files, extra) : void 0;
    const processedRecipients = recipients.map((recipient) => {
      if (input2.embedded_signing) {
        return recipient;
      }
      const { send_email, send_email_delay, ...recipientRest } = recipient;
      return recipientRest;
    });
    const draft = input2.draft ?? false;
    const payload = {
      template_id,
      ...rest,
      recipients: processedRecipients,
      ...resolvedFiles && { files: resolvedFiles },
      draft
    };
    const data = await client.post("/document_templates/documents", payload);
    return successResponse({
      type: "template_create_document",
      message: draft ? "Document draft created from template. It has NOT been sent yet. Use document_send_draft to send it when ready." : "Document has been sent for signing. Recipients will receive an email to sign the document.",
      data
    });
  } catch (error) {
    return toTemplateError(error, "Unable to create document from template.");
  }
}
function toTemplateError(error, fallback) {
  if (error instanceof SignWellError) {
    return errorResponse({
      type: error.type,
      message: error.message ?? fallback,
      data: {
        status: error.status,
        requestId: error.requestId,
        details: error.details
      },
      error
    });
  }
  return errorResponse({
    type: "unknown",
    message: fallback,
    error
  });
}
async function resolveFileInputs2(files, extra) {
  return Promise.all(
    files.map(async (file) => {
      if (file.file_token) {
        const stored = getStoredFile(file.file_token);
        if (!stored) {
          throw new Error(
            `file_token for "${file.name}" is expired or invalid. Call file_store again.`
          );
        }
        return {
          name: file.name,
          file_base64: stored.file_base64
        };
      }
      if (file.resource_uri) {
        const file_base64 = await fetchResourceAsBase643(file.resource_uri, extra);
        return {
          name: file.name,
          file_base64
        };
      }
      if (file.content_text) {
        const docxBuffer = await textToDocx(file.content_text);
        const docxName = file.name.endsWith(".docx") ? file.name : `${file.name}.docx`;
        return {
          name: docxName,
          file_base64: docxBuffer.toString("base64")
        };
      }
      return {
        name: file.name,
        file_url: file.file_url,
        file_base64: file.file_base64
      };
    })
  );
}
async function fetchResourceAsBase643(resourceUri, extra) {
  if (!extra?.sendRequest) {
    throw new Error("Resource access is unavailable in this context.");
  }
  const result = await extra.sendRequest(
    {
      method: "resources/read",
      params: { uri: resourceUri }
    },
    ReadResourceResultSchema3
  );
  const content = result.contents?.[0];
  if (!content) {
    throw new Error(`Resource ${resourceUri} did not include any contents.`);
  }
  if ("blob" in content && content.blob) {
    return content.blob;
  }
  if ("text" in content && content.text) {
    return Buffer3.from(content.text, "utf8").toString("base64");
  }
  throw new Error(`Resource ${resourceUri} must include blob or text content.`);
}
function registerTemplatePrompt(server, client) {
  server.registerPrompt(
    "search_template",
    {
      title: "Fetch a SignWell template",
      description: "Fetch SignWell template summary by id.",
      argsSchema: { template_id: z4.string() }
    },
    async ({ template_id }) => {
      const data = await client.get(`/document_templates/${template_id}`);
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `${JSON.stringify(data, null, 2)}

Summarize this template.`
            }
          }
        ]
      };
    }
  );
}

// src/tools/validate.ts
import { Buffer as Buffer4 } from "node:buffer";
import { ReadResourceResultSchema as ReadResourceResultSchema4 } from "@modelcontextprotocol/sdk/types.js";
import { extractText } from "unpdf";
import { z as z5 } from "zod";
var TAG_PATTERN = /\{\{[^}]*\}\}/g;
var VALID_TAG_PATTERN = /^\{\{(signature|date|text|initial|initials|checkbox):(\w+):(y|n)(?::([^}]+))?\}\}$/;
var validateTextTagsSchema = z5.object({
  file_token: z5.string().optional().describe("Token from file_store."),
  file_base64: z5.string().optional().describe("Base64-encoded PDF content."),
  file_url: z5.string().url().optional().describe("Public URL to download the PDF."),
  resource_uri: z5.string().optional().describe("MCP resource URI for the file."),
  use_picker: z5.boolean().optional().describe("Set to true to prompt for a local file when no other option is provided.")
});
function registerValidateTools(server) {
  server.registerTool(
    "file_validate_text_tags",
    {
      description: `Validate text tags in a PDF before creating a template or document.

RECOMMENDED WORKFLOW: file_store \u2192 file_validate_text_tags \u2192 template_create/document_create

Accepts a PDF via file_token (from file_store), file_base64, file_url, or resource_uri.
Set use_picker: true to open a native file picker when no file input is provided.
Extracts text from the PDF and checks for valid SignWell text tags like {{signature:1:y}}.

Returns:
- Whether text is extractable from the PDF
- List of valid tags found
- List of malformed tags (if any)
- Signer numbers referenced
- Recommendations for fixing issues`,
      inputSchema: validateTextTagsSchema,
      annotations: { readOnlyHint: true }
    },
    async (input2, extra) => handleValidateTextTags(input2, extra)
  );
  return 1;
}
async function handleValidateTextTags(input2, extra) {
  const hasDirectInput = input2.file_token || input2.file_base64 || input2.file_url || input2.resource_uri;
  if (!hasDirectInput && !input2.use_picker) {
    return errorResponse({
      type: "validation",
      message: "Provide one of: file_token, file_base64, file_url, resource_uri, or set use_picker: true."
    });
  }
  try {
    const pdfBuffer = await resolvePdfBuffer(input2, extra);
    const { text, extractable } = await extractPdfText(pdfBuffer);
    if (!extractable) {
      return successResponse({
        type: "file_validate_text_tags",
        message: "PDF text is not extractable. Text tags will NOT work.",
        data: {
          text_extractable: false,
          valid_tags: [],
          malformed_tags: [],
          signer_ids: [],
          recommendations: [
            "This PDF does not contain selectable/searchable text.",
            "Text tags like {{signature:1:y}} must be real text in the PDF, not images.",
            "Regenerate the PDF using text drawing methods (e.g., drawString) with standard fonts.",
            "To verify manually: open the PDF and try to select/copy the tag text with your mouse."
          ]
        },
        warnings: [
          "Assistant: create the document draft anyway and direct the user to SignWell's editor to place fields. Do not claim you can add the fields yourself; share the editor_url once available."
        ]
      });
    }
    const allMatches = text.match(TAG_PATTERN) ?? [];
    const validTags = [];
    const malformedTags = [];
    const signerIds = /* @__PURE__ */ new Set();
    for (const tag of allMatches) {
      const match = tag.match(VALID_TAG_PATTERN);
      if (match) {
        validTags.push(tag);
        signerIds.add(match[2]);
      } else {
        malformedTags.push(tag);
      }
    }
    const recommendations = [];
    const warnings = [];
    if (validTags.length === 0 && malformedTags.length === 0) {
      recommendations.push(
        "No text tags found in the PDF.",
        "Add tags like {{signature:1:y}}, {{date:1:y}}, or {{text:1:y:Label}} to the PDF text.",
        "The number (1, 2, etc.) maps to a placeholder id in your template/document request.",
        "Use the SignWell editor to drag/drop fields directly: https://app.signwell.com/?redirect=/documents",
        "The MCP assistant cannot insert tags into the PDF automatically; build them in SignWell and re-upload."
      );
      warnings.push(
        "Assistant: proceed by creating the document and sharing the SignWell editor link so the user can add fields there. Do not attempt to place fields manually in chat."
      );
    } else if (malformedTags.length > 0) {
      recommendations.push(
        `Found ${malformedTags.length} malformed tag(s). Valid format: {{type:signer_id:required[:label]}}`,
        "Supported types: signature, date, text, initial, initials, checkbox",
        "Required field: 'y' (required) or 'n' (optional)"
      );
      warnings.push(
        "Assistant: inform the user that tags need correction within their PDF or via the SignWell editor; do not promise to fix field placement yourself."
      );
    }
    if (validTags.length > 0 && malformedTags.length === 0) {
      recommendations.push(
        `All ${validTags.length} tag(s) are valid. You can proceed with template_create or document_create using text_tags: true.`,
        `Ensure your placeholders/recipients have ids matching: ${[...signerIds].join(", ")}`
      );
    }
    return successResponse({
      type: "file_validate_text_tags",
      message: validTags.length > 0 ? `Found ${validTags.length} valid text tag(s).` : "No valid text tags found.",
      data: {
        text_extractable: true,
        valid_tags: validTags,
        malformed_tags: malformedTags,
        signer_ids: [...signerIds],
        recommendations
      },
      warnings: warnings.length > 0 ? warnings : void 0
    });
  } catch (error) {
    return errorResponse({
      type: "validation",
      message: error instanceof Error ? error.message : "Unable to validate text tags.",
      error
    });
  }
}
async function resolvePdfBuffer(input2, extra) {
  if (input2.file_token) {
    const stored = getStoredFile(input2.file_token);
    if (!stored) {
      throw new Error(
        "file_token is expired or invalid. Call file_store again to get a new token."
      );
    }
    return new Uint8Array(Buffer4.from(stored.file_base64, "base64"));
  }
  if (input2.file_base64) {
    return new Uint8Array(Buffer4.from(input2.file_base64, "base64"));
  }
  if (input2.file_url) {
    const response = await fetch(input2.file_url);
    if (!response.ok) {
      throw new Error(`Unable to fetch file_url (${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  if (input2.resource_uri) {
    if (!extra?.sendRequest) {
      throw new Error("Resource handling is unavailable in this transport.");
    }
    const result = await extra.sendRequest(
      { method: "resources/read", params: { uri: input2.resource_uri } },
      ReadResourceResultSchema4
    );
    const content = result.contents?.[0];
    if (!content) {
      throw new Error(`Resource ${input2.resource_uri} did not include any contents.`);
    }
    if ("blob" in content && content.blob) {
      return new Uint8Array(Buffer4.from(content.blob, "base64"));
    }
    if ("text" in content && content.text) {
      return new Uint8Array(Buffer4.from(content.text, "utf8"));
    }
    throw new Error(`Resource ${input2.resource_uri} must include blob or text content.`);
  }
  if (input2.use_picker) {
    const picked = await pickFileUsingNativeDialog();
    return new Uint8Array(Buffer4.from(picked.file_base64, "base64"));
  }
  throw new Error("No file input provided.");
}
async function extractPdfText(data) {
  try {
    const result = await extractText(data, { mergePages: true });
    const text = typeof result.text === "string" ? result.text : result.text.join("\n");
    const trimmed = text.trim();
    return { text: trimmed, extractable: trimmed.length > 0 };
  } catch {
    return { text: "", extractable: false };
  }
}

// src/index.ts
var VERSION = true ? "0.3.2" : "dev";
var SERVER_NAME = "signwell";
var HELP_TEXT2 = `
SignWell MCP Server v${VERSION}

Usage:
  npx @signwell/mcp [options]
  npx @signwell/mcp setup [mode]
  (from source) node build/index.js [options]

Options:
  -h, --help       Show this help text
  -v, --version    Print the current version

  Environment:
    SIGNWELL_API_KEY           Required. SignWell API key with document access.
    SIGNWELL_API_BASE_URL      Optional. Override the SignWell API base URL.
    SIGNWELL_API_TIMEOUT_MS    Optional. HTTP timeout override in milliseconds (default 90000).
`.trim();
async function main(argv = process9.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    printVersion();
    return;
  }
  if (argv[0] === "setup") {
    await runSetup(argv.slice(1), { version: VERSION, serverName: SERVER_NAME });
    return;
  }
  try {
    await startServer();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(`[SignWell MCP] ${error.message}`);
    } else {
      console.error("[SignWell MCP] Failed to start server.", error);
    }
    process9.exitCode = 1;
  }
}
function printHelp() {
  console.log(HELP_TEXT2);
}
function printVersion() {
  console.log(VERSION);
}
async function startServer() {
  const config = loadEnv({ version: VERSION });
  const client = new SignWellClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    userAgent: config.userAgent,
    timeoutMs: config.timeoutMs
  });
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION
  });
  const registeredTools = registerTools(server, client);
  const transport = new StdioServerTransport();
  installSignalHandlers(server, transport);
  await server.connect(transport);
  console.error(
    `[SignWell MCP] Ready v${VERSION} (${registeredTools} tool${registeredTools === 1 ? "" : "s"}, stdio transport).`
  );
}
function registerTools(server, client) {
  let toolCount = 0;
  toolCount += registerFileTools(server);
  toolCount += registerValidateTools(server);
  toolCount += registerDocumentTools(server, client);
  toolCount += registerTemplateTools(server, client);
  return toolCount;
}
function installSignalHandlers(server, transport) {
  const shutdown = async (signal) => {
    console.error(`[SignWell MCP] Received ${signal}. Shutting down...`);
    await server.close();
    await transport.close();
    process9.exit(0);
  };
  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process9.once(signal, () => {
      shutdown(signal).catch((error) => {
        console.error("[SignWell MCP] Shutdown error:", error);
        process9.exit(1);
      });
    });
  });
}
function isEntryPoint() {
  try {
    const scriptPath = fileURLToPath2(import.meta.url);
    const invokedPath = realpathSync(path9.resolve(process9.argv[1]));
    return invokedPath === scriptPath;
  } catch {
    return false;
  }
}
if (isEntryPoint()) {
  main().catch((error) => {
    console.error("[SignWell MCP] Startup failed", error);
    process9.exitCode = 1;
  });
}
export {
  main
};
