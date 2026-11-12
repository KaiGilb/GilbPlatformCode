// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  baseOrigin,
  localRigHosts,
  resetBaseOrigin,
  resetLocalRigHosts,
  resetSystemVaultHosts,
  setSystemVaultHosts,
  systemVaultHosts,
} from "@kaigilb/gilbplatformcode-base-origin";
import { credentialAllowedAt } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { configureLiveApp } from "./configureLiveApp";
import { dpopReadAuth, resetLwsAuth, tokenManager } from "./lwsAuth";
import { NotSignedInError } from "./errors";

const PLATFORM = "https://platform.example.test";
const ID = "https://id.platform.example.test";

afterEach(() => {
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
});

describe("configureLiveApp", () => {
  it("sets the base origin so a platform URL may carry the credential and an outside URL may not", () => {
    const app = configureLiveApp({ platformOrigin: PLATFORM, idOrigin: ID, credentialOptions: { store: false } });
    expect(baseOrigin()).toBe(PLATFORM);
    expect(credentialAllowedAt(`${PLATFORM}/lws/vaults`)).toBe(true);
    expect(credentialAllowedAt("https://elsewhere.example.org/lws/vaults")).toBe(false);
    expect(app.platformOrigin).toBe(PLATFORM);
    expect(app.idOrigin).toBe(ID);
    expect(app.credential).toBeInstanceOf(SessionCredential);
  });

  it("sets the system vault hosts to [] by default and to the given ones", () => {
    setSystemVaultHosts(["old.example.test"]);
    configureLiveApp({ platformOrigin: PLATFORM, idOrigin: ID, credentialOptions: { store: false } });
    expect([...systemVaultHosts()]).toEqual([]);
    configureLiveApp({ platformOrigin: PLATFORM, idOrigin: ID, systemVaultHosts: ["veda.platform.example.test"], credentialOptions: { store: false } });
    expect([...systemVaultHosts()]).toEqual(["veda.platform.example.test"]);
  });

  it("sets localRigHosts only when given", () => {
    configureLiveApp({ platformOrigin: PLATFORM, idOrigin: ID, credentialOptions: { store: false } });
    expect([...localRigHosts()]).toEqual([]);
    configureLiveApp({ platformOrigin: PLATFORM, idOrigin: ID, localRigHosts: ["rig.example.test"], credentialOptions: { store: false } });
    expect([...localRigHosts()]).toEqual(["rig.example.test"]);
  });

  it("sets the auth seam from the credential: a signed read before sign-in is NotSignedInError, and the signed-out session is the credential's", async () => {
    const app = configureLiveApp({ platformOrigin: PLATFORM, idOrigin: ID, credentialOptions: { store: false } });
    await expect(dpopReadAuth("GET", `${PLATFORM}/lws/vaults`)).rejects.toBeInstanceOf(NotSignedInError);
    await expect(tokenManager.getSession()).rejects.toBeInstanceOf(NotSignedInError);
    expect(app.credential.session).toBeNull();
  });

  it("honours credentialOptions (a transport reaches the credential's calls)", async () => {
    const calls: string[] = [];
    const app = configureLiveApp({
      platformOrigin: PLATFORM,
      idOrigin: ID,
      credentialOptions: {
        store: false,
        dpopMintUrl: `${PLATFORM}/base/auth/session/dpop-token`,
        transport: async (url) => {
          calls.push(url);
          return { status: 401, json: async () => ({}) };
        },
      },
    });
    await expect(app.credential.authHeaders("GET", `${PLATFORM}/lws/vaults`)).rejects.toBeInstanceOf(Error);
    expect(calls).toEqual([`${PLATFORM}/base/auth/session/dpop-token`]);
  });

  it("refuses an empty origin before touching anything", () => {
    expect(() => configureLiveApp({ platformOrigin: "", idOrigin: ID })).toThrow(/platformOrigin/);
    expect(() => configureLiveApp({ platformOrigin: PLATFORM, idOrigin: "" })).toThrow(/idOrigin/);
  });
});
