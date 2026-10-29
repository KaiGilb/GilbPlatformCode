/**
 * The records client keeps a relation-addressed row whose type was ASKED FOR.
 *
 * Specified by the ValPlan row: "A role record of each kind must be listed." The
 * register filter in `listVaultRecordsPage` drops a row the app's relation test recognises, and
 * that stays the rule for a list nobody narrowed. `admitRelationRow` is the one way past it, and
 * only `hydrateRecordsPage` sets it, with a choice of types.
 * ⚠ The relation test (`isRelationEntityUri`) reads `/base/r/` only, so for a row addressed
 * `/vault/r/` the rule decides nothing: the relation-address arm keeps it either way, and the
 * type-name arms still drop a kind on the non-record name list (a `PartOf` link, for example). The
 * gap predates this step and is carried by the vault finding
 * FINDING-2026-09-30-AppRelationTestReadsBaseSegmentOnly-GilbApp. The first block's fixture is all
 * `/base/r/`; the last block carries both segments with a kind off the name list, so the two forms
 * are told apart, and pins the `/vault/r/` gap as an expected failure that names what retires it.
 *
 * `listVaultRecordsPage` is REAL here; only `fetch` and the two credential seams are stubbed.
 *
 * Fixture provenance: the row shapes are the platform's own answer to
 * `GET /lws/vault/:vaultId/records?type=…` on the scratch rig (M5, `base_c214gapp26r2_test`,
 * GilbPlatform `556c42c9`, 2026-09-30T12:47Z): a role record came back as
 * `{ entity: "https://<host>/base/r/<id>", typeUri: "t:<Kind>" }`. ⚠ The production code this step
 * adds names no stakeholder kind; the fixtures below use `t:Person` as a value, and the relation
 * kinds are stand-ins.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listVaultRecordsPage } from "./vaultSets";
import { setUp, tearDown } from "../test/support";

function resp(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const VAULT = "https://home.platform.example.test/base";
const at = "2026-09-30T12:32:35.000Z";
/** One answer holding: a plain record, two role records of different kinds, a relation whose type
 * is a non-record NAME, and a control-plane row. */
const ANSWER = {
  total: 5,
  complete: true,
  records: [
    { entity: `${VAULT}/e/person-1`, typeUri: "t:Person", updatedAt: at },
    { entity: `${VAULT}/r/role-a-1`, typeUri: "t:CapableOf", updatedAt: at },
    { entity: `${VAULT}/r/role-b-1`, typeUri: "t:WorksFor", updatedAt: at },
    { entity: `${VAULT}/r/rel-partof-1`, typeUri: "t:PartOf", updatedAt: at },
    { entity: `${VAULT}/r/filectl-1`, typeUri: "filectl:FileContent", updatedAt: at },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(resp(200, ANSWER));
  vi.stubGlobal("fetch", fetchMock);
  setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

const ids = (page: { records: { id: string }[] }) => page.records.map((r) => r.id);

describe("GAPP214.26 — listVaultRecordsPage and a relation row that was asked for", () => {
  it("with no admit rule a /base/r/ relation row is dropped (the register's rule, unchanged)", async () => {
    const page = await listVaultRecordsPage(VAULT, ["Person", "CapableOf"], 0);
    expect(ids(page)).toEqual(["person-1"]);
  });

  it("an admitted /base/r/ relation row is kept; a /base/r/ relation row the rule does not admit is still dropped", async () => {
    const page = await listVaultRecordsPage(VAULT, ["Person", "CapableOf"], 0, {
      admitRelationRow: (typeUri) => typeUri === "t:CapableOf",
    });
    expect(ids(page)).toEqual(["person-1", "role-a-1"]);
    expect(page.records[1]!.entityUri).toBe(`${VAULT}/r/role-a-1`);
  });

  it("the rule is asked about the row's TYPE as the vault spelled it", async () => {
    const asked: string[] = [];
    await listVaultRecordsPage(VAULT, ["Person"], 0, {
      admitRelationRow: (typeUri) => {
        asked.push(typeUri);
        return false;
      },
    });
    expect(asked).toEqual(["t:CapableOf", "t:WorksFor", "t:PartOf", "filectl:FileContent"]);
  });

  it("a rule that admits everything still does not let a non-record type name or a control-plane row through", async () => {
    const page = await listVaultRecordsPage(VAULT, ["Person"], 0, { admitRelationRow: () => true });
    expect(ids(page)).toEqual(["person-1", "role-a-1", "role-b-1"]);
  });

  it("the page total counts the rows kept, so an admitted row is counted", async () => {
    const dropped = await listVaultRecordsPage(VAULT, ["Person"], 0);
    const admitted = await listVaultRecordsPage(VAULT, ["Person"], 0, { admitRelationRow: () => true });
    expect(dropped.total).toBe(1);
    expect(admitted.total).toBe(3);
  });
});

// ── Both relation address segments (FINDING-2026-09-30-AppRelationTestReadsBaseSegmentOnly-GilbApp) ─────────────────────────────────
// The two role rows below have the SAME type and differ only in the address segment, so every
// assertion here turns on the segment alone (RuleBasetestFixtureDiscriminates). One answer carries
// both forms because the filter judges each row by its own address; a real vault answers one form.
const VAULT_USER = "https://home.platform.example.test/vault";
const BOTH = {
  total: 3,
  complete: true,
  records: [
    { entity: `${VAULT_USER}/e/person-v-1`, typeUri: "t:Person", updatedAt: at },
    { entity: `${VAULT}/r/role-base-1`, typeUri: "t:CapableOf", updatedAt: at },
    { entity: `${VAULT_USER}/r/role-vault-1`, typeUri: "t:CapableOf", updatedAt: at },
  ],
};

describe("GAPP214.26 — a relation row on each address segment", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(resp(200, BOTH));
  });

  it("with the admit rule, a chosen relation row is kept on BOTH segments", async () => {
    const page = await listVaultRecordsPage(VAULT_USER, ["Person", "CapableOf"], 0, {
      admitRelationRow: (typeUri) => typeUri === "t:CapableOf",
    });
    expect(ids(page)).toEqual(["person-v-1", "role-base-1", "role-vault-1"]);
  });

  it("with no admit rule the /base/r/ row is dropped and the record beside it is kept (control)", async () => {
    const page = await listVaultRecordsPage(VAULT_USER, ["Person", "CapableOf"], 0);
    expect(ids(page)).toContain("person-v-1");
    expect(ids(page)).not.toContain("role-base-1");
  });

  // KNOWN GAP, pinned as an expected failure (RuleBasetestNoDefectAssertion cl.1 and cl.5). The
  // specified rule is that a list nobody narrowed carries no relation row. `isRelationEntityUri`
  // (recordPlane.ts) reads `/base/r/` only, so today a `/vault/r/` row is kept and this test's
  // assertions fail, which `it.fails` records as a pass. RETIRED when the relation test reads both
  // segments (vault FINDING-2026-09-30-AppRelationTestReadsBaseSegmentOnly-GilbApp, which lists
  // the other sites): this then goes RED —
  // remove `.fails` and keep the assertions. The control above keeps this from passing on a
  // broken fixture.
  it.fails("KNOWN GAP (F1): with no admit rule, or one that admits nothing, the /vault/r/ row is dropped too", async () => {
    const none = await listVaultRecordsPage(VAULT_USER, ["Person", "CapableOf"], 0);
    const nothing = await listVaultRecordsPage(VAULT_USER, ["Person", "CapableOf"], 0, {
      admitRelationRow: () => false,
    });
    expect(ids(none)).not.toContain("role-vault-1");
    expect(ids(nothing)).not.toContain("role-vault-1");
  });
});
