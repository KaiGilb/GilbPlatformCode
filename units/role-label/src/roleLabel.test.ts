import { describe, expect, it } from "vitest";
import { roleLabel } from "./roleLabel";

describe("roleLabel", () => {
  it("spaces camel case and snake case, and capitalises only the first letter", () => {
    expect(roleLabel("worksFor")).toBe("Works for");
    expect(roleLabel("assigned_to")).toBe("Assigned to");
    expect(roleLabel("works-for")).toBe("Works for");
  });

  it("strips a lowercase role: prefix, and an empty role is Member", () => {
    expect(roleLabel("role:member")).toBe("Member");
    expect(roleLabel("role:")).toBe("Member");
    expect(roleLabel("")).toBe("Member");
    expect(roleLabel("   ")).toBe("Member");
  });

  it("does not strip ROLE: and does not title-case the rest", () => {
    expect(roleLabel("ROLE:member")).toBe("Role:member");
    expect(roleLabel("XMLParser")).toBe("Xmlparser");
  });
});
