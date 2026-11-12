// @vitest-environment node
// Hand-offs past the cap wait in a FIFO line instead of being refused (Round 8, F12).
// Part 1 tests the line itself with fake timers and no network. Part 2 runs the real connector against a local door
// with the fake claude, to prove the wiring: nothing is sent while a call waits, the turn is the current one, and the answer says it waited.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOP_QUEUE_MAX_WAITING, HOP_QUEUE_MAX_WAIT_MS, HopQueue, MAX_HOPS_AT_ONCE, formatWait, startConnector } from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const FAKE_COMPUTER = join(HERE, "fake-computer.mjs");
const MIN = 60 * 1000;

describe("the hand-off line (fake timers, fake hop runner)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fake hop runner: takes a slot, records when it started, and finishes only when told. */
  function harness(cap = 4, maxWaiting = HOP_QUEUE_MAX_WAITING, maxWaitMs = HOP_QUEUE_MAX_WAIT_MS) {
    const queue = new HopQueue(cap, maxWaiting, maxWaitMs);
    const started = [];
    const answers = new Map();
    const slots = new Map();
    const controllers = new Map();
    const call = (n) => {
      const ac = new AbortController();
      controllers.set(n, ac);
      const p = queue.acquire(ac.signal).then((slot) => {
        answers.set(n, slot);
        if (slot.kind === "slot") {
          started.push(n);
          slots.set(n, slot);
        }
        return slot;
      });
      return p;
    };
    return { queue, started, answers, slots, controllers, call, finish: (n) => slots.get(n).release() };
  }

  it("defaults: 4 at once, 12 waiting, 20 minutes", () => {
    expect(MAX_HOPS_AT_ONCE).toBe(4);
    expect(HOP_QUEUE_MAX_WAITING).toBe(12);
    expect(HOP_QUEUE_MAX_WAIT_MS).toBe(20 * MIN);
  });

  it("6 calls with a cap of 4: 4 start, 2 wait, and each waiter starts when a slot frees, in FIFO order", async () => {
    const h = harness(4);
    for (let n = 1; n <= 6; n++) h.call(n);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.started).toEqual([1, 2, 3, 4]);
    expect(h.queue.running).toBe(4);
    expect(h.queue.waiting).toBe(2);
    await vi.advanceTimersByTimeAsync(190 * 1000);
    h.finish(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.started).toEqual([1, 2, 3, 4, 5]);
    expect(h.queue.running).toBe(4);
    expect(h.answers.get(5).waitedMs).toBe(190 * 1000);
    expect(h.answers.get(5).queued).toBe(true);
    expect(h.answers.get(1).queued).toBe(false);
    h.finish(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.started).toEqual([1, 2, 3, 4, 5, 6]);
    expect(h.queue.waiting).toBe(0);
    // The cap held the whole time.
    expect(h.queue.running).toBe(4);
    // A release twice frees one slot only.
    const before = h.queue.running;
    h.finish(1);
    expect(h.queue.running).toBe(before);
  });

  it("a call arriving while others wait goes to the back, even if a slot is free at that instant", async () => {
    const h = harness(1);
    h.call(1);
    h.call(2);
    await vi.advanceTimersByTimeAsync(0);
    h.finish(1);
    h.call(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.started).toEqual([1, 2]);
    h.finish(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.started).toEqual([1, 2, 3]);
  });

  it("the 17th call is refused (4 open + 12 waiting), with both numbers", async () => {
    const h = harness(4);
    for (let n = 1; n <= 16; n++) h.call(n);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.started).toEqual([1, 2, 3, 4]);
    expect(h.queue.waiting).toBe(12);
    const seventeenth = await h.call(17);
    expect(seventeenth.kind).toBe("refused");
    expect(seventeenth.reason).toBe(
      "Too many hand-offs: 4 are running and 12 are already waiting for a free slot (the most that may wait). Nothing was started. Wait for some to finish, then send this one again.",
    );
    expect(h.queue.waiting).toBe(12);
    // Room opens when one finishes: the next call may wait again.
    h.finish(1);
    await vi.advanceTimersByTimeAsync(0);
    h.call(18);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.queue.waiting).toBe(12);
    expect(h.answers.has(18)).toBe(false);
  });

  it("a wait that passes the limit is refused with how long it waited and how many were ahead", async () => {
    const h = harness(1, 12, 20 * MIN);
    h.call(1);
    h.call(2);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    h.call(3);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.queue.waiting).toBe(2);
    await vi.advanceTimersByTimeAsync(15 * MIN);
    // Call 2 has waited 20 minutes with none ahead: refused. Call 3 is now first in line.
    const two = h.answers.get(2);
    expect(two.kind).toBe("refused");
    expect(two.reason).toBe("This hand-off waited 20 min 0 s for a free hand-off slot and none came (1 were running, 0 waiting ahead of it). Nothing was started. Send it again when fewer hand-offs are running.");
    expect(h.queue.waiting).toBe(1);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    const three = h.answers.get(3);
    expect(three.kind).toBe("refused");
    expect(three.reason).toContain("waited 20 min 0 s");
    // A refused waiter never took a slot.
    expect(h.queue.running).toBe(1);
    expect(h.started).toEqual([1]);
  });

  it("the timeout reports the true count ahead when an earlier waiter is still in line", async () => {
    const h = harness(1, 12, 20 * MIN);
    h.call(1);
    h.call(2);
    await vi.advanceTimersByTimeAsync(0);
    // Waiter 3 is later than 2, but 2 gives up (cancel) only after 3 has timed out? Use two waiters with the same expiry order instead.
    h.call(3);
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(h.answers.get(2).kind).toBe("refused");
    expect(h.answers.get(3).kind).toBe("refused");
    expect(h.answers.get(2).reason).toContain("0 waiting ahead of it");
  });

  it("a cancelled waiter leaves the line without starting; the one behind it takes the slot", async () => {
    const h = harness(1);
    h.call(1);
    h.call(2);
    h.call(3);
    await vi.advanceTimersByTimeAsync(0);
    h.controllers.get(2).abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.answers.get(2).kind).toBe("cancelled");
    expect(h.queue.waiting).toBe(1);
    h.finish(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.started).toEqual([1, 3]);
    // Its timer is gone too: nothing fires later.
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(h.answers.get(2).kind).toBe("cancelled");
  });

  it("a call already cancelled never enters the line or takes a slot", async () => {
    const h = harness(1);
    const ac = new AbortController();
    ac.abort();
    expect((await h.queue.acquire(ac.signal)).kind).toBe("cancelled");
    expect(h.queue.running).toBe(0);
    expect(h.queue.waiting).toBe(0);
  });

  it("formatWait reads like a person would", () => {
    expect(formatWait(190 * 1000)).toBe("3 min 10 s");
    expect(formatWait(45 * 1000)).toBe("45 s");
    expect(formatWait(0)).toBe("0 s");
    expect(formatWait(20 * MIN)).toBe("20 min 0 s");
  });
});

// ---- Part 2: the real connector ----

const TURN = "queue-start-turn1";
const ROUNDS = JSON.stringify({ error: "this turn has used all its tool rounds", next: "tell the person what you did, and stop" });
const closers = [];
const dirs = [];
const opened = [];

afterEach(async () => {
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
  const dir = mkdtempSync(join(tmpdir(), "gilb-queue-"));
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
    const reply = (await handler(rec)) ?? { status: 404, body: { error: "no such door" } };
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
  const home = scratch();
  const env = { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_COMPUTER_MODULE: FAKE_COMPUTER, ...(opts.env ?? {}) };
  const session = startConnector({ input, output, turnId: TURN, claudeBin: FAKE_CLAUDE, as: "me", ...opts, env });
  opened.push({ session, input, output });
  let nextId = 1;
  const start = (method, params) => {
    const id = nextId++;
    const answer = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer for ${method} #${id}`)), 20000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
    input.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return { id, answer };
  };
  const cancel = (requestId) => input.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId } }) + "\n");
  return { session, start, cancel };
}

async function until(pred, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out");
}

const readLog = (file) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const runsLogged = (file) => readLog(file).filter((row) => row.event === "run");

/** A door whose run_named_role opens a hop carrying the task from the call; the call's own role and task come from its arguments. */
function hopDoor(extra) {
  let n = 0;
  return listen((rec) => {
    if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
    const name = rec.body.name;
    if (name === "run_named_role" && !rec.body.hop) {
      const args = JSON.parse(rec.body.arguments || "{}");
      n += 1;
      const id = String(n).padStart(24, "a");
      return { body: { hop: { id, system: "You are Jackfruit.", task: args.task, tools: [{ name: "list_records", description: "List", inputSchema: { type: "object", properties: {} } }], role: "Jackfruit", answer: { role: "Jackfruit", summary: "s" } } } };
    }
    if (name === "hop_done") return { body: { result: "closed" } };
    return extra?.(rec) ?? { body: { result: "ok" } };
  });
}

describe("the real connector queues instead of refusing", () => {
  it("a second call waits, sends nothing to the server, starts when the first ends, and says it waited", async () => {
    const logFile = join(scratch(), "claude.log");
    const platform = await hopDoor();
    const box = connect({ origin: platform.origin, maxHops: 1, env: { FAKE_CLAUDE_LOG: logFile } });
    const first = box.start("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "WAITFOREVER one" } });
    await until(() => runsLogged(logFile).length === 1);
    const second = box.start("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "quick two" } });
    await new Promise((r) => setTimeout(r, 400));
    const roleCalls = () => platform.requests.filter((rec) => rec.body.name === "run_named_role" && !rec.body.hop);
    expect(roleCalls()).toHaveLength(1);
    expect(runsLogged(logFile)).toHaveLength(1);
    box.cancel(first.id);
    const answer = await second.answer;
    expect(answer.result.isError).toBe(false);
    expect(roleCalls()).toHaveLength(2);
    const texts = answer.result.content.map((c) => c.text);
    expect(texts.at(-1)).toMatch(/^\(waited \d+ s for a free hand-off slot\)$/);
    expect(JSON.parse(texts[0]).role).toBe("Jackfruit");
  }, 30000);

  it("a call waiting when its client cancels leaves the line without starting, and no hop is opened for it", async () => {
    const logFile = join(scratch(), "claude.log");
    const platform = await hopDoor();
    const box = connect({ origin: platform.origin, maxHops: 1, env: { FAKE_CLAUDE_LOG: logFile } });
    const first = box.start("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "WAITFOREVER one" } });
    await until(() => runsLogged(logFile).length === 1);
    const second = box.start("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "quick two" } });
    const third = box.start("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "quick three" } });
    await new Promise((r) => setTimeout(r, 300));
    box.cancel(second.id);
    await new Promise((r) => setTimeout(r, 200));
    box.cancel(first.id);
    const answer = await third.answer;
    expect(answer.result.isError).toBe(false);
    const tasks = runsLogged(logFile).map((row) => row.prompt);
    expect(tasks.some((p) => p.includes("quick two"))).toBe(false);
    expect(tasks.some((p) => p.includes("quick three"))).toBe(true);
    const posted = platform.requests.filter((rec) => rec.body.name === "run_named_role" && !rec.body.hop).map((rec) => JSON.parse(rec.body.arguments).task);
    expect(posted).toEqual(["WAITFOREVER one", "quick three"]);
  }, 30000);

  it("a wait past hopQueueMaxWaitMs is refused with how long it waited and how many were ahead", async () => {
    const logFile = join(scratch(), "claude.log");
    const platform = await hopDoor();
    const box = connect({ origin: platform.origin, maxHops: 1, hopQueueMaxWaitMs: 300, env: { FAKE_CLAUDE_LOG: logFile } });
    box.start("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "WAITFOREVER one" } });
    await until(() => runsLogged(logFile).length === 1);
    const second = await box.start("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "quick two" } }).answer;
    expect(second.result.isError).toBe(true);
    const body = JSON.parse(second.result.content[0].text);
    expect(body.reason).toMatch(/^This hand-off waited \d+ s for a free hand-off slot and none came \(1 were running, 0 waiting ahead of it\)\./);
    expect(platform.requests.filter((rec) => rec.body.name === "run_named_role" && !rec.body.hop)).toHaveLength(1);
  }, 30000);

  it("a turn that rolls while a call waits: the call starts under the CURRENT turn, never the turn it was made on", async () => {
    const logFile = join(scratch(), "claude.log");
    let limitNext = true;
    const platform = await hopDoor((rec) => {
      if (rec.body.name === "read_record" && limitNext) {
        limitNext = false;
        return { body: { result: ROUNDS } };
      }
      return { body: { result: "ok" } };
    });
    const box = connect({ origin: platform.origin, maxHops: 1, env: { FAKE_CLAUDE_LOG: logFile } });
    const first = box.start("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "WAITFOREVER one" } });
    await until(() => runsLogged(logFile).length === 1);
    const second = box.start("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "quick two" } });
    await new Promise((r) => setTimeout(r, 200));
    // Another call hits the turn limit, so the connector rolls to a fresh turn while the second hand-off waits.
    const roll = await box.start("tools/call", { name: "read_record", arguments: { id: "1" } }).answer;
    expect(roll.result.isError).toBe(false);
    const reads = platform.requests.filter((rec) => rec.body.name === "read_record");
    expect(reads).toHaveLength(2);
    const newTurn = reads[1].body.turnId;
    expect(newTurn).not.toBe(TURN);
    box.cancel(first.id);
    const answer = await second.answer;
    expect(answer.result.isError).toBe(false);
    const roleCalls = platform.requests.filter((rec) => rec.body.name === "run_named_role" && !rec.body.hop);
    expect(roleCalls).toHaveLength(2);
    expect(roleCalls[0].body.turnId).toBe(TURN);
    expect(roleCalls[1].body.turnId).toBe(newTurn);
    // The first hop was closed on the turn that opened it; the second on the new one.
    const closes = platform.requests.filter((rec) => rec.body.name === "hop_done");
    expect(closes.map((rec) => rec.body.turnId)).toEqual([TURN, newTurn]);
  }, 30000);

  it("closing the session lets waiting calls go without starting them", async () => {
    const logFile = join(scratch(), "claude.log");
    const platform = await hopDoor();
    const box = connect({ origin: platform.origin, maxHops: 1, env: { FAKE_CLAUDE_LOG: logFile } });
    box.start("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "WAITFOREVER one" } });
    await until(() => runsLogged(logFile).length === 1);
    box.start("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "quick two" } });
    await new Promise((r) => setTimeout(r, 200));
    box.session.close();
    await box.session.done;
    expect(runsLogged(logFile)).toHaveLength(1);
    expect(platform.requests.filter((rec) => rec.body.name === "run_named_role" && !rec.body.hop)).toHaveLength(1);
  }, 30000);
});
