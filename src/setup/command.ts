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
    : `${nodeBin} ${shellQuote(resolveNpxBin())} -y signwell-mcp`;
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
    "        $env:$name = $value",
    "      }",
    "    }",
    "  }",
    "}",
  ];
  const runCmd = isLocalDev
    ? `${nodeBin} ${psQuote(entryPoint)}`
    : `${nodeBin} ${psQuote(resolveNpxBin())} -y signwell-mcp`;
  scriptParts.push(runCmd);
  return scriptParts.join("; ");
}

/**
 * Resolve the absolute path to `npx` next to the current `node` binary.
 */
function resolveNpxBin(): string {
  const nodeDir = process.execPath.replace(/[/\\]node([.][a-z]+)?$/i, "");
  return `${nodeDir}/npx`;
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
