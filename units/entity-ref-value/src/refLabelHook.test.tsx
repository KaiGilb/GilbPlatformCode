// The host hook of the README, run for real: the rules of the source's own label hook, with the host's
// loaded-records list and record read replaced by fakes, and the main tag read through the `main-tag` unit
// over a fake tag platform (a fake `fetch`, a fake signing session; no network).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth, type LwsAuthHost } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { needsMainTag, useMainTag } from "@kaigilb/gilbplatformcode-main-tag";
import { EntityRefValue, RefLabelContext, refDisplayName } from "./index";
import type { UseRefLabel } from "./index";

type Row = { id: string; entityUri?: string; facts: Record<string, string> };
let listed: Row[] | undefined;
const readRecord = vi.fn<(id: string, uri: string) => Promise<Row>>();
const useRecords = (_vaultId: string) => ({ data: listed });
const originOf = (uri: string | null) => (uri ? new URL(uri).origin : "");

// ---- as in the README ----
const useRefLabel: UseRefLabel = (ref, vaultId) => {
  const list = useRecords(vaultId);
  const fromList = ref ? (list.data ?? []).find((r) => r.id === ref.id || r.entityUri === ref.uri) : undefined;
  const cached = fromList ? refDisplayName(fromList.facts, fromList.entityUri) : null;

  const q = useQuery({
    queryKey: ["base", "record", ref?.id ?? "", originOf(ref?.uri ?? null)],
    queryFn: () => readRecord(ref!.id, ref!.uri),
    enabled: !!ref && !cached,
    staleTime: 30_000,
  });

  // A record with no label, name or `unitTag`/`tag` is named by its MAIN tag (the same cache entry the Tags section changes).
  // Only such a record asks; a named one costs no request.
  const facts = fromList?.facts ?? q.data?.facts;
  const main = useMainTag(ref && facts && needsMainTag(facts) ? ref.uri : null);
  const mainTag = main.data?.known ? main.data.tag : null;

  if (fromList) return refDisplayName(fromList.facts, fromList.entityUri, mainTag);
  if (q.isPending) return null;
  if (q.data) return refDisplayName(q.data.facts, q.data.entityUri || ref?.uri, mainTag);
  return ref ? refDisplayName(null, ref.uri) : null;
};
// ---- end ----

const REF = "https://geo.example.test/base/e/osm-r-59470";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (c: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={c}>
    <RefLabelContext.Provider value={useRefLabel}>{children}</RefLabelContext.Provider>
  </QueryClientProvider>
);

// A fake tag platform: it answers POST /base/tag/masters with the main tags in `mains`, and counts the calls.
const mains = new Map<string, string>();
let masterCalls: string[][];
function fakeAuth() {
  return {
    bearerHeaderFor: vi.fn(async (_url: string, _method?: string) => ({ authorization: "DPoP t-bearer", dpop: "p-bearer" })),
    dpopReadAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP t-read", dpop: "p-read" })),
    dpopWriteAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP t-write", dpop: "p-write" })),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: vi.fn(async () => ({ principal: "https://geo.example.test/base/p/ann", vault: null, vaults: [] })), invalidate: vi.fn() },
  } satisfies LwsAuthHost;
}

beforeEach(() => {
  listed = undefined;
  readRecord.mockReset();
  mains.clear();
  masterCalls = [];
  setBaseOrigin("https://geo.example.test");
  setSystemVaultHosts(["veda.geo.example.test"]);
  setLwsAuth(fakeAuth());
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).endsWith("/base/tag/masters")) return new Response("{}", { status: 404 });
    const body = JSON.parse(String(init?.body)) as { targetEntities: string[] };
    masterCalls.push(body.targetEntities);
    return Response.json({
      masterTags: body.targetEntities.map((t) =>
        mains.has(t) ? { targetEntity: t, tagString: mains.get(t), tagKnown: true } : { targetEntity: t, tagString: null, tagKnown: false, tagUnknownReason: "none" },
      ),
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
});

describe("the README host hook", () => {
  it("a hit in the loaded list wins, by id or by address, and nothing is read", async () => {
    listed = [{ id: "osm-r-59470", entityUri: REF, facts: { label: "Paraguay" } }];
    const view = render(<EntityRefValue value={REF} vaultId="v1" />, { wrapper: wrap(client()) });
    expect(view.container.textContent).toContain("Paraguay");
    cleanup();
    listed = [{ id: "other-id", entityUri: REF, facts: { unitTag: "Geo.Paraguay" } }];
    render(<EntityRefValue value={REF} vaultId="v1" />, { wrapper: wrap(client()) });
    expect(screen.getAllByText("Geo.Paraguay")).toHaveLength(1);
    expect(readRecord).not.toHaveBeenCalled();
  });

  it("a list hit with no name is named by its own address, not read", () => {
    listed = [{ id: "osm-r-59470", entityUri: REF, facts: {} }];
    render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(client()) });
    expect(screen.getByText("osm-r-59470")).toBeTruthy();
    expect(readRecord).not.toHaveBeenCalled();
  });

  it("not in the list: … while the read is pending, then the name from the read", async () => {
    let release: (r: Row) => void = () => {};
    readRecord.mockReturnValue(new Promise<Row>((r) => (release = r)));
    render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(client()) });
    expect(screen.getByText("…")).toBeTruthy();
    release({ id: "osm-r-59470", entityUri: REF, facts: { title: "Paraguay" } });
    expect(await screen.findByText("Paraguay")).toBeTruthy();
    expect(readRecord).toHaveBeenCalledTimes(1);
    expect(readRecord).toHaveBeenCalledWith("osm-r-59470", REF);
  });

  it("a read with no facts is named by the read's address, or the link's own when the read has none", async () => {
    readRecord.mockResolvedValue({ id: "osm-r-59470", entityUri: "https://geo.example.test/base/e/served-id", facts: {} });
    render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(client()) });
    expect(await screen.findByText("served-id")).toBeTruthy();
    cleanup();
    readRecord.mockResolvedValue({ id: "x", entityUri: "", facts: {} });
    render(<EntityRefValue value={`${REF}-b`} vaultId="v1" quiet />, { wrapper: wrap(client()) });
    expect(await screen.findByText("osm-r-59470-b")).toBeTruthy();
  });

  it("a failed read is named by the link's own address, never Untitled", async () => {
    readRecord.mockRejectedValue(new Error("403"));
    render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(client()) });
    expect(await screen.findByText("osm-r-59470")).toBeTruthy();
    expect(screen.queryByText("Untitled")).toBeNull();
  });

  it("the read is kept for 30 s: a second card for the same record does not read again", async () => {
    readRecord.mockResolvedValue({ id: "osm-r-59470", entityUri: REF, facts: { name: "Paraguay" } });
    const c = client();
    const first = render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(c) });
    await screen.findByText("Paraguay");
    first.unmount();
    render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(c) });
    await waitFor(() => expect(screen.getByText("Paraguay")).toBeTruthy());
    expect(readRecord).toHaveBeenCalledTimes(1);
    expect(c.getQueryData(["base", "record", "osm-r-59470", "https://geo.example.test"])).toBeTruthy();
  });

  it("text that is not a reference reads nothing", () => {
    render(<EntityRefValue value="Paris" vaultId="v1" />, { wrapper: wrap(client()) });
    expect(readRecord).not.toHaveBeenCalled();
    expect(screen.getByText("Paris")).toBeTruthy();
  });

  it("a list hit with no name, label, unitTag or tag is named by its MAIN tag, from ONE masters call; the address shows until it answers", async () => {
    mains.set(REF, "platform-tag");
    listed = [{ id: "osm-r-59470", entityUri: REF, facts: {} }];
    render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(client()) });
    expect(screen.getByText("osm-r-59470")).toBeTruthy();
    expect(await screen.findByText("platform-tag")).toBeTruthy();
    expect(masterCalls).toEqual([[REF]]);
    expect(readRecord).not.toHaveBeenCalled();
  });

  it("a list hit that holds a name, a label, a unitTag or a tag asks the platform nothing, and its own name wins over the main tag", async () => {
    mains.set(REF, "platform-tag");
    for (const facts of [{ name: "Ann" }, { label: "Ann" }, { unitTag: "PT-1" }, { tag: "t1" }] as Record<string, string>[]) {
      listed = [{ id: "osm-r-59470", entityUri: REF, facts }];
      const view = render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(client()) });
      expect(view.container.textContent).toBe(Object.values(facts)[0]!);
      view.unmount();
    }
    expect(masterCalls).toEqual([]);
  });

  it("a record with a unitTag keeps it, although its main tag differs", async () => {
    mains.set(REF, "somethingelse");
    listed = [{ id: "osm-r-59470", entityUri: REF, facts: { unitTag: "PT-1" } }];
    const view = render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(client()) });
    expect(view.container.textContent).toBe("PT-1");
    expect(masterCalls).toEqual([]);
  });

  it("a record that is not listed and, once read, holds no name is named by its main tag", async () => {
    mains.set(REF, "platform-tag");
    readRecord.mockResolvedValue({ id: "osm-r-59470", entityUri: REF, facts: {} });
    render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(client()) });
    expect(await screen.findByText("platform-tag")).toBeTruthy();
    expect(readRecord).toHaveBeenCalledTimes(1);
    expect(masterCalls).toEqual([[REF]]);
  });

  it("a main tag the platform does not state leaves the name as it was", async () => {
    listed = [{ id: "osm-r-59470", entityUri: REF, facts: {} }];
    render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(client()) });
    await waitFor(() => expect(masterCalls).toHaveLength(1));
    expect(screen.getByText("osm-r-59470")).toBeTruthy();
  });

  it("a record read that fails is named by the link's address and asks for no main tag", async () => {
    readRecord.mockRejectedValue(new Error("403"));
    render(<EntityRefValue value={REF} vaultId="v1" quiet />, { wrapper: wrap(client()) });
    expect(await screen.findByText("osm-r-59470")).toBeTruthy();
    expect(masterCalls).toEqual([]);
  });

  it("a value that is not a reference asks no main tag", () => {
    render(<EntityRefValue value="Paris" vaultId="v1" />, { wrapper: wrap(client()) });
    expect(masterCalls).toEqual([]);
  });
});
