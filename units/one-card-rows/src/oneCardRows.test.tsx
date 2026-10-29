// The rows and marks of a merged person card: the shade, the read-only theirs rows, the chain-link mark, the legend and the foot.
// The merge and the online-card parser are the peers' own, so the rows here are the ones a real merge returns.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { mergeOneCard, type OneCardField } from "@kaigilb/gilbplatformcode-one-card-merge";
import { parseOnlineCard, rungChipWords } from "@kaigilb/gilbplatformcode-online-card";
import {
  BothKeptLine,
  ONE_CARD_WORDS,
  ONLINE_SHADE,
  OneCardFoot,
  OneCardLegend,
  OwnBlockMark,
  SourceMark,
  TheirRow,
  TheirRows,
  YourRow,
} from "./index";

afterEach(cleanup);

const field = (slug: string, label: string, many: boolean): OneCardField => ({
  term: `https://master.example.test/base/t/${slug}`,
  label,
  readKeys: [`a:${slug}`, slug],
  writeKey: `a:${slug}`,
  many,
});
const GIVEN = field("givenName", "Given name", false);
const PHONE = field("phone", "Phone", false);
const EMAIL = field("email", "Email", true);
const P = "https://ann.example.test/";
const online = parseOnlineCard(P, {
  fields: [
    { principal: P, field: "a:givenName", value: "Ann", rung: "public" },
    { principal: P, field: "a:email", value: "ann@example.test", rung: "t:EitherContextFirstDegreeGrantee" },
    { principal: P, field: "a:phone", value: "+47 900 12 345", rung: "t:EitherContextCloseCircleGrantee" },
    // A value the server did not return is not on the card at all: nothing of a hidden field can reach the rows.
  ],
});
const merged = mergeOneCard({
  online,
  own: { facts: { givenName: "Ann", phone: "+47 913 55 210", email: "ann@example.test" } },
  fieldOrder: [GIVEN, EMAIL, PHONE],
});
const groupOf = (f: OneCardField) => merged.groups.find((g) => g.term === f.term)!;

describe("SourceMark", () => {
  test("names the source in words, so the meaning never rests on colour alone", () => {
    render(
      <>
        <SourceMark source="theirs" />
        <SourceMark source="yours" />
      </>,
    );
    const marks = screen.getAllByTestId("one-card-mark");
    expect(marks.map((m) => m.textContent)).toEqual([ONE_CARD_WORDS.theirs, ONE_CARD_WORDS.yours]);
    expect(marks.map((m) => m.getAttribute("data-source"))).toEqual(["theirs", "yours"]);
    expect(ONE_CARD_WORDS.theirs).toBe("Theirs");
    expect(ONE_CARD_WORDS.yours).toBe("Yours · private");
    expect(marks[0]!.getAttribute("title")).toBe("From their online card. Live. Only they can change it.");
  });

  test("a theirs mark on the shade is drawn in the ink, not the accent (the accent on the pill is 4.4:1)", () => {
    render(<SourceMark source="theirs" onShade />);
    expect(screen.getByTestId("one-card-mark").style.color).toContain("--ink");
    expect(screen.getByTestId("one-card-mark").style.color).not.toContain("--accent");
  });
});

describe("TheirRow", () => {
  // Only on their card: one row, marked, "Shown to you as: <chip words>", read-only, shaded.
  test("is shaded, read-only, marked Theirs and says the rung in chip words", () => {
    const row = groupOf(EMAIL).rows[0]!;
    render(<TheirRow label="Email" value={row.value} rungWords={row.rungWords} sameAsTheirs={row.sameAsTheirs} marks />);
    const el = screen.getByTestId("one-card-row");
    expect(el.getAttribute("data-source")).toBe("theirs");
    expect(el.style.background).toBe(ONLINE_SHADE);
    expect(el.querySelector("input, textarea, select, button")).toBeNull();
    expect(within(el).getByText("ann@example.test")).toBeTruthy();
    expect(within(el).getByTestId("one-card-row-why").textContent).toBe(`Shown to you as: ${rungChipWords("t:EitherContextFirstDegreeGrantee")}`);
    expect(row.rungWords).toBe(rungChipWords("t:EitherContextFirstDegreeGrantee"));
    // The mark is the chain link, its words "From their online card" (not a "Theirs" badge).
    expect(within(el).getByTestId("one-card-mark").textContent).toBe("From their online card");
  });

  test("the quiet line on the shade is --ink-soft, never --ink-faint (ink-faint on the shade is 3.2:1)", () => {
    render(<TheirRow label="Email" value="x@y.no" rungWords="Everyone" marks />);
    const why = screen.getByTestId("one-card-row-why");
    expect(why.style.color).toContain("--ink-soft");
    expect(why.style.color).not.toContain("--ink-faint");
    expect(why.getAttribute("title")).toBe("You see this because it is shared at: Everyone");
  });

  test("equal values: one theirs row that says you have the same on your card", () => {
    const g = groupOf(EMAIL);
    expect(g.rows).toHaveLength(1);
    render(<TheirRow label="Email" value={g.rows[0]!.value} rungWords={g.rows[0]!.rungWords} sameAsTheirs={g.rows[0]!.sameAsTheirs} marks />);
    expect(screen.getByTestId("one-card-row-same").textContent).toBe("You have the same on your card.");
  });

  test("in Edit it says only they can change it", () => {
    render(<TheirRow label="Email" value="x@y.no" rungWords="Everyone" editing marks />);
    expect(screen.getByTestId("one-card-row-why").textContent).toBe("Shown to you as: Everyone · only they can change this");
  });

  test("with no marks (one source) no mark is drawn", () => {
    render(<TheirRow label="Email" value="x@y.no" rungWords="Everyone" marks={false} />);
    expect(screen.queryByTestId("one-card-mark")).toBeNull();
  });
});

describe("TheirRows", () => {
  test("draws only the theirs rows of a group, theirs first; a yours row of the merge is left to the app's own editor", () => {
    const g = groupOf(PHONE);
    // Both, different: both rows, theirs first, both kept.
    expect(g.rows.map((r) => r.source)).toEqual(["theirs", "yours"]);
    expect(g.bothKept).toBe(true);
    render(<TheirRows rows={g.rows} label={() => "Mobile"} marks />);
    const rows = screen.getAllByTestId("one-card-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain("+47 900 12 345");
    expect(screen.queryByText("+47 913 55 210")).toBeNull();
  });

  test("a value the app words (a skill's name) is shown as the app words it", () => {
    render(<TheirRows rows={[{ field: "a:skill", value: "https://m/e/planguage", source: "theirs", rung: "public", rungWords: "Everyone", editable: false, notes: ["deep"] }]} valueText={() => "Planguage"} marks />);
    expect(screen.getByText("Planguage")).toBeTruthy();
    expect(screen.getByText("deep")).toBeTruthy();
  });
});

describe("YourRow and OwnBlockMark", () => {
  test("YourRow draws the app's own editor untouched, with no mark beside it", () => {
    const onChange = vi.fn();
    render(
      <YourRow marks>
        <input aria-label="Mobile" defaultValue="+47 913 55 210" onChange={onChange} />
      </YourRow>,
    );
    const row = screen.getByTestId("one-card-own-row");
    expect(row.getAttribute("data-source")).toBe("yours");
    // Yours keeps the card's own surface: no shade.
    expect(row.style.background).toBe("");
    // No mark beside a row of yours.
    expect(within(row).queryByTestId("one-card-mark")).toBeNull();
    fireEvent.change(screen.getByLabelText("Mobile"), { target: { value: "1" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("with no marks YourRow draws only the editor", () => {
    render(
      <YourRow marks={false}>
        <span data-testid="editor" />
      </YourRow>,
    );
    expect(screen.getByTestId("editor")).toBeTruthy();
    expect(screen.queryByTestId("one-card-own-row")).toBeNull();
  });

  test("OwnBlockMark marks a block of own rows the app draws itself", () => {
    render(<OwnBlockMark />);
    expect(screen.getByTestId("one-card-own-block").textContent).toBe("Yours · private");
  });
});

describe("BothKeptLine and OneCardLegend", () => {
  test("both kept says so in words", () => {
    render(<BothKeptLine />);
    expect(screen.getByTestId("one-card-both-kept").textContent).toBe("Theirs and yours differ. Both are kept; nothing is overwritten.");
  });
  test("the legend names both sources with their swatches", () => {
    render(<OneCardLegend />);
    const legend = screen.getByTestId("one-card-legend");
    expect(within(legend).getAllByTestId("one-card-mark").map((m) => m.textContent)).toEqual(["Theirs", "Yours · private"]);
    expect(legend.textContent).toContain("shaded: from their online card, live, at what they share with you. They decide.");
    expect(legend.textContent).toContain("plain: only you see it. You can change it.");
  });
});

describe("OneCardFoot", () => {
  test("Unlink is a quiet link in the foot; it asks first, then calls once", () => {
    const onUnlink = vi.fn();
    render(<OneCardFoot canUnlink busy={false} placed onUnlink={onUnlink} />);
    expect(screen.getByTestId("one-card-foot").textContent).toContain("Connected to their online card.");
    fireEvent.click(screen.getByTestId("one-card-unlink"));
    expect(onUnlink).not.toHaveBeenCalled();
    expect(screen.getByTestId("one-card-unlink-ask").textContent).toContain("They stay in your circles and show as their own row.");
    fireEvent.click(screen.getByTestId("one-card-unlink-confirm"));
    expect(onUnlink).toHaveBeenCalledTimes(1);
  });
  test("Keep closes the question without unlinking", () => {
    const onUnlink = vi.fn();
    render(<OneCardFoot canUnlink busy={false} placed={false} onUnlink={onUnlink} />);
    fireEvent.click(screen.getByTestId("one-card-unlink"));
    expect(screen.getByTestId("one-card-unlink-ask").textContent).not.toContain("circles");
    fireEvent.click(screen.getByText("Keep"));
    expect(screen.queryByTestId("one-card-unlink-ask")).toBeNull();
    expect(onUnlink).not.toHaveBeenCalled();
  });
  test("a reader who cannot unlink sees the connection and no Unlink", () => {
    render(<OneCardFoot canUnlink={false} busy={false} placed={false} onUnlink={() => {}} />);
    expect(screen.queryByTestId("one-card-unlink")).toBeNull();
  });
});

// Every text this unit adds reaches 4.5:1 in light, dark and the colourblind theme. Measured: the both-kept line in plain --warn was
// 4.29:1 (light) and 2.07:1 (cvd); the legend's Theirs mark in the accent was 4.40:1 (light).
describe("contrast fixes", () => {
  test("the both-kept line is the warn colour mixed toward the ink, never the plain warn", () => {
    render(<BothKeptLine />);
    const c = screen.getByTestId("one-card-both-kept").style.color;
    expect(c).toContain("color-mix");
    expect(c).toContain("--ink");
  });
  test("the legend's Theirs mark is drawn in the ink, as on the shade", () => {
    render(<OneCardLegend />);
    const theirs = within(screen.getByTestId("one-card-legend")).getAllByTestId("one-card-mark")[0]!;
    expect(theirs.getAttribute("data-source")).toBe("theirs");
    expect(theirs.style.color).toContain("--ink");
    expect(theirs.style.color).not.toContain("--accent");
  });
  test("a row of theirs shows the purpose of its value", () => {
    render(<TheirRows rows={[{ field: "a:email", value: "w@x.no", source: "theirs", rung: "public", rungWords: "Public", editable: false, label: "Work" }]} marks />);
    expect(screen.getByTestId("one-card-row-label").textContent).toBe("Work");
  });
});

