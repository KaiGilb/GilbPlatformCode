// A failed rotation save heals, and a superseded renew does not end a live sign-in.
// Fake transport and in-memory store. No network.
import { test, vi } from "vitest";
import assert from "node:assert/strict";
import {
  NotSignedInError,
  SessionCredential,
  recordIsCurrent,
  type SessionStore,
  type StoredSession,
} from "./session";
import type { Transport, TransportResponse } from "./transport";

const T0 = 1_700_000_000_000;
const ORIGIN = "https://id.example.test";
const PRINCIPAL = "https://id.example.test/i/p9";
const VERIFY_URL = `${ORIGIN}/base/auth/email/verify-code`;
const RENEW_URL = `${ORIGIN}/base/auth/email/renew`;
const VAULTS_URL = `${ORIGIN}/lws/vaults`;
const GRACE_MS = 60_000;

const jwt = (exp: number) =>
  `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;

const json = (status: number, body: unknown): TransportResponse => ({ status, json: async () => body });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Family {
  cur = "";
  prev: string | null = null;
  lastUsed = 0;
  n = 0;
  ended = false;
  reuse = 0;
  presentations: string[] = [];

  constructor(private readonly now: () => number, private readonly ttlSec = 120) {}

  private issue(): { token: string; renew: string; renewExpiresAt: string } {
    this.n += 1;
    this.cur = `rsi1.fam.s${this.n}`;
    const exp = Math.floor(this.now() / 1000) + this.ttlSec;
    return {
      token: jwt(exp),
      renew: this.cur,
      renewExpiresAt: new Date(this.now() + 14 * 24 * 3600 * 1000).toISOString(),
    };
  }

  accept(presented: string): { status: number; body?: unknown } {
    const arrival = this.now();
    this.presentations.push(presented);
    if (this.ended) return { status: 401 };
    const current = presented === this.cur;
    const previous = this.prev !== null && presented === this.prev;
    const within = arrival - this.lastUsed <= GRACE_MS;
    if (!current && !(previous && within)) {
      this.reuse += 1;
      this.ended = true;
      return { status: 401 };
    }
    this.prev = this.cur;
    const issued = this.issue();
    this.lastUsed = arrival;
    return { status: 200, body: { ...issued, principal: PRINCIPAL } };
  }

  readonly transport: Transport = async (url, req) => {
    if (url === VERIFY_URL) {
      const issued = this.issue();
      this.prev = null;
      this.lastUsed = this.now();
      this.ended = false;
      const asked = Boolean((JSON.parse(req.body ?? "{}") as { renew?: unknown }).renew);
      return json(200, {
        token: issued.token,
        principal: PRINCIPAL,
        ...(asked ? { renew: issued.renew, renewExpiresAt: issued.renewExpiresAt } : {}),
      });
    }
    if (url === VAULTS_URL) return json(200, { vaults: [], complete: true });
    if (url === RENEW_URL) {
      const presented = (JSON.parse(req.body ?? "{}") as { renew?: unknown }).renew;
      if (typeof presented !== "string") return json(400, {});
      const answer = this.accept(presented);
      if (answer.status !== 200) return json(401, { error: "Unauthorized" });
      return json(200, answer.body);
    }
    if (url.endsWith("/sign-out")) return json(204, {});
    return json(500, {});
  };
}

interface Mem extends SessionStore {
  peek(): StoredSession | null;
}

function boolStore(fail?: (session: StoredSession) => boolean): Mem {
  let current: StoredSession | null = null;
  return {
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
      if (fail?.(session)) throw new Error("quota");
      const seen = current;
      if (!recordIsCurrent(seen, expect)) return false;
      await Promise.resolve();
      if (current !== seen) return false;
      current = structuredClone(session);
      return true;
    },
    async clearIfCurrent(expect) {
      const seen = current;
      if (!recordIsCurrent(seen, expect)) return false;
      await Promise.resolve();
      if (current !== seen) return false;
      current = null;
      return true;
    },
    async clear() {
      await Promise.resolve();
      current = null;
    },
  };
}

async function signIn(store: SessionStore, family: Family, now: () => number): Promise<SessionCredential> {
  const cred = new SessionCredential({ store, transport: family.transport, now });
  await cred.signInWithCode(ORIGIN, "a@example.test", "123456");
  return cred;
}

test("one failed rotation save heals the store and later renews do not reuse", async () => {
  let now = T0;
  let left = 1;
  const family = new Family(() => now);
  const store = boolStore((session) =>
    session.renew === "rsi1.fam.s2" && session.accessToken !== "" && left > 0 && (left -= 1, true),
  );
  const cred = await signIn(store, family, () => now);
  assert.equal(store.peek()?.renew, "rsi1.fam.s1");
  now += 100_000;
  const headers = await cred.authHeaders("GET", `${ORIGIN}/x`);
  assert.ok(headers.Authorization.startsWith("DPoP "));
  assert.equal(store.peek()?.renew, "rsi1.fam.s2", "the in-lock retry wrote the current credential");
  assert.equal(left, 0);
  assert.equal(family.reuse, 0);
  assert.equal(family.ended, false);
  for (let i = 0; i < 3; i++) {
    now += 100_000;
    await cred.authHeaders("GET", `${ORIGIN}/x`);
  }
  assert.equal(family.reuse, 0);
  assert.equal(family.ended, false);
  assert.ok(cred.session);
  await cred.invalidate(true);
});

test("a reload after the healed rotation save stays signed in", async () => {
  let now = T0;
  let left = 1;
  const family = new Family(() => now);
  const store = boolStore((session) =>
    session.renew === "rsi1.fam.s2" && session.accessToken !== "" && left > 0 && (left -= 1, true),
  );
  const cred = await signIn(store, family, () => now);
  now += 100_000;
  assert.ok((await cred.authHeaders("GET", `${ORIGIN}/x`)).Authorization);
  assert.equal(store.peek()?.renew, "rsi1.fam.s2");
  now += 100_000;
  const fresh = new SessionCredential({ store, transport: family.transport, now: () => now });
  const session = await fresh.restore();
  assert.equal(session?.principal, PRINCIPAL);
  assert.equal(family.reuse, 0);
  assert.equal(family.ended, false);
  await fresh.invalidate(true);
  await cred.invalidate(true);
});

test("a rotation save that keeps failing is retried in the background", async () => {
  let now = T0;
  let left = 3;
  const family = new Family(() => now);
  const store = boolStore((session) =>
    session.renew === "rsi1.fam.s2" && session.accessToken !== "" && left > 0 && (left -= 1, true),
  );
  const cred = await signIn(store, family, () => now);
  try {
    now += 100_000;
    assert.ok((await cred.authHeaders("GET", `${ORIGIN}/x`)).Authorization);
    assert.equal(store.peek()?.renew, "rsi1.fam.s1", "the rotation save, its retry, and the drain all threw");
    assert.equal(left, 0);
    await sleep(80);
    assert.equal(store.peek()?.renew, "rsi1.fam.s1");
    await sleep(700);
    assert.equal(store.peek()?.renew, "rsi1.fam.s2", "the 0.5 s retry wrote the current credential");
    assert.equal(family.reuse, 0);
    now += 100_000;
    const fresh = new SessionCredential({ store, transport: family.transport, now: () => now });
    assert.equal((await fresh.restore())?.principal, PRINCIPAL);
    assert.equal(family.reuse, 0);
    assert.equal(family.ended, false);
    await fresh.invalidate(true);
  } finally {
    await cred.invalidate(true);
  }
});

test("a failed rotation save does not overwrite another tab's newer credential", async () => {
  let now = T0;
  const family = new Family(() => now);
  let current: StoredSession | null = null;
  let s2Saves = 0;
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
      if (session.renew === "rsi1.fam.s2" && session.accessToken !== "") {
        s2Saves += 1;
        if (s2Saves === 1) throw new Error("quota");
        if (s2Saves === 2) {
          const foreign = structuredClone(current);
          if (foreign) {
            foreign.renew = "rsi1.fam.s9";
            foreign.accessToken = "tok-other-tab";
            foreign.expiresAt = now + 3_600_000;
            current = foreign;
          }
          return false;
        }
      }
      const seen = current;
      if (!recordIsCurrent(seen, expect)) return false;
      await Promise.resolve();
      if (current !== seen) return false;
      current = structuredClone(session);
      return true;
    },
    async clearIfCurrent(expect) {
      const seen = current;
      if (!recordIsCurrent(seen, expect)) return false;
      await Promise.resolve();
      if (current !== seen) return false;
      current = null;
      return true;
    },
    async clear() {
      await Promise.resolve();
      current = null;
    },
  };
  const cred = await signIn(store, family, () => now);
  try {
    now += 100_000;
    const headers = await cred.authHeaders("GET", `${ORIGIN}/x`);
    assert.ok(headers.Authorization.startsWith("DPoP "));
    assert.equal(store.peek()?.renew, "rsi1.fam.s9");
    assert.equal(store.peek()?.accessToken, "tok-other-tab");
    await sleep(700);
    assert.equal(store.peek()?.renew, "rsi1.fam.s9", "the background retry does not replace the other tab");
    assert.equal(store.peek()?.accessToken, "tok-other-tab");
    assert.equal(family.reuse, 0);
    assert.equal(family.ended, false);
    assert.ok(cred.session);
  } finally {
    await cred.invalidate(true);
  }
});

test("a plain invalidate during a renew does not throw NotSignedInError while the sign-in is live", async () => {
  let now = T0;
  const family = new Family(() => now);
  let current: StoredSession | null = null;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let entered!: () => void;
  const inside = new Promise<void>((resolve) => { entered = resolve; });
  let held = false;
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
      if (!held && session.renew === "rsi1.fam.s2" && session.accessToken !== "") {
        held = true;
        entered();
        await hold;
      }
      const seen = current;
      if (!recordIsCurrent(seen, expect)) return false;
      await Promise.resolve();
      if (current !== seen) return false;
      current = structuredClone(session);
      return true;
    },
    async clearIfCurrent(expect) {
      const seen = current;
      if (!recordIsCurrent(seen, expect)) return false;
      await Promise.resolve();
      if (current !== seen) return false;
      current = null;
      return true;
    },
    async clear() {
      await Promise.resolve();
      current = null;
    },
  };
  const cred = await signIn(store, family, () => now);
  now += 100_000;
  const pending = cred.authHeaders("GET", `${ORIGIN}/x`);
  const gate = await Promise.race([
    inside.then(() => "held" as const),
    sleep(2000).then(() => "timeout" as const),
  ]);
  assert.equal(gate, "held");
  await cred.invalidate();
  release();
  let thrown: unknown = null;
  let headers: { Authorization: string; DPoP: string } | null = null;
  try {
    headers = await pending;
  } catch (err) {
    thrown = err;
  }
  assert.equal(thrown, null, thrown instanceof Error ? thrown.name : "thrown");
  assert.ok(headers?.Authorization.startsWith("DPoP "));
  const session = await cred.getSession();
  assert.equal(session.principal, PRINCIPAL);
  assert.equal(family.reuse, 0);
  assert.equal(family.ended, false);
  assert.equal(thrown instanceof NotSignedInError, false);
  await cred.invalidate(true);
});

test("a renew before the rotation heal lands does not present this tab's own spent credential", async () => {
  // The rotated save throws until the test allows it, and the heal timers never run,
  // so the next renew still reads s1: the credential this tab already spent.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  let now = T0;
  let blockRotated = true;
  const family = new Family(() => now);
  const store = boolStore((session) =>
    blockRotated && typeof session.renew === "string" && session.renew !== "rsi1.fam.s1",
  );
  let cred: SessionCredential | null = null;
  try {
    cred = await signIn(store, family, () => now);
    assert.equal(store.peek()?.renew, "rsi1.fam.s1");
    now += 100_000;
    assert.ok((await cred.authHeaders("GET", `${ORIGIN}/x`)).Authorization);
    assert.equal(store.peek()?.renew, "rsi1.fam.s1", "the rotation save has not landed");
    assert.deepEqual(family.presentations, ["rsi1.fam.s1"]);
    blockRotated = false;
    now += 100_000;
    assert.equal(store.peek()?.renew, "rsi1.fam.s1", "the background heal has not landed");
    const headers = await cred.authHeaders("GET", `${ORIGIN}/x`);
    assert.ok(headers.Authorization.startsWith("DPoP "));
    assert.deepEqual(family.presentations, ["rsi1.fam.s1", "rsi1.fam.s2"]);
    assert.equal(family.reuse, 0);
    assert.equal(family.ended, false);
    assert.equal(family.cur, "rsi1.fam.s3");
    assert.equal(store.peek()?.renew, family.cur, "the store holds the newer credential");
    const fresh = new SessionCredential({ store, transport: family.transport, now: () => now });
    assert.equal((await fresh.restore())?.principal, PRINCIPAL);
    assert.equal(family.reuse, 0);
    assert.equal(family.ended, false);
    assert.deepEqual(family.presentations, ["rsi1.fam.s1", "rsi1.fam.s2"]);
    await fresh.invalidate(true);
  } finally {
    await cred?.invalidate(true);
    vi.useRealTimers();
  }
});
