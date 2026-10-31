// The listing. Cases 1-3 are ported from GilbApp `placeListBodies.m3f.test.ts` (commit a703b3ed): the same three cases against the unit, over the fake
// platform at the level of `fetch` (the source mocked the app's list function). The rest is new: F4 (the page ceiling is SAID), the boundary of the
// ceiling, `getListedResource`, and that the unit only reads.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_LIST_PAGES, getListedResource, listRecordsOfType as list } from "./index";

// The listing answers { records, complete, reason? }. These helpers read the records, as the ported cases did when it answered the array.
const listRecordsOfType = async (vault: string, type: string) => (await list(vault, type)).records;
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";

const { VAULT } = fake;
const RECORD = `${VAULT}/e/06gkperson0000000000000001`;
const everyWrite: string[] = [];

beforeEach(() => {
  fake.resetStore();
  setUp();
});
afterEach(() => {
  everyWrite.push(...fake.writes.map((w) => `${w.method} ${w.url}`));
  tearDown();
});
afterAll(() => expect(everyWrite).toEqual([])); // the world-level proof: this unit only ever reads

const seedClaims = (count: number) => {
  for (let i = 0; i < count; i += 1) fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": `a${i}` });
};

describe("M3f r5 · the listing takes the listed documents, not one read per record", () => {
  it("bodies on the listing: no record is read again, and the references are the same as when each is read", async () => {
    seedClaims(3);
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": RECORD }, "a:givenName": "Kai" }, "nc-given");
    fake.door.bodies = false;
    const byReads = await listRecordsOfType(VAULT, "PlaceClaim");
    for (const ref of byReads) await getListedResource(ref, VAULT);
    expect(fake.recordReads().length).toBe(3);
    expect(byReads.every((r) => r.read === undefined)).toBe(true);

    fake.calls.length = 0;
    fake.door.bodies = true;
    const byBodies = await listRecordsOfType(VAULT, "PlaceClaim");
    const docs = await Promise.all(byBodies.map((r) => getListedResource(r, VAULT)));
    expect(fake.recordReads()).toEqual([]);
    expect(fake.listReads().every((c) => c.url.includes("include=body"))).toBe(true);
    expect(byBodies.map((r) => r.entity)).toEqual(byReads.map((r) => r.entity));
    expect(docs.map((d) => d.doc.placeClaimLabel)).toEqual(["a2", "a1", "a0"]);
  });
});

describe("M3f r6 · N23: a body page whose rows were all dropped is not the end", () => {
  it("records [] but not complete, with a next offset: the listing reads on and finds the record behind it", async () => {
    const row = { entity: `${VAULT}/e/pc9`, typeUri: "t:PlaceClaim", updatedAt: null, label: null, body: { "@id": `${VAULT}/e/pc9`, "@type": "t:PlaceClaim", placeClaimLabel: "home" }, etag: '"1"' };
    fake.door.pages = (offset) =>
      offset === 0
        ? { records: [], total: 2, complete: false, pageSize: 1, offset: 0, nextOffset: 1 }
        : { records: [row], total: 2, complete: true, pageSize: 1, offset: 1, nextOffset: null };
    const refs = await listRecordsOfType(VAULT, "PlaceClaim");
    expect(refs.map((r) => r.entity)).toEqual([`${VAULT}/e/pc9`]);
  });
});

describe("M3f r7 · X19: a door that names the same offset again does not hold the listing in a loop (CHANGED: and says it stalled)", () => {
  it("not complete, nextOffset = this page's own offset: the listing stops after that page and says `stalled`, never a quiet end", async () => {
    let asked = 0;
    fake.door.pages = (offset) => {
      asked += 1;
      if (asked > 5) throw new Error("looped");
      return { records: [], total: 9, complete: false, pageSize: 1, offset, nextOffset: offset };
    };
    const listing = await list(VAULT, "PlaceClaim");
    expect(asked).toBe(1);
    expect(listing).toEqual({ records: [], complete: false, reason: "stalled" });
  });

  it("a stalled door keeps the records it did send", async () => {
    const row = (i: number) => ({ entity: `${VAULT}/e/r${i}`, typeUri: "t:PlaceClaim", updatedAt: null, label: null, body: { "@id": `${VAULT}/e/r${i}`, "@type": "t:PlaceClaim" }, etag: '"1"' });
    fake.door.pages = (offset) => (offset === 0 ? { records: [row(0), row(1)], total: 9, complete: false, pageSize: 2, offset: 0, nextOffset: 2 } : { records: [row(2)], total: 9, complete: false, pageSize: 2, offset, nextOffset: offset });
    const listing = await list(VAULT, "PlaceClaim");
    expect(listing).toMatchObject({ complete: false, reason: "stalled" });
    expect(listing.records.map((r) => r.entity)).toEqual([`${VAULT}/e/r0`, `${VAULT}/e/r1`, `${VAULT}/e/r2`]);
  });

  it("an empty page that is not the last and names no next offset cannot advance either: `stalled`", async () => {
    fake.door.pages = (offset) => ({ total: 9, complete: false, pageSize: 1, offset, records: [] });
    expect(await list(VAULT, "PlaceClaim")).toEqual({ records: [], complete: false, reason: "stalled" });
  });
});

describe("F4: the page ceiling is said, and what was read is kept", () => {
  it(`more than ${MAX_LIST_PAGES} pages: the listing answers the ${MAX_LIST_PAGES} pages it read with complete false and reason capped (GilbApp returned them as the whole)`, async () => {
    expect(MAX_LIST_PAGES).toBe(50);
    seedClaims(MAX_LIST_PAGES + 10);
    fake.door.pageSize = 1;
    const listing = await list(VAULT, "PlaceClaim");
    expect(listing).toMatchObject({ complete: false, reason: "capped" });
    expect(listing.records).toHaveLength(MAX_LIST_PAGES); // what was read is not thrown away
    expect(fake.listReads()).toHaveLength(MAX_LIST_PAGES); // and no page past the ceiling was asked for
  });

  it("exactly the ceiling's worth of pages, the last one complete: complete true, no reason", async () => {
    seedClaims(MAX_LIST_PAGES);
    fake.door.pageSize = 1;
    const listing = await list(VAULT, "PlaceClaim");
    expect(listing.records).toHaveLength(MAX_LIST_PAGES);
    expect(listing).toMatchObject({ complete: true });
    expect("reason" in listing).toBe(false);
  });

  it("a door that never says complete and pages by the rows it sent (no next offset) is capped and kept as well", async () => {
    fake.door.pages = (offset) => ({
      total: 9999,
      complete: false,
      pageSize: 1,
      offset,
      records: [{ entity: `${VAULT}/e/r${offset}`, typeUri: "t:PlaceClaim", updatedAt: null, label: null }],
    });
    const listing = await list(VAULT, "PlaceClaim");
    expect(listing).toMatchObject({ complete: false, reason: "capped" });
    expect(listing.records).toHaveLength(MAX_LIST_PAGES);
    expect(fake.listReads()).toHaveLength(MAX_LIST_PAGES);
  });

  it("a short listing is complete", async () => {
    seedClaims(2);
    expect(await list(VAULT, "PlaceClaim")).toMatchObject({ complete: true });
    expect((await list(VAULT, "PlaceClaim")).records).toHaveLength(2);
  });
});

describe("listRecordsOfType / getListedResource", () => {
  it("lists only the records of the type asked, in the vault asked, newest write first, and asks for the bodies", async () => {
    seedClaims(2);
    fake.seed("t:SelfAssertedFieldClaim", { "a:streetLine": "x" });
    fake.seed("t:PlaceClaim", { "a:placeClaimLabel": "elsewhere" }, undefined, "https://other.platform.example.test/base");
    const refs = await listRecordsOfType(VAULT, "PlaceClaim");
    expect(refs).toHaveLength(2);
    expect(fake.listReads()[0]!.url).toContain("type=PlaceClaim");
    expect(fake.listReads()[0]!.url).toContain("include=body");
  });

  it("a listed record without a document is read once, at its own address; a record that is gone is `gone`", async () => {
    const id = fake.seed("t:PlaceClaim", { "a:placeClaimLabel": "home" });
    const read = await getListedResource({ entity: `${VAULT}/e/${id}`, typeUri: "t:PlaceClaim" }, VAULT);
    expect(read.gone).toBe(false);
    expect(read.doc.placeClaimLabel).toBe("home");
    expect(fake.recordReads()).toHaveLength(1);
    const gone = await getListedResource({ entity: `${VAULT}/e/nope`, typeUri: "t:PlaceClaim" }, VAULT);
    expect(gone).toMatchObject({ gone: true, doc: {} });
  });

  it("a listed record that carries its document is not read", async () => {
    const doc = { doc: { a: 1 }, etag: '"1"', gone: false };
    expect(await getListedResource({ entity: `${VAULT}/e/x`, typeUri: "t", read: doc }, VAULT)).toBe(doc);
    expect(fake.recordReads()).toEqual([]);
  });
});
