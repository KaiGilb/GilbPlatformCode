import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  baseOrigin,
  resetBaseOrigin,
  resetLocalRigHosts,
  resetSystemVaultHosts,
  setBaseOrigin,
  setLocalRigHosts,
  setSystemVaultHosts,
} from "@kaigilb/gilbplatformcode-base-origin";
import * as api from "./index";
import {
  BASE_ENTITY_RELATIONS_URL,
  BASE_RELATION_URL,
  LWS_RESOURCE_URL,
  LWS_VAULT_CONTAINER_URL,
  LWS_VAULT_FILES_URL,
  LWS_VAULT_RECORDS_URL,
  LWS_VAULT_TYPES_URL,
  atVaultOrigin,
  credentialAllowedAt,
  recordDoor,
  sessionDpopTokenUrl,
  sessionTokenUrl,
  storeOfOrigin,
  vaultOriginOf,
} from "./vaultOriginRule";
import { SELF_CARD_ID_PREFIX, VAULT_PATH_SEGMENTS, selfCardIdForVault, vaultSegmentOf } from "./photoSegments";

const APEX = "https://platform.example.test";
const USER_VAULT = "https://u.platform.example.test/vault";
const SYSTEM_VAULT = "https://veda.platform.example.test/base";

afterEach(() => {
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
});

describe("the settings are read when the function is called, not when the module loads", () => {
  it("nothing is read at import: the module loaded with no setting set", () => {
    expect(() => baseOrigin()).toThrow(/setBaseOrigin/);
  });

  it("the session URLs follow the origin that is set at the time of the call", () => {
    setBaseOrigin("https://one.example.test");
    expect(sessionTokenUrl()).toBe("https://one.example.test/base/auth/session/token");
    expect(sessionDpopTokenUrl()).toBe("https://one.example.test/base/auth/session/dpop-token");
    setBaseOrigin("http://two.example.test:8787");
    expect(sessionTokenUrl()).toBe("http://two.example.test:8787/base/auth/session/token");
    expect(sessionDpopTokenUrl()).toBe("http://two.example.test:8787/base/auth/session/dpop-token");
  });

  it("with no origin set the session URLs and vaultOriginOf(null) throw an Error that names setBaseOrigin, and credentialAllowedAt answers false", () => {
    expect(() => sessionTokenUrl()).toThrow(/setBaseOrigin/);
    expect(() => sessionDpopTokenUrl()).toThrow(/setBaseOrigin/);
    expect(() => vaultOriginOf(null)).toThrow(/setBaseOrigin/);
    expect(credentialAllowedAt("https://x.example.test/")).toBe(false);
  });
});

describe("the builders", () => {
  beforeEach(() => {
    setBaseOrigin(APEX);
    setSystemVaultHosts(["veda.platform.example.test"]);
  });

  it("BASE_RELATION_URL and BASE_ENTITY_RELATIONS_URL carry the host and the vault segment of the URI they are given", () => {
    expect(BASE_RELATION_URL("r1", `${USER_VAULT}/e/x`)).toBe("https://u.platform.example.test/vault/r/r1");
    expect(BASE_ENTITY_RELATIONS_URL("e1", `${USER_VAULT}/e/x`)).toBe("https://u.platform.example.test/vault/e/e1/relations");
    expect(BASE_RELATION_URL("r1", `${SYSTEM_VAULT}/e/x`)).toBe("https://veda.platform.example.test/base/r/r1");
  });

  it("with no URI they fall back to the apex and /base", () => {
    expect(BASE_RELATION_URL("r1")).toBe(`${APEX}/base/r/r1`);
    expect(BASE_RELATION_URL("r1", null)).toBe(`${APEX}/base/r/r1`);
    expect(BASE_ENTITY_RELATIONS_URL("e1")).toBe(`${APEX}/base/e/e1/relations`);
  });

  it("LWS_RESOURCE_URL has no vault segment", () => {
    expect(LWS_RESOURCE_URL("r1", `${USER_VAULT}/e/x`)).toBe("https://u.platform.example.test/lws/r/r1");
    expect(LWS_RESOURCE_URL("r1")).toBe(`${APEX}/lws/r/r1`);
  });

  it("the vault collection URLs name the vault by one percent-encoded path segment, at the vault's own host", () => {
    const seg = encodeURIComponent(USER_VAULT);
    expect(LWS_VAULT_RECORDS_URL(USER_VAULT)).toBe(`https://u.platform.example.test/lws/vault/${seg}/records`);
    expect(LWS_VAULT_TYPES_URL(USER_VAULT)).toBe(`https://u.platform.example.test/lws/vault/${seg}/types`);
    expect(LWS_VAULT_CONTAINER_URL(USER_VAULT)).toBe(`https://u.platform.example.test/lws/vault/${seg}/c`);
    expect(LWS_VAULT_FILES_URL(USER_VAULT)).toBe(`https://u.platform.example.test/lws/vault/${seg}/files`);
  });

  it("a vault id on a foreign host is addressed at the apex", () => {
    const foreign = "https://evil.example/vault";
    expect(LWS_VAULT_RECORDS_URL(foreign)).toBe(`${APEX}/lws/vault/${encodeURIComponent(foreign)}/records`);
  });
});

describe("storeOfOrigin", () => {
  beforeEach(() => {
    setBaseOrigin(APEX);
    setSystemVaultHosts(["veda.platform.example.test"]);
  });

  it("the apex and a system host are the identity store; every other host is the user store", () => {
    expect(storeOfOrigin(APEX)).toBe("identity");
    expect(storeOfOrigin("https://veda.platform.example.test")).toBe("identity");
    expect(storeOfOrigin("https://u.platform.example.test")).toBe("user");
    expect(storeOfOrigin("https://evil.example")).toBe("user");
  });

  it("an origin the parser cannot read is the identity store", () => {
    expect(storeOfOrigin("not a url")).toBe("identity");
    expect(storeOfOrigin("")).toBe("identity");
  });

  it("a system host over plain http or on another port is not a system host", () => {
    expect(storeOfOrigin("http://veda.platform.example.test")).toBe("user");
    expect(storeOfOrigin("https://veda.platform.example.test:8443")).toBe("user");
  });
});

describe("the local rig rule is off until the rig hosts are named", () => {
  const RIG = "http://localhost:8787";
  const RIG_VAULT = "https://kai.localhost:8787/vault";

  it("with no rig host set, a <name>.localhost vault is asked at the base origin and gets no credential", () => {
    setBaseOrigin(RIG);
    setSystemVaultHosts([]);
    expect(vaultOriginOf(RIG_VAULT)).toBe(RIG);
    expect(credentialAllowedAt(`${RIG_VAULT}/e/x`)).toBe(false);
  });

  it("with the rig host set to localhost, the same vault is fetched over http at its own host, and only the http form of that host may carry a credential", () => {
    setBaseOrigin(RIG);
    setSystemVaultHosts([]);
    setLocalRigHosts(["localhost"]);
    expect(vaultOriginOf(RIG_VAULT)).toBe("http://kai.localhost:8787");
    expect(credentialAllowedAt("http://kai.localhost:8787/vault/e/x")).toBe(true);
    expect(credentialAllowedAt(`${RIG_VAULT}/e/x`)).toBe(false);
    expect(atVaultOrigin(`${RIG_VAULT}/e/x?q=1`)).toBe("http://kai.localhost:8787/vault/e/x?q=1");
  });

  it("a rig host that is not the base origin's host does not turn the rule on", () => {
    setBaseOrigin(RIG);
    setSystemVaultHosts([]);
    setLocalRigHosts(["other.example.test"]);
    expect(vaultOriginOf(RIG_VAULT)).toBe(RIG);
  });

  it("the rig rule needs the plain-http base: an https base never takes it, even when its host is a rig host", () => {
    setBaseOrigin("https://localhost:8787");
    setSystemVaultHosts([]);
    setLocalRigHosts(["localhost"]);
    expect(vaultOriginOf(RIG_VAULT)).toBe("https://localhost:8787");
  });

  it("the rig rule needs the same port", () => {
    setBaseOrigin(RIG);
    setSystemVaultHosts([]);
    setLocalRigHosts(["localhost"]);
    expect(vaultOriginOf("https://kai.localhost:9999/vault")).toBe(RIG);
  });
});

describe("the unset system host list (a production quirk kept: the error is swallowed)", () => {
  it("vaultOriginOf answers the apex for a foreign host instead of throwing, and storeOfOrigin answers identity", () => {
    setBaseOrigin(APEX);
    expect(vaultOriginOf("https://evil.example/base/e/x")).toBe(APEX);
    expect(storeOfOrigin("https://u.platform.example.test")).toBe("identity");
  });

  it("a system host outside the base origin's family is asked at the base origin while the list is unset, and at its own origin once it is set", () => {
    setBaseOrigin("http://dev.example.test:8787");
    expect(vaultOriginOf(`${SYSTEM_VAULT}/e/x`)).toBe("http://dev.example.test:8787");
    setSystemVaultHosts(["veda.platform.example.test"]);
    expect(vaultOriginOf(`${SYSTEM_VAULT}/e/x`)).toBe("https://veda.platform.example.test");
  });
});

describe("the base origin's own host", () => {
  it("is answered as the base origin verbatim, whatever scheme the URI carries, even when it is also a system host", () => {
    setBaseOrigin("http://dev.example.test");
    setSystemVaultHosts(["dev.example.test"]);
    expect(vaultOriginOf("https://dev.example.test/base")).toBe("http://dev.example.test");
    expect(vaultOriginOf("http://dev.example.test/base")).toBe("http://dev.example.test");
  });
});

describe("recordDoor and atVaultOrigin", () => {
  beforeEach(() => {
    setBaseOrigin(APEX);
    setSystemVaultHosts([]);
  });

  it("recordDoor prefers the entity, then the vault, then null; blank strings count as absent", () => {
    expect(recordDoor("e", "v")).toBe("e");
    expect(recordDoor("", "v")).toBe("v");
    expect(recordDoor(undefined, "v")).toBe("v");
    expect(recordDoor(null, "")).toBeNull();
    expect(recordDoor(undefined, undefined)).toBeNull();
  });

  it("atVaultOrigin returns a URL with a scheme that reaches no vault as given", () => {
    expect(atVaultOrigin("mailto:a@example.test")).toBe("mailto:a@example.test");
    expect(atVaultOrigin("data:text/plain,x")).toBe("data:text/plain,x");
  });
});

describe("photoSegments", () => {
  it("VAULT_PATH_SEGMENTS is base then vault", () => {
    expect([...VAULT_PATH_SEGMENTS]).toEqual(["base", "vault"]);
  });

  it("vaultSegmentOf reads the first path segment of a URI and defaults to /base", () => {
    expect(vaultSegmentOf("https://u.example.test/vault/e/x")).toBe("/vault");
    expect(vaultSegmentOf("https://u.example.test/base/e/x")).toBe("/base");
    expect(vaultSegmentOf("https://u.example.test/lws/r/x")).toBe("/base");
    expect(vaultSegmentOf("https://u.example.test")).toBe("/base");
    expect(vaultSegmentOf("not a url")).toBe("/base");
    expect(vaultSegmentOf(null)).toBe("/base");
    expect(vaultSegmentOf(undefined)).toBe("/base");
    expect(vaultSegmentOf("")).toBe("/base");
  });

  it("selfCardIdForVault is vsc- and the first 24 hex digits of the SHA-256 of the trimmed root, as typed", async () => {
    expect(SELF_CARD_ID_PREFIX).toBe("vsc-");
    expect(await selfCardIdForVault("https://u.platform.example.test/vault")).toBe("vsc-" + "e11a718c0ca7daeea9b96b4e");
    expect(await selfCardIdForVault("  https://platform.example.test/base  ")).toBe("vsc-" + "fce01f32f85bbce4d67d1663");
  });

  it("selfCardIdForVault gives a different id for /base and /vault and refuses a blank root", async () => {
    expect(await selfCardIdForVault("https://x.example.test/base")).not.toBe(await selfCardIdForVault("https://x.example.test/vault"));
    await expect(selfCardIdForVault("")).rejects.toThrow(/requires the vault root/);
    await expect(selfCardIdForVault("   ")).rejects.toThrow(/requires the vault root/);
  });
});

describe("the export list", () => {
  it("is exactly these names", () => {
    expect(Object.keys(api).sort()).toEqual([
      "BASE_ENTITY_RELATIONS_URL",
      "BASE_RELATION_URL",
      "LWS_RESOURCE_URL",
      "LWS_VAULT_CONTAINER_URL",
      "LWS_VAULT_FILES_URL",
      "LWS_VAULT_RECORDS_URL",
      "LWS_VAULT_TYPES_URL",
      "SELF_CARD_ID_PREFIX",
      "VAULT_PATH_SEGMENTS",
      "atVaultOrigin",
      "credentialAllowedAt",
      "recordDoor",
      "selfCardIdForVault",
      "sessionDpopTokenUrl",
      "sessionTokenUrl",
      "storeOfOrigin",
      "vaultOriginOf",
      "vaultSegmentOf",
    ]);
  });
});
