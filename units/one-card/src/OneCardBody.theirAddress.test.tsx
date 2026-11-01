// Their address on the linked card: lines with the flag, and an honest status while the names are read. Beyond the source (Kai, 2026-11-01).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OnlineCardField } from "@kaigilb/gilbplatformcode-online-card";
import type { AddressSpellings, OneCardField } from "@kaigilb/gilbplatformcode-one-card-merge";
import { __resetFlags, setFlagSource, setFlagStore } from "@kaigilb/gilbplatformcode-flag-source";
import { CardGroup } from "@kaigilb/gilbplatformcode-card-group";
import { OneCardBody, OneCardOwnGroups, type OneCardBodyProps } from "./OneCardBody";
import { useTheirAddresses } from "./theirAddresses";
import { __resetTheirPlaces, useTheirPlaces } from "./theirPlaces";
import { HostProvider, fakeHost, type FakeHost } from "../test/fakeHost";
import type { GeoPlace, TheirPlaceRead } from "./oneCardHost";
import { ANN, GEO, RECORD, controllerOf, field, rig, type PublicField } from "../test/rig";

const NORWAY_ID = "https://geo.example.test/base/e/norway";
const READING = "Reading their address…";
const FAILED_LINE = "Their address could not be read right now.";
const S: AddressSpellings = {
  label: "a:placeClaimLabel",
  streetLine: "a:streetLine",
  addressLine1: "a:addressLine1",
  addressLine2: "a:addressLine2",
  postalCode: "a:postalCode",
  claimPlace: "a:claimPlace",
};

const osloCity: GeoPlace = { id: "osloCity", label: "Oslo", type: "City", memberOf: ["osloRegion", NORWAY_ID] };
const osloRegion: GeoPlace = { id: "osloRegion", label: "Oslo", type: "Region", memberOf: [NORWAY_ID] };
const norway: GeoPlace = { id: NORWAY_ID, label: "Norway", type: "Country", memberOf: [] };
const BY_ID: Record<string, GeoPlace> = { osloCity, osloRegion, [NORWAY_ID]: norway };
const named = (p: GeoPlace): TheirPlaceRead => ({ state: "named", place: p });
const rowsFor = (ids: readonly string[], over: Record<string, TheirPlaceRead> = {}): TheirPlaceRead[] =>
  ids.map((id) => over[id] ?? named(BY_ID[id]!));

const cardField = (predicate: string, value: string, extra: Partial<OnlineCardField> = {}): OnlineCardField => ({
  predicate, value, rung: "public", sourceEntity: null, ...extra,
});
const labelRow = (value: string, id: string) => cardField(S.label, value, { sourceEntity: id });
const partRow = (predicate: string, value: string, composite: string) => cardField(predicate, value, { composite, sourceEntity: `src-${value}` });

const FIELDS: OneCardField[] = [
  { term: "a:givenName", label: "Given name", readKeys: ["givenName", "a:givenName"], writeKey: "a:givenName", many: false },
  { term: "a:postalAddress", label: "Postal Address", readKeys: ["postalAddress", "a:postalAddress"], writeKey: "a:postalAddress", many: true },
];

type Wire = PublicField & { composite?: string };
const wire = (name: string, value: string, extra: Partial<Wire> = {}): Wire => ({ ...field(name, value), ...extra });

const CITY = `${GEO}oslo-city`;
const REGION = `${GEO}oslo-region`;
const COUNTRY = `${GEO}norway`;
const LOOSE = `${GEO}bergen`;
const geoCity: GeoPlace = { id: CITY, label: "Oslo", type: "City", memberOf: [REGION, COUNTRY] };
const geoRegion: GeoPlace = { id: REGION, label: "Oslo", type: "Region", memberOf: [COUNTRY] };
const geoCountry: GeoPlace = { id: COUNTRY, label: "Norway", type: "Country", memberOf: [] };
const GEO_BY: Record<string, GeoPlace> = { [CITY]: geoCity, [REGION]: geoRegion, [COUNTRY]: geoCountry };

function kaiWires(extra: Wire[] = []): Wire[] {
  return [
    wire("a:givenName", "Kai"),
    wire(S.label, "home", { sourceEntity: "E1" }),
    wire(S.streetLine, "Gladvollveien 38c", { composite: "E1" }),
    wire(S.claimPlace, "osloCity", { composite: "E1" }),
    wire(S.claimPlace, "osloRegion", { composite: "E1" }),
    wire(S.claimPlace, NORWAY_ID, { composite: "E1" }),
    ...extra,
  ];
}

const labelFor = (p: string) => (p === S.label ? "Place Claim Label" : p === S.claimPlace ? "Claim Place" : "");

const props = (over: Partial<OneCardBodyProps> = {}): OneCardBodyProps => ({
  controller: null,
  labelFor,
  searchName: "Kai Gilb",
  canWrite: true,
  fieldOrder: FIELDS,
  servedFacts: {},
  skillPredicate: null,
  addressPredicate: "a:postalAddress",
  groupOf: (g) => (g.field === "a:givenName" ? "name" : null),
  skip: () => false,
  order: () => 0,
  personCard: null,
  recordUri: RECORD,
  // The given name is placed in the card's name group; the address is a group of its own. Both have to be on the page.
  children: (
    <>
      <CardGroup kind="name" title="Name" icon="record" empty addable={false}>{null}</CardGroup>
      <OneCardOwnGroups labelFor={labelFor} />
    </>
  ),
  ...over,
});

function Probe() {
  const places = useTheirPlaces(RECORD);
  return <span data-testid="published">{JSON.stringify(places)}</span>;
}

const draw = (p: OneCardBodyProps, host: FakeHost) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <HostProvider host={host}>{children}</HostProvider>
    </QueryClientProvider>
  );
  return render(
    <>
      <OneCardBody {...p} />
      <Probe />
    </>,
    { wrapper: wrap },
  );
};

const readyHost = (reads: (ids: readonly string[]) => TheirPlaceRead[] = rowsFor) => fakeHost({ spellings: S, reads });

function rowValues(): string[] {
  return screen.getAllByTestId("one-card-row-value").map((el) => el.textContent ?? "");
}

beforeEach(() => {
  __resetTheirPlaces();
  __resetFlags();
  setFlagStore(null);
  // A country's flag is not fetched in these tests: the globe stands in, and no catalogue host is asked.
  setFlagSource({ read: async () => null });
});
afterEach(() => {
  cleanup();
  setFlagSource(null);
  setFlagStore(null);
  __resetFlags();
});

describe("useTheirAddresses rest", () => {
  const email = cardField("a:email", "kai@example.test", { composite: "E1" });
  const given = cardField("a:givenName", "Kai");
  const loose = cardField(S.streetLine, "Sideveien 4");
  const dup = partRow(S.streetLine, "Other Street 9", "E1");
  const fields: OnlineCardField[] = [
    email,
    labelRow("home", "E1"),
    partRow(S.streetLine, "Gladvollveien 38c", "E1"),
    dup,
    partRow(S.claimPlace, "osloCity", "E1"),
    partRow(S.claimPlace, "osloRegion", "E1"),
    partRow(S.claimPlace, NORWAY_ID, "E1"),
    given,
    loose,
  ];

  async function restOf() {
    const host = readyHost();
    const wrapper = ({ children }: { children: ReactNode }) => <HostProvider host={host}>{children}</HostProvider>;
    const { result } = renderHook(() => useTheirAddresses(true, fields), { wrapper });
    await waitFor(() => expect(result.current.state).toBe("ready"));
    if (result.current.state !== "ready") throw new Error("not ready");
    return result.current.rest;
  }

  it("R1 consumed fields are removed, including a duplicate the grouping ignored", async () => {
    const rest = await restOf();
    const values = rest.map((f) => f.value);
    expect(values).not.toContain("home");
    expect(values).not.toContain("Gladvollveien 38c");
    expect(values).not.toContain("Other Street 9");
    expect(values).not.toContain("osloCity");
    expect(values).not.toContain("osloRegion");
    expect(values).not.toContain(NORWAY_ID);
  });

  it("R2 a loose part is kept in rest", async () => {
    const rest = await restOf();
    expect(rest.map((f) => f.value)).toContain("Sideveien 4");
  });

  it("R3 a non-address field is kept and rest keeps the input order", async () => {
    const rest = await restOf();
    expect(rest.map((f) => f.value)).toEqual(["kai@example.test", "Kai", "Sideveien 4"]);
  });
});

function linkedKai(extra: Wire[] = []) {
  return rig({ link: { state: "linked", target: ANN }, fields: kaiWires(extra) as PublicField[] });
}

describe("their address on the card", () => {
  it('D1 Kai\'s linked card draws "home", "Gladvollveien 38c", "Oslo", "Oslo, Norway" with data-country-id = norway\'s id; the text "Place Claim Label" is nowhere', async () => {
    draw(props({ controller: controllerOf(linkedKai()) }), readyHost());
    await waitFor(() => expect(screen.getByTestId("their-address-street")).toHaveTextContent("Gladvollveien 38c"));
    expect(screen.getByTestId("their-address-postal-city")).toHaveTextContent("Oslo");
    const region = screen.getByTestId("their-address-region-country");
    expect(region).toHaveTextContent("Oslo, Norway");
    expect(region).toHaveAttribute("data-country-id", NORWAY_ID);
    expect(region.querySelector("[data-testid='flag-image']")).not.toBeNull();
    const row = region.closest("[data-testid='one-card-row']");
    expect(row?.querySelector("[data-testid='one-card-row-label']")?.textContent).toBe("home");
    expect(document.body.textContent).not.toContain("Place Claim Label");
    expect(document.querySelector('[data-group="theirs:a:placeClaimLabel"]')).toBeNull();
  });

  it("D2 no URI and no predicate name in the card's text", async () => {
    draw(props({ controller: controllerOf(linkedKai()) }), readyHost());
    await waitFor(() => expect(screen.getByTestId("their-address-region-country")).toHaveTextContent("Oslo, Norway"));
    const text = screen.getByTestId("one-card").textContent ?? "";
    expect(text).not.toContain("https://");
    expect(text).not.toContain("a:");
    expect(text).not.toContain("placeClaimLabel");
  });

  // B4 changed (B3b): while the names are reading, the spellings are already known, so the raw part rows are gone
  // and the status line is shown. Before B3b this expected the card as today (the raw "Place Claim Label" row still on screen).
  it('D3 reading after the spellings are known: no raw label row, no raw street row, and "Reading their address…" shown', async () => {
    let resolveNames!: (rows: TheirPlaceRead[]) => void;
    const host = readyHost();
    host.readPlaceNames!.mockImplementation(() => new Promise((res) => { resolveNames = res; }));
    draw(props({ controller: controllerOf(linkedKai()) }), host);
    await waitFor(() => expect(host.readPlaceNames).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    expect(document.body.textContent).not.toContain("Place Claim Label");
    expect(rowValues()).not.toContain("Gladvollveien 38c");
    expect(screen.queryByText("Gladvollveien 38c")).toBeNull();
    expect(screen.getByTestId("their-address-status")).toHaveTextContent(READING);
    expect(rowValues()).toContain("Kai");
    await act(async () => { resolveNames(rowsFor(host.readPlaceNames!.mock.calls[0]![0])); });
  });

  it('D4 reading before the spellings answer: card as today, and "Reading their address…" shown', async () => {
    let resolveSpellings!: (value: AddressSpellings) => void;
    const host = readyHost();
    host.addressSpellings!.mockImplementation(() => new Promise((res) => { resolveSpellings = res; }));
    draw(props({ controller: controllerOf(linkedKai()) }), host);
    await waitFor(() => expect(host.addressSpellings).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    expect(document.body.textContent).toContain("Place Claim Label");
    expect(rowValues()).toContain("Gladvollveien 38c");
    expect(screen.getByTestId("their-address-status")).toHaveTextContent(READING);
    await act(async () => { resolveSpellings(S); });
  });

  it('D5 failed: "Their address could not be read right now." and the card as today; never the text "No address"', async () => {
    const host = fakeHost({ spellings: "reject", reads: rowsFor });
    draw(props({ controller: controllerOf(linkedKai()) }), host);
    await waitFor(() => expect(host.addressSpellings).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    await act(async () => { await new Promise<void>((res) => setTimeout(res, 30)); });
    expect(screen.getByTestId("their-address-status")).toHaveTextContent(FAILED_LINE);
    expect(document.body.textContent).toContain("Place Claim Label");
    expect(rowValues()).toContain("Gladvollveien 38c");
    expect(document.body.textContent).not.toContain("No address");
    expect(host.readPlaceNames).not.toHaveBeenCalled();
  });

  it('D6 partial: one place failed → the known lines and "1 more place not read right now"', async () => {
    const host = fakeHost({
      spellings: S,
      reads: (ids) => rowsFor(ids, { osloRegion: { state: "failed" } }),
    });
    draw(props({ controller: controllerOf(linkedKai()) }), host);
    await waitFor(() => expect(screen.getByTestId("their-address-note")).toHaveTextContent("1 more place not read right now"));
    expect(screen.getByTestId("their-address-street")).toHaveTextContent("Gladvollveien 38c");
    expect(screen.getByTestId("their-address-postal-city")).toHaveTextContent("Oslo");
    const region = screen.getByTestId("their-address-region-country");
    expect(region).toHaveTextContent("Norway");
    expect(region).not.toHaveTextContent("Oslo, Norway");
    expect(region).toHaveAttribute("data-country-id", NORWAY_ID);
  });

  it("D7 the status line is absent for a card that does not name an address field and absent when ready", async () => {
    const wires = kaiWires() as PublicField[];
    draw(props({ controller: controllerOf(rig({ link: { state: "linked", target: ANN }, fields: wires })), addressPredicate: null }), readyHost());
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    await act(async () => { await new Promise<void>((res) => setTimeout(res, 30)); });
    expect(screen.queryByTestId("their-address-status")).toBeNull();
    cleanup();

    draw(props({ controller: controllerOf(rig({ link: { state: "linked", target: ANN }, fields: wires })) }), readyHost());
    await waitFor(() => expect(screen.getByTestId("their-address-street")).toBeTruthy());
    expect(screen.queryByTestId("their-address-status")).toBeNull();
  });

  it("the street part is not drawn as its own row", async () => {
    draw(props({ controller: controllerOf(linkedKai()) }), readyHost());
    await waitFor(() => expect(screen.getByTestId("their-address-street")).toHaveTextContent("Gladvollveien 38c"));
    expect(rowValues()).not.toContain("Gladvollveien 38c");
  });

  it("a loose street (no composite) is still drawn as its own row", async () => {
    draw(props({ controller: controllerOf(linkedKai([wire(S.streetLine, "Sideveien 4")])) }), readyHost());
    await waitFor(() => expect(screen.getByTestId("their-address-street")).toHaveTextContent("Gladvollveien 38c"));
    expect(rowValues()).toContain("Sideveien 4");
  });

  it("spellings fail → the card is as today", async () => {
    const host = fakeHost({ spellings: "reject", reads: rowsFor });
    draw(props({ controller: controllerOf(linkedKai()) }), host);
    await waitFor(() => expect(host.addressSpellings).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    await act(async () => { await new Promise<void>((res) => setTimeout(res, 30)); });
    expect(document.body.textContent).toContain("Place Claim Label");
    expect(screen.queryByText("Gladvollveien 38c, Oslo, Oslo, Norway")).toBeNull();
    expect(host.readPlaceNames).not.toHaveBeenCalled();
  });

  it("a host without the address members → the card is as today and readPlaceNames/addressSpellings are never called", async () => {
    const host = readyHost();
    const spellings = host.addressSpellings!;
    const reads = host.readPlaceNames!;
    delete host.addressSpellings;
    delete host.readPlaceNames;
    draw(props({ controller: controllerOf(linkedKai()) }), host);
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    await act(async () => { await new Promise<void>((res) => setTimeout(res, 30)); });
    expect(spellings).not.toHaveBeenCalled();
    expect(reads).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Place Claim Label");
    expect(screen.queryByTestId("their-address-status")).toBeNull();
    expect(screen.queryByText("Gladvollveien 38c, Oslo, Oslo, Norway")).toBeNull();
  });

  it("the address's places are not handed to Details; a loose place still is", async () => {
    const wires = [
      wire("a:givenName", "Kai"),
      wire(S.label, "home", { sourceEntity: "E1" }),
      wire(S.streetLine, "Gladvollveien 38c", { composite: "E1" }),
      wire(S.claimPlace, CITY, { composite: "E1" }),
      wire(S.claimPlace, REGION, { composite: "E1" }),
      wire(S.claimPlace, COUNTRY, { composite: "E1" }),
      wire(S.claimPlace, LOOSE),
    ];
    const r = rig({ link: { state: "linked", target: ANN }, fields: wires as PublicField[] });
    const host = fakeHost({
      spellings: S,
      reads: (ids) => ids.map((id) => named(GEO_BY[id]!)),
    });
    draw(props({ controller: controllerOf(r) }), host);
    await waitFor(() => {
      expect(screen.getByTestId("their-address-street")).toHaveTextContent("Gladvollveien 38c");
      expect(JSON.parse(screen.getByTestId("published").textContent!)).toEqual([{ label: "Claim Place", places: [LOOSE] }]);
    });
  });
});
