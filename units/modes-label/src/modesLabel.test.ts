import { describe, expect, it } from "vitest";
import { modesLabel } from "./modesLabel";

describe("modesLabel", () => {
  it("uses one sentence and does not mention append", () => {
    expect(modesLabel(["read", "write"])).toBe("Read + write");
    expect(modesLabel(["write", "read"])).toBe("Read + write");
    expect(modesLabel(["write"])).toBe("Write only");
    expect(modesLabel(["read"])).toBe("Read only");
    expect(modesLabel([])).toBe("No access modes");
    expect(modesLabel(["append"])).toBe("No access modes");
    expect(modesLabel(["READ"])).toBe("No access modes");
    expect(modesLabel(["write", "append"])).toBe("Write only");
  });
});
