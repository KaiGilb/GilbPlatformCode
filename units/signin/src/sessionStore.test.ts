// The cookieless session store: an in-memory SessionStore for the credential, and a minimal
// IndexedDB fake for the adapter. No network.
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  SessionCredential,
  NotSignedInError,
  EXPIRY_GUARD_MS,
  STORED_SESSION_VERSION,
  SESSION_DB_NAME,
  SESSION_OBJECT_STORE,
  SESSION_RECORD_KEY,
  indexedDbSessionStore,
  familyOf,
  recordIsCurrent,
  type CurrentRecordExpect,
  type SessionStore,
  type StoredSession,
} from "./session";
import { generateDpopKeyPair, type DpopPublicJwk } from "./dpop";
import type { Transport, TransportRequest } from "./transport";

const NOW = 1_700_000_000_000;
const ORIGIN = "https://id.example.test";
const PRINCIPAL = "https://id.example.test/i/p9";

const jwt = (exp: number) =>
  `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;

const dec = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

async function jktOf(jwk: DpopPublicJwk): Promise<string> {
  // RFC 7638: members in lexicographic order, no whitespace.
  const json = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return Buffer.from(digest).toString("base64url");
}

interface Mem extends SessionStore {
  saves: string[];
  clearCount: number;
  /** How many times `clear` had been entered, read synchronously. */
  readonly enteredClears: number;
}

function memoryStore(): Mem {
  let current: StoredSession | null = null;
  let enteredClears = 0;
  const saves: string[] = [];
  const store: Mem = {
    saves,
    get clearCount() { return enteredClears; },
    get enteredClears() { return enteredClears; },
    async load() {
      await Promise.resolve();
      return current ? structuredClone(current) : null;
    },
    async save(session) {
      saves.push(session.accessToken);
      await Promise.resolve();
      current = structuredClone(session);
    },
    async saveIfCurrent(session, expect) {
      const seen = current;
      if (!recordIsCurrent(seen, expect)) return;
      await Promise.resolve();
      if (current !== seen) return;
      saves.push(session.accessToken);
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
      enteredClears++;
      await Promise.resolve();
      current = null;
    },
  };
  return store;
}

function codeTransport(vaults: "throw" | { status: number; body?: unknown }) {
  const calls: Array<{ url: string; req: TransportRequest }> = [];
  const token = jwt(Math.floor(NOW / 1000) + 3600);
  const send: Transport = async (url, req) => {
    calls.push({ url, req });
    if (url === `${ORIGIN}/lws/vaults`) {
      if (vaults === "throw") throw new TypeError("Failed to fetch");
      return { status: vaults.status, json: async () => vaults.body };
    }
    return { status: 200, json: async () => ({ token, principal: PRINCIPAL }) };
  };
  return { send, calls, token };
}

const liveVaults = {
  status: 200,
  body: {
    vaults: [
      { vaultId: "https://a.example.test/vault", modes: ["read", "append"] },
      { vaultId: "https://b.example.test/vault", modes: ["write", "read"] },
    ],
    complete: true,
  },
};

async function publicHalf(record: StoredSession): Promise<DpopPublicJwk> {
  const jwk = await crypto.subtle.exportKey("jwk", record.keyPair.publicKey);
  return { kty: jwk.kty as string, crv: jwk.crv as string, x: jwk.x as string, y: jwk.y as string };
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
    accessToken: "tok-stored",
    expiresAt: NOW + 3_600_000,
    session: {
      principal: PRINCIPAL,
      vault: { entity: "https://v.example.test/base/e/v1", id: "v1", name: "sam" },
      vaults: [{ vaultId: "https://a.example.test/vault", modes: ["read"] }],
    },
    ...overrides,
  };
}

test("save after sign-in stores the principal, the vaults and the non-extractable key", async () => {
  const store = memoryStore();
  const t = codeTransport(liveVaults);
  const cred = new SessionCredential({ store, transport: t.send, now: () => NOW });
  await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
  const saved = await store.load();
  assert.ok(saved);
  assert.equal(saved.version, STORED_SESSION_VERSION);
  assert.equal(saved.accessToken, t.token);
  assert.equal(saved.expiresAt, NOW + 3_600_000);
  assert.equal(saved.session.principal, PRINCIPAL);
  assert.equal(saved.session.vault, null);
  assert.deepEqual(saved.session.vaults, [
    { vaultId: "https://a.example.test/vault", modes: ["read"] },
    { vaultId: "https://b.example.test/vault", modes: ["write", "read"] },
  ]);
  assert.equal(saved.session.vaultsProblem, undefined);
  assert.equal(saved.keyPair.privateKey.extractable, false);
  assert.equal(saved.keyPair.privateKey.type, "private");
  await assert.rejects(crypto.subtle.exportKey("jwk", saved.keyPair.privateKey));
  const half = await publicHalf(saved);
  assert.deepEqual(half, await cred.ensurePublicJwk());
  assert.equal(saved.publicKeyId, `${half.x}.${half.y}`);
  assert.ok(store.saves.every((token) => token === t.token));
});

test("a vault-list problem is what the store keeps", async () => {
  const store = memoryStore();
  const t = codeTransport("throw");
  const cred = new SessionCredential({ store, transport: t.send, now: () => NOW });
  await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
  const saved = await store.load();
  assert.deepEqual(saved?.session.vaults, []);
  assert.equal(saved?.session.vaultsProblem, "Could not reach your vault list. The browser blocked the request or the network failed.");
});

test("loadReachableVaults writes the list it stored on the held token", async () => {
  const store = memoryStore();
  const cred = new SessionCredential({
    store,
    now: () => NOW,
    transport: async () => ({ status: 200, json: async () => ({ vaults: [{ vaultId: "v9", modes: ["read", "write"] }], complete: true }) }),
  });
  await cred.ensurePublicJwk();
  await cred.adopt("tok-adopted", { principal: "p", vault: null, vaults: [] }, NOW + 3_600_000);
  const first = await store.load();
  assert.deepEqual(first?.session.vaults, []);
  await cred.loadReachableVaults(ORIGIN);
  const second = await store.load();
  assert.equal(second?.accessToken, "tok-adopted");
  assert.deepEqual(second?.session.vaults, [{ vaultId: "v9", modes: ["read", "write"] }]);
});

test("a token inside the expiry guard is not saved", async () => {
  const store = memoryStore();
  const cred = new SessionCredential({ store, now: () => NOW });
  await cred.ensurePublicJwk();
  await cred.adopt("tok-short", { principal: "p", vault: null, vaults: [] }, NOW + EXPIRY_GUARD_MS);
  assert.deepEqual(store.saves, []);
  assert.equal(await store.load(), null);
  assert.equal(cred.session?.principal, "p");
});

test("needsVaultName saves nothing", async () => {
  const store = memoryStore();
  const cred = new SessionCredential({
    store,
    now: () => NOW,
    transport: async () => ({ status: 200, json: async () => ({ needsVaultName: true, suggestedName: "sam" }) }),
  });
  const body = await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
  assert.equal(body.needsVaultName, true);
  assert.deepEqual(store.saves, []);
  assert.equal(await store.load(), null);
});

test("restore on a new credential returns the same principal and vaults and sends no request", async () => {
  const store = memoryStore();
  const t = codeTransport(liveVaults);
  const cred = new SessionCredential({ store, transport: t.send, now: () => NOW });
  await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
  let requests = 0;
  const again = new SessionCredential({
    store,
    now: () => NOW,
    transport: async () => {
      requests++;
      throw new Error("restore made a request");
    },
  });
  const session = await again.restore();
  assert.equal(requests, 0);
  assert.equal(session?.principal, PRINCIPAL);
  assert.deepEqual(session?.vaults, cred.session?.vaults);
  assert.equal(again.session?.vault, null);
  assert.equal(t.calls.length, 2);
});

test("authHeaders after restore signs with the restored key and the same jkt thumbprint", async () => {
  const store = memoryStore();
  const t = codeTransport(liveVaults);
  const cred = new SessionCredential({ store, transport: t.send, now: () => NOW });
  await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
  const before = await cred.ensurePublicJwk();
  const beforeJkt = await jktOf(before);
  let requests = 0;
  const again = new SessionCredential({
    store,
    now: () => NOW,
    transport: async () => {
      requests++;
      return { status: 500, json: async () => ({}) };
    },
  });
  assert.ok(await again.restore());
  const url = "https://a.example.test/lws/vault/v1/records";
  const headers = await again.authHeaders("GET", url);
  assert.equal(requests, 0);
  assert.equal(headers.Authorization, `DPoP ${t.token}`);
  const [hh, pp, ss] = headers.DPoP.split(".");
  const header = dec(hh);
  assert.equal(await jktOf(header.jwk), beforeJkt);
  assert.equal(dec(pp).htu, "https://a.example.test/lws/vault/v1/records");
  const pub = await crypto.subtle.importKey("jwk", before, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.equal(
    await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, Buffer.from(ss, "base64url"), new TextEncoder().encode(`${hh}.${pp}`)),
    true,
  );
});

test("restore keeps a token one millisecond outside the guard and clears one on the boundary", async () => {
  const outside = memoryStore();
  await outside.save(await seed({ expiresAt: NOW + EXPIRY_GUARD_MS + 1 }));
  const kept = new SessionCredential({ store: outside, now: () => NOW });
  assert.equal((await kept.restore())?.principal, PRINCIPAL);

  const boundary = memoryStore();
  await boundary.save(await seed({ expiresAt: NOW + EXPIRY_GUARD_MS }));
  const dropped = new SessionCredential({ store: boundary, now: () => NOW });
  assert.equal(await dropped.restore(), null);
  assert.equal(dropped.session, null);
  assert.equal(await boundary.load(), null);
});

test("restore of an expired or near-expiry record returns null and clears it", async () => {
  for (const expiresAt of [NOW - 1, NOW + 30_000, NOW + EXPIRY_GUARD_MS]) {
    const store = memoryStore();
    await store.save(await seed({ expiresAt }));
    const cred = new SessionCredential({ store, now: () => NOW });
    assert.equal(await cred.restore(), null, String(expiresAt));
    assert.equal(await store.load(), null, String(expiresAt));
  }
});

test("restore of a wrong version returns null and clears it", async () => {
  const store = memoryStore();
  await store.save(await seed({ version: 2 }));
  const cred = new SessionCredential({ store, now: () => NOW });
  assert.equal(await cred.restore(), null);
  assert.equal(await store.load(), null);
});

test("restore of a malformed record returns null and clears it", async () => {
  const base = await seed();
  const extractable = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const cases: Array<[string, unknown]> = [
    ["not an object", "nope"],
    ["no version", { ...base, version: undefined }],
    ["no key", { ...base, keyPair: {} }],
    ["extractable private key", { ...base, keyPair: extractable }],
    ["empty token", { ...base, accessToken: "" }],
    ["bad expiry", { ...base, expiresAt: Number.NaN }],
    ["no principal", { ...base, session: { principal: "", vault: null, vaults: [] } }],
    ["vaults not an array", { ...base, session: { principal: "p", vault: null, vaults: "no" } }],
    ["missing publicKeyId", { ...base, publicKeyId: undefined }],
    ["empty publicKeyId", { ...base, publicKeyId: "" }],
    ["publicKeyId does not match the public key", { ...base, publicKeyId: `${base.publicKeyId}.no` }],
  ];
  for (const [name, raw] of cases) {
    const store = memoryStore();
    await store.save(raw as StoredSession);
    const cred = new SessionCredential({ store, now: () => NOW });
    assert.equal(await cred.restore(), null, name);
    assert.equal(cred.session, null, name);
    assert.equal(await store.load(), null, name);
  }
});

test("restore of an empty store returns null", async () => {
  const store = memoryStore();
  const cred = new SessionCredential({ store, now: () => NOW });
  assert.equal(await cred.restore(), null);
  assert.equal(cred.session, null);
});

test("sign-out clears the store and starts the clear before it returns", async () => {
  const store = memoryStore();
  const t = codeTransport(liveVaults);
  const cred = new SessionCredential({ store, transport: t.send, now: () => NOW });
  await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
  const before = store.enteredClears;
  const pending = cred.invalidate(true);
  assert.ok(store.enteredClears > before, "clear entered before invalidate returned");
  await pending;
  assert.equal(cred.session, null);
  assert.equal(await store.load(), null);
  const again = new SessionCredential({ store, now: () => NOW });
  assert.equal(await again.restore(), null);
});

test("a sign-out while the vault list is on the wire leaves the store empty", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let listed = false;
  const token = jwt(Math.floor(NOW / 1000) + 3600);
  const send: Transport = async (url) => {
    if (url === `${ORIGIN}/lws/vaults`) {
      listed = true;
      await gate;
      return { status: 200, json: async () => ({ vaults: [{ vaultId: "v", modes: ["read"] }], complete: true }) };
    }
    return { status: 200, json: async () => ({ token, principal: PRINCIPAL }) };
  };
  const store = memoryStore();
  const cred = new SessionCredential({ store, transport: send, now: () => NOW });
  const pending = cred.signInWithCode(ORIGIN, "a@example.test", "123456");
  for (let i = 0; i < 50 && !listed; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(listed, true);
  cred.invalidate(true);
  release();
  await assert.rejects(pending, NotSignedInError);
  assert.equal(cred.session, null);
  assert.equal(await store.load(), null);
});

test("sign-out during restore stores nothing and returns null", async () => {
  const record = await seed();
  let current: StoredSession | null = record;
  let release!: () => void;
  let started = false;
  const store: SessionStore = {
    async load() {
      started = true;
      const seen = current;
      return new Promise((resolve) => {
        release = () => resolve(seen);
      });
    },
    async save(session) { current = session; },
    async saveIfCurrent(session, expect) {
      if (!recordIsCurrent(current, expect)) return;
      current = session;
    },
    async clearIfCurrent(expect) {
      if (!recordIsCurrent(current, expect)) return;
      current = null;
    },
    async clear() { current = null; },
  };
  const cred = new SessionCredential({ store, now: () => NOW });
  const pending = cred.restore();
  for (let i = 0; i < 50 && !started; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(started, true);
  cred.invalidate(true);
  release();
  assert.equal(await pending, null);
  assert.equal(cred.session, null);
  assert.equal(current, null);
});

test("concurrent restore calls share one load", async () => {
  const record = await seed();
  let calls = 0;
  let release!: (value: StoredSession) => void;
  const store: SessionStore = {
    async load() {
      calls++;
      return new Promise((resolve) => { release = resolve; });
    },
    async save() {},
    async saveIfCurrent() {},
    async clearIfCurrent() {},
    async clear() {},
  };
  const cred = new SessionCredential({ store, now: () => NOW });
  const a = cred.restore();
  const b = cred.restore();
  for (let i = 0; i < 50 && calls === 0; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls, 1);
  release(record);
  const [sa, sb] = await Promise.all([a, b]);
  assert.equal(sa, sb);
  assert.equal(sa?.principal, PRINCIPAL);
  assert.equal(calls, 1);
});

test("plain invalidate drops the stored token and keeps the in-memory key", async () => {
  const store = memoryStore();
  const t = codeTransport(liveVaults);
  const cred = new SessionCredential({ store, transport: t.send, now: () => NOW });
  await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
  const before = await cred.ensurePublicJwk();
  await cred.invalidate();
  const saved = await store.load();
  assert.ok(saved);
  assert.equal(saved.accessToken, "");
  assert.equal(saved.expiresAt, 0);
  assert.equal(saved.keyPair.privateKey.extractable, false);
  assert.equal(await jktOf(await publicHalf(saved)), await jktOf(before));
  assert.deepEqual(await cred.ensurePublicJwk(), before);
  const again = new SessionCredential({ store, now: () => NOW });
  assert.equal(await again.restore(), null);
  assert.equal(await store.load(), null);
});

test("dpopMintUrl set saves nothing", async () => {
  const store = memoryStore();
  const cred = new SessionCredential({
    dpopMintUrl: "https://id.example.test/base/auth/session/dpop-token",
    store,
    now: () => NOW,
    transport: async () => ({
      status: 200,
      json: async () => ({ access_token: "tok-bridge", expires_in: 1800, principal: "p", vaults: [] }),
    }),
  });
  await cred.getSession();
  await cred.adopt("tok-adopted", { principal: "p", vault: null, vaults: [] }, NOW + 3_600_000);
  assert.deepEqual(store.saves, []);
  assert.equal(store.enteredClears, 0);
  assert.equal(await store.load(), null);
});

test("store false saves nothing even when indexedDB exists", async () => {
  const fake = fakeIndexedDb();
  const prior = installIndexedDb(fake.api);
  try {
    const cred = new SessionCredential({
      store: false,
      now: () => NOW,
      transport: codeTransport(liveVaults).send,
    });
    await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
    assert.equal(cred.session?.principal, PRINCIPAL);
    assert.deepEqual(fake.opens, []);
  } finally {
    installIndexedDb(prior);
  }
});

test("a host-passed key is never stored", async () => {
  const inner = await generateDpopKeyPair();
  const hostKey = {
    publicJwk: inner.publicJwk,
    sign: async (input: Uint8Array) => new Uint8Array(await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      inner.privateKey,
      input as Uint8Array<ArrayBuffer>,
    )),
  };
  const store = memoryStore();
  const cred = new SessionCredential({ key: hostKey, store, now: () => NOW });
  await cred.adopt("tok-host", { principal: "p", vault: null, vaults: [] }, NOW + 3_600_000);
  await cred.authHeaders("GET", "https://x.example.test/");
  assert.deepEqual(store.saves, []);
  assert.equal(await store.load(), null);
  assert.equal(await cred.restore(), null);
});

test("a store that throws on save still lets sign-in succeed", async () => {
  const store: SessionStore = {
    async load() { return null; },
    async save() { throw new Error("quota"); },
    async saveIfCurrent() { throw new Error("quota"); },
    async clearIfCurrent() { throw new Error("quota"); },
    async clear() { throw new Error("quota"); },
  };
  const t = codeTransport(liveVaults);
  const cred = new SessionCredential({ store, transport: t.send, now: () => NOW });
  const body = await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
  assert.equal(body.principal, PRINCIPAL);
  assert.equal(cred.session?.principal, PRINCIPAL);
  assert.equal((await cred.authHeaders("GET", "https://x.example.test/")).Authorization, `DPoP ${t.token}`);
});

test("a store that throws on load makes restore return null", async () => {
  const store: SessionStore = {
    async load() { throw new Error("blocked"); },
    async save() { throw new Error("blocked"); },
    async saveIfCurrent() { throw new Error("blocked"); },
    async clearIfCurrent() { throw new Error("blocked"); },
    async clear() { throw new Error("blocked"); },
  };
  const cred = new SessionCredential({ store, now: () => NOW });
  assert.equal(await cred.restore(), null);
  assert.equal(cred.session, null);
});

test("the default store uses indexedDB and a reload restores the session", async () => {
  const fake = fakeIndexedDb();
  const prior = installIndexedDb(fake.api);
  try {
    const t = codeTransport(liveVaults);
    const cred = new SessionCredential({ transport: t.send, now: () => NOW });
    await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
    const before = await cred.ensurePublicJwk();
    assert.deepEqual(fake.opens, [SESSION_DB_NAME]);
    assert.deepEqual(fake.storeNames(SESSION_DB_NAME), [SESSION_OBJECT_STORE]);
    assert.deepEqual(fake.keys(SESSION_DB_NAME, SESSION_OBJECT_STORE), [SESSION_RECORD_KEY]);
    assert.ok(fake.durabilities.includes("strict"));
    let requests = 0;
    const again = new SessionCredential({
      now: () => NOW,
      transport: async () => {
        requests++;
        throw new Error("reload made a request");
      },
    });
    const session = await again.restore();
    assert.equal(requests, 0);
    assert.equal(session?.principal, PRINCIPAL);
    assert.deepEqual(session?.vaults, [
      { vaultId: "https://a.example.test/vault", modes: ["read"] },
      { vaultId: "https://b.example.test/vault", modes: ["write", "read"] },
    ]);
    const headers = await again.authHeaders("GET", "https://a.example.test/lws/x");
    const jwk = dec(headers.DPoP.split(".")[0]).jwk;
    assert.equal(await jktOf(jwk), await jktOf(before));
    const saved = fake.record(SESSION_DB_NAME, SESSION_OBJECT_STORE, SESSION_RECORD_KEY) as StoredSession;
    assert.equal(saved.keyPair.privateKey.extractable, false);
    await assert.rejects(crypto.subtle.exportKey("jwk", saved.keyPair.privateKey));
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, saved.keyPair.privateKey, new Uint8Array([1, 2, 3]));
    assert.equal(sig.byteLength, 64);
  } finally {
    installIndexedDb(prior);
  }
});

test("an IndexedDB open failure does not break sign-in and restore returns null", async () => {
  const blocked = fakeIndexedDb({ block: true });
  const prior = installIndexedDb(blocked.api);
  try {
    const t = codeTransport(liveVaults);
    const cred = new SessionCredential({ transport: t.send, now: () => NOW });
    const body = await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
    assert.equal(body.principal, PRINCIPAL);
    assert.equal(cred.session?.principal, PRINCIPAL);
    const again = new SessionCredential({ now: () => NOW });
    assert.equal(await again.restore(), null);
  } finally {
    installIndexedDb(prior);
  }
});

test("the indexedDB adapter keeps one record and clear removes it", async () => {
  const fake = fakeIndexedDb();
  const prior = installIndexedDb(fake.api);
  try {
    const store = indexedDbSessionStore("app-session");
    await store.clear();
    assert.deepEqual(fake.opens, [], "clear does not create a database that was never opened");
    const first = await seed();
    const second = await seed({ accessToken: "tok-2" });
    await store.save(first);
    await store.save(second);
    const loaded = await store.load();
    assert.equal(loaded?.accessToken, "tok-2");
    assert.equal(loaded?.keyPair.privateKey.extractable, false);
    assert.deepEqual(fake.storeNames("app-session"), [SESSION_OBJECT_STORE]);
    assert.deepEqual(fake.keys("app-session", SESSION_OBJECT_STORE), [SESSION_RECORD_KEY]);
    await store.clear();
    assert.equal(await store.load(), null);
  } finally {
    installIndexedDb(prior);
  }
});

test("saveIfCurrent writes only when the stored key and credential match, in one transaction", async () => {
  const fake = fakeIndexedDb();
  const prior = installIndexedDb(fake.api);
  try {
    const store = indexedDbSessionStore("app-session");
    const first = await seed({ renew: "rsi1.fam.s1" });
    const other = await seed({ accessToken: "tok-other", renew: "rsi1.fam.other" });
    const keyOnly: CurrentRecordExpect = { publicKeyId: first.publicKeyId, renew: "rsi1.fam.s1" };
    await store.saveIfCurrent(first, keyOnly);
    assert.equal(await store.load(), null, "no record yet, so an update writes nothing");
    await store.save(first);
    const before = fake.transactions;
    const updated = { ...first, accessToken: "tok-updated", session: { ...first.session, principal: "p-updated" } };
    assert.equal(await store.saveIfCurrent(updated, keyOnly), true);
    assert.equal(fake.transactions - before, 1, "the compare and the write share one transaction");
    assert.equal((await store.load())?.accessToken, "tok-updated");
    assert.equal((await store.load())?.session.principal, "p-updated");
    assert.equal((await store.load())?.publicKeyId, first.publicKeyId);
    const earlier = Date.parse(new Date(NOW).toISOString());
    const later = earlier + 1_000;
    const storedEarlier = { ...first, renewExpiresAt: new Date(earlier).toISOString() };
    await store.save(storedEarlier);
    assert.equal(
      await store.saveIfCurrent(
        { ...storedEarlier, accessToken: "tok-from-older", renew: "rsi1.fam.s2", renewExpiresAt: new Date(later).toISOString() },
        { publicKeyId: first.publicKeyId, renew: "rsi1.fam.s2", renewExpiresAt: later },
      ),
      true,
      "an earlier renewExpiresAt for the same key may be replaced",
    );
    assert.equal((await store.load())?.renew, "rsi1.fam.s2");
    assert.equal(
      await store.saveIfCurrent(
        { ...storedEarlier, accessToken: "tok-should-not", renew: "rsi1.fam.s1", renewExpiresAt: new Date(earlier).toISOString() },
        { publicKeyId: first.publicKeyId, renew: "rsi1.fam.s1", renewExpiresAt: earlier },
      ),
      false,
      "a later renewExpiresAt is not replaced",
    );
    assert.equal((await store.load())?.accessToken, "tok-from-older");
    assert.equal(
      await store.saveIfCurrent(
        { ...storedEarlier, accessToken: "tok-tie", renew: "rsi1.fam.s3", renewExpiresAt: new Date(later).toISOString() },
        { publicKeyId: first.publicKeyId, renew: "rsi1.fam.s3", renewExpiresAt: later },
      ),
      false,
      "an equal renewExpiresAt with a different credential is not replaced",
    );
    assert.equal((await store.load())?.renew, "rsi1.fam.s2");
    assert.equal(
      await store.saveIfCurrent(
        { ...storedEarlier, accessToken: "tok-same", renew: "rsi1.fam.s2", renewExpiresAt: new Date(later).toISOString() },
        { publicKeyId: first.publicKeyId, renew: "rsi1.fam.s2", renewExpiresAt: later },
      ),
      true,
      "the same credential is still current",
    );
    assert.equal((await store.load())?.accessToken, "tok-same");
    const otherFamilyAt = later + 5_000;
    assert.equal(
      await store.saveIfCurrent(
        { ...storedEarlier, accessToken: "tok-other-family", renew: "rsi1.f2.s1", renewExpiresAt: new Date(otherFamilyAt).toISOString() },
        { publicKeyId: first.publicKeyId, renew: "rsi1.f2.s1", renewExpiresAt: otherFamilyAt, family: "f2" },
      ),
      false,
      "another family is not written over, even when its time is later",
    );
    assert.equal((await store.load())?.renew, "rsi1.fam.s2");
    assert.equal(
      await store.saveIfCurrent(
        { ...storedEarlier, accessToken: "tok-over-legacy", renew: "rsi1.fam.s3", renewExpiresAt: new Date(otherFamilyAt).toISOString() },
        { publicKeyId: first.publicKeyId, renew: "rsi1.fam.s3", renewExpiresAt: otherFamilyAt, family: "fam" },
      ),
      true,
    );
    await store.save({ ...storedEarlier, renew: "legacy-credential", renewExpiresAt: new Date(earlier).toISOString() });
    assert.equal(
      await store.saveIfCurrent(
        { ...storedEarlier, accessToken: "tok-should-not-legacy", renew: "rsi1.fam.s4", renewExpiresAt: new Date(otherFamilyAt).toISOString() },
        { publicKeyId: first.publicKeyId, renew: "rsi1.fam.s4", renewExpiresAt: otherFamilyAt, family: "fam" },
      ),
      false,
      "a credential with no family id is not written over",
    );
    assert.equal((await store.load())?.renew, "legacy-credential");
    await store.save(updated);
    await store.saveIfCurrent({ ...other, accessToken: "tok-replaced" }, { publicKeyId: other.publicKeyId, renew: other.renew });
    assert.equal((await store.load())?.accessToken, "tok-updated", "a different publicKeyId does not replace the record");
    await store.saveIfCurrent(
      { ...first, accessToken: "tok-other-renew", renew: "rsi1.fam.s2" },
      { publicKeyId: first.publicKeyId, renew: "rsi1.fam.s2" },
    );
    assert.equal((await store.load())?.renew, "rsi1.fam.s1", "a different renew credential does not replace the record");
    await store.saveIfCurrent({ ...first, accessToken: "tok-empty-id" }, { publicKeyId: "", renew: first.renew });
    assert.equal((await store.load())?.accessToken, "tok-updated", "an empty id does not replace the record");
    const { publicKeyId: _gone, ...withoutId } = updated;
    await store.save({ ...withoutId, accessToken: "tok-no-id" } as StoredSession);
    await store.saveIfCurrent({ ...first, accessToken: "tok-should-stay-out" }, keyOnly);
    assert.equal((await store.load())?.accessToken, "tok-no-id", "a record with no publicKeyId is not updated");

    const tokenOnly = await seed({ accessToken: "tok-plain" });
    delete tokenOnly.renew;
    await store.save(tokenOnly);
    await store.saveIfCurrent(
      { ...tokenOnly, accessToken: "tok-plain-next" },
      { publicKeyId: tokenOnly.publicKeyId, renew: null, accessToken: "tok-plain" },
    );
    assert.equal((await store.load())?.accessToken, "tok-plain-next", "a record with no renew matches its access token");
    await store.saveIfCurrent(
      { ...tokenOnly, accessToken: "tok-should-stay-out" },
      { publicKeyId: tokenOnly.publicKeyId, renew: null, accessToken: "tok-plain" },
    );
    assert.equal((await store.load())?.accessToken, "tok-plain-next", "a different access token does not replace a record with no renew");
  } finally {
    installIndexedDb(prior);
  }
});

test("clearIfCurrent deletes only the record it names, in one transaction", async () => {
  const fake = fakeIndexedDb();
  const prior = installIndexedDb(fake.api);
  try {
    const store = indexedDbSessionStore("app-session");
    const first = await seed({ renew: "rsi1.fam.s1", accessToken: "tok-1" });
    await store.clearIfCurrent({ publicKeyId: first.publicKeyId, renew: "rsi1.fam.s1" });
    assert.equal(await store.load(), null);
    await store.save(first);
    const before = fake.transactions;
    assert.equal(await store.clearIfCurrent({ publicKeyId: first.publicKeyId, renew: "rsi1.fam.other" }), false);
    assert.equal(fake.transactions - before, 1, "the compare and the skipped delete share one transaction");
    assert.equal((await store.load())?.renew, "rsi1.fam.s1");
    await store.clearIfCurrent({ publicKeyId: "other-key", renew: "rsi1.fam.s1" });
    assert.equal((await store.load())?.accessToken, "tok-1");
    await store.clearIfCurrent({ publicKeyId: first.publicKeyId, renew: "rsi1.fam.s1" });
    assert.equal(await store.load(), null, "the matching credential is deleted");

    const tokenOnly = await seed({ accessToken: "tok-plain" });
    delete tokenOnly.renew;
    await store.save(tokenOnly);
    await store.clearIfCurrent({ publicKeyId: tokenOnly.publicKeyId, renew: null, accessToken: "tok-other" });
    assert.equal((await store.load())?.accessToken, "tok-plain");
    await store.clearIfCurrent({ publicKeyId: tokenOnly.publicKeyId, renew: null, accessToken: "tok-plain" });
    assert.equal(await store.load(), null);

    const olderAt = Date.parse(new Date(NOW).toISOString());
    const newerAt = olderAt + 1_000;
    const ordered = await seed({
      renew: "rsi1.fam.s1",
      renewExpiresAt: new Date(olderAt).toISOString(),
      accessToken: "tok-ordered",
    });
    await store.save(ordered);
    assert.equal(
      await store.clearIfCurrent({ publicKeyId: ordered.publicKeyId, renew: "rsi1.fam.s2", renewExpiresAt: newerAt }),
      true,
      "an earlier renewExpiresAt for the same key may be cleared",
    );
    assert.equal(await store.load(), null);
    await store.save({ ...ordered, renew: "rsi1.fam.s2", renewExpiresAt: new Date(newerAt).toISOString() });
    assert.equal(
      await store.clearIfCurrent({ publicKeyId: ordered.publicKeyId, renew: "rsi1.fam.s1", renewExpiresAt: olderAt }),
      false,
      "a later renewExpiresAt is not cleared",
    );
    assert.equal((await store.load())?.renew, "rsi1.fam.s2");
    assert.equal(
      await store.clearIfCurrent({ publicKeyId: ordered.publicKeyId, renew: "rsi1.fam.s3", renewExpiresAt: newerAt }),
      false,
      "an equal renewExpiresAt with a different credential is not cleared",
    );
    assert.equal((await store.load())?.renew, "rsi1.fam.s2");
    assert.equal(
      await store.clearIfCurrent({ publicKeyId: ordered.publicKeyId, renew: "rsi1.fam.s2", renewExpiresAt: newerAt }),
      true,
      "the same credential is cleared",
    );
    assert.equal(await store.load(), null);
    await store.save({ ...ordered, renew: "rsi1.f2.kept", renewExpiresAt: new Date(olderAt).toISOString() });
    assert.equal(
      await store.clearIfCurrent({ publicKeyId: ordered.publicKeyId, renew: "rsi1.f1.dead", renewExpiresAt: newerAt, family: "f1" }),
      false,
      "another family is not cleared, even when its time is earlier",
    );
    assert.equal((await store.load())?.renew, "rsi1.f2.kept");
    await store.save({ ...ordered, renew: "legacy-credential", renewExpiresAt: new Date(olderAt).toISOString() });
    assert.equal(
      await store.clearIfCurrent({ publicKeyId: ordered.publicKeyId, renew: "rsi1.fam.s9", renewExpiresAt: newerAt, family: "fam" }),
      false,
      "a credential with no family id is not cleared",
    );
    assert.equal((await store.load())?.renew, "legacy-credential");
    await store.clear();
  } finally {
    installIndexedDb(prior);
  }
});

test("familyOf reads the middle segment of rsi1.<familyId>.<secret>", () => {
  assert.equal(familyOf("rsi1.fam.s1"), "fam");
  assert.equal(familyOf("rsi1.f1.s2"), "f1");
  assert.equal(familyOf("rsi1.fam.s1.extra"), "fam");
  assert.equal(familyOf("rsi1.fam"), null);
  assert.equal(familyOf("rsi1.fam."), null);
  assert.equal(familyOf("rsi1..secret"), null);
  assert.equal(familyOf("nope.fam.s1"), null);
  assert.equal(familyOf(""), null);
  assert.equal(familyOf(null), null);
  assert.equal(familyOf(undefined), null);
});

test("recordIsCurrent orders one family by renewExpiresAt and leaves another family alone", () => {
  const rec = {
    publicKeyId: "k",
    renew: "rsi1.fam.s1",
    renewExpiresAt: new Date(1_000).toISOString(),
    accessToken: "t",
  };
  const fam = { family: "fam" };
  assert.equal(recordIsCurrent(rec, { publicKeyId: "k", renew: "rsi1.fam.s1", renewExpiresAt: 1_000, ...fam }), true);
  assert.equal(recordIsCurrent(rec, { publicKeyId: "k", renew: "rsi1.fam.s2", renewExpiresAt: 2_000, ...fam }), true);
  assert.equal(recordIsCurrent(rec, { publicKeyId: "k", renew: "rsi1.fam.s0", renewExpiresAt: 500, ...fam }), false);
  assert.equal(recordIsCurrent(rec, { publicKeyId: "k", renew: "rsi1.fam.s2", renewExpiresAt: 1_000, ...fam }), false);
  assert.equal(recordIsCurrent(rec, { publicKeyId: "other", renew: "rsi1.fam.s2", renewExpiresAt: 2_000, ...fam }), false);
  assert.equal(recordIsCurrent(rec, { publicKeyId: "", renew: "rsi1.fam.s2", renewExpiresAt: 2_000, ...fam }), false);
  assert.equal(recordIsCurrent(null, { publicKeyId: "k", renew: "rsi1.fam.s2", renewExpiresAt: 2_000, ...fam }), false);
  assert.equal(
    recordIsCurrent({ ...rec, renewExpiresAt: "not-a-date" }, { publicKeyId: "k", renew: "rsi1.fam.s2", renewExpiresAt: 2_000, ...fam }),
    false,
  );
  assert.equal(recordIsCurrent({ publicKeyId: "k", accessToken: "t" }, { publicKeyId: "k", renew: null, accessToken: "t" }), true);
  assert.equal(recordIsCurrent({ publicKeyId: "k", accessToken: "t" }, { publicKeyId: "k", renew: null, accessToken: "other" }), false);
  assert.equal(
    recordIsCurrent(rec, { publicKeyId: "k", renew: "rsi1.f2.s9", renewExpiresAt: 2_000, family: "f2" }),
    false,
    "a later time of another family is not current",
  );
  assert.equal(
    recordIsCurrent(rec, { publicKeyId: "k", renew: "rsi1.f2.s9", renewExpiresAt: 2_000 }),
    false,
    "a missing family field is read from the credential",
  );
  assert.equal(
    recordIsCurrent(rec, { publicKeyId: "k", renew: "rsi1.f2.s9", renewExpiresAt: 2_000, family: "fam" }),
    true,
    "the family on the expect is the one compared",
  );
  assert.equal(
    recordIsCurrent({ ...rec, renew: "legacy-credential" }, { publicKeyId: "k", renew: "rsi1.fam.s2", renewExpiresAt: 2_000, ...fam }),
    false,
    "a credential with no family id is not this family",
  );
  assert.equal(
    recordIsCurrent({ ...rec, renew: "legacy-credential" }, { publicKeyId: "k", renew: "legacy-credential", renewExpiresAt: 2_000, family: null }),
    true,
    "the same unparsable credential is still an exact match",
  );
});

test("the record version and the default database name are the ones the README names", () => {
  assert.equal(STORED_SESSION_VERSION, 1);
  assert.equal(SESSION_DB_NAME, "gilb-signin-session");
  assert.equal(SESSION_OBJECT_STORE, "session");
  assert.equal(SESSION_RECORD_KEY, "current");
});

function installIndexedDb(value: IDBFactory | undefined): IDBFactory | undefined {
  const g = globalThis as { indexedDB?: IDBFactory };
  const prior = g.indexedDB;
  if (value === undefined) delete g.indexedDB;
  else g.indexedDB = value;
  return prior;
}

interface FakeDb {
  api: IDBFactory;
  opens: string[];
  durabilities: Array<string | null>;
  /** How many `transaction()` calls the adapter has made. */
  transactions: number;
  storeNames(db: string): string[];
  keys(db: string, store: string): string[];
  record(db: string, store: string, key: string): unknown;
}

function fakeIndexedDb(opts: { block?: boolean } = {}): FakeDb {
  const databases = new Map<string, { version: number; stores: Map<string, Map<string, unknown>> }>();
  const opens: string[] = [];
  const durabilities: Array<string | null> = [];
  let transactions = 0;

  function request(): IDBOpenDBRequest {
    return {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
    } as unknown as IDBOpenDBRequest;
  }

  function dbHandle(name: string, rec: { version: number; stores: Map<string, Map<string, unknown>> }) {
    const db = {
      name,
      objectStoreNames: { contains: (storeName: string) => rec.stores.has(storeName) },
      onclose: null as (() => void) | null,
      onversionchange: null as (() => void) | null,
      close() { db.onclose?.(); },
      createObjectStore(storeName: string) {
        if (!rec.stores.has(storeName)) rec.stores.set(storeName, new Map());
        return {};
      },
      transaction(storeName: string, _mode: string, options?: { durability?: string }) {
        transactions++;
        durabilities.push(options?.durability ?? null);
        const records = rec.stores.get(storeName);
        if (!records) throw new Error("NotFoundError");
        const tx = {
          error: null as Error | null,
          oncomplete: null as (() => void) | null,
          onerror: null as (() => void) | null,
          onabort: null as (() => void) | null,
          objectStore() {
            return {
              get(key: string) {
                const req = request();
                queueMicrotask(() => {
                  try {
                    const value = records.get(key);
                    (req as { result?: unknown }).result = value === undefined ? undefined : structuredClone(value);
                    req.onsuccess?.({} as Event);
                  } catch (err) {
                    (req as { error: unknown }).error = err;
                    req.onerror?.({} as Event);
                    tx.onerror?.();
                  }
                });
                return req;
              },
              put(value: unknown, key: string) {
                const req = request();
                queueMicrotask(() => {
                  try {
                    records.set(key, structuredClone(value));
                    (req as { result?: unknown }).result = key;
                    req.onsuccess?.({} as Event);
                    queueMicrotask(() => tx.oncomplete?.());
                  } catch (err) {
                    tx.error = err as Error;
                    tx.onerror?.();
                  }
                });
                return req;
              },
              delete(key: string) {
                const req = request();
                queueMicrotask(() => {
                  records.delete(key);
                  req.onsuccess?.({} as Event);
                  queueMicrotask(() => tx.oncomplete?.());
                });
                return req;
              },
            };
          },
        };
        return tx;
      },
    };
    return db;
  }

  const api = {
    open(name: string, version = 1) {
      opens.push(name);
      const req = request();
      queueMicrotask(() => {
        if (opts.block) {
          req.onblocked?.({} as Event);
          return;
        }
        let rec = databases.get(name);
        const upgrade = !rec || version > rec.version;
        if (!rec) {
          rec = { version, stores: new Map() };
          databases.set(name, rec);
        }
        const db = dbHandle(name, rec);
        (req as { result?: unknown }).result = db;
        if (upgrade) {
          rec.version = version;
          req.onupgradeneeded?.({} as IDBVersionChangeEvent);
        }
        req.onsuccess?.({} as Event);
      });
      return req;
    },
    async databases() {
      return [...databases.keys()].map((name) => ({ name, version: databases.get(name)!.version }));
    },
    deleteDatabase(name: string) {
      const req = request();
      queueMicrotask(() => {
        databases.delete(name);
        req.onsuccess?.({} as Event);
      });
      return req;
    },
    cmp() { return 0; },
  };

  return {
    api: api as unknown as IDBFactory,
    opens,
    durabilities,
    get transactions() { return transactions; },
    storeNames(db: string) { return [...(databases.get(db)?.stores.keys() ?? [])]; },
    keys(db: string, store: string) { return [...(databases.get(db)?.stores.get(store)?.keys() ?? [])]; },
    record(db: string, store: string, key: string) { return databases.get(db)?.stores.get(store)?.get(key); },
  };
}
