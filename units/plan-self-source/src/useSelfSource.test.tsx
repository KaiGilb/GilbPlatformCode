// @vitest-environment jsdom
// The person's own card as a source: the address of the own-card finding for the landing vault, or null while it is out, when there is no landing
// vault, when there is no card, and when the read failed. Null means: write the value with no source.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { resetSystemHostLabels, setSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { ownCardFindingKey } from "./ownCardFinding";
import { useSelfSource, type SelfSourceShell } from "./useSelfSource";
import { SEAT, SEAT_ENTITY, derivedIdOf, installWire, person, vault } from "../test/cardWire";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
  setSystemHostLabels(["id", "ontology", "geo", "life", "kaizen"]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetSystemHostLabels();
  tearDown();
});

const wrapper = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const client = () => new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 1 } } });

async function seatWithCard() {
  const wire = installWire();
  const id = await derivedIdOf();
  wire.set(id, person(id));
  return { wire, id };
}

describe("useSelfSource", () => {
  it("is null while the finding is out, then the address of the holder's own card, and shares the finding's key", async () => {
    const { id } = await seatWithCard();
    const qc = client();
    const shell: SelfSourceShell = { vaults: [vault()] };
    const { result } = renderHook(() => useSelfSource(shell), { wrapper: wrapper(qc) });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual({ "@id": `${SEAT}/e/${id}` }));
    expect((qc.getQueryData(ownCardFindingKey(SEAT)) as { cardId: string }).cardId).toBe(id);
  });

  it("keeps the same object while the card does not change", async () => {
    await seatWithCard();
    const shell: SelfSourceShell = { vaults: [vault()] };
    const { result, rerender } = renderHook(() => useSelfSource(shell), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current).not.toBeNull());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("is null, and reads nothing, when the shell holds no vault", async () => {
    const { wire } = await seatWithCard();
    const none = renderHook(() => useSelfSource({}), { wrapper: wrapper(client()) });
    const empty = renderHook(() => useSelfSource({ vaults: [] }), { wrapper: wrapper(client()) });
    const nul = renderHook(() => useSelfSource({ vaults: null }), { wrapper: wrapper(client()) });
    await new Promise((r) => setTimeout(r, 30));
    expect(none.result.current).toBeNull();
    expect(empty.result.current).toBeNull();
    expect(nul.result.current).toBeNull();
    expect(wire.reads).toEqual([]);
  });

  it("is null when the vault has no card", async () => {
    const wire = installWire();
    wire.set("seat-record", { "@id": SEAT_ENTITY, "@type": "t:Vault" });
    const qc = client();
    const { result } = renderHook(() => useSelfSource({ vaults: [vault()] }), { wrapper: wrapper(qc) });
    await waitFor(() => expect(qc.getQueryState(ownCardFindingKey(SEAT))?.status).toBe("success"));
    expect(result.current).toBeNull();
  });

  it("is null when the read failed, and does not read again", async () => {
    const wire = installWire();
    wire.set("seat-record", 500);
    const qc = client();
    const { result } = renderHook(() => useSelfSource({ vaults: [vault()] }), { wrapper: wrapper(qc) });
    await waitFor(() => expect(qc.getQueryState(ownCardFindingKey(SEAT))?.status).toBe("error"));
    const reads = wire.reads.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current).toBeNull();
    expect(wire.reads.length).toBe(reads);
  });

  it("takes the vault the platform flags as the landing vault over another, and over the session vault's row", async () => {
    const other = "https://t2org.platform.example.test/vault";
    const { id } = await seatWithCard();
    const shell: SelfSourceShell = { vaults: [vault({ vaultId: other, entity: `${other}/e/x`, isLandingVault: false }), vault()], contentScope: { reach: { vaultId: other } } };
    const { result } = renderHook(() => useSelfSource(shell), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current).toEqual({ "@id": `${SEAT}/e/${id}` }));
  });

  it("falls back to the session vault's row when no vault is flagged, and to the entity's root through the reachable set only", async () => {
    const { id } = await seatWithCard();
    const unflagged = vault({ isLandingVault: false });
    const byReach = renderHook(() => useSelfSource({ vaults: [unflagged], contentScope: { reach: { vaultId: SEAT } } }), { wrapper: wrapper(client()) });
    await waitFor(() => expect(byReach.result.current).toEqual({ "@id": `${SEAT}/e/${id}` }));
    const bySession = renderHook(() => useSelfSource({ vaults: [unflagged], session: { vault: { entity: `${SEAT}/e/anything` } } }), { wrapper: wrapper(client()) });
    await waitFor(() => expect(bySession.result.current).toEqual({ "@id": `${SEAT}/e/${id}` }));
  });

  it("is null when no vault is flagged and nothing names the person's own vault", async () => {
    const { wire } = await seatWithCard();
    const { result } = renderHook(() => useSelfSource({ vaults: [vault({ isLandingVault: false })] }), { wrapper: wrapper(client()) });
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current).toBeNull();
    expect(wire.reads).toEqual([]);
  });
});
