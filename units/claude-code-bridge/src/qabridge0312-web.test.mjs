// @vitest-environment node
// QA-bridge0312 R1: hostile tests on 0.3.12 (web in folder mode). Tests marked FINDING record behaviour the QA report flags;
// they pass today and should be changed on purpose when the finding is fixed.

import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge } from "../bridge/bridge.mjs";
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

async function start({ fullAccess = false, bridgeOpts = {}, noWorkspace = false } = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-qaweb-")));
  logFile = path.join(dir, "claude.log");
  const ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  bridge = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP, APP2], workDir: path.join(dir, "work"), home: dir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", ...(noWorkspace ? {} : { workspace: ws }),
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
async function restart(opts) {
  await bridge?.close();
  if (dir) await removeTestDir(dir);
  return start(opts);
}
afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
  if (dir) await removeTestDir(dir);
});

const rows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
const ASK = (...asks) => `ASKJSON:${JSON.stringify(asks)}`;
const fetchOf = (url) => ({ tool_name: "WebFetch", input: { url } });
const bash = (command) => ({ tool_name: "Bash", input: { command } });
const answerPost = (secret, body) => fetch(`${base}/v1/approval`, { method: "POST", headers: { "content-type": "application/json", origin: originOf.get(secret), "x-bridge-secret": secret }, body: JSON.stringify(body) });

/** Plays the page: `answer(request, n)` returns one body, or an array of them, to post (without turnId and id, which a body may override). */
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
const A = (body, secret) => ({ body, ...(secret ? { secret } : {}) });
const decisions = () => rows("askjson").map((r) => [r.tool, r.decision.behavior, r.decision.message]);
// The stand-in echoes the prompt in its message; the real CLI's message would not carry the URL, so message events are left out.
const allEventsText = (r) => JSON.stringify(r.events.filter((e) => e[0] !== "message"));

describe.each([["session"], ["each-write"]])("QA scope abuse, approval %s", (approval) => {
  it("every malformed scope is a 400 (allow or deny), the question stays open, and the right answer still works", async () => {
    const secret = await start();
    const bad = [null, "TURN", "once ", "", 1, true, ["turn"], { scope: "turn" }, "always", "turn\n"];
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1")) }, () => [
      ...bad.flatMap((s) => [A({ allow: true, scope: s }), A({ allow: false, scope: s })]),
      A({ allow: true, scope: "once" }),
    ]);
    expect(r.answers.map((a) => a.status)).toEqual([...bad.flatMap(() => [400, 400]), 200]);
    expect(r.done).toEqual([{ id: r.requests[0].id, allow: true, scope: "once" }]);
  });

  it("a scope aimed at a question through another (finished) turn's id is a 404 and grants nothing", async () => {
    const secret = await start();
    const r1 = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1")) }, () => A({ allow: true, scope: "once" }));
    const r2 = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), fetchOf("https://b.example/2")) }, (_q, n) => (n === 0 ? [A({ turnId: r1.turnId, allow: true, scope: "turn" }), A({ allow: true, scope: "once" })] : A({ allow: true, scope: "once" })));
    expect(r2.answers.map((a) => a.status)).toEqual([404, 200, 200]);
    expect(r2.requests).toHaveLength(2); // no grant came out of the 404
  });

  it("replay after the turn ended is a 404, scope or not; nothing carries to the next turn", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1")) }, () => A({ allow: true, scope: "turn" }));
    const again = await answerPost(secret, { turnId: r.turnId, id: r.requests[0].id, allow: true, scope: "turn" });
    expect(again.status).toBe(404);
    const r2 = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1")) }, () => A({ allow: true }));
    expect(r2.requests).toHaveLength(1);
  });

  it("a second pairing cannot answer or grant on the first pairing's turn; the question stays open for its owner", async () => {
    const secret = await start();
    const other = await pair(APP2);
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), fetchOf("https://b.example/2")) }, (_q, n) => (n === 0 ? [A({ allow: true, scope: "turn" }, other), A({ allow: false }, other), A({ allow: true, scope: "turn" })] : A({ allow: true })));
    expect(r.answers.map((a) => a.status)).toEqual([404, 404, 200]);
    expect(r.requests).toHaveLength(1); // the owner's own turn grant works; the stranger changed nothing
  });

  it("a local or private host is always asked, once only, even after a turn grant; public hosts after the grant run with no question", async () => {
    const secret = await start();
    const local = ["http://127.0.0.1:47821/v1/hello", "http://localhost:8787/", "http://169.254.169.254/latest/meta-data/", "http://192.168.1.1/", "http://[::1]:8787/", "http://2130706433/", "http://0177.0.0.1/", "http://0x7f000001/", "http://10.0.0.1/", "http://172.16.0.1/", "http://172.31.255.255/", "http://[fe80::1]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://0.0.0.0/", "http://intranet/", "http://printer.local/", "http://db.internal/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://%31%32%37.0.0.1/", "http://LOCALHOST./", "http://127.1/"];
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), ...local.map(fetchOf), fetchOf("https://b.example/2"), fetchOf("http://172.32.0.1/")) }, () => A({ allow: true, scope: "turn" }));
    // 1 (first page) + every local one + the 172.32 address (public range, but only after the grant: runs with no question)
    expect(r.requests).toHaveLength(1 + local.length);
    for (const q of r.requests.slice(1)) {
      expect(q.scopes).toEqual(["once"]);
      expect(q.notice).toMatch(/^Host: .+ \u2014 this computer or your local network$/);
    }
    expect(r.requests[0].scopes).toEqual(["once", "turn"]);
    expect(r.done.slice(1).every((d) => d.scope === "once" && d.allow)).toBe(true); // a "turn" answer to a once-only question grants nothing
    expect(decisions()).toHaveLength(local.length + 3);
  });

  it("the local-host notice reads 'Host: <host> \u2014 this computer or your local network'", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("http://localhost:8787/x")) }, () => A({ allow: false }));
    expect(r.requests[0]).toMatchObject({ summary: "http://localhost:8787/x", notice: "Host: localhost \u2014 this computer or your local network", scopes: ["once"] });
  });

  it("every WebFetch that runs (asked or under a grant) and every WebSearch emits an activity with the URL or query; they count against the tool budget", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), fetchOf("https://evil.example/c?d=CAF\u00C9"), { tool_name: "WebSearch", input: { query: "my query \u00E9" } }) }, () => A({ allow: true, scope: "turn" }));
    const act = r.events.filter((e) => e[0] === "activity").map((e) => e[1]);
    expect(act).toEqual([
      { tool: "WebFetch", summary: "https://a.example/1" },
      { tool: "WebFetch", summary: "https://evil.example/c?d=CAF<U+00C9>" },
      { tool: "WebSearch", summary: "my query <U+00E9>" },
    ]);
  });

  it("a denied page emits no activity; a long URL keeps its host whole and is capped", async () => {
    const secret = await start();
    const long = "https://very-long-host.example:8443/" + "p".repeat(900) + "?end=1";
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://no.example/1"), fetchOf(long)) }, (_q, n) => A({ allow: n === 1 }));
    const act = r.events.filter((e) => e[0] === "activity").map((e) => e[1]);
    expect(act).toHaveLength(1);
    expect(act[0].summary.startsWith("https://very-long-host.example:8443/")).toBe(true);
    expect(act[0].summary.length).toBeLessThanOrEqual(300);
    expect(act[0].summary.endsWith("\u2026")).toBe(true);
  });

  it("web calls count against the tool budget: past it a fetch or search is refused and the page is told once", async () => {
    const secret = await start({ bridgeOpts: { maxToolCalls: 2 } });
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), { tool_name: "WebSearch", input: { query: "q" } }, fetchOf("https://b.example/2"), { tool_name: "WebSearch", input: { query: "q2" } }) }, () => A({ allow: true, scope: "turn" }));
    expect(decisions().map((d) => [d[1], d[2]])).toEqual([["allow", undefined], ["allow", undefined], ["deny", "This turn has used all its tool rounds. Tell the person what you did, and stop."], ["deny", "This turn has used all its tool rounds. Tell the person what you did, and stop."]]);
    expect(r.events.filter((e) => e[0] === "budget_spent")).toHaveLength(1);
  });

  it("a long query URL is shown whole in the question (not cut); a turn grant does not lift the size limit", async () => {
    const secret = await start();
    const long = "https://x.example/p?q=" + "a%20b".repeat(2000) + "&end=THEEND";
    const r = await turn(secret, { approval, prompt: ASK(fetchOf(long)) }, () => A({ allow: true }));
    expect(r.requests[0].summary).toBe(long);
    const huge = "https://x.example/p?q=" + "a".repeat(200_100);
    const r2 = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), fetchOf(huge)) }, () => A({ allow: true, scope: "turn" }));
    expect(r2.requests).toHaveLength(1);
    const last = decisions().slice(-1)[0];
    expect(last[1]).toBe("deny");
    expect(last[2]).toMatch(/too long/);
  });

  it("with a turn grant: file:, data:, javascript:, ftp:, user@host, hidden characters, empty and non-string urls are all still denied", async () => {
    const secret = await start();
    const urls = ["file:///etc/passwd", "data:text/html,hi", "javascript:alert(1)", "ftp://a.example/x", "https://u:p@a.example/", "https://a.example‮/x", "https://a.example/​x", "", "not a url", "//a.example/x"];
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), ...urls.map(fetchOf), { tool_name: "WebFetch", input: { url: 5 } }, { tool_name: "WebFetch", input: {} }) }, () => A({ allow: true, scope: "turn" }));
    expect(r.requests).toHaveLength(1);
    expect(decisions().slice(1).map((d) => d[1])).toEqual(Array(urls.length + 2).fill("deny"));
  });

  it("a fetch with a reserved key is denied even under a turn grant", async () => {
    const secret = await start();
    const r = await turn(secret, { approval, prompt: ASK(fetchOf("https://a.example/1"), { tool_name: "WebFetch", input: JSON.parse('{"url":"https://a.example/2","__proto__":{"x":1}}') }) }, () => A({ allow: true, scope: "turn" }));
    expect(r.requests).toHaveLength(1);
    expect(decisions()[1][1]).toBe("deny");
  });
});

describe("QA: a scope on a non-WebFetch question grants no web reach", () => {
  it("each-write: Bash allowed with scope turn, then a WebFetch is still asked; no scopes / scope echoed for Bash", async () => {
    const secret = await start();
    const r = await turn(secret, { approval: "each-write", prompt: ASK(bash("ls"), fetchOf("https://a.example/1")) }, () => A({ allow: true, scope: "turn" }));
    expect(r.requests.map((q) => q.tool)).toEqual(["Bash", "WebFetch"]);
    expect(r.requests[0]).not.toHaveProperty("scopes");
    expect(r.done[0]).not.toHaveProperty("scope");
    expect(r.requests[1].scopes).toEqual(["once", "turn"]);
  });
});

describe("QA session turn: what the bridge answers when Claude Code asks about the ordinary tools", () => {
  it("session: an in-folder Read/Glob/Grep asked of bridge_approve is refused 'Nobody can answer here' (the real CLI never asks for these: probe 2026-11-18); each-write allows them", async () => {
    const secret = await start();
    const inside = path.join(dir, "MyCode", "a.txt");
    const asks = [{ tool_name: "Read", input: { file_path: inside } }, { tool_name: "Glob", input: { pattern: "*.txt" } }, { tool_name: "Grep", input: { pattern: "x" } }];
    await turn(secret, { approval: "session", prompt: ASK(...asks) });
    expect(decisions().map((d) => [d[1], d[2]])).toEqual(Array(3).fill(["deny", "Nobody can answer here, so this is refused."]));
    await turn(secret, { approval: "each-write", prompt: ASK(...asks) });
    expect(decisions().slice(3).map((d) => d[1])).toEqual(["allow", "allow", "allow"]);
  });

  it("session with delegateCoding: the sonnet-coder subagent starts, another subagent type is refused", async () => {
    const secret = await start();
    await turn(secret, { approval: "session", delegateCoding: true, prompt: ASK({ tool_name: "Agent", input: { subagent_type: "sonnet-coder", prompt: "x" } }, { tool_name: "Agent", input: { subagent_type: "general-purpose", prompt: "x" } }) });
    expect(decisions().map((d) => d[1])).toEqual(["allow", "deny"]);
  });

  it("a page that never answers a session-turn WebFetch question: the turn waits, then is denied 'did not answer'", async () => {
    const secret = await start({ bridgeOpts: { approvalWaitMs: 400 } });
    const r = await turn(secret, { approval: "session", prompt: ASK(fetchOf("https://a.example/1")) }, () => []);
    expect(r.requests).toHaveLength(1);
    expect(decisions()[0]).toEqual(["WebFetch", "deny", "The person did not answer."]);
    expect(r.done[0].allow).toBe(false);
  });
});

describe("QA hello shapes, Windows files-only turn, README", () => {
  it("no code folder: no web option; folder: { search: true, fetch: ask }; computer: { search: true, fetch: ask }", async () => {
    await start({ noWorkspace: true });
    expect((await (await fetch(`${base}/v1/hello`)).json()).options).not.toHaveProperty("web");
    await restart({});
    expect((await (await fetch(`${base}/v1/hello`)).json()).options.web).toEqual({ search: true, fetch: "ask" });
    await restart({ fullAccess: true });
    const h = await (await fetch(`${base}/v1/hello`)).json();
    expect(h.options.web).toEqual({ search: true, fetch: "ask" });
    expect(h.access).toBe("computer");
  });

  it("the Windows files-only turn gets NO web tools: files-only tools, web tools denied, no approval tool in a session turn", async () => {
    const secret = await start({ bridgeOpts: { codePlatform: "win32" } });
    await turn(secret, { approval: "session", prompt: "hello" });
    const a = rows("run")[0].argv;
    const val = (f) => a[a.indexOf(f) + 1];
    expect(val("--tools")).toBe("Read,Edit,Write,Glob,Grep");
    expect(val("--permission-prompts")).toBe("none");
    expect(a).not.toContain("--permission-prompt-tool");
    expect(JSON.parse(val("--settings")).permissions.deny.filter((r) => !/^(Read|Edit)\(/.test(r))).toEqual(["WebFetch", "WebSearch"]);
    expect(val("--append-system-prompt")).not.toContain("search the web");
    const h = await (await fetch(`${base}/v1/hello`)).json();
    expect(h.codeMode).toBe("files-only");
    expect(h.options.web).toEqual({ search: false, fetch: "off" });
  });

  it("the README states the 0.3.12 web protocol", () => {
    const readme = fs.readFileSync(path.join(HERE, "..", "README.md"), "utf8");
    for (const s of ['scopes: ["once","turn"]', "`approval_done` echoes `{id, allow, scope}`", "options.web", "any other scope value is a 400", "0.3.12:"]) expect(readme).toContain(s);
  });

  it("the README's /v1/hello line lists web and images, and the 0.3.21 release note is last", () => {
    const readme = fs.readFileSync(path.join(HERE, "..", "README.md"), "utf8");
    const line = readme.split("\n").find((l) => l.startsWith("- **`GET /v1/hello`** has `options:"));
    expect(line).toContain("{ web,");
    expect(line).toContain("images");
    const notes = readme.split("\n").filter((l) => /^- 0\.\d+\.\d+/.test(l));
    expect(notes[notes.length - 1].startsWith("- 0.3.21:")).toBe(true);
  });
});
