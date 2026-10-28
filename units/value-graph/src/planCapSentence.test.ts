import { describe, expect, it } from "vitest";
import { PLAN_FIND_CAP, planCapSentence } from "./planCapSentence";

describe("planCapSentence", () => {
  it("the cap of a find is 300", () => {
    expect(PLAN_FIND_CAP).toBe(300);
  });
  it("says how many of how many are shown, with the cap given or the default one", () => {
    expect(planCapSentence(450, "values")).toBe("Showing the first 300 of 450 values at this level.");
    expect(planCapSentence(2400, "records", 2000)).toBe("Showing the first 2000 of 2400 records at this level.");
  });
});
