// Ported from the provider's `adderCard.test.ts` (the 16 cases of the pure half and `adderCardOf`, re-based on the light fake platform of
// `test/support.ts`) and from the app's `sourceIsAdder.sb1a.test.ts` (`nameFromEmail`: the one case in the "(c) an adder with no card" group
// that names the guess). The hook `useAdderCard` and the host seam have no test in the source of their own (the app exercises them through the
// held-claim hooks); they are new here.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ownCardFindingKey } from "@kaigilb/gilbplatformcode-plan-self-source";
import { vaultsKey } from "@kaigilb/gilbplatformcode-reachable-vaults";
import {
  AdderCardHostProvider,
  NO_OWN_VAULT_SAYS,
  NoOwnVaultError,
  adderCardOf,
  landingVaultOf,
  nameFromEmail,
  useAdderCard,
  type AdderCardHost,
} from "./index";
import { HOST, P, PRINCIPAL, newQc, resp, setUp as setUpWorld, tearDown, vault, type World } from "../test/support";

let world: World;
const setUp = async (o: { ownCard?: boolean } = {}) => (world = await setUpWorld(o));
afterEach(tearDown);

describe("the sentences", () => {
  test("the sentence for a missing vault is the source's", async () => {
    expect(NO_OWN_VAULT_SAYS).toBe("Your own vault could not be found, so what you add would have no source. Nothing was saved.");
    expect(new NoOwnVaultError().message).toBe(NO_OWN_VAULT_SAYS);
    expect(new NoOwnVaultError().name).toBe("NoOwnVaultError");
  });
});

describe("nameFromEmail", () => {
  test("splits the part before the @ and before a +tag on . _ -, and capitalises each part", () => {
    expect(nameFromEmail("petter.hansen@example.test")).toBe("Petter Hansen");
    expect(nameFromEmail("kai@example.test")).toBe("Kai");
    expect(nameFromEmail("a_b-c@example.test")).toBe("A B C");
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

describe("landingVaultOf", () => {
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
    await setUp();
    const err = await adderCardOf([vault({ isLandingVault: false })], newQc()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoOwnVaultError);
    expect((err as Error).message).toBe(NO_OWN_VAULT_SAYS);
    await expect(adderCardOf(null, newQc())).rejects.toBeInstanceOf(NoOwnVaultError);
    await expect(adderCardOf(undefined, newQc())).rejects.toBeInstanceOf(NoOwnVaultError);
    expect(world.calls).toEqual([]);
  });

  test("with an own card it answers the card's own address", async () => {
    await setUp();
    expect(await adderCardOf([vault()], newQc())).toBe(world.cardUri);
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
    await setUp({ ownCard: false });
    const card = await adderCardOf([vault()], newQc());
    const posts = world.requests("POST", /\/selfcard$/);
    expect(posts.length).toBe(1);
    expect(posts[0]!.url).toBe(`${HOST}/lws/vault/${encodeURIComponent(P)}/selfcard`);
    expect(posts[0]!.headers.authorization).toBe("DPoP fake-access-token");
    expect(posts[0]!.headers.dpop).toBe(`proof(POST ${posts[0]!.url})`);
    const body = JSON.parse(posts[0]!.body!) as { type: string; facts: Record<string, unknown> };
    expect(body.type).toBe("t:Person");
    expect(body.facts).toEqual({ "a:name": "Ann" }); // a basic card: the name and nothing else
    expect(card).toBe(world.cardUri);
    expect(world.cardReads()).toBeGreaterThan(0);
    // The only write is the selfcard door: never the record-create door.
    expect(world.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${new URL(c.url).pathname.replace(/vault\/[^/]+/, "vault/V")}`)).toEqual(["POST /lws/vault/V/selfcard"]);
  });

  test("a finding that cannot be read rejects with the source's sentence and the cause", async () => {
    await setUp();
    const real = world.fetchFake.getMockImplementation()!;
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => (String(u).includes("/lws/r/") ? resp(503, { message: "The vault is busy." }) : real(u, init)));
    const err = await adderCardOf([vault()], newQc()).catch((e: unknown) => e as Error);
    expect((err as Error).message).toMatch(/^Your own card could not be read, so what you add would have no source\. Nothing was saved\. \(.+\)$/);
  });

  test("the finding is read once for three adds at once, and again for another query client", async () => {
    await setUp();
    const qc = newQc();
    const three = await Promise.all([adderCardOf([vault()], qc), adderCardOf([vault()], qc), adderCardOf([vault()], qc)]);
    expect(new Set(three).size).toBe(1);
    expect(world.cardReads()).toBe(1);
    await adderCardOf([vault()], qc);
    expect(world.cardReads()).toBe(1); // the finding is kept by the query client for the session
    await adderCardOf([vault()], newQc());
    expect(world.cardReads()).toBe(2);
  });

  test("the email option names the basic card; without it the vault's label does", async () => {
    await setUp({ ownCard: false });
    await adderCardOf([vault()], newQc(), { email: "ann.ward@example.test" });
    expect((JSON.parse(world.requests("POST", /\/selfcard$/)[0]!.body!) as { facts: Record<string, unknown> }).facts["a:name"]).toBe("Ann Ward");
    const second = await setUp({ ownCard: false });
    await adderCardOf([vault({ name: null })], newQc(), { email: "@example.test" });
    expect((JSON.parse(second.requests("POST", /\/selfcard$/)[0]!.body!) as { facts: Record<string, unknown> }).facts["a:name"]).toBe("pann");
  });

  test("three adds at once make ONE card, and the next ask finds it without making another", async () => {
    await setUp({ ownCard: false });
    const qc = newQc();
    const three = await Promise.all([adderCardOf([vault()], qc), adderCardOf([vault()], qc), adderCardOf([vault()], qc)]);
    expect(new Set(three).size).toBe(1);
    expect(world.requests("POST", /\/selfcard$/).length).toBe(1);
    expect(await adderCardOf([vault()], qc)).toBe(three[0]);
    expect(world.requests("POST", /\/selfcard$/).length).toBe(1); // the finding was dropped after the make, so it is read again and now holds the card
  });

  test("a door that refuses: the sentence of the source with the cause, and the next ask tries again", async () => {
    await setUp({ ownCard: false });
    const real = world.fetchFake.getMockImplementation()!;
    let refuse = true;
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => (refuse && /\/selfcard$/.test(String(u)) ? resp(503, { message: "The vault is busy." }) : real(u, init)));
    const qc = newQc();
    const err = await adderCardOf([vault()], qc).catch((e: unknown) => e as Error);
    expect((err as Error).message).toMatch(/^Your own card could not be made, so what you add would have no source\. Nothing was saved\. \(.+\)$/);
    expect(world.hasCard).toBe(false);
    refuse = false;
    expect(await adderCardOf([vault()], qc)).toBe(world.cardUri);
  });

  test("a vault id that is no address cannot be addressed: the source's sentence, and nothing is sent", async () => {
    await setUp({ ownCard: false });
    const qc = newQc();
    qc.setQueryData(ownCardFindingKey("not an address"), { cardId: null, cardUri: null, cardAtId: null, road: "none" });
    await expect(adderCardOf([vault({ vaultId: "not an address" })], qc)).rejects.toThrow("Your own vault could not be addressed, so what you add would have no source. Nothing was saved.");
    expect(world.calls.filter((c) => c.method === "POST")).toEqual([]);
  });

  test("a card that is made but cannot be read back: the source's sentence", async () => {
    await setUp({ ownCard: false });
    const real = world.fetchFake.getMockImplementation()!;
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      const res = await real(u, init);
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

  test("the card made is stated only after it is read back at the landing vault's own address", async () => {
    await setUp({ ownCard: false });
    await adderCardOf([vault()], newQc());
    const reads = world.calls.filter((c) => c.method === "GET" && c.url.endsWith(`/lws/r/${world.derivedId}`));
    expect(reads.length).toBeGreaterThanOrEqual(2); // the finding's own read (absent), then the read-back
    expect(reads.every((c) => c.url.startsWith(HOST))).toBe(true);
  });

  test("the card made is dropped from the finding, so the next ask in the session finds it", async () => {
    await setUp({ ownCard: false });
    const qc = newQc();
    await adderCardOf([vault()], qc);
    await waitFor(() => expect(qc.getQueryState(ownCardFindingKey(P))?.isInvalidated).toBe(true));
  });
});

// ── the hook ───────────────────────────────────────────────────────────────────────────────────────────────────────
function harness(opts: { principal?: string | undefined; seedVaults?: boolean; seedFinding?: unknown } = {}) {
  const qc = newQc();
  const principal = "principal" in opts ? opts.principal : PRINCIPAL;
  if (opts.seedVaults !== false) qc.setQueryData(vaultsKey(principal), [vault()]);
  if (opts.seedFinding !== undefined) qc.setQueryData(ownCardFindingKey(P), opts.seedFinding);
  const useSession = vi.fn((_o: { enabled: false }) => ({ data: principal ? { principal } : undefined }));
  const host: AdderCardHost = { useSession };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <AdderCardHostProvider value={host}>{children}</AdderCardHostProvider>
    </QueryClientProvider>
  );
  return { qc, useSession, wrapper };
}
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const FOUND = { cardId: "c", cardUri: "https://holder.example.test/base/e/c", cardAtId: "https://id.example.test/base/e/c", road: "derived" as const };

describe("useAdderCard", () => {
  beforeEach(() => void 0);

  test("reads the session passively: the host hook is called with enabled false, and nothing is fetched or minted for it", async () => {
    await setUp();
    const h = harness({ seedFinding: FOUND });
    renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    expect(h.useSession).toHaveBeenCalledWith({ enabled: false });
    expect(h.useSession.mock.calls.every(([o]) => o.enabled === false)).toBe(true);
  });

  test("with the vault list and the finding in hand the card is the served @id of the finding, and nothing is pending", async () => {
    await setUp();
    const h = harness({ seedFinding: FOUND });
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.card).toBe("https://id.example.test/base/e/c"));
    expect(result.current.pending).toBe(false);
    expect(result.current.noOwnVault).toBe(false);
    expect(result.current.error).toBeNull();
    expect(world.calls).toEqual([]);
  });

  test("a finding with no served @id gives the finding's address", async () => {
    await setUp();
    const h = harness({ seedFinding: { ...FOUND, cardAtId: null } });
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.card).toBe("https://holder.example.test/base/e/c"));
  });

  test("a finding with no card gives null, and it is a read: nothing is made", async () => {
    await setUp({ ownCard: false });
    const h = harness({ seedFinding: { cardId: null, cardUri: null, cardAtId: null, road: "none" } });
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.card).toBeNull();
    expect(world.requests("POST", /./)).toEqual([]);
  });

  test("no landing vault in the list says noOwnVault, and the card is null", async () => {
    await setUp();
    const h = harness({ seedVaults: false });
    h.qc.setQueryData(vaultsKey(PRINCIPAL), [vault({ isLandingVault: false })]);
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.noOwnVault).toBe(true));
    expect(result.current.card).toBeNull();
    expect(result.current.pending).toBe(false);
    await settle();
    expect(result.current.error).toBeNull(); // no finding is read for a vault that is not there
    expect(world.calls).toEqual([]);
  });

  test("while the vault list is still out it is pending and NOT noOwnVault (an unknown list is not an empty one)", async () => {
    await setUp();
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    const h = harness({ seedVaults: false });
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    await settle();
    expect(result.current.pending).toBe(true);
    expect(result.current.noOwnVault).toBe(false);
    expect(result.current.card).toBeNull();
  });

  test("with the list in hand and the finding still out it is pending", async () => {
    await setUp();
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    const h = harness();
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    await settle();
    expect(result.current.pending).toBe(true);
    expect(result.current.noOwnVault).toBe(false);
  });

  test("no signed-in principal reads nothing: no list, no finding, not noOwnVault", async () => {
    await setUp();
    const h = harness({ principal: undefined, seedVaults: false });
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    await settle();
    expect(result.current.card).toBeNull();
    expect(result.current.noOwnVault).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(world.calls).toEqual([]);
  });

  test("enabled = false reads nothing and is neither pending nor noOwnVault", async () => {
    await setUp();
    const h = harness({ seedVaults: false });
    const { result } = renderHook(() => useAdderCard(false), { wrapper: h.wrapper });
    await settle();
    expect(result.current.pending).toBe(false);
    expect(result.current.noOwnVault).toBe(false);
    expect(result.current.card).toBeNull();
    expect(world.calls).toEqual([]);
  });

  test("a finding that cannot be read is the hook's error", async () => {
    await setUp();
    vi.stubGlobal("fetch", async () => resp(503, { message: "The vault is busy." }));
    const h = harness();
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.card).toBeNull();
  });

  test("resolve() answers the card, and makes the basic one when there is none (the write path)", async () => {
    await setUp({ ownCard: false });
    const h = harness({ seedFinding: { cardId: null, cardUri: null, cardAtId: null, road: "none" } });
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    let card = "";
    await act(async () => {
      card = await result.current.resolve();
    });
    expect(card).toBe(world.cardUri);
    expect(world.requests("POST", /\/selfcard$/).length).toBe(1);
  });

  test("resolve() rejects with NoOwnVaultError when the list holds no landing vault", async () => {
    await setUp();
    const h = harness({ seedVaults: false });
    h.qc.setQueryData(vaultsKey(PRINCIPAL), []);
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    await expect(result.current.resolve()).rejects.toBeInstanceOf(NoOwnVaultError);
  });

  test("find() answers the card, or null when there is none, and makes nothing", async () => {
    await setUp({ ownCard: false });
    const h = harness({ seedFinding: { cardId: null, cardUri: null, cardAtId: null, road: "none" } });
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    expect(await result.current.find()).toBeNull();
    expect(world.requests("POST", /./)).toEqual([]);
    const h2 = harness({ seedFinding: FOUND });
    const second = renderHook(() => useAdderCard(), { wrapper: h2.wrapper });
    expect(await second.result.current.find()).toBe("https://id.example.test/base/e/c");
  });

  test("find() is null when there is no landing vault", async () => {
    await setUp();
    const h = harness({ seedVaults: false });
    h.qc.setQueryData(vaultsKey(PRINCIPAL), [vault({ isLandingVault: false })]);
    const { result } = renderHook(() => useAdderCard(), { wrapper: h.wrapper });
    expect(await result.current.find()).toBeNull();
  });

  test("without a host provider it throws an error that names it", async () => {
    await setUp();
    const qc = newQc();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useAdderCard(), { wrapper })).toThrow(/AdderCardHostProvider/);
    spy.mockRestore();
  });
});
