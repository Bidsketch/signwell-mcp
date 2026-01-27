import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  formatEnv,
  getConfigRoot,
  getEnvFilePath,
  readExistingEnv,
  writeEnvFile,
} from "../src/setup/env.ts";

const ORIGINAL_HOME = process.env.SIGNWELL_MCP_HOME;
const TMP_PREFIX = path.join(os.tmpdir(), "signwell-mcp-env-");
let tempDir: string;

beforeAll(async () => {
  tempDir = await fsp.mkdtemp(TMP_PREFIX);
  process.env.SIGNWELL_MCP_HOME = tempDir;
});

afterAll(async () => {
  if (ORIGINAL_HOME) {
    process.env.SIGNWELL_MCP_HOME = ORIGINAL_HOME;
  } else {
    delete process.env.SIGNWELL_MCP_HOME;
  }
  if (tempDir) {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
});

describe("setup env helpers", () => {
  test("getConfigRoot honors override", () => {
    const root = getConfigRoot();
    expect(root).toBe(tempDir);
    const envPath = getEnvFilePath();
    expect(envPath.startsWith(tempDir)).toBe(true);
  });

  test("formatEnv prints overrides only when provided", () => {
    const defaultContent = formatEnv({ apiKey: "abc" });
    expect(defaultContent).toContain("SIGNWELL_API_KEY=abc");
    expect(defaultContent).not.toContain("SIGNWELL_API_BASE_URL");

    const overrideContent = formatEnv({
      apiKey: "xyz",
      baseUrl: "https://sandbox.signwell.com",
      timeoutMs: 15000,
    });
    expect(overrideContent).toContain("SIGNWELL_API_BASE_URL=https://sandbox.signwell.com");
    expect(overrideContent).toContain("SIGNWELL_API_TIMEOUT_MS=15000");
  });

  test("writeEnvFile persists values with secure permissions", async () => {
    const result = await writeEnvFile({ apiKey: "test-key-123" });
    expect(result.wroteFile).toBe(true);
    expect(result.path.startsWith(tempDir)).toBe(true);

    const stat = await fsp.stat(result.path);
    if (process.platform !== "win32") {
      expect(stat.mode & 0o777).toBe(0o600);
    }

    const parsed = await readExistingEnv(result.path);
    expect(parsed.apiKey).toBe("test-key-123");
  });

  test("writeEnvFile respects printOnly", async () => {
    const preview = await writeEnvFile(
      { apiKey: "no-write" },
      { printOnly: true, filePathOverride: path.join(tempDir, "preview.env") },
    );
    expect(preview.wroteFile).toBe(false);
    expect(fs.existsSync(preview.path)).toBe(false);
    expect(preview.contents).toContain("no-write");
  });
});
