import { describe, expect, it } from "vitest";
import { narrowVaultModes, readSessionVaults } from "./vaultModes";

describe("narrowVaultModes", () => {
  it("keeps read and write in first-seen order and drops the rest", () => {
    expect(narrowVaultModes(["write", "append", "read", "write", "control", "Read", " read"])).toEqual([
      "write",
      "read",
    ]);
    expect(narrowVaultModes(undefined)).toEqual([]);
    expect(narrowVaultModes(null)).toEqual([]);
    expect(narrowVaultModes([])).toEqual([]);
    expect(narrowVaultModes(["read", "read"])).toEqual(["read"]);
  });
});

describe("readSessionVaults", () => {
  it("drops a falsy id, keeps a blank-looking id, and narrows modes", () => {
    const raw = [
      { vaultId: "", modes: ["read"] },
      { vaultId: "  ", modes: ["append", "write"] },
      { modes: ["read"] },
      { vaultId: "https://h.example.test/base/p1", modes: ["read", "write", "read"] },
      { vaultId: "https://h.example.test/base/p1", modes: ["control"] },
    ];
    expect(readSessionVaults(raw)).toEqual([
      { vaultId: "  ", modes: ["write"] },
      { vaultId: "https://h.example.test/base/p1", modes: ["read", "write"] },
      { vaultId: "https://h.example.test/base/p1", modes: [] },
    ]);
    expect(readSessionVaults(undefined)).toEqual([]);
    expect(readSessionVaults(null)).toEqual([]);
    expect(raw[3]?.modes).toEqual(["read", "write", "read"]);
  });
});
