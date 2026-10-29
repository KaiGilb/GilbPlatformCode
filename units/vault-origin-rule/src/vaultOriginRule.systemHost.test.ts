// @vitest-environment node
// The behaviour half of the card-walk finding: a DEV build
// (BASE_ORIGIN `http://localhost:8787`) asked BASE_ORIGIN for every host outside its own family, the system
// vaults included (GilbVeda, GilbGeo, the life tree vault, GilbID, the Kai-Zen vault). The rig holds none
// of them, so the card lost its place pickers, type pictures and term reads, and MyNet its catalogue search.
// Decision (2026-10-15): a system host is asked at its OWN origin in every
// build, and it receives a credential only when it is in the build's own platform family.
//   DEV  (`VITE_BASE_ORIGIN` unset, localhost): the system host is reached, with NO Authorization and NO DPoP.
//   PROD (`build:prod`'s values, https://platform.example.test): the same host is reached, WITH the credential.
// REAL: config.ts, bearer.ts (bearerHeaderFor), dpop.ts (real ES256 proof), records.ts, graphNeighbourhood.ts,
//       vaultSets.ts, entityShare.ts, relationWrite.ts, vedaLabels.ts. MOCK: the network (a capturing fetch),
import { afterEach, describe, expect, it } from "vitest";
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

type Build = "dev" | "prod";
/** The settings as one build sees them: the dev rig, or the production apex. */
async function load(build: Build) {
  const config = await configWithOrigin(build === "prod" ? "https://platform.example.test" : "http://localhost:8787");
  return { config };
}

const SYSTEM: [what: string, entity: string, origin: string][] = [
  ["GilbVeda", "https://veda.platform.example.test/base/e/06gtermx", "https://veda.platform.example.test"],
  ["GilbGeo", "https://geo.platform.example.test/base/e/osm-r-1", "https://geo.platform.example.test"],
  ["the life tree vault", "https://life.platform.example.test/base/e/salmo", "https://life.platform.example.test"],
  ["GilbID", "https://id.platform.example.test/base/e/06gvault", "https://id.platform.example.test"],
  ["the Kai-Zen vault", "https://kaizen.platform.example.test/base/e/06gstd", "https://kaizen.platform.example.test"],
];

describe("F-3: where a system host is asked (config.ts), in each build", () => {
  for (const build of ["dev", "prod"] as const) {
    for (const [what, entity, origin] of SYSTEM) {
      it(`${build}: ${what} is asked at its own origin`, async () => {
        const { config } = await load(build);
        expect(config.vaultOriginOf(entity)).toBe(origin);
      });
    }
  }

  it("dev: a vault host of the dev rig's own family still goes to BASE_ORIGIN's family (control)", async () => {
    const { config } = await load("dev");
    expect(config.vaultOriginOf("http://localhost:8787/base/e/x")).toBe("http://localhost:8787");
  });

  it("only the https default-port form of a system host is the system host (look-alikes are asked at the apex)", async () => {
    const { config } = await load("dev");
    for (const uri of [
      "http://veda.platform.example.test/base/e/x",
      "https://veda.platform.example.test:8443/base/e/x",
      "https://veda.platform.example.test.evil.example/base/e/x",
      "https://evilveda.platform.example.test.evil.example/base/e/x",
      "https://veda.platform.example.test@evil.example/base/e/x",
      "https://evil.example/base/e/x",
    ]) {
      expect(config.vaultOriginOf(uri), uri).toBe(baseOrigin());
    }
  });
});

describe("F-3: the credential rule (config.ts credentialAllowedAt)", () => {
  it("dev: BASE_ORIGIN yes; every system host no", async () => {
    const { config } = await load("dev");
    expect(config.credentialAllowedAt("http://localhost:8787/base/e/x")).toBe(true);
    for (const [, entity] of SYSTEM) expect(config.credentialAllowedAt(entity), entity).toBe(false);
  });

  it("prod: the apex and every system host yes (they are all subdomains of platform.example.test)", async () => {
    const { config } = await load("prod");
    expect(config.credentialAllowedAt("https://platform.example.test/base/e/x")).toBe(true);
    for (const [, entity] of SYSTEM) expect(config.credentialAllowedAt(entity), entity).toBe(true);
  });

  it("prod: a foreign host, a foreign port and plain http get none", async () => {
    const { config } = await load("prod");
    for (const url of ["https://evil.example/x", "https://platform.example.test.evil.example/x", "https://hytta.platform.example.test:8443/x", "http://hytta.platform.example.test/x", "https://[::1]/x", "ftp://hytta.platform.example.test/x"]) {
      expect(config.credentialAllowedAt(url), url).toBe(false);
    }
  });

  it("a relative URL is judged by the host the browser would send it to: BASE_ORIGIN", async () => {
    const { config } = await load("prod");
    expect(config.credentialAllowedAt("/lws/vaults")).toBe(true);
    expect(config.credentialAllowedAt("//evil.example/lws/vaults")).toBe(false);
  });
});

