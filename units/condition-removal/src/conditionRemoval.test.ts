import { describe, expect, it } from "vitest";
import {
  canonicaliseCondition,
  confirmConditionRemoval,
  removeConditionAt,
} from "./conditionRemoval";

const a = { text: "alpha", op: "manual" };
const b = { text: "beta", op: "manual" };
const c = { text: "gamma", op: "manual" };

describe("canonicaliseCondition", () => {
  it("ignores key order and folds one carrier spelling", () => {
    expect(canonicaliseCondition({ text: "x", unitTag: "T" })).toBe(
      canonicaliseCondition({ unitTag: "T", text: "x" }),
    );
    expect(canonicaliseCondition({ unitTag: "T" })).toBe(
      canonicaliseCondition({ "a:unitTag": "T" }),
    );
    expect(canonicaliseCondition({ tagScope: "KaiZen" })).toBe(
      canonicaliseCondition({ "a:tagScope": "KaiZen" }),
    );
  });

  it("does not fold a title, and does not fold a nested carrier", () => {
    expect(canonicaliseCondition({ title: "T" })).not.toBe(
      canonicaliseCondition({ "a:title": "T" }),
    );
    expect(canonicaliseCondition({ nested: { "a:unitTag": "T" } })).not.toBe(
      canonicaliseCondition({ nested: { unitTag: "T" } }),
    );
  });

  it("keeps both spellings of one carrier unequal to either spelling alone", () => {
    const both = canonicaliseCondition({ unitTag: "A", "a:unitTag": "B" });
    expect(both).not.toBe(canonicaliseCondition({ unitTag: "A" }));
    expect(both).not.toBe(canonicaliseCondition({ "a:unitTag": "B" }));
    expect(both).not.toBe(canonicaliseCondition({ unitTag: "B" }));
  });

  it("treats a stored undefined as present, and a missing key as absent", () => {
    expect(canonicaliseCondition({ text: undefined })).not.toBe(canonicaliseCondition({}));
  });
});

describe("removeConditionAt", () => {
  it("drops one member, flips a framed carrier, and keeps a bare tag", () => {
    const input = [
      { text: "keep", unitTag: "T", tagScope: "KaiZen", tag: "bare" },
      { text: "drop" },
    ];
    expect(removeConditionAt(input, 1)).toEqual([
      { text: "keep", "a:unitTag": "T", "a:tagScope": "KaiZen", tag: "bare" },
    ]);
    expect(input[0]).toEqual({ text: "keep", unitTag: "T", tagScope: "KaiZen", tag: "bare" });
  });

  it("lets the framed value win when both spellings are already on the member", () => {
    expect(
      removeConditionAt([{ unitTag: "framed", "a:unitTag": "stored" }, { text: "drop" }], 1),
    ).toEqual([{ "a:unitTag": "framed" }]);
  });

  it("returns an empty list for the last member, including a single object", () => {
    expect(removeConditionAt([a], 0)).toEqual([]);
    expect(removeConditionAt(a, 0)).toEqual([]);
  });

  it("throws the out-of-range sentence and does not invent a null", () => {
    expect(() => removeConditionAt([a], 1)).toThrow(
      "removeConditionAt: index out of range (1, length 1)",
    );
    expect(() => removeConditionAt([a], 1.5)).toThrow(
      "removeConditionAt: index out of range (1.5, length 1)",
    );
    expect(() => removeConditionAt(null, 0)).toThrow(
      "removeConditionAt: index out of range (0, length 0)",
    );
  });

  it("turns a null survivor into an empty object instead of throwing", () => {
    const survivor = null as unknown as Record<string, unknown>;
    expect(removeConditionAt([a, survivor], 0)).toEqual([{}]);
  });
});

describe("confirmConditionRemoval", () => {
  it("confirms the composed order, and accepts the framed spelling on the way back", () => {
    const before = [{ text: "keep", unitTag: "T" }, { text: "drop" }];
    const after = [{ text: "keep", "a:unitTag": "T" }];
    expect(
      confirmConditionRemoval({
        servedBefore: before,
        servedAfter: after,
        index: 1,
        clickedCondition: { text: "drop" },
      }),
    ).toEqual({ confirmed: true });
  });

  it("confirms removal of one copy and leaves the twin", () => {
    expect(
      confirmConditionRemoval({
        servedBefore: [a, a],
        servedAfter: [a],
        index: 0,
        clickedCondition: a,
      }),
    ).toEqual({ confirmed: true });
  });

  it("fails only the order arm when the same members come back swapped", () => {
    expect(
      confirmConditionRemoval({
        servedBefore: [a, b, c],
        servedAfter: [c, a],
        index: 1,
        clickedCondition: b,
      }),
    ).toEqual({ confirmed: false, failedArms: ["served-order-differs"] });
  });

  it("refuses a click whose content is not in that slot, even if that slot was removed", () => {
    expect(
      confirmConditionRemoval({
        servedBefore: [a, b],
        servedAfter: [b],
        index: 0,
        clickedCondition: b,
      }),
    ).toEqual({ confirmed: false, failedArms: ["target-not-present-before"] });
  });

  it("names the stale-index arms and still counts the clicked content", () => {
    expect(
      confirmConditionRemoval({
        servedBefore: [a, b],
        servedAfter: [b],
        index: 5,
        clickedCondition: a,
      }),
    ).toEqual({
      confirmed: false,
      failedArms: ["target-not-present-before", "served-order-differs"],
    });
  });

  it("does not treat two copies disappearing as one removal", () => {
    const verdict = confirmConditionRemoval({
      servedBefore: [a, a],
      servedAfter: [],
      index: 0,
      clickedCondition: a,
    });
    expect(verdict).toEqual({
      confirmed: false,
      failedArms: [
        "count-not-exactly-one",
        "target-multiplicity-wrong",
        "sibling-did-not-survive",
        "served-order-differs",
      ],
    });
  });
});
