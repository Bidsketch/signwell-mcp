import { afterEach, expect, test } from "bun:test";

import { EnvError, loadEnv } from "../src/config/env.ts";

type EnvKey = "SIGNWELL_API_KEY" | "SIGNWELL_API_BASE_URL" | "SIGNWELL_API_TIMEOUT_MS";

const trackedKeys: EnvKey[] = [
  "SIGNWELL_API_KEY",
  "SIGNWELL_API_BASE_URL",
  "SIGNWELL_API_TIMEOUT_MS",
];

const originalEnv: Record<EnvKey, string | undefined> = {
  SIGNWELL_API_KEY: process.env.SIGNWELL_API_KEY,
  SIGNWELL_API_BASE_URL: process.env.SIGNWELL_API_BASE_URL,
  SIGNWELL_API_TIMEOUT_MS: process.env.SIGNWELL_API_TIMEOUT_MS,
};

afterEach(() => {
  trackedKeys.forEach((key) => {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
});

test("loadEnv reads and trims overrides", () => {
  process.env.SIGNWELL_API_KEY = "  demo-key  ";
  process.env.SIGNWELL_API_BASE_URL = " https://example.signwell.test ";
  process.env.SIGNWELL_API_TIMEOUT_MS = " 5000 ";

  const config = loadEnv({ version: "0.1.0" });

  expect(config).toEqual({
    apiKey: "demo-key",
    baseUrl: "https://example.signwell.test",
    userAgent: "signwell-mcp/0.1.0",
    timeoutMs: 5000,
    debug: false,
  });
});

test("loadEnv applies defaults and enforces required API key", () => {
  delete process.env.SIGNWELL_API_KEY;

  expect(() => loadEnv({ version: "0.1.0", quiet: true })).toThrow(EnvError);
});

test("loadEnv rejects invalid timeout overrides", () => {
  process.env.SIGNWELL_API_KEY = "demo";
  process.env.SIGNWELL_API_TIMEOUT_MS = "not-a-number";

  expect(() => loadEnv({ version: "0.1.0", quiet: true })).toThrow(EnvError);
});
