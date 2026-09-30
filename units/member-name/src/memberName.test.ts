import { describe, expect, it } from "vitest";
import { memberDirectoryId, memberDisplayName } from "./memberName";

describe("memberDisplayName", () => {
  it("prefers a trimmed label", () => {
    expect(
      memberDisplayName({
        label: "  Ada  ",
        webId: "https://ada.example.test/i",
        principal: "https://id.example.test/base/p/abc",
      }),
    ).toBe("Ada");
    expect(memberDisplayName({ label: "   ", principal: "https://ada.example.test/i" })).toBe("ada");
  });

  it("uses the first host piece, including www, and only the four paths", () => {
    expect(memberDisplayName({ principal: "https://WWW.example.test/i" })).toBe("www");
    expect(memberDisplayName({ principal: "https://id.example.test/base" })).toBe("id");
    expect(memberDisplayName({ principal: "https://ada.example.test/vault/" })).toBe("ada");
    expect(memberDisplayName({ principal: "https://ada.example.test/card" })).toBe("ada");
    expect(memberDisplayName({ principal: "https://ada.example.test/BASE" })).toBe("BASE");
    expect(memberDisplayName({ principal: "https://ada.example.test/base/p/abc" })).toBe("abc");
  });

  it("falls through to the principal when nothing else names the row", () => {
    expect(memberDisplayName({ principal: "" })).toBe("");
    expect(memberDisplayName({ principal: "not a url" })).toBe("not a url");
  });
});

describe("memberDirectoryId", () => {
  it("uses a trimmed webId and otherwise the principal unchanged", () => {
    expect(
      memberDirectoryId({ webId: "  https://ada.example.test/i  ", principal: "https://h/p/1" }),
    ).toBe("https://ada.example.test/i");
    expect(memberDirectoryId({ webId: "   ", principal: "  p  " })).toBe("  p  ");
    expect(memberDirectoryId({ principal: "https://h/p/1" })).toBe("https://h/p/1");
  });
});
