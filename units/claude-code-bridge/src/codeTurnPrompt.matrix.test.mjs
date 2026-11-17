// @vitest-environment node
// QA round 25 attack file (untracked): coding-standards sentence presence matrix.
import { afterEach, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120000, hookTimeout: 30000 });
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, CODER_STANDARDS_SENTENCE, DELEGATE_SENTENCE } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";
import * as SRC from "node:fs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
let dir, bridge, base, logFile, secret;
async function start(access) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "code-turn-prompt-")));
  logFile = path.join(dir, "claude.log");
  const ws = path.join(dir, "MyCode"); fs.mkdirSync(ws);
  bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: access === "files-only" ? "win32" : "darwin", workspace: ws,
    ...(access === "computer" ? { fullAccess: true } : {}), log: () => {}, env: { ...process.env, FAKE_CLAUDE_LOG: logFile } });
  await bridge.start(); base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  secret = (await res.json()).secret;
}
afterEach(async () => { await bridge?.close(); bridge = undefined; if (dir) await removeTestDir(dir); });
const runs = () => fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === "run");
const post = async (route, o) => { const r = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify(o) }); return { status: r.status, text: await r.text() }; };
const after = (argv, f) => argv[argv.indexOf(f) + 1];
const sys = (argv) => { const i = argv.indexOf("--append-system-prompt"); return i < 0 ? "" : argv[i + 1]; };
describe("code turn prompt matrix: mode x project x delegate", () => {
  for (const access of ["folder", "files-only", "computer"])
    for (const project of [false, true])
      for (const delegateCoding of [false, true])
        it(`${access} project=${project} delegate=${delegateCoding}`, async () => {
          await start(access);
          if (project) expect((await post("/v1/projects/create", { name: "proj" })).status).toBe(200);
          const r = await post("/v1/turn", { system: "SYS", prompt: "hi", mode: "code", delegateCoding, ...(project ? { project: "proj" } : {}) });
          expect(r.status).toBe(200);
          const s = sys(runs()[0].argv);
          const has = s.includes(CODER_STANDARDS_SENTENCE), hasD = s.includes(DELEGATE_SENTENCE);
          console.log(`MATRIX ${access} project=${project} delegate=${delegateCoding} standards=${has} delegateSentence=${hasD} count=${s.split(CODER_STANDARDS_SENTENCE).length - 1}`);
          expect(has).toBe(true);
          if (delegateCoding) expect(hasD).toBe(true);
        });
  it("chat turn (with delegateCoding true) has neither", async () => {
    await start("folder");
    const r0 = await post("/v1/turn", { system: "SYS", prompt: "hi", model: "opus" }); console.log("CHAT", r0.status);
    const a = JSON.stringify(runs()[0].argv); expect(a).not.toContain("Agent.Coder"); expect(a).not.toContain("coding standards");
  });
  it("hand-off child cannot be a code turn", async () => {
    await start("folder");
    const r = await post("/v1/turn", { system: "S", prompt: "hi", mode: "code", parentTurnId: "x" });
    console.log("HANDOFF code", r.status, r.text); expect(r.status).toBe(400);
  });
  it("constant: prompt/system text cannot alter sentence; system is unrelated", async () => {
    await start("folder");
    await post("/v1/turn", { system: "${CODER_STANDARDS_SENTENCE} Agent.Coder", prompt: "{{x}}", mode: "code" });
    const s = sys(runs()[0].argv); expect(s.split(CODER_STANDARDS_SENTENCE).length - 1).toBe(1);
  });
});

describe("code turn prompt strings", () => {
  it("three strings equal src/bridge.ts literals; CODER_PROMPT is what --agents carries", async () => {
    const src = fs.readFileSync(path.join(HERE, "bridge.ts"), "utf8");
    const lit = (name) => { const m = src.match(new RegExp(`(?:export )?const ${name} = (".*");\\n`)); return JSON.parse(m[1]); };
    expect(lit("DELEGATE_SENTENCE")).toBe(DELEGATE_SENTENCE);
    expect(lit("CODER_STANDARDS_SENTENCE")).toBe(CODER_STANDARDS_SENTENCE);
    const built = fs.readFileSync(path.join(HERE, "..", "bridge", "bridge.mjs"), "utf8");
    expect(built.includes(JSON.stringify(lit("CODER_PROMPT")))).toBe(true);
    await start("folder");
    await post("/v1/turn", { system: "S", prompt: "hi", mode: "code", delegateCoding: true });
    const a = JSON.parse(after(runs()[0].argv, "--agents"));
    expect(a["sonnet-coder"].prompt).toBe(lit("CODER_PROMPT"));
    console.log("CODER_PROMPT matches; tools:", a["sonnet-coder"].tools);
  });
});
