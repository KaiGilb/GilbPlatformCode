// The small pure parts: a vault's root, the profile pointer's attribute, the person's name, the own vault's id beyond the ported cases, and the index.
import { describe, expect, it } from "vitest";
import * as unit from "./index";
import { PROFILE_POINTER_ATTR, vaultRootOf } from "./vaultRoot";
import { joinPersonName } from "./personName";
import { ownVaultIdOf } from "./ownVault";

describe("vaultRootOf", () => {
  it("is the origin and the vault segment the address carries, whatever follows", () => {
    expect(vaultRootOf("https://kai.example.test/vault")).toBe("https://kai.example.test/vault");
    expect(vaultRootOf("https://kai.example.test/vault/e/abc?x=1#y")).toBe("https://kai.example.test/vault");
    expect(vaultRootOf("https://id.example.test/base/e/seat")).toBe("https://id.example.test/base");
    expect(vaultRootOf("http://rig.example.test:5301/vault/r/x")).toBe("http://rig.example.test:5301/vault");
  });
  it("is the base segment when the address names none, and null when it is no address", () => {
    expect(vaultRootOf("https://kai.example.test")).toBe("https://kai.example.test/base");
    expect(vaultRootOf("https://kai.example.test/other/e/a")).toBe("https://kai.example.test/base");
    expect(vaultRootOf("not an address")).toBeNull();
    expect(vaultRootOf("")).toBeNull();
  });
  it("names the attribute that points a vault's entity at the person's profile card", () => {
    expect(PROFILE_POINTER_ATTR).toBe("mnbProfile");
  });
});

describe("joinPersonName", () => {
  it("is the given name, a space, the family name; either may be empty; each is trimmed", () => {
    expect(joinPersonName("Ada", "Lovelace")).toBe("Ada Lovelace");
    expect(joinPersonName("  Ada ", " Lovelace  ")).toBe("Ada Lovelace");
    expect(joinPersonName("Ada", "")).toBe("Ada");
    expect(joinPersonName("", "Lovelace")).toBe("Lovelace");
    expect(joinPersonName(" ", " ")).toBe("");
  });
});

describe("ownVaultIdOf beyond the ported cases", () => {
  it("prefers the session vault's row over a landing flag, and a landing flag over the entity's root", () => {
    const vaults = [{ vaultId: "https://a.example.test/vault", isLandingVault: true }];
    expect(ownVaultIdOf({ reach: { vaultId: "https://b.example.test/vault" }, vaults, sessionVaultEntity: "https://c.example.test/vault/e/x" })).toBe("https://b.example.test/vault");
    expect(ownVaultIdOf({ reach: { vaultId: "" }, vaults, sessionVaultEntity: "https://c.example.test/vault/e/x" })).toBe("https://a.example.test/vault");
    expect(ownVaultIdOf({ reach: null, vaults: [], sessionVaultEntity: "https://c.example.test/vault/e/x" })).toBe("https://c.example.test/vault");
    expect(ownVaultIdOf({ reach: null, vaults: [], sessionVaultEntity: "" })).toBeNull();
    expect(ownVaultIdOf({ reach: null, vaults: [], sessionVaultEntity: "not an address" })).toBeNull();
  });
});

describe("the package index", () => {
  it("exports the finding, the hook and the small parts they stand on", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["PROFILE_POINTER_ATTR", "joinPersonName", "ownCardDeps", "ownCardFindingKey", "ownCardFindingQuery", "ownVaultIdOf", "useSelfSource", "vaultRootOf"].sort(),
    );
  });
});
