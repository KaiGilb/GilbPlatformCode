// The slot says why it holds no sign-in. An empty slot means nothing.
// A signed-out marker is the person's sign-out. A family-ended marker is one family's death.
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  SessionCredential,
  NotSignedInError,
  isFamilyEndedMarker,
  isSignedOutMarker,
  isStoredSession,
  recordIsCurrent,
  type SessionSlot,
  type SessionStore,
} from "./session";
import type { Transport, TransportResponse } from "./transport";

const NOW = 1_700_000_000_000;
const ORIGIN = "https://id.example.test";
const LIVE = new Date(NOW + 14 * 24 * 3600 * 1000).toISOString();

const jwt = (exp: number) =>
  `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;

function json(status: number, body: unknown): TransportResponse {
  return { status, json: async () => body };
}

interface Mem extends SessionStore {
  peek(): SessionSlot | null;
}

function memoryStore(): Mem {
  let current: SessionSlot | null = null;
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

function renewOf(slot: SessionSlot | null): string {
  return slot && isStoredSession(slot) && typeof slot.renew === "string" ? slot.renew : "";
}

/** verify-code for `renew` / `principal`. The token's life is an hour from `clock()`. A renew is 401 unless `renewAnswer` is set. */
function transport(
  renew: string,
  principal: string,
  clock: () => number,
  renewAnswer?: { renew: string; token: string },
): Transport {
  const vaults = json(200, { vaults: [], complete: true });
  return async (url, req) => {
    if (url.endsWith("/email/verify-code")) {
      return json(200, {
        token: jwt(Math.floor(clock() / 1000) + 3600),
        principal,
        renew,
        renewExpiresAt: LIVE,
      });
    }
    if (url.endsWith("/lws/vaults")) return vaults;
    if (url.endsWith("/email/renew")) {
      const presented = (JSON.parse(req.body ?? "{}") as { renew?: unknown }).renew;
      if (presented !== renew) return json(401, { error: "Unauthorized" });
      if (!renewAnswer) return json(401, { error: "Unauthorized" });
      return json(200, {
        token: renewAnswer.token,
        renew: renewAnswer.renew,
        renewExpiresAt: new Date(NOW + 15 * 24 * 3600 * 1000).toISOString(),
        principal,
      });
    }
    if (url.endsWith("/sign-out")) return json(204, {});
    return json(500, {});
  };
}

test("a live tab writes its record over another family's family-ended marker and stays signed in", async () => {
  const store = memoryStore();
  let now = NOW;
  const aPresented: string[] = [];
  const aAnswer = { renew: "rsi1.fam.kept-2", token: jwt(Math.floor(NOW / 1000) + 10 * 3600) };
  const aSend: Transport = async (url, req) => {
    if (url.endsWith("/email/renew")) {
      aPresented.push((JSON.parse(req.body ?? "{}") as { renew?: string }).renew ?? "");
      return json(200, {
        token: aAnswer.token,
        renew: aAnswer.renew,
        renewExpiresAt: new Date(NOW + 15 * 24 * 3600 * 1000).toISOString(),
        principal: "https://id.example.test/i/a",
      });
    }
    return transport("rsi1.fam.live", "https://id.example.test/i/a", () => now)(url, req);
  };
  const bSend = transport("rsi1.f2.live", "https://id.example.test/i/b", () => now);
  const a = new SessionCredential({ store, transport: aSend, now: () => now });
  const b = new SessionCredential({ store, transport: bSend, now: () => now });
  await a.signInWithCode(ORIGIN, "a@example.test", "123456");
  await b.signInWithCode(ORIGIN, "b@example.test", "123456");
  assert.equal(renewOf(store.peek()), "rsi1.f2.live");
  now = NOW + 3_600_000 - 60_000;
  await assert.rejects(b.authHeaders("GET", `${ORIGIN}/x`), NotSignedInError);
  const ended = store.peek();
  assert.ok(isFamilyEndedMarker(ended));
  assert.equal(ended.family, "f2");
  assert.equal(a.session?.principal, "https://id.example.test/i/a");
  const headers = await a.authHeaders("GET", `${ORIGIN}/x`);
  assert.equal(headers.Authorization, `DPoP ${aAnswer.token}`);
  assert.equal(aPresented[0], "rsi1.fam.live");
  assert.equal(a.session?.principal, "https://id.example.test/i/a");
  const after = store.peek();
  assert.ok(isStoredSession(after));
  assert.equal(after.renew, aAnswer.renew);
  assert.equal(isSignedOutMarker(after), false);
  const fresh = new SessionCredential({ store, transport: aSend, now: () => now });
  assert.equal((await fresh.restore())?.principal, "https://id.example.test/i/a");
});

test("a dead tab's restore adopts the record another tab saved after this family ended", async () => {
  const store = memoryStore();
  const deadSend = transport("rsi1.f1.secret", "https://id.example.test/i/a", () => now);
  const liveSend = transport("rsi1.f2.secret", "https://id.example.test/i/b", () => now);
  let now = NOW;
  const dead = new SessionCredential({ store, transport: deadSend, now: () => now });
  await dead.signInWithCode(ORIGIN, "a@example.test", "123456");
  now = NOW + 3_600_000 - 60_000;
  await assert.rejects(dead.authHeaders("GET", `${ORIGIN}/x`), NotSignedInError);
  assert.ok(isFamilyEndedMarker(store.peek()));
  assert.equal(await dead.renew(), null);
  const live = new SessionCredential({ store, transport: liveSend, now: () => now });
  await live.signInWithCode(ORIGIN, "b@example.test", "123456");
  const kept = store.peek();
  assert.ok(isStoredSession(kept));
  assert.equal(kept.renew, "rsi1.f2.secret");
  assert.equal((await dead.restore())?.principal, "https://id.example.test/i/b");
  assert.equal(renewOf(store.peek()), "rsi1.f2.secret");
});

test("a new sign-in clears explicit sign-out, and a later death can adopt another tab's record", async () => {
  const store = memoryStore();
  let era: "first" | "second" | "third" = "first";
  const send: Transport = async (url, req) => {
    const renew = era === "first" ? "rsi1.f1.secret" : era === "second" ? "rsi1.f2.secret" : "rsi1.f3.secret";
    const principal = era === "third" ? "https://id.example.test/i/d" : "https://id.example.test/i/a";
    if (url.endsWith("/email/renew") && era === "second") return json(401, { error: "Unauthorized" });
    return transport(renew, principal, () => now)(url, req);
  };
  let now = NOW;
  const a = new SessionCredential({ store, transport: send, now: () => now });
  await a.signInWithCode(ORIGIN, "a@example.test", "123456");
  await a.signOut(ORIGIN);
  expectSignedOut(store.peek());
  era = "second";
  await a.signInWithCode(ORIGIN, "a@example.test", "123456");
  assert.equal(renewOf(store.peek()), "rsi1.f2.secret");
  now = NOW + 3_600_000 - 60_000;
  await assert.rejects(a.authHeaders("GET", `${ORIGIN}/x`), NotSignedInError);
  era = "third";
  const d = new SessionCredential({ store, transport: send, now: () => now });
  await d.signInWithCode(ORIGIN, "d@example.test", "123456");
  const before = store.peek();
  assert.ok(isStoredSession(before));
  assert.equal(before.renew, "rsi1.f3.secret");
  assert.equal((await a.restore())?.principal, "https://id.example.test/i/d");
  assert.equal(renewOf(store.peek()), "rsi1.f3.secret");
});

function expectSignedOut(slot: unknown): void {
  assert.ok(isSignedOutMarker(slot));
}
