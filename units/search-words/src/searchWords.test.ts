import { describe, expect, it } from "vitest";
import { entityResolveSearchQueries, pascalCaseToSearchWords } from "./searchWords";

describe("pascalCaseToSearchWords", () => {
  it("splits capitals and separators and does not fold case", () => {
    expect(pascalCaseToSearchWords("AnchorDurability")).toBe("Anchor Durability");
    expect(pascalCaseToSearchWords("SkillYearsOfExperienceScale")).toBe(
      "Skill Years Of Experience Scale",
    );
    expect(pascalCaseToSearchWords("XMLParser")).toBe("XML Parser");
    expect(pascalCaseToSearchWords("foo_bar--baz")).toBe("foo bar baz");
    expect(pascalCaseToSearchWords("  FOO  ")).toBe("FOO");
    expect(pascalCaseToSearchWords("a:Name")).toBe("a:Name");
    expect(pascalCaseToSearchWords("")).toBe("");
  });
});

describe("entityResolveSearchQueries", () => {
  it("adds the spaced form and the first word of a two-word split", () => {
    expect(entityResolveSearchQueries("FooBar")).toEqual(["FooBar", "Foo Bar", "Foo"]);
    expect(entityResolveSearchQueries("Foo")).toEqual(["Foo"]);
    expect(entityResolveSearchQueries("A B C")).toEqual(["A B C", "A B"]);
    expect(entityResolveSearchQueries("  Foo  ")).toEqual(["Foo"]);
    expect(entityResolveSearchQueries("   ")).toEqual([]);
  });
});
