// The picker search names a hit that holds no name, label or `unitTag` by its MAIN tag: `searchPlanRecords` with a query client asks the platform's batch
// route (`POST <vault>/base/tag/masters`) through `main-tag`. A fake `fetch` stands for the platform; no network, no wait, a fresh client for each test.
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultRecordRef } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { searchPlanRecords } from "./planSearch";
import { setUp, tearDown } from "../test/support";
import { baseRow, entityUri, HOST, VAULT } from "../test/rows";

type Call = { url: string; method: string; body: { vault: string; targetEntities: string[] } };
let calls: Call[];
/** The main tag the platform states per record; a record not here is left out of the answer. */
let mains: Map<string, string>;
/** When set, the batch route answers this status instead of the tags. */
let failStatus: number | null;
let qc: QueryClient;

beforeEach(() => {
  setUp();
  calls = [];
  mains = new Map();
  failStatus = null;
  qc = new QueryClient();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    // The exact-tag find a typed text with no space also runs (with a client) finds nothing; only the batch route is counted.
    if (!String(input).endsWith("/base/tag/masters")) return Response.json({ count: 0, ids: [] });
    const body = JSON.parse(String(init?.body ?? "{}")) as Call["body"];
    calls.push({ url: String(input), method: String(init?.method), body });
    if (failStatus) return new Response(JSON.stringify({ error: "boom" }), { status: failStatus });
    return Response.json({
      masterTags: body.targetEntities.filter((t) => mains.has(t)).map((t) => ({ targetEntity: t, tagString: mains.get(t), tagKnown: true })),
    });
  });
});
afterEach(() => {
  tearDown();
  vi.unstubAllGlobals();
});

function ref(id: string, over: Partial<VaultRecordRef> = {}): VaultRecordRef {
  return { id, entityUri: entityUri(id), typeUri: "t:Value", updatedAt: 1, label: "", etag: '"e"', ...over } as VaultRecordRef;
}
const listOf = (...refs: VaultRecordRef[]) => vi.fn(async () => ({ records: refs, complete: true }));
const row = (id: string, facts: Record<string, string> = {}) => ({ ...baseRow(id, facts), typeUri: "t:Value" });

describe("searchPlanRecords names a nameless hit by its main tag (the empty box)", () => {
  it("one batch call for the nameless rows only; the hit's tag and label are the main tag; the list is sorted again by label then address", async () => {
    mains.set(entityUri("p"), "Zed");
    mains.set(entityUri("q"), "Abe");
    const out = await searchPlanRecords(VAULT, "", ["Value"], { qc, list: listOf(ref("p"), ref("a", { label: "Mid" }), ref("q")) as never });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(`${HOST}/base/tag/masters`);
    expect(calls[0]!.body).toEqual({ vault: `${HOST}/base`, targetEntities: [entityUri("p"), entityUri("q")] });
    expect(out.hits.map((h) => [h.id, h.label, h.tag])).toEqual([["q", "Abe", "Abe"], ["a", "Mid", ""], ["p", "Zed", "Zed"]]);
    expect(out.complete).toBe(true);
  });
  it("two hits with the same label after the tags are ordered by address", async () => {
    mains.set(entityUri("b"), "Same");
    const out = await searchPlanRecords(VAULT, "", ["Value"], { qc, list: listOf(ref("b"), ref("a", { label: "Same" })) as never });
    expect(out.hits.map((h) => [h.id, h.label])).toEqual([["a", "Same"], ["b", "Same"]]);
  });
  it("a hit that was answered keeps its row, uri, id and type; a hit left out of the answer keeps its tail-of-address name", async () => {
    mains.set(entityUri("p"), "Named");
    const out = await searchPlanRecords(VAULT, "", ["Value"], { qc, list: listOf(ref("p"), ref("q")) as never });
    const p = out.hits.find((h) => h.id === "p")!;
    expect([p.uri, p.typeName, p.row.id, p.label, p.tag]).toEqual([entityUri("p"), "Value", "p", "Named", "Named"]);
    const q = out.hits.find((h) => h.id === "q")!;
    expect([q.label, q.tag]).toEqual(["q", ""]);
  });
  it("a row with a label or a unitTag costs no request at all", async () => {
    const out = await searchPlanRecords(VAULT, "", ["Value"], { qc, list: listOf(ref("a", { label: "Alpha" })) as never });
    expect(calls).toHaveLength(0);
    expect(out.hits.map((h) => h.label)).toEqual(["Alpha"]);
  });
  it("a failed batch call leaves the hits exactly as they were (and the search does not throw)", async () => {
    mains.set(entityUri("p"), "Zed");
    const asBefore = await searchPlanRecords(VAULT, "", ["Value"], { list: listOf(ref("p"), ref("q")) as never });
    failStatus = 500;
    const out = await searchPlanRecords(VAULT, "", ["Value"], { qc, list: listOf(ref("p"), ref("q")) as never });
    expect(calls).toHaveLength(1);
    expect(out).toEqual(asBefore);
  });
  it("without a client nothing is asked", async () => {
    mains.set(entityUri("p"), "Zed");
    const out = await searchPlanRecords(VAULT, "", ["Value"], { list: listOf(ref("p")) as never });
    expect(calls).toHaveLength(0);
    expect(out.hits.map((h) => h.label)).toEqual(["p"]);
  });
  it("an empty list with a client asks nothing", async () => {
    const out = await searchPlanRecords(VAULT, "", ["Value"], { qc, list: listOf() as never });
    expect(calls).toHaveLength(0);
    expect(out.hits).toEqual([]);
  });
  it("a second search through the same client is answered from its cache (one call in all)", async () => {
    mains.set(entityUri("p"), "Zed");
    const list = listOf(ref("p"));
    await searchPlanRecords(VAULT, "", ["Value"], { qc, list: list as never });
    const again = await searchPlanRecords(VAULT, "", ["Value"], { qc, list: list as never });
    expect(calls).toHaveLength(1);
    expect(again.hits.map((h) => h.label)).toEqual(["Zed"]);
  });
});

describe("searchPlanRecords names a nameless hit by its main tag (typed text)", () => {
  const search = (ids: string[]) => (async () => ({ ids: ids.map((i) => entityUri(i)), next: null })) as never;
  const read = async (id: string) => row(id);

  it("the search hits are named by their main tags and sorted again", async () => {
    mains.set(entityUri("p"), "Zed");
    mains.set(entityUri("q"), "Abe");
    const out = await searchPlanRecords(VAULT, "sp", ["Value"], { qc, search: search(["p", "q"]), read });
    expect(calls).toHaveLength(1);
    expect(out.hits.map((h) => [h.id, h.label, h.tag])).toEqual([["q", "Abe", "Abe"], ["p", "Zed", "Zed"]]);
  });
  it("without a client nothing is asked", async () => {
    mains.set(entityUri("p"), "Zed");
    const out = await searchPlanRecords(VAULT, "sp", ["Value"], { search: search(["p"]), read });
    expect(calls).toHaveLength(0);
    expect(out.hits.map((h) => h.label)).toEqual(["p"]);
  });
  it("a failed batch call leaves the search hits as they were", async () => {
    const asBefore = await searchPlanRecords(VAULT, "sp", ["Value"], { search: search(["p", "q"]), read });
    failStatus = 503;
    const out = await searchPlanRecords(VAULT, "sp", ["Value"], { qc, search: search(["p", "q"]), read });
    expect(calls).toHaveLength(1);
    expect(out).toEqual(asBefore);
  });
  // Kept as the app has it: the hits are sorted again ONLY when at least one main tag was found, so the exact-tag hit that `mergeExactHit` put first keeps
  // its place when the platform states no tag, and loses it when one is stated.
  it("the exact-tag hit stays first while no main tag is found, and the list is sorted again as soon as one is", async () => {
    const findTag = async () => row("exact", { unitTag: "Zed.Tag" });
    const opts = { qc, findTag, search: search(["p", "q"]), read };
    const none = await searchPlanRecords(VAULT, "Zed.Tag", ["Value"], opts);
    expect(none.hits.map((h) => h.label)).toEqual(["Zed.Tag", "p", "q"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.targetEntities).toEqual([entityUri("p"), entityUri("q")]);

    mains.set(entityUri("p"), "Mmm");
    const some = await searchPlanRecords(VAULT, "Zed.Tag", ["Value"], { ...opts, qc: new QueryClient() });
    expect(some.hits.map((h) => h.label)).toEqual(["Mmm", "q", "Zed.Tag"]);
  });
});
