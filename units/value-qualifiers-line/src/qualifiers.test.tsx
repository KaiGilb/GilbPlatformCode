// The Qualifiers line: the rows of the Scale's names, their options and definitions, and each edit handed up as the whole card.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { blankVariable, emptyValueCard, othersOf, withOthers, type ScaleVariable, type ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanVariablesBody } from "./index";
import { Card, card, changes, lastChange, level, render, type Props } from "../test/mount";

afterEach(cleanup);

const ME = "https://h.example.test/base/e/me";
const scale = (more: Partial<ValueCardData["scale"]> = {}): ValueCardData["scale"] => ({ ...emptyValueCard().scale, ...more });
const v = (name: string, more: Partial<ScaleVariable> = {}): ScaleVariable => ({ ...blankVariable(name), ...more });
const options = (...names: string[]) => names.map((name) => ({ name, definition: "" }));
const mount = (start: ValueCardData, props: Props = {}) => render(<Card Body={PlanVariablesBody} start={start} props={props} />);
const rows = () => screen.queryAllByTestId(/^plan-variable-(view-)?row$/);
/** A Scale that names Task and Country, with Country defined. */
const base = () =>
  card({
    scale: scale({ rate: "per [Task] in [Country]" }),
    variables: [v("Country", { definition: "where", options: options("Norway", "Sweden"), defaultOption: "Norway" })],
  });
const rowOf = (name: string) => rows().find((r) => r.getAttribute("data-qualifier-row") === name.toLowerCase())!;

describe("read: one row for each name the Scale gives", () => {
  it("lists the Scale's names in Scale order, each with the DOM marks the Scale's chips look for", () => {
    mount(base());
    expect(rows().map((r) => r.getAttribute("data-qualifier-row"))).toEqual(["task", "country"]);
    expect(rows().map((r) => r.getAttribute("data-in-scale"))).toEqual(["yes", "yes"]);
    expect(rows().map((r) => r.getAttribute("data-has-record"))).toEqual(["no", "yes"]);
    expect(rows().map((r) => r.getAttribute("tabindex"))).toEqual(["-1", "-1"]);
    expect(rows().map((r) => r.getAttribute("data-testid"))).toEqual(["plan-variable-view-row", "plan-variable-view-row"]);
    expect(screen.getAllByTestId("plan-variable-name").map((n) => n.textContent)).toEqual(["[Task]", "[Country]"]);
  });
  it("shows the options, the default badge and the definition of a defined name; a name with no record shows only its name", () => {
    mount(base());
    expect(rowOf("task").textContent).toBe("[Task]");
    expect(within(rowOf("country")).getAllByTestId("plan-variable-option").map((o) => o.textContent)).toEqual(["defaultNorway", "Sweden"]);
    expect(within(rowOf("country")).getAllByTestId("plan-variable-default")).toHaveLength(1);
    expect(rowOf("country").textContent).toContain("definition: where");
  });
  it("a defined name the Scale no longer has comes after the Scale's names, greyed, with 'Not in the Scale'", () => {
    mount(card({ scale: scale({ rate: "per [Task]" }), variables: [v("Old", { options: options("a")})] }));
    expect(rows().map((r) => r.getAttribute("data-qualifier-row"))).toEqual(["task", "old"]);
    expect(rowOf("old").getAttribute("data-in-scale")).toBe("no");
    expect(rowOf("old").className).toContain("opacity-60");
    expect(rowOf("old").textContent).toContain("Not in the Scale");
    expect(screen.queryByTestId("plan-variable-not-in-scale")).toBeNull();
  });
  it("names of the unit and the context count as the Scale's, once each, matched without case", () => {
    mount(card({ scale: scale({ unit: "per [country]", context: "in [Country] and [ Task ]" }), variables: [v("COUNTRY")] }));
    expect(rows().map((r) => r.getAttribute("data-qualifier-row"))).toEqual(["country", "task"]);
    expect(rowOf("country").getAttribute("data-has-record")).toBe("yes");
  });
  it("read-only: no buttons and no source line for a record with no source", () => {
    mount(base());
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
  it("a record with a source shows it under its row", () => {
    mount(card({ scale: scale({ rate: "[Task]" }), variables: [v("Task", { source: { text: "a survey" } })] }));
    expect(rowOf("task").textContent).toContain("Source: a survey");
  });
  it("a definition that is a list reads as text; the repair button is only for a person who may edit", () => {
    mount(card({ scale: scale({ rate: "[Country]" }), variables: [v("Country", { definition: "Norway, Sweden" })] }));
    expect(screen.queryByRole("button", { name: /values/ })).toBeNull();
  });
});

describe("in place: out of Edit, a click on a value makes it an editor", () => {
  it("the first value of a name with no record makes its record: the new variable goes last, with the person as its source", async () => {
    const s = base();
    mount(s, { canEdit: true, selfId: ME });
    await userEvent.click(within(rowOf("task")).getByRole("button", { name: "Add Qualifier 1 value" }));
    await userEvent.type(screen.getByLabelText("New Qualifier 1 value"), "Edit, Review{Enter}");
    expect(changes).toHaveLength(1);
    const made = lastChange().variables;
    expect(made.map((x) => x.name)).toEqual(["Country", "Task"]);
    expect(made[1]).toMatchObject({ name: "Task", definition: "", defaultOption: "", options: options("Edit", "Review"), source: { statedBy: ME } });
    expect(made[0]).toBe(s.variables[0]);
    expect(lastChange().scale).toBe(s.scale);
    expect(lastChange().levels).toBe(s.levels);
    // The box stays open for the next value.
    expect(screen.getByLabelText("New Qualifier 1 value")).toBeTruthy();
  });
  it("'+ value' keeps typed words apart at , and ;, drops blanks, and sends nothing for words it already has (any case)", async () => {
    mount(base(), { canEdit: true });
    await userEvent.click(within(rowOf("country")).getByRole("button", { name: "Add Qualifier 2 value" }));
    const box = screen.getByLabelText("New Qualifier 2 value");
    fireEvent.change(box, { target: { value: "norway ; ; sweden" } });
    await userEvent.type(box, "{Enter}");
    expect(changes).toHaveLength(0);
    fireEvent.change(box, { target: { value: " Denmark;Finland, " } });
    await userEvent.type(box, "{Enter}");
    expect(lastChange().variables[0]!.options.map((o) => o.name)).toEqual(["Norway", "Sweden", "Denmark", "Finland"]);
    expect((box as HTMLInputElement).value).toBe("");
  });
  it("'+ value': leaving takes the typed words and closes; Escape drops them and closes", async () => {
    mount(base(), { canEdit: true });
    await userEvent.click(within(rowOf("country")).getByRole("button", { name: "Add Qualifier 2 value" }));
    fireEvent.change(screen.getByLabelText("New Qualifier 2 value"), { target: { value: "Denmark" } });
    fireEvent.blur(screen.getByLabelText("New Qualifier 2 value"));
    expect(lastChange().variables[0]!.options.map((o) => o.name)).toEqual(["Norway", "Sweden", "Denmark"]);
    expect(screen.queryByLabelText("New Qualifier 2 value")).toBeNull();
    await userEvent.click(within(rowOf("country")).getByRole("button", { name: "Add Qualifier 2 value" }));
    fireEvent.change(screen.getByLabelText("New Qualifier 2 value"), { target: { value: "Iceland" } });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("New Qualifier 2 value")).toBeNull();
    expect(changes).toHaveLength(1);
  });
  it("a new value keeps the other options' definitions, and the default", async () => {
    const s = card({ scale: scale({ rate: "[C]" }), variables: [v("C", { options: [{ name: "a", definition: "the first" }, { name: "b", definition: "" }], defaultOption: "b" })] });
    mount(s, { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "Add Qualifier 1 value" }));
    fireEvent.change(screen.getByLabelText("New Qualifier 1 value"), { target: { value: "c" } });
    await userEvent.keyboard("{Enter}");
    const next = lastChange().variables[0]!;
    expect(next.options).toEqual([{ name: "a", definition: "the first" }, { name: "b", definition: "" }, { name: "c", definition: "" }]);
    expect(next.defaultOption).toBe("b");
    expect(next.source).toEqual({ statedBy: ME });
  });
  it("an option is renamed in place: a new name replaces it (and the default follows); an emptied name removes it (and the default is cleared)", async () => {
    mount(base(), { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "Edit Qualifier 2 value 1" }));
    fireEvent.change(screen.getByLabelText("Edit Qualifier 2 value 1"), { target: { value: " Norge " } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().variables[0]!.options.map((o) => o.name)).toEqual(["Norge", "Sweden"]);
    expect(lastChange().variables[0]!.defaultOption).toBe("Norge");
    await userEvent.click(screen.getByRole("button", { name: "Edit Qualifier 2 value 1" }));
    fireEvent.change(screen.getByLabelText("Edit Qualifier 2 value 1"), { target: { value: "   " } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().variables[0]!.options.map((o) => o.name)).toEqual(["Sweden"]);
    expect(lastChange().variables[0]!.defaultOption).toBe("");
  });
  it("the default: 'Make default' sets it and 'Clear default' clears it; neither makes the person the source", async () => {
    const s = base();
    mount(s, { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "Make default Sweden" }));
    expect(lastChange().variables[0]!.defaultOption).toBe("Sweden");
    expect(lastChange().variables[0]!.source).toBe(s.variables[0]!.source);
    expect(screen.getAllByTestId("plan-variable-default")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Make default Sweden" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Clear default Sweden" }));
    expect(lastChange().variables[0]!.defaultOption).toBe("");
    expect(screen.queryByTestId("plan-variable-default")).toBeNull();
  });
  it("at most one option wears the badge, and it is the one the data names", () => {
    mount(card({ scale: scale({ rate: "[C]" }), variables: [v("C", { options: options("a", "b", "c"), defaultOption: "b" })] }));
    const badged = screen.getAllByTestId("plan-variable-option").filter((o) => within(o).queryByTestId("plan-variable-default"));
    expect(badged.map((o) => o.textContent)).toEqual(["defaultb"]);
  });
  it("without edit rights the badge is only a mark: no 'Clear default' button, no 'Make default'", () => {
    mount(base());
    expect(screen.getByTestId("plan-variable-default").tagName).toBe("SPAN");
    expect(screen.queryByTestId("plan-variable-make-default")).toBeNull();
  });
  it("'Remove value' drops the option, clears the default if it was that one, and keeps the source as it was", async () => {
    const s = base();
    mount(s, { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "Remove value Norway" }));
    expect(lastChange().variables[0]!.options.map((o) => o.name)).toEqual(["Sweden"]);
    expect(lastChange().variables[0]!.defaultOption).toBe("");
    expect(lastChange().variables[0]!.source).toBe(s.variables[0]!.source);
  });
  it("the definition: 'Add definition' on a name with a record, the person as source", async () => {
    mount(card({ scale: scale({ rate: "[C]" }), variables: [v("C")] }), { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "Edit Qualifier 1 definition" }));
    fireEvent.change(screen.getByLabelText("Edit Qualifier 1 definition"), { target: { value: "where it is used" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().variables[0]).toMatchObject({ definition: "where it is used", source: { statedBy: ME } });
  });
  it("a name with no record has no definition to click until it has one", () => {
    mount(base(), { canEdit: true });
    expect(within(rowOf("task")).queryByRole("button", { name: "Edit Qualifier 1 definition" })).toBeNull();
    expect(within(rowOf("country")).getByRole("button", { name: "Edit Qualifier 2 definition" })).toBeTruthy();
  });
  it("a definition that is a list can be made values at one click: the options are made and the definition is cleared", async () => {
    mount(card({ scale: scale({ rate: "[Country]" }), variables: [v("Country", { definition: "Norway, Sweden" })] }), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: 'Make "Norway", "Sweden" values' }));
    expect(lastChange().variables[0]).toMatchObject({ definition: "", options: options("Norway", "Sweden") });
  });
  it("no such button for a definition that is a sentence, or when options exist already", () => {
    mount(card({ scale: scale({ rate: "[A] [B]" }), variables: [v("A", { definition: "A short sentence. Here." }), v("B", { definition: "x, y", options: options("x") })] }), { canEdit: true });
    expect(screen.queryByRole("button", { name: /values$/ })).toBeNull();
  });
  it("a name that is not in the Scale can be renamed in place, removed, or added to the Scale", async () => {
    const s = card({ scale: scale({ rate: "per [Task]", context: "in Oslo" }), variables: [v("Old", { options: options("a") })] });
    mount(s, { canEdit: true, selfId: ME });
    expect(within(rowOf("old")).getByTestId("plan-variable-not-in-scale").textContent).toContain("Not in the Scale");
    await userEvent.click(screen.getByRole("button", { name: "Edit Qualifier 2 name" }));
    fireEvent.change(screen.getByLabelText("Edit Qualifier 2 name"), { target: { value: "Older" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().variables[0]).toMatchObject({ name: "Older", source: { statedBy: ME } });
    await userEvent.click(screen.getByRole("button", { name: "Add Older to the Scale" }));
    expect(lastChange().scale.context).toBe("in Oslo for [Older]");
    expect(lastChange().scale.source).toEqual({ statedBy: ME });
    expect(lastChange().variables).toBe(lastChange().variables);
  });
  it("'Remove qualifier' drops the record, not the Scale's name", async () => {
    const s = card({ scale: scale({ rate: "per [Task]" }), variables: [v("Old"), v("Task", { options: options("t") })] });
    mount(s, { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Remove qualifier Old" }));
    expect(lastChange().variables.map((x) => x.name)).toEqual(["Task"]);
    expect(lastChange().variables[0]).toBe(s.variables[1]);
    expect(lastChange().scale).toBe(s.scale);
  });
  it("the source of a record shows under its row and a click on it opens the picker; a name with no source shows none", async () => {
    mount(card({ scale: scale({ rate: "[Task]" }), variables: [v("Task", { source: { text: "a survey" } })] }), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Edit [Task] source" }));
    await userEvent.type(screen.getByLabelText("[Task] source"), "field notes");
    await userEvent.click(await screen.findByRole("button", { name: 'Use "field notes" as text' }));
    expect(lastChange().variables[0]!.source).toEqual({ text: "field notes" });
  });
});

describe("the rename offer", () => {
  // One defined name the Scale no longer has, and one Scale name with no record: probably the same qualifier, renamed.
  const renamed = () => card({ scale: scale({ rate: "per [Customer]" }), variables: [v("Client", { options: options("a") })] });
  it("is offered on the Scale name's row, to a person who may edit, and calls the card's own rename with from and to (it writes nothing itself)", async () => {
    const rename = vi.fn();
    mount(renamed(), { canEdit: true, onRenameQualifier: rename });
    const btn = within(rowOf("customer")).getByTestId("plan-variable-rename-helper");
    expect(btn.textContent).toBe("Rename [Client] to [Customer]?");
    expect(within(rowOf("client")).queryByTestId("plan-variable-rename-helper")).toBeNull();
    await userEvent.click(btn);
    expect(rename).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith("Client", "Customer");
    expect(changes).toHaveLength(0);
  });
  it("is not offered without the card's rename, or read-only, or when it is not one-to-one", () => {
    mount(renamed(), { canEdit: true });
    expect(screen.queryByTestId("plan-variable-rename-helper")).toBeNull();
    cleanup();
    mount(renamed(), { onRenameQualifier: vi.fn() });
    expect(screen.queryByTestId("plan-variable-rename-helper")).toBeNull();
    cleanup();
    mount(card({ scale: scale({ rate: "[A] [B]" }), variables: [v("X")] }), { canEdit: true, onRenameQualifier: vi.fn() });
    expect(screen.queryByTestId("plan-variable-rename-helper")).toBeNull();
    cleanup();
    mount(card({ scale: scale({ rate: "[A]" }), variables: [v("X"), v("Y")] }), { canEdit: true, onRenameQualifier: vi.fn() });
    expect(screen.queryByTestId("plan-variable-rename-helper")).toBeNull();
  });
  it("in Edit it is offered the same way", async () => {
    const rename = vi.fn();
    mount(renamed(), { editing: true, canEdit: true, onRenameQualifier: rename });
    await userEvent.click(screen.getByTestId("plan-variable-rename-helper"));
    expect(rename).toHaveBeenCalledWith("Client", "Customer");
  });
});

describe("'+ Qualifier' adds a name to the Scale, never to a list of its own", () => {
  it("in place: the button opens a box and the presets the Scale does not have yet; Enter adds ' for [Name]' to the context and keeps the box open", async () => {
    const s = card({ scale: scale({ rate: "per [Task]", context: "in Oslo" }) });
    mount(s, { canEdit: true, selfId: ME });
    expect(screen.queryByTestId("plan-qualifier-presets")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "+ Qualifier" }));
    const presets = screen.getByTestId("plan-qualifier-presets");
    expect(within(presets).getAllByRole("button").map((b) => b.textContent)).not.toContain("Task");
    expect(within(presets).getAllByRole("button")).toHaveLength(10);
    const box = screen.getByLabelText("New qualifier name");
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: "Age band" } });
    await userEvent.type(box, "{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().scale.context).toBe("in Oslo for [Age band]");
    expect(lastChange().scale.source).toEqual({ statedBy: ME });
    expect(lastChange().variables).toBe(s.variables);
    expect((box as HTMLInputElement).value).toBe("");
    expect(screen.getByLabelText("New qualifier name")).toBeTruthy();
  });
  it("a preset is added with one click; an empty or blank name adds nothing; Escape closes the box", async () => {
    mount(card(), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "+ Qualifier" }));
    await userEvent.type(screen.getByLabelText("New qualifier name"), "   {Enter}");
    expect(changes).toHaveLength(0);
    expect((screen.getByLabelText("New qualifier name") as HTMLInputElement).value).toBe("   ");
    await userEvent.click(screen.getByRole("button", { name: "Add qualifier Country" }));
    expect(lastChange().scale.context).toBe("for [Country]");
    expect(screen.queryByRole("button", { name: "Add qualifier Country" })).toBeNull();
    // The preset button that was pressed is gone, so the focus is lost; Escape closes the box from the name box.
    screen.getByLabelText("New qualifier name").focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("plan-qualifier-add")).toBeNull();
    expect(screen.getByRole("button", { name: "+ Qualifier" })).toBeTruthy();
  });
  it("Escape does not close the box when the focus is lost: after a click on a preset (its button is gone) the key goes to the page", async () => {
    mount(card(), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "+ Qualifier" }));
    await userEvent.click(screen.getByRole("button", { name: "Add qualifier Task" }));
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByTestId("plan-qualifier-add")).toBeTruthy();
  });
  it("brackets in the name are dropped, and a name the Scale already has (any case) is not added again", async () => {
    mount(card({ scale: scale({ rate: "per [Task]" }) }), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "+ Qualifier" }));
    const box = screen.getByLabelText("New qualifier name");
    fireEvent.change(box, { target: { value: "task" } });
    await userEvent.type(box, "{Enter}");
    expect(changes).toHaveLength(0);
    fireEvent.change(box, { target: { value: "[[Region]]" } });
    await userEvent.type(box, "{Enter}");
    expect(lastChange().scale.context).toBe("for [Region]");
  });
  it("in Edit the presets are shown at once, below the button", () => {
    mount(card(), { editing: true });
    expect(screen.getByTestId("plan-qualifier-presets")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Qualifier" })).toBeTruthy();
    expect(within(screen.getByTestId("plan-qualifier-presets")).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Release", "User type", "Task", "Device", "Country", "Region", "Age-Group", "Language", "Market", "Customer segment", "Scenario",
    ]);
  });
  it("the presets leave out a name the Scale has, whatever its case", () => {
    mount(card({ scale: scale({ rate: "[country] [USER TYPE]" }) }), { editing: true });
    const names = within(screen.getByTestId("plan-qualifier-presets")).getAllByRole("button").map((b) => b.textContent);
    expect(names).not.toContain("Country");
    expect(names).not.toContain("User type");
    expect(names).toHaveLength(9);
  });
});

describe("a condition that is now a value of a qualifier can move into it", () => {
  const withCondition = () =>
    card({
      scale: scale({ rate: "[Country]" }),
      variables: [v("Country", { options: options("Norway", "Sweden") })],
      levels: [level("Goal", 5, { conditions: ["norway"] }), level("Goal", 6, { conditions: ["Norway", "x"] }), level("Wish", 7, { variables: { Country: "Sweden" }, conditions: ["Norway"] })],
    });
  it("the button counts the levels, and a click hands up the levels with the condition moved", async () => {
    const s = withCondition();
    mount(s, { canEdit: true });
    // Two levels hold the condition, written "norway" and "Norway": the button shows the spelling of the last one it met.
    const btn = screen.getByRole("button", { name: "Move 'Norway' into [Country] on 2 levels" });
    await userEvent.click(btn);
    expect(changes).toHaveLength(1);
    const lv = lastChange().levels;
    expect(lv[0]!.qualifier.variables).toEqual({ Country: "Norway" });
    expect(lv[0]!.qualifier.conditions).toEqual([]);
    expect(lv[1]!.qualifier.conditions).toEqual(["x"]);
    expect(lv[2]).toBe(s.levels[2]);
    expect(lastChange().variables).toBe(s.variables);
  });
  it("says 'level' for one, is offered in Edit too, and not to a person who may not edit", () => {
    const one = card({ scale: scale({ rate: "[Country]" }), variables: [v("Country", { options: options("Norway") })], levels: [level("Goal", 5, { conditions: ["Norway"] })] });
    mount(one, { canEdit: true });
    expect(screen.getByRole("button", { name: "Move 'Norway' into [Country] on 1 level" })).toBeTruthy();
    cleanup();
    mount(one, { editing: true });
    expect(screen.getByRole("button", { name: "Move 'Norway' into [Country] on 1 level" })).toBeTruthy();
    cleanup();
    mount(one);
    expect(screen.queryByRole("button", { name: /Move/ })).toBeNull();
  });
});

describe("Edit: a box for each part of each row", () => {
  const start = () => base();
  it("draws one card for each name, with its marks; a name with a record has a remove button, a name without has none", () => {
    mount(start(), { editing: true, canEdit: true });
    expect(rows().map((r) => r.getAttribute("data-testid"))).toEqual(["plan-variable-row", "plan-variable-row"]);
    expect(rows().map((r) => r.getAttribute("data-has-record"))).toEqual(["no", "yes"]);
    expect(screen.queryByRole("button", { name: "Remove qualifier Task" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove qualifier Country" })).toBeTruthy();
  });
  it("the default option is a select with 'No default' first; a pick is handed up at once and is not stamped", () => {
    const s = start();
    mount(s, { editing: true, selfId: ME });
    const select = screen.getByLabelText("Qualifier 2 default option") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", "Norway", "Sweden"]);
    expect(select.value).toBe("Norway");
    fireEvent.change(select, { target: { value: "Sweden" } });
    expect(lastChange().variables[0]!.defaultOption).toBe("Sweden");
    expect(lastChange().variables[0]!.source).toBe(s.variables[0]!.source);
    fireEvent.change(select, { target: { value: "" } });
    expect(lastChange().variables[0]!.defaultOption).toBe("");
    expect(screen.queryByLabelText("Qualifier 1 default option")).toBeNull();
  });
  it("an option's name and definition are two boxes: Enter saves one, the default follows a rename", async () => {
    mount(start(), { editing: true, canEdit: true, selfId: ME });
    const name = screen.getByLabelText("Qualifier 2 option 1 name");
    fireEvent.change(name, { target: { value: "Norge" } });
    await userEvent.type(name, "{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().variables[0]!.options.map((o) => o.name)).toEqual(["Norge", "Sweden"]);
    expect(lastChange().variables[0]!.defaultOption).toBe("Norge");
    expect(lastChange().variables[0]!.source).toEqual({ statedBy: ME });
    const def = screen.getByLabelText("Qualifier 2 option 2 definition");
    fireEvent.change(def, { target: { value: "the east neighbour" } });
    fireEvent.blur(def);
    expect(lastChange().variables[0]!.options[1]).toEqual({ name: "Sweden", definition: "the east neighbour" });
  });
  it("in Edit an emptied option name is kept as an empty option (the read line would remove it)", () => {
    mount(start(), { editing: true });
    const name = screen.getByLabelText("Qualifier 2 option 2 name");
    fireEvent.change(name, { target: { value: "" } });
    fireEvent.blur(name);
    expect(lastChange().variables[0]!.options.map((o) => o.name)).toEqual(["Norway", ""]);
  });
  it("'Remove option' drops it and clears the default if it was that one", async () => {
    mount(start(), { editing: true });
    await userEvent.click(screen.getByRole("button", { name: "Remove option Norway" }));
    expect(lastChange().variables[0]!.options.map((o) => o.name)).toEqual(["Sweden"]);
    expect(lastChange().variables[0]!.defaultOption).toBe("");
  });
  it("'+ Option' adds an empty option to a name with a record; a name with none has '+ value' that makes the record", async () => {
    mount(start(), { editing: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "+ Option" }));
    expect(lastChange().variables[0]!.options).toEqual([...options("Norway", "Sweden"), { name: "", definition: "" }]);
    await userEvent.click(within(rowOf("task")).getByRole("button", { name: "Add Qualifier 1 value" }));
    fireEvent.change(screen.getByLabelText("New Qualifier 1 value"), { target: { value: "Edit" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().variables.map((x) => x.name)).toEqual(["Country", "Task"]);
    expect(lastChange().variables[1]!.options).toEqual(options("Edit"));
  });
  it("the definition box and the source box: a definition is stamped, a source is not", async () => {
    mount(start(), { editing: true, selfId: ME });
    const def = screen.getByLabelText("Qualifier 2 definition");
    fireEvent.change(def, { target: { value: "a country" } });
    await userEvent.type(def, "{Enter}");
    expect(lastChange().variables[0]).toMatchObject({ definition: "a country", source: { statedBy: ME } });
    expect(screen.queryByLabelText("Qualifier 1 source")).toBeNull();
    expect(document.querySelector('[data-plan-source="Qualifier 2 source"]')?.getAttribute("data-editing")).toBe("true");
  });
  it("a name that is not in the Scale has a name box and 'Add to Scale'; 'Remove qualifier' drops it", async () => {
    const s = card({ scale: scale({ rate: "per [Task]" }), variables: [v("Old")] });
    mount(s, { editing: true, selfId: ME });
    expect(screen.getByLabelText("Qualifier 2 name")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add Old to the Scale" }));
    expect(lastChange().scale.context).toBe("for [Old]");
    await userEvent.click(screen.getByRole("button", { name: "Remove qualifier Old" }));
    expect(lastChange().variables).toEqual([]);
  });
  it("a definition that is a list can be made values in Edit too", async () => {
    mount(card({ scale: scale({ rate: "[Country]" }), variables: [v("Country", { definition: "Norway; Sweden" })] }), { editing: true });
    await userEvent.click(screen.getByRole("button", { name: 'Make "Norway", "Sweden" values' }));
    expect(lastChange().variables[0]).toMatchObject({ definition: "", options: options("Norway", "Sweden") });
  });
});

describe("what goes up, and what is kept", () => {
  it("the unknown members of the variables list, and of the variable edited, are carried; the other lists are the same objects", async () => {
    const list = withOthers([v("Country", { options: options("a") })], [{ unknownItem: true }]);
    const first = list[0]!;
    const raw = { unknownMember: 1 };
    Object.defineProperty(first, "raw", { value: raw, enumerable: false });
    const s = card({ scale: scale({ rate: "[Country]" }), variables: list, levels: [level("Goal", 1)] });
    mount(s, { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Make default a" }));
    const next = lastChange();
    expect(next.variables).not.toBe(list);
    expect(othersOf(next.variables)).toEqual([{ unknownItem: true }]);
    expect((next.variables[0] as unknown as { raw?: unknown }).raw).toBe(raw);
    expect(Object.keys(next.variables[0]!)).not.toContain("raw");
    expect(next.scale).toBe(s.scale);
    expect(next.levels).toBe(s.levels);
    expect(next.meters).toBe(s.meters);
    expect(next.endpoint).toBe(s.endpoint);
  });
  it("a record that already has a source keeps it when its text changes", async () => {
    const s = card({ scale: scale({ rate: "[C]" }), variables: [v("C", { definition: "d", source: { text: "survey" } })] });
    mount(s, { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "Edit Qualifier 1 definition" }));
    fireEvent.change(screen.getByLabelText("Edit Qualifier 1 definition"), { target: { value: "e" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().variables[0]!.source).toBe(s.variables[0]!.source);
  });
  it("two rows for the same name in different case: the records are matched one to one, in order", () => {
    mount(card({ scale: scale({ rate: "[Task]" }), variables: [v("task", { definition: "one" }), v("TASK", { definition: "two" })] }));
    expect(rows().map((r) => r.getAttribute("data-qualifier-row"))).toEqual(["task", "task"]);
    expect(rows().map((r) => r.getAttribute("data-in-scale"))).toEqual(["yes", "no"]);
    expect(rows().map((r) => r.textContent?.includes("one") || r.textContent?.includes("two"))).toEqual([true, true]);
  });
});

describe("older stored lists: shown as they are, read-only, with the move button", () => {
  const legacy = (o: Partial<NonNullable<Props["legacy"]>> = {}) => ({ levels: 0, qualifiers: 2, meters: 0, busy: false, canMove: true, onMove: vi.fn(), ...o });
  it("with an old qualifier list the line is read-only even in Edit, and the first group shows the move button", async () => {
    const l = legacy();
    mount(base(), { editing: true, canEdit: true, legacy: l });
    expect(screen.queryByTestId("plan-variable-row")).toBeNull();
    expect(rows()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "+ Qualifier" })).toBeNull();
    expect(screen.queryByLabelText("Qualifier 2 definition")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Move 2 qualifiers into their own records" }));
    expect(l.onMove).toHaveBeenCalledTimes(1);
    expect(changes).toHaveLength(0);
  });
  it("with an older list of levels too, the button is in the Levels line and not here", () => {
    mount(base(), { legacy: legacy({ levels: 3 }) });
    expect(screen.queryByTestId("plan-levels-move")).toBeNull();
    expect(rows()).toHaveLength(2);
  });
  it("with no old qualifiers the line is editable, and a legacy of other lists changes nothing here", () => {
    mount(base(), { canEdit: true, legacy: legacy({ qualifiers: 0, meters: 4 }) });
    expect(screen.getByRole("button", { name: "+ Qualifier" })).toBeTruthy();
    expect(screen.queryByTestId("plan-levels-move")).toBeNull();
  });
});
