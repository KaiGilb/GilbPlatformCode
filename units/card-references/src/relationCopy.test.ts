// The words a person reads for a relation on the card.
import { describe, expect, it } from "vitest";
import { relationCopyOf } from "./relationCopy";

describe("relationCopy", () => {
  it("is keyed by the TERM's name, not by the master's label: a term it does not list keeps the master's label and has no helper", () => {
    expect(relationCopyOf("actsOnBehalfOf")?.label).toBe("Represents");
    expect(relationCopyOf("actsOnBehalfOf")?.helper).toMatch(/Acts or speaks for another party/);
    expect(relationCopyOf("memberOf")?.label).toBe("Member of");
    expect(relationCopyOf("legalRepresentative")).toBeNull();
    expect(relationCopyOf(null)).toBeNull();
  });
});
