import { describe, expect, it } from "vitest";
import { body, json, vaultUrl, world, type Who, type World } from "./support";

const PERSON = "https://veda.gilb.com/base/t/Person";
const CLUB = "https://veda.gilb.com/base/t/Club";
const URL_ = "https://fake.test/base/vault/create-named";
const make = (a: Who, b: unknown) => a.fetch(URL_, { method: "POST", ...json(b) });
const HINT = " The body is { name, represents, parentVault? }; represents is the full GilbVeda type IRI of what the vault holds (a person's own vault: https://veda.gilb.com/base/t/Person).";
const MISSING = "represents is required: a vault must declare what kind of thing it is from the live shared type ontology, or the mint FAILS rather than defaulting. ⛔ Absence is not Person and is not undeclared-on-purpose at a creation path.";
const list = async (a: Who) => (await body(await a.fetch("https://fake.test/lws/vaults"))).vaults;

describe("POST /base/vault/create-named (row 6): 201", () => {
  it("answers { vault, vaultId, name, parent, represents, created:true, status:'live' }; the vault is made, owned by the caller, nested under the landing vault by default", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const res = await make(a, { name: "Sailboats", represents: CLUB });
    expect(res.status).toBe(201);
    const d = await body(res);
    const v = w.fake.state.vaults.get("https://sailboats.fake.test/vault")!;
    expect(d).toEqual({ vault: v.entity, vaultId: "https://sailboats.fake.test/vault", name: "sailboats", parent: w.annV.entity, represents: CLUB, created: true, status: "live" });
    expect(v).toMatchObject({ owner: w.ann.principal, represents: CLUB, partOf: w.annV.id, pending: false });
    expect(w.ann.landingVaultId).toBe(w.annV.id);
  });
  it("the vault list then names it with represents, partOf and @id; it is not the landing vault; the owner reads and writes", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    await make(a, { name: "Sailboats", represents: CLUB });
    const v = (await list(a)).find((x: { name: string }) => x.name === "sailboats");
    expect(v).toMatchObject({ vaultId: "https://sailboats.fake.test/vault", represents: CLUB, partOf: { vaultId: w.annV.id }, modes: ["read", "write"], isLandingVault: false });
    expect(v["@id"]).toMatch(/^https:\/\/sailboats\.fake\.test\/vault\/e\//);
    const nv = w.fake.state.vaults.get(v.vaultId)!;
    expect((await a.fetch(vaultUrl(nv, "/c"), { method: "POST", ...json({ facts: { name: "x" } }) })).status).toBe(201);
  });
  it("the name is normalised (My-Club becomes myclub) and the answer says the name saved", async () => {
    const w = await world();
    const d = await body(await make(await w.as(w.ann), { name: "My-Club", represents: CLUB }));
    expect(d).toMatchObject({ name: "myclub", vaultId: "https://myclub.fake.test/vault" });
  });
  it("an explicit parentVault (the parent's ENTITY URI) is the parent; the answer names it", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const first = await body(await make(a, { name: "first", represents: CLUB }));
    const d = await body(await make(a, { name: "second", represents: CLUB, parentVault: first.vault }));
    expect(d.parent).toBe(first.vault);
    expect(w.fake.state.vaults.get(d.vaultId)!.partOf).toBe("https://first.fake.test/vault");
  });
  it("a person with no vault: the first vault has no parent, becomes the landing vault, and its address becomes the person's principal", async () => {
    const w = await world();
    const c = await w.as(w.cat);
    const d = await body(await make(c, { name: "catvault", represents: PERSON }));
    expect(d).toMatchObject({ parent: null, status: "live" });
    expect(w.fake.state.people.get("cat@example.test")).toMatchObject({ landingVaultId: "https://catvault.fake.test/vault", principal: "https://catvault.fake.test/vault" });
    const v = (await list(c))[0];
    expect(v).toMatchObject({ name: "catvault", represents: PERSON, isLandingVault: true, partOf: null });
  });
  it("the vaultId segment follows createNamedVaultSegment: '/vault' by default, '/base' on request; the vault list always says /vault", async () => {
    for (const seg of ["vault", "base"] as const) {
      const w = await world({ createNamedVaultSegment: seg });
      const a = await w.as(w.ann);
      const d = await body(await make(a, { name: "club", represents: CLUB }));
      expect(d.vaultId).toBe(`https://club.fake.test/${seg}`);
      expect((await list(a)).map((x: { vaultId: string }) => x.vaultId)).toContain("https://club.fake.test/vault");
    }
  });
});

describe("create-named: refusals", () => {
  it("400 with the platform's sentence when represents is missing or empty; the sentence ends with the body hint", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    for (const b of [{ name: "club" }, { name: "club", represents: "   " }]) {
      const res = await make(a, b);
      expect(res.status).toBe(400);
      expect(await body(res)).toEqual({ error: "BadRequest", message: MISSING + HINT });
    }
    expect(w.fake.state.vaults.size).toBe(2);
  });
  it("400 when represents does not resolve (an unknown type, an http IRI, a bare word) and when it is the sign-in seat; the sentence names it", async () => {
    const w = await world({ knownTypes: [PERSON, CLUB] });
    const a = await w.as(w.ann);
    const bad = await body(await make(a, { name: "club", represents: "https://veda.gilb.com/base/t/Nope" }));
    expect(bad.message).toBe('represents "https://veda.gilb.com/base/t/Nope" does not currently resolve in the live shared type ontology, so it is not a declaration. ⛔ Nothing was minted.' + HINT);
    expect((await make(a, { name: "club", represents: "Club" })).status).toBe(400);
    const seat = await body(await make(a, { name: "club", represents: "a:signInVault" }));
    expect(seat.message).toBe('represents "a:signInVault" is the sign-in seat designation, not a Type a person may assign. a:signInPod is stamped only at account registration.' + HINT);
    expect((await make(a, { name: "club", represents: CLUB })).status).toBe(201);
  });
  it("the represents refusal also names a name problem: reserved, or taken with its suggestion", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    expect((await body(await make(a, { name: "kaizen" }))).message).toBe(MISSING + " Also: 'kaizen' is a reserved name." + HINT);
    expect((await body(await make(a, { name: "Ben" }))).message).toBe(MISSING + " Also: 'ben' is taken; we suggest 'ben2'." + HINT);
  });
  it("400 for a body the schema refuses: no name, a name over 63 characters or empty, an extra key, empty parentVault or represents, bad JSON", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    for (const b of [{ represents: CLUB }, { name: "x".repeat(64), represents: CLUB }, { name: "", represents: CLUB }, { name: "club", represents: CLUB, extra: 1 }, { name: "club", represents: CLUB, parentVault: "" }, { name: "club", represents: "" }]) {
      expect((await make(a, b)).status, JSON.stringify(b)).toBe(400);
    }
    expect((await a.fetch(URL_, { method: "POST", body: "{nope" })).status).toBe(400);
  });
  it("401 without a credential, in strict and in platform mode", async () => {
    for (const dpop of ["strict", "platform"] as const) {
      const w = await world({ dpop });
      expect((await w.fake.fetch(URL_, { method: "POST", ...json({ name: "club", represents: CLUB }) })).status, dpop).toBe(401);
    }
  });
  it("parentVault must be a vault ENTITY URI: a vault id is 400 'not a known vault entity'; someone else's vault is 403 'You do not own'", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const byId = await make(a, { name: "club", represents: CLUB, parentVault: w.annV.id });
    expect(byId.status).toBe(400);
    expect((await body(byId)).message).toBe(`parentVault is not a known vault entity: ${w.annV.id}`);
    expect((await make(a, { name: "club", represents: CLUB, parentVault: "https://ghost.fake.test/vault/e/x" })).status).toBe(400);
    const benV = w.fake.state.vaults.get(w.ben.landingVaultId!)!;
    const other = await make(a, { name: "club", represents: CLUB, parentVault: benV.entity });
    expect(other.status).toBe(403);
    expect((await body(other)).message).toBe(`You do not own parent vault ${benV.entity} — nest only under vaults you have minted`);
    expect(w.fake.state.vaults.size).toBe(2);
  });
  it("409 VaultNameTaken for a name a vault or takeName holds, with the platform's sentence and the next free name; nothing is made", async () => {
    const w = await world();
    w.fake.takeName("club");
    const a = await w.as(w.ann);
    for (const name of ["Ben", "club"]) {
      const res = await make(a, { name, represents: CLUB });
      expect(res.status, name).toBe(409);
      const d = await body(res);
      const n = name.toLowerCase();
      expect(d).toEqual({ error: "VaultNameTaken", message: `REFUSED: the name '${n}' on 'fake.test' is already held. The register 'https://fake.test/base' decided this — ⛔ not a per-database unique index, which cannot see across stores. Next free name: '${n}2'.` });
    }
    expect(w.fake.state.vaults.size).toBe(2);
  });
  it("409 VaultNameReserved for a reserved name and for one under 3 characters", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    for (const name of ["kaizen", "Kai-Zen", "ab"]) {
      const res = await make(a, { name, represents: CLUB });
      expect(res.status, name).toBe(409);
      const d = await body(res);
      expect(d.error).toBe("VaultNameReserved");
      expect(d.message).toMatch(/^REFUSED: '(kaizen|ab)' is a reserved label and the register 'https:\/\/fake\.test\/base' will not issue it\. Choose another name\.$/);
    }
  });
  it("with nameCollision 'suffix' a taken name is quietly the next free one (the local mint)", async () => {
    const w = await world({ nameCollision: "suffix" });
    const res = await make(await w.as(w.ann), { name: "ben", represents: CLUB });
    expect(res.status).toBe(201);
    expect((await body(res)).name).toBe("ben2");
  });
});

describe("create-named: 202, a partial mint", () => {
  it("partialNextCreateNamed makes the next answer 202 { vault, vaultId, name, parent:null, represents:null, created:true, status:'partial', message }", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    w.fake.partialNextCreateNamed();
    const res = await make(a, { name: "club", represents: CLUB });
    expect(res.status).toBe(202);
    const d = await body(res);
    expect(d).toMatchObject({ vaultId: "https://club.fake.test/vault", name: "club", parent: null, represents: null, created: true, status: "partial" });
    expect(d.message).toMatch(/re-issue the identical request to finish it\.$/);
    expect(w.fake.state.vaults.get(d.vaultId)!.pending).toBe(true);
  });
  it("the vault is not in /lws/vaults and the owner has no reach until it is finished; the name stays claimed", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    w.fake.partialNextCreateNamed();
    await make(a, { name: "club", represents: CLUB });
    expect((await list(a)).map((v: { name: string }) => v.name)).toEqual(["ann"]);
    const club = w.fake.state.vaults.get("https://club.fake.test/vault")!;
    expect((await a.fetch(vaultUrl(club, "/records"))).status).toBe(403);
    const b = await w.as(w.ben);
    expect((await make(b, { name: "club", represents: CLUB })).status).toBe(409);
    const check = await body(await w.fake.fetch("https://fake.test/onboard/api/check-name", { method: "POST", ...json({ name: "club" }) }));
    expect(check.available).toBe(false);
  });
  it("sending the identical request again finishes it: 201 live, parent and represents now stated, the vault listed", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    w.fake.partialNextCreateNamed();
    await make(a, { name: "club", represents: CLUB });
    const done = await make(a, { name: "club", represents: CLUB });
    expect(done.status).toBe(201);
    expect(await body(done)).toMatchObject({ vaultId: "https://club.fake.test/vault", parent: w.annV.entity, represents: CLUB, status: "live" });
    expect((await list(a)).map((v: { name: string }) => v.name)).toEqual(["ann", "club"]);
    expect(w.fake.state.vaults.size).toBe(3);
  });
  it("times says how many answers are partial; the returned function takes the rest back; the next after is 201", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const off = w.fake.partialNextCreateNamed({ times: 3 });
    expect((await make(a, { name: "one", represents: CLUB })).status).toBe(202);
    off();
    expect((await make(a, { name: "two", represents: CLUB })).status).toBe(201);
    w.fake.partialNextCreateNamed({ times: 2 });
    expect([(await make(a, { name: "three", represents: CLUB })).status, (await make(a, { name: "four", represents: CLUB })).status, (await make(a, { name: "five", represents: CLUB })).status]).toEqual([202, 202, 201]);
  });
  it("a first vault left partial does not make the person's address a principal or the landing vault until finished", async () => {
    const w = await world();
    const c = await w.as(w.cat);
    w.fake.partialNextCreateNamed();
    await make(c, { name: "catvault", represents: PERSON });
    expect(w.fake.state.people.get("cat@example.test")).toMatchObject({ landingVaultId: null });
    expect((await make(c, { name: "catvault", represents: PERSON })).status).toBe(201);
    expect(w.fake.state.people.get("cat@example.test")!.landingVaultId).toBe("https://catvault.fake.test/vault");
  });
});

describe("helpers", () => {
  it("authHost signs proofs the fake accepts: a call through it works, with the person's token", async () => {
    const w = await world();
    const host = w.fake.authHost(w.ann);
    const url = "https://fake.test/lws/vaults";
    const res = await w.fake.fetch(url, { headers: await host.dpopReadAuth("GET", url) });
    expect(res.status).toBe(200);
    expect((await body(res)).vaults).toHaveLength(1);
    expect(w.fake.calls.last()!.proof).toEqual({ ok: true });
    const again = await w.fake.fetch(url, { headers: await host.bearerHeaderFor(url) });
    expect(again.status).toBe(200);
    expect(await host.tokenManager.getSession()).toMatchObject({ principal: w.ann.principal, vaults: [{ vaultId: w.annV.id, modes: ["read", "write"] }] });
  });
  it("transport is the fake's fetch for the signin unit's calls", async () => {
    const w = await world();
    const res = await w.fake.transport("https://fake.test/onboard/api/check-name", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "freename" }), timeoutMs: 1000 });
    expect(res.status).toBe(200);
  });
  it("takeName makes check-name say taken; reset forgets it", async () => {
    const w = await world();
    w.fake.takeName("Some-Name");
    const check = async () => body(await w.fake.fetch("https://fake.test/onboard/api/check-name", { method: "POST", ...json({ name: "somename" }) }));
    expect((await check()).available).toBe(false);
    w.fake.reset();
    expect((await check()).available).toBe(true);
  });
});

describe("parentVault must be a vault the caller MINTED (GilbPlatform src/auth/create-named-vault.ts:312 and :571)", () => {
  const sentence = (e: string) => `You do not own parent vault ${e} — nest only under vaults you have minted`;
  it("the caller's own sign-up landing vault is owned but not minted: 403 with the platform's exact sentence, nothing is made", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const res = await make(a, { name: "club", represents: CLUB, parentVault: w.annV.entity });
    expect(res.status).toBe(403);
    expect(await body(res)).toMatchObject({ message: sentence(w.annV.entity) });
    expect(w.fake.state.vaults.size).toBe(2);
  });
  it("a seeded vault the caller owns is not minted either", async () => {
    const w = await world();
    const seeded = w.fake.seedVault({ name: "seeded", owner: w.ann, represents: CLUB });
    const res = await make(await w.as(w.ann), { name: "club", represents: CLUB, parentVault: seeded.entity });
    expect(res.status).toBe(403);
    expect((await body(res)).message).toBe(sentence(seeded.entity));
  });
  it("a vault the caller minted through create-named is a parent; someone else's minted vault is not", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const b = await w.as(w.ben);
    const first = await body(await make(a, { name: "first", represents: CLUB }));
    expect(w.fake.state.vaults.get(first.vaultId)!.mintedBy).toBe("ann@example.test");
    expect((await make(a, { name: "second", represents: CLUB, parentVault: first.vault })).status).toBe(201);
    const stolen = await make(b, { name: "third", represents: CLUB, parentVault: first.vault });
    expect(stolen.status).toBe(403);
    expect((await body(stolen)).message).toBe(sentence(first.vault));
  });
  it("a vault minted by a completed partial (202, then the same request) counts as minted", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    w.fake.partialNextCreateNamed();
    await make(a, { name: "club", represents: CLUB });
    const done = await body(await make(a, { name: "club", represents: CLUB }));
    expect((await make(a, { name: "sub", represents: CLUB, parentVault: done.vault })).status).toBe(201);
  });
});

