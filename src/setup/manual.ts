import { buildPosixLaunch, buildPowerShellLaunch } from "./command.ts";
import type { ClientSnippet, SetupRenderContext } from "./types.ts";

export function buildManualSnippet(context: SetupRenderContext): ClientSnippet {
  const posixCommand = buildPosixLaunch(context.envFilePath, context.entryPoint, context.runner);
  const powerShellScript = buildPowerShellLaunch(
    context.envFilePath,
    context.entryPoint,
    context.runner,
  );
  const quotedScript = JSON.stringify(powerShellScript);
  const windowsCommand = [
    "powershell.exe",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    quotedScript,
  ].join(" ");

  const snippetLines = [
    "# POSIX shells",
    posixCommand,
    "",
    "# Windows (PowerShell)",
    windowsCommand,
  ].join("\n");

  const envNotes =
    context.environment && Object.keys(context.environment).length > 0
      ? [
          "",
          "# Additional environment (set before running if needed)",
          ...Object.entries(context.environment).map(([key, value]) => `${key}=${value}`),
        ].join("\n")
      : "";

  return {
    name: "Manual",
    configPath: context.envFilePath,
    snippet: envNotes ? `${snippetLines}\n${envNotes}` : snippetLines,
    notes: [
      "Use these commands when integrating with an MCP client that does not yet automate configuration.",
      "The env file is only readable by your user (0600) and can be sourced before launching the server.",
    ],
  };
}
