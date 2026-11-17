import path from "node:path";
import process from "node:process";

import type { LaunchCommand, Runner } from "./types.ts";

function shellQuote(value: string): string {
  const escaped = value.replace(/'/g, () => `'\\''`);
  return `'${escaped}'`;
}

function psQuote(value: string): string {
  const escaped = value.replace(/'/g, "''");
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

export function buildPowerShellLaunch(
  envFilePath: string,
  entryPoint: string,
  _runner: Runner,
  isLocalDev: boolean,
): string {
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
    "        Set-Item -LiteralPath ('Env:' + $name) -Value $value",
    "      }",
    "    }",
    "  }",
    "}",
  ];
  // A quoted path is only a string in PowerShell; `&` is what runs it.
  const runCmd = isLocalDev
    ? `& ${nodeBin} ${psQuote(entryPoint)}`
    : `& ${nodeBin} ${psQuote(resolveNpxCli("win32"))} -y @signwell/mcp`;
  scriptParts.push(runCmd);
  return scriptParts.join("; ");
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

export function buildLaunchCommand(
  envFilePath: string,
  entryPoint: string,
  runner: Runner,
  isLocalDev: boolean,
): LaunchCommand {
  if (process.platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        buildPowerShellLaunch(envFilePath, entryPoint, runner, isLocalDev),
      ],
    };
  }

  return {
    command: "/bin/sh",
    args: ["-c", buildPosixLaunch(envFilePath, entryPoint, runner, isLocalDev)],
  };
}
