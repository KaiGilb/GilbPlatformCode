// A linked card's My Note / Where-we-met key is `personCard.party`; while it is null the notes are not read and not drawn. The card's
// "Try again" (`controller.load(true)`) re-asks the online-card resolver. So after Try again recovers, the person card the notes key from
// must name the person, without reopening the card.
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const GEIR = "https://ann.example.test/base/p/3f2b6c1e-1111-4a2b-9c3d-000000000001";
const RECORD = "https://holder.example.test/base/e/06geir0000000000000000000";
const answers = vi.hoisted(() => ({ calls: 0, failFirst: true }));

vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-doors", () => ({
  anchorShareOf: () => null,
  resolveRecordPersonCard: async (_qc: unknown, a: { link: unknown }) => {
    answers.calls += 1;
    const failed = answers.failFirst && answers.calls === 1;
    return failed
      ? { party: null, how: "none", placements: [], link: a.link, anchor: { kind: "unavailable", status: 0 }, connections: "not-read" }
      : { party: GEIR, how: "sameAs", placements: [], link: a.link, anchor: { kind: "person", principal: GEIR }, connections: "read" };
  },
}));

import { usePersonCard } from "./usePersonCard";

/** A card controller as the card uses it: a stable linked link; `load(true)` (Try again) re-resolves and tells its listeners. */
function fakeController() {
  const link = { state: "linked", target: GEIR } as const;
  let state = { link, anchor: "unavailable" as string };
  const ls = new Set<() => void>();
  return {
    getState: () => state as never,
    subscribe: (l: () => void) => (ls.add(l), () => ls.delete(l)),
    load: async () => { state = { ...state, anchor: "person" }; ls.forEach((l) => l()); },
  };
}

describe("usePersonCard after the card's Try again", () => {
  // When the lookup recovers, the shared note appears (its key, the person, is known again).
  it("names the person once Try again has recovered the lookup, without reopening the card", async () => {
    answers.calls = 0;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const controller = fakeController();
    const { result } = renderHook(() => usePersonCard({ controller: controller as never, recordUri: RECORD, holder: "https://holder.example.test/base", ownVaultId: "https://holder.example.test/base" }), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current!.party).toBeNull(); // the lookup failed first
    await act(async () => { await controller.load(); });
    await waitFor(() => expect(result.current?.party).toBe(GEIR), { timeout: 1500 });
  });

  it("known answer: a lookup that answers at once names the person", async () => {
    answers.calls = 0; answers.failFirst = false;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => usePersonCard({ controller: fakeController() as never, recordUri: RECORD, holder: "https://holder.example.test/base", ownVaultId: "https://holder.example.test/base" }), { wrapper });
    await waitFor(() => expect(result.current?.party).toBe(GEIR));
    answers.failFirst = true;
  });
});
