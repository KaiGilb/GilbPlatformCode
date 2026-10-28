// The Levels line, read: the lines as text, in order, with the note for a source that is a record and the notes the line adds.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { PlanValueLevelsBody } from "./index";
import { ANN, Card, card, hostCalls, level, makeHost, render } from "../test/mount";
import { lines, mount, scale, scaled, viewBlock } from "../test/levels";

afterEach(cleanup);

describe("read: each level is one line of text, in order", () => {
  it("draws 'Kind [date, conditions, choices] number <- source note'", () => {
    mount(card({ levels: [level("Goal", 5, { when: "2027-06-30", conditions: ["Release 3.0"], source: { text: "Ann" }, note: "estimate" })] }));
    expect(lines()).toEqual(["Goal [2027-06-30, Release 3.0] 5 <- Ann estimate"]);
  });
  it("sorts a group by the standard kinds, custom words last, whatever the stored order; groups keep their first-seen order", () => {
    mount(card({ levels: [level("Wish", 9), level("Trend", 1), level("Goal", 5), level("Status", 2), level("Fail", 0), level("Goal", 6, { when: "2030-01-01" }), level("Status", 3, { when: "2030-01-01" })] }));
    expect(lines()).toEqual(["Fail 0", "Status 2", "Goal 5", "Wish 9", "Trend 1", "Status [2030-01-01] 3", "Goal [2030-01-01] 6"]);
  });
  it("puts a little room between groups of different qualifiers, and none inside a group", () => {
    mount(card({ levels: [level("Status", 2), level("Goal", 5), level("Goal", 6, { when: "2030-01-01" })] }));
    const gaps = viewBlock().querySelectorAll("div.h-3");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.nextElementSibling?.textContent).toBe("Goal [2030-01-01] 6");
  });
  it("a Development Resource sorts Budget where a Value sorts Goal", () => {
    mount(card({ resource: true, levels: [level("Wish", 9), level("Budget", 5), level("Tolerable", 3), level("Status", 1)] }));
    expect(lines()).toEqual(["Status 1", "Tolerable 3", "Budget 5", "Wish 9"]);
  });
  it("choices are written by option name when the option is unique among the Scale's names, else 'Name = option'", () => {
    mount(scaled({ levels: [level("Goal", 5, { variables: { Country: "Norway" } }), level("Goal", 6, { variables: { Task: "Install" } })] }));
    expect(lines()[0]).toBe("Goal [Norway] 5");
    expect(lines()[1]).toBe("Goal [Task = Install] 6");
  });
  it("shows the number as the author wrote it when that is not the plain number (a range, words, 5.50)", () => {
    mount(card({ levels: [level("Goal", 7.5, { valueText: "5-10" }), level("Wish", null, { valueText: "approx. 5" }), level("Past", 5.5, { valueText: "5.50" })] }));
    expect(lines()).toEqual(["Past 5.50", "Goal 5-10", "Wish approx. 5"]);
  });
  it("a read-only card with no levels draws an empty block, no hint, no button, no blank rows", () => {
    mount(card());
    expect(viewBlock().textContent).toBe("");
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(document.querySelector("datalist")).toBeNull();
  });
  it("a read-only card has no buttons even with levels", () => {
    mount(card({ levels: [level("Goal", 5, { source: { text: "x" } })] }));
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
  it("a choice for a name the Scale no longer has is kept, with a short grey note after it", () => {
    mount(card({ scale: scale({ rate: "per [Task]" }), levels: [level("Goal", 5, { variables: { Gone: "x" } })] }));
    expect(lines()).toEqual(["Goal [Gone = x (not in the Scale)] 5"]);
    expect(screen.getByTestId("level-not-in-scale").textContent).toBe(" (not in the Scale)");
  });
  it("a choice for a name the Scale has gets no note", () => {
    mount(scaled({ levels: [level("Goal", 5, { variables: { Country: "Norway" } })] }));
    expect(screen.queryByTestId("level-not-in-scale")).toBeNull();
  });
});

describe("read: a source that is a record shows its live label, from the host", () => {
  it("draws the host's label for a linked source with no words, 'the dots' while the host has none yet", () => {
    mount(card({ levels: [level("Goal", 5, { source: { statedBy: ANN } })] }));
    expect(lines()).toEqual(["Goal 5 <- Ann Co"]);
    expect(hostCalls.useLinkLabel).toContain(ANN);
    cleanup();
    mount(card({ levels: [level("Goal", 5, { source: { statedBy: "https://h.example.test/base/e/unknown" } })] }));
    expect(lines()).toEqual(["Goal 5 <- …"]);
  });
  it("a derivedFrom link is read the same way; a source with words never asks for the link", () => {
    mount(card({ levels: [level("Goal", 5, { source: { derivedFrom: ANN } })] }));
    expect(lines()).toEqual(["Goal 5 <- Ann Co"]);
    cleanup();
    hostCalls.useLinkLabel.length = 0;
    mount(card({ levels: [level("Goal", 5, { source: { text: "words", statedBy: ANN } })] }));
    expect(lines()).toEqual(["Goal 5 <- words"]);
    expect(hostCalls.useLinkLabel).not.toContain(ANN);
    expect(hostCalls.useLinkLabel).toContain("undefined");
  });
  it("the host's hook is called once for each level on every render, in the order of the lines drawn", () => {
    mount(card({ levels: [level("Goal", 5, { source: { statedBy: ANN } }), level("Status", 2)] }));
    // Status first (sorted), then Goal.
    expect(hostCalls.useLinkLabel.slice(0, 2)).toEqual(["undefined", ANN]);
  });
  it("the label hook is the host's own: a hook member that uses React state works, and a missing provider throws an error that names it", () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Card Body={PlanValueLevelsBody} start={card({ levels: [level("Goal", 5)] })} />, null)).toThrowError(/value-line-kit: wrap the card in <ValueLinesHostContext\.Provider/);
    } finally {
      console.error = quiet;
    }
    cleanup();
    // With no levels to draw (read-only) the host is not asked.
    expect(() => render(<Card Body={PlanValueLevelsBody} start={card()} />, null)).not.toThrow();
  });
  it("uses the host given, not a copy: a host whose hook answers by vault id gets the card's vault", () => {
    const seen = vi.fn();
    const host = makeHost({ useLinkLabel: (uri, vaultId) => { seen(uri, vaultId); return "Label"; } });
    mount(card({ levels: [level("Goal", 5, { source: { statedBy: ANN } })] }), {}, host);
    expect(seen).toHaveBeenCalledWith(ANN, "https://v.example.test/vault");
    expect(lines()).toEqual(["Goal 5 <- Label"]);
  });
});

describe("read: the cap note and the card's group write", () => {
  it("shows the find's cap note above the lines", () => {
    mount(card({ levels: [level("Goal", 5)] }), { host: { capped: { total: 450, cap: 300 } } });
    expect(screen.getByTestId("plan-levels-capped").textContent).toBe("Showing the first 300 of 450 records at this level.");
    expect(viewBlock().firstElementChild).toBe(screen.getByTestId("plan-levels-capped"));
  });
  it("no cap, no note; the progress and the notice of the host are not this line's", () => {
    mount(card({ levels: [level("Goal", 5)] }), { host: { progress: { done: 1, total: 5 }, onNotice: vi.fn() } });
    expect(screen.queryByTestId("plan-levels-capped")).toBeNull();
  });
  it("the cap note is in the read view only, not in Edit", () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true, host: { capped: { total: 450, cap: 300 } } });
    expect(screen.queryByTestId("plan-levels-capped")).toBeNull();
  });
});

describe("older stored lists", () => {
  const legacy = (o = {}) => ({ levels: 3, qualifiers: 0, meters: 0, busy: false, canMove: true, onMove: vi.fn(), ...o });
  it("an old list of levels is shown as it is, read-only even in Edit, with the one move button", async () => {
    const l = legacy();
    mount(card({ levels: [level("Goal", 5)] }), { editing: true, canEdit: true, legacy: l });
    expect(screen.queryByTestId("plan-level-row")).toBeNull();
    expect(lines()).toEqual(["Goal 5"]);
    expect(screen.queryByRole("button", { name: "+ Level" })).toBeNull();
    const btn = screen.getByTestId("plan-levels-move");
    expect(btn.textContent).toBe("Move 3 levels into their own records");
    btn.click();
    expect(l.onMove).toHaveBeenCalledTimes(1);
  });
  it("with no old levels the line is editable, and the button is not here when another group's list is first", () => {
    mount(card({ levels: [level("Goal", 5)] }), { canEdit: true, legacy: legacy({ levels: 0, qualifiers: 2 }) });
    expect(screen.getByRole("button", { name: "+ Level" })).toBeTruthy();
    expect(screen.queryByTestId("plan-levels-move")).toBeNull();
  });
  it("the move button is disabled while the card is busy and absent when the person cannot move", () => {
    mount(card({ levels: [level("Goal", 5)] }), { legacy: legacy({ busy: true }) });
    expect((screen.getByTestId("plan-levels-move") as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    mount(card({ levels: [level("Goal", 5)] }), { legacy: legacy({ canMove: false }) });
    expect(screen.queryByTestId("plan-levels-move")).toBeNull();
  });
});
