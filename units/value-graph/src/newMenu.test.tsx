/** The "+ New" menu in the Illustration (sets by qualifier, kinds per set), levelLike, click-to-place, Escape order, key N. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "../test/mount";
import { useState, type ReactNode } from "react";
import { PlanValueGraph, markerRenders } from "./PlanValueGraph";
import { groupLevels, parseDate, buildAxis, snapValue } from "@kaigilb/gilbplatformcode-value-graph-geometry";
import { levelLike } from "@kaigilb/gilbplatformcode-value-card-model";
import type { LevelQualifier, ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

const TODAY = "2026-10-27";
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
  document.body.style.overflow = "";
});

const lv = (kind: string, value: number | null, q: Partial<LevelQualifier> = {}): ValueLevel => ({
  kind,
  value,
  qualifier: { when: "", variables: {}, conditions: [], side: "", ...q },
  source: {},
  note: "",
});
const country = (c: string) => ({ Country: c });
const mk = (levels: ValueLevel[], withVars = true): ValueCardData => ({
  scale: { text: "minutes to learn", unit: "min", rate: "", context: "in [Country]", direction: "lower", source: {} },
  variables: withVars
    ? [
        {
          name: "Country",
          definition: "",
          defaultOption: "Norway",
          options: [
            { name: "Norway", definition: "" },
            { name: "Sweden", definition: "" },
          ],
          source: {},
        },
      ]
    : [],
  endpoint: { subject: { typeIri: "", typeLabel: "", words: "" }, reference: { typeIri: "", typeLabel: "", words: "" }, text: "", source: {} },
  meters: [],
  levels,
});

// Two sets (Country = Norway, Country = Sweden), each with a Status and a dated Goal.
const base = mk([
  lv("Past", 14, { when: "2025-10-01", variables: country("Norway") }),
  lv("Status", 9, { when: TODAY, variables: country("Norway") }),
  lv("Tolerable", 10, { when: "2027-06-30", variables: country("Norway") }),
  lv("Goal", 5, { when: "2027-06-30", variables: country("Norway") }),
  lv("Status", 12, { when: TODAY, variables: country("Sweden") }),
  lv("Goal", 6, { when: "2028-01-01", variables: country("Sweden") }),
]);

const RECT = { left: 0, top: 0, right: 640, bottom: 320, width: 640, height: 320, x: 0, y: 0, toJSON: () => ({}) };
const KINDS = ["Past", "Status", "Tolerable", "Goal", "Wish", "Fail", "Survival"];

/** The graph with its data held in state, so an add shows up like it does in the card. */
function mount(start: ValueCardData = base, view: "arrow" | "timeline" = "arrow") {
  const log = vi.fn();
  function Harness() {
    const [d, setD] = useState(start);
    return (
      <PlanValueGraph
        data={d}
        editing
        onChangeLevels={(next) => {
          log(next);
          setD({ ...d, levels: next });
        }}
      />
    );
  }
  const r = render(<Harness />);
  if (view === "timeline") fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
  r.container.querySelector("svg")!.getBoundingClientRect = () => RECT;
  return { ...r, log };
}
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "+ New" }));
// The offer is the five kinds and "Other word…"; Fail and Survival are typed there.
const kindBtn = (set: number, kind: string) => document.querySelector(`[data-newmenu-set="${set}"] [data-kind-btn="${kind}"]`) as HTMLElement;
const menuEl = () => document.querySelector("[data-newmenu]");
const lastWrite = (log: ReturnType<typeof vi.fn>) => log.mock.calls[log.mock.calls.length - 1]![0] as ValueLevel[];

describe("levelLike", () => {
  const from = lv("Goal", 5, { when: "2027-06-30", variables: { Country: ["Norway", "Sweden"], Release: "3.0" }, conditions: ["in Stockholm"], side: "high" });
  const members = [
    lv("Status", 9, { when: "2026-01-01" }),
    lv("Status", 7, { when: "2026-09-01" }),
    lv("Status", null, { when: "2026-10-01" }),
    from,
    lv("Wish", 1, { when: "2029-01-01" }),
    lv("Tolerable", 10, { when: "2027-01-01" }),
  ];
  const opts = { members, axisMid: 4, today: TODAY };

  it("copies the qualifier fresh (choices, conditions, side)", () => {
    const n = levelLike(from, "Goal", { ...opts });
    expect(n.qualifier.variables).toEqual(from.qualifier.variables);
    expect(n.qualifier.variables.Country).not.toBe(from.qualifier.variables.Country);
    expect(n.qualifier.conditions).toEqual(["in Stockholm"]);
    expect(n.qualifier.conditions).not.toBe(from.qualifier.conditions);
    expect(n.qualifier.side).toBe("high");
    expect(n.source).toEqual({});
  });

  it("date: Status today, Past none; a target kind takes the set's latest Tolerable/Goal/Wish date (the Arrow and the Timeline are one rule)", () => {
    expect(levelLike(from, "Status", { ...opts }).qualifier.when).toBe(TODAY);
    expect(levelLike(from, "Past", { ...opts }).qualifier.when).toBe("");
    for (const kind of ["Tolerable", "Goal", "Wish", "Fail", "Survival", "Stretch"]) {
      expect(levelLike(from, kind, { ...opts }).qualifier.when).toBe("2029-01-01");
      expect(levelLike(from, kind, { members: [], axisMid: 1 }).qualifier.when).toBe("");
    }
  });

  it("value: the latest Status, else the Tolerable/Goal midpoint, else the axis middle; snapped", () => {
    expect(levelLike(from, "Wish", { ...opts }).value).toBe(7);
    const noStatus = members.filter((m) => m.kind !== "Status");
    expect(levelLike(from, "Wish", { ...opts, members: noStatus }).value).toBe(7.5);
    expect(levelLike(from, "Wish", { ...opts, members: noStatus, snap: Math.round }).value).toBe(8);
    expect(levelLike(from, "Wish", { ...opts, members: [from] }).value).toBe(4);
    expect(levelLike(from, "Wish", { ...opts, members: [from], when: "2030-02-02", value: 3.5 })).toMatchObject({ value: 3.5, qualifier: { when: "2030-02-02" } });
  });
});

describe("the + New menu", () => {
  it("shows only when editing", () => {
    render(<PlanValueGraph data={base} editing={false} onChangeLevels={() => {}} />);
    expect(screen.queryByRole("button", { name: "+ New" })).toBeNull();
  });

  it("the button is 44 px high, sits right after the view tabs and left of Full screen", () => {
    render(<PlanValueGraph data={base} editing onChangeLevels={() => {}} />);
    const b = screen.getByRole("button", { name: "+ New" });
    expect(b.className).toContain("h-11");
    expect(b.className).toContain("min-h-[44px]");
    const order = [...document.querySelectorAll("[role=tab], button")].filter((e) => ["Arrow", "Timeline", "+ New", "⤢"].includes(e.textContent!.trim()));
    expect(order.map((e) => e.textContent!.trim())).toEqual(["Arrow", "Timeline", "+ New", "⤢"]);
  });

  it("lists one section per set drawn, with the 5 direct kinds, each with a marker icon; Arrow rows on the Arrow, series on the Timeline", () => {
    mount();
    openMenu();
    const sets = document.querySelectorAll("[data-newmenu-set]");
    expect(sets.length).toBe(groupLevels(base).length);
    expect(sets.length).toBe(2);
    expect([...sets[0]!.querySelectorAll("[data-kind-btn]")].map((b) => b.getAttribute("data-kind-btn"))).toEqual(KINDS.slice(0, 5));
    expect(sets[0]!.querySelector("[data-kind-btn=Goal] svg *")).not.toBeNull();
    expect(sets[0]!.getAttribute("aria-label")).toBe(groupLevels(base)[0]!.label);
    cleanup();
    mount(base, "timeline");
    openMenu();
    expect(document.querySelectorAll("[data-newmenu-set]").length).toBe(2);
    expect(document.querySelector("[data-newmenu-set='0']")!.getAttribute("aria-label")).toBe(groupLevels(base)[0]!.label);
  });

  it("every kind, from every set, in both views, lands in the set (and row) it was added from, in one write", () => {
    for (const view of ["arrow", "timeline"] as const) {
      const sets = groupLevels(base);
      sets.forEach((set, s) => {
        for (const kind of KINDS) {
          const { container, log } = mount(base, view);
          openMenu();
          if (kindBtn(s, kind)) fireEvent.click(kindBtn(s, kind));
          else {
            // Fail and Survival are typed as the other word.
            fireEvent.click(document.querySelector(`[data-newmenu-set="${s}"] [data-other]`)!);
            const input = document.querySelector("[data-other-input]") as HTMLInputElement;
            fireEvent.change(input, { target: { value: kind } });
            fireEvent.keyDown(input, { key: "Enter" });
          }
          expect(log).toHaveBeenCalledTimes(1);
          const next = lastWrite(log);
          expect(next.length).toBe(base.levels.length + 1);
          expect(next.slice(0, base.levels.length)).toEqual(base.levels);
          const added = next[next.length - 1]!;
          const at = next.length - 1;
          expect(added.kind).toBe(kind);
          const after = mk(next);
          const grouped = groupLevels(after);
          const hit = grouped.findIndex((g) => g.indexes.includes(at));
          expect(grouped[hit]!.key, `${view} ${set.label} ${kind}`).toBe(set.key);
          expect(hit).toBe(s);
          if (view === "arrow") expect(container.querySelector(`[data-row="${s}"] [data-level="${at}"]`)).not.toBeNull();
          else expect(container.querySelector(`[data-level="${at}"]`)).not.toBeNull();
          // Date rules (all dates here are equal within a set, so both views agree).
          const rowDate = s === 0 ? "2027-06-30" : "2028-01-01";
          expect(added.qualifier.when).toBe(kind === "Status" ? TODAY : kind === "Past" ? "" : rowDate);
          // Value: the set's Status.
          expect(added.value).toBe(s === 0 ? 9 : 12);
          expect(menuEl()).toBeNull();
          cleanup();
        }
      });
    }
  });

  it("the new level carries the whole qualifier of its set (choices, conditions)", () => {
    const q = { when: "2027-06-30", variables: { Country: ["Norway", "Sweden"] }, conditions: ["Release 3.0", "in Stockholm"], side: "high" as const };
    const { log } = mount(mk([lv("Goal", 5, q), lv("Tolerable", 9, q)]));
    openMenu();
    fireEvent.click(kindBtn(0, "Wish"));
    const added = lastWrite(log).at(-1)!;
    expect(added.qualifier).toEqual(q);
    expect(added.qualifier.variables).not.toBe(q.variables);
    expect(added.qualifier.conditions).not.toBe(q.conditions);
  });

  it("a kind the set already has shows 'has one' (not Past, which repeats); Status reads 'New Status (today)'", () => {
    mount();
    openMenu();
    const has = (set: number, kind: string) => kindBtn(set, kind).querySelector("[data-has-one]") !== null;
    expect(has(0, "Goal")).toBe(true);
    expect(has(0, "Tolerable")).toBe(true);
    expect(has(0, "Status")).toBe(true);
    expect(has(0, "Past")).toBe(false);
    expect(has(0, "Wish")).toBe(false);
    expect(has(1, "Tolerable")).toBe(false);
    expect(has(1, "Past")).toBe(false);
    expect(kindBtn(0, "Status").textContent).toContain("New Status (today)");
    expect(kindBtn(0, "Goal").textContent).toContain("has one");
    expect(kindBtn(0, "Wish").textContent).not.toContain("has one");
    // Still offered: a second Goal can be added.
    cleanup();
    const again = mount();
    openMenu();
    fireEvent.click(kindBtn(0, "Goal"));
    expect(again.log).toHaveBeenCalledTimes(1);
    expect(lastWrite(again.log).filter((l) => l.kind === "Goal" && l.qualifier.variables.Country === "Norway").length).toBe(2);
  });

  it("a set with no Status offers plain 'Status'", () => {
    mount(mk([lv("Goal", 5, { when: "2027-01-01" })], false));
    openMenu();
    expect(kindBtn(0, "Status").textContent).toBe("Status");
  });

  it("Past repeats freely: two Pasts in a row, two writes", () => {
    const { log } = mount();
    openMenu();
    fireEvent.click(kindBtn(0, "Past"));
    // The new level's value popover is open; close it and add another.
    openMenu();
    fireEvent.click(kindBtn(0, "Past"));
    expect(log).toHaveBeenCalledTimes(2);
    expect(lastWrite(log).filter((l) => l.kind === "Past" && l.qualifier.variables.Country === "Norway").length).toBe(3);
  });

  it("the filter narrows the sets, and the add still goes through the full list", () => {
    const { log } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Show Country" }));
    const row = screen.getByRole("checkbox", { name: "Show Country Sweden" });
    row.focus();
    if (!(row as HTMLInputElement).checked) fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(document.querySelectorAll("[role=slider]").length).toBe(2);
    openMenu();
    const sets = document.querySelectorAll("[data-newmenu-set]");
    expect(sets.length).toBe(1);
    expect(sets[0]!.getAttribute("aria-label")).toBe(groupLevels(mk(base.levels.slice(4)))[0]!.label);
    fireEvent.click(kindBtn(0, "Wish"));
    const next = lastWrite(log);
    expect(next.length).toBe(7);
    expect(next.slice(0, 6)).toEqual(base.levels);
    expect(next[6]!.qualifier.variables).toEqual(country("Sweden"));
  });

  it("afterwards the new marker is selected, its value popover is open with the number selected, and it drags at once", () => {
    const { container, log } = mount();
    openMenu();
    fireEvent.click(kindBtn(0, "Wish"));
    const at = 6;
    const marker = container.querySelector(`[data-level="${at}"]`)!;
    expect(marker.hasAttribute("data-selected")).toBe(true);
    expect(container.querySelectorAll("[data-selected]").length).toBe(1);
    const pop = screen.getByRole("dialog", { name: "Level" });
    expect(within(pop).getByText(/^Wish/)).toBeTruthy();
    const input = within(pop).getByLabelText("Value") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("9");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 1]);
    // Type at once.
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(log).toHaveBeenCalledTimes(2);
    expect(lastWrite(log)[at]!.value).toBe(4);
    // And drag it.
    const m = container.querySelector(`[data-level="${at}"]`)!;
    const r = m.querySelector("rect[fill=transparent]")!;
    const cx = Number(r.getAttribute("x")) + 22;
    const cy = Number(r.getAttribute("y")) + 22;
    fireEvent.pointerDown(m, { clientX: cx, clientY: cy, pointerId: 1 });
    fireEvent.pointerMove(m, { clientX: cx + 90, clientY: cy, pointerId: 1 });
    fireEvent.pointerUp(m, { clientX: cx + 90, clientY: cy, pointerId: 1 });
    expect(log).toHaveBeenCalledTimes(3);
    expect(lastWrite(log)[at]!.value).not.toBe(4);
  });
});

describe("keyboard", () => {
  it("N opens the menu from the Illustration, not from a text field", () => {
    const { container } = mount();
    expect(menuEl()).toBeNull();
    fireEvent.keyDown(container.querySelector("[role=slider]")!, { key: "n" });
    expect(menuEl()).not.toBeNull();
    cleanup();
    mount();
    fireEvent.keyDown(document.querySelector("[role=slider]")!, { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Value"), { key: "n" });
    expect(menuEl()).toBeNull();
  });

  it("N does nothing when not editing", () => {
    render(<PlanValueGraph data={base} editing={false} onChangeLevels={() => {}} />);
    fireEvent.keyDown(document.querySelector("[role=slider]")!, { key: "N" });
    expect(menuEl()).toBeNull();
  });

  it("arrows move through the buttons, Enter picks, Escape closes it and hands the focus back to + New", () => {
    const { log } = mount();
    openMenu();
    const items = [...document.querySelectorAll<HTMLElement>("[data-menu-item]")];
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2]!, { key: "ArrowLeft" });
    fireEvent.keyDown(items[1]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: "End" });
    expect(document.activeElement).toBe(items[items.length - 1]);
    expect(items[items.length - 1]!.textContent).toBe("New qualifier set…");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(menuEl()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ New" }));
    expect(log).not.toHaveBeenCalled();
  });
});

describe("click-to-place on the Timeline", () => {
  const data = mk(
    [
      lv("Past", 14, { when: "2026-06-01", variables: country("Norway") }),
      lv("Status", 9, { when: TODAY, variables: country("Norway") }),
      lv("Tolerable", 10, { when: "2027-06-30", variables: country("Norway") }),
      lv("Goal", 5, { when: "2027-06-30", variables: country("Norway") }),
      lv("Status", 12, { when: TODAY, variables: country("Sweden") }),
      lv("Goal", 6, { when: "2027-12-31", variables: country("Sweden") }),
    ],
    true,
  );
  const slider = (c: Element, i: number) => c.querySelector(`[role=slider][data-level="${i}"]`)!;
  const centre = (el: Element) => {
    const r = el.querySelector("rect[fill=transparent]")!;
    return { x: Number(r.getAttribute("x")) + 22, y: Number(r.getAttribute("y")) + 22 };
  };
  /** Pixel of a date and a value, read off two markers (past 14 min and goal 5 min). */
  function px(c: Element) {
    const a = centre(slider(c, 0));
    const b = centre(slider(c, 3));
    const ta = parseDate("2026-06-01")!;
    const tb = parseDate("2027-06-30")!;
    return {
      x: (d: string) => a.x + ((parseDate(d)! - ta) * (b.x - a.x)) / (tb - ta),
      y: (v: number) => a.y + ((v - 14) * (b.y - a.y)) / (5 - 14),
    };
  }

  it("the click-to-place menu shows exactly the five kinds in each set, then Other word… (no More)", () => {
    const { container } = mount(data, "timeline");
    const m = px(container);
    fireEvent.click(container.querySelector("svg")!, { clientX: m.x("2027-03-10"), clientY: m.y(9) });
    const menu = menuEl();
    expect(menu).not.toBeNull();
    const sets = menu!.querySelectorAll("[data-newmenu-set]");
    expect(sets.length).toBe(2);
    sets.forEach((set) => {
      expect([...set.querySelectorAll("[data-kind-btn]")].map((b) => b.getAttribute("data-kind-btn"))).toEqual(["Past", "Status", "Tolerable", "Goal", "Wish"]);
      expect(set.querySelector("[data-more]")).toBeNull();
      expect(set.querySelector("[data-other]")!.textContent).toBe("Other word…");
    });
  });

  it("a click on an empty spot opens 'Add here: date · value', nearest series first, and the pick gets that date and value", () => {
    const { container, log } = mount(data, "timeline");
    const m = px(container);
    fireEvent.click(container.querySelector("svg")!, { clientX: m.x("2027-03-10"), clientY: m.y(7) });
    const menu = menuEl()!;
    expect(menu.getAttribute("aria-label")).toBe("Add here: 10 Mar 2027 · 7 min");
    expect(menu.textContent).toContain("Add here: 10 Mar 2027 · 7 min");
    const sets = menu.querySelectorAll("[data-newmenu-set]");
    expect(sets.length).toBe(2);
    expect(sets[0]!.getAttribute("aria-label")).toBe(groupLevels(data)[0]!.label); // Norway's Status-to-Goal line (no Tolerable: 9 is better than 10, lower is better) runs through the click
    expect(menu.querySelector("[data-new-set]")).toBeNull();
    fireEvent.click(sets[0]!.querySelector("[data-kind-btn=Wish]")!);
    expect(log).toHaveBeenCalledTimes(1);
    const added = lastWrite(log).at(-1)!;
    expect(added).toMatchObject({ kind: "Wish", value: 7, qualifier: { when: "2027-03-10", variables: country("Norway") } });
    expect(groupLevels(mk(lastWrite(log)))[0]!.indexes).toContain(6);
  });

  it("a click nearer the other series lists that one first", () => {
    const { container, log } = mount(data, "timeline");
    const m = px(container);
    fireEvent.click(container.querySelector("svg")!, { clientX: m.x("2027-10-01"), clientY: m.y(7.3) });
    const sets = menuEl()!.querySelectorAll("[data-newmenu-set]");
    expect(sets[0]!.getAttribute("aria-label")).toBe(groupLevels(data)[1]!.label);
    fireEvent.click(sets[0]!.querySelector("[data-kind-btn=Goal]")!);
    const added = lastWrite(log).at(-1)!;
    expect(added.qualifier.variables).toEqual(country("Sweden"));
    expect(added).toMatchObject({ value: 7, qualifier: { when: "2027-10-01" } });
  });

  it("a click in the 'no date' lane gives an empty date", () => {
    const { container, log } = mount(data, "timeline");
    const m = px(container);
    fireEvent.click(container.querySelector("svg")!, { clientX: 584, clientY: m.y(7) });
    expect(menuEl()!.getAttribute("aria-label")).toBe("Add here: no date · 7 min");
    fireEvent.click(menuEl()!.querySelector("[data-kind-btn=Status]")!);
    expect(lastWrite(log).at(-1)).toMatchObject({ kind: "Status", value: 7, qualifier: { when: "" } });
  });

  it("a click on a marker or outside the plot opens nothing; nothing without editing", () => {
    const { container } = mount(data, "timeline");
    const m = px(container);
    fireEvent.click(slider(container, 0), { clientX: m.x("2026-06-01"), clientY: m.y(14) });
    expect(menuEl()).toBeNull();
    fireEvent.click(container.querySelector("svg")!, { clientX: m.x("2027-03-10"), clientY: 2 });
    expect(menuEl()).toBeNull();
    cleanup();
    const r = render(<PlanValueGraph data={data} editing={false} onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    r.container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    fireEvent.click(r.container.querySelector("svg")!, { clientX: 200, clientY: 100 });
    expect(menuEl()).toBeNull();
  });

  it("the plot value is snapped to the axis step", () => {
    const { container } = mount(data, "timeline");
    const m = px(container);
    fireEvent.click(container.querySelector("svg")!, { clientX: m.x("2027-03-10"), clientY: m.y(9.4) });
    const ax = buildAxis([14, 9, 10, 5, 12, 6], "lower", 0, 1);
    expect(menuEl()!.getAttribute("aria-label")).toBe(`Add here: 10 Mar 2027 · ${snapValue(ax, 9.4, true)} min`);
  });
});

describe("Escape order in full screen", () => {
  const layer = () => screen.getByRole("dialog", { name: "Illustration, full screen" });
  it("Escape closes the menu first, then the layer", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    fireEvent.click(within(layer()).getByRole("button", { name: "+ New" }));
    expect(menuEl()).not.toBeNull();
    // The menu is above the layer (modal-layer z-index), outside its DOM subtree.
    expect((menuEl() as HTMLElement).style.zIndex).toBe("100");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(menuEl()).toBeNull();
    expect(layer()).toBeTruthy();
    expect(document.activeElement).toBe(within(layer()).getByRole("button", { name: "+ New" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.querySelector("[data-testid=plan-graph-fullscreen]")).toBeNull();
  });

  it("adding in full screen writes once and opens the popover there", () => {
    const { log } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    fireEvent.click(within(layer()).getByRole("button", { name: "+ New" }));
    fireEvent.click(kindBtn(1, "Goal"));
    expect(log).toHaveBeenCalledTimes(1);
    expect(within(layer()).getByRole("dialog", { name: "Level" })).toBeTruthy();
  });
});

describe("New qualifier set…", () => {
  function withEditor() {
    function Harness() {
      const [d, setD] = useState(base);
      return (
        <div>
          <PlanValueGraph data={d} editing onChangeLevels={(n) => setD({ ...d, levels: n })} />
          <section>
            <div data-testid="plan-level-add">
              <input aria-label="New level kind" />
            </div>
          </section>
        </div>
      );
    }
    return render(<Harness />);
  }

  it("closes the menu, then focuses the Levels 'add level' editor", () => {
    withEditor();
    openMenu();
    fireEvent.click(document.querySelector("[data-new-set]")!);
    expect(menuEl()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(document.activeElement).toBe(screen.getByLabelText("New level kind"));
  });

  it("from full screen it closes the layer first", () => {
    withEditor();
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Illustration, full screen" })).getByRole("button", { name: "+ New" }));
    fireEvent.click(document.querySelector("[data-new-set]")!);
    expect(document.querySelector("[data-testid=plan-graph-fullscreen]")).toBeNull();
    expect(menuEl()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(document.activeElement).toBe(screen.getByLabelText("New level kind"));
  });
});

describe("the 200-level budget", () => {
  it("one pointermove still re-renders at most 2 markers, one drop is one write, and opening the menu re-renders none", () => {
    const many = Array.from({ length: 200 }, (_, i) => lv("Goal", i + 1, { conditions: [`c${i}`] }));
    const onChange = vi.fn();
    const { container } = render(<PlanValueGraph data={mk(many, false)} editing onChangeLevels={onChange} />);
    container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    markerRenders.count = 0;
    openMenu();
    // The menu shows the first 12 sets, a search field and "Show all (N)"; all 200 appear only on request.
    expect(document.querySelectorAll("[data-newmenu-set]").length).toBe(12);
    fireEvent.click(screen.getByRole("menuitem", { name: "Show all (200)" }));
    expect(document.querySelectorAll("[data-newmenu-set]").length).toBe(200);
    fireEvent.keyDown(document.querySelector("[data-newmenu]")!, { key: "Escape" });
    expect(markerRenders.count).toBe(0);
    const first = container.querySelectorAll("[role=slider]")[50]!;
    fireEvent.pointerDown(first, { clientX: 100, clientY: 20, pointerId: 1 });
    markerRenders.count = 0;
    fireEvent.pointerMove(first, { clientX: 300, clientY: 20, pointerId: 1 });
    expect(markerRenders.count).toBeGreaterThan(0);
    expect(markerRenders.count).toBeLessThanOrEqual(2);
    fireEvent.pointerUp(first, { clientX: 300, clientY: 20, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("five kinds and Other word…, no More, no Fail or Survival offered", () => {
  const direct = (set: number) => [...document.querySelectorAll(`[data-newmenu-set="${set}"] [data-kind-btn]`)].map((b) => b.getAttribute("data-kind-btn"));
  const type = (word: string) => {
    fireEvent.click(document.querySelector('[data-newmenu-set="0"] [data-other]')!);
    const input = document.querySelector("[data-other-input]") as HTMLInputElement;
    fireEvent.change(input, { target: { value: word } });
    fireEvent.keyDown(input, { key: "Enter" });
  };

  it("each set shows exactly Past, Status, Tolerable, Goal, Wish (even when it holds them), then Other word…", () => {
    mount();
    openMenu();
    expect(direct(0)).toEqual(["Past", "Status", "Tolerable", "Goal", "Wish"]);
    expect(document.querySelector('[data-newmenu-set="0"] [data-kind-btn="Goal"] [data-has-one]')).not.toBeNull();
    expect(document.querySelector("[data-more]")).toBeNull();
    expect(menuEl()!.textContent).not.toMatch(/More|Fail|Survival/);
    expect(document.querySelector('[data-newmenu-set="0"] [data-other]')!.textContent).toBe("Other word…");
  });

  it("Other word… opens the free-word input directly; typing Fail adds a Fail level", () => {
    const { log } = mount();
    openMenu();
    type("Fail");
    expect(lastWrite(log).at(-1)!.kind).toBe("Fail");
    expect(menuEl()).toBeNull();
  });

  it("Other word… takes a typed word and adds it", () => {
    const { log } = mount();
    openMenu();
    type("Stretch");
    expect(lastWrite(log).at(-1)!.kind).toBe("Stretch");
  });
});
