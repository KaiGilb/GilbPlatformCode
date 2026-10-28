// The Levels line in Edit: one card for each level with a box for each part, the blank rows, and the add controls.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { levelKey, othersOf, setLevelKey, withOthers } from "@kaigilb/gilbplatformcode-value-card-model";
import { card, changes, labels, lastChange, level } from "../test/mount";
import { ME, mount, options, scale, scaled, variable } from "../test/levels";

labels[ME] = "Me";
afterEach(cleanup);

const rows = () => screen.queryAllByTestId("plan-level-row");
const kinds = () => rows().map((r) => (within(r).getByRole("combobox") as HTMLInputElement).value);
const row = (n: number) => rows()[n - 1]!;

describe("the rows", () => {
  it("one card for each level, sorted like the read line, each with its kind, date, value, source, note, copy and remove", () => {
    mount(card({ levels: [level("Wish", 9), level("Goal", 5, { when: "2027-06-30" }), level("Status", 2)] }), { editing: true });
    expect(kinds()).toEqual(["Status", "Wish", "Goal"]);
    const r = within(row(3));
    expect((r.getByLabelText("Level 2 date") as HTMLInputElement).value).toBe("2027-06-30");
    expect((r.getByLabelText("Level 2 value") as HTMLInputElement).value).toBe("5");
    expect(r.getByLabelText("Level 2 note")).toBeTruthy();
    expect(document.querySelector('[data-plan-source="Level 2 source"]')?.getAttribute("data-editing")).toBe("true");
    expect(r.getByRole("button", { name: "Copy qualifier to a new level" })).toBeTruthy();
    expect(r.getByRole("button", { name: "Remove level 2" })).toBeTruthy();
  });
  it("the labels count the levels in the order they are stored, not in the order they are drawn", () => {
    mount(card({ levels: [level("Wish", 9), level("Goal", 5)] }), { editing: true });
    expect(within(row(1)).getByLabelText("Level 2 value")).toBeTruthy();
    expect(within(row(2)).getByLabelText("Level 1 value")).toBeTruthy();
  });
  it("an empty Value shows the blank rows Status, Tolerable and Goal (a Development Resource: Budget)", () => {
    mount(card(), { editing: true });
    expect(kinds()).toEqual(["Status", "Tolerable", "Goal"]);
    cleanup();
    mount(card({ resource: true }), { editing: true });
    expect(kinds()).toEqual(["Status", "Tolerable", "Budget"]);
  });
  it("the datalist of kinds is always there in Edit: the standard kinds, and on a Development Resource Budget in place of Goal", () => {
    mount(card(), { editing: true });
    const kindsOf = () => [...document.querySelectorAll("datalist#plan-level-kinds-rec1 option")].map((o) => o.getAttribute("value"));
    expect(kindsOf()).toEqual(["Fail", "Goal", "Past", "Status", "Survival", "Tolerable", "Wish"]);
    cleanup();
    mount(card({ resource: true }), { editing: true });
    expect(kindsOf()).toEqual(["Budget", "Fail", "Past", "Status", "Survival", "Tolerable", "Wish"]);
  });
  it("a defined name the Scale does not have, which the level does not use, gets no button", () => {
    mount(scaled({ variables: [variable("Country", { options: options("Norway") }), variable("Old", { options: options("a") })], levels: [level("Goal", 5)] }), { editing: true });
    expect(within(row(1)).queryByRole("button", { name: "Edit Level 1 Old" })).toBeNull();
    expect(within(row(1)).getByRole("button", { name: "Edit Level 1 Country" })).toBeTruthy();
  });
  it("groups with different qualifiers have a little room between them", () => {
    mount(card({ levels: [level("Status", 1), level("Goal", 2, { when: "2030-01-01" })] }), { editing: true });
    expect(document.querySelectorAll("div.h-4")).toHaveLength(1);
  });
});

describe("the kind box", () => {
  it("saves a changed word on leaving, trimmed, with the person as the source; the same word or a blank one is put back and sends nothing", () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true, selfId: ME });
    const box = () => within(row(1)).getByRole("combobox") as HTMLInputElement;
    fireEvent.change(box(), { target: { value: "  Wish " } });
    fireEvent.blur(box());
    expect(changes).toHaveLength(1);
    expect(lastChange().levels[0]).toMatchObject({ kind: "Wish", source: { statedBy: ME } });
    fireEvent.change(box(), { target: { value: "   " } });
    fireEvent.blur(box());
    expect(changes).toHaveLength(1);
    expect(box().value).toBe("Wish");
    fireEvent.blur(box());
    expect(changes).toHaveLength(1);
  });
  it("on a Development Resource 'Goal' is stored as Budget", () => {
    mount(card({ resource: true, levels: [level("Wish", 5)] }), { editing: true });
    const box = within(row(1)).getByRole("combobox") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "goal" } });
    fireEvent.blur(box);
    expect(lastChange().levels[0]!.kind).toBe("Budget");
  });
  it("a blank row given another kind stays a blank row: nothing is sent", () => {
    mount(card(), { editing: true });
    const box = within(row(1)).getByRole("combobox") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "Wish" } });
    fireEvent.blur(box);
    expect(changes).toHaveLength(0);
    expect(kinds()).toEqual(["Tolerable", "Goal", "Wish"]);
  });
});

describe("the date box writes every change", () => {
  it("a picked date goes up at once, an emptied one clears it, each as one change", () => {
    mount(card({ levels: [level("Goal", 5, { when: "2027-06-30" })] }), { editing: true, selfId: ME });
    const input = () => within(row(1)).getByLabelText("Level 1 date") as HTMLInputElement;
    fireEvent.change(input(), { target: { value: "2028-01-15" } });
    expect(changes).toHaveLength(1);
    expect(lastChange().levels[0]!.qualifier.when).toBe("2028-01-15");
    expect(lastChange().levels[0]!.source).toEqual({});
    fireEvent.change(input(), { target: { value: "" } });
    expect(changes).toHaveLength(2);
    expect(lastChange().levels[0]!.qualifier.when).toBe("");
  });
  it("a date typed into a blank row writes that level", () => {
    mount(card(), { editing: true });
    fireEvent.change(within(row(1)).getByLabelText("Level 1 date"), { target: { value: "2027-01-02" } });
    expect(changes).toHaveLength(1);
    expect(lastChange().levels).toEqual([expect.objectContaining({ kind: "Status", qualifier: expect.objectContaining({ when: "2027-01-02" }) })]);
  });
});

describe("the number box", () => {
  it("Enter saves the text once, leaving after it sends nothing more, blanks around the same number send nothing", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true, selfId: ME });
    const box = () => within(row(1)).getByLabelText("Level 1 value") as HTMLInputElement;
    await userEvent.clear(box());
    await userEvent.type(box(), "5-10{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().levels[0]).toMatchObject({ value: 7.5, valueText: "5-10", source: { statedBy: ME } });
    expect(box().value).toBe("5-10");
    fireEvent.blur(box());
    expect(changes).toHaveLength(1);
    fireEvent.change(box(), { target: { value: " 5-10 " } });
    fireEvent.blur(box());
    expect(changes).toHaveLength(1);
  });
  it("'0,001' is read as 1, and the box then shows 1", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true });
    const box = () => within(row(1)).getByLabelText("Level 1 value") as HTMLInputElement;
    fireEvent.change(box(), { target: { value: "0,001" } });
    fireEvent.blur(box());
    expect(lastChange().levels[0]!.value).toBe(1);
    expect(box().value).toBe("1");
  });
  it("the text that was typed is sent untrimmed ('approx. 5 ')", () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true });
    const box = within(row(1)).getByLabelText("Level 1 value");
    fireEvent.change(box, { target: { value: "approx. 5 " } });
    fireEvent.blur(box);
    expect(lastChange().levels[0]).toMatchObject({ value: null, valueText: "approx. 5" });
  });
  it("a value typed into a blank row writes that level at the end", () => {
    const s = card({ levels: [] });
    mount(s, { editing: true, selfId: ME });
    const box = within(row(3)).getByLabelText("Level 3 value");
    fireEvent.change(box, { target: { value: "5" } });
    fireEvent.blur(box);
    expect(lastChange().levels).toEqual([expect.objectContaining({ kind: "Goal", value: 5 })]);
    expect(kinds()).toEqual(["Status", "Tolerable", "Goal"]);
  });
  it("a new value from the card replaces the box's text", () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true });
    const box = () => within(row(1)).getByLabelText("Level 1 value") as HTMLInputElement;
    fireEvent.change(box(), { target: { value: "6" } });
    fireEvent.blur(box());
    expect(box().value).toBe("6");
  });
});

describe("the qualifier boxes", () => {
  it("one button for each of the Scale's defined names, in the Scale's order; it shows 'Name: choice' or the name alone", () => {
    mount(scaled({ levels: [level("Goal", 5, { variables: { Country: ["Norway", "Sweden"] } })] }), { editing: true });
    expect(within(row(1)).getByRole("button", { name: "Edit Level 1 Task" }).textContent).toBe("Task");
    expect(within(row(1)).getByRole("button", { name: "Edit Level 1 Country" }).textContent).toBe("Country: {Norway, Sweden}");
  });
  it("a pick is one change, not stamped; Clear removes the choice", async () => {
    mount(scaled({ levels: [level("Goal", 5)] }), { editing: true, selfId: ME });
    await userEvent.click(within(row(1)).getByRole("button", { name: "Edit Level 1 Country" }));
    await userEvent.click(screen.getByLabelText("Level 1 Country Sweden"));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(changes).toHaveLength(1);
    expect(lastChange().levels[0]!.qualifier.variables).toEqual({ Country: "Sweden" });
    expect(lastChange().levels[0]!.source).toEqual({});
    await userEvent.click(within(row(1)).getByRole("button", { name: "Edit Level 1 Country" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear Level 1 Country" }));
    expect(lastChange().levels[0]!.qualifier.variables).toEqual({});
  });
  it("a choice for a name the Scale does not have is kept, shown greyed with 'Not in the Scale', and can be cleared", async () => {
    mount(scaled({ levels: [level("Goal", 5, { variables: { Gone: "x" } })] }), { editing: true });
    const btn = within(row(1)).getByRole("button", { name: "Edit Level 1 Gone" });
    expect(btn.textContent).toBe("Gone: x");
    expect(btn.className).toContain("opacity-60");
    expect(row(1).textContent).toContain("Not in the Scale");
    await userEvent.click(btn);
    await userEvent.click(screen.getByRole("button", { name: "Clear Level 1 Gone" }));
    expect(lastChange().levels[0]!.qualifier.variables).toEqual({});
  });
  it("the side select is there only for a Scale where a range in the middle is best", () => {
    mount(card({ scale: scale({ direction: "target" }), levels: [level("Goal", 5, { side: "high" })] }), { editing: true });
    const select = within(row(1)).getByLabelText("Level 1 side") as HTMLSelectElement;
    expect(select.value).toBe("high");
    fireEvent.change(select, { target: { value: "low" } });
    expect(lastChange().levels[0]!.qualifier.side).toBe("low");
    cleanup();
    mount(card({ scale: scale({ direction: "higher" }), levels: [level("Goal", 5)] }), { editing: true });
    expect(screen.queryByLabelText("Level 1 side")).toBeNull();
  });
});

describe("the conditions", () => {
  it("Enter adds a trimmed condition and empties the box; a blank one adds nothing; the button removes one", async () => {
    mount(card({ levels: [level("Goal", 5, { conditions: ["Release 3.0"] })] }), { editing: true, selfId: ME });
    const box = () => within(row(1)).getByLabelText("Level 1 condition") as HTMLInputElement;
    expect(box().placeholder).toBe("Condition, Enter");
    fireEvent.change(box(), { target: { value: "   " } });
    await userEvent.type(box(), "{Enter}");
    expect(changes).toHaveLength(0);
    fireEvent.change(box(), { target: { value: "  in Oslo " } });
    await userEvent.type(box(), "{Enter}");
    expect(lastChange().levels[0]!.qualifier.conditions).toEqual(["Release 3.0", "in Oslo"]);
    expect(lastChange().levels[0]!.source).toEqual({});
    expect(box().value).toBe("");
    await userEvent.click(within(row(1)).getByRole("button", { name: "Remove condition Release 3.0" }));
    expect(lastChange().levels[0]!.qualifier.conditions).toEqual(["in Oslo"]);
  });
});

describe("the note, the source, copy and remove", () => {
  it("the note box saves on Enter or leaving, and is not a stamp; the source box is not either", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true, selfId: ME });
    const note = within(row(1)).getByLabelText("Level 1 note") as HTMLInputElement;
    expect(note.placeholder).toBe("Note, e.g. estimate");
    fireEvent.change(note, { target: { value: "estimate" } });
    await userEvent.type(note, "{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().levels[0]).toMatchObject({ note: "estimate", source: {} });
    await userEvent.type(screen.getByLabelText("Level 1 source"), "survey");
    await userEvent.click(await screen.findByRole("button", { name: 'Use "survey" as text' }));
    expect(lastChange().levels[0]!.source).toEqual({ text: "survey" });
    expect(lastChange().levels[0]!.note).toBe("estimate");
  });
  it("there is no '+ New stakeholder' on a level's source", () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true });
    expect(screen.queryByText("+ New stakeholder")).toBeNull();
  });
  it("'Copy qualifier to a new level' adds a Goal (a Development Resource: Budget) with its own copy of the qualifier and no number", async () => {
    const s = card({ levels: [level("Wish", 7, { when: "2027-06-30", variables: { Country: "Norway" }, conditions: ["Release 3.0"], side: "low", note: "x", source: { text: "y" } })] });
    mount(s, { editing: true });
    await userEvent.click(within(row(1)).getByRole("button", { name: "Copy qualifier to a new level" }));
    const next = lastChange().levels;
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(s.levels[0]);
    expect(next[1]).toMatchObject({ kind: "Goal", value: null, note: "", source: {}, qualifier: { when: "2027-06-30", variables: { Country: "Norway" }, conditions: ["Release 3.0"], side: "low" } });
    expect(next[1]!.qualifier.variables).not.toBe(s.levels[0]!.qualifier.variables);
    expect(next[1]!.qualifier.conditions).not.toBe(s.levels[0]!.qualifier.conditions);
    cleanup();
    mount(card({ resource: true, levels: [level("Wish", 7)] }), { editing: true });
    await userEvent.click(within(row(1)).getByRole("button", { name: "Copy qualifier to a new level" }));
    expect(lastChange().levels[1]!.kind).toBe("Budget");
  });
  it("'Remove level' drops that level only, keeps the others as the same objects; removing a blank row sends nothing", async () => {
    const s = card({ levels: [level("Goal", 5), level("Wish", 7), level("Past", 3)] });
    mount(s, { editing: true });
    await userEvent.click(screen.getByRole("button", { name: "Remove level 2" }));
    expect(lastChange().levels.map((l) => l.kind)).toEqual(["Goal", "Past"]);
    expect(lastChange().levels[0]).toBe(s.levels[0]);
    expect(lastChange().levels[1]).toBe(s.levels[2]);
    cleanup();
    mount(card(), { editing: true });
    await userEvent.click(screen.getByRole("button", { name: "Remove level 1" }));
    expect(kinds()).toEqual(["Tolerable", "Goal"]);
    expect(changes).toHaveLength(1);
  });
});

describe("adding", () => {
  it("the add controls are in the card with no panel to open: the kind menu, the kind buttons, 'Other word…' and the paste box", () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true });
    expect(screen.getByTestId("plan-level-add")).toBeTruthy();
    expect(screen.queryByTestId("plan-level-panel")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Add \w+ level$/ }).map((b) => b.textContent)).toEqual(["Past", "Status", "Tolerable", "Goal", "Wish"]);
    expect(screen.getByLabelText("Paste lines")).toBeTruthy();
  });
  it("a kind button adds a blank row whose number box has the focus; nothing is written until it has something", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true });
    await userEvent.click(screen.getByRole("button", { name: "Add Wish level" }));
    expect(changes).toHaveLength(0);
    expect(kinds()).toEqual(["Goal", "Wish"]);
    expect(document.activeElement).toBe(within(row(2)).getByLabelText("Level 2 value"));
    await userEvent.keyboard("12{Enter}");
    expect(lastChange().levels.map((l) => `${l.kind}:${l.value}`)).toEqual(["Goal:5", "Wish:12"]);
  });
  it("the kind menu adds a row the same way", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true });
    await userEvent.click(screen.getByRole("button", { name: "Pick a level kind" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Past" }));
    expect(kinds()).toEqual(["Past", "Goal"]);
    expect(changes).toHaveLength(0);
  });
  it("paste works as in place", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true });
    fireEvent.change(screen.getByLabelText("Paste lines"), { target: { value: "Wish 8\nPast 2" } });
    await userEvent.click(screen.getByRole("button", { name: "Add pasted lines" }));
    expect(lastChange().levels.map((l) => l.kind)).toEqual(["Goal", "Wish", "Past"]);
  });
});

describe("what goes up", () => {
  it("the unknown items of the list and the key of the edited level ride along; the other levels are the same objects", async () => {
    const a = level("Goal", 5);
    const b = level("Wish", 9);
    setLevelKey(a, "rec-a");
    const raw = { unknownMember: 1 };
    Object.defineProperty(a, "raw", { value: raw, enumerable: false });
    const list = withOthers([a, b], [{ unknownItem: true }]);
    const s = card({ levels: list });
    mount(s, { editing: true });
    const note = within(row(1)).getByLabelText("Level 1 note");
    fireEvent.change(note, { target: { value: "n" } });
    fireEvent.blur(note);
    const next = lastChange().levels;
    expect(othersOf(next)).toEqual([{ unknownItem: true }]);
    expect(levelKey(next[0])).toBe("rec-a");
    expect((next[0] as unknown as { raw?: unknown }).raw).toBe(raw);
    expect(Object.keys(next[0]!)).not.toContain("raw");
    expect(next[1]).toBe(b);
    expect(lastChange().scale).toBe(s.scale);
    expect(lastChange().variables).toBe(s.variables);
  });
  it("on a Development Resource every write stores Goal as Budget, also in levels the edit did not touch", () => {
    const stray = level("Goal", 5);
    const other = level("Wish", 9);
    mount(card({ resource: true, levels: [stray, other] }), { editing: true });
    const note = within(rows().find((r) => within(r).queryByLabelText("Level 2 note"))!).getByLabelText("Level 2 note");
    fireEvent.change(note, { target: { value: "n" } });
    fireEvent.blur(note);
    expect(lastChange().levels.map((l) => l.kind)).toEqual(["Budget", "Wish"]);
    expect(lastChange().levels[0]).not.toBe(stray);
  });
  it("a Value leaves its kinds alone", () => {
    const a = level("Goal", 5);
    mount(card({ levels: [a, level("Wish", 9)] }), { editing: true });
    const note = within(row(2)).getByLabelText("Level 2 note");
    fireEvent.change(note, { target: { value: "n" } });
    fireEvent.blur(note);
    expect(lastChange().levels[0]).toBe(a);
  });
});
