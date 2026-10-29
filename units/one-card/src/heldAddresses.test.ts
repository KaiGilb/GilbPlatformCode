// A held address claim as the merge's `OwnAddress` (its typed lines, and the names of the catalogue places it binds, finest first), read
// through the host's `claimFieldText`.
import { describe, expect, it } from "vitest";
import { addressLine } from "@kaigilb/gilbplatformcode-one-card-merge";
import { ownAddressOf } from "./heldAddresses";
import type { PlaceClaim } from "./oneCardHost";
import { fakeHost } from "../test/fakeHost";

const GEO = "https://geo.example.test/base/e";
const host = fakeHost();
const field = (subject: string, extra: Record<string, unknown>) => ({ id: subject, uri: `u/${subject}`, detailOf: "c", subject, streetLine: "", placeId: null, etag: null, ...extra });
const claim = (fields: unknown[]): PlaceClaim => ({ id: "c1", uri: "https://h.example/vault/e/c1", label: "home", streetLine: "", memberOf: [], fields } as unknown as PlaceClaim);

describe("ownAddressOf", () => {
  it("reads the typed lines and the bound places, finest first, into the merge's address parts", () => {
    const c = claim([
      field("street", { streetLine: "Storgata 1" }),
      field("postal", { postalCode: "0155" }),
      field("place", { placeId: `${GEO}/no` }),
      field("place", { placeId: `${GEO}/oslo` }),
    ]);
    const places = [
      { id: `${GEO}/no`, label: "Norway", type: "Country", memberOf: [] },
      { id: `${GEO}/oslo`, label: "Oslo", type: "Municipality", memberOf: [`${GEO}/no`] },
    ];
    const a = ownAddressOf(host, c, places);
    expect(a).toMatchObject({ street: "Storgata 1", postalCode: "0155", city: "Oslo", country: "Norway", entity: "https://h.example/vault/e/c1" });
    expect(addressLine(a)).toBe("Storgata 1, 0155, Oslo, Norway");
  });

  it("the Location label is the holder's name for the address, not a part of it", () => {
    expect(addressLine(ownAddressOf(host, claim([field("street", { streetLine: "Bakkegata 4" })]), []))).toBe("Bakkegata 4");
  });

  it("three places: city, then region, then country", () => {
    const places = [
      { id: "r", label: "Viken", type: "GeoAdminArea", memberOf: ["n"] },
      { id: "n", label: "Norway", type: "Country", memberOf: [] },
      { id: "c", label: "Drammen", type: "City", memberOf: ["r"] },
    ];
    const c = claim([field("place", { placeId: "r" }), field("place", { placeId: "n" }), field("place", { placeId: "c" })]);
    expect(ownAddressOf(host, c, places)).toMatchObject({ city: "Drammen", region: "Viken", country: "Norway" });
  });
});
