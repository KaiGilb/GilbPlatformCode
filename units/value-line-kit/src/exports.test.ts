// The export list of the unit, pinned: a name added or dropped fails here. These are exported for the line units.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are these, and each is the kind of thing it says", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "CommitText",
        "InlineInput",
        "InlineSelect",
        "LegacyMoveButton",
        "Piece",
        "Src",
        "TextPiece",
        "UnsetQualifiers",
        "ValueLinesHostContext",
        "ViewSrc",
        "box",
        "chip",
        "clickable",
        "eq",
        "faint",
        "faintBtn",
        "hint",
        "inPlace",
        "inlineBox",
        "legacyMoveLabel",
        "own",
        "quiet",
        "small",
        "useAutoGrow",
        "useValueLinesHost",
      ].sort(),
    );
    for (const name of ["CommitText", "InlineInput", "InlineSelect", "LegacyMoveButton", "Piece", "Src", "TextPiece", "UnsetQualifiers", "ViewSrc", "eq", "hint", "inPlace", "legacyMoveLabel", "own", "useAutoGrow", "useValueLinesHost"] as const) {
      expect(typeof unit[name], name).toBe("function");
    }
    expect(typeof unit.ValueLinesHostContext).toBe("object");
  });
  it("the class strings are the app's, as Tailwind generates its classes from them", () => {
    expect(unit.quiet).toBe("min-h-11 px-3 text-[14px] text-[var(--accent)]");
    expect(unit.faint).toBe("text-[13px] text-[var(--ink-soft)]");
    expect(unit.chip).toBe("inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[13px] text-[var(--ink)]");
    expect(unit.small).toBe("min-h-[36px] rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--focus)]");
    expect(unit.box).toContain("min-h-[44px] w-full rounded-[var(--r-md)]");
    expect(unit.clickable).toContain("cursor-text");
    expect(unit.inlineBox).toContain("border-[var(--focus)]");
    expect(unit.faintBtn).toContain("opacity-60");
  });
});
