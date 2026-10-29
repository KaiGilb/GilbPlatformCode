// @vitest-environment jsdom
// The two hooks pinned: what they call unconditionally, what they hand the write, and what they drop from the cache afterwards.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECORDS_QUERY_HEAD, RECORD_QUERY_HEAD } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { stakeholderReferenceReadingQueryKey } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import * as card from "./cardReferences";
import { useAddCardReference, useRemoveCardReference, type CardReferencesHost } from "./useAddCardReference";

const ORIGIN = "https://ontology.example.test";
const TARGET = "https://a.example.test/e/g1";

beforeEach(() => setTermOrigin(ORIGIN));
afterEach(() => {
  resetTermOrigin();
  vi.restoreAllMocks();
});

function clientWith() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  qc.setQueryData([...RECORD_QUERY_HEAD, "x", "https://a.example.test"], { id: "x" });
  qc.setQueryData([...RECORDS_QUERY_HEAD, "snapshot", "v"], { records: [] });
  qc.setQueryData(["base", "other"], { kept: true });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  const stale = () => ({
    record: qc.getQueryState([...RECORD_QUERY_HEAD, "x", "https://a.example.test"])!.isInvalidated,
    records: qc.getQueryState([...RECORDS_QUERY_HEAD, "snapshot", "v"])!.isInvalidated,
    other: qc.getQueryState(["base", "other"])!.isInvalidated,
  });
  return { qc, wrapper, stale };
}
const input = { vaultId: "v", agent: "a", carrier: "c", field: {} as never, target: "t" };
const removal = { recordId: "r1", carrier: "https://a.example.test/e/r1", factKeys: ["memberOf"], target: TARGET, label: "member of" };

describe("useAddCardReference", () => {
  it("hands the write the field sets as given, the session's reference reading from the query cache, and the card's master source", async () => {
    const { qc, wrapper } = clientWith();
    const reading = { relations: [] };
    qc.setQueryData(stakeholderReferenceReadingQueryKey(), reading);
    const fieldSets = { byKind: {} } as never;
    const spy = vi.spyOn(card, "addReferenceFromCard").mockResolvedValue({ carrier: "c" } as never);
    const { result } = renderHook(() => useAddCardReference(fieldSets), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const [deps, passed] = spy.mock.calls[0]!;
    expect(deps.fieldSets).toBe(fieldSets);
    expect(passed).toBe(input);
    expect(await deps.references()).toBe(reading);
    expect(deps.source.termIri("t/Person")).toBe(`${ORIGIN}/base/t/Person`);
  });
  it("drops the cached record reads and records lists after a success, and nothing else", async () => {
    const { wrapper, stale } = clientWith();
    vi.spyOn(card, "addReferenceFromCard").mockResolvedValue({ carrier: "c" } as never);
    const { result } = renderHook(() => useAddCardReference({} as never), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    await waitFor(() => expect(stale()).toEqual({ record: true, records: true, other: false }));
  });
  it("drops nothing when the write is refused, and the package's error comes out as it is", async () => {
    const { wrapper, stale } = clientWith();
    const refused = new Error("refused by the package");
    vi.spyOn(card, "addReferenceFromCard").mockRejectedValue(refused);
    const { result } = renderHook(() => useAddCardReference({} as never), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toBe(refused);
    });
    expect(stale()).toEqual({ record: false, records: false, other: false });
  });
  it("calls useQueryClient and useMutation unconditionally: with no provider it throws, whatever the fields", () => {
    expect(() => renderHook(() => useAddCardReference({} as never))).toThrow(/No QueryClient set/);
  });
  it("a re-render with other field sets keeps the hooks in the same order", () => {
    const { wrapper } = clientWith();
    const { rerender, result } = renderHook(({ f }) => useAddCardReference(f), { wrapper, initialProps: { f: {} as never } });
    rerender({ f: { byKind: {} } as never });
    expect(typeof result.current.mutateAsync).toBe("function");
  });
});

describe("useRemoveCardReference", () => {
  const hostRemoving = (calls: unknown[][] = []): CardReferencesHost => ({
    async changeRecordFactItems(...args) {
      calls.push(args.slice(0, 3));
      args[3]([{ "@id": TARGET }]);
      return [];
    },
  });
  it("removes through the host's writer and then drops the cached record reads and records lists", async () => {
    const { wrapper, stale } = clientWith();
    const calls: unknown[][] = [];
    const { result } = renderHook(() => useRemoveCardReference(hostRemoving(calls)), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(removal);
    });
    expect(calls).toEqual([["r1", "https://a.example.test/e/r1", "memberOf"]]);
    await waitFor(() => expect(stale()).toEqual({ record: true, records: true, other: false }));
  });
  it("drops nothing when no link was removed, and says so", async () => {
    const { wrapper, stale } = clientWith();
    const host: CardReferencesHost = { changeRecordFactItems: async (_r, _c, _k, change) => (change([]), []) };
    const { result } = renderHook(() => useRemoveCardReference(host), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(removal)).rejects.toThrow(/nothing was changed/);
    });
    expect(stale()).toEqual({ record: false, records: false, other: false });
  });
  it("calls useQueryClient and useMutation unconditionally: with no provider it throws", () => {
    expect(() => renderHook(() => useRemoveCardReference(hostRemoving()))).toThrow(/No QueryClient set/);
  });
  it("a host given at a later render is the one used at the next remove", async () => {
    const { wrapper } = clientWith();
    const a: unknown[][] = [];
    const b: unknown[][] = [];
    const { result, rerender } = renderHook(({ h }) => useRemoveCardReference(h), { wrapper, initialProps: { h: hostRemoving(a) } });
    rerender({ h: hostRemoving(b) });
    await act(async () => {
      await result.current.mutateAsync(removal);
    });
    expect([a.length, b.length]).toEqual([0, 1]);
  });
});
