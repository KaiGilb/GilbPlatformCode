// Old spellings of a placed person past 50 members. Opaque `/base/p/<uuid>` members answer themselves with no request and do not count
// toward the 50; `/i` members (the old WebID form) are asked first; an exact match still asks the `/i` members and joins their circles.
// The limit of 50 stays. Never by name, never URL munging.
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
} from "./index";

const IDENTITY = "https://id.example.test";
const HOLDER = "https://holder.example.test/vault";
const ANN = "https://ann.example.test/vault";
const ANN_OLD = "https://ann.example.test/i"; // the old WebID form the holder placed before the re-mint
const ZED_OLD = "https://zzz-last.example.test/i"; // an old spelling of ANN that sorts after every other member

const PF = { context: "personal", depth: "first-degree" } as const;
const XF = { context: "professional", depth: "first-degree" } as const;

/** The n-th opaque principal (the platform's `/base/p/<uuid>` form). Sorts before every `https://<name>.example.test/...`. */
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

function card(platform: PlatformClient, conn: ConnectionsReading, canonical: PrincipalCanonicaliser = createPrincipalCanonicaliser(platform)) {
  return { platform, connections: async () => conn, canonical };
}

describe("old spellings of a placed person past 50 members", () => {
  describe("person card (placementsFor)", () => {
    it("1. 300 opaque members plus one `/i` old spelling that sorts last: matched, and that member is the ONLY resolve-person request", async () => {
      const id = fakeIdentity({ [ZED_OLD]: ANN });
      const opaques = Array.from({ length: 300 }, (_, i) => opaque(i + 1));
      const conn = reading([set(PF, opaques), set(XF, [ZED_OLD])]);
      expect(conn.people.map((p) => p.principal).at(-1)).toBe(ZED_OLD); // it sorts last
      const s = spy(createPrincipalCanonicaliser(id.platform));
      const got = await resolvePersonCard(card(id.platform, conn, s.c), { principal: ANN });
      expect(got.how).toBe("placement");
      expect(got.placements).toEqual([XF]);
      // Request budget: opaque members cost 0, and are not even handed to the canonicaliser (an app may pass its own).
      expect(id.asked).toEqual([ZED_OLD]);
      expect(s.members).toEqual([ZED_OLD]);
    });

    it("2. an exact member in circle A plus a `/i` spelling in circle B: the card shows A+B", async () => {
      const id = fakeIdentity({ [ANN_OLD]: ANN });
      const conn = reading([set(PF, [ANN]), set(XF, [ANN_OLD])]);
      const got = await resolvePersonCard(card(id.platform, conn), { principal: ANN });
      expect(got.how).toBe("placement");
      expect(got.placements).toEqual([PF, XF]);
      // Only the `/i` member is asked after an exact match.
      expect(id.asked).toEqual([ANN_OLD]);
    });

    it("3. cost guard: an exact match and no `/i` member sends 0 resolve-person requests", async () => {
      const id = fakeIdentity();
      const others = [...Array.from({ length: 10 }, (_, i) => vaultRoot(i)), ...Array.from({ length: 10 }, (_, i) => opaque(i + 1))];
      const conn = reading([set(PF, [ANN, ...others])]);
      const got = await resolvePersonCard(card(id.platform, conn), { principal: ANN });
      expect(got.placements).toEqual([PF]);
      expect(id.asked).toEqual([]);
    });

    it("6. order: `/i` members are asked before the other non-opaque members (the old spelling is found past 50)", async () => {
      const id = fakeIdentity({ [ZED_OLD]: ANN });
      const roots = Array.from({ length: 60 }, (_, i) => vaultRoot(i));
      const s = spy(createPrincipalCanonicaliser(id.platform));
      const conn = reading([set(PF, roots), set(XF, [ZED_OLD])]);
      const got = await resolvePersonCard(card(id.platform, conn, s.c), { principal: ANN });
      expect(got.placements).toEqual([XF]);
      expect(s.members[0]).toBe(ZED_OLD);
      expect(id.asked[0]).toBe(ZED_OLD);
      // The limit stays: never more than 50 requests.
      expect(id.asked.length).toBe(MAX_CANONICAL_LOOKUPS);
    });

    it("8. a trailing slash on an opaque member, with P without it: matched, 0 requests; and opaque members do not count toward the 50", async () => {
      const P = opaque(7);
      const id = fakeIdentity();
      const got = await resolvePersonCard(card(id.platform, reading([set(XF, [`${P}/`])])), { principal: P });
      expect(got.how).toBe("placement");
      expect(got.placements).toEqual([XF]);
      expect(id.asked).toEqual([]);

      // The canonicaliser itself: an opaque member answers itself, is answered, sends nothing, and leaves the bound untouched.
      const id2 = fakeIdentity({ [ANN_OLD]: ANN });
      const c = createPrincipalCanonicaliser(id2.platform, { maxLookups: 1 });
      expect(await c(`${opaque(1)}/`)).toBe(opaque(1));
      expect(await c(opaque(2))).toBe(opaque(2));
      expect(c.answered(`${opaque(1)}/`)).toBe(true);
      expect(await c(ANN_OLD)).toBe(ANN);
      expect(id2.asked).toEqual([ANN_OLD]);
    });

    it("9. never by name or string munging: an `/i` member is placed only on the platform's answer", async () => {
      // The platform names somebody else for this `/i` member: not ANN's placement, though the host reads "ann".
      const other = fakeIdentity({ [ANN_OLD]: "https://someone-else.example.test/vault" });
      const got = await resolvePersonCard(card(other.platform, reading([set(XF, [ANN_OLD])])), { principal: ANN });
      expect(got.how).toBe("none");
      expect(got.placements).toEqual([]);
      // The platform cannot name it (404): still not folded by rewriting `/i` to `/vault`.
      const none = fakeIdentity();
      const got2 = await resolvePersonCard(card(none.platform, reading([set(PF, [ANN]), set(XF, [ANN_OLD])])), { principal: ANN });
      expect(got2.placements).toEqual([PF]);
    });
  });
});
