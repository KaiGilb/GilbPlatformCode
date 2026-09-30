import { describe, expect, it } from "vitest";
import { INSTRUCTION_PREFIX_SEPARATOR, liftInstructionPrefix } from "./instructionPrefix";

describe("liftInstructionPrefix", () => {
  it("lifts a leading token before space, en dash, space", () => {
    expect(liftInstructionPrefix("ProcVdcStProc — body with [[link]]")).toEqual({
      tag: "ProcVdcStProc",
      body: "body with [[link]]",
    });
    expect(INSTRUCTION_PREFIX_SEPARATOR).toBe(" \u2014 ");
  });

  it("rejects a space inside the token, a wikilink, a missing separator, and a hyphen", () => {
    expect(liftInstructionPrefix("has space — body")).toBeNull();
    expect(liftInstructionPrefix("[[Proc]] — body")).toBeNull();
    expect(liftInstructionPrefix("no separator here")).toBeNull();
    expect(liftInstructionPrefix("Token - body")).toBeNull();
    expect(liftInstructionPrefix(" — body")).toBeNull();
  });
});
