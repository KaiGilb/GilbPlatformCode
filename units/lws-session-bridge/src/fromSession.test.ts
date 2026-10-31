// @vitest-environment node
// The default host over the sign-in unit: header keys and values, the method each header is signed for, the session shape, the
// drop of the token, and the mapping of the sign-in unit's errors to the app's. Real signing is used wherever the answer is a proof.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBaseOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { SessionCredential, type GilbSession } from "@kaigilb/gilbplatformcode-signin/session";
import { NotSignedInError, OriginNotAllowedError } from "./errors";
import { lwsAuthFromSession } from "./fromSession";
import { bearerHeaderFor, dpopReadAuth, dpopWriteAuth, invalidateDpop, resetLwsAuth, setLwsAuth, tokenManager } from "./lwsAuth";

type Transport = NonNullable<NonNullable<ConstructorParameters<typeof SessionCredential>[0]>["transport"]>;

const ORIGIN = "https://platform.example.test";
const URL_ = `${ORIGIN}/lws/r/abc%20d`;
const SESSION: GilbSession = {
  principal: "https://id.platform.example.test/base/p/kai",
  vault: { entity: "https://kai.platform.example.test/base/e/v1", id: "v1", name: "kai", shortWebId: "https://kai.platform.example.test/i" },
  vaults: [
    { vaultId: "https://kai.platform.example.test/base", modes: ["read", "write"] },
    { vaultId: "https://team.platform.example.test/base", modes: ["read"] },
  ],
};

beforeEach(() => {
  setBaseOrigin(ORIGIN);
  setSystemVaultHosts([]);
});
afterEach(() => {
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
});

/** The claims of a DPoP proof (a JWT; the signature is not read here). */
function claims(proof: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(proof.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
}

function signedIn(): SessionCredential {
  const s = new SessionCredential();
  s.adopt("access-token-1", SESSION, Date.now() + 30 * 60_000);
  return s;
}

/** A stand-in with only the three members the host calls, recording what it was asked. */
function fake() {
  return {
    authHeaders: vi.fn(async (_m: string, _u: string) => ({ Authorization: "DPoP tok", DPoP: "proof" })),
    getSession: vi.fn(async () => SESSION),
    invalidate: vi.fn(),
  };
}
const asSession = (f: ReturnType<typeof fake>) => f as unknown as SessionCredential;

describe("header keys and values", () => {
  it("dpopReadAuth and dpopWriteAuth ask the session for (method, url) and answer lower-case authorization and dpop", async () => {
    const f = fake();
    const host = lwsAuthFromSession(asSession(f));
    expect(await host.dpopReadAuth("GET", URL_)).toEqual({ authorization: "DPoP tok", dpop: "proof" });
    expect(await host.dpopWriteAuth("POST", URL_)).toEqual({ authorization: "DPoP tok", dpop: "proof" });
    expect(f.authHeaders.mock.calls).toEqual([["GET", URL_], ["POST", URL_]]);
  });
  it("bearerHeaderFor answers the same pair, in the same keys, signed for GET when no method is named", async () => {
    const f = fake();
    const host = lwsAuthFromSession(asSession(f));
    const h = await host.bearerHeaderFor(URL_);
    expect(h).toEqual({ authorization: "DPoP tok", dpop: "proof" });
    expect(h["authorization"]).toBeTruthy(); // the key the app's callers test: vaultSets reads bearer.authorization
    expect(f.authHeaders.mock.calls).toEqual([["GET", URL_]]);
  });
  it("bearerHeaderFor signs for the method it is given", async () => {
    const f = fake();
    await lwsAuthFromSession(asSession(f)).bearerHeaderFor(URL_, "PATCH");
    expect(f.authHeaders.mock.calls).toEqual([["PATCH", URL_]]);
  });
  it("no header has an upper-case key (a spread beside the app's own `accept` must not double a header)", async () => {
    const h = await lwsAuthFromSession(asSession(fake())).dpopReadAuth("GET", URL_);
    expect(Object.keys(h)).toEqual(["authorization", "dpop"]);
  });
});

describe("with a real SessionCredential (real proofs)", () => {
  it("the token is sent as a DPoP token and the proof names the method and the URL", async () => {
    setLwsAuth(lwsAuthFromSession(signedIn()));
    const h = await bearerHeaderFor(URL_, "PATCH");
    expect(h.authorization).toBe("DPoP access-token-1");
    const c = claims(h.dpop!);
    expect(c.htm).toBe("PATCH");
    expect(c.htu).toBe(URL_);
    expect(typeof c.jti).toBe("string");
  });
  it("a read and a write are each signed for their own method, with a fresh proof every call", async () => {
    setLwsAuth(lwsAuthFromSession(signedIn()));
    const r1 = await dpopReadAuth("GET", URL_);
    const r2 = await dpopReadAuth("GET", URL_);
    const w = await dpopWriteAuth("POST", URL_);
    expect(claims(r1.dpop!).htm).toBe("GET");
    expect(claims(w.dpop!).htm).toBe("POST");
    expect(claims(r1.dpop!).jti).not.toBe(claims(r2.dpop!).jti);
  });
  it("a URL outside the platform gets nothing even from a signed-in session", async () => {
    setLwsAuth(lwsAuthFromSession(signedIn()));
    expect(await dpopReadAuth("GET", "https://evil.example/lws/r/x")).toEqual({});
    expect(await bearerHeaderFor("https://evil.example/lws/r/x", "PATCH")).toEqual({});
    expect(await dpopWriteAuth("POST", "https://platform.example.test.evil.example/x")).toEqual({});
  });
  it("the gate stops a foreign URL before the session is asked", async () => {
    const f = fake();
    setLwsAuth(lwsAuthFromSession(asSession(f)));
    await dpopReadAuth("GET", "https://evil.example/x");
    await bearerHeaderFor("https://evil.example/x");
    await dpopWriteAuth("POST", "https://evil.example/x");
    expect(f.authHeaders).not.toHaveBeenCalled();
  });
});

describe("the session", () => {
  it("tokenManager.getSession answers principal, vault and vaults in the app's shape, as a copy", async () => {
    const credential = signedIn();
    setLwsAuth(lwsAuthFromSession(credential));
    const s = await tokenManager.getSession();
    expect(s).toEqual(SESSION);
    expect(s).not.toBe(credential.session);
    expect(s.vaults).not.toBe(credential.session!.vaults);
    s.vaults[0]!.modes.push("write");
    expect(credential.session!.vaults[0]!.modes).toEqual(["read", "write"]);
  });
  it("a session with no vault of its own answers vault: null", async () => {
    const credential = new SessionCredential();
    credential.adopt("t", { principal: "p", vault: null, vaults: [] }, Date.now() + 600_000);
    setLwsAuth(lwsAuthFromSession(credential));
    expect(await tokenManager.getSession()).toEqual({ principal: "p", vault: null, vaults: [] });
  });
  it("the fields the app reads are there: principal (relationWrite, entityShare), vault and vaults (useVaults)", async () => {
    setLwsAuth(lwsAuthFromSession(signedIn()));
    const s = await tokenManager.getSession();
    expect(s.principal).toBe(SESSION.principal);
    expect(s.vault?.id).toBe("v1");
    expect(s.vaults.map((v) => v.vaultId)).toEqual(SESSION.vaults.map((v) => v.vaultId));
  });
});

describe("invalidate", () => {
  it("invalidateDpop drops the held token and keeps the key", async () => {
    const credential = signedIn();
    setLwsAuth(lwsAuthFromSession(credential));
    expect(credential.session).not.toBeNull();
    const jwk = await credential.ensurePublicJwk();
    invalidateDpop();
    expect(credential.session).toBeNull();
    expect(await credential.ensurePublicJwk()).toEqual(jwk);
  });
  it("tokenManager.invalidate drops the held token too", () => {
    const credential = signedIn();
    setLwsAuth(lwsAuthFromSession(credential));
    tokenManager.invalidate();
    expect(credential.session).toBeNull();
  });
  it("both call session.invalidate() with no argument (the sign-out form is not used)", () => {
    const f = fake();
    setLwsAuth(lwsAuthFromSession(asSession(f)));
    invalidateDpop();
    tokenManager.invalidate();
    expect(f.invalidate.mock.calls).toEqual([[], []]);
  });
});

describe("error mapping", () => {
  const platformUrl = `${ORIGIN}/lws/r/x`;
  it("with no token and no mint address the sign-in unit's NotSignedInError becomes the app's", async () => {
    setLwsAuth(lwsAuthFromSession(new SessionCredential()));
    for (const call of [() => dpopReadAuth("GET", platformUrl), () => dpopWriteAuth("POST", platformUrl), () => bearerHeaderFor(platformUrl), () => tokenManager.getSession()]) {
      const e = await call().then(() => null, (x: unknown) => x);
      expect(e).toBeInstanceOf(NotSignedInError);
      expect((e as Error).message).toBe(new NotSignedInError().message);
    }
  });
  it("a 401 from the mint becomes the app's NotSignedInError", async () => {
    const transport: Transport = async () => ({ status: 401, json: async () => ({}) });
    setLwsAuth(lwsAuthFromSession(new SessionCredential({ dpopMintUrl: `${ORIGIN}/mint`, transport })));
    await expect(dpopReadAuth("GET", platformUrl)).rejects.toBeInstanceOf(NotSignedInError);
  });
  it("a 403 from the mint becomes the app's OriginNotAllowedError, carrying the sign-in unit's sentence as its detail", async () => {
    const transport: Transport = async () => ({ status: 403, json: async () => ({}) });
    setLwsAuth(lwsAuthFromSession(new SessionCredential({ dpopMintUrl: `${ORIGIN}/mint`, transport })));
    const e = await dpopWriteAuth("POST", platformUrl).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(OriginNotAllowedError);
    expect((e as Error).message).toContain("FIRST_PARTY_ORIGINS");
    expect((e as Error).message).toContain("The sign-in service refused this app's address.");
  });
  it("an error that is neither passes as it is", async () => {
    const transport: Transport = async () => ({ status: 500, json: async () => ({}) });
    setLwsAuth(lwsAuthFromSession(new SessionCredential({ dpopMintUrl: `${ORIGIN}/mint`, transport })));
    const e = await dpopReadAuth("GET", platformUrl).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(NotSignedInError);
    expect((e as Error).message).toBe("DPoP token mint failed: HTTP 500");
  });
  it("the app's own errors are not the sign-in unit's classes", async () => {
    const { NotSignedInError: Theirs } = await import("@kaigilb/gilbplatformcode-signin/session");
    expect(new NotSignedInError()).not.toBeInstanceOf(Theirs);
  });
});

describe("proofOriginFor (a front door that forwards to the identity host)", () => {
  const APEX = "https://apex.example.test";
  const ID = "https://id.apex.example.test";
  const VAULT = "https://john.apex.example.test";
  const opts = { proofOriginFor: { fetchOrigin: APEX, proofOrigin: ID } };
  beforeEach(() => setBaseOrigin(APEX));

  it("a URL at the fetch origin is signed for the proof origin plus the path, with no query, by all three calls", async () => {
    setLwsAuth(lwsAuthFromSession(signedIn(), opts));
    const url = `${APEX}/lws/vaults?x=1&y=2#frag`;
    for (const h of [await bearerHeaderFor(url), await dpopReadAuth("GET", url), await dpopWriteAuth("POST", url)]) {
      expect(claims(h.dpop!).htu).toBe(`${ID}/lws/vaults`);
    }
  });
  it("a URL at another origin is signed for itself", async () => {
    setLwsAuth(lwsAuthFromSession(signedIn(), opts));
    const h = await dpopReadAuth("GET", `${VAULT}/base/connect/audience-rung/members?vaultId=a`);
    expect(claims(h.dpop!).htu).toBe(`${VAULT}/base/connect/audience-rung/members`);
  });
  it("the proof origin itself is signed for itself (only the exact fetch origin is rewritten)", async () => {
    setLwsAuth(lwsAuthFromSession(signedIn(), opts));
    expect(claims((await dpopReadAuth("GET", `${ID}/x`)).dpop!).htu).toBe(`${ID}/x`);
  });
  it("the session is asked for the proof URL, the method is kept", async () => {
    const f = fake();
    await lwsAuthFromSession(asSession(f), opts).dpopWriteAuth("PUT", `${APEX}/a/b?q=1`);
    expect(f.authHeaders.mock.calls).toEqual([["PUT", `${ID}/a/b`]]);
  });
  it("without the option the proof is for the request URL, as before", async () => {
    setLwsAuth(lwsAuthFromSession(signedIn()));
    expect(claims((await dpopReadAuth("GET", `${APEX}/lws/vaults`)).dpop!).htu).toBe(`${APEX}/lws/vaults`);
  });
});
