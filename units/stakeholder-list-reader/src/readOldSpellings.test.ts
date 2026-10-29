// Old spellings of a placed person in the list: opaque `/base/p/<uuid>` members answer themselves with no request and do not count
// toward the canonicaliser's 50; `/i` members (the old WebID form) are asked first; the limit of 50 and the "spellings unresolved"
// flag stay. Never by name, never URL munging.
import { describe, expect, it } from "vitest";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import {
  MAX_CANONICAL_LOOKUPS,
  RESOLVE_PERSON_PATH,
  atomicRungTerm,
  composeConnectionsFromSets,
  createPrincipalCanonicaliser,
  type AtomicPlacement,
  type AudienceRungSetRecord,
  type ConnectionsReading,
  type PrincipalCanonicaliser,
  type ResolveOutcome,
} from "@kaigilb/gilbplatformcode-person-connections";
import { readStakeholderList, type RecordsPage, type StakeholderListDeps } from "./index";

const IDENTITY = "https://id.example.test";
const HOLDER = "https://holder.example.test/vault";
const ANN = "https://ann.example.test/vault";
const ANN_OLD = "https://ann.example.test/i"; // the old WebID form the holder placed before the re-mint
const ZED_OLD = "https://zzz-last.example.test/i"; // an old spelling of ANN that sorts after every other member

const PF = { context: "personal", depth: "first-degree" } as const;
const XF = { context: "professional", depth: "first-degree" } as const;

/** The n-th opaque principal (the platform's `/base/p/<uuid>` form). */
const opaque = (n: number) => `${IDENTITY}/base/p/00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const vaultRoot = (n: number) => `https://m${String(n).padStart(3, "0")}.example.test/vault`;

function set(p: AtomicPlacement, members: string[]): AudienceRungSetRecord {
  return { ...p, rungTerm: atomicRungTerm(p), setUri: `https://x/e/${p.context}-${p.depth}`, members };
}

function reading(sets: AudienceRungSetRecord[]): ConnectionsReading {
  return { holder: HOLDER, vaultId: HOLDER, sets, people: composeConnectionsFromSets(sets) };
}

/**
 * A fake identity node that answers `resolve-person` as the platform does: an opaque principal answers itself (no trailing
 * slash); any other input answers from `aliases` or 404. Records every input asked, in order.
 */
function fakeIdentity(aliases: Record<string, string> = {}) {
  const asked: string[] = [];
  const platform: PlatformClient = {
    origin: IDENTITY,
    fetch: async (url) => {
      const u = new URL(url);
      if (u.pathname !== RESOLVE_PERSON_PATH) return new Response("{}", { status: 500 });
      const input = u.searchParams.get("input") ?? "";
      asked.push(input);
      const isOpaque = /^\/base\/p\/[0-9a-f-]{36}\/?$/i.test(new URL(input).pathname);
      const principal = isOpaque ? input.replace(/\/$/, "") : aliases[input];
      if (!principal) return new Response(JSON.stringify({ code: "unresolvable" }), { status: 404 });
      return new Response(JSON.stringify({ principal, displayName: "x", form: "webid" }), { status: 200, headers: { "content-type": "application/json" } });
    },
  };
  return { platform, asked };
}

/** A canonicaliser wrapper that records which members the caller asked, in order (what the caller asks, not what is sent). */
function spy(inner: PrincipalCanonicaliser) {
  const members: string[] = [];
  const c = Object.assign(
    (m: string) => {
      members.push(m);
      return inner(m);
    },
    { answered: (m: string) => inner.answered?.(m) ?? true },
  );
  return { c, members };
}

/** A list over the given placed people, with one vault of records whose links resolve to the given principals. */
function listDeps(
  people: string[][],
  canonical: PrincipalCanonicaliser,
  links: { id: string; target: string }[] = [],
): StakeholderListDeps {
  const V = HOLDER;
  const conn = reading(people.map((members, i) => set(i === 0 ? PF : XF, members)));
  return {
    holder: HOLDER,
    vaults: [V],
    ownCardIds: [],
    canonical,
    async connections() {
      return conn;
    },
    async listRecords(): Promise<RecordsPage> {
      return { records: links.map((l) => ({ recordId: `${V}/e/${l.id}`, title: l.id, updatedAt: 1 })), next: null };
    },
    async linkedRecordIds() {
      return links.map((l) => `${V}/e/${l.id}`);
    },
    async readLink(id: string) {
      const l = links.find((x) => `${V}/e/${x.id}` === id);
      return l ? { state: "linked" as const, target: l.target } : { state: "none" as const };
    },
    async resolve(id: string): Promise<ResolveOutcome> {
      const l = links.find((x) => `${V}/e/${x.id}` === id);
      return l ? { kind: "person", principal: l.target, entity: `${l.target}/e/card` } : { kind: "none" };
    },
    async readName() {
      return { kind: "none" as const };
    },
  };
}

describe("old spellings of a placed person in the merged list", () => {
  it("a placed-only person under today's principal and under a `/i` spelling, no records: ONE row with the union of circles", async () => {
    const id = fakeIdentity({ [ANN_OLD]: ANN, [ANN]: ANN });
    const list = await readStakeholderList(listDeps([[ANN], [ANN_OLD]], createPrincipalCanonicaliser(id.platform)));
    const rows = list.rows.filter((r) => r.kind !== "self");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: ANN, kind: "placed", placements: [PF, XF] });
    expect(list.spellings).toEqual({ state: "resolved" });
    // Request budget: the `/i` member first, at most every non-opaque member.
    expect(id.asked[0]).toBe(ANN_OLD);
    expect(id.asked.length).toBeLessThanOrEqual(2);
  });

  it("60 opaque members and a link to a person not placed: `spellings: resolved`, 0 requests", async () => {
    const id = fakeIdentity();
    const opaques = Array.from({ length: 60 }, (_, i) => opaque(i + 1));
    const s = spy(createPrincipalCanonicaliser(id.platform));
    const list = await readStakeholderList(listDeps([opaques], s.c, [{ id: "r1", target: "https://notplaced.example.test/vault" }]));
    expect(list.spellings).toEqual({ state: "resolved" });
    expect(list.partial).toBe(false);
    expect(id.asked).toEqual([]);
    expect(s.members).toEqual([]);
  });

  it("order in the list: the `/i` member is asked first, so it is checked even past 50 other members", async () => {
    const id = fakeIdentity({ [ZED_OLD]: ANN });
    const roots = Array.from({ length: 60 }, (_, i) => vaultRoot(i));
    const list = await readStakeholderList(listDeps([[ANN, ...roots], [ZED_OLD]], createPrincipalCanonicaliser(id.platform)));
    expect(id.asked[0]).toBe(ZED_OLD);
    expect(id.asked.length).toBe(MAX_CANONICAL_LOOKUPS);
    expect(list.rows.find((r) => r.key === ANN)).toMatchObject({ kind: "placed", placements: [PF, XF] });
    expect(list.rows.some((r) => r.key === ZED_OLD)).toBe(false);
  });

  it("the limit stays: more than 50 non-opaque members and an unmatched link are still `unresolved` and `partial`, exactly 50 requests", async () => {
    const id = fakeIdentity();
    const roots = Array.from({ length: 55 }, (_, i) => vaultRoot(i));
    const list = await readStakeholderList(
      listDeps([roots], createPrincipalCanonicaliser(id.platform), [{ id: "r1", target: "https://notplaced.example.test/vault" }]),
    );
    expect(list.spellings.state).toBe("unresolved");
    expect(list.partial).toBe(true);
    expect(id.asked.length).toBe(MAX_CANONICAL_LOOKUPS);
  });
});
