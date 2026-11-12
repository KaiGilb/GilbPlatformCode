// makeExtractFromUrl against fake-platform's POST /base/style/extract (row 21): the real client, a signing credential, the platform's answers.
import { createFakePlatform, type FakePlatform } from "@kaigilb/gilbplatformcode-fake-platform";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractError, makeExtractFromUrl } from "./index";

let fake: FakePlatform;
let clock: { ms: number };
let signed: ReturnType<typeof vi.fn>;
let credential: { authHeaders: (method: string, url: string) => Promise<Record<string, string>> };
beforeEach(() => {
  clock = { ms: Date.now() };
  // The proofs are signed on the fake's clock and the clock jumps in the rate test, so the proof window is wide.
  fake = createFakePlatform({ now: () => clock.ms, proofWindowSeconds: 3600 });
  const person = fake.seedPerson({ email: "dev@example.test", vaultName: "dev" });
  const host = fake.authHost(person);
  // A spy around the fake's signing helper: it records exactly what the client asks to sign, and signs for real shape.
  signed = vi.fn((method: string, url: string) => host.dpopReadAuth(method, url));
  credential = { authHeaders: signed as never };
});

const endpoint = () => `${fake.origin}/base/style/extract`;
const clientOf = (extra: Record<string, unknown> = {}) => makeExtractFromUrl({ baseUrl: fake.origin, fetchImpl: fake.fetch as typeof fetch, credential, ...extra });
const fail = async (p: Promise<unknown>): Promise<ExtractError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ExtractError);
  return e as ExtractError;
};

describe("makeExtractFromUrl against the fake platform", () => {
  it("1. succeeds with a signing credential and returns the seeded colours and fonts", async () => {
    fake.seedStyle("https://example.com/", { colors: ["#112233", "#aabbcc"], fonts: ["Lora"], radiusPx: 8, logoUrl: "https://example.com/logo.png" });
    const r = await clientOf()("https://example.com/");
    expect(r).toEqual({ colors: ["#112233", "#aabbcc"], fonts: ["Lora"], radiusPx: 8, logoUrl: "https://example.com/logo.png" });
    expect(fake.calls.of("POST /base/style/extract")).toHaveLength(1);
    expect(fake.calls.last()!.status).toBe(200);
    expect(fake.violations).toEqual([]);
  });
  it("1b. an address that was not seeded still answers colours and fonts (the fake's stub)", async () => {
    const r = await clientOf()("https://unseeded.example.com/");
    expect(r.colors).toHaveLength(3);
    expect(r.fonts).toHaveLength(1);
  });

  it("2. calls credential.authHeaders with exactly POST and the endpoint URL", async () => {
    await clientOf()("https://example.com/");
    expect(signed).toHaveBeenCalledTimes(1);
    expect(signed.mock.calls[0]).toEqual(["POST", `${fake.origin}/base/style/extract`]);
    // and the fake checked that proof against the request it received (htm POST, htu the endpoint)
    expect(fake.calls.last()!.proof.ok).toBe(true);
  });
  it("2b. a trailing slash on baseUrl does not change what is signed", async () => {
    await makeExtractFromUrl({ baseUrl: `${fake.origin}/`, fetchImpl: fake.fetch as typeof fetch, credential })("https://example.com/");
    expect(signed.mock.calls[0]).toEqual(["POST", endpoint()]);
    expect(fake.calls.last()!.status).toBe(200);
  });
  it("2c. a credential that signs another URL is refused by the platform (the check is real)", async () => {
    const wrong = { authHeaders: (m: string, _u: string) => credential.authHeaders(m, `${fake.origin}/base/style/other`) };
    const e = await fail(clientOf({ credential: wrong })("https://example.com/"));
    expect(e.status).toBe(401);
  });

  it("3. with no credential and no getAuthHeaders the 401 is an ExtractError with a plain sentence", async () => {
    const e = await fail(makeExtractFromUrl({ baseUrl: fake.origin, fetchImpl: fake.fetch as typeof fetch })("https://example.com/"));
    expect(e.status).toBe(401);
    expect(e.message).toBe("Sign in first.");
    expect(fake.calls.last()!.status).toBe(401);
  });

  it("4. the 11th call inside the window is an ExtractError for 429 with a plain sentence", async () => {
    const read = clientOf();
    for (let i = 0; i < 10; i++) await read("https://example.com/");
    const e = await fail(read("https://example.com/"));
    expect(e.status).toBe(429);
    expect(e.message).toBe("Too many reads — wait a minute.");
    clock.ms += 61_000;
    await expect(read("https://example.com/")).resolves.toMatchObject({ fonts: expect.any(Array) });
  });

  it("5. address_not_allowed becomes its sentence", async () => {
    for (const a of ["https://localhost/", "https://192.168.0.10/", "https://10.1.2.3/"]) {
      clock.ms += 61_000;
      const e = await fail(clientOf()(a));
      expect(e.status, a).toBe(400);
      expect(e.message, a).toBe("That address cannot be read (private or not allowed).");
    }
  });
  it("5b. an address that is not https is the generic sentence (the platform's bad_url)", async () => {
    const e = await fail(clientOf()("http://example.com/"));
    expect(e.status).toBe(400);
    expect(e.message).toBe("The site could not be read.");
  });
});
