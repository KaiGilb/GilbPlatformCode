import { describe, expect, it } from "vitest";
import {
  UNIT_ROLE_NOT_DECLARED,
  specimenRoleLabel,
  specimenRoleLine,
} from "./specimenRole";

describe("specimenRoleLine", () => {
  it("draws nothing when the family has no role field", () => {
    expect(specimenRoleLine(undefined)).toBeNull();
  });

  it("uses the exact absence line when the unit declared none", () => {
    expect(specimenRoleLine(null)).toBe("Role not declared");
    expect(specimenRoleLine(null)).toBe(UNIT_ROLE_NOT_DECLARED);
  });

  it("does not treat absence as blank", () => {
    expect(specimenRoleLine(null)).not.toBe("blank");
    expect(specimenRoleLine(undefined)).not.toBe("blank");
  });

  it("spells the four known tokens, and hyphenates only counterExample", () => {
    expect(specimenRoleLine("blank")).toBe("blank");
    expect(specimenRoleLine("example")).toBe("example");
    expect(specimenRoleLine("counterExample")).toBe("counter-example");
    expect(specimenRoleLine("guidance")).toBe("guidance");
  });

  it("shows an unknown token as stored", () => {
    expect(specimenRoleLine("counter-example")).toBe("counter-example");
    expect(specimenRoleLine("CounterExample")).toBe("CounterExample");
    expect(specimenRoleLine("futureRole")).toBe("futureRole");
    expect(specimenRoleLine("")).toBe("");
    expect(specimenRoleLine(" blank ")).toBe(" blank ");
  });

  it("does not fold an unknown token into the absence line", () => {
    expect(specimenRoleLine("futureRole")).not.toBe(UNIT_ROLE_NOT_DECLARED);
    expect(specimenRoleLine("")).not.toBe(UNIT_ROLE_NOT_DECLARED);
  });
});

describe("specimenRoleLabel", () => {
  it("is case-sensitive", () => {
    expect(specimenRoleLabel("example")).toBe("example");
    expect(specimenRoleLabel("Example")).toBe("Example");
  });
});
