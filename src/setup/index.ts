import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from "../config/env.ts";
import {
  ALL_CLIENT_KEYS,
  CLIENT_CONFIGS,
  CLIENT_KEY_HELP,
  parseClientKeys,
  resolveClientConfigs,
  type ClientConfig,
  type ClientKey,
} from "./clients.ts";
import { buildLaunchCommand } from "./command.ts";
import { readExistingEnv, summarizeEnvInstructions, writeEnvFile, type EnvValues } from "./env.ts";
import { buildManualSnippet } from "./manual.ts";
import type { ClientWriteResult, Runner, SetupRenderContext } from "./types.ts";

const HELP_TEXT = `Usage:
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

interface SetupOptions {
  version?: string;
  serverName?: string;
}

interface Flags {
  print?: boolean;
  yes?: boolean;
  help?: boolean;
  clients?: string;
  debug?: boolean;
  [key: string]: unknown;
}

interface ResolvedValues {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

const LOGO_LINES = [
  "███████╗██╗ ██████╗ ███╗   ██╗██╗    ██╗███████╗██╗     ██╗",
  "██╔════╝██║██╔════╝ ████╗  ██║██║    ██║██╔════╝██║     ██║",
  "███████╗██║██║  ███╗██╔██╗ ██║██║ █╗ ██║█████╗  ██║     ██║",
  "╚════██║██║██║   ██║██║╚██╗██║██║███╗██║██╔══╝  ██║     ██║",
  "███████║██║╚██████╔╝██║ ╚████║╚███╔███╔╝███████╗███████╗███████╗",
  "╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚══╝╚══╝ ╚══════╝╚══════╝╚══════╝",
];
const SIGNWELL_API_KEY_URL = "https://www.signwell.com/app/settings/api";

export async function runSetup(args: string[], options: SetupOptions = {}): Promise<void> {
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
      debug: { type: "boolean" },
    },
    allowPositionals: true,
  });

  const flags = values as Flags & {
    "api-key"?: string;
    "base-url"?: string;
    timeout?: string;
    clients?: string;
    debug?: boolean;
  };

  if (flags.help) {
    console.log(HELP_TEXT);
    return;
  }

  printLogo();
  await maybeOfferApiKeyPage(!flags.yes);

  const serverName = options.serverName ?? "signwell";
  const defaults = {
    baseUrl: DEFAULT_BASE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  } as const;

  const resolved = await collectEnvInputs(flags, defaults);
  const clientSelection = await resolveClientSelection(flags.clients, !flags.yes);
  const selectedClientConfigs = resolveClientConfigs(clientSelection.clientKeys);
  const envValues = toEnvValues(resolved, defaults);
  const printOnly = Boolean(flags.print);
  const envResult = await writeEnvFile(envValues, { printOnly });

  console.log(
    `[SignWell MCP] ${printOnly ? "Previewing" : "Storing"} credentials at ${envResult.path}`,
  );
  if (printOnly) {
    console.log(envResult.contents.trimEnd());
  } else {
    summarizeEnvInstructions(envResult.path).forEach((line) => {
      console.log(`  - ${line}`);
    });
  }

  const entryResolution = resolveEntryPoint();
  const repositoryPath = entryResolution?.repositoryPath ?? process.cwd();
  const runner = entryResolution?.runner ?? "node";
  const entryPoint =
    entryResolution?.entryPoint ?? path.resolve(repositoryPath, "build/index.js");
  const isLocalDev = entryResolution?.isLocalDev ?? false;
  const launchEnvironment = resolveLaunchEnvironment(flags);

  if (!fs.existsSync(entryPoint)) {
    console.warn(
      `[SignWell MCP] Build output not found at ${entryPoint}. Run "npm run build" before configuring MCP clients.`,
    );
  }
  const context: SetupRenderContext = {
    serverName,
    envFilePath: envResult.path,
    repositoryPath,
    entryPoint,
    runner,
    isLocalDev,
    launchCommand: buildLaunchCommand(envResult.path, entryPoint, runner, isLocalDev),
    environment: launchEnvironment,
  };

  const managedSections: Array<{
    client: ClientConfig;
    result: ClientWriteResult;
  }> = [];

  for (const client of selectedClientConfigs) {
    const result = await client.applyConfig(context, { printOnly });
    if (!result.wrote && !printOnly) {
      console.log(
        `[SignWell MCP] Failed to configure ${client.label}. Check permissions and try again.`,
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

async function collectEnvInputs(
  flags: {
    print?: boolean;
    yes?: boolean;
    "api-key"?: string;
    "base-url"?: string;
    timeout?: string;
  },
  defaults: { baseUrl: string; timeoutMs: number },
): Promise<ResolvedValues> {
  const existing = await readExistingEnv();
  const resolved: ResolvedValues = {
    apiKey: flags["api-key"] ?? existing.apiKey ?? "",
    baseUrl: flags["base-url"] ?? existing.baseUrl ?? defaults.baseUrl,
    timeoutMs: parseTimeout(flags.timeout) ?? existing.timeoutMs ?? defaults.timeoutMs,
  };

  if (flags.yes) {
    if (!resolved.apiKey) {
      throw new Error("SIGNWELL_API_KEY is required. Provide --api-key or run interactively.");
    }
    return resolved;
  }

  return promptForValues(resolved);
}

async function promptForValues(initial: ResolvedValues): Promise<ResolvedValues> {
  const rl = readline.createInterface({ input, output });
  const result: ResolvedValues = { ...initial };

  try {
    result.apiKey = await promptSecretField(rl, "SignWell API key", result.apiKey, {
      required: true,
    });
  } finally {
    rl.close();
  }

  if (!result.apiKey) {
    throw new Error("SIGNWELL_API_KEY is required.");
  }

  return result;
}

async function promptSecretField(
  rl: readline.Interface,
  label: string,
  current?: string,
  options: { required?: boolean } = {},
): Promise<string> {
  while (true) {
    const masked = current ? maskSecret(current) : "";
    const defaultText = masked ? ` [${masked}]` : "";
    const hint = current
      ? " (press Enter to keep existing)"
      : options.required
        ? " (required)"
        : "";
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

type ClientSelection = {
  clientKeys: ClientKey[];
  manual: boolean;
};

async function resolveClientSelection(
  clientsFlag: string | undefined,
  interactive: boolean,
): Promise<ClientSelection> {
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

async function promptClientSelection(): Promise<ClientSelection> {
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
        console.log(`  • "${answer}" is not a valid option. Try again.`);
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
        console.log("  • Invalid selection. Try again.");
        continue;
      }
      return { clientKeys: [client.key], manual: false };
    }
  } finally {
    rl.close();
  }
}

function logClientSummary(
  sections: Array<{ client: ClientConfig; result: ClientWriteResult }>,
  options: { printOnly: boolean },
): void {
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
      console.log(`  - ${client.label}: success · ${result.path}${backup}`);
      return;
    }

    console.log(`  - ${client.label}: failed · ${result.path}`);
  });
}

function printManualInstructions(context: SetupRenderContext): void {
  const section = buildManualSnippet(context);
  console.log(`\n--- ${section.name} ---`);
  console.log("Manual configuration requested. Follow the instructions below.");
  console.log(`Target: ${section.configPath}`);
  for (const note of section.notes) {
    console.log(`  • ${note}`);
  }
  console.log(section.snippet);
}

function parseTimeout(input?: string): number | undefined {
  if (!input) {
    return undefined;
  }
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function toEnvValues(
  resolved: ResolvedValues,
  defaults: { baseUrl: string; timeoutMs: number },
): EnvValues {
  return {
    apiKey: resolved.apiKey,
    baseUrl: resolved.baseUrl === defaults.baseUrl ? undefined : resolved.baseUrl,
    timeoutMs: resolved.timeoutMs === defaults.timeoutMs ? undefined : resolved.timeoutMs,
  };
}

function printLogo(): void {
  console.log("\n\n\n\n");
  const margin = "     ";
  for (const line of LOGO_LINES) {
    console.log(`${margin}${line}`);
  }
  console.log("\n\n\n");
}

function resolveLaunchEnvironment(flags: Flags): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  const debugValue =
    flags.debug === true
      ? "1"
      : typeof process.env.SIGNWELL_DEBUG === "string" && process.env.SIGNWELL_DEBUG.length > 0
        ? process.env.SIGNWELL_DEBUG
        : undefined;

  if (debugValue) {
    env.SIGNWELL_DEBUG = debugValue;
  }

  return Object.keys(env).length > 0 ? env : undefined;
}

async function maybeOfferApiKeyPage(interactive: boolean): Promise<void> {
  if (!interactive) {
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = (
      await rl.question("Open the SignWell API key page in your browser now? [y/N]: ")
    )
      .trim()
      .toLowerCase();
    if (answer === "y" || answer === "yes") {
      console.log("Launching https://www.signwell.com/app/settings/api ...");
      try {
        await openBrowser(SIGNWELL_API_KEY_URL);
        console.log("Browser launched. Copy your API key, then return here to continue.");
      } catch (error) {
        console.error(
          "Failed to open the browser automatically:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  } finally {
    rl.close();
  }
}

function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  let command: string;
  let args: string[];

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

type EntryPointResolution = {
  entryPoint: string;
  repositoryPath: string;
  runner: Runner;
  isLocalDev: boolean;
};

function resolveEntryPoint(): EntryPointResolution | undefined {
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

function resolveLocalSourceEntry(): EntryPointResolution | undefined {
  const cwd = process.cwd();
  const entryPath = path.resolve(cwd, "src", "index.ts");
  if (!fs.existsSync(entryPath)) {
    return undefined;
  }
  return {
    entryPoint: path.resolve(path.dirname(entryPath), "..", "build", "index.js"),
    repositoryPath: inferRepositoryPath(entryPath),
    runner: "node",
    isLocalDev: true,
  };
}

function resolveLocalBuildEntry(): EntryPointResolution | undefined {
  const cwd = process.cwd();
  const entryPath = path.resolve(cwd, "build", "index.js");
  if (!fs.existsSync(entryPath)) {
    return undefined;
  }
  return {
    entryPoint: entryPath,
    repositoryPath: inferRepositoryPath(entryPath),
    runner: "node",
    isLocalDev: true,
  };
}

function resolveRuntimeEntryPoint(): EntryPointResolution | undefined {
  const candidates: string[] = [];
  if (process.argv[1]) {
    candidates.push(process.argv[1]);
  }
  try {
    candidates.push(fileURLToPath(import.meta.url));
  } catch {
    // Ignore if import.meta is unavailable (should not happen in Node ESM).
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      const resolved = fs.realpathSync(candidate);
      if (!fs.existsSync(resolved)) {
        continue;
      }
      return {
        entryPoint: resolved,
        repositoryPath: inferRepositoryPath(resolved),
        runner: "node",
        isLocalDev: false,
      };
    } catch {}
  }

  return undefined;
}

function inferRepositoryPath(entryPointPath: string): string {
  let current = path.dirname(entryPointPath);
  const visited = new Set<string>();

  while (!visited.has(current)) {
    const packageJsonPath = path.join(current, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      return current;
    }
    visited.add(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return path.dirname(entryPointPath);
}

function maskSecret(value: string): string {
  if (value.length <= 4) {
    return "*".repeat(value.length);
  }
  if (value.length <= 8) {
    return `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
