// The Development Resource card: its Budget level is the Goal point (`kindClass`), and the "+ New" menu offers Budget in place of Goal.
// The same levels on a Value (no `resource` flag) are a Goal or an ordinary custom kind.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/mount";
import { PlanValueGraph } from "./PlanValueGraph";
import { MENU_KINDS, RESOURCE_MENU_KINDS, kindText } from "./newMenu";
import type { LevelQualifier, ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const lv = (kind: string, value: number | null, q: Partial<LevelQualifier> = {}): ValueLevel => ({
  kind,
  value,
  qualifier: { when: "", variables: {}, conditions: [], side: "", ...q },
  source: {},
  note: "",
});
const mk = (levels: ValueLevel[], resource?: boolean): ValueCardData => ({
  scale: { text: "hours of work", unit: "h", rate: "", context: "", direction: "lower", source: {} },
  variables: [],
  endpoint: { subject: { typeIri: "", typeLabel: "", words: "" }, reference: { typeIri: "", typeLabel: "", words: "" }, text: "", source: {} },
  meters: [],
  levels,
  ...(resource ? { resource: true } : {}),
});
const levels = [lv("Status", 100, { when: "2026-10-27" }), lv("Tolerable", 80, { when: "2027-06-30" }), lv("Budget", 60, { when: "2027-06-30" })];
const RECT = { left: 0, top: 0, right: 640, bottom: 320, width: 640, height: 320, x: 0, y: 0, toJSON: () => ({}) };

const shapeOf = (container: HTMLElement, label: string) => container.querySelector(`[role=slider][aria-label^="${label}"] .origin-center`)!;
const rectSize = (el: Element) => {
  const r = el.querySelector("rect")!;
  return [r.getAttribute("width"), r.getAttribute("height"), r.getAttribute("fill")];
};

describe("a Budget level on a Development Resource", () => {
  it("is drawn as the Goal marker (10 x 34, green); on a Value it is an ordinary custom kind (the diamond, 18 x 18)", () => {
    const resource = render(<PlanValueGraph data={mk(levels, true)} editing={false} onChangeLevels={() => {}} />);
    expect(rectSize(shapeOf(resource.container, "Budget"))).toEqual(["10", "34", "#16a34a"]);
    cleanup();
    const value = render(<PlanValueGraph data={mk(levels)} editing={false} onChangeLevels={() => {}} />);
    expect(rectSize(shapeOf(value.container, "Budget"))).toEqual(["18", "18", "#6366f1"]);
  });

  it("keeps its own word: the marker is named Budget, not Goal", () => {
    const { container } = render(<PlanValueGraph data={mk(levels, true)} editing={false} onChangeLevels={() => {}} />);
    expect(container.querySelector('[role=slider][aria-label^="Budget"]')).not.toBeNull();
    expect(container.querySelector('[role=slider][aria-label^="Goal"]')).toBeNull();
  });

  it("is joined to the Status as the Goal is: the line says '40 h to Budget'; a Goal on a Value says '... to Goal'; a Budget on a Value says nothing", () => {
    const resource = render(<PlanValueGraph data={mk(levels, true)} editing={false} onChangeLevels={() => {}} />);
    expect(resource.container.textContent).toContain("40 h to Budget");
    cleanup();
    const goal = render(<PlanValueGraph data={mk([levels[0]!, levels[1]!, lv("Goal", 60, { when: "2027-06-30" })])} editing={false} onChangeLevels={() => {}} />);
    expect(goal.container.textContent).toContain("40 h to Goal");
    cleanup();
    const value = render(<PlanValueGraph data={mk(levels)} editing={false} onChangeLevels={() => {}} />);
    expect(value.container.textContent).not.toMatch(/ to (Budget|Goal)/);
  });

  it("makes the green band: the bands follow the Budget as they follow a Goal; on a Value a Budget makes none", () => {
    const resource = render(<PlanValueGraph data={mk(levels, true)} editing={false} onChangeLevels={() => {}} />);
    const tones = (c: HTMLElement) => [...c.querySelectorAll("[data-band]")].map((b) => b.getAttribute("data-band"));
    expect(tones(resource.container)).toContain("green");
    cleanup();
    const value = render(<PlanValueGraph data={mk(levels)} editing={false} onChangeLevels={() => {}} />);
    expect(tones(value.container)).not.toContain("green");
  });

  it("is joined to the Timeline's line as a Goal is: Status, Tolerable, Budget are three points; on a Value the Budget is not on the line", () => {
    const points = (c: HTMLElement) => [...c.querySelectorAll("polyline")].map((p) => p.getAttribute("points")!.split(" ").length);
    const resource = render(<PlanValueGraph data={mk(levels, true)} editing={false} onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(points(resource.container)).toEqual([3]);
    cleanup();
    const goal = render(<PlanValueGraph data={mk([levels[0]!, levels[1]!, lv("Goal", 60, { when: "2027-06-30" })])} editing={false} onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(points(goal.container)).toEqual([3]);
    cleanup();
    const value = render(<PlanValueGraph data={mk(levels)} editing={false} onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(points(value.container)).toEqual([2]);
  });
});

describe("the + New menu on a Development Resource", () => {
  const kindsOf = (set: number) => [...document.querySelectorAll(`[data-newmenu-set="${set}"] [data-kind-btn]`)].map((b) => b.getAttribute("data-kind-btn"));
  const open = () => fireEvent.click(screen.getByRole("button", { name: "+ New" }));
  const pick = (kind: string) => fireEvent.click(document.querySelector(`[data-newmenu-set="0"] [data-kind-btn="${kind}"]`)!);

  it("offers Past, Status, Tolerable, Budget and Wish; on a Value, Past, Status, Tolerable, Goal and Wish", () => {
    expect(RESOURCE_MENU_KINDS).toEqual(["Past", "Status", "Tolerable", "Budget", "Wish"]);
    expect(MENU_KINDS).toEqual(["Past", "Status", "Tolerable", "Goal", "Wish"]);
    render(<PlanValueGraph data={mk(levels, true)} editing onChangeLevels={() => {}} />);
    open();
    expect(kindsOf(0)).toEqual([...RESOURCE_MENU_KINDS]);
    expect(kindsOf(0)).not.toContain("Goal");
    cleanup();
    render(<PlanValueGraph data={mk(levels)} editing onChangeLevels={() => {}} />);
    open();
    expect(kindsOf(0)).toEqual([...MENU_KINDS]);
    expect(kindsOf(0)).not.toContain("Budget");
  });

  it("marks 'has one' on a kind the set holds; the Budget of a Resource does not mark the Budget button, as the mark is looked up by the button's own word", () => {
    const has = (kind: string) => document.querySelector(`[data-newmenu-set="0"] [data-kind-btn="${kind}"] [data-has-one]`) !== null;
    render(<PlanValueGraph data={mk(levels, true)} editing onChangeLevels={() => {}} />);
    open();
    expect(has("Tolerable")).toBe(true);
    expect(has("Past")).toBe(false);
    expect(has("Budget")).toBe(false);
    cleanup();
    render(<PlanValueGraph data={mk([levels[0]!, levels[1]!, lv("Goal", 60, { when: "2027-06-30" })])} editing onChangeLevels={() => {}} />);
    open();
    expect(has("Goal")).toBe(true);
  });

  it("a Wish added next to a Budget takes the Budget's date (a Budget is a target kind on a Resource); on a Value it takes none", () => {
    const onChange = vi.fn();
    render(<PlanValueGraph data={mk([levels[0]!, levels[2]!], true)} editing onChangeLevels={onChange} />);
    open();
    pick("Wish");
    expect(onChange).toHaveBeenCalledTimes(1);
    const added = (onChange.mock.calls[0]![0] as ValueLevel[]).at(-1)!;
    expect([added.kind, added.qualifier.when]).toEqual(["Wish", "2027-06-30"]);
    cleanup();
    const again = vi.fn();
    render(<PlanValueGraph data={mk([levels[0]!, levels[2]!])} editing onChangeLevels={again} />);
    open();
    pick("Wish");
    const addedOnValue = (again.mock.calls[0]![0] as ValueLevel[]).at(-1)!;
    expect([addedOnValue.kind, addedOnValue.qualifier.when]).toEqual(["Wish", ""]);
  });

  it("a Budget picked from the menu is written as a Budget, with the date of the set's latest target and a value on the axis", () => {
    const onChange = vi.fn();
    const { container } = render(<PlanValueGraph data={mk([levels[0]!, levels[1]!], true)} editing onChangeLevels={onChange} />);
    container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    open();
    pick("Budget");
    const added = (onChange.mock.calls[0]![0] as ValueLevel[]).at(-1)!;
    expect(added.kind).toBe("Budget");
    expect(added.qualifier.when).toBe("2027-06-30");
    expect(added.value).toBe(100);
  });

  it("kindText: a second Status says 'New Status (today)', any other kind keeps its word", () => {
    expect(kindText("Status", true)).toBe("New Status (today)");
    expect(kindText("Status", false)).toBe("Status");
    expect(kindText("Budget", true)).toBe("Budget");
  });
});
