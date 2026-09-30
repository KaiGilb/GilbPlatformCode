import { describe, expect, it } from "vitest";
import { skillUriDisplayLabel } from "./skillUriLabel";

describe("skillUriDisplayLabel", () => {
  it("uses the last path segment and leaves a non-address unchanged", () => {
    expect(skillUriDisplayLabel("https://vocab.example.test/base/t/StreetLine")).toBe("Street Line");
    expect(skillUriDisplayLabel("https://vocab.example.test/base/t/t:StreetLine")).toBe("Street Line");
    expect(skillUriDisplayLabel("https://vocab.example.test/base/t/HTMLParser")).toBe("HTMLParser");
    expect(skillUriDisplayLabel("StreetLine")).toBe("StreetLine");
    expect(skillUriDisplayLabel("  not a uri  ")).toBe("  not a uri  ");
  });
});
