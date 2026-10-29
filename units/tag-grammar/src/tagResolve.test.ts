// A tag resolves through the platform's existing `GET /base/tag/resolve`, in the
// vault its vault name says; the short form resolves only inside the holder's own vault.
//
// The platform is the fixture of `test/platformFixture.ts` (the shipped routes' shapes as read on a
// scratch rig), fetched from an origin that is not the identity host of any IRI.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { PlatformError } from "@kaigilb/gilbplatformcode-record-sync";
import { readTagGrammar } from "./tag";
import { lookupTagString, resolveTag } from "./tagResolve";
import { fixtureMaster, RIG } from "../test/support";
import { withTagStandard } from "../test/tagStandard";
import { fixturePlatform, PLATFORM_RIG } from "../test/platformFixture";


const HOME = "https://home.example.test/vault";
const AWAY = "https://away.example.test/vault";
const VAULTS = [
  { vaultId: HOME, vaultName: "home" },
  { vaultId: AWAY, vaultName: "away" },
];

async function setup() {
  const m = withTagStandard(fixtureMaster());
  const grammar = await readTagGrammar(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
  const p = fixturePlatform();
  p.reach.add(HOME).add(AWAY);
  // The SAME tag string names a different record in each vault: a resolver that asked the wrong
  // vault, or no vault, gets the wrong record.
  const annInHome = p.seed(HOME, "t:Person", { "a:name": "Ann Lee" });
  const annInAway = p.seed(AWAY, "t:Person", { "a:name": "Ben Lee" });
  const handleHome = p.seedTag(HOME, "ann", annInHome);
  const handleAway = p.seedTag(AWAY, "ann", annInAway);
  const spaced = p.seed(HOME, "t:Person", { "a:name": "Ann Lee Jr" });
  p.seedTag(HOME, "Ann Lee.jr", spaced);
  return { grammar, p, platform: { origin: p.origin, fetch: p.fetch }, annInHome, annInAway, handleHome, handleAway, spaced };
}

describe("resolveTag — through the platform's tag route", () => {
  it("resolves the full form in the vault its vault name says", async () => {
    const s = await setup();
    const inHome = await resolveTag(s.platform, s.grammar, { text: "@ann@home", vaults: VAULTS, context: { ownVaultName: null } });
    expect(inHome).toEqual({ status: "resolved", record: s.annInHome, tagHandle: s.handleHome, tag: "ann", vaultName: "home", vaultId: HOME, form: "full" });
    const inAway = await resolveTag(s.platform, s.grammar, { text: "@ann@away", vaults: VAULTS, context: { ownVaultName: "home" } });
    expect(inAway).toEqual({ status: "resolved", record: s.annInAway, tagHandle: s.handleAway, tag: "ann", vaultName: "away", vaultId: AWAY, form: "full" });
  });

  it("asks the existing route, with the tag string and the vault ID, on the platform origin", async () => {
    const s = await setup();
    await resolveTag(s.platform, s.grammar, { text: "@Ann Lee.jr@home", vaults: VAULTS, context: { ownVaultName: null } });
    expect(s.p.requests).toHaveLength(1);
    expect(s.p.requests[0]!.method).toBe("GET");
    expect(s.p.requests[0]!.url).toBe(
      `${PLATFORM_RIG}/base/tag/resolve?tagString=Ann%20Lee.jr&vault=${encodeURIComponent(HOME)}`,
    );
  });

  it("resolves the short form inside the holder's own vault", async () => {
    const s = await setup();
    const r = await resolveTag(s.platform, s.grammar, { text: "@ann", vaults: VAULTS, context: { ownVaultName: "home" } });
    expect(r).toMatchObject({ status: "resolved", record: s.annInHome, vaultId: HOME, form: "short" });
  });

  it("a tag typed in another vault's context resolves only in full form: the short form asks nothing", async () => {
    const s = await setup();
    const r = await resolveTag(s.platform, s.grammar, { text: "@ann", vaults: VAULTS, context: { ownVaultName: null } });
    expect(r).toEqual({ status: "refused", reason: "short-form-outside-own-vault" });
    expect(s.p.requests).toHaveLength(0);
  });

  it("an email address asks nothing and resolves nothing", async () => {
    const s = await setup();
    for (const text of ["ann@home", "ann@home.no", "home@example.test"]) {
      const r = await resolveTag(s.platform, s.grammar, { text, vaults: VAULTS, context: { ownVaultName: "home" } });
      expect(r.status, text).toBe("refused");
    }
    expect(s.p.requests).toHaveLength(0);
  });

  it("a vault name the caller did not list is 'unknown vault', never looked up in another vault", async () => {
    const s = await setup();
    const r = await resolveTag(s.platform, s.grammar, { text: "@ann@zed", vaults: VAULTS, context: { ownVaultName: "home" } });
    expect(r).toEqual({ status: "unknown-vault", tag: "ann", vaultName: "zed" });
    expect(s.p.requests).toHaveLength(0);
  });

  it("a tag that names nothing in the vault is the route's miss, with where it was asked", async () => {
    const s = await setup();
    const r = await resolveTag(s.platform, s.grammar, { text: "@nobody@home", vaults: VAULTS, context: { ownVaultName: null } });
    expect(r).toEqual({ status: "miss", tag: "nobody", vaultName: "home", vaultId: HOME, form: "full" });
  });

  it("a vault the caller cannot read is an error, not a miss", async () => {
    const s = await setup();
    s.p.reach.delete(AWAY);
    const denied = resolveTag(s.platform, s.grammar, { text: "@ann@away", vaults: VAULTS, context: { ownVaultName: null } });
    await expect(denied).rejects.toBeInstanceOf(PlatformError);
    await expect(denied).rejects.toMatchObject({ status: 403 });
  });

  it("a platform that cannot be reached is an error, not a miss", async () => {
    const s = await setup();
    const down = { origin: PLATFORM_RIG, fetch: async () => { throw new TypeError("fetch failed"); } };
    await expect(lookupTagString(down, { tag: "ann", vaultId: HOME })).rejects.toMatchObject({ name: "PlatformError", status: 0 });
    s.p.failNext("GET", "/base/tag/resolve", 200, { status: "something-else" });
    await expect(lookupTagString(s.platform, { tag: "ann", vaultId: HOME })).rejects.toThrow(/neither a hit nor a miss/);
  });

  it("refuses a vault list that names one vault name for two vault ids", async () => {
    const s = await setup();
    const twice = [...VAULTS, { vaultId: "https://other.example.test/vault", vaultName: "home" }];
    await expect(resolveTag(s.platform, s.grammar, { text: "@ann@home", vaults: twice, context: { ownVaultName: null } })).rejects.toThrow(/more than one vault id/);
    expect(s.p.requests).toHaveLength(0);
  });
});
