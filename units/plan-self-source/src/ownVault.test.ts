// The signed-in person's own vault, as the card needs it: the vault's id is what the reachable set carries, not the root of the session vault's
// entity (on a real platform that entity is the seat record's address). Ported from lib/contact/ownVault.test.ts (all four cases).
import { describe, expect, it } from "vitest";
import { ownVaultIdOf } from "./ownVault";

const V = "https://kai.platform.example.test/vault";
const OTHER = "https://team.platform.example.test/vault";
// The shape the platform really answers: the seat entity sits on another host and path than the vault's id.
const SEAT_ENTITY = "https://platform.example.test/base/e/seatpod-c9f4b5b5";

describe("ownVaultIdOf", () => {
  it("the session vault's row in the reachable set is the answer, though the seat entity's root is a different address", () => {
    expect(ownVaultIdOf({ reach: { vaultId: V }, vaults: [{ vaultId: OTHER, isLandingVault: false }, { vaultId: V, isLandingVault: true }], sessionVaultEntity: SEAT_ENTITY })).toBe(V);
  });

  it("with no row for the session vault, the one the platform flags as the landing vault", () => {
    expect(ownVaultIdOf({ reach: null, vaults: [{ vaultId: OTHER, isLandingVault: false }, { vaultId: V, isLandingVault: true }], sessionVaultEntity: SEAT_ENTITY })).toBe(V);
  });

  it("with neither, the root of the session vault's entity (the earlier derivation, kept for a deployment whose entity is under the vault)", () => {
    expect(ownVaultIdOf({ reach: null, vaults: [], sessionVaultEntity: "https://kai.platform.example.test/vault/e/abc" })).toBe(V);
  });

  it("nothing known is null, never another reachable vault", () => {
    expect(ownVaultIdOf({ reach: null, vaults: [{ vaultId: OTHER, isLandingVault: false }], sessionVaultEntity: null })).toBeNull();
    expect(ownVaultIdOf({ reach: undefined, vaults: undefined, sessionVaultEntity: undefined })).toBeNull();
  });
});

