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

import { choiceLine, vaultChoices } from "./vaultList";

test("vaultChoices puts the person's own vault first and keeps the order inside each group", () => {
  const vaults = [
    { vaultId: "https://a.example.test/vault", name: "A", modes: ["read"] },
    { vaultId: "https://b.example.test/vault", name: "B", modes: ["read", "write"] },
    { vaultId: "https://c.example.test/vault", name: "C", modes: ["write"] },
  ];
  const rows = vaultChoices(vaults, (v) => v.vaultId === "https://c.example.test/vault");
  expect(rows.map((r) => r.label)).toEqual(["C", "A", "B"]);
  expect(rows.map((r) => r.yours)).toEqual([true, false, false]);
  expect(rows.map((r) => r.viewOnly)).toEqual([false, true, false]);
});

test("vaultChoices: an empty list, no own vault, and a vault with no modes (view only)", () => {
  expect(vaultChoices([], () => true)).toEqual([]);
  const rows = vaultChoices([{ vaultId: "x" }, { vaultId: "y", modes: ["write"] }], () => false);
  expect(rows.map((r) => r.vaultId)).toEqual(["x", "y"]);
  expect(rows.map((r) => r.viewOnly)).toEqual([true, false]);
});

test("vaultChoices: a nameless vault is labelled by vaultLabel's rule, and two own vaults both lead", () => {
  const rows = vaultChoices(
    [{ vaultId: "https://bilen.example.test/base" }, { vaultId: "https://m.example.test/vault", name: "Mine" }, { vaultId: "https://n.example.test/vault", name: "Mine too" }],
    (v) => v.vaultId.startsWith("https://m.") || v.vaultId.startsWith("https://n."),
  );
  expect(rows.map((r) => r.label)).toEqual(["Mine", "Mine too", "bilen"]);
});

test("choiceLine: Yours or Shared with you, then View only when it cannot be written", () => {
  expect(choiceLine({ yours: true, viewOnly: false })).toBe("Yours");
  expect(choiceLine({ yours: false, viewOnly: false })).toBe("Shared with you");
  expect(choiceLine({ yours: false, viewOnly: true })).toBe("Shared with you · View only");
  expect(choiceLine({ yours: true, viewOnly: true })).toBe("Yours · View only");
});

test("choiceLine takes other words for any of the three phrases", () => {
  expect(choiceLine({ yours: false, viewOnly: true }, { shared: "Delt", viewOnly: "Kun lesing" })).toBe("Delt · Kun lesing");
  expect(choiceLine({ yours: true, viewOnly: false }, { yours: "Din" })).toBe("Din");
});

test("an unnamed user vault at /vault is named by its first hostname label", () => {
  expect(vaultLabel({ vaultId: "https://annhouseplants.example.test/vault" })).toBe("annhouseplants");
});
test("the same with a trailing slash", () => {
  expect(vaultLabel({ vaultId: "https://annhouseplants.example.test/vault/" })).toBe("annhouseplants");
});
test("an unnamed /base vault still takes the first hostname label", () => {
  expect(vaultLabel({ vaultId: "https://bilen.example.test/base/" })).toBe("bilen");
});
test("name wins over shortName, and shortName wins over the host label", () => {
  const vaultId = "https://ann.example.test/vault";
  expect(vaultLabel({ name: "Home", shortName: "short", vaultId })).toBe("Home");
  expect(vaultLabel({ shortName: " short ", vaultId })).toBe("short");
  expect(vaultLabel({ name: null, shortName: "short", vaultId })).toBe("short");
});
test("a whitespace-only name and shortName are skipped", () => {
  expect(vaultLabel({ name: "  ", shortName: "   ", vaultId: "https://ann.example.test/vault" })).toBe("ann");
});
test("a non-URL vaultId of the bare word vault never comes back as just vault", () => {
  const label = vaultLabel({ vaultId: "vault" });
  expect(label).not.toBe("vault");
  expect(label).toBe("Vault vault");
});
test("vaultChoices labels an unnamed user vault by its host label", () => {
  expect(vaultChoices([{ vaultId: "https://ann.example.test/vault", modes: ["read"] }], () => false)[0]!.label).toBe("ann");
});
