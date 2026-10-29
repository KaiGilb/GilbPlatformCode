// @vitest-environment jsdom
// New. What the hook takes from the host: the provider is read first; `heldRecordOf` is called at the moment the doors ask for a found
// record (never a snapshot taken at render); `useRecordsBeingDeleted` is called on every render; `requestsSent` is read when a reader is
// made and when its identity changes. The doors are a stand-in that hands the hook's arguments back.
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const S = vi.hoisted(() => ({ got: [] as { host: unknown; a: Record<string, unknown> }[] }));
vi.mock("./listDoors", () => ({
  stakeholderListDeps: (host: unknown, a: Record<string, unknown>) => {
    S.got.push({ host, a });
    return a;
  },
}));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-reader", async (orig) => ({
  ...((await orig()) as object),
  createStakeholderListReader: () => ({ read: () => new Promise(() => undefined), more: () => undefined, refresh: () => undefined, names: async () => new Map() }),
}));
import { useStakeholderListReader, type StakeholderListReaderArgs } from "./useStakeholderListReader";
import { StakeholderListDoorsHostContext } from "./doorsHost";
import { fakeDoorsHost } from "../test/support";

const args = (over: Partial<StakeholderListReaderArgs> = {}): StakeholderListReaderArgs => ({ holder: "https://a.example.test", vaults: ["https://a.example.test/vault"], ownVaultId: "https://a.example.test/vault", typeNames: ["Person"], ownCardIds: [], ...over });

function mount(host: ReturnType<typeof fakeDoorsHost>, qc = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StakeholderListDoorsHostContext.Provider value={host}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </StakeholderListDoorsHostContext.Provider>
  );
  return { qc, wrapper };
}

describe("useStakeholderListReader takes its host from the provider", () => {
  it("hands the doors the host and the query client it read", () => {
    S.got.length = 0;
    const host = fakeDoorsHost();
    const { qc, wrapper } = mount(host);
    renderHook(() => useStakeholderListReader(args()), { wrapper });
    expect(S.got).toHaveLength(1);
    expect(S.got[0]!.host).toBe(host);
    expect(S.got[0]!.a.qc).toBe(qc);
  });
  it("calls the host's heldRecordOf when the doors ask, with the query client, the id and the address", () => {
    S.got.length = 0;
    const calls: unknown[][] = [];
    let answer: unknown = null;
    const host = fakeDoorsHost({ heldRecordOf: ((...a: unknown[]) => (calls.push(a), answer)) as never });
    const { qc, wrapper } = mount(host);
    renderHook(() => useStakeholderListReader(args()), { wrapper });
    const held = S.got[0]!.a.held as (id: string, uri: string) => unknown;
    expect(calls).toHaveLength(0);
    expect(held("r1", "https://a.example.test/base/e/r1")).toBeNull();
    answer = { id: "r1" };
    expect(held("r2", "u2")).toEqual({ id: "r1" });
    expect(calls).toEqual([[qc, "r1", "https://a.example.test/base/e/r1"], [qc, "r2", "u2"]]);
  });
  it("calls the host's hook on every render and reads the request count when a reader is made", () => {
    S.got.length = 0;
    const useDeleted = vi.fn(() => new Set<string>());
    const sent = vi.fn(() => 3);
    const host = fakeDoorsHost({ useRecordsBeingDeleted: useDeleted, requestsSent: sent });
    const { wrapper } = mount(host);
    const { rerender } = renderHook((p: { a: StakeholderListReaderArgs }) => useStakeholderListReader(p.a), { wrapper, initialProps: { a: args() } });
    const afterFirst = useDeleted.mock.calls.length;
    expect(afterFirst).toBeGreaterThanOrEqual(1);
    expect(S.got[0]!.a.screenStartedAt).toBe(3);
    rerender({ a: args() });
    expect(useDeleted.mock.calls.length).toBeGreaterThan(afterFirst);
    expect(S.got).toHaveLength(1);
  });
  it("does not read the host's request count while there is nothing to read, and passes the screen's functions only when given", () => {
    S.got.length = 0;
    const host = fakeDoorsHost();
    const { wrapper } = mount(host);
    renderHook(() => useStakeholderListReader(args()), { wrapper });
    expect("screenPages" in S.got[0]!.a).toBe(false);
    expect("screenLinks" in S.got[0]!.a).toBe(false);
    S.got.length = 0;
    renderHook(() => useStakeholderListReader(args({ screenPages: () => null, screenLinks: () => null })), { wrapper });
    expect(typeof S.got[0]!.a.screenPages).toBe("function");
    expect(typeof S.got[0]!.a.screenLinks).toBe("function");
  });
});
