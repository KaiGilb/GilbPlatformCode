// Client 0.3.13: openFolder() (POST /v1/workspace/open) and the `openFolder` field of bridgeInfo().
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeCodeBridgeError, createClaudeCodeClient } from "./client";

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

describe("openFolder", () => {
  it("posts the project with the secret; no project posts {}", async () => {
    client.save("s3cret");
    fetchMock.mockImplementation(async () => json(200, { opened: true }));
    await client.openFolder("app1");
    await client.openFolder();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BRIDGE}/v1/workspace/open`);
    expect(init.headers["x-bridge-secret"]).toBe("s3cret");
    expect(JSON.parse(init.body)).toEqual({ project: "app1" });
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({});
  });
  it("unpaired throws 401 without a request; a refusal carries the bridge's sentence", async () => {
    await expect(client.openFolder()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    client.save("s3cret");
    fetchMock.mockImplementation(async () => json(429, { error: "Too many folder opens. Wait a minute." }));
    const e = await client.openFolder().catch((x) => x);
    expect(e).toBeInstanceOf(ClaudeCodeBridgeError);
    expect(e).toMatchObject({ status: 429, message: "Too many folder opens. Wait a minute." });
  });
  it("bridgeInfo reports openFolder only for a literal true", async () => {
    fetchMock.mockImplementation(async () => json(200, { bridge: "gilb-claude-code-bridge", build: "0.3.18", openFolder: true }));
    expect((await client.bridgeInfo()).openFolder).toBe(true);
    fetchMock.mockImplementation(async () => json(200, { bridge: "gilb-claude-code-bridge", build: "0.3.18", openFolder: "yes" }));
    expect("openFolder" in (await client.bridgeInfo())).toBe(false);
  });
});
