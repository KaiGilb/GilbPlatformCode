// @vitest-environment node
// The page-side client against the REAL bridge over real HTTP on 127.0.0.1, with a stand-in `claude` and a stand-in
// GilbPlatform. Proves the two halves of this package agree on the wire, which neither half's own tests can.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createBridge } from "@kaigilb/gilbplatformcode-claude-code-bridge/bridge.mjs";
import { createClaudeCodeClient } from "./client";

const FAKE = createRequire(import.meta.url).resolve("@kaigilb/gilbplatformcode-claude-code-bridge/fake-claude.mjs");
const PLATFORM = "https://platform.example";

let dir: string;
let bridge: { start(): Promise<number>; close(): Promise<void>; port: number; pairingCode: string };
const realFetch = globalThis.fetch;
const platformCalls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "client-e2e-"));
  bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: ["https://app.example"], workDir: path.join(dir, "work"), env: { ...process.env } });
  await bridge.start();
  platformCalls.length = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (!String(url).startsWith(PLATFORM)) return realFetch(url, init);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    platformCalls.push({ url, headers: init.headers as Record<string, string>, body });
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
    return url.endsWith("/context")
      ? json({ system: "You are the agent.", tools: [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }] })
      : json({ result: JSON.stringify({ vaults: ["v1"] }) });
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await bridge.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function mk(store: Storage = sessionStorageLike()) {
  return createClaudeCodeClient({
    principal: "https://p.example/base",
    platformOrigin: PLATFORM,
    bridgeUrl: `http://127.0.0.1:${bridge.port}`,
    getAuthHeaders: async (method, url) => ({ authorization: `DPoP for ${method} ${url}` }),
    storage: store,
  });
}
function sessionStorageLike(): Storage {
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

describe("client <-> bridge, end to end", () => {
  it("probes, pairs with the printed code, runs a turn whose tool call goes to the platform as the person, and answers", async () => {
    const c = mk();
    expect(await c.probe()).toBe(true);
    await expect(c.pair("AAA-AAA")).rejects.toMatchObject({ status: 401 });
    const readback = await c.pair(bridge.pairingCode);
    expect(readback).toMatchObject({ connected: true });
    const events: string[] = [];
    const reply = await c.sendTurn([{ role: "user", content: "CALLTOOL which vaults?" }], { thread: "t", agent: "Jackfruit", onEvent: (e) => events.push(e.event) });
    expect(reply).toMatchObject({ role: "assistant", payer: "person-claude-code", model: "fake-model" });
    expect(reply.content).toContain("vault");
    expect(events).toEqual(expect.arrayContaining(["start", "tool"]));
    // The tool ran on the platform, signed for its own method and URL, and the bridge secret never went there.
    const tool = platformCalls.find((x) => x.url.endsWith("/tool"))!;
    expect(tool.body).toMatchObject({ name: "list_vaults" });
    expect(tool.headers.authorization).toBe(`DPoP for POST ${PLATFORM}/base/ai/claude-code/tool`);
    expect(JSON.stringify(platformCalls)).not.toContain(c.load()!.secret);
  });

  it("a restarted bridge (new secrets) is met with a 401 the client turns into 'press Connect', forgetting the old secret", async () => {
    const c = mk();
    await c.pair(bridge.pairingCode);
    await bridge.close();
    bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [], workDir: path.join(dir, "work2"), env: { ...process.env } });
    await bridge.start();
    const c2 = createClaudeCodeClient({
      principal: "https://p.example/base",
      platformOrigin: PLATFORM,
      bridgeUrl: `http://127.0.0.1:${bridge.port}`,
      getAuthHeaders: async () => ({}),
      storage: sessionStorageLike(),
    });
    c2.save(c.load()!.secret); // the old secret, against the new bridge
    await expect(c2.sendTurn([{ role: "user", content: "hi" }], { thread: "t" })).rejects.toMatchObject({ status: 401 });
    expect(c2.load()).toBeNull();
  });

  it("disconnect makes the bridge forget the secret", async () => {
    const c = mk();
    await c.pair(bridge.pairingCode);
    const secret = c.load()!.secret;
    c.disconnect();
    await vi.waitFor(async () => {
      const res = await realFetch(`http://127.0.0.1:${bridge.port}/v1/check`, { method: "POST", headers: { "x-bridge-secret": secret } });
      expect(res.status).toBe(401);
    });
    expect(c.load()).toBeNull();
  });

  it("Disconnect in the middle of a turn that is not waiting on a tool stops it at once and the bridge kills claude", async () => {
    const c = mk();
    await c.pair(bridge.pairingCode);
    const t0 = Date.now();
    const turn = c.sendTurn([{ role: "user", content: "WAITFOREVER please" }], { thread: "t" });
    const settled = turn.then(() => "answered", (e: unknown) => e);
    await new Promise((r) => setTimeout(r, 400)); // the turn is running on the bridge
    c.disconnect();
    const err = await settled;
    expect(err).toMatchObject({ status: 499, message: expect.stringMatching(/disconnected/) });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(c.load()).toBeNull();
  });
});
