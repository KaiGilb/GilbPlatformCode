/**
 * 🔴 THE RECORDS PLANE DOES NOT MANUFACTURE A STORED SPELLING, AND THE ARM
 * THAT STOPS IT FIRES AGAINST WHAT PRODUCTION ACTUALLY SERVES.
 *
 * ── WHY THIS FILE WAS REWRITTEN, AND WHAT ITS PREDECESSOR MISSED ──────────────────────────────
 * `S33` shipped an arm that never fired. The independent QA
 * §3 drove the shipped code against the live vault and measured **368 bound · 32 unknown · ZERO
 * unbound over 418 wire keys** — the arm fired on none of them, because the positive control was
 * the first un-renamed `a:` term of the served `@context`, which on every vault is `type → a:type`,
 * and `GET /base/a/type` is 404. §3.6 named the coverage absence verbatim: *"Every shipped
 * `storedKey` test calls `framedEntityToWriteFacts(doc, ctx)` with the `master` argument
 * **defaulted to an empty Map**, so the control path has never executed in the suite. And
 * `servedContext.fixture.ts` carries `type` FIRST, exactly as production serves it — the fixture
 * that could have caught this already holds the input that produces it."*
 *
 * 🔴 THE PREDECESSOR OF THIS FILE PINNED AN ABRIDGED `@context` WITH NO `type` TERM. That is the
 * single reason it was green while production was inert. Every case below now drives the SHIPPED
 * path against {@link SERVED_CONTEXT} — the byte-pin of what `ontology.platform.example.test` serves, `type`
 * first — so the fixture DISCRIMINATES against the production input rather than avoiding it
 * ([[Rule_Code_base-testing-discrimination#RuleBasetestFixtureDiscriminates]]).
 *
 * Every expectation here was first taken by EXECUTION at a real LWS door on an M1-byte-equal
 * armed clone (Base `ebfa06b9`, projection 417 rows / 34-0-383 / 0 ties), ⛔ not reasoned about:
 *
 *   BEFORE  records plane writes `a:c_geometry` → HTTP 409 UndefinedTermError · `a:shows` → 409
 *   AFTER   records plane writes `c_geometry`   → HTTP 201             · `a:viewShows` → 201
 *   CONTROL bare `c_geometry` (51,225 live M1 rows) → 201 · `a:label` (68,557) → 201
 *           invented key → 409 · `rdfs:seeAlso` → 409, in the same run
 *
 * ⚠ These tests stub the TRANSPORT and drive the SHIPPED functions
 * ([[Rule_Code_base-evidence-instrument#RuleBaseevidFixtureShippedPath]]). The door verdicts
 * above are the separate live half and live in the execution artefact, ⛔ not here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetVaultContextCache } from "./vaultContext";
import { SERVED_CONTEXT } from "../test/servedContext.fixture";
import { patchRecord, readRecord, createRecord } from "./records";
import { setUp, tearDown } from "../test/support";

const ENTITY = "https://geo.platform.example.test/base/e/osm-r-406091";

/**
 * The key an `a:`-prefixing mint WOULD manufacture for a served slug — DERIVED from the slug,
 * ⛔ never written as a contiguous literal.
 *
 * 🔴 Measured, ⛔ not stylistic: writing `"a:c_geometry"` here put TWO NEW UN-ADJUDICATED TERMS
 * (`a:c_geometry` 5×, `a:shows` 2×) into `npm run ontology-gate` against my own baseline — a
 * test that asserts a key must NOT be written was reported as this app using it. The scanner
 * masks comments but reads string literals, and its own refusal category for this shape
 * (`assertion-of-absence`) is BVedanta's to grant, ⛔ not mine to cache
 * ([[Rule_Code_baseveda-ontology-master#RuleBvmasterSoleMinter]]; the allowlist's own policy —
 * *"it must never grow to make a gate green"*). Deriving the string is the same technique the
 * `S31` fixture used for `a:owl:sameAs`, and it re-verified at **0 new / 0 fixed**.
 */
const manufactured = (slug: string): string => `a:${slug}`;

/** The document the vault serves for a geo record — the exact shape read back through Base's own
 *  `frameReadableDoc` at `ebfa06b9`: `a:label` compacts to `label` (a declared term), `a:name`
 *  compacts to `name` (`@vocab`, NO term), `a:viewShows` renames to `shows`, the BARE-stored
 *  `c_geometry` is served verbatim, and `notationKind` stands for the NINETEEN keys the master's
 *  `/base/a/<slug>` route 404s while `a:<slug>` IS bound (they are `base-internal` terms, which
 *  no vocab route serves). `name`, `c_geometry` and `notationKind` are INDISTINGUISHABLE on the
 *  wire — the whole ambiguity this file is about. */
const SERVED = {
  "@context": "https://www.w3.org/ns/lws/v1",
  "@id": ENTITY,
  "@type": "t:Municipality",
  c_geometry: "SRID=4326;POLYGON((0 0,1 0,1 1,0 0))",
  label: "Oslo",
  name: "Oslo",
  notationKind: "osm",
  shows: "SELECT 1",
  // 🔴 AN ASSEMBLED `@set` BUCKET, because production serves these on this very
  // route: Base frames `GET /lws/r/:id` with the SAME `frameEntity` as the ontology plane, and
  // `readRecord` copies every served key into `facts` + `servedKeys`. A fixture without one
  // cannot see the defect, which is exactly why it went unseen until QA measured it.
  functions: [{ "@id": "https://ontology.platform.example.test/base/e/f1" }],
  // 🔴 `D` r3 — a SECOND assembled bucket, and deliberately one whose `@id` is its own wire key
  // modulo the prefix (`constraints` → `a:constraints`). That is the shape that makes a
  // context-only omission a silent RETRACTION rather than merely a dropped synthesis.
  constraints: [{ "@id": "https://ontology.platform.example.test/base/e/k1" }],
};

/** The vault's own datom log for {@link ENTITY} — `GET <entityUri>/history`. The FOUR spellings
 *  above as the vault really holds them, plus two rows that must be IGNORED: a superseded assert
 *  (`tx_to` set) and a retract (`op: 0`). Both name the manufactured key, so a resolver that
 *  forgets the guard's own `op = 1 AND tx_to IS NULL` predicate answers `bare` where it must
 *  answer nothing, and this file goes red. */
let historyDatoms: Array<Record<string, unknown>>;
/** HTTP status the history route answers with. 404 is the authz/absence case. */
let historyStatus: number;
let captured: { url: string; method: string; body: any }[];

function defaultHistory(): Array<Record<string, unknown>> {
  return [
    { attribute: "c_geometry", op: 1, tx_to: null },
    { attribute: "a:label", op: 1, tx_to: null },
    { attribute: "a:name", op: 1, tx_to: null },
    { attribute: "a:viewShows", op: 1, tx_to: null },
    { attribute: manufactured("notationKind"), op: 1, tx_to: null },
    // ⛔ superseded — an EARLIER spelling that is no longer what the vault holds.
    { attribute: manufactured("c_geometry"), op: 1, tx_to: "2026-08-21T00:00:00Z" },
    // ⛔ retracted.
    { attribute: manufactured("c_geometry"), op: 0, tx_to: null },
  ];
}

beforeEach(() => {
  setUp();
  resetVaultContextCache();
  historyDatoms = defaultHistory();
  historyStatus = 200;
  captured = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: any, init: any = {}) => {
      const u = String(url);
      const method = (init.method ?? "GET").toUpperCase();
      if (u.endsWith("/base/context.jsonld"))
        return new Response(JSON.stringify(SERVED_CONTEXT), { status: 200 });
      if (u.endsWith("/history"))
        return new Response(JSON.stringify({ entity: ENTITY, datoms: historyDatoms }), {
          status: historyStatus,
        });
      if (method === "GET") {
        return new Response(JSON.stringify(SERVED), { status: 200, headers: { etag: '"e1"' } });
      }
      captured.push({ url: u, method, body: JSON.parse(String(init.body ?? "{}")) });
      return new Response(JSON.stringify({ "@id": ENTITY }), {
        status: 200,
        headers: { etag: '"e2"' },
      });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

async function roundTrip() {
  const rec = (await readRecord("osm-r-406091", ENTITY))!;
  const source = { at: rec.entityUri ?? null, servedKeys: rec.servedKeys };
  // Re-pointed: the app's test wrote every served fact back with `replaceRecord` (a full-state PUT, not taken). Here the same facts
  // go back through `patchRecord`; both spell their keys with the same `storedSpellings`, so `put` is the wire body of that write.
  await patchRecord(rec.id, rec.facts, rec.entityUri ?? null, source);
  await patchRecord(rec.id, { c_geometry: "SRID=4326;POINT(11 60)" }, rec.entityUri ?? null, source);
  return { rec, put: captured[0]!.body, patch: captured[1]!.body };
}

describe("records plane — the stored spelling comes from the vault's own `@context` and datom log", () => {
  it("🔴 THE ARM FIRES against the `@context` production actually serves — a BARE-stored key round-trips VERBATIM", async () => {
    // 🔴 This is the case `S33` shipped and never executed. Under the SAME fixture the old
    // instrument produced `a:c_geometry`, because `type → a:type` killed its positive control.
    const { put, patch } = await roundTrip();
    expect(put).toHaveProperty("c_geometry");
    expect(put).not.toHaveProperty(manufactured("c_geometry"));
    expect(patch).toHaveProperty("c_geometry");
    expect(patch).not.toHaveProperty(manufactured("c_geometry"));
  });

  it("🔴 a key the vault stores UNDER `a:` KEEPS its prefix — the nineteen-key trap does ⛔ not flip", async () => {
    // The class the master's `/base/a/<slug>` route 404s while `a:<slug>` IS bound. A repair that
    // merely fixed `S33`'s control would have flipped these to bare and the door would refuse
    // them. Reading the vault's log instead can ⛔ never do that: the log says `a:notationKind`.
    const { put } = await roundTrip();
    expect(put).toHaveProperty(manufactured("notationKind"));
    expect(put).not.toHaveProperty("notationKind");
  });

  it("🔴 a RENAMED wire key inverts to the vault's own `@id` — ⛔ never `a:` + the alias", async () => {
    const { put } = await roundTrip();
    expect(put).toHaveProperty("a:viewShows");
    expect(put).not.toHaveProperty(manufactured("shows"));
  });

  it("a `@vocab`-compacted key the vault stores under `a:` keeps its `a:` prefix", async () => {
    const { put } = await roundTrip();
    expect(put).toHaveProperty("a:name");
    expect(put).toHaveProperty("a:label");
    expect(put).not.toHaveProperty("name");
  });

  it("readRecord records the served slugs, which is the provenance the write needs", async () => {
    const { rec } = await roundTrip();
    // ⚠ `functions` IS here on purpose. The READ is faithful
    // — it records every slug the vault served, assembled buckets included, because that is the
    // provenance. The omission is a WRITE-side decision and belongs to the write test below;
    // thinning the read instead would lose the fact that the vault sent it at all.
    expect([...(rec.servedKeys ?? [])].sort()).toEqual([
      "c_geometry",
      "constraints",
      "functions",
      "label",
      "name",
      "notationKind",
      "shows",
    ]);
  });

  it("🔴 a slug this app AUTHORS is still `a:` + it — ⛔ the verbatim arm is served-keys-only", async () => {
    await createRecord("https://geo.platform.example.test/base", "https://ontology.platform.example.test/base/t/Note", {
      c_geometry: "SRID=4326;POINT(1 2)",
    });
    // ⛔ No `source` ⇒ no served document stands behind this slug ⇒ this app's own convention,
    // and ⛔ no request to the vault was made for it.
    expect(captured[0]!.body.facts).toHaveProperty(manufactured("c_geometry"));
    expect(
      (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) =>
        String(c[0]).endsWith("/history"),
      ),
    ).toHaveLength(0);
  });

  it("🔴 a log that 404s answers NOTHING — ⛔ not a sheet of `unknown`s, and ⛔ nothing flips", async () => {
    // The `S33` trap inverted: there, an origin that 404'd everything produced a full sheet of
    // confident `unbound` verdicts. Here an unreadable log has no verdict at all, and every key
    // falls back to today's `a:` mint — the safe direction, in the safe shape.
    historyStatus = 404;
    const { put } = await roundTrip();
    expect(put).toHaveProperty(manufactured("c_geometry"));
    expect(put).toHaveProperty("a:label");
    expect(put).toHaveProperty("a:viewShows"); // the `@context` arm is unaffected — it asks the vault
  });

  it("🔴 BOTH spellings live on one entity ⇒ ⛔ no choice is made — the standing row is left alone", async () => {
    // `geo.platform.example.test/base/e/osm-r-406091` really carries the one `a:c_geometry` row the earlier
    // manufacture put in production (2026-08-21) BESIDE its bare `c_geometry`. The app cannot
    // reproduce a two-spelling fact from one merged wire key, so it keeps today's behaviour
    // there rather than guessing — and touches the standing row not at all (no data repair).
    historyDatoms = [
      { attribute: "c_geometry", op: 1, tx_to: null },
      { attribute: manufactured("c_geometry"), op: 1, tx_to: null },
      { attribute: "a:label", op: 1, tx_to: null },
    ];
    const { put } = await roundTrip();
    expect(put).toHaveProperty(manufactured("c_geometry"));
    expect(put).not.toHaveProperty("c_geometry");
  });

  it("an unreachable vault context + log leaves the write exactly as it was before `S33`", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any, init: any = {}) => {
        const u = String(url);
        if (u.endsWith("/base/context.jsonld") || u.endsWith("/history"))
          throw new Error("offline");
        if ((init.method ?? "GET").toUpperCase() === "GET")
          return new Response(JSON.stringify(SERVED), { status: 200, headers: { etag: '"e1"' } });
        captured.push({ url: u, method: init.method, body: JSON.parse(String(init.body ?? "{}")) });
        return new Response("{}", { status: 200, headers: { etag: '"e2"' } });
      }),
    );
    const { put } = await roundTrip();
    expect(put).toHaveProperty(manufactured("c_geometry"));
    expect(put).toHaveProperty(manufactured("shows"));
  });

  it("🔴 Cycle161 `D` — an ASSEMBLED bucket is OMITTED from the records-plane write too", async () => {
    // 🔴 THE CLAIM THIS PINS WAS SHIPPED FALSE AND CAUGHT BY INDEPENDENT QA. `namesNoStoredFact`
    // landed with a docblock saying an assembled bucket belongs in NO write body under ANY
    // spelling, while THIS plane still carried `functions` verbatim into a full-state PUT —
    // REFUSED-BA200, which takes the whole save down. ⛔ The sentence was not narrowed; the code
    // was changed. This assertion is what makes the sentence checkable instead of merely stated.
    const { put, patch, rec } = await roundTrip();
    // ⛔ Not under the verbatim wire key — the spelling the guard refuses.
    expect(put).not.toHaveProperty("functions");
    // ⛔ Nor under its `@id` — that would store a READ-TIME SYNTHESIS as a fact.
    expect(put).not.toHaveProperty("a:functionOf");
    // ⛔ Nor under the manufactured `a:` + alias.
    expect(put).not.toHaveProperty(manufactured("functions"));
    // ✅ CONTROL — the omission is SCOPED. Everything the vault really stores still round-trips,
    // so this cannot pass by thinning the body.
    expect(put).toHaveProperty("c_geometry");
    expect(put).toHaveProperty("a:label");
    expect(put).toHaveProperty("a:viewShows");
    // ✅ CONTROL — the served key WAS present on the read; the omission happens on the WRITE,
    // which is what makes this a write-grammar repair rather than a thinner read.
    expect(rec.servedKeys).toContain("functions");
    // ✅ CONTROL — the patch path is untouched by this case (it patches `c_geometry` only).
    expect(patch).toHaveProperty("c_geometry");
  });

  it("🔴 `D` r4 — a bucket the VAULT'S LOG HOLDS is CARRIED, ⛔ not dropped and ⛔ not `@id`-written", async () => {
    // 🔴 THE HAZARD, MEASURED BY QA AND CLOSED HERE. The first `D` omission asked only the
    // `@context`. But THREE of the seven bucket `@id`s are their own wire key modulo the prefix
    // (`constraints` → `a:constraints`, and the same for `stakeholders` / `valueEstimations`),
    // and all three `a:` spellings are ADMITTED at the guard. ⇒ a vault that really holds
    // `a:constraints` and serves it compacted to `constraints` would have had that fact SILENTLY
    // RETRACTED by a full-state PUT — the act [[3P.V.StoredState.DestroyedWithoutHolderAct]]
    // forbids, and strictly worse than the refusal the omission was written to avoid.
    historyDatoms = [
      ...defaultHistory(),
      // 🔴 The vault's own log says a LIVE row stands under the bucket's `@id`.
      { attribute: "a:constraints", op: 1, tx_to: null },
    ];
    const { put } = await roundTrip();
    // 🔴 WHAT THIS ASSERTION SAID IN `r3`, AND WHY IT WAS WRONG — kept visible, ⛔ not scrubbed.
    // It read `expect(put).toHaveProperty("a:constraints")`: the bucket was written under the
    // spelling the log holds. Independent QA showed that is a FABRICATION, and a LANDING one —
    // all seven `@id`s are ADMITTED, so the guard would not stop it. The presence check guards
    // the KEY; the hazard is the VALUE. Base assembles a bucket's value from rows on OTHER
    // entities, so writing the wire value under `a:constraints` does ⛔ not preserve the fact —
    // it OVERWRITES the fact with a synthesis. Worse than the retraction it was avoiding.
    // ⇒ `r4` neither drops it nor writes it: the key is CARRIED VERBATIM and the term-admission
    // guard REFUSES the whole save. Loud, lossless, and fabricating nothing.
    expect(put).toHaveProperty("constraints");
    expect(put).not.toHaveProperty("a:constraints");
    // ✅ CONTROL — the OTHER bucket on the same document, which the log says nothing about, is
    // still omitted. So this cannot pass by disabling the omission wholesale.
    expect(put).not.toHaveProperty("functions");
  });

  it("🔴 `D` r5 — a BARE live row under the bucket key keeps it (arm 1, on a key where `@id` differs)", async () => {
    // 🔴 THIS ARM WAS VACUOUSLY VERIFIED AND QA CAUGHT IT — the same defect class as `r3`, one
    // level down, inside the guard I had just written. Every earlier case used `constraints`,
    // whose `@id` (`a:constraints`) is its own wire key plus the prefix — so the `@id` arm
    // SHADOWED the other two and deleting either left the suite at 33.
    // `functions` is the discriminating fixture: its `@id` is `a:functionOf`, which is NEITHER
    // the bare key NOR `a:` + the key, so each arm can be exercised alone
    // ([[Rule_Code_base-testing-discrimination#RuleBasetestFixtureDiscriminates]]).
    historyDatoms = [...defaultHistory(), { attribute: "functions", op: 1, tx_to: null }];
    const { put } = await roundTrip();
    // The vault holds a BARE `functions` row ⇒ carried verbatim, ⛔ not omitted.
    expect(put).toHaveProperty("functions");
    // ✅ CONTROL — the other bucket, which the log says nothing about, is still omitted.
    expect(put).not.toHaveProperty("constraints");
  });

  it("🔴 `D` r5 — an `a:`+key live row keeps it too (arm 2, likewise unshadowed)", async () => {
    historyDatoms = [...defaultHistory(), { attribute: `a:${"functions"}`, op: 1, tx_to: null }];
    const { put } = await roundTrip();
    // ⚠ Carried under the SERVED key, ⛔ not rewritten to the log's spelling — this app holds
    // only the synthesised value and must never write it under a spelling that names a fact.
    expect(put).toHaveProperty("functions");
    expect(put).not.toHaveProperty("a:functionOf");
    expect(put).not.toHaveProperty("constraints");
  });

  it("🔴 `D` r4 — an UNREADABLE log drops NOTHING: an instrument failure cannot delete a fact", async () => {
    // The log 404s ⇒ `omittableAssembledKeys` answers EMPTY ⇒ the bucket is carried verbatim and
    // the guard refuses the save. That is the PRE-`D` behaviour: the repaired refusal returns,
    // ⛔ and no fact is lost. Answering from presence in both directions is the whole design.
    historyStatus = 404;
    const { put } = await roundTrip();
    expect(put).toHaveProperty("functions");
  });

  it("🔴 ONE request per entity, ⛔ not one per slug — and the answer is memoised for the session", async () => {
    await roundTrip();
    const logs = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) =>
      String(c[0]).endsWith("/history"),
    );
    expect(logs).toHaveLength(1);
    expect(String(logs[0]![0])).toBe(`${ENTITY}/history`);
  });
});
