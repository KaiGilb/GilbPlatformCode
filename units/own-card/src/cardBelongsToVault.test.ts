// Ported from `gilb-stakeholders` `test/ownCard/cardBelongsToVault.test.ts` at 27fe0cef: 5 of its 5 tests (the others call symbols that are not in this unit).
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { cardBelongsToVault } from "./ownCard";
import { resetSystemHostLabels, setSystemHostLabels } from "./systemHostLabels";


const SEAT = { vaultRoot: "https://kaimetester.platform.example.test/base", entity: "https://id.platform.example.test/base/e/seat-1", apiHost: "platform.example.test" };

describe("cardBelongsToVault", () => {
  it("a card on the seat's own host belongs", () => {
    expect(cardBelongsToVault("https://kaimetester.platform.example.test/base/e/mnb-profile-1", SEAT)).toBe(true);
  });
  it("a card minted on a system host of the seat's apex (id, veda, connect …) or on the API host belongs", () => {
    expect(cardBelongsToVault("https://id.platform.example.test/base/e/mnb-profile-1", SEAT)).toBe(true);
    expect(cardBelongsToVault("https://connect.platform.example.test/base/e/x", SEAT)).toBe(true);
    expect(cardBelongsToVault("https://platform.example.test/base/e/x", SEAT)).toBe(true);
  });
  it("a card on ANOTHER person-vault host is foreign (helip vs kaimetester)", () => {
    expect(cardBelongsToVault("https://helip.platform.example.test/base/e/mnb-profile-1", SEAT)).toBe(false);
    expect(cardBelongsToVault("https://group.example/base/e/mnb-profile-1", { vaultRoot: "https://kai.example/base" })).toBe(false);
  });
  it("shapes that say nothing pass through: no @id, a short form, no seat host", () => {
    expect(cardBelongsToVault("", SEAT)).toBe(true);
    expect(cardBelongsToVault("base:e/mnb-profile-1", SEAT)).toBe(true);
    expect(cardBelongsToVault("https://helip.platform.example.test/base/e/x", {})).toBe(true);
  });
  it("with no vault root, the seat host is the vault entity's host", () => {
    expect(cardBelongsToVault("https://helip.platform.example.test/base/e/x", { entity: "https://kaimetester.platform.example.test/base/e/v" })).toBe(false);
  });
});

// The platform's own host labels are a setting; the ported tests ran against these.
beforeEach(() => setSystemHostLabels(["id", "veda", "geo", "kaizen", "www", "skills", "connect", "gilb"]));
afterEach(() => resetSystemHostLabels());
