// Renewal and server sign-out. Fake transport, in-memory store, and a fake
// navigator.locks installed per test. No network.
import { test, vi } from "vitest";
import assert from "node:assert/strict";
import {
  SessionCredential,
  NotSignedInError,
  RenewalUnavailableError,
  EXPIRY_GUARD_MS,
  RENEW_TIMEOUT_MS,
  RENEW_WINDOW_MAX_SEC,
  RENEW_WINDOW_MIN_SEC,
  SIGN_OUT_BOUND_MS,
  STORE_TIMEOUT_MS,
  STORED_SESSION_VERSION,
  recordIsCurrent,
  type SessionStore,
  type StoredSession,
} from "./session";
import { generateDpopKeyPair, type DpopPublicJwk } from "./dpop";
import type { Transport, TransportRequest, TransportResponse } from "./transport";

const NOW = 1_700_000_000_000;
const ORIGIN = "https://id.example.test";
const PRINCIPAL = "https://id.example.test/i/p9";
const RENEW_URL = `${ORIGIN}/base/auth/email/renew`;
const SIGN_OUT_URL = `${ORIGIN}/base/auth/sign-out`;
const VERIFY_URL = `${ORIGIN}/base/auth/email/verify-code`;
const OLD_RENEW = "rsi1.fam.old-secret";
const NEW_RENEW = "rsi1.fam.new-secret";
const NEW_EXP = Math.floor(NOW / 1000) + 10 * 24 * 3600;
const LIVE_EXPIRY = new Date(NOW + 14 * 24 * 3600 * 1000).toISOString();

const jwt = (exp: number) =>
  `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;

const dec = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

interface Mem extends SessionStore {
  peek(): StoredSession | null;
}

function memoryStore(initial: StoredSession | null = null): Mem {
  let current: StoredSession | null = initial;
  const store: Mem = {
    peek: () => current,
    async load() {
      await Promise.resolve();
      return current ? structuredClone(current) : null;
    },
    async save(session) {
      await Promise.resolve();
      current = structuredClone(session);
    },
    async saveIfCurrent(session, expect) {
      const seen = current;
      if (!recordIsCurrent(seen, expect)) return;
      await Promise.resolve();
      if (current !== seen) return;
      current = structuredClone(session);
    },
    async clearIfCurrent(expect) {
      const seen = current;
      if (!recordIsCurrent(seen, expect)) return;
      await Promise.resolve();
      if (current !== seen) return;
      current = null;
    },
    async clear() {
      await Promise.resolve();
      current = null;
    },
  };
  return store;
}

async function seed(overrides: Partial<StoredSession> = {}): Promise<StoredSession> {
  const key = await generateDpopKeyPair();
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    key.publicJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const exported = await crypto.subtle.exportKey("jwk", publicKey);
  return {
    version: STORED_SESSION_VERSION,
    publicKeyId: `${exported.x}.${exported.y}`,
    keyPair: { publicKey, privateKey: key.privateKey },
    accessToken: jwt(Math.floor(NOW / 1000) + 3600),
    expiresAt: NOW + 3_600_000,
    session: {
      principal: PRINCIPAL,
      vault: { entity: "https://v.example.test/base/e/v1", id: "v1", name: "sam" },
      vaults: [{ vaultId: "https://a.example.test/vault", modes: ["read", "write"] }],
    },
    renew: OLD_RENEW,
    renewExpiresAt: LIVE_EXPIRY,
    origin: ORIGIN,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): TransportResponse {
  return { status, json: async () => body };
}

function renewedBody(renew = NEW_RENEW, principal = PRINCIPAL) {
  return {
    token: jwt(NEW_EXP),
    renew,
    renewExpiresAt: new Date(NOW + 14 * 24 * 3600 * 1000).toISOString(),
    principal,
  };
}

interface Call {
  url: string;
  req: TransportRequest;
}

/** Records every call. The renew route answers `renewAnswer`; everything else is 500. */
function renewTransport(renewAnswer: () => Promise<TransportResponse> | TransportResponse) {
  const calls: Call[] = [];
  const send: Transport = async (url, req) => {
    calls.push({ url, req });
    if (url === RENEW_URL) return renewAnswer();
    return jsonResponse(500, { error: "unexpected" });
  };
  return { send, calls };
}

function installLocks(locks: { request: (name: string, callback: () => Promise<unknown>) => Promise<unknown> } | undefined): () => void {
  const nav = (globalThis.navigator ?? (globalThis.navigator = {} as Navigator)) as Navigator & { locks?: unknown };
  const prior = Object.getOwnPropertyDescriptor(nav, "locks");
  Object.defineProperty(nav, "locks", { configurable: true, writable: true, value: locks });
  return () => {
    if (prior) Object.defineProperty(nav, "locks", prior);
    else delete nav.locks;
  };
}

/** Serialises callbacks per name, the way an exclusive Web Lock does. */
function fakeLocks() {
  const names: string[] = [];
  const tails = new Map<string, Promise<unknown>>();
  const locks = {
    names,
    request<T>(name: string, callback: () => Promise<T> | T): Promise<T> {
      names.push(name);
      const prev = tails.get(name) ?? Promise.resolve();
      const run = prev.then(() => callback(), () => callback());
      tails.set(name, run.then(() => undefined, () => undefined));
      return run;
    },
  };
  return locks;
}

function renewCalls(calls: Call[]): Call[] {
  return calls.filter((call) => call.url === RENEW_URL);
}

test("renewWindowSec must be an integer from 300 to 1209600", () => {
  assert.equal(RENEW_WINDOW_MIN_SEC, 300);
  assert.equal(RENEW_WINDOW_MAX_SEC, 1_209_600);
  new SessionCredential({ renewWindowSec: 300 });
  new SessionCredential({ renewWindowSec: 1_209_600 });
  for (const bad of [299, 1_209_601, 300.5, Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
    assert.throws(() => new SessionCredential({ renewWindowSec: bad }), TypeError);
  }
});

test("sign-in sends renew and renewWindowSec, and stores the credential the answer returns", async () => {
  const store = memoryStore();
  const calls: Call[] = [];
  const answer = renewedBody();
  const send: Transport = async (url, req) => {
    calls.push({ url, req });
    if (url === VERIFY_URL) {
      return jsonResponse(200, { token: jwt(Math.floor(NOW / 1000) + 3600), principal: PRINCIPAL, ...answer, renew: OLD_RENEW });
    }
    if (url === `${ORIGIN}/lws/vaults`) {
      return jsonResponse(200, { vaults: [{ vaultId: "https://a.example.test/vault", modes: ["read"] }], complete: true });
    }
    return jsonResponse(500, {});
  };
  const cred = new SessionCredential({ store, transport: send, now: () => NOW, renewWindowSec: 600 });
  await cred.signInWithCode(`${ORIGIN}/`, "a@example.test", "123456");
  const body = JSON.parse(calls[0]!.req.body!) as { renew?: unknown; renewWindowSec?: unknown };
  assert.equal(calls[0]!.url, VERIFY_URL);
  assert.equal(body.renew, true);
  assert.equal(body.renewWindowSec, 600);
  const saved = store.peek();
  assert.equal(saved?.renew, OLD_RENEW);
  assert.equal(saved?.renewExpiresAt, answer.renewExpiresAt);
  assert.equal(saved?.origin, ORIGIN);
  assert.equal(saved?.version, STORED_SESSION_VERSION);
});

test("an omitted renewWindowSec is sent as 14 days", async () => {
  const store = memoryStore();
  const calls: Call[] = [];
  const send: Transport = async (url, req) => {
    calls.push({ url, req });
    if (url.endsWith("/lws/vaults")) return jsonResponse(200, { vaults: [], complete: true });
    return jsonResponse(200, { token: jwt(Math.floor(NOW / 1000) + 3600), principal: PRINCIPAL });
  };
  const cred = new SessionCredential({ store, transport: send, now: () => NOW });
  await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
  const body = JSON.parse(calls[0]!.req.body!) as { renew?: unknown; renewWindowSec?: unknown };
  assert.equal(body.renew, true);
  assert.equal(body.renewWindowSec, RENEW_WINDOW_MAX_SEC);
});

test("renew and renewWindowSec are not sent with dpopMintUrl, store false, a host key, or renew false", async () => {
  const key = await generateDpopKeyPair();
  const hostKey = {
    publicJwk: key.publicJwk,
    sign: async (input: Uint8Array) => new Uint8Array(await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key.privateKey,
      input as Uint8Array<ArrayBuffer>,
    )),
  };
  const bodies: unknown[] = [];
  const send: Transport = async (url, req) => {
    if (url.endsWith("/verify-code")) bodies.push(JSON.parse(req.body!));
    if (url.endsWith("/lws/vaults")) return jsonResponse(200, { vaults: [], complete: true });
    if (url.endsWith("/dpop-token")) {
      return jsonResponse(200, { access_token: "bridge", expires_in: 1800, principal: PRINCIPAL, vaults: [] });
    }
    return jsonResponse(200, { token: jwt(Math.floor(NOW / 1000) + 3600), principal: PRINCIPAL });
  };
  const cases: Array<ConstructorParameters<typeof SessionCredential>[0]> = [
    { dpopMintUrl: `${ORIGIN}/base/auth/session/dpop-token`, store: memoryStore(), transport: send, now: () => NOW, renew: true, renewWindowSec: 600 },
    { store: false, transport: send, now: () => NOW, renew: true, renewWindowSec: 600 },
    { key: hostKey, store: memoryStore(), transport: send, now: () => NOW, renew: true, renewWindowSec: 600 },
    { store: memoryStore(), transport: send, now: () => NOW, renew: false, renewWindowSec: 600 },
  ];
  for (const opts of cases) {
    await new SessionCredential(opts).signInWithCode(ORIGIN, "a@example.test", "123456");
  }
  assert.equal(bodies.length, 4);
  for (const body of bodies) {
    const record = body as { renew?: unknown; renewWindowSec?: unknown };
    assert.equal("renew" in record, false);
    assert.equal("renewWindowSec" in record, false);
  }
});

test("renew posts a DPoP proof for that exact URL with no ath, and stores the rotation", async () => {
  const store = memoryStore(await seed());
  let now = NOW;
  const answer = renewedBody();
  const t = renewTransport(() => jsonResponse(200, answer));
  const cred = new SessionCredential({ store, transport: t.send, now: () => now });
  assert.equal((await cred.restore())?.principal, PRINCIPAL);
  assert.equal(renewCalls(t.calls).length, 0, "a live token is restored with no request");
  now = NOW + 3_600_000 - EXPIRY_GUARD_MS;
  const headers = await cred.authHeaders("GET", "https://a.example.test/lws/vault/v1/records");
  const hit = renewCalls(t.calls);
  assert.equal(hit.length, 1);
  assert.equal(hit[0]!.url, RENEW_URL);
  assert.equal(hit[0]!.req.method, "POST");
  assert.equal(hit[0]!.req.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(hit[0]!.req.body!), { renew: OLD_RENEW });
  const proof = hit[0]!.req.headers.DPoP;
  assert.equal(typeof proof, "string");
  const [hh, pp, ss] = proof!.split(".");
  const header = dec(hh!) as { jwk: DpopPublicJwk };
  const claims = dec(pp!) as { htm?: string; htu?: string; ath?: string };
  assert.equal(claims.htm, "POST");
  assert.equal(claims.htu, RENEW_URL);
  assert.equal("ath" in claims, false);
  const pub = await crypto.subtle.importKey("jwk", header.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.equal(
    await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, Buffer.from(ss!, "base64url"), new TextEncoder().encode(`${hh}.${pp}`)),
    true,
  );
  assert.equal(headers.Authorization, `DPoP ${answer.token}`);
  const saved = store.peek();
  assert.equal(saved?.accessToken, answer.token);
  assert.equal(saved?.renew, NEW_RENEW);
  assert.equal(saved?.renewExpiresAt, answer.renewExpiresAt);
  assert.equal(saved?.session.vaults[0]?.vaultId, "https://a.example.test/vault");
  assert.equal(cred.session?.principal, PRINCIPAL);
});

test("restore of an expired token with a live credential renews once and returns the session", async () => {
  const store = memoryStore(await seed({
    accessToken: "tok-expired",
    expiresAt: NOW - 1,
  }));
  const answer = renewedBody(NEW_RENEW, "https://id.example.test/i/after");
  const t = renewTransport(() => jsonResponse(200, answer));
  const cred = new SessionCredential({ store, transport: t.send, now: () => NOW });
  const session = await cred.restore();
  assert.equal(renewCalls(t.calls).length, 1);
  assert.equal(session?.principal, "https://id.example.test/i/after");
  assert.deepEqual(session?.vaults, [{ vaultId: "https://a.example.test/vault", modes: ["read", "write"] }]);
  assert.equal(store.peek()?.renew, NEW_RENEW);
  assert.equal(store.peek()?.accessToken, answer.token);
  assert.equal((await cred.authHeaders("GET", "https://a.example.test/x")).Authorization, `DPoP ${answer.token}`);
  assert.equal(renewCalls(t.calls).length, 1, "the new token is used without a second renew");
});

test("two parallel renew calls on one credential share one platform request", async () => {
  const store = memoryStore(await seed());
  let release!: (value: TransportResponse) => void;
  const gate = new Promise<TransportResponse>((resolve) => { release = resolve; });
  const t = renewTransport(() => gate);
  const cred = new SessionCredential({ store, transport: t.send, now: () => NOW });
  assert.ok(await cred.restore());
  const first = cred.renew();
  const second = cred.renew();
  for (let i = 0; i < 50 && renewCalls(t.calls).length === 0; i++) await new Promise((r) => setTimeout(r, 0));
  assert.equal(renewCalls(t.calls).length, 1);
  release(jsonResponse(200, renewedBody()));
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a?.principal, PRINCIPAL);
  assert.equal(b, a);
  assert.equal(renewCalls(t.calls).length, 1);
});

test("with a lock, two credentials rotate once and both end holding the new credential", async () => {
  const store = memoryStore(await seed());
  const locks = fakeLocks();
  const uninstall = installLocks(locks);
  try {
    const answer = renewedBody();
    const t = renewTransport(() => jsonResponse(200, answer));
    const a = new SessionCredential({ store, transport: t.send, now: () => NOW });
    const b = new SessionCredential({ store, transport: t.send, now: () => NOW });
    assert.ok(await a.restore());
    assert.ok(await b.restore());
    const [sa, sb] = await Promise.all([a.renew(), b.renew()]);
    assert.equal(renewCalls(t.calls).length, 1);
    assert.deepEqual(locks.names, [`gilb-signin-renew:${ORIGIN}`, `gilb-signin-renew:${ORIGIN}`]);
    assert.equal(sa?.principal, PRINCIPAL);
    assert.equal(sb?.principal, PRINCIPAL);
    assert.equal((await a.authHeaders("GET", "https://a.example.test/x")).Authorization, `DPoP ${answer.token}`);
    assert.equal((await b.authHeaders("GET", "https://a.example.test/x")).Authorization, `DPoP ${answer.token}`);
    assert.equal(store.peek()?.renew, NEW_RENEW);
    assert.equal(renewCalls(t.calls).length, 1, "adopting the other tab's record does not post");
  } finally {
    uninstall();
  }
});

test("without locks the second presentation of the spent credential is 401 and that credential is signed out", async () => {
  const uninstall = installLocks(undefined);
  try {
    const store = memoryStore(await seed());
    const waiting: Array<{ resolve: (value: TransportResponse) => void }> = [];
    const calls: Call[] = [];
    const send: Transport = async (url, req) => {
      calls.push({ url, req });
      if (url !== RENEW_URL) return jsonResponse(500, {});
      return new Promise<TransportResponse>((resolve) => {
        waiting.push({ resolve });
        if (waiting.length === 2) {
          waiting[0]!.resolve(jsonResponse(200, renewedBody()));
          waiting[1]!.resolve(jsonResponse(401, { error: "Unauthorized", message: "renewal refused" }));
        }
      });
    };
    const a = new SessionCredential({ store, transport: send, now: () => NOW });
    const b = new SessionCredential({ store, transport: send, now: () => NOW });
    assert.ok(await a.restore());
    assert.ok(await b.restore());
    const [sa, sb] = await Promise.all([a.renew(), b.renew()]);
    assert.equal(calls.filter((call) => call.url === RENEW_URL).length, 2);
    for (const call of calls.filter((call) => call.url === RENEW_URL)) {
      assert.deepEqual(JSON.parse(call.req.body!), { renew: OLD_RENEW });
    }
    const results = [sa, sb];
    assert.equal(results.filter((session) => session === null).length, 1);
    assert.equal([a.session, b.session].filter((session) => session === null).length, 1);
    const live = a.session ?? b.session;
    assert.equal(live?.principal, PRINCIPAL);
    assert.equal((live === a.session ? a : b).session?.principal, PRINCIPAL);
  } finally {
    uninstall();
  }
});

test("a 401 from renew clears the sign-in and authHeaders throws NotSignedInError", async () => {
  const store = memoryStore(await seed({ expiresAt: NOW - 1, accessToken: "tok-old" }));
  const t = renewTransport(() => jsonResponse(401, { error: "Unauthorized", message: "renewal refused" }));
  const cred = new SessionCredential({ store, transport: t.send, now: () => NOW });
  assert.equal(await cred.restore(), null);
  assert.equal(cred.session, null);
  assert.equal(store.peek(), null);
  await assert.rejects(cred.authHeaders("GET", "https://a.example.test/x"), NotSignedInError);
  assert.equal(renewCalls(t.calls).length, 1, "the spent credential is not presented again");
});

test("a 5xx and a network error keep the token and the credential", async () => {
  const first = memoryStore(await seed());
  let now = NOW;
  const server = renewTransport(() => jsonResponse(503, { error: "ServiceUnavailable" }));
  const cred = new SessionCredential({ store: first, transport: server.send, now: () => now });
  assert.ok(await cred.restore());
  const before = first.peek();
  now = NOW + 3_600_000 - EXPIRY_GUARD_MS;
  await assert.rejects(cred.renew(), RenewalUnavailableError);
  assert.equal(cred.session?.principal, PRINCIPAL);
  assert.equal(first.peek()?.renew, OLD_RENEW);
  assert.equal(first.peek()?.accessToken, before?.accessToken);

  const second = memoryStore(await seed({ expiresAt: NOW - 1, accessToken: "tok-old" }));
  const send: Transport = async () => { throw new TypeError("Failed to fetch"); };
  const again = new SessionCredential({ store: second, transport: send, now: () => NOW });
  await assert.rejects(again.restore(), RenewalUnavailableError);
  assert.equal(second.peek()?.renew, OLD_RENEW);
  assert.equal(second.peek()?.accessToken, "tok-old");
});

test("a sign-out during renew wins and the rotated credential is not stored", async () => {
  const store = memoryStore(await seed());
  let release!: (value: TransportResponse) => void;
  let renewSeen: Promise<void> = Promise.resolve();
  let markSeen!: () => void;
  renewSeen = new Promise<void>((resolve) => { markSeen = resolve; });
  const calls: Call[] = [];
  const send: Transport = async (url, req) => {
    calls.push({ url, req });
    if (url === RENEW_URL) {
      markSeen();
      return new Promise<TransportResponse>((resolve) => { release = resolve; });
    }
    if (url === SIGN_OUT_URL) return jsonResponse(204, {});
    return jsonResponse(500, {});
  };
  const cred = new SessionCredential({ store, transport: send, now: () => NOW });
  assert.ok(await cred.restore());
  const pending = cred.renew();
  await renewSeen;
  const signedOut = await cred.signOut(ORIGIN);
  release(jsonResponse(200, renewedBody()));
  assert.equal(await pending, null);
  assert.equal(signedOut.serverSignedOut, true);
  assert.equal(cred.session, null);
  assert.equal(store.peek(), null);
  assert.equal(calls.filter((call) => call.url === RENEW_URL).length, 1);
});

test("signOut posts the sign-out and then clears", async () => {
  const store = memoryStore(await seed());
  const calls: Call[] = [];
  const send: Transport = async (url, req) => {
    calls.push({ url, req });
    assert.equal(store.peek()?.renew, OLD_RENEW, "the record is still there while the server call is in flight");
    if (url === SIGN_OUT_URL) return jsonResponse(204, {});
    return jsonResponse(500, {});
  };
  const cred = new SessionCredential({ store, transport: send, now: () => NOW });
  assert.ok(await cred.restore());
  const token = store.peek()?.accessToken;
  const result = await cred.signOut(ORIGIN);
  assert.equal(result.serverSignedOut, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, SIGN_OUT_URL);
  assert.equal(calls[0]!.req.method, "POST");
  const authorization = calls[0]!.req.headers.Authorization;
  assert.equal(authorization, `DPoP ${token}`);
  const proof = calls[0]!.req.headers.DPoP!;
  const claims = dec(proof.split(".")[1]!) as { htm?: string; htu?: string; ath?: string };
  assert.equal(claims.htm, "POST");
  assert.equal(claims.htu, SIGN_OUT_URL);
  assert.equal(typeof claims.ath, "string");
  assert.equal(cred.session, null);
  assert.equal(store.peek(), null);
});

test("signOut clears even when the server hangs, and reports serverSignedOut false", async () => {
  const store = memoryStore(await seed());
  let sawSignOut = false;
  const send: Transport = async (url) => {
    if (url === SIGN_OUT_URL) {
      sawSignOut = true;
      return new Promise<TransportResponse>(() => {});
    }
    return jsonResponse(500, {});
  };
  const cred = new SessionCredential({ store, transport: send, now: () => NOW });
  assert.ok(await cred.restore());
  const started = Date.now();
  const result = await cred.signOut(ORIGIN);
  const elapsed = Date.now() - started;
  assert.equal(result.serverSignedOut, false);
  assert.equal(sawSignOut, true);
  assert.equal(cred.session, null);
  assert.equal(store.peek(), null);
  assert.ok(elapsed >= SIGN_OUT_BOUND_MS - 500);
  assert.ok(elapsed < SIGN_OUT_BOUND_MS + 1500);
});

/** Lets a real crypto promise settle while `setTimeout` is faked. */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Renew route with the platform's one-shot grace: the current secret rotates, and the
 * immediately previous secret is accepted once when `clock()` is within 60 s of that rotation.
 * Anything older is `reuse`. `loseCount` answers are dropped after the rotation is recorded.
 */
function graceRenew(clock: () => number, opts?: { lose?: "throw" | number; loseCount?: number; holdFirst?: Promise<void> }) {
  let current = OLD_RENEW;
  let serial = 0;
  let previous: { secret: string; at: number } | null = null;
  let reuse = 0;
  let lost = 0;
  const presented: string[] = [];
  const loseCount = opts?.loseCount ?? (opts?.lose === undefined ? 0 : 1);
  const send: Transport = async (url, req) => {
    if (url !== RENEW_URL) return jsonResponse(500, { error: "unexpected" });
    const secret = (JSON.parse(req.body ?? "{}") as { renew?: unknown }).renew;
    if (typeof secret !== "string") return jsonResponse(400, {});
    presented.push(secret);
    const withinGrace = previous !== null && secret === previous.secret && clock() - previous.at <= 60_000;
    if (secret !== current && !withinGrace) {
      reuse += 1;
      return jsonResponse(401, { error: "Unauthorized", message: "reuse-detected" });
    }
    const wasCurrent = secret === current;
    previous = { secret: current, at: clock() };
    serial += 1;
    current = `rsi1.fam.rot-${serial}`;
    if (lost < loseCount && (wasCurrent || withinGrace)) {
      lost += 1;
      if (opts?.holdFirst && lost === 1) await opts.holdFirst;
      if (opts?.lose === "throw") throw new TypeError("Failed to fetch");
      return jsonResponse(typeof opts?.lose === "number" ? opts.lose : 504, { error: "lost" });
    }
    return jsonResponse(200, renewedBody(current));
  };
  return { send, presented, reuse: () => reuse, current: () => current };
}

function hangStore(inner: Mem, mode: { hangLoadAfter?: number; hangSavesAfter?: number; throwSaveAt?: number[] }): Mem {
  let loads = 0;
  let saves = 0;
  return {
    peek: () => inner.peek(),
    async load() {
      loads += 1;
      if (mode.hangLoadAfter !== undefined && loads > mode.hangLoadAfter) return new Promise(() => {});
      return inner.load();
    },
    save: (session) => inner.save(session),
    async saveIfCurrent(session, expect) {
      saves += 1;
      if (mode.throwSaveAt?.includes(saves)) throw new Error("store save failed");
      if (mode.hangSavesAfter !== undefined && saves > mode.hangSavesAfter) return new Promise(() => {});
      return inner.saveIfCurrent(session, expect);
    },
    clearIfCurrent: (expect) => inner.clearIfCurrent(expect),
    clear: () => inner.clear(),
  };
}

test("a lost renew answer is presented once more within 45s and the grace server accepts it", async () => {
  const store = memoryStore(await seed());
  let now = NOW;
  const server = graceRenew(() => now, { lose: "throw" });
  const cred = new SessionCredential({ store, transport: server.send, now: () => now });
  assert.ok(await cred.restore());
  await assert.rejects(cred.renew(), RenewalUnavailableError);
  assert.equal(cred.session?.principal, PRINCIPAL);
  assert.equal(store.peek()?.renew, OLD_RENEW);
  assert.equal(store.peek()?.renewAttemptAt, NOW);
  assert.equal(store.peek()?.renewGraceUsed, undefined);
  assert.deepEqual(server.presented, [OLD_RENEW]);

  now = NOW + 45_000; // literal: the design bound, not the constant under test
  const session = await cred.renew();
  assert.equal(session?.principal, PRINCIPAL);
  assert.deepEqual(server.presented, [OLD_RENEW, OLD_RENEW]);
  assert.equal(server.reuse(), 0);
  assert.equal(store.peek()?.renew, server.current());
  assert.equal(store.peek()?.renewAttemptAt, undefined);
});

test("a 504 from renew is the same lost answer and retries once inside the grace window", async () => {
  const store = memoryStore(await seed());
  let now = NOW;
  const server = graceRenew(() => now, { lose: 504 });
  const cred = new SessionCredential({ store, transport: server.send, now: () => now });
  assert.ok(await cred.restore());
  await assert.rejects(cred.renew(), RenewalUnavailableError);
  now = NOW + 45_000; // literal: the design bound, not the constant under test
  assert.equal((await cred.renew())?.principal, PRINCIPAL);
  assert.deepEqual(server.presented, [OLD_RENEW, OLD_RENEW]);
  assert.equal(server.reuse(), 0);
  assert.equal(store.peek()?.renew, server.current());
});

test("a lost grace retry is not presented a third time", async () => {
  // Still inside the 45 s window when the token enters the guard, so authHeaders would send if it were allowed.
  const expiresAt = NOW + EXPIRY_GUARD_MS + 10_000;
  const store = memoryStore(await seed({ expiresAt }));
  let now = NOW;
  const server = graceRenew(() => now, { lose: "throw", loseCount: 2 });
  const cred = new SessionCredential({ store, transport: server.send, now: () => now });
  assert.ok(await cred.restore());
  await assert.rejects(cred.renew(), RenewalUnavailableError);
  await assert.rejects(cred.renew(), RenewalUnavailableError);
  assert.equal(store.peek()?.renewGraceUsed, true);
  assert.deepEqual(server.presented, [OLD_RENEW, OLD_RENEW]);
  now = NOW + 10_000;
  await assert.rejects(cred.renew(), RenewalUnavailableError);
  await assert.rejects(cred.authHeaders("GET", "https://a.example.test/x"), RenewalUnavailableError);
  assert.deepEqual(server.presented, [OLD_RENEW, OLD_RENEW]);
  assert.equal(server.reuse(), 0);
  assert.equal(cred.session?.principal, PRINCIPAL);
  assert.equal(store.peek()?.renew, OLD_RENEW);
});

test("after the retry window a lost answer is presented once more and a reuse 401 signs out", async () => {
  const store = memoryStore(await seed({ accessToken: "tok-old", expiresAt: NOW - 1 }));
  let now = NOW;
  const server = graceRenew(() => now, { lose: "throw" });
  const cred = new SessionCredential({ store, transport: server.send, now: () => now });
  await assert.rejects(cred.restore(), RenewalUnavailableError);
  assert.deepEqual(server.presented, [OLD_RENEW]);
  // The expired token is not adopted. The renewal credential stays, so a later call can present it.
  assert.equal(cred.session, null);
  assert.equal(store.peek()?.renew, OLD_RENEW);
  assert.equal(store.peek()?.session.principal, PRINCIPAL);

  now = NOW + 70_000;
  assert.equal(await cred.renew(), null);
  assert.deepEqual(server.presented, [OLD_RENEW, OLD_RENEW]);
  assert.equal(server.reuse(), 1);
  assert.equal(cred.session, null);
  assert.equal(store.peek(), null);
  assert.equal(await cred.renew(), null);
  await assert.rejects(cred.authHeaders("GET", "https://a.example.test/x"), NotSignedInError);
  assert.deepEqual(server.presented, [OLD_RENEW, OLD_RENEW]);
});

test("an offline attempt that never reached the server renews on one later request", async () => {
  const store = memoryStore(await seed({ accessToken: "tok-old", expiresAt: NOW - 1 }));
  let now = NOW;
  let invocations = 0;
  const presented: string[] = [];
  const send: Transport = async (url, req) => {
    invocations += 1;
    if (url !== RENEW_URL) return jsonResponse(500, {});
    // The first try dies before any server handler, so the secret is not rotated.
    if (invocations === 1) throw new TypeError("Failed to fetch");
    const secret = (JSON.parse(req.body ?? "{}") as { renew?: unknown }).renew;
    if (typeof secret === "string") presented.push(secret);
    return jsonResponse(200, renewedBody());
  };
  const cred = new SessionCredential({ store, transport: send, now: () => now });
  await assert.rejects(cred.restore(), RenewalUnavailableError);
  assert.equal(invocations, 1);
  assert.deepEqual(presented, []);
  assert.equal(store.peek()?.renew, OLD_RENEW);
  assert.equal(store.peek()?.renewAttemptAt, NOW);

  now = NOW + 24 * 60 * 60 * 1000;
  const session = await cred.renew();
  assert.equal(session?.principal, PRINCIPAL);
  assert.deepEqual(presented, [OLD_RENEW]);
  assert.equal(invocations, 2);
  assert.equal(store.peek()?.renew, NEW_RENEW);
  assert.equal(store.peek()?.renewAttemptAt, undefined);
  assert.equal(store.peek()?.renewGraceUsed, undefined);
});

test("45_000 after a lost answer is the grace retry and 45_001 is the last try", async () => {
  // Literals, not the exported constant: 45_000 still sends, 45_001 is the last try.
  const graceStore = memoryStore(await seed({ accessToken: "tok-old", expiresAt: NOW - 1 }));
  let now = NOW;
  const graceServer = graceRenew(() => now, { lose: "throw", loseCount: 2 });
  const graceCred = new SessionCredential({ store: graceStore, transport: graceServer.send, now: () => now });
  await assert.rejects(graceCred.restore(), RenewalUnavailableError);
  now = NOW + 45_000;
  await assert.rejects(graceCred.renew(), RenewalUnavailableError);
  assert.deepEqual(graceServer.presented, [OLD_RENEW, OLD_RENEW]);
  assert.equal(graceServer.reuse(), 0);
  assert.equal(graceStore.peek()?.renewGraceUsed, true);
  assert.equal(graceStore.peek()?.renewAttemptAt, NOW);
  await assert.rejects(graceCred.renew(), RenewalUnavailableError);
  assert.deepEqual(graceServer.presented, [OLD_RENEW, OLD_RENEW]);

  const lastStore = memoryStore(await seed({ accessToken: "tok-old", expiresAt: NOW - 1 }));
  now = NOW;
  const lastServer = graceRenew(() => now, { lose: "throw", loseCount: 2 });
  const lastCred = new SessionCredential({ store: lastStore, transport: lastServer.send, now: () => now });
  await assert.rejects(lastCred.restore(), RenewalUnavailableError);
  now = NOW + 45_001;
  await assert.rejects(lastCred.renew(), RenewalUnavailableError);
  assert.deepEqual(lastServer.presented, [OLD_RENEW, OLD_RENEW]);
  assert.equal(lastStore.peek()?.renewAttemptAt, NOW + 45_001);
  assert.equal(lastStore.peek()?.renewGraceUsed, undefined);
  // The rearmed credential is presented at once. Two rotations already happened, so this is reuse.
  assert.equal(await lastCred.renew(), null);
  assert.equal(lastServer.presented.length, 3);
  assert.equal(lastServer.reuse(), 1);
  assert.equal(lastCred.session, null);
  assert.equal(lastStore.peek(), null);
  assert.equal(await lastCred.renew(), null);
  assert.equal(lastServer.presented.length, 3);
});

test("the retry window is judged when the request is about to be sent", async () => {
  const inner = memoryStore(await seed({ accessToken: "tok-old", expiresAt: NOW - 1 }));
  let now = NOW;
  let saves = 0;
  const store: Mem = {
    peek: () => inner.peek(),
    load: () => inner.load(),
    save: (session) => inner.save(session),
    async saveIfCurrent(session, expect) {
      saves += 1;
      // The second presentation's mark starts inside the window and lands past it.
      if (saves === 2) now = NOW + 45_001;
      return inner.saveIfCurrent(session, expect);
    },
    clearIfCurrent: (expect) => inner.clearIfCurrent(expect),
    clear: () => inner.clear(),
  };
  const server = graceRenew(() => now, { lose: "throw", loseCount: 2 });
  const cred = new SessionCredential({ store, transport: server.send, now: () => now });
  await assert.rejects(cred.restore(), RenewalUnavailableError);
  assert.equal(saves, 1);
  assert.equal(inner.peek()?.renewAttemptAt, NOW);
  assert.equal(inner.peek()?.renewGraceUsed, undefined);
  now = NOW + 44_000;
  await assert.rejects(cred.renew(), RenewalUnavailableError);
  assert.deepEqual(server.presented, [OLD_RENEW, OLD_RENEW]);
  // A check taken before the mark save would have left the original attempt and grace used.
  assert.equal(inner.peek()?.renewAttemptAt, NOW + 45_001);
  assert.equal(inner.peek()?.renewGraceUsed, undefined);
});

test("a failed attempt mark is not presented again inside 45s on this page", async () => {
  const inner = memoryStore(await seed({ accessToken: "tok-old", expiresAt: NOW - 1 }));
  const store = hangStore(inner, { throwSaveAt: [1] });
  let now = NOW;
  const server = graceRenew(() => now, { lose: "throw" });
  const cred = new SessionCredential({ store, transport: server.send, now: () => now });
  await assert.rejects(cred.restore(), RenewalUnavailableError);
  assert.deepEqual(server.presented, [OLD_RENEW]);
  assert.equal(inner.peek()?.renew, OLD_RENEW);
  assert.equal(inner.peek()?.renewAttemptAt, undefined);

  now = NOW + 1_000;
  await assert.rejects(cred.renew(), RenewalUnavailableError);
  assert.deepEqual(server.presented, [OLD_RENEW]);

  now = NOW + 45_001; // literal: past the window, still inside the server's 60 s
  const session = await cred.renew();
  assert.equal(session?.principal, PRINCIPAL);
  assert.deepEqual(server.presented, [OLD_RENEW, OLD_RENEW]);
  assert.equal(server.reuse(), 0);
  assert.equal(inner.peek()?.renew, server.current());
});

test("a reload after a failed attempt mark can present and end the sign-in", async () => {
  const inner = memoryStore(await seed({ accessToken: "tok-old", expiresAt: NOW - 1 }));
  const store = hangStore(inner, { throwSaveAt: [1] });
  let now = NOW;
  const server = graceRenew(() => now, { lose: "throw" });
  const cred = new SessionCredential({ store, transport: server.send, now: () => now });
  await assert.rejects(cred.restore(), RenewalUnavailableError);
  assert.equal(inner.peek()?.renewAttemptAt, undefined);
  assert.deepEqual(server.presented, [OLD_RENEW]);

  now = NOW + 70_000;
  const reloaded = new SessionCredential({ store, transport: server.send, now: () => now });
  assert.equal(await reloaded.restore(), null);
  assert.equal(server.presented.length, 2);
  assert.equal(server.reuse(), 1);
  assert.equal(reloaded.session, null);
  assert.equal(inner.peek(), null);
});

test("a plain invalidate keeps the renewal and a reload renews", async () => {
  const kept = memoryStore(await seed({ renewAttemptAt: NOW - 5_000, renewGraceUsed: true }));
  const quiet: Transport = async () => jsonResponse(500, {});
  const holding = new SessionCredential({ store: kept, transport: quiet, now: () => NOW });
  assert.equal((await holding.restore())?.principal, PRINCIPAL);
  await holding.invalidate();
  const record = kept.peek();
  assert.ok(record);
  assert.equal(record.accessToken, "");
  assert.equal(record.expiresAt, 0);
  assert.equal(record.renew, OLD_RENEW);
  assert.equal(record.renewExpiresAt, LIVE_EXPIRY);
  assert.equal(record.origin, ORIGIN);
  assert.equal(record.renewAttemptAt, NOW - 5_000);
  assert.equal(record.renewGraceUsed, true);
  assert.equal(record.session.principal, PRINCIPAL);

  const store = memoryStore(await seed());
  const server = graceRenew(() => NOW);
  const live = new SessionCredential({ store, transport: server.send, now: () => NOW });
  assert.equal((await live.restore())?.principal, PRINCIPAL);
  assert.equal(server.presented.length, 0);
  await live.invalidate();
  assert.equal(store.peek()?.accessToken, "");
  assert.equal(store.peek()?.renew, OLD_RENEW);
  assert.equal(store.peek()?.renewExpiresAt, LIVE_EXPIRY);
  assert.equal(store.peek()?.origin, ORIGIN);
  const again = new SessionCredential({ store, transport: server.send, now: () => NOW });
  assert.equal((await again.restore())?.principal, PRINCIPAL);
  assert.deepEqual(server.presented, [OLD_RENEW]);
  assert.equal(store.peek()?.renew, server.current());
  assert.ok((store.peek()?.accessToken.length ?? 0) > 0);
});

test("an emptied store is a sign-out and nothing is presented", async () => {
  const store = memoryStore(await seed());
  let now = NOW;
  const presented: string[] = [];
  const send: Transport = async (url, req) => {
    if (url === RENEW_URL) presented.push(req.body ?? "");
    return jsonResponse(200, renewedBody());
  };
  const cred = new SessionCredential({ store, transport: send, now: () => now });
  assert.equal((await cred.restore())?.principal, PRINCIPAL);
  assert.equal(presented.length, 0);
  await store.clear();
  now = NOW + 3_600_000 - EXPIRY_GUARD_MS;
  assert.equal(await cred.renew(), null);
  await assert.rejects(cred.authHeaders("GET", "https://a.example.test/x"), NotSignedInError);
  assert.equal(presented.length, 0);
  assert.equal(cred.session, null);
  assert.equal(store.peek(), null);
});

test("a store load that throws is not an empty record", async () => {
  const inner = memoryStore(await seed());
  let loads = 0;
  const store: Mem = {
    peek: () => inner.peek(),
    async load() {
      loads += 1;
      if (loads > 1) throw new Error("load failed");
      return inner.load();
    },
    save: (session) => inner.save(session),
    saveIfCurrent: (session, expect) => inner.saveIfCurrent(session, expect),
    clearIfCurrent: (expect) => inner.clearIfCurrent(expect),
    clear: () => inner.clear(),
  };
  let now = NOW;
  const presented: string[] = [];
  const send: Transport = async (url) => {
    if (url === RENEW_URL) presented.push(url);
    return jsonResponse(200, renewedBody());
  };
  const cred = new SessionCredential({ store, transport: send, now: () => now });
  assert.equal((await cred.restore())?.principal, PRINCIPAL);
  now = NOW + 3_600_000 - EXPIRY_GUARD_MS;
  await assert.rejects(cred.renew(), RenewalUnavailableError);
  assert.equal(presented.length, 0);
  assert.equal(cred.session?.principal, PRINCIPAL);
  assert.equal(inner.peek()?.renew, OLD_RENEW);
});

test("no state throws RenewalUnavailableError with zero requests across three later calls", async () => {
  // Inside the window after the grace retry, one call sends nothing. That silence ends when the window ends.
  const store = memoryStore(await seed({ accessToken: "tok-old", expiresAt: NOW - 1 }));
  let now = NOW;
  const server = graceRenew(() => now, { lose: "throw", loseCount: 2 });
  const cred = new SessionCredential({ store, transport: server.send, now: () => now });
  await assert.rejects(cred.restore(), RenewalUnavailableError);
  await assert.rejects(cred.renew(), RenewalUnavailableError);
  assert.equal(server.presented.length, 2);
  await assert.rejects(cred.renew(), RenewalUnavailableError);
  assert.equal(server.presented.length, 2);

  now = NOW + 45_001;
  const before = server.presented.length;
  let silent = 0;
  for (let n = 0; n < 3; n++) {
    const at = server.presented.length;
    try {
      await cred.renew();
    } catch (err) {
      assert.ok(err instanceof RenewalUnavailableError);
      if (server.presented.length === at) silent += 1;
    }
  }
  assert.ok(silent < 3);
  assert.ok(server.presented.length > before || cred.session === null);

  // A lost last try records a new attempt. The calls after it are not three silent failures.
  const offline = memoryStore(await seed({ accessToken: "tok-old", expiresAt: NOW - 1 }));
  let clock = NOW;
  let attempts = 0;
  const send: Transport = async () => {
    attempts += 1;
    throw new TypeError("Failed to fetch");
  };
  const offlineCred = new SessionCredential({ store: offline, transport: send, now: () => clock });
  await assert.rejects(offlineCred.restore(), RenewalUnavailableError);
  clock = NOW + 24 * 60 * 60 * 1000;
  await assert.rejects(offlineCred.renew(), RenewalUnavailableError);
  const afterLast = attempts;
  silent = 0;
  for (let n = 0; n < 3; n++) {
    const at = attempts;
    try {
      await offlineCred.renew();
    } catch (err) {
      assert.ok(err instanceof RenewalUnavailableError);
      if (attempts === at) silent += 1;
    }
  }
  assert.ok(silent < 3);
  assert.ok(attempts > afterLast);
});

test("a reload during a renew retries the stored attempt inside the server grace", async () => {
  const store = memoryStore(await seed({ accessToken: "tok-old", expiresAt: NOW - 1 }));
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const now = () => NOW;
  const server = graceRenew(now, { lose: "throw", holdFirst: hold });
  const locks = fakeLocks();
  const uninstall = installLocks(locks);
  try {
    const first = new SessionCredential({ store, transport: server.send, now });
    const pending = first.restore();
    const deadline = Date.now() + 2000;
    while (store.peek()?.renewAttemptAt !== NOW && Date.now() < deadline) await nextTurn();
    assert.equal(store.peek()?.renewAttemptAt, NOW, "the attempt is stored before the answer");
    assert.equal(server.presented.length, 1);
    assert.equal(server.presented[0], OLD_RENEW);

    const second = new SessionCredential({ store, transport: server.send, now });
    const reloaded = second.restore();
    release();
    await assert.rejects(pending, RenewalUnavailableError);
    const session = await reloaded;
    assert.equal(session?.principal, PRINCIPAL);
    assert.deepEqual(server.presented, [OLD_RENEW, OLD_RENEW]);
    assert.equal(server.reuse(), 0);
    assert.equal(store.peek()?.renew, server.current());
    assert.deepEqual(locks.names, [`gilb-signin-renew:${ORIGIN}`, `gilb-signin-renew:${ORIGIN}`]);
  } finally {
    uninstall();
  }
});

test("a renew whose store load never settles rejects within the store bound and does not post", async () => {
  const inner = memoryStore(await seed());
  const store = hangStore(inner, { hangLoadAfter: 1 });
  let now = NOW;
  const calls: Call[] = [];
  const send: Transport = async (url, req) => {
    calls.push({ url, req });
    return jsonResponse(500, {});
  };
  const cred = new SessionCredential({ store, transport: send, now: () => now });
  assert.ok(await cred.restore());
  now = NOW + 3_600_000 - EXPIRY_GUARD_MS;
  const started = Date.now();
  await assert.rejects(cred.authHeaders("GET", "https://a.example.test/x"), RenewalUnavailableError);
  const elapsed = Date.now() - started;
  assert.equal(renewCalls(calls).length, 0);
  assert.ok(elapsed >= STORE_TIMEOUT_MS - 100);
  assert.ok(elapsed < STORE_TIMEOUT_MS + 700);
  assert.ok(elapsed < RENEW_TIMEOUT_MS + 2 * STORE_TIMEOUT_MS);
  assert.equal(cred.session?.principal, PRINCIPAL);
  assert.equal(inner.peek()?.renew, OLD_RENEW);
});

test("a renew whose store saves never settle still returns the new token from memory", async () => {
  const inner = memoryStore(await seed());
  const store = hangStore(inner, { hangSavesAfter: 0 });
  let now = NOW;
  const answer = renewedBody();
  const t = renewTransport(() => jsonResponse(200, answer));
  const cred = new SessionCredential({ store, transport: t.send, now: () => now });
  assert.ok(await cred.restore());
  now = NOW + 3_600_000 - EXPIRY_GUARD_MS;
  const started = Date.now();
  const headers = await cred.authHeaders("GET", "https://a.example.test/x");
  const elapsed = Date.now() - started;
  assert.equal(headers.Authorization, `DPoP ${answer.token}`);
  assert.equal(renewCalls(t.calls).length, 1);
  assert.ok(elapsed < 2 * STORE_TIMEOUT_MS + 1000);
  assert.ok(elapsed < RENEW_TIMEOUT_MS + 2 * STORE_TIMEOUT_MS);
  assert.equal(inner.peek()?.renew, OLD_RENEW);
  assert.equal(cred.session?.principal, PRINCIPAL);
});

test("a failed save of the rotated record keeps the session and a reload within grace recovers", async () => {
  const inner = memoryStore(await seed({ accessToken: "tok-old", expiresAt: NOW - 1 }));
  // The attempt mark lands. The rotated save and the drain that follows it do not.
  const store = hangStore(inner, { throwSaveAt: [2, 3] });
  const now = () => NOW;
  const server = graceRenew(now);
  const logs: unknown[][] = [];
  const prior = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  console.log = (...args: unknown[]) => { logs.push(args); };
  console.warn = (...args: unknown[]) => { logs.push(args); };
  console.error = (...args: unknown[]) => { logs.push(args); };
  console.info = (...args: unknown[]) => { logs.push(args); };
  console.debug = (...args: unknown[]) => { logs.push(args); };
  try {
    const cred = new SessionCredential({ store, transport: server.send, now });
    const session = await cred.restore();
    assert.equal(session?.principal, PRINCIPAL);
    assert.equal(cred.session?.principal, PRINCIPAL);
    assert.equal(inner.peek()?.renew, OLD_RENEW);
    assert.equal(typeof inner.peek()?.renewAttemptAt, "number");
    assert.equal(server.presented.length, 1);
    const spoken = JSON.stringify(logs);
    assert.equal(spoken.includes(OLD_RENEW), false);
    assert.equal(spoken.includes("rot-"), false);

    const reloaded = new SessionCredential({ store, transport: server.send, now });
    const again = await reloaded.restore();
    assert.equal(again?.principal, PRINCIPAL);
    assert.deepEqual(server.presented, [OLD_RENEW, OLD_RENEW]);
    assert.equal(server.reuse(), 0);
    assert.equal(inner.peek()?.renew, server.current());
  } finally {
    console.log = prior.log;
    console.warn = prior.warn;
    console.error = prior.error;
    console.info = prior.info;
    console.debug = prior.debug;
  }
});

test("a renew request that never answers settles at the renew bound and keeps the credential", async () => {
  const store = memoryStore(await seed());
  let now = NOW;
  let timeoutMs = 0;
  let entered = 0;
  const send: Transport = async (url, req) => {
    if (url !== RENEW_URL) return jsonResponse(500, {});
    entered += 1;
    timeoutMs = req.timeoutMs;
    assert.ok(req.signal instanceof AbortSignal);
    return new Promise(() => {});
  };
  const cred = new SessionCredential({ store, transport: send, now: () => now });
  assert.ok(await cred.restore());
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  try {
    now = NOW + 3_600_000 - EXPIRY_GUARD_MS;
    let outcome: unknown = "pending";
    const pending = cred.authHeaders("GET", "https://a.example.test/x").then(
      (headers) => { outcome = headers; },
      (err: unknown) => { outcome = err; },
    );
    const deadline = Date.now() + 2000;
    while (entered === 0 && Date.now() < deadline) await nextTurn();
    assert.equal(entered, 1);
    assert.equal(timeoutMs, RENEW_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(RENEW_TIMEOUT_MS - 1);
    assert.equal(outcome, "pending");
    await vi.advanceTimersByTimeAsync(5);
    await pending;
    assert.ok(outcome instanceof RenewalUnavailableError);
    assert.equal(cred.session?.principal, PRINCIPAL);
    assert.equal(store.peek()?.renew, OLD_RENEW);
    assert.equal(store.peek()?.renewAttemptAt, NOW + 3_600_000 - EXPIRY_GUARD_MS);
  } finally {
    vi.useRealTimers();
  }
});

test("signOut during a hung renew settles quickly and a later sign-in can renew", async () => {
  const store = memoryStore(await seed());
  let now = NOW;
  let renews = 0;
  let sawRenew!: () => void;
  const renewSeen = new Promise<void>((resolve) => { sawRenew = resolve; });
  const calls: Call[] = [];
  const send: Transport = async (url, req) => {
    calls.push({ url, req });
    if (url === RENEW_URL) {
      renews += 1;
      if (renews === 1) {
        sawRenew();
        return new Promise(() => {});
      }
      return jsonResponse(200, renewedBody());
    }
    if (url === SIGN_OUT_URL) return jsonResponse(204, {});
    if (url === VERIFY_URL) {
      return jsonResponse(200, {
        token: jwt(NEW_EXP),
        principal: PRINCIPAL,
        renew: OLD_RENEW,
        renewExpiresAt: LIVE_EXPIRY,
      });
    }
    if (url === `${ORIGIN}/lws/vaults`) {
      return jsonResponse(200, { vaults: [{ vaultId: "https://a.example.test/vault", modes: ["read"] }], complete: true });
    }
    return jsonResponse(500, {});
  };
  const locks = fakeLocks();
  const uninstall = installLocks(locks);
  try {
    const cred = new SessionCredential({ store, transport: send, now: () => now });
    assert.ok(await cred.restore());
    now = NOW + 3_600_000 - EXPIRY_GUARD_MS;
    const pending = cred.authHeaders("GET", "https://a.example.test/x");
    const settled = pending.then(() => "signed" as const, (err: unknown) => err);
    await renewSeen;
    const started = Date.now();
    const signedOut = await cred.signOut(ORIGIN);
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 3500);
    assert.equal(signedOut.serverSignedOut, true);
    assert.ok(await settled instanceof NotSignedInError);
    assert.equal(cred.session, null);
    assert.equal(store.peek(), null);

    const next = new SessionCredential({ store, transport: send, now: () => now });
    await next.signInWithCode(ORIGIN, "a@example.test", "123456");
    const session = await next.renew();
    assert.equal(session?.principal, PRINCIPAL);
    assert.equal(renews, 2);
    assert.equal(store.peek()?.renew, NEW_RENEW);
    assert.equal(calls.filter((call) => call.url === SIGN_OUT_URL).length, 1);
  } finally {
    uninstall();
  }
});

test("a stored credential inside the guard is renewed with the adopted secret under the lock", async () => {
  const store = memoryStore(await seed());
  const adopted = "rsi1.fam.adopted-secret";
  const answer = renewedBody("rsi1.fam.after-adopt");
  const t = renewTransport(() => jsonResponse(200, answer));
  const locks = fakeLocks();
  const uninstall = installLocks(locks);
  try {
    const cred = new SessionCredential({ store, transport: t.send, now: () => NOW });
    assert.ok(await cred.restore());
    const record = store.peek();
    assert.ok(record);
    record.renew = adopted;
    record.expiresAt = NOW + EXPIRY_GUARD_MS - 1;
    record.renewExpiresAt = LIVE_EXPIRY;
    const session = await cred.renew();
    assert.equal(session?.principal, PRINCIPAL);
    const hits = renewCalls(t.calls);
    assert.equal(hits.length, 1);
    assert.deepEqual(JSON.parse(hits[0]!.req.body!), { renew: adopted });
    assert.equal(store.peek()?.renew, answer.renew);
    assert.equal(store.peek()?.accessToken, answer.token);
    assert.deepEqual(locks.names, [`gilb-signin-renew:${ORIGIN}`]);
  } finally {
    uninstall();
  }
});

test("an adopted renewal that has already expired ends the sign-in", async () => {
  const store = memoryStore(await seed());
  let now = NOW;
  const t = renewTransport(() => jsonResponse(200, renewedBody()));
  const cred = new SessionCredential({ store, transport: t.send, now: () => now });
  assert.ok(await cred.restore());
  const record = store.peek();
  assert.ok(record);
  record.renew = "rsi1.fam.other-secret";
  record.renewExpiresAt = new Date(NOW - 1000).toISOString();
  record.expiresAt = NOW - 1;
  record.accessToken = "tok-old";
  now = NOW + 3_600_000 - EXPIRY_GUARD_MS;
  await assert.rejects(cred.authHeaders("GET", "https://a.example.test/x"), NotSignedInError);
  assert.equal(renewCalls(t.calls).length, 0);
  assert.equal(store.peek(), null);
  assert.equal(cred.session, null);
  await assert.rejects(cred.authHeaders("GET", "https://a.example.test/x"), NotSignedInError);
  assert.equal(renewCalls(t.calls).length, 0);
});

test("signOut with no token renews first and signs out with the fresh token", async () => {
  const store = memoryStore(await seed());
  const answer = renewedBody();
  const calls: Call[] = [];
  const send: Transport = async (url, req) => {
    calls.push({ url, req });
    if (url === RENEW_URL) return jsonResponse(200, answer);
    if (url === SIGN_OUT_URL) return jsonResponse(204, {});
    return jsonResponse(500, {});
  };
  const cred = new SessionCredential({ store, transport: send, now: () => NOW });
  assert.ok(await cred.restore());
  await cred.invalidate();
  assert.equal(cred.session, null);
  const result = await cred.signOut(ORIGIN);
  assert.equal(result.serverSignedOut, true);
  assert.equal(calls[0]?.url, RENEW_URL);
  assert.deepEqual(JSON.parse(calls[0]!.req.body!), { renew: OLD_RENEW });
  assert.equal(calls[1]?.url, SIGN_OUT_URL);
  assert.equal(calls[1]?.req.headers.Authorization, `DPoP ${answer.token}`);
  assert.equal(calls.filter((call) => call.url === RENEW_URL).length, 1);
  assert.equal(calls.filter((call) => call.url === SIGN_OUT_URL).length, 1);
  assert.equal(cred.session, null);
  assert.equal(store.peek(), null);
});

test("signOut with no token clears locally when the renew fails", async () => {
  const store = memoryStore(await seed());
  const calls: string[] = [];
  const send: Transport = async (url) => {
    calls.push(url);
    if (url === RENEW_URL) throw new TypeError("Failed to fetch");
    if (url === SIGN_OUT_URL) return jsonResponse(204, {});
    return jsonResponse(500, {});
  };
  const cred = new SessionCredential({ store, transport: send, now: () => NOW });
  assert.ok(await cred.restore());
  await cred.invalidate();
  const result = await cred.signOut(ORIGIN);
  assert.equal(result.serverSignedOut, false);
  assert.deepEqual(calls, [RENEW_URL]);
  assert.equal(cred.session, null);
  assert.equal(store.peek(), null);
});

test("a stale plain invalidate does not replace a newer rotation", async () => {
  const uninstall = installLocks(undefined);
  try {
    for (const gap of [10_000, 70_000]) {
      const store = memoryStore(await seed());
      let now = NOW;
      const server = graceRenew(() => now);
      const a = new SessionCredential({ store, transport: server.send, now: () => now });
      const b = new SessionCredential({ store, transport: server.send, now: () => now });
      assert.equal((await a.restore())?.principal, PRINCIPAL);
      assert.equal((await b.restore())?.principal, PRINCIPAL);
      assert.equal(await a.renew(), a.session);
      const stored = store.peek()?.renew;
      const token = store.peek()?.accessToken;
      assert.ok(stored && stored !== OLD_RENEW);
      assert.ok(token && token.length > 0);
      now += gap;
      await b.invalidate();
      assert.equal(store.peek()?.renew, stored, `gap ${gap}: stale invalidate left the rotated credential`);
      assert.equal(store.peek()?.accessToken, token, `gap ${gap}: stale invalidate left the token`);
      const before = server.presented.length;
      assert.equal((await a.renew())?.principal, PRINCIPAL);
      assert.equal(server.reuse(), 0, `gap ${gap}`);
      assert.deepEqual(server.presented.slice(before).filter((secret) => secret === OLD_RENEW), []);
      const fresh = new SessionCredential({ store, transport: server.send, now: () => now });
      assert.equal((await fresh.restore())?.principal, PRINCIPAL);
      assert.equal(server.reuse(), 0, `gap ${gap}: fresh restore`);
      assert.equal(server.presented.slice(before).filter((secret) => secret === OLD_RENEW).length, 0);
    }
  } finally {
    uninstall();
  }
});

test("a rotation save retries when a stale invalidate commits during the save gap", async () => {
  const initial = await seed();
  let current: StoredSession | null = initial;
  let releaseHold!: () => void;
  const hold = new Promise<void>((resolve) => { releaseHold = resolve; });
  let holding = false;
  let heldRotation = false;
  const store: Mem = {
    peek: () => current,
    async load() {
      await Promise.resolve();
      return current ? structuredClone(current) : null;
    },
    async save(session) {
      await Promise.resolve();
      current = structuredClone(session);
    },
    async saveIfCurrent(session, expect) {
      const seen = current;
      if (!recordIsCurrent(seen, expect)) return;
      // The first put of the rotated credential yields, the way a store can
      // between its compare and its put. A stale invalidate commits in that gap.
      const rotation = session.renew !== OLD_RENEW && session.accessToken !== "";
      if (rotation && !heldRotation) {
        heldRotation = true;
        holding = true;
        await hold;
        if (current !== seen) return;
        current = structuredClone(session);
        return;
      }
      await Promise.resolve();
      if (current !== seen) return;
      current = structuredClone(session);
    },
    async clearIfCurrent(expect) {
      const seen = current;
      if (!recordIsCurrent(seen, expect)) return;
      await Promise.resolve();
      if (current !== seen) return;
      current = null;
    },
    async clear() {
      await Promise.resolve();
      current = null;
    },
  };
  let now = NOW;
  const server = graceRenew(() => now);
  const uninstall = installLocks(undefined);
  try {
    const a = new SessionCredential({ store, transport: server.send, now: () => now });
    const b = new SessionCredential({ store, transport: server.send, now: () => now });
    assert.equal((await a.restore())?.principal, PRINCIPAL);
    assert.equal((await b.restore())?.principal, PRINCIPAL);
    const pending = a.renew();
    const deadline = Date.now() + 2000;
    while (!holding && Date.now() < deadline) await nextTurn();
    assert.equal(holding, true);
    await b.invalidate();
    assert.equal(store.peek()?.renew, OLD_RENEW);
    assert.equal(store.peek()?.accessToken, "");
    releaseHold();
    assert.equal((await pending)?.principal, PRINCIPAL);
    assert.equal(store.peek()?.renew, server.current());
    assert.ok((store.peek()?.accessToken ?? "").length > 0);
    now += 70_000;
    const before = server.presented.length;
    assert.equal((await b.renew())?.principal, PRINCIPAL);
    assert.equal(server.reuse(), 0);
    assert.equal(server.presented.slice(before).includes(OLD_RENEW), false);
  } finally {
    uninstall();
  }
});

test("a renew 401 does not clear another tab's newer sign-in", async () => {
  const store = memoryStore();
  let now = NOW;
  const aRenew = "rsi1.fam.a-secret";
  const bRenew = "rsi1.fam.b-secret";
  let aPresented = 0;
  let bPresented = 0;
  const bAnswer = renewedBody("rsi1.fam.b-next");
  const vaults = jsonResponse(200, { vaults: [], complete: true });
  const aSend: Transport = async (url) => {
    if (url === VERIFY_URL) {
      return jsonResponse(200, {
        token: jwt(Math.floor(NOW / 1000) + 3600),
        principal: PRINCIPAL,
        renew: aRenew,
        renewExpiresAt: LIVE_EXPIRY,
      });
    }
    if (url.endsWith("/lws/vaults")) return vaults;
    if (url === RENEW_URL) {
      aPresented += 1;
      return jsonResponse(401, { error: "Unauthorized" });
    }
    return jsonResponse(500, {});
  };
  const bSend: Transport = async (url, req) => {
    if (url === VERIFY_URL) {
      return jsonResponse(200, {
        token: jwt(Math.floor(NOW / 1000) + 3600),
        principal: "https://id.example.test/i/b",
        renew: bRenew,
        renewExpiresAt: LIVE_EXPIRY,
      });
    }
    if (url.endsWith("/lws/vaults")) return vaults;
    if (url === RENEW_URL) {
      bPresented += 1;
      assert.equal((JSON.parse(req.body ?? "{}") as { renew?: unknown }).renew, bRenew);
      return jsonResponse(200, { ...bAnswer, principal: "https://id.example.test/i/b" });
    }
    return jsonResponse(500, {});
  };
  const uninstall = installLocks(undefined);
  try {
    const a = new SessionCredential({ store, transport: aSend, now: () => now });
    const b = new SessionCredential({ store, transport: bSend, now: () => now });
    await a.signInWithCode(ORIGIN, "a@example.test", "123456");
    await b.signInWithCode(ORIGIN, "b@example.test", "123456");
    assert.equal(store.peek()?.renew, bRenew);
    now = NOW + 3_600_000 - EXPIRY_GUARD_MS;
    await assert.rejects(a.authHeaders("GET", `${ORIGIN}/x`), NotSignedInError);
    assert.equal(aPresented, 1);
    assert.equal(a.session, null);
    assert.equal(store.peek()?.renew, bRenew, "B's newer sign-in stays in the store");
    const headers = await b.authHeaders("GET", `${ORIGIN}/x`);
    assert.equal(headers.Authorization, `DPoP ${bAnswer.token}`);
    assert.equal(b.session?.principal, "https://id.example.test/i/b");
    assert.equal(bPresented, 1);
    const fresh = new SessionCredential({ store, transport: bSend, now: () => now });
    assert.equal((await fresh.restore())?.principal, "https://id.example.test/i/b");
    assert.equal(bPresented, 1, "the fresh page adopts B's live token and does not present");
  } finally {
    uninstall();
  }
});

test("an explicit sign-out still empties the store and the other tab does not present", async () => {
  const store = memoryStore();
  let now = NOW;
  const aRenew = "rsi1.fam.a-secret";
  const bRenew = "rsi1.fam.b-secret";
  let bPresented = 0;
  const vaults = jsonResponse(200, { vaults: [], complete: true });
  const aSend: Transport = async (url) => {
    if (url === VERIFY_URL) {
      return jsonResponse(200, {
        token: jwt(Math.floor(NOW / 1000) + 3600),
        principal: PRINCIPAL,
        renew: aRenew,
        renewExpiresAt: LIVE_EXPIRY,
      });
    }
    if (url.endsWith("/lws/vaults")) return vaults;
    if (url === SIGN_OUT_URL) return jsonResponse(204, {});
    return jsonResponse(500, {});
  };
  const bSend: Transport = async (url) => {
    if (url === VERIFY_URL) {
      return jsonResponse(200, {
        token: jwt(Math.floor(NOW / 1000) + 3600),
        principal: "https://id.example.test/i/b",
        renew: bRenew,
        renewExpiresAt: LIVE_EXPIRY,
      });
    }
    if (url.endsWith("/lws/vaults")) return vaults;
    if (url === RENEW_URL) {
      bPresented += 1;
      return jsonResponse(200, renewedBody());
    }
    return jsonResponse(500, {});
  };
  const uninstall = installLocks(undefined);
  try {
    const a = new SessionCredential({ store, transport: aSend, now: () => now });
    const b = new SessionCredential({ store, transport: bSend, now: () => now });
    await a.signInWithCode(ORIGIN, "a@example.test", "123456");
    await b.signInWithCode(ORIGIN, "b@example.test", "123456");
    assert.equal(store.peek()?.renew, bRenew);
    const signedOut = await a.signOut(ORIGIN);
    assert.equal(signedOut.serverSignedOut, true);
    assert.equal(store.peek(), null, "explicit sign-out clears whatever the store holds");
    assert.equal(await b.renew(), null);
    assert.equal(bPresented, 0, "B signs out from the empty store without presenting");
    await assert.rejects(b.authHeaders("GET", `${ORIGIN}/x`), NotSignedInError);
    assert.equal(bPresented, 0);
    assert.equal(b.session, null);
  } finally {
    uninstall();
  }
});

test("a rotation save does not overwrite another tab's newer rotation", async () => {
  const inner = memoryStore(await seed());
  let now = NOW;
  let requests = 0;
  let aEntered!: () => void;
  const aWaiting = new Promise<void>((resolve) => { aEntered = resolve; });
  let noteBSave!: () => void;
  const bSaved = new Promise<void>((resolve) => { noteBSave = resolve; });
  let current = OLD_RENEW;
  let previous: string | null = null;
  let serial = 0;
  const issued: string[] = [];
  const accept = (presented: string): { renew: string; token: string } | null => {
    const grace = previous !== null && presented === previous;
    if (presented !== current && !grace) return null;
    previous = current;
    serial += 1;
    current = `rsi1.fam.rot-${serial}`;
    const token = jwt(NEW_EXP);
    issued.push(current);
    return { renew: current, token };
  };
  const send: Transport = async (url, req) => {
    if (url !== RENEW_URL) return jsonResponse(500, {});
    const presented = (JSON.parse(req.body ?? "{}") as { renew?: unknown }).renew;
    if (typeof presented !== "string") return jsonResponse(400, {});
    const accepted = accept(presented);
    if (!accepted) return jsonResponse(401, { error: "Unauthorized" });
    requests += 1;
    if (requests === 1) {
      aEntered();
      await bSaved;
    }
    return jsonResponse(200, {
      token: accepted.token,
      renew: accepted.renew,
      renewExpiresAt: LIVE_EXPIRY,
      principal: PRINCIPAL,
    });
  };
  let rotationSaves = 0;
  const store: Mem = {
    peek: () => inner.peek(),
    load: () => inner.load(),
    save: (session) => inner.save(session),
    async saveIfCurrent(session, expect) {
      await inner.saveIfCurrent(session, expect);
      if (typeof session.renew === "string" && session.renew !== OLD_RENEW && session.accessToken.length > 0) {
        rotationSaves += 1;
        if (rotationSaves === 1) noteBSave();
      }
    },
    clearIfCurrent: (expect) => inner.clearIfCurrent(expect),
    clear: () => inner.clear(),
  };
  const uninstall = installLocks(undefined);
  try {
    const a = new SessionCredential({ store, transport: send, now: () => now });
    const b = new SessionCredential({ store, transport: send, now: () => now });
    assert.equal((await a.restore())?.principal, PRINCIPAL);
    assert.equal((await b.restore())?.principal, PRINCIPAL);
    const pendingA = a.renew();
    await aWaiting;
    const sessionB = await b.renew();
    const sessionA = await pendingA;
    assert.equal(sessionB?.principal, PRINCIPAL);
    assert.equal(sessionA?.principal, PRINCIPAL);
    assert.deepEqual(issued, ["rsi1.fam.rot-1", "rsi1.fam.rot-2"]);
    assert.equal(store.peek()?.renew, "rsi1.fam.rot-2", "A's later save does not replace B's rotation");
    assert.equal(rotationSaves, 2);
    const before = requests;
    assert.equal((await a.renew())?.principal, PRINCIPAL);
    assert.equal(requests, before, "A's next renew adopts B's record and does not present");
    assert.equal(store.peek()?.renew, "rsi1.fam.rot-2");
  } finally {
    uninstall();
  }
});
