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

export function buildPosixLaunch(envFilePath: string, entryPoint: string, runner: Runner): string {
  const envFile = shellQuote(envFilePath);
  const entry = shellQuote(entryPoint);
  return `set -a && . ${envFile} && set +a && node ${entry}`;
}

export function buildPowerShellLaunch(
  envFilePath: string,
  entryPoint: string,
  runner: Runner,
): string {
  const envFile = psQuote(envFilePath);
  const entry = psQuote(entryPoint);
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
  scriptParts.push(`node ${entry}`);
  return scriptParts.join("; ");
}

export function buildLaunchCommand(
  envFilePath: string,
  entryPoint: string,
  runner: Runner,
): LaunchCommand {
  if (process.platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        buildPowerShellLaunch(envFilePath, entryPoint, runner),
      ],
    };
  }

  return {
    command: "/bin/sh",
    args: ["-c", buildPosixLaunch(envFilePath, entryPoint, runner)],
  };
}
