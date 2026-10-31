// The shell the held card reads: the write guard of the vault on screen, the read vault, and the session's short web id. The words of the guard are
// GilbApp's (AppShell.tsx:503-516); the vault chosen is `selectedVault ?? landingVault` (AppShell.tsx:471-472).
import { useContext } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { StakeholderCardPlatformContext } from "./platform";
import type { PlatformShell } from "./shell";
import { readVaultOf, writeGuardOf } from "./shell";
import { ANN, HOST, P, P_ENTITY, createWorld, type World } from "../test/world";
import { fakeSession } from "../test/fakeSession";
import { mountInProvider } from "../test/harness";

const row = (over: Partial<ReachableVault> = {}): ReachableVault => ({
  vaultId: P,
  entity: P_ENTITY,
  name: "Ann",
  parent: null,
  parentAmbiguous: false,
  modes: ["read", "write"],
  represents: null,
  isLandingVault: true,
  ...over,
});
const OTHER = `${HOST}/base/pother`;

describe("writeGuardOf", () => {
  test("a vault the holder may write: allowed, with no reason", () => {
    expect(writeGuardOf(row(), false)).toEqual({ allowed: true, reason: null });
  });
  test("a vault with the write mode only is writable too: the guard is the write mode", () => {
    expect(writeGuardOf(row({ modes: ["write"] }), false)).toEqual({ allowed: true, reason: null });
  });
  test("a vault held read-only: refused, with the words that name what the holder holds and the vault", () => {
    expect(writeGuardOf(row({ modes: ["read"] }), false)).toEqual({ allowed: false, reason: "You hold read only on Ann, so nothing can be saved here." });
  });
  test("a vault with no modes: refused, with the words for no access", () => {
    expect(writeGuardOf(row({ modes: [] }), false)).toEqual({ allowed: false, reason: "You hold no access modes on Ann, so nothing can be saved here." });
  });
  test("the vault is named by its label, not its address", () => {
    expect(writeGuardOf(row({ modes: ["read"], name: "Kid vault" }), false).reason).toContain("on Kid vault,");
  });
  test("no vault, the vault set still being found: refused, and the reason says it is being checked", () => {
    expect(writeGuardOf(null, true)).toEqual({ allowed: false, reason: "Checking which vaults you can reach…" });
  });
  test("no vault, the set found: refused, and the reason says there is nowhere to save", () => {
    expect(writeGuardOf(null, false)).toEqual({ allowed: false, reason: "No vault is open, so there is nowhere to save. Choose a vault first." });
  });
  test("the reason is null exactly when the guard allows", () => {
    for (const [v, p] of [[row(), false], [row({ modes: ["read"] }), false], [null, true], [null, false]] as const) {
      const g = writeGuardOf(v, p);
      expect(g.reason === null).toBe(g.allowed);
    }
  });
});

describe("readVaultOf", () => {
  const landing = row();
  const other = row({ vaultId: OTHER, entity: null, name: "Other", isLandingVault: false, modes: ["read"] });
  test("the vault on screen when the set holds it", () => {
    expect(readVaultOf([landing, other], OTHER)).toBe(other);
  });
  test("else the landing vault, whether none is on screen or the one on screen is not held", () => {
    expect(readVaultOf([other, landing], null)).toBe(landing);
    expect(readVaultOf([other, landing], "https://holder.example.test/base/pnone")).toBe(landing);
  });
  test("else none: never the first row", () => {
    expect(readVaultOf([other], null)).toBeNull();
    expect(readVaultOf([], OTHER)).toBeNull();
  });
});

describe("the shell inside the provider", () => {
  let world: World;
  beforeEach(async () => {
    world = await createWorld({ sessionVaults: [{ vaultId: P, modes: ["read", "write"] }, { vaultId: OTHER, modes: ["read"] }] });
    vi.stubGlobal("fetch", world.fetch);
  });

  function shellsOf(into: PlatformShell[]) {
    return function Shell() {
      into.push(useContext(StakeholderCardPlatformContext)!.useShell());
      return null;
    };
  }
  const last = (a: PlatformShell[]) => a[a.length - 1]!;

  test("the guard is the guard of the vault on screen: writable for the landing vault, read-only for a vault held read-only", async () => {
    const seen: PlatformShell[] = [];
    const Shell = shellsOf(seen);
    const view = mountInProvider(world, <Shell />, { viewedVaultId: P });
    await waitFor(() => expect(last(seen).writeGuard).toEqual({ allowed: true, reason: null }));
    view.rerenderWith(<Shell />, { viewedVaultId: OTHER });
    expect(last(seen).writeGuard.allowed).toBe(false);
    expect(last(seen).writeGuard.reason).toBe("You hold read only on pother, so nothing can be saved here.");
  });

  test("with no vault on screen the landing vault's guard stands", async () => {
    const seen: PlatformShell[] = [];
    const Shell = shellsOf(seen);
    mountInProvider(world, <Shell />);
    await waitFor(() => expect(last(seen).writeGuard).toEqual({ allowed: true, reason: null }));
  });

  test("a holder whose session names no vault: 'checking' while the platform's list is out, then 'nowhere to save' once it has answered with none", async () => {
    const none = await createWorld({ sessionVaults: [] });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (new URL(url).pathname === "/lws/vaults") {
        await gate;
        return Response.json({ total: 0, vaults: [] });
      }
      return none.fetch(input, init);
    });
    const seen: PlatformShell[] = [];
    const Shell = shellsOf(seen);
    mountInProvider(none, <Shell />);
    await waitFor(() => expect(last(seen).writeGuard).toEqual({ allowed: false, reason: "Checking which vaults you can reach…" }));
    expect(last(seen).session).toBeDefined();
    release();
    await waitFor(() => expect(last(seen).writeGuard).toEqual({ allowed: false, reason: "No vault is open, so there is nowhere to save. Choose a vault first." }));
  });

  test("the read vault is in the content scope, with its id", async () => {
    const seen: PlatformShell[] = [];
    const Shell = shellsOf(seen);
    mountInProvider(world, <Shell />, { viewedVaultId: OTHER });
    await waitFor(() => expect(last(seen).contentScope).toMatchObject({ readVaultId: OTHER, reach: null }));
    expect((last(seen).contentScope as { readVault: ReachableVault }).readVault.vaultId).toBe(OTHER);
  });

  test("the session carries the vault's short web id when the sign-in has one, and leaves it out when it has none", async () => {
    const seen: PlatformShell[] = [];
    const Shell = shellsOf(seen);
    const withShort = fakeSession({ principal: ANN, vault: { entity: P_ENTITY, id: "annvault", name: "Ann", shortWebId: "ann" }, vaults: [{ vaultId: P, modes: ["read", "write"] }] }).session;
    mountInProvider(world, <Shell />, { session: withShort });
    await waitFor(() => expect(last(seen).session).toEqual({ principal: ANN, vault: { entity: P_ENTITY, shortWebId: "ann" } }));
  });
});
