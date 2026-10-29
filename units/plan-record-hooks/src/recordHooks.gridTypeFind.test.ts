// @vitest-environment node

/**
 * C1 F-LIVE per type (or union of named types on `?type=`).
 * C2 F-CAT then F-LIVE of those types.
 *
 * ⛔ Empty `?type=` is not F-LIVE.
 * ⛔ App-private `RECORD_TYPE_NAMES` is not F-CAT.
 *
 * Collaborators mocked; `hydrateRecordsPage` is REAL
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterEach as afterEachSetUp, beforeEach as beforeEachSetUp } from "vitest";
import { setUp, tearDown } from "../test/support";
beforeEachSetUp(() => {
  setUp();
});
afterEachSetUp(() => tearDown());
import { RECORD_TYPES } from "@kaigilb/gilbplatformcode-record-types";

/** The registry's type names (the app's `RECORD_TYPE_NAMES` is a hand-kept list of the same names, not taken). */
const RECORD_TYPE_NAMES: readonly string[] = RECORD_TYPES.map((t) => t.typeName);

const vaultSets = vi.hoisted(() => ({
  listVaultRecordsPage: vi.fn(),
  // the census door is ABSENT here (404 → null): this suite is the instrument of
  // the capability FALLBACK branch (F-CAT → F-LIVE, byte-unchanged). The served branch is
  // recordHooks.census.test.ts.
  listVaultHeldTypes: vi.fn(async () => null),
}));
const records = vi.hoisted(() => ({ readRecord: vi.fn() }));
const cache = vi.hoisted(() => ({
  listRecordRefs: vi.fn(
    async (): Promise<{ id: string; vaultId: string; typeUri: string; updatedAt: number }[]> => [],
  ),
  forgetRecord: vi.fn(async (_id: string) => undefined),
  rememberRecord: vi.fn(async () => undefined),
}));
const catalog = vi.hoisted(() => ({
  readTypeCatalog: vi.fn(),
  catalogEntityTypeNames: vi.fn(async () => {
    const { terms } = await catalog.readTypeCatalog();
    return terms
      .filter((t: { plane: string; name: string }) => t.plane === "entity")
      .map((t: { plane: string; name: string }) => t.name);
  }),
  catalogNodeTypeNames: vi.fn(async () => {
    const { terms } = await catalog.readTypeCatalog();
    return terms
      .filter(
        (t: { plane: string; name: string }) =>
          t.plane === "entity" || t.plane === "function" || t.plane === "value",
      )
      .map((t: { plane: string; name: string }) => t.name);
  }),
}));

vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listVaultRecordsPage: vaultSets.listVaultRecordsPage,
  listVaultHeldTypes: vaultSets.listVaultHeldTypes,
}));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readRecord: records.readRecord,
}));
vi.mock("@kaigilb/gilbplatformcode-working-set-store", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...cache,
}));
vi.mock("@kaigilb/gilbplatformcode-vault-type-census", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readTypeCatalog: catalog.readTypeCatalog,
  catalogEntityTypeNames: catalog.catalogEntityTypeNames,
  catalogNodeTypeNames: catalog.catalogNodeTypeNames,
}));

import { hydrateRecordsPage } from "./recordHooks";

const VAULT = "https://home.platform.example.test/base";
const NOTE_ID = "note-06g1nsxabds0d9m23p0dbmpnkw";
const NOTE_URI = `https://home.platform.example.test/base/e/${NOTE_ID}`;
const RULE_ID = "rule-06g1nt2pd5v131v2rzf3knf2kc";
const RULE_URI = `https://home.platform.example.test/base/e/${RULE_ID}`;

/** F-CAT names. Distinct from RECORD_TYPE_NAMES (NoteDocument/Person/Task/VirtualFolder + aliases). */
const CATALOG_ENTITY_TYPES = ["NoteDocument", "Rule"] as const;

function emptyPage() {
  return {
    records: [] as { id: string; entityUri: string; typeUri: string; updatedAt: number }[],
    total: 0,
    complete: true,
    pageSize: 20,
    offset: 0,
  };
}

function pageWith(rows: { id: string; entityUri: string; typeUri: string; updatedAt: number }[]) {
  return {
    records: rows,
    total: rows.length,
    complete: true,
    pageSize: 20,
    offset: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  catalog.readTypeCatalog.mockResolvedValue({
    terms: [
      { name: "NoteDocument", label: "Note", plane: "entity" },
      { name: "Rule", label: "Rule", plane: "entity" },
      { name: "IsA", label: "is a", plane: "relation" },
    ],
    stale: false,
  });
  vaultSets.listVaultRecordsPage.mockResolvedValue(
    pageWith([
      { id: NOTE_ID, entityUri: NOTE_URI, typeUri: "t:NoteDocument", updatedAt: 2 },
      { id: RULE_ID, entityUri: RULE_URI, typeUri: "t:Rule", updatedAt: 1 },
    ]),
  );
  records.readRecord.mockImplementation(async (id: string) =>
    id === NOTE_ID
      ? {
          id: NOTE_ID,
          entityUri: NOTE_URI,
          typeUri: "t:NoteDocument",
          facts: { title: "live note" },
          opaqueFacts: [],
          etag: null,
        }
      : {
          id: RULE_ID,
          entityUri: RULE_URI,
          typeUri: "t:Rule",
          facts: { title: "live rule" },
          opaqueFacts: [],
          etag: null,
        },
  );
});

describe("C1 F-LIVE — empty ?type= is not F-LIVE", () => {
  it("C1 hydrate F-LIVEs named catalog types — not an untyped list", async () => {
    await hydrateRecordsPage(VAULT, 0, []);

    expect(vaultSets.listVaultRecordsPage).toHaveBeenCalled();
    for (const call of vaultSets.listVaultRecordsPage.mock.calls) {
      const typeNames = call[1] as readonly string[];
      expect(typeNames, "empty ?type= is not F-LIVE").toBeDefined();
      expect(typeNames.length, "empty ?type= is not F-LIVE").toBeGreaterThan(0);
    }
    const firstTypes = vaultSets.listVaultRecordsPage.mock.calls[0]![1] as string[];
    expect(firstTypes).toEqual(expect.arrayContaining([...CATALOG_ENTITY_TYPES]));
    expect(firstTypes).not.toContain("IsA");
  });

  it("C1 source no longer calls listVaultRecordsPage with an empty type list", () => {
    const src = readFileSync("src/recordHooks.ts", "utf8");
    expect(src).not.toMatch(/listVaultRecordsPage\(\s*vaultId\s*,\s*\[\s*\]\s*,\s*offset\s*\)/);
  });
});

describe("C2 F-CAT then F-LIVE — RECORD_TYPE_NAMES is not F-CAT", () => {
  it("C2 F-LIVE types come from F-CAT, not the app-private enum", async () => {
    await hydrateRecordsPage(VAULT, 0, []);

    expect(catalog.readTypeCatalog).toHaveBeenCalled();
    const typeNames = vaultSets.listVaultRecordsPage.mock.calls[0]![1] as string[];
    expect(typeNames).toEqual(expect.arrayContaining(["Rule"]));
    expect(typeNames).not.toEqual([...RECORD_TYPE_NAMES]);
    for (const name of RECORD_TYPE_NAMES) {
      if (name !== "NoteDocument") expect(typeNames).not.toContain(name);
    }
  });

  it("C2 swap-run: same empty vault, only the catalog names change — F-LIVE follows F-CAT", async () => {
    catalog.readTypeCatalog.mockResolvedValue({
      terms: [{ name: "Schema", label: "Schema", plane: "entity" }],
      stale: false,
    });
    vaultSets.listVaultRecordsPage.mockResolvedValue(emptyPage());

    await hydrateRecordsPage(VAULT, 0, []);

    const typeNames = vaultSets.listVaultRecordsPage.mock.calls[0]![1] as string[];
    expect(typeNames).toEqual(["Schema"]);
    expect(typeNames).not.toEqual([...RECORD_TYPE_NAMES]);
    expect(typeNames).not.toContain("Person");
  });

  it("C2 F-CAT miss is a miss — neither untyped list nor RECORD_TYPE_NAMES fills", async () => {
    catalog.readTypeCatalog.mockResolvedValue({ terms: [], stale: true });
    vaultSets.listVaultRecordsPage.mockResolvedValue(
      pageWith([{ id: NOTE_ID, entityUri: NOTE_URI, typeUri: "t:NoteDocument", updatedAt: 2 }]),
    );

    const page = await hydrateRecordsPage(VAULT, 0, []);

    expect(page.records).toEqual([]);
    expect(page.complete).toBe(true);
    for (const call of vaultSets.listVaultRecordsPage.mock.calls) {
      const typeNames = call[1] as readonly string[];
      expect(typeNames?.length ?? 0, "F-CAT miss must not untyped-list").toBeGreaterThan(0);
      expect([...typeNames]).not.toEqual([...RECORD_TYPE_NAMES]);
    }
  });

  it("C2 source no longer falls back to RECORD_TYPE_NAMES", () => {
    const src = readFileSync("src/recordHooks.ts", "utf8");
    expect(src).not.toMatch(/listVaultRecordsPage\(\s*vaultId\s*,\s*RECORD_TYPE_NAMES/);
    expect(src).not.toMatch(/RECORD_TYPE_NAMES/);
  });
});

/** Live Base `src/lws/records.ts` silently `.slice(0, MAX_TYPES)` with MAX_TYPES = 100. */
const LWS_RECORDS_MAX_TYPES = 100;

/**
 * Label-sorted entity catalog shape that bit 2026-09-01 on pelleparafin:
 * Person at index 423, BasicPlanguage at 40. First 100 keep BasicPlanguage and drop Person.
 */
function entityCatalogWithPersonAt423(): { name: string; label: string; plane: "entity" }[] {
  const terms: { name: string; label: string; plane: "entity" }[] = [];
  for (let i = 0; i < 741; i++) {
    if (i === 40) terms.push({ name: "BasicPlanguage", label: "Basic Planguage", plane: "entity" });
    else if (i === 423) terms.push({ name: "Person", label: "Person", plane: "entity" });
    else terms.push({ name: `Type${String(i).padStart(3, "0")}`, label: `Type${String(i).padStart(3, "0")}`, plane: "entity" });
  }
  return terms;
}

describe("All-types F-LIVE issues Person beyond the first 100 by label", () => {
  it("Person at catalog index 423 is among types actually passed to listVaultRecordsPage", async () => {
    const terms = entityCatalogWithPersonAt423();
    expect(terms[40]!.name).toBe("BasicPlanguage");
    expect(terms[423]!.name).toBe("Person");
    catalog.readTypeCatalog.mockResolvedValue({ terms, stale: false });
    vaultSets.listVaultRecordsPage.mockResolvedValue(emptyPage());

    await hydrateRecordsPage(VAULT, 0, []);

    expect(vaultSets.listVaultRecordsPage).toHaveBeenCalled();
    // Server cap: each call's type list is silently sliced to 100. Types that only
    // sit past that slice never reach F-LIVE. Person at 423 must still be issued.
    const issuedThroughCap = vaultSets.listVaultRecordsPage.mock.calls.flatMap((call) => {
      const names = call[1] as readonly string[];
      return names.slice(0, LWS_RECORDS_MAX_TYPES);
    });
    expect(issuedThroughCap, "Person must survive the live 100-type cap").toContain("Person");
    expect(issuedThroughCap).toContain("BasicPlanguage");
    for (const call of vaultSets.listVaultRecordsPage.mock.calls) {
      const names = call[1] as readonly string[];
      expect(
        names.length,
        "one truncated 100-cap union drops Person at index 423",
      ).toBeLessThanOrEqual(LWS_RECORDS_MAX_TYPES);
    }
  });
});

/**
 * 2026-09-01 vildeklubbentest: Function “Writing Planguage”
 * appeared then vanished after hydrate.
 *
 * Named cause (re-measured at origin/main c1d3cc2): All-types `hydrateRecordsPage` F-LIVE
 * uses `catalogEntityTypeNames()` — entity plane only. Live vocab classifies Writing-Planguage
 * class terms as function (`a:verb` / parent Function). Optimistic insert shows the node;
 * hydrate F-LIVE does not return it; it vanishes. `isFreshlyCreated` only skips forgetRecord.
 *
 * Winner still binds: empty `?type=` is ⛔ not F-LIVE. ⛔ Do not drop Person (chunking).
 * Relation-plane types (CapableOf, PartOf, …) stay out (`isNonRecordListEntry`).
 */
describe("All-types F-LIVE issues Function-plane types the Nodes chooser creates", () => {
  it("WritingPlanguage on the function plane is among types passed to listVaultRecordsPage", async () => {
    const terms = [
      ...entityCatalogWithPersonAt423(),
      { name: "WritingPlanguage", label: "Writing Planguage", plane: "function" as const },
      { name: "SomeValue", label: "Some Value", plane: "value" as const },
      { name: "CapableOf", label: "capable-of", plane: "relation" as const },
    ];
    catalog.readTypeCatalog.mockResolvedValue({ terms, stale: false });
    vaultSets.listVaultRecordsPage.mockResolvedValue(emptyPage());

    await hydrateRecordsPage(VAULT, 0, []);

    const issuedThroughCap = vaultSets.listVaultRecordsPage.mock.calls.flatMap((call) => {
      const names = call[1] as readonly string[];
      return names.slice(0, LWS_RECORDS_MAX_TYPES);
    });
    expect(issuedThroughCap, "Person must stay issued (HT1 chunking)").toContain("Person");
    expect(
      issuedThroughCap,
      "Function plane is what TypeChooser Functions creates — entity-only F-CAT excludes it",
    ).toContain("WritingPlanguage");
    expect(issuedThroughCap, "Values plane is a TypeChooser create plane").toContain("SomeValue");
    expect(issuedThroughCap, "relation-plane types stay out of the register").not.toContain("CapableOf");
    for (const call of vaultSets.listVaultRecordsPage.mock.calls) {
      const names = call[1] as readonly string[];
      expect(names.length).toBeLessThanOrEqual(LWS_RECORDS_MAX_TYPES);
      expect(names.length, "empty ?type= is not F-LIVE").toBeGreaterThan(0);
    }
  });

  it("source hydrate F-LIVEs node planes (entity+function+value), not entity-only catalogEntityTypeNames", () => {
    const src = readFileSync("src/recordHooks.ts", "utf8");
    expect(src).not.toMatch(/const typeNames = await catalogEntityTypeNames\(\)/);
    expect(src).toMatch(/catalogNodeTypeNames/);
  });
});

/**
 * 2026-09-01 Nodes view: "Couldn’t reach your vault" / blank graph.
 *
 * Named cause (re-measured at origin/main ef20a91): `catalogNodeTypeNames()` is
 * entity+function+value. Live canonical vocab (cached 2026-09-01T15:57:28Z, recount
 * 2026-09-01T18:08:42Z) unique names entity 741 · function 11238 · value 11 → ~11990.
 * Chunks of `LWS_RECORDS_MAX_TYPES=100` → 120 chunks. `listVaultRecordsPageAllNamedTypes`
 * `Promise.all`s every chunk. 120 parallel GET /lws/vault/<vault>/records fail-close on the
 * first rejection → `nodeSet.error` (RecordGraph / RecordGrid). Before, entity-only
 * 741 names = 8 chunks and hydrate worked (pelleparafin people came back).
 *
 * Winner still binds: empty `?type=` is ⛔ not F-LIVE. Person must still issue.
 * A TypeChooser Function must still be F-LIVEable  ⛔ without a 120-way list storm.
 * ⛔ Do not change Base MAX_TYPES. ⛔ Do not revert PUT /base/r/:id.
 */
function catalogWithFunctionStorm(): {
  name: string;
  label: string;
  plane: "entity" | "function" | "value";
}[] {
  const terms: { name: string; label: string; plane: "entity" | "function" | "value" }[] =
    entityCatalogWithPersonAt423();
  terms.push({ name: "WritingPlanguage", label: "Writing Planguage", plane: "function" });
  for (let i = 0; i < 11237; i++) {
    const n = `Fn${String(i).padStart(5, "0")}`;
    terms.push({ name: n, label: n, plane: "function" });
  }
  for (let i = 0; i < 11; i++) {
    const n = i === 0 ? "SomeValue" : `Val${i}`;
    terms.push({ name: n, label: n, plane: "value" });
  }
  return terms;
}

describe("All-types hydrate does not Promise.all a 120-chunk Function-catalog storm", () => {
  it("All-types hydrate does not issue ≥100 parallel listVaultRecordsPage calls", async () => {
    const terms = catalogWithFunctionStorm();
    expect(terms.filter((t) => t.plane === "entity")).toHaveLength(741);
    expect(terms.filter((t) => t.plane === "function")).toHaveLength(11238);
    expect(terms.filter((t) => t.plane === "value")).toHaveLength(11);
    expect(terms).toHaveLength(11990);
    catalog.readTypeCatalog.mockResolvedValue({ terms, stale: false });

    let inFlight = 0;
    let maxInFlight = 0;
    vaultSets.listVaultRecordsPage.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => {
        queueMicrotask(() => resolve());
      });
      inFlight -= 1;
      return emptyPage();
    });

    await hydrateRecordsPage(VAULT, 0, []);

    expect(
      vaultSets.listVaultRecordsPage.mock.calls.length,
      "instrument: storm catalog must still chunk (≥100 calls) so a 1-call union cannot hide",
    ).toBeGreaterThanOrEqual(100);
    expect(
      maxInFlight,
      "120-way Promise.all of F-LIVE chunks fail-closes All-types into nodeSet.error",
    ).toBeLessThan(100);
  });

  it("Person and WritingPlanguage still issue through the 100-type cap on the storm catalog", async () => {
    const terms = catalogWithFunctionStorm();
    catalog.readTypeCatalog.mockResolvedValue({ terms, stale: false });
    vaultSets.listVaultRecordsPage.mockResolvedValue(emptyPage());

    await hydrateRecordsPage(VAULT, 0, []);

    const issuedThroughCap = vaultSets.listVaultRecordsPage.mock.calls.flatMap((call) => {
      const names = call[1] as readonly string[];
      return names.slice(0, LWS_RECORDS_MAX_TYPES);
    });
    expect(issuedThroughCap, "Person must stay issued (HT1 chunking)").toContain("Person");
    expect(issuedThroughCap, "HT3b Function stay — TypeChooser Functions F-LIVE").toContain(
      "WritingPlanguage",
    );
    for (const call of vaultSets.listVaultRecordsPage.mock.calls) {
      const names = call[1] as readonly string[];
      expect(names.length).toBeLessThanOrEqual(LWS_RECORDS_MAX_TYPES);
      expect(names.length, "empty ?type= is not F-LIVE").toBeGreaterThan(0);
    }
  });

  it("one rejected F-LIVE chunk does not fail-close the All-types page", async () => {
    const terms = catalogWithFunctionStorm();
    catalog.readTypeCatalog.mockResolvedValue({ terms, stale: false });
    const PERSON_ID = "person-ht4-stay";
    const PERSON_URI = `https://home.platform.example.test/base/e/${PERSON_ID}`;
    let call = 0;
    vaultSets.listVaultRecordsPage.mockImplementation(async (_vault: string, types: readonly string[]) => {
      call += 1;
      if (call === 2) throw new Error("chunk 2 429");
      if (types.includes("Person")) {
        return pageWith([
          { id: PERSON_ID, entityUri: PERSON_URI, typeUri: "t:Person", updatedAt: 1 },
        ]);
      }
      return emptyPage();
    });
    records.readRecord.mockImplementation(async (id: string) => ({
      id,
      entityUri: PERSON_URI,
      typeUri: "t:Person",
      facts: { name: "Dag" },
      opaqueFacts: [],
      etag: null,
    }));

    const page = await hydrateRecordsPage(VAULT, 0, []);
    expect(
      page.records.map((r) => r.id),
      "Promise.all fail-close on one chunk blanks Nodes (nodeSet.error) even when Person's chunk returned",
    ).toContain(PERSON_ID);
  });

  it("source does not Promise.all every F-LIVE chunk", () => {
    const src = readFileSync("src/recordHooks.ts", "utf8");
    expect(src).not.toMatch(
      /Promise\.all\(\s*chunks\.map\(\s*\(chunk\)\s*=>\s*listVaultRecordsPage/,
    );
  });
});

/**
 * 2026-09-01: Writing Planguage was a labelled node; after
 * create-and-link “a person to play football”, BOTH capable-of ends became dashed
 * “member not readable here” pendants (relation-id tails, not Function ids).
 *
 * Named cause 1 (re-measured at origin/main e93d77be9e5c90158f0e8c97d7233d0be1748442):
 * All-types `hydrateRecordsPage` F-LIVEs `catalogNodeTypeNames()` only. Canonical vocab
 * recount 2026-09-01T18:08:42Z: **no** type local name `WritingPlanguage`. Football exists
 * as **entity** (`t:Football`, parent Sport). A TypeChooser Function whose `typeLocalName`
 * is not in F-CAT is never `?type=`-issued. Optimistic/`markFreshlyCreated` shows it; the
 * next hydrate (second create, or after the fresh window is cleared) drops it from the
 * seed. Relations remain → pendants. swallowed failed chunks, so a Function whose
 * type sat in a 429 chunk is the same miss.
 *
 * Lookup acts, ⛔ not invented: F-LIVE of the held record’s own bare type (prevFlat came
 * from a prior create/find) and F-OPEN of that stored id when the type-chunk did not
 * return. Empty `?type=` still ⛔ not F-LIVE. Person still issued. PUT `/base/r/:id`
 * stays. 0 Lookup-row invention.
 */
const WP_ID = "fn-writing-planguage-ht5";
const WP_URI = `https://home.platform.example.test/base/e/${WP_ID}`;
const WP_TYPE = "WritingPlanguage";

function heldWritingPlanguage(): import("@kaigilb/gilbplatformcode-base-record").GridRecord {
  return {
    id: WP_ID,
    entityUri: WP_URI,
    typeUri: `t:${WP_TYPE}`,
    facts: { label: "Writing Planguage" },
    opaqueFacts: [],
    etag: null,
    updatedAt: 2,
    hydrated: true,
  };
}

describe("All-types hydrate keeps a held Function whose type missed F-LIVE", () => {
  it("held Function whose type is not in F-CAT stays on the next hydrate (F-LIVE of held type / F-OPEN of stored id)", async () => {
    catalog.readTypeCatalog.mockResolvedValue({
      terms: [
        { name: "Person", label: "Person", plane: "entity" as const },
        { name: "NoteDocument", label: "Note", plane: "entity" as const },
      ],
      stale: false,
    });
    const PERSON_ID = "person-ht5-stay";
    const PERSON_URI = `https://home.platform.example.test/base/e/${PERSON_ID}`;
    vaultSets.listVaultRecordsPage.mockImplementation(async (_vault: string, types: readonly string[]) => {
      const rows: { id: string; entityUri: string; typeUri: string; updatedAt: number }[] = [];
      if (types.includes(WP_TYPE)) {
        rows.push({ id: WP_ID, entityUri: WP_URI, typeUri: `t:${WP_TYPE}`, updatedAt: 2 });
      }
      if (types.includes("Person")) {
        rows.push({ id: PERSON_ID, entityUri: PERSON_URI, typeUri: "t:Person", updatedAt: 1 });
      }
      return rows.length ? pageWith(rows) : emptyPage();
    });
    records.readRecord.mockImplementation(async (id: string) =>
      id === WP_ID
        ? {
            id: WP_ID,
            entityUri: WP_URI,
            typeUri: `t:${WP_TYPE}`,
            facts: { label: "Writing Planguage" },
            opaqueFacts: [],
            etag: null,
          }
        : {
            id: PERSON_ID,
            entityUri: PERSON_URI,
            typeUri: "t:Person",
            facts: { name: "Jairam" },
            opaqueFacts: [],
            etag: null,
          },
    );

    const page = await hydrateRecordsPage(VAULT, 0, [heldWritingPlanguage()]);
    const issued = vaultSets.listVaultRecordsPage.mock.calls.flatMap((call) => call[1] as readonly string[]);
    expect(issued, "Person must stay issued (HT1)").toContain("Person");
    expect(
      issued,
      "held Function type is F-LIVE of a name we already hold — ⛔ not F-CAT-only, ⛔ not empty ?type=",
    ).toContain(WP_TYPE);
    expect(
      page.records.map((r) => r.id),
      "next hydrate dropped the first Function from the seed when its type was absent from F-CAT",
    ).toContain(WP_ID);
    expect(page.records.map((r) => r.id), "People still list").toContain(PERSON_ID);
    for (const call of vaultSets.listVaultRecordsPage.mock.calls) {
      const names = call[1] as readonly string[];
      expect(names.length, "empty ?type= is not F-LIVE").toBeGreaterThan(0);
    }
  });

  it("held Function whose type-chunk 429s stays via F-OPEN of the stored id", async () => {
    const terms = catalogWithFunctionStorm();
    catalog.readTypeCatalog.mockResolvedValue({ terms, stale: false });
    const PERSON_ID = "person-ht5-chunk";
    const PERSON_URI = `https://home.platform.example.test/base/e/${PERSON_ID}`;
    vaultSets.listVaultRecordsPage.mockImplementation(async (_vault: string, types: readonly string[]) => {
      if (types.includes(WP_TYPE)) throw new Error("WritingPlanguage chunk 429");
      if (types.includes("Person")) {
        return pageWith([{ id: PERSON_ID, entityUri: PERSON_URI, typeUri: "t:Person", updatedAt: 1 }]);
      }
      return emptyPage();
    });
    records.readRecord.mockImplementation(async (id: string) =>
      id === WP_ID
        ? {
            id: WP_ID,
            entityUri: WP_URI,
            typeUri: `t:${WP_TYPE}`,
            facts: { label: "Writing Planguage" },
            opaqueFacts: [],
            etag: null,
          }
        : {
            id: PERSON_ID,
            entityUri: PERSON_URI,
            typeUri: "t:Person",
            facts: { name: "Jairam" },
            opaqueFacts: [],
            etag: null,
          },
    );

    const page = await hydrateRecordsPage(VAULT, 0, [heldWritingPlanguage()]);
    expect(
      page.records.map((r) => r.id),
      "HT4 swallows the failed Function chunk; without F-OPEN the first Function drops from the seed",
    ).toContain(WP_ID);
    expect(page.records.map((r) => r.id), "People still list when a Function chunk 429s").toContain(
      PERSON_ID,
    );
    expect(
      records.readRecord.mock.calls.some((c) => c[0] === WP_ID),
      "F-OPEN of the stored Function id (prevFlat / create Location) when its type-chunk did not return",
    ).toBe(true);
  });

});

/**
 * 2026-09-01, retest: “no, also not in the grid.”
 * Both view, vault pelleparafin, TYPE All types. Grid ITEM(13) TYPE(2) = Contact +
 * PlayMusicalInstruments. Writing Planguage and play football absent. Graph:
 * play musical instruments labelled; other capable-of edges still dashed pendants.
 *
 * Named cause (re-measured at origin/main f1d306a8795a2536c30e56ffbc5ceecfcb9ad573):
 * recovery is session `prevFlat` only — `heldTypeNames(prevFlat)`, F-OPEN
 * `prevFlat.filter(...)`, skip-`forgetRecord` only when `prevFlat.find((r) => r.id === c.id)`.
 * After reload React Query has no previous page → `prevFlat = []`. Offset-0 prune still
 * `forgetRecord`s IDB ids not in the F-LIVE union, except fresh/temp and prevFlat-held
 * types. Incomplete F-CAT (120 chunks, swallowed 429s, types not in F-CAT such as live
 * vocab **no** `WritingPlanguage`) is treated as deleted. `listRecordRefs` already has
 * the stored ids+typeUris. does not F-LIVE those type names or F-OPEN those ids
 * unless they are also on prevFlat. Empty `?type=` still ⛔ not F-LIVE.
 *
 * Lookup acts, ⛔ not invented: F-LIVE of stored type names from `listRecordRefs` /
 * `rememberRecord`, and F-OPEN of those stored ids when the type-chunk missed. ⛔ Do
 * not invent a Lookup row. ⛔ Do not revert PUT `/base/r/:id`. ⛔ Do not revert
 * 's BOUND. ⛔ No schema cutover.
 *
 * 🔴 — this arm read `cap-6` and pinned the literal `6`. 's property is that the
 * fan-out is BOUNDED — an unbounded `Promise.all` over ~120 chunks is the named cause of the
 * blank Nodes view (2026-09-01), and THAT CLAUSE IS UNTOUCHED AND STANDS. The NUMBER
 * rested on a second clause — a per-origin connection limit under the previous HTTP revision —
 * which is FALSE on production (`example.test` and `geo.example.test` both answer `http_version=2`).
 * ⛔ That clause is not restated anywhere in the tree; the arm below is what enforces its
 * absence, so quoting it "for context" would redden this suite, correctly. Ruling:
 * the premise FAILS as to the number and HOLDS as to the
 * bound, so the arm is RE-POINTED to a range and the false clause is EXCISED, ⛔ re-welded
 *. ⛔ The guard is ⛔ retired:
 * an absent constant, an unbounded fan-out, or any value outside (6, 32) still reddens it.
 */
function storedWritingPlanguageRef(): {
  id: string;
  vaultId: string;
  typeUri: string;
  updatedAt: number;
} {
  return { id: WP_ID, vaultId: VAULT, typeUri: `t:${WP_TYPE}`, updatedAt: 2 };
}

describe("All-types cold hydrate keeps stored Functions when prevFlat is empty", () => {
  it("cold hydrate (prevFlat=[]) F-LIVEs a cached Function whose type is not in F-CAT and does not forgetRecord it", async () => {
    cache.listRecordRefs.mockResolvedValue([storedWritingPlanguageRef()]);
    catalog.readTypeCatalog.mockResolvedValue({
      terms: [
        { name: "Person", label: "Person", plane: "entity" as const },
        { name: "NoteDocument", label: "Note", plane: "entity" as const },
      ],
      stale: false,
    });
    const PERSON_ID = "person-ht6-stay";
    const PERSON_URI = `https://home.platform.example.test/base/e/${PERSON_ID}`;
    vaultSets.listVaultRecordsPage.mockImplementation(async (_vault: string, types: readonly string[]) => {
      const rows: { id: string; entityUri: string; typeUri: string; updatedAt: number }[] = [];
      if (types.includes(WP_TYPE)) {
        rows.push({ id: WP_ID, entityUri: WP_URI, typeUri: `t:${WP_TYPE}`, updatedAt: 2 });
      }
      if (types.includes("Person")) {
        rows.push({ id: PERSON_ID, entityUri: PERSON_URI, typeUri: "t:Person", updatedAt: 1 });
      }
      return rows.length ? pageWith(rows) : emptyPage();
    });
    records.readRecord.mockImplementation(async (id: string) =>
      id === WP_ID
        ? {
            id: WP_ID,
            entityUri: WP_URI,
            typeUri: `t:${WP_TYPE}`,
            facts: { label: "Writing Planguage" },
            opaqueFacts: [],
            etag: null,
          }
        : {
            id: PERSON_ID,
            entityUri: PERSON_URI,
            typeUri: "t:Person",
            facts: { name: "Jairam" },
            opaqueFacts: [],
            etag: null,
          },
    );

    const page = await hydrateRecordsPage(VAULT, 0, []);
    const issued = vaultSets.listVaultRecordsPage.mock.calls.flatMap(
      (call) => call[1] as readonly string[],
    );
    expect(issued, "Person must stay issued (HT1)").toContain("Person");
    expect(
      issued,
      "stored Function type from listRecordRefs is F-LIVE of a name this device already stored — ⛔ not prevFlat-only, ⛔ not F-CAT-only, ⛔ not empty ?type=",
    ).toContain(WP_TYPE);
    expect(
      page.records.map((r) => r.id),
      "cold hydrate with prevFlat=[] forgot a cached WritingPlanguage-class id; page ids exclude it",
    ).toContain(WP_ID);
    expect(page.records.map((r) => r.id), "People still list").toContain(PERSON_ID);
    expect(
      cache.forgetRecord.mock.calls.map((c) => c[0]),
      "offset-0 prune must not forgetRecord a stored Function whose type missed F-CAT",
    ).not.toContain(WP_ID);
    for (const call of vaultSets.listVaultRecordsPage.mock.calls) {
      const names = call[1] as readonly string[];
      expect(names.length, "empty ?type= is not F-LIVE").toBeGreaterThan(0);
    }
  });

  it("cold hydrate F-OPENs a cached Function whose type-chunk 429s; does not forgetRecord it", async () => {
    cache.listRecordRefs.mockResolvedValue([storedWritingPlanguageRef()]);
    const terms = catalogWithFunctionStorm();
    catalog.readTypeCatalog.mockResolvedValue({ terms, stale: false });
    const PERSON_ID = "person-ht6-chunk";
    const PERSON_URI = `https://home.platform.example.test/base/e/${PERSON_ID}`;
    vaultSets.listVaultRecordsPage.mockImplementation(async (_vault: string, types: readonly string[]) => {
      if (types.includes(WP_TYPE)) throw new Error("WritingPlanguage chunk 429");
      if (types.includes("Person")) {
        return pageWith([{ id: PERSON_ID, entityUri: PERSON_URI, typeUri: "t:Person", updatedAt: 1 }]);
      }
      return emptyPage();
    });
    records.readRecord.mockImplementation(async (id: string) =>
      id === WP_ID
        ? {
            id: WP_ID,
            entityUri: WP_URI,
            typeUri: `t:${WP_TYPE}`,
            facts: { label: "Writing Planguage" },
            opaqueFacts: [],
            etag: null,
          }
        : {
            id: PERSON_ID,
            entityUri: PERSON_URI,
            typeUri: "t:Person",
            facts: { name: "Jairam" },
            opaqueFacts: [],
            etag: null,
          },
    );

    const page = await hydrateRecordsPage(VAULT, 0, []);
    expect(
      page.records.map((r) => r.id),
      "HT4 swallows the failed Function chunk; without F-OPEN of listRecordRefs ids when prevFlat=[] the cached Function drops and is forgotten",
    ).toContain(WP_ID);
    expect(page.records.map((r) => r.id), "People still list when a Function chunk 429s").toContain(
      PERSON_ID,
    );
    expect(
      records.readRecord.mock.calls.some((c) => c[0] === WP_ID),
      "F-OPEN of the stored Function id (listRecordRefs / rememberRecord) when its type-chunk did not return",
    ).toBe(true);
    expect(
      cache.forgetRecord.mock.calls.map((c) => c[0]),
      "offset-0 prune must not forgetRecord a stored Function whose type-chunk 429d",
    ).not.toContain(WP_ID);
  });

  it("a cached id whose type DID F-LIVE and omitted it is still forgotten (genuine miss)", async () => {
    const GONE_ID = "fn-ended-ht6";
    cache.listRecordRefs.mockResolvedValue([
      { id: GONE_ID, vaultId: VAULT, typeUri: "t:Person", updatedAt: 3 },
    ]);
    catalog.readTypeCatalog.mockResolvedValue({
      terms: [{ name: "Person", label: "Person", plane: "entity" as const }],
      stale: false,
    });
    const PERSON_ID = "person-ht6-live";
    const PERSON_URI = `https://home.platform.example.test/base/e/${PERSON_ID}`;
    vaultSets.listVaultRecordsPage.mockResolvedValue(
      pageWith([{ id: PERSON_ID, entityUri: PERSON_URI, typeUri: "t:Person", updatedAt: 1 }]),
    );
    records.readRecord.mockResolvedValue({
      id: PERSON_ID,
      entityUri: PERSON_URI,
      typeUri: "t:Person",
      facts: { name: "Jairam" },
      opaqueFacts: [],
      etag: null,
    });

    const page = await hydrateRecordsPage(VAULT, 0, []);
    expect(page.records.map((r) => r.id)).toContain(PERSON_ID);
    expect(page.records.map((r) => r.id), "ended live Person must not stay from IDB").not.toContain(
      GONE_ID,
    );
    expect(
      cache.forgetRecord.mock.calls.map((c) => c[0]),
      "a type that listed and omitted the id is a genuine miss — forgetRecord stays",
    ).toContain(GONE_ID);
  });

});
