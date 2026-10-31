// New. Where the grain map is read from. GilbApp read it from a constant for the ontology master; this unit reads `termOrigin()`.
// The live setting of the taking app is https://veda.gilb.com (Kai-Zen read it from the app's saved settings on 2026-10-31); an operator who
// points `ontologyOrigin` elsewhere gets that master's grains. These tests pin both, and that the catalogue is not asked for grains.
import { describe, expect, it, vi } from "vitest";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { resolveGeoGrains } from "./geoCatalogue";
import { GEO_ORIGIN, GRAIN_OF, calls, useWorld } from "../test/world";

useWorld();

describe("the grain read goes to the ontology origin the app set", () => {
  it("with ontologyOrigin https://veda.gilb.com the grain reads go to https://veda.gilb.com/... exactly (the live setting)", async () => {
    setTermOrigin("https://veda.gilb.com");
    await resolveGeoGrains();
    const urls = calls.map((c) => c.url);
    expect(urls).toEqual([
      "https://veda.gilb.com/base/t/GeoRegion/children",
      ...Object.keys(GRAIN_OF).map((name) => `https://veda.gilb.com/base/t/${name}`),
    ]);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("with another ontology origin, the grains are that master's: nothing goes to the first one", async () => {
    setTermOrigin("https://other-ontology.example.test/");
    await resolveGeoGrains();
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every((c) => c.url.startsWith("https://other-ontology.example.test/base/t/"))).toBe(true);
  });

  it("the grain reads are not made to the catalogue", async () => {
    await resolveGeoGrains();
    expect(calls.filter((c) => c.url.startsWith(GEO_ORIGIN))).toEqual([]);
  });

  it("the origin in force when the map is first read is the one used", async () => {
    setTermOrigin("https://first.example.test");
    await resolveGeoGrains();
    expect(calls[0]!.url.startsWith("https://first.example.test/")).toBe(true);
  });
});

describe("a failed grain read is not kept", () => {
  it("the first read fails (ontology down): it throws; the next read asks again and succeeds", async () => {
    const ok = fetch;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await expect(resolveGeoGrains()).rejects.toMatchObject({ status: 503 });
    vi.stubGlobal("fetch", ok);
    const grains = await resolveGeoGrains();
    expect(grains.byRung.country).toEqual(["Country"]);
  });

  it("one type that cannot be read is listed as unclassified, the rest stay usable", async () => {
    const real = fetch;
    vi.stubGlobal("fetch", vi.fn(async (u: unknown, i?: RequestInit) => (String(u).endsWith("/base/t/Town") ? new Response("x", { status: 500 }) : real(u as string, i))));
    const grains = await resolveGeoGrains();
    expect(grains.unclassified).toEqual(["Town"]);
    expect(grains.byRung.city).toEqual(["City", "Municipality"]);
  });
});
