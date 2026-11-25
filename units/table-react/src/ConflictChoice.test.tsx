// Spec: step 2 brief 4.4 ("The cell shows 'Changed by someone else: <theirs>' and 'Yours: <mine>', with 'Keep mine' and 'Use theirs'"),
// and Kai-Zen's decision of 2026-11-25 that the card's same-field clash offers the Table's choice, with the same words and behaviour.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { CONFLICT_WORDS, ConflictActs } from "./index";

afterEach(cleanup);

describe("ConflictChoice", () => {
  test("the words of a clash", () => {
    expect(CONFLICT_WORDS.theirs("Red")).toBe("Changed by someone else: Red");
    expect(CONFLICT_WORDS.mine("Green")).toBe("Yours: Green");
  });

  // RuleA11yUnitTest (tester round 4, Info): axe finds nothing in the two acts.
  test("axe finds nothing in the two acts", async () => {
    render(<ConflictActs testId="acts" onUseTheirs={() => {}} onKeepMine={() => {}} />);
    const result = await axe.run(screen.getByTestId("acts"), { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });

  test("the two acts: 'Use theirs' then 'Keep mine' (the act that writes rightmost), each calling its own handler", () => {
    const onUseTheirs = vi.fn();
    const onKeepMine = vi.fn();
    render(<ConflictActs testId="acts" onUseTheirs={onUseTheirs} onKeepMine={onKeepMine} />);
    const buttons = [...screen.getByTestId("acts").querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Use theirs", "Keep mine"]);
    fireEvent.click(buttons[1]!);
    expect(onKeepMine).toHaveBeenCalledTimes(1);
    expect(onUseTheirs).not.toHaveBeenCalled();
    fireEvent.click(buttons[0]!);
    expect(onUseTheirs).toHaveBeenCalledTimes(1);
  });
});
