// The controller is made once per open card. A refresh of the record after a write (its served facts change) must not build a new one (a
// new one would read the card again, mid-act).
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const refreshRecordInCaches = vi.hoisted(() => vi.fn(async () => undefined));
const patchRecord = vi.hoisted(() => vi.fn(async () => ({ etag: null })));
vi.mock("@kaigilb/gilbplatformcode-record-cache-kit", async (importOriginal) => ({ ...((await importOriginal()) as object), refreshRecordInCaches }));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...((await orig()) as object), patchRecord }));
import "../test/origins";
import { useOnlineCardController } from "./useOnlineCardController";
import { __resetConnectedRecords, connectedKnown } from "./connectedRecords";

const client = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const base = { enabled: true, vaultId: "https://h.example.test/vault", holder: "https://id.example.test/base/p/h", canWrite: true };

describe("useOnlineCardController", () => {
  it("one controller per open card: a new served read of the same record keeps it", () => {
    const rec = (facts: Record<string, unknown>) => ({ id: "r1", entityUri: "https://h.example.test/vault/e/r1", served: { facts } });
    const { result, rerender } = renderHook((p: { record: ReturnType<typeof rec> }) => useOnlineCardController({ ...base, record: p.record }), { wrapper, initialProps: { record: rec({}) } });
    const first = result.current;
    expect(first).not.toBeNull();
    rerender({ record: rec({ sameAs: { "@id": "https://k.example.test/vault" } }) });
    expect(result.current).toBe(first);
  });
  it("a list stub (no served document) has no controller yet; the controller comes when the full read arrives, and then keeps the link it read", () => {
    const rec = (served?: Record<string, unknown>) => ({ id: "r1", entityUri: "https://h.example.test/vault/e/r1", ...(served ? { served: { facts: served } } : {}) });
    const { result, rerender } = renderHook((p: { record: ReturnType<typeof rec> }) => useOnlineCardController({ ...base, record: p.record }), { wrapper, initialProps: { record: rec() } });
    expect(result.current).toBeNull();
    rerender({ record: rec({ sameAs: { "@id": "https://k.example.test/vault" } }) });
    expect(result.current?.getState().link).toEqual({ state: "linked", target: "https://k.example.test/vault" });
  });
  it("another record is another controller; a card that is not a ready person's has none", () => {
    const { result, rerender } = renderHook((p: { id: string; enabled: boolean }) => useOnlineCardController({ ...base, enabled: p.enabled, record: { id: p.id, entityUri: `https://h.example.test/vault/e/${p.id}`, served: { facts: {} } } }), { wrapper, initialProps: { id: "r1", enabled: true } });
    const first = result.current;
    rerender({ id: "r2", enabled: true });
    expect(result.current).not.toBe(first);
    rerender({ id: "r2", enabled: false });
    expect(result.current).toBeNull();
  });
  it("making one requests nothing", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    renderHook(() => useOnlineCardController({ ...base, record: { id: "r1", entityUri: "https://h.example.test/vault/e/r1", served: { facts: {} } } }), { wrapper });
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("the list's memory of a read link", () => {
  it("opening a record whose own read carries the link notes it connected; one with none notes it not", () => {
    __resetConnectedRecords();
    renderHook(() => useOnlineCardController({ ...base, record: { id: "a", entityUri: "https://h.example.test/vault/e/a", served: { facts: { sameAs: { "@id": "https://k.example.test/vault" } } } } }), { wrapper });
    renderHook(() => useOnlineCardController({ ...base, record: { id: "b", entityUri: "https://h.example.test/vault/e/b", served: { facts: {} } } }), { wrapper });
    expect(connectedKnown("https://h.example.test/vault/e/a")).toBe(true);
    expect(connectedKnown("https://h.example.test/vault/e/b")).toBe(false);
    expect(connectedKnown("https://h.example.test/vault/e/never-opened")).toBeUndefined();
  });
  it("a record that carries two links is noted not connected (no online card is chosen)", () => {
    __resetConnectedRecords();
    const two = { sameAs: [{ "@id": "https://k.example.test/vault" }, { "@id": "https://m.example.test/vault" }] };
    renderHook(() => useOnlineCardController({ ...base, record: { id: "t", entityUri: "https://h.example.test/vault/e/t", served: { facts: two } } }), { wrapper });
    expect(connectedKnown("https://h.example.test/vault/e/t")).toBe(false);
  });
});

describe("a link change refreshes the record", () => {
  const rec = { id: "r9", entityUri: "https://h.example.test/vault/e/r9", served: { facts: {} as Record<string, unknown> } };
  it("connecting and unlinking each read the record again, once, so the list and the pane follow", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    refreshRecordInCaches.mockClear();
    const { result } = renderHook(() => useOnlineCardController({ ...base, record: rec }), { wrapper });
    await act(async () => {
      await result.current!.confirmLink({ principal: "https://k.example.test/vault" });
    });
    expect(patchRecord).toHaveBeenCalledTimes(1);
    expect(refreshRecordInCaches).toHaveBeenCalledTimes(1);
    expect(refreshRecordInCaches).toHaveBeenCalledWith(client, base.vaultId, { id: "r9", entityUri: rec.entityUri });
    await act(async () => {
      await result.current!.unlink();
    });
    expect(refreshRecordInCaches).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
