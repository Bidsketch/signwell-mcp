import process from "node:process";

import { z } from "zod";

import { readEnvFileSync } from "./env-file.ts";

export interface SignWellConfig {
  apiKey: string;
  baseUrl: string;
  userAgent: string;
  timeoutMs: number;
  debug: boolean;
}

export function isDebugEnabled(): boolean {
  return process.env.SIGNWELL_DEBUG === "1" || process.env.SIGNWELL_DEBUG === "true";
}

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

export const DEFAULT_BASE_URL = "https://www.signwell.com/api/v1";
export const DEFAULT_TIMEOUT_MS = 90_000;
export const MAX_TIMEOUT_MS = 180_000;

type EnvKey = "SIGNWELL_API_KEY" | "SIGNWELL_API_BASE_URL" | "SIGNWELL_API_TIMEOUT_MS";

const REQUIRED_KEYS: EnvKey[] = [
  "SIGNWELL_API_KEY",
  "SIGNWELL_API_BASE_URL",
  "SIGNWELL_API_TIMEOUT_MS",
];

const ConfigSchema = z.object({
  apiKey: z.string().min(1, { message: "SIGNWELL_API_KEY is required." }),
  baseUrl: z.string().url({ message: "SIGNWELL_API_BASE_URL must be a valid URL." }),
  timeoutMs: z
    .number()
    .refine((value) => Number.isFinite(value), {
      message: "SIGNWELL_API_TIMEOUT_MS must be a valid number.",
    })
    .int({ message: "SIGNWELL_API_TIMEOUT_MS must be an integer (milliseconds)." })
    .positive({ message: "SIGNWELL_API_TIMEOUT_MS must be greater than zero." })
    .max(MAX_TIMEOUT_MS, {
      message: `SIGNWELL_API_TIMEOUT_MS must be <= ${MAX_TIMEOUT_MS} ms.`,
    }),
});

export function loadEnv(options: { version?: string; quiet?: boolean } = {}): SignWellConfig {
  const bunRuntime = globalThis as typeof globalThis & { Bun?: { isTest?: boolean } };
  const quiet = options.quiet ?? detectTestMode(bunRuntime);
  hydrateEnvFromDefaultFile();
  const envInput = {
    apiKey: clean(process.env.SIGNWELL_API_KEY),
    baseUrl: clean(process.env.SIGNWELL_API_BASE_URL) ?? DEFAULT_BASE_URL,
    timeoutMs: parseTimeout(clean(process.env.SIGNWELL_API_TIMEOUT_MS)) ?? DEFAULT_TIMEOUT_MS,
  };

  const result = ConfigSchema.safeParse(envInput);
  if (!result.success) {
    if (!quiet) {
      const formatted = result.error.issues.map((issue) => `- ${issue.message}`).join("\n");
      console.error("[SignWell MCP] Environment validation failed:");
      console.error(formatted);
      console.error(
        "Set SIGNWELL_API_KEY=<your_api_key> (and optional overrides) before starting the server.",
      );
    }
    throw new EnvError("Invalid environment configuration. Fix the errors above and retry.");
  }

  return {
    ...result.data,
    userAgent: buildDefaultUserAgent(options.version),
    debug: isDebugEnabled(),
  };
}

function clean(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseTimeout(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  return Number(value);
}

function buildDefaultUserAgent(version?: string): string {
  return `signwell-mcp/${version ?? "dev"}`;
}

function detectTestMode(runtime: { Bun?: { isTest?: boolean } }): boolean {
  if (typeof runtime.Bun?.isTest === "boolean") {
    return runtime.Bun.isTest;
  }
  if (process.env.BUN_TESTING === "1" || process.env.BUN_TEST === "1") {
    return true;
  }
  return process.env.NODE_ENV === "test";
}

function hydrateEnvFromDefaultFile(): void {
  const missingKeys = REQUIRED_KEYS.filter((key) => isUnset(process.env[key]));
  if (missingKeys.length === 0) {
    return;
  }
  const fileValues = readEnvFileSync();
  if (!fileValues) {
    return;
  }
  for (const key of missingKeys) {
    const value = fileValues[key];
    if (typeof value === "string" && value.length > 0 && isUnset(process.env[key])) {
      process.env[key] = value;
    }
  }
}

function isUnset(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}
