// The words the Studio shows when the server cannot read a site. The server answers are a GUESS taken from the friction
// brief (502 {error:"site_status", status}, and the new codes site_refused and site_unreachable from GilbPlatform's pending PR);
// they are not a live measurement, so each case is a MOCK until that PR is live.
import { describe, expect, it } from "vitest";
import { ExtractError, makeExtractFromUrl } from "./extractClient";

const REFUSED = "This site does not allow its style to be read. Try another site.";
const UNREACHABLE = "The site could not be reached.";
const GENERIC = "The site could not be read.";

async function messageOf(status: number, body: unknown): Promise<string> {
  const fetchImpl = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  const e = await makeExtractFromUrl({ baseUrl: "https://p.example.test", fetchImpl })("https://example.com/").then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ExtractError);
  return (e as ExtractError).message;
}

describe("extract client messages for a site that cannot be read", () => {
  // Spec: friction #58 — a site that answers 401, 403 or 429 refuses the read; say so in plain words.
  it.each([401, 403, 429])("502 site_status %i says the site does not allow its style to be read", async (s) => {
    expect(await messageOf(502, { error: "site_status", status: s })).toBe(REFUSED);
  });

  // Spec: friction #58 — the client must accept the new code before the server PR lands, and after.
  it("502 site_refused says the same", async () => {
    expect(await messageOf(502, { error: "site_refused" })).toBe(REFUSED);
  });

  // Spec: friction #58 — an unreachable site has its own sentence.
  it("site_unreachable says the site could not be reached", async () => {
    expect(await messageOf(502, { error: "site_unreachable" })).toBe(UNREACHABLE);
  });

  // Spec: friction #58 — other site statuses keep the current generic message.
  it("502 site_status with another status keeps the generic message", async () => {
    expect(await messageOf(502, { error: "site_status", status: 500 })).toBe(GENERIC);
    expect(await messageOf(502, { error: "site_status" })).toBe(GENERIC);
  });

  // Spec: friction #58 — the existing mappings are unchanged.
  it("existing mappings are unchanged", async () => {
    expect(await messageOf(401, {})).toBe("Sign in first.");
    expect(await messageOf(429, {})).toBe("Too many reads — wait a minute.");
    expect(await messageOf(504, {})).toBe("The site took too long to answer.");
    expect(await messageOf(500, {})).toBe(GENERIC);
  });
});
