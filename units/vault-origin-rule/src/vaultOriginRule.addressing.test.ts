import { afterEach, describe, expect, it } from "vitest";
import * as rule from "./vaultOriginRule";
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

import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";

const PROD_ORIGIN = "https://platform.example.test";
const KAIZEN_VAULT = "https://kaizen.platform.example.test/base";
const VEDA_VAULT = "https://veda.platform.example.test/base";

describe("vaultOriginOf — REUSED for a vaultId, not re-implemented", () => {
  it("extracts the vault's own origin from its vaultId namespace", async () => {
    // Delta10 B1 (Cycle214 1e): only BASE_ORIGIN's own host family is answered, so at production's apex.
    const { vaultOriginOf } = await configWithOrigin(PROD_ORIGIN);
    // A vaultId is `https://<host>/base`, so the same helper the dereference family already
    // uses on an entity URI answers correctly for a vault namespace. No second primitive.
    expect(vaultOriginOf(KAIZEN_VAULT)).toBe("https://kaizen.platform.example.test");
    expect(vaultOriginOf(VEDA_VAULT)).toBe("https://veda.platform.example.test");
  });

  it("degrades to BASE_ORIGIN rather than throwing", async () => {
    const { vaultOriginOf } = await configWithOrigin(PROD_ORIGIN);
    const BASE_ORIGIN = baseOrigin();
    expect(vaultOriginOf(null)).toBe(BASE_ORIGIN);
    expect(vaultOriginOf(undefined)).toBe(BASE_ORIGIN);
    expect(vaultOriginOf("")).toBe(BASE_ORIGIN);
    expect(vaultOriginOf("not-a-url")).toBe(BASE_ORIGIN);
    // The Base sentinel for "resolves to no vault" carries no host and must never be addressed.
    expect(vaultOriginOf("urn:base:unresolved-vault")).toBe(BASE_ORIGIN);
  });
});

describe("clause 5 + 6 — vault-targeted COLLECTION reads are addressed at the vault's own host", () => {
  it("records / files / container move to the vault host AND keep the vault path segment", async () => {
    const c = await configWithOrigin(PROD_ORIGIN);
    const seg = encodeURIComponent(KAIZEN_VAULT);

    // The host changes; the segment stays. Dropping the segment would make the request
    // vault-less, which Base answers with a hard 400 `vault target required` (VDT 79/82) --
    // there is no default vault to fall back to.
    expect(c.LWS_VAULT_RECORDS_URL(KAIZEN_VAULT)).toBe(`https://kaizen.platform.example.test/lws/vault/${seg}/records`);
    expect(c.LWS_VAULT_FILES_URL(KAIZEN_VAULT)).toBe(`https://kaizen.platform.example.test/lws/vault/${seg}/files`);
    expect(c.LWS_VAULT_CONTAINER_URL(KAIZEN_VAULT)).toBe(`https://kaizen.platform.example.test/lws/vault/${seg}/c`);
  });


  it("still answers on BASE_ORIGIN when the deployment serves every vault on one origin (dev)", async () => {
    // In dev, Base serves every vault from the one origin and vaultIds carry that same host,
    // so this is a no-op there -- the mechanism is uniform, not environment-branched.
    const c = await configWithOrigin("http://localhost:8787");
    const devVault = "http://localhost:8787/base";
    expect(c.LWS_VAULT_RECORDS_URL(devVault)).toBe(
      `http://localhost:8787/lws/vault/${encodeURIComponent(devVault)}/records`,
    );
  });
});

describe("Cycle147 — recordDoor: a dereference is addressed at the vault that HOLDS the record", () => {
  const GEO_VAULT = "https://geo.platform.example.test/base";
  const GEO_ENTITY = "https://geo.platform.example.test/base/e/osm-r-406091";

  it("prefers the entity's OWN uri, falls back to the VAULT's, and only then to nothing", async () => {
    const { recordDoor } = await configWithOrigin(PROD_ORIGIN);
    expect(recordDoor(GEO_ENTITY, GEO_VAULT)).toBe(GEO_ENTITY);
    // The whole fix: an id-only surface still knows which vault it is reading.
    expect(recordDoor(null, GEO_VAULT)).toBe(GEO_VAULT);
    expect(recordDoor(null, null)).toBeNull();
    expect(recordDoor(undefined, undefined)).toBeNull();
    expect(recordDoor("", "")).toBeNull();
  });

  it("a vault namespace door yields the VAULT's origin — not the apex (RED before the fix)", async () => {
    const c = await configWithOrigin(PROD_ORIGIN);
    expect(c.LWS_RESOURCE_URL("osm-r-406091", c.recordDoor(null, GEO_VAULT))).toBe(
      "https://geo.platform.example.test/lws/r/osm-r-406091",
    );
    // What the shipped code sent, pinned so the regression is legible rather than implied.
    expect(c.LWS_RESOURCE_URL("osm-r-406091", null)).toBe("https://platform.example.test/lws/r/osm-r-406091");
  });

});
