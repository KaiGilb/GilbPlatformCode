// @vitest-environment node
/**
 * 0.3.23: a code turn that moves into a subfolder, or fails one folder check, no longer makes the bridge forget the code folder.
 *
 * Spec: units/claude-code-bridge, "keep the root" (items 1 to 6, S1 to S9).
 *  - The decision about an init's folder is one pure exported function (initFolderDecision).
 *  - A mismatch stops that turn only; the folder stays saved; the next use runs the start-up check again.
 *  - A paired hello says why code mode is off (codeModeOff); an unpaired hello and the 401 answers are the 0.3.22 ones.
 *  - The "a code turn is running" 409 names the running folder (last part only) for a paired caller.
 */
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as BRIDGE from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const { createBridge, initFolderDecision, BRIDGE_BUILD } = BRIDGE;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const CODE_CWD_ERROR = "The bridge stopped this code turn: Claude Code did not start in the code folder.";
const OFF_CWD = "Code mode is off because an earlier code turn was stopped: Claude Code did not start in the code folder. Choose the code folder again.";

let dir, home, stateDir, wsFile, logFile;
const lines = [];
const bridges = [];
function ensureDir() {
  if (dir) return;
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-keep-root-")));
  home = path.join(dir, "home");
  stateDir = path.join(home, ".gilb-claude-code-bridge");
  fs.mkdirSync(stateDir, { recursive: true });
  wsFile = path.join(stateDir, "workspace.json");
  logFile = path.join(dir, "claude.log");
}
const mk = (name) => {
  ensureDir();
  const p = path.join(home, name);
  fs.mkdirSync(p, { recursive: true });
  return fs.realpathSync.native(p);
};
async function start(opts = {}) {
  ensureDir();
  lines.length = 0;
  const { laterCwd, firstCwd, ...rest } = opts;
  const bridge = createBridge({
    port: 0,
    claudeBin: FAKE,
    allowedOrigins: [APP],
    workDir: path.join(dir, "work"),
    home,
    workspaceFile: wsFile,
    codePlatform: "darwin",
    codeEnvExtraPrefixes: ["FAKE_"],
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile, ...(laterCwd ? { FAKE_LATER_CWD: laterCwd } : {}), ...(firstCwd ? { FAKE_FIRST_CWD: firstCwd } : {}) },
    ...rest,
    log: (l) => lines.push(l),
  });
  bridges.push(bridge);
  await bridge.start();
  const base = `http://127.0.0.1:${bridge.port}`;
  const secret = (await (await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ code: bridge.pairingCode }) })).json()).secret;
  return { bridge, base, secret };
}
afterEach(async () => {
  for (const b of bridges.splice(0)) await b.close();
  if (dir) await removeTestDir(dir);
  dir = undefined;
});
const hdr = (secret) => ({ "content-type": "application/json", origin: APP, ...(secret ? { "x-bridge-secret": secret } : {}) });
const call = async (b, route, body = {}, secret = b.secret) => {
  const res = await fetch(`${b.base}${route}`, { method: "POST", headers: hdr(secret), body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, text, json };
};
const helloUnpaired = async (b) => (await fetch(`${b.base}/v1/hello`, { headers: { origin: APP } })).text();
const helloPaired = async (b) => (await fetch(`${b.base}/v1/hello`, { headers: hdr(b.secret) })).json();
async function turn(b, extra = {}) {
  const res = await fetch(`${b.base}/v1/turn`, { method: "POST", headers: hdr(b.secret), body: JSON.stringify({ system: "You are the agent.", prompt: "hello", ...extra }) });
  if (res.status !== 200) return { status: res.status, json: await res.json(), events: [] };
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const blk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const e = /event: (.*)/.exec(blk)?.[1];
      const d = /data: (.*)/.exec(blk)?.[1];
      if (e) events.push([e, JSON.parse(d)]);
    }
  }
  return { status: 200, events };
}
const ev = (r, name) => r.events.filter((e) => e[0] === name).map((e) => e[1]);
const savedPath = () => JSON.parse(fs.readFileSync(wsFile, "utf8")).path;
const code = (prompt) => ({ mode: "code", prompt });

describe("known answer: the 2026-11-24 log case (init 1 is the root, a later init is root/sub)", () => {
  // Spec: the root is still set after a turn whose later init reports a subfolder. Before the fix this lost the root for every chat.
  it("keeps the root and shows no codeModeOff", async () => {
    const ws = mk("testfruitseaten");
    fs.mkdirSync(path.join(ws, "fruitseaten"));
    const b = await start({ workspace: ws, laterCwd: "fruitseaten" });
    const r = await turn(b, code("INITTWICEAT"));
    expect(ev(r, "error")).toEqual([]);
    const h = await helloPaired(b);
    expect(h.workspace).toBe(true);
    expect(h.codeModeOff).toBeUndefined();
    expect((await call(b, "/v1/workspace")).json).toEqual({ name: "testfruitseaten", path: ws });
    expect(savedPath()).toBe(ws);
  });
});

describe("initFolderDecision (item 1, pure)", () => {
  const rootFor = (p) => {
    const st = fs.lstatSync(p, { bigint: true });
    return { path: fs.realpathSync.native(p), id: `${st.dev}:${st.ino}` };
  };
  it("init 1: exactly the root passes", () => {
    // Spec: init 1 is the same as before: the reported folder is exactly the checked folder.
    const root = rootFor(mk("a"));
    expect(initFolderDecision({ initNumber: 1, reported: root.path, root })).toEqual({ ok: true });
  });
  it("S1: init 1 reporting a subfolder is refused", () => {
    // Spec: S1, a turn never runs with a working folder outside the checked one at its first init.
    const root = rootFor(mk("a"));
    fs.mkdirSync(path.join(root.path, "sub"));
    expect(initFolderDecision({ initNumber: 1, reported: path.join(root.path, "sub"), root })).toEqual({ ok: false, reasonCode: "init-first-not-root" });
  });
  it("init 2: the root, a subfolder and a deep subfolder pass", () => {
    // Spec: item 1, a later init may report the root or a folder under it.
    const root = rootFor(mk("a"));
    fs.mkdirSync(path.join(root.path, "sub", "deep"), { recursive: true });
    for (const reported of [root.path, path.join(root.path, "sub"), path.join(root.path, "sub", "deep")]) expect(initFolderDecision({ initNumber: 2, reported, root })).toEqual({ ok: true });
  });
  it("S3: a sibling whose name starts with the root's name is a mismatch", () => {
    // Spec: S3, root "a", reported "a-evil" (and "aX").
    const root = rootFor(mk("a"));
    mk("a-evil");
    mk("aX");
    for (const name of ["a-evil", "aX"]) expect(initFolderDecision({ initNumber: 2, reported: path.join(path.dirname(root.path), name), root })).toEqual({ ok: false, reasonCode: "init-outside-folder" });
  });
  it("S4: a link inside the root that leads outside is a mismatch (real paths are compared)", () => {
    // Spec: S4, the comparison uses real paths.
    const root = rootFor(mk("a"));
    const outside = mk("outside");
    fs.symlinkSync(outside, path.join(root.path, "link"));
    expect(initFolderDecision({ initNumber: 2, reported: path.join(root.path, "link"), root })).toEqual({ ok: false, reasonCode: "init-outside-folder" });
  });
  it("a link inside the root that leads to another place inside the root passes", () => {
    // Spec: item 1, real paths: a link that resolves under the root is under the root.
    const root = rootFor(mk("a"));
    fs.mkdirSync(path.join(root.path, "real"));
    fs.symlinkSync(path.join(root.path, "real"), path.join(root.path, "alias"));
    expect(initFolderDecision({ initNumber: 2, reported: path.join(root.path, "alias"), root })).toEqual({ ok: true });
  });
  it("S5: a path that cannot be resolved is a mismatch", () => {
    // Spec: S5, a real-path lookup that fails (folder missing) is a mismatch.
    const root = rootFor(mk("a"));
    expect(initFolderDecision({ initNumber: 2, reported: path.join(root.path, "nope"), root })).toEqual({ ok: false, reasonCode: "init-folder-missing" });
  });
  it("a missing or non-string cwd is a mismatch at every init", () => {
    // Spec: the init's cwd is the child's word; anything but a non-empty string fails closed.
    const root = rootFor(mk("a"));
    for (const reported of [undefined, null, "", 5, {}]) for (const initNumber of [1, 2]) expect(initFolderDecision({ initNumber, reported, root })).toEqual({ ok: false, reasonCode: "init-no-cwd" });
  });
  it("S2: a later init is refused when the root was replaced by another inode (rename and recreate)", () => {
    // Spec: S2, the root is checked again with the same device and inode check.
    const p = mk("a");
    const root = rootFor(p);
    fs.mkdirSync(path.join(p, "sub"));
    fs.renameSync(p, `${p}.old`);
    fs.mkdirSync(p);
    fs.mkdirSync(path.join(p, "sub"));
    expect(initFolderDecision({ initNumber: 2, reported: path.join(p, "sub"), root })).toEqual({ ok: false, reasonCode: "folder-check-failed" });
    expect(initFolderDecision({ initNumber: 1, reported: p, root })).toEqual({ ok: false, reasonCode: "init-first-not-root" });
  });
  it("S2: a later init is refused when the root was replaced by a link", () => {
    // Spec: S2, a symlink put at the root's path is caught at init 1 and at a later init.
    const p = mk("a");
    const root = rootFor(p);
    fs.mkdirSync(path.join(p, "sub"));
    fs.renameSync(p, `${p}.old`);
    fs.symlinkSync(`${p}.old`, p);
    expect(initFolderDecision({ initNumber: 2, reported: path.join(p, "sub"), root })).toEqual({ ok: false, reasonCode: "init-outside-folder" });
    expect(initFolderDecision({ initNumber: 2, reported: `${p}.old`, root })).toEqual({ ok: false, reasonCode: "init-outside-folder" });
    expect(initFolderDecision({ initNumber: 1, reported: p, root })).toEqual({ ok: false, reasonCode: "init-first-not-root" });
  });
  it("a root that is gone is a mismatch", () => {
    // Spec: item 1, a failed lookup is a mismatch.
    const p = mk("a");
    const root = rootFor(p);
    fs.mkdirSync(path.join(p, "sub"));
    const sub = path.join(p, "sub");
    fs.rmSync(p, { recursive: true });
    expect(initFolderDecision({ initNumber: 2, reported: sub, root })).toEqual({ ok: false, reasonCode: "init-folder-missing" });
  });
  it("uses the injected lookups, so it needs no child process", () => {
    // Spec: item 1, one pure exported function that can be tested without a child process.
    const root = { path: "/r", id: "1:2" };
    const realpath = (p) => (p === "/r/x" ? "/r/x" : p === "/r" ? "/r" : (() => { throw new Error("nope"); })());
    const idOf = (p) => (p === "/r" ? "1:2" : "");
    expect(initFolderDecision({ initNumber: 2, reported: "/r/x", root, realpath, idOf })).toEqual({ ok: true });
    expect(initFolderDecision({ initNumber: 2, reported: "/q", root, realpath, idOf })).toEqual({ ok: false, reasonCode: "init-folder-missing" });
  });
});

describe("a mismatch stops that turn only (item 2) and the log names the reason (item 5)", () => {
  it("S1 in the bridge: init 1 reporting a subfolder refuses the turn, keeps the folder, and logs init, reported, expected and reason", async () => {
    // Spec: S1, item 2, item 5.
    const ws = mk("Root1");
    fs.mkdirSync(path.join(ws, "sub"));
    const b = await start({ workspace: ws, firstCwd: "sub" });
    const r = await turn(b, code("hello"));
    expect(ev(r, "error")[0].message).toBe(CODE_CWD_ERROR);
    expect(lines.join("\n")).toContain(`init 1: it reported ${path.join(ws, "sub")}, expected ${ws}, reason init-first-not-root`);
    expect(savedPath()).toBe(ws);
    // the folder is unchanged, so the next use brings code mode back; replace it first to see the state while it is off
    fs.renameSync(ws, `${ws}.old`);
    fs.mkdirSync(ws);
    const h = await helloPaired(b);
    expect(h.workspace).toBe(false);
    expect(h.codeModeOff).toEqual({ reason: "folder-check-failed", message: expect.any(String), folderName: "Root1" });
  });
  it.each([
    ["S3 a sibling named like the root", "-evil", "init-outside-folder"],
    ["S4 a link out of the root", "link", "init-outside-folder"],
    ["S5 a path that cannot be resolved", "nope", "init-folder-missing"],
  ])("%s: a later init refuses the turn and keeps the folder", async (_n, kind, reason) => {
    // Spec: S3, S4, S5, item 2.
    const ws = mk("Root2");
    let later = kind;
    if (kind === "-evil") { later = `${ws}-evil`; fs.mkdirSync(later); }
    if (kind === "link") fs.symlinkSync(mk("Outside"), path.join(ws, "link"));
    const b = await start({ workspace: ws, laterCwd: later });
    const r = await turn(b, code("INITTWICEAT"));
    expect(ev(r, "error")[0].message).toBe(CODE_CWD_ERROR);
    expect(lines.join("\n")).toContain(`reason ${reason}`);
    expect(lines.join("\n")).toContain("init 2:");
    expect(savedPath()).toBe(ws);
    // the folder is unchanged: the next use brings code mode back
    const h = await helloPaired(b);
    expect(h.workspace).toBe(true);
    expect(h.codeModeOff).toBeUndefined();
  });
  it("S2 at init 1: a folder swapped for a link, or for another inode, after the check is refused", async () => {
    // Spec: S2, caught at init 1 (the swap happens after the pre-spawn check, before the child starts).
    for (const how of ["link", "inode"]) {
      const ws = mk(`Swap-${how}`);
      const b = await start({
        workspace: ws,
        beforeSpawn: () => {
          fs.renameSync(ws, `${ws}.old`);
          if (how === "link") fs.symlinkSync(`${ws}.old`, ws);
          else fs.mkdirSync(ws);
        },
      });
      const r = await turn(b, code("hello"));
      expect(ev(r, "error")[0].message).toBe(CODE_CWD_ERROR);
      expect(lines.join("\n")).toContain("init 1:");
      expect(savedPath()).toBe(ws);
      await b.bridge.close();
    }
  });
});

describe("the next use checks the saved folder again (S6)", () => {
  /** A bridge whose first code turn was refused (the child reported "/" at init 2), the folder unchanged. */
  async function refused(name = "Back") {
    const ws = mk(name);
    fs.mkdirSync(path.join(ws, "p1"));
    const b = await start({ workspace: ws, openFolder: async () => {}, chooseFolder: async () => null });
    expect(ev(await turn(b, code("INITTWICECWD")), "error")[0].message).toBe(CODE_CWD_ERROR);
    return { b, ws };
  }
  it.each([
    ["the next code turn", async (b) => (await turn(b, code("hello"))).status === 200],
    ["hello", async (b) => (await helloPaired(b)).workspace === true],
    ["the projects list", async (b) => (await call(b, "/v1/projects")).status === 200],
    ["Choose", async (b) => { await call(b, "/v1/workspace/choose"); return (await helloPaired(b)).workspace === true; }],
    ["Open", async (b) => (await call(b, "/v1/workspace/open")).status === 200],
  ])("an unchanged folder is back at %s", async (_n, use) => {
    // Spec: item 2, pass: code mode is back at the next use.
    const { b } = await refused();
    expect(await use(b)).toBe(true);
    const h = await helloPaired(b);
    expect(h.workspace).toBe(true);
    expect(h.codeModeOff).toBeUndefined();
  });
  it("Create also checks the saved folder first", async () => {
    // Spec: item 2, Create is one of the uses.
    const { b, ws } = await refused("BackCreate");
    const c = await call(b, "/v1/workspace/create", { name: "NewOne" });
    expect(c.status).toBe(200);
    expect(c.json.name).toBe("NewOne");
    expect(ws).not.toBe(c.json.path);
  });
  it("a replaced folder stays off, gives its reason, and the saved folder is kept", async () => {
    // Spec: S6, a folder that still fails stays off and gives its reason; nothing runs.
    const { b, ws } = await refused("Stays");
    fs.renameSync(ws, `${ws}.old`);
    fs.mkdirSync(ws);
    const t = await turn(b, code("hello"));
    expect(t.status).toBe(409);
    expect(t.json.error).toBe(OFF_CWD);
    const h = await helloPaired(b);
    expect(h.workspace).toBe(false);
    expect(h.codeModeOff.reason).toBe("folder-check-failed");
    expect(h.codeModeOff.folderName).toBe("Stays");
    expect(savedPath()).toBe(ws);
    // the original folder put back passes again
    fs.rmdirSync(ws);
    fs.renameSync(`${ws}.old`, ws);
    expect((await turn(b, code("hello"))).status).toBe(200);
  });
  it("a folder replaced by a link stays off", async () => {
    // Spec: S2 and S6, a link at the path is never taken back by the re-check.
    const { b, ws } = await refused("StaysLink");
    fs.renameSync(ws, `${ws}.old`);
    fs.symlinkSync(`${ws}.old`, ws);
    expect((await turn(b, code("hello"))).status).toBe(409);
    expect((await helloPaired(b)).codeModeOff.reason).toBe("folder-check-failed");
  });
  it("a folder that is gone says folder-missing", async () => {
    // Spec: item 3, reason from the closed list.
    const { b, ws } = await refused("Gone");
    fs.rmSync(ws, { recursive: true });
    const h = await helloPaired(b);
    expect(h.codeModeOff.reason).toBe("folder-missing");
  });
  it("a folder that failed its own check at a turn (folderStillGood) is kept and comes back", async () => {
    // Spec: item 2, a failed folderStillGood() stops that turn only.
    const ws = mk("Late");
    let n = 0;
    const b = await start({ workspace: ws, afterSnapshot: () => { if (n++ === 0) { fs.renameSync(ws, `${ws}.old`); fs.mkdirSync(ws); } } });
    expect((await turn(b, code("hello"))).status).toBe(409);
    expect(savedPath()).toBe(ws);
    expect((await helloPaired(b)).codeModeOff.reason).toBe("folder-check-failed");
  });
});

describe("what a caller is told (S7, S8)", () => {
  it("S7: an unpaired hello has no new field and no path, before and after a mismatch", async () => {
    // Spec: S7, the unpaired hello is the 0.3.22 answer.
    const ws = mk("Unpaired");
    const b = await start({ workspace: ws });
    const expected = (workspace) => JSON.stringify({ bridge: "gilb-claude-code-bridge", version: "1", build: BRIDGE_BUILD, billing: "claude-subscription", relay: true, codeTurns: true, openFolder: true, workspace, codeMode: workspace ? "full" : null, access: workspace ? "folder" : null, options: { ...(workspace ? { web: { search: true, fetch: "ask" } } : {}), models: ["opus", "sonnet", "haiku", "fable"], efforts: ["low", "medium", "high", "xhigh", "max"], delegateCoding: true, images: { maxCount: 4, maxBytes: 5242880, types: ["image/png", "image/jpeg", "image/gif", "image/webp"] } } });
    const before = await helloUnpaired(b);
    expect(before).toBe(expected(true));
    await turn(b, code("INITTWICECWD"));
    const after = await helloUnpaired(b);
    expect(after).toBe(expected(false));
    expect(after).not.toContain("codeModeOff");
    expect(after).not.toContain(home);
    expect(after).not.toContain("Unpaired");
  });
  it("S7: the answers an unpaired caller gets on the folder routes are the 401 they always were", async () => {
    // Spec: S7, an unpaired caller reaches no 409 and learns no folder name.
    const ws = mk("Unpaired2");
    const b = await start({ workspace: ws });
    const running = turn(b, code("WAITFOREVER")).catch(() => {});
    for (let i = 0; i < 100 && !fs.existsSync(logFile); i++) await new Promise((r) => setTimeout(r, 50));
    for (const route of ["/v1/workspace/choose", "/v1/workspace/create", "/v1/workspace/open"]) {
      const r = await call(b, route, { name: "X" }, null);
      expect(r.status).toBe(401);
      expect(r.text).toBe(JSON.stringify({ error: "Pair first." }));
    }
    b.bridge.server.closeAllConnections?.();
    await running;
  });
  it("S8: a paired hello and a 409 carry the folder name only, never a path", async () => {
    // Spec: S8, and item 4: runningProjectFolder on the running 409.
    const ws = mk("Named");
    const b = await start({ workspace: ws, chooseFolder: async () => null });
    const running = turn(b, code("WAITFOREVER")).catch(() => {});
    for (let i = 0; i < 100 && !fs.existsSync(logFile); i++) await new Promise((r) => setTimeout(r, 50));
    for (const [route, body] of [["/v1/workspace/choose", {}], ["/v1/workspace/create", { name: "Other" }]]) {
      const r = await call(b, route, body);
      expect(r.status).toBe(409);
      expect(r.json).toEqual({ error: "A code turn is running. Wait for it to finish.", runningProjectFolder: "Named" });
      expect(r.text).not.toContain(home);
    }
    b.bridge.server.closeAllConnections?.();
    await running;
  });
  it("S8: a paired hello while code mode is off has exactly reason, message, folderName", async () => {
    // Spec: item 3 and S8.
    const ws = mk("HelloOff");
    const b = await start({ workspace: ws });
    await turn(b, code("INITTWICECWD"));
    // keep it off: replace the folder
    fs.renameSync(ws, `${ws}.old`);
    fs.mkdirSync(ws);
    const h = await helloPaired(b);
    expect(Object.keys(h.codeModeOff).sort()).toEqual(["folderName", "message", "reason"]);
    expect(h.codeModeOff.folderName).toBe("HelloOff");
    expect(JSON.stringify(h)).not.toContain(home);
    expect(JSON.stringify(h)).not.toContain(dir);
    expect(h.codeModeOff.message).not.toMatch(/[\\/]/);
  });
});
