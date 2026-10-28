// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planFindKey, usePlanFind, type PlanFind } from "./planFind";
import { setUp, tearDown } from "../test/support";
import { entityUri, VAULT } from "../test/rows";

const fetchMock = vi.fn();
let findCalls = 0;
let recordCalls = 0;
let findStatus = 200;

beforeEach(() => {
  findCalls = 0;
  recordCalls = 0;
  findStatus = 200;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/base/find-by-attribute")) {
      findCalls += 1;
      if (findStatus !== 200) return new Response("no", { status: findStatus });
      return Response.json({ count: 2, ids: [entityUri("a"), entityUri("b")] });
    }
    recordCalls += 1;
    const id = /\/lws\/r\/([^?#]+)/.exec(url)![1]!;
    return new Response(JSON.stringify({ "@id": entityUri(id), "@type": "t:SpecificationElement", "a:body": `text ${id}` }), { status: 200, headers: { "content-type": "application/json", etag: '"e1"' } });
  });
  vi.stubGlobal("fetch", fetchMock);
  setUp();
});
afterEach(() => {
  tearDown();
  vi.unstubAllGlobals();
});

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const client = () => new QueryClient({ defaultOptions: { queries: { retry: 3 } } });

describe("usePlanFind", () => {
  it("reads the line's members under the find key and answers the rows", async () => {
    const qc = client();
    const { result } = renderHook(() => usePlanFind(VAULT, "a:partOf", { id: "parent", entityUri: entityUri("parent") }), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(qc.getQueryData<PlanFind>(planFindKey(VAULT, "a:partOf", "parent"))).toBe(result.current.data);
  });
  it("asks nothing without a vault, a parent, or the parent's address", async () => {
    const qc = client();
    const a = renderHook(() => usePlanFind("", "a:partOf", { id: "parent", entityUri: entityUri("parent") }), { wrapper: wrapperFor(qc) });
    const b = renderHook(() => usePlanFind(VAULT, "a:partOf", null), { wrapper: wrapperFor(qc) });
    const c = renderHook(() => usePlanFind(VAULT, "a:partOf", { id: "parent" }), { wrapper: wrapperFor(qc) });
    await new Promise((r) => setTimeout(r, 30));
    expect(findCalls).toBe(0);
    for (const h of [a, b, c]) expect(h.result.current.fetchStatus).toBe("idle");
  });
  it("does not retry a failed find, and keeps a read for 15 seconds", async () => {
    const qc = client();
    findStatus = 500;
    const failed = renderHook(() => usePlanFind(VAULT, "a:partOf", { id: "parent", entityUri: entityUri("parent") }), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
    expect(findCalls).toBe(1);
    findStatus = 200;
    const qc2 = client();
    const first = renderHook(() => usePlanFind(VAULT, "a:partOf", { id: "parent", entityUri: entityUri("parent") }), { wrapper: wrapperFor(qc2) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const before = findCalls;
    const second = renderHook(() => usePlanFind(VAULT, "a:partOf", { id: "parent", entityUri: entityUri("parent") }), { wrapper: wrapperFor(qc2) });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(findCalls).toBe(before);
    expect(qc2.getQueryState(planFindKey(VAULT, "a:partOf", "parent"))?.dataUpdatedAt).toBeGreaterThan(0);
  });
  it("a cap given to the hook is the cap of the find", async () => {
    const qc = client();
    const { result } = renderHook(() => usePlanFind(VAULT, "a:partOf", { id: "parent", entityUri: entityUri("parent") }, 7), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.cap).toBe(7);
  });
});
