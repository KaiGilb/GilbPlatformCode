// Ported from GilbApp `src/lib/mynet/geo/placeHitDetails.s8cardlook.test.ts` (commit a703b3ed): the same cases against the unit (21). Changes: the
// import paths, the world (`test/world.ts`: example hosts, the call log), the setup that `useWorld()` now does, and the two cases about the id
// tail, which now pin the position among twins (name rule). F12 is new.

// rows 'Oslo / Oslo / Oslo kommune / Oslo Township' with no way to tell them apart: 'need to show the other
// metadata, like what Oslo, the city in Norway or some town in USA'".
//
// What GilbGeo gives per hit (measured live 2026-10-16, anonymous GETs): the search returns IDS only (`q` and `type` are
// its only parameters), the row read carries `@type`, `label` and `memberOf`, and a parent is a whole row with its
// polygon (Norway 469 KB, 171 KB br; the United States 3.1 MB, 1.16 MB br). There is no lean projection, no range read
// and no parent label on the hit. So the kind is free (the hit's own type), and the container is a bounded, cached
// lookup that degrades to kind-only. These tests pin that.
import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetGeoMemoryOnly, getPlace, resolveGeoGrains } from "@kaigilb/gilbplatformcode-geo-catalogue";
import {
  MAX_CONTAINER_HOPS,
  MAX_FRESH_PARENT_READS,
  PARENT_ROW_CEILING_BYTES,
  describePlaceHits,
  placeHitLine,
} from "./index";
import { GEO, GEO_ORIGIN, ROWS, calls, failIds, useWorld } from "../test/world";

useWorld();
afterEach(() => {
  for (const k of Object.keys(ROWS)) if (k.includes("/s8x-")) delete ROWS[k];
});
// The reads of catalogue rows the code under test made (the source's `fetchSpy.mock.calls`, here the world's log).
const rowReads = () => calls.map((c) => c.url).filter((u) => u.startsWith(GEO + "/"));
const clearCalls = () => void (calls.length = 0);

const oslo = async (id: string) => (await getPlace(`${GEO}/${id}`))!;

describe("the KIND of a hit comes free, from the hit's own type, in the ontology's words", () => {
  it("Municipality → municipality, GeoAdminArea → region, City → city, Country → country", async () => {
    const grains = await resolveGeoGrains();
    expect(grains.kindOf.get("Municipality")).toBe("municipality");
    expect(grains.kindOf.get("GeoAdminArea")).toBe("region");
    expect(grains.kindOf.get("City")).toBe("city");
    expect(grains.kindOf.get("Town")).toBe("town");
    expect(grains.kindOf.get("Country")).toBe("country");
  });

  it("a hit's kind needs no read beyond the hit itself", async () => {
    const hit = await oslo("oslo");
    clearCalls();
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(d.kind).toBe("municipality");
    // The only reads are the vocabulary's (cached) and the parent: no read of the hit again.
    expect(rowReads().filter((u) => u === hit.id)).toEqual([]);
  });
});

describe("the CONTAINER chain: one parent, then its parent, never more", () => {
  it("Oslo (municipality) is in Norway", async () => {
    const hit = await oslo("oslo");
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(d.container).toEqual(["Norway"]);
    expect(d.state).toBe("named");
    expect(placeHitLine(d)).toBe("municipality · in Norway");
  });

  it("the live compact shape of memberOf ({ @id: base:e/… }) names its country too", async () => {
    const hit = await oslo("oslo-township");
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(d.container).toEqual(["United States"]);
    expect(placeHitLine(d)).toBe("municipality · in United States");
  });

  it("Manchester is in Greater Manchester, United Kingdom (two hops, the limit)", async () => {
    const hit = await oslo("manchester");
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(d.container).toEqual(["Greater Manchester", "United Kingdom"]);
    expect(MAX_CONTAINER_HOPS).toBe(2);
    expect(placeHitLine(d)).toBe("city · in Greater Manchester, United Kingdom");
  });

  it("a row with NO memberOf says so, it does not guess a place (Oslo kommune)", async () => {
    const hit = await oslo("oslo-kommune");
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(d.container).toEqual([]);
    expect(d.state).toBe("none-recorded");
    expect(placeHitLine(d)).toBe("municipality · no containing place recorded");
  });

  it("a chain longer than the limit is cut at the limit: the third container is never read", async () => {
    ROWS[`${GEO}/s8x-l0`] = { "@id": `${GEO}/s8x-l0`, "@type": "t:City", label: "Lowtown", memberOf: `${GEO}/s8x-l1` };
    ROWS[`${GEO}/s8x-l1`] = { "@id": `${GEO}/s8x-l1`, "@type": "t:GeoAdminArea", label: "County L", memberOf: `${GEO}/s8x-l2` };
    ROWS[`${GEO}/s8x-l2`] = { "@id": `${GEO}/s8x-l2`, "@type": "t:GeoAdminArea", label: "State L", memberOf: `${GEO}/s8x-l3` };
    ROWS[`${GEO}/s8x-l3`] = { "@id": `${GEO}/s8x-l3`, "@type": "t:Country", label: "Landl" };
    const hit = (await getPlace(`${GEO}/s8x-l0`))!;
    clearCalls();
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(d.container).toEqual(["County L", "State L"]);
    expect(d.partial).toBe(true);
    expect(rowReads().filter((u) => u === `${GEO}/s8x-l3`)).toEqual([]);
  });
});

describe("the lookup is BOUNDED and CACHED", () => {
  it("two hits in the same country read that country ONCE", async () => {
    const a = await oslo("oslo");
    const b = await oslo("oslo-admin");
    clearCalls();
    await describePlaceHits([a, b]);
    expect(rowReads().filter((u) => u === `${GEO}/no`).length).toBe(1);
  });

  it("a second look at the same hits reads nothing", async () => {
    const a = await oslo("oslo");
    const b = await oslo("oslo-township");
    await describePlaceHits([a, b]);
    clearCalls();
    const d = await describePlaceHits([a, b]);
    expect(rowReads()).toEqual([]);
    expect(d.get(a.id)!.container).toEqual(["Norway"]);
  });

  it("a NEW SESSION (memory gone, the device's lean store kept) reads no parent again", async () => {
    const a = await oslo("oslo");
    await describePlaceHits([a]);
    __resetGeoMemoryOnly();
    clearCalls();
    const d = await describePlaceHits([a]);
    expect(rowReads()).toEqual([]);
    expect(d.get(a.id)!.container).toEqual(["Norway"]);
  });

  it(`no more than ${MAX_FRESH_PARENT_READS} uncached parents are read for one list; the rest degrade to kind-only`, async () => {
    const hits = [];
    for (let i = 1; i <= 5; i++) {
      ROWS[`${GEO}/s8x-par-${i}`] = { "@id": `${GEO}/s8x-par-${i}`, "@type": "t:Country", label: `Land ${i}` };
      ROWS[`${GEO}/s8x-h-${i}`] = { "@id": `${GEO}/s8x-h-${i}`, "@type": "t:City", label: "Springfield", memberOf: `${GEO}/s8x-par-${i}` };
      hits.push((await getPlace(`${GEO}/s8x-h-${i}`))!);
    }
    clearCalls();
    const out = await describePlaceHits(hits);
    const parentReads = rowReads().filter((u) => u.includes("/s8x-par-"));
    expect(parentReads.length).toBe(MAX_FRESH_PARENT_READS);
    const named = hits.filter((h) => out.get(h.id)!.container.length > 0);
    const kindOnly = hits.filter((h) => out.get(h.id)!.container.length === 0);
    expect(named.length).toBe(MAX_FRESH_PARENT_READS);
    expect(kindOnly.length).toBe(2);
    for (const h of kindOnly) {
      expect(out.get(h.id)!.state).toBe("unavailable");
      expect(out.get(h.id)!.kind).toBe("city");
      expect(placeHitLine(out.get(h.id)!)).toMatch(/^city/);
    }
  });

  it("a container already known (this tab or the device) costs NO read and takes NONE of the list's few fresh reads", async () => {
    const hits = [];
    for (let i = 1; i <= 5; i++) {
      ROWS[`${GEO}/s8x-kp-${i}`] = { "@id": `${GEO}/s8x-kp-${i}`, "@type": "t:Country", label: `Known ${i}` };
      ROWS[`${GEO}/s8x-kh-${i}`] = { "@id": `${GEO}/s8x-kh-${i}`, "@type": "t:City", label: "Kville", memberOf: `${GEO}/s8x-kp-${i}` };
      hits.push((await getPlace(`${GEO}/s8x-kh-${i}`))!);
    }
    // three countries are already known; two are new
    for (const i of [1, 2, 3]) await getPlace(`${GEO}/s8x-kp-${i}`);
    clearCalls();
    const out = await describePlaceHits(hits);
    expect(hits.every((h) => out.get(h.id)!.container.length === 1)).toBe(true);
    expect(rowReads().filter((u) => u.includes("/s8x-kp-")).length).toBe(2);
  });

  it("a row the device's lean copy holds is read by getPlace itself with no request (a new session)", async () => {
    const a = await oslo("oslo");
    __resetGeoMemoryOnly();
    clearCalls();
    const again = await getPlace(a.id);
    expect(again?.label).toBe("Oslo");
    expect(rowReads()).toEqual([]);
  });

  it("a country is the END of the chain, whatever else its row says", async () => {
    ROWS[`${GEO}/s8x-odd-c`] = { "@id": `${GEO}/s8x-odd-c`, "@type": "t:Country", label: "Oddland", memberOf: `${GEO}/s8x-odd-up` };
    ROWS[`${GEO}/s8x-odd-up`] = { "@id": `${GEO}/s8x-odd-up`, "@type": "t:GeoAdminArea", label: "Above Oddland" };
    ROWS[`${GEO}/s8x-odd-h`] = { "@id": `${GEO}/s8x-odd-h`, "@type": "t:City", label: "Oddtown", memberOf: `${GEO}/s8x-odd-c` };
    const hit = (await getPlace(`${GEO}/s8x-odd-h`))!;
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(d.container).toEqual(["Oddland"]);
    expect(d.partial).toBe(false);
  });

  it("a parent that fails (502) degrades to kind-only and does not throw", async () => {
    ROWS[`${GEO}/s8x-down`] = { "@id": `${GEO}/s8x-down`, "@type": "t:City", label: "Downtown", memberOf: `${GEO}/s8x-gone` };
    failIds.add(`${GEO}/s8x-gone`);
    const hit = (await getPlace(`${GEO}/s8x-down`))!;
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(d.container).toEqual([]);
    expect(d.state).toBe("unavailable");
    expect(d.kind).toBe("city");
  });

  it("a parent larger than the ceiling (declared) is NOT read; the hit degrades to kind-only", async () => {
    ROWS[`${GEO}/s8x-big-h`] = { "@id": `${GEO}/s8x-big-h`, "@type": "t:Town", label: "Bigtown", memberOf: `${GEO}/s8x-big` };
    const base = globalThis.fetch;
    let cancelled = false;
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: unknown) => {
      if (String(input) === `${GEO}/s8x-big`) {
        return new Response(
          new ReadableStream({ pull(c) { c.enqueue(new TextEncoder().encode("x")); c.close(); }, cancel() { cancelled = true; } }),
          { status: 200, headers: { "content-length": String(PARENT_ROW_CEILING_BYTES + 1) } },
        );
      }
      return (base as unknown as (i: unknown, n?: unknown) => Promise<Response>)(input, init);
    }));
    const hit = (await getPlace(`${GEO}/s8x-big-h`))!;
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(d.state).toBe("unavailable");
    expect(d.container).toEqual([]);
    // The transfer is cancelled on the declared size: the body is never read.
    expect(cancelled).toBe(true);
  });

  it("a parent with no declared size that streams past the ceiling is cut off, not read to the end", async () => {
    ROWS[`${GEO}/s8x-st-h`] = { "@id": `${GEO}/s8x-st-h`, "@type": "t:Town", label: "Streamtown", memberOf: `${GEO}/s8x-stream` };
    const base = globalThis.fetch;
    let chunks = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: unknown) => {
      if (String(input) === `${GEO}/s8x-stream`) {
        const chunk = new TextEncoder().encode("a".repeat(256 * 1024));
        return new Response(
          new ReadableStream({ pull(c) { chunks++; if (chunks > 200) c.close(); else c.enqueue(chunk); } }),
          { status: 200 },
        );
      }
      return (base as unknown as (i: unknown, n?: unknown) => Promise<Response>)(input, init);
    }));
    const hit = (await getPlace(`${GEO}/s8x-st-h`))!;
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(d.state).toBe("unavailable");
    // 4 MiB of 256 KiB chunks is 16; allow a little read-ahead, but nowhere near the 200 offered.
    expect(chunks).toBeLessThan(40);
  });

  it("an aborted lookup reports nothing after the abort", async () => {
    const hit = await oslo("oslo");
    const ac = new AbortController();
    const seen: number[] = [];
    ac.abort();
    await describePlaceHits([hit], { signal: ac.signal, onUpdate: () => seen.push(1) }).catch(() => {});
    expect(seen).toEqual([]);
  });

  it("progress: the list can be drawn with kinds at once, and the container lands as it is read", async () => {
    const a = await oslo("oslo");
    const updates: string[][] = [];
    await describePlaceHits([a], { onUpdate: (m) => updates.push([...m.get(a.id)!.container]) });
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[updates.length - 1]).toEqual(["Norway"]);
  });
});

describe("two rows that are still identical are told apart (CHANGED: by their place in the list, never by an address tail)", () => {
  it("same name, same kind, same container: each carries its position among the twins; unlike rows carry none", async () => {
    ROWS[`${GEO}/s8x-twin-a`] = { "@id": `${GEO}/s8x-twin-a`, "@type": "t:Municipality", label: "Oslo", memberOf: `${GEO}/no` };
    ROWS[`${GEO}/s8x-twin-b`] = { "@id": `${GEO}/s8x-twin-b`, "@type": "t:Municipality", label: "Oslo", memberOf: `${GEO}/no` };
    const a = (await getPlace(`${GEO}/s8x-twin-a`))!;
    const b = (await getPlace(`${GEO}/s8x-twin-b`))!;
    const c = await oslo("oslo-admin");
    const out = await describePlaceHits([a, b, c]);
    expect(out.get(a.id)!.position).toEqual({ n: 1, of: 2 });
    expect(out.get(b.id)!.position).toEqual({ n: 2, of: 2 });
    // The admin area is "Oslo · region · Norway": already different from the municipality twins.
    expect(out.get(c.id)!.position).toBeNull();
    expect(placeHitLine(out.get(a.id)!)).toBe("municipality · in Norway · 1 of 2 with this name");
    expect(placeHitLine(out.get(b.id)!)).toBe("municipality · in Norway · 2 of 2 with this name");
  });

  it("no line carries an address or an id tail", async () => {
    ROWS[`${GEO}/s8x-twin-a`] = { "@id": `${GEO}/s8x-twin-a`, "@type": "t:Municipality", label: "Oslo", memberOf: `${GEO}/no` };
    ROWS[`${GEO}/s8x-twin-b`] = { "@id": `${GEO}/s8x-twin-b`, "@type": "t:Municipality", label: "Oslo", memberOf: `${GEO}/no` };
    const hits = [(await getPlace(`${GEO}/s8x-twin-a`))!, (await getPlace(`${GEO}/s8x-twin-b`))!];
    const out = await describePlaceHits(hits);
    for (const h of hits) {
      const line = placeHitLine(out.get(h.id)!);
      expect(line).not.toMatch(/s8x-twin|https?:|\/base\/e\/|entry/);
    }
  });

  it("the four live Oslo rows read apart without any position", async () => {
    const hits = await Promise.all(["oslo", "oslo-admin", "oslo-kommune", "oslo-township"].map(oslo));
    const out = await describePlaceHits(hits);
    const lines = hits.map((h) => `${h.label} | ${placeHitLine(out.get(h.id)!)}`);
    expect(new Set(lines).size).toBe(4);
    expect(lines).toContain("Oslo | municipality · in Norway");
    expect(lines).toContain("Oslo | region · in Norway");
    expect(lines).toContain("Oslo kommune | municipality · no containing place recorded");
    expect(lines).toContain("Oslo Township | municipality · in United States");
    for (const h of hits) expect(out.get(h.id)!.position).toBeNull();
  });
});

describe("F12: a container that was not read says so (CHANGED; GilbApp drew the kind alone)", () => {
  it("a parent that fails (502): the line says where it is not read, and is not the 'none recorded' line", async () => {
    ROWS[`${GEO}/s8x-down`] = { "@id": `${GEO}/s8x-down`, "@type": "t:City", label: "Downtown", memberOf: `${GEO}/s8x-gone` };
    failIds.add(`${GEO}/s8x-gone`);
    const hit = (await getPlace(`${GEO}/s8x-down`))!;
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(placeHitLine(d)).toBe("city · where: not read");
    expect(placeHitLine(d)).not.toMatch(/no containing place recorded/);
  });

  it("a hit past the fresh-read bound says it is not read, not that it has no container", async () => {
    const hits = [];
    for (let i = 1; i <= 5; i++) {
      ROWS[`${GEO}/s8x-par-${i}`] = { "@id": `${GEO}/s8x-par-${i}`, "@type": "t:Country", label: `Land ${i}` };
      ROWS[`${GEO}/s8x-h-${i}`] = { "@id": `${GEO}/s8x-h-${i}`, "@type": "t:City", label: "Springfield", memberOf: `${GEO}/s8x-par-${i}` };
      hits.push((await getPlace(`${GEO}/s8x-h-${i}`))!);
    }
    const out = await describePlaceHits(hits);
    const lines = hits.map((h) => placeHitLine(out.get(h.id)!));
    expect(lines.filter((l) => l.startsWith("city · where: not read"))).toHaveLength(2);
    expect(lines.filter((l) => /^city · in Land \d/.test(l))).toHaveLength(MAX_FRESH_PARENT_READS);
  });

  it("a chain cut by the hop limit names what it read and says that further up is not read", async () => {
    ROWS[`${GEO}/s8x-l0`] = { "@id": `${GEO}/s8x-l0`, "@type": "t:City", label: "Lowtown", memberOf: `${GEO}/s8x-l1` };
    ROWS[`${GEO}/s8x-l1`] = { "@id": `${GEO}/s8x-l1`, "@type": "t:GeoAdminArea", label: "County L", memberOf: `${GEO}/s8x-l2` };
    ROWS[`${GEO}/s8x-l2`] = { "@id": `${GEO}/s8x-l2`, "@type": "t:GeoAdminArea", label: "State L", memberOf: `${GEO}/s8x-l3` };
    ROWS[`${GEO}/s8x-l3`] = { "@id": `${GEO}/s8x-l3`, "@type": "t:Country", label: "Landl" };
    const hit = (await getPlace(`${GEO}/s8x-l0`))!;
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(placeHitLine(d)).toBe("city · in County L, State L · and further up: not read");
  });

  it("a parent outside the catalogue is not asked for and reads as not read", async () => {
    ROWS[`${GEO}/s8x-foreign`] = { "@id": `${GEO}/s8x-foreign`, "@type": "t:City", label: "Foreigntown", memberOf: "https://evil.example/base/e/x" };
    const hit = (await getPlace(`${GEO}/s8x-foreign`))!;
    clearCalls();
    const d = (await describePlaceHits([hit])).get(hit.id)!;
    expect(placeHitLine(d)).toBe("city · where: not read");
    expect(calls.filter((c) => c.url.startsWith("https://evil.example"))).toEqual([]);
    expect(GEO_ORIGIN).toBeTruthy();
  });
});
