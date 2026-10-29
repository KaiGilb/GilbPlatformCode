// The find half of the adder's card (adderCard.ts:98). The platform is the world of `test/world.ts`; the reads are the real own-card finding.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { resetBaseOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { setSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { resetLwsAuth, lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { ownCardFindingKey } from "@kaigilb/gilbplatformcode-plan-self-source";
import { NO_OWN_CARD_SAYS, NO_OWN_VAULT_SAYS, NoOwnVaultError, adderCardOf, landingVaultOf } from "./adderCard";
import { BASE, P, P_ENTITY, createWorld, type World } from "../test/world";

const vault = (over: Partial<ReachableVault> = {}): ReachableVault => ({
  vaultId: P,
  entity: P_ENTITY,
  name: "Ann",
  parent: null,
  parentAmbiguous: false,
  modes: ["read", "write"],
  represents: null,
  isLandingVault: true,
  ...over,
});

async function setUp(options: Parameters<typeof createWorld>[0] = {}): Promise<World> {
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLwsAuth();
  setBaseOrigin(BASE);
  setSystemVaultHosts([]);
  setSystemHostLabels(["id"]);
  const world = await createWorld(options);
  setLwsAuth(lwsAuthFromSession(world.session));
  vi.stubGlobal("fetch", world.fetch);
  return world;
}
const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
beforeEach(() => void 0);

describe("the sentences", () => {
  test("are the source's words for a missing vault and the new words for a missing card", () => {
    expect(NO_OWN_VAULT_SAYS).toBe("Your own vault could not be found, so what you add would have no source. Nothing was saved.");
    expect(NO_OWN_CARD_SAYS).toBe("You have no card of your own in your vault yet, so make your own card there first, then add this person.");
    expect(NO_OWN_CARD_SAYS.split(/[.!?]\s/).length).toBe(1);
  });
});

describe("landingVaultOf (adderCard.ts:42)", () => {
  test("the row flagged as landing, never the first, and none when none is flagged", () => {
    const a = vault({ vaultId: "a", isLandingVault: false });
    const b = vault({ vaultId: "b", isLandingVault: true });
    expect(landingVaultOf([a, b])).toBe(b);
    expect(landingVaultOf([a])).toBeUndefined();
    expect(landingVaultOf(null)).toBeUndefined();
    expect(landingVaultOf(undefined)).toBeUndefined();
    expect(landingVaultOf([])).toBeUndefined();
  });
});

describe("adderCardOf", () => {
  test("with no landing vault it rejects with NoOwnVaultError, before any request", async () => {
    const world = await setUp();
    const err = await adderCardOf([vault({ isLandingVault: false })], newQc()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoOwnVaultError);
    expect((err as Error).message).toBe(NO_OWN_VAULT_SAYS);
    expect((err as Error).name).toBe("NoOwnVaultError");
    await expect(adderCardOf(null, newQc())).rejects.toBeInstanceOf(NoOwnVaultError);
    await expect(adderCardOf(undefined, newQc())).rejects.toBeInstanceOf(NoOwnVaultError);
    expect(world.calls).toEqual([]);
  });

  test("with an own card it answers the card's own address", async () => {
    const world = await setUp();
    expect(await adderCardOf([vault()], newQc())).toBe(world.ownCardUri);
  });

  test("the card is stated by its served @id when the finding has one, else by its address", async () => {
    await setUp();
    const qc = newQc();
    qc.setQueryData(ownCardFindingKey(P), { cardId: "c", cardUri: "https://h.example.test/base/e/c", cardAtId: "https://id.example.test/base/e/c", road: "derived" });
    expect(await adderCardOf([vault()], qc)).toBe("https://id.example.test/base/e/c");
    const other = newQc();
    other.setQueryData(ownCardFindingKey(P), { cardId: "c", cardUri: "https://h.example.test/base/e/c", cardAtId: null, road: "derived" });
    expect(await adderCardOf([vault()], other)).toBe("https://h.example.test/base/e/c");
  });

  test("with no own card it rejects with the sentence, and writes nothing", async () => {
    const world = await setUp({ ownCard: false });
    await expect(adderCardOf([vault()], newQc())).rejects.toThrow(NO_OWN_CARD_SAYS);
    expect(world.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  test("a finding that cannot be read rejects with the source's sentence and the cause", async () => {
    const world = await setUp();
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      if (String(u).includes("/lws/r/")) return new Response(JSON.stringify({ message: "The vault is busy." }), { status: 503 });
      return world.fetch(u, init);
    });
    const err = await adderCardOf([vault()], newQc()).catch((e: unknown) => e as Error);
    expect((err as Error).message).toMatch(/^Your own card could not be read, so what you add would have no source\. Nothing was saved\. \(.+\)$/);
  });

  test("the finding is read once for three adds at once, and again for another query client", async () => {
    const world = await setUp();
    const qc = newQc();
    const three = await Promise.all([adderCardOf([vault()], qc), adderCardOf([vault()], qc), adderCardOf([vault()], qc)]);
    expect(new Set(three).size).toBe(1);
    const reads = () => world.requests("GET", new RegExp(`/lws/r/${world.ownCardUri!.split("/").pop()}$`)).length;
    expect(reads()).toBe(1);
    await adderCardOf([vault()], qc);
    expect(reads()).toBe(1); // the finding is kept by the query client for the session
    await adderCardOf([vault()], newQc());
    expect(reads()).toBe(2);
  });

  test("the email option is not read: a card that is not there is never made", async () => {
    const world = await setUp({ ownCard: false });
    await expect(adderCardOf([vault()], newQc(), { email: "ann@example.test" })).rejects.toThrow(NO_OWN_CARD_SAYS);
    expect(world.calls.some((c) => /selfcard/.test(c.url))).toBe(false);
  });

  test("a failure is not kept: once she has made her card, the next ask finds it", async () => {
    const world = await setUp({ ownCard: false });
    const qc = newQc();
    await expect(adderCardOf([vault()], qc)).rejects.toThrow(NO_OWN_CARD_SAYS);
    const card = await world.makeOwnCard();
    expect(await adderCardOf([vault()], qc)).toBe(card);
  });

  test("two asks at once are one ask: the same promise", async () => {
    await setUp();
    const qc = newQc();
    const first = adderCardOf([vault()], qc);
    const second = adderCardOf([vault()], qc);
    expect(second).toBe(first);
    await first;
    expect(adderCardOf([vault()], qc)).not.toBe(first);
  });
});
