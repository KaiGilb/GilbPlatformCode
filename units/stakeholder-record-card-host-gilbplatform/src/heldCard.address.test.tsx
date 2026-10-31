// The held card's Address section with the host 0.6.0 builds, inside the provider alone: the record card, the provider's host, the real `address-rows`, a fake platform and a fake place
// catalogue. What is pinned: the section draws each stored address by name and flag (never an address of a place); opening the card is READS ONLY (no write of any kind), and
// nothing but a GET goes to the catalogue; the only hosts asked are the platform's, the catalogue's and the ontology's; the record's addresses are read in the RECORD's vault;
// and on a card linked to a person's online card, an address of yours EQUAL to theirs is ONE row "You have the same on your card" (drawn once), while an unequal one is kept, and
// a list or a place that was not all read keeps the merge UNFOLDED (it never says "the same" from half an answer).
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StakeholderCardGilbPlatformProvider } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { __resetGeoCache, __resetGeoGrainCache } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { __resetPlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import { __resetTermSlotsForTest } from "@kaigilb/gilbplatformcode-term-slots";
import { BASE, BEN, BEN_FIELDS, GEO, HOST, ONTOLOGY, P, createWorld, type World } from "../test/world";
import { heldWorld } from "../test/heldWorld";
import { NORWAY_ROW, OSLO, US_ROW, geoWorld, type GeoWorld } from "../test/geoWorld";
import { placeWorld } from "../test/placeWorld";
import { providerProps } from "../test/harness";
import { addLanguageTerms } from "../test/languagesWorld";
import { HeldStakeholderCard } from "./index";

vi.setConfig({ testTimeout: 30000 });

let world: World;
let geo: GeoWorld;
let entity: string;
let id: string;
const geoWritesSeen: string[] = [];

function seedAddress(subject: string, label: string, parts: { street?: string; postal?: string; places?: string[] }, vault = P) {
  const claim = world.platform.seed(vault, "t:PlaceClaim", { "a:claimSubject": { "@id": subject }, "a:placeClaimLabel": label });
  const f = (facts: Record<string, unknown>) => world.platform.seed(vault, "t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": subject }, "a:detailOf": { "@id": claim }, ...facts });
  if (parts.street) f({ "a:streetLine": parts.street });
  if (parts.postal) f({ "a:postalCode": parts.postal });
  for (const p of parts.places ?? []) f({ "a:claimPlace": { "@id": p } });
  return claim;
}
async function setup(opts: { linked?: boolean; ben?: Record<string, string> } = {}) {
  __resetGeoCache();
  __resetGeoGrainCache();
  __resetPlaceVocab();
  __resetTermSlotsForTest();
  world = await createWorld(opts.ben ? { ben: opts.ben } : {});
  addLanguageTerms(world);
  entity = world.platform.seed(P, "t:Person", { "a:name": "Ben Larsen", "a:givenName": "Ben", "a:familyName": "Larsen", ...(opts.linked ? { "a:sameAs": { "@id": BEN } } : {}) });
  id = entity.slice(entity.lastIndexOf("/") + 1);
  const hw = heldWorld(world, opts.linked ? { anchor: BEN } : {});
  geo = geoWorld(world, hw.fetch as typeof fetch);
  vi.stubGlobal("fetch", placeWorld(geo.fetch));
}
afterEach(() => {
  for (const c of world.calls) if (c.url.startsWith(GEO) && c.method !== "GET") geoWritesSeen.push(`${c.method} ${c.url}`);
});
afterAll(() => expect(geoWritesSeen).toEqual([]));
beforeEach(() => vi.unstubAllGlobals());

function mount(over: Parameters<typeof providerProps>[1] = { viewedVaultId: P }) {
  return render(
    <StakeholderCardGilbPlatformProvider {...providerProps(world, over)}>
      <HeldStakeholderCard recordId={id} vaultId={P} />
    </StakeholderCardGilbPlatformProvider>,
  );
}
const ready = () => waitFor(() => expect(screen.getByTestId("contact-note-editor")).toBeTruthy(), { timeout: 6000 });
const group = () => document.querySelector<HTMLElement>('section[data-group="address"]');
const writes = () => world.calls.filter((c) => c.method !== "GET");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const origin = (u: string) => new URL(u).origin;
const NO_ADDRESS = /:\/\/|\/base\/e\/|osm-r|geo\.example|\bwithin the vault\b/;

describe("a person with two addresses in two countries", () => {
  beforeEach(async () => {
    await setup();
    seedAddress(entity, "home", { street: "Storgata 1", postal: "0155", places: [OSLO, NORWAY_ROW] });
    seedAddress(entity, "cabin", { street: "Main St 5", places: [US_ROW] });
  });

  test("both are drawn, by name, in the record's own vault, with a line per filled part; the other person's address is not on this card", async () => {
    seedAddress(`${HOST}/base/e/someoneelse`, "theirs", { street: "Not here 9" });
    mount();
    await ready();
    const g = await waitFor(() => {
      const el = group();
      expect(el).toBeTruthy();
      expect(within(el!).getAllByTestId("place-claim")).toHaveLength(2);
      return el!;
    }, { timeout: 8000 });
    await waitFor(() => expect(within(g).getAllByTestId("place-view-region-country").map((e) => e.textContent).sort()).toEqual(["Norway", "United States"]), { timeout: 8000 });
    expect(within(g).getByRole("heading", { name: "home" })).toBeTruthy();
    expect(within(g).getByRole("heading", { name: "cabin" })).toBeTruthy();
    expect(g.textContent).toContain("Storgata 1");
    expect(g.textContent).toContain("0155 Oslo");
    expect(g.textContent).not.toContain("Not here 9");
    expect(g.textContent).not.toMatch(NO_ADDRESS);
    // the listing was asked of the vault that holds the record
    expect(world.requests("GET", /\/records\?/).some((r) => r.url.includes("/pann/") || r.url.includes("pann"))).toBe(true);
  });

  test("opening the card is reads only: no write of any kind, and nothing but a GET to the catalogue; the hosts asked are the platform's, the catalogue's and the ontology's", async () => {
    mount();
    await ready();
    await waitFor(() => expect(within(group()!).getAllByTestId("place-claim")).toHaveLength(2), { timeout: 8000 });
    await act(async () => {
      await sleep(600);
    });
    expect(writes()).toEqual([]);
    const asked = new Set(world.calls.map((c) => origin(c.url)));
    const allowed = new Set([HOST, BASE, GEO, ONTOLOGY, "https://id.example.test", "https://ontology.example.test"].map(origin));
    expect([...asked].filter((o) => !allowed.has(o))).toEqual([]);
    for (const c of world.calls.filter((c) => c.url.startsWith(GEO))) expect(c.method).toBe("GET");
  });

  test("editing: a street change is ONE PATCH of that field's record in the record's vault; nothing is sent to the catalogue", async () => {
    mount();
    await ready();
    await waitFor(() => expect(within(group()!).getAllByTestId("place-claim")).toHaveLength(2), { timeout: 8000 });
    await userEvent.click(screen.getByTestId("card-edit"));
    const tap = await within(group()!).findByRole("button", { name: "Edit address home" }, { timeout: 6000 });
    await userEvent.click(tap);
    const street = (await within(group()!).findByLabelText("Street..")) as HTMLInputElement;
    await userEvent.clear(street);
    await userEvent.type(street, "Storgata 2");
    await userEvent.tab();
    await waitFor(() => expect(writes().filter((w) => w.method === "PATCH").length).toBeGreaterThan(0), { timeout: 6000 });
    for (const w of writes()) expect(w.url.startsWith(GEO)).toBe(false);
    expect(writes().every((w) => w.method === "PATCH" || w.method === "GET")).toBe(true);
    expect(writes().filter((w) => w.method === "PATCH")).toHaveLength(1);
    expect(JSON.parse(writes().find((w) => w.method === "PATCH")!.body!)).toMatchObject({ "a:streetLine": "Storgata 2" });
  });
});

describe("a card whose addresses were not all read, or whose catalogue is down, says so", () => {
  test("the catalogue answers 502 for a place: the address is shown with 'not read right now' and cannot be changed, and nothing is written", async () => {
    await setup();
    seedAddress(entity, "home", { street: "Storgata 1", places: [OSLO, NORWAY_ROW] });
    geo.down.add(NORWAY_ROW);
    mount();
    await ready();
    const g = await waitFor(() => group()!, { timeout: 8000 });
    await waitFor(() => expect(g.textContent).toMatch(/not read right now/), { timeout: 8000 });
    expect(writes()).toEqual([]);
  });
});

const ADDRESS_LINE = "Storgata 1, 0155 Oslo, Norway";
describe("a record linked to a person's online card: 'You have the same on your card'", () => {
  beforeEach(async () => {
    await setup({ linked: true, ben: { ...BEN_FIELDS, "a:postalAddress": ADDRESS_LINE } });
  });
  const same = () => within(group()!).queryByTestId("one-card-row-same");

  test("an address of yours EQUAL to theirs is ONE row that says you have the same; yours is not drawn twice while the card is presented", async () => {
    seedAddress(entity, "home", { street: "Storgata 1", postal: "0155", places: [OSLO, NORWAY_ROW] });
    mount();
    await ready();
    await waitFor(() => expect(same()?.textContent).toBe("You have the same on your card."), { timeout: 10000 });
    expect(within(group()!).getAllByTestId("one-card-row")).toHaveLength(1);
    expect(within(group()!).queryAllByTestId("place-claim")).toHaveLength(0);
    expect((group()!.textContent ?? "").toLowerCase().split("storgata 1").length - 1).toBe(1);
    expect(writes()).toEqual([]);
  });

  test("a DIFFERENT address of yours is kept beside theirs; nothing says you have the same", async () => {
    seedAddress(entity, "cabin", { street: "Bakkegata 4", places: [US_ROW] });
    mount();
    await ready();
    await waitFor(() => expect(within(group()!).getAllByTestId("place-claim")).toHaveLength(1), { timeout: 10000 });
    expect(same()).toBeNull();
    expect(within(group()!).getAllByTestId("one-card-row")).toHaveLength(1);
  });

  test("F8: a place of the equal address that could not be read keeps the merge UNFOLDED: both are drawn, and nothing says the same", async () => {
    seedAddress(entity, "home", { street: "Storgata 1", postal: "0155", places: [OSLO, NORWAY_ROW] });
    geo.down.add(NORWAY_ROW);
    mount();
    await ready();
    await waitFor(() => expect(within(group()!).getAllByTestId("place-claim")).toHaveLength(1), { timeout: 10000 });
    await act(async () => {
      await sleep(800);
    });
    expect(same()).toBeNull();
    expect(within(group()!).getAllByTestId("one-card-row")).toHaveLength(1);
  });

  test("F8: a list of addresses that was not the whole vault keeps the merge UNFOLDED (the member rejects with the claims)", async () => {
    seedAddress(entity, "home", { street: "Storgata 1", postal: "0155", places: [OSLO, NORWAY_ROW] });
    // The door gives the first page and then never moves on: the read stops after the equal address, and the vault's addresses are not known to be all read.
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (/\/lws\/vault\/[^/]+\/records$/.test(u.pathname) && u.searchParams.getAll("type").includes("PlaceClaim")) {
        const offset = Number(u.searchParams.get("offset") ?? 0);
        if (offset > 0) return Response.json({ records: [], total: 9, complete: false, pageSize: 1, offset, nextOffset: offset });
        const first = (await (await inner(input, init)).json()) as { records: unknown[] };
        return Response.json({ ...first, complete: false, nextOffset: first.records.length });
      }
      return inner(input, init);
    }));
    mount();
    await ready();
    await act(async () => {
      await sleep(1500);
    });
    expect(same()).toBeNull();
    // the group says the read was not whole, and shows the address that was read
    expect(within(group()!).getByTestId("place-claims-incomplete").textContent).toBe("Not every address in Ann could be read: the read could not go on.");
    expect(within(group()!).getAllByTestId("place-claim")).toHaveLength(1);
  });
});
