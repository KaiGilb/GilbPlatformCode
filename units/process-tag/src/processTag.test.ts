import { describe, expect, it } from "vitest";
import { buildProcessUnitTagPatch, processUnitTag } from "./processTag";

describe("processUnitTag", () => {
  it("prefers the framed spelling and does not trim the text it returns", () => {
    expect(processUnitTag({ unitTag: "  Proc  ", "a:unitTag": "Raw" })).toBe("  Proc  ");
  });

  it("falls through a blank framed value to the raw spelling", () => {
    expect(processUnitTag({ unitTag: "   ", "a:unitTag": "Raw" })).toBe("Raw");
    expect(processUnitTag({ "a:unitTag": "Raw" })).toBe("Raw");
  });

  it("does not read a bare tag, a rule id, or a non-string", () => {
    expect(processUnitTag({ tag: "NotACarrier" } as { unitTag?: unknown })).toBeUndefined();
    expect(processUnitTag({ ruleId: "R1" } as { unitTag?: unknown })).toBeUndefined();
    expect(processUnitTag({ unitTag: 1 })).toBeUndefined();
    expect(processUnitTag({})).toBeUndefined();
  });
});

const FROZEN =
  'a:unitTag is frozen at assignment and cannot be renamed in place (served "ProcVdcOld", edited "ProcVdcNew"). Clear the field to release the tag, then set the new one.';

describe("buildProcessUnitTagPatch", () => {
  it("sets, clears with null, and omits an unchanged tag", () => {
    expect(buildProcessUnitTagPatch("", "ProcVdc")).toEqual({ unitTag: "ProcVdc" });
    expect(buildProcessUnitTagPatch("ProcVdc", "")).toEqual({ unitTag: null });
    expect(buildProcessUnitTagPatch("ProcVdc", "ProcVdc")).toEqual({});
    expect(buildProcessUnitTagPatch("", "ProcVdc")).not.toHaveProperty("tagScope");
  });

  it("throws the freeze sentence, and the message keeps spaces on the served side only", () => {
    expect(() => buildProcessUnitTagPatch("ProcVdcOld", "ProcVdcNew")).toThrow(FROZEN);
    expect(() => buildProcessUnitTagPatch(" Old ", " New ")).toThrow(
      'a:unitTag is frozen at assignment and cannot be renamed in place (served " Old ", edited "New"). Clear the field to release the tag, then set the new one.',
    );
  });

  it("does not freeze a spaces-only difference, and it writes the draft including spaces", () => {
    expect(buildProcessUnitTagPatch("ProcVdc", "  ProcVdc  ")).toEqual({ unitTag: "  ProcVdc  " });
  });

  it("does not treat spaces as a clear", () => {
    expect(buildProcessUnitTagPatch("ProcVdc", " ")).toEqual({ unitTag: " " });
    expect(() => buildProcessUnitTagPatch("ProcVdc", "")).not.toThrow();
  });
});
