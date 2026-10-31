// The ported behaviour of the draft helpers of GilbApp's address card (they had no tests of their own there: the card's tests reached them through the screen).
// The catalogue is the fake platform of `test/world.ts`; nothing here reaches a real host.
import { beforeEach, describe, expect, it } from "vitest";
import { GeoUnavailableError, type GeoPlace } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { clearFinerOnCountryChange, clearRung } from "@kaigilb/gilbplatformcode-place-clear";
import {
  applyCarried,
  cascadeFrom,
  draftChangedSince,
  draftToInput,
  emptyDraft,
  snapshotOf,
  type PlaceClaimDraft,
} from "./index";
import { GEO, GEO_ORIGIN, callsTo, failIds, setCatalogueMode, useWorld } from "../test/world";

useWorld();
beforeEach(() => setCatalogueMode("normal"));

const place = (slug: string, label: string, type: string, memberOf: string[] = []): GeoPlace => ({ id: `${GEO}/${slug}`, label, type, memberOf }) as GeoPlace;
const NORWAY = place("no", "Norway", "Country");
const US = place("us", "United States", "Country");
const NY = place("ny-admin", "New York", "GeoAdminArea", [`${GEO}/us`]);
const YORK = place("york-city", "York", "City", [`${GEO}/us`]);
const PUZZLING = { id: `${GEO}/puzzling`, label: "Puzzling", type: "", memberOf: [`${GEO}/us`] } as GeoPlace;

describe("emptyDraft, draftToInput", () => {
  it("an empty draft holds nothing, marks nothing and carries no notice; each call is its own object", () => {
    const d = emptyDraft();
    expect(d).toEqual({
      label: "",
      streetLine: "",
      addressLine1: "",
      addressLine2: "",
      postalCode: "",
      place: { city: null, region: null, country: null },
      cascaded: { city: false, region: false, country: false },
      divergence: null,
    });
    expect(emptyDraft().cascaded).not.toBe(d.cascaded);
  });

  it("the input is the five parts and the three places, and nothing else: the cascade marks and the notice stay in the draft", () => {
    const d: PlaceClaimDraft = {
      ...emptyDraft(),
      label: "home",
      streetLine: "1 Road",
      addressLine1: "a1",
      addressLine2: "a2",
      postalCode: "0150",
      place: { city: YORK, region: null, country: US },
      cascaded: { city: false, region: false, country: true },
      divergence: { rung: "region", boxRung: "city", label: "New York" },
    };
    const input = draftToInput(d);
    expect(Object.keys(input).sort()).toEqual(["addressLine1", "addressLine2", "label", "place", "postalCode", "streetLine"]);
    expect(input).toEqual({ label: "home", streetLine: "1 Road", addressLine1: "a1", addressLine2: "a2", postalCode: "0150", place: d.place });
  });
});

describe("cascadeFrom: a pick at any rung fills the rungs above it", () => {
  it("a city in the City box: the city is the person's pick, its country is filled from it, no notice", async () => {
    const next = await cascadeFrom(emptyDraft(), YORK, "city");
    expect(next.place.city?.id).toBe(YORK.id);
    expect(next.place.country?.id).toBe(US.id);
    expect(next.place.region).toBeNull();
    expect(next.cascaded).toEqual({ city: false, region: false, country: true });
    expect(next.divergence).toBeNull();
  });

  it("the rung is the ontology's, not the box's: New York typed in the City box lands in Region, fills Country, and the notice says so", async () => {
    const next = await cascadeFrom(emptyDraft(), NY, "city");
    expect(next.place.region?.id).toBe(NY.id);
    expect(next.place.city).toBeNull();
    expect(next.place.country?.id).toBe(US.id);
    expect(next.cascaded).toEqual({ city: false, region: false, country: true });
    expect(next.divergence).toEqual({ rung: "region", boxRung: "city", label: "New York" });
  });

  it("the same row in the Region box carries no notice (the control for the line above)", async () => {
    const next = await cascadeFrom(emptyDraft(), NY, "region");
    expect(next.place.region?.id).toBe(NY.id);
    expect(next.divergence).toBeNull();
  });

  it("a row whose type the ontology cannot classify is filed in the box it was picked in", async () => {
    const next = await cascadeFrom(emptyDraft(), PUZZLING, "city");
    expect(next.place.city?.id).toBe(PUZZLING.id);
    expect(next.divergence).toBeNull();
  });

  it("(M26) the person's own country stands when the picked city resolves to another country", async () => {
    const mine = await cascadeFrom(emptyDraft(), NORWAY, "country");
    expect(mine.cascaded.country).toBe(false);
    const next = await cascadeFrom(mine, YORK, "city");
    expect(next.place.country?.id).toBe(NORWAY.id);
    expect(next.cascaded.country).toBe(false);
    expect(next.place.city?.id).toBe(YORK.id);
  });

  it("a rung an earlier cascade filled is replaced by the new pick's own ancestry", async () => {
    const first = await cascadeFrom(emptyDraft(), place("oslo", "Oslo", "Municipality", [`${GEO}/no`]), "city");
    expect(first.place.country?.id).toBe(NORWAY.id);
    expect(first.cascaded.country).toBe(true);
    const next = await cascadeFrom(first, YORK, "city");
    expect(next.place.country?.id).toBe(US.id);
    expect(next.cascaded.country).toBe(true);
  });

  it("a rung the walk cannot reach is left as it was, never guessed", async () => {
    const next = await cascadeFrom(emptyDraft(), place("oslo-kommune", "Oslo kommune", "Municipality"), "city");
    expect(next.place.country).toBeNull();
    expect(next.place.region).toBeNull();
    expect(next.cascaded.country).toBe(false);
  });

  it("the draft it was given is not changed, and nothing is asked of the catalogue but GETs", async () => {
    const before = emptyDraft();
    const snapshot = JSON.stringify(before);
    await cascadeFrom(before, NY, "city");
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(callsTo(GEO_ORIGIN).length).toBeGreaterThan(0);
    expect(callsTo(GEO_ORIGIN).filter((c) => c.method !== "GET" || c.credentials !== "omit").map((c) => `${c.method} ${c.url} ${c.credentials}`)).toEqual([]);
  });

  it("a failed walk rejects with the catalogue's error and returns no half-filled draft", async () => {
    failIds.add(`${GEO}/us`);
    const d = emptyDraft();
    await expect(cascadeFrom(d, YORK, "city")).rejects.toBeInstanceOf(GeoUnavailableError);
    expect(d.place.city).toBeNull();
  });
});

describe("place-clear on this draft (the ported tests of clearFinerOnCountryChange and clearRung)", () => {
  it("picking another country clears the city and the region the old country had filled, keeps the country, and drops a notice about a finer rung", async () => {
    const viaNy = await cascadeFrom(emptyDraft(), NY, "city");
    expect(viaNy.divergence?.rung).toBe("region");
    const cleared = clearFinerOnCountryChange(viaNy);
    expect(cleared.place.region).toBeNull();
    expect(cleared.place.city).toBeNull();
    expect(cleared.place.country?.id).toBe(US.id);
    expect(cleared.cascaded).toEqual({ city: false, region: false, country: true });
    expect(cleared.divergence).toBeNull();
    expect(viaNy.place.region?.id).toBe(NY.id);
  });

  it("a notice about the country stays", () => {
    const d: PlaceClaimDraft = { ...emptyDraft(), place: { city: null, region: null, country: NORWAY }, divergence: { rung: "country", boxRung: "city", label: "Norway" } };
    expect(clearFinerOnCountryChange(d).divergence).toBe(d.divergence);
    expect(clearFinerOnCountryChange(d).place.country).toBe(NORWAY);
  });

  it("clearing one rung clears its mark and only a notice about that rung; the text parts stay", async () => {
    const viaNy = { ...(await cascadeFrom(emptyDraft(), NY, "city")), label: "home", postalCode: "0150" };
    const keep = clearRung(viaNy, "country");
    expect(keep.place.country).toBeNull();
    expect(keep.place.region?.id).toBe(NY.id);
    expect(keep.divergence).toEqual(viaNy.divergence);
    const gone = clearRung(viaNy, "region");
    expect(gone.divergence).toBeNull();
    expect(gone.label).toBe("home");
    expect(gone.postalCode).toBe("0150");
  });
});

describe("snapshotOf, draftChangedSince", () => {
  const base = (): PlaceClaimDraft => ({
    ...emptyDraft(),
    label: "home",
    streetLine: "1 Road",
    addressLine1: "a1",
    addressLine2: "a2",
    postalCode: "0150",
    place: { city: YORK, region: null, country: US },
  });

  it("the snapshot is scalars, and a place is its id", () => {
    expect(snapshotOf(base())).toEqual({
      label: "home",
      streetLine: "1 Road",
      addressLine1: "a1",
      addressLine2: "a2",
      postalCode: "0150",
      city: YORK.id,
      region: null,
      country: US.id,
    });
  });

  it("the same address read again (fresh place objects), with other cascade marks or another notice, has not changed", () => {
    const again: PlaceClaimDraft = {
      ...base(),
      place: { city: { ...YORK }, region: null, country: { ...US } },
      cascaded: { city: false, region: false, country: true },
      divergence: { rung: "region", boxRung: "city", label: "x" },
    };
    expect(draftChangedSince(again, base())).toBe(false);
  });

  it.each([
    ["label", { label: "work" }],
    ["street", { streetLine: "2 Road" }],
    ["Address 1", { addressLine1: "b1" }],
    ["Address 2", { addressLine2: "b2" }],
    ["postal code", { postalCode: "0151" }],
    ["city", { place: { city: null, region: null, country: US } }],
    ["region", { place: { city: YORK, region: NY, country: US } }],
    ["country", { place: { city: YORK, region: null, country: NORWAY } }],
  ] as const)("a different %s is a change", (_n, over) => {
    expect(draftChangedSince({ ...base(), ...over } as PlaceClaimDraft, base())).toBe(true);
  });
});

describe("applyCarried: only what the person changed after the save is carried", () => {
  const sent: PlaceClaimDraft = { ...emptyDraft(), label: "home", streetLine: "1 Road", place: { city: YORK, region: null, country: US }, cascaded: { city: false, region: false, country: true } };

  it("a part left alone stays the store's (a value the store trimmed is not written back over)", () => {
    const stored: PlaceClaimDraft = { ...sent, label: "home", streetLine: "1 Road" };
    const latest: PlaceClaimDraft = { ...sent, label: "home ", postalCode: "0150" };
    const out = applyCarried({ ...stored, label: "home" }, { sent: { ...sent, label: "home " }, latest });
    expect(out.label).toBe("home");
    expect(out.postalCode).toBe("0150");
    expect(out.streetLine).toBe("1 Road");
  });

  it("each text part that changed is taken from the latest form", () => {
    const latest: PlaceClaimDraft = { ...sent, label: "work", streetLine: "2 Road", addressLine1: "a1", addressLine2: "a2", postalCode: "0150" };
    const out = applyCarried(sent, { sent, latest });
    expect([out.label, out.streetLine, out.addressLine1, out.addressLine2, out.postalCode]).toEqual(["work", "2 Road", "a1", "a2", "0150"]);
  });

  it("a rung that changed is taken with its cascade mark; a rung that did not is the store's", () => {
    const latest: PlaceClaimDraft = { ...sent, place: { city: YORK, region: NY, country: US }, cascaded: { city: false, region: true, country: true } };
    const stored: PlaceClaimDraft = { ...sent, place: { city: { ...YORK }, region: null, country: { ...US } } };
    const out = applyCarried(stored, { sent, latest });
    expect(out.place.region?.id).toBe(NY.id);
    expect(out.cascaded.region).toBe(true);
    expect(out.place.city).toBe(stored.place.city);
    expect(out.place.country).toBe(stored.place.country);
  });

  it("a rung the person emptied is emptied", () => {
    const latest: PlaceClaimDraft = { ...sent, place: { city: null, region: null, country: US }, cascaded: { city: false, region: false, country: true } };
    const out = applyCarried(sent, { sent, latest });
    expect(out.place.city).toBeNull();
  });

  it("the stored draft is not changed", () => {
    const stored = { ...sent };
    const snapshot = JSON.stringify(stored);
    applyCarried(stored, { sent, latest: { ...sent, label: "x", place: { city: null, region: NY, country: US } } });
    expect(JSON.stringify(stored)).toBe(snapshot);
  });
});
