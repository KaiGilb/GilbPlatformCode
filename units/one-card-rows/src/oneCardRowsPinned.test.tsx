// Pins of every export of the unit: the export list, the words, the shade, the styles each part draws and the props each part reads.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { W } from "@kaigilb/gilbplatformcode-stakeholder-ui-kit";
import * as unit from "./index";
import { BothKeptLine, LinkMark, ONE_CARD_WORDS, ONLINE_SHADE, OneCardFoot, OneCardLegend, OwnBlockMark, SourceMark, TheirRow, TheirRows, YourRow } from "./index";

afterEach(cleanup);

describe("the exports", () => {
  test("are these, and no more", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["BothKeptLine", "LinkMark", "ONE_CARD_WORDS", "ONLINE_SHADE", "OneCardFoot", "OneCardLegend", "OwnBlockMark", "SourceMark", "TheirRow", "TheirRows", "YourRow"].sort(),
    );
  });

  test("the words are the ones the card shows", () => {
    expect(Object.keys(ONE_CARD_WORDS).sort()).toEqual(
      ["bothKept", "connected", "keep", "legendTheirs", "legendYours", "linked", "onlyThey", "removing", "same", "sharedAt", "shownAs", "theirs", "theirsTitle", "unlink", "unlinkAsk", "unlinkPlaced", "yours", "yoursTitle"].sort(),
    );
    expect(ONE_CARD_WORDS.shownAs("Public")).toBe("Shown to you as: Public");
    expect(ONE_CARD_WORDS.sharedAt("Public")).toBe("You see this because it is shared at: Public");
    expect(ONE_CARD_WORDS.onlyThey).toBe(" · only they can change this");
    expect(ONE_CARD_WORDS.linked).toBe("From their online card");
    expect(ONE_CARD_WORDS.unlinkPlaced).toBe(" They stay in your circles and show as their own row.");
    expect(ONE_CARD_WORDS.removing).toBe("Removing…");
    expect(ONE_CARD_WORDS.keep).toBe("Keep");
    expect(ONE_CARD_WORDS.unlinkAsk).toBe("Removes the link between your card and their online card. Your own fields and notes stay on your card; their fields leave it.");
  });

  test("the shade is the host's variable, then a second name, then a light value", () => {
    expect(ONLINE_SHADE).toBe("var(--online-shade, var(--color-online-shade, #EAE8E3))");
  });
});

describe("SourceMark", () => {
  test("a yours mark is soft ink on no fill, with a frame, and a theirs mark is the accent on a soft fill", () => {
    render(
      <>
        <SourceMark source="theirs" />
        <SourceMark source="yours" />
      </>,
    );
    const [theirs, yours] = screen.getAllByTestId("one-card-mark");
    expect(theirs!.style.color).toContain("--accent-ink");
    expect(theirs!.style.background).toContain("--accent-soft");
    expect(theirs!.style.border).toContain("transparent");
    expect(yours!.style.color).toContain("--ink-soft");
    expect(yours!.style.background).toBe("transparent");
    expect(yours!.style.border).toContain("color-mix");
    expect(yours!.getAttribute("title")).toBe(ONE_CARD_WORDS.yoursTitle);
    expect(theirs!.querySelector("svg circle")?.getAttribute("r")).toBe("9");
    expect(yours!.querySelector("svg circle")?.getAttribute("r")).toBe("4");
  });
});

describe("TheirRow", () => {
  test("draws no label when none is given, and the label when it is", () => {
    const { rerender } = render(<TheirRow value="v" label={null} />);
    expect(screen.queryByTestId("one-card-row-label")).toBeNull();
    rerender(<TheirRow value="v" label="Email" />);
    expect(screen.getByTestId("one-card-row-label").textContent).toBe("Email");
  });

  test("the shade runs the group's full width: the side padding is the bleed, 16 px by default", () => {
    const { rerender } = render(<TheirRow value="v" />);
    expect(screen.getByTestId("one-card-row").style.margin).toBe("0px -16px");
    expect(screen.getByTestId("one-card-row").style.padding).toBe("8px 16px");
    rerender(<TheirRow value="v" bleed={24} />);
    expect(screen.getByTestId("one-card-row").style.margin).toBe("0px -24px");
    expect(screen.getByTestId("one-card-row").style.padding).toBe("8px 24px");
  });

  test("draws the notes, the same-on-your-card line only when it is true, and the rung line only when words are given", () => {
    const { rerender } = render(<TheirRow value="v" notes={["deep", "wide"]} sameAsTheirs={false} />);
    expect(screen.getByText("deep")).toBeTruthy();
    expect(screen.getByText("wide")).toBeTruthy();
    expect(screen.queryByTestId("one-card-row-same")).toBeNull();
    expect(screen.queryByTestId("one-card-row-why")).toBeNull();
    rerender(<TheirRow value="v" sameAsTheirs rungWords="Public" />);
    expect(screen.getByTestId("one-card-row-same").textContent).toBe(ONE_CARD_WORDS.same);
    expect(screen.getByTestId("one-card-row-why").textContent).toBe("Shown to you as: Public");
  });

  test("a value may be any node", () => {
    render(<TheirRow value={<b data-testid="node">x</b>} />);
    expect(within(screen.getByTestId("one-card-row-value")).getByTestId("node").textContent).toBe("x");
  });

  test("marks default to on", () => {
    render(<TheirRow value="v" />);
    expect(screen.getAllByTestId("one-card-mark")).toHaveLength(1);
  });
});

describe("TheirRows", () => {
  const rows = [
    { field: "a:email", value: "a@example.test", source: "theirs", rung: "public", rungWords: "Public", editable: false, label: "Work" },
    { field: "a:phone", value: "+47 1", source: "theirs", editable: false },
    { field: "a:phone", value: "+47 2", source: "yours", editable: true },
  ] as const;

  test("the caller's label wins, then the row's own label, then none", () => {
    render(<TheirRows rows={rows} label={(r) => (r.field === "a:phone" ? "Mobile" : null)} />);
    expect(screen.getAllByTestId("one-card-row-label").map((l) => l.textContent)).toEqual(["Work", "Mobile"]);
  });

  test("with no label function the row's own label is drawn", () => {
    render(<TheirRows rows={rows} />);
    expect(screen.getAllByTestId("one-card-row-label").map((l) => l.textContent)).toEqual(["Work"]);
  });

  test("the value is the merge's, or the caller's wording of it", () => {
    const { rerender } = render(<TheirRows rows={rows} />);
    expect(screen.getAllByTestId("one-card-row-value").map((v) => v.textContent)).toEqual(["a@example.test", "+47 1"]);
    rerender(<TheirRows rows={rows} valueText={(r) => `<${r.value}>`} />);
    expect(screen.getAllByTestId("one-card-row-value").map((v) => v.textContent)).toEqual(["<a@example.test>", "<+47 1>"]);
  });

  test("editing, marks and bleed are passed to every row", () => {
    render(<TheirRows rows={rows} editing marks={false} bleed={4} />);
    expect(screen.queryByTestId("one-card-mark")).toBeNull();
    expect(screen.getAllByTestId("one-card-row")[0]!.style.margin).toBe("0px -4px");
    expect(screen.getByTestId("one-card-row-why").textContent).toContain("only they can change this");
  });

  test("a row marked the same on your card says so", () => {
    render(<TheirRows rows={[{ field: "a:email", value: "a@example.test", source: "theirs", editable: false, sameAsTheirs: true }]} />);
    expect(screen.getByTestId("one-card-row-same")).toBeTruthy();
  });

  test("no theirs row draws nothing", () => {
    const { container } = render(<TheirRows rows={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("LinkMark", () => {
  test("is the chain link in the live-link colour, 14 px, with its words visually hidden", () => {
    render(<LinkMark />);
    const mark = screen.getByTestId("one-card-mark");
    expect(mark.style.color).toBe(W.link);
    expect(mark.querySelector("svg")?.getAttribute("width")).toBe("14");
    const words = mark.querySelector("span")!;
    expect(words.textContent).toBe("From their online card");
    expect(words.style.position).toBe("absolute");
    expect(words.style.width).toBe("1px");
  });
});

describe("OwnBlockMark, YourRow, BothKeptLine, OneCardLegend", () => {
  test("OwnBlockMark is a yours mark right-aligned", () => {
    render(<OwnBlockMark />);
    const block = screen.getByTestId("one-card-own-block");
    expect(block.style.justifyContent).toBe("flex-end");
    expect(within(block).getByTestId("one-card-mark").getAttribute("data-source")).toBe("yours");
  });

  test("YourRow wraps the editor once, in a box that can shrink", () => {
    render(<YourRow marks><span /></YourRow>);
    expect(screen.getByTestId("one-card-own-row").style.minWidth).toBe("0");
  });

  test("BothKeptLine mixes the warn colour 55% with the ink", () => {
    render(<BothKeptLine />);
    expect(screen.getByTestId("one-card-both-kept").style.color).toBe("color-mix(in srgb, var(--warn, var(--color-error-dark, #9a6a1e)) 55%, var(--ink, var(--color-ink, #2a2622)))");
  });

  test("OneCardLegend draws a swatch of the shade and a swatch of the surface", () => {
    render(<OneCardLegend />);
    const swatches = [...screen.getByTestId("one-card-legend").querySelectorAll('span[aria-hidden="true"]')] as HTMLElement[];
    expect(swatches).toHaveLength(2);
    expect(swatches[0]!.style.background).toBe(ONLINE_SHADE);
    expect(swatches[1]!.style.background).toContain("--surface");
  });
});

describe("OneCardFoot", () => {
  test("a busy foot disables Unlink and says Removing", () => {
    render(<OneCardFoot canUnlink busy placed={false} onUnlink={() => {}} />);
    const b = screen.getByTestId("one-card-unlink") as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.textContent).toBe("Removing…");
  });

  test("the question is a group named Remove the link, and the confirm button closes it and calls once", () => {
    const onUnlink = vi.fn();
    render(<OneCardFoot canUnlink busy={false} placed={false} onUnlink={onUnlink} />);
    fireEvent.click(screen.getByTestId("one-card-unlink"));
    const ask = screen.getByTestId("one-card-unlink-ask");
    expect(ask.getAttribute("role")).toBe("group");
    expect(ask.getAttribute("aria-label")).toBe("Remove the link");
    fireEvent.click(screen.getByTestId("one-card-unlink-confirm"));
    expect(onUnlink).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("one-card-unlink-ask")).toBeNull();
    expect(screen.getByTestId("one-card-foot").textContent).toContain(ONE_CARD_WORDS.connected);
  });

  test("while the question is open and an unlink is under way, the confirm button is disabled and says Removing", () => {
    const { rerender } = render(<OneCardFoot canUnlink busy={false} placed onUnlink={() => {}} />);
    fireEvent.click(screen.getByTestId("one-card-unlink"));
    rerender(<OneCardFoot canUnlink busy placed onUnlink={() => {}} />);
    const confirm = screen.getByTestId("one-card-unlink-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toBe("Removing…");
  });
});
