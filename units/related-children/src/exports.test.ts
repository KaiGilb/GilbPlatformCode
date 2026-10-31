// What the unit exports, and nothing else.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the public surface", () => {
  it("exports these values and no other", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["MEMBER_OF_ATTR", "MEMBER_OF_FIND_PAGE", "MEMBER_OF_HYDRATE_CAP", "RelatedChildren", "cachedRecordsPointingAt", "findAllMemberOfIds", "loadMemberOfChildren", "useMemberOfChildren"].sort(),
    );
  });
  it("the ID cap is private; the page and the hydrate cap are public", () => {
    expect(Object.keys(unit)).not.toContain("MEMBER_OF_ID_CAP");
    expect(unit.MEMBER_OF_HYDRATE_CAP).toBe(80);
  });
  it("arities: the origin is not a parameter (it is the parent's own), the client is optional", () => {
    expect(unit.findAllMemberOfIds.length).toBe(1);
    expect(unit.loadMemberOfChildren.length).toBe(2);
    expect(unit.cachedRecordsPointingAt.length).toBe(2);
  });
});
