// Request fields that flow through an injected transport: return_to, the vault name, the timeouts,
// and every name-prep field. Each test was written against a mutant that survived the other tests.
// Imports the shipped modules; no copy of their logic.
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  requestSignInCode, verifySignInCodeHttp, prepareVaultName, checkVaultName, generateDpopKeyPair,
  type Transport, type TransportRequest,
} from "./core";

function recorder(body: unknown = {}) {
  const calls: { url: string; req: TransportRequest }[] = [];
  const transport: Transport = async (url, req) => {
    calls.push({ url, req });
    return { status: 200, json: async () => body };
  };
  return { calls, transport };
}

test("requestSignInCode sends a trimmed return_to through the transport, and omits a blank one", async () => {
  const a = recorder({ requested: true });
  await requestSignInCode("https://id.example.test", "person@example.test", "  http://app.example.test:4200/after  ", undefined, { transport: a.transport });
  assert.deepEqual(JSON.parse(a.calls[0].req.body!), { email: "person@example.test", return_to: "http://app.example.test:4200/after" });
  const b = recorder({ requested: true });
  await requestSignInCode("https://id.example.test", "person@example.test", "   ", undefined, { transport: b.transport });
  assert.deepEqual(JSON.parse(b.calls[0].req.body!), { email: "person@example.test" });
});

test("verifySignInCodeHttp sends a trimmed vault name when given, and none when blank", async () => {
  const key = await generateDpopKeyPair();
  const a = recorder({ token: "t" });
  await verifySignInCodeHttp("https://id.example.test", "person@example.test", "123456", key.publicJwk, "  myvault ", undefined, { transport: a.transport });
  assert.equal(JSON.parse(a.calls[0].req.body!).name, "myvault");
  const b = recorder({ token: "t" });
  await verifySignInCodeHttp("https://id.example.test", "person@example.test", "123456", key.publicJwk, "  ", undefined, { transport: b.transport });
  assert.equal("name" in JSON.parse(b.calls[0].req.body!), false);
});

test("every helper hands the transport the original timeouts (15 s sign-in calls, 8 s name calls)", async () => {
  const key = await generateDpopKeyPair();
  const r = recorder({ token: "t", available: true });
  await requestSignInCode("https://id.example.test", "person@example.test", undefined, undefined, { transport: r.transport });
  await verifySignInCodeHttp("https://id.example.test", "person@example.test", "1", key.publicJwk, undefined, undefined, { transport: r.transport });
  await prepareVaultName("https://id.example.test", "person@example.test", { transport: r.transport });
  await checkVaultName("https://id.example.test", "sam", { transport: r.transport });
  assert.deepEqual(r.calls.map((c) => [new URL(c.url).pathname, c.req.timeoutMs]), [
    ["/base/auth/email/request-code", 15000],
    ["/base/auth/email/verify-code", 15000],
    ["/onboard/api/name-prep", 8000],
    ["/onboard/api/check-name", 8000],
  ]);
});

test("prepareVaultName returns every field the server sent, through the transport", async () => {
  const r = recorder({ isReturning: false, suggestedName: "sam", webIdDomain: "example.test", address: "https://vault-a.example.test" });
  assert.deepEqual(await prepareVaultName("https://id.example.test", "person@example.test", { transport: r.transport }), {
    isReturning: false, suggestedName: "sam", webIdDomain: "example.test", address: "https://vault-a.example.test",
  });
});
