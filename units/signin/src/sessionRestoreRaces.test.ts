// Hostile cases for "stays signed in": a store that never settles, restore racing a sign-in,
// a second tab writing a signed-out record back, and a key pair whose halves do not match.
import { test } from "vitest";
import assert from "node:assert/strict";
import { SessionCredential, STORE_TIMEOUT_MS, STORED_SESSION_VERSION, type SessionStore, type StoredSession } from "./session";
import { generateDpopKeyPair } from "./dpop";
import type { Transport } from "./transport";

const NOW = 1_700_000_000_000;
const ORIGIN = "https://id.example.test";

const jwt = (exp: number) =>
  `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Mem extends SessionStore {
  peek(): StoredSession | null;
  set(record: StoredSession | null): void;
  readonly clears: number;
}

function mem(delay = 0): Mem {
  let current: StoredSession | null = null;
  let clears = 0;
  return {
    peek: () => current,
    set: (record) => {
      current = record;
    },
    get clears() {
      return clears;
    },
    async load() {
      await sleep(delay);
      return current ? structuredClone(current) : null;
    },
    async save(record) {
      await sleep(delay);
      current = structuredClone(record);
    },
    async saveIfSameKey(record, samePublicKeyId) {
      const seen = current;
      if (typeof seen?.publicKeyId !== "string" || seen.publicKeyId.length === 0 || seen.publicKeyId !== samePublicKeyId) return;
      // A clear or a replace during the wait wins: this update does not put the record back.
      await sleep(delay);
      if (current !== seen) return;
      current = structuredClone(record);
    },
    async clear() {
      clears++;
      await sleep(delay);
      current = null;
    },
  };
}

async function seed(principal: string, token: string, extra: Partial<StoredSession> = {}): Promise<StoredSession> {
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
    accessToken: token,
    expiresAt: NOW + 3_600_000,
    session: { principal, vault: null, vaults: [] },
    ...extra,
  };
}

function transportFor(principal: string, delayMs = 0): Transport {
  const token = jwt(Math.floor(NOW / 1000) + 3600);
  return async (url) => {
    await sleep(delayMs);
    if (url.endsWith("/lws/vaults")) return { status: 200, json: async () => ({ vaults: [], complete: true }) };
    return { status: 200, json: async () => ({ token, principal }) };
  };
}

test("STORE_TIMEOUT_MS is 400", () => {
  assert.equal(STORE_TIMEOUT_MS, 400);
});

test("a hanging load makes restore return null and does not clear the record", async () => {
  const stored = await seed("https://id.example.test/i/A", "tok-A");
  const hang = new Promise<never>(() => {});
  let clears = 0;
  const store: Mem = {
    peek: () => stored,
    set: () => {},
    get clears() {
      return clears;
    },
    load: () => hang,
    async save() {},
    async saveIfSameKey() {},
    clear: () => {
      clears++;
      return hang;
    },
  };
  const cred = new SessionCredential({ store, now: () => NOW });
  const out = await Promise.race([
    cred.restore().then((session) => ({ kind: "done" as const, session })),
    sleep(STORE_TIMEOUT_MS + 250).then(() => ({ kind: "hung" as const, session: undefined })),
  ]);
  assert.equal(out.kind, "done");
  if (out.kind === "done") assert.equal(out.session, null);
  assert.equal(clears, 0, "a timed-out load must not clear the record");
  assert.equal(store.peek()?.accessToken, "tok-A");
});

test("signInWithCode settles while a save never resolves", async () => {
  const hang = new Promise<never>(() => {});
  let saveCalled = false;
  const store: SessionStore = {
    async load() {
      return null;
    },
    save: () => {
      saveCalled = true;
      return hang;
    },
    saveIfSameKey: () => {
      saveCalled = true;
      return hang;
    },
    async clear() {},
  };
  const cred = new SessionCredential({ store, transport: transportFor("https://id.example.test/i/A"), now: () => NOW });
  const out = await Promise.race([
    cred.signInWithCode(ORIGIN, "a@x.test", "123456").then(() => "signin-done" as const),
    sleep(STORE_TIMEOUT_MS - 50).then(() => "signin-hung" as const),
  ]);
  assert.equal(out, "signin-done");
  assert.equal(saveCalled, true, "the save is started");
  assert.equal(cred.session?.principal, "https://id.example.test/i/A");
  const headers = await cred.authHeaders("GET", "https://v.example.test/x");
  assert.equal(headers.Authorization.startsWith("DPoP "), true);
});

test("invalidate(true) settles while a clear never resolves", async () => {
  const hang = new Promise<never>(() => {});
  let clears = 0;
  const store: SessionStore = {
    async load() {
      return null;
    },
    async save() {},
    async saveIfSameKey() {},
    clear: () => {
      clears++;
      return hang;
    },
  };
  const cred = new SessionCredential({ store, transport: transportFor("https://id.example.test/i/A"), now: () => NOW });
  await cred.signInWithCode(ORIGIN, "a@x.test", "123456");
  const out = await Promise.race([
    cred.invalidate(true).then(() => "out-done" as const),
    sleep(STORE_TIMEOUT_MS + 250).then(() => "out-hung" as const),
  ]);
  assert.equal(out, "out-done");
  assert.ok(clears > 0, "the clear is started before the wait gives up");
  assert.equal(cred.session, null);
});

test("restore during signInWithCode does not replace the key the code was bound to", async () => {
  const store = mem(0);
  store.set(await seed("https://id.example.test/i/A", "tok-A"));
  let sentJwk: { x: string; y: string } | null = null;
  const token = jwt(Math.floor(NOW / 1000) + 3600);
  const transport: Transport = async (url, req) => {
    await sleep(30);
    if (url.endsWith("/lws/vaults")) return { status: 200, json: async () => ({ vaults: [], complete: true }) };
    sentJwk = JSON.parse(String(req?.body)).dpopJwk;
    return { status: 200, json: async () => ({ token, principal: "https://id.example.test/i/B" }) };
  };
  const cred = new SessionCredential({ store, transport, now: () => NOW });
  const signIn = cred.signInWithCode(ORIGIN, "b@x.test", "123456");
  await sleep(5);
  const restored = await cred.restore();
  await signIn;
  assert.equal(restored, null, "verify-code is still on the wire, so restore adopts nothing");
  assert.equal(cred.session?.principal, "https://id.example.test/i/B");
  const held = await cred.ensurePublicJwk();
  assert.equal(held.x, sentJwk?.x);
  assert.equal(held.y, sentJwk?.y);
  const headers = await cred.authHeaders("GET", "https://v.example.test/x");
  const proofJwk = JSON.parse(Buffer.from(headers.DPoP.split(".")[0]!, "base64url").toString());
  assert.equal(proofJwk.jwk.x, sentJwk?.x);
  assert.equal(proofJwk.jwk.y, sentJwk?.y);
});

test("restore after a live sign-in does not replace the held session", async () => {
  const store = mem(0);
  const cred = new SessionCredential({ store, transport: transportFor("https://id.example.test/i/B"), now: () => NOW });
  await cred.signInWithCode(ORIGIN, "b@x.test", "123456");
  const before = await cred.ensurePublicJwk();
  store.set(await seed("https://id.example.test/i/OTHER", "tok-other"));
  const restored = await cred.restore();
  assert.equal(cred.session?.principal, "https://id.example.test/i/B");
  assert.equal(restored?.principal, "https://id.example.test/i/B");
  assert.deepEqual(await cred.ensurePublicJwk(), before);
  assert.equal(store.peek()?.accessToken, "tok-other", "restore writes nothing and clears nothing");
});

test("a second tab's vault refresh does not resurrect a record the first tab signed out", async () => {
  const store = mem(0);
  const transport = transportFor("https://id.example.test/i/A");
  const a = new SessionCredential({ store, transport, now: () => NOW });
  await a.signInWithCode(ORIGIN, "a@x.test", "123456");
  const b = new SessionCredential({ store, transport, now: () => NOW });
  assert.ok(await b.restore());
  await a.invalidate(true);
  assert.equal(store.peek(), null, "after A signs out the store is empty");
  await b.loadReachableVaults(ORIGIN);
  assert.equal(store.peek(), null, "B's later save must not put the signed-out record back");
});

test("restore of a mismatched key pair returns null and clears the record", async () => {
  const a = await seed("https://id.example.test/i/A", "tok-A");
  const b = await seed("https://id.example.test/i/A", "tok-A");
  const store = mem();
  store.set({
    ...a,
    publicKeyId: b.publicKeyId,
    keyPair: { publicKey: b.keyPair.publicKey, privateKey: a.keyPair.privateKey },
  });
  const cred = new SessionCredential({ store, now: () => NOW });
  assert.equal(await cred.restore(), null);
  assert.equal(cred.session, null);
  assert.equal(store.peek(), null);
  assert.ok(store.clears > 0);
});
