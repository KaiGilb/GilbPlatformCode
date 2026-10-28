// @vitest-environment node
// The text match over the loaded holdings. Ported from workingSetFacets.test.ts (the matchWorkingSetQuery block, 2 of the file's 24; the rest test
// functions that are not taken). New tests for typeFacetKey are in typeFacetKey.test.ts.
import { afterAll, describe, expect, it } from "vitest";
import { typeUri } from "@kaigilb/gilbplatformcode-record-types";
import { matchWorkingSetQuery, type FacetableItem } from "./workingSetFacets";
import { setUp, tearDown } from "../test/support";

setUp(); // the fixtures below build type uris when this module loads
afterAll(() => tearDown());

function item(
  partial: Partial<FacetableItem> & Pick<FacetableItem, "id" | "vaultId" | "typeUri">,
): FacetableItem {
  return {
    name: partial.name ?? partial.id,
    updatedAt: partial.updatedAt ?? 0,
    ...partial,
  };
}

const VAULT_A = "https://host.example.test/base/p/a";
const VAULT_B = "https://host.example.test/base/p/b";

const holdings: FacetableItem[] = [
  item({ id: "n1", vaultId: VAULT_A, typeUri: typeUri("NoteDocument"), name: "Alpha note", updatedAt: 100 }),
  item({ id: "n2", vaultId: VAULT_A, typeUri: typeUri("NoteDocument"), name: "Zeta note", updatedAt: 300 }),
  item({ id: "p1", vaultId: VAULT_A, typeUri: typeUri("Person"), name: "Bob", updatedAt: 200 }),
  item({ id: "t1", vaultId: VAULT_B, typeUri: typeUri("Task"), name: "Ship", updatedAt: 250 }),
  item({ id: "n3", vaultId: VAULT_B, typeUri: typeUri("NoteDocument"), name: "Beta note", updatedAt: 50 }),
  // Decoy outside authorized set is simply never in `holdings`.
];

describe("Register search — matchWorkingSetQuery (local working-set text match)", () => {
  it("matches name substring case-insensitively", () => {
    expect(matchWorkingSetQuery(holdings, "alpha").map((i) => i.id)).toEqual(["n1"]);
    expect(matchWorkingSetQuery(holdings, "NOTE").map((i) => i.id).sort()).toEqual(
      ["n1", "n2", "n3"].sort(),
    );
  });
  it("returns empty for blank query", () => {
    expect(matchWorkingSetQuery(holdings, "  ")).toEqual([]);
  });
});
