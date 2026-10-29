// `ownAddressOf` beyond the cases of the app: the rules the merge relies on, pinned.
import { describe, expect, it } from "vitest";
import { ownAddressOf } from "./heldAddresses";
import type { GeoPlace, PlaceClaim } from "./oneCardHost";
import { fakeHost } from "../test/fakeHost";

const host = fakeHost();
const field = (subject: string, extra: Record<string, unknown>) => ({ id: subject, uri: `u/${subject}`, detailOf: "c", subject, streetLine: "", placeId: null, etag: null, ...extra });
const claim = (fields: unknown[], over: Record<string, unknown> = {}): PlaceClaim =>
  ({ id: "c1", uri: "https://h.example.test/vault/e/c1", label: "home", streetLine: "", memberOf: [], fields, ...over }) as unknown as PlaceClaim;
const place = (id: string, label: string, type: string, memberOf: string[] = []): GeoPlace => ({ id, label, type, memberOf });

describe("ownAddressOf", () => {
  it("reads all four text lines through the host, and the claim's entity", () => {
    const c = claim([field("street", { streetLine: "S" }), field("line1", { addressLine1: "L1" }), field("line2", { addressLine2: "L2" }), field("postal", { postalCode: "P" })]);
    expect(ownAddressOf(host, c, [])).toEqual({ street: "S", line1: "L1", line2: "L2", postalCode: "P", city: null, region: null, country: null, entity: "https://h.example.test/vault/e/c1" });
  });
  it("takes the street from the legacy composite when there is no street field, and nothing else from it", () => {
    expect(ownAddressOf(host, claim([], { streetLine: "Old 1" }), [])).toMatchObject({ street: "Old 1", line1: "", line2: "", postalCode: "" });
  });
  it("binds places by the legacy composite's ids when the fields name none", () => {
    const a = place("a", "Oslo", "City");
    expect(ownAddressOf(host, claim([], { memberOf: ["a"] }), [a]).city).toBe("Oslo");
  });
  it("three places: the finest is the city, the last country-typed one is the country, one between is the region", () => {
    const ps = [place("n", "Norway", "Country"), place("r", "Viken", "GeoAdminArea", ["n"]), place("c", "Drammen", "City", ["r"])];
    const c = claim([field("place", { placeId: "n" }), field("place", { placeId: "r" }), field("place", { placeId: "c" })]);
    expect(ownAddressOf(host, c, ps)).toMatchObject({ city: "Drammen", region: "Viken", country: "Norway" });
  });
  it("two regions between city and country are joined with a comma, finest first", () => {
    const ps = [place("n", "Norway", "Country"), place("r1", "Viken", "GeoAdminArea", ["n"]), place("r2", "Buskerud", "GeoAdminArea", ["r1", "n"]), place("c", "Drammen", "City", ["r2", "r1", "n"])];
    const c = claim(ps.map((p) => field("place", { placeId: p.id })));
    expect(ownAddressOf(host, c, ps)).toMatchObject({ city: "Drammen", region: "Buskerud, Viken", country: "Norway" });
  });
  it("the country is recognised by its type, in any case; without one the coarsest place is a region", () => {
    const ps = [place("n", "Norway", "country"), place("c", "Oslo", "City", ["n"])];
    expect(ownAddressOf(host, claim(ps.map((p) => field("place", { placeId: p.id }))), ps)).toMatchObject({ city: "Oslo", country: "Norway", region: null });
    const noCountry = [place("r", "Viken", "GeoAdminArea"), place("c", "Drammen", "City", ["r"])];
    expect(ownAddressOf(host, claim(noCountry.map((p) => field("place", { placeId: p.id }))), noCountry)).toMatchObject({ city: "Drammen", region: "Viken", country: null });
  });
  it("a place with a blank label, or one the catalogue did not return, is left out", () => {
    const ps = [place("a", "  ", "City"), place("b", "Bergen", "City")];
    const c = claim([field("place", { placeId: "a" }), field("place", { placeId: "b" }), field("place", { placeId: "missing" })]);
    expect(ownAddressOf(host, c, ps)).toMatchObject({ city: "Bergen", region: null, country: null });
  });
  it("a loop in the catalogue's parents does not hang the depth walk", () => {
    const ps = [place("a", "A", "City", ["b"]), place("b", "B", "City", ["a"])];
    const r = ownAddressOf(host, claim([field("place", { placeId: "a" }), field("place", { placeId: "b" })]), ps);
    expect([r.city, r.region]).toEqual(expect.arrayContaining([expect.anything()]));
  });
});
