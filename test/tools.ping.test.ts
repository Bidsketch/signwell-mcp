import { expect, test } from "bun:test";

import { handlePing, registerHealthTools } from "../src/tools/ping.ts";

test("handlePing defaults to pong message", async () => {
  const result = await handlePing({});

  expect(result.isError).toBeUndefined();
  expect(result.content[0]?.text).toContain("pong");
});

test("registerHealthTools wires the ping tool", () => {
  const calls: string[] = [];
  const mockServer = {
    registerTool: (name: string, _config: unknown, _handler: unknown) => {
      calls.push(name);
      return {} as unknown;
    },
  };

  const count = registerHealthTools(
    mockServer as unknown as Parameters<typeof registerHealthTools>[0],
  );

  expect(count).toBe(1);
  expect(calls).toContain("ping");
});
