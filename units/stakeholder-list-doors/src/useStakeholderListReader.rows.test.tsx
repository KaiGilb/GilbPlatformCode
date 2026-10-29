// @vitest-environment jsdom
// New. What the hook does with the list the reader draws: an older reader never draws over a newer one's list; the rows of records being
// deleted or ended are taken out (a linked person's row whose only record is gone becomes the placed person, one with more records and the
// holder's own row stay); a new reader is made when the screen's pages are given. The reader is a stand-in that hands out its `onRows`.
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const S = vi.hoisted(() => ({ onRows: [] as Array<(l: unknown) => void>, made: 0 }));
vi.mock("./listDoors", () => ({
  stakeholderListDeps: (_host: unknown, a: unknown) => {
    S.made += 1;
    return a;
  },
}));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-reader", async (orig) => ({
  ...((await orig()) as object),
  createStakeholderListReader: (_deps: unknown, opts: { onRows: (l: unknown) => void }) => {
    S.onRows.push(opts.onRows);
    return { read: () => new Promise(() => undefined), more: () => undefined, refresh: () => undefined, names: async () => new Map() };
  },
}));
import { useStakeholderListReader, type StakeholderListReaderArgs } from "./useStakeholderListReader";
import { StakeholderListDoorsHostContext } from "./doorsHost";
import { fakeDoorsHost } from "../test/support";

const args = (holder: string, over: Partial<StakeholderListReaderArgs> = {}): StakeholderListReaderArgs => ({ holder, vaults: [`${holder}/vault`], ownVaultId: `${holder}/vault`, typeNames: ["Person"], ownCardIds: [], ...over });
const mount = (gone: ReadonlySet<string> = new Set()) => {
  const host = fakeDoorsHost({ useRecordsBeingDeleted: () => gone });
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StakeholderListDoorsHostContext.Provider value={host}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </StakeholderListDoorsHostContext.Provider>
  );
  return wrapper;
};
const rec = (n: number) => `https://a.example.test/vault/e/r${n}`;
const row = (key: string, kind: string, n: number | null, also = 0) => ({ key, kind, recordId: n === null ? null : rec(n), vaultId: "v", title: key, recordType: "t", linking: true, alsoRecords: also });
const keys = (l: { rows: { key: string }[] } | null) => (l ? l.rows.map((r) => r.key) : null);

describe("the list the hook draws", () => {
  it("an older reader's rows never draw over a newer reader's list", () => {
    S.onRows.length = 0;
    const { result, rerender } = renderHook((p: { a: StakeholderListReaderArgs }) => useStakeholderListReader(p.a), { wrapper: mount(), initialProps: { a: args("https://a.example.test") } });
    rerender({ a: args("https://b.example.test") });
    expect(S.onRows).toHaveLength(2);
    act(() => S.onRows[1]!({ rows: [{ key: "b1" }] }));
    expect(keys(result.current.list as never)).toEqual(["b1"]);
    act(() => S.onRows[0]!({ rows: [{ key: "a1" }] }));
    expect(keys(result.current.list as never)).toEqual(["b1"]);
  });

  it("a deleted record's row goes; a linked person with no other record becomes the placed person; with another record, or the holder's own row, it stays", () => {
    S.onRows.length = 0;
    const { result } = renderHook(() => useStakeholderListReader(args("https://a.example.test")), { wrapper: mount(new Set(["r1", "r2", "r3"])) });
    act(() =>
      S.onRows[0]!({ rows: [row("rec", "record", 1), row("both0", "both", 2, 0), row("both1", "both", 3, 1), row("me", "self", 1), row("other", "record", 9)] }),
    );
    const rows = (result.current.list as unknown as { rows: Record<string, unknown>[] }).rows;
    expect(rows.map((r) => r.key)).toEqual(["both0", "both1", "me", "other"]);
    expect(rows[0]).toMatchObject({ kind: "placed", recordId: null, vaultId: null, title: null, recordType: null, linking: false });
    expect(rows[1]).toMatchObject({ kind: "both", recordId: rec(3) });
    expect(rows[2]).toMatchObject({ kind: "self", recordId: rec(1) });
  });

  it("with nothing gone the list is the reader's own, unchanged", () => {
    S.onRows.length = 0;
    const { result } = renderHook(() => useStakeholderListReader(args("https://a.example.test")), { wrapper: mount() });
    const list = { rows: [row("rec", "record", 1)] };
    act(() => S.onRows[0]!(list));
    expect(result.current.list).toBe(list);
  });

  it("a new reader is made when the screen's pages are given, and again when its links are", () => {
    S.made = 0;
    const { rerender } = renderHook((p: { a: StakeholderListReaderArgs }) => useStakeholderListReader(p.a), { wrapper: mount(), initialProps: { a: args("https://a.example.test") } });
    expect(S.made).toBe(1);
    rerender({ a: args("https://a.example.test") });
    expect(S.made).toBe(1);
    rerender({ a: args("https://a.example.test", { screenPages: () => null }) });
    expect(S.made).toBe(2);
    rerender({ a: args("https://a.example.test", { screenPages: () => null, screenLinks: () => null }) });
    expect(S.made).toBe(3);
  });
});
