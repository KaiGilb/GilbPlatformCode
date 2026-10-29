// The holder's connections: the placements, the composed list per member, and the read of the rung-membership route.
import { describe, expect, it } from "vitest";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import {
  ATOMIC_PLACEMENTS,
  AUDIENCE_RUNG_MEMBERS_PATH,
  AudienceRungMembershipError,
  DERIVED_UNIONS,
  atomicRungTerm,
  composeConnectionsFromSets,
  displayPlacements,
  placementKey,
  placementLabel,
  placementOf,
  placementsEqual,
  qualifiesForDerivedUnion,
  readConnections,
  type AtomicPlacement,
  type AudienceRungSetRecord,
} from "./index";

const HOLDER = "https://id.example.test/base/p/holder";
const VAULT = "https://holder.example.test/base";
const ANN = "https://ann.example.test/i";
const P3 = "https://p3.example.test/i";
const BEN = "https://ben.example.test/base";
const GROUP = "https://group.example.test/base";

const PC = { context: "personal", depth: "close-circle" } as const;
const PF = { context: "personal", depth: "first-degree" } as const;
const XC = { context: "professional", depth: "close-circle" } as const;
const XF = { context: "professional", depth: "first-degree" } as const;

function set(p: AtomicPlacement, members: string[]): AudienceRungSetRecord {
  return { ...p, rungTerm: atomicRungTerm(p), setUri: `https://x/e/${p.context}-${p.depth}`, members };
}

/** A fake platform: records every request, answers with the given status and body. */
function fakeClient(status: number, body: unknown, origin = "https://id.example.test") {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client: PlatformClient = {
    origin,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const text = typeof body === "string" ? body : JSON.stringify(body);
      return new Response(text, { status, headers: { "content-type": "application/json" } });
    },
  };
  return { client, calls };
}

describe("connections", () => {
  describe("placements", () => {
    it("has exactly the four storable placements, broader rung first within each context", () => {
      expect(ATOMIC_PLACEMENTS).toEqual([PF, PC, XF, XC]);
      expect(Object.isFrozen(ATOMIC_PLACEMENTS)).toBe(true);
    });

    it("names each placement by its own t:*Grantee CURIE", () => {
      expect(atomicRungTerm(PC)).toBe("t:PersonalCloseCircleGrantee");
      expect(atomicRungTerm(XC)).toBe("t:ProfessionalCloseCircleGrantee");
      expect(atomicRungTerm(PF)).toBe("t:PersonalFirstDegreeGrantee");
      expect(atomicRungTerm(XF)).toBe("t:ProfessionalFirstDegreeGrantee");
    });

    it("labels close-circle as Inner Circle and first-degree as 1st Connection", () => {
      expect(ATOMIC_PLACEMENTS.map(placementLabel)).toEqual([
        "Personal · 1st Connection",
        "Personal · Inner Circle",
        "Professional · 1st Connection",
        "Professional · Inner Circle",
      ]);
    });

    it("keys and compares placements by both axes", () => {
      expect(placementKey(PC)).not.toBe(placementKey(PF));
      expect(placementKey(PC)).not.toBe(placementKey(XC));
      expect(placementsEqual(PC, { context: "personal", depth: "close-circle" })).toBe(true);
      expect(placementsEqual(PC, XC)).toBe(false);
    });

    it("draws Inner only when Inner and 1st are both stored in a context (Inner includes 1st on the wire)", () => {
      expect(displayPlacements([PF, PC, XF])).toEqual([PC, XF]);
      expect(displayPlacements([XC, XF])).toEqual([XC]);
      expect(displayPlacements([PF])).toEqual([PF]);
      expect(displayPlacements([])).toEqual([]);
    });

    it("derives the either-context unions as a union of the two same-depth sets, never stored", () => {
      const close = DERIVED_UNIONS.find((u) => u.depth === "close-circle")!;
      const first = DERIVED_UNIONS.find((u) => u.depth === "first-degree")!;
      const sets = [set(PC, []), set(XC, [ANN]), set(PF, [P3]), set(XF, [])];
      expect(qualifiesForDerivedUnion(ANN, sets, close)).toBe(true);
      expect(qualifiesForDerivedUnion(ANN, sets, first)).toBe(false);
      expect(qualifiesForDerivedUnion(P3, sets, first)).toBe(true);
      expect(qualifiesForDerivedUnion(P3, sets, close)).toBe(false);
      expect(qualifiesForDerivedUnion(ANN, [], close)).toBe(false);
    });
  });

  describe("composeConnectionsFromSets", () => {
    it("returns empty for empty sets", () => {
      expect(composeConnectionsFromSets([])).toEqual([]);
    });

    it("composes the four sets one entry per member, placements in display order", () => {
      const people = composeConnectionsFromSets([
        set(PC, [ANN]),
        set(XC, [ANN, P3]),
        set(PF, []),
        set(XF, [BEN]),
      ]);
      expect(people.map((p) => p.principal)).toEqual([ANN, BEN, P3]);
      expect(people[0]!.placements).toEqual([PC, XC]);
      expect(people[1]!.placements).toEqual([XF]);
      expect(people[2]!.placements).toEqual([XC]);
    });

    it("keeps Inner and 1st both, as stored, for a member placed Inner (the chip collapse is displayPlacements)", () => {
      const [p] = composeConnectionsFromSets([set(PC, [ANN]), set(PF, [ANN])]);
      expect(p!.placements).toEqual([PF, PC]);
      expect(displayPlacements(p!.placements)).toEqual([PC]);
    });

    it("shows a member in two contexts once, with both placements", () => {
      const people = composeConnectionsFromSets([set(PF, [ANN]), set(XC, [ANN])]);
      expect(people).toHaveLength(1);
      expect(people[0]!.placements).toEqual([PF, XC]);
    });

    it("passes group vault members through unchanged when no admit rule is given", () => {
      const people = composeConnectionsFromSets([set(PC, [ANN, GROUP])]);
      expect(people.map((p) => p.principal).sort()).toEqual([GROUP, ANN].sort());
    });

    it("drops the members the app's admit rule refuses (the server's not-a-person ruling)", () => {
      const people = composeConnectionsFromSets([set(PC, [ANN, GROUP])], { admit: (m) => m !== GROUP });
      expect(people.map((p) => p.principal)).toEqual([ANN]);
    });

    it("never invents a placement: unexpected context or depth is ignored, blank members are skipped", () => {
      const bad = { context: "either", depth: "close-circle", rungTerm: "x", setUri: "u", members: [ANN] } as unknown as AudienceRungSetRecord;
      const people = composeConnectionsFromSets([bad, set(PF, ["", "  ", P3])]);
      expect(people).toEqual([{ principal: P3, placements: [PF] }]);
    });

    it("does not repeat a placement when a member is listed twice in one set", () => {
      const people = composeConnectionsFromSets([set(PF, [ANN, ANN])]);
      expect(people).toEqual([{ principal: ANN, placements: [PF] }]);
    });

    it("orders more placements first, then by principal string", () => {
      const people = composeConnectionsFromSets([set(PF, ["https://b/i", "https://a/i", "https://c/i"]), set(XF, ["https://c/i"])]);
      expect(people.map((p) => p.principal)).toEqual(["https://c/i", "https://a/i", "https://b/i"]);
    });
  });

  describe("placementOf", () => {
    const people = composeConnectionsFromSets([set(PC, [ANN]), set(PF, [ANN]), set(XF, [P3])]);

    it("returns every stored placement of one member", () => {
      expect(placementOf(people, ANN)).toEqual([PF, PC]);
      expect(placementOf(people, P3)).toEqual([XF]);
    });

    it("returns [] for a member the holder has not placed, and compares by exact string", () => {
      expect(placementOf(people, BEN)).toEqual([]);
      expect(placementOf(people, `${ANN}/`)).toEqual([]);
      expect(placementOf([], ANN)).toEqual([]);
    });

    it("returns a copy: changing it does not change the list", () => {
      const got = placementOf(people, ANN);
      got.pop();
      got[0]!.depth = "close-circle";
      expect(placementOf(people, ANN)).toEqual([PF, PC]);
    });
  });

  describe("readConnections", () => {
    const answer = {
      holder: HOLDER,
      vaultId: VAULT,
      sets: [set(PF, [ANN, P3]), set(PC, [ANN]), set(XF, [ANN]), set(XC, [GROUP])],
    };

    it("GETs the route at the vault's node and names the vault in the query", async () => {
      const { client, calls } = fakeClient(200, answer);
      const asked: string[] = [];
      await readConnections(client, {
        vaultId: VAULT,
        vaultOrigin: async (v) => {
          asked.push(v);
          return "https://node2.example.test";
        },
      });
      expect(asked).toEqual([VAULT]);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe(`https://node2.example.test${AUDIENCE_RUNG_MEMBERS_PATH}?vaultId=${encodeURIComponent(VAULT)}`);
      expect(calls[0]!.init?.method).toBe("GET");
      expect(calls[0]!.init?.body).toBeUndefined();
    });

    it("with no vault named, asks the client's origin with no query and does not call vaultOrigin", async () => {
      const { client, calls } = fakeClient(200, answer);
      let called = false;
      await readConnections(client, { vaultOrigin: () => ((called = true), "https://never") });
      await readConnections(client, { vaultId: "  ", vaultOrigin: () => ((called = true), "https://never") });
      expect(called).toBe(false);
      expect(calls.map((c) => c.url)).toEqual([
        `https://id.example.test${AUDIENCE_RUNG_MEMBERS_PATH}`,
        `https://id.example.test${AUDIENCE_RUNG_MEMBERS_PATH}`,
      ]);
    });

    it("trims the vault it names", async () => {
      const { client, calls } = fakeClient(200, answer);
      await readConnections(client, { vaultId: ` ${VAULT} `, vaultOrigin: (v) => (v === VAULT ? "https://n" : "https://wrong") });
      expect(calls[0]!.url).toBe(`https://n${AUDIENCE_RUNG_MEMBERS_PATH}?vaultId=${encodeURIComponent(VAULT)}`);
    });

    it("returns the holder, the vault, the four sets as sent, and the people composed", async () => {
      const { client } = fakeClient(200, answer);
      const got = await readConnections(client, { vaultId: VAULT, vaultOrigin: () => "https://n" });
      expect(got.holder).toBe(HOLDER);
      expect(got.vaultId).toBe(VAULT);
      expect(got.sets).toEqual(answer.sets);
      expect(got.people).toEqual([
        { principal: ANN, placements: [PF, PC, XF] },
        { principal: GROUP, placements: [XC] },
        { principal: P3, placements: [PF] },
      ]);
      expect(displayPlacements(placementOf(got.people, ANN))).toEqual([PC, XF]);
    });

    it("applies the admit rule to people but returns the sets untouched", async () => {
      const { client } = fakeClient(200, answer);
      const got = await readConnections(client, { vaultId: VAULT, vaultOrigin: () => "https://n", admit: (m) => m !== GROUP });
      expect(got.people.map((p) => p.principal)).toEqual([ANN, P3]);
      expect(got.sets[3]!.members).toEqual([GROUP]);
    });

    it("answers empty sets and no people for `sets: []` (a wrong-plane answer is not an error, unchanged)", async () => {
      const { client } = fakeClient(200, { holder: HOLDER, vaultId: "https://other.example.test/base", sets: [] });
      const got = await readConnections(client, { vaultId: VAULT, vaultOrigin: () => "https://n" });
      expect(got).toEqual({ holder: HOLDER, vaultId: "https://other.example.test/base", sets: [], people: [] });
    });

    it("answers empty sets when the body has no sets at all", async () => {
      const { client } = fakeClient(200, { holder: HOLDER });
      const got = await readConnections(client, { vaultOrigin: () => "https://n" });
      expect(got).toEqual({ holder: HOLDER, vaultId: undefined, sets: [], people: [] });
    });

    it("throws AudienceRungMembershipError with the status and the body for a refusal", async () => {
      const { client } = fakeClient(403, "not yours");
      const err = await readConnections(client, { vaultId: VAULT, vaultOrigin: () => "https://n" }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AudienceRungMembershipError);
      expect((err as AudienceRungMembershipError).status).toBe(403);
      expect((err as Error).name).toBe("AudienceRungMembershipError");
      expect((err as Error).message).toBe("AudienceRungMembership 403 — not yours");
    });

    it("names only the status when the refusal has no body", async () => {
      const { client } = fakeClient(404, "");
      const err = await readConnections(client, { vaultOrigin: () => "https://n" }).catch((e: unknown) => e);
      expect((err as Error).message).toBe("AudienceRungMembership 404");
    });

    it("lets a failure of the app's own fetch pass through unchanged (network, sign-in)", async () => {
      class NotSignedInError extends Error {}
      const boom = new NotSignedInError("signed out");
      const client: PlatformClient = { origin: "https://id.example.test", fetch: async () => { throw boom; } };
      await expect(readConnections(client, { vaultOrigin: () => "https://n" })).rejects.toBe(boom);
    });
  });
});
