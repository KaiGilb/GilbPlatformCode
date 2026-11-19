// Client 0.3.11: updateBridge() (POST /v1/update) and the `update` field of bridgeInfo().
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeUpdateError, ClaudeCodeBridgeError, createClaudeCodeClient } from "./client";

const BRIDGE = "http://127.0.0.1:47821";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const client = createClaudeCodeClient({ principal: "p", platformOrigin: "https://platform.example.test", bridgeUrl: BRIDGE, getAuthHeaders: () => ({}) });
let fetchMock: ReturnType<typeof vi.fn>;
const hello = (build: string | undefined, extra: Record<string, unknown> = {}) => json(200, { bridge: "gilb-claude-code-bridge", ...(build ? { build } : {}), ...extra });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  client.save("s3cret");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("updateBridge", () => {
  it("K1 automatic: posts with the secret, polls bridgeInfo every second until the new build, cameBack true", async () => {
    vi.useFakeTimers();
    let helloCalls = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === `${BRIDGE}/v1/update`) return json(200, { updated: true, from: "0.3.16", to: "0.3.17", restart: "automatic" });
      helloCalls++;
      if (helloCalls < 3) throw new TypeError("connection refused"); // the bridge is restarting
      return hello("0.3.17");
    });
    const p = client.updateBridge();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toEqual({ updated: true, from: "0.3.16", to: "0.3.17", restart: "automatic", cameBack: true });
    expect(helloCalls).toBe(3);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe("POST");
    expect(init.headers["x-bridge-secret"]).toBe("s3cret");
    expect(JSON.parse(init.body)).toEqual({});
  });

  it("K1 manual: no polling, cameBack false", async () => {
    fetchMock.mockImplementation(async () => json(200, { updated: true, from: "0.3.16", to: "0.3.17", restart: "manual" }));
    expect(await client.updateBridge()).toEqual({ updated: true, from: "0.3.16", to: "0.3.17", restart: "manual", cameBack: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("K1 409 TurnRunning: throws BridgeUpdateError with the bridge's text and code", async () => {
    fetchMock.mockImplementation(async () => json(409, { error: "A chat turn is still running. Update when it has finished.", code: "TurnRunning" }));
    const e = await client.updateBridge().catch((x) => x);
    expect(e).toBeInstanceOf(BridgeUpdateError);
    expect(e).toBeInstanceOf(ClaudeCodeBridgeError);
    expect(e).toMatchObject({ status: 409, code: "TurnRunning", message: "A chat turn is still running. Update when it has finished." });
  });

  it("K1 an old bridge (404 without a code) is a plain ClaudeCodeBridgeError", async () => {
    fetchMock.mockImplementation(async () => json(404, { error: "not found" }));
    const e = await client.updateBridge().catch((x) => x);
    expect(e).toBeInstanceOf(ClaudeCodeBridgeError);
    expect(e).not.toBeInstanceOf(BridgeUpdateError);
    expect(e.status).toBe(404);
  });

  it("K1 timeout: the bridge never comes back, cameBack false after timeoutMs", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === `${BRIDGE}/v1/update`) return json(200, { updated: true, from: "0.3.16", to: "0.3.17", restart: "automatic" });
      return hello("0.3.16"); // still the old build
    });
    const p = client.updateBridge({ timeoutMs: 4000 });
    await vi.advanceTimersByTimeAsync(6000);
    expect(await p).toEqual({ updated: true, from: "0.3.16", to: "0.3.17", restart: "automatic", cameBack: false });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });

  it("current and check answers", async () => {
    fetchMock.mockImplementation(async () => json(200, { updated: false, reason: "current" }));
    expect(await client.updateBridge()).toEqual({ updated: false, reason: "current" });
    fetchMock.mockImplementation(async (_u: string, init: RequestInit) => {
      expect(JSON.parse(init.body as string)).toEqual({ check: true });
      return json(200, { current: "0.3.16", latest: "0.3.17", available: true });
    });
    expect(await client.updateBridge({ check: true })).toEqual({ check: true, current: "0.3.16", latest: "0.3.17", available: true });
  });

  it("without a pairing it says to connect, and sends nothing", async () => {
    localStorage.clear();
    await expect(client.updateBridge()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("bridgeInfo().update", () => {
  it("K2 is parsed from hello; absent or malformed is left out", async () => {
    const u = { supported: true, supervised: false, canWrite: true, busy: false };
    fetchMock.mockImplementation(async () => hello("0.3.16", { update: u }));
    expect((await client.bridgeInfo()).update).toEqual(u);
    fetchMock.mockImplementation(async () => hello("0.3.15"));
    const old = await client.bridgeInfo();
    expect(old.update).toBeUndefined();
    expect("update" in old).toBe(false);
    fetchMock.mockImplementation(async () => hello("0.3.16", { update: { supported: "yes" } }));
    expect((await client.bridgeInfo()).update).toBeUndefined();
  });
});
