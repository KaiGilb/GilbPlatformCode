// A row of their online card carries the header's chain link (no "Theirs" badge); a row of yours carries nothing (no "Yours · private"
// badge). The meaning still has words (the link's readable name and title), never colour alone.
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { LINK_NOTE, W } from "@kaigilb/gilbplatformcode-stakeholder-ui-kit";
import { LinkMark, ONE_CARD_WORDS, ONLINE_SHADE, TheirRow, TheirRows, YourRow } from "./index";

afterEach(cleanup);

describe("a row of theirs carries the chain link, not the Theirs badge", () => {
  test("the row draws the header's chain-link glyph in the live-link colour, with words, and no badge text", () => {
    render(<TheirRow label="Email" value="ann@example.test" rungWords="Public" marks />);
    const row = screen.getByTestId("one-card-row");
    const mark = within(row).getByTestId("one-card-mark");
    expect(mark.getAttribute("data-source")).toBe("theirs");
    // The glyph is the header's: the same path as LinkGlyph's.
    expect(mark.querySelector("svg path")?.getAttribute("d")).toContain("M10 14a4 4 0 0 0 5.7 0");
    expect(mark.style.color).toBe(W.link);
    expect(mark.textContent).toBe(ONE_CARD_WORDS.linked);
    expect(mark.getAttribute("title")).toBe(ONE_CARD_WORDS.theirsTitle);
    expect(row.textContent).not.toContain(ONE_CARD_WORDS.theirs);
    // No pill: the badge's background and border are gone.
    expect(mark.style.background).toBe("");
    expect(mark.style.borderRadius).toBe("");
    // The shade still says "theirs" by colour, and the row is still read-only.
    expect(row.style.background).toBe(ONLINE_SHADE);
    expect(row.querySelector("input, textarea, select, button")).toBeNull();
  });

  test("every row of theirs in a group carries exactly one link; a row of yours from the merge is not drawn here", () => {
    render(
      <TheirRows
        rows={[
          { field: "a:email", value: "a@x.no", source: "theirs", rung: "public", rungWords: "Public", editable: false },
          { field: "a:email", value: "b@x.no", source: "theirs", rung: "public", rungWords: "Public", editable: false },
          { field: "a:email", value: "c@x.no", source: "yours", editable: true },
        ]}
        marks
      />,
    );
    const rows = screen.getAllByTestId("one-card-row");
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(within(r).getAllByTestId("one-card-mark")).toHaveLength(1);
  });

  test("with one source (no online card) no link is drawn", () => {
    render(<TheirRow label="Email" value="ann@example.test" marks={false} />);
    expect(screen.queryByTestId("one-card-mark")).toBeNull();
  });

  test("LinkMark's words are its own, not the header badge's LINK_NOTE (a row is not a live link to an account)", () => {
    render(<LinkMark />);
    expect(screen.getByTestId("one-card-mark").textContent).toBe("From their online card");
    expect(screen.getByTestId("one-card-mark").textContent).not.toBe(LINK_NOTE);
  });
});

describe("a row of yours carries nothing", () => {
  test("YourRow with two sources draws the editor and no mark, no badge words", () => {
    render(
      <YourRow marks>
        <span data-testid="editor">Ann</span>
      </YourRow>,
    );
    const row = screen.getByTestId("one-card-own-row");
    expect(row.getAttribute("data-source")).toBe("yours");
    expect(within(row).getByTestId("editor")).toBeTruthy();
    expect(within(row).queryByTestId("one-card-mark")).toBeNull();
    expect(row.textContent).toBe("Ann");
    expect(row.querySelector("svg")).toBeNull();
  });
});
