import { describe, expect, it } from "vitest";
import { confirmStepRemoval } from "./stepRemoval";

describe("confirmStepRemoval", () => {
  it("confirms one id gone and every other id still there", () => {
    expect(
      confirmStepRemoval({ beforeIds: ["a", "b", "c"], afterIds: ["c", "a"], deletedId: "b" }),
    ).toEqual({ confirmed: true });
  });

  it("names every failed arm, and does not stop at the first", () => {
    expect(
      confirmStepRemoval({ beforeIds: ["a", "b", "c"], afterIds: ["a"], deletedId: "b" }),
    ).toEqual({
      confirmed: false,
      failedArms: ["count-not-exactly-one", "sibling-did-not-survive"],
    });
  });

  it("an extra id fails the count, not the sibling arm, when every earlier id remains", () => {
    expect(
      confirmStepRemoval({ beforeIds: ["a", "b"], afterIds: ["a", "z"], deletedId: "b" }),
    ).toEqual({
      confirmed: false,
      failedArms: ["count-not-exactly-one"],
    });
  });

  it("refuses a click for an id the before list does not contain", () => {
    expect(
      confirmStepRemoval({ beforeIds: ["a"], afterIds: [], deletedId: "missing" }),
    ).toEqual({
      confirmed: false,
      failedArms: ["not-present-before", "sibling-did-not-survive"],
    });
  });

  it("treats a duplicate id as still present after one copy disappears", () => {
    expect(
      confirmStepRemoval({ beforeIds: ["a", "a"], afterIds: ["a"], deletedId: "a" }),
    ).toEqual({
      confirmed: false,
      failedArms: ["deleted-id-still-served"],
    });
  });

  it("does not trim or ignore case", () => {
    expect(
      confirmStepRemoval({ beforeIds: ["A", " b"], afterIds: ["A", " b"], deletedId: "a" }),
    ).toEqual({
      confirmed: false,
      failedArms: ["not-present-before", "count-not-exactly-one"],
    });
    expect(
      confirmStepRemoval({ beforeIds: ["a", " b"], afterIds: ["a"], deletedId: "b" }),
    ).toEqual({
      confirmed: false,
      failedArms: ["not-present-before", "sibling-did-not-survive"],
    });
  });

  it("accepts an empty id when that empty id was the one served", () => {
    expect(
      confirmStepRemoval({ beforeIds: ["", "a"], afterIds: ["a"], deletedId: "" }),
    ).toEqual({ confirmed: true });
  });

  it("does not change the lists it was given", () => {
    const beforeIds = ["a", "b"];
    const afterIds = ["a"];
    confirmStepRemoval({ beforeIds, afterIds, deletedId: "b" });
    expect(beforeIds).toEqual(["a", "b"]);
    expect(afterIds).toEqual(["a"]);
  });
});
