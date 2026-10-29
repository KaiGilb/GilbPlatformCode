// The request budget of the spelling check in the list, with a fake identity node that records every `resolve-person` input:
// the `/i` spelling is asked first and folded, opaque members cost nothing, the bound of 50 holds across a card and a list that
// share one canonicaliser, and a person without a seat is never folded by its string.
import { describe, expect, it } from "vitest";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import {
  MAX_CANONICAL_LOOKUPS,
  RESOLVE_PERSON_PATH,
  atomicRungTerm,
  composeConnectionsFromSets,
  createPrincipalCanonicaliser,
  resolvePersonCard,
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
const BEN = "https://ben.example.test/vault";
const PF = { context: "personal", depth: "first-degree" } as const;
const XF = { context: "professional", depth: "first-degree" } as const;
const opaque = (n: number, host = IDENTITY) => `${host}/base/p/00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const root = (n: number) => `https://m${String(n).padStart(3, "0")}.example.test/vault`;
const old = (n: number) => `https://m${String(n).padStart(3, "0")}.example.test/i`;

function set(p: AtomicPlacement, members: string[]): AudienceRungSetRecord {
  return { ...p, rungTerm: atomicRungTerm(p), setUri: `https://x/e/${p.context}-${p.depth}`, members };
}
function reading(sets: AudienceRungSetRecord[]): ConnectionsReading {
  return { holder: HOLDER, vaultId: HOLDER, sets, people: composeConnectionsFromSets(sets) };
}
/** Fake identity node. `persons`: opaque principals with a Person seat (others answer 404 not_a_person, as production does). */
function idNode(aliases: Record<string, string> = {}, persons?: Set<string>) {
  const asked: string[] = [];
  const platform: PlatformClient = {
    origin: IDENTITY,
    fetch: async (url) => {
      const u = new URL(url);
      if (u.pathname !== RESOLVE_PERSON_PATH) return new Response("{}", { status: 500 });
      const input = (u.searchParams.get("input") ?? "").trim();
      asked.push(input);
      const isOpaque = /^\/base\/p\/[0-9a-fA-F-]{36}\/?$/.test(new URL(input).pathname);
      const self = input.replace(/\/$/, "");
      const principal = isOpaque ? (!persons || persons.has(self) ? self : undefined) : aliases[input];
      if (!principal) return new Response(JSON.stringify({ code: isOpaque ? "not_a_person" : "unresolvable" }), { status: 404 });
      return new Response(JSON.stringify({ principal, displayName: null, form: "webid" }), { status: 200 });
    },
  };
  return { platform, asked };
}
function listDeps(sets: AudienceRungSetRecord[], canonical: PrincipalCanonicaliser | undefined, links: { id: string; target: string }[] = []): StakeholderListDeps {
  const V = HOLDER;
  const conn = reading(sets);
  return {
    holder: HOLDER, vaults: [V], ownCardIds: [], canonical,
    async connections() { return conn; },
    async listRecords(): Promise<RecordsPage> { return { records: links.map((l) => ({ recordId: `${V}/e/${l.id}`, title: l.id, updatedAt: 1 })), next: null }; },
    async linkedRecordIds() { return links.map((l) => `${V}/e/${l.id}`); },
    async readLink(id: string) { const l = links.find((x) => `${V}/e/${x.id}` === id); return l ? { state: "linked" as const, target: l.target } : { state: "none" as const }; },
    async resolve(id: string): Promise<ResolveOutcome> { const l = links.find((x) => `${V}/e/${x.id}` === id); return l ? { kind: "person", principal: l.target, entity: `${l.target}/e/card` } : { kind: "none" }; },
    async readName() { return { kind: "none" as const }; },
  };
}
const card = (platform: PlatformClient, conn: ConnectionsReading, canonical: PrincipalCanonicaliser = createPrincipalCanonicaliser(platform)) => ({ platform, connections: async () => conn, canonical });
const others = <R extends { kind: string }>(rows: readonly R[]) => rows.filter((r) => r.kind !== "self");

describe("the spelling check's request budget in the list", () => {
  it("60 vault roots and one /i spelling of a placed opaque person, no links: /i asked first and folded; 50 requests; unresolved and partial (vault roots past 50 unchecked)", async () => {
    const P = opaque(1);
    const id = idNode({ [old(999)]: P });
    const list = await readStakeholderList(listDeps([set(PF, [P, ...Array.from({ length: 60 }, (_, i) => root(i))]), set(XF, [old(999)])], createPrincipalCanonicaliser(id.platform)));
    expect(id.asked[0]).toBe(old(999));
    expect(id.asked.length).toBe(MAX_CANONICAL_LOOKUPS);
    expect(id.asked.some((m) => m.includes("/base/p/"))).toBe(false);
    expect(list.rows.find((r) => r.key === P)).toMatchObject({ kind: "placed", placements: [PF, XF] });
    expect(list.rows.some((r) => r.key === old(999))).toBe(false);
    expect(list.spellings.state).toBe("unresolved");
    expect(list.partial).toBe(true);
  });

  it("300 opaque and one /i spelling of one of them, no links: 1 request, one row, resolved, NOT partial", async () => {
    const opaques = Array.from({ length: 300 }, (_, i) => opaque(i + 1));
    const id = idNode({ [old(1)]: opaques[150]! });
    const list = await readStakeholderList(listDeps([set(PF, opaques), set(XF, [old(1)])], createPrincipalCanonicaliser(id.platform)));
    expect(id.asked).toEqual([old(1)]);
    expect(others(list.rows)).toHaveLength(300);
    expect(list.rows.find((r) => r.key === opaques[150])).toMatchObject({ placements: [PF, XF] });
    expect(list.spellings).toEqual({ state: "resolved" });
    expect(list.partial).toBe(false);
  });

  it("/i present, 10 vault roots and 40 opaque: requests equal 11 (the non-opaque members), resolved", async () => {
    const id = idNode();
    const list = await readStakeholderList(listDeps([set(PF, [...Array.from({ length: 10 }, (_, i) => root(i)), ...Array.from({ length: 40 }, (_, i) => opaque(i + 1))]), set(XF, [old(77)])], createPrincipalCanonicaliser(id.platform)));
    expect(id.asked.length).toBe(11);
    expect(id.asked[0]).toBe(old(77));
    expect(list.spellings).toEqual({ state: "resolved" });
    expect(list.partial).toBe(false);
  });

  it("no /i member and no unmatched link: not-needed, 0 requests (no new cost for holders without old spellings)", async () => {
    const id = idNode();
    const list = await readStakeholderList(listDeps([set(PF, Array.from({ length: 70 }, (_, i) => root(i)))], createPrincipalCanonicaliser(id.platform)));
    expect(list.spellings).toEqual({ state: "not-needed" });
    expect(id.asked).toEqual([]);
    expect(list.partial).toBe(false);
  });

  it("never by name or host: /i and /vault of the same host, platform cannot name the /i: TWO rows, not folded", async () => {
    const id = idNode({ [root(5)]: root(5) });
    const list = await readStakeholderList(listDeps([set(PF, [root(5)]), set(XF, [old(5)])], createPrincipalCanonicaliser(id.platform)));
    expect(others(list.rows).map((r) => (r as { key: string }).key).sort()).toEqual([old(5), root(5)].sort());
    expect(list.spellings).toEqual({ state: "resolved" });
  });

  it("without a canonicaliser and with an /i member: unresolved and partial, the reason counts only the non-opaque members", async () => {
    const list = await readStakeholderList(listDeps([set(PF, [root(1), opaque(1), opaque(2)]), set(XF, [old(1)])], undefined));
    expect(list.spellings).toMatchObject({ state: "unresolved" });
    expect((list.spellings as { reason: string }).reason).toContain(" 2 placed people");
    expect(list.partial).toBe(true);
  });

  it("without a canonicaliser, only opaque members and an unmatched link: resolved (nothing to ask), not partial", async () => {
    const list = await readStakeholderList(listDeps([set(PF, [opaque(1), opaque(2)])], undefined, [{ id: "r", target: "https://np.example.test/vault" }]));
    expect(list.spellings).toEqual({ state: "resolved" });
    expect(list.partial).toBe(false);
  });

  it("a non-person opaque member (production answers not_a_person): the card never matches it; the list row key is its own string", async () => {
    const X = opaque(9);
    const id = idNode({}, new Set());
    const list = await readStakeholderList(listDeps([set(PF, [X]), set(XF, [old(2)])], createPrincipalCanonicaliser(id.platform)));
    expect(others(list.rows).map((r) => (r as { key: string }).key).sort()).toEqual([X, old(2)].sort());
    const got = await resolvePersonCard(card(id.platform, reading([set(PF, [X])])), { principal: ANN });
    expect(got.placements).toEqual([]);
  });

  it("a shared canonicaliser: a card then a list in one session never exceed 50 resolve-person requests in total", async () => {
    const id = idNode();
    const c = createPrincipalCanonicaliser(id.platform);
    const sets = [set(PF, Array.from({ length: 70 }, (_, i) => root(i))), set(XF, [old(1)])];
    await resolvePersonCard(card(id.platform, reading(sets), c), { principal: ANN });
    const list = await readStakeholderList(listDeps(sets, c));
    expect(id.asked.length).toBe(MAX_CANONICAL_LOOKUPS);
    expect(list.spellings.state).toBe("unresolved");
  });

  it("at once: two cards and a list on one canonicaliser concurrently still send at most 50 requests, each member asked once", async () => {
    const id = idNode({ [old(1)]: ANN });
    const c = createPrincipalCanonicaliser(id.platform);
    const sets = [set(PF, [ANN, ...Array.from({ length: 70 }, (_, i) => root(i))]), set(XF, [old(1)])];
    const [a, b, list] = await Promise.all([
      resolvePersonCard(card(id.platform, reading(sets), c), { principal: ANN }),
      resolvePersonCard(card(id.platform, reading(sets), c), { principal: BEN }),
      readStakeholderList(listDeps(sets, c)),
    ]);
    expect(id.asked.length).toBeLessThanOrEqual(MAX_CANONICAL_LOOKUPS);
    expect(new Set(id.asked).size).toBe(id.asked.length);
    expect(a.placements).toEqual([PF, XF]);
    expect(b.placements).toEqual([]);
    expect(list.rows.find((r) => r.key === ANN)).toMatchObject({ placements: [PF, XF] });
  });
});
