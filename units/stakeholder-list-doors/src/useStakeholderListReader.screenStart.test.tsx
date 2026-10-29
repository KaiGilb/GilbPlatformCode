// @vitest-environment jsdom
// Each reader counts its requests from its own screen's start. The first reader's screen counts from the list's first render; a later
// reader (a holder switch) from when it is made, so its up-front read gets only what ITS screen has left of 40. The meter and the reader
// are stand-ins that record the screen's start each reader is made with; the hook is REAL.
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const S = vi.hoisted(() => ({ sent: 0, starts: [] as { holder: string; at: number | undefined }[] }));
vi.mock("./listDoors", () => ({
  stakeholderListDeps: (_host: unknown, a: { holder: string; screenStartedAt?: number }) => {
    S.starts.push({ holder: a.holder, at: a.screenStartedAt });
    return a;
  },
}));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-reader", async (orig) => ({
  ...((await orig()) as object),
  createStakeholderListReader: () => ({
    read: () => new Promise(() => undefined),
    more: () => undefined,
    refresh: () => undefined,
    names: async () => new Map(),
  }),
}));
import { useStakeholderListReader, type StakeholderListReaderArgs } from "./useStakeholderListReader";
import { StakeholderListDoorsHostContext } from "./doorsHost";
import { fakeDoorsHost } from "../test/support";

const client = new QueryClient();
const host = fakeDoorsHost({ requestsSent: () => S.sent });
const wrapper = ({ children }: { children: ReactNode }) => (
  <StakeholderListDoorsHostContext.Provider value={host}>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  </StakeholderListDoorsHostContext.Provider>
);
const args = (holder: string): StakeholderListReaderArgs => ({ holder, vaults: [`${holder}/vault`], ownVaultId: `${holder}/vault`, typeNames: ["Person"], ownCardIds: [] });

describe("each reader counts from its own screen's start", () => {
  it("the first reader from the list's first render; after a holder switch, from the switch; back to the first: from that switch", () => {
    S.sent = 5;
    S.starts.length = 0;
    // The list opens before the kinds are read: nothing is read yet, but the screen has started.
    const { rerender } = renderHook((p: { a: StakeholderListReaderArgs | null }) => useStakeholderListReader(p.a), { wrapper, initialProps: { a: null as StakeholderListReaderArgs | null } });
    S.sent = 9; // the kinds and the own card were read
    rerender({ a: args("https://a.example.test") });
    S.sent = 30; // A's screen read its rows
    rerender({ a: args("https://a.example.test") }); // the same reader: not made again
    rerender({ a: args("https://b.example.test") }); // the holder switch
    S.sent = 44;
    rerender({ a: args("https://a.example.test") }); // and back
    const made = S.starts.filter((s, i, all) => i === 0 || s.holder !== all[i - 1]!.holder);
    expect(made).toEqual([
      { holder: "https://a.example.test", at: 5 },
      { holder: "https://b.example.test", at: 30 },
      { holder: "https://a.example.test", at: 44 },
    ]);
  });
});
