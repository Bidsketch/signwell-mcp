import { afterEach, expect, test } from "bun:test";

import { main } from "../src/index.ts";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
});

function captureConsole(method: "log" | "error") {
  const original = console[method] as (...args: unknown[]) => void;
  const messages: string[] = [];
  console[method] = ((...args: unknown[]) => {
    messages.push(args.join(" "));
  }) as typeof console.log;
  return {
    messages,
    restore: () => {
      console[method] = original as typeof console.log;
    },
  };
}

test("main --version prints a version string", async () => {
  const capture = captureConsole("log");
  try {
    await main(["--version"]);
  } finally {
    capture.restore();
  }

  // Version is "dev" during tests (no esbuild), or semver in production
  const output = capture.messages.at(-1) ?? "";
  expect(output === "dev" || /^\d+\.\d+\.\d+/.test(output)).toBe(true);
});

test("main --help prints usage guidance", async () => {
  const capture = captureConsole("log");
  try {
    await main(["--help"]);
  } finally {
    capture.restore();
  }

  expect(capture.messages.join("\n")).toContain("Usage:");
  expect(capture.messages.join("\n")).toContain("SIGNWELL_API_KEY");
});
