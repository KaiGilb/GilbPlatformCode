// @vitest-environment node
// A hand-off stopped by HOP_MAX_MS says its writes stand and the rest can be handed over again; a crash does not.
import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HAND_OFF_FAILED_NEXT, hopTimeoutAnswer, startConnector } from "../connector/gilb-connector.mjs";

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


function readLog(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

/** The paragraph a non-Concept child is given. `minutes` is the limit, already rounded. */
function timeLimitParagraph(minutes) {
  return `\n\nTime limit: this hand-off is stopped after ${minutes} minutes, and whatever is unfinished then is lost to the caller. If the job will not fit, do the first part, then stop and answer with what you wrote (each record or table tag) and exactly what remains, so the caller can hand over the rest.`;
}

const hopOf = (id, role, task) => ({ id, system: "You are " + role + ".", task, tools: [{ name: "list_records", description: "List", inputSchema: { type: "object", properties: {} } }], role, answer: { role, summary: "s" } });
const answerOf = (res) => JSON.parse(text(res));
const closes = (platform) => posts(platform).filter((rec) => rec.body.name === "hop_done");

/** A door that opens a hop for `role` (its task is `task`) and answers every close as a plain close. */
function hopDoor(role, task) {
  return listen((rec) => {
    if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
    if (rec.body.name === "run_named_role") return { body: { hop: hopOf(HOP_A, role, task) } };
    if (rec.body.name === "hop_done") return { body: { result: JSON.stringify({ closed: true }) } };
    return { body: { result: "tool-ok" } };
  });
}
const run = (box, role) => callTool(box, "run_named_role", { role, task: "a" });
const WAIT = "WAITFOREVER";

describe("a hand-off that runs out of time", () => {
  it("t1 a child that never finishes: the partial answer, and the hop is closed", async () => {
    stderrLines();
    const platform = await hopDoor("Agent.Outcome", WAIT);
    const box = connect({ origin: platform.origin, env: meEnv(), hopMaxMs: 400 });
    const res = await run(box, "Agent.Outcome");
    expect(res.result.isError).toBe(true);
    expect(text(res)).toBe(hopTimeoutAnswer("Agent.Outcome", 400));
    const answer = answerOf(res);
    expect(answer.error).toBe("the hand-off ran out of time");
    expect(answer.partial).toContain("after 1 minute. What it wrote before then is saved");
    expect(answer.next).not.toBe(HAND_OFF_FAILED_NEXT);
    expect(closes(platform)).toHaveLength(1);
  }, 20000);

  it("t2 a child that crashes: the failed answer is unchanged", async () => {
    stderrLines();
    const platform = await hopDoor("Agent.Outcome", "quick");
    const box = connect({ origin: platform.origin, env: meEnv(), claudeBin: "/nonexistent/gilb-claude" });
    const answer = answerOf(await run(box, "Agent.Outcome"));
    expect(Object.keys(answer)).toEqual(["error", "role", "reason", "next"]);
    expect(answer.error).toBe("the Agent's run failed");
    expect(answer.next).toBe(HAND_OFF_FAILED_NEXT);
    expect(closes(platform)).toHaveLength(1);
  }, 20000);

  it("t3 a hand-off to Agent.Concept that times out keeps today's failed answer", async () => {
    for (const role of ["Agent.Concept", "Concept"]) {
      stderrLines();
      const platform = await hopDoor(role, WAIT);
      const box = connect({ origin: platform.origin, env: meEnv(), hopMaxMs: 400 });
      const answer = answerOf(await run(box, role));
      expect(answer.error, role).toBe("the Agent's run failed");
      expect(answer.reason, role).toBe("The hand-off took too long and was stopped.");
      expect(answer.next, role).toBe(HAND_OFF_FAILED_NEXT);
    }
    // The server's own name for the hop decides, not the name the call used.
    const platform = await hopDoor("Agent.Concept", WAIT);
    const box = connect({ origin: platform.origin, env: meEnv(), hopMaxMs: 400 });
    expect(answerOf(await run(box, "Ontology")).next).toBe(HAND_OFF_FAILED_NEXT);
    // And a connector that is Agent.Concept itself.
    const own = await hopDoor("Jackfruit", WAIT);
    const ownBox = connect({ origin: own.origin, env: meEnv(), hopMaxMs: 400, agent: "Agent.Concept" });
    expect(answerOf(await run(ownBox, "Jackfruit")).next).toBe(HAND_OFF_FAILED_NEXT);
  }, 40000);

  it("t4 the minutes in the sentence follow the limit", async () => {
    expect(JSON.parse(hopTimeoutAnswer("R", 15 * 60 * 1000)).partial).toContain("after 15 minutes.");
    expect(JSON.parse(hopTimeoutAnswer("R", 20 * 60 * 1000)).partial).toContain("after 20 minutes.");
    expect(JSON.parse(hopTimeoutAnswer("R", 60 * 1000)).partial).toContain("after 1 minute.");
    expect(JSON.parse(hopTimeoutAnswer("R", 400)).partial).toContain("after 1 minute.");
    expect(JSON.parse(hopTimeoutAnswer("Agent.Outcome", 900000)).role).toBe("Agent.Outcome");
  });

  it("t5 a non-Concept child is told the minutes from hopMaxMs; a Concept child's stdin is exactly the task", async () => {
    const paragraph = timeLimitParagraph(2);
    const logFile = join(scratch(), "claude.log");
    const platform = await hopDoor("Agent.Outcome", "Do the records.");
    const box = connect({ origin: platform.origin, env: meEnv({ FAKE_CLAUDE_LOG: logFile }), hopMaxMs: 2 * 60 * 1000 });
    expect((await run(box, "Agent.Outcome")).result.isError).toBe(false);
    const prompt = readLog(logFile)[0].prompt;
    expect(prompt.endsWith(paragraph)).toBe(true);
    expect(prompt).toBe(`Do the records.${paragraph}`);

    for (const role of ["Agent.Concept", "Concept"]) {
      const conceptLog = join(scratch(), "concept.log");
      const concept = await hopDoor(role, "Mint one concept.");
      const conceptBox = connect({ origin: concept.origin, env: meEnv({ FAKE_CLAUDE_LOG: conceptLog }), hopMaxMs: 2 * 60 * 1000 });
      await run(conceptBox, role);
      expect(readLog(conceptLog)[0].prompt, role).toBe("Mint one concept.");
    }
    // The connector itself being Agent.Concept is the same test runHop uses, not only the hop's role.
    const ownLog = join(scratch(), "own.log");
    const own = await hopDoor("Jackfruit", "Mint from here.");
    const ownBox = connect({ origin: own.origin, env: meEnv({ FAKE_CLAUDE_LOG: ownLog }), hopMaxMs: 2 * 60 * 1000, agent: "Agent.Concept" });
    await run(ownBox, "Jackfruit");
    expect(readLog(ownLog)[0].prompt).toBe("Mint from here.");
  }, 20000);
});
