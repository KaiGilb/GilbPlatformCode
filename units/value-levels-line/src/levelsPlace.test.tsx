// The Levels line in place: out of Edit, a click on a piece of a level line makes that piece an editor.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { levelKey, othersOf, setLevelKey, withOthers } from "@kaigilb/gilbplatformcode-value-card-model";
import { ANN, card, changes, labels, lastChange, level } from "../test/mount";
import { ME, lines, mount, options, scale, scaled, variable, viewBlock } from "../test/levels";

labels[ME] = "Me";
afterEach(cleanup);

/** The text of each line of the in-place view (the faint adds have no text of their own). */
const text = () => lines();
const piece = (name: string) => screen.getByRole("button", { name });
const textbox = (name: string) => screen.getByRole(/ kind$/.test(name) ? "combobox" : "textbox", { name });

describe("blank rows: an empty Value offers Status, Tolerable and Goal (a Development Resource: Budget) to fill", () => {
  it("a Value with no levels shows the three blank rows to a person who may edit; read-only shows none", () => {
    mount(card(), { canEdit: true });
    expect(text()).toEqual(["Status Add value", "Tolerable Add value", "Goal Add value"]);
    cleanup();
    mount(card());
    expect(text()).toEqual([]);
  });
  it("a Development Resource shows Budget in place of Goal", () => {
    mount(card({ resource: true }), { canEdit: true });
    expect(text()).toEqual(["Status Add value", "Tolerable Add value", "Budget Add value"]);
  });
  it("a card that has levels shows no blank rows", () => {
    mount(card({ levels: [level("Goal", 5)] }), { canEdit: true });
    expect(text()).toEqual(["Goal 5"]);
  });
  it("a blank row is not written until it has a value or a qualifier: a new kind, a note, nothing is sent", async () => {
    mount(card(), { canEdit: true });
    await userEvent.click(piece("Edit Level 1 kind"));
    fireEvent.change(textbox("Edit Level 1 kind"), { target: { value: "Wish" } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(0);
    // The renamed row moves to its place among the kinds (Wish is last).
    expect(text()).toEqual(["Tolerable Add value", "Goal Add value", "Wish Add value"]);
  });
  it("a value typed into a blank row writes that level, at the end of the card's levels, with the person as its source; the other blank rows stay", async () => {
    const s = card();
    mount(s, { canEdit: true, selfId: ME });
    await userEvent.click(piece("Edit Level 3 value"));
    fireEvent.change(textbox("Edit Level 3 value"), { target: { value: "5" } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().levels).toHaveLength(1);
    expect(lastChange().levels[0]).toMatchObject({ kind: "Goal", value: 5, source: { statedBy: ME } });
    expect(lastChange().scale).toBe(s.scale);
    expect(lastChange().variables).toBe(s.variables);
    expect(text()).toEqual(["Status Add value", "Tolerable Add value", "Goal 5 <- Me"]);
  });
  it("a date added to a blank row writes it too (a date is something)", async () => {
    mount(card(), { canEdit: true, selfId: ME });
    await userEvent.click(piece("Add Level 1 date"));
    fireEvent.change(screen.getByLabelText("Edit Add Level 1 date"), { target: { value: "2027-01-02" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().levels).toHaveLength(1);
    expect(lastChange().levels[0]).toMatchObject({ kind: "Status", qualifier: { when: "2027-01-02" } });
  });
  it("on a Development Resource a typed 'Goal' is Budget", async () => {
    mount(card({ resource: true }), { canEdit: true });
    await userEvent.click(piece("Edit Level 1 kind"));
    fireEvent.change(textbox("Edit Level 1 kind"), { target: { value: "Goal" } });
    await userEvent.keyboard("{Enter}");
    expect(text()).toEqual(["Tolerable Add value", "Budget Add value", "Budget Add value"]);
    await userEvent.click(piece("Edit Level 1 value"));
    fireEvent.change(textbox("Edit Level 1 value"), { target: { value: "9" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().levels[0]).toMatchObject({ kind: "Budget", value: 9 });
  });
});

describe("the number: the author's text, kept as typed", () => {
  const start = () => card({ levels: [level("Goal", 5)] });
  async function type(value: string) {
    await userEvent.click(piece("Edit Level 1 value"));
    fireEvent.change(textbox("Edit Level 1 value"), { target: { value } });
    await userEvent.keyboard("{Enter}");
  }
  it("'5-10' is a range drawn at 7.5, shown as written", async () => {
    mount(start(), { canEdit: true });
    await type("5-10");
    expect(lastChange().levels[0]).toMatchObject({ value: 7.5, valueText: "5-10" });
    expect(piece("Edit Level 1 value").textContent).toBe("5-10");
  });
  it("'approx. 5' is a text with no number, kept as written", async () => {
    mount(start(), { canEdit: true });
    await type("approx. 5");
    expect(lastChange().levels[0]).toMatchObject({ value: null, valueText: "approx. 5" });
    expect(piece("Edit Level 1 value").textContent).toBe("approx. 5");
  });
  it("'5.50' keeps its text; '1,5' is read as 1.5", async () => {
    mount(start(), { canEdit: true });
    await type("5.50");
    expect(lastChange().levels[0]).toMatchObject({ value: 5.5, valueText: "5.50" });
    await type("1,5");
    expect(lastChange().levels[0]!.value).toBe(1.5);
    expect(lastChange().levels[0]!.valueText).toBeUndefined();
  });
  it("'0,001' is read as 1 (the model's rule, kept): the typed text is not kept", async () => {
    mount(start(), { canEdit: true });
    await type("0,001");
    expect(lastChange().levels[0]!.value).toBe(1);
    expect(lastChange().levels[0]!.valueText).toBeUndefined();
    expect(piece("Edit Level 1 value").textContent).toBe("1");
  });
  it("an emptied number clears the level's number", async () => {
    mount(start(), { canEdit: true });
    await type("");
    expect(lastChange().levels[0]!.value).toBeNull();
    expect(piece("Edit Level 1 value").textContent).toBe(" Add value");
  });
  it("the same number again sends nothing, even with blanks around it", async () => {
    mount(start(), { canEdit: true });
    await type(" 5 ");
    expect(changes).toHaveLength(0);
  });
  it("the whole card goes up with the unknown items of the list and the level's key carried, and the other levels as the same objects", async () => {
    const a = level("Goal", 5);
    const b = level("Wish", 9);
    setLevelKey(a, "rec-a");
    const list = withOthers([a, b], [{ unknownItem: true }]);
    const s = card({ levels: list });
    mount(s, { canEdit: true });
    await userEvent.click(piece("Edit Level 1 value"));
    fireEvent.change(textbox("Edit Level 1 value"), { target: { value: "6" } });
    await userEvent.keyboard("{Enter}");
    const next = lastChange().levels;
    expect(next).not.toBe(list);
    expect(othersOf(next)).toEqual([{ unknownItem: true }]);
    expect(levelKey(next[0])).toBe("rec-a");
    expect(next[0]).not.toBe(a);
    expect(next[1]).toBe(b);
  });
});

describe("the date: three ways to type it", () => {
  const start = () => card({ levels: [level("Goal", 5, { when: "2027-06-30" })] });
  it("click the date, pick another, Enter: one change", async () => {
    mount(start(), { canEdit: true });
    await userEvent.click(piece("Edit Level 1 date"));
    const input = screen.getByLabelText("Edit Level 1 date") as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.value).toBe("2027-06-30");
    fireEvent.change(input, { target: { value: "2028-01-15" } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().levels[0]!.qualifier.when).toBe("2028-01-15");
  });
  it("leaving the date commits it once", async () => {
    mount(start(), { canEdit: true });
    await userEvent.click(piece("Edit Level 1 date"));
    const input = screen.getByLabelText("Edit Level 1 date");
    fireEvent.change(input, { target: { value: "2028-01-15" } });
    fireEvent.blur(input);
    fireEvent.blur(input);
    expect(changes).toHaveLength(1);
  });
  it("Escape commits nothing and the old date is back", async () => {
    mount(start(), { canEdit: true });
    await userEvent.click(piece("Edit Level 1 date"));
    fireEvent.change(screen.getByLabelText("Edit Level 1 date"), { target: { value: "2028-01-15" } });
    await userEvent.keyboard("{Escape}");
    expect(changes).toHaveLength(0);
    expect(piece("Edit Level 1 date").textContent).toBe("2027-06-30");
  });
  it("an emptied date clears the level's date", async () => {
    mount(start(), { canEdit: true });
    await userEvent.click(piece("Edit Level 1 date"));
    fireEvent.change(screen.getByLabelText("Edit Level 1 date"), { target: { value: "" } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().levels[0]!.qualifier.when).toBe("");
    expect(text()).toEqual(["Goal 5"]);
  });
  it("'Add a date' on a level with none: a date picked and Enter sets it; nothing picked sends nothing", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { canEdit: true });
    await userEvent.click(piece("Add Level 1 date"));
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(0);
    await userEvent.click(piece("Add Level 1 date"));
    fireEvent.change(screen.getByLabelText("Edit Add Level 1 date"), { target: { value: "2027-06-30" } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().levels[0]!.qualifier.when).toBe("2027-06-30");
    expect(screen.queryByRole("button", { name: "Add Level 1 date" })).toBeNull();
  });
  it("'Add a date' never clears: a picked date taken back to nothing sends nothing", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { canEdit: true });
    await userEvent.click(piece("Add Level 1 date"));
    const input = screen.getByLabelText("Edit Add Level 1 date");
    fireEvent.change(input, { target: { value: "2027-06-30" } });
    fireEvent.change(input, { target: { value: "" } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(0);
  });
  it("'Add a date' is offered only where there is no date; Escape closes it with nothing sent", async () => {
    mount(card({ levels: [level("Goal", 5), level("Wish", 7, { when: "2027-01-01" })] }), { canEdit: true });
    expect(screen.getAllByRole("button", { name: /^Add Level \d date$/ })).toHaveLength(1);
    await userEvent.click(piece("Add Level 1 date"));
    fireEvent.change(screen.getByLabelText("Edit Add Level 1 date"), { target: { value: "2027-06-30" } });
    await userEvent.keyboard("{Escape}");
    expect(changes).toHaveLength(0);
    expect(piece("Add Level 1 date")).toBeTruthy();
  });
});

describe("the kind, the conditions, the side, the source and the note, in place", () => {
  it("the kind: a new word replaces it (trimmed); the same word or a blank one sends nothing; the datalist offers the standard kinds", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { canEdit: true, selfId: ME });
    const list = document.querySelector("datalist")!;
    expect(list.id).toBe("plan-level-kinds-rec1");
    expect([...list.querySelectorAll("option")].map((o) => o.getAttribute("value"))).toEqual(["Fail", "Goal", "Past", "Status", "Survival", "Tolerable", "Wish"]);
    await userEvent.click(piece("Edit Level 1 kind"));
    expect(textbox("Edit Level 1 kind").getAttribute("list")).toBe("plan-level-kinds-rec1");
    fireEvent.change(textbox("Edit Level 1 kind"), { target: { value: "  Wish " } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().levels[0]).toMatchObject({ kind: "Wish", source: { statedBy: ME } });
    await userEvent.click(piece("Edit Level 1 kind"));
    fireEvent.change(textbox("Edit Level 1 kind"), { target: { value: "   " } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
  });
  it("on a Development Resource the datalist offers Budget, not Goal", () => {
    mount(card({ resource: true, levels: [level("Budget", 5)] }), { canEdit: true });
    expect([...document.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"))).toContain("Budget");
    expect([...document.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"))).not.toContain("Goal");
  });
  it("a condition: edited in place, an emptied one is removed; the person is not made the source by it", async () => {
    mount(card({ levels: [level("Goal", 5, { conditions: ["Release 3.0", "in Oslo"] })] }), { canEdit: true, selfId: ME });
    await userEvent.click(screen.getAllByRole("button", { name: "Edit Level 1 condition" })[0]!);
    fireEvent.change(textbox("Edit Level 1 condition"), { target: { value: "Release 4.0" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().levels[0]!.qualifier.conditions).toEqual(["Release 4.0", "in Oslo"]);
    expect(lastChange().levels[0]!.source).toEqual({});
    await userEvent.click(screen.getAllByRole("button", { name: "Edit Level 1 condition" })[0]!);
    fireEvent.change(textbox("Edit Level 1 condition"), { target: { value: "  " } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().levels[0]!.qualifier.conditions).toEqual(["in Oslo"]);
  });
  it("'Add a condition' (the faint + before the bracket closes) adds a trimmed condition; blank adds none", async () => {
    mount(card({ levels: [level("Goal", 5, { when: "2027-06-30" })] }), { canEdit: true });
    await userEvent.click(piece("Add Level 1 condition"));
    fireEvent.change(screen.getByLabelText("Edit Add Level 1 condition"), { target: { value: "  Release 3.0 " } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().levels[0]!.qualifier.conditions).toEqual(["Release 3.0"]);
    expect(lastChange().levels[0]!.source).toEqual({});
    await userEvent.click(piece("Add Level 1 condition"));
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
  });
  it("the side of a bipolar level: a select in place, with 'One side', low and high", async () => {
    mount(card({ scale: scale({ direction: "target" }), levels: [level("Goal", 5, { side: "low" })] }), { canEdit: true });
    expect(text()[0]).toBe("Goal [low] 5");
    await userEvent.click(piece("Edit Level 1 side"));
    const select = screen.getByLabelText("Edit Level 1 side") as HTMLSelectElement;
    expect([...select.options].map((o) => `${o.value}:${o.textContent}`)).toEqual([":One side", "low:low", "high:high"]);
    fireEvent.change(select, { target: { value: "high" } });
    expect(lastChange().levels[0]!.qualifier.side).toBe("high");
    expect(text()[0]).toBe("Goal [high] 5");
  });
  it("the note and the words of a source: edited in place; the note is shown only with a source", async () => {
    mount(card({ levels: [level("Goal", 5, { source: { text: "Ann" }, note: "estimate" })] }), { canEdit: true, selfId: ME });
    await userEvent.click(piece("Edit Level 1 note"));
    fireEvent.change(textbox("Edit Level 1 note"), { target: { value: "confirmed" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().levels[0]).toMatchObject({ note: "confirmed", source: { text: "Ann" } });
    await userEvent.click(piece("Edit Level 1 source"));
    fireEvent.change(textbox("Edit Level 1 source"), { target: { value: "Ben" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().levels[0]!.source).toEqual({ text: "Ben" });
    expect(text()[0]).toBe("Goal 5 <- Ben confirmed");
  });
  it("a source that is a record opens the source picker in place; Escape closes it; the label is the host's", async () => {
    mount(card({ levels: [level("Goal", 5, { source: { statedBy: ANN } })] }), { canEdit: true });
    expect(piece("Edit Level 1 source").textContent).toBe("Ann Co");
    await userEvent.click(piece("Edit Level 1 source"));
    expect(document.querySelector('[data-plan-source="Level 1 source"]')?.getAttribute("data-editing")).toBe("true");
    await userEvent.click(screen.getByLabelText("Level 1 source"));
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector('[data-plan-source="Level 1 source"]')).toBeNull();
    expect(piece("Edit Level 1 source")).toBeTruthy();
    expect(changes).toHaveLength(0);
  });
  it("a source picked in place is handed up as the level's source, not stamped", async () => {
    mount(card({ levels: [level("Goal", 5, { source: { statedBy: ANN } })] }), { canEdit: true, selfId: ME });
    await userEvent.click(piece("Edit Level 1 source"));
    await userEvent.type(screen.getByLabelText("Level 1 source"), "field notes");
    await userEvent.click(await screen.findByRole("button", { name: 'Use "field notes" as text' }));
    expect(lastChange().levels[0]!.source).toEqual({ statedBy: ANN, text: "field notes" });
  });
});

describe("the qualifiers of a level, in place", () => {
  const start = () => scaled({ levels: [level("Goal", 5, { when: "2027-06-30" })] });
  it("the faint chip offers the Scale's names the level has not set (only the Scale's); a name opens the chooser; a pick is one change without a stamp", async () => {
    mount(start(), { canEdit: true, selfId: ME });
    await userEvent.click(piece("Add Level 1 qualifier"));
    expect(within(screen.getByRole("menu", { name: "Level 1 unset qualifiers" })).getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Add a qualifier ▸", "Add a condition"]);
    await userEvent.click(screen.getByRole("menuitem", { name: /Add a qualifier/ }));
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Add a qualifier ▸", "Add a condition", "Task", "Country"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Level 1 Country" }));
    await userEvent.click(screen.getByLabelText("Level 1 Country Sweden"));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(changes).toHaveLength(1);
    expect(lastChange().levels[0]!.qualifier.variables).toEqual({ Country: "Sweden" });
    expect(lastChange().levels[0]!.source).toEqual({});
    expect(text()[0]).toBe("Goal [2027-06-30, Sweden] 5");
  });
  it("a set choice is a piece: a click opens the chooser with the choice ticked; Clear removes it", async () => {
    mount(scaled({ levels: [level("Goal", 5, { variables: { Country: "Norway" } })] }), { canEdit: true });
    await userEvent.click(piece("Edit Level 1 Country"));
    expect((screen.getByLabelText("Level 1 Country Norway") as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Clear Level 1 Country" }));
    expect(lastChange().levels[0]!.qualifier.variables).toEqual({});
  });
  it("several options may be ticked: they are written as a list", async () => {
    mount(scaled({ levels: [level("Goal", 5, { variables: { Country: "Norway" } })] }), { canEdit: true });
    await userEvent.click(piece("Edit Level 1 Country"));
    await userEvent.click(screen.getByLabelText("Level 1 Country Sweden"));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(lastChange().levels[0]!.qualifier.variables).toEqual({ Country: ["Norway", "Sweden"] });
    expect(text()[0]).toBe("Goal [Country = {Norway, Sweden}] 5");
  });
  it("a choice is written under the name the card defines (its spelling), not the spelling of the menu", async () => {
    mount(scaled({ levels: [level("Goal", 5)] }), { canEdit: true });
    await userEvent.click(piece("Add Level 1 qualifier"));
    await userEvent.click(screen.getByRole("menuitem", { name: /Add a qualifier/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Level 1 Task" }));
    fireEvent.change(screen.getByLabelText("Edit Level 1 Task"), { target: { value: "Install" } });
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(lastChange().levels[0]!.qualifier.variables).toEqual({ Task: "Install" });
  });
  it("a Scale with no qualifier names offers the date and the condition only", () => {
    mount(card({ levels: [level("Goal", 5)] }), { canEdit: true });
    expect(screen.queryByRole("button", { name: "Add Level 1 qualifier" })).toBeNull();
    expect(piece("Add Level 1 date")).toBeTruthy();
    expect(piece("Add Level 1 condition")).toBeTruthy();
  });
  it("a name the level already sets is not offered again; when all are set the menu has only the condition", async () => {
    mount(scaled({ levels: [level("Goal", 5, { variables: { Country: "Norway", Task: "Install" } })] }), { canEdit: true });
    expect(screen.queryByRole("button", { name: "Add Level 1 qualifier" })).toBeNull();
    expect(piece("Add Level 1 condition")).toBeTruthy();
  });
  it("the Scale's names, in the Scale's order, are what the chooser knows: a defined name the Scale lacks is not offered", async () => {
    mount(card({ scale: scale({ rate: "per [Task]" }), variables: [variable("Old", { options: options("a") })], levels: [level("Goal", 5)] }), { canEdit: true });
    await userEvent.click(piece("Add Level 1 qualifier"));
    await userEvent.click(screen.getByRole("menuitem", { name: /Add a qualifier/ }));
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Add a qualifier ▸", "Add a condition", "Task"]);
  });
  it("the chooser offers the values other levels use, when the name has no options", async () => {
    mount(scaled({ levels: [level("Goal", 5, { variables: { Task: "Install" } }), level("Wish", 7)] }), { canEdit: true });
    await userEvent.click(piece("Add Level 2 qualifier"));
    await userEvent.click(screen.getByRole("menuitem", { name: /Add a qualifier/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Level 2 Task" }));
    expect([...document.querySelectorAll("datalist option")].some((o) => o.getAttribute("value") === "Install")).toBe(true);
  });
  it("the values offered for a name are the ones other levels use for that name, not for another", async () => {
    mount(scaled({ levels: [level("Goal", 5, { variables: { Country: "Norway" } }), level("Wish", 7)] }), { canEdit: true });
    await userEvent.click(piece("Add Level 2 qualifier"));
    await userEvent.click(screen.getByRole("menuitem", { name: /Add a qualifier/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Level 2 Task" }));
    expect([...document.querySelectorAll("datalist option")].some((o) => o.getAttribute("value") === "Norway")).toBe(false);
  });
  it("the faint 'Add a condition' beside the bracket is for a level with no unset name; with unset names the chip's menu holds it", () => {
    mount(scaled({ levels: [level("Goal", 5)] }), { canEdit: true });
    expect(screen.queryByRole("button", { name: "Add Level 1 condition" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add Level 1 qualifier" })).toBeTruthy();
  });
  it("a condition of blanks adds nothing", async () => {
    mount(card({ levels: [level("Goal", 5, { when: "2027-06-30" })] }), { canEdit: true });
    await userEvent.click(piece("Add Level 1 condition"));
    fireEvent.change(screen.getByLabelText("Edit Add Level 1 condition"), { target: { value: "   " } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(0);
  });
});

describe("the + Level panel", () => {
  it("is closed until the button is pressed; it holds the kind menu, one button for each kind offered, 'Other word…', the paste box and its button; Escape closes it", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { canEdit: true });
    expect(screen.queryByTestId("plan-level-panel")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "+ Level" }));
    const panel = screen.getByTestId("plan-level-panel");
    expect(within(panel).getByTestId("plan-level-add")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Pick a level kind" }).textContent).toBe("+ Level");
    expect(within(panel).getAllByRole("button", { name: /^Add \w+ level$/ }).map((b) => b.textContent)).toEqual(["Past", "Status", "Tolerable", "Goal", "Wish"]);
    expect(within(panel).getByRole("button", { name: "Other level word" })).toBeTruthy();
    expect(within(panel).getByLabelText("Paste lines")).toBeTruthy();
    fireEvent.keyDown(within(panel).getByLabelText("Paste lines"), { key: "Escape" });
    expect(screen.queryByTestId("plan-level-panel")).toBeNull();
    expect(screen.getByRole("button", { name: "+ Level" })).toBeTruthy();
  });
  it("a Development Resource offers Budget in place of Goal", async () => {
    mount(card({ resource: true, levels: [level("Budget", 5)] }), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "+ Level" }));
    expect(screen.getAllByRole("button", { name: /^Add \w+ level$/ }).map((b) => b.textContent)).toEqual(["Past", "Status", "Tolerable", "Budget", "Wish"]);
  });
  it("a kind button adds a blank row (nothing is written), copying the qualifier choices of the latest level; a Status gets today's date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    try {
      mount(scaled({ levels: [level("Goal", 5, { when: "2027-06-30", variables: { Country: "Norway" }, conditions: ["Release 3.0"] })] }), { canEdit: true });
      await userEvent.click(screen.getByRole("button", { name: "+ Level" }));
      await userEvent.click(screen.getByRole("button", { name: "Add Status level" }));
      expect(changes).toHaveLength(0);
      expect(text().filter((t) => t.startsWith("Status"))).toEqual(["Status [2026-10-27, Release 3.0, Norway] Add value"]);
      await userEvent.click(screen.getByRole("button", { name: "Add Wish level" }));
      expect(text().filter((t) => t.startsWith("Wish"))).toEqual(["Wish [Release 3.0, Norway] Add value"]);
      expect(changes).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("a Development Resource's 'Other word' of 'Goal' adds a Budget row", async () => {
    mount(card({ resource: true, levels: [level("Budget", 5)] }), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "+ Level" }));
    await userEvent.click(screen.getByRole("button", { name: "Other level word" }));
    const input = screen.getByLabelText("New level kind");
    fireEvent.change(input, { target: { value: "Goal" } });
    await userEvent.type(input, "{Enter}");
    expect(text().filter((t) => t.startsWith("Budget"))).toHaveLength(2);
    expect((input as HTMLInputElement).value).toBe("");
  });
  it("'Other word' opens a box for any word and Enter adds a row; a blank word adds none", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "+ Level" }));
    expect(screen.queryByLabelText("New level kind")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Other level word" }));
    const input = screen.getByLabelText("New level kind");
    await userEvent.type(input, "   {Enter}");
    expect(text()).toEqual(["Goal 5"]);
    await userEvent.type(input, "Trend{Enter}");
    expect(text()).toEqual(["Goal 5", "Trend Add value"]);
    expect(changes).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Other level word" }));
    expect(screen.queryByLabelText("New level kind")).toBeNull();
  });
});

describe("the kind menu", () => {
  async function open(resource = false) {
    mount(card({ resource, levels: [level(resource ? "Budget" : "Goal", 5)] }), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "+ Level" }));
    await userEvent.click(screen.getByRole("button", { name: "Pick a level kind" }));
    return screen.getByRole("menu", { name: "Level kinds" });
  }
  it("is a menu in a portal on the page body, under the button, with the five kinds and 'Other word…'; the first item has the focus", async () => {
    const menu = await open();
    expect(menu.parentElement).toBe(document.body);
    expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Past", "Status", "Tolerable", "Goal", "Wish", "Other word…"]);
    expect(document.activeElement).toBe(within(menu).getAllByRole("menuitem")[0]);
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.zIndex).toBe("100");
    expect(screen.getByRole("button", { name: "Pick a level kind" }).getAttribute("aria-expanded")).toBe("true");
  });
  it("a Development Resource's menu has Budget in place of Goal", async () => {
    const menu = await open(true);
    expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Past", "Status", "Tolerable", "Budget", "Wish", "Other word…"]);
  });
  it("the arrow keys move through the items and wrap at both ends", async () => {
    const menu = await open();
    const items = within(menu).getAllByRole("menuitem");
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(document.activeElement).toBe(items[items.length - 1]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[0]);
  });
  it("a pick closes the menu and adds a blank row of that kind; 'Other word…' closes it and focuses the word box", async () => {
    const menu = await open();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Wish" }));
    expect(screen.queryByRole("menu", { name: "Level kinds" })).toBeNull();
    expect(text()).toEqual(["Goal 5", "Wish Add value"]);
    await userEvent.click(screen.getByRole("button", { name: "Pick a level kind" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Other word…" }));
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("New level kind")));
  });
  it("Escape closes it and gives the focus back to its button, and is the open stack's top entry while it is open", async () => {
    const { topOpen } = await import("@kaigilb/gilbplatformcode-open-popups");
    const menu = await open();
    expect(topOpen()?.el()).toBe(menu);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Level kinds" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pick a level kind" }));
    expect(topOpen()).toBeNull();
  });
  it("a press outside closes it without moving the focus; a press on its button is left to the button", async () => {
    await open();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "Level kinds" })).toBeNull();
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Pick a level kind" }));
  });
  it("opening it again closes another menu of the same kind (the stack is exclusive)", async () => {
    const { registerOpen, topOpen } = await import("@kaigilb/gilbplatformcode-open-popups");
    await open();
    const dismissed = vi.fn();
    let off = () => {};
    act(() => {
      off = registerOpen({ el: () => null, close: dismissed, exclusive: true });
    });
    expect(screen.queryByRole("menu", { name: "Level kinds" })).toBeNull();
    expect(topOpen()?.close).toBe(dismissed);
    off();
  });
});

describe("paste: many level lines at once", () => {
  async function openPanel(props = {}, start = scaled({ levels: [level("Goal", 5)] })) {
    mount(start, { canEdit: true, ...props });
    await userEvent.click(screen.getByRole("button", { name: "+ Level" }));
    return screen.getByLabelText("Paste lines") as HTMLTextAreaElement;
  }
  const add = () => screen.getByRole("button", { name: "Add pasted lines" }) as HTMLButtonElement;
  it("the placeholder shows an example line (Goal; on a Development Resource Budget)", async () => {
    const box = await openPanel();
    expect(box.placeholder).toBe("Paste lines, e.g. Goal [2027-06-30, Release 3.0] 5 <- Kai-Zen estimate");
    cleanup();
    const r = await openPanel({}, card({ resource: true, levels: [level("Budget", 5)] }));
    expect(r.placeholder).toBe("Paste lines, e.g. Budget [2027-06-30, Release 3.0] 5 <- Kai-Zen estimate");
  });
  it("the button is off until something is pasted", async () => {
    const box = await openPanel();
    expect(add().disabled).toBe(true);
    fireEvent.change(box, { target: { value: "  \n " } });
    expect(add().disabled).toBe(true);
    fireEvent.change(box, { target: { value: "Goal 1" } });
    expect(add().disabled).toBe(false);
  });
  it("each line becomes a level, added after the card's own in one change; lines that cannot be read and blank lines are skipped; the box is emptied", async () => {
    const s = scaled({ levels: [level("Goal", 5)] });
    const box = await openPanel({}, s);
    fireEvent.change(box, { target: { value: "Status [2026-10-27] 9 <- survey\r\n\r\nnonsense !!\r\nWish [Norway] 12\n[2027] 4" } });
    await userEvent.click(add());
    expect(changes).toHaveLength(1);
    expect(lastChange().levels).toHaveLength(3);
    expect(lastChange().levels[0]).toBe(s.levels[0]);
    expect(lastChange().levels[1]).toMatchObject({ kind: "Status", value: 9, source: { text: "survey" }, qualifier: { when: "2026-10-27" } });
    expect(lastChange().levels[2]).toMatchObject({ kind: "Wish", value: 12, qualifier: { variables: { Country: "Norway" } } });
    expect(box.value).toBe("");
    expect(screen.queryByTestId("plan-paste-warning")).toBeNull();
  });
  it("a pasted number keeps its text as typed ('5.50'), and a pasted line is not stamped with the person", async () => {
    const box = await openPanel({ selfId: ME });
    fireEvent.change(box, { target: { value: "Wish 5.50" } });
    await userEvent.click(add());
    expect(lastChange().levels[1]).toMatchObject({ value: 5.5, valueText: "5.50", source: {} });
  });
  it("a warning about what the reading changed is shown in a status line, each once, joined by full stops, until the box is typed in again", async () => {
    const box = await openPanel();
    fireEvent.change(box, { target: { value: "Wish [Country = {ALL, Norway}] 1\nPast [Country = {ALL, Sweden}] 2\nTolerable [Country = {ALL, Norway}] 3" } });
    await userEvent.click(add());
    const warning = screen.getByTestId("plan-paste-warning");
    expect(warning.getAttribute("role")).toBe("status");
    expect(warning.textContent).toBe("Country: ALL replaces the other values");
    expect(lastChange().levels).toHaveLength(4);
    fireEvent.change(box, { target: { value: "x" } });
    expect(screen.queryByTestId("plan-paste-warning")).toBeNull();
  });
  it("a paste with nothing readable sends nothing, empties the box, and shows no warning", async () => {
    const box = await openPanel();
    fireEvent.change(box, { target: { value: "!!! ???" } });
    await userEvent.click(add());
    expect(changes).toHaveLength(0);
    expect(box.value).toBe("");
  });
  it("on a Development Resource a pasted Goal is stored as Budget", async () => {
    const box = await openPanel({}, card({ resource: true, levels: [level("Budget", 5)] }));
    fireEvent.change(box, { target: { value: "Goal 7" } });
    await userEvent.click(add());
    expect(lastChange().levels.map((l) => l.kind)).toEqual(["Budget", "Budget"]);
  });
  it("the unknown items of the list are carried, and the levels already there are the same objects", async () => {
    const a = level("Goal", 5);
    const list = withOthers([a], [{ unknownItem: true }]);
    const box = await openPanel({}, card({ levels: list }));
    fireEvent.change(box, { target: { value: "Wish 1" } });
    await userEvent.click(add());
    expect(othersOf(lastChange().levels)).toEqual([{ unknownItem: true }]);
    expect(lastChange().levels[0]).toBe(a);
  });
});

describe("the DOM contract with the graph's \"New qualifier set...\" (value-graph's focusLevelEditor)", () => {
  // The graph walks up from itself to the first ancestor that holds [data-testid="plan-level-add"] or [data-testid="plan-levels-view"], looks in it for
  // [data-testid="plan-level-panel"] or [data-testid="plan-level-add"]; if none, it presses the button whose text is "+ Level", and finds the panel;
  // in the panel it focuses input[aria-label="New level kind"], else the first button or input.
  it("the read view carries plan-levels-view and a button whose text is '+ Level'; its panel carries plan-level-panel around plan-level-add, and 'Other word' brings the input 'New level kind'", async () => {
    mount(card({ levels: [level("Goal", 5)] }), { canEdit: true });
    expect(viewBlock()).toBeTruthy();
    const plus = [...viewBlock().querySelectorAll("button")].find((b) => b.textContent === "+ Level")!;
    await userEvent.click(plus);
    const panel = viewBlock().querySelector('[data-testid="plan-level-panel"]')!;
    expect(panel.querySelector('[data-testid="plan-level-add"]')).toBeTruthy();
    expect(panel.querySelector('input[aria-label="New level kind"]')).toBeNull();
    await userEvent.click(within(panel as HTMLElement).getByRole("button", { name: "Other level word" }));
    expect(panel.querySelector('input[aria-label="New level kind"]')).toBeTruthy();
  });
  it("in Edit the controls are there with no panel: plan-level-add holds the kind menu button '+ Level'", () => {
    mount(card({ levels: [level("Goal", 5)] }), { editing: true });
    const add = document.querySelector('[data-testid="plan-level-add"]')!;
    expect(add).toBeTruthy();
    expect(document.querySelector('[data-testid="plan-level-panel"]')).toBeNull();
    expect([...add.querySelectorAll("button")].some((b) => b.textContent === "+ Level")).toBe(true);
    expect(document.querySelector('[data-testid="plan-levels-view"]')).toBeNull();
  });
});

describe("the view block itself", () => {
  it("has the kinds' datalist only for a person who may edit", () => {
    mount(card({ levels: [level("Goal", 5)] }), { canEdit: true });
    expect(viewBlock().querySelector("datalist")).toBeTruthy();
    cleanup();
    mount(card({ levels: [level("Goal", 5)] }));
    expect(viewBlock().querySelector("datalist")).toBeNull();
  });
});
