import { describe, expect, it } from "vitest";
import { kindFromNodeKind } from "./typeSearch";

describe("kindFromNodeKind", () => {
  it("maps function and value; absent/type is a Thing; relations are not offerable", () => {
    expect(kindFromNodeKind("function")).toBe("function");
    expect(kindFromNodeKind("value")).toBe("value");
    expect(kindFromNodeKind("type")).toBe("type");
    expect(kindFromNodeKind("entity")).toBe("type");
    expect(kindFromNodeKind(undefined)).toBe("type");
    expect(kindFromNodeKind("relation")).toBeNull();
    expect(kindFromNodeKind("attribute")).toBeNull();
    expect(kindFromNodeKind("scale")).toBeNull();
  });
});
