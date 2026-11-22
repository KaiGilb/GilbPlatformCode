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
import { createBridge } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const MSG_NOBUILD = (n) => `No build yet for ${n}. Run npm run build in the project folder, then press Open again.`;
const SENTENCE = "When you change the app, finish by running `npm run build` in the project folder. Do not tell the person to run a terminal command or to start a server. The chat shows an Open button for the built app; after a rebuild, tell them to press Open or refresh that page.";

let dir, bridge, base, ws, secret, logFile, extra = [];

/** A free port from the dynamic range, found by binding 0 on both families and closing again. */
async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = await new Promise((resolve) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const n = s.address().port; s.close(() => resolve(n)); }); });
    if (p >= 49152) return p;
  }
  throw new Error("no free port");
}
const listenOn = (host, port) => new Promise((resolve, reject) => { const s = net.createServer(); s.once("error", reject); s.listen({ host, port, exclusive: true }, () => resolve(s)); });

async function start({ allowed = [APP] } = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-prev-")));
  logFile = path.join(dir, "claude.log");
  ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  ws = fs.realpathSync.native(ws);
  bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: allowed, workDir: path.join(dir, "work"), home: dir, workspace: ws, codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", env: { ...process.env, FAKE_CLAUDE_LOG: logFile } });
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
const refused = (port) => new Promise((resolve) => { const s = net.connect({ host: "127.0.0.1", port }); s.once("connect", () => { s.destroy(); resolve(false); }); s.once("error", () => resolve(true)); });

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
      expect([400, 404], `${p} -> ${r.status}`).toContain(r.status);
      expect(r.body).not.toMatch(/PKG-LEAK|SECRET=1|root:|APP-INDEX|a\.js/);
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
