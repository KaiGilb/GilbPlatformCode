// @vitest-environment node
// A long run: when the server refuses a call because the turn is out of room (before it runs anything),
// the connector starts a fresh turn and sends the same call once. Also --hop-model for hand-offs.
import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError, MAX_TURN_ROLLS, parseCli, startConnector } from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const FAKE_COMPUTER = join(HERE, "fake-computer.mjs");
const TURN = "turn-roll-start-f1";
const HOP_A = "0123456789abcdef01234567";
const NEXT = "tell the person what you did, and stop";
const ROUNDS = JSON.stringify({ error: "this turn has used all its tool rounds", next: NEXT });
const HOPS = JSON.stringify({ error: "this turn has handed over as many times as one turn may", next: NEXT });

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

describe("a turn out of room", () => {
  it("f1 the round limit rolls to a fresh turn and sends the same call once", async () => {
    const lines = stderrLines();
    const platform = await scripted([ROUNDS, "tool-ok"]);
    const box = connect({ origin: platform.origin });
    const res = await callTool(box);
    expect(res.result.isError).toBe(false);
    expect(text(res)).toBe("tool-ok");
    const sent = posts(platform);
    expect(sent).toHaveLength(2);
    expect(sent[0].body.turnId).toBe(TURN);
    expect(sent[1].body.turnId).not.toBe(TURN);
    expect(sent[1].body.turnId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(sent[1].body.name).toBe(sent[0].body.name);
    expect(sent[1].body.arguments).toBe(sent[0].body.arguments);
    expect(lines.filter((l) => l.includes(`started a new turn (1 of ${MAX_TURN_ROLLS})`))).toHaveLength(1);
    // The next call stays on the new turn.
    const again = await callTool(box);
    expect(posts(platform)[2].body.turnId).toBe(sent[1].body.turnId);
    expect(text(again)).toBe("tool-ok");
  });

  it("f1 the hop limit on run_named_role rolls the same way", async () => {
    const platform = await scripted([HOPS, "role-ok"]);
    const box = connect({ origin: platform.origin });
    const res = await callTool(box, "run_named_role", { role: "Jackfruit", task: "x" });
    expect(text(res)).toBe("role-ok");
    const sent = posts(platform);
    expect(sent).toHaveLength(2);
    expect(sent[1].body.turnId).not.toBe(sent[0].body.turnId);
    expect(sent[1].body.arguments).toBe(sent[0].body.arguments);
  });

  it("f1 the hop limit answered to some other tool is passed through (only a hand-off can give it)", async () => {
    const platform = await scripted([HOPS]);
    const box = connect({ origin: platform.origin });
    const res = await callTool(box);
    expect(text(res)).toBe(HOPS);
    expect(posts(platform)).toHaveLength(1);
  });

  it("f1 a second limit answer straight after the re-send does not loop", async () => {
    const platform = await scripted([ROUNDS]);
    const box = connect({ origin: platform.origin });
    const res = await callTool(box);
    expect(posts(platform)).toHaveLength(2);
    expect(text(res)).toBe(ROUNDS);
  });

  it("f1 look-alike answers do not roll", async () => {
    const likes = [
      JSON.stringify({ error: "this turn has used all its tool rounds." , next: NEXT }),
      JSON.stringify({ error: "This turn has used all its tool rounds", next: NEXT }),
      JSON.stringify({ error: "this turn has used all its tool rounds", next: "go on" }),
      JSON.stringify({ error: "this turn has used all its tool rounds" }),
      JSON.stringify({ message: "this turn has used all its tool rounds", next: NEXT }),
      JSON.stringify({ rows: [{ error: "this turn has used all its tool rounds", next: NEXT }] }),
      JSON.stringify([{ error: "this turn has used all its tool rounds", next: NEXT }]),
      `note: ${ROUNDS}`,
      "this turn has used all its tool rounds",
    ];
    for (const like of likes) {
      const platform = await scripted([like]);
      const box = connect({ origin: platform.origin });
      const res = await callTool(box);
      expect(text(res), like).toBe(like);
      expect(posts(platform), like).toHaveLength(1);
    }
  });

  it("f1 hand-off look-alikes do not roll", async () => {
    const likes = [
      JSON.stringify({ error: "this turn has handed over as many times as one turn may.", next: NEXT }),
      JSON.stringify({ error: "this turn has handed over", next: NEXT }),
      JSON.stringify({ error: "this turn has handed over as many times as one turn may", next: "x" }),
      `see ${HOPS}`,
    ];
    for (const like of likes) {
      const platform = await scripted([like]);
      const box = connect({ origin: platform.origin });
      const res = await callTool(box, "run_named_role", { role: "Jackfruit", task: "x" });
      expect(text(res), like).toBe(like);
      expect(posts(platform), like).toHaveLength(1);
    }
  });

  it("f1 after a roll the context is read again, on the new turn", async () => {
    let n = 0;
    const platform = await listen((rec) => {
      if (rec.url.endsWith("/context")) return { body: { system: "STANDING That person is identified as: https://id.example.test/base/p/abc. ", tools: [{ name: "read_record", description: "Read.", inputSchema: { type: "object", properties: {} } }] } };
      if (rec.url.endsWith("/tool")) return { body: { result: ++n === 1 ? ROUNDS : "tool-ok" } };
      return { status: 404, body: { error: "no such door" } };
    });
    const box = connect({ origin: platform.origin });
    await box.request("tools/list", {});
    await box.request("tools/list", {});
    const contexts = () => platform.requests.filter((rec) => rec.url.endsWith("/context"));
    expect(contexts()).toHaveLength(1);
    await callTool(box);
    await box.request("tools/list", {});
    expect(contexts()).toHaveLength(2);
    expect(contexts()[1].body.turnId).not.toBe(TURN);
  });

  it("f1 a limit that comes as an HTTP error, not a tool answer, does not roll", async () => {
    const platform = await listen(() => ({ status: 429, body: { error: "this turn has used all its tool rounds", next: NEXT } }));
    const box = connect({ origin: platform.origin });
    const res = await callTool(box);
    expect(res.result.isError).toBe(true);
    expect(posts(platform)).toHaveLength(1);
  });

  it("f1 Agent.Concept never rolls, in any spelling", async () => {
    for (const agent of ["Agent.Concept", "agent.concept", "AGENT-CONCEPT", " Agent Concept "]) {
      const platform = await scripted([ROUNDS]);
      const box = connect({ origin: platform.origin, agent });
      const res = await callTool(box);
      expect(text(res), agent).toBe(ROUNDS);
      expect(posts(platform), agent).toHaveLength(1);
    }
  });

  it("f9 run_named_role with a role that folds to Agent.Concept never rolls, whichever agent the connector is on", async () => {
    const roles = ["Agent.Concept", "agent.concept", "AGENT_CONCEPT", " agent concept ", "Agent-Concept", "AgentConcept", "Agent.Concept.v2"];
    for (const agent of ["Kai-Zen", "Jackfruit"]) {
      for (const limit of [ROUNDS, HOPS]) {
        for (const role of roles) {
          const platform = await scripted([limit, "role-ok"]);
          const box = connect({ origin: platform.origin, agent });
          const res = await callTool(box, "run_named_role", { role, task: "x" });
          expect(text(res), `${agent} ${role}`).toBe(limit);
          expect(posts(platform), `${agent} ${role}`).toHaveLength(1);
        }
      }
    }
  });

  it("n3 a bare Concept, or any role whose fold holds concept, never rolls", async () => {
    // roleMatchKey is trim, lower-case, and drop dash, underscore and space; a role is matched to a title or unit tag by that key.
    for (const role of ["Concept", "concept", "CONCEPT", " Concept ", "Con-cept", "con_cept", "the Concept agent", "Concept.v2", "Agent.Concept", "Concepts"]) {
      for (const limit of [ROUNDS, HOPS]) {
        const platform = await scripted([limit, "role-ok"]);
        const box = connect({ origin: platform.origin });
        const res = await callTool(box, "run_named_role", { role, task: "x" });
        expect(text(res), role).toBe(limit);
        expect(posts(platform), role).toHaveLength(1);
      }
    }
  });

  it("f9 the role is read from arguments given as a JSON string too, and an unreadable role fails closed", async () => {
    for (const args of [JSON.stringify({ role: "Agent.Concept", task: "x" }), "{not json", JSON.stringify({ task: "x" }), JSON.stringify({ role: 5 }), "null", JSON.stringify(["Agent.Concept"])]) {
      const platform = await scripted([HOPS, "role-ok"]);
      const box = connect({ origin: platform.origin });
      const res = await callTool(box, "run_named_role", args);
      expect(text(res), String(args)).toBe(HOPS);
      expect(posts(platform), String(args)).toHaveLength(1);
    }
  });

  it("f9 a role given as a record address (Agent.Concept's address, however spelled) never rolls", async () => {
    // A fold of an address does not equal agentconcept (the slashes, dots and ids stay in it), so the fold alone would roll.
    const address = "https://veda.example.test/base/e/06gf80rjtdw3h9q187p80kx00m";
    const folded = address.toLowerCase().replace(/[^a-z0-9]/g, "");
    expect(folded).not.toBe("agentconcept");
    for (const role of [address, `${address}/`, "veda.example.test/base/e/06gf80rjtdw3h9q187p80kx00m", "t:AgentConcept/x", "https%3A%2F%2Fx"]) {
      const platform = await scripted([HOPS, "role-ok"]);
      const box = connect({ origin: platform.origin });
      const res = await callTool(box, "run_named_role", { role, task: "x" });
      expect(text(res), role).toBe(HOPS);
      expect(posts(platform), role).toHaveLength(1);
    }
  });

  it("f9 an ordinary role still rolls", async () => {
    const platform = await scripted([HOPS, "role-ok"]);
    const box = connect({ origin: platform.origin });
    const res = await callTool(box, "run_named_role", { role: "Jackfruit", task: "x" });
    expect(text(res)).toBe("role-ok");
    const viaString = await scripted([HOPS, "role-ok"]);
    const box2 = connect({ origin: viaString.origin });
    expect(text(await callTool(box2, "run_named_role", JSON.stringify({ role: "Agent.Outcome", task: "x" })))).toBe("role-ok");
  });

  it("f1 ask_agent_concept never rolls", async () => {
    const platform = await scripted([ROUNDS]);
    const box = connect({ origin: platform.origin });
    const res = await callTool(box, "ask_agent_concept", { need: "a term" });
    expect(text(res)).toBe(ROUNDS);
    expect(posts(platform)).toHaveLength(1);
  });

  it("f1 a hop never rolls", async () => {
    const platform = await scripted([ROUNDS, "tool-ok"]);
    const box = connect({
      origin: platform.origin,
      hopId: HOP_A,
      hopTools: [{ name: "read_record", description: "Read.", inputSchema: { type: "object", properties: {} } }],
    });
    const res = await callTool(box);
    expect(text(res)).toBe(ROUNDS);
    const sent = posts(platform);
    expect(sent).toHaveLength(1);
    expect(sent[0].body.turnId).toBe(TURN);
  });

  it("f1 the 41st limit ends with the new-chat answer and sends nothing more", async () => {
    expect(MAX_TURN_ROLLS).toBe(40);
    const lines = stderrLines();
    // limit, ok, limit, ok ... MAX times, then a limit with no answer behind it.
    const answers = [];
    for (let i = 0; i < MAX_TURN_ROLLS; i++) answers.push(ROUNDS, "ok");
    answers.push(ROUNDS, "never");
    const platform = await scripted(answers);
    const box = connect({ origin: platform.origin });
    for (let i = 0; i < MAX_TURN_ROLLS; i++) expect(text(await callTool(box))).toBe("ok");
    expect(posts(platform)).toHaveLength(MAX_TURN_ROLLS * 2);
    const last = await callTool(box);
    expect(last.result.isError).toBe(true);
    expect(text(last)).toBe(JSON.stringify({ error: `this chat has used ${MAX_TURN_ROLLS * 2 + 1} tool rounds; start a new chat to go on` }));
    expect(posts(platform)).toHaveLength(MAX_TURN_ROLLS * 2 + 1);
    expect(lines.filter((l) => l.includes("started a new turn"))).toHaveLength(MAX_TURN_ROLLS);
    const turns = new Set(posts(platform).map((rec) => rec.body.turnId));
    expect(turns.size).toBe(MAX_TURN_ROLLS + 1);
    expect(lines.join("")).not.toMatch(/Bearer|DPoP|token/i);
  }, 60000);

  it("f1 a run of more than five rolls goes on", async () => {
    stderrLines();
    const platform = await scripted([ROUNDS, "ok", ROUNDS, "ok", ROUNDS, "ok", ROUNDS, "ok", ROUNDS, "ok", ROUNDS, "ok", ROUNDS, "ok", ROUNDS, "ok"]);
    const box = connect({ origin: platform.origin });
    for (let i = 0; i < 8; i++) expect(text(await callTool(box))).toBe("ok");
    expect(posts(platform)).toHaveLength(16);
  }, 30000);

  it("f1 a hop that is running keeps its turn; the next hop gets the new one", async () => {
    const dir = scratch();
    const logFile = join(dir, "claude.log");
    let limitNext = false;
    const hop = (id) => ({ id, system: "You are Jackfruit.", task: "Do it.", tools: [{ name: "list_records", description: "List", inputSchema: { type: "object", properties: {} } }], role: "Jackfruit", answer: { role: "Jackfruit", summary: "s" } });
    let hops = 0;
    const platform = await listen((rec) => {
      if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
      if (rec.body.name === "run_named_role") {
        if (limitNext) {
          limitNext = false;
          return { body: { result: HOPS } };
        }
        hops += 1;
        return { body: { hop: hop(hops === 1 ? HOP_A : "76543210fedcba9876543210") } };
      }
      if (rec.body.hop && rec.body.name === "list_records") return { body: { result: "rows" } };
      if (rec.body.name === "hop_done") return { body: { result: "closed" } };
      return { status: 404, body: { error: "unexpected" } };
    });
    const box = connect({ origin: platform.origin, env: meEnv({ FAKE_CLAUDE_LOG: logFile }) });
    expect((await callTool(box, "run_named_role", { role: "Jackfruit", task: "a" })).result.isError).toBe(false);
    limitNext = true;
    expect((await callTool(box, "run_named_role", { role: "Jackfruit", task: "b" })).result.isError).toBe(false);
    const runs = readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === "run");
    const turnOf = (run) => {
      const mcp = JSON.parse(run.argv[run.argv.indexOf("--mcp-config") + 1]);
      const a = mcp.mcpServers.GilbPlatform.args;
      return a[a.indexOf("--turn") + 1];
    };
    expect(runs).toHaveLength(2);
    expect(turnOf(runs[0])).toBe(TURN);
    expect(turnOf(runs[1])).not.toBe(TURN);
    // The first hop's own calls carried its own turn.
    const childCalls = posts(platform).filter((rec) => rec.body.name === "list_records");
    expect(childCalls.length).toBeGreaterThan(0);
    expect(childCalls[0].body.turnId).toBe(TURN);
  }, 20000);
});

describe("--hop-model", () => {
  const argsOf = async (extra) => {
    const logFile = join(scratch(), "claude.log");
    const platform = await listen((rec) => {
      if (rec.body.name === "run_named_role") {
        return { body: { hop: { id: HOP_A, system: "S", task: "T", tools: [], role: "Jackfruit", answer: { role: "Jackfruit", summary: "s" } } } };
      }
      return { body: { result: "closed" } };
    });
    const box = connect({ origin: platform.origin, env: meEnv({ FAKE_CLAUDE_LOG: logFile }), ...extra });
    await callTool(box, "run_named_role", { role: "Jackfruit", task: "a" });
    return JSON.parse(readFileSync(logFile, "utf8").trim().split("\n")[0]).argv;
  };

  it("f2 set: claude gets --model NAME at the end", async () => {
    const argv = await argsOf({ hopModel: "claude-haiku-4-5" });
    expect(argv.slice(-2)).toEqual(["--model", "claude-haiku-4-5"]);
    expect(argv.filter((a) => a === "--model")).toHaveLength(1);
  }, 15000);

  it("f2 unset: no --model, and the rest is exactly as before", async () => {
    const set = await argsOf({ hopModel: "m1" });
    const unset = await argsOf({});
    expect(unset).not.toContain("--model");
    expect(unset).toHaveLength(set.length - 2);
    expect(unset.slice(0, 11)).toEqual(["-p", "--output-format", "stream-json", "--verbose", "--tools", "", "--strict-mcp-config", "--mcp-config", unset[8], "--allowedTools", "mcp__GilbPlatform"]);
    expect(unset.slice(-4, -2)).toEqual(["--system-prompt-snapshot", "off"]);
    expect(unset[unset.length - 2]).toBe("--session-id");
  }, 15000);

  it("f2 the flag and the environment are read, and a bad value is refused at parse time", () => {
    expect(parseCli(["--hop-model", "claude-haiku-4-5"], {}).hopModel).toBe("claude-haiku-4-5");
    expect(parseCli(["--hop-model", "sonnet"], {}).hopModel).toBe("sonnet");
    expect(parseCli([], {}).hopModel).toBeUndefined();
    expect(parseCli([], { GILB_CONNECTOR_HOP_MODEL: "opus-4.5" }).hopModel).toBe("opus-4.5");
    for (const bad of ["a b", "-x", "--model", "a/b", "a;b", "x".repeat(65), "a$b", "é", "a\nb", ".x"]) {
      expect(() => parseCli(["--hop-model", bad], {}), bad).toThrow(CliError);
    }
    expect(() => parseCli(["--hop-model"], {})).toThrow(CliError);
    expect(() => parseCli([], { GILB_CONNECTOR_HOP_MODEL: "a b" })).toThrow(CliError);
    expect(parseCli(["--hop-model", "x".repeat(64)], {}).hopModel).toHaveLength(64);
  });

  it("f2 a bad model handed straight to startConnector is not passed on", async () => {
    const argv = await argsOf({ hopModel: "--dangerous" });
    expect(argv).not.toContain("--model");
    expect(argv).not.toContain("--dangerous");
  }, 15000);
});
