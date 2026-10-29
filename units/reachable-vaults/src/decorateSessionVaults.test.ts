import { describe, expect, it } from "vitest";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { decorateSessionVaults } from "./reachableVaults";

const rich = (vaultId: string, over: Partial<ReachableVault> = {}): ReachableVault => ({
  vaultId,
  entity: `${vaultId}/e/self`,
  name: "Rich name",
  parent: { entity: "https://h.example.test/base/e/up", vaultId: "https://h.example.test/base/pup" },
  parentAmbiguous: true,
  modes: ["read"],
  represents: "https://h.example.test/base/t/Person",
  isLandingVault: true,
  shortName: "ann",
  shortNameKnown: true,
  ...over,
});
const A = "https://h.example.test/base/pa";
const B = "https://h.example.test/base/pb";
const C = "https://h.example.test/base/pc";

describe("decorateSessionVaults", () => {
  it("renders exactly the session's set, in its order, whatever the answer holds", () => {
    const out = decorateSessionVaults([{ vaultId: B, modes: ["read"] }, { vaultId: A, modes: ["read"] }], [rich(A), rich(C)], false);
    expect(out.map((v) => v.vaultId)).toEqual([B, A]);
  });

  it("takes the modes from the session, never from the answer", () => {
    const out = decorateSessionVaults([{ vaultId: A, modes: ["write"] }], [rich(A, { modes: ["read"] })], false);
    expect(out[0]!.modes).toEqual(["write"]);
  });

  it("decorates a row with every field of its match", () => {
    const [v] = decorateSessionVaults([{ vaultId: A, modes: ["read", "write"] }], [rich(A)], false);
    expect(v).toEqual({
      vaultId: A,
      modes: ["read", "write"],
      entity: `${A}/e/self`,
      name: "Rich name",
      parent: { entity: "https://h.example.test/base/e/up", vaultId: "https://h.example.test/base/pup" },
      parentAmbiguous: true,
      represents: "https://h.example.test/base/t/Person",
      isLandingVault: true,
      shortName: "ann",
      shortNameKnown: true,
    });
  });

  it("leaves an undecorated row lean: null decoration, not landing, short name not known", () => {
    const [v] = decorateSessionVaults([{ vaultId: A, modes: ["read"] }], [rich(B)], false);
    expect(v).toEqual({
      vaultId: A,
      modes: ["read"],
      entity: null,
      name: null,
      parent: null,
      parentAmbiguous: false,
      represents: null,
      isLandingVault: false,
      shortName: null,
      shortNameKnown: false,
    });
  });

  it("a matched row whose short name was not read stays not known, and a missing flag is not known", () => {
    const [v] = decorateSessionVaults([{ vaultId: A, modes: ["read"] }], [rich(A, { shortName: undefined as unknown as null, shortNameKnown: undefined as unknown as boolean })], false);
    expect([v!.shortName, v!.shortNameKnown]).toEqual([null, false]);
  });

  it("the landing flag is the match's own, and only that row carries it", () => {
    const out = decorateSessionVaults([{ vaultId: A, modes: ["read"] }, { vaultId: B, modes: ["read"] }], [rich(A, { isLandingVault: false }), rich(B, { isLandingVault: true })], false);
    expect(out.map((v) => v.isLandingVault)).toEqual([false, true]);
  });

  it("an empty session set with a non-empty answer that did not fail uses the answer", () => {
    const list = [rich(A), rich(B)];
    expect(decorateSessionVaults([], list, false)).toBe(list);
  });

  it("an empty session set with an answer that is marked failed gives an empty list", () => {
    expect(decorateSessionVaults([], [rich(A)], true)).toEqual([]);
  });

  it("an empty session set and an empty answer give an empty list", () => {
    expect(decorateSessionVaults([], [], false)).toEqual([]);
  });

  it("a non-empty session set is preferred over the answer's own set, also when the answer has more", () => {
    const out = decorateSessionVaults([{ vaultId: A, modes: ["read"] }], [rich(A), rich(B), rich(C)], false);
    expect(out.map((v) => v.vaultId)).toEqual([A]);
  });

  it("the same vault twice in the session is two rows", () => {
    expect(decorateSessionVaults([{ vaultId: A, modes: ["read"] }, { vaultId: A, modes: ["write"] }], [rich(A)], false).map((v) => v.modes)).toEqual([["read"], ["write"]]);
  });

  it("the last match wins when the answer names a vault twice", () => {
    const [v] = decorateSessionVaults([{ vaultId: A, modes: ["read"] }], [rich(A, { name: "first" }), rich(A, { name: "second" })], false);
    expect(v!.name).toBe("second");
  });

  it("keeps the modes array the session gave, as the app did", () => {
    const modes: ("read" | "write")[] = ["read"];
    const [v] = decorateSessionVaults([{ vaultId: A, modes }], [], false);
    expect(v!.modes).toBe(modes);
  });
});
