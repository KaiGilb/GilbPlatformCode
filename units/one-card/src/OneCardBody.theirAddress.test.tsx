// Their address on the linked card: one row, the raw part rows gone. Beyond the source (Kai, 2026-11-01).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OnlineCardField } from "@kaigilb/gilbplatformcode-online-card";
import type { AddressSpellings, OneCardField } from "@kaigilb/gilbplatformcode-one-card-merge";
import { OneCardBody, OneCardOwnGroups, type OneCardBodyProps } from "./OneCardBody";
import { useTheirAddresses } from "./theirAddresses";
import { __resetTheirPlaces, useTheirPlaces } from "./theirPlaces";
import { HostProvider, fakeHost, type FakeHost } from "../test/fakeHost";
import type { GeoPlace, TheirPlaceRead } from "./oneCardHost";
import { ANN, GEO, RECORD, controllerOf, field, rig, type PublicField } from "../test/rig";

const LINE = "Gladvollveien 38c, Oslo, Oslo, Norway";
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
const BY_ID: Record<string, GeoPlace> = { osloCity, osloRegion, norway };
const named = (p: GeoPlace): TheirPlaceRead => ({ state: "named", place: p });
const rowsFor = (ids: readonly string[]): TheirPlaceRead[] => ids.map((id) => named(BY_ID[id]!));

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
    wire(S.claimPlace, "norway", { composite: "E1" }),
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
  children: <OneCardOwnGroups labelFor={labelFor} />,
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
});
afterEach(cleanup);

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
    partRow(S.claimPlace, "norway", "E1"),
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
    expect(values).not.toContain("norway");
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

describe("their address on the card", () => {
  it('Kai\'s linked card: no text "Place Claim Label" anywhere, and no group for the label predicate; one row "Gladvollveien 38c, Oslo, Oslo, Norway" with "home"', async () => {
    const r = rig({ link: { state: "linked", target: ANN }, fields: kaiWires() as PublicField[] });
    draw(props({ controller: controllerOf(r) }), readyHost());
    await waitFor(() => expect(rowValues()).toContain(LINE));
    expect(document.body.textContent).not.toContain("Place Claim Label");
    expect(document.querySelector('[data-group="theirs:a:placeClaimLabel"]')).toBeNull();
    const row = screen.getAllByTestId("one-card-row").find((el) => el.querySelector("[data-testid='one-card-row-value']")?.textContent === LINE);
    expect(row?.querySelector("[data-testid='one-card-row-label']")?.textContent).toBe("home");
  });

  it("the street part is not drawn as its own row", async () => {
    const r = rig({ link: { state: "linked", target: ANN }, fields: kaiWires() as PublicField[] });
    draw(props({ controller: controllerOf(r) }), readyHost());
    await waitFor(() => expect(rowValues()).toContain(LINE));
    expect(rowValues()).not.toContain("Gladvollveien 38c");
  });

  it("a loose street (no composite) is still drawn as its own row", async () => {
    const r = rig({
      link: { state: "linked", target: ANN },
      fields: kaiWires([wire(S.streetLine, "Sideveien 4")]) as PublicField[],
    });
    draw(props({ controller: controllerOf(r) }), readyHost());
    await waitFor(() => expect(rowValues()).toContain(LINE));
    expect(rowValues()).toContain("Sideveien 4");
  });

  it("while the names are reading, the card is as today", async () => {
    let resolveNames!: (rows: TheirPlaceRead[]) => void;
    const host = readyHost();
    host.readPlaceNames!.mockImplementation(() => new Promise((res) => { resolveNames = res; }));
    const r = rig({ link: { state: "linked", target: ANN }, fields: kaiWires() as PublicField[] });
    draw(props({ controller: controllerOf(r) }), host);
    await waitFor(() => expect(host.readPlaceNames).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    expect(document.body.textContent).toContain("Place Claim Label");
    expect(screen.queryByText(LINE)).toBeNull();
    await act(async () => { resolveNames(rowsFor(host.readPlaceNames!.mock.calls[0]![0])); });
  });

  it("spellings fail → the card is as today", async () => {
    const host = fakeHost({ spellings: "reject", reads: rowsFor });
    const r = rig({ link: { state: "linked", target: ANN }, fields: kaiWires() as PublicField[] });
    draw(props({ controller: controllerOf(r) }), host);
    await waitFor(() => expect(host.addressSpellings).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    await act(async () => { await new Promise<void>((res) => setTimeout(res, 30)); });
    expect(document.body.textContent).toContain("Place Claim Label");
    expect(screen.queryByText(LINE)).toBeNull();
    expect(host.readPlaceNames).not.toHaveBeenCalled();
  });

  it("a host without the address members → the card is as today and readPlaceNames/addressSpellings are never called", async () => {
    const host = readyHost();
    const spellings = host.addressSpellings!;
    const reads = host.readPlaceNames!;
    delete host.addressSpellings;
    delete host.readPlaceNames;
    const r = rig({ link: { state: "linked", target: ANN }, fields: kaiWires() as PublicField[] });
    draw(props({ controller: controllerOf(r) }), host);
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    await act(async () => { await new Promise<void>((res) => setTimeout(res, 30)); });
    expect(spellings).not.toHaveBeenCalled();
    expect(reads).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Place Claim Label");
    expect(screen.queryByText(LINE)).toBeNull();
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
      expect(screen.getByText(LINE)).toBeTruthy();
      expect(JSON.parse(screen.getByTestId("published").textContent!)).toEqual([{ label: "Claim Place", places: [LOOSE] }]);
    });
  });
});
