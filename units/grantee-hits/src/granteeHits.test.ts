import { describe, expect, it } from "vitest";
import { localLookupHits, mergeHits, type GranteeVaultRow } from "./granteeHits";

const rows: GranteeVaultRow[] = [
  { vaultId: "https://pelle.example/base", label: "Pelle" },
  { vaultId: "https://ada.example/vault", label: "Ada" },
  { vaultId: "https://other.example/base", label: "Other" },
];

describe("localLookupHits", () => {
  it("matches the label only, never the address", () => {
    const hits = localLookupHits(rows, "example", null, null);
    expect(hits).toEqual([]);
    expect(localLookupHits(rows, "pel", null, null)).toEqual([
      { name: "Pelle", vaultId: "https://pelle.example/base", webId: null },
    ]);
  });

  it("trims the query, keeps an empty result for a blank query, and does not trim the label", () => {
    expect(localLookupHits(rows, "  ADA ", null, null)).toEqual([
      { name: "Ada", vaultId: "https://ada.example/vault", webId: null },
    ]);
    expect(localLookupHits(rows, "   ", null, null)).toEqual([]);
    const spaced = localLookupHits([{ vaultId: "v", label: "  Ada" }], "ada", null, null);
    expect(spaced).toEqual([{ name: "  Ada", vaultId: "v", webId: null }]);
  });

  it("excludes by exact id, and treats a blank exclude as no exclude", () => {
    expect(localLookupHits(rows, "a", "https://ada.example/vault", null).map((h) => h.name)).toEqual([]);
    expect(localLookupHits(rows, "a", "", null).map((h) => h.name)).toEqual(["Ada"]);
    expect(localLookupHits(rows, "a", null, null).map((h) => h.name)).toEqual(["Ada"]);
  });

  it("uses the session alias only for that vault, and does not lowercase the stored alias", () => {
    const hits = localLookupHits(rows, "ka", null, {
      vaultId: "https://ada.example/vault",
      shortWebId: "  Kaizen  ",
    });
    expect(hits).toEqual([
      { name: "Ada", vaultId: "https://ada.example/vault", webId: "Kaizen" },
    ]);
    const other = localLookupHits(rows, "ka", null, {
      vaultId: "https://pelle.example/base",
      shortWebId: "Kaizen",
    });
    expect(other).toEqual([
      { name: "Pelle", vaultId: "https://pelle.example/base", webId: "Kaizen" },
    ]);
    expect(
      localLookupHits(rows, "ada", null, {
        vaultId: "https://ada.example/vault",
        shortWebId: "   ",
      })[0]?.webId,
    ).toBeNull();
  });
});

describe("mergeHits", () => {
  it("drops every local vault the registry did not offer", () => {
    expect(
      mergeHits([], [{ name: "Pelle", vaultId: "https://pelle.example/base", webId: null }]),
    ).toEqual([]);
  });

  it("keeps registry order, registry text, and a trimmed webId", () => {
    const merged = mergeHits(
      [
        { name: "First", vaultId: "a", webId: "  " },
        { name: "Ada", vaultId: "b", webId: "  Ada  " },
        { name: "Ada later", vaultId: "b", webId: "later" },
      ],
      [{ name: "local name", vaultId: "b", webId: "local" }],
    );
    expect(merged).toEqual([
      { name: "First", vaultId: "a", webId: null },
      { name: "Ada later", vaultId: "b", webId: "later" },
    ]);
  });
});
