// `useHeldAddresses`: the holder's held addresses of one person, over the host's place libraries and the app's query cache. Every host
// member is pinned: when it is called and with what.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useHeldAddresses } from "./heldAddresses";
import { HostProvider, fakeHost, type FakeClaim, type FakeHost } from "../test/fakeHost";

const GEO = "https://geo.example.test/base/e";
const VAULT = "https://h.example.test/vault";
const SUBJECT = "https://h.example.test/vault/e/rec1";
const OTHER = "https://h.example.test/vault/e/rec2";

const field = (subject: string, extra: Record<string, unknown>) => ({ id: subject, uri: `u/${subject}`, detailOf: "c", subject, streetLine: "", placeId: null, etag: null, ...extra });
const claim = (id: string, about: string, fields: unknown[]): FakeClaim =>
  ({ id, uri: `${VAULT}/e/${id}`, label: "home", streetLine: "", memberOf: [], fields, subjects: [about] }) as unknown as FakeClaim;

const PLACES = [
  { id: `${GEO}/no`, label: "Norway", type: "Country", memberOf: [] },
  { id: `${GEO}/oslo`, label: "Oslo", type: "Municipality", memberOf: [`${GEO}/no`] },
];
const MINE = claim("c1", SUBJECT, [field("street", { streetLine: "Storgata 1" }), field("place", { placeId: `${GEO}/oslo` }), field("place", { placeId: `${GEO}/no` })]);
const THEIRS = claim("c2", OTHER, [field("street", { streetLine: "Elsewhere 9" })]);

let qc: QueryClient;
function run(host: FakeHost, args: Parameters<typeof useHeldAddresses>) {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <HostProvider host={host}>{children}</HostProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useHeldAddresses(...args), { wrapper });
}
afterEach(cleanup);

describe("useHeldAddresses", () => {
  it("reads the vault's claims once, takes those about the record, reads the names of their places, and answers the merge's address", async () => {
    const host = fakeHost({ claims: [MINE, THEIRS], places: PLACES });
    const { result } = run(host, [true, VAULT, SUBJECT]);
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual([
      { street: "Storgata 1", line1: "", line2: "", postalCode: "", city: "Oslo", region: null, country: "Norway", entity: `${VAULT}/e/c1` },
    ]);
    expect(host.listPlaceClaimsInVault).toHaveBeenCalledTimes(1);
    expect(host.listPlaceClaimsInVault).toHaveBeenCalledWith(VAULT);
    expect(host.claimsAbout).toHaveBeenCalledWith([MINE, THEIRS], SUBJECT);
    expect(host.loadPlaceNames).toHaveBeenCalledTimes(1);
    expect(host.loadPlaceNames).toHaveBeenCalledWith([`${GEO}/oslo`, `${GEO}/no`]);
  });

  it("asks the host for the four text lines of each address, in the order street, Address 1, Address 2, Postal Code", async () => {
    const host = fakeHost({ claims: [MINE], places: PLACES });
    const { result } = run(host, [true, VAULT, SUBJECT]);
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(host.claimFieldText.mock.calls.map((c) => c[1])).toEqual(["streetLine", "addressLine1", "addressLine2", "postalCode"]);
    expect(host.claimFieldText.mock.calls.every((c) => c[0] === MINE)).toBe(true);
  });

  it("keeps the read under the host's key with the host's stale time, so the app's one shared read is observed", async () => {
    const host = fakeHost({ claims: [MINE], places: PLACES, staleMs: 12_345 });
    const { result } = run(host, [true, VAULT, SUBJECT]);
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(host.placeClaimsKey).toHaveBeenCalledWith(VAULT);
    const q = qc.getQueryCache().find({ queryKey: ["mynet", "place-claims", VAULT] });
    expect(q).toBeDefined();
    expect((q!.options as { staleTime?: number }).staleTime).toBe(12_345);
  });

  it("reads what the app already holds under that key and makes no request of its own", async () => {
    const host = fakeHost({ places: PLACES });
    const wrapper = ({ children }: { children: ReactNode }) => {
      qc = new QueryClient();
      qc.setQueryData(["mynet", "place-claims", VAULT], [MINE]);
      return (
        <QueryClientProvider client={qc}>
          <HostProvider host={host}>{children}</HostProvider>
        </QueryClientProvider>
      );
    };
    const { result } = renderHook(() => useHeldAddresses(true, VAULT, SUBJECT), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(host.listPlaceClaimsInVault).not.toHaveBeenCalled();
  });

  it.each([
    ["not enabled", [false, VAULT, SUBJECT]],
    ["no vault", [true, null, SUBJECT]],
    ["no vault (undefined)", [true, undefined, SUBJECT]],
    ["no subject", [true, VAULT, null]],
    ["an empty subject", [true, VAULT, ""]],
  ] as const)("%s: reads nothing and answers null", async (_n, args) => {
    const host = fakeHost({ claims: [MINE], places: PLACES });
    const { result } = run(host, [...args] as Parameters<typeof useHeldAddresses>);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(result.current).toBeNull();
    expect(host.listPlaceClaimsInVault).not.toHaveBeenCalled();
    expect(host.loadPlaceNames).not.toHaveBeenCalled();
  });

  it("a record with no held address answers an empty list and reads no place names", async () => {
    const host = fakeHost({ claims: [THEIRS], places: PLACES });
    const { result } = run(host, [true, VAULT, SUBJECT]);
    await waitFor(() => expect(result.current).toEqual([]));
    expect(host.loadPlaceNames).not.toHaveBeenCalled();
  });

  it("an address with no place needs no place read and is answered at once", async () => {
    const host = fakeHost({ claims: [claim("c3", SUBJECT, [field("street", { streetLine: "Bakkegata 4" })])] });
    const { result } = run(host, [true, VAULT, SUBJECT]);
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current![0]).toMatchObject({ street: "Bakkegata 4", city: null, country: null });
    expect(host.loadPlaceNames).not.toHaveBeenCalled();
  });

  it("answers null until the names of the places are read (no early 'different' from a half address)", async () => {
    let release!: (rows: typeof PLACES) => void;
    const host = fakeHost({ claims: [MINE], places: PLACES });
    host.loadPlaceNames.mockImplementation(() => new Promise((res) => (release = res as typeof release)));
    const { result } = run(host, [true, VAULT, SUBJECT]);
    await waitFor(() => expect(host.loadPlaceNames).toHaveBeenCalled());
    expect(result.current).toBeNull();
    release(PLACES);
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current![0]).toMatchObject({ city: "Oslo", country: "Norway" });
  });

  it("a read of place names that lands after the hook unmounted is dropped", async () => {
    let release!: (rows: typeof PLACES) => void;
    const host = fakeHost({ claims: [MINE], places: PLACES });
    host.loadPlaceNames.mockImplementation(() => new Promise((res) => (release = res as typeof release)));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = run(host, [true, VAULT, SUBJECT]);
    await waitFor(() => expect(host.loadPlaceNames).toHaveBeenCalled());
    unmount();
    release(PLACES);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("without a OneCardHostContext.Provider it throws an error that names the context", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const qc2 = new QueryClient();
    expect(() => renderHook(() => useHeldAddresses(true, VAULT, SUBJECT), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc2}>{children}</QueryClientProvider> })).toThrow(
      "The one card needs a OneCardHostContext.Provider above it.",
    );
    err.mockRestore();
  });
});

describe("useHeldAddresses, a place read that fails (kept as in production)", () => {
  it("leaves the addresses null for good: the read has no catch, so the failure is an unhandled rejection and the merge never gets the held addresses", async () => {
    const seen: unknown[] = [];
    const onRejection = (e: unknown) => void seen.push(e);
    process.on("unhandledRejection", onRejection);
    const host = fakeHost({ claims: [MINE], places: PLACES });
    host.loadPlaceNames.mockRejectedValue(new Error("catalogue down"));
    const { result } = run(host, [true, VAULT, SUBJECT]);
    await waitFor(() => expect(host.loadPlaceNames).toHaveBeenCalled());
    await new Promise<void>((r) => setTimeout(r, 0));
    await new Promise<void>((r) => setTimeout(r, 0));
    process.off("unhandledRejection", onRejection);
    expect(result.current).toBeNull();
    expect(seen.map((e) => (e as Error).message)).toEqual(["catalogue down"]);
  });
});
