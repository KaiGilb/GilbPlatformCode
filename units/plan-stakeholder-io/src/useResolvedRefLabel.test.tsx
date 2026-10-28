// @vitest-environment jsdom
// The name a link shows: a hit in the vault's loaded list wins and reads nothing; otherwise one read of the record, kept under the key the card's
// record reads use; a record that cannot be read is named by its address.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { refDisplayName } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { useResolvedRefLabel } from "./useResolvedRefLabel";
import { HOST, VAULT, installWire } from "../test/wire";
import { setUp, tearDown } from "../test/support";

const hoisted = vi.hoisted(() => ({ rows: [] as { id: string; entityUri?: string; facts: Record<string, string> }[], asked: [] as unknown[] }));
vi.mock("@kaigilb/gilbplatformcode-plan-record-hooks", () => ({
  useRecords: (vaultId: unknown) => {
    hoisted.asked.push(vaultId);
    return { data: hoisted.rows };
  },
}));

beforeEach(() => {
  setUp();
  hoisted.rows = [];
  hoisted.asked = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

const wrapper = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const URI = `${HOST}/vault/e/ann`;
const REF = { id: "ann", uri: URI };

describe("useResolvedRefLabel", () => {
  it("asks the vault's list for its records", () => {
    installWire();
    renderHook(() => useResolvedRefLabel(REF, VAULT), { wrapper: wrapper(new QueryClient()) });
    expect(hoisted.asked.every((v) => v === VAULT)).toBe(true);
  });

  it("names a record the loaded list holds by its id, and reads nothing", async () => {
    const wire = installWire();
    hoisted.rows = [{ id: "bob", facts: { name: "Bob" } }, { id: "ann", facts: { name: "Ann", label: "Ann L" } }];
    const { result } = renderHook(() => useResolvedRefLabel(REF, VAULT), { wrapper: wrapper(new QueryClient()) });
    expect(result.current).toBe("Ann L");
    await new Promise((r) => setTimeout(r, 20));
    expect(wire.reads).toEqual([]);
  });

  it("names a record the loaded list holds by its address when the ids differ", () => {
    installWire();
    hoisted.rows = [{ id: "other-id", entityUri: URI, facts: { title: "Ann T" } }];
    const { result } = renderHook(() => useResolvedRefLabel(REF, VAULT), { wrapper: wrapper(new QueryClient()) });
    expect(result.current).toBe("Ann T");
  });

  it("is null while the one read is out, then the record's name, and keeps the read under the card's record key", async () => {
    const wire = installWire();
    wire.setRecord("ann", { "@id": URI, "@type": "t:Person", "a:name": "Ann Read" });
    const qc = new QueryClient();
    const { result } = renderHook(() => useResolvedRefLabel(REF, VAULT), { wrapper: wrapper(qc) });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe("Ann Read"));
    expect(wire.reads).toHaveLength(1);
    expect(wire.reads[0]).toContain("/vault/e/ann".replace("/vault/e/", "/lws/r/"));
    expect((qc.getQueryData(["base", "record", "ann", vaultOriginOf(URI)]) as { facts: Record<string, string> }).facts.name).toBe("Ann Read");
  });

  it("names a record that cannot be read by its address, never as Untitled", async () => {
    const wire = installWire();
    wire.setRecord("ann", 404);
    const { result } = renderHook(() => useResolvedRefLabel(REF, VAULT), { wrapper: wrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } })) });
    await waitFor(() => expect(result.current).toBe(refDisplayName(null, URI)));
    expect(result.current).not.toBe("Untitled");
  });

  it("is null for no link, and runs no read", async () => {
    const wire = installWire();
    const qc = new QueryClient();
    const { result } = renderHook(() => useResolvedRefLabel(null, VAULT), { wrapper: wrapper(qc) });
    expect(result.current).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(wire.reads).toEqual([]);
    expect(qc.getQueryCache().getAll().map((q) => [q.state.fetchStatus, q.state.dataUpdateCount, q.state.errorUpdateCount])).toEqual([["idle", 0, 0]]);
  });

  it("names a record that has no name facts by the tail of its address", async () => {
    const wire = installWire();
    wire.setRecord("ann", { "@id": URI, "@type": "t:Person" });
    const { result } = renderHook(() => useResolvedRefLabel(REF, VAULT), { wrapper: wrapper(new QueryClient()) });
    await waitFor(() => expect(result.current).toBe(refDisplayName(null, URI)));
    expect(result.current).toBe("ann");
  });

  it("keeps a read for thirty seconds", async () => {
    const wire = installWire();
    wire.setRecord("ann", { "@id": URI, "@type": "t:Person", "a:name": "Ann Read" });
    const qc = new QueryClient();
    const { result } = renderHook(() => useResolvedRefLabel(REF, VAULT), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current).toBe("Ann Read"));
    const query = qc.getQueryCache().find({ queryKey: ["base", "record", "ann", vaultOriginOf(URI)] })!;
    expect(query.observers[0]!.options.staleTime).toBe(30_000);
  });
});
