import { buildPosixLaunch, buildWindowsLaunch } from "./command.ts";
import type { ClientSnippet, SetupRenderContext } from "./types.ts";

export function buildManualSnippet(context: SetupRenderContext): ClientSnippet {
  const posixCommand = buildPosixLaunch(
    context.envFilePath,
    context.entryPoint,
    context.runner,
    context.isLocalDev,
  );
  const windowsLaunch = buildWindowsLaunch(context.entryPoint, context.isLocalDev);
  const windowsCommand = [windowsLaunch.command, ...windowsLaunch.args]
    .map((part) => (/[\s"]/.test(part) ? JSON.stringify(part) : part))
    .join(" ");

  const snippetLines = [
    "# POSIX shells",
    posixCommand,
    "",
    "# Windows (Command Prompt; the server reads the env file itself)",
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
