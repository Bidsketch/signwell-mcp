import { afterEach, expect, test } from "bun:test";

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { EnvError, loadEnv } from "../src/config/env.ts";
import { writeEnvFile } from "../src/setup/env.ts";

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
const originalHome = process.env.SIGNWELL_MCP_HOME;

afterEach(() => {
  trackedKeys.forEach((key) => {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
  if (originalHome) {
    process.env.SIGNWELL_MCP_HOME = originalHome;
  } else {
    delete process.env.SIGNWELL_MCP_HOME;
  }
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
  delete process.env.SIGNWELL_API_BASE_URL;
  delete process.env.SIGNWELL_API_TIMEOUT_MS;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signwell-env-missing-"));
  process.env.SIGNWELL_MCP_HOME = tempDir;

  try {
    expect(() => loadEnv({ version: "0.1.0", quiet: true })).toThrow(EnvError);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadEnv rejects invalid timeout overrides", () => {
  process.env.SIGNWELL_API_KEY = "demo";
  process.env.SIGNWELL_API_TIMEOUT_MS = "not-a-number";

  expect(() => loadEnv({ version: "0.1.0", quiet: true })).toThrow(EnvError);
});

test("loadEnv reads missing values from stored env file", async () => {
  trackedKeys.forEach((key) => {
    delete process.env[key];
  });

  const tempHome = await fsp.mkdtemp(path.join(os.tmpdir(), "signwell-env-file-"));
  process.env.SIGNWELL_MCP_HOME = tempHome;

  await writeEnvFile({
    apiKey: "file-key-123",
    baseUrl: "https://sandbox.signwell.test",
    timeoutMs: 12000,
  });

  const config = loadEnv({ version: "0.5.0", quiet: true });

  expect(config).toEqual({
    apiKey: "file-key-123",
    baseUrl: "https://sandbox.signwell.test",
    timeoutMs: 12000,
    userAgent: "signwell-mcp/0.5.0",
    debug: false,
  });

  await fsp.rm(tempHome, { recursive: true, force: true });
});
