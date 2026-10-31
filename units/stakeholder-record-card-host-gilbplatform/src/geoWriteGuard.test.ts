// New. The write guard of the Employment section (decision 2b): every address the section may write to is looked at before it is given the means to
// write, and one inside the place catalogue is refused with no request. The function throws; the section turns the throw into "read-only, and says why".
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GeoWriteRefusedError as GeoOriginRefusal, resetGeoOrigin, setGeoOrigin } from "@kaigilb/gilbplatformcode-geo-origin";
import { GeoWriteRefusedError, assertNoGeoWriteTarget, employmentWriteTargets, employmentWritesRefused } from "./geoWriteGuard";

const GEO = "https://geo.example.test";
const VAULT = "https://holder.example.test/base/pann";
beforeEach(() => {
  setGeoOrigin(GEO);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  resetGeoOrigin();
  vi.unstubAllGlobals();
});

describe("assertNoGeoWriteTarget", () => {
  test.each([
    [`${GEO}/base`],
    [`${GEO}/base/e/osm-r-1`],
    [`${GEO}/lws/r/x1`],
    ["HTTPS://GEO.example.test:443/base/e/x"],
  ])("%j is the catalogue: it throws, with no request", (t) => {
    expect(() => assertNoGeoWriteTarget([VAULT, t])).toThrow(GeoWriteRefusedError);
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    [VAULT],
    [`https://elsewhere.example.test/base/p?u=${GEO}/base/e/x`],
    [`https://elsewhere.example.test/${GEO}`],
    [`${GEO}.evil.example/base/e/x`],
    [`${GEO}@evil.example/base/e/x`],
    ["http://geo.example.test/base/e/x"],
    [null],
    [undefined],
    [""],
  ])("%j is not the catalogue: it passes", (t) => {
    expect(() => assertNoGeoWriteTarget([t])).not.toThrow();
  });

  test("the message names no address", () => {
    const err = (() => {
      try {
        assertNoGeoWriteTarget([`${GEO}/base/e/secret-place`]);
      } catch (e) {
        return e as Error;
      }
      return null;
    })()!;
    expect(err.message).toBe("The place catalogue is read only, so nothing can be written to it.");
    expect(err.message).not.toMatch(/secret|geo\.example/);
  });

  test("no catalogue origin known: nothing is inside it", () => {
    resetGeoOrigin();
    expect(() => assertNoGeoWriteTarget([`${GEO}/base/e/x`])).not.toThrow();
  });
});

describe("employmentWriteTargets / employmentWritesRefused", () => {
  const props = { vaultId: VAULT, recordEntityUri: `${VAULT.replace("/base/pann", "")}/base/e/r1`, servedEdges: [{ "@id": "https://holder.example.test/base/e/x1" }] as unknown };

  test("the vault, the record and each edge are the targets, whatever shape the edge fact has", () => {
    expect(employmentWriteTargets({ ...props, servedEdges: [{ "@id": "a" }, "https://h.example.test/base/e/b", { x: 1 }, 7] })).toEqual([VAULT, props.recordEntityUri, "a", "https://h.example.test/base/e/b", null, null]);
    expect(employmentWriteTargets({ ...props, servedEdges: undefined })).toEqual([VAULT, props.recordEntityUri]);
    expect(employmentWriteTargets({ ...props, servedEdges: `https://h.example.test/base/e/c` })).toEqual([VAULT, props.recordEntityUri, "https://h.example.test/base/e/c"]);
  });

  test.each([
    ["a vault that is the catalogue", { vaultId: `${GEO}/base` }],
    ["a record that is a catalogue row", { recordEntityUri: `${GEO}/base/e/r` }],
    ["an edge that is a catalogue row", { servedEdges: [{ "@id": `${GEO}/base/e/osm-r-1` }] }],
    ["an edge that is a catalogue row, as a string", { servedEdges: `${GEO}/base/e/osm-r-1` }],
  ])("%s: refused", (_n, over) => {
    expect(employmentWritesRefused({ ...props, ...over })).toBe(true);
  });

  test("a normal section is not refused", () => {
    expect(employmentWritesRefused(props)).toBe(false);
    expect(employmentWritesRefused({ ...props, vaultId: null })).toBe(false);
  });
});

describe("one error across units (0.6.0)", () => {
  test("the guard throws geo-origin's GeoWriteRefusedError, so `instanceof` works for any unit that checks it", () => {
    expect(GeoWriteRefusedError).toBe(GeoOriginRefusal);
    let thrown: unknown;
    try {
      assertNoGeoWriteTarget([`${GEO}/base/e/x`]);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(GeoOriginRefusal);
    expect((thrown as GeoOriginRefusal).reason).toBe("catalogue");
    expect((thrown as Error).message).toBe("The place catalogue is read only, so nothing can be written to it.");
  });

  test("a held-host employment write refused by the guard is that error, and the section is read-only", () => {
    expect(employmentWritesRefused({ vaultId: GEO, recordEntityUri: `${VAULT}/e/r`, servedEdges: [] })).toBe(true);
    expect(() => assertNoGeoWriteTarget(employmentWriteTargets({ vaultId: GEO, recordEntityUri: `${VAULT}/e/r`, servedEdges: [] }))).toThrow(GeoOriginRefusal);
  });
});
