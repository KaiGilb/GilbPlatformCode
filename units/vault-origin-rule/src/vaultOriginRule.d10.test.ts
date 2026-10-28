// @vitest-environment node
// Agent.Scaling Delta10 B1 (GilbApp, Cycle214 1e) — a credential went to whatever host a URI named.
// `vaultOriginOf` returned the origin of ANY http(s) URI, so the members find (DPoP, since 9dea5f1) and
// `readRecord` (plain Bearer, before that) sent the user's token to `evil.example`, `platform.example.test.evil.example`,
// `evilplatform.example.test`, `hytta.platform.example.test@evil.example`, a foreign port, plain http and `169.254.169.254`.
// Kai-Zen decision (2026-10-15; Kai may change it): credentials go ONLY to the platform's own hosts — the
// apex BASE_ORIGIN and its subdomains, over https on the default port. Every other host is asked at the apex.
// REAL: config.ts (vaultOriginOf, the one platform-host rule) at `build:prod`'s values, entityRefChildren.ts,
// attributeFind.ts, dpop.ts (real ES256 proof, real htuFor), records.ts readRecord, entityRefFacts.ts.
// MOCK: the network (a capturing fetch), the record client of the members find, the Bearer token manager.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as rule from "./vaultOriginRule";
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setLocalRigHosts, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";

const SYSTEM_HOSTS = ["veda.platform.example.test", "geo.platform.example.test", "life.platform.example.test", "id.platform.example.test", "kaizen.platform.example.test"];

/** Set the three settings the way the app does at start-up, and answer the rule. */
async function configWithOrigin(origin: string) {
  setBaseOrigin(origin);
  setSystemVaultHosts(SYSTEM_HOSTS);
  setLocalRigHosts(["localhost"]);
  return rule;
}

afterEach(() => {
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
});

/** The test's own oracle, written apart from config.ts: platform.example.test or a subdomain of it, https, default port. */
function onPlatform(url: string): boolean {
  const u = new URL(url);
  return (
    u.protocol === "https:" &&
    u.port === "" &&
    u.username === "" &&
    u.password === "" &&
    (u.hostname === "platform.example.test" || /^(?:[a-z0-9-]+\.)+platform\.example\.test$/.test(u.hostname))
  );
}

interface Sent { url: string; auth: string | null; htu: string | null }
const sent: Sent[] = [];

/** Agent.Scaling's ten parent URIs (Delta10 probe H), with the host each must be asked at. */
const TEN: [what: string, uri: string, askedAt: string][] = [
  ["control: a vault host", "https://hytta.platform.example.test/base/e/06gkparent", "https://hytta.platform.example.test"],
  ["control: geo", "https://geo.platform.example.test/base/e/osm-r-1", "https://geo.platform.example.test"],
  ["foreign host", "https://evil.example/base/e/x", "https://platform.example.test"],
  ["look-alike suffix", "https://platform.example.test.evil.example/base/e/x", "https://platform.example.test"],
  ["look-alike prefix", "https://evilplatform.example.test/base/e/x", "https://platform.example.test"],
  ["userinfo trick", "https://hytta.platform.example.test@evil.example/base/e/x", "https://platform.example.test"],
  ["foreign port", "https://evil.example:8443/base/e/x", "https://platform.example.test"],
  ["plain http, gilb host", "http://hytta.platform.example.test/base/e/x", "https://platform.example.test"],
  ["plain http, foreign", "http://evil.example/base/e/x", "https://platform.example.test"],
  ["link-local IP", "https://169.254.169.254/base/e/x", "https://platform.example.test"],
];

/** More shapes around the edges of the rule. */
const EDGES: [what: string, uri: string, askedAt: string][] = [
  ["a platform host on a foreign port", "https://hytta.platform.example.test:8443/base/e/x", "https://platform.example.test"],
  ["the apex on a foreign port", "https://platform.example.test:8443/base/e/x", "https://platform.example.test"],
  ["an explicit :443 is the default port", "https://hytta.platform.example.test:443/base/e/x", "https://hytta.platform.example.test"],
  ["upper case is the same host", "https://HYTTA.Platform.Example.TEST/base/e/x", "https://hytta.platform.example.test"],
  ["userinfo on a platform host: the host is the platform's", "https://kai:pw@hytta.platform.example.test/base/e/x", "https://hytta.platform.example.test"],
  ["platform host as the password-side of userinfo", "https://evil.example:x@hytta.platform.example.test/base/e/x", "https://hytta.platform.example.test"],
  ["look-alike, no dot before the apex", "https://hyttaplatform.example.test/base/e/x", "https://platform.example.test"],
  ["the apex as a deeper label of a foreign host", "https://platform.example.test.evil.example:443/base/e/x", "https://platform.example.test"],
  ["foreign host that contains the apex", "https://xplatform.example.testx.example/base/e/x", "https://platform.example.test"],
  ["trailing-dot apex form", "https://hytta.platform.example.test./base/e/x", "https://platform.example.test"],
  ["IPv6 literal", "https://[::1]/base/e/x", "https://platform.example.test"],
  ["a vault id (no entity path) on a foreign host", "https://evil.example/vault", "https://platform.example.test"],
  ["the apex itself", "https://platform.example.test/base/e/x", "https://platform.example.test"],
  ["a subdomain of another .com apex", "https://hytta.evil.com/base/e/x", "https://platform.example.test"],
  ["an empty first label", "https://.platform.example.test/base/e/x", "https://platform.example.test"],
  ["a deeper subdomain of the apex is still the platform's", "https://a.hytta.platform.example.test/base/e/x", "https://a.hytta.platform.example.test"],
];

beforeEach(() => {
  void configWithOrigin("https://platform.example.test");
});

describe("Delta10 B1: vaultOriginOf answers a platform host only (the one rule, config.ts)", () => {
  it("is at the production apex", () => {
    expect(baseOrigin()).toBe("https://platform.example.test");
  });
  for (const [what, uri, askedAt] of [...TEN, ...EDGES]) {
    it(`${what}: ${uri} → ${askedAt}`, () => {
      const got = rule.vaultOriginOf(uri);
      expect(got).toBe(askedAt);
      expect(onPlatform(got)).toBe(true);
    });
  }
});

describe("Delta10 B1 (Agent.Tester F2-1): a data-named URL resolves against the apex", () => {
  it("CONTROL: atVaultOrigin resolves a path against the apex and keeps a platform URL as it is", async () => {
    const { atVaultOrigin } = await configWithOrigin("https://platform.example.test");
    expect(atVaultOrigin("/base/e/x?y=1")).toBe("https://platform.example.test/base/e/x?y=1");
    expect(atVaultOrigin("https://hytta.platform.example.test/base/e/x")).toBe("https://hytta.platform.example.test/base/e/x");
    expect(atVaultOrigin("//evil.example/base/e/x")).toBe("https://platform.example.test/base/e/x");
    expect(atVaultOrigin("//hytta.platform.example.test/base/e/x")).toBe("https://hytta.platform.example.test/base/e/x");
    expect(atVaultOrigin("https://[bad/base/e/x")).toBe("https://platform.example.test");
  });
});
