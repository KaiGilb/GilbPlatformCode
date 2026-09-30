import { describe, expect, it } from "vitest";
import { clearFinerOnCountryChange, clearRung } from "./placeClear";

const city = { id: "city" };
const region = { id: "region" };
const country = { id: "country" };

function draft(divergence: { rung: string; label: string } | null) {
  return {
    label: " home ",
    streetLine: "1 Road",
    access: "private",
    place: { city, region, country, extra: "keep" },
    cascaded: { city: true, region: true, country: true },
    divergence,
  };
}

describe("clearFinerOnCountryChange", () => {
  it("clears city and region, keeps country, and drops a notice about a finer rung", () => {
    const notice = { rung: "city", label: "Oslo" };
    const before = draft(notice);
    const next = clearFinerOnCountryChange(before);
    expect(next.place.city).toBeNull();
    expect(next.place.region).toBeNull();
    expect(next.place.country).toBe(country);
    expect(next.place.extra).toBe("keep");
    expect(next.cascaded).toEqual({ city: false, region: false, country: true });
    expect(next.divergence).toBeNull();
    expect(next.label).toBe(" home ");
    expect(next.access).toBe("private");
    expect(before.place.city).toBe(city);
    expect(before.divergence).toBe(notice);
  });

  it("keeps a country notice, and keeps a missing notice as null", () => {
    const notice = { rung: "country", label: "Norway" };
    expect(clearFinerOnCountryChange(draft(notice)).divergence).toBe(notice);
    expect(clearFinerOnCountryChange(draft(null)).divergence).toBeNull();
    expect(clearFinerOnCountryChange(draft({ rung: "Country", label: "x" })).divergence).toBeNull();
  });
});

describe("clearRung", () => {
  it("clears only that rung and only a notice about that rung", () => {
    const notice = { rung: "region", label: "Oslo" };
    const before = draft(notice);
    const next = clearRung(before, "region");
    expect(next.place.region).toBeNull();
    expect(next.place.city).toBe(city);
    expect(next.place.country).toBe(country);
    expect(next.cascaded).toEqual({ city: true, region: false, country: true });
    expect(next.divergence).toBeNull();
    expect(clearRung(before, "city").divergence).toBe(notice);
  });
});
