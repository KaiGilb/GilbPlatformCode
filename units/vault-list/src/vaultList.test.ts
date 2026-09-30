import { expect, test } from "vitest";
import { defaultWriteVaultId, orderVaultsAsTree, vaultLabel, writableVaults } from "./vaultList";

test("a name wins, otherwise the first hostname label of a /base address", () => {
  expect(vaultLabel({ name: "Home", vaultId: "https://other.example.test/base" })).toBe("Home");
  expect(vaultLabel({ vaultId: "https://bilen.example.test/base" })).toBe("bilen");
  expect(vaultLabel({ vaultId: "not a url" })).toBe("not a url");
});

test("only a vault that lists write can be written, and the viewed one is the default", () => {
  const vaults = [
    { vaultId: "read", modes: ["read"], isLanding: true },
    { vaultId: "write", modes: ["write"] },
    { vaultId: "both", modes: ["read", "write"] },
  ];
  expect(writableVaults(vaults).map((v) => v.vaultId)).toEqual(["write", "both"]);
  expect(writableVaults(null)).toEqual([]);
  expect(defaultWriteVaultId(vaults, "both")).toBe("both");
  expect(defaultWriteVaultId(vaults, "read")).toBe("write");
  expect(defaultWriteVaultId([{ vaultId: "read", modes: ["read"] }], "read")).toBeNull();
});

test("the landing vault leads, a child sits under its parent, and a loop stops", () => {
  const landing = { vaultId: "me", name: "Me", entity: "e-me", isLanding: true, parent: { vaultId: "org", entity: "e-org" } };
  const org = { vaultId: "org", name: "Org", entity: "e-org" };
  const child = { vaultId: "desk", name: "Desk", parent: { vaultId: "org", entity: "e-org" } };
  const outside = { vaultId: "away", name: "Away", parent: { vaultId: "missing" } };
  const rows = orderVaultsAsTree([child, outside, org, landing]);
  expect(rows.map((row) => `${row.vault.vaultId}:${row.depth}`)).toEqual(["me:0", "away:0", "org:0", "desk:1"]);
});
