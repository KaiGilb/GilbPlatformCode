// GitHubSync Step 1 (bridge 0.3.22): the bridge's git save events, the per-project switch, gitIdentity and options.git.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClaudeCodeClient, type ClaudeCodeStreamEvent } from "./client";

const PLATFORM = "https://platform.example.test";
const CONTEXT_URL = `${PLATFORM}/base/ai/claude-code/context`;
const BRIDGE = "http://127.0.0.1:47821";
const PRINCIPAL = "https://pelleparafin.example.test/base";
const SESSION = "11111111-2222-4333-8444-555555555555";
const getAuthHeaders = vi.fn(async () => ({ authorization: "DPoP tok", dpop: "p" }));
const mk = () => createClaudeCodeClient({ principal: PRINCIPAL, platformOrigin: PLATFORM, bridgeUrl: BRIDGE, getAuthHeaders });
let client = mk();
let fetchMock: ReturnType<typeof vi.fn>;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sse = (events: [string, unknown][]) =>
  new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
beforeEach(() => {
  client = mk();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());
const ANSWER: [string, unknown] = ["message", { role: "assistant", content: "done", model: "m", sessionId: SESSION }];
function fakeBridge(events: [string, unknown][], other: (url: string, init: RequestInit) => Response | undefined = () => undefined) {
  const calls: { url: string; init: RequestInit }[] = [];
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url === CONTEXT_URL) return json(200, { system: "s", tools: [] });
    if (url === `${BRIDGE}/v1/turn`) return sse([["start", { ok: true, turnId: "t1" }], ...events]);
    const r = other(url, init);
    if (r) return r;
    throw new Error(`unexpected ${url}`);
  });
  return calls;
}
const C = "a".repeat(40);

describe("git_saved / git_error (after the answer)", () => {
  it("are typed and passed on; a malformed one is dropped without a throw", async () => {
    client.save("s3cret");
    fakeBridge([
      ANSWER,
      ["git_saved", { commit: C, files: ["a.txt"], skipped: [{ path: ".env", reason: "an environment file (.env)" }], pushed: "no-link" }],
      ["git_saved", { commit: null, files: [], skipped: [{ path: "k.txt", reason: "an AWS access key" }], pushed: "no-link" }],
      ["git_saved", { commit: "not-a-sha", files: [], skipped: [], pushed: "no-link" }],
      ["git_saved", { commit: C, files: "a.txt", skipped: [], pushed: "no-link" }],
      ["git_saved", { commit: C, files: [], skipped: [{ path: 1 }], pushed: "no-link" }],
      ["git_saved", { commit: C, files: [], skipped: [], pushed: "elsewhere" }],
      ["git_error", { reason: "A stale .git/index.lock stops git; nothing was saved." }],
      ["git_error", { reason: 5 }],
      ["git_saved", { commit: C, files: ["b"], skipped: [], pushed: "no-link", recovered: ["index.lock"] }],
      ["git_saved", { commit: C, files: ["c"], skipped: [], pushed: "no-link", recovered: [3] }],
    ]);
    const evs: ClaudeCodeStreamEvent[] = [];
    const reply = await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", onEvent: (e) => evs.push(e) });
    expect(reply.content).toBe("done");
    expect(evs.filter((e) => e.event === "git_saved" || e.event === "git_error")).toEqual([
      { event: "git_saved", data: { commit: C, files: ["a.txt"], skipped: [{ path: ".env", reason: "an environment file (.env)" }], pushed: "no-link" } },
      { event: "git_saved", data: { commit: null, files: [], skipped: [{ path: "k.txt", reason: "an AWS access key" }], pushed: "no-link" } },
      { event: "git_error", data: { reason: "A stale .git/index.lock stops git; nothing was saved." } },
      { event: "git_saved", data: { commit: C, files: ["b"], skipped: [], pushed: "no-link", recovered: ["index.lock"] } },
      { event: "git_saved", data: { commit: C, files: ["c"], skipped: [], pushed: "no-link" } },
    ]);
  });

  it("a git_error never fails the turn", async () => {
    client.save("s3cret");
    fakeBridge([ANSWER, ["git_error", { reason: "git is not installed" }]]);
    await expect(client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code" })).resolves.toMatchObject({ content: "done" });
  });
});

describe("gitIdentity on a code turn", () => {
  it("is sent to the bridge for a code turn only", async () => {
    client.save("s3cret");
    const calls = fakeBridge([ANSWER]);
    const gitIdentity = { authorName: "GilbApp user", authorEmail: "noreply@example.test", committerName: "GilbApp", committerEmail: "noreply@example.test" };
    await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", gitIdentity });
    await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T2", gitIdentity });
    const bodies = calls.filter((c) => c.url === `${BRIDGE}/v1/turn`).map((c) => JSON.parse(String(c.init.body)));
    expect(bodies[0].gitIdentity).toEqual(gitIdentity);
    expect(bodies[1]).not.toHaveProperty("gitIdentity");
  });
});

describe("the per-project switch", () => {
  it("gitSync reads and sets; the bridge's sentence comes through; not connected is 401; a bad answer is 502", async () => {
    await expect(client.gitSync({ project: "app" })).rejects.toMatchObject({ status: 401 });
    client.save("s3cret");
    const bodies: unknown[] = [];
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      expect(url).toBe(`${BRIDGE}/v1/git/sync`);
      expect((init.headers as Record<string, string>)["x-bridge-secret"]).toBe("s3cret");
      const b = JSON.parse(String(init.body));
      bodies.push(b);
      if (b.project === "nope") return json(400, { error: "No such project." });
      if (b.project === "weird") return json(200, { project: "weird", sync: "yes" });
      return json(200, { project: b.project ?? null, sync: b.sync ?? true });
    });
    expect(await client.gitSync({ project: "app" })).toEqual({ project: "app", sync: true });
    expect(await client.gitSync({ project: "app", sync: false })).toEqual({ project: "app", sync: false });
    expect(await client.gitSync({})).toEqual({ project: null, sync: true });
    expect(bodies).toEqual([{ project: "app" }, { project: "app", sync: false }, {}]);
    await expect(client.gitSync({ project: "nope" })).rejects.toMatchObject({ status: 400, message: "No such project." });
    await expect(client.gitSync({ project: "weird" })).rejects.toMatchObject({ status: 502 });
  });
});

describe("bridgeInfo options.git", () => {
  const hello = (options: unknown) => fetchMock.mockImplementation(async () => json(200, { bridge: "gilb-claude-code-bridge", build: "0.3.22", options }));
  const base = { models: ["opus"], efforts: ["low"], delegateCoding: true };
  it("keeps { save: true, push: boolean }; drops anything else; an older bridge has none", async () => {
    hello({ ...base, git: { save: true, push: false } });
    expect((await client.bridgeInfo()).options?.git).toEqual({ save: true, push: false });
    hello({ ...base, git: { save: "yes", push: false } });
    expect((await client.bridgeInfo()).options).not.toHaveProperty("git");
    hello({ ...base, git: true });
    expect((await client.bridgeInfo()).options).not.toHaveProperty("git");
    hello(base);
    expect((await client.bridgeInfo()).options).not.toHaveProperty("git");
  });
});
