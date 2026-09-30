import { describe, expect, it } from "vitest";
import { sessionVaultLabel } from "./sessionVaultName";

describe("sessionVaultLabel", () => {
  it("uses a trimmed name, otherwise the id unchanged", () => {
    expect(sessionVaultLabel({ name: "  Ada  ", id: "x" })).toBe("Ada");
    expect(sessionVaultLabel({ name: "   ", id: "abc" })).toBe("Unnamed vault abc");
    expect(sessionVaultLabel({ name: null, id: "abc" })).toBe("Unnamed vault abc");
    expect(sessionVaultLabel({ id: "abc" })).toBe("Unnamed vault abc");
    expect(sessionVaultLabel({ name: "", id: "" })).toBe("Unnamed vault ");
    expect(sessionVaultLabel({ id: "  x  " })).toBe("Unnamed vault   x  ");
  });
});
