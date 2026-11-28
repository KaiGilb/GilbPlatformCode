// @vitest-environment node
// Bridge 0.4.0: the `time_left` event. An agent writes `[Time until I need you: <value>]`; the bridge tells the page the VALUE as soon as
// the agent has written it (the page otherwise sees the text only when the turn ends).
// Hermetic: a stand-in `claude` (fake-claude.mjs, MOCK: no real claude CLI stream was recorded for these tests). The prompt word FAKESTREAM:<json array>
// makes the stand-in emit those stream events after its init, and FAKERESULT:<json string> sets the result text. Everything else is the real bridge.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60000, hookTimeout: 30000 });
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, latestTimeLeft, TIME_LEFT_MAX_EVENTS, TIME_LEFT_SCAN_MAX } from "../bridge/bridge.mjs";
import { TIME_VALUES } from "../../time-line/src/index.ts";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const FIXTURES = JSON.parse(fs.readFileSync(path.join(HERE, "..", "..", "time-line", "fixtures", "time-lines.json"), "utf8"));
const APP = "http://localhost:5197";
const TOOLS = [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }];
const LINE = (v) => `[Time until I need you: ${v}]`;

let dir;
let bridge;
let base;
let logLines = [];
let open = [];

async function start() {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-timeleft-")));
  logLines = [];
  const ws = path.join(dir, "MyCode");
  fs.mkdirSync(path.join(ws, "alpha"), { recursive: true });
  bridge = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", workspace: ws,
    env: { ...process.env, FAKE_CLAUDE_LOG: path.join(dir, "claude.log") },
    log: (l) => logLines.push(l),
  });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  return (await res.json()).secret;
}
afterEach(async () => {
  for (const t of open) t.close();
  open = [];
  await bridge?.close();
  bridge = undefined;
  if (dir) await removeTestDir(dir);
});

const until = async (fn, ms = 20000) => {
  for (let i = 0; i < ms / 25; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out waiting");
};

/** Plays the page for one turn: collects every event. Resolves (t.done) when the stream ends. */
async function openTurn(secret, body) {
  const ctl = new AbortController();
  const res = await fetch(`${base}/v1/turn`, {
    method: "POST", signal: ctl.signal,
    headers: { "content-type": "application/json", "x-bridge-secret": secret },
    body: JSON.stringify({ system: "You are the agent.", tools: TOOLS, prompt: "hello", ...body }),
  });
  const t = { status: res.status, events: [], turnId: "", close: () => ctl.abort() };
  open.push(t);
  if (res.status !== 200) {
    t.json = await res.json().catch(() => null);
    t.done = Promise.resolve();
    return t;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  t.done = (async () => {
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const blk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /event: (.*)/.exec(blk)?.[1];
          const data = /data: (.*)/.exec(blk)?.[1];
          if (!ev) continue;
          const parsed = JSON.parse(data);
          t.events.push([ev, parsed]);
          if (ev === "start") t.turnId = parsed.turnId;
        }
      }
    } catch {
      /* hung up */
    }
  })();
  return t;
}

const assistantText = (text) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
/** A turn whose agent emits `events` and answers `result`. Waits for the stream to end. */
async function run(secret, events, { result, mode = "chat", extra = {} } = {}) {
  const prompt = ["task", `FAKESTREAM:${JSON.stringify(events)}`, ...(result === undefined ? [] : [`FAKERESULT:${JSON.stringify(result)}`]), "go"].join("\n");
  const t = await openTurn(secret, { prompt, ...(mode === "code" ? { mode: "code", project: "alpha" } : {}), ...extra });
  expect(t.status).toBe(200);
  await t.done;
  return t;
}
const timeLeft = (t) => t.events.filter((e) => e[0] === "time_left").map((e) => e[1]);
const names = (t) => t.events.map((e) => e[0]);

describe("time_left: what is sent", () => {
  it("a chat turn: one event with the value, before the turn's final message", async () => {
    const secret = await start();
    const t = await run(secret, [assistantText(`Working.\n${LINE("30 min")}\nMore.`)]);
    expect(timeLeft(t)).toEqual([{ value: "30 min" }]);
    expect(names(t).indexOf("time_left")).toBeGreaterThan(-1);
    expect(names(t).indexOf("time_left")).toBeLessThan(names(t).indexOf("message"));
    expect(names(t)).toContain("message");
  });

  it("a code turn: the same", async () => {
    const secret = await start();
    const t = await run(secret, [assistantText(`${LINE("30 min")}\nBuilding.`)], { mode: "code" });
    expect(t.events[0][1]).toMatchObject({ mode: "code" });
    expect(timeLeft(t)).toEqual([{ value: "30 min" }]);
    expect(names(t).indexOf("time_left")).toBeLessThan(names(t).indexOf("message"));
  });

  it("two messages with different values give two events in order; the same value twice gives one", async () => {
    const secret = await start();
    const two = await run(secret, [assistantText(LINE("10 min")), assistantText(LINE("1 hour"))]);
    expect(timeLeft(two)).toEqual([{ value: "10 min" }, { value: "1 hour" }]);
    const same = await run(secret, [assistantText(LINE("10 min")), assistantText(`again\n${LINE("10 min")}`), assistantText("no line here")]);
    expect(timeLeft(same)).toEqual([{ value: "10 min" }]);
  });

  it("the value comes back after another value (A, B, A is three events), so only the last sent counts", async () => {
    const secret = await start();
    const t = await run(secret, [assistantText(LINE("5 min")), assistantText(LINE("3 hours")), assistantText(LINE("5 min"))]);
    expect(timeLeft(t)).toEqual([{ value: "5 min" }, { value: "3 hours" }, { value: "5 min" }]);
  });

  it("a message with two lines gives the LAST value, also across two text blocks", async () => {
    const secret = await start();
    const one = await run(secret, [assistantText(`${LINE("1 min")}\ntext\n${LINE("3 hours")}`)]);
    expect(timeLeft(one)).toEqual([{ value: "3 hours" }]);
    const blocks = await run(secret, [{ type: "assistant", message: { content: [{ type: "text", text: LINE("1 min") }, { type: "tool_use", id: "t1", name: "Read", input: {} }, { type: "text", text: LINE("1 hour") }] } }]);
    expect(timeLeft(blocks)).toEqual([{ value: "1 hour" }]);
  });

  it("a loosely written value is sent as the snapped value", async () => {
    const secret = await start();
    const loose = FIXTURES.cases.find((c) => c.name === "about 45 minutes");
    expect(loose.text).not.toBe(LINE(loose.values[0])); // it really is a loose one
    const t = await run(secret, [assistantText(loose.text)]);
    expect(timeLeft(t)).toEqual([{ value: loose.values[0] }]);
    expect(loose.values).toEqual(["1 hour"]);
  });

  it("the payload has exactly the key value, and it is one of the seven values", async () => {
    const secret = await start();
    const t = await run(secret, [assistantText(`Reply text that must not travel.\n${LINE("5 hours +")}`)]);
    const [payload] = timeLeft(t);
    expect(Object.keys(payload)).toEqual(["value"]);
    expect(TIME_VALUES).toContain(payload.value);
    expect(JSON.stringify(t.events.filter((e) => e[0] === "time_left"))).not.toContain("Reply text");
  });

  it("the turn's final result text still holds the line (the bridge removes nothing)", async () => {
    const secret = await start();
    const text = `Done.\n${LINE("30 min")}`;
    const t = await run(secret, [assistantText(text)], { result: text });
    const message = t.events.find((e) => e[0] === "message")[1];
    expect(JSON.stringify(message)).toContain("Time until I need you: 30 min");
    expect(timeLeft(t)).toEqual([{ value: "30 min" }]);
  });
});

describe("time_left: what is not read", () => {
  it("a nested hand-off turn that writes the line sends nothing, on either stream", async () => {
    const secret = await start();
    const parent = await openTurn(secret, { prompt: "WAITFOREVER" });
    await until(() => parent.turnId);
    const hop = await openTurn(secret, {
      parentTurnId: parent.turnId, system: "You are Agent.Outcome.", tools: [],
      prompt: `task\nFAKESTREAM:${JSON.stringify([assistantText(LINE("10 min"))])}\ngo`,
    });
    expect(hop.status).toBe(200);
    await hop.done;
    expect(names(hop)).toContain("message"); // the hand-off really ran and answered
    expect(timeLeft(hop)).toEqual([]);
    expect(timeLeft(parent)).toEqual([]);
    // The top turn is still read: the same bridge, the same parent, a top turn of its own.
    const top = await run(secret, [assistantText(LINE("10 min"))]);
    expect(timeLeft(top)).toEqual([{ value: "10 min" }]);
  });

  it("an assistant event a sub-agent wrote (parent_tool_use_id set) sends nothing; the same message without it sends one", async () => {
    const secret = await start();
    const msg = assistantText(LINE("10 min"));
    const sub = await run(secret, [{ ...msg, parent_tool_use_id: "toolu_sub1" }]);
    expect(timeLeft(sub)).toEqual([]);
    const top = await run(secret, [msg]);
    expect(timeLeft(top)).toEqual([{ value: "10 min" }]);
    expect(latestTimeLeft({ ...msg, parent_tool_use_id: "toolu_sub1" })).toBeNull();
    expect(latestTimeLeft({ ...msg, parent_tool_use_id: null })).toBe("10 min");
  });

  it("the line inside a tool_use input, a user event's tool result, or only the final result text sends nothing", async () => {
    const secret = await start();
    const events = [
      { type: "assistant", message: { content: [{ type: "tool_use", id: "tu1", name: "Read", input: { note: LINE("1 min"), text: LINE("1 min") } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tu1", content: LINE("5 min") }, { type: "text", text: LINE("5 min") }] } },
      { type: "stream_event", event: { delta: { type: "text_delta", text: LINE("10 min") } } },
    ];
    const t = await run(secret, events, { result: LINE("30 min") });
    expect(timeLeft(t)).toEqual([]);
    expect(names(t)).toContain("message");
    const c = await run(secret, events, { result: LINE("30 min"), mode: "code" });
    expect(timeLeft(c)).toEqual([]);
  });

  it("a stream that did not prove the subscription sends nothing (fail closed)", async () => {
    const secret = await start();
    const noInit = await openTurn(secret, { prompt: `INITOMIT\nFAKESTREAM:${JSON.stringify([assistantText(LINE("5 min"))])}\ngo` });
    await noInit.done;
    expect(timeLeft(noInit)).toEqual([]);
    const key = await openTurn(secret, { prompt: `APIKEYSOURCE\nFAKESTREAM:${JSON.stringify([assistantText(LINE("5 min"))])}\ngo` });
    await key.done;
    expect(timeLeft(key)).toEqual([]);
  });

  it("content that is not an array, a null block, a text that is a number: no throw, no event, and the turn answers", async () => {
    const secret = await start();
    const events = [
      { type: "assistant", message: { content: "a string" } },
      { type: "assistant", message: { content: { type: "text", text: LINE("5 min") } } },
      { type: "assistant", message: { content: null } },
      { type: "assistant", message: null },
      { type: "assistant" },
      { type: "assistant", message: { content: [null, 7, "x", [], { type: "text", text: 5 }, { type: "text" }, { type: "text", text: { a: LINE("5 min") } }] } },
    ];
    const t = await run(secret, events);
    expect(timeLeft(t)).toEqual([]);
    expect(names(t)).toContain("message");
    expect(names(t)).not.toContain("error");
    expect(timeLeft(await run(secret, [assistantText(LINE("5 min"))]))).toEqual([{ value: "5 min" }]); // the bridge is still fine
  });
});

describe("time_left: the caps", () => {
  it("one message with 10,000 lines gives one event", async () => {
    const secret = await start();
    const t = await run(secret, [assistantText(Array.from({ length: 10_000 }, () => LINE("10 min")).join("\n"))]);
    expect(timeLeft(t)).toEqual([{ value: "10 min" }]);
  });

  it("35 messages with alternating values give exactly 30 events and one log line", async () => {
    const secret = await start();
    const events = Array.from({ length: 35 }, (_, i) => assistantText(LINE(i % 2 === 0 ? "5 min" : "10 min")));
    const t = await run(secret, events);
    expect(timeLeft(t)).toHaveLength(TIME_LEFT_MAX_EVENTS);
    expect(TIME_LEFT_MAX_EVENTS).toBe(30);
    expect(timeLeft(t)[0]).toEqual({ value: "5 min" });
    expect(logLines.filter((l) => l.includes("time_left"))).toHaveLength(1);
    expect(names(t)).toContain("message");
  });

  it("exactly 30 different values give 30 events and no log line", async () => {
    const secret = await start();
    const events = Array.from({ length: 30 }, (_, i) => assistantText(LINE(i % 2 === 0 ? "5 min" : "10 min")));
    const t = await run(secret, events);
    expect(timeLeft(t)).toHaveLength(30);
    expect(logLines.filter((l) => l.includes("time_left"))).toHaveLength(0);
  });

  it("the count is per turn: the next turn sends again", async () => {
    const secret = await start();
    const events = Array.from({ length: 35 }, (_, i) => assistantText(LINE(i % 2 === 0 ? "5 min" : "10 min")));
    await run(secret, events);
    const next = await run(secret, [assistantText(LINE("5 min"))]);
    expect(timeLeft(next)).toEqual([{ value: "5 min" }]);
  });
});

describe("latestTimeLeft (the reader, called directly)", () => {
  const ev = (text) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });

  it("only the first 262,144 characters of a block are read, and the edge is exact", () => {
    expect(TIME_LEFT_SCAN_MAX).toBe(262_144);
    const L = LINE("5 min");
    const pad = TIME_LEFT_SCAN_MAX - L.length - 1;
    expect(latestTimeLeft(ev("x".repeat(pad) + "\n" + L))).toBe("5 min"); // ends exactly at the cut
    expect(latestTimeLeft(ev("x".repeat(pad + 1) + "\n" + L))).toBeNull(); // one character later, the "]" is cut off
    expect(latestTimeLeft(ev(L + "\n" + "x".repeat(5_000_000)))).toBe("5 min"); // before the cut, with a huge tail
  });

  it("a text block of 5,000,000 characters with a valid line at the very end: no value, and fast", () => {
    const text = "x".repeat(5_000_000 - 40) + "\n" + LINE("5 min");
    const t0 = Date.now();
    expect(latestTimeLeft(ev(text))).toBeNull();
    expect(Date.now() - t0).toBeLessThan(3000);
    // A hostile text of many short lines is bounded in the same way.
    const t1 = Date.now();
    latestTimeLeft(ev("> ".repeat(300_000) + "\n" + "[Time until I need you: ".repeat(20_000)));
    expect(Date.now() - t1).toBeLessThan(3000);
  });

  it("each block is cut on its own", () => {
    const e = { type: "assistant", message: { content: [{ type: "text", text: "y".repeat(TIME_LEFT_SCAN_MAX) + "\n" + LINE("1 min") }, { type: "text", text: LINE("10 min") }] } };
    expect(latestTimeLeft(e)).toBe("10 min");
  });

  it("only an assistant event, and never throws on a strange shape", () => {
    expect(latestTimeLeft({ type: "user", message: { content: [{ type: "text", text: LINE("5 min") }] } })).toBeNull();
    expect(latestTimeLeft({ type: "result", result: LINE("5 min") })).toBeNull();
    for (const bad of [{}, { type: "assistant" }, { type: "assistant", message: { content: [undefined, null, { type: "text", text: 1 }] } }]) expect(latestTimeLeft(bad)).toBeNull();
  });
});

describe("time_left: every case of the unit's fixtures, as one assistant message", () => {
  it("sends the LAST of the case's values, or nothing when it has none", async () => {
    const secret = await start();
    expect(FIXTURES.cases.length).toBeGreaterThanOrEqual(40);
    let withValue = 0;
    for (const c of FIXTURES.cases) {
      const t = await run(secret, [assistantText(c.text)]);
      const got = timeLeft(t);
      if (c.values.length === 0) expect(got, c.name).toEqual([]);
      else {
        withValue += 1;
        expect(got, c.name).toEqual([{ value: c.values[c.values.length - 1] }]);
      }
    }
    expect(withValue).toBeGreaterThan(30);
  }, 300000);
});
