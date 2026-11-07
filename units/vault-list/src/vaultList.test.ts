import { expect, test } from "vitest";
import { defaultWriteVaultId, orderVaultsAsTree, vaultLabel, vaultRootFromList, writableVaults } from "./vaultList";

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

test("the root is the vaultId as listed, found by host or by name, never composed", () => {
  const list = [
    { vaultId: "https://kai.example.test/vault", name: "Kai" },
    { vaultId: "https://id.example.test/base", name: "Sign-in" },
    { vaultId: "https://twin.example.test/vault", name: "Kai" },
  ];
  expect(vaultRootFromList(list, "kai.example.test")).toBe("https://kai.example.test/vault");
  expect(vaultRootFromList(list, "HTTPS://Kai.Example.Test/anything")).toBe("https://kai.example.test/vault");
  expect(vaultRootFromList(list, "id.example.test")).toBe("https://id.example.test/base");
  expect(vaultRootFromList(list, "sign-in")).toBe("https://id.example.test/base");
});

test("a host or name that is not listed, or a name that fits two vaults, gives null", () => {
  const list = [
    { vaultId: "https://kai.example.test/vault", name: "Kai" },
    { vaultId: "https://twin.example.test/vault", name: "Kai" },
  ];
  expect(vaultRootFromList(list, "other.example.test")).toBeNull();
  expect(vaultRootFromList(list, "Kai")).toBeNull();
  expect(vaultRootFromList(list, "  ")).toBeNull();
  expect(vaultRootFromList(null, "kai.example.test")).toBeNull();
  expect(vaultRootFromList([], "kai.example.test")).toBeNull();
});
