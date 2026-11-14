import { describe, expect, it, vi } from "vitest";
import { createLiveStart, sentenceOfStartError, vaultShortName, type LiveStartCredential, type LiveStartState } from "./liveStart";
import type { AppVaultConfig, AppVaultResult, AppVaultService } from "./appVault";
import type { Transport } from "./transport";
import type { ListedVault } from "./vaults";

const CFG: AppVaultConfig = { represents: "https://types.example.test/base/t/Thing", nameSuffix: "things", storageKey: "app" };
const landing: ListedVault = { vaultId: "https://ann.example.test/vault", name: "ann", modes: ["read", "write"], isLandingVault: true };
const own: ListedVault = { vaultId: "https://annthings.example.test/vault", name: "annthings", modes: ["read", "write"], isLandingVault: false, represents: CFG.represents };
const RESULT: AppVaultResult = { vault: own, vaults: [landing, own], created: false };

/** A promise the test settles by hand. */
function later<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function credential(restored: string | null, over: Partial<LiveStartCredential> = {}): LiveStartCredential & { invalidate: ReturnType<typeof vi.fn> } {
  return {
    restore: async () => (restored ? { principal: restored } : null),
    getSession: async () => ({ principal: "https://ann.example.test/vault" }),
    authHeaders: async () => ({ Authorization: "DPoP t", DPoP: "p" }),
    invalidate: vi.fn(async () => undefined),
    ...over,
  } as LiveStartCredential & { invalidate: ReturnType<typeof vi.fn> };
}

function fakeService(opens: Array<Promise<AppVaultResult> | (() => Promise<AppVaultResult>)>): AppVaultService & { calls: string[]; reset: ReturnType<typeof vi.fn> } {
  const calls: string[] = [];
  let i = 0;
  return {
    calls,
    open: (principal, onStep) => {
      calls.push(principal);
      onStep?.("listing");
      const next = opens[Math.min(i++, opens.length - 1)]!;
      return typeof next === "function" ? next() : next;
    },
    reset: vi.fn(),
  };
}

function watch(ctl: ReturnType<typeof createLiveStart>) {
  const seen: LiveStartState[] = [];
  ctl.subscribe(() => seen.push(ctl.getState()));
  return seen;
}

describe("createLiveStart stages", () => {
  it("a restored sign-in goes opening, then ready with the vault, the actor and the list", async () => {
    const open = later<AppVaultResult>();
    const svc = fakeService([open.promise]);
    const ctl = createLiveStart({ credential: credential("https://ann.example.test/vault"), idOrigin: "https://id.example.test", vaultConfig: CFG, service: svc });
    expect(ctl.getState().stage).toBe("opening");
    ctl.start();
    await tick();
    expect(ctl.getState()).toMatchObject({ stage: "opening", step: "listing", principal: "https://ann.example.test/vault", vault: null });
    open.resolve(RESULT);
    await tick();
    const s = ctl.getState();
    expect(s.stage).toBe("ready");
    expect(s.vault).toBe(own);
    expect(s.actor).toBe(landing.vaultId);
    expect(s.vaults).toEqual([landing, own]);
    expect(s.error).toBeNull();
  });

  it("the actor is the app vault when no vault is marked as the landing vault", async () => {
    const svc = fakeService([Promise.resolve({ vault: own, vaults: [own], created: true })]);
    const ctl = createLiveStart({ credential: credential("p"), idOrigin: "https://id.example.test", vaultConfig: CFG, service: svc });
    ctl.start();
    await tick();
    expect(ctl.getState().actor).toBe(own.vaultId);
  });

  it("nothing to restore shows the sign-in card", async () => {
    const ctl = createLiveStart({ credential: credential(null), idOrigin: "https://id.example.test", vaultConfig: CFG, service: fakeService([]) });
    ctl.start();
    await tick();
    expect(ctl.getState().stage).toBe("signin");
  });

  it("a restore that throws shows the sign-in card", async () => {
    const ctl = createLiveStart({ credential: credential(null, { restore: async () => Promise.reject(new Error("store blocked")) }), idOrigin: "https://id.example.test", vaultConfig: CFG, service: fakeService([]) });
    ctl.start();
    await tick();
    expect(ctl.getState().stage).toBe("signin");
  });

  it("signing in on the card moves signin to opening to ready", async () => {
    const svc = fakeService([Promise.resolve(RESULT)]);
    const ctl = createLiveStart({ credential: credential(null), idOrigin: "https://id.example.test", vaultConfig: CFG, service: svc });
    const seen = watch(ctl);
    ctl.start();
    await tick();
    ctl.signedIn();
    await tick();
    expect(seen.map((s) => s.stage)).toEqual(["signin", "opening", "ready"]);
    expect(svc.calls).toEqual(["https://ann.example.test/vault"]);
  });

  it("an open that fails shows the error sentence, with the platform's own words when it has them", async () => {
    const svc = fakeService([() => Promise.reject(Object.assign(new Error("raw"), { platformMessage: "  The platform is busy.  " }))]);
    const ctl = createLiveStart({ credential: credential("p"), idOrigin: "https://id.example.test", vaultConfig: CFG, service: svc });
    ctl.start();
    await tick();
    expect(ctl.getState()).toMatchObject({ stage: "error", error: "The platform is busy.", vault: null, principal: "p" });
  });

  it("retry after an error opens again for the same person and can end ready", async () => {
    const svc = fakeService([() => Promise.reject(new Error("Try later.")), Promise.resolve(RESULT)]);
    const ctl = createLiveStart({ credential: credential("p"), idOrigin: "https://id.example.test", vaultConfig: CFG, service: svc });
    const seen = watch(ctl);
    ctl.start();
    await tick();
    expect(ctl.getState().stage).toBe("error");
    ctl.retry();
    expect(ctl.getState()).toMatchObject({ stage: "opening", error: null });
    await tick();
    expect(ctl.getState().stage).toBe("ready");
    expect(svc.calls).toEqual(["p", "p"]);
    expect(seen.map((s) => s.stage)).toEqual(["opening", "error", "opening", "ready"]);
  });

  it("a second failure after retry is an error again", async () => {
    const svc = fakeService([() => Promise.reject(new Error("one")), () => Promise.reject(new Error("two"))]);
    const ctl = createLiveStart({ credential: credential("p"), idOrigin: "https://id.example.test", vaultConfig: CFG, service: svc });
    ctl.start();
    await tick();
    ctl.retry();
    await tick();
    expect(ctl.getState()).toMatchObject({ stage: "error", error: "two" });
  });

  it("retry does nothing outside the error stage", async () => {
    const svc = fakeService([Promise.resolve(RESULT)]);
    const ctl = createLiveStart({ credential: credential("p"), idOrigin: "https://id.example.test", vaultConfig: CFG, service: svc });
    ctl.start();
    await tick();
    ctl.retry();
    expect(ctl.getState().stage).toBe("ready");
    expect(svc.calls).toEqual(["p"]);
  });

  it("a failed session read after sign-in is an error, and retry reads it again", async () => {
    let n = 0;
    const cred = credential(null, { getSession: async () => (n++ === 0 ? Promise.reject(new Error("No session yet.")) : { principal: "p" }) });
    const svc = fakeService([Promise.resolve(RESULT)]);
    const ctl = createLiveStart({ credential: cred, idOrigin: "https://id.example.test", vaultConfig: CFG, service: svc });
    ctl.start();
    await tick();
    ctl.signedIn();
    await tick();
    expect(ctl.getState()).toMatchObject({ stage: "error", error: "No session yet." });
    ctl.retry();
    await tick();
    expect(ctl.getState().stage).toBe("ready");
  });

  it("sign-out from ready drops the key, forgets the service and shows the card", async () => {
    const cred = credential("p");
    const svc = fakeService([Promise.resolve(RESULT)]);
    const ctl = createLiveStart({ credential: cred, idOrigin: "https://id.example.test", vaultConfig: CFG, service: svc });
    ctl.start();
    await tick();
    await ctl.signOut();
    expect(cred.invalidate).toHaveBeenCalledWith(true);
    expect(svc.reset).toHaveBeenCalledTimes(1);
    expect(ctl.getState()).toMatchObject({ stage: "signin", vault: null, principal: null, actor: null, vaults: [] });
  });

  it("sign-out from the error stage works too", async () => {
    const cred = credential("p");
    const ctl = createLiveStart({ credential: cred, idOrigin: "https://id.example.test", vaultConfig: CFG, service: fakeService([() => Promise.reject(new Error("x"))]) });
    ctl.start();
    await tick();
    await ctl.signOut();
    expect(ctl.getState().stage).toBe("signin");
  });

  it("an answer that arrives after sign-out is ignored", async () => {
    const open = later<AppVaultResult>();
    const ctl = createLiveStart({ credential: credential("p"), idOrigin: "https://id.example.test", vaultConfig: CFG, service: fakeService([open.promise]) });
    ctl.start();
    await tick();
    await ctl.signOut();
    open.resolve(RESULT);
    await tick();
    expect(ctl.getState().stage).toBe("signin");
  });

  it("signing in again after sign-out opens for the new person", async () => {
    let who = "p1";
    const cred = credential("p1", { getSession: async () => ({ principal: who }) });
    const svc = fakeService([Promise.resolve(RESULT)]);
    const ctl = createLiveStart({ credential: cred, idOrigin: "https://id.example.test", vaultConfig: CFG, service: svc });
    ctl.start();
    await tick();
    await ctl.signOut();
    who = "p2";
    ctl.signedIn();
    await tick();
    expect(svc.calls).toEqual(["p1", "p2"]);
    expect(ctl.getState().stage).toBe("ready");
  });

  it("after dispose nothing changes, and start can run again", async () => {
    const open = later<AppVaultResult>();
    const ctl = createLiveStart({ credential: credential("p"), idOrigin: "https://id.example.test", vaultConfig: CFG, service: fakeService([open.promise]) });
    ctl.start();
    await tick();
    ctl.dispose();
    open.resolve(RESULT);
    await tick();
    expect(ctl.getState().stage).toBe("opening");
    ctl.start();
    await tick();
    expect(ctl.getState().stage).toBe("ready");
  });

  it("the unsubscribe function stops the calls to a listener", async () => {
    const ctl = createLiveStart({ credential: credential(null), idOrigin: "https://id.example.test", vaultConfig: CFG, service: fakeService([]) });
    const fn = vi.fn();
    const off = ctl.subscribe(fn);
    off();
    ctl.start();
    await tick();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("createLiveStart on the real vault service", () => {
  it("lists the vaults with the credential's proof and finds the own vault", async () => {
    const calls: string[] = [];
    const transport: Transport = async (url) => {
      calls.push(url);
      return {
        status: 200,
        json: async () => ({
          vaults: [
            { vaultId: landing.vaultId, name: "ann", modes: ["read", "write"], isLandingVault: true },
            { vaultId: own.vaultId, name: "annthings", modes: ["read", "write"], isLandingVault: false, represents: CFG.represents },
          ],
        }),
      };
    };
    const ctl = createLiveStart({ credential: credential("p"), idOrigin: "https://id.example.test", vaultConfig: CFG, transport, store: null });
    ctl.start();
    await tick();
    await tick();
    expect(calls[0]).toBe("https://id.example.test/lws/vaults");
    expect(ctl.getState()).toMatchObject({ stage: "ready" });
    expect(ctl.getState().vault?.vaultId).toBe(own.vaultId);
  });

  it("a refused list is an error sentence", async () => {
    const transport: Transport = async () => ({ status: 500, json: async () => ({ message: "The vault list is down." }) });
    const ctl = createLiveStart({ credential: credential("p"), idOrigin: "https://id.example.test", vaultConfig: CFG, transport, store: null });
    ctl.start();
    await tick();
    await tick();
    expect(ctl.getState().stage).toBe("error");
    expect(ctl.getState().error).toBeTruthy();
  });
});

describe("vaultShortName", () => {
  it("prefers the short name, then the name, then the first label of the host", () => {
    expect(vaultShortName({ vaultId: "https://x.example.test/vault", shortName: " ann ", name: "Ann" })).toBe("ann");
    expect(vaultShortName({ vaultId: "https://x.example.test/vault", name: "Ann" })).toBe("Ann");
    expect(vaultShortName({ vaultId: "https://annthings.example.test/vault" })).toBe("annthings");
    expect(vaultShortName({ vaultId: "not a url" })).toBe("not a url");
  });
});

describe("sentenceOfStartError", () => {
  it("uses the platform's words, then the message, then a plain fallback", () => {
    expect(sentenceOfStartError({ platformMessage: " Busy. " })).toBe("Busy.");
    expect(sentenceOfStartError({ platformSentence: "Refused." })).toBe("Refused.");
    expect(sentenceOfStartError(new Error("  Plain.  "))).toBe("Plain.");
    expect(sentenceOfStartError(new Error(""))).toBe("Something went wrong. Try again.");
    expect(sentenceOfStartError("odd")).toBe("Something went wrong. Try again.");
    expect(sentenceOfStartError(null)).toBe("Something went wrong. Try again.");
  });
});
