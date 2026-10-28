import { describe, expect, it } from "vitest";
import { LIVE_TERM_LIMIT, optionMatchesPlane } from "./index";
import type { CreatePlane, TypeOptionKind } from "./index";

describe("LIVE_TERM_LIMIT", () => {
  it("is 20: the number the 'more than N' note is about", () => {
    expect(LIVE_TERM_LIMIT).toBe(20);
  });
});

describe("optionMatchesPlane", () => {
  const planes: CreatePlane[] = ["things", "function", "value", "all"];
  const kinds: TypeOptionKind[] = ["type", "function", "value"];
  const expected: Record<CreatePlane, Record<TypeOptionKind, boolean>> = {
    things: { type: true, function: false, value: false },
    function: { type: false, function: true, value: false },
    value: { type: false, function: false, value: true },
    all: { type: true, function: true, value: true },
  };
  for (const plane of planes) {
    for (const kind of kinds) {
      it(`${kind} in the ${plane} plane: ${expected[plane][kind]}`, () => {
        expect(optionMatchesPlane(kind, plane)).toBe(expected[plane][kind]);
      });
    }
  }
});
