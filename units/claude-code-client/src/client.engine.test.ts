/**
 * Client 0.4.0 engines. The real-bridge cases run the built bridge 0.4.0 with its Codex stand-in.
 * Spec: Chat.CodexConnect.PagePart.Units — the page client speaks engine "codex" and keeps Claude unchanged.
 */
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createBridge } from "@kaigilb/gilbplatformcode-claude-code-bridge/bridge.mjs";
import { createClaudeCodeClient, type BridgeEngine, type ClaudeCodeClient } from "./client";

const FAKE = createRequire(import.meta.url).resolve("@kaigilb/gilbplatformcode-claude-code-bridge/fake-claude.mjs");
const FAKE_CODEX = createRequire(import.meta.url).resolve("@kaigilb/gilbplatformcode-claude-code-bridge/fake-codex.mjs");
const PLATFORM = "https://platform.example";
const PRINCIPAL = "https://p.example/base";
const PREFIX = `gilb.claude-code-session.${PRINCIPAL}.`;

const realFetch = globalThis.fetch;

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    clear: () => m.clear(),
    get length() {
      return m.size;
    },
  } as Storage;
}

function claudeEntry(over: Record<string, unknown> = {}) {
  return {
    id: "claude", name: "Claude Code", ready: true, billing: "claude-subscription",
    models: [{ id: "opus", label: "opus" }], efforts: ["low", "medium", "high", "xhigh", "max"],
    codeTurns: true, images: true, delegateCoding: true, ...over,
  };
}
function codexEntry(over: Record<string, unknown> = {}) {
  return {
    id: "codex", name: "Codex", installed: true, version: "0.167.2", supported: true, account: "chatgpt",
    ready: true, billing: "chatgpt-subscription",
    models: [{ id: "gpt-fake-a", label: "Fake A", default: true, efforts: ["low", "high"] }],
    efforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
    codeTurns: false, images: false, delegateCoding: false, ...over,
  };
}

describe("sendTurn engines", () => {
  describe("against the built bridge 0.4.0", () => {
    let dir: string;
    let logPath: string;
    let bridge: { start(): Promise<number>; close(): Promise<void>; port: number; pairingCode: string };
    let store: Storage;
    let turnBodies: Record<string, unknown>[];
    let onTool: (body: Record<string, unknown>) => unknown;
    let contextTools: { name: string; description: string; inputSchema: { type: string; properties: Record<string, unknown> } }[];

    beforeEach(async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "client-engine-"));
      logPath = path.join(dir, "codex.log");
      turnBodies = [];
      onTool = () => ({ result: JSON.stringify({ vaults: ["v1"] }) });
      // The stand-in calls the first listed tool. A plain tool is the default; a hand-off test swaps in a hand-off name.
      contextTools = [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }];
      bridge = createBridge({
        port: 0,
        claudeBin: FAKE,
        codexBin: FAKE_CODEX,
        allowedOrigins: ["https://app.example"],
        workDir: path.join(dir, "work"),
        env: { ...process.env, FAKE_CODEX_LOG: logPath },
        // The bridge's keep list drops FAKE_CODEX_LOG, so the test names it as an extra kept name (the test-only seam).
        platformOpts: { codexKeepEnv: ["FAKE_CODEX_LOG"] },
      });
      await bridge.start();
      store = memoryStorage();
      vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.startsWith(PLATFORM)) {
          const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
          const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
          if (u.endsWith("/context")) return json({ system: "You are the agent.", tools: contextTools });
          if (u.endsWith("/tool")) return json(onTool(body));
          return json({});
        }
        if (u.includes("/v1/turn") && init?.body) turnBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return realFetch(url, init);
      });
    });
    afterEach(async () => {
      vi.unstubAllGlobals();
      await bridge.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    function client(): ClaudeCodeClient {
      return createClaudeCodeClient({
        principal: PRINCIPAL,
        platformOrigin: PLATFORM,
        bridgeUrl: `http://127.0.0.1:${bridge.port}`,
        getAuthHeaders: async () => ({ authorization: "DPoP proof" }),
        storage: store,
      });
    }
    async function paired() {
      const c = client();
      await c.pair(bridge.pairingCode);
      return c;
    }
    function rpcCount(method: string): number {
      if (!fs.existsSync(logPath)) return 0;
      return fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as { method?: string }).filter((row) => row.method === method).length;
    }

    test("a claude turn sends no engine key and the reply is unchanged", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — a claude turn's body and reply stay as they are.
      const c = await paired();
      const statuses: Record<string, unknown>[] = [];
      const reply = await c.sendTurn([{ role: "user", content: "hello claude" }], {
        thread: "main",
        onBridgeStatus: (s) => statuses.push(s),
      });
      expect(turnBodies[0]).not.toHaveProperty("engine");
      expect(reply).toMatchObject({ role: "assistant", payer: "person-claude-code", model: "fake-model" });
      expect(reply.content).toContain("hello claude");
      expect(reply).not.toHaveProperty("engine");
      expect(statuses[0]).toEqual({ nested: false, apiKeySource: "none", model: "fake-model" });
      expect(Object.keys(statuses[0]!).sort()).toEqual(["apiKeySource", "model", "nested"]);
    }, 30000);

    test("a codex turn returns person-codex, keeps its session apart, and the next turn sends that id", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — codex reply, usage, session key, and resume.
      const c = await paired();
      const claudeKey = `${PREFIX}main`;
      const codexKey = `${PREFIX}engine-codex/${encodeURIComponent("main")}`;
      store.setItem(claudeKey, JSON.stringify({ sessionId: "claude-stays", covers: 99 }));
      const statuses: Record<string, unknown>[] = [];
      const reply = await c.sendTurn([{ role: "user", content: "hello codex" }], {
        thread: "main",
        engine: "codex",
        model: "gpt-fake-a",
        effort: "ultra",
        onBridgeStatus: (s) => statuses.push(s),
      });
      expect(turnBodies[0]).toMatchObject({ engine: "codex", model: "gpt-fake-a", effort: "ultra" });
      expect(reply).toMatchObject({
        payer: "person-codex",
        engine: "codex",
        model: "gpt-fake-a",
        effort: "ultra",
        usage: { model: "gpt-fake-a", contextWindow: 475000, inputTokens: 2500, outputTokens: 12, cacheReadInputTokens: 13696, cacheCreationInputTokens: 0 },
      });
      expect(reply.content).toContain("hello codex");
      expect(statuses[0]).toEqual({ nested: false, apiKeySource: null, model: "gpt-fake-a", engine: "codex", account: "chatgpt" });
      expect(store.getItem(claudeKey)).toBe(JSON.stringify({ sessionId: "claude-stays", covers: 99 }));
      const kept = JSON.parse(store.getItem(codexKey) ?? "null") as { sessionId?: string };
      expect(kept.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      turnBodies.length = 0;
      await c.sendTurn(
        [{ role: "user", content: "hello codex" }, { role: "assistant", content: reply.content }, { role: "user", content: "again" }],
        { thread: "main", engine: "codex" },
      );
      expect(turnBodies[0]).toMatchObject({ engine: "codex", sessionId: kept.sessionId });
      expect(store.getItem(claudeKey)).toBe(JSON.stringify({ sessionId: "claude-stays", covers: 99 }));
    }, 30000);

    test("a relayed tool call works on a codex turn", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — Codex relays a tool call through the same platform route.
      const c = await paired();
      const reply = await c.sendTurn([{ role: "user", content: "CALLTOOL which vaults?" }], { thread: "tools", engine: "codex" });
      expect(reply).toMatchObject({ payer: "person-codex", engine: "codex" });
      expect(reply.content).toContain("v1");
      expect(rpcCount("turn/start")).toBe(1);
    }, 30000);

    test("a hand-off under a codex turn runs on codex and does not name an engine", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — a hand-off runs on its parent's engine.
      // The bridge accepts parentCallId only when the waiting call is a hand-off tool. The stand-in calls the first tool.
      contextTools = [{ name: "run_named_role", description: "d", inputSchema: { type: "object", properties: {} } }];
      onTool = () => ({
        hop: { id: "h1", via: "run_named_role", role: "Helper", task: "nested plain answer", system: "You are the helper.", tools: [], answer: { role: "Helper" } },
      });
      const c = await paired();
      const reply = await c.sendTurn([{ role: "user", content: "CALLTOOL please hop" }], { thread: "hop", engine: "codex" });
      expect(turnBodies[0]).toMatchObject({ engine: "codex" });
      expect(turnBodies[1]).not.toHaveProperty("engine");
      expect(turnBodies[1]).toHaveProperty("parentTurnId");
      expect(reply.content).toContain("nested plain answer");
      expect(reply).toMatchObject({ payer: "person-codex", engine: "codex" });
      expect(rpcCount("turn/start")).toBe(2);
    }, 30000);

    test("bridgeInfo engines for a paired client lists both, and an unpaired client has none", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — engines only for a paired caller, with the stand-in's models.
      const unpaired = client();
      expect(await unpaired.bridgeInfo()).not.toHaveProperty("engines");
      const c = await paired();
      let info = await c.bridgeInfo();
      for (let i = 0; i < 50 && !info.engines?.find((e) => e.id === "codex" && e.ready && !e.checking); i++) {
        await new Promise((r) => setTimeout(r, 100));
        info = await c.bridgeInfo();
      }
      const claude = info.engines?.find((e) => e.id === "claude");
      const codex = info.engines?.find((e) => e.id === "codex");
      expect(claude).toMatchObject({ id: "claude", name: "Claude Code", ready: true, billing: "claude-subscription", codeTurns: true, images: true, delegateCoding: true });
      expect(claude?.models).toEqual([
        { id: "opus", label: "opus" }, { id: "sonnet", label: "sonnet" }, { id: "haiku", label: "haiku" }, { id: "fable", label: "fable" },
      ]);
      expect(codex).toMatchObject({ id: "codex", ready: true, account: "chatgpt", installed: true, version: "0.167.2" });
      expect(codex?.models).toEqual([
        { id: "gpt-fake-a", label: "Fake A", default: true, efforts: ["low", "high"] },
        { id: "gpt-fake-b", label: "Fake B", default: false, efforts: ["medium"] },
      ]);
    }, 30000);
  });

  describe("refusals before a request", () => {
    let calls: string[];
    let client: ClaudeCodeClient;

    beforeEach(() => {
      calls = [];
      vi.stubGlobal("fetch", async (url: string) => {
        calls.push(String(url));
        return new Response("no", { status: 500 });
      });
      const store = memoryStorage();
      client = createClaudeCodeClient({
        principal: PRINCIPAL,
        platformOrigin: PLATFORM,
        bridgeUrl: "http://127.0.0.1:9",
        getAuthHeaders: async () => ({}),
        storage: store,
      });
      client.save("s3cret");
    });
    afterEach(() => vi.unstubAllGlobals());

    test("each client-side refusal gives its sentence and sends nothing", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — Codex refusals happen before any request.
      const bad: [Record<string, unknown>, string][] = [
        [{ engine: "gpt" }, "That engine is not known."],
        [{ engine: "codex", model: "claude-opus-4" }, "That model is not allowed."],
        [{ engine: "codex", model: "bad id" }, "That model is not allowed."],
        [{ engine: "codex", effort: "extreme" }, "That effort is not allowed."],
        [{ engine: "codex", mode: "code", model: "gpt-fake-a" }, "Codex cannot run code turns yet."],
        [{ engine: "codex", images: [{ mediaType: "image/png", data: "aaaa" }] }, "Codex cannot take pictures yet."],
        [{ engine: "codex", delegateCoding: true }, "delegateCoding is only for Claude Code."],
      ];
      for (const [extra, message] of bad) {
        await expect(client.sendTurn([{ role: "user", content: "hi" }], { thread: "t", ...extra } as never), JSON.stringify(extra)).rejects.toMatchObject({ status: 400, message });
      }
      expect(calls).toEqual([]);
    });

    test("an empty codex answer names Codex, and an empty claude answer still names Claude Code", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — the no-answer sentences name the engine; the bridge sentences do not.
      const sse = (events: [string, unknown][]) => new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
      vi.stubGlobal("fetch", async (url: string) => {
        if (String(url).endsWith("/context")) return new Response(JSON.stringify({ system: "S", tools: [] }), { status: 200, headers: { "content-type": "application/json" } });
        return sse([["start", { ok: true, turnId: "t1" }], ["message", { role: "assistant", content: "  ", model: "m" }]]);
      });
      await expect(client.sendTurn([{ role: "user", content: "hi" }], { thread: "t", engine: "codex" })).rejects.toMatchObject({ message: "Codex returned no answer." });
      await expect(client.sendTurn([{ role: "user", content: "hi" }], { thread: "t" })).rejects.toMatchObject({ message: "Claude Code returned no answer." });
      vi.stubGlobal("fetch", async (url: string) => {
        if (String(url).endsWith("/context")) return new Response(JSON.stringify({ system: "S", tools: [] }), { status: 200, headers: { "content-type": "application/json" } });
        return sse([["start", { ok: true, turnId: "t1" }], ["error", {}]]);
      });
      await expect(client.sendTurn([{ role: "user", content: "hi" }], { thread: "t", engine: "codex" })).rejects.toMatchObject({ message: "Codex could not answer." });
      await expect(client.sendTurn([{ role: "user", content: "hi" }], { thread: "t" })).rejects.toMatchObject({ message: "Claude Code could not answer." });
    });
  });

  describe("bridgeInfo engines bounds", () => {
    let client: ClaudeCodeClient;
    let hello: Record<string, unknown>;

    beforeEach(() => {
      hello = { bridge: "gilb-claude-code-bridge", build: "0.4.0", codeTurns: true, workspace: false, access: "folder" };
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify(hello), { status: 200, headers: { "content-type": "application/json" } }));
      client = createClaudeCodeClient({
        principal: PRINCIPAL,
        platformOrigin: PLATFORM,
        bridgeUrl: "http://127.0.0.1:9",
        getAuthHeaders: async () => ({}),
        storage: memoryStorage(),
      });
    });
    afterEach(() => vi.unstubAllGlobals());

    test("drops a wrong id, a model id with a space, 60 models, and a reason of 400 characters", async () => {
      // Spec: Chat.CodexConnect.PagePart.Units — a malformed engine entry is dropped, and the rest of bridgeInfo stays.
      const sixty = Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, label: "L" }));
      const cases: { engines: unknown[]; keepCodex: boolean }[] = [
        { engines: [{ id: "nope", name: "Nope" }, claudeEntry(), codexEntry({ models: [{ id: "bad id", label: "Bad" }] }), codexEntry()], keepCodex: true },
        { engines: [claudeEntry(), codexEntry({ models: sixty })], keepCodex: false },
        { engines: [claudeEntry(), codexEntry({ reason: "r".repeat(400), ready: false })], keepCodex: false },
      ];
      for (const c of cases) {
        hello = { ...hello, engines: c.engines };
        const info = await client.bridgeInfo();
        const ids = (info.engines ?? []).map((e: BridgeEngine) => e.id);
        expect(ids).toContain("claude");
        expect(ids.filter((id) => id === "codex")).toHaveLength(c.keepCodex ? 1 : 0);
        if (c.keepCodex) expect(info.engines?.find((e) => e.id === "codex")?.models[0]?.id).toBe("gpt-fake-a");
        const { engines: _e, ...rest } = info;
        expect(rest).toEqual({ reachable: true, build: "0.4.0", codeTurns: true, workspace: false, codeMode: null, access: "folder" });
      }
      delete hello.engines;
      const plain = await client.bridgeInfo();
      expect(plain).not.toHaveProperty("engines");
      expect(plain).toEqual({ reachable: true, build: "0.4.0", codeTurns: true, workspace: false, codeMode: null, access: "folder" });
    });
  });
});
