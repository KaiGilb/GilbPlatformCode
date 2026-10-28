// @vitest-environment node
// The holder's own card in a vault: the reads handed to the finder, the finding it makes over them, and the card's name from the finding's own read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSystemHostLabels, setSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { ownCardDeps, ownCardFindingKey, ownCardFindingQuery } from "./ownCardFinding";
import { SEAT, SEAT_ENTITY, derivedIdOf, installWire, person, vault } from "../test/cardWire";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
  setSystemHostLabels(["id", "ontology", "geo", "life", "kaizen"]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetSystemHostLabels();
  tearDown();
});

const run = (v = vault()) => ownCardFindingQuery(v).queryFn();

describe("ownCardFindingKey", () => {
  it("is one key per landing vault", () => {
    expect(ownCardFindingKey(SEAT)).toEqual(["own-card", "finding", SEAT]);
  });
});

describe("ownCardFindingQuery", () => {
  it("reads nothing for no vault, is kept for the session, and is never retried", () => {
    const q = ownCardFindingQuery(null);
    expect(q.enabled).toBe(false);
    expect(q.queryKey).toEqual(["own-card", "finding", ""]);
    expect(q.staleTime).toBe(Infinity);
    expect(q.retry).toBe(false);
    const on = ownCardFindingQuery(vault());
    expect(on.enabled).toBe(true);
    expect(on.queryKey).toEqual(ownCardFindingKey(SEAT));
  });

  it("finds the card derived for the vault, with its address and its name", async () => {
    const wire = installWire();
    const id = await derivedIdOf();
    wire.set("seat-record", person("seat-record", { "a:name": "Seat" }));
    wire.set(id, person(id));
    const found = await run();
    expect(found).toMatchObject({ cardId: id, cardUri: `${SEAT}/e/${id}`, road: "derived", cardName: "Kai Gilb", otherOwnerCards: [], ignoredPointer: null });
  });

  it("follows the vault's profile pointer to a card whose id is the owner's, naming it from its given and family name", async () => {
    const wire = installWire();
    wire.set("seat-record", { "@id": SEAT_ENTITY, "@type": "t:Vault", "a:mnbProfile": { "@id": `${SEAT}/e/mnb-profile-abc` } });
    wire.set("mnb-profile-abc", person("mnb-profile-abc", { "a:name": undefined, "a:givenName": "Ada", "a:familyName": "Lovelace" }));
    const found = await run();
    expect(found).toMatchObject({ cardId: "mnb-profile-abc", cardUri: `${SEAT}/e/mnb-profile-abc`, road: "pointer", cardName: "Ada Lovelace" });
  });

  it("has no card, no name and the road none when neither the pointer nor the derived card is there", async () => {
    const wire = installWire();
    wire.set("seat-record", { "@id": SEAT_ENTITY, "@type": "t:Vault" });
    const found = await run();
    expect(found).toMatchObject({ cardId: null, cardUri: null, road: "none", cardName: null });
  });

  it("has a null name when the card shows none", async () => {
    const wire = installWire();
    const id = await derivedIdOf();
    wire.set(id, person(id, { "a:name": undefined }));
    expect((await run()).cardName).toBeNull();
  });

  it("asks the platform's host name of the API origin for the seat, so a card on a foreign host is not the holder's", async () => {
    const wire = installWire();
    const id = await derivedIdOf();
    wire.set(id, person(id, { "@id": `https://elsewhere.example.org/vault/e/${id}` }));
    expect((await run()).cardId).toBeNull();
  });

  it("takes a card served at the API host as the seat's, where a card on any other host of the platform is not", async () => {
    const wire = installWire();
    const id = await derivedIdOf();
    wire.set(id, person(id, { "@id": `https://platform.example.test/base/e/${id}` }));
    expect((await run()).cardId).toBe(id);
  });

  it("follows a pointer at the card derived for the sibling root of the vault (/base for /vault) and refuses one at a stranger's derived card", async () => {
    const wire = installWire();
    const sibling = await derivedIdOf(SEAT.replace("/vault", "/base"));
    const stranger = await derivedIdOf("https://stranger.platform.example.test/vault");
    wire.set("seat-record", { "@id": SEAT_ENTITY, "a:mnbProfile": { "@id": `${SEAT}/e/${sibling}` } });
    wire.set(sibling, person(sibling));
    expect(await run()).toMatchObject({ cardId: sibling, road: "pointer" });
    wire.set("seat-record", { "@id": SEAT_ENTITY, "a:mnbProfile": { "@id": `${SEAT}/e/${stranger}` } });
    wire.set(stranger, person(stranger));
    expect(await run()).toMatchObject({ cardId: null, road: "none", ignoredPointer: `${SEAT}/e/${stranger}` });
  });

  it("roots the finding at the root of the vault's id, reading the segment off the id (a bare id is rooted at /base)", async () => {
    const wire = installWire();
    const bare = "https://t1kai.platform.example.test";
    const id = await derivedIdOf(`${bare}/base`);
    wire.set(id, person(id, { "@id": `${bare}/base/e/${id}` }));
    const found = await run(vault({ vaultId: bare, entity: null }));
    expect(found).toMatchObject({ cardId: id, cardUri: `${bare}/base/e/${id}`, road: "derived" });
  });

  it("fails when a read fails with anything but absent, never taking it for absence", async () => {
    const wire = installWire();
    const id = await derivedIdOf();
    wire.set(id, 500);
    await expect(run()).rejects.toThrow();
  });
});

describe("ownCardDeps", () => {
  it("has no pointer to read when the vault has no entity", async () => {
    const wire = installWire();
    const deps = ownCardDeps(vault({ entity: null }));
    expect(await deps.readProfilePointer()).toBeNull();
    expect(wire.reads).toEqual([]);
  });

  it("reads the vault entity at its own address and answers its pointer, from the served document first", async () => {
    const wire = installWire();
    const deps = ownCardDeps(vault());
    wire.set("seat-record", { "@id": SEAT_ENTITY, "a:mnbProfile": `${SEAT}/e/mnb-profile-s` });
    expect(await deps.readProfilePointer()).toBe(`${SEAT}/e/mnb-profile-s`);
    expect(wire.reads[0]).toBe(`${SEAT.replace("/vault", "")}/lws/r/seat-record`);
  });

  it("reads a pointer given as an object, as a list of either, or with spaces, and none when it is blank or absent", async () => {
    const wire = installWire();
    const deps = ownCardDeps(vault());
    wire.set("seat-record", { "a:mnbProfile": [{ "@id": "  " }, { "@id": `${SEAT}/e/p1` }, `${SEAT}/e/p2`] });
    expect(await deps.readProfilePointer()).toBe(`${SEAT}/e/p1`);
    wire.set("seat-record", { "a:mnbProfile": `  ${SEAT}/e/p3  ` });
    expect(await deps.readProfilePointer()).toBe(`${SEAT}/e/p3`);
    wire.set("seat-record", { "a:mnbProfile": "   " });
    expect(await deps.readProfilePointer()).toBeNull();
    wire.set("seat-record", { "a:other": "x" });
    expect(await deps.readProfilePointer()).toBeNull();
  });

  it("answers no pointer for an entity the vault does not show and fails for any other answer", async () => {
    const wire = installWire();
    const deps = ownCardDeps(vault());
    expect(await deps.readProfilePointer()).toBeNull();
    wire.set("seat-record", 500);
    await expect(deps.readProfilePointer()).rejects.toThrow();
  });

  it("reads a card at the address it was asked for and answers where it sits and its type, naming it to the caller", async () => {
    const wire = installWire();
    const seen: [string, string | null][] = [];
    const deps = ownCardDeps(vault(), (id, name) => seen.push([id, name]));
    wire.set("c1", person("c1", { "a:name": " Cee " }));
    const got = await deps.readCard("c1", `${SEAT}/e/c1`);
    expect(got).toEqual({ atId: `${SEAT}/e/c1`, type: expect.stringContaining("Person") });
    expect(seen).toEqual([["c1", "Cee"]]);
    expect(await deps.readCard("gone", `${SEAT}/e/gone`)).toBeNull();
    expect(seen).toHaveLength(1);
  });
});
