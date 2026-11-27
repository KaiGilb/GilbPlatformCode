// @vitest-environment node
/**
 * Preview (POST /v1/preview): the bridge serves a project's BUILT app (dist/ or build/) on the port the project pins, read-only, on loopback.
 * WHY these tests: the preview port is reachable by every page in every tab, so each refusal (bad name, link out, bad port, rebinding host,
 * CORS, paired origin) is tested against the running server, not read off the code.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createBridge, snapshotBuild, computerSandboxSettings, protectedPlaces } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const MSG_NOBUILD = (n) => `No build yet for ${n}. Run npm run build in the project folder, then press Open again.`;
const SENTENCE = "When you change the app, finish by running `npm run build` in the project folder. Do not tell the person to run a terminal command or to start a server. The chat shows an Open button for the built app; after a rebuild, tell them to press Open again to see the new build.";

const HAS_DEVFD = process.platform !== "win32" && fs.existsSync("/dev/fd");
let dir, bridge, base, ws, secret, logFile, extra = [];

/** A free port: the OS picks it (listen on 0), and it must be one a preview accepts (1024 or more, not another service's: 5173/5197/5251, 5432, 8780-8819...). Retries instead of scanning a range. */
const portUsable = (n) => n >= 1024 && ![5432, 3306, 6379, 27017, 8787, 8789, 5173, 5197, 5251].includes(n) && !(n >= 8780 && n <= 8819);
async function freePort() {
  for (let i = 0; i < 200; i++) {
    const p = await new Promise((resolve, reject) => { const s = net.createServer(); s.once("error", reject); s.listen(0, "127.0.0.1", () => { const n = s.address().port; s.close(() => resolve(n)); }); });
    if (portUsable(p)) return p;
  }
  throw new Error("no free port");
}
const listenOn = (host, port) => new Promise((resolve, reject) => { const s = net.createServer(); s.once("error", reject); s.listen({ host, port, exclusive: true }, () => resolve(s)); });

async function start({ allowed = [APP], bridgeOpts = {}, stateDir = true } = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-prev-")));
  logFile = path.join(dir, "claude.log");
  ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  ws = fs.realpathSync.native(ws);
  bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: allowed, workDir: path.join(dir, "work"), home: dir, workspace: ws, codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", env: { ...process.env, FAKE_CLAUDE_LOG: logFile }, ...(stateDir ? { stateDir: path.join(dir, "state") } : {}), ...bridgeOpts });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  const r = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin: allowed[0] }, body: JSON.stringify({ code: bridge.pairingCode }) });
  secret = (await r.json()).secret;
}
/** A project "app" with a build, an .env, a link out, and a pinned preview port. */
function mkApp(name, port, { config = `export default { preview: { port: ${port}, strictPort: true } };\n`, folder = "dist" } = {}) {
  const p = path.join(ws, name);
  fs.mkdirSync(path.join(p, folder, "assets"), { recursive: true });
  fs.writeFileSync(path.join(p, folder, "index.html"), "<!doctype html><title>APP-INDEX</title>");
  fs.writeFileSync(path.join(p, folder, "assets", "a.js"), "console.log(1)");
  fs.writeFileSync(path.join(p, folder, ".env"), "SECRET=1");
  fs.symlinkSync("/etc", path.join(p, folder, "out"));
  fs.writeFileSync(path.join(p, "package.json"), '{"name":"PKG-LEAK"}');
  if (config !== null) fs.writeFileSync(path.join(p, "vite.config.ts"), config);
  return p;
}
const open = (project, sec = secret, origin = APP) => fetch(`${base}/v1/preview`, { method: "POST", headers: { "content-type": "application/json", origin, ...(sec ? { "x-bridge-secret": sec } : {}) }, body: JSON.stringify({ project }) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null), headers: r.headers }));
/** A raw request to the preview server: the path is sent exactly as written (fetch would tidy ../). */
const get = (port, p, { method = "GET", host = `localhost:${port}` } = {}) => new Promise((resolve, reject) => {
  const rq = http.request({ host: "127.0.0.1", port, path: p, method, headers: { host } }, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
  });
  rq.on("error", reject);
  rq.end();
});
const refusedAt = (host, port) => new Promise((resolve) => { const s = net.connect({ host, port }); s.once("connect", () => { s.destroy(); resolve(false); }); s.once("error", () => resolve(true)); });
const refused = (port) => refusedAt("127.0.0.1", port);
/** Nothing listens on either family (an IPv6-less machine counts as refused). */
const nothingAt = async (port) => (await refusedAt("127.0.0.1", port)) && (await refusedAt("::1", port));
const snaps = () => { try { return fs.readdirSync(path.join(dir, "state", "previews")); } catch { return []; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pair = async () => { const r = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ code: bridge.pairingCode }) }); secret = (await r.json()).secret; };

afterEach(async () => {
  for (const s of extra) await new Promise((r) => s.close(() => r()));
  extra = [];
  await bridge?.close();
  bridge = undefined;
  if (dir) await removeTestDir(dir);
  dir = undefined;
});

describe("preview route", () => {
  it("answers 401 without the secret; 200 {url} with it; a second call reuses the server", async () => {
    // Spec: H1a.1 — paired only, start then reuse (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    const port = await freePort();
    mkApp("app", port);
    expect((await open("app", "")).status).toBe(401);
    expect((await open("app", "0".repeat(64))).status).toBe(401);
    const a = await open("app");
    expect(a.status).toBe(200);
    expect(a.json).toEqual({ url: `http://localhost:${port}/`, project: "app", folder: "dist" });
    const b = await open("app");
    expect(b.status).toBe(200);
    expect(b.json).toEqual(a.json);
    expect((await get(port, "/")).status).toBe(200);
    // Any other method on the route is 405.
    const g = await fetch(`${base}/v1/preview`, { headers: { "x-bridge-secret": secret, origin: APP } });
    expect(g.status).toBe(405);
  });

  it("refuses bad project names with 400 bad-project", async () => {
    // Spec: H1a.2 — project must be one listed folder name, really inside the code folder (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    mkApp("app", await freePort());
    const outside = path.join(dir, "elsewhere");
    fs.mkdirSync(path.join(outside, "dist"), { recursive: true });
    fs.writeFileSync(path.join(outside, "dist", "index.html"), "x");
    fs.symlinkSync(outside, path.join(ws, "linked"));
    for (const bad of ["..", ".", "a/b", "a\\b", ".x", "", "nope", "linked", "x".repeat(129), "a\0b", 5, null, undefined]) {
      const r = await open(bad);
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(r.json).toEqual({ error: "bad-project" });
    }
  });

  it("answers 404 no-build when dist and build are missing, or dist is a link", async () => {
    // Spec: H1a.3 — no real build folder, no preview (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    const port = await freePort();
    const p = path.join(ws, "bare");
    fs.mkdirSync(p);
    fs.writeFileSync(path.join(p, "vite.config.ts"), `export default { preview: { port: ${port} } };`);
    let r = await open("bare");
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: "no-build", message: MSG_NOBUILD("bare") });
    const real = path.join(dir, "realdist");
    fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, "index.html"), "x");
    fs.symlinkSync(real, path.join(p, "dist"));
    r = await open("bare");
    expect(r.status).toBe(404);
    expect(r.json.error).toBe("no-build");
    // A folder with no index.html is not a build either.
    fs.rmSync(path.join(p, "dist"));
    fs.mkdirSync(path.join(p, "build"));
    expect((await open("bare")).json.error).toBe("no-build");
  });

  it("answers 409 no-port / bad-port / port-in-use", async () => {
    // Spec: H1a.4 — the port is only the project's pinned port, and only when it is free (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    mkApp("noport", 0, { config: null });
    let r = await open("noport");
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("no-port");
    expect(r.json.message).toContain("Pin this project's port");
    fs.writeFileSync(path.join(ws, "noport", "vite.config.ts"), "export default { preview: { port: Number(process.env.P) } };");
    expect((await open("noport")).json.error).toBe("no-port");
    for (const [n, port] of [["p5173", 5173], ["p5197", 5197], ["p80", 80], ["p5251", 5251], ["pown", bridge.port]]) {
      mkApp(n, port);
      r = await open(n);
      expect(r.status, n).toBe(409);
      expect(r.json).toEqual({ error: "bad-port", port });
    }
    // Held on 127.0.0.1 by another listener.
    const p4 = await freePort();
    extra.push(await listenOn("127.0.0.1", p4));
    mkApp("held4", p4);
    r = await open("held4");
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: "port-in-use", port: p4 });
    // Held on ::1 only (skipped when the machine has no IPv6).
    const p6 = await freePort();
    let s6;
    try { s6 = await listenOn("::1", p6); } catch { return; }
    extra.push(s6);
    mkApp("held6", p6);
    r = await open("held6");
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: "port-in-use", port: p6 });
  });
});

describe("preview static server", () => {
  let port;
  const up = async () => { await start(); port = await freePort(); mkApp("app", port); expect((await open("app")).status).toBe(200); };

  it("serves index.html for / and deep routes, js with its type, 404 for a missing file, HEAD without body, 405 for POST", async () => {
    // Spec: H1a.5 — GET/HEAD only, SPA fallback, fixed content types, fixed headers (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await up();
    for (const p of ["/", "/deep/route", "/deep/route/", "/?x=1"]) {
      const r = await get(port, p);
      expect(r.status, p).toBe(200);
      expect(r.body).toContain("APP-INDEX");
      expect(r.headers["content-type"]).toBe("text/html; charset=utf-8");
    }
    const js = await get(port, "/assets/a.js");
    expect(js.status).toBe(200);
    expect(js.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(js.body).toBe("console.log(1)");
    expect(js.headers["x-content-type-options"]).toBe("nosniff");
    expect(js.headers["cache-control"]).toBe("no-store");
    expect(js.headers["referrer-policy"]).toBe("no-referrer");
    expect(js.headers["set-cookie"]).toBeUndefined();
    const miss = await get(port, "/missing.js");
    expect(miss.status).toBe(404);
    expect(miss.body).not.toContain("APP-INDEX");
    const head = await get(port, "/assets/a.js", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect(head.headers["content-length"]).toBe("14");
    expect(head.headers["x-content-type-options"]).toBe("nosniff");
    const post = await get(port, "/", { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe("GET, HEAD");
    expect((await get(port, "/", { method: "OPTIONS" })).status).toBe(405);
  });

  it("never leaks content for dot-paths, encoded slashes, links out or directories", async () => {
    // Spec: H1a.6 — containment: no traversal, no dotfiles, no link out, no directory listing (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await up();
    for (const p of ["/../package.json", "/%2e%2e/package.json", "/.env", "/out/passwd", "/out", "/assets/", "/%2F..", "/%5c..", "/a%00b", "/a\\b", "/%zz", "/assets//a.js", "//assets/a.js", "/.git/config", "/assets/.x"]) {
      const r = await get(port, p);
      // A link is not copied into the snapshot, so /out is simply a path that does not exist: an app route (no extension) gets index.html, never the file behind the link.
      const spa = p.startsWith("/out") && r.status === 200;
      if (spa) expect(r.body).toContain("APP-INDEX");
      else expect([400, 404], `${p} -> ${r.status}`).toContain(r.status);
      expect(r.body).not.toMatch(spa ? /PKG-LEAK|SECRET=1|root:|a\.js/ : /PKG-LEAK|SECRET=1|root:|APP-INDEX|a\.js/);
    }
  });

  it("answers 421 for a Host that is not the preview's own", async () => {
    // Spec: H1a.7 — DNS rebinding guard on the Host header (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await up();
    for (const h of [`evil.example:${port}`, "localhost", `localhost:${port + 1}`, `localhost.evil.example:${port}`]) expect((await get(port, "/", { host: h })).status, h).toBe(421);
    for (const h of [`localhost:${port}`, `127.0.0.1:${port}`]) expect((await get(port, "/", { host: h })).status, h).toBe(200);
  });

  it("sets no CORS; an unpaired preview origin is refused by the bridge; a paired origin blocks the preview", async () => {
    // Spec: H1a.8 — no Access-Control-* ever; the preview origin is never a bridge origin (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await up();
    for (const p of ["/", "/assets/a.js", "/missing.js", "/.env"]) expect((await get(port, p)).headers["access-control-allow-origin"], p).toBeUndefined();
    const r = await fetch(`${base}/v1/projects`, { method: "POST", headers: { origin: `http://localhost:${port}` } });
    expect(r.status).toBe(403);
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    // An origin that is paired (or may pair) at the port the project pins: no preview.
    await bridge.close();
    await removeTestDir(dir);
    const p2 = await freePort();
    await start({ allowed: [`http://localhost:${p2}`, APP] });
    mkApp("app", p2);
    const c = await open("app", secret, `http://localhost:${p2}`);
    expect(c.status).toBe(409);
    expect(c.json).toEqual({ error: "origin-paired", port: p2 });
    expect(await refused(p2)).toBe(true);
  });

  it("stops every preview when the bridge closes, on unpair, and on a workspace change", async () => {
    // Spec: H1a.9 — closeBridge, unpair and workspace change close the preview servers (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await up();
    expect(await refused(port)).toBe(false);
    await fetch(`${base}/v1/unpair`, { method: "POST", headers: { "x-bridge-secret": secret, origin: APP } });
    expect(await refused(port)).toBe(true);
    await bridge.close();
    await removeTestDir(dir);
    await up();
    await bridge.close();
    expect(await refused(port)).toBe(true);
    bridge = undefined;
  });

  it("keeps at most 4 previews: a fifth closes the first", async () => {
    // Spec: H1a.4b — at most 4 previews at once (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    const ports = [];
    for (let i = 0; i < 5; i++) { const p = await freePort(); ports.push(p); mkApp(`app${i}`, p); expect((await open(`app${i}`)).status).toBe(200); }
    expect(await refused(ports[0])).toBe(true);
    for (const p of ports.slice(1)) expect(await refused(p)).toBe(false);
  });
});

describe("preview sentence in the code-turn prompt", () => {
  const prompts = async (client) => {
    await start();
    mkApp("app", await freePort());
    const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-bridge-secret": secret }, body: JSON.stringify({ system: "You are the agent.", prompt: "hello", mode: "code", project: "app", ...(client ? { client } : {}) }) });
    await res.text();
    const row = fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((r) => r.event === "run");
    const i = row.argv.indexOf("--append-system-prompt");
    return row.argv[i + 1];
  };
  it("is present when client.preview is true and absent otherwise", async () => {
    // Spec: H1a.10 — the bridge owns the agent's sentence, and only for a page that shows Open (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    expect(await prompts({ preview: true })).toContain(SENTENCE);
    await bridge.close();
    await removeTestDir(dir);
    for (const c of [undefined, { preview: false }, { preview: "true" }, {}]) {
      expect(await prompts(c)).not.toContain("npm run build");
      await bridge.close();
      await removeTestDir(dir);
    }
    bridge = undefined;
  });
});

// ---- the snapshot (F1), file handles (F2), ports (F3), starts in flight (F4) ---------------------------------------------------------

const MARKER = "MARKER-OUTSIDE-SECRET";
/** A child process that swaps `<d>/<name>` and `<d>/<name>_link` over and over until `<d>/stop` exists: the symlink swap the sandboxed agent can do. */
const swapper = (d, name, stop) => spawn(process.execPath, ["-e", `
const fs=require("fs");const d=process.argv[1],n=process.argv[2],stop=process.argv[3];
const nap=new Int32Array(new SharedArrayBuffer(4));while(!fs.existsSync(stop)){Atomics.wait(nap,0,0,1);try{fs.renameSync(d+"/"+n,d+"/"+n+"_real");fs.renameSync(d+"/"+n+"_link",d+"/"+n);fs.renameSync(d+"/"+n,d+"/"+n+"_link");fs.renameSync(d+"/"+n+"_real",d+"/"+n);}catch(e){}}
`, d, name, stop], { stdio: "ignore" });
const stopSwap = async (stop, kids) => { fs.writeFileSync(stop, ""); await Promise.all(kids.map((k) => new Promise((r) => (k.exitCode !== null ? r() : k.once("exit", r))))); fs.rmSync(stop); };
const allFiles = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? allFiles(path.join(d, e.name)) : [path.join(d, e.name)]));
const snapHasMarker = () => snaps().some((n) => allFiles(path.join(dir, "state", "previews", n)).some((f) => fs.readFileSync(f, "utf8").includes(MARKER)));

describe("snapshot: the symlink swap race", () => {
  /** dist/sub/id is real; dist/sub_link (and project/dist_link) lead outside to the marker. */
  function raceFixture(port) {
    const p = mkApp("app", port);
    const out = path.join(dir, "outside");
    fs.mkdirSync(path.join(out, "sub"), { recursive: true });
    // Many files, so a copy takes long enough for a swap to land in the middle of it.
    fs.mkdirSync(path.join(p, "dist", "sub"));
    for (let i = 0; i < 400; i++) { fs.writeFileSync(path.join(out, "sub", `f${i}`), MARKER); fs.writeFileSync(path.join(p, "dist", "sub", `f${i}`), `REAL-${i}`); }
    fs.writeFileSync(path.join(out, "index.html"), MARKER);
    fs.writeFileSync(path.join(out, "id"), MARKER);
    fs.writeFileSync(path.join(out, "sub", "id"), MARKER);
    fs.writeFileSync(path.join(p, "dist", "sub", "id"), "REAL-SUB-ID");
    fs.symlinkSync(out, path.join(p, "dist", "sub_link"));
    fs.symlinkSync(path.join(out), path.join(p, "dist_link"));
    return p;
  }

  it("serves 0 marker bytes over 2000+ requests while dist/sub and dist itself are being swapped, during Open and during serving", async () => {
    // Spec: H1a.F1 — swap race: what is served is a copy the agent cannot change (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    const port = await freePort();
    const p = raceFixture(port);
    expect((await open("app")).status).toBe(200);
    const stop = path.join(dir, "stop-swap");
    const kids = [swapper(path.join(p, "dist"), "sub", stop), swapper(p, "dist", stop)];
    const seen = { open: {}, hits: 0, requests: 0 };
    // During Open: every answer is a refusal or a clean snapshot; no snapshot ever holds marker bytes.
    for (let i = 0; i < 150; i++) {
      const r = await open("app");
      seen.open[r.status] = (seen.open[r.status] ?? 0) + 1;
      expect([200, 404, 409]).toContain(r.status);
      if (r.status === 409 && r.json.error === "build-changed") expect(r.json.message).toBe("The build changed while it was being opened. Press Open again.");
      expect(snapHasMarker()).toBe(false);
    }
    // During serving, with Open pressed now and then.
    const worker = async () => {
      for (let i = 0; i < 300; i++) {
        for (const u of ["/sub/id", "/id", "/"]) {
          const r = await get(port, u);
          seen.requests += 1;
          if (r.body.includes(MARKER)) seen.hits += 1;
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), (async () => { for (let i = 0; i < 20; i++) { await open("app"); await sleep(20); } })()]);
    await stopSwap(stop, kids);
    expect(seen.requests).toBeGreaterThanOrEqual(2000);
    expect(seen.hits).toBe(0);
    expect(snapHasMarker()).toBe(false);
  }, 120_000);

  // Harness size, not a product Value: how many copies the test makes while the swapper runs. One copy of this 401-file fixture takes 37 ms on macOS and
  // 125 to 486 ms on GitHub's Windows runner (Defender off, symlinks cost 1 ms: the per-file open, fstat and realpath of the safe copy), so 300 copies took
  // 68 to 177 s there against the 120 s test timeout (runs 46031602424 to 46033129124), and the timed-out test left its swapper running into the next tests.
  const SWAP_COPIES = process.platform === "win32" ? 60 : 300;
  it(`snapshotBuild alone: ${SWAP_COPIES} copies while dist/sub is swapped never hold a marker byte`, async () => {
    // Spec: H1a.F1h — the copy checks (no link followed, same file, still inside) hold under the swap (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    const p = raceFixture(await freePort());
    const dist = path.join(p, "dist");
    const stop = path.join(dir, "stop-swap");
    const kid = swapper(dist, "sub", stop);
    const out = { ok: 0, changed: 0, marker: 0 };
    try {
      for (let i = 0; i < SWAP_COPIES; i++) {
        const dest = path.join(dir, `direct-${i}`);
        try { await snapshotBuild(dist, dest); out.ok += 1; } catch (e) { if (e.body?.error === "build-changed") out.changed += 1; else throw e; }
        if (fs.existsSync(dest) && allFiles(dest).some((f) => fs.readFileSync(f, "utf8").includes(MARKER))) out.marker += 1;
      }
    } finally {
      await stopSwap(stop, [kid]); // also when a copy throws: a swapper left running keeps renaming inside the folder the teardown removes
    }
    expect(out.marker).toBe(0);
    expect(out.ok + out.changed).toBe(SWAP_COPIES);
  }, 120_000);

  it("copies no symlink and no hard-linked file, and skips dot-entries", async () => {
    // Spec: H1a.F1b — links and hard links present at Open are not served (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    const port = await freePort();
    const p = mkApp("app", port);
    const outFile = path.join(dir, "outside.txt");
    fs.writeFileSync(outFile, MARKER);
    fs.linkSync(outFile, path.join(p, "dist", "hard.txt"));
    fs.symlinkSync(outFile, path.join(p, "dist", "soft.txt"));
    fs.writeFileSync(path.join(p, "dist", "fifo-like.dat"), "ok");
    expect((await open("app")).status).toBe(200);
    for (const u of ["/hard.txt", "/soft.txt", "/.env"]) {
      const r = await get(port, u);
      expect(r.status, u).toBe(404);
      expect(r.body).not.toContain(MARKER);
    }
    expect((await get(port, "/fifo-like.dat")).body).toBe("ok");
    expect(snapHasMarker()).toBe(false);
  });

  it("refuses to open when the build is too large, with 413 build-too-large", async () => {
    // Spec: H1a.F1c — caps on files and bytes (the real caps are 20,000 files and 512 MB; the test lowers them) (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start({ bridgeOpts: { previewLimits: { maxFiles: 50, maxBytes: 1000 } } });
    const port = await freePort();
    const p = mkApp("app", port);
    fs.writeFileSync(path.join(p, "dist", "assets", "huge.bin"), Buffer.alloc(2000));
    let r = await open("app");
    expect(r.status).toBe(413);
    expect(r.json).toEqual({ error: "build-too-large" });
    expect(snaps()).toEqual([]);
    fs.rmSync(path.join(p, "dist", "assets", "huge.bin"));
    fs.mkdirSync(path.join(p, "dist", "many"));
    for (let i = 0; i < 51; i++) fs.writeFileSync(path.join(p, "dist", "many", `f${i}`), "");
    r = await open("app");
    expect(r.status).toBe(413);
    expect(r.json).toEqual({ error: "build-too-large" });
    expect(snaps()).toEqual([]);
    fs.rmSync(path.join(p, "dist", "many"), { recursive: true });
    expect((await open("app")).status).toBe(200); // under the caps it opens
  });
});

describe("snapshot: the event loop", () => {
  // These two limits are test-harness numbers, not a Value. They were set on a Mac. On GitHub's Windows runner with Node 22 the max measured 662 to 1,037 ms
  // with no product fault, so the test failed there now and then. Kai chose 300 / 1,500 for win32 on 2026-11-27; macOS and Linux keep 150 / 600.
  const POLL_P95_LIMIT_MS = process.platform === "win32" ? 300 : 150;
  const POLL_MAX_LIMIT_MS = process.platform === "win32" ? 1_500 : 600;
  it(`keeps answering /v1/check during an Open of 5,000 small files (p95 under ${POLL_P95_LIMIT_MS} ms, no stall over ${POLL_MAX_LIMIT_MS} ms)`, async () => {
    // Spec: H1a.N1 — the copy yields to the event loop (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    const p = mkApp("app", await freePort());
    fs.mkdirSync(path.join(p, "dist", "many"));
    for (let i = 0; i < 4_990; i++) fs.writeFileSync(path.join(p, "dist", "many", `f${i}`), "x");
    const waits = [];
    let polling = true;
    const poll = (async () => {
      while (polling) {
        const t = Date.now();
        await fetch(`${base}/v1/check`, { method: "POST", headers: { "x-bridge-secret": secret, origin: APP } }).then((r) => r.text());
        waits.push(Date.now() - t);
        await sleep(20);
      }
    })();
    const r = await open("app");
    polling = false;
    await poll;
    waits.sort((a, b) => a - b);
    const max = waits[waits.length - 1];
    const p95 = waits[Math.floor(waits.length * 0.95)];
    console.log(`/v1/check during Open of ~5,000 files: ${waits.length} polls, p95 ${p95} ms, max ${max} ms`);
    expect(r.status).toBe(200);
    // The p95 is the bound (one slow poll on a shared CI runner is noise); the max only guards against a real stall like the 1.3 s of the blocking copy.
    expect(p95, `p95 ${p95} ms is over the ${POLL_P95_LIMIT_MS} ms limit`).toBeLessThanOrEqual(POLL_P95_LIMIT_MS);
    expect(max, `max ${max} ms is over the ${POLL_MAX_LIMIT_MS} ms limit`).toBeLessThanOrEqual(POLL_MAX_LIMIT_MS);
  }, 60_000);
});

describe("snapshot: where it lives and when it goes", () => {
  it("is replaced by the next Open, removed on close, and any leftover is swept at start", async () => {
    // Spec: H1a.F1d — one snapshot per project, replaced atomically; none survives a close or a restart (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    const port = await freePort();
    const p = mkApp("app", port);
    expect((await open("app")).status).toBe(200);
    const first = snaps();
    expect(first.length).toBe(1);
    expect(first[0]).toMatch(/^app-\d+$/);
    // A rebuild, then Open again: the served page is the new one and the old copy is gone.
    fs.writeFileSync(path.join(p, "dist", "index.html"), "<title>NEW-BUILD</title>");
    expect((await get(port, "/")).body).toContain("APP-INDEX"); // a refresh alone does not change a copy
    expect((await open("app")).status).toBe(200);
    const second = snaps();
    expect(second.length).toBe(1);
    expect(second[0]).not.toBe(first[0]);
    expect((await get(port, "/")).body).toContain("NEW-BUILD");
    // The copy sits in the state folder, not in the project or the build folder.
    expect(path.join(dir, "state", "previews", second[0]).startsWith(path.join(dir, "state") + path.sep)).toBe(true);
    await bridge.close();
    expect(snaps()).toEqual([]);
    // Leftovers from a crash are removed when a bridge starts on that state folder.
    fs.mkdirSync(path.join(dir, "state", "previews", "app-99"), { recursive: true });
    fs.writeFileSync(path.join(dir, "state", "previews", "app-99", "index.html"), "LEFTOVER");
    const keep = dir;
    bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(keep, "work"), home: keep, workspace: ws, stateDir: path.join(keep, "state"), env: { ...process.env } });
    await bridge.start();
    expect(snaps()).toEqual([]);
  });

  it("serves when the state folder is reached through a symlink", async () => {
    // Spec: H1a.F1i — the served root is the real path of the copy (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start({ stateDir: false });
    await bridge.close();
    const real = path.join(dir, "realstate");
    fs.mkdirSync(real);
    fs.symlinkSync(real, path.join(dir, "linkstate"));
    bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir, workspace: ws, stateDir: path.join(dir, "linkstate"), env: { ...process.env } });
    await bridge.start();
    base = `http://127.0.0.1:${bridge.port}`;
    await pair();
    const port = await freePort();
    mkApp("app", port);
    expect((await open("app")).status).toBe(200);
    expect((await get(port, "/assets/a.js")).body).toBe("console.log(1)");
  });

  it("is removed on unpair", async () => {
    // Spec: H1a.F1e — unpair removes the snapshots (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    mkApp("app", await freePort());
    expect((await open("app")).status).toBe(200);
    expect(snaps().length).toBe(1);
    await fetch(`${base}/v1/unpair`, { method: "POST", headers: { "x-bridge-secret": secret, origin: APP } });
    expect(snaps()).toEqual([]);
  });

  it("refuses to open (no-preview-place) when the bridge has no state folder, and when the state folder is in the code folder", async () => {
    // Spec: H1a.F1f — a copy is only ever made where a code turn cannot write; no other place is chosen (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start({ stateDir: false });
    mkApp("app", await freePort());
    expect((await open("app")).json.error).toBe("no-preview-place");
    await bridge.close();
    await removeTestDir(dir);
    await start();
    await bridge.close();
    bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir, workspace: ws, stateDir: path.join(ws, ".state"), env: { ...process.env } });
    await bridge.start();
    base = `http://127.0.0.1:${bridge.port}`;
    await pair();
    mkApp("app", await freePort());
    expect((await open("app")).json.error).toBe("no-preview-place");
  });

  it("is in a place the sandbox can neither read nor write, in folder mode and in computer mode", async () => {
    // Spec: H1a.F1g — the settings of both access modes deny the state folder (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    mkApp("app", await freePort());
    const state = fs.realpathSync.native(path.join(dir, "state"));
    // Folder mode: the settings a real code turn is started with (argv of the fake claude).
    await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-bridge-secret": secret }, body: JSON.stringify({ system: "s", prompt: "p", mode: "code", project: "app" }) }).then((r) => r.text());
    const row = fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((r) => r.event === "run");
    const folder = JSON.parse(row.argv[row.argv.indexOf("--settings") + 1]);
    expect(folder.sandbox.enabled).toBe(true);
    expect(folder.sandbox.filesystem.denyRead).toContain(state);
    expect(folder.sandbox.filesystem.allowWrite).toBeUndefined(); // writes only in the project folder
    expect(path.join(state, "previews").startsWith(ws + path.sep)).toBe(false);
    // Computer mode: the sandbox settings built from the same protected places.
    const comp = computerSandboxSettings(dir, ws, protectedPlaces(dir, [state]), [os.tmpdir()]);
    expect(comp.sandbox.filesystem.denyWrite).toContain(state);
    expect(comp.sandbox.filesystem.denyRead).toContain(state);
  });
});

describe("preview: file handles on aborted requests (F2)", () => {
  it("survives 500 requests reset at once, answers /v1/check, and gives its file descriptors back", async () => {
    // Spec: H1a.F2 — no handle is left to the garbage collector when a client resets (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    const port = await freePort();
    const p = mkApp("app", port);
    fs.writeFileSync(path.join(p, "dist", "assets", "big.bin"), Buffer.alloc(8 * 1024 * 1024, 1)); // a body too big for one write, so a reset lands mid-stream
    expect((await open("app")).status).toBe(200);
    for (let i = 0; i < 20; i++) await get(port, "/"); // warm up
    const baseline = HAS_DEVFD ? fs.readdirSync("/dev/fd").length : 0;
    // The resets come at once, with and without a short wait, and are not waited for: the same load that crashed the first build on Node 25.
    for (let i = 0; i < 500; i++) {
      await new Promise((resolve) => {
        const s = net.connect({ host: "127.0.0.1", port }, () => {
          s.write(`GET / HTTP/1.1\r\nHost: localhost:${port}\r\n\r\n`);
          const m = i % 4;
          if (m === 0) s.resetAndDestroy(); else setTimeout(() => s.resetAndDestroy(), m - 1);
          resolve();
        });
        s.on("error", () => resolve());
      });
    }
    // Windows has no /dev/fd, so the descriptor count is checked on macOS and Linux only; every platform still checks that the bridge answers after the resets.
    if (HAS_DEVFD) {
      let after = Infinity;
      for (let i = 0; i < 60 && after > baseline + 3; i++) { await sleep(100); after = fs.readdirSync("/dev/fd").length; }
      expect(after).toBeLessThanOrEqual(baseline + 3);
    }
    const chk = await fetch(`${base}/v1/check`, { method: "POST", headers: { "x-bridge-secret": secret, origin: APP } });
    expect(chk.status).toBe(200);
    expect((await get(port, "/")).status).toBe(200);
  }, 60_000);
});

describe("preview: ports from other services (F3)", () => {
  it("refuses the databases, the rigs, the worker block 8780-8799, the pages-dev block 8800-8819 and ports under 1024", async () => {
    // Spec: H1a.F3 — a preview never takes a port another service needs (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    await start();
    const ports = [5432, 3306, 6379, 27017, 8787, 8789, 5173, 5197, 5251, 8780, 8790, 8799, 8800, 8810, 8819, 1023, 80, 0, bridge.port];
    for (const n of ports) {
      mkApp(`p${n}`, n);
      const r = await open(`p${n}`);
      expect(r.status, String(n)).toBe(409);
      expect(r.json, String(n)).toEqual({ error: "bad-port", port: n });
    }
    expect(snaps()).toEqual([]);
  });
});

describe("preview: a start in flight when a close comes (F4)", () => {
  const settle = async (port, what) => { await sleep(150); expect(await nothingAt(port), what).toBe(true); };
  it("leaves no listener after closeBridge, unpair or a workspace switch, 30 times each", async () => {
    // Spec: H1a.F4 — a start that ends after a close never listens (Plan-2026-11-22-Friction-PlanReadQuestionBoxLocalServer-GilbAppBuild)
    for (const kind of ["close", "unpair", "switch"]) {
      for (let i = 0; i < 30; i++) {
        await start({ bridgeOpts: kind === "switch" ? { chooseFolder: async () => path.join(dir, "Other") } : {} });
        fs.mkdirSync(path.join(dir, "Other"));
        const port = await freePort();
        mkApp("app", port);
        const act = async () => {
          await sleep(i % 6);
          if (kind === "close") await bridge.close();
          else if (kind === "unpair") await fetch(`${base}/v1/unpair`, { method: "POST", headers: { "x-bridge-secret": secret, origin: APP } });
          else await fetch(`${base}/v1/workspace/choose`, { method: "POST", headers: { "x-bridge-secret": secret, origin: APP, "content-type": "application/json" }, body: "{}" }).then((r) => r.text());
        };
        await Promise.all([open("app").catch(() => null), act()]);
        await settle(port, `${kind} ${i}`);
        expect(snaps(), `${kind} ${i}`).toEqual([]);
        if (kind === "close") bridge = undefined;
        else await bridge.close();
        bridge = undefined;
        await removeTestDir(dir);
        dir = undefined;
      }
    }
  }, 180_000);
});
