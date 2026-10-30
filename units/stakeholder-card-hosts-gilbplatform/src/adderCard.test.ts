// The find half of the adder's card (adderCard.ts:98). The platform is the world of `test/world.ts`; the reads are the real own-card finding.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { resetBaseOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { setSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { resetLwsAuth, lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { ownCardFindingKey } from "@kaigilb/gilbplatformcode-plan-self-source";
import { NO_OWN_VAULT_SAYS, NoOwnVaultError, adderCardOf, landingVaultOf, nameFromEmail } from "./adderCard";
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
  test("the sentence for a missing vault is the source's (0.2.0: the sentence for a missing card is gone, as the card is made)", () => {
    expect(NO_OWN_VAULT_SAYS).toBe("Your own vault could not be found, so what you add would have no source. Nothing was saved.");
  });
});

describe("nameFromEmail (adderCard.ts:43)", () => {
  test("splits the part before the @ and before a +tag on . _ -, and capitalises each part", () => {
    expect(nameFromEmail("petter.hansen@example.test")).toBe("Petter Hansen");
    expect(nameFromEmail("kai@example.test")).toBe("Kai");
    expect(nameFromEmail("ANN_marie-ward+work@example.test")).toBe("Ann Marie Ward");
    expect(nameFromEmail("  ann.ward@example.test ")).toBe("Ann Ward");
  });
  test("an email that gives no name gives null", () => {
    expect(nameFromEmail(null)).toBeNull();
    expect(nameFromEmail(undefined)).toBeNull();
    expect(nameFromEmail("")).toBeNull();
    expect(nameFromEmail("@example.test")).toBeNull();
    expect(nameFromEmail("..@example.test")).toBeNull();
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

  test("with no own card it makes a basic one in the landing vault (a selfcard POST with DPoP), reads it back and answers its address", async () => {
    const world = await setUp({ ownCard: false });
    const card = await adderCardOf([vault()], newQc());
    const posts = world.requests("POST", /\/selfcard$/);
    expect(posts.length).toBe(1);
    expect(posts[0]!.url).toBe(`${P.replace("/base/pann", "")}/lws/vault/${encodeURIComponent(P)}/selfcard`);
    expect(posts[0]!.headers.authorization).toBe("DPoP fake-access-token");
    expect(posts[0]!.headers.dpop).toBe(`proof(POST ${posts[0]!.url})`);
    const body = JSON.parse(posts[0]!.body!) as { type: string; facts: Record<string, unknown> };
    expect(body.type).toBe("t:Person");
    expect(body.facts).toEqual({ "a:name": "Ann" }); // a basic card: the name and nothing else
    expect(card).toBe(world.ownCardUri);
    expect(world.requests("GET", new RegExp(`/lws/r/${card.split("/").pop()}$`)).length).toBeGreaterThan(0);
    // The only write is the selfcard door: never the record-create door.
    expect(world.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${new URL(c.url).pathname.replace(/vault\/[^/]+/, "vault/V")}`)).toEqual(["POST /lws/vault/V/selfcard"]);
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

  test("the email option names the basic card; without it the vault's label does", async () => {
    const world = await setUp({ ownCard: false });
    await adderCardOf([vault()], newQc(), { email: "ann.ward@example.test" });
    expect((JSON.parse(world.requests("POST", /\/selfcard$/)[0]!.body!) as { facts: Record<string, unknown> }).facts["a:name"]).toBe("Ann Ward");
    const other = await setUp({ ownCard: false });
    await adderCardOf([vault({ name: null })], newQc(), { email: "@example.test" });
    expect((JSON.parse(other.requests("POST", /\/selfcard$/)[0]!.body!) as { facts: Record<string, unknown> }).facts["a:name"]).toBe("pann");
  });

  test("three adds at once make ONE card, and the next ask finds it without making another", async () => {
    const world = await setUp({ ownCard: false });
    const qc = newQc();
    const three = await Promise.all([adderCardOf([vault()], qc), adderCardOf([vault()], qc), adderCardOf([vault()], qc)]);
    expect(new Set(three).size).toBe(1);
    expect(world.requests("POST", /\/selfcard$/).length).toBe(1);
    expect(await adderCardOf([vault()], qc)).toBe(three[0]);
    expect(world.requests("POST", /\/selfcard$/).length).toBe(1); // the finding was dropped after the make, so it is read again and now holds the card
  });

  test("a door that refuses: the sentence of the source with the cause, and the next ask tries again", async () => {
    const world = await setUp({ ownCard: false });
    let refuse = true;
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      if (refuse && /\/selfcard$/.test(String(u))) return new Response(JSON.stringify({ message: "The vault is busy." }), { status: 503 });
      return world.fetch(u, init);
    });
    const qc = newQc();
    const err = await adderCardOf([vault()], qc).catch((e: unknown) => e as Error);
    expect((err as Error).message).toMatch(/^Your own card could not be made, so what you add would have no source\. Nothing was saved\. \(.+\)$/);
    expect(world.ownCardUri).toBeNull();
    refuse = false;
    expect(await adderCardOf([vault()], qc)).toBe(world.ownCardUri);
  });

  test("a vault id that is no address cannot be addressed: the source's sentence, and nothing is sent", async () => {
    const world = await setUp({ ownCard: false });
    const qc = newQc();
    qc.setQueryData(ownCardFindingKey("not an address"), { cardId: null, cardUri: null, cardAtId: null, road: "none" });
    await expect(adderCardOf([vault({ vaultId: "not an address" })], qc)).rejects.toThrow("Your own vault could not be addressed, so what you add would have no source. Nothing was saved.");
    expect(world.calls.filter((c) => c.method === "POST")).toEqual([]);
  });

  test("a card that is made but cannot be read back: the source's sentence", async () => {
    const world = await setUp({ ownCard: false });
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      const res = await world.fetch(u, init);
      if (/\/selfcard$/.test(String(u))) {
        const loc = res.headers.get("location")!;
        return new Response(JSON.stringify({ "@id": loc }), { status: 201, headers: { location: loc.replace(/[^/]+$/, "someotherid") } });
      }
      return res;
    });
    await expect(adderCardOf([vault()], newQc())).rejects.toThrow("Your own card was made but could not be read back, so what you add would have no source. Nothing was saved.");
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
