import { describe, expect, it } from "vitest";
import { formatStepInstruction } from "./stepInstruction";

const ALPHA = "https://example.test/base/e/proc-alpha";
const BETA = "https://example.test/base/e/proc-beta";

describe("formatStepInstruction", () => {
  it("is empty only when the instruction is empty", () => {
    expect(formatStepInstruction("")).toEqual({ tag: null, text: "", segments: [] });
  });

  it("does not invent a pill from the sentence when no carrier is passed", () => {
    const d = formatStepInstruction(
      "ProcVdcStProc — [[Proc_v_IdeaCapture]] — HumanAgent captures the idea",
      "https://example.test/base/e/proc-v-ideacapture",
    );
    expect(d.tag).toBeNull();
    expect(d.text).toBe("ProcVdcStProc — HumanAgent captures the idea");
  });

  it("lets a different carrier win, and leaves the prose prefix in the body", () => {
    const d = formatStepInstruction("ProsePrefix — HumanAgent captures the idea", null, "CarrierWins");
    expect(d.tag).toBe("CarrierWins");
    expect(d.text).toBe("ProsePrefix — HumanAgent captures the idea");
  });

  it("lifts the prefix only when it equals the carrier", () => {
    const d = formatStepInstruction("ProcVdcStProc — body remains", null, "ProcVdcStProc");
    expect(d.tag).toBe("ProcVdcStProc");
    expect(d.text).toBe("body remains");
  });

  it("removes every handoff wikilink and keeps a different name as text and as a ref", () => {
    const out = formatStepInstruction("[[Proc_Alpha]] — [[Proc_Beta]] — body [[Other]]", [ALPHA, BETA], null);
    expect(out.text).toBe("body Other");
    expect(out.segments).toEqual([
      { kind: "text", value: "body " },
      { kind: "ref", value: "Other" },
    ]);
  });

  it("shows the original sentence and no pill when cleanup would erase the body", () => {
    const out = formatStepInstruction("[[Proc_Alpha]]", ALPHA, "Kept");
    expect(out.tag).toBeNull();
    expect(out.text).toBe("[[Proc_Alpha]]");
    expect(out.segments).toEqual([{ kind: "ref", value: "Proc_Alpha" }]);
  });

  it("does not match a handoff whose tail still has a query", () => {
    const out = formatStepInstruction("[[proc-alpha]]", `${ALPHA}?x=1`, null);
    expect(out.text).toBe("proc-alpha");
  });

  it("treats a whitespace-only carrier as no tag", () => {
    const out = formatStepInstruction("Token — body", null, "  ");
    expect(out.tag).toBeNull();
    expect(out.text).toBe("Token — body");
  });
});
