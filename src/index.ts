import { realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { EnvError, loadEnv } from "./config/env.ts";
import { runSetup } from "./setup/index.ts";
import { SignWellClient } from "./signwell/client.ts";
import { registerDocumentTools } from "./tools/documents.ts";
import { registerFileTools } from "./tools/files.ts";
import { registerTemplateTools } from "./tools/templates.ts";
import { registerValidateTools } from "./tools/validate.ts";
import { registerHealthTools } from "./tools/ping.ts";

// Injected at build time by esbuild; falls back to "dev" during development
declare const __PKG_VERSION__: string | undefined;
const VERSION = typeof __PKG_VERSION__ === "string" ? __PKG_VERSION__ : "dev";
const SERVER_NAME = "signwell";
const HELP_TEXT = `
SignWell MCP Server v${VERSION}

Usage:
  signwell-mcp [options]
  signwell-mcp setup [mode]
  (from source) node build/index.js [options]

Options:
  -h, --help       Show this help text
  -v, --version    Print the current version

  Environment:
    SIGNWELL_API_KEY           Required. SignWell API key with document access.
    SIGNWELL_API_BASE_URL      Optional. Override the SignWell API base URL.
    SIGNWELL_API_TIMEOUT_MS    Optional. HTTP timeout override in milliseconds (default 90000).
`.trim();

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
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
    process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(HELP_TEXT);
}

function printVersion(): void {
  console.log(VERSION);
}

async function startServer(): Promise<void> {
  const config = loadEnv({ version: VERSION });
  const client = new SignWellClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    userAgent: config.userAgent,
    timeoutMs: config.timeoutMs,
  });
  const server = new McpServer({
    name: SERVER_NAME,
    version: VERSION,
  });

  const registeredTools = registerTools(server, client);
  const transport = new StdioServerTransport();

  installSignalHandlers(server, transport);

  await server.connect(transport);
  console.error(
    `[SignWell MCP] Ready v${VERSION} (${registeredTools} tool${registeredTools === 1 ? "" : "s"}, stdio transport).`,
  );
}

function registerTools(server: McpServer, client: SignWellClient): number {
  let toolCount = 0;
  toolCount += registerHealthTools(server);
  toolCount += registerFileTools(server);
  toolCount += registerValidateTools(server);
  toolCount += registerDocumentTools(server, client);
  toolCount += registerTemplateTools(server, client);
  return toolCount;
}

function installSignalHandlers(server: McpServer, transport: StdioServerTransport): void {
  const shutdown = async (signal: string) => {
    console.error(`[SignWell MCP] Received ${signal}. Shutting down...`);
    await server.close();
    await transport.close();
    process.exit(0);
  };

  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process.once(signal as NodeJS.Signals, () => {
      shutdown(signal).catch((error) => {
        console.error("[SignWell MCP] Shutdown error:", error);
        process.exit(1);
      });
    });
  });
}

/**
 * Detect if this module is the entry point (Node.js ESM).
 */
function isEntryPoint(): boolean {
  // Compare import.meta.url with the executed script.
  // Resolve both to absolute paths to handle relative invocations (e.g., ./build/index.js).
  try {
    const scriptPath = fileURLToPath(import.meta.url);
    const invokedPath = realpathSync(path.resolve(process.argv[1]));
    return invokedPath === scriptPath;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch((error) => {
    console.error("[SignWell MCP] Startup failed", error);
    process.exitCode = 1;
  });
}
