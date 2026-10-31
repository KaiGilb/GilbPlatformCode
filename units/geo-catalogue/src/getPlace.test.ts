// New. The row read as GilbApp's `getPlace` makes it, pinned at the unit's boundary: the shapes of `memberOf`, the caches, the ceiling, the
// lean copy on the device. (GilbApp pinned these only through the pickers.)
import { describe, expect, it, vi } from "vitest";
import { GeoRowTooLargeError, __resetGeoMemoryOnly, getPlace, peekPlace } from "./geoCatalogue";
import { GEO, ROWS, calls, memoryStorage, useWorld } from "../test/world";

useWorld();

describe("getPlace", () => {
  it("reads label, bare type and the parents of a row; geometry and the rest are not kept", async () => {
    const ID = `${GEO}/with-geometry`;
    ROWS[ID] = { "@id": ID, "@type": "t:Municipality", label: "Wide", memberOf: [`${GEO}/no`, `${GEO}/no`], c_geometry: { huge: true } };
    try {
      expect(await getPlace(ID)).toEqual({ id: ID, label: "Wide", type: "Municipality", memberOf: [`${GEO}/no`] });
    } finally {
      delete ROWS[ID];
    }
  });

  it("a parent given as a compact { @id: base:e/... } is made absolute against the catalogue's origin", async () => {
    expect((await getPlace(`${GEO}/oslo-township`))?.memberOf).toEqual([`${GEO}/us`]);
  });

  it("a second read of the same row, and a second at the same time, make one request", async () => {
    await Promise.all([getPlace(`${GEO}/oslo`), getPlace(`${GEO}/oslo`)]);
    await getPlace(`${GEO}/oslo`);
    expect(calls.filter((c) => c.url === `${GEO}/oslo`)).toHaveLength(1);
  });

  it("a 404 is null and is not kept: the next ask asks again", async () => {
    expect(await getPlace(`${GEO}/nope`)).toBeNull();
    expect(await getPlace(`${GEO}/nope`)).toBeNull();
    expect(calls.filter((c) => c.url === `${GEO}/nope`)).toHaveLength(2);
  });

  it("a row declared larger than the ceiling is refused as GeoRowTooLargeError, and is not an absence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ label: "Big" }), { status: 200, headers: { "content-length": "9000000" } })),
    );
    await expect(getPlace(`${GEO}/big`, undefined, { maxBytes: 1000 })).rejects.toBeInstanceOf(GeoRowTooLargeError);
  });

  it("an empty label is never kept on the device", async () => {
    const store = memoryStorage();
    vi.stubGlobal("localStorage", store);
    const ID = `${GEO}/nameless`;
    ROWS[ID] = { "@id": ID, "@type": "t:City" };
    try {
      expect((await getPlace(ID))?.label).toBe("");
      expect(store.getItem("base:geo:lean-rows:v1")).toBeNull();
    } finally {
      delete ROWS[ID];
    }
  });
});

describe("the device's lean copy", () => {
  it("a row read once is on the device (label, type, parents; no geometry), and a new tab reads it from there with no request", async () => {
    const store = memoryStorage();
    vi.stubGlobal("localStorage", store);
    await getPlace(`${GEO}/oslo`);
    const kept = JSON.parse(store.getItem("base:geo:lean-rows:v1")!) as Record<string, { l: string; t: string; m: string[] }>;
    expect(kept[`${GEO}/oslo`]).toMatchObject({ l: "Oslo", t: "Municipality", m: [`${GEO}/no`] });
    __resetGeoMemoryOnly();
    calls.length = 0;
    expect(peekPlace(`${GEO}/oslo`)?.label).toBe("Oslo");
    expect((await getPlace(`${GEO}/oslo`))?.label).toBe("Oslo");
    expect(calls).toEqual([]);
  });

  it("the copy is bounded at 400 rows, the oldest going first", async () => {
    const store = memoryStorage();
    vi.stubGlobal("localStorage", store);
    const rows: Record<string, { l: string; t: string; m: string[]; s: number }> = {};
    for (let i = 0; i < 400; i += 1) rows[`${GEO}/r${i}`] = { l: `R${i}`, t: "City", m: [], s: 1000 + i };
    store.setItem("base:geo:lean-rows:v1", JSON.stringify(rows));
    await getPlace(`${GEO}/oslo`);
    const kept = JSON.parse(store.getItem("base:geo:lean-rows:v1")!) as Record<string, unknown>;
    expect(Object.keys(kept)).toHaveLength(400);
    expect(kept[`${GEO}/oslo`]).toBeDefined();
    expect(kept[`${GEO}/r0`]).toBeUndefined();
  });

  it("an expired row (over 30 days) is read again", async () => {
    const store = memoryStorage();
    vi.stubGlobal("localStorage", store);
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    store.setItem("base:geo:lean-rows:v1", JSON.stringify({ [`${GEO}/oslo`]: { l: "Stale", t: "City", m: [], s: old } }));
    expect((await getPlace(`${GEO}/oslo`))?.label).toBe("Oslo");
    expect(calls.filter((c) => c.url === `${GEO}/oslo`)).toHaveLength(1);
  });

  it("a full or blocked device store only means the next session reads the row again", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    });
    expect((await getPlace(`${GEO}/oslo`))?.label).toBe("Oslo");
  });
});
