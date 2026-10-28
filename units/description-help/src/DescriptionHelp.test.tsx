import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSUMPTION_WARNING, KEYWORD_MESSAGE, previewPaste } from "@kaigilb/gilbplatformcode-description-parts-model";
import { DESCRIPTION_HELP_SECTIONS, DescriptionHelp, PASTE_HELP_EXAMPLE, PASTE_HELP_EXAMPLE_FUNCTION } from "./index";

const realScrollIntoView = Element.prototype.scrollIntoView;

describe("DescriptionHelp", () => {
  let scrollIntoView: ReturnType<typeof vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>>;

  beforeEach(() => {
    scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    cleanup();
    Element.prototype.scrollIntoView = realScrollIntoView;
  });

  it("renders the seven sections, in order, and a contents button that scrolls to each", async () => {
    const user = userEvent.setup();
    render(<DescriptionHelp tag="Ben" />);
    const regions = screen.getAllByRole("region");
    expect(regions.map((region) => region.getAttribute("id"))).toEqual(DESCRIPTION_HELP_SECTIONS.map((section) => section.id));
    DESCRIPTION_HELP_SECTIONS.forEach((section, index) => {
      expect(screen.getByRole("region", { name: section.title })).toBe(regions[index]);
    });
    const nav = screen.getByRole("navigation", { name: "Contents" });
    const buttons = within(nav).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(DESCRIPTION_HELP_SECTIONS.map((section) => section.title));
    for (const section of DESCRIPTION_HELP_SECTIONS) {
      scrollIntoView.mockClear();
      await user.click(within(nav).getByRole("button", { name: section.title }));
      expect(scrollIntoView.mock.contexts).toContain(document.getElementById(section.id));
    }
  });

  it("uses the Solution tag, or MySolution when the tag is empty", () => {
    const { unmount } = render(<DescriptionHelp tag="Ben" />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Ben.Bones");
    expect(text).toContain("Ben.Bones.Hip");
    expect(text).toContain("Ben.Assumption.Weight");
    unmount();
    render(<DescriptionHelp tag="" />);
    expect(document.body.textContent ?? "").toContain("MySolution.Bones");
  });

  it("shows the keyword rule and the assumption warning from the part rules", () => {
    render(<DescriptionHelp tag="Ben" />);
    const text = document.body.textContent ?? "";
    // The help no longer prints KEYWORD_MESSAGE itself: that doubled the word "Keyword:".
    expect(KEYWORD_MESSAGE).toContain("letters only, starting with a capital");
    expect(text).toContain("The Keyword is one word: letters only, starting with a capital, e.g. Sync.");
    expect(text).toContain("The Keyword Assumption is kept for the assumptions: use + Assumption.");
    expect(text).toContain("A tag is used once in the whole vault. If it is taken, you are told, and nothing is written. Pick another Keyword.");
    expect(text).toContain(
      "A part whose tag is already used in the vault is skipped, never written over, and so are the lines under it, unless it is a part of this Description already: then they go under that part.",
    );
    expect(text).not.toContain("Keyword: Keyword:");
    expect(text).toContain(ASSUMPTION_WARNING);
  });

  it("shows the paste example in a pre, and a table of seven lines", () => {
    render(<DescriptionHelp tag="Ben" />);
    const pres = [...document.querySelectorAll("pre")];
    expect(pres.some((pre) => pre.textContent === PASTE_HELP_EXAMPLE)).toBe(true);
    expect(document.querySelectorAll("table tbody tr")).toHaveLength(7);
  });

  it("a paste line whose keyword has a digit says letters only", () => {
    render(<DescriptionHelp tag="Ben" />);
    expect(document.body.textContent).toContain("A Keyword is letters only, starting with a capital: Feet, not Feet2.");
    const preview = previewPaste("Bones: ok\n- T1: one\nFeet2: two", "Ben", () => false);
    expect(preview.bad).toEqual([
      { line: 2, why: "not a part: a Keyword is letters only (T1 is not)" },
      { line: 3, why: "not a part: a Keyword is letters only (Feet2 is not)" },
    ]);
    expect(preview.parts.map((part) => part.tag)).toEqual(["Ben.Bones"]);
  });

  it("the paste example is what previewPaste would write", () => {
    const preview = previewPaste(PASTE_HELP_EXAMPLE, "Ben", () => false);
    expect(preview.bad).toEqual([]);
    expect(preview.parts.map((part) => part.tag)).toEqual([
      "Ben.Bones",
      "Ben.Bones.Hip",
      "Ben.Bones.Hip.Socket",
      "Ben.Feet",
      "Ben.Assumption.Weight",
    ]);
    expect(preview.parts.find((part) => part.tag === "Ben.Bones")?.source).toBe("Dr Ames");
    expect(preview.parts.filter((part) => part.assumption).map((part) => part.tag)).toEqual(["Ben.Assumption.Weight"]);
  });

  it("does not tell you to wait before ×", () => {
    render(<DescriptionHelp tag="Ben" />);
    const move = document.getElementById("desc-move")?.textContent ?? "";
    expect(move).toContain("Its sub-parts are removed with it.");
    expect(move).not.toContain("If its sub-parts are still being read");
    expect(document.getElementById("desc-subpart")?.textContent).toContain(
      "A sub-part you add gets its parent's tag, a dot, and its Keyword. A part you move keeps its tag.",
    );
  });

  it("does not use a hash link", () => {
    const { container } = render(<DescriptionHelp tag="Ben" />);
    expect(container.querySelectorAll('a[href^="#"]')).toHaveLength(0);
  });

  it("uses Function examples, and MyFunction when the tag is empty", () => {
    const { unmount } = render(<DescriptionHelp tag="Walk" kind="Function" />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("The Description of a Function");
    expect(text).toContain("Walk.Step");
    expect(text).toContain("Walk.Step.Lift");
    expect(text).toContain("Walk.Assumption.Floor");
    expect(text).not.toContain("Solution");
    unmount();
    render(<DescriptionHelp tag="" kind="Function" />);
    expect(document.body.textContent ?? "").toContain("MyFunction.Step");
  });

  it("the Function paste example is what previewPaste would write", () => {
    const preview = previewPaste(PASTE_HELP_EXAMPLE_FUNCTION, "Walk", () => false);
    expect(preview.bad).toEqual([]);
    expect(preview.parts.map((part) => part.tag)).toEqual([
      "Walk.Step",
      "Walk.Step.Lift",
      "Walk.Step.Lift.Swing",
      "Walk.Land",
      "Walk.Assumption.Floor",
    ]);
    expect(preview.parts.find((part) => part.tag === "Walk.Step")?.source).toBe("Dr Ames");
    expect(preview.parts.filter((part) => part.assumption).map((part) => part.tag)).toEqual(["Walk.Assumption.Floor"]);
  });
});
