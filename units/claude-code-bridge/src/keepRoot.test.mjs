// @vitest-environment node
/**
 * 0.3.23: a code turn that moves into a subfolder, or fails one folder check, no longer makes the bridge forget the code folder.
 *
 * Spec: units/claude-code-bridge, "keep the root" (items 1 to 6, S1 to S9).
 *  - The decision about an init's folder is one pure exported function (initFolderDecision).
 *  - A mismatch stops that turn only; the folder stays saved; the next use runs the start-up check again.
 *  - A paired hello says why code mode is off (codeModeOff); an unpaired hello and the 401 answers are the 0.3.22 ones.
 *  - The "a code turn is running" 409 names the running folder (last part only) for a paired caller.
 *  - Fix round 3: the off sentence for a child that moved out says so (R3); the one-turn guard knows a folder by device and inode (H1).
 *  - Fix round 4: the guard holds a folder by device and inode OR by real path, so a folder replaced at the same path is held too (T4-1).
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
const CODE_OUTSIDE_ERROR = "The bridge stopped this code turn: Claude Code moved outside the code folder.";
const OFF_DISK = "Code mode is off because the code folder changed on disk. Choose the code folder again.";
// Fix round 3 (R3): a child that started in the folder and later moved out is "moved outside", in hello and the 409 as in the stopped turn.
const OFF_OUTSIDE = "Code mode is off because an earlier code turn was stopped: Claude Code moved outside the code folder. Choose the code folder again.";

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
  const { laterCwd, firstCwd, writePath, ...rest } = opts;
  const bridge = createBridge({
    port: 0,
    claudeBin: FAKE,
    allowedOrigins: [APP],
    workDir: path.join(dir, "work"),
    home,
    workspaceFile: wsFile,
    codePlatform: "darwin",
    codeEnvExtraPrefixes: ["FAKE_"],
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile, ...(laterCwd ? { FAKE_LATER_CWD: laterCwd } : {}), ...(firstCwd ? { FAKE_FIRST_CWD: firstCwd } : {}), ...(writePath ? { FAKE_WRITE_PATH: writePath } : {}) },
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
async function turn(b, extra = {}, signal = undefined) {
  const res = await fetch(`${b.base}/v1/turn`, { method: "POST", headers: hdr(b.secret), body: JSON.stringify({ system: "You are the agent.", prompt: "hello", ...extra }), signal });
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
  it("uses the injected lookups, so it needs no child process (the platform's own separator)", () => {
    // Spec: item 1, one pure exported function that can be tested without a child process. D1: no separator is written into the test,
    // so it holds on Windows (where a path is "C:\\r\\x") as on macOS and Linux.
    const R = path.resolve(path.sep, "r");
    const X = path.join(R, "x");
    const Q = path.resolve(path.sep, "q");
    const RX = path.resolve(path.sep, "rx");
    const root = { path: R, id: "1:2" };
    const known = new Set([R, X, Q, RX]);
    const realpath = (p) => { if (known.has(p)) return p; throw new Error("nope"); };
    const idOf = (p) => (p === R ? "1:2" : "");
    const isDirectory = (p) => known.has(p);
    expect(initFolderDecision({ initNumber: 2, reported: X, root, realpath, idOf, isDirectory })).toEqual({ ok: true });
    expect(initFolderDecision({ initNumber: 2, reported: Q, root, realpath, idOf, isDirectory })).toEqual({ ok: false, reasonCode: "init-outside-folder" });
    expect(initFolderDecision({ initNumber: 2, reported: RX, root, realpath, idOf, isDirectory })).toEqual({ ok: false, reasonCode: "init-outside-folder" });
    expect(initFolderDecision({ initNumber: 2, reported: path.join(R, "gone"), root, realpath, idOf, isDirectory })).toEqual({ ok: false, reasonCode: "init-folder-missing" });
  });
  it("D7: a cwd that is not an absolute path is refused at every init", () => {
    // Spec: D7, the decision refuses a relative cwd, at init 1 and later (it would be read against the bridge's own folder).
    const root = rootFor(mk("a"));
    fs.mkdirSync(path.join(root.path, "sub"));
    for (const reported of ["sub", ".", "./sub", ".."]) for (const initNumber of [1, 2, 3]) expect(initFolderDecision({ initNumber, reported, root })).toEqual({ ok: false, reasonCode: "init-no-cwd" });
  });
  it("D7: a later init that reports a file, not a directory, is refused", () => {
    // Spec: D7, a path that is not a directory is a mismatch.
    const root = rootFor(mk("a"));
    const file = path.join(root.path, "f.txt");
    fs.writeFileSync(file, "x");
    expect(initFolderDecision({ initNumber: 2, reported: file, root })).toEqual({ ok: false, reasonCode: "init-folder-missing" });
    expect(initFolderDecision({ initNumber: 1, reported: file, root })).toEqual({ ok: false, reasonCode: "init-first-not-root" });
  });
  it("D7: an init number that is not a positive whole number is refused", () => {
    // Spec: D7, NaN, 0, a negative, a fraction, undefined and a string never take the lenient later-init branch.
    const root = rootFor(mk("a"));
    fs.mkdirSync(path.join(root.path, "sub"));
    for (const initNumber of [NaN, 0, -1, 1.5, undefined, "2", Infinity, null]) expect(initFolderDecision({ initNumber, reported: path.join(root.path, "sub"), root })).toEqual({ ok: false, reasonCode: "folder-check-failed" });
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
    expect(ev(r, "error")[0].message).toBe(reason === "init-outside-folder" ? CODE_OUTSIDE_ERROR : "The bridge stopped this code turn: Claude Code reported a folder that cannot be found.");
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
    expect(ev(await turn(b, code("INITTWICECWD")), "error")[0].message).toBe(CODE_OUTSIDE_ERROR);
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
    // Spec: item 2, Create is one of the uses. D9: the saved folder is back even when Create itself is refused (the name is taken),
    // which 0.3.22 cannot do: it had forgotten the folder, and a refused Create switched nothing.
    const { b, ws } = await refused("BackCreate");
    mk("Taken");
    fs.writeFileSync(path.join(home, "Taken", "f.txt"), "x");
    const c = await call(b, "/v1/workspace/create", { name: "Taken" });
    expect(c.status).toBe(409);
    const h = await helloPaired(b);
    expect(h.workspace).toBe(true);
    expect((await call(b, "/v1/workspace")).json.path).toBe(ws);
  });
  it("a replaced folder stays off, gives its reason, and the saved folder is kept", async () => {
    // Spec: S6, a folder that still fails stays off and gives its reason; nothing runs.
    const { b, ws } = await refused("Stays");
    fs.renameSync(ws, `${ws}.old`);
    fs.mkdirSync(ws);
    const t = await turn(b, code("hello"));
    expect(t.status).toBe(409);
    expect(t.json.error).toBe(OFF_DISK);
    const h = await helloPaired(b);
    expect(h.workspace).toBe(false);
    expect(h.codeModeOff.reason).toBe("folder-check-failed");
    expect(h.codeModeOff.message).toBe(t.json.error); // D4: one reason, one sentence, in both places
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
    const __t0 = Date.now(); // Batch F diagnostic: removed before merge
    for (let i = 0; i < 100 && !fs.existsSync(logFile); i++) await new Promise((r) => setTimeout(r, 50));
    console.log(`Batch F diagnostic (removed before merge): keepRoot wait for first run log: ${Date.now() - __t0} ms, ${Date.now() - __t0 >= 4900 ? "TIMED OUT" : "ok"}`);
    for (const route of ["/v1/workspace/choose", "/v1/workspace/create", "/v1/workspace/open"]) {
      const r = await call(b, route, { name: "X" }, null);
      expect(r.status).toBe(401);
      expect(r.text).toBe(JSON.stringify({ error: "Pair first." }));
    }
    console.log(`Batch F diagnostic (removed before merge): keepRoot S7 routes answered at ${Date.now() - __t0} ms since the wait began`); // Batch F diagnostic: removed before merge
    b.bridge.server.closeAllConnections?.();
    await b.bridge.close(); // stops the waiting child here, so the teardown is not left to do it (slow on Windows)
    console.log(`Batch F diagnostic (removed before merge): keepRoot S7 bridge.close() done at ${Date.now() - __t0} ms since the wait began`); // Batch F diagnostic: removed before merge
    await running;
    console.log(`Batch F diagnostic (removed before merge): keepRoot S7 running settled at ${Date.now() - __t0} ms since the wait began`); // Batch F diagnostic: removed before merge
  });
  it("S8: a paired hello and a 409 carry the folder name only, never a path", async () => {
    // Spec: S8, and item 4: runningProjectFolder on the running 409.
    const ws = mk("Named");
    const b = await start({ workspace: ws, chooseFolder: async () => null });
    const running = turn(b, code("WAITFOREVER")).catch(() => {});
    const __t0 = Date.now(); // Batch F diagnostic: removed before merge
    for (let i = 0; i < 100 && !fs.existsSync(logFile); i++) await new Promise((r) => setTimeout(r, 50));
    console.log(`Batch F diagnostic (removed before merge): keepRoot wait for first run log: ${Date.now() - __t0} ms, ${Date.now() - __t0 >= 4900 ? "TIMED OUT" : "ok"}`);
    for (const [route, body] of [["/v1/workspace/choose", {}], ["/v1/workspace/create", { name: "Other" }]]) {
      const r = await call(b, route, body);
      expect(r.status).toBe(409);
      expect(r.json).toEqual({ error: "A code turn is running. Wait for it to finish.", runningProjectFolder: "Named" });
      expect(r.text).not.toContain(home);
    }
    console.log(`Batch F diagnostic (removed before merge): keepRoot S8 routes answered at ${Date.now() - __t0} ms since the wait began`); // Batch F diagnostic: removed before merge
    b.bridge.server.closeAllConnections?.();
    await b.bridge.close(); // stops the waiting child here, so the teardown is not left to do it (slow on Windows)
    console.log(`Batch F diagnostic (removed before merge): keepRoot S8 bridge.close() done at ${Date.now() - __t0} ms since the wait began`); // Batch F diagnostic: removed before merge
    await running;
    console.log(`Batch F diagnostic (removed before merge): keepRoot S8 running settled at ${Date.now() - __t0} ms since the wait began`); // Batch F diagnostic: removed before merge
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

describe("fix round 1 (D3, D4, D5, D6, D8)", () => {
  const until = async (f, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const runPids = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.event === "run").map((r) => r.pid) : []);

  // Windows stops a child's whole tree at once and has no "ignore the first stop signal", so a child that outlives its refusal cannot be made there.
  it.skipIf(process.platform === "win32")("D3: a refused child that has not exited keeps code mode off, even after its page hangs up", async () => {
    // Spec: D3, the re-check and the one-turn guard count a child that has not exited, not only the turns table.
    const ws = mk("Alive");
    const b = await start({ workspace: ws, killGraceMs: 6000 });
    const ctl = new AbortController();
    const first = turn(b, code("INITTWICECWD HOLDOPEN IGNORETERM"), ctl.signal).catch(() => {});
    expect(await until(() => lines.some((l) => l.includes("init 2:")))).toBe(true);
    const pid = runPids()[0];
    ctl.abort(); // the page goes away: the turn leaves the table, the child is still alive
    await first;
    await new Promise((r) => setTimeout(r, 100));
    expect(alive(pid)).toBe(true);
    const h = await helloPaired(b);
    expect(h.workspace).toBe(false);
    expect(h.codeModeOff.reason).toBe("init-outside-folder");
    const next = await turn(b, code("hello"));
    expect(next.status).toBe(409);
    expect(runPids()).toHaveLength(1); // no new child was started
    // once the child has exited, the unchanged folder is back
    expect(await until(() => !alive(pid))).toBe(true);
    expect(await until(async () => (await helloPaired(b)).workspace === true)).toBe(true);
  }, 30000);

  it("D4: a folder recreated at the same path gives one reason and one sentence, naming the remedy, and the log has the reason code", async () => {
    // Spec: D4.
    const ws = mk("Recreated");
    const b = await start({ workspace: ws });
    await turn(b, code("INITTWICECWD"));
    fs.renameSync(ws, `${ws}.old`);
    fs.mkdirSync(ws);
    const h = await helloPaired(b);
    const t = await turn(b, code("hello"));
    expect(h.codeModeOff.reason).toBe("folder-check-failed");
    expect(t.json.error).toBe(h.codeModeOff.message);
    expect(h.codeModeOff.message).toContain("Choose the code folder again");
    expect(lines.join("\n")).toContain("reason folder-check-failed");
  });

  it.each([
    ["POST /v1/workspace", "/v1/workspace", {}],
    ["POST /v1/projects/create", "/v1/projects/create", { name: "newproj" }],
    ["POST /v1/preview", "/v1/preview", { project: "p1" }],
  ])("D5: %s as the first use after a refusal checks the folder again", async (_n, route, body) => {
    // Spec: D5, the first call must not say "no code folder" for a folder that is saved and fine.
    const ws = mk("FirstUse");
    fs.mkdirSync(path.join(ws, "p1"));
    const b = await start({ workspace: ws });
    await turn(b, code("INITTWICECWD"));
    const r = await call(b, route, body);
    expect(r.text).not.toContain("This bridge has no code folder");
  });

  it("D6: the stopped turn is told the real reason", async () => {
    // Spec: D6. A first init outside the folder, a later init outside it, and a folder that cannot be found each say their own thing.
    const ws = mk("Reasons");
    fs.mkdirSync(path.join(ws, "sub"));
    const first = await start({ workspace: ws, firstCwd: "sub" });
    expect(ev(await turn(first, code("hello")), "error")[0].message).toBe(CODE_CWD_ERROR);
    await first.bridge.close();
    const later = await start({ workspace: ws });
    expect(ev(await turn(later, code("INITTWICECWD")), "error")[0].message).toBe(CODE_OUTSIDE_ERROR);
    await later.bridge.close();
    const gone = await start({ workspace: ws, laterCwd: "nope" });
    expect(ev(await turn(gone, code("INITTWICEAT")), "error")[0].message).toBe("The bridge stopped this code turn: Claude Code reported a folder that cannot be found.");
  });

  it("D8: a bridge started with a link as its folder keeps the link's spelling after an off and on cycle", async () => {
    // Spec: D8, a path under the link is still inside the folder (a.txt), not "(outside the folder)", after the cycle.
    const real = mk("RealRoot");
    const link = path.join(home, "LinkRoot");
    fs.symlinkSync(real, link);
    const b = await start({ workspace: link, writePath: path.join(link, "a.txt") });
    const summaries = async () => ev(await turn(b, code("CODEWRITE")), "activity").map((a) => a.summary);
    const before = await summaries();
    expect(before.length).toBeGreaterThan(0);
    await turn(b, code("INITTWICECWD"));
    expect((await helloPaired(b)).workspace).toBe(true);
    const after = await summaries();
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toContain("outside the folder");
  });
});

describe("fix round 2 (R1 to R4)", () => {
  const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const pids = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.event === "run").map((r) => r.pid) : []);
  const noWin = it.skipIf(process.platform === "win32"); // Windows stops a child's whole tree at once and cannot ignore a stop: not testable there
  /** A refused code turn whose child outlives the refusal, its page gone. Returns the bridge and the child's pid. */
  async function refusedAlive(name, extra = {}, prompt = "INITTWICECWD HOLDOPEN IGNORETERM") {
    const ws = mk(name);
    const opened = [];
    let chosen = 0;
    const b = await start({ workspace: ws, killGraceMs: 1500, openFolder: async (p) => { opened.push(p); }, chooseFolder: async () => { chosen++; return ws; }, ...extra });
    const ctl = new AbortController();
    const first = turn(b, code(prompt), ctl.signal).catch(() => {});
    expect(await until(() => lines.some((l) => l.includes("init 2:")))).toBe(true);
    ctl.abort();
    await first;
    await new Promise((r) => setTimeout(r, 100));
    const pid = pids()[0];
    expect(alive(pid)).toBe(true);
    return { b, ws, pid, opened, chosenCount: () => chosen };
  }

  noWin("R1: while a refused child is alive, Choose and New do not bring code mode on, Open and chat still work, and every guard clears once it has exited", async () => {
    // Spec: R1 and R2, one predicate: the turns table holds a code turn OR a code child has not exited.
    const { b, pid, opened, chosenCount } = await refusedAlive("Live1");
    const ch = await call(b, "/v1/workspace/choose");
    expect(ch.status).toBe(409);
    expect(ch.json.error).toBe("A code turn is running. Wait for it to finish.");
    expect(ch.json.runningProjectFolder).toBe("Live1");
    expect(chosenCount()).toBe(0); // the dialog was never opened
    const nw = await call(b, "/v1/workspace/create", { name: "NewWhileAlive" });
    expect(nw.status).toBe(409);
    expect(fs.existsSync(path.join(home, "NewWhileAlive"))).toBe(false);
    expect((await helloPaired(b)).workspace).toBe(false);
    expect((await turn(b, code("hello"))).status).toBe(409);
    expect(pids()).toHaveLength(1); // no second child
    expect((await call(b, "/v1/workspace/open")).status).toBe(404); // off, with the reason (R4); Open itself is not held by the live child
    const chat = await turn(b, { prompt: "hello" });
    expect(chat.status).toBe(200); // a chat turn is not blocked by a live code child
    // each guard clears once the child has exited
    expect(await until(() => !alive(pid))).toBe(true);
    expect(await until(async () => (await helloPaired(b)).workspace === true)).toBe(true);
    const ch2 = await call(b, "/v1/workspace/choose");
    expect(ch2.status).toBe(200);
    expect(chosenCount()).toBe(1);
    expect((await call(b, "/v1/workspace/create", { name: "NewAfter" })).status).toBe(200);
    expect(opened).toEqual([]);
  }, 40000);

  noWin("R2: a running child whose page hung up still holds the one-turn guard in its folder, and Change and New", async () => {
    // Spec: R2, the start of a code turn in the same folder counts a child that has not exited.
    const ws = mk("Live2");
    const b = await start({ workspace: ws, killGraceMs: 1500 });
    const ctl = new AbortController();
    const first = turn(b, code("WAITFOREVER IGNORETERM"), ctl.signal).catch(() => {});
    expect(await until(() => pids().length === 1)).toBe(true);
    const pid = pids()[0];
    ctl.abort();
    await first;
    await new Promise((r) => setTimeout(r, 100));
    expect(alive(pid)).toBe(true);
    const second = await turn(b, code("hello"));
    expect(second.status).toBe(429);
    expect(second.json.code).toBe("CodeTurnRunning");
    expect((await call(b, "/v1/workspace/choose")).status).toBe(409);
    expect(pids()).toHaveLength(1);
    expect(await until(() => !alive(pid))).toBe(true);
    expect(await until(async () => (await turn(b, code("hello"))).status === 200)).toBe(true);
  }, 40000);

  noWin("R2: a child that ignores the first stop signal is still stopped by the bridge's own kill (no new mechanism)", async () => {
    // Spec: R1, the wait is bounded: the existing stop path escalates after its grace.
    const { b, pid } = await refusedAlive("Live3", { killGraceMs: 1200 }, "INITTWICECWD HOLDOPEN IGNORETERMFOREVER");
    expect(await until(() => !alive(pid), 12000)).toBe(true);
    expect(await until(async () => (await helloPaired(b)).workspace === true)).toBe(true);
  }, 40000);

  it("R3: no two reason codes share a sentence, and the code turn's 409 carries the reason like hello does", async () => {
    // Spec: R3. Four init codes (each shown by a turn that waited at its entry guard while another was refused), two from the re-check.
    const seen = new Map();
    const viaHeldTurn = async (key, opts, prompt) => {
      ensureDir();
      let release = () => {};
      const gate = new Promise((r) => { release = r; });
      let atHook = () => {};
      const reached = new Promise((r) => { atHook = r; });
      let n = 0;
      const ws = mk(`R3${key}`);
      fs.mkdirSync(path.join(ws, "sub"), { recursive: true });
      const b = await start({ workspace: ws, afterSnapshot: () => { if (++n === 1) { atHook(); return gate; } }, ...opts });
      const pendingB = turn(b, code("hello"));
      await reached;
      await turn(b, code(prompt));
      release();
      const bRes = await pendingB;
      await b.bridge.close();
      return bRes;
    };
    const cases = [
      ["outside", { laterCwd: "/" }, "INITTWICEAT"],
      ["first", { firstCwd: "sub" }, "hello"],
      ["nocwd", { env: { ...process.env, FAKE_CLAUDE_LOG: undefined, FAKE_INIT_CWD: "omit" } }, "hello"],
      ["missing", { laterCwd: "nope" }, "INITTWICEAT"],
    ];
    for (const [key, opts, prompt] of cases) {
      if (key === "nocwd") opts.env = { ...process.env, FAKE_CLAUDE_LOG: path.join(dir ?? (ensureDir(), dir), "claude.log"), FAKE_INIT_CWD: "omit" };
      const r = await viaHeldTurn(key, opts, prompt);
      expect(r.status).toBe(409);
      expect(typeof r.json.reason).toBe("string");
      seen.set(r.json.reason, r.json.error);
    }
    expect([...seen.keys()].sort()).toEqual(["init-first-not-root", "init-folder-missing", "init-no-cwd", "init-outside-folder"]);
    // the two re-check codes, from hello and the turn answer
    for (const how of ["replaced", "gone"]) {
      const { b, ws } = await (async () => {
        const w = mk(`R3b${how}`);
        const bb = await start({ workspace: w });
        await turn(bb, code("INITTWICECWD"));
        return { b: bb, ws: w };
      })();
      if (how === "replaced") { fs.renameSync(ws, `${ws}.old`); fs.mkdirSync(ws); } else fs.rmSync(ws, { recursive: true });
      const h = await helloPaired(b);
      const t = await turn(b, code("hello"));
      expect(t.json.reason).toBe(h.codeModeOff.reason);
      expect(t.json.error).toBe(h.codeModeOff.message);
      seen.set(h.codeModeOff.reason, h.codeModeOff.message);
      await b.bridge.close();
    }
    expect(seen.size).toBe(6);
    expect(new Set(seen.values()).size).toBe(6); // six codes, six sentences
  }, 60000);

  it("R4: while code mode is off with a saved folder, the five folder routes give the off reason; only a bridge with no saved folder says there is no folder", async () => {
    // Spec: R4. Status kept where the page handles it: 404 (the client reads a 404 from /v1/workspace as "no folder"), 409 for a preview.
    const ws = mk("R4");
    fs.mkdirSync(path.join(ws, "p1"));
    const b = await start({ workspace: ws, openFolder: async () => {} });
    await turn(b, code("INITTWICECWD"));
    fs.renameSync(ws, `${ws}.old`);
    fs.mkdirSync(ws);
    for (const [route, body, status] of [["/v1/workspace", {}, 404], ["/v1/projects", {}, 404], ["/v1/projects/create", { name: "x" }, 404], ["/v1/preview", { project: "p1" }, 409], ["/v1/workspace/open", {}, 404]]) {
      const r = await call(b, route, body);
      expect([route, r.status]).toEqual([route, status]);
      expect(r.json.reason).toBe("folder-check-failed");
      expect(r.json.error).toBe(OFF_DISK);
      expect(r.json.message).toBe(OFF_DISK);
    }
    const none = await start({ workspaceFile: path.join(dir, "nostate", "workspace.json") });
    const r = await call(none, "/v1/workspace");
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ error: "This bridge has no code folder. Start it with --workspace <folder>." });
  });
});

describe("fix round 3 (R3, H1)", () => {
  const until = async (f, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const pids = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.event === "run").map((r) => r.pid) : []);
  // Both tests need a child that outlives its stop signal, which Windows cannot make (it stops a whole tree at once).
  const noWin = it.skipIf(process.platform === "win32");

  /**
   * Code mode off while the refused child is still alive, so the re-check cannot turn it back on before hello and the 409 are read.
   * @returns What the paired hello and the next code turn say.
   */
  async function offWhileAlive(name, extra, prompt, initLine) {
    const ws = mk(name);
    fs.mkdirSync(path.join(ws, "sub"));
    const b = await start({ workspace: ws, killGraceMs: 6000, ...extra });
    const ctl = new AbortController();
    const first = turn(b, code(prompt), ctl.signal).catch(() => {});
    expect(await until(() => lines.some((l) => l.includes(initLine)))).toBe(true);
    ctl.abort();
    await first;
    const pid = pids().at(-1); // the log is shared by every bridge in this test: this call's child is the newest
    expect(alive(pid)).toBe(true);
    const h = await helloPaired(b);
    const t = await turn(b, code("hello"));
    expect(await until(() => !alive(pid))).toBe(true);
    return { h, t };
  }

  noWin("R3: a child that started in the folder and then moved out is 'moved outside' in hello and the 409, and the not-started case keeps its own sentence", async () => {
    // Spec: R3 (tester round 3). The reason and its sentence come from the one source the stopped turn uses; one sentence per reason code.
    const moved = await offWhileAlive("R3Moved", {}, "INITTWICECWD HOLDOPEN IGNORETERM", "init 2:");
    expect(moved.h.codeModeOff.reason).toBe("init-outside-folder");
    expect(moved.h.codeModeOff.message).toBe(OFF_OUTSIDE);
    expect(moved.t.status).toBe(409);
    expect(moved.t.json).toEqual({ error: OFF_OUTSIDE, reason: "init-outside-folder", message: OFF_OUTSIDE });
    // the stopped turn and the off sentence name the same cause, in the same words
    expect(OFF_OUTSIDE).toContain(CODE_OUTSIDE_ERROR.replace("The bridge stopped this code turn: ", "").replace(/\.$/, ""));
    // the child that did not start in the folder keeps its own code and sentence
    // (INITTWICE only so the stand-in can stay alive with HOLDOPEN; init 1 already reports "sub" and is refused there)
    const first = await offWhileAlive("R3First", { firstCwd: "sub" }, "INITTWICE HOLDOPEN IGNORETERM", "init 1:");
    expect(first.h.codeModeOff.reason).toBe("init-first-not-root");
    expect(first.h.codeModeOff.message).toBe("Code mode is off because an earlier code turn was stopped: Claude Code started in another folder than the code folder. Choose the code folder again.");
    expect(first.t.json.reason).toBe("init-first-not-root");
    expect(first.t.json.error).toBe(first.h.codeModeOff.message);
  }, 40000);

  noWin("H1: the one-turn guard knows a folder by device and inode: a project renamed while its child lives is still held, another folder is not", async () => {
    // Spec: H1 (hacker round 1). The running-turn check and the live-child check both go through the one predicate, which compares device:inode.
    const ws = mk("H1");
    for (const p of ["p1", "other"]) fs.mkdirSync(path.join(ws, p));
    const b = await start({ workspace: ws, killGraceMs: 6000 });
    const ctl = new AbortController();
    const first = turn(b, { ...code("WAITFOREVER IGNORETERM"), project: "p1" }, ctl.signal).catch(() => {});
    expect(await until(() => pids().length === 1)).toBe(true);
    const pid = pids()[0];
    // 1. the turn is in the table (its page is still there) and its folder is renamed: the same folder, so the same refusal
    fs.renameSync(path.join(ws, "p1"), path.join(ws, "p2"));
    const inTable = await turn(b, { ...code("hello"), project: "p2" });
    expect(inTable.status).toBe(429);
    expect(inTable.json.code).toBe("CodeTurnRunning");
    expect(inTable.json.ownTurn).toBe(true);
    // 2. its page hangs up (the child lives on, an orphan) and the folder is renamed again: still held, with no turn id
    ctl.abort();
    await first;
    await new Promise((r) => setTimeout(r, 100)); // the bridge sees the hang-up a moment later; only then has the turn left the table
    expect(alive(pid)).toBe(true);
    fs.renameSync(path.join(ws, "p2"), path.join(ws, "p3"));
    const orphan = await turn(b, { ...code("hello"), project: "p3" });
    expect(orphan.status).toBe(429);
    expect(orphan.json).toEqual({ error: "A code turn is already running in p3.", code: "CodeTurnRunning", project: "p3", ownTurn: false });
    expect(pids()).toHaveLength(1); // no second child in that folder
    // 3. a different folder is not held up by it
    const other = await turn(b, { ...code("hello"), project: "other" });
    expect(other.status).toBe(200);
    expect(alive(pid)).toBe(true); // the 200 came while the orphan was still alive
    expect(await until(() => !alive(pid))).toBe(true);
  }, 40000);
});

describe("fix round 4 (T4-1): the one-turn guard holds a folder by device:inode OR by real path", () => {
  const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await new Promise((r) => setTimeout(r, 25)); } return false; };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const pids = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.event === "run").map((r) => r.pid) : []);
  const aliveCount = () => pids().filter(alive).length;
  const turnsListed = async (b) => (await call(b, "/v1/turns")).json.turns.length;
  // Windows cannot delete or rename a folder a live process works in, and cannot make a child that outlives its stop signal; d is the H1 case,
  // also skipped there, kept beside its siblings.
  const noWin = it.skipIf(process.platform === "win32");

  /**
   * A code workspace with project folders, and one code child alive in `p1` (the stand-in waits until it is stopped).
   * @param name The workspace folder's name.
   * @param projects The project folders to make.
   * @param prompt The stand-in's prompt: IGNORETERM keeps it alive about 3 s after its page hangs up.
   * @returns The bridge, the workspace path, the child's pid and the turn's abort handle.
   */
  async function liveInP1(name, projects, prompt = "WAITFOREVER") {
    const ws = mk(name);
    for (const p of projects) fs.mkdirSync(path.join(ws, p));
    const chosen = { n: 0 };
    const b = await start({ workspace: ws, killGraceMs: 4000, chooseFolder: async () => { chosen.n++; return ws; } });
    const ctl = new AbortController();
    const first = turn(b, { ...code(prompt), project: "p1" }, ctl.signal).catch(() => {});
    expect(await until(() => pids().length === 1)).toBe(true);
    return { b, ws, pid: pids()[0], ctl, first, chosen };
  }
  /** Deletes the folder and makes an empty one at the same path: a new device:inode at the old real path. */
  const replace = (p) => { fs.rmSync(p, { recursive: true }); fs.mkdirSync(p); };

  noWin("a: a project replaced at the same path while its turn runs is still held: 429 and exactly one child alive", async () => {
    // Spec: T4-1 (tester round 4, E1). 0.3.22 held the path; H1 holds device:inode; both must hold, so a second child never starts in p1.
    const { b, ws, pid, ctl, first } = await liveInP1("T4a", ["p1"]);
    replace(path.join(ws, "p1"));
    const second = await turn(b, { ...code("hello"), project: "p1" });
    if (second.status !== 429) console.log(`[T4A] Batch F diagnostic: removed before merge: second turn got ${second.status} body=${JSON.stringify(second.json)} text=${String(second.text).slice(0, 200)} pids=${JSON.stringify(pids())}`);
    expect(second.status).toBe(429);
    expect(second.json.code).toBe("CodeTurnRunning");
    expect(second.json.ownTurn).toBe(true);
    expect(aliveCount()).toBe(1);
    expect(alive(pid)).toBe(true);
    ctl.abort();
    await first;
  }, 5000);

  noWin("b: a project deleted while its orphaned child lives, then made again, is still held: 429 for the new p1", async () => {
    // Spec: T4-1 (tester round 4, E2). An orphan keeps both of its keys until it exits, so the path it was started in stays held.
    const { b, ws, pid, ctl, first } = await liveInP1("T4b", ["p1"], "WAITFOREVER IGNORETERM");
    ctl.abort();
    await first;
    expect(await until(async () => (await turnsListed(b)) === 0)).toBe(true); // the turn has left the table: only the live child holds p1
    expect(alive(pid)).toBe(true);
    fs.rmSync(path.join(ws, "p1"), { recursive: true });
    fs.mkdirSync(path.join(ws, "p1"));
    const again = await turn(b, { ...code("hello"), project: "p1" });
    expect(again.status).toBe(429);
    expect(again.json).toEqual({ error: "A code turn is already running in p1.", code: "CodeTurnRunning", project: "p1", ownTurn: false });
    expect(pids()).toHaveLength(1);
    expect(alive(pid)).toBe(true); // the 429 came while the orphan was still alive
  }, 5000);

  noWin("c: renamed p1 -> p2, then a new p1 at the old name: a code turn in p2 and one in p1 both answer 429", async () => {
    // Spec: T4-1 (tester round 4, E3). The renamed folder is held by its device:inode, the new folder at the old path by the path.
    const { b, ws, ctl, first } = await liveInP1("T4c", ["p1"]);
    fs.renameSync(path.join(ws, "p1"), path.join(ws, "p2"));
    fs.mkdirSync(path.join(ws, "p1"));
    const inP2 = await turn(b, { ...code("hello"), project: "p2" });
    expect(inP2.status).toBe(429);
    expect(inP2.json.code).toBe("CodeTurnRunning");
    const inP1 = await turn(b, { ...code("hello"), project: "p1" });
    expect(inP1.status).toBe(429);
    expect(inP1.json.code).toBe("CodeTurnRunning");
    expect(aliveCount()).toBe(1);
    ctl.abort();
    await first;
  }, 5000);

  noWin("d: a genuinely different folder p3 is not held up: 200 while the p1 child lives", async () => {
    // Spec: H1 kept (fix round 3): another folder, by neither device:inode nor path, gets its own code turn.
    const { b, pid, ctl, first } = await liveInP1("T4d", ["p1", "p3"]);
    const other = await turn(b, { ...code("hello"), project: "p3" });
    expect(other.status).toBe(200);
    expect(ev(other, "error")).toEqual([]);
    expect(alive(pid)).toBe(true);
    ctl.abort();
    await first;
  }, 5000);

  noWin("e: Change and New are refused while the replaced p1's child lives (the one predicate guards every caller)", async () => {
    // Spec: T4-1 with settled point 2: one predicate, codeChildAlive, guards Change, New, the re-check and a new code turn.
    const { b, ws, ctl, first, chosen } = await liveInP1("T4e", ["p1"]);
    replace(path.join(ws, "p1"));
    const ch = await call(b, "/v1/workspace/choose");
    expect(ch.status).toBe(409);
    expect(ch.json).toEqual({ error: "A code turn is running. Wait for it to finish.", runningProjectFolder: "p1" });
    expect(chosen.n).toBe(0); // the dialog was never opened
    const nw = await call(b, "/v1/workspace/create", { name: "T4eNew" });
    expect(nw.status).toBe(409);
    expect(fs.existsSync(path.join(home, "T4eNew"))).toBe(false);
    expect((await turn(b, { ...code("hello"), project: "p1" })).status).toBe(429);
    expect(aliveCount()).toBe(1);
    ctl.abort();
    await first;
  }, 5000);
});
