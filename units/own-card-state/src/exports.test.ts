// What the unit exports, and nothing else. A name added or dropped is a decision, not an accident.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the public surface", () => {
  it("exports these values and no other", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["OWN_CARD_WORDS", "OwnCardBand", "isOwnCardIn", "isOwnSeat", "mayBeOwnCard", "myNetProfileUrl", "ownCardCandidacy", "ownCardRowWords", "resetMyNetProfileUrl", "setMyNetProfileUrl", "useOwnCard"].sort(),
    );
  });
  it("arities: the decision takes the record, its vault and the vault list", () => {
    expect(unit.useOwnCard.length).toBe(3);
    expect(unit.isOwnSeat.length).toBe(2);
    expect(unit.ownCardCandidacy.length).toBe(3);
    expect(unit.mayBeOwnCard.length).toBe(1);
  });
  it("does not export the app's host literal or the finding (they are the host's setting and plan-self-source's)", () => {
    const names = Object.keys(unit);
    expect(names).not.toContain("MYNET_PROFILE_URL");
    expect(names).not.toContain("ownCardFindingQuery");
    expect(names).not.toContain("ownCardDeps");
  });
});
