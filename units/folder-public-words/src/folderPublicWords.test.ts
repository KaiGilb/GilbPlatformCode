import { describe, expect, it } from "vitest";
import { notMadePublicSentence } from "./folderPublicWords";

describe("notMadePublicSentence", () => {
  it("is empty when there is nothing to report", () => {
    expect(notMadePublicSentence(undefined)).toBe("");
    expect(notMadePublicSentence([])).toBe("");
  });

  it("starts with a space and quotes only the first failure", () => {
    expect(notMadePublicSentence(["the link stayed private"])).toBe(
      " The folder is public, but 1 thing in it could not be made public: the link stayed private",
    );
    expect(notMadePublicSentence(["first", "second"])).toBe(
      " The folder is public, but 2 things in it could not be made public: first",
    );
  });
});
