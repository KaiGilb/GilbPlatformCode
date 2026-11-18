// @vitest-environment node
// Bridge 0.3.12: folder mode may use the web. WebSearch runs freely; every WebFetch is asked, once or for the rest of the turn.
// Hermetic: the stand-in `claude` (fake-claude.mjs) asks bridge_approve the way Claude Code does.

import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, WEB_TOOLS, WEB_SENTENCE, BRIDGE_BUILD } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const APP2 = "http://localhost:5198";
const originOf = new Map(); // secret -> the origin it was paired from

let dir;
let bridge;
let base;
let logFile;

async function start({ fullAccess = false, bridgeOpts = {} } = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-web-")));
  logFile = path.join(dir, "claude.log");
  const ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  bridge = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP, APP2], workDir: path.join(dir, "work"), home: dir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", workspace: ws,
    ...(fullAccess ? { fullAccess: true } : {}),
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile },
    ...bridgeOpts,
  });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  return pair(APP);
}
async function pair(origin) {
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ code: bridge.pairingCode }) });
  const secret = (await res.json()).secret;
  originOf.set(secret, origin);
  return secret;
}
afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
  if (dir) await removeTestDir(dir);
});

const rows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
const ASK = (...asks) => `ASKJSON:${JSON.stringify(asks)}`;
const fetchOf = (url) => ({ tool_name: "WebFetch", input: { url } });
const search = { tool_name: "WebSearch", input: { query: "vite getting started" } };
const answerPost = (secret, body) => fetch(`${base}/v1/approval`, { method: "POST", headers: { "content-type": "application/json", origin: originOf.get(secret), "x-bridge-secret": secret }, body: JSON.stringify(body) });

/** Plays the page: `answer(request, n)` returns the body to post (without turnId and id) for the n-th approval_request. */
async function turn(secret, body, answer = () => A({ allow: true })) {
  const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", origin: originOf.get(secret), "x-bridge-secret": secret }, body: JSON.stringify({ system: "You are the agent.", mode: "code", ...body }) });
  const events = [];
  const answers = [];
  let turnId = "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let n = 0;
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
      if (!e) continue;
      const parsed = JSON.parse(d);
      events.push([e, parsed]);
      if (e === "start") turnId = parsed.turnId;
      if (e === "approval_request") {
        const given = answer(parsed, n++);
        for (const b of Array.isArray(given) ? given : [given]) {
          const r = await answerPost(b.secret ?? secret, { turnId, id: parsed.id, ...b.body });
          answers.push({ status: r.status, json: await r.json().catch(() => null) });
        }
      }
    }
  }
  const of = (name) => events.filter((x) => x[0] === name).map((x) => x[1]);
  return { events, requests: of("approval_request"), done: of("approval_done"), answers, turnId };
}
/** One answer body for the helper. */
const A = (body, secret) => ({ body, ...(secret ? { secret } : {}) });
const decisions = () => rows("askjson").map((r) => [r.tool, r.decision.behavior, r.decision.message]);

describe.each([["session"], ["each-write"]])("folder mode web, approval %s", (approval) => {
  it("WebSearch runs with no question", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(search) });
    expect(r.requests).toEqual([]);
    expect(decisions()).toEqual([["WebSearch", "allow", undefined]]);
  });

  it("WebFetch asks with scopes and the existing display (non-ASCII as <U+XXXX>, Host notice)", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://EXAMPLE.com/café")) });
    expect(r.requests).toHaveLength(1);
    expect(r.requests[0]).toMatchObject({ tool: "WebFetch", summary: "https://EXAMPLE.com/caf<U+00E9>", notice: "Host: example.com", scopes: ["once", "turn"] });
    expect(r.done).toEqual([{ id: r.requests[0].id, allow: true, scope: "once" }]);
    expect(decisions()).toEqual([["WebFetch", "allow", undefined]]);
  });

  it("allow once: only that fetch; the next asks again", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), fetchOf("https://b.example/2")) }, () => A({ allow: true, scope: "once" }));
    expect(r.requests.map((q) => q.summary)).toEqual(["https://a.example/1", "https://b.example/2"]);
    expect(r.done.map((d) => d.scope)).toEqual(["once", "once"]);
    expect(decisions().map((d) => d[1])).toEqual(["allow", "allow"]);
  });

  it("allow turn: later fetches in the same turn (any host) run with no question; the next turn asks again", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), fetchOf("https://b.example/2"), fetchOf("http://c.example/3")) }, () => A({ allow: true, scope: "turn" }));
    expect(r.requests.map((q) => q.summary)).toEqual(["https://a.example/1"]);
    expect(r.done).toEqual([{ id: r.requests[0].id, allow: true, scope: "turn" }]);
    expect(decisions().map((d) => d[1])).toEqual(["allow", "allow", "allow"]);
    const r2 = await turn(secret, { approval, prompt: ASK(fetchOf("https://d.example/4")) }, () => A({ allow: true, scope: "once" }));
    expect(r2.requests).toHaveLength(1);
  });

  it("deny: 'The person declined.'; a scope sent with a deny is ignored (no grant)", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), fetchOf("https://b.example/2")) }, () => A({ allow: false, scope: "turn" }));
    expect(r.requests).toHaveLength(2); // the deny with scope "turn" granted nothing
    expect(r.done.map((d) => [d.allow, d.scope])).toEqual([[false, "once"], [false, "once"]]);
    expect(decisions()).toEqual([["WebFetch", "deny", "The person declined."], ["WebFetch", "deny", "The person declined."]]);
  });

  it("the display denials still apply after a turn grant", async () => {
    const secret = await start();
    const asks = [
      fetchOf("https://a.example/1"),
      fetchOf("file:///etc/passwd"),
      fetchOf("ftp://example.com/x"),
      fetchOf("https://github.com@evil.example/x"),
      fetchOf("https://example.com/a‮b"),
      fetchOf("https://example.com/" + "a".repeat(200_100)),
      fetchOf("not a url"),
      fetchOf("https://ok.example/after"),
    ];
    const r = await turn(secret, { approval, prompt: ASK(...asks) }, () => A({ allow: true, scope: "turn" }));
    expect(r.requests).toHaveLength(1);
    expect(decisions().map((d) => d[1])).toEqual(["allow", "deny", "deny", "deny", "deny", "deny", "deny", "allow"]);
    expect(decisions()[1][2]).toBe("Only http and https addresses can be fetched.");
    expect(decisions()[3][2]).toMatch(/user@host/);
  });

  it("an unknown scope is a 400 and the question stays open; a valid answer after it still works", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), fetchOf("https://b.example/2")) }, () => [A({ allow: true, scope: "forever" }), A({ allow: true, scope: 5 }), A({ allow: true, scope: null }), A({ allow: true, scope: "turn" })]);
    expect(r.answers.map((a) => a.status)).toEqual([400, 400, 400, 200]);
    expect(r.answers[0].json.error).toMatch(/scope/);
    expect(r.requests).toHaveLength(1); // the good "turn" answer granted the second fetch
    expect(decisions().map((d) => d[1])).toEqual(["allow", "allow"]);
  });

  it("an answer without a scope is 'once'; a second answer is 409", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), fetchOf("https://b.example/2")) }, () => [A({ allow: true }), A({ allow: true, scope: "turn" })]);
    expect(r.answers.map((a) => a.status)).toEqual([200, 409, 200, 409]);
    expect(r.requests).toHaveLength(2);
  });

  it("the grant is this turn's only: another pairing asks again and cannot answer this turn's question", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1")) }, () => A({ allow: true, scope: "turn" }));
    expect(r.requests).toHaveLength(1);
    const other = await pair(APP2);
    const r2 = await turn(other, { approval, prompt: ASK(fetchOf("https://a.example/1")) }, () => [A({ allow: true, scope: "turn" }, secret), A({ allow: true, scope: "once" })]);
    expect(r2.requests).toHaveLength(1);
    expect(r2.answers.map((a) => a.status)).toEqual([404, 200]); // the first pairing cannot answer the other's question
  });

  it("a code turn cannot be a hand-off, so a turn grant never reaches one", async () => {
    const secret = await start();
    const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-bridge-secret": secret }, body: JSON.stringify({ system: "s", prompt: "p", mode: "code", parentTurnId: "abc" }) });
    expect(res.status).toBe(400);
  });

  it("claude starts with the two web tools in --tools, none of them denied, the approval tool on, and the web sentence", async () => {
    const secret = await start();
    await turn(secret, { approval, prompt: "hello" });
    const a = rows("run")[0].argv;
    const val = (f) => a[a.indexOf(f) + 1];
    expect(val("--tools")).toContain(WEB_TOOLS.join(","));
    expect(JSON.parse(val("--settings")).permissions.deny).toEqual([]);
    expect(JSON.parse(val("--settings")).sandbox.network.allowedDomains).toEqual(["registry.npmjs.org", "registry.yarnpkg.com", "pypi.org", "files.pythonhosted.org", "codeload.github.com", "raw.githubusercontent.com"]);
    expect(val("--permission-prompt-tool")).toBe("mcp__gilb__bridge_approve");
    expect(val("--append-system-prompt")).toContain(WEB_SENTENCE);
  });
});

describe("a session turn still refuses what only a person could allow", () => {
  it("a Write outside the folder is refused at once, no question", async () => {
    const secret = await start();
    const r = await turn(secret, { approval: "session", prompt: ASK({ tool_name: "Write", input: { file_path: "/tmp/x-out.txt", content: "x" } }, { tool_name: "Bash", input: { command: "rm -rf /tmp/zz" } }) });
    expect(r.requests).toEqual([]);
    expect(decisions().map((d) => d[1])).toEqual(["deny", "deny"]);
  });
});

describe("hello and computer mode", () => {
  it("folder mode: options.web is { search: true, fetch: ask }", async () => {
    await start();
    const h = await (await fetch(`${base}/v1/hello`)).json();
    expect(h.options.web).toEqual({ search: true, fetch: "ask" });
    expect(h.build).toBe(BRIDGE_BUILD);
    expect(BRIDGE_BUILD).toBe("0.3.14");
  });

  it("computer mode: fetch is ask; every tool is asked as before, with no scopes; the grant does nothing", async () => {
    const secret = await start({ fullAccess: true });
    const h = await (await fetch(`${base}/v1/hello`)).json();
    expect(h.options.web.fetch).toBe("ask");
    const r = await turn(secret, { approval: "each-write", prompt: ASK(search, fetchOf("https://a.example/1"), fetchOf("https://b.example/2")) }, () => A({ allow: true, scope: "turn" }));
    expect(r.requests.map((q) => q.tool)).toEqual(["WebSearch", "WebFetch", "WebFetch"]);
    for (const q of r.requests) expect(q).not.toHaveProperty("scopes");
    for (const d of r.done) expect(d).not.toHaveProperty("scope");
  });
});
