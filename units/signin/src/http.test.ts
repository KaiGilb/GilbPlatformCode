import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkVaultName,
  prepareVaultName,
  requestSignInCode,
  verifySignInCodeHttp,
} from "./http";
import {
  CodeRejectedError,
  SignInRefusedError,
  SignInUnreachableError,
} from "./types";

const ORIGIN_A = "https://node-a.example.test";
const ORIGIN_B = "https://node-b.example.test";
const EMAIL = "person@example.test";
const RETURN_TO = "https://app-a.example.test/after";
const CODE = "123456";
const DPOP = { kty: "EC", crv: "P-256" };

type Call = { url: string; init: RequestInit };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function scriptedFetch(calls: Call[], responses: Array<Response | "throw">): typeof fetch {
  let i = 0;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const next = responses[i++];
    if (next === undefined) throw new Error(`unexpected fetch ${url}`);
    if (next === "throw") throw new TypeError("network");
    return next;
  };
}

async function withFetch<T>(
  responses: Array<Response | "throw">,
  run: () => Promise<T>,
): Promise<{ result: T; calls: Call[] }> {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = scriptedFetch(calls, responses);
  try {
    const result = await run();
    return { result, calls };
  } finally {
    globalThis.fetch = original;
  }
}

describe("requestSignInCode — email one-time-code request", () => {
  // Spec: 4Sol.S.Mech.UnitBodyHostAgnostic — origin is injected, never baked.
  it("POSTs /base/auth/email/request-code on the injected origin with email", async () => {
    const { calls } = await withFetch([jsonResponse(200, {})], () =>
      requestSignInCode(ORIGIN_A, EMAIL, RETURN_TO, "HostA"),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${ORIGIN_A}/base/auth/email/request-code`);
    expect(calls[0]!.init.method).toBe("POST");
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body).toEqual({ email: EMAIL, return_to: RETURN_TO });
    expect(body).not.toHaveProperty("a:email");
  });

  it("moves the POST URL when the injected origin swaps", async () => {
    const a = await withFetch([jsonResponse(200, {})], () =>
      requestSignInCode(ORIGIN_A, EMAIL),
    );
    const b = await withFetch([jsonResponse(200, {})], () =>
      requestSignInCode(ORIGIN_B, EMAIL),
    );
    expect(a.calls[0]!.url).toBe(`${ORIGIN_A}/base/auth/email/request-code`);
    expect(b.calls[0]!.url).toBe(`${ORIGIN_B}/base/auth/email/request-code`);
    expect(a.calls[0]!.url).not.toBe(b.calls[0]!.url);
    expect(a.calls[0]!.url).not.toContain(ORIGIN_B);
    expect(b.calls[0]!.url).not.toContain(ORIGIN_A);
  });

  it("omits return_to when the host does not pass one", async () => {
    const { calls } = await withFetch([jsonResponse(200, {})], () =>
      requestSignInCode(ORIGIN_A, EMAIL),
    );
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body).toEqual({ email: EMAIL });
    expect(body).not.toHaveProperty("return_to");
  });

  it("throws SignInUnreachableError when fetch cannot reach the origin", async () => {
    await expect(
      withFetch(["throw"], () => requestSignInCode(ORIGIN_A, EMAIL, undefined, "HostA")),
    ).rejects.toBeInstanceOf(SignInUnreachableError);
  });

  it("throws SignInRefusedError when the origin refuses", async () => {
    await expect(
      withFetch([jsonResponse(403, {})], () =>
        requestSignInCode(ORIGIN_A, EMAIL, undefined, "HostA"),
      ),
    ).rejects.toMatchObject({ name: "SignInRefusedError", status: 403 });
  });
});

describe("verifySignInCodeHttp — email one-time-code verify", () => {
  it("POSTs /base/auth/email/verify-code with email, code, dpopJwk on the injected origin", async () => {
    const { result, calls } = await withFetch(
      [jsonResponse(200, { token: "t", principal: "https://id.example.test/p", needsVaultName: false })],
      () => verifySignInCodeHttp(ORIGIN_A, EMAIL, CODE, DPOP, undefined, "HostA"),
    );
    expect(calls[0]!.url).toBe(`${ORIGIN_A}/base/auth/email/verify-code`);
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.credentials).toBe("include");
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.email).toBe(EMAIL);
    expect(body.code).toBe(CODE);
    expect(body.dpopJwk).toEqual(DPOP);
    expect(body).not.toHaveProperty("name");
    expect(body).not.toHaveProperty("a:email");
    expect(result.principal).toBe("https://id.example.test/p");
    expect(result.needsVaultName).toBe(false);
  });

  it("includes JSON name (vault slug) when the host supplies one — not a:name", async () => {
    const { calls } = await withFetch(
      [jsonResponse(200, { needsVaultName: false })],
      () => verifySignInCodeHttp(ORIGIN_A, EMAIL, CODE, DPOP, "acme", "HostA"),
    );
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.name).toBe("acme");
    expect(body).not.toHaveProperty("a:name");
  });

  it("throws CodeRejectedError on 401", async () => {
    await expect(
      withFetch([jsonResponse(401, {})], () =>
        verifySignInCodeHttp(ORIGIN_A, EMAIL, CODE, DPOP),
      ),
    ).rejects.toBeInstanceOf(CodeRejectedError);
  });
});

describe("prepareVaultName / checkVaultName — injected origin", () => {
  it("POSTs name-prep on the injected origin", async () => {
    const { result, calls } = await withFetch(
      [jsonResponse(200, { isReturning: false, suggestedName: "acme", webIdDomain: "example.test" })],
      () => prepareVaultName(ORIGIN_A, EMAIL),
    );
    expect(calls[0]!.url).toBe(`${ORIGIN_A}/onboard/api/name-prep`);
    expect(result.suggestedName).toBe("acme");
    expect(result.webIdDomain).toBe("example.test");
  });

  it("POSTs check-name on the injected origin", async () => {
    const { result, calls } = await withFetch(
      [jsonResponse(200, { available: true, reserved: false, name: "acme" })],
      () => checkVaultName(ORIGIN_A, "acme"),
    );
    expect(calls[0]!.url).toBe(`${ORIGIN_A}/onboard/api/check-name`);
    expect(result.available).toBe(true);
    expect(result.name).toBe("acme");
  });
});

describe("artefact independence and host-agnostic body", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it("unit source bakes no vault host", () => {
    for (const name of ["http.ts", "types.ts", "core.ts", "pendingSignInEmail.ts", "SignInCard.tsx", "VaultNameStep.tsx", "index.ts"]) {
      const src = readFileSync(join(here, name), "utf8");
      expect(src, name).not.toMatch(/gilb\.com/i);
      expect(src, name).not.toMatch(/localhost/i);
      expect(src, name).not.toMatch(/127\.0\.0\.1/);
      expect(src, name).not.toMatch(/veda\./i);
    }
  });

  it("does not import ingestState or write a:email as a vault fact", () => {
    for (const name of ["http.ts", "SignInCard.tsx", "pendingSignInEmail.ts", "core.ts"]) {
      const src = readFileSync(join(here, name), "utf8");
      expect(src, name).not.toMatch(/ingestState/);
      expect(src, name).not.toMatch(/a:email/);
      expect(src, name).not.toMatch(/t:Login/);
      expect(src, name).not.toMatch(/t:SignIn/);
    }
  });

  it("card binds host-injected app.origin and auth.requestCode", () => {
    const card = readFileSync(join(here, "SignInCard.tsx"), "utf8");
    expect(card).toMatch(/app\.returnTo\(\)/);
    expect(card).toMatch(/auth\.requestCode/);
    expect(card).toMatch(/auth\.verifyCode/);
  });
});
