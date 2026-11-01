// The lines and the unread sentences of an address of theirs. The line rule and the sentences are copied from
// address-card-parts (`compactLines`, `unreadNotes`); this file pins them to those functions. Beyond the source (Kai, 2026-11-01).
import { describe, expect, it } from "vitest";
import { emptyDraft, type PlaceClaimDraft } from "@kaigilb/gilbplatformcode-place-draft";
import { compactLines } from "../node_modules/@kaigilb/gilbplatformcode-address-card-parts/src/addressLines";
import { unreadNotes } from "../node_modules/@kaigilb/gilbplatformcode-address-card-parts/src/BoundPlaceLine";
import type { PlaceRead } from "@kaigilb/gilbplatformcode-place-names";
import { theirAddressLines, theirUnreadNotes, type TheirLine } from "./theirAddressLines";
import type { OwnAddress } from "@kaigilb/gilbplatformcode-one-card-merge";

const NORWAY = "https://geo.example.test/base/e/norway";

describe("theirAddressLines", () => {
  it("T1 Kai's home lines", () => {
    const parts: OwnAddress = { street: "Gladvollveien 38c", postalCode: null, city: "Oslo", region: "Oslo", country: "Norway" };
    expect(theirAddressLines(parts, NORWAY)).toEqual([
      { key: "street", text: "Gladvollveien 38c" },
      { key: "postal-city", text: "Oslo" },
      { key: "region-country", text: "Oslo, Norway", countryId: NORWAY },
    ] satisfies TheirLine[]);
  });

  it('T2 postal code and city share a line "0150 Oslo"', () => {
    expect(theirAddressLines({ postalCode: "0150", city: "Oslo" }, null)).toEqual([{ key: "postal-city", text: "0150 Oslo" }]);
  });

  it("T3 no country name → no countryId on any line", () => {
    const lines = theirAddressLines({ street: "Gladvollveien 38c", city: "Oslo", region: "Oslo", country: "  " }, NORWAY);
    expect(lines.some((l) => l.countryId !== undefined)).toBe(false);
    expect(lines).toEqual([
      { key: "street", text: "Gladvollveien 38c" },
      { key: "postal-city", text: "Oslo" },
      { key: "region-country", text: "Oslo" },
    ]);
  });

  it("T4 notes", () => {
    expect(theirUnreadNotes(1, 0, true)).toEqual(["1 more place not read right now"]);
    expect(theirUnreadNotes(2, 0, false)).toEqual(["2 places not read right now"]);
    expect(theirUnreadNotes(0, 1, true)).toEqual(["1 place no longer in the catalogue"]);
    expect(theirUnreadNotes(0, 0, true)).toEqual([]);
  });

  it("T5 same lines as compactLines for the same address", () => {
    const place = (id: string, label: string, type: string) => ({ id, label, type, memberOf: [] as string[] });
    const drafts: PlaceClaimDraft[] = [
      filled({
        streetLine: "Gladvollveien 38c",
        city: place("oslo-city", "Oslo", "City"),
        region: place("oslo-region", "Oslo", "Region"),
        country: place(NORWAY, "Norway", "Country"),
      }),
      filled({
        streetLine: "Gladvollveien 38c",
        addressLine1: "c/o Hansen",
        addressLine2: "3. etasje",
        postalCode: "0150",
        city: place("oslo-city", "Oslo", "City"),
        country: place(NORWAY, "Norway", "Country"),
      }),
      filled({ postalCode: "0150", region: place("oslo-region", "Oslo", "Region") }),
      filled({}),
    ];
    for (const draft of drafts) {
      expect(theirAddressLines(partsOf(draft), draft.place.country?.id ?? null)).toEqual(
        compactLines(draft).map((l) => (l.countryId ? { key: l.key, text: l.text, countryId: l.countryId } : { key: l.key, text: l.text })),
      );
    }

    const city = place("c", "Oslo", "City");
    const named = (id: string): PlaceRead => ({ id, state: "named", place: { ...city, id } });
    const failed = (id: string): PlaceRead => ({ id, state: "failed", reason: "unreachable" });
    const missing = (id: string): PlaceRead => ({ id, state: "missing" });
    const sets: PlaceRead[][] = [
      [named("c"), failed("r")],
      [failed("a"), failed("b")],
      [named("c"), missing("g")],
      [named("c")],
      [missing("g"), missing("h")],
      [named("c"), failed("r"), missing("g")],
      [],
    ];
    for (const reads of sets) {
      const unread = reads.filter((r) => r.state === "failed").length;
      const gone = reads.filter((r) => r.state === "missing").length;
      const namedAny = reads.some((r) => r.state === "named");
      expect(theirUnreadNotes(unread, gone, namedAny)).toEqual(unreadNotes(reads));
    }
  });
});

function filled(over: {
  streetLine?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: PlaceClaimDraft["place"]["city"];
  region?: PlaceClaimDraft["place"]["region"];
  country?: PlaceClaimDraft["place"]["country"];
}): PlaceClaimDraft {
  const d = emptyDraft();
  return {
    ...d,
    streetLine: over.streetLine ?? "",
    addressLine1: over.addressLine1 ?? "",
    addressLine2: over.addressLine2 ?? "",
    postalCode: over.postalCode ?? "",
    place: { city: over.city ?? null, region: over.region ?? null, country: over.country ?? null },
  };
}

function partsOf(draft: PlaceClaimDraft): OwnAddress {
  return {
    street: draft.streetLine,
    line1: draft.addressLine1,
    line2: draft.addressLine2,
    postalCode: draft.postalCode,
    city: draft.place.city?.label ?? null,
    region: draft.place.region?.label ?? null,
    country: draft.place.country?.label ?? null,
  };
}
