import { afterEach, expect, test } from "bun:test";

import { SignWellClient } from "../src/signwell/client.ts";
import { SignWellError } from "../src/signwell/errors.ts";
import { installMockFetch, jsonErrorResponse, jsonResponse } from "./helpers/mockFetch.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createClient(overrides: Partial<ConstructorParameters<typeof SignWellClient>[0]> = {}) {
  return new SignWellClient({
    apiKey: "test-key",
    baseUrl: "https://api.signwell.test/v1",
    userAgent: "signwell-mcp/test",
    timeoutMs: 200,
    ...overrides,
  });
}

test("request adds auth header and query params", async () => {
  const calls = installMockFetch(async () => jsonResponse({ ok: true }));

  const client = createClient();
  await client.get("/documents", { query: { status: "draft", page: 1 } });

  expect(calls).toHaveLength(1);
  expect(calls[0]?.input.toString()).toContain("/documents?status=draft&page=1");
  const headers = new Headers(calls[0]?.init?.headers);
  expect(headers.get("X-Api-Key")).toBe("test-key");
  expect(headers.get("User-Agent")).toBe("signwell-mcp/test");
});

test("post serializes json body and parses response", async () => {
  let receivedBody = "";
  installMockFetch(async (_call) => {
    receivedBody = _call.init?.body as string;
    return jsonResponse({ id: "doc_123" });
  });

  const client = createClient();
  const result = await client.post("/documents", { name: "Test" });

  expect(receivedBody).toBe(JSON.stringify({ name: "Test" }));
  expect(result).toEqual({ id: "doc_123" });
});

test("retries on HTTP 429 up to max attempts", async () => {
  let attempts = 0;
  installMockFetch(async () => {
    attempts += 1;
    if (attempts < 3) {
      return jsonErrorResponse({ message: "Rate limited" }, { status: 429 });
    }
    return jsonResponse({ ok: true });
  });

  const client = createClient();
  await client.get("/documents");

  expect(attempts).toBe(3);
});

test("does not retry non-idempotent POST on server error", async () => {
  let attempts = 0;
  installMockFetch(async () => {
    attempts += 1;
    return jsonErrorResponse({ message: "Server error" }, { status: 500 });
  });

  const client = createClient();
  await expect(client.post("/documents", { name: "fail" })).rejects.toBeInstanceOf(SignWellError);
  expect(attempts).toBe(1);
});

test("aborts when timeout exceeded", async () => {
  installMockFetch(
    () =>
      new Promise((_resolve, reject) => {
        reject(new DOMException("Aborted", "AbortError"));
      }),
  );

  const client = createClient({ timeoutMs: 50 });

  await expect(client.get("/documents")).rejects.toBeInstanceOf(SignWellError);
});
