import { describe, expect, it } from "vitest";
import { isGroupVault, isOrgOrProjectVault, vaultRepresentsLabel, writableParentVaults } from "./groupVault";
import type { VaultKindAddresses } from "./groupVault";

const kinds: VaultKindAddresses = {
  organization: "https://vocab.example.test/base/t/Organization",
  project: "https://vocab.example.test/base/t/Project",
  person: "https://vocab.example.test/base/t/Person",
};

describe("vaultRepresentsLabel", () => {
  it("uses the three addresses, then the last segment, and does not trim", () => {
    expect(vaultRepresentsLabel(kinds.organization, kinds)).toBe("Organization");
    expect(vaultRepresentsLabel(kinds.person, kinds)).toBe("Person");
    expect(vaultRepresentsLabel("https://other.example.test/base/t/Person", kinds)).toBe("Person");
    expect(vaultRepresentsLabel("https://other.example.test/base/t/", kinds)).toBe(
      "https://other.example.test/base/t/",
    );
    expect(vaultRepresentsLabel("  Custom  ", kinds)).toBe("  Custom  ");
    expect(vaultRepresentsLabel(null, kinds)).toBeNull();
    expect(vaultRepresentsLabel("", kinds)).toBeNull();
  });
});

describe("isGroupVault", () => {
  it("keeps a typed organization even without read, and requires read for an untyped name", () => {
    expect(isOrgOrProjectVault({ represents: kinds.project }, kinds)).toBe(true);
    expect(
      isGroupVault(
        { represents: kinds.organization, isLandingVault: true, name: "", modes: [] },
        kinds,
      ),
    ).toBe(true);
    expect(
      isGroupVault({ represents: kinds.person, name: "Kai", modes: ["read"] }, kinds),
    ).toBe(false);
    expect(
      isGroupVault({ name: "Fortnight", modes: ["read"], isLandingVault: false }, kinds),
    ).toBe(true);
    expect(isGroupVault({ name: "Fortnight", modes: ["write"] }, kinds)).toBe(false);
    expect(isGroupVault({ name: "   ", modes: ["read"] }, kinds)).toBe(false);
    expect(isGroupVault({ name: "Home", modes: ["read"], isLandingVault: true }, kinds)).toBe(false);
    expect(
      isGroupVault(
        { represents: "https://other.example.test/base/t/Person", name: "Other", modes: ["read"] },
        kinds,
      ),
    ).toBe(true);
  });
});

describe("writableParentVaults", () => {
  it("keeps write plus a truthy id, in order, without trimming the id", () => {
    const rows = [
      { name: "no-id", modes: ["write"] },
      { name: "read-only", modes: ["read"], "@id": "https://example.test/base" },
      { name: "blank", modes: ["write"], "@id": "" },
      { name: "spaces", modes: ["write"], "@id": " " },
      { name: "ok", modes: ["write", "read"], "@id": "https://example.test/base/e/ok" },
    ];
    expect(writableParentVaults(rows).map((row) => row.name)).toEqual(["spaces", "ok"]);
  });
});
