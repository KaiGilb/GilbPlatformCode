// A scratch vault's own host on the LOCAL rig is reachable from a browser.
// VKT-LocalRigVaultHostScheme-GilbApp (winner DevLoopbackHttpVaultOrigin). Measured on the rig
// (2026-10-06): a vault mints as `https://<name>.localhost:8787/vault`; the rig serves plain http,
// so the URI's own scheme fails TLS, while `http://<name>.localhost:8787` answers every vault call.
// The rule: only when BASE_ORIGIN is `http://localhost:<port>` and the vault host is
// `<label>.localhost` on that SAME port is the fetch scheme http. Everything else is unchanged,
// and a production origin never takes the branch.
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

const DEV_ORIGIN = "http://localhost:8787";
const PROD_ORIGIN = "https://platform.example.test";

describe("vaultOriginOf on the local rig: a loopback vault host on BASE_ORIGIN's port is fetched over http", () => {
  it("a vault id on <name>.localhost:8787 is addressed at http://<name>.localhost:8787", async () => {
    const c = await configWithOrigin(DEV_ORIGIN);
    expect(c.vaultOriginOf("https://kai.localhost:8787/vault")).toBe("http://kai.localhost:8787");
  });

  it("an entity URI on that host is addressed the same way, and the vault collection URL follows", async () => {
    const c = await configWithOrigin(DEV_ORIGIN);
    expect(c.vaultOriginOf("https://kai.localhost:8787/lws/r/06abc")).toBe("http://kai.localhost:8787");
    const v = "https://kai.localhost:8787/vault";
    expect(c.LWS_VAULT_RECORDS_URL(v)).toBe(`http://kai.localhost:8787/lws/vault/${encodeURIComponent(v)}/records`);
  });

  it("CONTROL: the backend's own host still answers BASE_ORIGIN verbatim", async () => {
    const c = await configWithOrigin(DEV_ORIGIN);
    expect(c.vaultOriginOf("https://localhost:8787/base")).toBe(DEV_ORIGIN);
  });

  // A host outside BASE_ORIGIN's own family is asked at BASE_ORIGIN, never at
  // its own origin (credentials go only to the platform's hosts). These controls pinned "keeps its own".
  it("CONTROL: a loopback host on ANOTHER port is not the rig's server: asked at BASE_ORIGIN (Delta10 B1)", async () => {
    const c = await configWithOrigin(DEV_ORIGIN);
    expect(c.vaultOriginOf("https://kai.localhost:9999/vault")).toBe(DEV_ORIGIN);
  });

  it("CONTROL: a production host is not the rig's: asked at BASE_ORIGIN on the local rig, never over http at its own host (Delta10 B1)", async () => {
    const c = await configWithOrigin(DEV_ORIGIN);
    expect(c.vaultOriginOf("https://hytta.platform.example.test/base")).toBe(DEV_ORIGIN);
  });

  it("s7 walk fix F-3: a SYSTEM vault host (GilbVeda) is the one exception: asked at its own https origin on the local rig, which holds none of them", async () => {
    const c = await configWithOrigin(DEV_ORIGIN);
    expect(c.vaultOriginOf("https://veda.platform.example.test/base")).toBe("https://veda.platform.example.test");
  });

  it("CONTROL: a host that only ENDS in 'localhost' without the dot is not a loopback subdomain", async () => {
    const c = await configWithOrigin(DEV_ORIGIN);
    expect(c.vaultOriginOf("https://evillocalhost:8787/vault")).toBe(DEV_ORIGIN);
  });
});

describe("vaultOriginOf in a production build never takes the local-rig branch", () => {
  it("CONTROL: an https BASE_ORIGIN never flips a host to http (the branch needs a plain-http rig); off the default port it is not a platform host (Delta10 B1)", async () => {
    const c = await configWithOrigin("https://localhost:8787");
    expect(c.vaultOriginOf("https://kai.localhost:8787/vault")).toBe("https://localhost:8787");
  });

  it("CONTROL: an http BASE_ORIGIN that is not localhost does not rewrite a .localhost host (asked at BASE_ORIGIN, Delta10 B1)", async () => {
    const c = await configWithOrigin("http://devbox.example:8787");
    expect(c.vaultOriginOf("https://kai.localhost:8787/vault")).toBe("http://devbox.example:8787");
  });

  it("with BASE_ORIGIN https://platform.example.test, a <name>.localhost URI is not a platform host: asked at the apex (Delta10 B1)", async () => {
    const c = await configWithOrigin(PROD_ORIGIN);
    expect(c.vaultOriginOf("https://kai.localhost:8787/vault")).toBe(PROD_ORIGIN);
  });

  it("with BASE_ORIGIN https://platform.example.test, a user vault host keeps https", async () => {
    const c = await configWithOrigin(PROD_ORIGIN);
    expect(c.vaultOriginOf("https://kai.platform.example.test/vault")).toBe("https://kai.platform.example.test");
  });
});
