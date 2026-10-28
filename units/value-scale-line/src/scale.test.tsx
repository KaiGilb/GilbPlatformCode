// The Scale line: what it shows, what each edit hands up, and that it hands up the whole card with the lists it did not touch as the same objects.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultDirectionFor, emptyValueCard, type ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanScaleBody } from "./index";
import { Card, card, changes, lastChange, level, render, type Props } from "../test/mount";

afterEach(cleanup);

const scale = (more: Partial<ValueCardData["scale"]> = {}): ValueCardData["scale"] => ({ ...emptyValueCard().scale, ...more });
const mount = (start: ValueCardData, props: Props = {}) => render(<Card Body={PlanScaleBody} start={start} props={props} />);
const view = () => screen.getByTestId("plan-scale-view");

describe("read: the Scale as text", () => {
  it("shows the unit, the rate, the context and which direction is better, as words", () => {
    mount(card({ scale: scale({ unit: "minutes", rate: "per [Task]", context: "from: start; until: release", direction: "lower" }) }));
    expect(view().textContent).toContain("Unit: minutes");
    expect(view().textContent).toContain("Rate: per [Task]");
    expect(view().textContent).toContain("Context: from: start; until: release");
    expect(view().textContent).toContain("Lower is better");
  });
  it("the three directions read as their words", () => {
    for (const [direction, words] of [["lower", "Lower is better"], ["higher", "Higher is better"], ["target", "Target range"]] as const) {
      mount(card({ scale: scale({ unit: "u", direction }) }));
      expect(view().textContent).toContain(words);
      cleanup();
    }
  });
  it("shows what the data holds: the line has no direction default of its own (the model gives a Development Resource 'lower' and a Value 'higher')", () => {
    mount(card({ resource: true, scale: scale({ unit: "k", direction: defaultDirectionFor(true) }) }));
    expect(view().textContent).toContain("Lower is better");
    cleanup();
    mount(card({ resource: true, scale: scale({ unit: "k", direction: defaultDirectionFor(false) }) }));
    expect(view().textContent).toContain("Higher is better");
  });
  it("a Scale with no direction reads as 'Higher is better'", () => {
    const s = { ...scale({ unit: "k" }) } as Partial<ValueCardData["scale"]>;
    delete s.direction;
    mount(card({ scale: s as ValueCardData["scale"] }));
    expect(view().textContent).toContain("Higher is better");
  });
  it("an empty Scale draws an empty line: no direction, no hints, no buttons", () => {
    mount(card());
    expect(view().textContent).toBe("");
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
  it("a unit of blanks is no unit: the line stays empty", () => {
    mount(card({ scale: scale({ unit: "   " }) }));
    expect(view().textContent).toBe("");
  });
  it("the older Scale sentence (scale.text) is kept as it is and never shown", () => {
    mount(card({ scale: scale({ text: "minutes to learn [Task]", unit: "min" }) }));
    expect(view().textContent).not.toContain("minutes to learn");
    expect(view().textContent).toContain("Unit: min");
  });
  it("a source with words is shown under the line; with none, nothing", () => {
    mount(card({ scale: scale({ unit: "min", source: { text: "usability study" } }) }));
    expect(view().textContent).toContain("Source: usability study");
    cleanup();
    mount(card({ scale: scale({ unit: "min" }) }));
    expect(view().textContent).not.toContain("Source");
  });
});

describe("the [Qualifier] chips: a click goes to that qualifier's row in the same card", () => {
  // The DOM contract with the Qualifiers line: the rows carry data-qualifier-row (the lower-cased name) and are focusable; they sit inside
  // the card's content element, data-testid="record-detail-content".
  function twoCards(extra?: () => void) {
    render(
      <>
        <div data-testid="record-detail-content" id="b">
          <div tabIndex={-1} data-qualifier-row="task" id="b-task" />
        </div>
        <div data-testid="record-detail-content" id="a">
          <Card Body={PlanScaleBody} start={card({ scale: scale({ rate: "per [Task] for [User type]" }) })} />
          <div tabIndex={-1} data-qualifier-row="task" id="a-task" />
          <div tabIndex={-1} data-qualifier-row="user type" id="a-user" />
        </div>
      </>,
    );
    extra?.();
  }
  it("each [Name] in the rate is a button named 'Go to qualifier Name'; the rest stays plain text", () => {
    mount(card({ scale: scale({ rate: "per [Task] for [User type], not []" }) }));
    const chips = screen.getAllByRole("button");
    expect(chips.map((c) => c.getAttribute("aria-label"))).toEqual(["Go to qualifier Task", "Go to qualifier User type"]);
    expect(chips.map((c) => c.getAttribute("data-kind"))).toEqual(["plan-scale-variable", "plan-scale-variable"]);
    expect(chips.map((c) => c.textContent)).toEqual(["[Task]", "[User type]"]);
    expect(view().textContent).toContain("Rate: per [Task] for [User type], not []");
  });
  it("only the innermost brackets make a chip: in '[[Task]]' the outer brackets stay text", () => {
    mount(card({ scale: scale({ rate: "per [[Task]] or [a" }) }));
    expect(screen.getAllByRole("button").map((c) => c.textContent)).toEqual(["[Task]"]);
    expect(view().textContent).toContain("Rate: per [[Task]] or [a");
  });
  it("the context has chips too", () => {
    mount(card({ scale: scale({ context: "in [Country]" }) }));
    expect(screen.getByRole("button", { name: "Go to qualifier Country" })).toBeTruthy();
  });
  it("a click focuses the row with that name (case-folded) and scrolls it near", () => {
    twoCards();
    const scroll = vi.fn();
    (document.getElementById("a-user") as HTMLElement).scrollIntoView = scroll;
    fireEvent.click(screen.getByRole("button", { name: "Go to qualifier User type" }));
    expect(document.activeElement?.id).toBe("a-user");
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
  });
  it("it looks only in its own card: the other card's row of the same name, which comes first on the page, is left alone", () => {
    twoCards();
    fireEvent.click(screen.getByRole("button", { name: "Go to qualifier Task" }));
    expect(document.activeElement?.id).toBe("a-task");
  });
  it("without a card around it, it looks in the whole page", () => {
    render(
      <>
        <Card Body={PlanScaleBody} start={card({ scale: scale({ rate: "per [Task]" }) })} />
        <div tabIndex={-1} data-qualifier-row="task" id="far" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go to qualifier Task" }));
    expect(document.activeElement?.id).toBe("far");
  });
  it("a name with no row does nothing, and does not throw", () => {
    twoCards();
    const before = document.activeElement;
    fireEvent.click(screen.getByRole("button", { name: "Go to qualifier Task" }));
    cleanup();
    render(<Card Body={PlanScaleBody} start={card({ scale: scale({ rate: "per [Ghost]" }) })} />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Go to qualifier Ghost" }))).not.toThrow();
    expect(document.activeElement).toBe(document.body);
    void before;
  });
  it("Enter and Space on a chip go there too; other keys do not", () => {
    twoCards();
    const chip = screen.getByRole("button", { name: "Go to qualifier Task" });
    fireEvent.keyDown(chip, { key: "a" });
    expect(document.activeElement?.id).not.toBe("a-task");
    fireEvent.keyDown(chip, { key: "Enter" });
    expect(document.activeElement?.id).toBe("a-task");
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(chip, { key: " " });
    expect(document.activeElement?.id).toBe("a-task");
  });
  it("the keys of a chip do not reach a handler around the line", () => {
    const around = vi.fn();
    render(
      <div onKeyDown={around}>
        <Card Body={PlanScaleBody} start={card({ scale: scale({ rate: "per [Task]" }) })} />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Go to qualifier Task" }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Go to qualifier Task" }), { key: " " });
    expect(around).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("button", { name: "Go to qualifier Task" }), { key: "a" });
    expect(around).toHaveBeenCalledTimes(1);
  });
  it("in place, a chip does not open the rate's editor: the click and the keys stop at the chip", async () => {
    mount(card({ scale: scale({ rate: "per [Task]" }) }), { canEdit: true });
    expect(screen.getByRole("button", { name: "Edit Scale rate" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go to qualifier Task" }));
    expect(screen.queryByRole("textbox", { name: "Edit Scale rate" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "Go to qualifier Task" }), { key: "Enter" });
    expect(screen.queryByRole("textbox", { name: "Edit Scale rate" })).toBeNull();
    // The words around the chip still open it (the label "Rate:" is outside the button).
    await userEvent.click(screen.getByText("per"));
    expect(screen.getByRole("textbox", { name: "Edit Scale rate" })).toBeTruthy();
  });
});

describe("in place: out of Edit, a click on a value makes it an editor", () => {
  const start = () => card({ scale: scale({ unit: "minutes", rate: "per [Task]", context: "", direction: "lower" }) });
  it("the unit: Enter hands up the whole card once; the other lists are the same objects, and the person is the source", async () => {
    const s = start();
    mount(s, { canEdit: true, selfId: "https://h.example.test/base/e/me" });
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    const input = screen.getByLabelText("Edit Scale unit") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    await userEvent.clear(input);
    await userEvent.type(input, "seconds{Enter}");
    expect(changes).toHaveLength(1);
    const next = lastChange();
    expect(next.scale).toMatchObject({ unit: "seconds", rate: "per [Task]", direction: "lower" });
    expect(next.scale.source).toEqual({ statedBy: "https://h.example.test/base/e/me" });
    expect(next.variables).toBe(s.variables);
    expect(next.endpoint).toBe(s.endpoint);
    expect(next.meters).toBe(s.meters);
    expect(next.levels).toBe(s.levels);
    expect(screen.getByRole("button", { name: "Edit Scale unit" }).textContent).toBe("Unit: seconds");
  });
  it("leaving the input commits once; Escape commits nothing; an unchanged value commits nothing", async () => {
    mount(start(), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    fireEvent.change(screen.getByLabelText("Edit Scale unit"), { target: { value: "hours" } });
    fireEvent.blur(screen.getByLabelText("Edit Scale unit"));
    expect(changes).toHaveLength(1);
    expect(lastChange().scale.unit).toBe("hours");
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    fireEvent.change(screen.getByLabelText("Edit Scale unit"), { target: { value: "never" } });
    await userEvent.keyboard("{Escape}");
    expect(changes).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Edit Scale unit" }).textContent).toBe("Unit: hours");
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
  });
  it("the unit's text is sent as typed, not trimmed", async () => {
    mount(start(), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    fireEvent.change(screen.getByLabelText("Edit Scale unit"), { target: { value: "  min " } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().scale.unit).toBe("  min ");
  });
  it("an empty Scale offers 'Add unit', 'Add rate', 'Add context' and the direction to click", async () => {
    mount(card(), { canEdit: true });
    for (const name of ["Edit Scale unit", "Edit Scale rate", "Edit Scale context", "Edit Scale direction"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(view().textContent).toContain("Add unit");
    expect(view().textContent).toContain("Add rate");
    expect(view().textContent).toContain("Add context");
    expect(view().textContent).toContain("Higher is better");
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale context" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Scale context" }), { target: { value: "from: now; until: then" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().scale.context).toBe("from: now; until: then");
  });
  it("the rate is a text box: Shift+Enter is a line break and Enter sends it", async () => {
    mount(start(), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale rate" }));
    const box = screen.getByRole("textbox", { name: "Edit Scale rate" }) as HTMLTextAreaElement;
    expect(box.tagName).toBe("TEXTAREA");
    fireEvent.change(box, { target: { value: "per [Task]" } });
    await userEvent.type(box, "{Shift>}{Enter}{/Shift}and more");
    expect(changes).toHaveLength(0);
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().scale.rate).toBe("per [Task]\nand more");
  });
  it("the direction: a pick hands up the direction and does NOT make the signed-in person the source", async () => {
    const s = start();
    mount(s, { canEdit: true, selfId: "https://h.example.test/base/e/me" });
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale direction" }));
    const select = screen.getByLabelText("Edit Scale direction") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["lower", "higher", "target"]);
    fireEvent.change(select, { target: { value: "target" } });
    expect(changes).toHaveLength(1);
    expect(lastChange().scale.direction).toBe("target");
    expect(lastChange().scale.source).toBe(s.scale.source);
    expect(screen.getByRole("button", { name: "Edit Scale direction" }).textContent).toBe("Target range");
  });
  it("the same direction again sends nothing; Escape closes the select", async () => {
    mount(start(), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale direction" }));
    fireEvent.change(screen.getByLabelText("Edit Scale direction"), { target: { value: "lower" } });
    expect(changes).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale direction" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Edit Scale direction" })).toBeTruthy();
    expect(changes).toHaveLength(0);
  });
  it("a value that already has a source keeps it (the person is the source only of a value with none)", async () => {
    const s = card({ scale: scale({ unit: "minutes", source: { text: "usability study" } }) });
    mount(s, { canEdit: true, selfId: "https://h.example.test/base/e/me" });
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    fireEvent.change(screen.getByLabelText("Edit Scale unit"), { target: { value: "s" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().scale.source).toBe(s.scale.source);
  });
  it("the source: a click on it opens the picker; words with no match are taken as text and handed up without a second stamp", async () => {
    mount(card({ scale: scale({ unit: "min", source: { text: "usability study" } }) }), { canEdit: true, selfId: "https://h.example.test/base/e/me" });
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale source" }));
    await userEvent.type(screen.getByLabelText("Scale source"), "field notes");
    await userEvent.click(await screen.findByRole("button", { name: 'Use "field notes" as text' }));
    expect(changes).toHaveLength(1);
    expect(lastChange().scale.source).toEqual({ text: "field notes" });
    expect(lastChange().scale.unit).toBe("min");
  });
  it("with no source there is nothing to click: the line must be edited in Edit to add one", () => {
    mount(card({ scale: scale({ unit: "min" }) }), { canEdit: true });
    expect(screen.queryByRole("button", { name: "Edit Scale source" })).toBeNull();
    expect(view().querySelector("[data-plan-source]")).toBeNull();
  });
  it("hidden members ride along: the unknown members of the Scale and its record are on the new Scale, not enumerable", async () => {
    const s = start();
    const raw = { unknownMember: 1 };
    Object.defineProperty(s.scale, "raw", { value: raw, enumerable: false });
    mount(s, { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    fireEvent.change(screen.getByLabelText("Edit Scale unit"), { target: { value: "s" } });
    await userEvent.keyboard("{Enter}");
    const next = lastChange().scale as unknown as { raw?: unknown };
    expect(next.raw).toBe(raw);
    expect(Object.keys(next)).not.toContain("raw");
    expect(JSON.stringify(next)).not.toContain("unknownMember");
  });
  it("a card with a level keeps that level object: the line does not touch the lists", async () => {
    const lv = level("Goal", 5);
    const s = card({ scale: scale({ unit: "m" }), levels: [lv] });
    mount(s, { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    fireEvent.change(screen.getByLabelText("Edit Scale unit"), { target: { value: "s" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().levels).toBe(s.levels);
    expect(lastChange().levels[0]).toBe(lv);
  });
});

describe("Edit: the fields", () => {
  const start = () => card({ scale: scale({ unit: "minutes", rate: "per [Task]", context: "in [Country]", direction: "higher" }) });
  it("shows one box for each part, with the field names and the hints", () => {
    mount(start(), { editing: true, canEdit: true });
    expect(["Unit", "Rate", "Context", "Better"].every((w) => document.body.textContent?.includes(w))).toBe(true);
    expect((screen.getByLabelText("Scale unit") as HTMLInputElement).value).toBe("minutes");
    expect((screen.getByLabelText("Scale rate") as HTMLTextAreaElement).value).toBe("per [Task]");
    expect((screen.getByLabelText("Scale context") as HTMLTextAreaElement).value).toBe("in [Country]");
    expect((screen.getByLabelText("Scale direction") as HTMLSelectElement).value).toBe("higher");
    expect([...(screen.getByLabelText("Scale direction") as HTMLSelectElement).options].map((o) => `${o.value}:${o.textContent}`)).toEqual(["lower:Lower is better", "higher:Higher is better", "target:Target range"]);
    cleanup();
    mount(card(), { editing: true });
    expect((screen.getByLabelText("Scale unit") as HTMLInputElement).placeholder).toBe("e.g. minutes");
    expect((screen.getByLabelText("Scale rate") as HTMLTextAreaElement).placeholder).toBe("e.g. per [Task]");
    expect((screen.getByLabelText("Scale context") as HTMLTextAreaElement).placeholder).toBe("from: …; until: …");
  });
  it("Edit is a card of boxes: no chips, no click-to-edit buttons", () => {
    mount(start(), { editing: true, canEdit: true });
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryByTestId("plan-scale-view")).toBeNull();
  });
  it("Enter in the unit hands up a changed unit once; leaving the box after Enter, with the card showing the new unit, sends nothing more", async () => {
    const s = start();
    mount(s, { editing: true, selfId: "https://h.example.test/base/e/me" });
    const input = screen.getByLabelText("Scale unit");
    await userEvent.clear(input);
    await userEvent.type(input, "seconds{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().scale.unit).toBe("seconds");
    expect(lastChange().scale.source).toEqual({ statedBy: "https://h.example.test/base/e/me" });
    expect(lastChange().levels).toBe(s.levels);
    fireEvent.blur(input);
    expect(changes).toHaveLength(1);
  });
  it("leaving a changed box commits it; leaving an unchanged one does not", async () => {
    mount(start(), { editing: true });
    fireEvent.blur(screen.getByLabelText("Scale unit"));
    expect(changes).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Scale context"), { target: { value: "in [City]" } });
    fireEvent.blur(screen.getByLabelText("Scale context"));
    expect(changes).toHaveLength(1);
    expect(lastChange().scale.context).toBe("in [City]");
  });
  it("the Better select hands up the direction at once, with the source as it was", () => {
    const s = start();
    mount(s, { editing: true, selfId: "https://h.example.test/base/e/me" });
    fireEvent.change(screen.getByLabelText("Scale direction"), { target: { value: "lower" } });
    expect(changes).toHaveLength(1);
    expect(lastChange().scale.direction).toBe("lower");
    expect(lastChange().scale.source).toBe(s.scale.source);
  });
  it("the source box is open in Edit and hands up a source taken as text", async () => {
    const { container } = mount(start(), { editing: true });
    expect(container.querySelector('[data-plan-source="Scale source"]')?.getAttribute("data-editing")).toBe("true");
    await userEvent.type(screen.getByLabelText("Scale source"), "interviews");
    await userEvent.click(await screen.findByRole("button", { name: 'Use "interviews" as text' }));
    expect(lastChange().scale.source).toEqual({ text: "interviews" });
  });
  it("there is no '+ New stakeholder' on the Scale source", () => {
    mount(start(), { editing: true });
    expect(screen.queryByText("+ New stakeholder")).toBeNull();
  });
});
