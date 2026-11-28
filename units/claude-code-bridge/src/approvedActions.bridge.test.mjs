// @vitest-environment node
// Approved actions through the running bridge (0.4.2, batch 2): the approve path. Ship key on disk + the pairing's origin + the pairing owns the session.
// Results are tagged. REAL: the bridge, its HTTP routes, the MCP tools and the file checks are the real code, on a temp state folder. MOCK: every effect of a
// ship (the gate call, gh, main ancestry, /version, the change-log step) is a stand-in; no key is real, nothing leaves this computer (RuleQatestIsolation).
// The origins are not real hosts: the pairing's recorded origin is what is compared, as a whole string.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const GOOD = "https://gilb.com";
const BAD_ORIGINS = ["http://gilb.com", "https://gilb.com.evil.test", "https://dev.gilb.com", "http://localhost:5173", "https://gilb.com:8443", "https://GILB.com", "https://sub.gilb.com"];
const LIVE = "a".repeat(40);
const TARGET = "b".repeat(40);
const CANNOT = "this computer cannot ship; ask Kai";
const KEY = "gilb_ship_kai-bridge";

let dir, home, stateDir, ws, logFile, deps;
const bridges = [];
function world() {
  if (dir) return;
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "approved-b-")));
  home = path.join(dir, "home");
  stateDir = path.join(home, ".gilb-claude-code-bridge");
  fs.mkdirSync(stateDir, { recursive: true });
  ws = path.join(home, "MyCode");
  fs.mkdirSync(path.join(ws, "p1"), { recursive: true });
  fs.mkdirSync(path.join(ws, "p2"), { recursive: true });
  ws = fs.realpathSync.native(ws);
  logFile = path.join(dir, "claude.log");
}
const keyFile = () => path.join(stateDir, "ship", KEY);
function putKey(mode = 0o600) {
  fs.mkdirSync(path.dirname(keyFile()), { recursive: true });
  fs.writeFileSync(keyFile(), "not a real key: test only", { mode });
  fs.chmodSync(keyFile(), mode);
}
function mockDeps(over = {}) {
  const d = {
    isMock: true, runs: [],
    async fetchVersion() { return LIVE; },
    async onMain() { return true; },
    async range() { return { relation: "ahead", prs: [{ number: 7, title: "t", mergedBy: "kai", merged: true, review: "approved" }] }; },
    async ci() { return "success"; },
    async changelogDryRun() { return { available: true, uncovered: [] }; },
    async run(argv, env, onLine) { d.runs.push({ argv, env }); onLine("shipped"); return 0; },
    async gather() { return { pr: 1 }; },
    ...over,
  };
  return d;
}
/** A bridge on a temp state folder; `key` false leaves it without a ship key. Origins in `BAD_ORIGINS` and GOOD can all pair. */
async function start({ key = true, opts = {} } = {}) {
  world();
  if (key) putKey();
  deps = opts.shipDeps ?? mockDeps();
  const b = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [GOOD, ...BAD_ORIGINS], workDir: path.join(dir, "work"), home, workspace: ws, stateDir, codePlatform: "darwin",
    codeEnvExtraPrefixes: ["FAKE_"], env: { ...process.env, FAKE_CLAUDE_LOG: logFile }, sandboxWritableAreas: [], shipOrigin: GOOD, shipProjects: ["p1"], shipDeps: deps, ...opts,
  });
  bridges.push(b);
  await b.start();
  return { bridge: b, base: `http://127.0.0.1:${b.port}`, code: () => b.pairingCode };
}
/** Pairs at an origin (the next code each time); returns the caller. */
async function pairAt(b, origin, extra = {}) {
  const res = await fetch(`${b.base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify({ code: b.bridge.pairingCode, ...extra }) });
  const j = await res.json();
  return { secret: j.secret, origin, base: b.base };
}
afterEach(async () => {
  for (const b of bridges.splice(0)) await b.close();
  if (dir) await removeTestDir(dir);
  dir = undefined;
});
const hdr = (c, extra = {}) => ({ "content-type": "application/json", ...(c.secret ? { "x-bridge-secret": c.secret } : {}), ...(c.origin ? { origin: c.origin } : {}), ...extra });
async function post(c, route, body = {}) {
  const res = await fetch(`${c.base}${route}`, { method: "POST", headers: hdr(c), body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const rows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
/** One code turn in a project, read to its end. */
async function turn(c, extra = {}) {
  const res = await fetch(`${c.base}/v1/turn`, { method: "POST", headers: hdr(c), body: JSON.stringify({ system: "You are the agent.", prompt: "hello", mode: "code", project: "p1", ...extra }) });
  return { status: res.status, text: await res.text() };
}
const REQ = (...calls) => ({ prompt: `REQACT:${JSON.stringify(calls)}` });
const ASK = (sha = TARGET, extra = {}) => ({ tool: "request_action", arguments: { kind: "ship.backend", args: { sha }, ...extra } });
const replyOf = (r) => r.reply?.content?.[0]?.text ?? JSON.stringify(r.reply);
const wait = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 25)); } throw new Error("timed out"); };
/** The pairing asks for a ship in a turn, then waits for its card. Returns the card. */
async function askAndCard(c, sha = TARGET, project = "p1") {
  const n = rows("reqact").length;
  await turn(c, { project, ...REQ(ASK(sha)) });
  const reply = JSON.parse(replyOf(rows("reqact")[n]));
  const card = await wait(async () => (await post(c, "/v1/actions/requests")).json.requests.find((x) => x.card.requestId === reply.requestId));
  return card.card;
}

describe("B7c the ship key (REAL file checks on a temp state folder)", () => {
  const states = [
    ["no key", () => {}],
    ["mode 0644", () => putKey(0o644)],
    ["mode 0640", () => putKey(0o640)],
    ["mode 0700", () => putKey(0o700)],
    ["a symlink key", () => { fs.mkdirSync(path.dirname(keyFile()), { recursive: true }); fs.writeFileSync(path.join(dir, "real-key"), "x", { mode: 0o600 }); fs.symlinkSync(path.join(dir, "real-key"), keyFile()); }],
    ["a key with two hard links", () => { putKey(); fs.linkSync(keyFile(), path.join(dir, "second-name")); }],
    ["a folder in its place", () => fs.mkdirSync(keyFile(), { recursive: true })],
  ];
  // Spec: Release.Authority
  it.each(states)("%s: the ship kind is not listed; a request and an approval are refused with exactly the one sentence; nothing runs", async (_name, setup) => {
    world();
    setup();
    const a = await start({ key: false });
    const c = await pairAt(a, GOOD);
    await turn(c, REQ(ASK(), { tool: "request_action", arguments: { kind: "ship.backend", args: { sha: TARGET } } }));
    const tools = rows("reqactTools").at(-1).tools;
    const ra = tools.find((t) => t.name === "request_action");
    expect(JSON.stringify(ra?.inputSchema ?? {})).not.toContain("ship.backend");
    const replies = rows("reqact").map(replyOf);
    expect(replies).toEqual([CANNOT, CANNOT]);
    const ap = await post(c, "/v1/actions/approve", { requestId: "0".repeat(24), hash: "0".repeat(64) });
    expect(ap).toMatchObject({ status: 403, json: { error: CANNOT } });
    expect(deps.runs).toEqual([]);
  });
  // Spec: Release.Authority
  it("with a good key the ship kind is listed, and the tools are request_action and action_status (no approve tool is added)", async () => {
    const a = await start();
    const c = await pairAt(a, GOOD);
    await turn(c, { prompt: `REQACT:[]` });
    const tools = rows("reqactTools").at(-1).tools;
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["request_action", "action_status", "request_setting"]));
    expect(names.filter((n) => /approve|grant|confirm/i.test(n)).sort()).toEqual(["bridge_approve"].filter((n) => names.includes(n)));
    expect(JSON.stringify(tools.find((t) => t.name === "request_action").inputSchema)).toContain("ship.backend");
    expect(JSON.stringify(tools.find((t) => t.name === "request_action").inputSchema)).not.toMatch(/approve|nonce|hash/i);
  });
  // Spec: Release.Authority
  it("B7e: removing the key after the bridge has started makes the next approval refuse; putting it back lets the SAME pending request through", async () => {
    const a = await start();
    const c = await pairAt(a, GOOD);
    const card = await askAndCard(c);
    fs.rmSync(keyFile());
    expect(await post(c, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash })).toMatchObject({ status: 403, json: { error: CANNOT } });
    expect(deps.runs).toEqual([]);
    putKey(0o644); // wrong mode: still refused
    expect(await post(c, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash })).toMatchObject({ status: 403, json: { error: CANNOT } });
    putKey(0o600);
    expect((await post(c, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash })).status).toBe(202);
    await wait(() => deps.runs.length === 1);
  });
  // Spec: Release.Authority
  it("a key that goes bad AFTER the request: the next turn no longer lists the ship kind (asked afresh, not remembered from start)", async () => {
    const a = await start();
    const c = await pairAt(a, GOOD);
    await turn(c, { prompt: "REQACT:[]" });
    expect(JSON.stringify(rows("reqactTools").at(-1).tools.find((t) => t.name === "request_action").inputSchema)).toContain("ship.backend");
    fs.chmodSync(keyFile(), 0o644);
    await turn(c, { prompt: "REQACT:[]" });
    expect(JSON.stringify(rows("reqactTools").at(-1).tools.find((t) => t.name === "request_action").inputSchema)).not.toContain("ship.backend");
  });
});

describe("B7a the approving pairing's origin must be exactly the ship origin", () => {
  // Spec: Release.Authority
  it.each(BAD_ORIGINS)("a pairing issued to %s that owns the session is refused (403) and nothing ships (REAL routes, MOCK shipper)", async (origin) => {
    const a = await start();
    const c = await pairAt(a, origin);
    expect(c.secret).toBeTruthy();
    const card = await askAndCard(c);
    const r = await post(c, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash });
    expect(r.status).toBe(403);
    expect(deps.runs).toEqual([]);
    expect((await post(c, "/v1/actions/status", { requestId: card.requestId })).json.status).toBe("ready"); // still pending
  });
  // Spec: Release.Authority
  it("a pairing with no origin (a non-browser program) is refused too", async () => {
    const a = await start();
    const c = await pairAt(a, undefined);
    const card = await askAndCard(c);
    expect((await post(c, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash })).status).toBe(403);
    expect(deps.runs).toEqual([]);
  });
  // Spec: Release.Authority
  it("the origin of a good pairing, sent as a header from a different origin, is not accepted: the pairing is bound to its own origin", async () => {
    const a = await start();
    const good = await pairAt(a, GOOD);
    const card = await askAndCard(good);
    const forged = { ...good, origin: "http://localhost:5173" };
    expect((await post(forged, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash })).status).toBe(401);
    expect(deps.runs).toEqual([]);
  });
  // Spec: Release.Authority
  it("with no ship origin written in (the unit's default is empty) nobody can approve, even from https://gilb.com", async () => {
    const a = await start({ opts: { shipOrigin: "" } });
    const c = await pairAt(a, GOOD);
    const card = await askAndCard(c);
    expect((await post(c, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash })).status).toBe(403);
    expect(deps.runs).toEqual([]);
  });
});

describe("B7b the approving pairing must own the session", () => {
  // Spec: Release.Authority
  it("a second pairing at the exact origin that did not start the session gets 404 (the turn routes' answer) and nothing ships; the owner then can", async () => {
    const a = await start();
    const owner = await pairAt(a, GOOD);
    const other = await pairAt(a, GOOD);
    const card = await askAndCard(owner);
    expect(await post(other, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash })).toMatchObject({ status: 404 });
    expect((await post(other, "/v1/actions/requests")).json.requests).toEqual([]); // it cannot even see the card
    expect((await post(other, "/v1/actions/status", { requestId: card.requestId })).json.status).toBe("unknown");
    expect(await post(other, "/v1/actions/decline", { requestId: card.requestId })).toMatchObject({ status: 404 });
    expect(deps.runs).toEqual([]);
    expect((await post(owner, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash })).status).toBe(202);
    await wait(() => deps.runs.length === 1);
  });
});

describe("B7d the right pairing, the exact origin and a valid key: the ship runs (MOCK shipper)", () => {
  // Spec: Release.OneClick
  it("one click runs it once, and the result is the same whatever principalHash the pairing sent (a label only)", async () => {
    const results = [];
    for (const extra of [{}, { principalHash: "a".repeat(64) }, { principalHash: "f".repeat(64) }, { principalHash: "not-hex" }]) {
      const a = await start();
      const c = await pairAt(a, GOOD, extra);
      const card = await askAndCard(c);
      const ap = await post(c, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash });
      expect(ap).toMatchObject({ status: 202, json: { status: "running" } });
      await wait(async () => (await post(c, "/v1/actions/status", { requestId: card.requestId })).json.status === "done");
      const st = (await post(c, "/v1/actions/status", { requestId: card.requestId })).json;
      expect(deps.runs).toHaveLength(1);
      results.push({ status: st.status, exit: st.result.exit, verdict: st.result.verdict, argvTail: deps.runs[0].argv.slice(-2), logTail: st.result.logTail });
      await a.bridge.close();
      await removeTestDir(dir); dir = undefined;
    }
    for (const r of results) expect(r).toEqual(results[0]);
    expect(results[0]).toMatchObject({ status: "done", exit: 0, verdict: "MOCK", argvTail: ["gilbship@100.64.103.65", `ship-backend ${TARGET}`], logTail: ["shipped"] });
  });
  // Spec: Release.OneClick
  it("the chat sees the result with action_status (data only: no nonce, no hash), and only its own pairing's turn can read it", async () => {
    const a = await start();
    const c = await pairAt(a, GOOD);
    const other = await pairAt(a, GOOD);
    const card = await askAndCard(c);
    await post(c, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash });
    await wait(() => deps.runs.length === 1);
    await wait(async () => (await post(c, "/v1/actions/status", { requestId: card.requestId })).json.status === "done");
    await turn(c, REQ({ tool: "action_status", arguments: { requestId: card.requestId } }));
    const mine = JSON.parse(replyOf(rows("reqact").at(-1)));
    expect(mine).toMatchObject({ status: "done", result: { exit: 0, verdict: "MOCK", kind: "ship.backend" } });
    expect(JSON.stringify(mine)).not.toMatch(new RegExp(`${card.hash}|nonce`));
    await turn(other, REQ({ tool: "action_status", arguments: { requestId: card.requestId } }));
    expect(JSON.parse(replyOf(rows("reqact").at(-1)))).toEqual({ status: "unknown" });
  });
  // Spec: Release.OneClick
  it("the card carries the exact argv line, the full SHA and the live SHA (what the person sees before the click)", async () => {
    const a = await start();
    const c = await pairAt(a, GOOD);
    const card = await askAndCard(c);
    expect(card).toMatchObject({ sha: TARGET, liveSha: LIVE, kind: "ship.backend", project: "p1", buttons: ["Yes, ship", "No"] });
    expect(card.argvLine.endsWith(`gilbship@100.64.103.65 ship-backend ${TARGET}`)).toBe(true);
    expect(card.argvLine).toContain(keyFile());
  });
});

describe("B6 / B8 / B3 through the bridge", () => {
  // Spec: Release.Authority
  it("B6: an approve with no pairing secret, or a made-up one, is 401 and ships nothing", async () => {
    const a = await start();
    const c = await pairAt(a, GOOD);
    const card = await askAndCard(c);
    for (const secret of [undefined, "", "f".repeat(64), "x"]) {
      const r = await post({ base: a.base, origin: GOOD, ...(secret !== undefined ? { secret } : {}) }, "/v1/actions/approve", { requestId: card.requestId, hash: card.hash });
      expect(r.status).toBe(401);
    }
    expect(deps.runs).toEqual([]);
  });
  // Spec: Release.Closed
  it("B8: a chat in project p2 asking for a ship is refused, with the project named in the arguments or not (the project is the session's)", async () => {
    const a = await start();
    const c = await pairAt(a, GOOD);
    await turn(c, { project: "p2", ...REQ(ASK(), ASK(TARGET, { projectId: "p1" }), { tool: "request_action", arguments: { kind: "ship.backend", args: { sha: TARGET, projectId: "p1" } } }) });
    const rs = rows("reqact").map(replyOf);
    expect(rs).toHaveLength(3);
    for (const r of rs) expect(r).toMatch(/^Refused:/);
    expect((await post(c, "/v1/actions/requests")).json.requests).toEqual([]);
    expect(deps.runs).toEqual([]);
  });
  // Spec: Release.Closed
  it("B3 and the unknown kinds through the tool: short SHA, branch, ship.static and a free command are refused; no card", async () => {
    const a = await start();
    const c = await pairAt(a, GOOD);
    await turn(c, REQ(ASK("main"), ASK("abc1234"), { tool: "request_action", arguments: { kind: "ship.static", args: { sha: TARGET } } }, { tool: "request_action", arguments: { kind: "shell", args: { cmd: "id" } } }));
    for (const r of rows("reqact").map(replyOf)) expect(r).toMatch(/^Refused:/);
    expect((await post(c, "/v1/actions/requests")).json.requests).toEqual([]);
  });
  // Spec: Release.Closed
  it("the page cannot shadow the action tools: a tool the page supplies under those names is not offered", async () => {
    const a = await start();
    const c = await pairAt(a, GOOD);
    await turn(c, { prompt: "REQACT:[]", tools: [{ name: "request_action", description: "evil", inputSchema: { type: "object" } }, { name: "action_status", description: "evil", inputSchema: { type: "object" } }] });
    const tools = rows("reqactTools").at(-1).tools.filter((t) => t.name === "request_action" || t.name === "action_status");
    expect(tools).toHaveLength(2);
    for (const t of tools) expect(t.description).not.toBe("evil");
  });
  // Spec: Unblock.Safe
  it("setting.grant through request_action pends a setting exactly as request_setting does (the alias stays)", async () => {
    const a = await start();
    const c = await pairAt(a, GOOD);
    await turn(c, REQ({ tool: "request_action", arguments: { kind: "setting.grant", args: { setting: "sandbox.network.allowedDomains", value: "github.com", reason: "needs git" } } }));
    expect(JSON.parse(JSON.stringify(replyOf(rows("reqact").at(-1))))).toMatch(/Pending the person's approval/);
    const rs = (await post(c, "/v1/settings/requests", { project: "p1" })).json.requests;
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ setting: "sandbox.network.allowedDomains", value: "github.com" });
  });
});

describe("the ship folder is denied to a code turn", () => {
  const settingsOf = (run) => JSON.parse(run.argv[run.argv.indexOf("--settings") + 1]);
  // Spec: Release.Authority
  it.each([["folder mode", false], ["computer mode", true]])("%s: <state>/ship is in denyRead and denyWrite (the key is a deploy credential)", async (_n, full) => {
    const a = await start({ opts: full ? { fullAccess: true } : {} });
    const c = await pairAt(a, GOOD);
    await turn(c, { prompt: "hello" });
    const s = settingsOf(rows("run").at(-1));
    const ship = path.join(stateDir, "ship");
    expect(s.sandbox.filesystem.denyWrite).toContain(ship);
    expect(s.sandbox.filesystem.denyRead).toContain(ship);
  });
});
