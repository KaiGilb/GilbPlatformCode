// Client 0.3.14: setAccess() (POST /v1/access) and the accessChangeable / accessSource fields of bridgeInfo().
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeAccessError, ClaudeCodeBridgeError, createClaudeCodeClient } from "./client";

const BRIDGE = "http://127.0.0.1:47821";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const client = createClaudeCodeClient({ principal: "p", platformOrigin: "https://platform.example.test", bridgeUrl: BRIDGE, getAuthHeaders: () => ({}) });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("setAccess", () => {
  it("posts the mode with the secret and returns the bridge's answer", async () => {
    client.save("s3cret");
    fetchMock.mockImplementation(async () => json(200, { access: "folder", changed: true, cancelled: 1 }));
    expect(await client.setAccess("folder")).toEqual({ access: "folder", changed: true, cancelled: 1 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BRIDGE}/v1/access`);
    expect(init.headers["x-bridge-secret"]).toBe("s3cret");
    expect(JSON.parse(init.body)).toEqual({ mode: "folder" });
    fetchMock.mockImplementation(async () => json(200, { access: "computer", changed: true }));
    expect(await client.setAccess("computer")).toEqual({ access: "computer", changed: true });
  });
  it("unpaired throws 401 without a request", async () => {
    await expect(client.setAccess("folder")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("a refusal is a BridgeAccessError with the bridge's code and sentence", async () => {
    client.save("s3cret");
    fetchMock.mockImplementation(async () => json(403, { error: "Full access was not allowed on this computer.", code: "AccessDenied" }));
    const e = await client.setAccess("computer").catch((x) => x);
    expect(e).toBeInstanceOf(BridgeAccessError);
    expect(e).toBeInstanceOf(ClaudeCodeBridgeError);
    expect(e).toMatchObject({ status: 403, code: "AccessDenied", message: "Full access was not allowed on this computer." });
    fetchMock.mockImplementation(async () => json(404, { error: "not found" }));
    expect(await client.setAccess("folder").catch((x) => x)).toMatchObject({ status: 404, code: null });
  });
  it("an odd 200 is a 502", async () => {
    client.save("s3cret");
    fetchMock.mockImplementation(async () => json(200, { access: "everything" }));
    await expect(client.setAccess("folder")).rejects.toMatchObject({ status: 502 });
  });
  it("bridgeInfo keeps accessChangeable only for a literal true and accessSource only for the known values", async () => {
    const hello = (extra: object) => fetchMock.mockImplementation(async () => json(200, { bridge: "gilb-claude-code-bridge", build: "0.3.19", access: "folder", ...extra }));
    hello({ accessChangeable: true, accessSource: "file" });
    expect(await client.bridgeInfo()).toMatchObject({ access: "folder", accessChangeable: true, accessSource: "file" });
    hello({ accessChangeable: "yes", accessSource: "elsewhere" });
    const i = await client.bridgeInfo();
    expect("accessChangeable" in i).toBe(false);
    expect("accessSource" in i).toBe(false);
  });
  it("bridgeInfo passes accessSaveFailed through only for a literal true", async () => {
    const hello = (extra: object) => fetchMock.mockImplementation(async () => json(200, { bridge: "gilb-claude-code-bridge", build: "0.3.19", access: "folder", ...extra }));
    hello({ accessChangeable: true, accessSource: "file", accessSaveFailed: true });
    expect(await client.bridgeInfo()).toMatchObject({ access: "folder", accessChangeable: true, accessSource: "file", accessSaveFailed: true });
    for (const v of [false, "true", 1, null]) {
      hello({ accessSaveFailed: v });
      expect("accessSaveFailed" in (await client.bridgeInfo()), String(v)).toBe(false);
    }
    hello({});
    expect("accessSaveFailed" in (await client.bridgeInfo())).toBe(false);
  });
});
