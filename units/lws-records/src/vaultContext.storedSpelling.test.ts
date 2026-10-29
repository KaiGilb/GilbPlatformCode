/**
 * 🔴 THE INSTRUMENT THAT DECIDES A STORED SPELLING, TESTED AS AN INSTRUMENT.
 *
 * ── THE ABSENCE THIS FILE CLOSES, QUOTED ──────────────────────────────────────────────────────
 * The independent QA of this arm, §3.6: *"`grep` over BaseApp `src/**\/*.test.*` for `resolveMasterBindings`, `positiveControl`,
 * `masterBinding`: **zero files**. Every shipped `storedKey` test calls
 * `framedEntityToWriteFacts(doc, ctx)` with the `master` argument **defaulted to an empty Map**,
 * so the control path has never executed in the suite."* That is why a dead arm shipped twice.
 *
 * Every case here drives the SHIPPED {@link resolveStoredSpellings} and {@link storedSpellingFor}
 * ([[Rule_Code_base-evidence-instrument#RuleBaseevidFixtureShippedPath]]) and asserts on the
 * INSTRUMENT'S OWN behaviour — what it can say, what it refuses to say, and what it says when it
 * cannot read anything at all.
 *
 * ⚠ ⛔ NO CASE HERE ASSERTS A DEFECT
 * ([[Rule_Code_base-testing-discrimination#RuleBasetestNoDefectAssertion]]). Every expectation is
 * the CORRECT stored spelling of a key that is really stored that way on M1, read from the QA's
 * own live-store readings; the defect (`a:c_geometry`) appears only as a `not.toHaveProperty`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseVaultContext,
  resetVaultContextCache,
  resolveStoredSpellings,
  storedSpellingFor,
} from "./vaultContext";
import { SERVED_CONTEXT } from "../test/servedContext.fixture";
import { resetLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { setUp, tearDown } from "../test/support";

const ENTITY = "https://geo.platform.example.test/base/e/osm-r-406091";

/** ⛔ Never a contiguous `a:` literal — see the note in `records.storedSpelling.test.ts`. */
const prefixed = (slug: string): string => `a:${slug}`;

/**
 * 🔴 THE TWELVE. Measured on M1 `base` 2026-09-03: `GET <master>/base/a/<slug>` answers **404**
 * for each of these while `a:<slug>` **IS** in the 417-row admitted-predicate projection AND
 * holds live rows — so a served document can carry the bare wire key. They are Base's own
 * `base-internal` machinery vocabulary, which `src/vocab/term-reader.ts` excludes IN SQL and
 * which `src/routes/vocab.ts` says *"[is] never served, by any of the four routes"*.
 *
 * ⚠ This is EVIDENCE, ⛔ not a selector: no shipped code path reads this list, and the shipped
 * resolver carries no key set at all — it asks the vault
 * ([[Rule_Code_base-vault-native-derivation#RuleBasepodNoNewEnumeration]] cl.3).
 */
const TWELVE_LIVE_REACHABLE = [
  "canonicalNotation",
  "declaredIntendedMemberCount",
  "deprecatedNotation",
  "multilangEncode",
  "notationKind",
  "notationStatus",
  "reconciled",
  "relaxedBandAccuracyPercent",
  "relaxedBandDate",
  "searchProjection",
  "searchText",
  "tag",
] as const;

const CTX = parseVaultContext(SERVED_CONTEXT);

let datoms: Array<Record<string, unknown>>;
let status: number;
let urls: string[];

beforeEach(() => {
  setUp();
  resetVaultContextCache();
  urls = [];
  status = 200;
  datoms = [
    { attribute: "c_geometry", op: 1, tx_to: null },
    { attribute: "a:label", op: 1, tx_to: null },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: any) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ entity: ENTITY, datoms }), { status });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("the vault's own datom log is the stored-spelling authority", () => {
  it("🔴 SAYS BOTH WORDS OUT OF ONE RESPONSE — `bare` and `prefixed` off the same log", async () => {
    // 🔴 [[Rule_Code_guard-scripts-reading-a-verdict#RuleGuardreadProveItCanFail]]. Structural
    // here rather than bolted on: both verdicts are read from rows PRESENT in one body, so a
    // response that can produce one can produce the other. An all-one-word sheet is impossible
    // to manufacture from a broken origin, because a broken origin produces no rows at all.
    const out = await resolveStoredSpellings(ENTITY, ["c_geometry", "label"]);
    expect(out.get("c_geometry")).toBe("bare");
    expect(out.get("label")).toBe("prefixed");
    expect(urls).toEqual([`${ENTITY}/history`]);
  });

  it("🔴 A LOG IT CANNOT READ ANSWERS NOTHING — ⛔ never a sheet of verdicts", async () => {
    status = 404;
    expect((await resolveStoredSpellings(ENTITY, ["c_geometry", "label"])).size).toBe(0);
  });

  it("🔴 an EMPTY log answers nothing, and is ⛔ not memoised as a reading", async () => {
    datoms = [];
    expect((await resolveStoredSpellings(ENTITY, ["c_geometry"])).size).toBe(0);
    // A second ask must go back to the network: caching an empty reading would pin a transient
    // failure for the session ([[Rule_Code_instrument-capability#RuleInstcapReadingCarriesSiteAndInstant]]).
    datoms = [{ attribute: "c_geometry", op: 1, tx_to: null }];
    expect((await resolveStoredSpellings(ENTITY, ["c_geometry"])).get("c_geometry")).toBe("bare");
    expect(urls).toHaveLength(2);
  });

  it("reads the GUARD'S OWN predicate — a retracted or superseded spelling is ⛔ not what the vault holds", async () => {
    datoms = [
      { attribute: "c_geometry", op: 0, tx_to: null }, // retract
      { attribute: prefixed("searchText"), op: 1, tx_to: "2026-08-21T00:00:00Z" }, // superseded
      { attribute: "a:label", op: 1, tx_to: null },
    ];
    const out = await resolveStoredSpellings(ENTITY, ["c_geometry", "searchText", "label"]);
    expect(out.has("c_geometry")).toBe(false);
    expect(out.has("searchText")).toBe(false);
    expect(out.get("label")).toBe("prefixed");
  });

  it("BOTH spellings live ⇒ ⛔ no verdict — the app does not choose between two stored facts", async () => {
    datoms = [
      { attribute: "c_geometry", op: 1, tx_to: null },
      { attribute: prefixed("c_geometry"), op: 1, tx_to: null },
    ];
    expect((await resolveStoredSpellings(ENTITY, ["c_geometry"])).has("c_geometry")).toBe(false);
  });

  it("⛔ costs NOTHING for keys the inversion never asks about — a CURIE, an IRI, a non-slug", async () => {
    const out = await resolveStoredSpellings(ENTITY, [
      "owl:sameAs",
      "http://www.w3.org/2002/07/owl#sameAs",
      "@type",
    ]);
    expect(out.size).toBe(0);
    expect(urls).toHaveLength(0);
  });

  it("⛔ a record with no absolute entity URI asks nothing and answers nothing", async () => {
    expect((await resolveStoredSpellings(null, ["c_geometry"])).size).toBe(0);
    expect((await resolveStoredSpellings("osm-r-406091", ["c_geometry"])).size).toBe(0);
    expect(urls).toHaveLength(0);
  });
});

describe("🔴 THE TWELVE LIVE-REACHABLE `a:`-BOUND KEYS DO NOT FLIP", () => {
  it("each of the twelve keeps its `a:` prefix when the vault's log holds it that way", async () => {
    // 🔴 The trap: of the 32 slugs the master 404s, ONE is bound bare and NINETEEN under `a:` —
    // twelve of those with live rows. A repair that merely fixed `S33`'s positive control would
    // have flipped all twelve to a spelling the armed door REFUSES. Reading the vault's own log
    // cannot: the log states `a:<slug>` and the inversion reproduces it.
    datoms = TWELVE_LIVE_REACHABLE.map((s) => ({ attribute: prefixed(s), op: 1, tx_to: null }));
    const spellings = await resolveStoredSpellings(ENTITY, TWELVE_LIVE_REACHABLE);
    const written = TWELVE_LIVE_REACHABLE.map((s) =>
      storedSpellingFor(s, CTX, spellings.get(s) ?? "unknown", true),
    );
    expect(written).toEqual(TWELVE_LIVE_REACHABLE.map(prefixed));
  });

  it("and they keep it when the log cannot be read at all — the fail-safe runs the SAME way", async () => {
    status = 500;
    const spellings = await resolveStoredSpellings(ENTITY, TWELVE_LIVE_REACHABLE);
    expect(spellings.size).toBe(0);
    const written = TWELVE_LIVE_REACHABLE.map((s) =>
      storedSpellingFor(s, CTX, spellings.get(s) ?? "unknown", true),
    );
    expect(written).toEqual(TWELVE_LIVE_REACHABLE.map(prefixed));
  });

  it("🔴 and the SAME run flips `c_geometry` — one population, two directions, one response", async () => {
    // ⛔ Not two runs. The twelve and the one are read off ONE log in ONE call, which is what
    // makes this a falsifiable negative rather than two convenient fixtures
    // ([[Rule_Code_base-evidence-answer#RuleBaseevidFalsifiableNegative]]).
    const population = [...TWELVE_LIVE_REACHABLE, "c_geometry"];
    datoms = [
      ...TWELVE_LIVE_REACHABLE.map((s) => ({ attribute: prefixed(s), op: 1, tx_to: null })),
      { attribute: "c_geometry", op: 1, tx_to: null },
    ];
    const spellings = await resolveStoredSpellings(ENTITY, population);
    const written = population.map((s) =>
      storedSpellingFor(s, CTX, spellings.get(s) ?? "unknown", true),
    );
    expect(written).toEqual([...TWELVE_LIVE_REACHABLE.map(prefixed), "c_geometry"]);
    expect(written).not.toContain(prefixed("c_geometry"));
  });
});

describe("🔴 an EMPTY spellings map is a DIFFERENT answer — the fixture discriminates", () => {
  it("the empty-map default that hid this defect twice produces the manufacture, by name", () => {
    // [[Rule_Code_base-testing-discrimination#RuleBasetestFixtureDiscriminates]]. Every shipped
    // `storedKey` test defaulted this argument to `new Map()`; under that default the arm is
    // indistinguishable from a dead one. This case pins the difference so a future test cannot
    // be green on the empty default and believe it exercised the arm.
    const empty = new Map<string, never>();
    expect(storedSpellingFor("c_geometry", CTX, empty.get("c_geometry") ?? "unknown", true)).toBe(
      prefixed("c_geometry"),
    );
    expect(storedSpellingFor("c_geometry", CTX, "bare", true)).toBe("c_geometry");
  });

  it("`servedByVault = false` never carries a key verbatim, whatever the log says", () => {
    // A slug this app AUTHORS keeps this app's convention — the add-field surface gates it.
    expect(storedSpellingFor("c_geometry", CTX, "bare", false)).toBe(prefixed("c_geometry"));
  });

  it("the earlier arms are untouched: a rename inverts, an `@set` bucket stays verbatim, a CURIE passes", () => {
    expect(storedSpellingFor("shows", CTX, "bare", true)).toBe("a:viewShows");
    expect(storedSpellingFor("functions", CTX, "bare", true)).toBe("functions");
    expect(storedSpellingFor("owl:sameAs", CTX, "bare", true)).toBe("owl:sameAs");
  });
});

// New. The datom-log read is signed through the auth seam and only for a platform host: it was the one dynamic import of the app's
// DPoP module (vaultContext.ts:448). The app's tests mocked that module away, so nothing pinned that the read carries the credential.
describe("the datom-log read and the auth seam", () => {
  it("the read of a platform entity's log carries the read credential, asked for (GET, <entity>/history)", async () => {
    const host = setUp();
    let sentHeaders: Record<string, string> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: any, init: any = {}) => {
        sentHeaders = init.headers;
        return new Response(JSON.stringify({ datoms }), { status });
      }),
    );
    await resolveStoredSpellings(ENTITY, ["c_geometry"]);
    expect(host.dpopReadAuth.mock.calls).toEqual([["GET", `${ENTITY}/history`]]);
    expect(sentHeaders?.authorization).toBe("DPoP tok-read");
    expect(sentHeaders?.accept).toBe("application/json");
  });
  it("an entity on a foreign host is asked at the platform origin, and the seam gives it a header only there", async () => {
    const host = setUp();
    await resolveStoredSpellings("https://evil.example/base/e/x", ["c_geometry"]);
    expect(urls).toEqual(["https://platform.example.test/base/e/x/history"]);
    expect(host.dpopReadAuth.mock.calls).toEqual([["GET", "https://platform.example.test/base/e/x/history"]]);
  });
  it("a seam that is not set reads anonymously: the log of a public entity is public (the app's try/catch is kept)", async () => {
    resetLwsAuth();
    const out = await resolveStoredSpellings(ENTITY, ["c_geometry", "label"]);
    expect(out.get("c_geometry")).toBe("bare");
    expect(urls).toEqual([`${ENTITY}/history`]);
  });
  it("a sign-in that throws reads anonymously too", async () => {
    const host = setUp();
    host.dpopReadAuth.mockRejectedValue(new Error("no session"));
    expect((await resolveStoredSpellings(ENTITY, ["c_geometry"])).get("c_geometry")).toBe("bare");
  });
});
