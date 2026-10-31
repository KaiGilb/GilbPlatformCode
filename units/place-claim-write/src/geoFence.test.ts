// The per-write geo fence (decision 2b): every write function throws GeoWriteRefusedError BEFORE any request when a URL it is going to write to is inside the place
// catalogue. The URL checked is the one the write would be sent to (built from the same arguments the record client gets), so an entity address planted under the
// catalogue is refused even when the vault argument is the holder's. Every refusal test asserts that NO request of any kind was made.
import { describe, expect, it, vi } from "vitest";
import type { ResolvedPlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import { resolvePlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import type { PlaceClaim } from "@kaigilb/gilbplatformcode-place-claims";
import {
  GeoWriteRefusedError,
  createPlaceClaim,
  createPlaceFieldClaim,
  removePlaceClaim,
  removePlaceFieldClaim,
  updatePlaceClaim,
  updatePlaceFieldClaim,
} from "./index";
import * as fake from "../test/fakePlaceStore";
import { NORWAY, PRINCIPAL, RECORD, VAULT, freshRead, input, store, useWorld } from "../test/world";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({
  attributeSpelling: vi.fn(async (name: string) => name),
  typeSpelling: vi.fn(async (name: string) => `t:${name}`),
  attributeLabel: vi.fn(async () => null),
}));

useWorld();
const GEO_VAULT = `${fake.GEO_HOST}/base`;
const GEO_ENTITY = (id: string) => `${fake.GEO_HOST}/base/e/${id}`;
const refused = async (p: Promise<unknown>) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(GeoWriteRefusedError);
  expect((err as Error).message).toBe("The place catalogue is read only, so nothing can be written to it.");
  expect((err as Error).message).not.toMatch(/https?:|geo\./);
  expect(fake.calls).toEqual([]); // not one request, of any method, before the refusal
};
let vocab: ResolvedPlaceVocab;
const stored = async (): Promise<PlaceClaim> => {
  await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1", place: { city: null, region: null, country: NORWAY } }), PRINCIPAL);
  const [c] = await freshRead();
  vocab = await resolvePlaceVocab();
  fake.calls.length = 0;
  fake.writes.length = 0;
  return c!;
};

describe("create", () => {
  it("createPlaceClaim into the catalogue's vault: refused, no request", async () => {
    await refused(createPlaceClaim(GEO_VAULT, RECORD, input({ label: "home", streetLine: "x" }), PRINCIPAL));
  });
  it("createPlaceFieldClaim into the catalogue's vault: refused, no request", async () => {
    vocab = await resolvePlaceVocab();
    fake.calls.length = 0;
    await refused(createPlaceFieldClaim(GEO_VAULT, RECORD, { streetLine: "x" }, vocab, `${VAULT}/e/c`, PRINCIPAL));
  });
  it("control: the holder's vault is written", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "x" }), PRINCIPAL);
    expect(fake.writes.length).toBeGreaterThan(0);
  });
  it("a catalogue address smuggled into the vault argument's query is not the catalogue, and is not refused", async () => {
    const r = await createPlaceClaim(`${VAULT}?u=${fake.GEO_HOST}/base`, RECORD, input({ label: "home", streetLine: "x" }), PRINCIPAL).catch((e: unknown) => e);
    expect(r).not.toBeInstanceOf(GeoWriteRefusedError);
  });
});

describe("update — the URL each write is sent to, not only the vault argument (M-K9)", () => {
  it("(M-K9) a composite whose entity address is planted under the catalogue, with the holder's vault: refused, no request", async () => {
    const c = await stored();
    const planted: PlaceClaim = { ...c, uri: GEO_ENTITY(c.id) };
    await refused(updatePlaceClaim(VAULT, planted, RECORD, input({ label: "cabin", streetLine: "Gate 1", place: { city: null, region: null, country: NORWAY } }), PRINCIPAL));
    expect(store.get(c.id)!.facts["a:placeClaimLabel"]).toBe("home");
  });
  it("(M-K9) a field of the address whose entity address is planted under the catalogue: refused, no request, the other fields not touched", async () => {
    const c = await stored();
    const planted: PlaceClaim = { ...c, fields: c.fields.map((f) => (f.subject === "street" ? { ...f, uri: GEO_ENTITY(f.id) } : f)) };
    await refused(updatePlaceClaim(VAULT, planted, RECORD, input({ label: "home", streetLine: "Gate 2", place: { city: null, region: null, country: NORWAY } }), PRINCIPAL));
  });
  it("the catalogue's vault as the vault argument: refused, no request", async () => {
    const c = await stored();
    await refused(updatePlaceClaim(GEO_VAULT, c, RECORD, input({ label: "cabin", streetLine: "Gate 1", place: { city: null, region: null, country: NORWAY } }), PRINCIPAL));
  });
  it("updatePlaceFieldClaim: an entity address under the catalogue, or its vault: refused, no request", async () => {
    const c = await stored();
    const street = c.fields.find((f) => f.subject === "street")!;
    await refused(updatePlaceFieldClaim(VAULT, street.id, { streetLine: "x" }, vocab, GEO_ENTITY(street.id)));
    await refused(updatePlaceFieldClaim(GEO_VAULT, street.id, { streetLine: "x" }, vocab));
  });
  it("control: the same amend on the holder's vault is written", async () => {
    const c = await stored();
    await updatePlaceClaim(VAULT, c, RECORD, input({ label: "cabin", streetLine: "Gate 1", place: { city: null, region: null, country: NORWAY } }), PRINCIPAL);
    expect(fake.writes.length).toBe(1);
  });
});

describe("remove", () => {
  it("(M-K9) a composite planted under the catalogue: refused, no request (not even the read of it)", async () => {
    const c = await stored();
    await refused(removePlaceClaim(VAULT, { ...c, uri: GEO_ENTITY(c.id) }, RECORD));
    expect(store.has(c.id)).toBe(true);
  });
  it("a known field planted under the catalogue: refused, no request, nothing deleted", async () => {
    const c = await stored();
    await refused(removePlaceClaim(VAULT, { ...c, fields: c.fields.map((f, i) => (i === 0 ? { ...f, uri: GEO_ENTITY(f.id) } : f)) }, RECORD));
    expect(store.size).toBe(1 + c.fields.length);
  });
  it("a PART FOUND BY THE LISTING whose entity address is under the catalogue, listed AFTER a good part: refused before the FIRST delete (the reads were made, no write was)", async () => {
    const c = await stored();
    const good = c.fields[0]!;
    const row = (entity: string, id: string) => ({ entity, typeUri: "t:SelfAssertedFieldClaim", updatedAt: null, label: null, body: { "@id": entity, "@type": "t:SelfAssertedFieldClaim", detailOf: { "@id": c.uri }, claimSubject: { "@id": RECORD }, streetLine: id }, etag: '"1"' });
    fake.door.pages = (offset, types) =>
      types.includes("SelfAssertedFieldClaim") && offset === 0
        ? { total: 2, complete: true, pageSize: 2, offset: 0, nextOffset: null, records: [row(`${VAULT}/e/${good.id}`, "good"), row(GEO_ENTITY("planted"), "planted")] }
        : null;
    const err = await removePlaceClaim(VAULT, { ...c, fields: [] }, RECORD).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeoWriteRefusedError);
    expect(fake.writes).toEqual([]); // not even the good part was deleted
    expect(store.has(c.id)).toBe(true);
    expect(store.has(good.id)).toBe(true);
  });
  it("removePlaceFieldClaim: an entity address under the catalogue, or its vault: refused, no request", async () => {
    const c = await stored();
    const street = c.fields.find((f) => f.subject === "street")!;
    await refused(removePlaceFieldClaim(VAULT, street.id, GEO_ENTITY(street.id)));
    await refused(removePlaceFieldClaim(GEO_VAULT, street.id));
  });
  it("control: the holder's address is removed", async () => {
    const c = await stored();
    await removePlaceClaim(VAULT, c, RECORD);
    expect(store.size).toBe(0);
  });
});

describe("the world: nothing but a GET at the catalogue", () => {
  it("a whole life of an address (create, change, remove) puts no write at the catalogue, though it reads it", async () => {
    await createPlaceClaim(VAULT, RECORD, input({ label: "home", streetLine: "Gate 1", place: { city: null, region: null, country: NORWAY } }), PRINCIPAL);
    const [c] = await freshRead();
    await updatePlaceClaim(VAULT, c!, RECORD, input({ label: "cabin", streetLine: "Gate 2", place: { city: null, region: null, country: NORWAY } }), PRINCIPAL);
    const [d] = await freshRead();
    await removePlaceClaim(VAULT, d!, RECORD);
    expect(fake.geoRequests().length).toBeGreaterThan(0); // it did read the place (slotsForFields)
    expect(fake.geoRequests().every((r) => r.method === "GET")).toBe(true);
  });
});
