// @vitest-environment node
// New (the source has no test of these symbols of its own; they were exercised through the held-claim tests). The REAL peers
// `lws-records`, `vault-origin-rule`, `vault-namespace`, `resource-id` and `lws-vault-sets` over a fake platform (test/support.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResource, deleteResource, getResource, patchResource, readResources } from "./index";
import { ORIGIN_A, ORIGIN_B, VAULT_A, VAULT_B, fakePlatform, setUp, tearDown } from "../test/support";

beforeEach(setUp);
afterEach(tearDown);

describe("createResource", () => {
  it("POSTs to the named vault's OWN host and answers the id, the entity address under that vault, and the etag", async () => {
    const p = fakePlatform();
    const r = await createResource(VAULT_A, { type: "t:HeldPartyFieldClaim", facts: { "a:note": "hello" } });
    expect(p.of("POST")).toHaveLength(1);
    expect(p.of("POST")[0]!.origin).toBe(ORIGIN_A);
    expect(r).toEqual({ id: "n1", location: `${VAULT_A}/e/n1`, etag: '"v1-n1"' });
    expect(p.at(ORIGIN_A).has("n1")).toBe(true);
    expect(p.at(ORIGIN_B).size).toBe(0);
  });
  it("creates in the other vault when that one is named", async () => {
    const p = fakePlatform();
    const r = await createResource(VAULT_B, { type: "t:X", facts: { "a:k": "v" } });
    expect(p.of("POST")[0]!.origin).toBe(ORIGIN_B);
    expect(r.location).toBe(`${VAULT_B}/e/${r.id}`);
  });
  it("takes ONE a: off each key (the record door adds it back), and keeps a bare key as it is", async () => {
    const p = fakePlatform();
    await createResource(VAULT_A, { type: "t:X", facts: { "a:claimSubject": "s", bareKey: "b" } });
    const sent = (p.of("POST")[0]!.body as { facts: Record<string, unknown> }).facts;
    expect(Object.keys(sent).sort()).toEqual(["a:bareKey", "a:claimSubject"]);
  });
  it("sends a reference value as a reference", async () => {
    const p = fakePlatform();
    await createResource(VAULT_A, { type: "t:X", facts: { "a:heldParty": { "@id": "https://geo.platform.example.test/base/e/p1" } } });
    const sent = (p.of("POST")[0]!.body as { facts: Record<string, unknown> }).facts;
    expect(sent["a:heldParty"]).toEqual({ "@id": "https://geo.platform.example.test/base/e/p1" });
  });
  it("sends the type it was given", async () => {
    const p = fakePlatform();
    await createResource(VAULT_A, { type: "t:HeldPartyFieldClaim", facts: { "a:k": "v" } });
    expect((p.of("POST")[0]!.body as { type: string }).type).toBe("t:HeldPartyFieldClaim");
    expect(p.at(ORIGIN_A).get("n1")!.type).toBe("t:HeldPartyFieldClaim");
  });
  it("signs the write with the write credential", async () => {
    const p = fakePlatform();
    await createResource(VAULT_A, { type: "t:X", facts: { "a:k": "v" } });
    expect(p.of("POST")[0]!.headers["authorization"]).toBe("DPoP t");
  });
  it("rejects when the vault refuses the create", async () => {
    fakePlatform();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, headers: new Headers(), json: async () => ({}), text: async () => "" }) as unknown as Response));
    await expect(createResource(VAULT_A, { type: "t:X", facts: {} })).rejects.toBeTruthy();
  });
});

describe("getResource", () => {
  it("reads the entity at its OWN node and answers the served facts, the etag and the type", async () => {
    const p = fakePlatform();
    const c = await createResource(VAULT_B, { type: "t:HeldPartyFieldClaim", facts: { "a:note": "n" } });
    const g = await getResource(c.id, VAULT_B, c.location);
    expect(p.of("GET")[0]!.origin).toBe(ORIGIN_B);
    expect(g.gone).toBe(false);
    expect(g.doc["a:note"] ?? g.doc["note"]).toBe("n");
    expect(g.etag).toBe(c.etag);
    expect(g.typeUri).toBeTruthy();
  });
  it("without an entity address it builds one under the vault named", async () => {
    const p = fakePlatform();
    const c = await createResource(VAULT_B, { type: "t:X", facts: { "a:k": "v" } });
    await getResource(c.id, VAULT_B);
    expect(p.of("GET")[0]!.origin).toBe(ORIGIN_B);
  });
  it("a 404 is an empty document with gone = true and no etag", async () => {
    fakePlatform();
    expect(await getResource("nope", VAULT_A, `${VAULT_A}/e/nope`)).toEqual({ doc: {}, etag: null, gone: true });
  });
  it("asked at a node that does not hold the entity it is gone, not an error", async () => {
    fakePlatform();
    const c = await createResource(VAULT_A, { type: "t:X", facts: { "a:k": "v" } });
    expect((await getResource(c.id, VAULT_B, `${VAULT_B}/e/${c.id}`)).gone).toBe(true);
  });
  it("any other failed read rejects", async () => {
    fakePlatform({ failGet: () => 500 });
    await expect(getResource("x", VAULT_A, `${VAULT_A}/e/x`)).rejects.toBeTruthy();
  });
});

describe("patchResource", () => {
  it("PATCHes a merge patch at the entity's own node, one a: off each key, null clears", async () => {
    const p = fakePlatform();
    const c = await createResource(VAULT_B, { type: "t:X", facts: { "a:note": "old", "a:keep": "k" } });
    const r = await patchResource(c.id, { "a:note": null, "a:other": "new" }, VAULT_B, c.location);
    const sent = p.of("PATCH")[0]!;
    expect(sent.origin).toBe(ORIGIN_B);
    expect(sent.headers["content-type"]).toBe("application/merge-patch+json");
    expect(Object.keys(sent.body as object).sort()).toEqual(["a:note", "a:other"]);
    expect((sent.body as Record<string, unknown>)["a:note"]).toBeNull();
    expect(r.etag).toMatch(/^"v2-/);
    const held = p.at(ORIGIN_B).get(c.id)!.facts;
    expect("a:note" in held).toBe(false);
    expect(held["a:keep"]).toBe("k");
  });
  it("without an entity address it builds one under the vault named", async () => {
    const p = fakePlatform();
    const c = await createResource(VAULT_B, { type: "t:X", facts: { "a:k": "v" } });
    await patchResource(c.id, { "a:k": "w" }, VAULT_B);
    expect(p.of("PATCH")[0]!.origin).toBe(ORIGIN_B);
  });
  it("rejects when the node does not hold the entity", async () => {
    fakePlatform();
    await expect(patchResource("nope", { "a:k": "v" }, VAULT_A, `${VAULT_A}/e/nope`)).rejects.toBeTruthy();
  });
});

describe("deleteResource", () => {
  it("DELETEs at the entity's own node and the entity is then gone", async () => {
    const p = fakePlatform();
    const c = await createResource(VAULT_B, { type: "t:X", facts: { "a:k": "v" } });
    await deleteResource(c.id, VAULT_B, c.location);
    expect(p.of("DELETE")[0]!.origin).toBe(ORIGIN_B);
    expect((await getResource(c.id, VAULT_B, c.location)).gone).toBe(true);
  });
  it("a 404 is already gone, not an error", async () => {
    fakePlatform();
    await expect(deleteResource("nope", VAULT_A, `${VAULT_A}/e/nope`)).resolves.toBeUndefined();
  });
  it("the entity address wins over the vault named: the DELETE goes to the address's own node", async () => {
    const p = fakePlatform();
    const c = await createResource(VAULT_B, { type: "t:X", facts: { "a:k": "v" } });
    await deleteResource(c.id, VAULT_A, c.location);
    expect(p.of("DELETE")[0]!.origin).toBe(ORIGIN_B);
    expect(p.at(ORIGIN_B).has(c.id)).toBe(false);
  });
  it("without an entity address it builds one under the vault named", async () => {
    const p = fakePlatform();
    const c = await createResource(VAULT_B, { type: "t:X", facts: { "a:k": "v" } });
    await deleteResource(c.id, VAULT_B);
    expect(p.of("DELETE")[0]!.origin).toBe(ORIGIN_B);
  });
});

describe("readResources", () => {
  it("reads each address in input order, with its id", async () => {
    const p = fakePlatform();
    const a = await createResource(VAULT_A, { type: "t:X", facts: { "a:k": "1" } });
    const b = await createResource(VAULT_A, { type: "t:X", facts: { "a:k": "2" } });
    const out = await readResources([b.location, a.location], VAULT_A);
    expect(out.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(out.map((r) => r.uri)).toEqual([b.location, a.location]);
    expect(out.every((r) => !r.gone && Object.keys(r.doc).length > 0 && !!r.typeUri)).toBe(true);
    expect(p.of("GET")).toHaveLength(2);
  });
  it("a record the store answers 404 for comes back gone with an empty document; the rest still read", async () => {
    fakePlatform();
    const a = await createResource(VAULT_A, { type: "t:X", facts: { "a:k": "1" } });
    const out = await readResources([`${VAULT_A}/e/missing`, a.location], VAULT_A);
    expect(out[0]).toEqual({ id: "missing", uri: `${VAULT_A}/e/missing`, doc: {}, gone: true });
    expect(out[1]!.gone).toBe(false);
  });
  it("any other failed read rejects the whole read", async () => {
    fakePlatform({ failGet: (id) => (id === "n2" ? 500 : null) });
    const a = await createResource(VAULT_A, { type: "t:X", facts: {} });
    const b = await createResource(VAULT_A, { type: "t:X", facts: {} });
    await expect(readResources([a.location, b.location], VAULT_A)).rejects.toBeTruthy();
  });
  it("an empty list reads nothing", async () => {
    const p = fakePlatform();
    expect(await readResources([], VAULT_A)).toEqual([]);
    expect(p.seen).toHaveLength(0);
  });
  it("never has more than 6 reads in flight, and does read in parallel", async () => {
    const gates: Array<() => void> = [];
    const p = fakePlatform({ slow: () => new Promise<void>((r) => gates.push(r)) });
    const uris: string[] = [];
    for (let i = 0; i < 14; i++) uris.push((await createResource(VAULT_A, { type: "t:X", facts: { "a:k": String(i) } })).location);
    const done = readResources(uris, VAULT_A);
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 5));
      while (gates.length) gates.shift()!();
    }
    const out = await done;
    expect(out).toHaveLength(14);
    expect(p.peak()).toBe(6);
  });
  it("asks each address at its own node, whatever the vault named", async () => {
    const p = fakePlatform();
    const a = await createResource(VAULT_B, { type: "t:X", facts: { "a:k": "1" } });
    const out = await readResources([a.location], VAULT_A);
    expect(p.of("GET")[0]!.origin).toBe(ORIGIN_B);
    expect(out[0]!.gone).toBe(false);
  });
});
