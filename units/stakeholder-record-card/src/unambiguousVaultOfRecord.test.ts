// The vault a record's own address names, answered only when it cannot be wrong.
import { describe, expect, it } from "vitest";
import { unambiguousVaultOfRecord } from "./unambiguousVaultOfRecord";

const P = "https://p.example.test/vault";
const NAMED = "https://p.example.test/vault";

describe("unambiguousVaultOfRecord", () => {
  it("no address: not known", () => {
    expect(unambiguousVaultOfRecord(null, [{ vaultId: P }])).toBeNull();
    expect(unambiguousVaultOfRecord(undefined, [{ vaultId: P }])).toBeNull();
    expect(unambiguousVaultOfRecord("", [{ vaultId: P }])).toBeNull();
  });
  it("an address that names no vault: not known", () => {
    expect(unambiguousVaultOfRecord("https://p.example.test/base/e/x", [{ vaultId: P }])).toBeNull();
  });
  it("the named vault is one the person holds and no held vault sits under it: that vault", () => {
    expect(unambiguousVaultOfRecord(`${NAMED}/e/x`, [{ vaultId: P }, { vaultId: "https://other.example.test/vault" }])).toBe(P);
  });
  it("a trailing slash on a held vault does not hide it", () => {
    expect(unambiguousVaultOfRecord(`${NAMED}/e/x`, [{ vaultId: `${P}/` }])).toBe(P);
  });
  it("the named vault is not one the person holds: not known", () => {
    expect(unambiguousVaultOfRecord(`${NAMED}/e/x`, [{ vaultId: "https://other.example.test/vault" }])).toBeNull();
    expect(unambiguousVaultOfRecord(`${NAMED}/e/x`, [])).toBeNull();
  });
  it("a held vault sits under the named one (the record may belong to the nested vault): not known", () => {
    expect(unambiguousVaultOfRecord(`${NAMED}/e/x`, [{ vaultId: P }, { vaultId: `${P}/nested` }])).toBeNull();
  });
  it("vaults without an id are ignored", () => {
    expect(unambiguousVaultOfRecord(`${NAMED}/e/x`, [{ vaultId: null }, {}, { vaultId: P }])).toBe(P);
  });
});
