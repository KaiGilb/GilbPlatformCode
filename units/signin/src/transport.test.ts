// Tests for the injectable transport. Imports the shipped modules (no copy of their logic).
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  requestSignInCode, verifySignInCodeHttp, checkVaultName, prepareVaultName,
  generateDpopKeyPair, CodeRejectedError, SignInUnreachableError, SignInRefusedError,
  type Transport, type TransportRequest,
} from "./core";

type Call = { url: string; req: TransportRequest };
function recorder(answer: (c: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const transport: Transport = async (url, req) => {
    const c = { url, req }; calls.push(c);
    const a = answer(c);
    return { status: a.status, json: async () => a.body };
  };
  return { calls, transport };
}

test("with NO global fetch, a whole sign-in completes through an injected transport", async () => {
  const saved = globalThis.fetch;
  // @ts-expect-error: removing fetch on purpose; the kit must not reach for it
  delete globalThis.fetch;
  try {
    assert.equal(typeof globalThis.fetch, "undefined");
    const { calls, transport } = recorder((c) =>
      c.url.endsWith("/request-code") ? { status: 200, body: { requested: true } }
        : { status: 200, body: { token: "t0k", principal: "https://vault-a.example.test/vault", needsVaultName: false } });
    const key = await generateDpopKeyPair();
    await requestSignInCode("https://id.example.test/", "  person@example.test ", undefined, "PLAN", { transport });
    const out = await verifySignInCodeHttp("https://id.example.test", "person@example.test", " 123456 ", key.publicJwk,
      undefined, "PLAN", { transport });
    assert.equal(out.token, "t0k");
    assert.deepEqual(calls.map((c) => c.url), [
      "https://id.example.test/base/auth/email/request-code",
      "https://id.example.test/base/auth/email/verify-code",
    ]);
    assert.deepEqual(JSON.parse(calls[0].req.body!), { email: "person@example.test" });
    assert.deepEqual(JSON.parse(calls[1].req.body!), { email: "person@example.test", code: "123456", dpopJwk: key.publicJwk });
    assert.equal(calls[1].req.method, "POST");
    assert.equal(calls[1].req.credentials, "include");
  } finally {
    globalThis.fetch = saved;
  }
});

test("the name helpers go through the injected transport too", async () => {
  const { calls, transport } = recorder(() => ({ status: 200, body: { available: true, name: "sam", isReturning: true } }));
  assert.equal((await checkVaultName("https://id.example.test", "sam", { transport })).available, true);
  assert.equal((await prepareVaultName("https://id.example.test", "person@example.test", { transport })).isReturning, true);
  assert.deepEqual(calls.map((c) => new URL(c.url).pathname), ["/onboard/api/check-name", "/onboard/api/name-prep"]);
});

test("errors keep their 0.1.0 meaning through a transport", async () => {
  const key = await generateDpopKeyPair();
  const t401 = recorder(() => ({ status: 401 })).transport;
  const t429 = recorder(() => ({ status: 429 })).transport;
  const down: Transport = async () => { throw new Error("no network"); };
  await assert.rejects(verifySignInCodeHttp("https://id.example.test", "person@example.test", "1", key.publicJwk, undefined, undefined, { transport: t401 }), CodeRejectedError);
  await assert.rejects(requestSignInCode("https://id.example.test", "person@example.test", undefined, undefined, { transport: t429 }),
    (e: unknown) => e instanceof SignInRefusedError && e.status === 429);
  await assert.rejects(requestSignInCode("https://id.example.test", "person@example.test", undefined, undefined, { transport: down }), SignInUnreachableError);
});

test("callers that pass no transport still use the global fetch (0.1.0 behaviour)", async () => {
  const saved = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (url: string) => { seen.push(url); return new Response(JSON.stringify({ requested: true }), { status: 200 }); }) as typeof fetch;
  try {
    await requestSignInCode("https://id.example.test", "person@example.test");
    assert.deepEqual(seen, ["https://id.example.test/base/auth/email/request-code"]);
  } finally {
    globalThis.fetch = saved;
  }
});
