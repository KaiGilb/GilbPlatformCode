// Writing an address. Ported from GilbApp (commit a703b3ed), over the fake platform at the level of `fetch` (the source mocked the app's record client):
//   `placeClaim.c214e6.test.ts` "write" and "change and remove" (7 of the 9 cases),
//   `placeAddressLines.c214.test.ts` ("clearing one line keeps the other line and the address", 3; "one field record holds exactly one field", the write half),
//   `placePostalCode.c214.test.ts` ('0150' round-trips; clearing the postal code; an address with only a postal code, the write half),
//   `AddressRows.reviewFixes.c214.test.tsx` the library-level cases (N2, R1 S1-S4, F3, F4 and Q2's remove), which the source drove through the card.
// The cases of the card itself (the add form, Close, the double-save guard) are `place-claims-card`'s, a later batch. The CHANGED cases say so.
// The wire of the amend (decision 6) and the geo fence are in `wire.test.ts` and `geoFence.test.ts`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceVocabUnavailableError } from "@kaigilb/gilbplatformcode-place-vocab";
import { EMPTY_ADDRESS_MESSAGE, claimFieldText, claimsAbout, listPlaceClaimsInVault } from "@kaigilb/gilbplatformcode-place-claims";
import { claimPlaceIds } from "@kaigilb/gilbplatformcode-place-lines";
import { PlaceClaimPartialError, PlaceClaimRefusal, createPlaceClaim, removePlaceClaim, updatePlaceClaim, placeFieldClaimFacts } from "./index";
import * as fake from "../test/fakePlaceStore";
import { NONE, NORWAY, OSLO, OTHER, PRINCIPAL, RECORD, VAULT, VIKEN, freshRead, input, ofType, store, useWorld } from "../test/world";
import { PlaceClaimError } from "@kaigilb/gilbplatformcode-place-claims";
import { resolvePlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => {
  const labels: Record<string, string> = { addressLine1: "Address 1", addressLine2: "Address 2", postalCode: "Postal Code" };
  return {
    attributeSpelling: vi.fn(async (name: string) => name),
    typeSpelling: vi.fn(async (name: string) => `t:${name}`),
    attributeLabel: vi.fn(async (name: string) => labels[name] ?? null),
  };
});

useWorld();
const posts = () => fake.writes.filter((w) => w.method === "POST");
const patches = () => fake.writes.filter((w) => w.method === "PATCH");
const deletes = () => fake.writes.filter((w) => w.method === "DELETE");
const idOf = (url: string) => url.slice(url.lastIndexOf("/") + 1);

describe("write — MyNet's shapes, about the person's record (ported)", () => {
  it("one composite + one field claim per field; subject = the record; detailOf = the composite; directReader at mint", async () => {
    const out = await createPlaceClaim(VAULT, RECORD, { label: " home ", streetLine: "Storgata 1", place: { city: OSLO, region: null, country: NORWAY } }, PRINCIPAL);
    const [composite] = ofType("t:PlaceClaim");
    expect(composite![0]).toBe(out.id);
    expect(composite![1].facts).toEqual({ "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": "home", "a:directReader": PRINCIPAL });
    const compositeUri = `${VAULT}/e/${out.id}`;
    expect(out.uri).toBe(compositeUri);
    // MyNet's field order: street, then coarse→fine (country, region, city).
    const fields = ofType("t:SelfAssertedFieldClaim").map(([, e]) => e.facts);
    expect(fields).toEqual([
      { "a:claimSubject": { "@id": RECORD }, "a:detailOf": { "@id": compositeUri }, "a:streetLine": "Storgata 1", "a:directReader": PRINCIPAL },
      { "a:claimSubject": { "@id": RECORD }, "a:detailOf": { "@id": compositeUri }, "a:claimPlace": { "@id": NORWAY.id }, "a:directReader": PRINCIPAL },
      { "a:claimSubject": { "@id": RECORD }, "a:detailOf": { "@id": compositeUri }, "a:claimPlace": { "@id": OSLO.id }, "a:directReader": PRINCIPAL },
    ]);
    expect(out.fieldIds).toHaveLength(3);
  });

  it("⛔ no rung (`a:visibilityTier`) on any entity — a rung on a claim about another party would lock its author out", async () => {
    await createPlaceClaim(VAULT, RECORD, { label: "home", streetLine: "x", place: { city: null, region: null, country: NORWAY } }, PRINCIPAL);
    for (const [, e] of store) expect(Object.keys(e.facts).some((k) => /visibilityTier/.test(k))).toBe(false);
  });

  it("an empty street mints no street field (MyNet: an empty field claim is a fact nobody stated)", async () => {
    await createPlaceClaim(VAULT, RECORD, { label: "cabin", streetLine: "  ", place: { city: null, region: null, country: NORWAY } });
    expect(ofType("t:SelfAssertedFieldClaim").map(([, e]) => Object.keys(e.facts).sort())).toEqual([["a:claimPlace", "a:claimSubject", "a:detailOf"]]);
  });

  it("a term the master does not answer writes NOTHING (no request to the vault at all)", async () => {
    const slots = await import("@kaigilb/gilbplatformcode-term-slots");
    vi.mocked(slots.attributeSpelling).mockImplementationOnce(async () => null as unknown as string);
    await expect(createPlaceClaim(VAULT, RECORD, { label: "home", streetLine: "", place: { city: null, region: null, country: NORWAY } })).rejects.toBeInstanceOf(PlaceVocabUnavailableError);
    expect(store.size).toBe(0);
    expect(fake.writes).toEqual([]);
  });

  it("an address with no content, no vault, no subject is refused before any request", async () => {
    await expect(createPlaceClaim(VAULT, RECORD, input({}))).rejects.toBeInstanceOf(PlaceClaimError);
    await expect(createPlaceClaim("", RECORD, input({ label: "x" }))).rejects.toBeInstanceOf(PlaceClaimError);
    await expect(createPlaceClaim(VAULT, "", input({ label: "x" }))).rejects.toBeInstanceOf(PlaceClaimError);
    expect(fake.calls).toEqual([]);
  });
});

describe("change and remove — each write names the entity's own address (MyNet N4), siblings untouched (ported)", () => {
  async function stored() {
    await createPlaceClaim(VAULT, RECORD, { label: "home", streetLine: "Storgata 1", place: { city: OSLO, region: null, country: NORWAY } }, PRINCIPAL);
    const [c] = await freshRead();
    fake.calls.length = 0;
    fake.writes.length = 0;
    return c!;
  }

  it("changing the street patches the street field only (the label did not change), at its own URI (CHANGED: GilbApp also patched the composite)", async () => {
    const c = await stored();
    const street = c.fields.find((f) => f.subject === "street")!;
    await updatePlaceClaim(VAULT, c, RECORD, { label: "home", streetLine: "Storgata 2", place: { city: OSLO, region: null, country: NORWAY } });
    expect(patches().map((w) => w.url)).toEqual([`${VAULT.replace("/base", "")}/lws/r/${street.id}`]);
    expect(patches()[0]!.body).toEqual({ "a:streetLine": "Storgata 2" });
    expect(store.get(street.id)!.facts["a:streetLine"]).toBe("Storgata 2");
    expect(posts()).toEqual([]);
    expect(deletes()).toEqual([]);
  });

  it("clearing the street retracts that field; picking a region mints one; the rest stays byte-untouched", async () => {
    const c = await stored();
    const street = c.fields.find((f) => f.subject === "street")!;
    await updatePlaceClaim(VAULT, c, RECORD, { label: "home", streetLine: "", place: { city: OSLO, region: VIKEN, country: NORWAY } });
    expect(deletes().map((w) => idOf(w.url))).toEqual([street.id]);
    expect(posts()).toHaveLength(1);
    const body = posts()[0]!.body as { type: string; facts: Record<string, unknown> };
    expect(body.facts).toEqual({ "a:claimSubject": { "@id": RECORD }, "a:detailOf": { "@id": c.uri }, "a:claimPlace": { "@id": VIKEN.id } });
    expect(patches()).toEqual([]);
  });

  it("remove: each field first, then the composite, each at its own URI — nothing of it is left", async () => {
    const c = await stored();
    await removePlaceClaim(VAULT, c, RECORD);
    const ids = deletes().map((w) => idOf(w.url));
    expect(ids.at(-1)).toBe(c.id);
    expect(ids.slice(0, -1).sort()).toEqual(c.fields.map((f) => f.id).sort());
    expect(store.size).toBe(0);
  });

  it("a legacy composite is REFUSED for change (its street and places would be lost) and can still be removed", async () => {
    fake.seed("t:PlaceClaim", { "a:claimSubject": { "@id": RECORD }, "a:placeClaimLabel": "old", "a:streetLine": "Gamleveien 3" });
    const [old] = await freshRead();
    const err = await updatePlaceClaim(VAULT, old!, RECORD, { label: "old", streetLine: "x", place: { city: null, region: null, country: NORWAY } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlaceClaimRefusal);
    expect((err as PlaceClaimRefusal).sentence).toMatch(/older shape/);
    expect(fake.writes).toEqual([]);
    await removePlaceClaim(VAULT, old!, RECORD);
    expect(store.size).toBe(0);
  });
});

const INPUT = input({ label: "home", streetLine: "Storgata 1", addressLine1: "c/o Hansen", addressLine2: "Building B, 3rd floor", place: { city: null, region: null, country: NORWAY } });

describe("the lines (ported: placeAddressLines)", () => {
  it("each line is minted as its OWN field claim about the record, and reads back as written", async () => {
    await createPlaceClaim(VAULT, RECORD, INPUT, PRINCIPAL);
    const [c] = await freshRead();
    expect([claimFieldText(c!, "streetLine"), claimFieldText(c!, "addressLine1"), claimFieldText(c!, "addressLine2")]).toEqual(["Storgata 1", "c/o Hansen", "Building B, 3rd floor"]);
    expect(c!.fields.map((f) => f.subject).sort()).toEqual(["line1", "line2", "place", "street"]);
  });

  it("retracts ONLY the cleared line's entity; the other line, the street, the place and the composite stay", async () => {
    await createPlaceClaim(VAULT, RECORD, INPUT, PRINCIPAL);
    const [before] = await freshRead();
    const line1 = before!.fields.find((f) => f.subject === "line1")!;
    fake.writes.length = 0;
    await updatePlaceClaim(VAULT, before!, RECORD, { ...INPUT, addressLine1: "   " }, PRINCIPAL);
    expect(deletes().map((w) => idOf(w.url))).toEqual([line1.id]);
    const [after] = await freshRead();
    expect(after!.id).toBe(before!.id);
    expect(claimFieldText(after!, "addressLine1")).toBe("");
    expect(claimFieldText(after!, "addressLine2")).toBe("Building B, 3rd floor");
    expect(claimFieldText(after!, "streetLine")).toBe("Storgata 1");
    expect(after!.fields.map((f) => f.subject).sort()).toEqual(["line2", "place", "street"]);
  });

  it("⚠ an amend that does not NAME the lines (an older caller) leaves them as stored", async () => {
    await createPlaceClaim(VAULT, RECORD, INPUT, PRINCIPAL);
    const [before] = await freshRead();
    const { addressLine1: _1, addressLine2: _2, ...older } = INPUT;
    fake.writes.length = 0;
    await updatePlaceClaim(VAULT, before!, RECORD, { ...older, label: "home2" }, PRINCIPAL);
    expect(deletes()).toEqual([]);
    const [after] = await freshRead();
    expect(claimFieldText(after!, "addressLine1")).toBe("c/o Hansen");
    expect(claimFieldText(after!, "addressLine2")).toBe("Building B, 3rd floor");
    expect(after!.label).toBe("home2");
  });

  it("changing a line patches only that line; adding one mints only that one", async () => {
    await createPlaceClaim(VAULT, RECORD, { ...INPUT, addressLine2: "" }, PRINCIPAL);
    const [before] = await freshRead();
    const line1 = before!.fields.find((f) => f.subject === "line1")!;
    fake.writes.length = 0;
    await updatePlaceClaim(VAULT, before!, RECORD, { ...INPUT, addressLine1: "c/o Olsen" }, PRINCIPAL);
    expect(patches().filter((w) => idOf(w.url) === line1.id).map((w) => w.body)).toEqual([{ "a:addressLine1": "c/o Olsen" }]);
    expect(posts()).toHaveLength(1);
    expect((posts()[0]!.body as { facts: Record<string, unknown> }).facts).toMatchObject({ "a:addressLine2": "Building B, 3rd floor" });
    expect(deletes()).toEqual([]);
  });

  it("🔴 refuses two fields on one record (a street and a line, two lines, a line and a place, a street and a place)", async () => {
    const v = await resolvePlaceVocab();
    const composite = `${VAULT}/e/c`;
    for (const values of [
      { streetLine: "Storgata 1", addressLine1: "c/o Hansen" },
      { addressLine1: "c/o Hansen", addressLine2: "Building B" },
      { addressLine2: "Building B", placeId: NORWAY.id },
      { streetLine: "Storgata 1", placeId: NORWAY.id },
    ]) expect(() => placeFieldClaimFacts(values, RECORD, v, composite)).toThrow(/share one rung/);
    expect(() => placeFieldClaimFacts({ postalCode: "0150", addressLine2: "PO Box 12" }, RECORD, v, composite)).toThrow(/share one rung/);
  });
});

const FULL = input({ label: "home", streetLine: "Storgata 1", addressLine1: "c/o Hansen", postalCode: "0150", place: { ...NONE, country: NORWAY } });

describe("the postal code (ported: placePostalCode)", () => {
  it("🔴 written as the STRING '0150' on its own field claim about the record, and read back as '0150'", async () => {
    await createPlaceClaim(VAULT, RECORD, FULL, PRINCIPAL);
    const rows = ofType("t:SelfAssertedFieldClaim").filter(([, e]) => "a:postalCode" in e.facts);
    expect(rows).toHaveLength(1);
    const facts = rows[0]![1].facts;
    expect(facts["a:postalCode"]).toBe("0150");
    expect(typeof facts["a:postalCode"]).toBe("string");
    expect(Object.keys(facts).filter((k) => ["a:streetLine", "a:addressLine1", "a:addressLine2", "a:postalCode", "a:claimPlace"].includes(k))).toEqual(["a:postalCode"]);
    expect(facts["a:claimSubject"]).toEqual({ "@id": RECORD });
    const [kept] = await freshRead();
    expect(claimFieldText(kept!, "postalCode")).toBe("0150");
  });

  it("whitespace is trimmed and nothing else changes: '  0010 ' → '0010'; 'SW1A 1AA' keeps its space", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ postalCode: "  0010 " }), PRINCIPAL);
    expect(ofType("t:SelfAssertedFieldClaim")[0]![1].facts["a:postalCode"]).toBe("0010");
    const [kept] = await freshRead();
    await updatePlaceClaim(VAULT, kept!, RECORD, input({ postalCode: "SW1A 1AA" }), PRINCIPAL);
    const [after] = await freshRead();
    expect(claimFieldText(after!, "postalCode")).toBe("SW1A 1AA");
  });

  it("changing it patches the postal record only, still as a string", async () => {
    await createPlaceClaim(VAULT, RECORD, FULL, PRINCIPAL);
    const [before] = await freshRead();
    const postal = before!.fields.find((f) => f.subject === "postal")!;
    fake.writes.length = 0;
    await updatePlaceClaim(VAULT, before!, RECORD, { ...FULL, postalCode: "0180" }, PRINCIPAL);
    expect(patches().filter((w) => idOf(w.url) === postal.id).map((w) => w.body)).toEqual([{ "a:postalCode": "0180" }]);
    expect(posts()).toEqual([]);
  });

  it("an address with ONLY a postal code saves and reads back; no place reference, no membership", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ postalCode: "0150" }), PRINCIPAL);
    const rows = await freshRead();
    expect(rows).toHaveLength(1);
    expect(claimFieldText(rows[0]!, "postalCode")).toBe("0150");
    expect(rows[0]!.label).toBe("");
    expect(claimPlaceIds(rows[0]!)).toEqual([]);
    for (const e of store.values()) {
      expect(Object.keys(e.facts)).not.toContain("a:claimPlace");
      expect(Object.keys(e.facts)).not.toContain("a:memberOf");
    }
  });

  it("retracts ONLY the postal record when it is cleared; the composite and every other field stay", async () => {
    await createPlaceClaim(VAULT, RECORD, FULL, PRINCIPAL);
    const [before] = await freshRead();
    const postal = before!.fields.find((f) => f.subject === "postal")!;
    fake.writes.length = 0;
    await updatePlaceClaim(VAULT, before!, RECORD, { ...FULL, postalCode: "  " }, PRINCIPAL);
    expect(deletes().map((w) => idOf(w.url))).toEqual([postal.id]);
    const [after] = await freshRead();
    expect(after!.id).toBe(before!.id);
    expect(after!.fields.map((f) => f.subject).sort()).toEqual(["line1", "place", "street"]);
  });

  it("⚠ an amend that does not NAME the postal code (an older caller) leaves it as stored", async () => {
    await createPlaceClaim(VAULT, RECORD, FULL, PRINCIPAL);
    const [before] = await freshRead();
    const { postalCode: _p, ...older } = FULL;
    fake.writes.length = 0;
    await updatePlaceClaim(VAULT, before!, RECORD, { ...older, label: "home2" }, PRINCIPAL);
    expect(deletes()).toEqual([]);
    const [after] = await freshRead();
    expect(claimFieldText(after!, "postalCode")).toBe("0150");
  });
});

describe("N2 — Remove never deletes another person's data (ported from the card's library-level cases)", () => {
  it("a record that details this address but is about ANOTHER person is left as it is", async () => {
    const a = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1" }));
    const theirs = fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": OTHER }, "a:detailOf": { "@id": a.uri }, "a:postalCode": "0151" });
    const claim = (await freshRead()).find((c) => c.id === a.id)!;
    expect(claim.hiddenFieldCount).toBe(1); // it is counted (F5), not just warned about
    await removePlaceClaim(VAULT, claim, RECORD);
    expect(ofType("t:PlaceClaim")).toHaveLength(0);
    expect(ofType("t:SelfAssertedFieldClaim").map(([id]) => id)).toEqual([theirs]);
    expect(store.get(theirs)!.facts["a:postalCode"]).toBe("0151");
    expect(deletes().map((w) => idOf(w.url))).not.toContain(theirs);
  });

  it("a part about the SAME person whose edge names this address by id IS removed, on any host; a longer id is not", async () => {
    const a = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1" }));
    const claim = (await freshRead()).find((c) => c.id === a.id)!;
    const me = { "@id": RECORD };
    const part = fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": me, "a:detailOf": { "@id": a.uri }, "a:postalCode": "0150" });
    const otherHost = fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": me, "a:detailOf": { "@id": `https://elsewhere.example/base/e/${a.id}` }, "a:postalCode": "2" });
    const prefix = fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": me, "a:detailOf": { "@id": `${a.uri}X` }, "a:postalCode": "1" });
    await removePlaceClaim(VAULT, claim, RECORD);
    const deleted = deletes().map((w) => idOf(w.url));
    expect(deleted).toContain(part);
    expect(deleted).toContain(otherHost);
    expect(deleted).toContain(a.id);
    expect(ofType("t:SelfAssertedFieldClaim").map(([id]) => id)).toEqual([prefix]);
  });

  it("a part about this person AND another is not deleted: it is also the other person's", async () => {
    const a = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1" }));
    const both = fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": [{ "@id": RECORD }, { "@id": OTHER }], "a:detailOf": { "@id": a.uri }, "a:postalCode": "0151" });
    const claim = (await freshRead()).find((c) => c.id === a.id)!;
    await removePlaceClaim(VAULT, claim, RECORD);
    expect(ofType("t:PlaceClaim")).toHaveLength(0);
    expect(ofType("t:SelfAssertedFieldClaim").map(([id]) => id)).toEqual([both]);
  });
});

describe("Q2 — Remove refuses an address that also names someone else", () => {
  it("M1 an address naming this record AND another: 0 deletes, SharedAddressError", async () => {
    const a = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1" }), PRINCIPAL);
    store.get(a.id)!.facts["a:claimSubject"] = [{ "@id": RECORD }, { "@id": OTHER }];
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": OTHER }, "a:detailOf": { "@id": a.uri }, "a:postalCode": "0151" });
    const claim = (await freshRead()).find((c) => c.id === a.id)!;
    fake.writes.length = 0;
    const err = await removePlaceClaim(VAULT, claim, RECORD).catch((e: unknown) => e);
    expect((err as Error).name).toBe("SharedAddressError");
    expect(deletes()).toEqual([]);
    expect(ofType("t:PlaceClaim")).toHaveLength(1);
    expect(ofType("t:SelfAssertedFieldClaim")).toHaveLength(2);
  });

  it("control: an address that names only this record is still removed", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1" }), PRINCIPAL);
    const [claim] = await freshRead();
    await removePlaceClaim(VAULT, claim!, RECORD);
    expect(ofType("t:PlaceClaim")).toHaveLength(0);
    expect(ofType("t:SelfAssertedFieldClaim")).toHaveLength(0);
  });
});

describe("R1 — Remove deletes every part of the address that the read shows", () => {
  const PID = RECORD.slice(RECORD.lastIndexOf("/") + 1);
  const shown = async () => {
    const rows = await freshRead();
    expect(rows).toHaveLength(1);
    return rows[0]!;
  };

  it("S1 an address made under /base/e/<id> and amended under /vault/e/<id> of the same record: every part goes", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1" }), PRINCIPAL);
    await updatePlaceClaim(VAULT, await shown(), `https://hytta.platform.example.test/vault/e/${PID}`, input({ label: "home", streetLine: "Gate 1", addressLine1: "c/o Hansen" }), PRINCIPAL);
    const claim = await shown();
    expect(claimFieldText(claim, "streetLine")).toBe("Gate 1");
    expect(claimFieldText(claim, "addressLine1")).toBe("c/o Hansen");
    await removePlaceClaim(VAULT, claim, RECORD);
    expect(ofType("t:PlaceClaim")).toHaveLength(0);
    expect(ofType("t:SelfAssertedFieldClaim")).toEqual([]);
  });

  it("S2 an address made under base:e/<id> and amended under the full record IRI: every part goes", async () => {
    await createPlaceClaim(VAULT, `base:e/${PID}`, input({ label: "cabin", streetLine: "Hytteveien 2", postalCode: "3550" }), PRINCIPAL);
    await updatePlaceClaim(VAULT, await shown(), RECORD, input({ label: "the cabin", streetLine: "Hytteveien 2", postalCode: "3550" }), PRINCIPAL);
    const claim = await shown();
    expect(claimFieldText(claim, "postalCode")).toBe("3550");
    await removePlaceClaim(VAULT, claim, RECORD);
    expect(ofType("t:PlaceClaim")).toHaveLength(0);
    expect(ofType("t:SelfAssertedFieldClaim")).toEqual([]);
  });

  it("S3 a part with no a:claimSubject, which the read shows under the address: it goes", async () => {
    const a = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1" }), PRINCIPAL);
    fake.seed("t:SelfAssertedFieldClaim", { "a:detailOf": { "@id": a.uri }, "a:postalCode": "0150" });
    const claim = await shown();
    expect(claimFieldText(claim, "postalCode")).toBe("0150");
    await removePlaceClaim(VAULT, claim, RECORD);
    expect(ofType("t:PlaceClaim")).toHaveLength(0);
    expect(ofType("t:SelfAssertedFieldClaim")).toEqual([]);
  });

  it("S4 a street edge on the deployment's owner host: it goes", async () => {
    const a = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1", addressLine1: "c/o Hansen" }), PRINCIPAL);
    for (const [, e] of ofType("t:SelfAssertedFieldClaim")) if (e.facts["a:streetLine"] === "Gate 1") e.facts["a:detailOf"] = { "@id": `https://api.example/base/e/${a.id}` };
    const claim = await shown();
    await removePlaceClaim(VAULT, claim, RECORD);
    expect(ofType("t:PlaceClaim")).toHaveLength(0);
    expect(ofType("t:SelfAssertedFieldClaim")).toEqual([]);
  });
});

describe("F3 — Remove retracts EVERY field record that details the address", () => {
  it("a record this build cannot read, a malformed one, and one written since the read all go with the address", async () => {
    const made = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1", addressLine1: "c/o Hansen" }), PRINCIPAL);
    const edge = { "@id": made.uri };
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": RECORD }, "a:detailOf": edge, "a:countyName": "Viken" });
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": RECORD }, "a:detailOf": edge, "a:streetLine": "x", "a:postalCode": "0150" });
    const other = await createPlaceClaim(VAULT, RECORD, input({ label: "cabin", streetLine: "Hytteveien 2" }), PRINCIPAL);
    const claim = (await freshRead()).find((c) => c.id === made.id)!;
    expect(claim.fields.filter((f) => f.subject === "unknown")).toHaveLength(2);
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": RECORD }, "a:detailOf": edge, "a:postalCode": "0151" });
    await removePlaceClaim(VAULT, claim, RECORD);
    const left = ofType("t:SelfAssertedFieldClaim").map(([, e]) => (e.facts["a:detailOf"] as { "@id": string })["@id"]);
    expect(left).toEqual([other.uri]);
    expect(ofType("t:PlaceClaim").map(([id]) => id)).toEqual([other.id]);
  });

  it("an amend of an address with a child this build cannot read is refused, and changes nothing", async () => {
    const made = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1" }), PRINCIPAL);
    fake.seed("t:SelfAssertedFieldClaim", { "a:claimSubject": { "@id": RECORD }, "a:detailOf": { "@id": made.uri }, "a:countyName": "Viken" });
    const [claim] = await freshRead();
    fake.writes.length = 0;
    const err = await updatePlaceClaim(VAULT, claim!, RECORD, input({ label: "", streetLine: "Gate 1" }), PRINCIPAL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlaceClaimRefusal);
    expect(fake.writes).toEqual([]);
    expect(ofType("t:PlaceClaim")[0]![1].facts["a:placeClaimLabel"]).toBe("home");
  });
});

describe("F4 — an address cannot be amended into an empty one", () => {
  it("the library refuses an all-blank amend and writes nothing", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1", addressLine1: "x" }), PRINCIPAL);
    const [claim] = await freshRead();
    const before = JSON.stringify([...store.entries()]);
    fake.writes.length = 0;
    await expect(updatePlaceClaim(VAULT, claim!, RECORD, input({ addressLine1: "", addressLine2: "", postalCode: "" }), PRINCIPAL)).rejects.toThrow(EMPTY_ADDRESS_MESSAGE);
    expect(JSON.stringify([...store.entries()])).toBe(before);
    expect(fake.writes).toEqual([]);
  });

  it("a line the caller does not NAME is still content: blanking the rest leaves it, and is allowed", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ label: "home", addressLine1: "c/o Hansen" }), PRINCIPAL);
    const [claim] = await freshRead();
    // the caller names only the label and the place: the lines are not named, so they are left as stored
    await updatePlaceClaim(VAULT, claim!, RECORD, { label: "", streetLine: "", place: NONE }, PRINCIPAL);
    const [after] = await freshRead();
    expect(after!.label).toBe("");
    expect(claimFieldText(after!, "addressLine1")).toBe("c/o Hansen");
  });
});

describe("a failed save says what exists (decision 12): the address was made and one of its details was not", () => {
  it("a field POST that fails after the composite exists throws PlaceClaimPartialError carrying what was made; nothing is cleaned up", async () => {
    fake.knobs.failCreateAt = 3; // the composite, the street, then the Address 1 fails
    const err = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1", addressLine1: "c/o Hansen", postalCode: "0150" }), PRINCIPAL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlaceClaimPartialError);
    const partial = err as PlaceClaimPartialError;
    expect(partial.made.fieldIds).toHaveLength(1);
    expect((partial.message)).toBe("PlaceClaim 0 — The address was saved, but one of its details was not.");
    expect(partial.failure).toBeInstanceOf(Error);
    // A's behaviour kept: no cleanup. The composite and the one field that was made are there; the rest was not tried.
    expect(ofType("t:PlaceClaim")).toHaveLength(1);
    expect(ofType("t:SelfAssertedFieldClaim")).toHaveLength(1);
    expect(deletes()).toEqual([]);
    expect(posts()).toHaveLength(3);
  });

  it("the composite's own failure is not a partial create: nothing exists, the plain error goes through", async () => {
    fake.knobs.failCreateAt = 1;
    const err = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1" }), PRINCIPAL).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(PlaceClaimPartialError);
    expect(store.size).toBe(0);
  });
});

describe("read back (a sanity check of the pieces together)", () => {
  it("what is created reads back through the read side of place-claims, about this record only", async () => {
    await createPlaceClaim(VAULT, RECORD, INPUT, PRINCIPAL);
    await createPlaceClaim(VAULT, OTHER, input({ label: "work", streetLine: "x" }), PRINCIPAL);
    const all = await listPlaceClaimsInVault(VAULT);
    expect(claimsAbout(all, RECORD).map((c) => c.label)).toEqual(["home"]);
    expect(claimsAbout(all, OTHER).map((c) => c.label)).toEqual(["work"]);
  });
});
