// Races between sign-out, re-mint and in-flight work in ./session. Imports the shipped module.
// A sign-out is `invalidate(true)`; a re-mint after a 401 is `invalidate()`. The bridges here bind
// each token to the key they were sent, as the server does (cnf.jkt), so a token paired with the
// wrong key is visible.
import { test } from "vitest";
import assert from "node:assert/strict";
import { SessionCredential, NotSignedInError } from "./session";
import type { Transport } from "./transport";

function gatedTransport() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const send: Transport = async () => {
    await gate;
    return { status: 200, json: async () => ({ access_token: "tok-old", expires_in: 1800, principal: "p", vaults: [] }) };
  };
  return { send, release };
}

test("sign-out during an in-flight mint: invalidate(true) during an in-flight mint leaves the credential signed out", async () => {
  const t = gatedTransport();
  const cred = new SessionCredential({ dpopMintUrl: "https://id.example.test/mint", transport: t.send });
  const pending = cred.getSession();
  await new Promise((r) => setTimeout(r, 10)); // the mint is now on the wire
  cred.invalidate(true); // sign-out
  t.release();
  await pending.catch(() => undefined);
  assert.equal(cred.session, null, "a token minted before sign-out must not be held after it");
});

// A FAITHFUL stand-in bridge: it binds each token to the jwk in the request, as the server does
// (cnf.jkt). A bridge that answered one token whatever key it was sent could not tell a correct
// fresh mint (new key, new token) from the defect (old token, new key).
test("sign-out mid-mint: after invalidate(true) mid-mint, every proof's key is the key its token was minted for", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let first = true;
  const send: Transport = async (_url, req) => {
    const x = JSON.parse(req.body!).dpopJwk.x as string;
    if (first) { first = false; await gate; }
    return { status: 200, json: async () => ({ access_token: `tok-for-${x}`, expires_in: 1800, principal: "p", vaults: [] }) };
  };
  const cred = new SessionCredential({ dpopMintUrl: "https://id.example.test/mint", transport: send });
  await cred.ensurePublicJwk();
  const pending = cred.getSession();
  await new Promise((r) => setTimeout(r, 10));
  cred.invalidate(true);
  release();
  await pending.catch(() => undefined);
  const h = await cred.authHeaders("GET", "https://x.example.test/");
  const jwk = JSON.parse(Buffer.from(h.DPoP.split(".")[0], "base64url").toString()).jwk;
  assert.equal(h.Authorization, `DPoP tok-for-${jwk.x}`, "the token is bound to a different key than the proof");
});

test("sign-out during authHeaders: invalidate(true) during authHeaders never yields a token bound to another key", async () => {
  const send: Transport = async (_u, req) => {
    const x = JSON.parse(req.body!).dpopJwk.x as string;
    return { status: 200, json: async () => ({ access_token: `tok-for-${x}`, expires_in: 1800, principal: "p", vaults: [] }) };
  };
  const cred = new SessionCredential({ dpopMintUrl: "https://id.example.test/mint", transport: send });
  await cred.getSession(); // signed in, token held
  const p = cred.authHeaders("GET", "https://x.example.test/");
  cred.invalidate(true); // sign-out, after authHeaders started
  let h: { Authorization: string; DPoP: string } | null = null;
  try { h = await p; } catch (e) { assert.ok(e instanceof NotSignedInError, String(e)); return; }
  const x = JSON.parse(Buffer.from(h.DPoP.split(".")[0], "base64url").toString()).jwk.x;
  assert.equal(h.Authorization, `DPoP tok-for-${x}`, "token and proof key disagree");
});

function bindingBridge(gateFirst = false) {
  let release!: () => void; const gate = new Promise<void>((r) => (release = r)); let n = 0;
  const send: Transport = async (_u, req) => {
    const x = JSON.parse(req.body!).dpopJwk.x as string;
    if (gateFirst && n++ === 0) await gate;
    return { status: 200, json: async () => ({ access_token: `tok-for-${x}`, expires_in: 1800, principal: "p", vaults: [] }) };
  };
  return { send, release };
}

test("re-mint during authHeaders: invalidate() (re-mint, not sign-out) during authHeaders does not throw NotSignedInError", async () => {
  const b = bindingBridge();
  const cred = new SessionCredential({ dpopMintUrl: "https://id.example.test/mint", transport: b.send });
  await cred.getSession();
  const p = cred.authHeaders("GET", "https://x.example.test/");
  cred.invalidate(); // e.g. another request saw a 401
  const h = await p; // must not reject: the sign-in is live
  const x = JSON.parse(Buffer.from(h.DPoP.split(".")[0], "base64url").toString()).jwk.x;
  assert.equal(h.Authorization, `DPoP tok-for-${x}`);
});

test("re-mint during an in-flight mint: invalidate() (re-mint) during an in-flight mint does not reject waiting callers with NotSignedInError", async () => {
  const b = bindingBridge(true);
  const cred = new SessionCredential({ dpopMintUrl: "https://id.example.test/mint", transport: b.send });
  const pending = cred.getSession();
  await new Promise((r) => setTimeout(r, 10));
  cred.invalidate();
  b.release();
  const s = await pending; // must not reject
  assert.equal(s.principal, "p");
});
