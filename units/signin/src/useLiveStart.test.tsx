// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useLiveStart } from "./useLiveStart";
import type { LiveStartCredential } from "./liveStart";
import type { AppVaultConfig, AppVaultResult, AppVaultService } from "./appVault";
import type { SessionCredential } from "./session";
import type { SignInApp } from "./types";
import type { ListedVault } from "./vaults";

afterEach(cleanup);

// Compile-time: a real SessionCredential is what the hook takes.
export const takesSessionCredential = (c: SessionCredential): LiveStartCredential => c;

const CFG: AppVaultConfig = { represents: "https://types.example.test/base/t/Thing", nameSuffix: "things", storageKey: "app" };
const APP: SignInApp = { id: "app", productName: "Things", title: "Things", origin: "https://id.example.test", returnTo: () => "https://app.example.test" };
const landing: ListedVault = { vaultId: "https://ann.example.test/vault", modes: ["read", "write"], isLandingVault: true };
const own: ListedVault = { vaultId: "https://annthings.example.test/vault", modes: ["read", "write"], isLandingVault: false };
const RESULT: AppVaultResult = { vault: own, vaults: [landing, own], created: false };

function setup(restored: string | null, opens: Array<() => Promise<AppVaultResult>>) {
  const credential: LiveStartCredential = {
    restore: async () => (restored ? { principal: restored } : null),
    getSession: async () => ({ principal: "ann" }),
    authHeaders: async () => ({ Authorization: "DPoP t", DPoP: "p" }),
    invalidate: vi.fn(async () => undefined),
  };
  let i = 0;
  const calls: string[] = [];
  const service: AppVaultService = {
    open: (principal) => {
      calls.push(principal);
      return opens[Math.min(i++, opens.length - 1)]!();
    },
    reset: vi.fn(),
  };
  return { credential, service, calls };
}

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

describe("useLiveStart", () => {
  it("a restored sign-in goes opening, then ready, and StrictMode opens once", async () => {
    const r = setup("ann", [async () => RESULT]);
    const { result } = renderHook(() => useLiveStart({ credential: r.credential, idOrigin: "https://id.example.test", app: APP, vaultConfig: CFG, service: r.service }), { wrapper: strict });
    expect(result.current.stage).toBe("opening");
    await waitFor(() => expect(result.current.stage).toBe("ready"));
    expect(result.current.vault).toBe(own);
    expect(result.current.actor).toBe(landing.vaultId);
    expect(new Set(r.calls).size).toBe(1);
  });

  it("no sign-in shows the card; the card's onSignedIn moves on to ready; sign-out shows the card again", async () => {
    const r = setup(null, [async () => RESULT]);
    const { result } = renderHook(() => useLiveStart({ credential: r.credential, idOrigin: "https://id.example.test", app: APP, vaultConfig: CFG, service: r.service }));
    await waitFor(() => expect(result.current.stage).toBe("signin"));
    expect(result.current.signInProps.app).toBe(APP);
    expect(typeof result.current.signInProps.auth.verifyCode).toBe("function");
    act(() => result.current.signInProps.onSignedIn());
    await waitFor(() => expect(result.current.stage).toBe("ready"));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.stage).toBe("signin");
    expect(r.credential.invalidate).toHaveBeenCalledWith(true);
    expect(result.current.vault).toBeNull();
  });

  it("an error shows its sentence; retry opens again", async () => {
    const r = setup("ann", [() => Promise.reject(new Error("Try again soon.")), async () => RESULT]);
    const { result } = renderHook(() => useLiveStart({ credential: r.credential, idOrigin: "https://id.example.test", app: APP, vaultConfig: CFG, service: r.service }));
    await waitFor(() => expect(result.current.stage).toBe("error"));
    expect(result.current.error).toBe("Try again soon.");
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.stage).toBe("ready"));
    expect(result.current.error).toBeNull();
  });
});
