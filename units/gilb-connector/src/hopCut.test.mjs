// @vitest-environment node
// A hand-off cut by the round ceiling: the close answer says so, the answer carries CUT_TEXT, the close goes on the
// hop's own turn, and the next call starts on a fresh turn (nothing is re-sent).
import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CUT_TEXT, MAX_TURN_ROLLS, startConnector } from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const FAKE_COMPUTER = join(HERE, "fake-computer.mjs");
const TURN = "turn-roll-start-f1";
const HOP_B = "76543210fedcba9876543210";
const HOP_A = "0123456789abcdef01234567";
const NEXT = "tell the person what you did, and stop";
const ROUNDS = JSON.stringify({ error: "this turn has used all its tool rounds", next: NEXT });

const closers = [];
const dirs = [];
const opened = [];

afterEach(async () => {
  vi.restoreAllMocks();
  const boxes = opened.splice(0);
  for (const box of boxes) box.session.close();
  await Promise.race([
    Promise.all(boxes.map((box) => box.session.done)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("session did not stop")), 8000)),
  ]);
  for (const box of boxes) {
    box.input.destroy();
    box.output.destroy();
  }
  for (const close of closers.splice(0)) await close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "gilb-roll-"));
  dirs.push(dir);
  return dir;
}

function listen(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = {};
    }
    const rec = { url: req.url ?? "", body };
    requests.push(rec);
    const reply = (await handler(rec, requests)) ?? { status: 404, body: { error: "no such door" } };
    res.writeHead(reply.status ?? 200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply.body ?? {}));
  });
  server.requestTimeout = 0;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      closers.push(() => new Promise((done) => server.close(() => done())));
      resolve({ origin: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`, requests });
    });
  });
}

function connect(opts) {
  const input = new PassThrough();
  const output = new PassThrough();
  const pending = new Map();
  let buf = "";
  output.setEncoding("utf8");
  output.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  const session = startConnector({ input, output, turnId: TURN, claudeBin: FAKE_CLAUDE, as: "me", env: meEnv(), ...opts });
  opened.push({ session, input, output });
  let nextId = 1;
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`no answer for ${method} #${id}`)), 8000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      input.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  return { session, request };
}

function meEnv(extra = {}) {
  const home = scratch();
  return { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_COMPUTER_MODULE: FAKE_COMPUTER, ...extra };
}

const text = (msg) => msg.result.content[0].text;
const posts = (platform) => platform.requests.filter((rec) => rec.url.endsWith("/tool"));
const callTool = (box, name = "read_record", args = { id: "1" }) => box.request("tools/call", { name, arguments: args });

/** A door whose /tool answers come from a script, one per call, then the last one for ever. */
async function scripted(answers) {
  let n = 0;
  return listen((rec) => {
    if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
    const next = answers[Math.min(n, answers.length - 1)];
    n += 1;
    return { body: { result: next } };
  });
}

function stderrLines() {
  const lines = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  return lines;
}


const hopOf = (id, role = "Jackfruit") => ({ id, system: "You are " + role + ".", task: "Do it.", tools: [{ name: "list_records", description: "List", inputSchema: { type: "object", properties: {} } }], role, answer: { role, summary: "s" } });
const run = (box, role = "Jackfruit") => callTool(box, "run_named_role", { role, task: "a" });
const closes = (platform) => posts(platform).filter((rec) => rec.body.name === "hop_done");
const rollLines = (lines) => lines.filter((l) => l.includes("a hand-off ran out of tool rounds; started a new turn"));

/** A door that opens a hop on every run_named_role and answers the close with `closeResult` (a string, or a function of the call). */
function hopDoor(closeResult, extra) {
  let n = 0;
  return listen(async (rec, all) => {
    if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
    const extraAnswer = extra ? await extra(rec, all) : undefined;
    if (extraAnswer) return extraAnswer;
    if (rec.body.name === "run_named_role") {
      n += 1;
      return { body: { hop: hopOf(n % 2 === 1 ? HOP_A : HOP_B, rec.body.arguments.includes("Agent.Concept") ? "Agent.Concept" : "Jackfruit") } };
    }
    if (rec.body.name === "hop_done") return { body: { result: typeof closeResult === "function" ? closeResult(rec) : closeResult } };
    if (rec.body.hop && rec.body.name === "list_records") return { body: { result: "rows" } };
    return { body: { result: "tool-ok" } };
  });
}

const CUT = JSON.stringify({ closed: true, cut: true });
const PLAIN = JSON.stringify({ closed: true });
const answerOf = (res) => JSON.parse(text(res));

describe("a hand-off cut by the round ceiling", () => {
  it("c1 a cut close: CUT_TEXT in the answer, a new turn for the next call, nothing re-sent", async () => {
    const lines = stderrLines();
    const platform = await hopDoor(CUT);
    const box = connect({ origin: platform.origin, env: meEnv() });
    const res = await run(box);
    expect(res.result.isError).toBe(false);
    const answer = answerOf(res);
    expect(answer.cut).toBe(CUT_TEXT);
    expect(answer.role).toBe("Jackfruit");
    expect(typeof answer.content).toBe("string");
    expect(posts(platform).filter((rec) => rec.body.name === "run_named_role")).toHaveLength(1);
    expect(rollLines(lines)).toHaveLength(1);
    expect(lines.join("")).toContain(`(1 of ${MAX_TURN_ROLLS})`);
    await callTool(box);
    const next = posts(platform).at(-1);
    expect(next.body.name).toBe("read_record");
    expect(next.body.turnId).not.toBe(TURN);
    expect(next.body.turnId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(CUT_TEXT).toBe("This hand-off ran out of tool rounds before it finished. Its answer is partial: say so, and hand the rest over again.");
  }, 20000);

  it("c2 a plain close: the answer is as before (no cut field) and the turn stays", async () => {
    const lines = stderrLines();
    const platform = await hopDoor(PLAIN);
    const box = connect({ origin: platform.origin, env: meEnv() });
    const res = await run(box);
    expect(Object.keys(answerOf(res))).toEqual(["role", "summary", "content"]);
    expect(text(res)).not.toContain("cut");
    expect(rollLines(lines)).toHaveLength(0);
    await callTool(box);
    expect(posts(platform).at(-1).body.turnId).toBe(TURN);
  }, 20000);

  it("c3 the close carries the hop's own turn although the main process rolled while the hop ran", async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let seen;
    const hopSeen = new Promise((resolve) => (seen = resolve));
    let rounds = 0;
    const platform = await hopDoor(CUT, async (rec) => {
      if (rec.body.hop && rec.body.name === "list_records") {
        seen();
        await gate;
        return { body: { result: "rows" } };
      }
      if (!rec.body.hop && rec.body.name === "read_record") return { body: { result: ++rounds === 1 ? ROUNDS : "tool-ok" } };
      return undefined;
    });
    const box = connect({ origin: platform.origin, env: meEnv() });
    const lines = stderrLines();
    const running = run(box);
    await hopSeen;
    // A parallel call on the main process: refused by the ceiling, so it rolls and is re-sent on a new turn.
    const parallel = await callTool(box);
    expect(text(parallel)).toBe("tool-ok");
    const rolledTo = posts(platform).filter((rec) => rec.body.name === "read_record").at(-1).body.turnId;
    expect(rolledTo).not.toBe(TURN);
    release();
    const res = await running;
    expect(answerOf(res).cut).toBe(CUT_TEXT);
    const close = closes(platform);
    expect(close).toHaveLength(1);
    expect(close[0].body.turnId).toBe(TURN);
    expect(close[0].body.hop).toEqual({ id: HOP_A, done: true });
    // The live turn was already new, so the cut does not roll a second time.
    expect(rollLines(lines)).toHaveLength(0);
    await callTool(box);
    expect(posts(platform).at(-1).body.turnId).toBe(rolledTo);
  }, 30000);

  it("c4 a cut hop whose role is Agent.Concept: CUT_TEXT, no roll", async () => {
    for (const role of ["Agent.Concept", "agent concept", "Concept"]) {
      const lines = stderrLines();
      const platform = await hopDoor(CUT);
      const box = connect({ origin: platform.origin, env: meEnv() });
      const res = await callTool(box, "run_named_role", { role, task: "a" });
      expect(answerOf(res).cut, role).toBe(CUT_TEXT);
      expect(rollLines(lines), role).toHaveLength(0);
      await callTool(box);
      expect(posts(platform).at(-1).body.turnId, role).toBe(TURN);
    }
    // And a connector that is Agent.Concept itself.
    const platform = await hopDoor(CUT);
    const box = connect({ origin: platform.origin, env: meEnv(), agent: "Agent.Concept" });
    expect(answerOf(await run(box)).cut).toBe(CUT_TEXT);
    await callTool(box);
    expect(posts(platform).at(-1).body.turnId).toBe(TURN);
  }, 30000);

  it("c4 a role that resolves to Agent.Concept on the server (the call named it another way) is not rolled", async () => {
    const lines = stderrLines();
    const platform = await hopDoor(CUT, (rec) => (rec.body.name === "run_named_role" ? { body: { hop: hopOf(HOP_A, "Agent.Concept") } } : undefined));
    const box = connect({ origin: platform.origin, env: meEnv() });
    expect(answerOf(await callTool(box, "run_named_role", { role: "Ontology", task: "a" })).cut).toBe(CUT_TEXT);
    expect(rollLines(lines)).toHaveLength(0);
  }, 20000);

  it("c4 a hand-off from another tool than run_named_role is not rolled", async () => {
    const lines = stderrLines();
    const platform = await hopDoor(CUT, (rec) => (rec.body.name === "ask_agent_concept" ? { body: { hop: hopOf(HOP_A, "Jackfruit") } } : undefined));
    const box = connect({ origin: platform.origin, env: meEnv() });
    expect(answerOf(await callTool(box, "ask_agent_concept", { need: "x" })).cut).toBe(CUT_TEXT);
    expect(rollLines(lines)).toHaveLength(0);
  }, 20000);

  it("c5 in hop mode a hand-off answer cuts nothing and rolls nothing", async () => {
    const lines = stderrLines();
    const platform = await hopDoor(CUT, (rec) => (rec.body.name === "run_named_role" ? { body: { hop: hopOf(HOP_B) } } : undefined));
    const box = connect({
      origin: platform.origin,
      hopId: HOP_A,
      hopTools: [{ name: "run_named_role", description: "Hand off.", inputSchema: { type: "object", properties: {} } }],
    });
    const res = await callTool(box, "run_named_role", { role: "Jackfruit", task: "a" });
    expect(JSON.parse(text(res)).reason).toBe("A hand-off cannot hand off again.");
    expect(text(res)).not.toContain(CUT_TEXT);
    expect(rollLines(lines)).toHaveLength(0);
    await callTool(box, "run_named_role", { role: "Jackfruit", task: "a" });
    for (const rec of posts(platform)) expect(rec.body.turnId).toBe(TURN);
  }, 20000);

  it("c6 after MAX_TURN_ROLLS rolls a cut still says so, but rolls no more", async () => {
    expect(MAX_TURN_ROLLS).toBe(40);
    const lines = stderrLines();
    const platform = await hopDoor(CUT);
    const box = connect({ origin: platform.origin, env: meEnv() });
    for (let i = 0; i < MAX_TURN_ROLLS; i++) expect(answerOf(await run(box)).cut).toBe(CUT_TEXT);
    expect(rollLines(lines)).toHaveLength(MAX_TURN_ROLLS);
    await callTool(box);
    const turnAfter = posts(platform).at(-1).body.turnId;
    const next = await run(box);
    expect(answerOf(next).cut).toBe(CUT_TEXT);
    expect(rollLines(lines)).toHaveLength(MAX_TURN_ROLLS);
    await callTool(box);
    expect(posts(platform).at(-1).body.turnId).toBe(turnAfter);
    expect(new Set(posts(platform).map((rec) => rec.body.turnId)).size).toBe(MAX_TURN_ROLLS + 1);
  }, 120000);

  it("c8 a hand-off that fails and was cut: the failed answer carries CUT_TEXT, and the turn rolls", async () => {
    const lines = stderrLines();
    const platform = await hopDoor(CUT);
    const box = connect({ origin: platform.origin, env: meEnv(), claudeBin: "/nonexistent/gilb-claude" });
    const res = await run(box);
    const answer = answerOf(res);
    expect(res.result.isError).toBe(true);
    expect(answer.error).toBe("the Agent's run failed");
    expect(answer.cut).toBe(CUT_TEXT);
    expect(rollLines(lines)).toHaveLength(1);
    // Without a cut, the failed answer has no cut field.
    const plain = await hopDoor(PLAIN);
    const box2 = connect({ origin: plain.origin, env: meEnv(), claudeBin: "/nonexistent/gilb-claude" });
    expect(Object.keys(answerOf(await run(box2)))).toEqual(["error", "role", "reason", "next"]);
  }, 30000);

  it("c9 a malformed close answer is no cut and does not throw", async () => {
    const bad = ["not json", "null", "[1]", JSON.stringify({ closed: true, cut: "true" }), JSON.stringify({ closed: true, cut: 1 }), JSON.stringify({ cut: false }), JSON.stringify({ result: { cut: true } }), ""];
    for (const answer of bad) {
      const lines = stderrLines();
      const platform = await hopDoor(answer);
      const box = connect({ origin: platform.origin, env: meEnv() });
      const res = await run(box);
      expect(res.result.isError, answer).toBe(false);
      expect(answerOf(res).cut, answer).toBeUndefined();
      expect(rollLines(lines), answer).toHaveLength(0);
    }
    // A close the server refuses (HTTP error) is no cut either.
    const platform = await listen((rec) => {
      if (rec.body.name === "run_named_role") return { body: { hop: hopOf(HOP_A) } };
      if (rec.body.name === "hop_done") return { status: 500, body: { error: "x" } };
      return { body: { result: "rows" } };
    });
    const box = connect({ origin: platform.origin, env: meEnv() });
    expect(answerOf(await run(box)).cut).toBeUndefined();
  }, 60000);
});
