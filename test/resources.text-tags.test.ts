import { describe, expect, test } from "bun:test";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerTextTagsResource, TEXT_TAGS_GUIDE } from "../src/resources/text-tags.ts";

type ResourceHandler = (uri: URL) => Promise<{
  contents: Array<{ uri: string; mimeType?: string; text: string }>;
}>;

describe("registerTextTagsResource", () => {
  test("registers resource with correct metadata", () => {
    let registeredName = "";
    let registeredUri = "";
    let registeredMeta: Record<string, unknown> = {};

    const serverStub = {
      registerResource: (
        name: string,
        uri: string,
        meta: Record<string, unknown>,
        _readCb: ResourceHandler,
      ) => {
        registeredName = name;
        registeredUri = uri;
        registeredMeta = meta;
        return {} as unknown;
      },
    } satisfies Partial<McpServer>;

    registerTextTagsResource(serverStub as unknown as McpServer);

    expect(registeredName).toBe("text_tags_guide");
    expect(registeredUri).toBe("signwell://text-tags-guide");
    expect(registeredMeta.title).toBe("SignWell Text Tags Guide");
  });

  test("resource returns guide content as markdown", async () => {
    let resourceHandler: ResourceHandler | null = null;

    const serverStub = {
      registerResource: (
        _name: string,
        _uri: string,
        _meta: Record<string, unknown>,
        readCb: ResourceHandler,
      ) => {
        resourceHandler = readCb;
        return {} as unknown;
      },
    } satisfies Partial<McpServer>;

    registerTextTagsResource(serverStub as unknown as McpServer);

    if (!resourceHandler) {
      throw new Error("resource handler not registered");
    }

    const response = await resourceHandler(new URL("signwell://text-tags-guide"));

    expect(response.contents).toHaveLength(1);
    expect(response.contents[0]?.mimeType).toBe("text/markdown");
    expect(response.contents[0]?.text).toBe(TEXT_TAGS_GUIDE);
  });

  test("guide contains essential documentation", () => {
    expect(TEXT_TAGS_GUIDE).toContain("{{signature:1:y}}");
    expect(TEXT_TAGS_GUIDE).toContain("text_tags: true");
    expect(TEXT_TAGS_GUIDE).toContain("Signer Number");
    expect(TEXT_TAGS_GUIDE).toContain("recipient");
  });
});
