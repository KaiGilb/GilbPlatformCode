// Reading a vault's addresses. Ported from GilbApp (commit a703b3ed), over the fake platform at the level of `fetch` (the source mocked the app's record client):
//   `placeClaim.c214e6.test.ts`, "read" (3 of 4: the round trip writes, so it is the write unit's), `placeAddressLines.c214.test.ts` (the line read as a field claim; one
//   record holds one field; the lines never reach a find surface), `placePostalCode.c214.test.ts` (the postal code is the fourth row; "0150" with its zero;
//   the heading with no Location; no find route), `placeListBodies.m3f.test.ts` (the whole read takes the listed documents).
// The cases that WRITE an address (create, change, remove, the facts of a field claim) are the unit `place-claim-write`'s.
// The rest is new: F4 and F5, and that the unit only reads.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_LIST_PAGES, VaultListingCappedError } from "@kaigilb/gilbplatformcode-vault-records-of-type";
import { claimPlaceIds, isDecomposed, needsFieldMigration } from "@kaigilb/gilbplatformcode-place-lines";
import { __resetPlaceVocab, resolvePlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import {
  PLACE_CLAIMS_STALE_MS,
  PLACE_FIELD_SLOTS,
  PLACE_TEXT_SLOTS,
  claimFieldText,
  claimsAbout,
  listPlaceClaimsInVault,
  placeClaimHasContent,
  placeClaimHeading,
  placeClaimsKey,
  toPlaceFieldClaim,
  type PlaceClaim,
  type PlaceClaimInput,
} from "./index";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => {
  const labels: Record<string, string> = { addressLine1: "Address 1", addressLine2: "Address 2", postalCode: "Postal Code" };
  return {
    attributeSpelling: vi.fn(async (name: string) => name),
    typeSpelling: vi.fn(async (name: string) => `t:${name}`),
    attributeLabel: vi.fn(async (name: string) => labels[name] ?? null),
  };
});

const { VAULT, store } = fake;
const RECORD = `${VAULT}/e/06gkperson0000000000000001`;
const OTHER = `${VAULT}/e/06gkperson0000000000000002`;
const PRINCIPAL = "https://kai.platform.example.test/base/i";
const GEO = "https://geo.example.test/base/e";
const NORWAY = `${GEO}/no`;
const OSLO = `${GEO}/oslo`;
const NONE = { city: null, region: null, country: null };
const everyWrite: string[] = [];

beforeEach(() => {
  fake.resetStore();
  __resetPlaceVocab();
  setUp();
});
afterEach(() => {
  everyWrite.push(...fake.writes.map((w) => `${w.method} ${w.url}`));
  tearDown();
});
afterAll(() => expect(everyWrite).toEqual([])); // the world-level proof: this unit only ever reads

/** An address as MyNet's own writer stores it (with its rung), about `subject`. */
function mynetAddress(subject: string, label: string, street: string, placeIds: string[]): string {
  const id = fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": subject }, "a:placeClaimLabel": label, "a:visibilityTier": "private", "a:directReader": PRINCIPAL });
  const uri = `${VAULT}/e/${id}`;
  if (street) fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": subject }, "a:detailOf": { "@id": uri }, "a:streetLine": street, "a:visibilityTier": "private" });
  for (const p of placeIds) fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": subject }, "a:detailOf": { "@id": uri }, "a:claimPlace": { "@id": p }, "a:visibilityTier": "pers-inner" });
  return id;
}
/** An address as GilbApp's writer stores it: no rung, a field claim per line, each with the reader grant. */
function gilbAddress(subject: string, label: string, fields: Record<string, string>, placeIds: string[] = []): string {
  const id = fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": subject }, ...(label ? { "a:placeClaimLabel": label } : {}), "a:directReader": PRINCIPAL });
  const uri = `${VAULT}/e/${id}`;
  for (const [k, v] of Object.entries(fields)) fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": subject }, "a:detailOf": { "@id": uri }, [`a:${k}`]: v, "a:directReader": PRINCIPAL });
  for (const p of placeIds) fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": subject }, "a:detailOf": { "@id": uri }, "a:claimPlace": { "@id": p }, "a:directReader": PRINCIPAL });
  return id;
}
const read = async () => claimsAbout(await listPlaceClaimsInVault(VAULT), RECORD);
const input = (over: Partial<PlaceClaimInput>): PlaceClaimInput => ({ label: "", streetLine: "", addressLine1: "", addressLine2: "", postalCode: "", place: NONE, ...over });

describe("read — what MyNet wrote, and only this record's (ported)", () => {
  it("groups each field on its composite, keeps only the claims about this record, in creation order", async () => {
    const home = mynetAddress(RECORD, "home", "Storgata 1", [NORWAY, OSLO]);
    mynetAddress(OTHER, "work", "Elsewhere 2", [NORWAY]);
    const cabin = mynetAddress(RECORD, "cabin", "", [NORWAY]);
    // Amend the oldest so the store lists it first (Base: last write first) — the order must not move.
    store.get(home)!.seq = 999;
    const mine = await read();
    expect(mine.map((c) => c.id)).toEqual([home, cabin]);
    expect(mine.map((c) => c.label)).toEqual(["home", "cabin"]);
    expect(claimFieldText(mine[0]!, "streetLine")).toBe("Storgata 1");
    expect(claimPlaceIds(mine[0]!).sort()).toEqual([NORWAY, OSLO].sort());
    expect(claimFieldText(mine[1]!, "streetLine")).toBe("");
    expect(claimPlaceIds(mine[1]!)).toEqual([NORWAY]);
  });

  it("the subject is matched by opaque id, whatever spelling the reference carries (base:e/, /vault/e/)", async () => {
    fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": "base:e/06gkperson0000000000000001" }, "a:placeClaimLabel": "compact" });
    fake.seed("t:PlaceClaim", { "a:claimSubject": "https://hytta.platform.example.test/vault/e/06gkperson0000000000000001", "a:placeClaimLabel": "vault" });
    expect((await read()).map((c) => c.label)).toEqual(["compact", "vault"]);
  });

  it("a legacy composite (street and places ON the composite) is read through the derived accessors", async () => {
    fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": "old", "a:streetLine": "Gamleveien 3", "a:memberOf": [{ "@id": NORWAY }] });
    const [old] = await read();
    expect(claimFieldText(old!, "streetLine")).toBe("Gamleveien 3");
    expect(claimPlaceIds(old!)).toEqual([NORWAY]);
    expect(needsFieldMigration(old!)).toBe(true);
    expect(isDecomposed(old!)).toBe(false);
  });

  it("an address as GilbApp writes it reads back as the same address (seeded as the writer stores it)", async () => {
    const id = gilbAddress(RECORD, "home", { streetLine: "Storgata 1" }, [NORWAY, OSLO]);
    const [c] = await read();
    expect(c!.id).toBe(id);
    expect(c!.label).toBe("home");
    expect(claimFieldText(c!, "streetLine")).toBe("Storgata 1");
    expect(claimPlaceIds(c!).sort()).toEqual([NORWAY, OSLO].sort());
    expect(isDecomposed(c!)).toBe(true);
    expect(c!.hiddenFieldCount).toBe(0);
  });
});

describe("the lines (ported: placeAddressLines)", () => {
  it("the free-text slots are ONE table: street, then Address 1, then Address 2, then Postal Code (the fourth row)", () => {
    expect(PLACE_TEXT_SLOTS.map((r) => r.term)).toEqual(["streetLine", "addressLine1", "addressLine2", "postalCode"]);
    expect(PLACE_FIELD_SLOTS).toContain("postal");
  });

  it("🔴 a record holding ONLY a line is read, not dropped", async () => {
    const v = await resolvePlaceVocab();
    const f = toPlaceFieldClaim("f", `${VAULT}/e/f`, { detailOf: { "@id": `${VAULT}/e/c` }, addressLine2: "PO Box 12" }, null, v);
    expect(f).not.toBeNull();
    expect(f!.subject).toBe("line2");
    expect(f!.addressLine2).toBe("PO Box 12");
  });

  it("🔴 a stored record holding a street AND a line is not read as either (kept as an 'unknown' child)", async () => {
    const v = await resolvePlaceVocab();
    const doc = { detailOf: { "@id": `${VAULT}/e/c` }, streetLine: "Storgata 1", addressLine1: "c/o Hansen" };
    expect(toPlaceFieldClaim("f", `${VAULT}/e/f`, doc, null, v)?.subject).toBe("unknown");
  });

  it("a field record that names an address but carries no field at all is read as 'unknown', never as a field", async () => {
    const v = await resolvePlaceVocab();
    const f = toPlaceFieldClaim("f", `${VAULT}/e/f`, { detailOf: { "@id": `${VAULT}/e/c` } }, null, v);
    expect(f?.subject).toBe("unknown");
    expect(f?.placeId).toBeNull();
  });

  it("a field record with no a:detailOf is not an address field", async () => {
    const v = await resolvePlaceVocab();
    expect(toPlaceFieldClaim("f", `${VAULT}/e/f`, { givenName: "Kai" }, null, v)).toBeNull();
  });

  it("each text line reads back from its own field claim, all four, and a line that is absent is ''", async () => {
    gilbAddress(RECORD, "home", { streetLine: "Storgata 1", addressLine1: "c/o Hansen", postalCode: "0150" });
    const [c] = await read();
    expect([c!.fields.length, claimFieldText(c!, "addressLine1"), claimFieldText(c!, "addressLine2"), claimFieldText(c!, "postalCode")]).toEqual([3, "c/o Hansen", "", "0150"]);
  });
});

describe("the postal code (ported: placePostalCode)", () => {
  it("🔴 '0150' is read as the STRING it was stored as, leading zero and all", async () => {
    gilbAddress(RECORD, "home", { postalCode: "0150" });
    const [c] = await read();
    expect(claimFieldText(c!, "postalCode")).toBe("0150");
    expect(typeof claimFieldText(c!, "postalCode")).toBe("string");
  });

  it("a stored record holding only '0150' is read (not dropped), and two fields on one record are read as 'unknown'", async () => {
    const v = await resolvePlaceVocab();
    const doc = { detailOf: { "@id": `${VAULT}/e/c` }, postalCode: "0150" };
    const f = toPlaceFieldClaim("f", `${VAULT}/e/f`, doc, null, v);
    expect(f?.subject).toBe("postal");
    expect(f?.postalCode).toBe("0150");
    expect(toPlaceFieldClaim("f", `${VAULT}/e/f`, { ...doc, streetLine: "Storgata 1" }, null, v)?.subject).toBe("unknown");
  });

  it("an address with ONLY a postal code is content; spaces are not", () => {
    expect(placeClaimHasContent(input({ postalCode: "0150" }))).toBe(true);
    expect(placeClaimHasContent(input({ postalCode: "   " }))).toBe(false);
    expect(placeClaimHasContent(input({ label: "home" }))).toBe(true);
    expect(placeClaimHasContent(input({ place: { ...NONE, country: { id: NORWAY, label: "Norway", type: "Country", memberOf: [] } } }))).toBe(true);
    expect(placeClaimHasContent(input({}))).toBe(false);
  });

  it("the heading with no Location: Street → Address 1 → Address 2 → Postal Code", async () => {
    gilbAddress(RECORD, "", { postalCode: "0150" });
    gilbAddress(RECORD, "", { addressLine2: "PO Box 12", postalCode: "0150" });
    gilbAddress(RECORD, "", { streetLine: "Storgata 1", addressLine1: "c/o Hansen", addressLine2: "B", postalCode: "0150" });
    gilbAddress(RECORD, "home", { streetLine: "Storgata 1" });
    expect((await read()).map(placeClaimHeading)).toEqual(["0150", "PO Box 12", "Storgata 1", "home"]);
  });

  it("a postal-only address carries no place reference and no membership", async () => {
    gilbAddress(RECORD, "", { postalCode: "0150" });
    const [c] = await read();
    expect(claimPlaceIds(c!)).toEqual([]);
    for (const e of store.values()) {
      expect(Object.keys(e.facts)).not.toContain("a:claimPlace");
      expect(Object.keys(e.facts)).not.toContain("a:memberOf");
    }
  });
});

describe("no find or connect route (ported)", () => {
  it("🔴 reading an address with lines and a postal code sends nothing to a find, search or connect route", async () => {
    gilbAddress(RECORD, "home", { streetLine: "Storgata 1", addressLine1: "c/o Hansen", postalCode: "0150" }, [NORWAY]);
    await read();
    expect(fake.calls.filter((c) => /connect|search|find/i.test(c.url))).toEqual([]);
    expect(fake.calls.some((c) => c.url.includes("0150"))).toBe(false);
  });
});

describe("M3f r5 · the whole read takes the listed documents, not one read per record (ported)", () => {
  it("bodies on the listing: no record is read again, and the addresses are the same as when each is read", async () => {
    gilbAddress(RECORD, "home", { streetLine: "Storgata 1" }, [NORWAY]);
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": PRINCIPAL }, "a:givenName": "Kai" }, "nc-given");
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": PRINCIPAL }, "a:familyName": "Gilb" }, "nc-family");
    fake.door.bodies = false;
    const byReads = await listPlaceClaimsInVault(VAULT);
    expect(fake.recordReads().length).toBeGreaterThan(0);
    fake.calls.length = 0;
    fake.door.bodies = true;
    const byBodies = await listPlaceClaimsInVault(VAULT);
    expect(fake.recordReads()).toEqual([]);
    expect(fake.listReads().length).toBeGreaterThan(0);
    expect(fake.listReads().every((c) => c.url.includes("include=body"))).toBe(true);
    expect(byBodies).toEqual(byReads);
  });

  it("the whole vault's addresses are listed (two typed listings: the addresses and the field claims), not per person", async () => {
    gilbAddress(RECORD, "a", { streetLine: "x" });
    gilbAddress(OTHER, "b", { streetLine: "y" });
    await read();
    expect(fake.listReads().map((c) => new URL(c.url).searchParams.get("type")).sort()).toEqual(["PlaceClaim", "SelfAssertedFieldClaim"]);
  });
});

describe("F4: not every address was read — said, not silent", () => {
  it(`more than ${MAX_LIST_PAGES} pages of addresses: the read throws VaultListingCappedError (GilbApp showed the first ${MAX_LIST_PAGES} pages as the whole)`, async () => {
    for (let i = 0; i < MAX_LIST_PAGES + 5; i += 1) fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": `a${i}` });
    fake.door.pageSize = 1;
    const err = await listPlaceClaimsInVault(VAULT).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(VaultListingCappedError);
    expect((err as VaultListingCappedError).vaultId).toBe(VAULT);
    expect((err as VaultListingCappedError).message).toMatch(/Not every record in this vault was read/);
  });

  it("the same when it is the FIELD claims that run past the ceiling", async () => {
    gilbAddress(RECORD, "home", { streetLine: "Storgata 1" });
    for (let i = 0; i < MAX_LIST_PAGES + 5; i += 1) fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": RECORD }, "a:detailOf": { "@id": `${VAULT}/e/x` }, "a:streetLine": `s${i}` });
    fake.door.pageSize = 1;
    // the addresses listing has 1 record (1 page); the field claims have 51+ (one per page)
    await expect(listPlaceClaimsInVault(VAULT)).rejects.toBeInstanceOf(VaultListingCappedError);
  });

  it("a vault that fits is read whole, with no error", async () => {
    for (let i = 0; i < 5; i += 1) gilbAddress(RECORD, `a${i}`, { streetLine: `s${i}` });
    fake.door.pageSize = 2;
    expect(await read()).toHaveLength(5);
  });
});

describe("F5: a field left out is counted, not just warned about", () => {
  it("a field that points here but is about someone else is not shown with this address, and is counted", async () => {
    const id = gilbAddress(RECORD, "home", { streetLine: "Storgata 1" });
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": OTHER }, "a:detailOf": { "@id": `${VAULT}/e/${id}` }, "a:addressLine1": "someone else's line" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const [c] = await read();
    expect(c!.fields.map((f) => f.subject)).toEqual(["street"]);
    expect(claimFieldText(c!, "addressLine1")).toBe("");
    expect(c!.hiddenFieldCount).toBe(1);
    expect(warn).not.toHaveBeenCalled(); // not a warn-only path any more
    warn.mockRestore();
  });

  it("a field whose subject cannot be read is hidden and counted (it fails closed)", async () => {
    const id = gilbAddress(RECORD, "home", { streetLine: "Storgata 1" });
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@value": "??" }, "a:detailOf": { "@id": `${VAULT}/e/${id}` }, "a:postalCode": "0150" });
    const [c] = await read();
    expect(claimFieldText(c!, "postalCode")).toBe("");
    expect(c!.hiddenFieldCount).toBe(1);
  });

  it("a field about the same record under another spelling of its address belongs, and is not counted", async () => {
    const id = gilbAddress(RECORD, "home", { streetLine: "Storgata 1" });
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": "base:e/06gkperson0000000000000001" }, "a:detailOf": { "@id": `base:e/${id}` }, "a:postalCode": "0150" });
    const [c] = await read();
    expect(claimFieldText(c!, "postalCode")).toBe("0150");
    expect(c!.hiddenFieldCount).toBe(0);
  });

  it("two hidden fields are counted as two, and each address counts its own", async () => {
    const a = gilbAddress(RECORD, "a", { streetLine: "x" });
    const b = gilbAddress(RECORD, "b", { streetLine: "y" });
    for (const k of ["a:addressLine1", "a:addressLine2"]) fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": OTHER }, "a:detailOf": { "@id": `${VAULT}/e/${a}` }, [k]: "z" });
    const mine = await read();
    expect(mine.find((c) => c.id === a)!.hiddenFieldCount).toBe(2);
    expect(mine.find((c) => c.id === b)!.hiddenFieldCount).toBe(0);
  });
});

describe("claimsAbout, the key, the pure reads", () => {
  it("claimsAbout keeps order, takes nothing for an empty subject, and compares by opaque id", () => {
    const mk = (id: string, ...subjects: string[]): PlaceClaim => ({ id, uri: id, label: "", streetLine: "", memberOf: [], fields: [], subjects, hiddenFieldCount: 0, etag: null });
    const all = [mk("a", RECORD), mk("b", OTHER), mk("c", `${VAULT}/vault/e/06gkperson0000000000000001`), mk("d")];
    expect(claimsAbout(all, RECORD).map((c) => c.id)).toEqual(["a", "c"]);
    expect(claimsAbout(all, "")).toEqual([]);
  });

  it("the key and the freshness are the shared read's", () => {
    expect(placeClaimsKey("v")).toEqual(["mynet", "place-claims", "v"]);
    expect(PLACE_CLAIMS_STALE_MS).toBe(60_000);
  });

  it("no vault, no read: [] and no request", async () => {
    expect(await listPlaceClaimsInVault("")).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it("an address with no label and no lines has an empty heading", async () => {
    gilbAddress(RECORD, "", {}, [NORWAY]);
    const [c] = await read();
    expect(placeClaimHeading(c!)).toBe("");
  });
});
