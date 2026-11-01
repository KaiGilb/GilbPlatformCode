// Their addresses, with the names of the places: honest states, no drawing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { OnlineCardField } from "@kaigilb/gilbplatformcode-online-card";
import type { AddressSpellings } from "@kaigilb/gilbplatformcode-one-card-merge";
import { useTheirAddresses } from "./theirAddresses";
import { orderPlaces } from "./placeOrder";
import type { GeoPlace, TheirPlaceRead } from "./oneCardHost";
import { HostProvider, fakeHost, type FakeHost } from "../test/fakeHost";

const S: AddressSpellings = {
  label: "a:placeClaimLabel",
  streetLine: "a:streetLine",
  addressLine1: "a:addressLine1",
  addressLine2: "a:addressLine2",
  postalCode: "a:postalCode",
  claimPlace: "a:claimPlace",
};

const osloCity: GeoPlace = { id: "osloCity", label: "Oslo", type: "City", memberOf: ["osloRegion", "norway"] };
const osloRegion: GeoPlace = { id: "osloRegion", label: "Oslo", type: "Region", memberOf: ["norway"] };
const norway: GeoPlace = { id: "norway", label: "Norway", type: "Country", memberOf: [] };
const bergenCity: GeoPlace = { id: "bergenCity", label: "Bergen", type: "City", memberOf: ["norway"] };
const BY_ID: Record<string, GeoPlace> = { osloCity, osloRegion, norway, bergenCity };

const named = (p: GeoPlace): TheirPlaceRead => ({ state: "named", place: p });
const rowsFor = (ids: readonly string[], over: Record<string, TheirPlaceRead> = {}): TheirPlaceRead[] =>
  ids.map((id) => over[id] ?? named(BY_ID[id]!));

const field = (predicate: string, value: string, extra: Partial<OnlineCardField> = {}): OnlineCardField => ({
  predicate, value, rung: "public", sourceEntity: null, ...extra,
});
const label = (value: string, id: string) => field(S.label, value, { sourceEntity: id });
const part = (predicate: string, value: string, composite: string) => field(predicate, value, { composite, sourceEntity: `src-${value}` });

const homeFields: OnlineCardField[] = [
  label("home", "E1"),
  part(S.streetLine, "Gladvollveien 38c", "E1"),
  part(S.claimPlace, "osloCity", "E1"),
  part(S.claimPlace, "osloRegion", "E1"),
  part(S.claimPlace, "norway", "E1"),
];

function renderTheir(host: FakeHost, enabled: boolean, fields: readonly OnlineCardField[] | null) {
  const wrapper = ({ children }: { children: ReactNode }) => <HostProvider host={host}>{children}</HostProvider>;
  return renderHook(() => useTheirAddresses(enabled, fields), { wrapper });
}

afterEach(cleanup);

describe("useTheirAddresses", () => {
  it("off when the host has no address members", async () => {
    const bare = fakeHost();
    expect(bare.addressSpellings).toBeUndefined();
    expect(bare.readPlaceNames).toBeUndefined();
    const none = renderTheir(bare, true, homeFields);
    await act(async () => { await new Promise<void>((r) => setTimeout(r, 0)); });
    expect(none.result.current).toEqual({ state: "off" });

    const onlySpellings = fakeHost({ spellings: S, reads: () => [] });
    delete onlySpellings.readPlaceNames;
    const a = renderTheir(onlySpellings, true, homeFields);
    await act(async () => { await new Promise<void>((r) => setTimeout(r, 0)); });
    expect(a.result.current).toEqual({ state: "off" });
    expect(onlySpellings.addressSpellings).not.toHaveBeenCalled();

    const onlyReads = fakeHost({ spellings: S, reads: () => [] });
    delete onlyReads.addressSpellings;
    const b = renderTheir(onlyReads, true, homeFields);
    await act(async () => { await new Promise<void>((r) => setTimeout(r, 0)); });
    expect(b.result.current).toEqual({ state: "off" });
    expect(onlyReads.readPlaceNames).not.toHaveBeenCalled();
  });

  it("off when not enabled or fields are null, and no request is made", async () => {
    const host = fakeHost({ spellings: S, reads: () => rowsFor(["osloCity", "osloRegion", "norway"]) });
    const off = renderTheir(host, false, homeFields);
    const empty = renderTheir(host, true, null);
    await act(async () => { await new Promise<void>((r) => setTimeout(r, 0)); });
    expect(off.result.current).toEqual({ state: "off" });
    expect(empty.result.current).toEqual({ state: "off" });
    expect(host.addressSpellings).not.toHaveBeenCalled();
    expect(host.readPlaceNames).not.toHaveBeenCalled();
  });

  it("reading until the spellings answer, then reading until the names answer", async () => {
    let resolveSpellings!: (value: AddressSpellings) => void;
    let resolveNames!: (rows: TheirPlaceRead[]) => void;
    const host = fakeHost({ spellings: S, reads: () => [] });
    host.addressSpellings!.mockImplementation(() => new Promise((res) => { resolveSpellings = res; }));
    host.readPlaceNames!.mockImplementation(() => new Promise((res) => { resolveNames = res; }));
    const { result } = renderTheir(host, true, homeFields);
    expect(result.current).toEqual({ state: "reading" });
    await waitFor(() => expect(host.addressSpellings).toHaveBeenCalledTimes(1));
    expect(host.readPlaceNames).not.toHaveBeenCalled();
    expect(result.current.state).toBe("reading");

    await act(async () => { resolveSpellings(S); });
    await waitFor(() => expect(host.readPlaceNames).toHaveBeenCalledTimes(1));
    expect(result.current.state).toBe("reading");

    const asked = host.readPlaceNames!.mock.calls[0]![0];
    await act(async () => { resolveNames(rowsFor(asked)); });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current).toMatchObject({ state: "ready", addresses: [{ city: "Oslo", country: "Norway" }] });
  });

  it("asks the spellings once per mount", async () => {
    const host = fakeHost({ spellings: S, reads: (ids) => rowsFor(ids) });
    const wrapper = ({ children }: { children: ReactNode }) => <HostProvider host={host}>{children}</HostProvider>;
    const { result, rerender } = renderHook(({ fields }: { fields: readonly OnlineCardField[] }) => useTheirAddresses(true, fields), {
      wrapper,
      initialProps: { fields: homeFields },
    });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    rerender({ fields: [...homeFields, part(S.postalCode, "0854", "E1")] });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(host.addressSpellings).toHaveBeenCalledTimes(1);
  });

  it("Kai's home", async () => {
    const host = fakeHost({ spellings: S, reads: (ids) => rowsFor(ids) });
    const { result } = renderTheir(host, true, homeFields);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current).toEqual({
      state: "ready",
      loose: [],
      rest: [],
      addresses: [
        expect.objectContaining({
          composite: "E1",
          label: "home",
          street: "Gladvollveien 38c",
          placeIds: ["osloCity", "osloRegion", "norway"],
          city: "Oslo",
          region: "Oslo",
          country: "Norway",
          countryId: "norway",
          unread: 0,
          gone: 0,
        }),
      ],
    });
  });

  it("one place failed → that address has unread 1, the known names kept", async () => {
    const host = fakeHost({
      spellings: S,
      reads: (ids) => rowsFor(ids, { osloRegion: { state: "failed" } }),
    });
    const { result } = renderTheir(host, true, homeFields);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current).toMatchObject({
      state: "ready",
      addresses: [{ city: "Oslo", region: null, country: "Norway", countryId: "norway", unread: 1, gone: 0, street: "Gladvollveien 38c" }],
    });
  });

  it("one place missing (404) → gone 1, not unread", async () => {
    const host = fakeHost({
      spellings: S,
      reads: (ids) => rowsFor(ids, { osloRegion: { state: "missing" } }),
    });
    const { result } = renderTheir(host, true, homeFields);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current).toMatchObject({
      state: "ready",
      addresses: [{ city: "Oslo", region: null, country: "Norway", countryId: "norway", unread: 0, gone: 1 }],
    });
  });

  it("a named place with an empty label counts as unread, and is not a name", async () => {
    const host = fakeHost({
      spellings: S,
      reads: (ids) => rowsFor(ids, { osloRegion: { state: "named", place: { ...osloRegion, label: "  " } } }),
    });
    const { result } = renderTheir(host, true, homeFields);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current).toMatchObject({
      state: "ready",
      addresses: [{ city: "Oslo", region: null, country: "Norway", unread: 1, gone: 0 }],
    });
  });

  it('a stub that answers [] for asked ids → every id unread, never "no place"', async () => {
    const host = fakeHost({ spellings: S, reads: () => [] });
    const { result } = renderTheir(host, true, homeFields);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(host.readPlaceNames).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({
      state: "ready",
      addresses: [{
        label: "home",
        street: "Gladvollveien 38c",
        city: null,
        region: null,
        country: null,
        countryId: null,
        unread: 3,
        gone: 0,
        placeIds: ["osloCity", "osloRegion", "norway"],
      }],
    });
  });

  it("spellings reject → failed, never ready", async () => {
    const host = fakeHost({ spellings: "reject", reads: (ids) => rowsFor(ids) });
    const { result } = renderTheir(host, true, homeFields);
    await waitFor(() => expect(result.current).toEqual({ state: "failed" }));
    await new Promise<void>((r) => setTimeout(r, 20));
    expect(result.current).toEqual({ state: "failed" });
    expect(host.readPlaceNames).not.toHaveBeenCalled();
  });

  it("readPlaceNames rejects → ready with all unread, no unhandled rejection", async () => {
    const seen: unknown[] = [];
    const onRejection = (e: unknown) => void seen.push(e);
    process.on("unhandledRejection", onRejection);
    try {
      const host = fakeHost({ spellings: S, reads: () => [] });
      host.readPlaceNames!.mockRejectedValue(new Error("catalogue down"));
      const { result } = renderTheir(host, true, homeFields);
      await waitFor(() => expect(result.current.state).toBe("ready"));
      expect(result.current).toMatchObject({
        state: "ready",
        addresses: [{ street: "Gladvollveien 38c", label: "home", city: null, region: null, country: null, unread: 3, gone: 0 }],
      });
      await new Promise<void>((r) => setTimeout(r, 0));
      await new Promise<void>((r) => setTimeout(r, 0));
      expect(seen).toEqual([]);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  it("no place ids → ready with no names request", async () => {
    const fields = [label("home", "E1"), part(S.streetLine, "Gladvollveien 38c", "E1")];
    const host = fakeHost({ spellings: S, reads: (ids) => rowsFor(ids) });
    const { result } = renderTheir(host, true, fields);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(host.readPlaceNames).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      state: "ready",
      addresses: [{ label: "home", street: "Gladvollveien 38c", city: null, region: null, country: null, countryId: null, unread: 0, gone: 0, placeIds: [] }],
    });
  });

  it("one names request for two addresses sharing Norway", async () => {
    const fields = [
      ...homeFields,
      label("work", "E2"),
      part(S.streetLine, "Bryggen 1", "E2"),
      part(S.claimPlace, "bergenCity", "E2"),
      part(S.claimPlace, "norway", "E2"),
    ];
    const host = fakeHost({ spellings: S, reads: (ids) => rowsFor(ids) });
    const { result } = renderTheir(host, true, fields);
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(host.readPlaceNames).toHaveBeenCalledTimes(1);
    const asked = host.readPlaceNames!.mock.calls[0]![0] as string[];
    expect(asked.filter((id) => id === "norway")).toEqual(["norway"]);
    expect(new Set(asked).size).toBe(asked.length);
    expect(new Set(asked)).toEqual(new Set(["osloCity", "osloRegion", "norway", "bergenCity"]));
    expect(result.current).toMatchObject({
      state: "ready",
      addresses: [
        { label: "home", city: "Oslo", region: "Oslo", country: "Norway", countryId: "norway", unread: 0, gone: 0 },
        { label: "work", street: "Bryggen 1", city: "Bergen", region: null, country: "Norway", countryId: "norway", unread: 0, gone: 0 },
      ],
    });
  });

  it("unmount during a pending read sets no state", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      let releaseSpellings!: (value: AddressSpellings) => void;
      const spellingsHost = fakeHost({ spellings: S, reads: (ids) => rowsFor(ids) });
      spellingsHost.addressSpellings!.mockImplementation(() => new Promise((res) => { releaseSpellings = res; }));
      const pendingSpellings = renderTheir(spellingsHost, true, homeFields);
      await waitFor(() => expect(spellingsHost.addressSpellings).toHaveBeenCalled());
      pendingSpellings.unmount();
      releaseSpellings(S);
      await new Promise<void>((r) => setTimeout(r, 0));

      let releaseNames!: (rows: TheirPlaceRead[]) => void;
      const namesHost = fakeHost({ spellings: S, reads: () => [] });
      namesHost.readPlaceNames!.mockImplementation(() => new Promise((res) => { releaseNames = res; }));
      const pendingNames = renderTheir(namesHost, true, homeFields);
      await waitFor(() => expect(namesHost.readPlaceNames).toHaveBeenCalled());
      expect(pendingNames.result.current.state).toBe("reading");
      const asked = namesHost.readPlaceNames!.mock.calls[0]![0];
      pendingNames.unmount();
      releaseNames(rowsFor(asked));
      await new Promise<void>((r) => setTimeout(r, 0));
      expect(err).not.toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });
});

describe("orderPlaces", () => {
  it("orderPlaces pure: the same three places in any input order → city osloCity, regions [osloRegion], country norway; a last place whose type is not country → no country", () => {
    const places = [osloCity, osloRegion, norway];
    const perms: GeoPlace[][] = [];
    const walk = (rest: GeoPlace[], acc: GeoPlace[]) => {
      if (rest.length === 0) { perms.push(acc); return; }
      rest.forEach((p, i) => walk([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, p]));
    };
    walk(places, []);
    expect(perms).toHaveLength(6);
    for (const input of perms) {
      expect(orderPlaces(input)).toEqual({ city: osloCity, regions: [osloRegion], country: norway });
    }
    const territory: GeoPlace = { ...norway, type: "Territory" };
    expect(orderPlaces([osloCity, osloRegion, territory])).toEqual({
      city: osloCity,
      regions: [osloRegion, territory],
      country: null,
    });
  });
});
