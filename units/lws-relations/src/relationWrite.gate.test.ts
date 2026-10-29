// The two RELATION-WRITE DOORS — the CURIE that may not be written, and the CURIE that must
// be preserved. Written 2026-08-02 for the typing-gate remediation.
//
// (h) `writePairRelation` THROWS on `t:Relation`. The guard shipped
//     with no test, so nothing stood between the codebase and the defect it was written for
//     (Ann's unlabelled edges, 2026-08-02).
//
// (F2) BVedanta BVGATE_03 §F2: the after-creation act must NOT choose the relation's `@type`.
//      🔴 RE-POINTED 2026-08-16 (DEF-6). The act moved from a client-composed retract PUT to
//      `POST /base/r/:id/end`, which reads the predicate from the store and ignores the body.
//      So the cases below pin the STRONGER property that replaced preservation-by-promise:
//      the client sends no body, no type and no agent, and therefore cannot choose anything.
//      The stored-outcome half of that fix is gated in `relationEnd.def6.test.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `./relationPredicates` is NOT mocked: the real constants must be the ones under test, and
// the act no longer reads the stored `@type` from the client at all (see the F2 block below).
const vaults = vi.hoisted(() => ({ listVaultRecordsPage: vi.fn(async () => ({ records: [], total: 0, complete: true, pageSize: 50, offset: 0 })) }));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readRecord: vi.fn(async (id: string) => ({
    id,
    entityUri: `https://ben.platform.example.test/base/e/${id}`,
    typeUri: "https://ontology.example.test/base/t/ConnectedTo",
    facts: {},
    opaqueFacts: [],
    etag: '"etag"',
  })),
}));
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listVaultRecordsPage: vaults.listVaultRecordsPage,
}));
vi.mock("./relations", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readRelations: vi.fn(async () => []),
}));

import {
  writePairRelation,
  endRelation,
  memberEntityUri,
} from "./relationWrite";
import {
  RELATION_CATEGORY_CURIE,
  GENERIC_PREDICATE_CURIE,
} from "./relationPredicates";
import { __setCatalogForTest, catalogFromGraph } from "./linkPlaneCatalog";
import { setUp, tearDown, type FakeHost } from "../test/support";

function seedLiveUserPlane(): void {
  __setCatalogForTest(
    catalogFromGraph(
      [
        {
          "@id": "https://ontology.example.test/base/t/ConnectedTo",
          "a:label": "connected-to",
          "a:linkPlane": "user",
          "a:typeAttribute": "t:ConnectedTo",
          "a:symmetric": true,
        },
        {
          "@id": "https://ontology.example.test/base/t/Reference",
          "a:label": "references",
          "a:linkPlane": "user",
          "a:typeAttribute": "t:Reference",
          "a:subTypeOf": { "@id": "https://ontology.example.test/base/t/ConnectedTo" },
          "a:symmetric": false,
        },
      ],
      "user",
    ),
  );
}

const VAULT = "https://ben.platform.example.test/base";
const A = "https://ben.platform.example.test/base/e/rec-a";
const B = "https://ben.platform.example.test/base/e/rec-b";

/** Every PUT this suite observes, in order, with its parsed body. */
let puts: { url: string; body: Record<string, unknown> }[] = [];
/** Every POST this suite observes — the after-creation ACT door (`…/end`). */
let posts: { url: string; body: unknown; hasContentType: boolean }[] = [];

let host: FakeHost;

beforeEach(() => {
  host = setUp();
  puts = [];
  posts = [];
  seedLiveUserPlane();
  host.tokenManager.getSession.mockResolvedValue({
    principal: "https://ben.platform.example.test/base/p/ann",
    vault: null,
    vaults: [],
  } as never);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (init?.method === "PUT") {
        puts.push({ url: String(url), body: JSON.parse(String(init.body)) });
      }
      if (init?.method === "POST") {
        const headers = (init.headers ?? {}) as Record<string, string>;
        posts.push({
          url: String(url),
          body: init.body ? JSON.parse(String(init.body)) : null,
          hasContentType: Object.keys(headers).some((h) => h.toLowerCase() === "content-type"),
        });
      }
      return {
        ok: true,
        status: init?.method === "POST" && String(url).includes("/c") ? 201 : 200,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "location" ? `https://ben.platform.example.test/lws/r/servermintedrel000000000001` : null,
        },
        json: async () => ({ changed: true, "@id": "https://ben.platform.example.test/lws/r/servermintedrel000000000001" }),
        text: async () => "",
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  __setCatalogForTest(null);
  tearDown();
});

describe("writePairRelation — the ONE door every relation write passes through", () => {
  it("🔴 THROWS on the CATEGORY term and writes NOTHING (VATester D2/h)", async () => {
    await expect(
      writePairRelation({
        sourceId: "rec-a",
        targetId: "rec-b",
        typeCurie: RELATION_CATEGORY_CURIE,
        vaultNamespace: VAULT,
      }),
    ).rejects.toThrow(/category of predicates, not one of them/i);
    // The refusal is BEFORE the network, not a rollback after it.
    expect(puts).toHaveLength(0);
  });

  it("names the refused CURIE and the generic to use instead — a disclosed refusal", async () => {
    await expect(
      writePairRelation({ sourceId: "a", targetId: "b", typeCurie: RELATION_CATEGORY_CURIE }),
    ).rejects.toThrow(new RegExp(GENERIC_PREDICATE_CURIE));
  });

  it("falls back to the ADJUDICATED GENERIC, never the category, when no CURIE is given", async () => {
    await writePairRelation({
      sourceId: "rec-a",
      targetId: "rec-b",
      vaultNamespace: VAULT,
      sourceEntityUri: A,
      targetEntityUri: B,
    });
    expect(posts.filter((p) => String(p.url).includes("/c"))).toHaveLength(0);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.url).toMatch(/\/base\/r\//);
    expect(puts[0]!.body.type).toBe("t:ConnectedTo");
    expect(puts[0]!.body.type).not.toBe("ConnectedTo");
    expect(puts[0]!.body.type).not.toBe(RELATION_CATEGORY_CURIE);
  });

  it("refuse board: washed / easy-to-use / speaks / wrecked create NO join", async () => {
    for (const bad of ["washed", "easy-to-use", "speaks", "wrecked", "t:Washed"]) {
      await expect(
        writePairRelation({
          sourceId: "rec-a",
          targetId: "rec-b",
          typeCurie: bad,
          vaultNamespace: VAULT,
          sourceEntityUri: A,
          targetEntityUri: B,
        }),
      ).rejects.toThrow(/not a live user-plane join/i);
    }
    expect(puts).toHaveLength(0);
  });

  it("writes the chosen predicate and both members by their framed @id", async () => {
    await writePairRelation({
      sourceId: "rec-a",
      targetId: "rec-b",
      typeCurie: "t:Reference",
      vaultNamespace: VAULT,
      sourceEntityUri: A,
      targetEntityUri: B,
    });
    expect(posts.filter((p) => String(p.url).includes("/c"))).toHaveLength(0);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.url).toMatch(/\/base\/r\//);
    expect(puts[0]!.body).toMatchObject({
      type: "t:Reference",
      facts: { "role:source": { "@id": A }, "role:target": { "@id": B } },
    });
    expect(puts[0]!.body.type).not.toBe("Reference");
    expect(puts[0]!.body.vault).toBe(VAULT);
  });
});

describe("endRelation — the act CANNOT choose the relation's @type (BVGATE_03 F2)", () => {
  // ── WHY THIS BLOCK CHANGED SHAPE, 2026-08-16 (DEF-6) ─────────────────────────────────
  // F2's contract is unchanged and is now met MORE strongly, not less. The old cases pinned
  // "the retract PUT re-sends the type it READ" — a promise the client had to keep every time.
  // The act now goes through `POST /base/r/:id/end`, whose body Base ignores by design: the
  // predicate is read from the store server-side (invariant (a) of src/write/relation-end.ts).
  //
  // So the client no longer sends a `type` AT ALL, and the F2 failure it was written against
  // — the client stamping a substitute CURIE on a retract — is now structurally unreachable
  // rather than merely tested for. These cases pin THAT: no body, no type, no agent.
  //
  // ⛔ The block is re-pointed, never dropped. What it guards still exists; what performs the
  // act moved. The stored-outcome half of the same fix is gated in `relationEnd.def6.test.ts`.

  it("🔴 sends NO body at all — so it cannot name a type, a category term, or an agent", async () => {
    await endRelation("rel-1");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body).toBeNull();
    expect(posts[0]!.hasContentType).toBe(false);
  });

  it("🔴 uses the ACT route, never the upsert PUT that mints a relation somewhere else", async () => {
    await endRelation("rel-2");
    expect(posts[0]!.url).toMatch(/\/base\/r\/rel-2\/end$/);
    // The PUT door is what routed an unqualified end into the principal's own vault (DEF-6).
    expect(puts).toHaveLength(0);
  });

  it("🔴 the CATEGORY term cannot reach the wire on this path — there is no wire to reach", async () => {
    await endRelation("rel-3");
    const wire = JSON.stringify(posts[0]);
    expect(wire).not.toContain(RELATION_CATEGORY_CURIE);
    expect(wire).not.toContain(GENERIC_PREDICATE_CURIE);
  });

  it("accepts a full relation URI and acts on its id tail", async () => {
    await endRelation("https://ben.platform.example.test/base/r/rel-5");
    expect(posts[0]!.url).toMatch(/\/base\/r\/rel-5\/end$/);
  });
});

describe("memberEntityUri — the framed @id wins over anything composed", () => {
  it("prefers the caller's framed @id even when a vault namespace is offered", () => {
    expect(memberEntityUri("rec-a", A, "https://other.platform.example.test/base")).toBe(A);
  });

  it("passes an id through untouched when it is already absolute", () => {
    expect(memberEntityUri(A, null, VAULT)).toBe(A);
  });
});
