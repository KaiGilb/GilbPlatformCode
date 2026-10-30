// What the unit asks of its host: the origin setting and the credential seam. Added tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBaseOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import * as unit from "./index";
import { MAX_GRANTEE_FACES, loadGranteeFace, peekGranteeFace, resetGranteeFaces } from "./granteeFace";

const HOLDER = "https://id.platform.example.test/base/p/cccc";
const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;
let reads: Array<[string, string]>;
let revoked: string[];
let made: number;

beforeEach(() => {
  setBaseOrigin("https://platform.example.test");
  setSystemVaultHosts([]);
  reads = [];
  revoked = [];
  made = 0;
  setLwsAuth({
    bearerHeaderFor: async () => ({}),
    dpopReadAuth: async (method, url) => { reads.push([method, url]); return { authorization: "DPoP t", dpop: "p" }; },
    dpopWriteAuth: async () => ({}),
    invalidateDpop: () => {},
    tokenManager: { getSession: async () => { throw new Error("not used"); }, invalidate: () => {} },
  });
  resetGranteeFaces();
  URL.createObjectURL = () => `blob:f-${++made}`;
  URL.revokeObjectURL = (u: string) => { revoked.push(u); };
});
afterEach(() => {
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
});

const ok = () => vi.fn(async (_url: string, _init?: RequestInit) => new Response(new Blob(["b"]), { status: 200 }));

describe("exports", () => {
  it("the index exports the four names of the source", () => {
    expect(Object.keys(unit).sort()).toEqual(["MAX_GRANTEE_FACES", "loadGranteeFace", "peekGranteeFace", "resetGranteeFaces"]);
  });
  it("the cap is 24", () => {
    expect(MAX_GRANTEE_FACES).toBe(24);
  });
});

describe("the origin is read from the setting when the function runs", () => {
  it("asks at the origin that was set, on the connect route", async () => {
    const f = ok();
    vi.stubGlobal("fetch", f);
    await loadGranteeFace(HOLDER, "v");
    expect(f.mock.calls[0]![0]).toBe(`https://platform.example.test/base/connect/profile-photo?principal=${encodeURIComponent(HOLDER)}`);
  });
  it("follows a later change of the setting (nothing is read at load)", async () => {
    const f = ok();
    vi.stubGlobal("fetch", f);
    setBaseOrigin("https://other.example.test");
    await loadGranteeFace(HOLDER, "v");
    expect((f.mock.calls[0]![0] as string).startsWith("https://other.example.test/base/connect/profile-photo?")).toBe(true);
  });
  it("throws, naming the setter, when no origin was set", async () => {
    resetBaseOrigin();
    vi.stubGlobal("fetch", ok());
    await expect(loadGranteeFace(HOLDER, "v")).rejects.toThrow(/setBaseOrigin/);
  });
});

describe("the credential seam", () => {
  it("signs one GET for the very url it fetches", async () => {
    const f = ok();
    vi.stubGlobal("fetch", f);
    await loadGranteeFace(HOLDER, "v");
    expect(reads).toEqual([["GET", f.mock.calls[0]![0] as string]]);
    expect((f.mock.calls[0]![1] as RequestInit).method).toBe("GET");
    expect((f.mock.calls[0]![1] as RequestInit).headers).toEqual({ authorization: "DPoP t", dpop: "p" });
  });
  it("throws, naming the setter, when no auth host was set", async () => {
    resetLwsAuth();
    vi.stubGlobal("fetch", ok());
    await expect(loadGranteeFace(HOLDER, "v")).rejects.toThrow(/setLwsAuth/);
  });
});

describe("the memo", () => {
  it("a changed viewer wipes the memo and revokes the object urls it owned", async () => {
    vi.stubGlobal("fetch", ok());
    const url = await loadGranteeFace(HOLDER, "a");
    expect(peekGranteeFace(HOLDER, "a")).toBe(url);
    expect(peekGranteeFace(HOLDER, "b")).toBeUndefined();
    expect(revoked).toEqual([url]);
  });
  it("a null 404 entry is not revoked on a wipe", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await loadGranteeFace(HOLDER, "a");
    resetGranteeFaces();
    expect(revoked).toEqual([]);
  });
  it("after resetGranteeFaces the same viewer asks again", async () => {
    const f = ok();
    vi.stubGlobal("fetch", f);
    await loadGranteeFace(HOLDER, "a");
    resetGranteeFaces();
    await loadGranteeFace(HOLDER, "a");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("a null viewer is a viewer of its own", async () => {
    const f = ok();
    vi.stubGlobal("fetch", f);
    await loadGranteeFace(HOLDER, null);
    await loadGranteeFace(HOLDER, null);
    expect(f).toHaveBeenCalledTimes(1);
    expect(peekGranteeFace(HOLDER, "a")).toBeUndefined();
  });
  it("a failed read leaves nothing in flight: the next call asks again and may succeed", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("x", { status: 503 })).mockResolvedValueOnce(new Response(new Blob(["b"]), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await expect(loadGranteeFace(HOLDER, "a")).rejects.toThrow("profile-photo 503");
    expect(peekGranteeFace(HOLDER, "a")).toBeUndefined();
    expect(await loadGranteeFace(HOLDER, "a")).toBe("blob:f-1");
  });
  it("a changed viewer drops a request already in flight, so it asks again", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const f = vi.fn(async (_u: string) => { await gate; return new Response(new Blob(["b"]), { status: 200 }); });
    vi.stubGlobal("fetch", f);
    const first = loadGranteeFace(HOLDER, "a");
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    const second = loadGranteeFace(HOLDER, "b");
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    release();
    await Promise.all([first, second]);
  });
  it("each holder has its own entry", async () => {
    const f = ok();
    vi.stubGlobal("fetch", f);
    const a = await loadGranteeFace(HOLDER, "a");
    const b = await loadGranteeFace(`${HOLDER}2`, "a");
    expect(a).not.toBe(b);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
