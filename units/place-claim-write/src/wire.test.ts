// The wire. New: the requests each act sends, key by key (§3 of the plan), and the amend wire of decision 6 against GilbApp's: GilbApp patched the composite on EVERY
// amend, re-sent `a:claimSubject`, and sent `a:placeClaimLabel: null` whenever the label was blank, changed or not. Now only what the act changed. The fake platform does
// the merge patch BOTH ways a platform could (RFC 7396 replace, and add-to-a-list), because what the platform does with a list is not ours to test live.
import { describe, expect, it, vi } from "vitest";
import { createPlaceClaim, removePlaceClaim, updatePlaceClaim } from "./index";
import * as fake from "../test/fakePlaceStore";
import { NORWAY, OSLO, OTHER, PRINCIPAL, RECORD, VAULT, bodyKeys, freshRead, input, ofType, store, useWorld } from "../test/world";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({
  attributeSpelling: vi.fn(async (name: string) => name),
  typeSpelling: vi.fn(async (name: string) => `t:${name}`),
  attributeLabel: vi.fn(async () => null),
}));

useWorld();
const writes = () => fake.writes;
const idOf = (url: string) => url.slice(url.lastIndexOf("/") + 1);
const compositeWrites = (id: string) => fake.writes.filter((w) => idOf(w.url) === id);

describe("create: one POST for the composite, one per field, and nothing else", () => {
  it("the composite carries exactly claimSubject, the label when not blank, and the reader grant; each field exactly its subject, its edge, ONE value, and the grant", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ label: " home ", streetLine: "Storgata 1", addressLine1: "c/o Hansen", postalCode: "0150", place: { city: OSLO, region: null, country: NORWAY } }), PRINCIPAL);
    expect(writes().map((w) => w.method)).toEqual(["POST", "POST", "POST", "POST", "POST", "POST"]);
    expect(writes().every((w) => /\/lws\/vault\/[^/]+\/c$/.test(w.url))).toBe(true);
    expect(bodyKeys(writes()[0]!.body)).toEqual(["a:claimSubject", "a:directReader", "a:placeClaimLabel"]);
    expect((writes()[0]!.body as { type: string }).type).toBe("t:PlaceClaim");
    const fieldKeys = writes().slice(1).map((w) => bodyKeys(w.body).filter((k) => !["a:claimSubject", "a:detailOf", "a:directReader"].includes(k)));
    expect(fieldKeys).toEqual([["a:streetLine"], ["a:addressLine1"], ["a:postalCode"], ["a:claimPlace"], ["a:claimPlace"]]);
    for (const w of writes().slice(1)) {
      expect((w.body as { type: string }).type).toBe("t:SelfAssertedFieldClaim");
      expect(bodyKeys(w.body)).toEqual(expect.arrayContaining(["a:claimSubject", "a:detailOf", "a:directReader"]));
      expect(bodyKeys(w.body)).toHaveLength(4);
    }
  });

  it("a blank label on create sends NO label key (an empty label would assert 'named, and the name is nothing')", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ label: "   ", streetLine: "Gate 1" }), PRINCIPAL);
    expect(bodyKeys(writes()[0]!.body)).toEqual(["a:claimSubject", "a:directReader"]);
  });

  it("with no principal there is no reader grant on any request", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ label: "x", streetLine: "Gate 1" }));
    for (const w of writes()) expect(bodyKeys(w.body)).not.toContain("a:directReader");
  });

  it("no request carries a rung, a find key or a grant other than the one reader grant", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ label: "x", streetLine: "Gate 1", place: { city: null, region: null, country: NORWAY } }), PRINCIPAL);
    for (const w of writes()) for (const k of bodyKeys(w.body)) expect(k).not.toMatch(/visibilityTier|directWriter|partOf|readerGroup|findKey/i);
  });
});

describe("amend: only what the act changed (decision 6)", () => {
  async function stored(label: string) {
    await createPlaceClaim(VAULT, RECORD, input({ label, streetLine: "Storgata 1", place: { city: null, region: null, country: NORWAY } }), PRINCIPAL);
    const [c] = await freshRead();
    fake.calls.length = 0;
    fake.writes.length = 0;
    return c!;
  }
  const same = (c: { label: string }, over: Parameters<typeof input>[0] = {}) => input({ label: c.label, streetLine: "Storgata 1", place: { city: null, region: null, country: NORWAY }, ...over });

  it("a blank label left blank sends NO label key and NO request for the composite (GilbApp sent a:placeClaimLabel: null with a:claimSubject every time)", async () => {
    const c = await stored("");
    await updatePlaceClaim(VAULT, c, RECORD, same(c, { streetLine: "Storgata 2" }), PRINCIPAL);
    expect(compositeWrites(c.id)).toEqual([]);
    expect(writes()).toHaveLength(1); // the street, and nothing else
  });

  it("an unchanged label sends nothing for the composite either", async () => {
    const c = await stored("home");
    await updatePlaceClaim(VAULT, c, RECORD, same(c, { streetLine: "Storgata 2" }), PRINCIPAL);
    expect(compositeWrites(c.id)).toEqual([]);
  });

  it("a changed label is ONE PATCH of the composite naming the label and nothing else — never a:claimSubject", async () => {
    const c = await stored("home");
    await updatePlaceClaim(VAULT, c, RECORD, same(c, { label: "cabin" }), PRINCIPAL);
    const w = compositeWrites(c.id);
    expect(w).toHaveLength(1);
    expect(w[0]!.method).toBe("PATCH");
    expect(w[0]!.body).toEqual({ "a:placeClaimLabel": "cabin" });
    expect(Object.keys(w[0]!.body!)).not.toContain("a:claimSubject");
  });

  it("a label that was non-blank and was cleared is null — and ONLY then", async () => {
    const c = await stored("home");
    await updatePlaceClaim(VAULT, c, RECORD, same(c, { label: "   " }), PRINCIPAL);
    expect(compositeWrites(c.id).map((w) => w.body)).toEqual([{ "a:placeClaimLabel": null }]);
    expect(store.get(c.id)!.facts).not.toHaveProperty("a:placeClaimLabel");
  });

  it("no amend, of any kind, ever sends a:claimSubject on the composite (a label change, a clear, a field change)", async () => {
    for (const over of [{ label: "cabin" }, { label: "" }, { streetLine: "Storgata 9" }, { addressLine1: "c/o X" }]) {
      fake.resetStore();
      const c = await stored("home");
      await updatePlaceClaim(VAULT, c, RECORD, same(c, over), PRINCIPAL);
      for (const w of compositeWrites(c.id)) expect(Object.keys(w.body ?? {})).not.toContain("a:claimSubject");
    }
  });

  it("an address that is also about someone else keeps both subjects through an amend, whether the platform's merge patch REPLACES or ADDS to a list", async () => {
    for (const mode of ["replace", "add"] as const) {
      fake.resetStore();
      fake.knobs.patchArrays = mode;
      const c = await stored("home");
      store.get(c.id)!.facts["a:claimSubject"] = [{ "@id": RECORD }, { "@id": OTHER }];
      const [shared] = await freshRead();
      await updatePlaceClaim(VAULT, shared!, RECORD, same(c, { label: "cabin" }), PRINCIPAL);
      expect(store.get(c.id)!.facts["a:claimSubject"], mode).toEqual([{ "@id": RECORD }, { "@id": OTHER }]);
      expect(store.get(c.id)!.facts["a:placeClaimLabel"], mode).toBe("cabin");
    }
  });

  it("a field the act changed is ONE PATCH of that field naming only its value; a field minted carries subject, edge, value and grant; one cleared is a DELETE", async () => {
    const c = await stored("home");
    const street = c.fields.find((f) => f.subject === "street")!;
    const place = c.fields.find((f) => f.subject === "place")!;
    await updatePlaceClaim(VAULT, c, RECORD, same(c, { streetLine: "", addressLine2: "Building B", place: { city: null, region: null, country: NORWAY } }), PRINCIPAL);
    expect(writes().map((w) => [w.method, idOf(w.url) === street.id ? "street" : idOf(w.url) === place.id ? "place" : "new"])).toEqual([
      ["DELETE", "street"],
      ["POST", "new"],
    ]);
    expect(bodyKeys(writes()[1]!.body)).toEqual(["a:addressLine2", "a:claimSubject", "a:detailOf", "a:directReader"]);
  });

  it("an amend that changes nothing at all sends no write", async () => {
    const c = await stored("home");
    await updatePlaceClaim(VAULT, c, RECORD, same(c), PRINCIPAL);
    expect(writes()).toEqual([]);
  });
});

describe("remove: reads, then DELETEs of the parts, then the composite", () => {
  it("the requests, in order: the read of the address, the listing of the field claims, one DELETE per part, then the composite's", async () => {
    const a = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1", postalCode: "0150" }), PRINCIPAL);
    const [claim] = await freshRead();
    fake.calls.length = 0;
    await removePlaceClaim(VAULT, claim!, RECORD);
    const methods = fake.calls.map((c) => c.method);
    expect(methods.filter((m) => m !== "GET")).toEqual(["DELETE", "DELETE", "DELETE"]);
    expect(methods.indexOf("DELETE")).toBeGreaterThan(methods.lastIndexOf("GET") - 1 > 0 ? 0 : -1);
    expect(fake.calls.filter((c) => c.method === "DELETE").map((c) => idOf(c.url)).at(-1)).toBe(a.id);
    expect(fake.calls.filter((c) => c.method === "DELETE").every((c) => c.body === null)).toBe(true);
    // every GET came before the first DELETE
    expect(fake.calls.findIndex((c) => c.method === "DELETE")).toBe(fake.calls.filter((c) => c.method === "GET").length);
  });

  it("a remove whose listing of the field claims is not whole deletes NOTHING (it would leave the parts it never saw)", async () => {
    const a = await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1" }), PRINCIPAL);
    const [claim] = await freshRead();
    fake.calls.length = 0;
    fake.writes.length = 0;
    fake.door.pages = (offset, types) => (types.includes("SelfAssertedFieldClaim") ? { records: [], total: 9, complete: false, pageSize: 1, offset, nextOffset: offset } : null);
    const err = await removePlaceClaim(VAULT, claim!, RECORD).catch((e: unknown) => e);
    expect((err as { sentence?: string }).sentence).toBe("This address cannot be removed right now, because not every detail of it could be read. Nothing was removed.");
    expect(fake.writes).toEqual([]);
    expect(store.has(a.id)).toBe(true);
  });
});
