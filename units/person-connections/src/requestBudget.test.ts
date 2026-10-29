// Request budget of the person card against a fake identity node that records every resolve-person input.
import { describe, expect, it } from "vitest";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import {
  MAX_CANONICAL_LOOKUPS, RESOLVE_PERSON_PATH, atomicRungTerm, composeConnectionsFromSets, createPrincipalCanonicaliser, resolvePersonCard,
  type AtomicPlacement, type AudienceRungSetRecord, type ConnectionsReading, type PrincipalCanonicaliser,
} from "./index";

const IDENTITY = "https://id.example.test";
const HOLDER = "https://holder.example.test/vault";
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
const card = (platform: PlatformClient, conn: ConnectionsReading, canonical: PrincipalCanonicaliser = createPrincipalCanonicaliser(platform)) => ({ platform, connections: async () => conn, canonical });

describe("request budget of the person card", () => {
  it("T8 card: no exact, 300 opaque + 10 vault roots (no /i): requests == 10 (<= non-opaque), opaque never sent", async () => {
    const id = idNode();
    const conn = reading([set(PF, [...Array.from({ length: 300 }, (_, i) => opaque(i + 1)), ...Array.from({ length: 10 }, (_, i) => root(i))])]);
    const got = await resolvePersonCard(card(id.platform, conn), { principal: "https://ann.example.test/vault" });
    expect(got.placements).toEqual([]);
    expect(id.asked.length).toBe(10);
  });

  it("T9 card: exact match + 60 /i members, the spelling is the 55th /i: at most 50 requests, all /i, none to vault roots", async () => {
    const P = "https://ann.example.test/vault";
    const ois = Array.from({ length: 60 }, (_, i) => old(i));
    const id = idNode({ [ois[54]]: P });
    const conn = reading([set(PF, [P, ...Array.from({ length: 20 }, (_, i) => root(i))]), set(XF, ois)]);
    const got = await resolvePersonCard(card(id.platform, conn), { principal: P });
    expect(id.asked.length).toBe(MAX_CANONICAL_LOOKUPS);
    expect(id.asked.every((m) => m.endsWith("/i"))).toBe(true);
    // Bound honest: the 55th sorted /i member is past the 50 and is not folded (no silent over-claim either).
    expect(got.placements).toEqual([PF]);
  });

  it("T10 opaque member on another host and with #me: answers itself, 0 requests, and is not P's placement", async () => {
    const id = idNode();
    const c = createPrincipalCanonicaliser(id.platform);
    expect(await c(opaque(3, "https://ben.example.test"))).toBe(opaque(3, "https://ben.example.test"));
    expect(await c(`${opaque(3)}#me`)).toBe(`${opaque(3)}#me`);
    const got = await resolvePersonCard(card(id.platform, reading([set(PF, [opaque(3, "https://ben.example.test")])])), { principal: opaque(3) });
    expect(got.placements).toEqual([]);
    expect(id.asked).toEqual([]);
  });

  it("T13 parity with the platform regex: an upper-case opaque uuid is opaque too (0 requests)", async () => {
    const id = idNode();
    const c = createPrincipalCanonicaliser(id.platform);
    const U = `${IDENTITY}/base/p/ABCDEF00-0000-4000-8000-00000000ABCD`;
    expect(await c(U)).toBe(U);
    expect(id.asked).toEqual([]);
  });
});
