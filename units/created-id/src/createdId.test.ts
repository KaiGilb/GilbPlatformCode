import { describe, expect, it } from "vitest";
import { StepCreatedNotConfirmedError, createdStepIdOf } from "./createdId";

describe("createdStepIdOf", () => {
  it("returns the minted id, including an empty one, and nothing for any other failure", () => {
    expect(createdStepIdOf(new StepCreatedNotConfirmedError("abc", "not-linked", "missing"))).toBe(
      "abc",
    );
    expect(createdStepIdOf(new StepCreatedNotConfirmedError("", "unverified", "unread"))).toBe("");
    expect(createdStepIdOf(new Error("abc"))).toBeNull();
    expect(createdStepIdOf({ createdId: "abc" })).toBeNull();
    expect(createdStepIdOf(null)).toBeNull();
  });
});
