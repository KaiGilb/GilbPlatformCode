// @vitest-environment jsdom
// New tests (the source has none for `mayBeOwnCard`, `isOwnSeat`, `ownCardCandidacy` or `useOwnCard`; the card-level pin is
// `RecordDetail.ownCard.o1.test.tsx`, which needs the whole screen and is left to the composition). The unit runs over the real
// `own-card`, `plan-self-source` (the finding), `lws-records` and `vault-origin-rule`, with a fake platform (test/support.ts) that
// answers a record only at the host that holds it. The state is a GUARD: while the test is pending the card is read only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { selfCardIdForVault } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { isOwnCardIn, isOwnSeat, mayBeOwnCard, ownCardCandidacy, useOwnCard } from "./index";
import type { OwnCardState } from "./index";
import type { ReadHook } from "../test/support";
import { ALL, KID, KID_CHILD, LANDING, ORG_CHILD, P, P_ENTITY, PERSON, SHARED, fakePlatform, gate, resp, row, setUp, tearDown } from "../test/support";

beforeEach(() => setUp());
afterEach(() => tearDown());

const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

const PENDING: OwnCardState = { pending: true, own: false, standing: { kind: "unknown" } };
const NOT_OWN: OwnCardState = { pending: false, own: false, standing: { kind: "unknown" } };
const LEGACY = "mnb-profile-06gn7dsf5xs9n50y392hmp58y4";
const OTHER_LEGACY = "mnb-profile-06gn7dywd9z015hgvgj01b5re8";
const ORIGIN = new URL(P).origin;
const held = (over: { atId?: string; type?: string; facts?: Record<string, unknown> } = {}) => ({ origin: ORIGIN, ...over });
/** Nothing has started: no query is fetching and no request was made. */
const idle = (qc: QueryClient, w: { platform: { seen: unknown[] } }) => {
  expect(qc.isFetching()).toBe(0);
  // not even the digest: no query of the session ever ran
  expect(qc.getQueryCache().getAll().filter((q) => q.state.dataUpdateCount > 0 || q.state.fetchStatus !== "idle")).toEqual([]);
  expect(w.platform.seen).toEqual([]);
};

/** The landing vault's entity (it holds the profile pointer), the derived card, and any named card. */
async function world(opts: { pointer?: unknown; cards?: string[]; derived?: boolean; read?: ReadHook } = {}) {
  const derivedId = await selfCardIdForVault(P);
  const heldAll: Record<string, ReturnType<typeof held>> = { "t1kai-vault": held({ type: "t:Vault", facts: opts.pointer === undefined ? {} : { "a:mnbProfile": opts.pointer } }) };
  if (opts.derived !== false) heldAll[derivedId] = held();
  for (const c of opts.cards ?? []) heldAll[c] = held();
  return { derivedId, platform: fakePlatform({ held: heldAll, read: opts.read }) };
}

describe("mayBeOwnCard: a cheap gate, never the decision", () => {
  it("an owner-shaped id passes: the derived prefix and the profile slug prefix", () => {
    expect(mayBeOwnCard({ id: "vsc-0123456789abcdef01234567" })).toBe(true);
    expect(mayBeOwnCard({ id: "mnb-profile-06gn7dsf5xs9n50y392hmp58y4" })).toBe(true);
    expect(mayBeOwnCard({ id: "mnb-profile" })).toBe(true);
  });
  it("any other id does not, whatever its type", () => {
    expect(mayBeOwnCard({ id: "ada-06gn7dsf5xs9n50y392hmp58y4" })).toBe(false);
    expect(mayBeOwnCard({ id: "" })).toBe(false);
    expect(mayBeOwnCard({ id: "xvsc-1" })).toBe(false);
    expect(mayBeOwnCard({ id: "my-mnb-profile-1", typeUri: "t:Person" })).toBe(false);
  });
  it("is case sensitive: a prefix in another case is not owner-shaped", () => {
    expect(mayBeOwnCard({ id: "VSC-1" })).toBe(false);
    expect(mayBeOwnCard({ id: "MNB-profile-1" })).toBe(false);
  });
});

describe("isOwnSeat: the vault that represents him as a person, his landing vault, held", () => {
  it("his landing vault typed Person is his seat", () => {
    expect(isOwnSeat(LANDING, ALL)).toBe(true);
  });
  it("his landing vault with no type is his seat too (the profile app treats the seat as his whatever its type)", () => {
    const untyped = row(P, { isLandingVault: true, represents: null, entity: P_ENTITY });
    expect(isOwnSeat(untyped, [untyped])).toBe(true);
  });
  it("his landing vault typed as anything else (an organisation's account) is not", () => {
    const org = row(P, { isLandingVault: true, represents: "https://ontology.platform.example.test/base/t/Organization", entity: P_ENTITY });
    expect(isOwnSeat(org, [org])).toBe(false);
  });
  it("a type is read by its local name: an address, a short form and a bare name all count as Person", () => {
    for (const represents of [PERSON, "t:Person", "Person"]) {
      const v = row(P, { isLandingVault: true, represents, entity: P_ENTITY });
      expect(isOwnSeat(v, [v]), represents).toBe(true);
    }
    const other = row(P, { isLandingVault: true, represents: "t:PersonGroup", entity: P_ENTITY });
    expect(isOwnSeat(other, [other])).toBe(false);
  });
  it("a nested vault, even typed Person, and a vault shared with him are not his seat", () => {
    expect(isOwnSeat(KID_CHILD, ALL)).toBe(false);
    expect(isOwnSeat(ORG_CHILD, ALL)).toBe(false);
    expect(isOwnSeat(SHARED, ALL)).toBe(false);
  });
  it("a landing vault he can only read is not held, so not his seat", () => {
    const readOnly = row(P, { isLandingVault: true, represents: PERSON, modes: ["read"], entity: P_ENTITY });
    expect(isOwnSeat(readOnly, [readOnly])).toBe(false);
  });
  it("no vault is not a seat", () => {
    expect(isOwnSeat(null, ALL)).toBe(false);
  });
});

describe("ownCardCandidacy and isOwnCardIn: the decision with no request", () => {
  it("outside his seat: no", async () => {
    expect(await ownCardCandidacy(await selfCardIdForVault(KID), KID_CHILD, ALL)).toBe("no");
    expect(await ownCardCandidacy("x", null, ALL)).toBe("no");
  });
  it("an empty id is never a candidate", async () => {
    expect(await ownCardCandidacy("", LANDING, ALL)).toBe("no");
    expect(await isOwnCardIn("", LANDING, ALL)).toBe(false);
  });
  it("his derived card: derived", async () => {
    expect(await ownCardCandidacy(await selfCardIdForVault(P), LANDING, ALL)).toBe("derived");
  });
  it("any other record in his seat: only the finding can make it his", async () => {
    expect(await ownCardCandidacy(LEGACY, LANDING, ALL)).toBe("finding");
    expect(await ownCardCandidacy("ada-06gn7dsf5xs9n50y392hmp58y4", LANDING, ALL)).toBe("finding");
  });
  it("a finding that names the record makes it his; one that names another card, or none, does not", async () => {
    const f = (cardId: string | null) => ({ cardId, cardUri: cardId ? `${P}/e/${cardId}` : null, road: "pointer" as const, otherOwnerCards: [], otherOwnerCardsKnown: true, ignoredPointer: null });
    expect(await isOwnCardIn(LEGACY, LANDING, ALL, f(LEGACY))).toBe(true);
    expect(await isOwnCardIn(LEGACY, LANDING, ALL, f(OTHER_LEGACY))).toBe(false);
    expect(await isOwnCardIn(LEGACY, LANDING, ALL, f(null))).toBe(false);
    expect(await isOwnCardIn(LEGACY, LANDING, ALL, null)).toBe(false);
  });
  it("his sibling root counts too: /base and /vault on one origin are one vault", async () => {
    const siblingId = await selfCardIdForVault(`${ORIGIN}/base`);
    expect(await ownCardCandidacy(siblingId, LANDING, ALL)).toBe("derived");
  });
});

describe("useOwnCard: a record that cannot be his reads nothing and is never read only", () => {
  it("an ordinary contact answers 'not own' on the first render and makes no request at all", async () => {
    const w = await world();
    const qc = newQc();
    const { result } = renderHook(() => useOwnCard({ id: "ada-06gn7dsf5xs9n50y392hmp58y4", typeUri: "t:Person" }, P, ALL), { wrapper: wrap(qc) });
    expect(result.current).toEqual(NOT_OWN);
    await act(async () => {});
    idle(qc, w);
    expect(result.current).toEqual(NOT_OWN);
  });
  it("an owner-shaped id in a vault that is not his seat is 'not own' at once, with no request", async () => {
    const w = await world();
    const qc = newQc();
    const { result } = renderHook(() => useOwnCard({ id: "vsc-0123456789abcdef01234567" }, KID, ALL), { wrapper: wrap(qc) });
    expect(result.current).toEqual(NOT_OWN);
    await act(async () => {});
    idle(qc, w);
  });
  it("with no vault id, or no vault list (no shell), nothing is his", async () => {
    const w = await world();
    const qc = newQc();
    const a = renderHook(() => useOwnCard({ id: "vsc-0123456789abcdef01234567" }, null, ALL), { wrapper: wrap(qc) });
    const b = renderHook(() => useOwnCard({ id: "vsc-0123456789abcdef01234567" }, P, null), { wrapper: wrap(qc) });
    expect(a.result.current).toEqual(NOT_OWN);
    expect(b.result.current).toEqual(NOT_OWN);
    await act(async () => {});
    idle(qc, w);
  });
  it("a vault id that is not in the list is no seat", async () => {
    const { result } = renderHook(() => useOwnCard({ id: "vsc-0123456789abcdef01234567" }, "https://nobody.platform.example.test/vault", ALL), { wrapper: wrap(newQc()) });
    expect(result.current).toEqual(NOT_OWN);
  });
  it("his organisation vault's derived card stays an ordinary, editable record", async () => {
    const w = await world();
    const qc = newQc();
    const { result } = renderHook(() => useOwnCard({ id: "vsc-0123456789abcdef01234567" }, ORG_CHILD.vaultId, ALL), { wrapper: wrap(qc) });
    expect(result.current).toEqual(NOT_OWN);
    await act(async () => {});
    idle(qc, w);
  });
});

describe("useOwnCard: the guard. While the test is pending the card is read only", () => {
  it("his derived card is pending on the first render (read only), then his; the finding is read once for it", async () => {
    const w = await world();
    const { result } = renderHook(() => useOwnCard({ id: w.derivedId, typeUri: "t:Person" }, P, ALL), { wrapper: wrap(newQc()) });
    expect(result.current).toEqual(PENDING);
    await waitFor(() => expect(result.current.own).toBe(true));
    expect(result.current.pending).toBe(false);
    await waitFor(() => expect(result.current.standing.kind).toBe("mynet"));
    expect(w.platform.readCount("t1kai-vault")).toBe(1);
  });
  it("his derived card is his as soon as the digest is in, without waiting for the finding (read in flight, own already, standing unknown)", async () => {
    const g = gate<null>();
    const w = await world({ read: async (id) => (id === "t1kai-vault" ? (await g.promise, null) : null) });
    const { result } = renderHook(() => useOwnCard({ id: w.derivedId }, P, ALL), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(result.current.own).toBe(true));
    expect(result.current).toEqual({ pending: false, own: true, standing: { kind: "unknown" } });
    g.release(null);
    await waitFor(() => expect(result.current.standing.kind).toBe("mynet"));
  });
  it("a record that only the pointer can make his stays pending (read only) while the finding is out", async () => {
    const g = gate<null>();
    const w = await world({ pointer: { "@id": `${P}/e/${LEGACY}` }, cards: [LEGACY], read: async (id) => (id === "t1kai-vault" ? (await g.promise, null) : null) });
    const { result } = renderHook(() => useOwnCard({ id: LEGACY }, P, ALL), { wrapper: wrap(newQc()) });
    expect(result.current).toEqual(PENDING);
    await waitFor(() => expect(w.platform.readCount("t1kai-vault")).toBe(1));
    expect(result.current).toEqual(PENDING);
    g.release(null);
    await waitFor(() => expect(result.current.own).toBe(true));
    expect(result.current).toEqual({ pending: false, own: true, standing: expect.objectContaining({ kind: "mynet" }) });
  });
  it("the digest never answers: the card stays pending, read only, and the finding is never asked", async () => {
    const w = await world();
    vi.spyOn(crypto.subtle, "digest").mockImplementation(() => new Promise(() => {}));
    const qc = newQc();
    const { result } = renderHook(() => useOwnCard({ id: w.derivedId }, P, ALL), { wrapper: wrap(qc) });
    await waitFor(() => expect(qc.getQueryState(["own-card", "ids", P])?.fetchStatus).toBe("fetching"));
    await act(async () => {});
    expect(result.current).toEqual(PENDING);
    expect(qc.getQueryState(["own-card", "finding", P])?.fetchStatus).not.toBe("fetching");
    expect(w.platform.seen).toEqual([]);
  });
});

describe("useOwnCard: hard identity only", () => {
  it("a legacy card the vault's pointer names is his, and MyNet's card", async () => {
    const w = await world({ pointer: { "@id": `${P}/e/${LEGACY}` }, cards: [LEGACY] });
    const { result } = renderHook(() => useOwnCard({ id: LEGACY }, P, ALL), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(result.current.own).toBe(true));
    expect(result.current.standing).toEqual({ kind: "mynet", alsoCards: [`${P}/e/${w.derivedId}`] });
  });
  it("the pointer can be a bare string, or a list, and still names the card", async () => {
    for (const pointer of [`${P}/e/${LEGACY}`, [`${P}/e/${LEGACY}`], [{ "@id": `${P}/e/${LEGACY}` }]]) {
      tearDown();
      setUp();
      await world({ pointer, cards: [LEGACY] });
      const { result } = renderHook(() => useOwnCard({ id: LEGACY }, P, ALL), { wrapper: wrap(newQc()) });
      await waitFor(() => expect(result.current.own, JSON.stringify(pointer)).toBe(true));
    }
  });
  it("a legacy-shaped record the pointer does not name is an ordinary record once the finding is in (not read only)", async () => {
    await world({ pointer: { "@id": `${P}/e/${OTHER_LEGACY}` }, cards: [OTHER_LEGACY, LEGACY] });
    const { result } = renderHook(() => useOwnCard({ id: LEGACY }, P, ALL), { wrapper: wrap(newQc()) });
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current).toEqual(NOT_OWN);
  });
  it("a record merely NAMED 'MNB Profile ...' with no pointer to it is ordinary", async () => {
    await world({ cards: ["mnb-profile-services-as-06gn7dt12xsendqmdbax55b3b4"] });
    const { result } = renderHook(() => useOwnCard({ id: "mnb-profile-services-as-06gn7dt12xsendqmdbax55b3b4" }, P, ALL), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current).toEqual(NOT_OWN);
  });
  it("when the pointer names another card, the derived card is his and the band can send him to MyNet's card", async () => {
    const w = await world({ pointer: { "@id": `${P}/e/${LEGACY}` }, cards: [LEGACY] });
    const { result } = renderHook(() => useOwnCard({ id: w.derivedId }, P, ALL), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(result.current.standing.kind).toBe("other"));
    expect(result.current).toEqual({ pending: false, own: true, standing: { kind: "other", mynetCardId: LEGACY, mynetCardUri: `${P}/e/${LEGACY}` } });
  });
  it("a pointer at a record of another vault is not followed, so that record is not his", async () => {
    await world({ pointer: { "@id": `${new URL(KID).origin}/vault/e/${LEGACY}` }, cards: [LEGACY] });
    const { result } = renderHook(() => useOwnCard({ id: LEGACY }, P, ALL), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.own).toBe(false);
  });
});

describe("useOwnCard: a finding that fails", () => {
  it("for a record only the pointer can make his, a failed finding means an ordinary record, never 'his by id'", async () => {
    await world({ read: (id) => (id === "t1kai-vault" ? resp(500) : null) });
    const { result } = renderHook(() => useOwnCard({ id: LEGACY }, P, ALL), { wrapper: wrap(newQc()) });
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current).toEqual(NOT_OWN);
  });
  it("his derived card is still his when the finding fails (the standing is unknown)", async () => {
    const w = await world({ read: (id) => (id === "t1kai-vault" ? resp(500) : null) });
    const qc = newQc();
    const { result, rerender } = renderHook(() => useOwnCard({ id: w.derivedId }, P, ALL), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.own).toBe(true));
    await waitFor(() => expect(qc.getQueryState(["own-card", "finding", P])?.status).toBe("error"));
    rerender();
    expect(result.current).toEqual({ pending: false, own: true, standing: { kind: "unknown" } });
  });
  it("the digest rejects: no derived id, so nothing is his by id; the card is pending until the finding is in", async () => {
    const w = await world({ pointer: { "@id": `${P}/e/${LEGACY}` }, cards: [LEGACY] });
    vi.spyOn(crypto.subtle, "digest").mockRejectedValue(new Error("no WebCrypto"));
    const g = renderHook(() => useOwnCard({ id: w.derivedId }, P, ALL), { wrapper: wrap(newQc()) });
    expect(g.result.current).toEqual(PENDING);
    await waitFor(() => expect(g.result.current.pending).toBe(false));
    // `own-card`'s `ownCardIds` swallows a failed digest, so the derived card is NOT recognised; with the pointer naming another card it is ordinary.
    expect(g.result.current).toEqual(NOT_OWN);
  });
});

describe("useOwnCard: one finding for the session", () => {
  it("two cards (and a second hook for the same card) share one read of the vault's pointer", async () => {
    const w = await world({ pointer: { "@id": `${P}/e/${LEGACY}` }, cards: [LEGACY] });
    const qc = newQc();
    const a = renderHook(() => useOwnCard({ id: LEGACY }, P, ALL), { wrapper: wrap(qc) });
    const b = renderHook(() => useOwnCard({ id: w.derivedId }, P, ALL), { wrapper: wrap(qc) });
    await waitFor(() => expect(a.result.current.own).toBe(true));
    await waitFor(() => expect(b.result.current.own).toBe(true));
    await waitFor(() => expect(b.result.current.standing.kind).toBe("other"));
    expect(w.platform.readCount("t1kai-vault")).toBe(1);
  });
  it("the reads go to the holder's own vault node, never the platform's apex", async () => {
    const w = await world({ pointer: { "@id": `${P}/e/${LEGACY}` }, cards: [LEGACY] });
    const { result } = renderHook(() => useOwnCard({ id: LEGACY }, P, ALL), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(result.current.own).toBe(true));
    const urls = w.platform.readUrls();
    expect(urls).toContain(`${ORIGIN}/lws/r/t1kai-vault`);
    expect(urls.filter((u) => !u.startsWith(`${ORIGIN}/`))).toEqual([]);
  });
  it("it never writes: only GET requests are made", async () => {
    const w = await world({ pointer: { "@id": `${P}/e/${LEGACY}` }, cards: [LEGACY] });
    const { result } = renderHook(() => useOwnCard({ id: LEGACY }, P, ALL), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(result.current.own).toBe(true));
    expect(w.platform.seen.every((s) => s.method === "GET")).toBe(true);
  });
});
