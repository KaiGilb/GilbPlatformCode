import { dpopProof, generateDpopKeyPair } from "@kaigilb/gilbplatformcode-signin";
import { describe, expect, it } from "vitest";
import { thumbprint } from "../src/auth";
import { b64url, fromB64url, jsonOfB64url } from "../src/bytes";
import { body, json, world, type Who, type World } from "./support";

const O = "https://fake.test";
const post = (w: World, path: string, b: unknown, h: Record<string, string> = {}) => w.fake.fetch(`${O}${path}`, { method: "POST", headers: { "content-type": "application/json", ...h }, body: typeof b === "string" ? b : JSON.stringify(b) });
const request = (w: World, email: string, extra: Record<string, unknown> = {}) => post(w, "/base/auth/email/request-code", { email, ...extra });
async function verify(w: World, email: string, extra: Record<string, unknown> = {}, code?: string) {
  const key = await generateDpopKeyPair();
  const res = await post(w, "/base/auth/email/verify-code", { email, code: code ?? w.fake.pendingCode(email) ?? "000000", dpopJwk: key.publicJwk, ...extra });
  return { res, key };
}
const named = async (w: World, email: string, b: unknown) => {
  const who = await signed(w, email);
  return who.fetch(`${O}/base/vault/create-named`, { method: "POST", ...json(b) });
};
async function signed(w: World, email: string): Promise<Who> {
  await request(w, email);
  const { res, key } = await verify(w, email);
  const d = await body(res);
  const headers = async (method: string, url: string) => (await import("@kaigilb/gilbplatformcode-signin")).dpopHeaders(key, d.token, method, url);
  const fetch = async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    return w.fake.fetch(url, { ...init, method, headers: { ...(init.headers as Record<string, string> | undefined), ...(await headers(method, url)) } });
  };
  return { person: w.fake.state.people.get(email)!, token: d.token, key, headers, fetch, send: (m, u, i) => fetch(u, { ...i, method: m }) };
}

describe("POST /base/auth/email/request-code (row 1)", () => {
  it("200 { requested: true } for a known and an unknown email alike; no credential needed in strict mode; the code is kept", async () => {
    const w = await world();
    const known = await request(w, "ann@example.test");
    const unknown = await request(w, "new@example.test");
    expect(known.status).toBe(200);
    expect(await body(known)).toEqual({ requested: true });
    expect(await body(unknown)).toEqual({ requested: true });
    expect(w.fake.pendingCode("new@example.test")).toBe("000000");
    expect(w.fake.calls.last()!.proof.ok).toBe(false);
  });
  it("the code option: a fixed code or a function of the email; the email is trimmed and lower-cased", async () => {
    const w = await world({ code: (e) => `c-${e.length}` });
    await request(w, "  New@Example.TEST ");
    expect(w.fake.pendingCode("new@example.test")).toBe("c-16");
    expect(w.fake.pendingCode("NEW@example.test ")).toBe("c-16");
  });
  it("400 for no email, an email under 3 characters, an extra key, a non-string return_to or name, bad JSON", async () => {
    const w = await world();
    for (const b of [{}, { email: "ab" }, { email: "a@b.c", x: 1 }, { email: "a@b.c", return_to: 5 }, { email: "a@b.c", name: 5 }, "{nope"]) {
      expect((await post(w, "/base/auth/email/request-code", b)).status, JSON.stringify(b)).toBe(400);
    }
    expect(w.fake.state.codes.size).toBe(0);
  });
  it("a name sent with the request is kept for the verify that follows, and kept across a second request", async () => {
    const w = await world();
    await request(w, "new@example.test", { name: "My Boat" });
    await request(w, "new@example.test");
    const d = await body((await verify(w, "new@example.test")).res);
    expect(d.vaultName).toBe("myboat");
  });
});

describe("POST /base/auth/email/verify-code (row 2): the four answers", () => {
  it("returning person: { token, principal, needsVaultName:false } and nothing else", async () => {
    const w = await world();
    await request(w, "ann@example.test");
    const { res } = await verify(w, "ann@example.test");
    expect(res.status).toBe(200);
    const d = await body(res);
    expect(Object.keys(d).sort()).toEqual(["needsVaultName", "principal", "token"]);
    expect(d).toMatchObject({ needsVaultName: false, principal: w.ann.principal });
  });
  it("new person, no name: { token, principal, needsVaultName:true, suggestedName, webIdDomain }; no vault is made", async () => {
    const w = await world();
    await request(w, "new.person@example.test");
    const d = await body((await verify(w, "new.person@example.test")).res);
    expect(Object.keys(d).sort()).toEqual(["needsVaultName", "principal", "suggestedName", "token", "webIdDomain"]);
    expect(d).toMatchObject({ needsVaultName: true, suggestedName: "newperson", webIdDomain: "fake.test" });
    expect(d.principal).toMatch(/^https:\/\/fake\.test\/base\/p\//);
    expect(w.fake.state.vaults.size).toBe(2);
  });
  it("the suggestion skips names that are taken (name2, name3)", async () => {
    const w = await world();
    w.fake.takeName("newbie");
    w.fake.takeName("newbie2");
    await request(w, "newbie@example.test");
    expect((await body((await verify(w, "newbie@example.test")).res)).suggestedName).toBe("newbie3");
  });
  it("new person with a name that is free: the vault is made and the answer carries vaultName, vault, vaultId, aliasUri; the principal becomes the vault's address", async () => {
    const w = await world();
    await request(w, "new@example.test");
    const { res } = await verify(w, "new@example.test", { name: "My-Boat" });
    const d = await body(res);
    expect(Object.keys(d).sort()).toEqual(["aliasUri", "needsVaultName", "principal", "token", "vault", "vaultId", "vaultName"]);
    expect(d).toMatchObject({ needsVaultName: false, vaultName: "myboat", vaultId: "https://myboat.fake.test/vault", aliasUri: "https://myboat.fake.test/vault", principal: "https://myboat.fake.test/vault" });
    const v = w.fake.state.vaults.get("https://myboat.fake.test/vault")!;
    expect(d.vault).toBe(v.entity);
    expect(v).toMatchObject({ represents: "https://veda.gilb.com/base/t/Person", owner: v.id, pending: false });
    expect(w.fake.state.people.get("new@example.test")).toMatchObject({ landingVaultId: v.id, principal: v.id });
  });
  it("the token still works after the principal was re-keyed: the vault list shows the new vault as the landing vault", async () => {
    const w = await world();
    await request(w, "new@example.test");
    const { res, key } = await verify(w, "new@example.test", { name: "myboat" });
    const { token } = await body(res);
    const url = `${O}/lws/vaults`;
    const { dpopHeaders } = await import("@kaigilb/gilbplatformcode-signin");
    const list = await body(await w.fake.fetch(url, { headers: await dpopHeaders(key, token, "GET", url) }));
    expect(list.vaults.map((v: { name: string; isLandingVault: boolean; modes: string[] }) => [v.name, v.isLandingVault, v.modes])).toEqual([["myboat", true, ["read", "write"]]]);
  });
  it("a name that is taken: needsVaultName:true with nameOutcome collision, a suggestion, no vault made, no hard block", async () => {
    const w = await world();
    await request(w, "new@example.test");
    const d = await body((await verify(w, "new@example.test", { name: "Ann" })).res);
    expect(d).toMatchObject({ needsVaultName: true, suggestedName: "ann2", nameOutcome: { status: "collision", desired: "ann", suggestion: "ann2", message: "'ann' was just taken — we picked 'ann2'. Accept it or edit, then create." } });
    expect("webIdDomain" in d).toBe(false);
    expect(w.fake.state.people.get("new@example.test")!.landingVaultId).toBeNull();
  });
  it("a reserved or too short name: nameOutcome reserved, the suggestion from the email", async () => {
    const w = await world();
    for (const name of ["Kai-Zen", "ab"]) {
      await request(w, "new@example.test");
      const d = await body((await verify(w, "new@example.test", { name })).res);
      expect(d).toMatchObject({ needsVaultName: true, suggestedName: "new", nameOutcome: { status: "reserved", desired: name === "ab" ? "ab" : "kaizen", message: `'${name === "ab" ? "ab" : "kaizen"}' is a reserved name — please choose another.` } });
    }
  });
  it("a returning person's name is ignored (no second vault)", async () => {
    const w = await world();
    await request(w, "ann@example.test");
    const d = await body((await verify(w, "ann@example.test", { name: "other" })).res);
    expect(d).toEqual({ token: d.token, principal: w.ann.principal, needsVaultName: false });
    expect(w.fake.state.vaults.size).toBe(2);
  });
});

describe("verify-code: the token and the refusals", () => {
  it("the token is a JWT whose cnf.jkt is the thumbprint of the dpopJwk that was sent, lives 7 days, names the principal", async () => {
    const w = await world();
    await request(w, "ann@example.test");
    const { res, key } = await verify(w, "ann@example.test");
    const { token, principal } = await body(res);
    const [h, p] = token.split(".");
    expect(jsonOfB64url(h)).toMatchObject({ typ: "JWT" });
    const claims = jsonOfB64url(p)!;
    expect(claims.cnf).toEqual({ jkt: thumbprint(key.publicJwk) });
    expect(claims.sub).toBe(principal);
    expect((claims.exp as number) - (claims.iat as number)).toBe(7 * 24 * 3600);
    expect(fromB64url(thumbprint(key.publicJwk))!.length).toBe(32);
    expect(b64url(new Uint8Array(1))).toBe("AA");
  });
  it("401 'Invalid or expired email one-time code' for a wrong code, a code never requested, a used code and an expired one", async () => {
    const w = await world();
    const msg = "Invalid or expired email one-time code";
    await request(w, "ann@example.test");
    const wrong = (await verify(w, "ann@example.test", {}, "111111")).res;
    expect(wrong.status).toBe(401);
    expect(await body(wrong)).toEqual({ error: "Unauthorized", message: msg });
    expect((await verify(w, "never@example.test", {}, "000000")).res.status).toBe(401);
    expect((await verify(w, "ann@example.test")).res.status).toBe(200); // a wrong guess did not spend the code
    const used = (await verify(w, "ann@example.test")).res;
    expect(used.status).toBe(401);
    expect((await body(used)).message).toBe(msg);
    await request(w, "ann@example.test");
    w.clock.ms += 10 * 60 * 1000 + 1;
    expect((await verify(w, "ann@example.test")).res.status).toBe(401);
    expect(w.fake.pendingCode("ann@example.test")).toBeUndefined();
  });
  it("a code is good for just under 10 minutes", async () => {
    const w = await world();
    await request(w, "ann@example.test");
    w.clock.ms += 10 * 60 * 1000 - 1000;
    expect((await verify(w, "ann@example.test")).res.status).toBe(200);
  });
  it("400 without dpopJwk, with an extra key, a code over 32 characters, an empty client, a dpopJwk that is not an object (and one that is not an EC key)", async () => {
    const w = await world();
    await request(w, "ann@example.test");
    const key = await generateDpopKeyPair();
    const ok = { email: "ann@example.test", code: "000000", dpopJwk: key.publicJwk };
    for (const b of [{ email: ok.email, code: ok.code }, { ...ok, extra: 1 }, { ...ok, code: "1".repeat(33) }, { ...ok, client: "" }, { ...ok, dpopJwk: "x" }]) {
      expect((await post(w, "/base/auth/email/verify-code", b)).status, JSON.stringify(b)).toBe(400);
    }
    expect(w.fake.pendingCode("ann@example.test")).toBe("000000"); // a body the schema refuses spends nothing
    const notEc = await post(w, "/base/auth/email/verify-code", { ...ok, dpopJwk: { kty: "EC" } });
    expect(notEc.status).toBe(400); // the code is consumed first, then the key refused (src/auth/email-otc.ts:415-420)
    expect(w.fake.pendingCode("ann@example.test")).toBeUndefined();
  });
  it("cnf.jkt binding: a later call signed with another key is 401 in strict mode and in platform mode; the bound key passes", async () => {
    for (const dpop of ["strict", "platform"] as const) {
      const w = await world({ dpop });
      await request(w, "ann@example.test");
      const { res, key } = await verify(w, "ann@example.test");
      const { token } = await body(res);
      const url = `${O}/lws/vaults`;
      const other = await generateDpopKeyPair();
      const bad = await w.fake.fetch(url, { headers: { authorization: `DPoP ${token}`, dpop: await dpopProof(other, "GET", url, token) } });
      expect(bad.status, dpop).toBe(401);
      expect((await body(bad)).message).toMatch(/bound key/);
      const good = await w.fake.fetch(url, { headers: { authorization: `DPoP ${token}`, dpop: await dpopProof(key, "GET", url, token) } });
      expect(good.status, dpop).toBe(200);
    }
  });
});

describe("POST /onboard/api/name-prep (row 3)", () => {
  it("a new email: { isReturning:false, suggestedName, webIdDomain, address }; a returning one: { isReturning:true, webIdDomain }", async () => {
    const w = await world();
    const fresh = await body(await post(w, "/onboard/api/name-prep", { email: "Zed.Zed@example.test" }));
    expect(fresh).toEqual({ isReturning: false, suggestedName: "zedzed", webIdDomain: "fake.test", address: "https://zedzed.fake.test/vault" });
    expect(await body(await post(w, "/onboard/api/name-prep", { email: "ann@example.test" }))).toEqual({ isReturning: true, webIdDomain: "fake.test" });
  });
  it("the suggestion skips a name that is taken; an email with a person but no vault is not returning", async () => {
    const w = await world();
    expect((await body(await post(w, "/onboard/api/name-prep", { email: "ann@other.test" }))).suggestedName).toBe("ann2");
    expect((await body(await post(w, "/onboard/api/name-prep", { email: "cat@example.test" }))).isReturning).toBe(false);
  });
  it("400 { error:'email_required' } for no email, no @, bad JSON", async () => {
    const w = await world();
    for (const b of [{}, { email: "nope" }, { email: "" }, "{x"]) {
      const res = await post(w, "/onboard/api/name-prep", b);
      expect(res.status).toBe(400);
      expect(await body(res)).toEqual({ error: "email_required", message: "A valid email is required." });
    }
  });
});

describe("POST /onboard/api/check-name (row 4): the normalisation table", () => {
  const check = async (w: World, name: unknown) => body(await post(w, "/onboard/api/check-name", { name }));
  it("the live case zz-eespeed-r5-probe: normalized, with the note, free, at its address", async () => {
    const w = await world();
    expect(await check(w, "zz-eespeed-r5-probe")).toEqual({
      available: true,
      reserved: false,
      requested: "zz-eespeed-r5-probe",
      normalized: true,
      note: "'zz-eespeed-r5-probe' is saved as 'zzeespeedr5probe': a vault name keeps only a–z and 0–9.",
      name: "zzeespeedr5probe",
      webIdDomain: "fake.test",
      address: "https://zzeespeedr5probe.fake.test/vault",
    });
  });
  it("the live case johndeveloper-sailboats becomes johndevelopersailboats", async () => {
    const w = await world();
    const d = await check(w, "johndeveloper-sailboats");
    expect(d).toMatchObject({ name: "johndevelopersailboats", requested: "johndeveloper-sailboats", normalized: true, available: true, address: "https://johndevelopersailboats.fake.test/vault" });
    expect(d.note).toBe("'johndeveloper-sailboats' is saved as 'johndevelopersailboats': a vault name keeps only a–z and 0–9.");
  });
  it("a name that needs no change has no normalized and no note", async () => {
    const w = await world();
    const d = await check(w, "freename");
    expect(d).toEqual({ available: true, reserved: false, requested: "freename", name: "freename", webIdDomain: "fake.test", address: "https://freename.fake.test/vault" });
    expect("normalized" in d || "note" in d).toBe(false);
  });
  it("upper case, spaces, accents, symbols: normalised; the requested spelling is trimmed", async () => {
    const w = await world();
    expect(await check(w, "  My Boat! ")).toMatchObject({ requested: "My Boat!", name: "myboat", normalized: true });
    expect(await check(w, "Écume")).toMatchObject({ name: "cume", normalized: true });
    expect(await check(w, "ABC")).toMatchObject({ name: "abc", normalized: true, available: true });
  });
  it("a name held by a vault (any spelling): available:false, the next free name as suggestion and at its address, the platform's message", async () => {
    const w = await world();
    const d = await check(w, "Ann");
    expect(d).toEqual({
      available: false,
      reserved: false,
      requested: "Ann",
      normalized: true,
      note: "'Ann' is saved as 'ann': a vault name keeps only a–z and 0–9.",
      name: "ann",
      suggestion: "ann2",
      webIdDomain: "fake.test",
      address: "https://ann2.fake.test/vault",
      message: "'ann' is taken — we suggest 'ann2'. Accept it or edit.",
    });
    w.fake.takeName("ann2");
    expect((await check(w, "ann")).suggestion).toBe("ann3");
  });
  it("a reserved name, by any spelling, is reserved:true with no suggestion and no address", async () => {
    const w = await world();
    for (const raw of ["kaizen", "Kai-Zen", "VEDA", "well-known", "www", "vault"]) {
      const d = await check(w, raw);
      expect(d, raw).toMatchObject({ available: false, reserved: true, message: `'${d.name}' is a reserved name — please choose another.` });
      expect("suggestion" in d || "address" in d, raw).toBe(false);
    }
    expect((await check(w, "well-known")).name).toBe("wellknown");
  });
  it("under 3 characters is refused as reserved; 3 is fine", async () => {
    const w = await world();
    for (const raw of ["ab", "a", "x-y"]) expect(await check(w, raw), raw).toMatchObject({ available: false, reserved: true });
    expect(await check(w, "abc")).toMatchObject({ available: true, reserved: false });
  });
  it("empty, blank, missing or not a string: the name is `user`, saved as such, free", async () => {
    const w = await world();
    for (const raw of ["", "   ", "---"]) {
      const d = await check(w, raw);
      expect(d, JSON.stringify(raw)).toMatchObject({ name: "user", available: true, normalized: true, address: "https://user.fake.test/vault" });
      expect(d.note).toBe(`'${raw.trim()}' is saved as 'user': a vault name keeps only a–z and 0–9.`);
    }
    expect(await body(await post(w, "/onboard/api/check-name", {}))).toMatchObject({ name: "user", requested: "" });
    expect(await body(await post(w, "/onboard/api/check-name", "{x"))).toMatchObject({ name: "user" });
  });
  it("always 200, and no credential in strict mode; the address segment follows createNamedVaultSegment", async () => {
    const w = await world({ createNamedVaultSegment: "base" });
    const res = await post(w, "/onboard/api/check-name", { name: "freename" });
    expect(res.status).toBe(200);
    expect((await body(res)).address).toBe("https://freename.fake.test/base");
  });
});
