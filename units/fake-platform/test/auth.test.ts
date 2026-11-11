import { dpopProof, generateDpopKeyPair } from "@kaigilb/gilbplatformcode-signin";
import { describe, expect, it } from "vitest";
import { body, recUrl, vaultUrl, world } from "./support";

const LIST = "https://fake.test/lws/vaults";

describe("strict mode (the default): every route needs Authorization: DPoP <token> and a DPoP header", () => {
  it("no headers: 401 with the platform's body and a note header", async () => {
    const w = await world();
    const res = await w.fake.fetch(LIST);
    expect(res.status).toBe(401);
    expect(await body(res)).toMatchObject({ error: "Unauthorized" });
    expect(res.headers.get("x-fake-platform-note")).toBe("strict-dpop");
    expect(w.fake.calls.last()!.proof.ok).toBe(false);
  });
  it("a token without a proof header is 401", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    expect((await w.fake.fetch(LIST, { headers: { authorization: `DPoP ${a.token}` } })).status).toBe(401);
  });
  it("a Bearer token is 401", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    expect((await w.fake.fetch(LIST, { headers: { authorization: `Bearer ${a.token}`, dpop: "x" } })).status).toBe(401);
  });
  it("a token the fake did not issue is 401", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const h = await a.headers("GET", LIST);
    expect((await w.fake.fetch(LIST, { headers: { ...h, Authorization: "DPoP forged.token.here" } })).status).toBe(401);
  });
  it("a signed call succeeds, names the caller in the call log and proves the proof", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    expect((await a.fetch(LIST)).status).toBe(200);
    const c = w.fake.calls.last()!;
    expect(c.as).toEqual({ principal: w.ann.principal, email: w.ann.email });
    expect(c.proof).toEqual({ ok: true });
  });
  it("the principal comes from the token: ben sees ben's vault, not ann's", async () => {
    const w = await world();
    const b = await w.as(w.ben);
    const v = await body(await b.fetch(LIST));
    expect(v.vaults.map((x: { name: string }) => x.name)).toEqual(["ben"]);
  });
});

describe("proof claims (src/auth/verify.ts), in both modes", () => {
  for (const mode of ["strict", "platform"] as const) {
    describe(mode, () => {
      it("htm: a proof for another method is 401", async () => {
        const w = await world({ dpop: mode });
        const a = await w.as(w.ann);
        const proof = await dpopProof(a.key, "POST", LIST, a.token);
        const res = await w.fake.fetch(LIST, { headers: { authorization: `DPoP ${a.token}`, dpop: proof } });
        expect(res.status).toBe(401);
        expect((await body(res)).message).toMatch(/htm/);
      });
      it("htu: a proof for another path or host is 401", async () => {
        const w = await world({ dpop: mode });
        const a = await w.as(w.ann);
        for (const other of ["https://fake.test/lws/other", "https://ben.fake.test/lws/vaults"]) {
          const proof = await dpopProof(a.key, "GET", other, a.token);
          const res = await w.fake.fetch(LIST, { headers: { authorization: `DPoP ${a.token}`, dpop: proof } });
          expect(res.status, other).toBe(401);
          expect((await body(res)).message).toMatch(/htu/);
        }
      });
      it("htu: the query is dropped, the path is compared as sent (percent-escapes kept), and the 401 body is the platform's {error,message} (verify.ts:319)", async () => {
        const w = await world({ dpop: mode });
        const a = await w.as(w.ann);
        const enc = `https://ann.fake.test/lws/vault/${encodeURIComponent("https://ann.fake.test/vault")}/records`;
        expect((await a.fetch(`${enc}?type=Sailboat&include=body`)).status).toBe(200);
        for (const bad of [`https://ann.fake.test/lws/vault/${decodeURIComponent(encodeURIComponent("https://ann.fake.test/vault"))}/records`, `https://fake.test/lws/vault/${encodeURIComponent("https://ann.fake.test/vault")}/records`]) {
          const proof = await dpopProof(a.key, "GET", bad, a.token);
          const res = await w.fake.fetch(enc, { headers: { authorization: `DPoP ${a.token}`, dpop: proof } });
          expect(res.status, bad).toBe(401);
          expect(await body(res)).toMatchObject({ error: "Unauthorized", message: "DPoP proof htu does not match the request URI" });
        }
      });
      it("htu is https:// plus the host even when the request went over http", async () => {
        const w = await world({ dpop: mode, hosts: ["localhost:5173"] });
        const a = await w.as(w.ann);
        const url = "http://localhost:5173/lws/vaults";
        expect((await a.fetch(url)).status).toBe(200);
      });
      it("ath: a proof made for another token is 401", async () => {
        const w = await world({ dpop: mode });
        const a = await w.as(w.ann);
        const proof = await dpopProof(a.key, "GET", LIST, "some-other-token");
        const res = await w.fake.fetch(LIST, { headers: { authorization: `DPoP ${a.token}`, dpop: proof } });
        expect(res.status).toBe(401);
        expect((await body(res)).message).toMatch(/ath/);
      });
      it("iat: a stale proof is 401", async () => {
        const w = await world({ dpop: mode });
        const a = await w.as(w.ann);
        const h = await a.headers("GET", LIST);
        w.clock.ms += 120_000;
        const res = await w.fake.fetch(LIST, { headers: h });
        expect(res.status).toBe(401);
        expect((await body(res)).message).toMatch(/freshness/);
      });
      it("jti: a proof used twice is 401 the second time", async () => {
        const w = await world({ dpop: mode });
        const a = await w.as(w.ann);
        const h = await a.headers("GET", LIST);
        expect((await w.fake.fetch(LIST, { headers: h })).status).toBe(200);
        const again = await w.fake.fetch(LIST, { headers: h });
        expect(again.status).toBe(401);
        expect((await body(again)).message).toMatch(/already been used/);
      });
      it("cnf.jkt: a proof signed with another key is 401", async () => {
        const w = await world({ dpop: mode });
        const a = await w.as(w.ann);
        const other = await generateDpopKeyPair();
        const proof = await dpopProof(other, "GET", LIST, a.token);
        const res = await w.fake.fetch(LIST, { headers: { authorization: `DPoP ${a.token}`, dpop: proof } });
        expect(res.status).toBe(401);
        expect((await body(res)).message).toMatch(/bound key/);
      });
    });
  }
});

describe('platform mode: the platform\'s own postures on /lws (src/auth/bearer-principal.ts:107-184, src/lws/auth.ts)', () => {
  it("no credential is anonymous: the vault list is 200 and empty, not 401", async () => {
    const w = await world({ dpop: "platform" });
    const res = await w.fake.fetch(LIST);
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ total: 0, vaults: [], complete: true });
    expect(w.fake.calls.last()!.as).toBeUndefined();
  });
  it("anonymous: a vault list of records is 403, a record read 404, a create 403", async () => {
    const w = await world({ dpop: "platform" });
    const r = w.fake.seedRecord(w.annV, { type: "Note", facts: { name: "x" } });
    expect((await w.fake.fetch(vaultUrl(w.annV, "/records?type=Note"))).status).toBe(403);
    expect((await w.fake.fetch(recUrl(w.annV, r.id))).status).toBe(404);
    const create = await w.fake.fetch(vaultUrl(w.annV, "/c"), { method: "POST", body: JSON.stringify({ facts: {} }) });
    expect(create.status).toBe(403);
  });
  it("a DPoP token with no proof is accepted on /lws (proof-less)", async () => {
    const w = await world({ dpop: "platform" });
    const a = await w.as(w.ann);
    const res = await w.fake.fetch(LIST, { headers: { authorization: `DPoP ${a.token}` } });
    expect(res.status).toBe(200);
    expect((await body(res)).vaults).toHaveLength(1);
    expect(w.fake.calls.last()!.proof.ok).toBe(false);
  });
  it("a Bearer token is accepted on /lws", async () => {
    const w = await world({ dpop: "platform" });
    const a = await w.as(w.ann);
    expect((await body(await w.fake.fetch(LIST, { headers: { authorization: `Bearer ${a.token}` } }))).vaults).toHaveLength(1);
  });
  it("another scheme, or a token the fake never issued, is 401", async () => {
    const w = await world({ dpop: "platform" });
    expect((await w.fake.fetch(LIST, { headers: { authorization: "Basic abc" } })).status).toBe(401);
    expect((await w.fake.fetch(LIST, { headers: { authorization: "Bearer nope" } })).status).toBe(401);
  });
  it("an expired token is 401", async () => {
    const w = await world({ dpop: "platform" });
    const a = await w.as(w.ann);
    w.clock.ms += 8 * 24 * 3600 * 1000; // the token lives 7 days (src/config/index.ts:643)
    const res = await w.fake.fetch(LIST, { headers: { authorization: `Bearer ${a.token}` } });
    expect(res.status).toBe(401);
    expect((await body(res)).message).toMatch(/expired/);
  });
});
