// @vitest-environment node
import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import baseConfig from "../vite.config";
import liveConfig from "../vite.live.config";
// @ts-expect-error plain ESM script without types
import { main } from "../scripts/dev-live.mjs";

const open: net.Server[] = [];
const listen = (): Promise<{ server: net.Server; port: number }> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    open.push(server);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as net.AddressInfo).port }));
  });
const close = (server: net.Server): Promise<void> => new Promise((resolve) => (server.listening ? server.close(() => resolve()) : resolve()));
afterEach(async () => { await Promise.all(open.splice(0).map(close)); });

const logFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "devlive-")), "live.log");
const quiet = () => ({ log: vi.fn(), err: vi.fn(), spawnFn: vi.fn(), logFile: logFile() });

describe("L1 dev-live.mjs", () => {
  it("L1 refuses a missing vault", async () => {
    const o = quiet();
    expect(await main({ argv: [], ...o })).toBe(1);
    expect(o.spawnFn).not.toHaveBeenCalled();
    expect(String(o.err.mock.calls[0][0])).toContain("usage: node scripts/dev-live.mjs --vault");
  });

  it("L1 refuses a vault that is not an https://<host>/vault address", async () => {
    for (const bad of ["http://ann.example.test/vault", "https://ann.example.test", "https://ann.example.test/vault/", "https://ann.example.test:8443/vault", "https://ann.example.test/vault?x=1", "ann.example.test/vault", "https://ann.example.test/base"]) {
      const o = quiet();
      expect(await main({ argv: ["--vault", bad], ...o }), bad).toBe(1);
      expect(o.spawnFn, bad).not.toHaveBeenCalled();
      expect(String(o.err.mock.calls[0][0]), bad).toContain("https://<host>/vault");
    }
  });

  it("L1 refuses a busy port without starting vite", async () => {
    const { port } = await listen();
    const o = quiet();
    expect(await main({ argv: ["--vault", "https://testvault.gilb.com/vault"], port, ...o })).toBe(1);
    expect(o.spawnFn).not.toHaveBeenCalled();
    expect(String(o.err.mock.calls[0][0])).toContain("already in use");
  });

  const started = async (argv: string[]) => {
    const { server, port } = await listen();
    await close(server);
    const o = quiet();
    const spawnFn = vi.fn(() => { const child = Object.assign(new EventEmitter(), { kill: vi.fn() }); queueMicrotask(() => child.emit("exit", 0)); return child; });
    const code = await main({ argv, port, ...o, spawnFn });
    return { code, port, o, spawnFn };
  };

  it("L1 starts vite for a vault under gilb.com with the default origins, every VITE_ variable set, the URL and the reload line printed", async () => {
    const { code, port, o, spawnFn } = await started(["--vault", "https://testvault.gilb.com/vault"]);
    expect(code).toBe(0);
    const [exe, args, opts] = spawnFn.mock.calls[0] as unknown as [string, string[], { env: Record<string, string>; stdio: unknown[] }];
    expect(exe.endsWith("node_modules/.bin/vite")).toBe(true);
    expect(args).toEqual(["--config", "vite.live.config.ts"]);
    expect(opts.env.VITE_PLATFORM).toBe("live");
    expect(opts.env.VITE_PINNED_VAULT).toBe("https://testvault.gilb.com/vault");
    expect(opts.env.VITE_ID_ORIGIN).toBe("https://id.gilb.com");
    expect(opts.env.VITE_PLATFORM_ORIGIN).toBe("https://gilb.com");
    expect(typeof opts.stdio[1]).toBe("number"); // a file, not the terminal
    const said = o.log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(said).toContain(`http://localhost:${port}`);
    expect(said).toContain("https://id.gilb.com");
    expect(said).toContain("https://gilb.com");
    expect(said).toContain("On this local check a reload signs you out; sign in again with a new code.");
  });

  it("L1 for a vault not under gilb.com it refuses unless BOTH --id and --platform are given, and guesses nothing", async () => {
    const vault = ["--vault", "https://ann.example.test/vault"];
    for (const extra of [[], ["--id", "https://id.example.test"], ["--platform", "https://example.test"]]) {
      const r = await started([...vault, ...extra]);
      expect(r.code, extra.join(" ")).toBe(1);
      expect(r.spawnFn).not.toHaveBeenCalled();
      expect(String(r.o.err.mock.calls[0][0])).toContain("both --id");
    }
    const ok = await started([...vault, "--id", "https://id.example.test", "--platform", "https://example.test"]);
    expect(ok.code).toBe(0);
    const env = (ok.spawnFn.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }])[2].env;
    expect(env.VITE_ID_ORIGIN).toBe("https://id.example.test");
    expect(env.VITE_PLATFORM_ORIGIN).toBe("https://example.test");
  });

  it("L1 pins the live config to 5251 with strictPort, keeps the base one on 5261, and dev:live has no --port", () => {
    const live = liveConfig as typeof baseConfig;
    expect(live.server).toMatchObject({ port: 5251, strictPort: true });
    expect(live.preview).toMatchObject({ port: 5251, strictPort: true });
    expect(baseConfig.server).toMatchObject({ port: 5261, strictPort: true });
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.scripts["dev:live"]).toBe("node scripts/dev-live.mjs");
    expect(pkg.scripts.dev).toBe("vite");
    for (const v of Object.values(pkg.scripts) as string[]) expect(v).not.toContain("--port");
  });
});
