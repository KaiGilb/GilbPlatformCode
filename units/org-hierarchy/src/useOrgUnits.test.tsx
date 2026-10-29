// The units read as the hook returns it: first page of 10, the later pages by the cursor, de-duplicated by record, the total never below the rows,
// and the words of the count. The reader is replaced by what one viewer's read returned.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import "../test/origins";

const unitsPage = vi.hoisted(() => vi.fn());
vi.mock("./orgUnits", () => ({ readOrgUnitsPage: unitsPage, readUnitEmployments: vi.fn(), UNITS_PAGE: 50 }));

// eslint-disable-next-line import/first
import { useOrgUnits } from "./useOrgUnits";

const VAULT = "https://v.example.test/base";
const e = (id: string) => `${VAULT}/e/${id}`;
const unit = (id: string) => ({ uri: e(id), id, name: id, logo: null });
const page = (over: Record<string, unknown>) => ({ units: [], total: 0, counts: [0, 0], nextOffset: null, notListed: 0, ...over });

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useOrgUnits(e("hq"), VAULT), { wrapper });
}
beforeEach(() => unitsPage.mockReset());
afterEach(() => cleanup());

describe("useOrgUnits", () => {
  it("asks the first page for 10 units, with the organization and the vault, and no counts", async () => {
    unitsPage.mockResolvedValue(page({ units: [unit("u1")], total: 1 }));
    const { result } = mount();
    await waitFor(() => expect(result.current.q.isSuccess).toBe(true));
    expect(unitsPage).toHaveBeenCalledWith(e("hq"), VAULT, { offset: 0, limit: 10 });
  });
  it("the total is never below the rows shown, and the group is shown when there are rows", async () => {
    unitsPage.mockResolvedValue(page({ units: [unit("u1"), unit("u2"), unit("u3")], total: 1, nextOffset: 10 }));
    const { result } = mount();
    await waitFor(() => expect(result.current.units).toHaveLength(3));
    expect(result.current.total).toBe(3);
    expect(result.current.shown).toBe(true);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.clickedThrough).toBe(false);
  });
  it("the total is the first page's when that is larger", async () => {
    unitsPage.mockResolvedValue(page({ units: [unit("u1")], total: 200, nextOffset: 10 }));
    const { result } = mount();
    await waitFor(() => expect(result.current.units).toHaveLength(1));
    expect(result.current.total).toBe(200);
    expect(result.current.count).toBe("1 unit shown of 200");
  });
  it("no row and nothing more: not shown, not clicked through", async () => {
    unitsPage.mockResolvedValue(page({}));
    const { result } = mount();
    await waitFor(() => expect(result.current.q.isSuccess).toBe(true));
    expect(result.current.shown).toBe(false);
    expect(result.current.clickedThrough).toBe(false);
    expect(result.current.total).toBe(0);
  });
  it("a first page nobody may read keeps the group while a later page exists; clicked through to the end with none readable it stays, and says so", async () => {
    unitsPage.mockImplementation(async (...a: unknown[]) => (((a[2] ?? {}) as { offset?: number }).offset ?? 0) === 0 ? page({ total: 120, nextOffset: 10, notListed: 10 }) : page({ total: 120, notListed: 10 }));
    const { result } = mount();
    await waitFor(() => expect(result.current.q.isSuccess).toBe(true));
    expect(result.current.shown).toBe(true);
    expect(result.current.clickedThrough).toBe(false);
    await act(async () => { await result.current.q.fetchNextPage(); });
    await waitFor(() => expect(result.current.clickedThrough).toBe(true));
    expect(result.current.shown).toBe(true);
    expect(result.current.hasMore).toBe(false);
  });
  it("the next page is asked with the cursor and the counts of the last, and a record read under both address spellings is one row", async () => {
    unitsPage.mockImplementation(async (...a: unknown[]) =>
      (((a[2] ?? {}) as { offset?: number }).offset ?? 0) === 0
        ? page({ units: [unit("u1")], total: 20, counts: [12, 8], nextOffset: 10 })
        : page({ units: [unit("u1"), { uri: "https://v.example.test/vault/e/u1", id: "u1", name: "u1", logo: null }, unit("u2")], total: 20, counts: [12, 8] }),
    );
    const { result } = mount();
    await waitFor(() => expect(result.current.units).toHaveLength(1));
    await act(async () => { await result.current.q.fetchNextPage(); });
    await waitFor(() => expect(unitsPage).toHaveBeenCalledTimes(2));
    expect(unitsPage).toHaveBeenLastCalledWith(e("hq"), VAULT, { offset: 10, counts: [12, 8] });
    await waitFor(() => expect(result.current.units.map((u) => u.id)).toEqual(["u1", "u2"]));
  });
});
