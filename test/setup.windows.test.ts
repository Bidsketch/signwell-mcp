import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { LaunchCommand } from "../src/setup/types.ts";

class WindowsSmokeTransport extends StdioClientTransport {
  private closing?: Promise<void>;

  override close(): Promise<void> {
    this.closing ??= this.closeTree();
    return this.closing;
  }

  private async closeTree(): Promise<void> {
    try {
      // The SDK closes only the launched node (npx), leaving the server holding cwd
      // open. Kill the tree before super.close() discards the parent's PID,
      // including when Client.connect() closes automatically after a failure.
      const pid = this.pid;
      if (pid !== null) {
        const result = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
          encoding: "utf8",
          timeout: 10_000,
        });
        // 128 means the process has already exited.
        if (result.error || (result.status !== 0 && result.status !== 128)) {
          throw new Error(`Windows process cleanup failed: ${result.error ?? result.stderr}`);
        }
      }
    } finally {
      await super.close();
    }
  }
}

// This integration test installs the checkout's tarball; it needs npm registry access.
test.skipIf(process.platform !== "win32")(
  "installed Windows launch initializes MCP through node.exe and npx",
  async () => {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "signwell Windows smoke "));
    const client = new Client({ name: "windows-setup-smoke", version: "1" });
    try {
      const node = Bun.which("node");
      if (!node) throw new Error("The Windows smoke test requires an installed Node/npm layout");
      const npmCli = path.join(path.dirname(node), "node_modules", "npm", "bin", "npm-cli.js");
      const runNode = (args: string[], cwd = dir, timeout = 30_000) => {
        const result = spawnSync(node, args, { cwd, encoding: "utf8", timeout });
        if (result.error || result.status !== 0) {
          throw new Error(`Node command failed: ${result.error ?? result.stderr}`);
        }
        return result.stdout;
      };

      const packed = JSON.parse(
        runNode([npmCli, "pack", "--ignore-scripts", "--json", "--pack-destination", dir], root),
      ) as { filename: string }[];
      await fsp.writeFile(path.join(dir, "package.json"), JSON.stringify({ private: true }));
      runNode(
        [
          npmCli,
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          path.join(dir, packed[0].filename),
        ],
        dir,
        120_000,
      );

      // Generate the command in Node, so process.execPath is node.exe, not bun.exe.
      const compiled = await Bun.build({
        entrypoints: [path.join(root, "src", "setup", "command.ts")],
        outdir: dir,
        target: "node",
        format: "esm",
        naming: "[name].mjs",
      });
      expect(compiled.success).toBe(true);
      // Same lookup as a real install: no SIGNWELL_MCP_HOME, the file sits under %APPDATA%.
      const appData = path.join(dir, "app data");
      const envFile = path.join(appData, "SignWell", "MCP", "env");
      await fsp.mkdir(path.dirname(envFile), { recursive: true });
      await fsp.writeFile(
        envFile,
        "# Windows setup smoke test\r\n\r\nSIGNWELL_API_KEY=smoke=key\r\nSIGNWELL_API_BASE_URL=https://example.invalid/api/v1\r\n",
      );
      const moduleUrl = pathToFileURL(path.join(dir, "command.mjs")).href;
      const launch = JSON.parse(
        runNode([
          "--input-type=module",
          "--eval",
          `import { buildLaunchCommand } from ${JSON.stringify(moduleUrl)};
console.log(JSON.stringify(buildLaunchCommand(process.argv[1], '', 'node', false)));`,
          envFile,
        ]),
      ) as LaunchCommand;
      expect(launch.command).toEndWith("node.exe");
      expect(launch.args[0]).toEndWith("npx-cli.js");

      const transport = new WindowsSmokeTransport({
        ...launch,
        cwd: dir,
        env: {
          ...getDefaultEnvironment(),
          // The key must come from the env file the server reads on its own.
          SIGNWELL_API_KEY: "",
          APPDATA: appData,
          // An empty offline cache makes falling back to the published package fail.
          npm_config_cache: path.join(dir, "empty-cache"),
          npm_config_offline: "true",
        },
        stderr: "pipe",
      });
      let stderr = "";
      transport.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      try {
        await client.connect(transport, { timeout: 15_000 });
        const pkg = JSON.parse(await fsp.readFile(path.join(root, "package.json"), "utf8"));
        expect(client.getServerVersion()).toEqual({ name: "signwell", version: pkg.version });
        const { tools } = await client.listTools({}, { timeout: 5_000 });
        expect(tools.some((tool) => tool.name === "document_get")).toBe(true);
      } catch (error) {
        throw new Error(`Windows launch failed: ${String(error)}\n${stderr}`, { cause: error });
      } finally {
        await transport.close();
      }
    } finally {
      await client.close();
      await fsp.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  },
  180_000,
);
