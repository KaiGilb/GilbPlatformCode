import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkVaultName,
  credentialsForPage,
  credentialsForPageOrigin,
  pageOrigin,
  prepareVaultName,
  requestSignInCode,
  verifySignInCodeHttp,
} from "./http";
import type { Transport, TransportRequest } from "./transport";
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

function recordingTransport() {
  const calls: { url: string; req: TransportRequest }[] = [];
  const transport: Transport = async (url, req) => {
    calls.push({ url, req });
    return { status: 200, json: async () => ({ token: "t", principal: "https://id.example.test/p" }) };
  };
  return { calls, transport };
}

const readPageOrigin = pageOrigin.read;
afterEach(() => {
  pageOrigin.read = readPageOrigin;
});

describe("verifySignInCodeHttp — email one-time-code verify", () => {
  it("POSTs /base/auth/email/verify-code with email, code, dpopJwk on the injected origin", async () => {
    const { result, calls } = await withFetch(
      [jsonResponse(200, { token: "t", principal: "https://id.example.test/p", needsVaultName: false })],
      () => verifySignInCodeHttp(ORIGIN_A, EMAIL, CODE, DPOP, undefined, "HostA"),
    );
    expect(calls[0]!.url).toBe(`${ORIGIN_A}/base/auth/email/verify-code`);
    expect(calls[0]!.init.method).toBe("POST");
    // No page location in this runtime, so the third-party rule omits cookies.
    expect(calls[0]!.init.credentials).toBe("omit");
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

  it.each([
    ["http://localhost:5317", "omit"],
    ["http://127.0.0.1:5317", "omit"],
    ["http://[::1]:5317", "omit"],
    ["http://localhost", "omit"],
    ["http://localhost:5197", "include"],
    ["http://localhost:5251", "include"],
    ["http://127.0.0.1:5197", "include"],
    ["http://[::1]:5251", "include"],
    ["https://localhost:5197", "omit"],
    ["http://localhost:51970", "omit"],
    ["https://gilb.com", "include"],
    ["https://www.gilb.com", "include"],
    ["https://gilb.com:8443", "include"],
    ["https://app.example.com", "omit"],
    ["https://kaidev-pictures.pages.dev", "omit"],
    ["https://x.app.gilb.com", "omit"],
    ["https://id.gilb.com", "omit"],
    ["https://evilgilb.com", "omit"],
    ["https://gilb.com.evil.com", "omit"],
    ["null", "omit"],
    ["", "omit"],
  ] as const)("credentialsForPageOrigin %s → %s", (origin, want) => {
    expect(credentialsForPageOrigin(origin)).toBe(want);
  });

  it.each([
    ["gilb.com", "include"],
    ["www.gilb.com", "include"],
    ["localhost", "omit"],
    ["127.0.0.1", "omit"],
    ["[::1]", "omit"],
    ["kaidev-pictures.pages.dev", "omit"],
    ["x.app.gilb.com", "omit"],
    ["id.gilb.com", "omit"],
    ["evilgilb.com", "omit"],
    ["gilb.com.evil.com", "omit"],
  ] as const)("deprecated credentialsForPage %s → %s", (hostname, want) => {
    expect(credentialsForPage(hostname)).toBe(want);
  });

  it("no location → omit", () => {
    expect(pageOrigin.read()).toBe("");
    expect(credentialsForPageOrigin(pageOrigin.read())).toBe("omit");
  });

  it("verify-code from a local app on port 5317 sends omit", async () => {
    pageOrigin.read = () => "http://localhost:5317";
    const fetched = await withFetch(
      [jsonResponse(200, { token: "t" })],
      () => verifySignInCodeHttp(ORIGIN_A, EMAIL, CODE, DPOP),
    );
    expect(fetched.calls[0]!.init.credentials).toBe("omit");
  });

  it("verify-code from Gilb's own rigs sends include", async () => {
    for (const origin of ["http://localhost:5197", "http://localhost:5251"]) {
      pageOrigin.read = () => origin;
      const seen = recordingTransport();
      await verifySignInCodeHttp(ORIGIN_A, EMAIL, CODE, DPOP, undefined, "HostA", { transport: seen.transport });
      expect(seen.calls[0]!.req.credentials).toBe("include");
    }
  });

  it("verify-code sends omit for a third-party page", async () => {
    pageOrigin.read = () => "https://kaidev-pictures.pages.dev";
    const seen = recordingTransport();
    await verifySignInCodeHttp(ORIGIN_A, EMAIL, CODE, DPOP, undefined, "HostA", { transport: seen.transport });
    expect(seen.calls[0]!.req.credentials).toBe("omit");
  });

  it("verify-code sends include for gilb.com", async () => {
    pageOrigin.read = () => "https://gilb.com";
    const seen = recordingTransport();
    await verifySignInCodeHttp(ORIGIN_A, EMAIL, CODE, DPOP, undefined, "HostA", { transport: seen.transport });
    expect(seen.calls[0]!.req.credentials).toBe("include");
    const fetched = await withFetch(
      [jsonResponse(200, { token: "t" })],
      () => verifySignInCodeHttp(ORIGIN_A, EMAIL, CODE, DPOP),
    );
    expect(fetched.calls[0]!.init.credentials).toBe("include");
  });

  it("an explicit credentials option wins over the page rule", async () => {
    pageOrigin.read = () => "https://kaidev-pictures.pages.dev";
    const forcedInclude = recordingTransport();
    await verifySignInCodeHttp(ORIGIN_A, EMAIL, CODE, DPOP, undefined, "HostA", {
      transport: forcedInclude.transport,
      credentials: "include",
    });
    expect(forcedInclude.calls[0]!.req.credentials).toBe("include");

    pageOrigin.read = () => "https://gilb.com";
    const forcedOmit = recordingTransport();
    await verifySignInCodeHttp(ORIGIN_A, EMAIL, CODE, DPOP, undefined, "HostA", {
      transport: forcedOmit.transport,
      credentials: "omit",
    });
    expect(forcedOmit.calls[0]!.req.credentials).toBe("omit");
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
      const raw = readFileSync(join(here, name), "utf8");
      // credentialsForPage names these page hosts once each. They are not a request target.
      const src = name === "http.ts"
        ? raw.replace(/"(?:www\.gilb\.com|gilb\.com|localhost|127\.0\.0\.1)"/g, '""')
        : raw;
      if (name === "http.ts") {
        expect(raw.match(/"(?:www\.gilb\.com|gilb\.com|localhost|127\.0\.0\.1|\[::1\])"/g)).toEqual([
          '"gilb.com"',
          '"www.gilb.com"',
          '"localhost"',
          '"127.0.0.1"',
          '"[::1]"',
        ]);
      }
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

describe("checkVaultName — suggestion and requested (0.2.3)", () => {
  const taken = { name: "johndevelopersailboats", available: false, reserved: false, suggestion: "johndevelopersailboats2", message: "That name is taken." };
  const transportOf = (status: number, body: unknown): Transport => async () => ({ status, json: async () => body });

  it("passes suggestion and message through when taken, and echoes the raw name as requested", async () => {
    const r = await checkVaultName(ORIGIN_A, "johndeveloper-sailboats", { transport: transportOf(200, taken) });
    expect(r.suggestion).toBe("johndevelopersailboats2");
    expect(r.message).toBe("That name is taken.");
    expect(r.name).toBe("johndevelopersailboats");
    expect(r.requested).toBe("johndeveloper-sailboats");
    expect(r.available).toBe(false);
  });

  it("has no suggestion when the name is free", async () => {
    const r = await checkVaultName(ORIGIN_A, "free", { transport: transportOf(200, { name: "free", available: true, reserved: false }) });
    expect(r.suggestion).toBeUndefined();
    expect(r.requested).toBe("free");
  });

  it("FAILS when suggestion is dropped: the check can fail", async () => {
    const r = await checkVaultName(ORIGIN_A, "x", { transport: transportOf(200, { ...taken, suggestion: "x2" }) });
    // If checkVaultName stopped returning `suggestion`, this is undefined and the test goes red.
    expect(r).toHaveProperty("suggestion", "x2");
    expect(typeof r.suggestion).toBe("string");
  });
});

describe("checkVaultName — normalized and note (0.2.5, F24)", () => {
  const transportOf = (body: unknown): Transport => async () => ({ status: 200, json: async () => body });

  it("returns normalized and note when the platform changed the name", async () => {
    const note = "'johndeveloper-sailboats' is saved as 'johndevelopersailboats': a vault name keeps only a\u2013z and 0\u20139.";
    const r = await checkVaultName(ORIGIN_A, "johndeveloper-sailboats", {
      transport: transportOf({ available: true, reserved: false, requested: "johndeveloper-sailboats", normalized: true, note, name: "johndevelopersailboats" }),
    });
    expect(r.normalized).toBe(true);
    expect(r.note).toBe(note);
    expect(r.name).toBe("johndevelopersailboats");
  });

  it("leaves both out when the platform sent neither", async () => {
    const r = await checkVaultName(ORIGIN_A, "free", { transport: transportOf({ available: true, reserved: false, name: "free", requested: "free" }) });
    expect(r).not.toHaveProperty("normalized");
    expect(r).not.toHaveProperty("note");
  });
});

describe("checkVaultName — requested (0.2.5)", () => {
  const transportOf = (body: unknown): Transport => async () => ({ status: 200, json: async () => body });
  it("returns the platform's requested when it sends one", async () => {
    const r = await checkVaultName(ORIGIN_A, "  Sail-Boats ", { transport: transportOf({ available: true, name: "sailboats", requested: "Sail-Boats" }) });
    expect(r.requested).toBe("Sail-Boats");
  });
  it("else the caller's input, trimmed", async () => {
    const r = await checkVaultName(ORIGIN_A, "  Sail-Boats ", { transport: transportOf({ available: true, name: "sailboats" }) });
    expect(r.requested).toBe("Sail-Boats");
  });
  it("a failed check also carries the trimmed input", async () => {
    const r = await checkVaultName(ORIGIN_A, " x ", { transport: async () => ({ status: 500, json: async () => ({}) }) });
    expect(r.requested).toBe("x");
  });
});

