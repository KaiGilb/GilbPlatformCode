// The access-rail face loader: the three round-trip duties, each pinned by a test that FAILS
// if the duty is dropped, so none of them can quietly become a comment.
//
// Ported from the app's granteeFace.test.ts (10 of 10). Changes: the credential seam mock is the
// fake auth host (`setLwsAuth`), and the origin is set through the setting unit.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBaseOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { loadGranteeFace, peekGranteeFace, resetGranteeFaces } from "./granteeFace";

const VIEWER_A = "https://id.platform.example.test/base/p/aaaa";
const VIEWER_B = "https://id.platform.example.test/base/p/bbbb";
const HOLDER = "https://id.platform.example.test/base/p/cccc";

const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;

beforeEach(() => {
  setBaseOrigin("https://platform.example.test");
  setSystemVaultHosts([]);
  setLwsAuth({
    bearerHeaderFor: async () => ({}),
    dpopReadAuth: vi.fn(async () => ({ authorization: "DPoP test-token", dpop: "test-proof" })),
    dpopWriteAuth: async () => ({}),
    invalidateDpop: () => {},
    tokenManager: { getSession: async () => { throw new Error("not used"); }, invalidate: () => {} },
  });
  resetGranteeFaces();
  let n = 0;
  // The two calls the module makes on the object-URL plumbing.
  URL.createObjectURL = vi.fn(() => `blob:face-${++n}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
});

function okOnce() {
  const fetchMock = vi.fn(async (_u: string, _i?: RequestInit) => new Response(new Blob(["bytes"]), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("loadGranteeFace", () => {
  it("asks the platform once per holder and reuses the answer", async () => {
    const fetchMock = okOnce();
    await loadGranteeFace(HOLDER, VIEWER_A);
    await loadGranteeFace(HOLDER, VIEWER_A);
    await loadGranteeFace(HOLDER, VIEWER_A);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces simultaneous callers onto ONE in-flight request", async () => {
    const fetchMock = okOnce();
    const [a, b, c] = await Promise.all([
      loadGranteeFace(HOLDER, VIEWER_A),
      loadGranteeFace(HOLDER, VIEWER_A),
      loadGranteeFace(HOLDER, VIEWER_A),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("re-asks when the VIEWER changes: one viewer's entitled bytes are never another's", async () => {
    const fetchMock = okOnce();
    await loadGranteeFace(HOLDER, VIEWER_A);
    await loadGranteeFace(HOLDER, VIEWER_B);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("remembers a 404 as 'no photo', so the absent case is paid for once", async () => {
    const fetchMock = vi.fn(async (_u: string) => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadGranteeFace(HOLDER, VIEWER_A)).toBeNull();
    expect(await loadGranteeFace(HOLDER, VIEWER_A)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT remember a failure: a 500 must not blank the face for the whole session", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadGranteeFace(HOLDER, VIEWER_A)).rejects.toThrow();
    await expect(loadGranteeFace(HOLDER, VIEWER_A)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends credentials: a bare image request would silently read the anonymous rung", async () => {
    const fetchMock = okOnce();
    await loadGranteeFace(HOLDER, VIEWER_A);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(Object.keys(init.headers ?? {}).length).toBeGreaterThan(0);
  });

  it("asks about the holder key VERBATIM: never a re-derived or trimmed identifier", async () => {
    const fetchMock = okOnce();
    await loadGranteeFace(HOLDER, VIEWER_A);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`principal=${encodeURIComponent(HOLDER)}`);
  });
});

describe("the face memo is a CACHE, not a store (droppability)", () => {
  it("part 1: drop it and the same face comes back from the route", async () => {
    const fetchMock = okOnce();
    const before = await loadGranteeFace(HOLDER, VIEWER_A);
    expect(before).not.toBeNull();

    resetGranteeFaces(); // the drop

    expect(peekGranteeFace(HOLDER, VIEWER_A)).toBeUndefined();
    const after = await loadGranteeFace(HOLDER, VIEWER_A);
    expect(after).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("part 2: no value can ORIGINATE here, the module offers no writer", async () => {
    const mod = await import("./granteeFace");
    expect(Object.keys(mod).sort()).toEqual(
      ["MAX_GRANTEE_FACES", "loadGranteeFace", "peekGranteeFace", "resetGranteeFaces"].sort(),
    );
  });
});

describe("peekGranteeFace", () => {
  it("tells 'no photo' (null) apart from 'not asked yet' (undefined)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(peekGranteeFace(HOLDER, VIEWER_A)).toBeUndefined();
    await loadGranteeFace(HOLDER, VIEWER_A);
    expect(peekGranteeFace(HOLDER, VIEWER_A)).toBeNull();
  });
});
