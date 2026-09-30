import { describe, expect, it } from "vitest";
import { termRefFromNameOrIri } from "./termRef";

describe("termRefFromNameOrIri", () => {
  it("keeps a lowercase absolute address and refuses a name", () => {
    expect(termRefFromNameOrIri("  https://terms.example.test/base/t/A  ")).toEqual({
      "@id": "https://terms.example.test/base/t/A",
    });
    expect(termRefFromNameOrIri("http://terms.example.test/x")).toEqual({
      "@id": "http://terms.example.test/x",
    });
    expect(termRefFromNameOrIri("https://terms.example.test/t/A/")).toEqual({
      "@id": "https://terms.example.test/t/A/",
    });
    expect(termRefFromNameOrIri("https://a b")).toEqual({ "@id": "https://a b" });
    expect(termRefFromNameOrIri("HTTP://terms.example.test/t")).toBeNull();
    expect(termRefFromNameOrIri("httpfoo")).toBeNull();
    expect(termRefFromNameOrIri("Person")).toBeNull();
    expect(termRefFromNameOrIri("t:Person")).toBeNull();
    expect(termRefFromNameOrIri("base:t/Person")).toBeNull();
    expect(termRefFromNameOrIri("")).toBeNull();
    expect(termRefFromNameOrIri("   ")).toBeNull();
  });
});
