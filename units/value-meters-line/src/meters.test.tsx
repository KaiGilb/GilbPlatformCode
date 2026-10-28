// The Meters line: each Meter's qualifier and its three lines (HumanAgent, AiAgent, Instrument), each with a method and a source.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { blankVariable, emptyValueCard, othersOf, withOthers, type MeterKind, type ScaleVariable, type ValueCardData, type ValueMeter } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanValueMetersBody } from "./index";
import { Card, card, changes, lastChange, render, type Props } from "../test/mount";

afterEach(cleanup);

const ME = "https://h.example.test/base/e/me";
const scale = (more: Partial<ValueCardData["scale"]> = {}): ValueCardData["scale"] => ({ ...emptyValueCard().scale, ...more });
const v = (name: string, more: Partial<ScaleVariable> = {}): ScaleVariable => ({ ...blankVariable(name), ...more });
const meter = (qualifier = "", lines: ValueMeter["lines"] = []): ValueMeter => ({ qualifier, lines });
const lineOf = (kind: MeterKind, method = "", source: ValueMeter["lines"][number]["source"] = {}) => ({ kind, method, source });
const mount = (start: ValueCardData, props: Props = {}) => render(<Card Body={PlanValueMetersBody} start={start} props={props} />);
const view = () => screen.getByTestId("plan-value-meters-view");
/** A Scale with Country (defined) and Task (not), one Meter with one qualifier. */
const base = () =>
  card({
    scale: scale({ rate: "per [Task] in [Country]" }),
    variables: [v("Country", { options: [{ name: "Norway", definition: "north" }, { name: "Sweden", definition: "" }], defaultOption: "Norway" })],
    meters: [meter("During Development", [lineOf("human", "ask the testers"), lineOf("instrument", "stopwatch", { text: "lab manual" })])],
  });

describe("read: each Meter and the lines it has", () => {
  it("shows 'Meter [qualifier]:' and then only the lines that have a method or a source, with the method after the label", () => {
    mount(base());
    expect(view().textContent).toContain("Meter [During Development]:");
    expect(view().textContent).toContain("HumanAgent: ask the testers");
    expect(view().textContent).toContain("Instrument: stopwatch");
    expect(view().textContent).not.toContain("AiAgent");
    expect(view().textContent).toContain("Source: lab manual");
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
  it("a Meter with no qualifier has no brackets; the hint 'Add qualifier' stands in its place even for a person who may not edit (and no space is put before it)", () => {
    mount(card({ meters: [meter("", [lineOf("ai", "log analysis")])] }));
    expect(view().textContent).toContain("MeterAdd qualifier:");
    expect(view().textContent).not.toContain("[");
    expect(view().textContent).toContain("AiAgent: log analysis");
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
  it("a line with a source and no method still shows; a line with neither does not", () => {
    mount(card({ meters: [meter("", [lineOf("human", "", { text: "survey" }), lineOf("ai", "   ")])] }));
    expect(view().textContent).toContain("HumanAgent:");
    expect(view().textContent).toContain("Source: survey");
    expect(view().textContent).not.toContain("AiAgent");
  });
  it("lines come in the order HumanAgent, AiAgent, Instrument whatever the stored order", () => {
    mount(card({ meters: [meter("q", [lineOf("instrument", "i"), lineOf("ai", "a"), lineOf("human", "h")])] }));
    const text = view().textContent!;
    expect(text.indexOf("HumanAgent")).toBeLessThan(text.indexOf("AiAgent"));
    expect(text.indexOf("AiAgent")).toBeLessThan(text.indexOf("Instrument"));
  });
  it("no Meters draws an empty block", () => {
    mount(card());
    expect(view().textContent).toBe("");
  });
});

describe("in place: out of Edit, a click on a value makes it an editor", () => {
  it("the qualifier: Enter sends the whole card once with the Meter changed; the lists the line did not touch are the same objects", async () => {
    const s = base();
    mount(s, { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Edit Meter 1 qualifier" }));
    fireEvent.change(screen.getByLabelText("Edit Meter 1 qualifier"), { target: { value: "After release" } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().meters[0]!.qualifier).toBe("After release");
    expect(lastChange().meters[0]!.lines).toBe(s.meters[0]!.lines);
    expect(lastChange().scale).toBe(s.scale);
    expect(lastChange().levels).toBe(s.levels);
    expect(lastChange().variables).toBe(s.variables);
    expect(screen.getByRole("button", { name: "Edit Meter 1 qualifier" }).textContent).toBe("After release");
  });
  it("a method: a line that exists is changed in place, with the person as its source when it has none", async () => {
    mount(base(), { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "Edit Meter 1 HumanAgent" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Meter 1 HumanAgent" }), { target: { value: "observe five users" } });
    await userEvent.keyboard("{Enter}");
    const lines = lastChange().meters[0]!.lines;
    expect(lines.map((l) => l.kind)).toEqual(["human", "instrument"]);
    expect(lines[0]).toMatchObject({ kind: "human", method: "observe five users", source: { statedBy: ME } });
    // The Instrument line keeps the source it had.
    expect(lines[1]).toBe(base().meters[0]!.lines[1] ? lines[1] : lines[1]);
    expect(lines[1]!.source).toEqual({ text: "lab manual" });
  });
  it("a line that does not exist yet is added at the end of the Meter's lines, when its method is typed", async () => {
    mount(base(), { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "Edit Meter 1 AiAgent" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Meter 1 AiAgent" }), { target: { value: "log mining" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().meters[0]!.lines.map((l) => `${l.kind}:${l.method}`)).toEqual(["human:ask the testers", "instrument:stopwatch", "ai:log mining"]);
    expect(lastChange().meters[0]!.lines[2]!.source).toEqual({ statedBy: ME });
  });
  it("a method keeps a source it has; a source change is not stamped", async () => {
    mount(base(), { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "Edit Meter 1 Instrument" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Meter 1 Instrument" }), { target: { value: "stopwatch and log" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().meters[0]!.lines[1]).toMatchObject({ method: "stopwatch and log", source: { text: "lab manual" } });
    await userEvent.click(screen.getByRole("button", { name: "Edit Instrument source" }));
    await userEvent.type(screen.getByLabelText("Instrument source"), "field notes");
    await userEvent.click(await screen.findByRole("button", { name: 'Use "field notes" as text' }));
    expect(lastChange().meters[0]!.lines[1]!.source).toEqual({ text: "field notes" });
    expect(lastChange().meters[0]!.lines[1]!.method).toBe("stopwatch and log");
  });
  it("removing a line's source clears it: the person is not made its source in its place", async () => {
    mount(base(), { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "Edit Instrument source" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove source" }));
    expect(lastChange().meters[0]!.lines[1]!.source).toEqual({});
    expect(lastChange().meters[0]!.lines[1]!.method).toBe("stopwatch");
  });
  it("a blank Meter that is open goes away when the person may no longer edit", () => {
    const start = card();
    const view = render(<Card Body={PlanValueMetersBody} start={start} props={{ canEdit: true }} />);
    return userEvent.click(screen.getByRole("button", { name: "+ Meter" })).then(() => {
      expect(screen.getByRole("button", { name: "Edit Meter 1 qualifier" })).toBeTruthy();
      view.rerender(<Card Body={PlanValueMetersBody} start={start} props={{ canEdit: false }} />);
      expect(screen.queryByRole("button", { name: "Edit Meter 1 qualifier" })).toBeNull();
      expect(screen.queryByText(/Add qualifier/)).toBeNull();
    });
  });
  it("a method is a text box: Shift+Enter is a line break; Escape sends nothing", async () => {
    mount(base(), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Edit Meter 1 HumanAgent" }));
    const box = screen.getByRole("textbox", { name: "Edit Meter 1 HumanAgent" });
    expect(box.tagName).toBe("TEXTAREA");
    await userEvent.type(box, " now{Shift>}{Enter}{/Shift}then");
    expect(changes).toHaveLength(0);
    await userEvent.keyboard("{Escape}");
    expect(changes).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Edit Meter 1 HumanAgent" }).textContent).toBe("ask the testers");
  });
  it("every line is offered to a person who may edit, as 'Add <label> method'", () => {
    mount(card({ meters: [meter("")] }), { canEdit: true });
    expect(view().textContent).toContain("Meter [Add qualifier]:");
    expect(view().textContent).toContain("Add HumanAgent method");
    expect(view().textContent).toContain("Add AiAgent method");
    expect(view().textContent).toContain("Add Instrument method");
    expect(view().textContent).toContain("Add qualifier");
  });
  it("'+ Meter' opens a blank Meter and writes nothing until it has a qualifier or a method", async () => {
    const s = base();
    mount(s, { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "+ Meter" }));
    expect(changes).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Edit Meter 2 qualifier" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ Meter" })).toBeNull();
    // Opening and leaving an editor without typing writes nothing either.
    await userEvent.click(screen.getByRole("button", { name: "Edit Meter 2 qualifier" }));
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Edit Meter 2 qualifier" }));
    fireEvent.change(screen.getByLabelText("Edit Meter 2 qualifier"), { target: { value: "In production" } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().meters).toHaveLength(2);
    expect(lastChange().meters[0]).toBe(s.meters[0]);
    expect(lastChange().meters[1]).toMatchObject({ qualifier: "In production", lines: [] });
    expect(screen.getByRole("button", { name: "+ Meter" })).toBeTruthy();
  });
  it("a blank Meter given a method first is written with that line", async () => {
    mount(card(), { canEdit: true, selfId: ME });
    await userEvent.click(screen.getByRole("button", { name: "+ Meter" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit Meter 1 Instrument" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Meter 1 Instrument" }), { target: { value: "stopwatch" } });
    await userEvent.keyboard("{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().meters).toHaveLength(1);
    expect(lastChange().meters[0]).toMatchObject({ qualifier: "", lines: [{ kind: "instrument", method: "stopwatch", source: { statedBy: ME } }] });
  });
  it("'+ Meter' is not offered to a person who may not edit", () => {
    mount(base());
    expect(screen.queryByRole("button", { name: "+ Meter" })).toBeNull();
  });
});

describe("the qualifier chip: a name of the Scale becomes 'Name = value' in the Meter's qualifier", () => {
  it("offers the Scale's names, and a pick adds 'Country = Norway' to an empty qualifier", async () => {
    mount(card({ ...base(), meters: [meter("")] }), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Add Meter 1 qualifier value" }));
    expect(screen.getByRole("menu", { name: "Meter 1 qualifiers" })).toBeTruthy();
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Task", "Country"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Meter 1 Country" }));
    expect(screen.getByRole("group", { name: "Choose Meter 1 Country" })).toBeTruthy();
    await userEvent.click(screen.getByLabelText("Meter 1 Country Sweden"));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(changes).toHaveLength(1);
    expect(lastChange().meters[0]!.qualifier).toBe("Country = Sweden");
    expect(screen.queryByRole("group")).toBeNull();
  });
  it("a second pick is added after a comma; the first is kept", async () => {
    mount(base(), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Add Meter 1 qualifier value" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Meter 1 Country" }));
    await userEvent.click(screen.getByLabelText("Meter 1 Country Norway"));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(lastChange().meters[0]!.qualifier).toBe("During Development, Country = Norway");
  });
  it("a name with no defined options takes a typed word", async () => {
    mount(base(), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Add Meter 1 qualifier value" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Meter 1 Task" }));
    fireEvent.change(screen.getByLabelText("Edit Meter 1 Task"), { target: { value: "Install" } });
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(lastChange().meters[0]!.qualifier).toBe("During Development, Task = Install");
  });
  it("a pick of one option only: ticking a second unticks the first (a Meter's qualifier is one value)", async () => {
    mount(base(), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Add Meter 1 qualifier value" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Meter 1 Country" }));
    await userEvent.click(screen.getByLabelText("Meter 1 Country Norway"));
    await userEvent.click(screen.getByLabelText("Meter 1 Country Sweden"));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(lastChange().meters[0]!.qualifier).toBe("During Development, Country = Sweden");
  });
  it("Escape and Clear add nothing", async () => {
    mount(base(), { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Add Meter 1 qualifier value" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Meter 1 Country" }));
    await userEvent.click(screen.getByLabelText("Meter 1 Country Norway"));
    await userEvent.keyboard("{Escape}");
    expect(changes).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Add Meter 1 qualifier value" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Meter 1 Country" }));
    await userEvent.click(screen.getByLabelText("Meter 1 Country Norway"));
    await userEvent.click(screen.getByRole("button", { name: "Clear Meter 1 Country" }));
    expect(changes).toHaveLength(0);
  });
  it("there is no chip when the Scale names nothing", () => {
    mount(card({ meters: [meter("q")] }), { canEdit: true });
    expect(screen.queryByRole("button", { name: "Add Meter 1 qualifier value" })).toBeNull();
  });
  it("the chip is not there for a person who may not edit", () => {
    mount(base());
    expect(screen.queryByRole("button", { name: "Add Meter 1 qualifier value" })).toBeNull();
  });
});

describe("Edit: a card for each Meter", () => {
  it("shows the qualifier box, a box and a source for each of the three lines, a remove button, and '+ Meter'", () => {
    const { container } = mount(base(), { editing: true });
    expect(screen.getAllByTestId("plan-value-meter")).toHaveLength(1);
    expect((screen.getByLabelText("Meter 1 qualifier") as HTMLInputElement).value).toBe("During Development");
    expect((screen.getByLabelText("Meter 1 qualifier") as HTMLInputElement).placeholder).toBe("Qualifier, e.g. During Development");
    for (const label of ["HumanAgent", "AiAgent", "Instrument"]) {
      expect(screen.getByLabelText(`Meter 1 ${label}`).tagName).toBe("TEXTAREA");
      expect(container.querySelector(`[data-plan-source="Meter 1 ${label} source"]`)?.getAttribute("data-editing")).toBe("true");
    }
    expect((screen.getByLabelText("Meter 1 HumanAgent") as HTMLTextAreaElement).value).toBe("ask the testers");
    expect(screen.getByRole("button", { name: "Remove meter 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Meter" })).toBeTruthy();
  });
  it("Enter in the qualifier sends the Meter once; the lines are kept as the same list", async () => {
    const s = base();
    mount(s, { editing: true });
    const box = screen.getByLabelText("Meter 1 qualifier");
    fireEvent.change(box, { target: { value: "After release" } });
    await userEvent.type(box, "{Enter}");
    expect(changes).toHaveLength(1);
    expect(lastChange().meters[0]!.qualifier).toBe("After release");
    expect(lastChange().meters[0]!.lines).toBe(s.meters[0]!.lines);
    fireEvent.blur(box);
    expect(changes).toHaveLength(1);
  });
  it("a method box: leaving sends the method and stamps the person; the source box does not stamp", async () => {
    mount(card({ meters: [meter("q")] }), { editing: true, selfId: ME });
    const box = screen.getByLabelText("Meter 1 AiAgent");
    fireEvent.change(box, { target: { value: "log mining" } });
    fireEvent.blur(box);
    expect(lastChange().meters[0]!.lines).toEqual([{ kind: "ai", method: "log mining", source: { statedBy: ME } }]);
    await userEvent.type(screen.getByLabelText("Meter 1 Instrument source"), "manual");
    await userEvent.click(await screen.findByRole("button", { name: 'Use "manual" as text' }));
    expect(lastChange().meters[0]!.lines.map((l) => `${l.kind}:${JSON.stringify(l.source)}`)).toEqual([`ai:${JSON.stringify({ statedBy: ME })}`, `instrument:${JSON.stringify({ text: "manual" })}`]);
    expect(lastChange().meters[0]!.lines[1]!.method).toBe("");
  });
  it("removing a line's source in Edit clears it too", async () => {
    mount(base(), { editing: true, selfId: ME });
    const box = document.querySelector('[data-plan-source="Meter 1 Instrument source"]')!;
    await userEvent.click(within(box as HTMLElement).getByRole("button", { name: "Remove source" }));
    expect(lastChange().meters[0]!.lines[1]!.source).toEqual({});
  });
  it("'Remove meter' drops that Meter only", async () => {
    const s = card({ meters: [meter("a"), meter("b"), meter("c")] });
    mount(s, { editing: true });
    await userEvent.click(screen.getByRole("button", { name: "Remove meter 2" }));
    expect(lastChange().meters.map((m) => m.qualifier)).toEqual(["a", "c"]);
    expect(lastChange().meters[0]).toBe(s.meters[0]);
    expect(lastChange().meters[1]).toBe(s.meters[2]);
  });
  it("'+ Meter' hands up a blank Meter at once (read mode waits until it has something)", async () => {
    const s = base();
    mount(s, { editing: true });
    await userEvent.click(screen.getByRole("button", { name: "+ Meter" }));
    expect(changes).toHaveLength(1);
    expect(lastChange().meters).toHaveLength(2);
    expect(lastChange().meters[1]).toEqual({ qualifier: "", lines: [] });
    expect(lastChange().meters[0]).toBe(s.meters[0]);
  });
  it("the qualifier chip works in Edit too", async () => {
    mount(base(), { editing: true });
    await userEvent.click(screen.getByRole("button", { name: "Add Meter 1 qualifier value" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Meter 1 Country" }));
    await userEvent.click(screen.getByLabelText("Meter 1 Country Sweden"));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(lastChange().meters[0]!.qualifier).toBe("During Development, Country = Sweden");
  });
});

describe("what goes up, and what is kept", () => {
  it("the unknown items of the Meters list and of a Meter's lines are carried, and so are the unknown members of the Meter and of the line", async () => {
    const lines = withOthers([lineOf("human", "h")], [{ unknownLine: true }]);
    const raw = { unknownMember: 1 };
    const m = meter("q", lines);
    Object.defineProperty(m, "raw", { value: raw, enumerable: false });
    const lraw = { unknownLineMember: 2 };
    Object.defineProperty(lines[0]!, "raw", { value: lraw, enumerable: false });
    const meters = withOthers([m], [{ unknownMeter: true }]);
    const s = card({ meters });
    mount(s, { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "Edit Meter 1 HumanAgent" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Meter 1 HumanAgent" }), { target: { value: "h2" } });
    await userEvent.keyboard("{Enter}");
    const next = lastChange().meters;
    expect(next).not.toBe(meters);
    expect(othersOf(next)).toEqual([{ unknownMeter: true }]);
    expect(othersOf(next[0]!.lines)).toEqual([{ unknownLine: true }]);
    expect((next[0] as unknown as { raw?: unknown }).raw).toBe(raw);
    expect((next[0]!.lines[0] as unknown as { raw?: unknown }).raw).toBe(lraw);
    expect(Object.keys(next[0]!)).not.toContain("raw");
    expect(lastChange().levels).toBe(s.levels);
    expect(lastChange().scale).toBe(s.scale);
  });
  it("a Meter given as index beyond the list is appended, not inserted", async () => {
    const s = card({ meters: [meter("a"), meter("b")] });
    mount(s, { canEdit: true });
    await userEvent.click(screen.getByRole("button", { name: "+ Meter" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit Meter 3 qualifier" }));
    fireEvent.change(screen.getByLabelText("Edit Meter 3 qualifier"), { target: { value: "c" } });
    await userEvent.keyboard("{Enter}");
    expect(lastChange().meters.map((m) => m.qualifier)).toEqual(["a", "b", "c"]);
  });
});

describe("older stored lists: shown as they are, read-only, with the move button", () => {
  const legacy = (o: Partial<NonNullable<Props["legacy"]>> = {}) => ({ levels: 0, qualifiers: 0, meters: 2, busy: false, canMove: true, onMove: vi.fn(), ...o });
  it("with old Meters the line is read-only even in Edit and the first group shows the move button", async () => {
    const l = legacy();
    mount(base(), { editing: true, canEdit: true, legacy: l });
    expect(screen.queryByTestId("plan-value-meter")).toBeNull();
    expect(view().textContent).toContain("HumanAgent: ask the testers");
    expect(screen.queryByRole("button", { name: "+ Meter" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Move 2 meters into their own records" }));
    expect(l.onMove).toHaveBeenCalledTimes(1);
    expect(changes).toHaveLength(0);
  });
  it("the button is in an earlier group when older levels or qualifiers are there", () => {
    mount(base(), { legacy: legacy({ qualifiers: 1 }) });
    expect(screen.queryByTestId("plan-levels-move")).toBeNull();
  });
  it("with no old Meters the line is editable", () => {
    mount(base(), { canEdit: true, legacy: legacy({ meters: 0 }) });
    expect(screen.getByRole("button", { name: "+ Meter" })).toBeTruthy();
  });
});
