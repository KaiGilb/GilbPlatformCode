import { describe, expect, it } from "vitest";
import { parseStatementRefs } from "./statementRefs";

describe("parseStatementRefs", () => {
  it("returns nothing for an empty string", () => {
    expect(parseStatementRefs("")).toEqual([]);
  });

  it("keeps plain text as one span", () => {
    expect(parseStatementRefs("just words")).toEqual([{ kind: "text", value: "just words" }]);
  });

  it("lifts a bracketed name and ignores an empty pair", () => {
    expect(parseStatementRefs("see [[Some.Target]] now")).toEqual([
      { kind: "text", value: "see " },
      { kind: "ref", value: "Some.Target" },
      { kind: "text", value: " now" },
    ]);
    expect(parseStatementRefs("[[]]")).toEqual([]);
  });

  it("lifts an http address and leaves the sentence period behind", () => {
    expect(parseStatementRefs("see https://example.test/x.")).toEqual([
      { kind: "text", value: "see " },
      { kind: "ref", value: "https://example.test/x" },
      { kind: "text", value: "." },
    ]);
  });

  it("does not treat javascript: as an address, unless it is inside brackets", () => {
    expect(parseStatementRefs("javascript:alert(1)")).toEqual([
      { kind: "text", value: "javascript:alert(1)" },
    ]);
    expect(parseStatementRefs("[[javascript:alert(1)]]")).toEqual([
      { kind: "ref", value: "javascript:alert(1)" },
    ]);
  });

  it("keeps a period that was written inside the brackets", () => {
    expect(parseStatementRefs("[[Foo.]]")).toEqual([{ kind: "ref", value: "Foo." }]);
  });
});
