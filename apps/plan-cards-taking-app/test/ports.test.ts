// @vitest-environment node
import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import baseConfig from "../vite.config";
import liveConfig from "../vite.live.config";
// @ts-expect-error plain ESM script without types
import { main, portInUse } from "../scripts/dev-live.mjs";

const open: net.Server[] = [];

function listen(host: string): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    open.push(server);
    server.once("error", reject);
    server.listen(0, host, () => resolve({ server, port: (server.address() as net.AddressInfo).port }));
  });
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
  });
}

afterEach(async () => {
  await Promise.all(open.splice(0).map(close));
});

async function ipv6Bindable(): Promise<boolean> {
  try {
    const { server } = await listen("::1");
    await close(server);
    return true;
  } catch {
    return false;
  }
}

describe("config pins", () => {
  it("pins the base config to 5266 with strictPort for server and preview", () => {
    expect(baseConfig.server?.port).toBe(5266);
    expect(baseConfig.server?.strictPort).toBe(true);
    expect(baseConfig.preview?.port).toBe(5266);
    expect(baseConfig.preview?.strictPort).toBe(true);
  });

  it("pins the live config to 5197 with strictPort and keeps the base test and build settings", () => {
    const live = liveConfig as typeof baseConfig;
    expect(live.server?.port).toBe(5197);
    expect(live.server?.strictPort).toBe(true);
    expect(live.preview?.port).toBe(5197);
    expect(live.preview?.strictPort).toBe(true);
    expect(live.test?.environment).toBe("jsdom");
    expect(live.build?.outDir).toBe("dist");
  });
});

describe("dev pre-bundling", () => {
  it("makes the base config pre-bundle the units with the automatic JSX runtime", () => {
    expect(baseConfig.optimizeDeps?.esbuildOptions?.jsx).toBe("automatic");
  });

  it("keeps the automatic JSX runtime for pre-bundling in the live config", () => {
    const live = liveConfig as typeof baseConfig;
    expect(live.optimizeDeps?.esbuildOptions?.jsx).toBe("automatic");
  });
});

describe("package.json scripts", () => {
  it("keeps dev bare, adds dev:live, and uses no --port flag", () => {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.scripts.dev).toBe("vite");
    expect(pkg.scripts["dev:live"]).toBe("node ./scripts/dev-live.mjs");
    for (const value of Object.values(pkg.scripts) as string[]) expect(value).not.toContain("--port");
  });
});

describe("portInUse", () => {
  it("sees a listener on 127.0.0.1 and sees it gone after close", async () => {
    const { server, port } = await listen("127.0.0.1");
    expect(await portInUse(port)).toBe(true);
    await close(server);
    expect(await portInUse(port)).toBe(false);
  });

  it("sees a listener on ::1 and sees it gone after close (skipped when ::1 cannot be bound)", async () => {
    if (!(await ipv6Bindable())) return;
    const { server, port } = await listen("::1");
    expect(await portInUse(port)).toBe(true);
    await close(server);
    expect(await portInUse(port)).toBe(false);
  });
});

describe("main", () => {
  it("refuses an occupied port without starting vite", async () => {
    const { port } = await listen("127.0.0.1");
    const spawnFn = vi.fn();
    const err = vi.fn();
    const code = await main({ port, spawnFn, log: vi.fn(), err });
    expect(code).toBe(1);
    expect(spawnFn).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toContain("already in use");
  });

  it("starts vite with the live config on a free port and leaves no signal listeners", async () => {
    const { server, port } = await listen("127.0.0.1");
    await close(server);
    const sigint = process.listenerCount("SIGINT");
    const sigterm = process.listenerCount("SIGTERM");
    const log = vi.fn();
    const spawnFn = vi.fn(() => {
      const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    });
    const code = await main({ port, spawnFn, log, err: vi.fn() });
    expect(code).toBe(0);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [exe, args, opts] = spawnFn.mock.calls[0] as unknown as [string, string[], { stdio: string }];
    expect(exe.endsWith("node_modules/.bin/vite")).toBe(true);
    expect(args).toEqual(["--config", "vite.live.config.ts"]);
    expect(opts.stdio).toBe("inherit");
    expect(log).toHaveBeenCalledTimes(4);
    expect(log.mock.calls[0][0]).toContain(`http://localhost:${port}`);
    expect(log.mock.calls[1][0]).toContain("5266 is refused");
    expect(log.mock.calls[2][0]).toContain("TEST vault");
    expect(log.mock.calls[3][0]).toContain("reload ends the session");
    expect(process.listenerCount("SIGINT")).toBe(sigint);
    expect(process.listenerCount("SIGTERM")).toBe(sigterm);
  });

  it("reports a failed vite start and leaves no signal listeners", async () => {
    const { server, port } = await listen("127.0.0.1");
    await close(server);
    const sigint = process.listenerCount("SIGINT");
    const sigterm = process.listenerCount("SIGTERM");
    const err = vi.fn();
    const spawnFn = vi.fn(() => {
      const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
      queueMicrotask(() => child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })));
      return child;
    });
    const code = await main({ port, spawnFn, log: vi.fn(), err });
    expect(code).toBe(1);
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toContain("Run npm ci");
    expect(process.listenerCount("SIGINT")).toBe(sigint);
    expect(process.listenerCount("SIGTERM")).toBe(sigterm);
  });
});
