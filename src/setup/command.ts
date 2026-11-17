import path from "node:path";
import process from "node:process";

import type { LaunchCommand, Runner } from "./types.ts";

function shellQuote(value: string): string {
  const escaped = value.replace(/'/g, () => `'\\''`);
  return `'${escaped}'`;
}

/**
 * Resolve the absolute path to the `node` binary running this process.
 * GUI-launched apps (Claude Desktop, Cursor, etc.) inherit a minimal PATH
 * that may resolve `node` to an old system install. Using the absolute path
 * ensures the same Node version that ran `setup` is used at runtime.
 */
function resolveNodeBin(): string {
  return process.execPath;
}

export function buildPosixLaunch(
  envFilePath: string,
  entryPoint: string,
  _runner: Runner,
  isLocalDev: boolean,
): string {
  const envFile = shellQuote(envFilePath);
  const nodeBin = shellQuote(resolveNodeBin());
  const runCmd = isLocalDev
    ? `${nodeBin} ${shellQuote(entryPoint)}`
    : `${nodeBin} ${shellQuote(resolveNpxCli("posix"))} -y @signwell/mcp`;
  return `set -a && . ${envFile} && set +a && ${runCmd}`;
}

/**
 * Resolve the npx JavaScript entry point next to the `node` binary running setup.
 * On Windows the `npx` file beside node.exe is a bash script that node cannot load,
 * so point at npm's npx-cli.js instead.
 */
export function resolveNpxCli(
  flavor: "win32" | "posix",
  execPath: string = process.execPath,
): string {
  if (flavor === "win32") {
    return path.win32.join(
      path.win32.dirname(execPath),
      "node_modules",
      "npm",
      "bin",
      "npx-cli.js",
    );
  }
  return path.posix.join(path.posix.dirname(execPath), "npx");
}

// No shell on Windows: the server loads the env file setup wrote by itself, and a
// powershell.exe wrapper stalls the MCP stdio stream under Windows PowerShell 5.1.
export function buildWindowsLaunch(entryPoint: string, isLocalDev: boolean): LaunchCommand {
  return {
    command: resolveNodeBin(),
    args: isLocalDev ? [entryPoint] : [resolveNpxCli("win32"), "-y", "@signwell/mcp"],
  };
}

export function buildLaunchCommand(
  envFilePath: string,
  entryPoint: string,
  runner: Runner,
  isLocalDev: boolean,
): LaunchCommand {
  if (process.platform === "win32") {
    return buildWindowsLaunch(entryPoint, isLocalDev);
  }

  return {
    command: "/bin/sh",
    args: ["-c", buildPosixLaunch(envFilePath, entryPoint, runner, isLocalDev)],
  };
}
