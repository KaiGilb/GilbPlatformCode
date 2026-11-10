import { describe, expect, it } from "vitest";
import { body, idOf, json, recUrl, vaultUrl, world } from "./support";

const SHA_ETAG = /^"sha256:[0-9a-f]{64}"$/;

async function made(w: Awaited<ReturnType<typeof world>>, facts: Record<string, unknown> = { "a:name": "Heron", "a:berthCount": 4 }) {
  const a = await w.as(w.ann);
  const res = await a.fetch(vaultUrl(w.annV, "/c"), { method: "POST", ...json({ type: "t:Sailboat", facts }) });
  const loc = res.headers.get("location")!;
  return { a, res, id: idOf(loc), loc };
}

describe("POST /lws/vault/:vault/c (row 7)", () => {
  it("201: { @id } = Location = https://<vault host>/lws/r/<id>, with a sha256 ETag", async () => {
    const w = await world();
    const { res, id, loc } = await made(w);
    expect(res.status).toBe(201);
    expect(loc).toBe(`https://ann.fake.test/lws/r/${id}`);
    expect(await body(res)).toEqual({ "@id": loc });
    expect(res.headers.get("etag")).toMatch(SHA_ETAG);
    const r = w.fake.state.records.get(id)!;
    expect(r).toMatchObject({ type: "Sailboat", vaultId: w.annV.id, facts: { name: "Heron", berthCount: 4 } });
  });
  it("400 for a body that is not { type?, facts, agent? }: no facts, an extra key, facts not an object, bad JSON", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const post = (b: BodyInit) => a.fetch(vaultUrl(w.annV, "/c"), { method: "POST", body: b });
    expect((await post(JSON.stringify({ type: "t:X" }))).status).toBe(400);
    const extra = await post(JSON.stringify({ facts: {}, other: 1 }));
    expect(extra.status).toBe(400);
    expect((await body(extra)).message).toMatch(/additional properties/);
    expect((await post(JSON.stringify({ facts: [] }))).status).toBe(400);
    expect((await post("{nope")).status).toBe(400);
    expect(w.fake.state.records.size).toBe(0);
  });
  it("400 vault_name_unresolved when the vault id is not an https vault URI (a plain http one included)", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    for (const bad of ["http://ann.fake.test/vault", "https://ann.fake.test/other", "ann"]) {
      const res = await a.fetch(`https://ann.fake.test/lws/vault/${encodeURIComponent(bad)}/c`, { method: "POST", ...json({ facts: {} }) });
      expect(res.status, bad).toBe(400);
      expect((await body(res)).error).toBe("vault_name_unresolved");
    }
  });
  it("403 vault target denied for a reader, a stranger and a vault that does not exist", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "read");
    for (const who of [w.ben, w.cat]) {
      const x = await w.as(who);
      const res = await x.fetch(vaultUrl(w.annV, "/c"), { method: "POST", ...json({ facts: {} }) });
      expect(res.status).toBe(403);
      expect((await body(res)).message).toBe(`vault target denied: the principal holds no write reach on vault ${w.annV.id}`);
    }
    const a = await w.as(w.ann);
    const none = await a.fetch(`https://ann.fake.test/lws/vault/${encodeURIComponent("https://ghost.fake.test/vault")}/c`, { method: "POST", ...json({ facts: {} }) });
    expect(none.status).toBe(403);
    expect(w.fake.state.records.size).toBe(0);
  });
  it("a write grant lets another person create in the vault", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "write");
    const b = await w.as(w.ben);
    expect((await b.fetch(vaultUrl(w.annV, "/c"), { method: "POST", ...json({ facts: { name: "x" } }) })).status).toBe(201);
  });
  it("409 UndefinedTermError for a key the vault was told is undefined; nothing is stored", async () => {
    const w = await world({ undefinedTerms: ["a:bogus"] });
    const a = await w.as(w.ann);
    const res = await a.fetch(vaultUrl(w.annV, "/c"), { method: "POST", ...json({ type: "t:X", facts: { "a:bogus": 1 } }) });
    expect(res.status).toBe(409);
    expect((await body(res)).error).toBe("UndefinedTermError");
    expect(w.fake.state.records.size).toBe(0);
  });
});

describe("GET /lws/r/:id (row 8)", () => {
  it("200: the document with @context, @id (the entity URI), @type and bare facts, plus the ETag the create gave", async () => {
    const w = await world();
    const { a, res, id } = await made(w);
    const read = await a.fetch(recUrl(w.annV, id));
    expect(read.status).toBe(200);
    expect(read.headers.get("etag")).toBe(res.headers.get("etag"));
    expect(await body(read)).toEqual({ "@context": "https://www.w3.org/ns/lws/v1", "@id": `https://ann.fake.test/vault/e/${id}`, "@type": "t:Sailboat", name: "Heron", berthCount: 4 });
  });
  it("404 for an absent id, for a caller with no read reach, and when addressed at another host", async () => {
    const w = await world();
    const { a, id } = await made(w);
    expect((await a.fetch(recUrl(w.annV, "nope"))).status).toBe(404);
    const c = await w.as(w.cat);
    const denied = await c.fetch(recUrl(w.annV, id));
    expect(denied.status).toBe(404);
    expect(await body(denied)).toMatchObject({ error: "NotFound" });
    expect((await a.fetch(`https://ben.fake.test/lws/r/${id}`)).status).toBe(404);
  });
  it("a reader can read", async () => {
    const w = await world();
    const { id } = await made(w);
    w.fake.grant(w.annV, w.ben, "read");
    const b = await w.as(w.ben);
    expect((await b.fetch(recUrl(w.annV, id))).status).toBe(200);
  });
  it("an ended record answers the type-only 200 marked ended (src/lws/resource-frame.ts:33-40), not 404", async () => {
    const w = await world();
    const { a, id } = await made(w);
    expect((await a.fetch(recUrl(w.annV, id), { method: "DELETE" })).status).toBe(204);
    const read = await a.fetch(recUrl(w.annV, id));
    expect(read.status).toBe(200);
    expect(await body(read)).toEqual({ "@context": "https://www.w3.org/ns/lws/v1", "@id": `https://ann.fake.test/vault/e/${id}`, "@type": "t:Sailboat", "a:entityLifecycleState": "ended", "a:endingActorKind": "holder" });
  });
  it("the ETag moves with the facts and with bump", async () => {
    const w = await world();
    const { a, id, res } = await made(w);
    const before = res.headers.get("etag");
    w.fake.bump(id);
    const bumped = (await a.fetch(recUrl(w.annV, id))).headers.get("etag");
    expect(bumped).toMatch(SHA_ETAG);
    expect(bumped).not.toBe(before);
    w.fake.edit(id, { name: "Other" });
    expect((await a.fetch(recUrl(w.annV, id))).headers.get("etag")).not.toBe(bumped);
  });
});

describe("PATCH /lws/r/:id (row 9)", () => {
  const patch = (a: { fetch: (u: string, i?: RequestInit) => Promise<Response> }, url: string, b: unknown, h: Record<string, string> = {}) =>
    a.fetch(url, { method: "PATCH", headers: { "content-type": "application/merge-patch+json", ...h }, body: JSON.stringify(b) });

  it("200 { @id } with a new ETag and Location; merges, and null removes a fact", async () => {
    const w = await world();
    const { a, id, loc, res } = await made(w);
    const p = await patch(a, recUrl(w.annV, id), { "a:name": "Egret", berthCount: null, colour: "blue" });
    expect(p.status).toBe(200);
    expect(await body(p)).toEqual({ "@id": loc });
    expect(p.headers.get("location")).toBe(loc);
    expect(p.headers.get("etag")).toMatch(SHA_ETAG);
    expect(p.headers.get("etag")).not.toBe(res.headers.get("etag"));
    const doc = await body(await a.fetch(recUrl(w.annV, id)));
    expect(doc).toMatchObject({ name: "Egret", colour: "blue" });
    expect(doc.berthCount).toBeUndefined();
  });
  it("If-Match with the current ETag passes; the new ETag is the one a read serves", async () => {
    const w = await world();
    const { a, id, res } = await made(w);
    const p = await patch(a, recUrl(w.annV, id), { name: "A" }, { "if-match": res.headers.get("etag")! });
    expect(p.status).toBe(200);
    expect((await a.fetch(recUrl(w.annV, id))).headers.get("etag")).toBe(p.headers.get("etag"));
  });
  it("412 with nothing written when the ETag is stale, after bump or another write", async () => {
    const w = await world();
    const { a, id, res } = await made(w);
    const etag = res.headers.get("etag")!;
    w.fake.bump(id);
    const p = await patch(a, recUrl(w.annV, id), { name: "Lost" }, { "if-match": etag });
    expect(p.status).toBe(412);
    expect(await body(p)).toMatchObject({ error: "PreconditionFailed" });
    expect(w.fake.state.records.get(id)!.facts.name).toBe("Heron");
  });
  it("If-Match: * matches an existing record; a W/ tag of the current ETag matches", async () => {
    const w = await world();
    const { a, id } = await made(w);
    expect((await patch(a, recUrl(w.annV, id), { n: 1 }, { "if-match": "*" })).status).toBe(200);
    const etag = (await a.fetch(recUrl(w.annV, id))).headers.get("etag")!;
    expect((await patch(a, recUrl(w.annV, id), { n: 2 }, { "if-match": `W/${etag}` })).status).toBe(200);
  });
  it("404 when absent, ended, or the caller cannot read it", async () => {
    const w = await world();
    const { a, id } = await made(w);
    expect((await patch(a, recUrl(w.annV, "nope"), { a: 1 })).status).toBe(404);
    const c = await w.as(w.cat);
    expect((await patch(c, recUrl(w.annV, id), { a: 1 })).status).toBe(404);
    w.fake.remove(id);
    expect((await patch(a, recUrl(w.annV, id), { a: 1 })).status).toBe(404);
  });
  it("403 for a reader without write; a stale If-Match is judged first (412)", async () => {
    const w = await world();
    const { id, res } = await made(w);
    w.fake.grant(w.annV, w.ben, "read");
    const b = await w.as(w.ben);
    expect((await patch(b, recUrl(w.annV, id), { a: 1 })).status).toBe(403);
    expect((await patch(b, recUrl(w.annV, id), { a: 1 }, { "if-match": '"sha256:00"' })).status).toBe(412);
    expect(res.status).toBe(201);
  });
  it("400 when the patch is not a JSON object", async () => {
    const w = await world();
    const { a, id } = await made(w);
    expect((await patch(a, recUrl(w.annV, id), [1])).status).toBe(400);
  });
});

describe("PUT /lws/r/:id (row 10)", () => {
  const put = (a: { fetch: (u: string, i?: RequestInit) => Promise<Response> }, url: string, b: unknown, h: Record<string, string> = {}) =>
    a.fetch(url, { method: "PUT", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b) });

  it("428 without If-Match", async () => {
    const w = await world();
    const { a, id } = await made(w);
    const res = await put(a, recUrl(w.annV, id), { facts: { name: "Z" } });
    expect(res.status).toBe(428);
    expect(await body(res)).toMatchObject({ error: "PreconditionRequired" });
  });
  it("201 when it changed the record (facts replaced, not merged), 200 when it changed nothing", async () => {
    const w = await world();
    const { a, id, res } = await made(w);
    const first = await put(a, recUrl(w.annV, id), { type: "t:Sailboat", facts: { name: "Z" } }, { "if-match": res.headers.get("etag")! });
    expect(first.status).toBe(201);
    expect(await body(first)).toEqual({ "@id": `https://ann.fake.test/lws/r/${id}` });
    expect(w.fake.state.records.get(id)!.facts).toEqual({ name: "Z" });
    const same = await put(a, recUrl(w.annV, id), { facts: { name: "Z" } }, { "if-match": first.headers.get("etag")! });
    expect(same.status).toBe(200);
  });
  it("412 on a stale tag, and on * or any tag for a record that does not exist", async () => {
    const w = await world();
    const { a, id } = await made(w);
    expect((await put(a, recUrl(w.annV, id), { facts: {} }, { "if-match": '"sha256:00"' })).status).toBe(412);
    expect((await put(a, recUrl(w.annV, "nope"), { facts: {} }, { "if-match": "*" })).status).toBe(412);
  });
  it("403 for a reader; 400 for a body without facts", async () => {
    const w = await world();
    const { a, id } = await made(w);
    w.fake.grant(w.annV, w.ben, "read");
    const b = await w.as(w.ben);
    expect((await put(b, recUrl(w.annV, id), { facts: {} }, { "if-match": "*" })).status).toBe(403);
    expect((await put(a, recUrl(w.annV, id), { type: "t:X" }, { "if-match": "*" })).status).toBe(400);
  });
});

describe("DELETE /lws/r/:id (row 11)", () => {
  it("204 with no body; the record leaves the live list and enters the ended one", async () => {
    const w = await world();
    const { a, id } = await made(w);
    const del = await a.fetch(recUrl(w.annV, id), { method: "DELETE" });
    expect(del.status).toBe(204);
    expect(await del.text()).toBe("");
    const live = await body(await a.fetch(vaultUrl(w.annV, "/records?type=Sailboat")));
    expect(live.records).toEqual([]);
    const ended = await body(await a.fetch(vaultUrl(w.annV, "/records?type=Sailboat&lifecycle=ended")));
    expect(ended.records.map((r: { entity: string }) => r.entity)).toEqual([`https://ann.fake.test/vault/e/${id}`]);
  });
  it("404 when absent or already ended", async () => {
    const w = await world();
    const { a, id } = await made(w);
    expect((await a.fetch(recUrl(w.annV, "nope"), { method: "DELETE" })).status).toBe(404);
    await a.fetch(recUrl(w.annV, id), { method: "DELETE" });
    expect((await a.fetch(recUrl(w.annV, id), { method: "DELETE" })).status).toBe(404);
  });
  it("403 for a reader (the record is not ended)", async () => {
    const w = await world();
    const { id } = await made(w);
    w.fake.grant(w.annV, w.ben, "read");
    const b = await w.as(w.ben);
    expect((await b.fetch(recUrl(w.annV, id), { method: "DELETE" })).status).toBe(403);
    expect(w.fake.state.records.get(id)!.endedSeq).toBeNull();
  });
  it("412 on a stale If-Match, and the record stays; the current ETag deletes", async () => {
    const w = await world();
    const { a, id, res } = await made(w);
    const etag = res.headers.get("etag")!;
    w.fake.bump(id);
    expect((await a.fetch(recUrl(w.annV, id), { method: "DELETE", headers: { "if-match": etag } })).status).toBe(412);
    expect(w.fake.state.records.get(id)!.endedSeq).toBeNull();
    const cur = (await a.fetch(recUrl(w.annV, id))).headers.get("etag")!;
    expect((await a.fetch(recUrl(w.annV, id), { method: "DELETE", headers: { "if-match": cur } })).status).toBe(204);
  });
});
