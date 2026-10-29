// `usePersonCard` reads nothing for a record that is not linked, and nothing until it has its controller, its record, its holder and the
// holder's own vault; the resolver is asked once for a card open, with the card's own link, holder and vault, and its answer is what the hook gives.
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const resolve = vi.hoisted(() => vi.fn(async (_qc: unknown, a: { link: unknown }) => ({ party: "p", how: "sameAs", placements: [], link: a.link, anchor: { kind: "person", principal: "p" }, connections: "read" })));
const share = vi.hoisted(() => ({ answer: null }));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-doors", () => ({ anchorShareOf: () => share, resolveRecordPersonCard: resolve }));
import { usePersonCard } from "./usePersonCard";

const TARGET = "https://ann.example.test/vault";
const RECORD = "https://holder.example.test/vault/e/r1";
const HOLDER = "https://holder.example.test/base";
const OWN = "https://holder.example.test/vault";

const controller = (link: unknown = { state: "linked", target: TARGET }) => {
  const state = { link };
  return { getState: () => state as never, subscribe: () => () => undefined, load: async () => undefined };
};
const run = (args: Parameters<typeof usePersonCard>[0]) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, ...renderHook(() => usePersonCard(args), { wrapper }) };
};
const turn = () => new Promise<void>((r) => setTimeout(r, 0));

describe("usePersonCard", () => {
  it("asks the resolver once with the card's record, link, holder, own vault and share, and gives its answer", async () => {
    resolve.mockClear();
    const c = controller();
    const { result } = run({ controller: c as never, recordUri: RECORD, holder: HOLDER, ownVaultId: OWN });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(resolve).toHaveBeenCalledTimes(1);
    const [, a] = resolve.mock.calls[0]! as unknown as [unknown, Record<string, unknown>];
    expect(a).toEqual({ recordUri: RECORD, link: { state: "linked", target: TARGET }, holder: HOLDER, ownVaultId: OWN, share });
    expect(result.current!.party).toBe("p");
  });

  it("keeps the answer under the key person-card / record / holder / own vault / record / target, asked fresh each card open", async () => {
    const { qc, result } = run({ controller: controller() as never, recordUri: RECORD, holder: HOLDER, ownVaultId: OWN });
    await waitFor(() => expect(result.current).not.toBeNull());
    const q = qc.getQueryCache().find({ queryKey: ["person-card", "record", HOLDER, OWN, RECORD, TARGET] });
    expect(q).toBeDefined();
    const o = q!.options as { staleTime?: number; gcTime?: number; retry?: unknown; refetchOnWindowFocus?: unknown };
    expect([o.staleTime, o.gcTime, o.retry, o.refetchOnWindowFocus]).toEqual([0, 0, false, false]);
  });

  it.each([
    ["no controller", { controller: null, recordUri: RECORD, holder: HOLDER, ownVaultId: OWN }],
    ["no record", { controller: controller() as never, recordUri: null, holder: HOLDER, ownVaultId: OWN }],
    ["no holder", { controller: controller() as never, recordUri: RECORD, holder: null, ownVaultId: OWN }],
    ["no own vault", { controller: controller() as never, recordUri: RECORD, holder: HOLDER, ownVaultId: null }],
    ["a record that is not linked", { controller: controller({ state: "none" }) as never, recordUri: RECORD, holder: HOLDER, ownVaultId: OWN }],
    ["a record with two links", { controller: controller({ state: "ambiguous" }) as never, recordUri: RECORD, holder: HOLDER, ownVaultId: OWN }],
  ])("%s: reads nothing and answers null", async (_n, args) => {
    resolve.mockClear();
    const { result } = run(args);
    await turn();
    await turn();
    expect(resolve).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
