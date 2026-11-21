// @vitest-environment node
// Round 9 (0.6.2): a cut on tool rounds or hand-offs never leaves the person blocked. Agent.Concept calls are not sent again,
// but the turn is renewed and the answer says what to do next; a run_named_role near the ceiling starts on a new turn.
// W4.4 (Q17/Q18, Kai 2026-11-21): a turn limit no longer makes Agent.Concept wait for the person's next message (it goes on by itself on the renewed turn).
// Only the server's word that the person's DAILY package limit was reached (`dailyLimit` on the hand-off's close) pauses it. Both reasons are tested below.
// MOCK: the platform is a local fake door that answers what each test scripts (the real limit is counted on the server: GilbPlatform test/w44-*).
import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CUT_TEXT, MAX_TURN_ROLLS, startConnector } from "../connector/gilb-connector.mjs";
import { CONCEPT_PAUSED_NEXT } from "../connector/gilb-connector.mjs";
import * as connectorModule from "../connector/gilb-connector.mjs";

const TURN_ROUNDS_CEILING = connectorModule.TURN_ROUNDS_CEILING ?? 240;
const HAND_OFF_ROUND_RESERVE = connectorModule.HAND_OFF_ROUND_RESERVE ?? 60;

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

const HOPS = JSON.stringify({ error: "this turn has handed over as many times as one turn may", next: NEXT });

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

const skipLines = (lines) => lines.filter((l) => l.includes("turn not renewed"));

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

describe("round cut never blocks the person (stuck case i: run_named_role Agent.Concept from the main turn)", () => {
  it("r1 a rounds refusal on Agent.Concept is not re-sent, the turn is renewed, the answer says what to do", async () => {
    for (const limit of [ROUNDS, HOPS]) {
      const lines = stderrLines();
      const platform = await scripted([limit, "tool-ok"]);
      const box = connect({ origin: platform.origin });
      const res = await callTool(box, "run_named_role", { role: "Agent.Concept", task: "x" });
      expect(posts(platform)).toHaveLength(1);
      const answer = JSON.parse(text(res));
      expect(answer.renewed).toBe(true);
      expect(answer.next).toContain("call run_named_role again");
      expect(answer.next).toContain("check first with");
      expect(answer.next).not.toBe(NEXT);
      expect(lines.some((l) => l.includes("started a new turn"))).toBe(true);
      const after = await callTool(box);
      expect(text(after)).toBe("tool-ok");
      expect(posts(platform)[1].body.turnId).not.toBe(TURN);
    }
  });

  it("r2 r11 a connector that is Agent.Concept renews too (W4.4, Q17: it no longer stops for the person); ask_agent_concept renews", async () => {
    const platform = await scripted([ROUNDS, "tool-ok"]);
    const lines = stderrLines();
    const box = connect({ origin: platform.origin, agent: "Agent.Concept" });
    // W4.4: a connector that is Agent.Concept renews the turn and says to call again; it does not tell the model to stop.
    const refused = JSON.parse(text(await callTool(box)));
    expect(refused.renewed).toBe(true);
    expect(refused.next).not.toBe(NEXT);
    expect(refused.conceptPaused).toBeUndefined();
    await callTool(box);
    expect(posts(platform)).toHaveLength(2);
    expect(posts(platform)[1].body.turnId).not.toBe(TURN);
    expect(skipLines(lines).some((l) => l.includes("this connector is Agent.Concept"))).toBe(false);
    const p2 = await scripted([ROUNDS, "tool-ok"]);
    const b2 = connect({ origin: p2.origin });
    expect(JSON.parse(text(await callTool(b2, "ask_agent_concept", { need: "x" }))).renewed).toBe(true);
    await callTool(b2);
    expect(posts(p2)[1].body.turnId).not.toBe(TURN);
  });

  it("r3 a second refusal after the one re-send renews again instead of saying stop", async () => {
    const platform = await scripted([ROUNDS, ROUNDS, "tool-ok"]);
    const box = connect({ origin: platform.origin });
    const res = await callTool(box);
    expect(posts(platform)).toHaveLength(2);
    expect(JSON.parse(text(res)).renewed).toBe(true);
    await callTool(box);
    expect(posts(platform)[2].body.turnId).not.toBe(posts(platform)[1].body.turnId);
  });

  it("r4 past MAX_TURN_ROLLS the answer says it could not renew, and each skip is logged", async () => {
    const lines = stderrLines();
    const platform = await scripted([ROUNDS]);
    const box = connect({ origin: platform.origin });
    let res;
    for (let i = 0; i < 2 * MAX_TURN_ROLLS; i++) {
      res = await callTool(box);
      if (JSON.parse(text(res)).renewed !== true) break;
    }
    expect(JSON.parse(text(res)).error).toContain("start a new chat");
    expect(skipLines(lines).length).toBeGreaterThan(0);
    expect(skipLines(lines)[0]).toContain(String(MAX_TURN_ROLLS));
  }, 60000);
});

describe("W4.4 (Q17/Q18): Agent.Concept waits for the person on the daily limit only, never on a turn limit", () => {
  const concept = (box) => callTool(box, "run_named_role", { role: "Agent.Concept", task: "x" });
  const outcome = (box) => callTool(box, "run_named_role", { role: "Agent.Outcome", task: "x" });
  const DAILY = JSON.stringify({ closed: true, dailyLimit: true });

  // ---- reason 1: a per-turn limit. Agent.Concept goes on by itself. ----
  it("r9 per-turn reason: a cut Concept call renews the turn and Agent.Concept is sent again at once, with no wait for the person (W4.4, Q17)", async () => {
    const platform = await scripted([ROUNDS, "role-ok"]);
    const box = connect({ origin: platform.origin });
    const first = JSON.parse(text(await concept(box)));
    expect(first.renewed).toBe(true);
    expect(first.conceptPaused).toBeUndefined();
    expect(posts(platform)).toHaveLength(1);
    // The next Concept call is SENT (not answered locally as paused), on the new turn.
    expect(text(await concept(box))).toBe("role-ok");
    expect(posts(platform)).toHaveLength(2);
    expect(posts(platform)[1].body.turnId).not.toBe(TURN);
    expect(posts(platform)[1].body.arguments).toContain("Agent.Concept");
    // ask_agent_concept is not held back either.
    const ask = await callTool(box, "ask_agent_concept", { need: "x" });
    expect(text(ask)).toBe("role-ok");
    expect(posts(platform)).toHaveLength(3);
  });

  it("r9 per-turn reason: a cut Concept hand-off sets no brake; the next Concept hand-off is sent (W4.4, Q17)", async () => {
    const platform = await hopDoor(CUT);
    const box = connect({ origin: platform.origin, env: meEnv() });
    const first = answerOf(await concept(box));
    expect(first.cut).toBe(CUT_TEXT);
    expect(first.conceptPaused).toBeUndefined();
    const before = posts(platform).filter((rec) => rec.body.name === "run_named_role").length;
    const second = answerOf(await concept(box));
    expect(second.conceptPaused).toBeUndefined();
    expect(posts(platform).filter((rec) => rec.body.name === "run_named_role")).toHaveLength(before + 1);
    expect(posts(platform).filter((rec) => rec.body.name === "run_named_role").at(-1).body.turnId).not.toBe(TURN);
  }, 30000);

  // ---- reason 2: the person's daily package limit. Agent.Concept waits for the person's next message. ----
  it("r12 daily reason: a Concept hand-off that closes with dailyLimit answers conceptPaused, and no further Concept call is sent (W4.4, Q18)", async () => {
    const platform = await hopDoor(DAILY);
    const box = connect({ origin: platform.origin, env: meEnv() });
    const first = answerOf(await concept(box));
    expect(first.conceptPaused).toBe(true);
    expect(first.next).toBe(CONCEPT_PAUSED_NEXT.daily);
    const before = posts(platform).length;
    const second = answerOf(await concept(box));
    expect(second.conceptPaused).toBe(true);
    expect(second.next).toBe(CONCEPT_PAUSED_NEXT.daily);
    expect(posts(platform)).toHaveLength(before);
    expect(answerOf(await callTool(box, "ask_agent_concept", { need: "x" })).conceptPaused).toBe(true);
    expect(posts(platform)).toHaveLength(before);
    // Other agents are not held back.
    await outcome(box);
    expect(posts(platform).filter((rec) => rec.body.name === "run_named_role").at(-1).body.arguments).toContain("Agent.Outcome");
  }, 30000);

  it("r12 daily reason: the person's next message (gilbplatform_task) clears the pause and Concept is sent again (W4.4, Q18)", async () => {
    const platform = await hopDoor(DAILY);
    const box = connect({ origin: platform.origin, env: meEnv() });
    await concept(box);
    expect(answerOf(await concept(box)).conceptPaused).toBe(true);
    await callTool(box, "gilbplatform_task", { text: "a new request" });
    const before = posts(platform).filter((rec) => rec.body.name === "run_named_role").length;
    await concept(box);
    const roles = posts(platform).filter((rec) => rec.body.name === "run_named_role");
    expect(roles).toHaveLength(before + 1);
    expect(roles.at(-1).body.arguments).toContain("Agent.Concept");
  }, 30000);

  it("r12 the two reasons together: a cut then a daily limit: the cut does not pause, the daily limit does (W4.4, Q17/Q18)", async () => {
    const closes = [CUT, DAILY, DAILY];
    let n = 0;
    const platform = await hopDoor(() => closes[Math.min(n++, closes.length - 1)]);
    const box = connect({ origin: platform.origin, env: meEnv() });
    expect(answerOf(await concept(box)).conceptPaused).toBeUndefined(); // the cut
    expect(answerOf(await concept(box)).conceptPaused).toBe(true); // sent, and the server says the daily limit
    const sent = posts(platform).filter((rec) => rec.body.name === "run_named_role").length;
    expect(answerOf(await concept(box)).conceptPaused).toBe(true); // now answered here
    expect(posts(platform).filter((rec) => rec.body.name === "run_named_role")).toHaveLength(sent);
  }, 30000);

  // ---- the main-pick case: this connector IS Agent.Concept (Hacker, W4.4 round 2) ----
  for (const error of ["ConceptDailyLimitReached", "MintQuotaReached"]) {
    it(`r13 a connector that is Agent.Concept: a mint answered ${error} stops the mint tools until the person's next message; reads still work (W4.4, Q18)`, async () => {
      const limit = JSON.stringify({ error, message: "the limit" });
      const platform = await scripted([limit, "read-ok", "mint-ok"]);
      const box = connect({ origin: platform.origin, agent: "Agent.Concept" });
      expect(text(await callTool(box, "mint_term", { terms: [] }))).toBe(limit);
      expect(posts(platform)).toHaveLength(1);
      // Every mint tool is now answered here, not sent.
      for (const tool of ["mint_term", "mint_taxa", "change_term"]) {
        const paused = JSON.parse(text(await callTool(box, tool, { terms: [] })));
        expect(paused.conceptPaused, tool).toBe(true);
        expect(paused.next, tool).toBe(CONCEPT_PAUSED_NEXT.daily);
      }
      expect(posts(platform)).toHaveLength(1);
      // A read is sent.
      expect(text(await callTool(box))).toBe("read-ok");
      expect(posts(platform)).toHaveLength(2);
      // The person's next message clears it.
      await callTool(box, "gilbplatform_task", { text: "a new request" });
      expect(text(await callTool(box, "mint_term", { terms: [] }))).toBe("mint-ok");
      expect(posts(platform)).toHaveLength(3);
    });
  }

  it("r13 a connector that is Agent.Concept: another refusal (not a daily limit) pauses nothing, and the per-turn ProposalLimitReached is not a pause (W4.4, Q17)", async () => {
    const gaps = JSON.stringify({ error: "MintPackageGaps", gaps: [] });
    const turnLimit = JSON.stringify({ error: "ProposalLimitReached", message: "x" });
    const platform = await scripted([gaps, turnLimit, "mint-ok"]);
    const box = connect({ origin: platform.origin, agent: "Agent.Concept" });
    await callTool(box, "mint_term", { terms: [] });
    await callTool(box, "mint_taxa", { taxa: [] });
    expect(text(await callTool(box, "mint_term", { terms: [] }))).toBe("mint-ok");
    expect(posts(platform)).toHaveLength(3);
  });

  it("r13 an agent that is not Agent.Concept is not paused locally by a mint answer it sees (the hop close carries the pause for it)", async () => {
    const limit = JSON.stringify({ error: "MintQuotaReached", message: "q" });
    const platform = await scripted([limit, "mint-ok"]);
    const box = connect({ origin: platform.origin });
    await callTool(box, "mint_term", { terms: [] });
    expect(text(await callTool(box, "mint_term", { terms: [] }))).toBe("mint-ok");
  });

  it("r11 the pause's words: only the daily reason exists, in plain words, and tells the model to tell the person (W4.4, Q18)", () => {
    expect(Object.keys(CONCEPT_PAUSED_NEXT)).toEqual(["daily"]);
    expect(CONCEPT_PAUSED_NEXT.daily).toContain("daily limit");
    expect(CONCEPT_PAUSED_NEXT.daily).toContain("Tell the person in plain words");
    expect(CONCEPT_PAUSED_NEXT.daily).toContain("gilbplatform_task");
    expect(CONCEPT_PAUSED_NEXT.daily).not.toContain("round budget");
  });
});

describe("round cut never blocks the person (stuck case ii: a hand-off cut by the cap)", () => {
  it("r5 a cut Agent.Concept hand-off renews the turn, nothing is re-sent", async () => {
    for (const role of ["Agent.Concept", "agent concept", "Concept"]) {
      const platform = await hopDoor(CUT);
      const box = connect({ origin: platform.origin, env: meEnv() });
      const res = await callTool(box, "run_named_role", { role, task: "a" });
      expect(answerOf(res).cut, role).toBe(CUT_TEXT);
      await callTool(box);
      expect(posts(platform).at(-1).body.turnId, role).not.toBe(TURN);
      expect(posts(platform).filter((r) => r.body.name === "run_named_role"), role).toHaveLength(1);
    }
  }, 30000);

  it("r6 a hand-off that resolves to Agent.Concept on the server, or comes from ask_agent_concept, renews too", async () => {
    const platform = await hopDoor(CUT, (rec) => (rec.body.name === "ask_agent_concept" ? { body: { hop: hopOf(HOP_A, "Jackfruit") } } : undefined));
    const box = connect({ origin: platform.origin, env: meEnv() });
    expect(answerOf(await callTool(box, "ask_agent_concept", { need: "x" })).cut).toBe(CUT_TEXT);
    await callTool(box);
    expect(posts(platform).at(-1).body.turnId).not.toBe(TURN);
  }, 30000);

  it("r7 a skipped renewal after a cut is logged with its reason", async () => {
    const lines = stderrLines();
    const platform = await hopDoor(CUT);
    const box = connect({ origin: platform.origin, env: meEnv(), hopId: undefined });
    for (let i = 0; i < MAX_TURN_ROLLS + 1; i++) await run(box);
    expect(skipLines(lines).some((l) => l.includes(String(MAX_TURN_ROLLS)))).toBe(true);
  }, 120000);
});

describe("pre-roll before run_named_role", () => {
  it("r8 at the ceiling minus the hand-off reserve the turn stays, one more round and run_named_role starts on a new turn", async () => {
    const lines = stderrLines();
    const platform = await scripted(["tool-ok"]);
    const box = connect({ origin: platform.origin });
    const room = TURN_ROUNDS_CEILING - HAND_OFF_ROUND_RESERVE;
    for (let i = 0; i < room - 1; i++) await callTool(box);
    await callTool(box, "run_named_role", { role: "Jackfruit", task: "x" });
    expect(posts(platform).at(-1).body.turnId).toBe(TURN);
    await callTool(box);
    await callTool(box, "run_named_role", { role: "Agent.Concept", task: "x" });
    const last = posts(platform).at(-1);
    expect(last.body.name).toBe("run_named_role");
    expect(last.body.turnId).not.toBe(TURN);
    expect(lines.some((l) => l.includes("too near the"))).toBe(true);
    await callTool(box);
    expect(posts(platform).at(-1).body.turnId).toBe(last.body.turnId);
  }, 60000);

  it("r9 reads never pre-roll", async () => {
    const platform = await scripted(["tool-ok"]);
    const box = connect({ origin: platform.origin });
    for (let i = 0; i < TURN_ROUNDS_CEILING - 10; i++) await callTool(box);
    expect(new Set(posts(platform).map((r) => r.body.turnId)).size).toBe(1);
  }, 60000);
});
