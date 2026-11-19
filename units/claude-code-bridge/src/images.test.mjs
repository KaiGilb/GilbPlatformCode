// @vitest-environment node
// Bridge 0.3.6: pictures in a turn. Hermetic: a stand-in `claude` (fake-claude.mjs) records its argv and its raw stdin.
// The real CLI's behaviour with `--input-format stream-json` was proven by hand against Claude Code 2.1.325 (see the PR).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60000, hookTimeout: 30000 });
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const MiB = 1024 * 1024;

let dir, bridge, base, logFile, secret;
let lines = [];

async function start({ access = "folder" } = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-img-")));
  logFile = path.join(dir, "claude.log");
  const ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  lines = [];
  bridge = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: access === "files-only" ? "win32" : "darwin", workspace: ws,
    ...(access === "computer" ? { fullAccess: true } : {}),
    log: (l) => lines.push(String(l)),
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile },
  });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  secret = (await res.json()).secret;
}
afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
  if (dir) await removeTestDir(dir);
});

const runs = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === "run") : []);

async function turn(extra, hdr = {}) {
  const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret, ...hdr }, body: JSON.stringify({ system: "You are the agent.", prompt: "what is in the picture?", ...extra }) });
  if (res.status !== 200) return { status: res.status, json: await res.json().catch(() => null) };
  const events = [];
  for (const blk of (await res.text()).split("\n\n")) {
    const e = /event: (.*)/.exec(blk)?.[1];
    const d = /data: (.*)/.exec(blk)?.[1];
    if (e) events.push([e, JSON.parse(d)]);
  }
  return { status: 200, events, message: events.find((e) => e[0] === "message")?.[1] };
}

// Real magic bytes, padded with zeros to a size. (The bridge checks the first bytes, not that it decodes.)
const MAGIC = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
  "image/gif": [...Buffer.from("GIF89a")],
  "image/webp": [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")],
};
const img = (type = "image/png", size = 64) => {
  const b = Buffer.alloc(size);
  Buffer.from(MAGIC[type]).copy(b);
  return { mediaType: type, data: b.toString("base64") };
};

describe("pictures in a turn", () => {
  it("a chat turn with pictures: --input-format stream-json, and stdin is ONE json line, pictures first then the text", async () => {
    await start();
    const a = img("image/png", 40), b = img("image/jpeg", 50);
    const r = await turn({ images: [a, b], prompt: "compare these" });
    expect(r.status).toBe(200);
    expect(r.message.images).toBe(2);
    const [run] = runs();
    const i = run.argv.indexOf("--input-format");
    expect(i).toBeGreaterThan(-1);
    expect(run.argv[i + 1]).toBe("stream-json");
    expect(run.argv.join(" ")).not.toContain(a.data);
    expect(run.prompt.endsWith("\n")).toBe(true);
    expect(run.prompt.trimEnd().split("\n")).toHaveLength(1);
    expect(JSON.parse(run.prompt)).toEqual({
      type: "user",
      message: { role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: a.data } },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.data } },
        { type: "text", text: "compare these" },
      ] },
    });
  });

  it("a turn without pictures is unchanged: no --input-format, stdin is the plain prompt, no images field in the message", async () => {
    await start();
    const r = await turn({ prompt: "plain words" });
    expect(r.status).toBe(200);
    expect(r.message).not.toHaveProperty("images");
    const [run] = runs();
    expect(run.argv).not.toContain("--input-format");
    expect(run.prompt).toBe("plain words");
  });

  it("an empty prompt with a picture gets the default text; an empty prompt without one is still 400", async () => {
    await start();
    const r = await turn({ prompt: "  ", images: [img("image/gif")] });
    expect(r.status).toBe(200);
    expect(JSON.parse(runs()[0].prompt).message.content.at(-1)).toEqual({ type: "text", text: "Please look at the attached picture." });
    const bad = await turn({ prompt: "  " });
    expect(bad.status).toBe(400);
    expect(runs()).toHaveLength(1);
  });

  it.each([
    ["folder", "code"], ["files-only", "code"], ["computer", "code"],
  ])("code turn in %s mode carries the same flag and stdin", async (access, mode) => {
    await start({ access });
    const r = await turn({ mode, images: [img("image/webp")], prompt: "look" });
    expect(r.status).toBe(200);
    const [run] = runs();
    expect(run.argv[run.argv.indexOf("--input-format") + 1]).toBe("stream-json");
    expect(JSON.parse(run.prompt).message.content[0].source.media_type).toBe("image/webp");
  });

  it("all four types pass", async () => {
    await start();
    const r = await turn({ images: Object.keys(MAGIC).map((t) => img(t)) });
    expect(r.status).toBe(200);
    expect(r.message.images).toBe(4);
  });

  it("every validation failure is a 400 with a sentence, and no child is spawned", async () => {
    await start();
    const good = img("image/png");
    const png = Buffer.from(good.data, "base64");
    const cases = {
      "5 pictures": [good, good, good, good, good],
      "not a list": "nope",
      "unknown type": [{ mediaType: "image/svg+xml", data: good.data }],
      "missing data": [{ mediaType: "image/png" }],
      "data: prefix": [{ mediaType: "image/png", data: `data:image/png;base64,${good.data}` }],
      "not base64": [{ mediaType: "image/png", data: "@@@@" }],
      "bad padding": [{ mediaType: "image/png", data: good.data.slice(0, -1) }],
      "empty data": [{ mediaType: "image/png", data: "" }],
      "bytes of a jpeg stated as png": [img("image/jpeg")].map((x) => ({ ...x, mediaType: "image/png" })),
      "text stated as png": [{ mediaType: "image/png", data: Buffer.from("this is not a picture at all").toString("base64") }],
      "riff but not webp": [{ mediaType: "image/webp", data: Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")]).toString("base64") }],
      "png header cut short": [{ mediaType: "image/png", data: png.subarray(0, 5).toString("base64") }],
      "an item that is not an object": [null],
    };
    for (const [name, images] of Object.entries(cases)) {
      const r = await turn({ images });
      expect(r.status, name).toBe(400);
      expect(typeof r.json.error, name).toBe("string");
      expect(r.json.error.length, name).toBeGreaterThan(10);
    }
    expect(runs()).toHaveLength(0);
  });

  it("size limits: 5 MiB passes, 5 MiB + 1 is 400, 3 x 3.5 MiB (10.5 MiB together) is 400, 2 x 5 MiB (exactly 10 MiB) passes", async () => {
    await start();
    expect((await turn({ images: [img("image/png", 5 * MiB)] })).status).toBe(200);
    const big = await turn({ images: [img("image/png", 5 * MiB + 1)] });
    expect(big.status).toBe(400);
    expect(big.json.error).toMatch(/larger than 5 MiB/);
    const sum = await turn({ images: [img("image/png", 3.5 * MiB), img("image/png", 3.5 * MiB), img("image/png", 3.5 * MiB)] });
    expect(sum.status).toBe(400);
    expect(sum.json.error).toMatch(/together/);
    expect(runs()).toHaveLength(1);
    expect((await turn({ images: [img("image/png", 5 * MiB), img("image/png", 5 * MiB)] })).status).toBe(200);
    expect(runs()).toHaveLength(2);
    // 11 MiB together: 5 + 5 + 1
    const eleven = await turn({ images: [img("image/png", 5 * MiB), img("image/png", 5 * MiB), img("image/png", 1 * MiB)] });
    expect(eleven.status).toBe(400);
    expect(runs()).toHaveLength(2);
  });

  it("a hand-off with pictures is 400 and spawns nothing", async () => {
    await start();
    const r = await turn({ images: [img()], parentTurnId: "abc" });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/hand-off/i);
    expect(runs()).toHaveLength(0);
  });

  it("body limits: a 12 MiB /v1/turn body is accepted; a 17 MiB one is refused (413); a 3 MiB body on another route is refused", async () => {
    await start();
    const ok = await turn({ prompt: "x".repeat(12 * MiB) });
    expect(ok.status).toBe(200);
    expect(runs()[0].prompt.length).toBe(12 * MiB);
    let status;
    try {
      status = (await turn({ prompt: "x".repeat(17 * MiB) })).status;
    } catch { status = "reset"; }
    expect(["reset", 413]).toContain(status);
    let other;
    try {
      const res = await fetch(`${base}/v1/turn/cancel`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ turnId: "x".repeat(3 * MiB) }) });
      other = res.status;
    } catch { other = "reset"; }
    expect(["reset", 413]).toContain(other);
    // and a small body on that route still works
    const small = await fetch(`${base}/v1/turn/cancel`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ turnId: "nope" }) });
    expect(small.status).toBe(200);
  });

  it("no picture data reaches the bridge's log", async () => {
    await start();
    const a = img("image/png", 600);
    await turn({ images: [a, img("image/jpeg", 700)] });
    await turn({ images: [{ mediaType: "image/png", data: "@@@@" }] });
    expect(runs()).toHaveLength(1);
    const all = lines.join("\n");
    expect(all).not.toContain(a.data);
    expect(all).not.toContain(a.data.slice(0, 40));
  });

  it("/v1/turns lists the picture count of a running turn, and /v1/hello gives the picture options", async () => {
    await start();
    const hello = await (await fetch(`${base}/v1/hello`)).json();
    expect(hello.build).toBe("0.3.18");
    expect(hello.options.images).toEqual({ maxCount: 4, maxBytes: 5 * MiB, types: ["image/png", "image/jpeg", "image/gif", "image/webp"] });
    const ctl = new AbortController();
    const res = await fetch(`${base}/v1/turn`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ system: "s", prompt: "WAITFOREVER", images: [img(), img()] }) });
    expect(res.status).toBe(200);
    const rd = res.body.getReader();
    await rd.read();
    const list = await (await fetch(`${base}/v1/turns`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: "{}" })).json();
    ctl.abort();
    expect(list.turns.length).toBeGreaterThan(0);
    expect(list.turns[0].images).toBe(2);
  });
});
