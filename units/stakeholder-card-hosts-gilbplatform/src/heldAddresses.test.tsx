// New. The four place members of the one card (the held addresses of a linked person), over the real reads of `place-claims` and `place-names` and a fake platform (`test/place/`).
// What is pinned: they read the vault's ONE shared address read, so a card open adds no request while it is fresh; the list REJECTS, with the claims it read, when it was not the whole
// vault; the names REJECT when any place could not be read, and leave out a place that is gone; only this record's addresses are handed to the merge; and the one card's observer of
// them has its own key, under the shared read's, so the two shapes never meet.
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MAX_LIST_PAGES } from "@kaigilb/gilbplatformcode-vault-records-of-type";
import { PlaceClaimsIncompleteError, placeClaimsKey, readPlaceClaimsInVault, type PlaceClaimsRead } from "@kaigilb/gilbplatformcode-place-claims";
import { PlaceNamesNotReadError } from "@kaigilb/gilbplatformcode-place-names";
import { createHeldAddressMembers, heldAddressesKey } from "./heldAddresses";
import { createOneCardHost } from "./hosts";
import * as fake from "../test/place/fakePlaceStore";
import { NORWAY, OSLO, OTHER, RECORD, VAULT, useWorld } from "../test/place/world";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({
  attributeSpelling: vi.fn(async (name: string) => name),
  typeSpelling: vi.fn(async (name: string) => `t:${name}`),
  attributeLabel: vi.fn(async () => null),
}));

useWorld();
let qc: QueryClient;
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => qc.clear());

const seedHome = (subject = RECORD, label = "home") => {
  const claim = fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": subject }, "a:placeClaimLabel": label });
  const uri = `${VAULT}/e/${claim}`;
  fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": subject }, "a:detailOf": { "@id": uri }, "a:streetLine": "Storgata 1" });
  fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": subject }, "a:detailOf": { "@id": uri }, "a:claimPlace": { "@id": OSLO.id } });
  return claim;
};
const listings = () => fake.calls.filter((c) => /\/records\?/.test(c.url));

describe("listPlaceClaimsInVault", () => {
  it("resolves the claims of a whole read", async () => {
    seedHome();
    const claims = await createHeldAddressMembers(qc).listPlaceClaimsInVault(VAULT);
    expect(claims).toHaveLength(1);
    expect((claims[0] as unknown as { label: string }).label).toBe("home");
  });

  it("(M-K16, F8) REJECTS, with the claims it did read, when the read was not the whole vault", async () => {
    for (let i = 0; i < MAX_LIST_PAGES + 3; i += 1) seedHome(RECORD, `a${i}`);
    fake.door.pageSize = 1;
    const err = await createHeldAddressMembers(qc).listPlaceClaimsInVault(VAULT).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(PlaceClaimsIncompleteError);
    expect((err as PlaceClaimsIncompleteError).claims.length).toBe(MAX_LIST_PAGES);
    expect((err as PlaceClaimsIncompleteError).reason).toBe("capped");
  });

  it("a stalled door rejects too, with what was read", async () => {
    seedHome();
    fake.door.pages = (offset, types) => (offset > 0 && types.includes("PlaceClaim") ? { records: [], total: 9, complete: false, pageSize: 1, offset, nextOffset: offset } : null);
    fake.door.neverComplete = true;
    const err = await createHeldAddressMembers(qc).listPlaceClaimsInVault(VAULT).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(PlaceClaimsIncompleteError);
  });

  it("(M33) a read that failed rejects: it is not an empty list", async () => {
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => (/\/records$/.test(new URL(String(input)).pathname) ? new Response("down", { status: 503 }) : inner(input as never, init))));
    await expect(createHeldAddressMembers(qc).listPlaceClaimsInVault(VAULT)).rejects.toBeTruthy();
  });

  it("reads through the vault's ONE shared read: when the Address group's read is fresh, the card makes no listing of its own, and what is held under the shared key keeps its one shape", async () => {
    seedHome();
    const shared = await qc.fetchQuery<PlaceClaimsRead>({ queryKey: placeClaimsKey(VAULT), queryFn: () => readPlaceClaimsInVault(VAULT), staleTime: 60_000 });
    fake.calls.length = 0;
    const claims = await createHeldAddressMembers(qc).listPlaceClaimsInVault(VAULT);
    expect(claims).toHaveLength(1);
    expect(listings()).toEqual([]);
    const held = qc.getQueryData<PlaceClaimsRead>(placeClaimsKey(VAULT))!;
    expect(held).toBe(shared);
    expect(Object.keys(held).sort()).toEqual(["claims", "complete"]);
  });

  it("the one card's observer has its own key under the shared read's", () => {
    const mine = heldAddressesKey(VAULT);
    expect(mine.slice(0, 3)).toEqual(placeClaimsKey(VAULT));
    expect(mine).not.toEqual(placeClaimsKey(VAULT));
    const host = createOneCardHost({ geoOrigin: "https://geo.example.test", queryClient: qc });
    expect(host.placeClaimsKey(VAULT)).toEqual(mine);
    // without a query client the host is GilbApp's: the shared key, and nothing found
    expect(createOneCardHost({ geoOrigin: "https://geo.example.test" }).placeClaimsKey(VAULT)).toEqual(placeClaimsKey(VAULT));
  });
});

describe("claimsAbout, claimFieldText", () => {
  it("(M34) only the addresses about THIS record are handed on, and the text of a field is read wherever it is stored", async () => {
    seedHome(RECORD, "mine");
    seedHome(OTHER, "theirs");
    const m = createHeldAddressMembers(qc);
    const all = await readPlaceClaimsInVault(VAULT);
    const about = m.claimsAbout(all.claims, RECORD);
    expect(about.map((c) => (c as unknown as { label: string }).label)).toEqual(["mine"]);
    expect(m.claimFieldText(about[0]!, "streetLine")).toBe("Storgata 1");
    expect(m.claimFieldText(about[0]!, "postalCode")).toBe("");
    expect(m.claimsAbout(all.claims, "")).toEqual([]);
  });
});

describe("loadPlaceNames", () => {
  it("resolves the named places, in order", async () => {
    const rows = await createHeldAddressMembers(qc).loadPlaceNames([NORWAY.id, OSLO.id]);
    expect(rows.map((r) => r.label)).toEqual(["Norway", "Oslo"]);
  });

  it("(decision 4) REJECTS when any place could not be read, and says which; nothing is half-resolved", async () => {
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => (String(input) === NORWAY.id ? new Response("down", { status: 502 }) : inner(input as never, init))));
    const err = await createHeldAddressMembers(qc).loadPlaceNames([NORWAY.id, OSLO.id]).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(PlaceNamesNotReadError);
    expect((err as PlaceNamesNotReadError).failed.map((f) => f.state)).toEqual(["failed"]);
  });

  it("a place the catalogue answers 404 for is an absence: it is left out, and the rest resolve", async () => {
    const rows = await createHeldAddressMembers(qc).loadPlaceNames([`${fake.GEO_HOST}/base/e/gone`, OSLO.id]);
    expect(rows.map((r) => r.label)).toEqual(["Oslo"]);
  });

  it("a rejection that the one card does not catch is not reported as unhandled (its `then` has no second argument)", async () => {
    const seen: unknown[] = [];
    const onUnhandled = (e: unknown) => seen.push(e);
    process.on("unhandledRejection", onUnhandled);
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => (String(input) === NORWAY.id ? new Response("down", { status: 502 }) : inner(input as never, init))));
    void createHeldAddressMembers(qc).loadPlaceNames([NORWAY.id]).then(() => undefined);
    await new Promise((r) => setTimeout(r, 50));
    process.off("unhandledRejection", onUnhandled);
    expect(seen).toEqual([]);
  });
});

describe("nothing is written", () => {
  it("every member only reads", async () => {
    seedHome();
    const m = createHeldAddressMembers(qc);
    await m.listPlaceClaimsInVault(VAULT);
    await m.loadPlaceNames([OSLO.id]);
    expect(fake.writes).toEqual([]);
  });
});

describe("a save reaches the one card's merge at once (no time advanced)", () => {
  it("(M-K19) the one card's observer, held under the shared key's prefix, is out of date after a write's read-back: the address saved is in what the card reads, with the clock where it was", async () => {
    const { renderHook, act, waitFor } = await import("@testing-library/react");
    const { useQuery, QueryClientProvider } = await import("@tanstack/react-query");
    const { usePlaceClaims } = await import("@kaigilb/gilbplatformcode-use-place-claims");
    const { PRINCIPAL, input } = await import("../test/place/world");
    const host = createOneCardHost({ geoOrigin: "https://geo.example.test", queryClient: qc });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    // The Address group's hook and the one card's own observer (as `useHeldAddresses` makes it: the host's key and member, the host's freshness), in one page.
    const { result } = renderHook(
      () => ({
        group: usePlaceClaims(VAULT, RECORD, PRINCIPAL),
        card: useQuery({ queryKey: host.placeClaimsKey(VAULT), queryFn: () => host.listPlaceClaimsInVault(VAULT), staleTime: host.placeClaimsStaleMs }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.card.data).toEqual([]));
    await waitFor(() => expect(result.current.group.status).toBe("ready"));
    // the card's answer is fresh for 60 s and nothing advances the clock
    let saved: string | null = null;
    await act(async () => {
      saved = await result.current.group.save(input({ label: "home", streetLine: "Storgata 1" }));
    });
    expect(saved).not.toBeNull();
    await waitFor(() => expect(result.current.card.data?.length).toBe(1));
    expect(host.claimsAbout(result.current.card.data!, RECORD)).toHaveLength(1);
    expect(host.claimFieldText(result.current.card.data![0]!, "streetLine")).toBe("Storgata 1");
  });
});
