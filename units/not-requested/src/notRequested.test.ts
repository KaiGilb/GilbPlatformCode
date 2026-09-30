import { describe, expect, it } from "vitest";
import { noVaultNotRequestedSentence } from "./notRequested";

describe("noVaultNotRequestedSentence", () => {
  it("names the noun and says nothing was invented", () => {
    expect(noVaultNotRequestedSentence("rules")).toBe(
      "No vault is selected, so no rules were requested. Nothing was invented.",
    );
  });

  it("does not rewrite the noun, even when it is the wrong kind of word", () => {
    expect(noVaultNotRequestedSentence("t:Rule")).toBe(
      "No vault is selected, so no t:Rule were requested. Nothing was invented.",
    );
  });
});
