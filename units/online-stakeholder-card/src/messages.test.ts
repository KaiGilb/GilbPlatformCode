// The words the card says, verbatim as the app says them (RuleGhsKeepQuirks): a changed word is a changed behaviour.
import { describe, expect, test } from "vitest";
import { CHECK_FAILED, LINK_FAILED_KEPT, LINK_FAILED_REMOVED, LINK_FAILED_TAG_KEPT, NOT_A_STAKEHOLDER, REMOVE_FAILED, SAVE_FAILED } from "./index";

describe("the message constants", () => {
  test("CHECK_FAILED", () => {
    expect(CHECK_FAILED).toBe("It could not be checked whether you already have a card of them, so none was made. Try again.");
  });
  test("LINK_FAILED_REMOVED", () => {
    expect(LINK_FAILED_REMOVED).toBe("The card could not be linked to their online card, so it was removed again. Nothing was kept. Try again.");
  });
  test("LINK_FAILED_KEPT names the card", () => {
    expect(LINK_FAILED_KEPT("Ben Larsen")).toBe(
      'The card could not be linked to their online card, and the new card "Ben Larsen" could not be removed. Remove it from Records, then try again.',
    );
  });
  test("SAVE_FAILED", () => {
    expect(SAVE_FAILED).toBe("The card could not be saved, so it was removed again. Nothing was kept. Try again.");
  });
  test("REMOVE_FAILED names the card", () => {
    expect(REMOVE_FAILED("Ben Larsen")).toBe('The new card "Ben Larsen" could not be removed. Remove it from Records, then try again.');
  });
  test("LINK_FAILED_TAG_KEPT names the card", () => {
    expect(LINK_FAILED_TAG_KEPT("Ben Larsen")).toBe(
      'The card could not be linked to their online card, so it was removed again, but the name "Ben Larsen" is still taken in your vault. Try again with another name.',
    );
  });
  test("NOT_A_STAKEHOLDER", () => {
    expect(NOT_A_STAKEHOLDER).toBe("This person is not one of your stakeholders.");
  });
});
