import { describe, expect, it } from "vitest";
import { body, json, vaultUrl, world, type Who, type World } from "./support";

const GRANT = "https://ann.fake.test/base/authz/grant-vault";
const REVOKE = "https://ann.fake.test/base/authz/revoke-vault";
const ACL = (v: string): string => `https://ann.fake.test/base/consent/vault-acl?vault=${encodeURIComponent(v)}`;
const grant = (w: World, a: Who, b: unknown, url = GRANT) => a.fetch(url, { method: "POST", ...json(b) });
const SENTENCE = (p: string, v: string) => `Principal ${p} does not hold acl:Control on the target vault ${v} — grant/revoke requires vault ownership or a delegated Control capability (Cycle053 VDS-6 delegable-Control gate)`;

describe("POST /base/authz/grant-vault (row 18)", () => {
  it("201 { vault, grantee, mode, granted:true }; the grantee is the resolved principal", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const res = await grant(w, a, { vault: w.annV.id, grantee: w.ben.principal, mode: "read" });
    expect(res.status).toBe(201);
    expect(await body(res)).toEqual({ vault: w.annV.id, grantee: w.ben.principal, mode: "read", granted: true });
    expect([...w.fake.state.grants.get(w.annV.id)!.get(w.ben.principal)!]).toEqual(["read"]);
  });
  it("write plants read in the same act; granting again is 201 again and changes nothing", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    for (let i = 0; i < 2; i++) expect((await grant(w, a, { vault: w.annV.id, grantee: w.ben.principal, mode: "write" })).status).toBe(201);
    expect([...w.fake.state.grants.get(w.annV.id)!.get(w.ben.principal)!].sort()).toEqual(["read", "write"]);
  });
  it("the four modes are accepted; any other is 400", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    for (const mode of ["read", "write", "append", "control"]) expect((await grant(w, a, { vault: w.annV.id, grantee: w.ben.principal, mode })).status, mode).toBe(201);
    const bad = await grant(w, a, { vault: w.annV.id, grantee: w.ben.principal, mode: "admin" });
    expect(bad.status).toBe(400);
  });
  it("400 for a body that is not { vault, grantee, mode }: missing keys, an extra key, empty strings, bad JSON", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const ok = { vault: w.annV.id, grantee: w.ben.principal, mode: "read" };
    for (const b of [{ ...ok, vault: undefined }, { ...ok, grantee: undefined }, { ...ok, mode: undefined }, { ...ok, extra: 1 }, { ...ok, vault: "" }, { ...ok, grantee: "" }, []]) {
      expect((await grant(w, a, b)).status, JSON.stringify(b)).toBe(400);
    }
    expect((await a.fetch(GRANT, { method: "POST", body: "{nope" })).status).toBe(400);
    expect(w.fake.state.grants.size).toBe(0);
  });
  it("only a Control holder: a reader, a stranger and the owner of another vault get 403 with the platform's sentence; an unknown vault is the same 403", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "write");
    for (const who of [w.ben, w.cat]) {
      const x = await w.as(who);
      const res = await grant(w, x, { vault: w.annV.id, grantee: w.cat.principal, mode: "read" });
      expect(res.status).toBe(403);
      expect(await body(res)).toEqual({ error: "Forbidden", message: SENTENCE(who.principal, w.annV.id) });
    }
    const ghost = "https://ghost.fake.test/vault";
    const g = await grant(w, await w.as(w.ann), { vault: ghost, grantee: w.cat.principal, mode: "read" });
    expect(g.status).toBe(403);
    expect((await body(g)).message).toBe(SENTENCE(w.ann.principal, ghost));
    expect(w.fake.state.grants.get(w.annV.id)!.has(w.cat.principal)).toBe(false);
  });
  it("a delegated Control holder may grant", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "control");
    expect((await grant(w, await w.as(w.ben), { vault: w.annV.id, grantee: w.cat.principal, mode: "read" })).status).toBe(201);
  });
  it("no credential is 401 (a strict row), in platform mode too", async () => {
    for (const dpop of ["strict", "platform"] as const) {
      const w = await world({ dpop });
      const res = await w.fake.fetch(GRANT, { method: "POST", ...json({ vault: w.annV.id, grantee: w.ben.principal, mode: "read" }) });
      expect(res.status, dpop).toBe(401);
    }
  });
  it("the grantee can then reach the vault: a read grant lists, a write grant creates, nothing before", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const c = await w.as(w.cat);
    expect((await c.fetch(vaultUrl(w.annV, "/files"))).status).toBe(403);
    await grant(w, a, { vault: w.annV.id, grantee: w.cat.principal, mode: "read" });
    expect((await c.fetch(vaultUrl(w.annV, "/files"))).status).toBe(200);
    expect((await c.fetch(vaultUrl(w.annV, "/c"), { method: "POST", ...json({ facts: {} }) })).status).toBe(403);
    await grant(w, a, { vault: w.annV.id, grantee: w.cat.principal, mode: "write" });
    expect((await c.fetch(vaultUrl(w.annV, "/c"), { method: "POST", ...json({ facts: {} }) })).status).toBe(201);
  });
  describe("what a grantee string names (src/authz/vault-grant.ts:170-345): the PLATFORM's answer, not the client's", () => {
    it("a vault address, a short WebID and a bare host that name a vault resolve to its holder", async () => {
      const w = await world();
      const a = await w.as(w.ann);
      for (const grantee of ["https://ben.fake.test/vault", "https://ben.fake.test/base", "https://ben.fake.test/i", "https://ben.fake.test", "https://ben.fake.test/"]) {
        const res = await grant(w, a, { vault: w.annV.id, grantee, mode: "read" });
        expect(res.status, grantee).toBe(201);
        expect((await body(res)).grantee, grantee).toBe(w.ben.principal);
      }
    });
    it("a bare host or short WebID that names no vault, on this platform's host family, is 400 'names no one'; nothing stored", async () => {
      const w = await world();
      const a = await w.as(w.ann);
      for (const grantee of ["https://nobody.fake.test", "https://nobody.fake.test/", "https://nobody.fake.test/i"]) {
        const res = await grant(w, a, { vault: w.annV.id, grantee, mode: "read" });
        expect(res.status, grantee).toBe(400);
        expect(await body(res)).toEqual({ error: "BadRequest", message: `"${grantee}" names no one on GilbPlatform. Use their vault address, for example https://<name>.fake.test/vault.` });
      }
      expect(w.fake.state.grants.size).toBe(0);
    });
    it("a foreign host, an unknown vault address and an opaque key are stored as sent (201)", async () => {
      const w = await world();
      const a = await w.as(w.ann);
      for (const grantee of ["https://elsewhere.example", "https://nobody.fake.test/vault", "https://id.fake.test/base/p/xyz", "https://fake.test/base/g/group1"]) {
        const res = await grant(w, a, { vault: w.annV.id, grantee, mode: "read" });
        expect(res.status, grantee).toBe(201);
        expect((await body(res)).grantee).toBe(grantee);
      }
    });
  });
});

describe("POST /base/authz/revoke-vault (row 19)", () => {
  it("200 { vault, grantee, mode, revoked:true } when it took a held mode; revoked:false when none was held (still 200)", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "read");
    const a = await w.as(w.ann);
    const first = await grant(w, a, { vault: w.annV.id, grantee: w.ben.principal, mode: "read" }, REVOKE);
    expect(first.status).toBe(200);
    expect(await body(first)).toEqual({ vault: w.annV.id, grantee: w.ben.principal, mode: "read", revoked: true });
    const second = await grant(w, a, { vault: w.annV.id, grantee: w.ben.principal, mode: "read" }, REVOKE);
    expect(second.status).toBe(200);
    expect((await body(second)).revoked).toBe(false);
  });
  it("revoking write leaves the planted read; revoking read then ends the reach", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const b = await w.as(w.ben);
    await grant(w, a, { vault: w.annV.id, grantee: w.ben.principal, mode: "write" });
    expect((await body(await grant(w, a, { vault: w.annV.id, grantee: w.ben.principal, mode: "write" }, REVOKE))).revoked).toBe(true);
    expect([...w.fake.state.grants.get(w.annV.id)!.get(w.ben.principal)!]).toEqual(["read"]);
    expect((await b.fetch(vaultUrl(w.annV, "/files"))).status).toBe(200);
    expect((await b.fetch(vaultUrl(w.annV, "/c"), { method: "POST", ...json({ facts: {} }) })).status).toBe(403);
    expect((await body(await grant(w, a, { vault: w.annV.id, grantee: w.ben.principal, mode: "read" }, REVOKE))).revoked).toBe(true);
    expect((await b.fetch(vaultUrl(w.annV, "/files"))).status).toBe(403);
  });
  it("a vault address resolves to the holder, as on grant", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "read");
    const res = await grant(w, await w.as(w.ann), { vault: w.annV.id, grantee: "https://ben.fake.test/vault", mode: "read" }, REVOKE);
    expect(await body(res)).toMatchObject({ grantee: w.ben.principal, revoked: true });
  });
  it("only a Control holder (403 with the sentence); 400 for a bad body; 401 without a credential", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "write");
    const res = await grant(w, await w.as(w.ben), { vault: w.annV.id, grantee: w.ben.principal, mode: "write" }, REVOKE);
    expect(res.status).toBe(403);
    expect((await body(res)).message).toBe(SENTENCE(w.ben.principal, w.annV.id));
    expect([...w.fake.state.grants.get(w.annV.id)!.get(w.ben.principal)!].sort()).toEqual(["read", "write"]);
    expect((await grant(w, await w.as(w.ann), { vault: w.annV.id, mode: "read" }, REVOKE)).status).toBe(400);
    expect((await w.fake.fetch(REVOKE, { method: "POST", ...json({}) })).status).toBe(401);
  });
});

describe("GET /base/consent/vault-acl (row 20)", () => {
  it("200 { vault, scope, note, acl, edges, chainReach, unclassifiedRows }; the owner row is control, owner-inferred", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const res = await a.fetch(ACL(w.annV.id));
    expect(res.status).toBe(200);
    const d = await body(res);
    expect(Object.keys(d).sort()).toEqual(["acl", "chainReach", "edges", "note", "scope", "unclassifiedRows", "vault"]);
    expect(d).toMatchObject({ vault: w.annV.id, scope: "pod", edges: [], chainReach: [], unclassifiedRows: 0 });
    expect(d.note).toMatch(/^Whole-vault grants on both planes: principal\/group grants \(and owner\/delegated control\), plus vault→vault reach edges/);
    expect(d.note).toMatch(/Does NOT include per-record grants\.$/);
    expect(d.acl).toEqual([{ principal: w.ann.principal, levels: ["control"], label: null, webId: null, kind: "owner-inferred", labelSource: null, registered: true, viewer: "self" }]);
  });
  it("grant rows have the eight fields, kind grant, levels in the platform's order (read, append, write, control), and the list is sorted by principal", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "control");
    w.fake.grant(w.annV, w.ben, "write");
    w.fake.grant(w.annV, w.ben, "append");
    w.fake.grant(w.annV, w.cat, "read");
    const d = await body(await (await w.as(w.ann)).fetch(ACL(w.annV.id)));
    expect(d.acl.map((r: { principal: string }) => r.principal)).toEqual([w.ann.principal, w.ben.principal, w.cat.principal].sort());
    const ben = d.acl.find((r: { principal: string }) => r.principal === w.ben.principal);
    expect(ben).toEqual({ principal: w.ben.principal, levels: ["read", "append", "write", "control"], label: null, webId: null, kind: "grant", labelSource: null, registered: true, viewer: null });
    expect(Object.keys(ben).sort()).toEqual(["kind", "label", "labelSource", "levels", "principal", "registered", "viewer", "webId"]);
    expect(d.acl.find((r: { principal: string }) => r.principal === w.cat.principal).levels).toEqual(["read"]);
  });
  it("404 { error: 'not found' } for a caller without Control (a reader included) and for an unknown vault", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "write");
    for (const who of [w.ben, w.cat]) {
      const res = await (await w.as(who)).fetch(ACL(w.annV.id));
      expect(res.status).toBe(404);
      expect(await body(res)).toEqual({ error: "not found" });
    }
    expect((await (await w.as(w.ann)).fetch(ACL("https://ghost.fake.test/vault"))).status).toBe(404);
  });
  it("a delegated Control holder reads it", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "control");
    expect((await (await w.as(w.ben)).fetch(ACL(w.annV.id))).status).toBe(200);
  });
  it("401 without a credential; 400 without vault= or with another key", async () => {
    const w = await world();
    expect((await w.fake.fetch(ACL(w.annV.id))).status).toBe(401);
    const a = await w.as(w.ann);
    expect((await a.fetch("https://ann.fake.test/base/consent/vault-acl")).status).toBe(400);
    expect((await a.fetch(`${ACL(w.annV.id)}&x=1`)).status).toBe(400);
  });
  it("grant then revoke shows in the list at once, and a revoked person's row goes", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    await grant(w, a, { vault: w.annV.id, grantee: w.ben.principal, mode: "read" });
    expect((await body(await a.fetch(ACL(w.annV.id)))).acl).toHaveLength(2);
    await grant(w, a, { vault: w.annV.id, grantee: w.ben.principal, mode: "read" }, REVOKE);
    expect((await body(await a.fetch(ACL(w.annV.id)))).acl).toHaveLength(1);
  });
});
