// @vitest-environment jsdom
// The main-tag reads, over a fake tag platform: a fake `fetch` stubbed on the global, a fake signing session set with `setLwsAuth`, the platform origin set as
// vault-origin-rule's tests set it. No network, no wall-clock wait (the time bound runs on fake timers).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth, type LwsAuthHost } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { PlatformError } from "@kaigilb/gilbplatformcode-record-sync";
import { NoTagRoutesError } from "@kaigilb/gilbplatformcode-tag-client";
import {
  fetchMainTagsForRows,
  mainTagKey,
  mainTagsKey,
  readMasterTags,
  tagPlatformFor,
  TAG_READ_BOUND_MS,
  useMainTag,
  useMainTags,
  useMainTagsForRows,
  type MainTagRow,
} from "./index";

const ORIGIN = "https://platform.example.test";
const ANN = "https://ann.platform.example.test/base";
const BOB = "https://bob.platform.example.test/vault";
const e = (vault: string, id: string) => `${vault}/e/${id}`;
const SESSION = { principal: `${ORIGIN}/base/p/ann`, vault: null, vaults: [] };

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: { vault: string; targetEntities: string[] };
}
type Answer = { tag: string | null; known: boolean; reason?: string };

let calls: Call[];
/** What the platform answers per record; a record not here is left out of the answer. */
let tags: Map<string, Answer>;
/** A vault (its `/base` or `/vault` address) whose calls answer this status instead of the tags. */
let failing: Map<string, number>;
let hang: boolean;
let auth: ReturnType<typeof fakeAuth>;
let qc: QueryClient;

function fakeAuth() {
  const host = {
    bearerHeaderFor: vi.fn(async (_url: string, _method?: string) => ({ authorization: "DPoP t-bearer", dpop: "p-bearer" })),
    dpopReadAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP t-read", dpop: "p-read" })),
    dpopWriteAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP t-write", dpop: "p-write" })),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: vi.fn(async () => SESSION), invalidate: vi.fn() },
  };
  return host satisfies LwsAuthHost;
}

beforeEach(() => {
  calls = [];
  tags = new Map();
  failing = new Map();
  hang = false;
  setBaseOrigin(ORIGIN);
  setSystemVaultHosts(["veda.platform.example.test"]);
  auth = fakeAuth();
  setLwsAuth(auth);
  qc = new QueryClient();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Call["body"];
    calls.push({ url: String(input), method: String(init?.method), headers: new Headers(init?.headers), body });
    if (hang) return new Promise<Response>(() => {});
    const status = failing.get(body.vault);
    if (status) return new Response(JSON.stringify({ error: "boom" }), { status });
    return Response.json({
      masterTags: body.targetEntities
        .filter((t) => tags.has(t))
        .map((t) => {
          const a = tags.get(t)!;
          return { targetEntity: t, tagString: a.tag, tagKnown: a.known, ...(a.reason ? { tagUnknownReason: a.reason } : {}) };
        }),
    });
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
});

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const nameless = (n: number, vault = ANN, prefix = "r"): MainTagRow[] => Array.from({ length: n }, (_, i) => ({ entityUri: e(vault, `${prefix}${i}`), facts: {} }));
const tagAll = (rows: MainTagRow[]) => {
  for (const r of rows) tags.set(r.entityUri!, { tag: `tag-${r.entityUri!.slice(r.entityUri!.lastIndexOf("/") + 1)}`, known: true });
};
const sizes = () => calls.map((c) => c.body.targetEntities.length);

describe("useMainTag", () => {
  it("reads one record's main tag with one call, under the key ['main-tag', uri]", async () => {
    const uri = e(ANN, "rec1");
    tags.set(uri, { tag: "alpha", known: true });
    const { result } = renderHook(() => useMainTag(uri), { wrapper: wrap });
    await waitFor(() => expect(result.current.data).toEqual({ tag: "alpha", known: true }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ vault: ANN, targetEntities: [uri] });
    expect(qc.getQueryData(["main-tag", uri])).toEqual({ tag: "alpha", known: true });
    expect(qc.getQueryData(mainTagKey(uri))).toEqual({ tag: "alpha", known: true });
  });

  it("keeps staleTime 60s, no retry and no refetch on focus", async () => {
    const uri = e(ANN, "rec1");
    tags.set(uri, { tag: "alpha", known: true });
    const { result } = renderHook(() => useMainTag(uri), { wrapper: wrap });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const o = qc.getQueryCache().find({ queryKey: ["main-tag", uri] })!.observers[0]!.options;
    expect([o.staleTime, o.retry, o.refetchOnWindowFocus]).toEqual([60_000, false, false]);
  });

  it("is disabled for null and undefined: no call, no data", async () => {
    const a = renderHook(() => useMainTag(null), { wrapper: wrap });
    const b = renderHook(() => useMainTag(undefined), { wrapper: wrap });
    expect(a.result.current.fetchStatus).toBe("idle");
    expect(b.result.current.fetchStatus).toBe("idle");
    expect(a.result.current.data).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it.each([["a query", "?y=1"], ["a trailing slash", "/"], ["a deeper path", "/deeper"]])("is disabled for an address with %s, which vaultOfEntity rejects", async (_what, tail) => {
    const { result } = renderHook(() => useMainTag(`${e(ANN, "rec1")}${tail}`), { wrapper: wrap });
    expect(result.current.fetchStatus).toBe("idle");
    expect(calls).toHaveLength(0);
  });

  it("answers { tag: null, known: false } when the record is missing from the platform's answer", async () => {
    const uri = e(ANN, "ghost");
    const { result } = renderHook(() => useMainTag(uri), { wrapper: wrap });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ tag: null, known: false });
    expect(calls).toHaveLength(1);
  });

  it("carries the platform's reason when it says the tag is unknown", async () => {
    const uri = e(ANN, "r2");
    tags.set(uri, { tag: null, known: false, reason: "anomaly" });
    const { result } = renderHook(() => useMainTag(uri), { wrapper: wrap });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ tag: null, known: false, reason: "anomaly" });
  });

  it("a failed read is an error and is not retried", async () => {
    failing.set(ANN, 500);
    const { result } = renderHook(() => useMainTag(e(ANN, "rec1")), { wrapper: wrap });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls).toHaveLength(1);
  });

  it("a platform without the tag routes is a NoTagRoutesError", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "Route POST:/base/tag/masters not found" }), { status: 404 }));
    const { result } = renderHook(() => useMainTag(e(ANN, "rec1")), { wrapper: wrap });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(NoTagRoutesError);
  });

  it("two sites on one record share one call and one cache entry", async () => {
    const uri = e(ANN, "rec1");
    tags.set(uri, { tag: "alpha", known: true });
    const a = renderHook(() => useMainTag(uri), { wrapper: wrap });
    const b = renderHook(() => useMainTag(uri), { wrapper: wrap });
    await waitFor(() => expect(a.result.current.data?.tag).toBe("alpha"));
    await waitFor(() => expect(b.result.current.data?.tag).toBe("alpha"));
    expect(calls).toHaveLength(1);
  });
});

describe("what every request carries", () => {
  it("is a POST to the record's own vault origin, signed with the session's WRITE proof (a read included), with a JSON body", async () => {
    const uri = e(ANN, "rec1");
    tags.set(uri, { tag: "alpha", known: true });
    const { result } = renderHook(() => useMainTag(uri), { wrapper: wrap });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const c = calls[0]!;
    expect(c.method).toBe("POST");
    expect(c.url).toBe("https://ann.platform.example.test/base/tag/masters");
    expect(c.headers.get("authorization")).toBe("DPoP t-write");
    expect(c.headers.get("dpop")).toBe("p-write");
    expect(auth.dpopWriteAuth).toHaveBeenCalledWith("POST", c.url);
    expect(auth.dpopReadAuth).not.toHaveBeenCalled();
  });

  it("goes to each record's own vault origin, and never to another host: an address on a foreign host is asked at the platform's origin", async () => {
    await readMasterTags(BOB, [e(BOB, "b1")]);
    await readMasterTags("https://evil.example/base", ["https://evil.example/base/e/x"]);
    expect(calls.map((c) => c.url)).toEqual(["https://bob.platform.example.test/base/tag/masters", `${ORIGIN}/base/tag/masters`]);
    expect(calls.some((c) => c.url.includes("evil.example"))).toBe(false);
    expect(calls.every((c) => c.headers.get("dpop") === "p-write")).toBe(true);
  });

  it("tagPlatformFor gives the record's origin without a trailing slash", () => {
    expect(tagPlatformFor(e(ANN, "x")).origin).toBe("https://ann.platform.example.test");
    expect(tagPlatformFor(e(BOB, "x")).origin).toBe("https://bob.platform.example.test");
    expect(tagPlatformFor("https://evil.example/base/e/x").origin).toBe(ORIGIN);
  });

  it("before the session is set, the read fails with the sentence naming setLwsAuth and no request leaves", async () => {
    resetLwsAuth();
    await expect(readMasterTags(ANN, [e(ANN, "x")])).rejects.toThrow(/setLwsAuth/);
    expect(calls).toHaveLength(0);
  });
});

describe("readMasterTags", () => {
  it("an empty list makes no call and answers an empty map", async () => {
    const got = await readMasterTags(ANN, []);
    expect(got.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("answers a map by record address", async () => {
    const a = e(ANN, "a");
    const b = e(ANN, "b");
    tags.set(a, { tag: "ta", known: true });
    tags.set(b, { tag: null, known: false, reason: "none" });
    const got = await readMasterTags(ANN, [a, b]);
    expect(got.get(a)).toEqual({ tag: "ta", known: true });
    expect(got.get(b)).toEqual({ tag: null, known: false, reason: "none" });
    expect(calls).toHaveLength(1);
  });

  it("throws above 50 records, before any call (the callers cut the list first)", async () => {
    const rows = nameless(51);
    await expect(readMasterTags(ANN, rows.map((r) => r.entityUri!))).rejects.toThrow("at most 50 records in one read");
    expect(calls).toHaveLength(0);
    tagAll(nameless(50));
    expect((await readMasterTags(ANN, nameless(50).map((r) => r.entityUri!))).size).toBe(50);
    expect(calls).toHaveLength(1);
  });

  it("a request that never answers ends with the bound error after TAG_READ_BOUND_MS", async () => {
    hang = true;
    vi.useFakeTimers();
    const settled = readMasterTags(ANN, [e(ANN, "x")]).then(
      () => "answered",
      (err: Error) => err,
    );
    await vi.advanceTimersByTimeAsync(TAG_READ_BOUND_MS - 1);
    expect(calls).toHaveLength(1);
    let early = false;
    void settled.then(() => (early = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(early).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await settled;
    // The platform client reports a fetch that ended in error as "could not be reached", with the bound's own words and status 0.
    expect(err).toBeInstanceOf(PlatformError);
    expect((err as PlatformError).message).toBe("POST https://ann.platform.example.test/base/tag/masters could not be reached: BoundTimeoutError: reaching the tag service timed out");
    expect((err as PlatformError).status).toBe(0);
  });
});

describe("useMainTags", () => {
  it("30 records of one vault make ONE call carrying all 30", async () => {
    const rows = nameless(30);
    tagAll(rows);
    const uris = rows.map((r) => r.entityUri!);
    const { result } = renderHook(() => useMainTags(uris), { wrapper: wrap });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.tags.size).toBe(30);
    expect(sizes()).toEqual([30]);
    expect(calls[0]!.body.vault).toBe(ANN);
  });

  it("120 records make 3 calls (50, 50, 20), not 120", async () => {
    const rows = nameless(120);
    tagAll(rows);
    const uris = rows.map((r) => r.entityUri!);
    const { result } = renderHook(() => useMainTags(uris), { wrapper: wrap });
    await waitFor(() => expect(result.current.tags.size).toBe(120));
    expect(sizes().sort((a, b) => b - a)).toEqual([50, 50, 20]);
  });

  it("groups by vault: two vaults make two calls, each at its own origin with its own vault in the body", async () => {
    const rows = [...nameless(3, ANN, "a"), ...nameless(2, BOB, "b")];
    tagAll(rows);
    const uris = rows.map((r) => r.entityUri!);
    const { result } = renderHook(() => useMainTags(uris), { wrapper: wrap });
    await waitFor(() => expect(result.current.tags.size).toBe(5));
    expect(calls).toHaveLength(2);
    const byVault = Object.fromEntries(calls.map((c) => [c.body.vault, c]));
    expect(byVault[ANN]!.url).toBe("https://ann.platform.example.test/base/tag/masters");
    expect(byVault[ANN]!.body.targetEntities).toHaveLength(3);
    expect(byVault[BOB]!.url).toBe("https://bob.platform.example.test/base/tag/masters");
    expect(byVault[BOB]!.body.targetEntities).toHaveLength(2);
  });

  it("an address of a foreign shape is not asked", async () => {
    const good = e(ANN, "ok");
    tags.set(good, { tag: "t", known: true });
    const { result } = renderHook(() => useMainTags([`${good}?y=1`, "nonsense", good]), { wrapper: wrap });
    await waitFor(() => expect(result.current.tags.get(good)?.tag).toBe("t"));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.targetEntities).toEqual([good]);
  });

  it("is pending while it reads, and has no pending group when the list is empty", async () => {
    const rows = nameless(2);
    tagAll(rows);
    const uris = rows.map((r) => r.entityUri!);
    const a = renderHook(() => useMainTags(uris), { wrapper: wrap });
    expect(a.result.current.pending).toBe(true);
    expect(a.result.current.tags.size).toBe(0);
    await waitFor(() => expect(a.result.current.pending).toBe(false));
    const b = renderHook(() => useMainTags([]), { wrapper: wrap });
    expect(b.result.current.pending).toBe(false);
    expect(b.result.current.tags.size).toBe(0);
  });

  it("keeps staleTime 60s, no retry and no refetch on focus, under the key ['main-tags', vault, ...sorted uris]", async () => {
    const rows = nameless(3);
    tagAll(rows);
    const uris = rows.map((r) => r.entityUri!).reverse();
    const { result } = renderHook(() => useMainTags(uris), { wrapper: wrap });
    await waitFor(() => expect(result.current.pending).toBe(false));
    const key = mainTagsKey(ANN, uris);
    expect(key.slice(0, 2)).toEqual(["main-tags", ANN]);
    const q = qc.getQueryCache().find({ queryKey: key })!;
    const o = q.observers[0]!.options;
    expect(q).toBeDefined();
    expect([o.staleTime, o.retry, o.refetchOnWindowFocus]).toEqual([60_000, false, false]);
  });

  it("a failed group gives no tags and the other group is still answered", async () => {
    const rows = [...nameless(2, ANN, "a"), ...nameless(2, BOB, "b")];
    tagAll(rows);
    failing.set(BOB, 500);
    const uris = rows.map((r) => r.entityUri!);
    const { result } = renderHook(() => useMainTags(uris), { wrapper: wrap });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect([...result.current.tags.keys()].sort()).toEqual(rows.slice(0, 2).map((r) => r.entityUri!).sort());
  });
});

describe("useMainTagsForRows", () => {
  it("30 rows with no name make exactly ONE call carrying all 30; a row with a name is not asked", async () => {
    const rows = [...nameless(30), { entityUri: e(ANN, "named"), facts: { name: "Ann" } }];
    tagAll(rows);
    const { result } = renderHook(() => useMainTagsForRows(rows), { wrapper: wrap });
    await waitFor(() => expect(result.current.size).toBe(30));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.vault).toBe(ANN);
    expect([...calls[0]!.body.targetEntities].sort()).toEqual(nameless(30).map((r) => r.entityUri!).sort());
    expect(result.current.has(e(ANN, "named"))).toBe(false);
  });

  it("120 rows make 3 calls (50, 50, 20), not 120", async () => {
    const rows = nameless(120);
    tagAll(rows);
    const { result } = renderHook(() => useMainTagsForRows(rows), { wrapper: wrap });
    await waitFor(() => expect(result.current.size).toBe(120));
    expect(sizes().sort((a, b) => b - a)).toEqual([50, 50, 20]);
  });

  it("answers only the tags the platform knows: an unknown or empty tag is left out, so the row keeps the name it had", async () => {
    const [a, b, c] = ["a", "b", "c"].map((id) => e(ANN, id));
    tags.set(a, { tag: "ta", known: true });
    tags.set(b, { tag: null, known: false, reason: "none" });
    tags.set(c, { tag: "", known: true });
    const rows: MainTagRow[] = [a!, b!, c!].map((u) => ({ entityUri: u, facts: {} }));
    const { result } = renderHook(() => useMainTagsForRows(rows), { wrapper: wrap });
    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get(a!)).toBe("ta");
    expect(calls).toHaveLength(1);
  });

  it("rows that all hold a name make no call", async () => {
    const rows: MainTagRow[] = [{ entityUri: e(ANN, "x"), facts: { label: "L" } }];
    const { result } = renderHook(() => useMainTagsForRows(rows), { wrapper: wrap });
    expect(result.current.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("shares the cache of useMainTags: the same page read by both is one call", async () => {
    const rows = nameless(4);
    tagAll(rows);
    const uris = rows.map((r) => r.entityUri!);
    const a = renderHook(() => useMainTags(uris), { wrapper: wrap });
    await waitFor(() => expect(a.result.current.pending).toBe(false));
    const b = renderHook(() => useMainTagsForRows(rows), { wrapper: wrap });
    await waitFor(() => expect(b.result.current.size).toBe(4));
    expect(calls).toHaveLength(1);
  });
});

describe("fetchMainTagsForRows (for code that is not a component)", () => {
  it("60 rows make 2 calls (50, 10), and the same rows asked again are served from the cache", async () => {
    const rows = nameless(60, ANN, "s");
    tagAll(rows);
    const got = await fetchMainTagsForRows(qc, rows);
    expect(got.size).toBe(60);
    expect(sizes()).toEqual([50, 10]);
    await fetchMainTagsForRows(qc, rows);
    expect(calls).toHaveLength(2);
  });

  it("shares its entry with the hook: a page read by the hook is not asked again, and the other way round", async () => {
    const rows = nameless(5);
    tagAll(rows);
    const uris = rows.map((r) => r.entityUri!);
    const { result } = renderHook(() => useMainTags(uris), { wrapper: wrap });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect((await fetchMainTagsForRows(qc, rows)).size).toBe(5);
    expect(calls).toHaveLength(1);
  });

  it("asks each vault at its own origin, and only for the rows that need a tag", async () => {
    const rows: MainTagRow[] = [...nameless(2, ANN, "a"), ...nameless(2, BOB, "b"), { entityUri: e(ANN, "named"), facts: { tag: "t" } }];
    tagAll(rows);
    const got = await fetchMainTagsForRows(qc, rows);
    expect(got.size).toBe(4);
    expect(calls.map((c) => c.url).sort()).toEqual(["https://ann.platform.example.test/base/tag/masters", "https://bob.platform.example.test/base/tag/masters"]);
  });

  it("a group that cannot be read gives no tags for its rows and does not throw; the other groups are answered", async () => {
    const rows = [...nameless(2, ANN, "a"), ...nameless(2, BOB, "b")];
    tagAll(rows);
    failing.set(BOB, 500);
    const got = await fetchMainTagsForRows(qc, rows);
    expect([...got.keys()].sort()).toEqual(rows.slice(0, 2).map((r) => r.entityUri!).sort());
  });

  it("a platform without the tag routes gives no tags and does not throw", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "Route POST:/base/tag/masters not found" }), { status: 404 }));
    expect((await fetchMainTagsForRows(qc, nameless(3))).size).toBe(0);
  });

  it("answers nothing, and asks nothing, for no rows or for rows that are named", async () => {
    expect((await fetchMainTagsForRows(qc, [])).size).toBe(0);
    expect((await fetchMainTagsForRows(qc, [{ entityUri: e(ANN, "n"), facts: { name: "Ann" } }])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("the writer's contract: invalidating the two heads makes every reader read again", () => {
  it("['main-tag'] refreshes useMainTag, and a new main tag shows", async () => {
    const uri = e(ANN, "rec1");
    tags.set(uri, { tag: "alpha", known: true });
    const { result } = renderHook(() => useMainTag(uri), { wrapper: wrap });
    await waitFor(() => expect(result.current.data?.tag).toBe("alpha"));
    tags.set(uri, { tag: "beta", known: true });
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["main-tag", uri] });
    });
    await waitFor(() => expect(result.current.data?.tag).toBe("beta"));
    expect(calls).toHaveLength(2);
  });

  it("the head ['main-tag'] alone reaches every record's entry", async () => {
    const [a, b] = [e(ANN, "a"), e(ANN, "b")];
    tags.set(a, { tag: "a1", known: true });
    tags.set(b, { tag: "b1", known: true });
    const ha = renderHook(() => useMainTag(a), { wrapper: wrap });
    const hb = renderHook(() => useMainTag(b), { wrapper: wrap });
    await waitFor(() => expect(ha.result.current.data?.tag).toBe("a1"));
    await waitFor(() => expect(hb.result.current.data?.tag).toBe("b1"));
    tags.set(a, { tag: "a2", known: true });
    tags.set(b, { tag: "b2", known: true });
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["main-tag"] });
    });
    await waitFor(() => expect(ha.result.current.data?.tag).toBe("a2"));
    await waitFor(() => expect(hb.result.current.data?.tag).toBe("b2"));
  });

  it("['main-tags'] refreshes useMainTags and useMainTagsForRows", async () => {
    const rows = nameless(3);
    tagAll(rows);
    const uris = rows.map((r) => r.entityUri!);
    const list = renderHook(() => useMainTags(uris), { wrapper: wrap });
    const forRows = renderHook(() => useMainTagsForRows(rows), { wrapper: wrap });
    await waitFor(() => expect(list.result.current.tags.get(uris[0]!)?.tag).toBe("tag-r0"));
    await waitFor(() => expect(forRows.result.current.get(uris[0]!)).toBe("tag-r0"));
    expect(calls).toHaveLength(1);
    tags.set(uris[0]!, { tag: "renamed", known: true });
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["main-tags"] });
    });
    await waitFor(() => expect(list.result.current.tags.get(uris[0]!)?.tag).toBe("renamed"));
    await waitFor(() => expect(forRows.result.current.get(uris[0]!)).toBe("renamed"));
    expect(calls).toHaveLength(2);
  });

  it("['main-tags'] makes fetchMainTagsForRows read again, where without it the cache answers", async () => {
    const rows = nameless(3);
    tagAll(rows);
    await fetchMainTagsForRows(qc, rows);
    await fetchMainTagsForRows(qc, rows);
    expect(calls).toHaveLength(1);
    tags.set(rows[0]!.entityUri!, { tag: "renamed", known: true });
    await qc.invalidateQueries({ queryKey: ["main-tags"] });
    const got = await fetchMainTagsForRows(qc, rows);
    expect(calls).toHaveLength(2);
    expect(got.get(rows[0]!.entityUri!)).toBe("renamed");
  });

  it("a different head does not: ['main-tag'] leaves the batch entries alone", async () => {
    const rows = nameless(3);
    tagAll(rows);
    await fetchMainTagsForRows(qc, rows);
    await qc.invalidateQueries({ queryKey: ["main-tag"] });
    await fetchMainTagsForRows(qc, rows);
    expect(calls).toHaveLength(1);
  });
});
