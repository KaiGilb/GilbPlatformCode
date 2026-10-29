// The person card resolver: a held record or a principal -> the party it is about and the holder's placements of that party.
// Order: the record's `a:sameAs`, the resolver (redirect-followed principal), then P equal to a set member, exact first, then canonical
// through `resolve-person`. Never by name. Read only.
import { describe, expect, it } from "vitest";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import {
  ONLINE_CARD_ANCHOR_PATH,
  RESOLVE_PERSON_PATH,
  MAX_CANONICAL_LOOKUPS,
  composeConnectionsFromSets,
  atomicRungTerm,
  createPrincipalCanonicaliser,
  resolvePersonCard,
  type AtomicPlacement,
  type AudienceRungSetRecord,
  type ConnectionsReading,
  type PersonCardDeps,
} from "./index";

const IDENTITY = "https://id.example.test";
const HOLDER = "https://holder.example.test/vault";
const RECORD = "https://holder.example.test/vault/e/ann-record";
const ANN = "https://ann.example.test/vault";
const ANN_OLD = "https://ann.example.test/i"; // a legacy spelling the holder placed before the re-mint
const BEN = "https://ben.example.test/vault";
const GROUP = "https://group.example.test/vault";

const PF = { context: "personal", depth: "first-degree" } as const;
const PC = { context: "personal", depth: "close-circle" } as const;
const XF = { context: "professional", depth: "first-degree" } as const;

function set(p: AtomicPlacement, members: string[]): AudienceRungSetRecord {
  return { ...p, rungTerm: atomicRungTerm(p), setUri: `https://x/e/${p.context}-${p.depth}`, members };
}

function reading(sets: AudienceRungSetRecord[]): ConnectionsReading {
  return { holder: HOLDER, vaultId: HOLDER, sets, people: composeConnectionsFromSets(sets) };
}

type Answer = { status: number; body?: unknown };

/** A fake identity node: answers the anchor and resolve-person routes from tables, and records every request. */
function fakeIdentity(opts: { anchor?: Answer; resolvePerson?: Record<string, Answer> }) {
  const calls: string[] = [];
  const platform: PlatformClient = {
    origin: IDENTITY,
    fetch: async (url) => {
      calls.push(url);
      const u = new URL(url);
      let a: Answer = { status: 500, body: "unexpected" };
      if (u.pathname === ONLINE_CARD_ANCHOR_PATH) a = opts.anchor ?? { status: 404, body: { code: "no_online_card" } };
      if (u.pathname === RESOLVE_PERSON_PATH) a = opts.resolvePerson?.[u.searchParams.get("input") ?? ""] ?? { status: 404, body: { code: "unresolvable" } };
      return new Response(typeof a.body === "string" ? a.body : JSON.stringify(a.body ?? {}), { status: a.status, headers: { "content-type": "application/json" } });
    },
  };
  return { platform, calls, count: (path: string) => calls.filter((c) => new URL(c).pathname === path).length };
}

const personAnchor = (principal: string): Answer => ({
  status: 200,
  body: { surface: "x", kind: "person", principal, vaultId: null, entity: `${principal}/e/card`, vaultRepresents: "https://veda.example.test/base/t/Person" },
});

const linkedRecord = (target = ANN) => ({ record: { uri: RECORD, link: { state: "linked", target } as const } });

function deps(platform: PlatformClient, connections: () => Promise<ConnectionsReading>, extra: Partial<PersonCardDeps> = {}): PersonCardDeps {
  return { platform, connections, canonical: createPrincipalCanonicaliser(platform), ...extra };
}

describe("resolvePersonCard", () => {
  it("linked and placed: the party is the resolved principal and its placements are the holder's (how = placement)", async () => {
    const id = fakeIdentity({ anchor: personAnchor(ANN) });
    const conn = reading([set(PF, [ANN, BEN]), set(XF, [ANN])]);
    const got = await resolvePersonCard(deps(id.platform, async () => conn), linkedRecord());
    expect(got.party).toBe(ANN);
    expect(got.how).toBe("placement");
    expect(got.placements).toEqual([PF, XF]);
    expect(got.link).toEqual({ state: "linked", target: ANN });
    expect(got.connections).toBe("read");
    // exact match: no resolve-person request at all
    expect(id.count(ONLINE_CARD_ANCHOR_PATH)).toBe(1);
    expect(id.count(RESOLVE_PERSON_PATH)).toBe(0);
  });

  it("matches on the PRINCIPAL the resolver returns, not on the link's spelling (the anchor follows redirects)", async () => {
    // The record still links the old spelling; the resolver names today's principal.
    const id = fakeIdentity({ anchor: personAnchor(ANN) });
    const got = await resolvePersonCard(deps(id.platform, async () => reading([set(PC, [ANN]), set(PF, [ANN])])), linkedRecord(ANN_OLD));
    expect(got.party).toBe(ANN);
    expect(got.how).toBe("placement");
    expect(got.placements).toEqual([PF, PC]);
  });

  it("linked but not placed: the party is known through the link only (how = sameAs), no placements", async () => {
    const id = fakeIdentity({ anchor: personAnchor(ANN), resolvePerson: { [BEN]: { status: 200, body: { principal: BEN, displayName: null, form: "webid" } } } });
    const got = await resolvePersonCard(deps(id.platform, async () => reading([set(PF, [BEN])])), linkedRecord());
    expect(got.party).toBe(ANN);
    expect(got.how).toBe("sameAs");
    expect(got.placements).toEqual([]);
  });

  it("linked to a re-minted principal: a member stored under the old spelling is matched through resolve-person", async () => {
    const id = fakeIdentity({
      anchor: personAnchor(ANN),
      resolvePerson: {
        [ANN_OLD]: { status: 200, body: { principal: ANN, displayName: "Ann", form: "webid" } },
        [BEN]: { status: 200, body: { principal: BEN, displayName: "Ben", form: "webid" } },
      },
    });
    const got = await resolvePersonCard(deps(id.platform, async () => reading([set(PF, [ANN_OLD, BEN])])), linkedRecord());
    expect(got.party).toBe(ANN);
    expect(got.how).toBe("placement");
    expect(got.placements).toEqual([PF]);
    expect(id.calls.some((c) => c === `${IDENTITY}${RESOLVE_PERSON_PATH}?input=${encodeURIComponent(ANN_OLD)}`)).toBe(true);
  });

  it("canonical forms are asked ONCE per member and shared across cards (cached)", async () => {
    const id = fakeIdentity({ anchor: personAnchor(ANN), resolvePerson: { [ANN_OLD]: { status: 200, body: { principal: ANN, displayName: null, form: "webid" } } } });
    const d = deps(id.platform, async () => reading([set(PF, [ANN_OLD, BEN])]));
    await resolvePersonCard(d, linkedRecord());
    await resolvePersonCard(d, linkedRecord());
    await resolvePersonCard(d, { principal: ANN });
    expect(id.count(RESOLVE_PERSON_PATH)).toBe(2); // ANN_OLD and BEN, each once
  });

  it("canonical lookups are bounded: at most MAX_CANONICAL_LOOKUPS members are ever asked", async () => {
    const id = fakeIdentity({ anchor: personAnchor(ANN) });
    const many = Array.from({ length: MAX_CANONICAL_LOOKUPS + 25 }, (_, i) => `https://p${i}.example.test/vault`);
    const got = await resolvePersonCard(deps(id.platform, async () => reading([set(PF, many)])), linkedRecord());
    expect(got.how).toBe("sameAs");
    expect(id.count(RESOLVE_PERSON_PATH)).toBe(MAX_CANONICAL_LOOKUPS);
  });

  it("not linked: nothing is asked (no resolver, no connections) and nothing is matched, ⛔ never by name", async () => {
    const id = fakeIdentity({ anchor: personAnchor(ANN) });
    let connectionsAsked = 0;
    const got = await resolvePersonCard(
      deps(id.platform, async () => {
        connectionsAsked++;
        return reading([set(PF, [ANN])]);
      }),
      { record: { uri: RECORD, link: { state: "none" } } },
    );
    expect(got).toMatchObject({ party: null, how: "none", placements: [], connections: "not-read" });
    expect(id.calls).toEqual([]);
    expect(connectionsAsked).toBe(0);
  });

  it("an ambiguous or malformed link is not matched either", async () => {
    const id = fakeIdentity({ anchor: personAnchor(ANN) });
    for (const link of [{ state: "ambiguous" } as const, { state: "malformed" } as const]) {
      const got = await resolvePersonCard(deps(id.platform, async () => reading([set(PF, [ANN])])), { record: { uri: RECORD, link } });
      expect(got.how).toBe("none");
      expect(got.party).toBeNull();
    }
    expect(id.calls).toEqual([]);
  });

  it("the resolver's one refusal (404) is not matched", async () => {
    const id = fakeIdentity({ anchor: { status: 404, body: { code: "no_online_card" } } });
    const got = await resolvePersonCard(deps(id.platform, async () => reading([set(PF, [ANN])])), linkedRecord());
    expect(got).toMatchObject({ party: null, how: "none", placements: [] });
    expect(got.anchor).toEqual({ kind: "none" });
  });

  it("a record linked to a GROUP vault (organization answer) gets no person placements, even when the group is in a set", async () => {
    const id = fakeIdentity({
      anchor: { status: 200, body: { kind: "organization", principal: null, vaultId: GROUP, entity: `${GROUP}/e/x`, vaultRepresents: "https://veda.example.test/base/t/Organization" } },
    });
    let connectionsAsked = 0;
    const got = await resolvePersonCard(
      deps(id.platform, async () => {
        connectionsAsked++;
        return reading([set(XF, [GROUP])]);
      }),
      linkedRecord(GROUP),
    );
    expect(got).toMatchObject({ party: null, how: "none", placements: [] });
    expect(connectionsAsked).toBe(0);
  });

  it("a group vault IN the sets never matches a person: resolve-person answers not_a_person and it is skipped", async () => {
    const id = fakeIdentity({ anchor: personAnchor(ANN), resolvePerson: { [GROUP]: { status: 404, body: { code: "not_a_person" } } } });
    const got = await resolvePersonCard(deps(id.platform, async () => reading([set(XF, [GROUP])])), linkedRecord());
    expect(got.how).toBe("sameAs");
    expect(got.placements).toEqual([]);
  });

  it("the connections read FAILS: the party is still known, no placements, and the failure is said (connections = failed), not thrown", async () => {
    const id = fakeIdentity({ anchor: personAnchor(ANN) });
    const got = await resolvePersonCard(
      deps(id.platform, async () => {
        throw new Error("network down");
      }),
      linkedRecord(),
    );
    expect(got).toMatchObject({ party: ANN, how: "sameAs", placements: [], connections: "failed" });
  });

  it("the resolver could not be reached: party unknown, no placements, connections not read", async () => {
    const id = fakeIdentity({ anchor: { status: 503, body: {} } });
    let connectionsAsked = 0;
    const got = await resolvePersonCard(
      deps(id.platform, async () => {
        connectionsAsked++;
        return reading([set(PF, [ANN])]);
      }),
      linkedRecord(),
    );
    expect(got).toMatchObject({ party: null, how: "none", placements: [], connections: "not-read" });
    expect(got.anchor).toEqual({ kind: "unavailable", status: 503 });
    expect(connectionsAsked).toBe(0);
  });

  it("uses the app's resolve() seam when given (the card's controller shares ONE resolver request)", async () => {
    const id = fakeIdentity({});
    let asked = 0;
    const got = await resolvePersonCard(
      deps(id.platform, async () => reading([set(PF, [ANN])]), {
        resolve: async (record) => {
          asked++;
          expect(record).toBe(RECORD);
          return { kind: "person", principal: ANN, entity: `${ANN}/e/card` };
        },
      }),
      linkedRecord(),
    );
    expect(asked).toBe(1);
    expect(got.how).toBe("placement");
    expect(id.count(ONLINE_CARD_ANCHOR_PATH)).toBe(0);
  });

  it("subject { principal }: the principal IS the party; placed -> how placement, else how none", async () => {
    const id = fakeIdentity({});
    const d = deps(id.platform, async () => reading([set(PF, [ANN])]));
    expect(await resolvePersonCard(d, { principal: ANN })).toMatchObject({ party: ANN, how: "placement", placements: [PF], link: { state: "none" } });
    const unplaced = await resolvePersonCard({ ...d, canonical: async () => null }, { principal: BEN });
    expect(unplaced).toMatchObject({ party: BEN, how: "none", placements: [] });
    expect(id.count(ONLINE_CARD_ANCHOR_PATH)).toBe(0);
  });

  it("a member that resolve-person could not answer (5xx) is not cached as 'not this person': it is asked again later", async () => {
    let fail = true;
    const calls: string[] = [];
    const platform: PlatformClient = {
      origin: IDENTITY,
      fetch: async (url) => {
        calls.push(url);
        if (fail) return new Response("{}", { status: 503 });
        return new Response(JSON.stringify({ principal: ANN, displayName: null, form: "webid" }), { status: 200 });
      },
    };
    const canonical = createPrincipalCanonicaliser(platform);
    expect(await canonical(ANN_OLD)).toBeNull();
    fail = false;
    expect(await canonical(ANN_OLD)).toBe(ANN);
    expect(await canonical(ANN_OLD)).toBe(ANN);
    expect(calls.length).toBe(2);
  });
});
