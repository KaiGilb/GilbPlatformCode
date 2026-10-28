// The host hook of the README, run for real: the rules of the source's own label hook, with the host's
// loaded-records list and record read replaced by fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
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

  if (cached) return cached;
  if (q.isPending) return null;
  if (q.data) return refDisplayName(q.data.facts, q.data.entityUri || ref?.uri);
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

beforeEach(() => {
  listed = undefined;
  readRecord.mockReset();
});
afterEach(cleanup);

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
});
