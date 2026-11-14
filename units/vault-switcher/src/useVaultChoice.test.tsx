import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "@kaigilb/gilbplatformcode-vault-list";
import { useVaultChoice, type ListedVaultRow, type UseVaultChoiceOptions } from "./useVaultChoice";

const TYPE = "https://types.example.test/t/Teapot";
const OWN = "https://ann.example.test/vault";
const BOB = "https://bob.example.test/vault";
const CY = "https://cy.example.test/vault";

const memory = (seed: Record<string, string> = {}) => {
  const m = new Map(Object.entries(seed));
  const store: KeyValueStore = { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
  return { m, store };
};
const listed: ListedVaultRow[] = [
  { vaultId: BOB, modes: ["read"], name: "bobteapots", represents: "https://other.example.test/t/Teapot" },
  { vaultId: OWN, modes: ["read", "write"], name: "annteapots", represents: TYPE },
  { vaultId: CY, modes: ["read", "write"], name: "cyteapots", represents: TYPE },
  { vaultId: "https://dan.example.test/vault", modes: ["read"], name: "danplants", represents: "https://types.example.test/t/Plant" },
  { vaultId: "https://landing.example.test/vault", modes: ["read", "write"] },
];
const setup = (over: Partial<UseVaultChoiceOptions> = {}, seed?: Record<string, string>) => {
  const mem = memory(seed);
  const hook = renderHook((p: Partial<UseVaultChoiceOptions>) => useVaultChoice({ listed, ownVaultId: OWN, principal: "ann", appKey: "teapots", represents: TYPE, store: mem.store, ...p }), { initialProps: over });
  return { ...hook, mem };
};

describe("useVaultChoice", () => {
  it("offers the app's vaults, the person's own first; other types and a bare vault are left out; a type under another host matches by bare name", () => {
    const { result } = setup();
    expect(result.current.options.map((o) => o.vaultId)).toEqual([OWN, BOB, CY]);
    expect(result.current.options[0]).toMatchObject({ yours: true, label: "annteapots", viewOnly: false });
    expect(result.current.options[1]).toMatchObject({ yours: false, viewOnly: true });
  });
  it("with no represents, every listed vault is offered", () => {
    const { result } = setup({ represents: undefined as never });
    expect(result.current.options).toHaveLength(5);
  });
  it("the own vault is offered even when the list does not carry it, and opens by default", () => {
    const { result } = setup({ listed: [{ vaultId: CY, modes: ["read"], represents: TYPE }] });
    expect(result.current.options.map((o) => o.vaultId)).toEqual([OWN, CY]);
    expect(result.current.current.vaultId).toBe(OWN);
    expect(result.current.canWrite).toBe(true);
  });
  it("switchTo opens the vault, keeps the choice per person and app, and canWrite follows the vault's modes", () => {
    const { result, mem } = setup();
    act(() => result.current.switchTo(BOB));
    expect(result.current.current.vaultId).toBe(BOB);
    expect(result.current.canWrite).toBe(false);
    expect(mem.m.get("teapots:ann:current")).toBe(BOB);
    act(() => result.current.switchTo(CY));
    expect(result.current.canWrite).toBe(true);
    act(() => result.current.switchTo(OWN));
    expect(result.current.canWrite).toBe(true);
    expect(result.current.current.yours).toBe(true);
  });
  it("a kept choice opens next time, only for that person and app", () => {
    const seed = { "teapots:ann:current": CY };
    expect(setup({}, seed).result.current.current.vaultId).toBe(CY);
    expect(setup({ principal: "bob" }, seed).result.current.current.vaultId).toBe(OWN);
    expect(setup({ appKey: "plants" }, seed).result.current.current.vaultId).toBe(OWN);
  });
  it("a kept choice that is no longer listed opens the own vault", () => {
    expect(setup({}, { "teapots:ann:current": "https://gone.example.test/vault" }).result.current.current.vaultId).toBe(OWN);
  });
  it("switchTo ignores a vault that is not offered and keeps nothing for it", () => {
    const { result, mem } = setup();
    act(() => result.current.switchTo("https://dan.example.test/vault"));
    expect(result.current.current.vaultId).toBe(OWN);
    expect(mem.m.size).toBe(0);
  });
  it("markGone drops the vault from the options; if it was open the own vault opens, and the kept choice is forgotten", () => {
    const { result, mem } = setup({}, { "teapots:ann:current": BOB });
    expect(result.current.current.vaultId).toBe(BOB);
    act(() => result.current.markGone(BOB));
    expect(result.current.options.map((o) => o.vaultId)).toEqual([OWN, CY]);
    expect(result.current.current.vaultId).toBe(OWN);
    expect(mem.m.has("teapots:ann:current")).toBe(false);
  });
  it("markGone of another vault keeps the kept choice; the own vault is never dropped", () => {
    const { result, mem } = setup({}, { "teapots:ann:current": CY });
    act(() => result.current.markGone(BOB));
    act(() => result.current.markGone(OWN));
    expect(result.current.options.map((o) => o.vaultId)).toEqual([OWN, CY]);
    expect(result.current.current.vaultId).toBe(CY);
    expect(mem.m.get("teapots:ann:current")).toBe(CY);
  });
  it("a store that throws keeps nothing and breaks nothing", () => {
    const store: KeyValueStore = { get: () => { throw new Error("blocked"); }, set: () => { throw new Error("full"); }, remove: () => { throw new Error("blocked"); } };
    const { result } = setup({ store });
    act(() => result.current.switchTo(CY));
    expect(result.current.current.vaultId).toBe(CY);
    act(() => result.current.markGone(CY));
    expect(result.current.current.vaultId).toBe(OWN);
  });
  it("without a store it uses localStorage", () => {
    const kept = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) });
    try {
      const { result } = renderHook(() => useVaultChoice({ listed, ownVaultId: OWN, principal: "ann", appKey: "teapots", represents: TYPE }));
      act(() => result.current.switchTo(CY));
      expect(kept.get("teapots:ann:current")).toBe(CY);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
