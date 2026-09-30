import { describe, expect, it } from "vitest";
import { landingVaultId, vaultById } from "./vaultRow";

const rows = [
  { vaultId: "first", isLandingVault: false, entity: "https://example.test/base/e/first" },
  { vaultId: "home", isLandingVault: true, entity: "https://example.test/base/e/home" },
  { vaultId: "home", isLandingVault: false, entity: "https://example.test/base/e/other" },
];

describe("vaultById", () => {
  it("returns the first exact id and never a positional fallback", () => {
    expect(vaultById(rows, "home")?.entity).toBe("https://example.test/base/e/home");
    expect(vaultById(rows, "missing")).toBeNull();
    expect(vaultById(rows, "")).toBeNull();
    expect(vaultById(rows, " home ")).toBeNull();
    expect(vaultById(null, "first")).toBeNull();
    expect(vaultById([], "first")).toBeNull();
    expect(vaultById(rows, "https://example.test/base/e/first")).toBeNull();
  });
});

describe("landingVaultId", () => {
  it("prefers the landing flag, else the first row, else null", () => {
    expect(landingVaultId(rows)).toBe("home");
    expect(landingVaultId([{ vaultId: "only", isLandingVault: false }])).toBe("only");
    expect(landingVaultId([])).toBeNull();
    expect(landingVaultId(null)).toBeNull();
    expect(landingVaultId([{ vaultId: "", isLandingVault: true }])).toBe("");
  });
});
