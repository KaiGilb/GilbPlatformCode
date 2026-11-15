import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "@kaigilb/gilbplatformcode-vault-list";
import { useVaultChoice, type ListedVaultRow, type UseVaultChoiceOptions } from "./useVaultChoice";

const TYPE = "https://types.example.test/t/Teapot";
const OWN = "https://ann.example.test/vault";
const BOB = "https://bob.example.test/vault";
const CY = "https://cy.example.test/vault";
const row = (vaultId: string, over: Partial<ListedVaultRow> = {}): ListedVaultRow => ({ vaultId, modes: ["read", "write"], name: vaultId.slice(8, 11), represents: TYPE, ...over });

const memory = (seed: Record<string, string> = {}) => {
  const m = new Map(Object.entries(seed));
  const store: KeyValueStore = { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
  return { m, store };
};
const setup = (first: ListedVaultRow[], over: Partial<UseVaultChoiceOptions> = {}, seed?: Record<string, string>) => {
  const mem = memory(seed);
  const hook = renderHook((p: Partial<UseVaultChoiceOptions>) => useVaultChoice({ listed: first, ownVaultId: OWN, principal: "ann", appKey: "teapots", represents: TYPE, store: mem.store, ...p }), { initialProps: over });
  return { ...hook, mem };
};
const ids = (r: { current: { options: Array<{ vaultId: string }> } }) => r.current.options.map((o) => o.vaultId);
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("useVaultChoice: a list that changes after start", () => {
  it("a new `listed` array shows at once, without a remount (already so before refresh existed)", () => {
    const first = [row(OWN)];
    const { result, rerender } = setup(first);
    expect(ids(result)).toEqual([OWN]);
    rerender({ listed: [row(OWN), row(BOB, { modes: ["read"] })] });
    expect(ids(result)).toEqual([OWN, BOB]);
  });

  it("refresh() reads with `load` and a vault shared since start appears in options", async () => {
    const { result } = setup([row(OWN)], { load: async () => [row(OWN), row(BOB, { modes: ["read"] })] });
    expect(ids(result)).toEqual([OWN]);
    let answered: string[] = [];
    await act(async () => void (answered = (await result.current.refresh()).map((c) => c.vaultId)));
    expect(ids(result)).toEqual([OWN, BOB]);
    expect(answered).toEqual([OWN, BOB]);
    expect(result.current.options[1]).toMatchObject({ viewOnly: true });
  });

  it("refresh() applies the same filter as `listed`: other types and a bare vault stay out", async () => {
    const { result } = setup([row(OWN)], { load: async () => [row(OWN), row(CY, { represents: "https://types.example.test/t/Plant" }), { vaultId: "https://landing.example.test/vault", modes: ["read"] }] });
    await act(async () => void (await result.current.refresh()));
    expect(ids(result)).toEqual([OWN]);
  });

  it("a vault the platform no longer lists leaves options; if it was open, current is the own vault", async () => {
    let rows = [row(OWN), row(BOB)];
    const { result } = setup(rows, { load: async () => rows });
    act(() => result.current.switchTo(BOB));
    expect(result.current.current.vaultId).toBe(BOB);
    rows = [row(OWN)];
    await act(async () => void (await result.current.refresh()));
    expect(ids(result)).toEqual([OWN]);
    expect(result.current.current.vaultId).toBe(OWN);
    expect(result.current.canWrite).toBe(true);
  });

  it("a vault marked gone (403) leaves at once and a refresh that still lists it does not bring it back", async () => {
    const { result, mem } = setup([row(OWN), row(BOB)], { load: async () => [row(OWN), row(BOB), row(CY)] });
    act(() => result.current.switchTo(BOB));
    act(() => result.current.markGone(BOB));
    expect(ids(result)).toEqual([OWN]);
    expect(result.current.current.vaultId).toBe(OWN);
    expect(mem.m.has("teapots:ann:current")).toBe(false);
    await act(async () => void (await result.current.refresh()));
    expect(ids(result)).toEqual([OWN, CY]);
  });

  it("a newer `listed` from the host wins over an earlier refresh", async () => {
    const { result, rerender } = setup([row(OWN)], { load: async () => [row(OWN), row(BOB)] });
    await act(async () => void (await result.current.refresh()));
    expect(ids(result)).toEqual([OWN, BOB]);
    rerender({ listed: [row(OWN), row(CY)] });
    expect(ids(result)).toEqual([OWN, CY]);
  });

  it("a slow older refresh that answers after a newer one is not shown", async () => {
    const slow = deferred<ListedVaultRow[]>();
    const answers = [slow.promise, Promise.resolve([row(OWN), row(CY)])];
    const { result } = setup([row(OWN)], { load: () => answers.shift()! });
    let older!: Promise<unknown>;
    act(() => void (older = result.current.refresh()));
    await act(async () => void (await result.current.refresh()));
    expect(ids(result)).toEqual([OWN, CY]);
    slow.resolve([row(OWN), row(BOB)]);
    await act(async () => void (await older));
    expect(ids(result)).toEqual([OWN, CY]);
  });

  it("a failed load throws and leaves the list as it was", async () => {
    const { result } = setup([row(OWN), row(BOB)], {
      load: async () => {
        throw new Error("offline");
      },
    });
    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow("offline");
    });
    expect(ids(result)).toEqual([OWN, BOB]);
  });

  it("without `load`, refresh reads nothing and answers the options as they are", async () => {
    const { result } = setup([row(OWN), row(BOB)]);
    let got: string[] = [];
    await act(async () => void (got = (await result.current.refresh()).map((c) => c.vaultId)));
    expect(got).toEqual([OWN, BOB]);
  });
});

describe("useVaultChoice: the kept choice and a list that arrives late", () => {
  it("a vault kept from last time opens when a later list carries it (the first list had only the own vault)", async () => {
    const { result } = setup([row(OWN)], { load: async () => [row(OWN), row(CY)] }, { "teapots:ann:current": CY });
    expect(result.current.current.vaultId).toBe(OWN);
    await act(async () => void (await result.current.refresh()));
    expect(result.current.current.vaultId).toBe(CY);
  });
  it("a pick made by the person is not undone by a later list", async () => {
    const { result } = setup([row(OWN), row(BOB)], { load: async () => [row(OWN), row(BOB), row(CY)] }, { "teapots:ann:current": BOB });
    act(() => result.current.switchTo(OWN));
    await act(async () => void (await result.current.refresh()));
    expect(result.current.current.vaultId).toBe(OWN);
  });
});
