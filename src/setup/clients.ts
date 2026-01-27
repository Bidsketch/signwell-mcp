import { applyClaudeCodeConfig, buildClaudeCodeSnippet } from "./claude-code.ts";
import { applyClaudeDesktopConfig, buildClaudeDesktopSnippet } from "./claude-desktop.ts";
import { applyCursorConfig, buildCursorSnippet } from "./cursor.ts";
import { applyOpenCodeConfig, buildOpenCodeSnippet } from "./opencode.ts";
import type {
  ClientSnippet,
  ClientWriteOptions,
  ClientWriteResult,
  SetupRenderContext,
} from "./types.ts";

export type ClientKey = "claude-desktop" | "claude-code" | "cursor" | "opencode";

export interface ClientConfig {
  key: ClientKey;
  label: string;
  buildSnippet: (context: SetupRenderContext) => ClientSnippet;
  applyConfig: (
    context: SetupRenderContext,
    options: ClientWriteOptions,
  ) => Promise<ClientWriteResult>;
}

export const CLIENT_CONFIGS: ClientConfig[] = [
  {
    key: "claude-desktop",
    label: "Claude Desktop",
    buildSnippet: buildClaudeDesktopSnippet,
    applyConfig: applyClaudeDesktopConfig,
  },
  {
    key: "claude-code",
    label: "Claude Code",
    buildSnippet: buildClaudeCodeSnippet,
    applyConfig: applyClaudeCodeConfig,
  },
  {
    key: "cursor",
    label: "Cursor",
    buildSnippet: buildCursorSnippet,
    applyConfig: applyCursorConfig,
  },
  {
    key: "opencode",
    label: "OpenCode",
    buildSnippet: buildOpenCodeSnippet,
    applyConfig: applyOpenCodeConfig,
  },
];

export const ALL_CLIENT_KEYS: ClientKey[] = CLIENT_CONFIGS.map((config) => config.key);

const CLIENT_CONFIG_MAP = new Map<ClientKey, ClientConfig>(
  CLIENT_CONFIGS.map((config) => [config.key, config]),
);

export const CLIENT_KEY_HELP = ALL_CLIENT_KEYS.join(", ");

export function parseClientKeys(input?: string): ClientKey[] {
  if (!input) {
    return [...ALL_CLIENT_KEYS];
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.toLowerCase() === "all") {
    return [...ALL_CLIENT_KEYS];
  }

  const tokens = trimmed
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) {
    return [...ALL_CLIENT_KEYS];
  }

  const keys: ClientKey[] = [];
  for (const token of tokens) {
    if (!CLIENT_CONFIG_MAP.has(token as ClientKey)) {
      throw new Error(`Unknown client "${token}". Valid options: ${CLIENT_KEY_HELP}.`);
    }
    const key = token as ClientKey;
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

export function resolveClientConfigs(keys: ClientKey[]): ClientConfig[] {
  return keys.map((key) => {
    const config = CLIENT_CONFIG_MAP.get(key);
    if (!config) {
      throw new Error(`Unsupported client key: ${key}`);
    }
    return config;
  });
}
