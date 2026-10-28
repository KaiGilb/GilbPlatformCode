// New tests: the one setting this unit adds, and the unit's export list.
import { afterEach, describe, expect, it } from "vitest";
import * as unit from "./index";
import { cardBelongsToVault } from "./ownCard";
import { resetSystemHostLabels, setSystemHostLabels, systemHostLabels } from "./systemHostLabels";

afterEach(() => resetSystemHostLabels());

describe("the setting", () => {
  it("throws, naming the setter, until it is set", () => {
    expect(() => systemHostLabels()).toThrow("own-card: call setSystemHostLabels([...labels]) once at start-up");
  });
  it("keeps the labels trimmed and lower-cased, each once", () => {
    setSystemHostLabels([" ID ", "veda", "id"]);
    expect([...systemHostLabels()].sort()).toEqual(["id", "veda"]);
  });
  it("an empty list is allowed: no system host", () => {
    setSystemHostLabels([]);
    expect(systemHostLabels().size).toBe(0);
  });
  it.each([[""], ["  "], ["a.b"], ["a b"], ["a/b"], ["a:b"]])("%j is not a single host label and is refused, leaving the earlier list", (bad) => {
    setSystemHostLabels(["id"]);
    expect(() => setSystemHostLabels(["ok", bad])).toThrow(/own-card: setSystemHostLabels: not a single host label/);
    expect([...systemHostLabels()]).toEqual(["id"]);
  });
  it("a label that is not a string is refused", () => {
    expect(() => setSystemHostLabels([7 as unknown as string])).toThrow("every label must be a string");
  });
  it("reset forgets the labels", () => {
    setSystemHostLabels(["id"]);
    resetSystemHostLabels();
    expect(() => systemHostLabels()).toThrow();
  });
});

describe("what cardBelongsToVault reads from it", () => {
  const seat = { vaultRoot: "https://alice.platform.example.test/base" };
  it("a card on a system host of the seat's apex belongs only when its first label was set", () => {
    setSystemHostLabels(["id"]);
    expect(cardBelongsToVault("https://id.platform.example.test/base/e/x", seat)).toBe(true);
    expect(cardBelongsToVault("https://ID.platform.example.test/base/e/x", seat)).toBe(true);
    expect(cardBelongsToVault("https://veda.platform.example.test/base/e/x", seat)).toBe(false);
    setSystemHostLabels([]);
    expect(cardBelongsToVault("https://id.platform.example.test/base/e/x", seat)).toBe(false);
  });
  it("is asked only when no earlier rule decided: the same host, the API host and a shape that says nothing need no setting", () => {
    expect(cardBelongsToVault("https://alice.platform.example.test/base/e/x", seat)).toBe(true);
    expect(cardBelongsToVault("https://api.example.test/e/x", { ...seat, apiHost: "api.example.test" })).toBe(true);
    expect(cardBelongsToVault("short-form", seat)).toBe(true);
  });
  it("a host that needs the setting throws before it is set", () => {
    expect(() => cardBelongsToVault("https://other.platform.example.test/base/e/x", seat)).toThrow(/setSystemHostLabels/);
  });
  it("a host on another apex is foreign without reading the setting", () => {
    expect(cardBelongsToVault("https://id.elsewhere.other.test/base/e/x", seat)).toBe(false);
  });
});

describe("the unit's export list", () => {
  it("is exactly the symbols the Plan card's own-card check reaches, and the setting", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["OWN_CARD_SLUG_PREFIX", "cardBelongsToVault", "cardIdOf", "findOwnCard", "isSeatOwnerCard", "ownCardIds", "resetSystemHostLabels", "setSystemHostLabels", "siblingVaultRoot", "systemHostLabels"].sort(),
    );
  });
  it("OWN_CARD_SLUG_PREFIX is mnb-profile", () => {
    expect(unit.OWN_CARD_SLUG_PREFIX).toBe("mnb-profile");
  });
});
