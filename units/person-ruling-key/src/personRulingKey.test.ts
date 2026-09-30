import { describe, expect, it } from "vitest";
import { admitAsPerson, personRulingKey } from "./personRulingKey";

describe("personRulingKey", () => {
  it("folds the host and one trailing slash, and keeps the path's case", () => {
    expect(personRulingKey("https://Person.Example.TEST/Base/")).toBe(
      "https://person.example.test/Base",
    );
    expect(personRulingKey("https://person.example.test/base")).toBe(
      "https://person.example.test/base",
    );
    expect(personRulingKey("https://Person.Example.TEST/Base/")).not.toBe(
      personRulingKey("https://person.example.test/base"),
    );
  });

  it("treats a root with and without a slash as the same key, and drops a default port", () => {
    expect(personRulingKey("https://person.example.test")).toBe("https://person.example.test");
    expect(personRulingKey("https://person.example.test/")).toBe("https://person.example.test");
    expect(personRulingKey("https://person.example.test:443/base")).toBe(
      "https://person.example.test/base",
    );
  });

  it("keeps the search, drops the fragment and the userinfo, and removes only one slash", () => {
    expect(personRulingKey("https://person.example.test/base?q=1#h")).toBe(
      "https://person.example.test/base?q=1",
    );
    expect(personRulingKey("https://user:name@person.example.test/base")).toBe(
      "https://person.example.test/base",
    );
    expect(personRulingKey("https://person.example.test/base//")).toBe(
      "https://person.example.test/base/",
    );
  });

  it("returns a non-address trimmed, and a blank as empty", () => {
    expect(personRulingKey("  not a url  ")).toBe("not a url");
    expect(personRulingKey("   ")).toBe("");
  });
});

describe("admitAsPerson", () => {
  it("is true when nobody has ruled, and false only for not-a-person", () => {
    expect(admitAsPerson("https://person.example.test/base", null)).toBe(true);
    expect(admitAsPerson("https://person.example.test/base", "person")).toBe(true);
    expect(admitAsPerson("https://person.example.test/base", "not-a-person")).toBe(false);
  });

  it("is false for a blank principal even when the ruling is open", () => {
    expect(admitAsPerson("   ", null)).toBe(false);
    expect(admitAsPerson("", "person")).toBe(false);
  });
});
