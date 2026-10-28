/** Probes of the graph: identity by index, full-screen keyboard, row moves, new controls. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { read, render } from "../test/mount";
import userEvent from "@testing-library/user-event";
import { PlanValueGraph } from "./PlanValueGraph";
import type { EndpointPart, LevelQualifier, ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";


const TODAY = "2026-10-27";
beforeEach(() => {
  read.mockResolvedValue({ state: "defined", does: "A phone program." });
});
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

const lv = (kind: string, value: number | null, q: Partial<LevelQualifier> = {}, note = ""): ValueLevel => ({
  kind,
  value,
  qualifier: { when: "", variables: {}, conditions: [], side: "", ...q },
  source: {},
  note,
});
const NONE: EndpointPart = { typeIri: "", typeLabel: "", words: "" };
const APP: EndpointPart = { typeIri: "https://ontology.example.test/base/t/MobileApp", typeLabel: "mobile app", words: "" };
const mk = (levels: ValueLevel[], subject = NONE, reference = NONE): ValueCardData => ({
  scale: { text: "minutes", unit: "min", rate: "", context: "", direction: "lower", source: {} },
  variables: [{ name: "Country", definition: "", defaultOption: "Norway", options: [{ name: "Norway", definition: "" }, { name: "Sweden", definition: "" }], source: {} }],
  endpoint: { subject, reference, text: "", source: {} },
  meters: [],
  levels,
});
const RECT = { left: 0, top: 0, right: 640, bottom: 320, width: 640, height: 320, x: 0, y: 0, toJSON: () => ({}) };
const slider = (c: Element, i: number) => c.querySelector(`[role=slider][data-level="${i}"]`)!;
const noteOf = (l: ValueLevel) => l.note;

// Three levels in three rows (different conditions), told apart by note.
const A = lv("Goal", 5, { when: "2027-01-01", conditions: ["a"] }, "A");
const B = lv("Goal", 9, { when: "2027-06-30", conditions: ["b"] }, "B");
const C = lv("Goal", 7, { when: "2027-09-01", conditions: ["c"] }, "C");

describe("identity by list position when another person changes the list", () => {
  it("a level popover that is open stays on the level it was opened on when an earlier level is deleted by someone else", () => {
    const onChange = vi.fn();
    const r = render(<PlanValueGraph data={mk([A, B, C])} editing onChangeLevels={onChange} />);
    r.container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    fireEvent.pointerDown(slider(r.container, 1), { clientX: 100, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(slider(r.container, 1), { clientX: 100, clientY: 40, pointerId: 1 });
    expect(screen.getByRole("dialog", { name: "Level" })).toBeTruthy();
    // Another person deletes A; the refreshed list is [B, C].
    r.rerender(<PlanValueGraph data={mk([B, C])} editing onChangeLevels={onChange} />);
    const input = screen.getByLabelText("Value");
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as ValueLevel[];
    const changed = next.filter((l, n) => l.value !== [B, C][n]!.value).map(noteOf);
    expect(changed).toEqual(["B"]);
  });

  it("a drag in progress writes to the level it started on when an earlier level is deleted by someone else", () => {
    const onChange = vi.fn();
    const r = render(<PlanValueGraph data={mk([A, B, C])} editing onChangeLevels={onChange} />);
    r.container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    fireEvent.pointerDown(slider(r.container, 1), { clientX: 200, clientY: 40, pointerId: 1 });
    r.rerender(<PlanValueGraph data={mk([B, C])} editing onChangeLevels={onChange} />);
    fireEvent.pointerMove(slider(r.container, 0), { clientX: 400, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(slider(r.container, 0), { clientX: 400, clientY: 40, pointerId: 1 });
    const call = onChange.mock.calls[0];
    if (!call) return; // no write at all is also safe
    const next = call[0] as ValueLevel[];
    const changed = next.filter((l, n) => l.value !== [B, C][n]!.value).map(noteOf);
    expect(changed).toEqual(["B"]);
  });
});

describe("full screen keyboard", () => {
  const openFull = () => fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
  const layer = () => screen.getByRole("dialog", { name: "Illustration, full screen" });
  const base = mk([lv("Status", 9, { when: TODAY }), lv("Goal", 5, { when: "2027-06-30" })], APP);

  it("Escape with a Subject type popover open closes only the popover, not the full screen", async () => {
    render(<PlanValueGraph data={base} editing onChangeLevels={() => {}} title="Learn" />);
    openFull();
    fireEvent.click(within(layer()).getAllByRole("button", { name: "Subject: mobile app" })[0]!);
    const pop = await screen.findByTestId("endpoint-type-popover");
    fireEvent.keyDown(pop, { key: "Escape" });
    expect(screen.queryByTestId("endpoint-type-popover")).toBeNull();
    expect(screen.queryByTestId("plan-graph-fullscreen")).not.toBeNull();
  });

  it("Tab from the Subject type popover reaches its 'Open in GilbVeda' link", async () => {
    const user = userEvent.setup();
    render(<PlanValueGraph data={base} editing onChangeLevels={() => {}} title="Learn" />);
    openFull();
    fireEvent.click(within(layer()).getAllByRole("button", { name: "Subject: mobile app" })[0]!);
    const link = await screen.findByRole("link", { name: /Open in GilbVeda/ });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("endpoint-type-popover")));
    await user.tab();
    expect(document.activeElement).toBe(link);
  });

  it("Tab out of the end of the + New menu in full screen stays inside the full-screen dialog", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button>page behind</button>
        <PlanValueGraph data={base} editing onChangeLevels={() => {}} title="Learn" />
      </div>,
    );
    openFull();
    fireEvent.click(within(layer()).getByRole("button", { name: "+ New" }));
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    items[items.length - 1]!.focus();
    await user.tab();
    expect(layer().contains(document.activeElement) || menu.contains(document.activeElement)).toBe(true);
  });
});

describe("row move from the Arrow chips", () => {
  const norway = { Country: "Norway" };
  const pickCountry = (chipIndex: number, to: string) => {
    fireEvent.click(document.querySelectorAll<HTMLElement>('[data-chip="var:Country"]')[chipIndex]!);
    const group = screen.getByRole("group", { name: /^Choose Country for/ });
    fireEvent.click(within(group).getByRole("checkbox", { name: /Norway$/ }));
    fireEvent.click(within(group).getByRole("checkbox", { name: new RegExp(`${to}$`) }));
    fireEvent.click(within(group).getByRole("button", { name: "Done" }));
  };

  it("one row per set: changing Country moves the whole set, Status included (nothing is left behind)", () => {
    const onChange = vi.fn();
    const levels = [lv("Status", 9, { when: TODAY, variables: norway }), lv("Goal", 5, { when: "2027-06-30", variables: norway }), lv("Goal", 4, { when: "2028-06-30", variables: norway })];
    render(<PlanValueGraph data={mk(levels)} editing onChangeLevels={onChange} />);
    expect(document.querySelectorAll('[data-chip="var:Country"]')).toHaveLength(1);
    pickCountry(0, "Sweden");
    const next = onChange.mock.calls[0]![0] as ValueLevel[];
    expect(next.every((l) => l.qualifier.variables.Country === "Sweden")).toBe(true);
    expect(next.map((l) => l.qualifier.when)).toEqual([TODAY, "2027-06-30", "2028-06-30"]);
  });
});

describe("new controls: names and touch size", () => {
  it("the + New menu button names contain their visible text (Status with a Status already: 'New Status (today)')", () => {
    render(<PlanValueGraph data={mk([lv("Status", 9, { when: TODAY }), lv("Goal", 5, { when: "2027-06-30" })])} editing onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "+ New" }));
    const btn = within(screen.getByRole("menu")).getAllByRole("menuitem").find((b) => b.textContent!.includes("New Status (today)"))!;
    expect(btn.getAttribute("aria-label")!.toLowerCase()).toContain("new status (today)");
  });

  it("the Arrow / Timeline tabs are 44 px high", () => {
    render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-06-30" })])} editing onChangeLevels={() => {}} />);
    for (const name of ["Arrow", "Timeline"]) {
      const cls = screen.getByRole("tab", { name }).className;
      expect(cls.includes("min-h-[44px]") || cls.includes("h-11") || cls.includes("min-h-11")).toBe(true);
    }
  });

  it("the Level popover's close button is 44 px high", () => {
    const r = render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-06-30" })])} editing onChangeLevels={() => {}} />);
    r.container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    fireEvent.pointerDown(slider(r.container, 0), { clientX: 100, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(slider(r.container, 0), { clientX: 100, clientY: 40, pointerId: 1 });
    const cls = within(screen.getByRole("dialog", { name: "Level" })).getByRole("button", { name: "close" }).className;
    expect(cls.includes("min-h-[44px]") || cls.includes("h-11") || cls.includes("min-h-11")).toBe(true);
  });
});

describe("click-to-place menu position and type popover dismissal", () => {
  it("the click-to-place menu opened near the bottom of the window is moved up so its kind buttons are on screen", () => {
    const r = render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-01-01" }), lv("Goal", 9, { when: "2027-06-30", conditions: ["b"] })])} editing onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    const svg = r.container.querySelector("svg")!;
    svg.getBoundingClientRect = () => ({ ...RECT, top: window.innerHeight - 270, bottom: window.innerHeight + 50, y: window.innerHeight - 270 });
    fireEvent.click(svg, { clientX: 300, clientY: window.innerHeight - 20 });
    const menu = screen.getByRole("menu");
    const top = Number.parseFloat(menu.style.top);
    // The menu has at least two rows of 44 px buttons plus a heading: it needs about 150 px.
    expect(top + 150).toBeLessThanOrEqual(window.innerHeight);
  });

  it("opening a second type popover closes the first", async () => {
    const { TypeTermPopover } = await import("@kaigilb/gilbplatformcode-type-term-popover");
    render(
      <div>
        <TypeTermPopover typeName="Person" triggerTestId="t1" popoverTestId="p1">A</TypeTermPopover>
        <TypeTermPopover typeName="Task" triggerTestId="t2" popoverTestId="p2">B</TypeTermPopover>
        <button>elsewhere</button>
      </div>,
    );
    fireEvent.click(screen.getByTestId("t1"));
    await screen.findByTestId("p1");
    fireEvent.click(screen.getByTestId("t2"));
    await screen.findByTestId("p2");
    expect(screen.queryAllByRole("dialog").length).toBe(1);
  });

  it("a click outside an open type popover closes it", async () => {
    const { TypeTermPopover } = await import("@kaigilb/gilbplatformcode-type-term-popover");
    render(
      <div>
        <TypeTermPopover typeName="Person" triggerTestId="t1" popoverTestId="p1">A</TypeTermPopover>
        <button>elsewhere</button>
      </div>,
    );
    fireEvent.click(screen.getByTestId("t1"));
    await screen.findByTestId("p1");
    fireEvent.pointerDown(screen.getByRole("button", { name: "elsewhere" }));
    fireEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryAllByRole("dialog").length).toBe(0);
  });
});
