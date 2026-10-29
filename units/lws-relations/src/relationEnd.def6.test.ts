// 🔴 DEF-6 REGRESSION GATE — `End relation` reported success while the relation survived.
//
// Found by independent QA writing to a real vault and reading back ON THE WIRE,
// then confirmed first-hand in the PRODUCTION STORE `base` on M1, 2026-08-16:
//
//   https://admin.platform.example.test/base/r/156ebd6f810b0858b8d43a013d   t:PartOf
//       role:source + role:target STILL LIVE (op=1, tx_to IS NULL) after `End relation`
//       2 rows still in base.relation_members
//   https://id.platform.example.test/base/r/156ebd6f810b0858b8d43a013d      t:PartOf   ← BaseID, a SYSTEM vault
//       1 live fact (a:relationSelf), 0 role facts, created 5 minutes later
//
// The app PUT `{type, agent, facts:{}}` at `/base/r/:id` with NO `pod`. Base resolved the
// create-scope vault to the PRINCIPAL'S OWN VAULT, minted the relation URI under that vault's host,
// and genuinely created something there — so `201 changed:true` was a TRUE answer to a
// question nobody asked, and the connection the person clicked was never touched.
//
// ── WHY THIS FILE ASSERTS THE STORE AND NOT THE STATUS CODE ─────────────────────────────
// [[Rule_Code_base-evidence#RuleBaseevidStateRowNotExistence]]: a response is not evidence of
// a state change. A test that asserted `201`, or that asserted "we called fetch", would have
// been GREEN throughout the defect. So the fake vault below keeps a STORE, every gate asserts
// what is left in that store, and the fixture is built through the shipped write path.
//
// ── THE FAKE VAULT IS A MODEL OF MEASURED BEHAVIOUR, NOT AN INVENTION ─────────────────────
// Each route mirrors the production code path named beside it, and the two-vault shape
// (`OWN_VAULT_HOST` = the principal's own vault ≠ the vault being viewed) is the production shape
// that produced the defect. It is deliberately generous to the OLD client: the PUT succeeds,
// returns 201 and reports `changed:true`, exactly as production did.
//
// ── RED / GREEN, and how this file runs on BOTH sides ───────────────────────────────────
// The fix renames the act (`deleteRelation` → `endRelation`, BVedanta BVGATE_01 2026-08-02 §5:
// `delete`/`retract` may not surface at relation altitude). To keep ONE byte-identical file
// that is RED at the parent and GREEN at the tip, the act is resolved off the module namespace
// rather than imported by a single name. That is the only concession made to the rename; every
// fixture, request and assertion is identical on both sides.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<Record<string, unknown>>()), readRecord: vi.fn(async () => null) }));

// ⚠ NOT MOCKED, on purpose (RuleBasetestMockedModuleNoInstrument): `./relationWrite` is the
// module under change, and `./relationDoc` is the read-back path the new guard depends on. A
// defect planted inside either MUST redden this file, so neither may be stubbed.
import * as relationWrite from "./relationWrite";
import { __setCatalogForTest, catalogFromGraph } from "./linkPlaneCatalog";
import { setUp, tearDown } from "../test/support";

/**
 * Seeds the live user-plane catalog the write gate consults.
 *
 * ⚠ Without this the gate loads the catalog over `fetch`, gets nothing, falls back to
 * `emptyStale()` and refuses EVERY off-fast-path CURIE — the under-seeding trap QA traced in
 * §c, where two `connectedCreate.test.ts` failures looked like a production defect
 * and were a test-environment artefact. `t:PartOf` is on the real live user plane (measured
 * 2026-08-16: `part-of` is one of its five roots, and a childless one).
 */
function seedLiveUserPlane(): void {
  __setCatalogForTest(
    catalogFromGraph(
      [
        {
          "@id": "https://veda.platform.example.test/base/t/PartOf",
          "a:label": "part-of",
          "a:linkPlane": "user",
          "a:typeAttribute": "t:PartOf",
          "a:symmetric": false,
        },
      ],
      "user",
    ),
  );
}

/** The vault being VIEWED — where the connection actually lives. */
const VIEWED_VAULT = "https://admin.platform.example.test/base";
const VIEWED_HOST = "admin.platform.example.test";
/**
 * The vault the PRINCIPAL signs in to — the fallback Base picks when the write names no vault
 * (`writeTargetVaultForRequirer`). On production this is BaseID, a SYSTEM vault. That is the whole
 * mechanism of DEF-6, so the fixture keeps the two hosts different.
 */
const OWN_VAULT_HOST = "id.platform.example.test";

const REL_ID = "def6relationid0001";
const VIEWED_REL = `https://${VIEWED_HOST}/base/r/${REL_ID}`;
const OWN_VAULT_REL = `https://${OWN_VAULT_HOST}/base/r/${REL_ID}`;
const SRC = `https://${VIEWED_HOST}/base/e/def6-source`;
const TGT = `https://${VIEWED_HOST}/base/e/def6-target`;

interface StoredRelation {
  typeUri: string;
  facts: Record<string, unknown>;
}

/** Every relation entity the fake vault holds, keyed by its full stored URI. */
const store = new Map<string, StoredRelation>();

/** Entities that currently bear at least one fact — the resolver's `live` predicate. */
function isLive(entity: string): boolean {
  const rec = store.get(entity);
  return !!rec && Object.keys(rec.facts).length > 0;
}

function roleKeys(facts: Record<string, unknown>): string[] {
  return Object.keys(facts).filter((k) => k.startsWith("role:"));
}

/**
 * Mirrors Base `src/read/entity-uri.ts` `resolveEntityUriById`: exact match on the routed /
 * owner host wins when LIVE, otherwise widen by id tail across hosts preferring a live bearer.
 */
function resolveById(id: string): string | null {
  const constructed = `https://${OWN_VAULT_HOST}/base/r/${id}`;
  if (isLive(constructed)) return constructed;
  const suffix = `/base/r/${id}`;
  const candidates = [...store.keys()].filter((e) => e.endsWith(suffix));
  return candidates.find(isLive) ?? candidates[0] ?? null;
}

interface Captured {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}
let calls: Captured[] = [];

/** Set by a test to make `POST …/end` answer 200 while changing nothing (the liar vault). */
let endIsALie = false;
/** Set by a test to make `POST …/end` act on the principal's own vault regardless of the id. */
let endActsOnOwnVault = false;

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeVault(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = { ...((init?.headers as Record<string, string>) ?? {}) };
  const rawBody = typeof init?.body === "string" ? init.body : null;
  calls.push({ method, url, headers, body: rawBody ? JSON.parse(rawBody) : null });

  const endMatch = /\/base\/r\/([^/]+)\/end$/.exec(url);
  const relMatch = /\/base\/r\/([^/?#]+)$/.exec(url);

  // ── POST /base/r/:id/end — Base src/routes/relation.ts + src/write/relation-end.ts ──────
  if (method === "POST" && endMatch) {
    // Fastify refuses an EMPTY body carrying `content-type: application/json` BEFORE routing.
    // Measured against production 2026-08-16 — modelled so a client that adds the header fails
    // here rather than in front of Ann.
    if (headers["content-type"]?.includes("application/json") && !rawBody) {
      return Promise.resolve(
        json(400, {
          error: "FastifyError",
          message: "Body cannot be empty when content-type is set to 'application/json'",
        }),
      );
    }
    const target = endActsOnOwnVault ? OWN_VAULT_REL : resolveById(endMatch[1]!);
    if (!target || !store.has(target)) return Promise.resolve(json(404, { error: "NotFound" }));
    if (endIsALie) return Promise.resolve(json(200, { relation: target, changed: true }));
    const rec = store.get(target)!;
    // Invariants (a)–(c): preserve the stored @type, drop every role: fact, assert the
    // lifecycle datom. The @type is read from the store and never taken from a caller.
    const kept: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec.facts)) if (!k.startsWith("role:")) kept[k] = v;
    kept["a:relationLifecycleState"] = "ended";
    store.set(target, { typeUri: rec.typeUri, facts: kept });
    return Promise.resolve(json(200, { relation: target, changed: true }));
  }

  // ── PUT /base/r/:id — the UPSERT-AT-A-URL door the defect went through ──────────────────
  if (method === "PUT" && relMatch) {
    const body = (rawBody ? JSON.parse(rawBody) : {}) as {
      type?: string;
      vault?: string;
      facts?: Record<string, unknown>;
    };
    // `targetVault = named vault ?? writeTargetVaultForRequirer(...)` → the principal's OWN vault.
    // Then `relationUri(vaultMintHost(createScopeVault), id)` mints under THAT host. This is the
    // line that made an end write land in a vault nobody chose.
    const host = body.vault ? new URL(body.vault).host : OWN_VAULT_HOST;
    const entity = `https://${host}/base/r/${relMatch[1]!}`;
    const facts = { ...(body.facts ?? {}), "a:relationSelf": { "@id": entity } };
    const existed = store.has(entity);
    store.set(entity, { typeUri: body.type ?? "t:Relation", facts });
    return Promise.resolve(json(201, { entity, changed: true, created: !existed }));
  }

  // ── GET /base/r/:id — compute-on-read, same resolver as the act ─────────────────────────
  if (method === "GET" && relMatch) {
    const target = resolveById(relMatch[1]!);
    if (!target || !store.has(target)) return Promise.resolve(json(404, { error: "NotFound" }));
    const rec = store.get(target)!;
    return Promise.resolve(json(200, { "@id": target, "@type": rec.typeUri, ...rec.facts }));
  }

  return Promise.resolve(json(404, { error: "NotFound", url }));
}

/**
 * The act under test, resolved off the module namespace so this file runs unchanged at the
 * parent commit (`deleteRelation`) and at the tip (`endRelation`). See the header.
 */
type EndAct = (relationIdOrUri: string, vaultNamespace?: string | null) => Promise<unknown>;
const mod = relationWrite as unknown as { endRelation?: EndAct; deleteRelation?: EndAct };
const endAct: EndAct = (mod.endRelation ?? mod.deleteRelation)!;

/** Seeds the connection THROUGH THE SHIPPED WRITE PATH — never by hand-poking the store. */
async function seedConnectionInViewedVault(): Promise<void> {
  await relationWrite.writePairRelation({
    relationId: REL_ID,
    sourceId: SRC,
    targetId: TGT,
    sourceEntityUri: SRC,
    targetEntityUri: TGT,
    typeCurie: "t:PartOf",
    vaultNamespace: VIEWED_VAULT,
  });
}

beforeEach(() => {
  setUp();
  store.clear();
  calls = [];
  endIsALie = false;
  endActsOnOwnVault = false;
  seedLiveUserPlane();
  vi.stubGlobal("fetch", vi.fn(fakeVault));
});

afterEach(() => {
  vi.unstubAllGlobals();
  __setCatalogForTest(null);
  tearDown();
});

describe("DEF-6 — ending a connection must END IT IN THE VAULT IT LIVES IN", () => {
  it("POSITIVE CONTROL — the fixture really does hold both members before the act", async () => {
    await seedConnectionInViewedVault();
    expect(store.has(VIEWED_REL)).toBe(true);
    expect(roleKeys(store.get(VIEWED_REL)!.facts).sort()).toEqual(["role:source", "role:target"]);
    expect(store.get(VIEWED_REL)!.typeUri).toBe("t:PartOf");
  });

  it("🔴 THE GATE — after the act the VIEWED vault holds NO role members (the STORE, not the status)", async () => {
    await seedConnectionInViewedVault();
    await endAct(REL_ID, VIEWED_VAULT);
    // ⛔ Not `expect(res.status).toBe(200)`. The defect answered 201 and changed nothing here.
    expect(roleKeys(store.get(VIEWED_REL)!.facts)).toEqual([]);
  });

  it("🔴 THE GATE — the act mints NOTHING in the principal's own vault (the BaseID stray)", async () => {
    await seedConnectionInViewedVault();
    await endAct(REL_ID, VIEWED_VAULT);
    expect(store.has(OWN_VAULT_REL)).toBe(false);
    expect([...store.keys()].filter((e) => e.includes(OWN_VAULT_HOST))).toEqual([]);
  });

  it("preserves the relation's own stored @type — the client never sends one (BVGATE_03 §F2)", async () => {
    await seedConnectionInViewedVault();
    await endAct(REL_ID, VIEWED_VAULT);
    // The predicate that stopped holding is still readable; the ending is what is asserted.
    expect(store.get(VIEWED_REL)!.typeUri).toBe("t:PartOf");
    expect(store.get(VIEWED_REL)!.facts["a:relationLifecycleState"]).toBe("ended");
    const act = calls.find((c) => c.url.endsWith("/end"));
    expect(act?.body ?? null).toBeNull();
  });

  it("both members stop bearing the connection — nothing else in the vault is touched", async () => {
    await seedConnectionInViewedVault();
    const before = [...store.keys()].sort();
    await endAct(REL_ID, VIEWED_VAULT);
    // UNDER-deletion was the defect; over-deletion would be the catastrophe. The entity set
    // is unchanged — only this relation's role facts are closed.
    expect([...store.keys()].sort()).toEqual(before);
  });
});

describe("DEF-6 — the wire shape of the act", () => {
  it("uses POST …/end, never a PUT that could upsert a fresh relation somewhere else", async () => {
    await seedConnectionInViewedVault();
    calls = [];
    await endAct(REL_ID, VIEWED_VAULT);
    const act = calls.find((c) => c.url.includes(`/base/r/${REL_ID}`) && c.method !== "GET");
    expect(act?.method).toBe("POST");
    expect(act?.url).toMatch(/\/base\/r\/[^/]+\/end$/);
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("sends NO content-type on the empty body — the measured Fastify 400 trap", async () => {
    await seedConnectionInViewedVault();
    calls = [];
    await endAct(REL_ID, VIEWED_VAULT);
    const act = calls.find((c) => c.url.endsWith("/end"))!;
    const ct = Object.keys(act.headers).find((h) => h.toLowerCase() === "content-type");
    expect(ct).toBeUndefined();
  });

  it("accepts a full relation URI and acts on its id tail", async () => {
    await seedConnectionInViewedVault();
    await endAct(VIEWED_REL, VIEWED_VAULT);
    expect(roleKeys(store.get(VIEWED_REL)!.facts)).toEqual([]);
  });
});

describe("DEF-6 — the reported outcome equals the stored outcome, or it REPORTS FAILURE", () => {
  it("🔴 REFUSES to report success when the vault still holds the connection after a 200", async () => {
    await seedConnectionInViewedVault();
    endIsALie = true; // 200 + changed:true, store untouched — DEF-6's exact signature
    await expect(endAct(REL_ID, VIEWED_VAULT)).rejects.toThrow(/still holds this connection/i);
    // and the connection is honestly still there
    expect(roleKeys(store.get(VIEWED_REL)!.facts).sort()).toEqual(["role:source", "role:target"]);
  });

  it("🔴 REFUSES when the act landed in a DIFFERENT vault from the one named", async () => {
    await seedConnectionInViewedVault();
    // A live twin under the principal's own vault — the residue DEF-6 itself leaves behind, and
    // the state in which the id tail alone no longer picks out one relation.
    store.set(OWN_VAULT_REL, { typeUri: "t:PartOf", facts: { "a:relationSelf": { "@id": OWN_VAULT_REL } } });
    endActsOnOwnVault = true;
    await expect(endAct(REL_ID, VIEWED_VAULT)).rejects.toThrow(/not in the vault/i);
    expect(roleKeys(store.get(VIEWED_REL)!.facts).sort()).toEqual(["role:source", "role:target"]);
  });

  it("a 404 is 'already gone' and resolves — never an error the person must act on", async () => {
    await expect(endAct("no-such-relation-at-all", VIEWED_VAULT)).resolves.toBeDefined();
  });

  it("does not require a vault to be named — the host check simply does not fire", async () => {
    await seedConnectionInViewedVault();
    await endAct(REL_ID);
    expect(roleKeys(store.get(VIEWED_REL)!.facts)).toEqual([]);
  });
});
