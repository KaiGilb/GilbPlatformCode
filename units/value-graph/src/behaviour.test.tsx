/** The Graph's own behaviour tests (level identity, Arrow chip rule, notices, dismissal, 44 px, progress and cap notes, the year range). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { read, render } from "../test/mount";
import { PlanValueGraph } from "./PlanValueGraph";
import { aliasLevelKey, levelLike, localToday, setLevelKey } from "@kaigilb/gilbplatformcode-value-card-model";
import type { EndpointPart, LevelQualifier, ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";


beforeEach(() => {
  read.mockResolvedValue({ state: "defined", does: "A phone program." });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
const mk = (levels: ValueLevel[]): ValueCardData => ({
  scale: { text: "minutes", unit: "min", rate: "", context: "in [Country]", direction: "lower", source: {} },
  variables: [{ name: "Country", definition: "", defaultOption: "Norway", options: [{ name: "Norway", definition: "" }, { name: "Sweden", definition: "" }], source: {} }],
  endpoint: { subject: NONE, reference: NONE, text: "", source: {} },
  meters: [],
  levels,
});
const RECT = { left: 0, top: 0, right: 640, bottom: 320, width: 640, height: 320, x: 0, y: 0, toJSON: () => ({}) };
const slider = (c: Element, i: number) => c.querySelector(`[role=slider][data-level="${i}"]`)!;
const GONE = "This level was removed by someone else.";
const keyed = (l: ValueLevel, key: string): ValueLevel => setLevelKey({ ...l, qualifier: { ...l.qualifier } }, key);

const A = lv("Goal", 5, { when: "2027-01-01", conditions: ["a"] }, "A");
const B = lv("Goal", 9, { when: "2027-06-30", conditions: ["b"] }, "B");
const C = lv("Goal", 7, { when: "2027-09-01", conditions: ["c"] }, "C");

describe("a level is held by its record key, and a vanished level writes nothing", () => {
  it("copies of the levels with the same record keys (a re-read): the open popover stays on B when A is deleted", () => {
    const onChange = vi.fn();
    const [a, b, c] = [keyed(A, "ra"), keyed(B, "rb"), keyed(C, "rc")];
    const r = render(<PlanValueGraph data={mk([a, b, c])} editing onChangeLevels={onChange} />);
    r.container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    fireEvent.pointerDown(slider(r.container, 1), { clientX: 100, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(slider(r.container, 1), { clientX: 100, clientY: 40, pointerId: 1 });
    r.rerender(<PlanValueGraph data={mk([keyed(B, "rb"), keyed(C, "rc")])} editing onChangeLevels={onChange} />);
    const input = screen.getByLabelText("Value");
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const next = onChange.mock.calls[0]![0] as ValueLevel[];
    expect(next.map((l) => [l.note, l.value])).toEqual([["B", 99], ["C", 7]]);
  });

  it("the open level is deleted by someone else: the popover closes, nothing is written, the notice says so", () => {
    const onChange = vi.fn();
    const onNotice = vi.fn();
    const r = render(<PlanValueGraph data={mk([keyed(A, "ra"), keyed(B, "rb"), keyed(C, "rc")])} editing onChangeLevels={onChange} onNotice={onNotice} />);
    r.container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    fireEvent.pointerDown(slider(r.container, 1), { clientX: 100, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(slider(r.container, 1), { clientX: 100, clientY: 40, pointerId: 1 });
    expect(screen.getByRole("dialog", { name: "Level" })).toBeTruthy();
    r.rerender(<PlanValueGraph data={mk([keyed(A, "ra"), keyed(C, "rc")])} editing onChangeLevels={onChange} onNotice={onNotice} />);
    expect(screen.queryByRole("dialog", { name: "Level" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("plan-graph-notice").textContent).toContain(GONE);
    expect(onNotice).toHaveBeenCalledWith(GONE);
  });

  it("the level under a drag is deleted by someone else: the drop writes nothing and the notice says so", () => {
    const onChange = vi.fn();
    const r = render(<PlanValueGraph data={mk([keyed(A, "ra"), keyed(B, "rb"), keyed(C, "rc")])} editing onChangeLevels={onChange} />);
    r.container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    fireEvent.pointerDown(slider(r.container, 1), { clientX: 200, clientY: 40, pointerId: 1 });
    r.rerender(<PlanValueGraph data={mk([keyed(A, "ra"), keyed(C, "rc")])} editing onChangeLevels={onChange} />);
    fireEvent.pointerMove(slider(r.container, 1), { clientX: 400, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(slider(r.container, 1), { clientX: 400, clientY: 40, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("plan-graph-notice").textContent).toContain(GONE);
  });

  it("a level added here (no record yet) opens its popover, and keeps it when the saved copy arrives with a record key", () => {
    const onChange = vi.fn();
    const r = render(<PlanValueGraph data={mk([keyed(A, "ra"), keyed(B, "rb")])} editing onChangeLevels={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "+ New" }));
    fireEvent.click(within(screen.getByRole("menu")).getAllByRole("menuitem", { name: /^Add Goal to/ })[0]!);
    const added = (onChange.mock.calls[0]![0] as ValueLevel[])[2]!;
    r.rerender(<PlanValueGraph data={mk([keyed(A, "ra"), keyed(B, "rb"), added])} editing onChangeLevels={onChange} />);
    expect(screen.getByRole("dialog", { name: "Level" })).toBeTruthy();
    // the save finished: the host named the new key after the record, and the level comes back as a new object with that key
    setLevelKey(added, "new:7");
    aliasLevelKey("new:7", "rnew");
    r.rerender(<PlanValueGraph data={mk([keyed(A, "ra"), keyed(B, "rb"), keyed(added, "rnew")])} editing onChangeLevels={onChange} />);
    expect(screen.getByRole("dialog", { name: "Level" })).toBeTruthy();
    expect(screen.queryByTestId("plan-graph-notice")).toBeNull();
  });
});

describe("an Arrow chip and the shared Status/Past", () => {
  const norway = { Country: "Norway" };
  const pickCountry = (chipIndex: number, to: string) => {
    fireEvent.click(document.querySelectorAll<HTMLElement>('[data-chip="var:Country"]')[chipIndex]!);
    const group = screen.getByRole("group", { name: /^Choose Country for/ });
    fireEvent.click(within(group).getByRole("checkbox", { name: /Norway$/ }));
    fireEvent.click(within(group).getByRole("checkbox", { name: new RegExp(`${to}$`) }));
    fireEvent.click(within(group).getByRole("button", { name: "Done" }));
  };

  it("one row per set: a chip on a set with two Goals moves the whole set, Past and Status included, with no notice", () => {
    const onChange = vi.fn();
    const levels = [
      lv("Past", 14, { when: "2025-10-01", variables: norway }),
      lv("Status", 9, { when: "2026-10-27", variables: norway }),
      lv("Goal", 5, { when: "2027-06-30", variables: norway }),
      lv("Goal", 4, { when: "2028-06-30", variables: norway }),
    ];
    render(<PlanValueGraph data={mk(levels)} editing onChangeLevels={onChange} />);
    expect(document.querySelectorAll('[data-chip="var:Country"]')).toHaveLength(1);
    pickCountry(0, "Sweden");
    const next = onChange.mock.calls[0]![0] as ValueLevel[];
    expect(next.map((l) => [l.kind, l.qualifier.when, l.qualifier.variables.Country])).toEqual([
      ["Past", "2025-10-01", "Sweden"],
      ["Status", "2026-10-27", "Sweden"],
      ["Goal", "2027-06-30", "Sweden"],
      ["Goal", "2028-06-30", "Sweden"],
    ]);
    expect(screen.queryByTestId("plan-graph-notice")).toBeNull();
  });

  it("no other row of the set remains: Status and Past move with the row, and there is no notice", () => {
    const onChange = vi.fn();
    const levels = [lv("Past", 14, { when: "2025-10-01", variables: norway }), lv("Status", 9, { when: "2026-10-27", variables: norway }), lv("Goal", 5, { when: "2027-06-30", variables: norway })];
    render(<PlanValueGraph data={mk(levels)} editing onChangeLevels={onChange} />);
    pickCountry(0, "Sweden");
    const next = onChange.mock.calls[0]![0] as ValueLevel[];
    expect(next.every((l) => l.qualifier.variables.Country === "Sweden")).toBe(true);
    expect(screen.queryByTestId("plan-graph-notice")).toBeNull();
  });

  it("the Timeline legend chip still moves the whole set, Past and Status included", () => {
    const onChange = vi.fn();
    const levels = [lv("Status", 9, { when: "2026-10-27", variables: norway }), lv("Goal", 5, { when: "2027-06-30", variables: norway }), lv("Goal", 4, { when: "2028-06-30", variables: norway })];
    render(<PlanValueGraph data={mk(levels)} editing onChangeLevels={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    fireEvent.click(document.querySelector<HTMLElement>('[data-chip="var:Country"]')!);
    const group = screen.getByRole("group", { name: /^Choose Country for/ });
    fireEvent.click(within(group).getByRole("checkbox", { name: /Norway$/ }));
    fireEvent.click(within(group).getByRole("checkbox", { name: /Sweden$/ }));
    fireEvent.click(within(group).getByRole("button", { name: "Done" }));
    const next = onChange.mock.calls[0]![0] as ValueLevel[];
    expect(next.every((l) => l.qualifier.variables.Country === "Sweden")).toBe(true);
  });
});

describe("names, the dismissing click, the local day", () => {
  it("two rows with the same Country (sets that differ by a condition, not by date) have different chip names", () => {
    const norway = { Country: "Norway" };
    render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-06-30", variables: norway, conditions: ["a"] }), lv("Goal", 4, { when: "2028-06-30", variables: norway, conditions: ["b"] })])} editing onChangeLevels={() => {}} />);
    const names = [...document.querySelectorAll<HTMLElement>('[data-chip="var:Country"]')].map((b) => b.getAttribute("aria-label"));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names.every((n) => n!.startsWith("Change Country, Norway,"))).toBe(true);
  });

  it("a click on empty plot while a popover is open only closes the popover (no + New menu)", () => {
    const r = render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-01-01" }), lv("Goal", 9, { when: "2027-06-30", conditions: ["b"] })])} editing onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    const svg = r.container.querySelector("svg")!;
    svg.getBoundingClientRect = () => RECT as DOMRect;
    fireEvent.pointerDown(slider(r.container, 0), { clientX: 100, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(slider(r.container, 0), { clientX: 100, clientY: 40, pointerId: 1 });
    expect(screen.getByRole("dialog", { name: "Level" })).toBeTruthy();
    fireEvent.click(svg, { clientX: 300, clientY: 150 });
    expect(screen.queryByRole("dialog", { name: "Level" })).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    // and with nothing open, the same click offers the menu
    fireEvent.click(svg, { clientX: 300, clientY: 150 });
    expect(screen.queryByRole("menu")).not.toBeNull();
  });

  it("'today' is the user's calendar day (New Zealand, just after local midnight: the 27th, not the UTC 26th)", () => {
    const prev = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      const now = new Date("2026-10-26T12:30:00Z");
      expect(now.toISOString().slice(0, 10)).toBe("2026-10-26");
      expect(localToday(now)).toBe("2026-10-27");
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const from = lv("Goal", 5, { when: "2027-06-30" });
      const status = levelLike(from, "Status", { members: [from], axisMid: 5, snap: (v) => v });
      expect(status.qualifier.when).toBe("2026-10-27");
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });
});

describe("44 px hit areas", () => {
  it("the filter chip is 44 px high", () => {
    render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-06-30", variables: { Country: "Norway" } })])} editing onChangeLevels={() => {}} />);
    expect(screen.getByRole("button", { name: "Show Country" }).className).toContain("min-h-[44px]");
  });
});

describe("header: progress and the cap", () => {
  it("a row move in progress says 'Moving 12 of 50…' and takes no drag", () => {
    const onChange = vi.fn();
    const r = render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-06-30" })])} editing onChangeLevels={onChange} progress={{ done: 12, total: 50 }} />);
    expect(screen.getByTestId("plan-graph-progress").textContent).toBe("Moving 12 of 50…");
    r.container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    fireEvent.pointerDown(slider(r.container, 0), { clientX: 100, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(slider(r.container, 0), { clientX: 300, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(slider(r.container, 0), { clientX: 300, clientY: 40, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("no progress: no line, and a drag still writes", () => {
    const onChange = vi.fn();
    const r = render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-06-30" }), lv("Goal", 9, { when: "2027-06-30", conditions: ["x"] })])} editing onChangeLevels={onChange} />);
    expect(screen.queryByTestId("plan-graph-progress")).toBeNull();
    r.container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    fireEvent.pointerDown(slider(r.container, 0), { clientX: 100, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(slider(r.container, 0), { clientX: 400, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(slider(r.container, 0), { clientX: 400, clientY: 40, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("a find that stopped at its cap says 'Showing the first 2000 of 2400 …' in the header, inline and in full screen", () => {
    render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-06-30" })])} editing onChangeLevels={() => {}} capped={{ total: 2400, cap: 2000 }} />);
    expect(screen.getByTestId("plan-graph-capped").textContent).toBe("Showing the first 2000 of 2400 records at this level.");
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(within(screen.getByTestId("plan-graph-fullscreen")).getByTestId("plan-graph-capped")).toBeTruthy();
  });
});

describe("the year range on a level's date field (the Arrow date chip is gone; the field is in the level popover)", () => {
  it("0202 shows 'Year must be 1900–2200' and is not written; a good year is accepted", () => {
    const onChange = vi.fn();
    const r = render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-06-30", variables: { Country: "Norway" } })])} editing onChangeLevels={onChange} />);
    r.container.querySelector("svg")!.getBoundingClientRect = () => RECT as DOMRect;
    fireEvent.pointerDown(slider(r.container, 0), { clientX: 100, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(slider(r.container, 0), { clientX: 100, clientY: 40, pointerId: 1 });
    const input = screen.getByLabelText("Date");
    fireEvent.change(input, { target: { value: "0202-10-27" } });
    expect(screen.getByRole("alert").textContent).toBe("Year must be 1900–2200");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "2031-10-27" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0]![0] as ValueLevel[])[0]!.qualifier.when).toBe("2031-10-27");
  });
});

describe("the + New menu on screen", () => {
  it("room below: the menu stays where it was opened", () => {
    const r = render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-01-01" }), lv("Goal", 9, { when: "2027-06-30", conditions: ["b"] })])} editing onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    const svg = r.container.querySelector("svg")!;
    svg.getBoundingClientRect = () => RECT as DOMRect;
    fireEvent.click(svg, { clientX: 300, clientY: 150 });
    expect(Number.parseFloat(screen.getByRole("menu").style.top)).toBe(150);
  });

  it("a click near the bottom of the window opens the menu upward, with a height that fits", () => {
    const r = render(<PlanValueGraph data={mk([lv("Goal", 5, { when: "2027-01-01" }), lv("Goal", 9, { when: "2027-06-30", conditions: ["b"] })])} editing onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    const svg = r.container.querySelector("svg")!;
    const vh = window.innerHeight;
    svg.getBoundingClientRect = () => ({ ...RECT, top: vh - 270, bottom: vh + 50, y: vh - 270 }) as DOMRect;
    fireEvent.click(svg, { clientX: 300, clientY: vh - 20 });
    const menu = screen.getByRole("menu");
    expect(Number.parseFloat(menu.style.top) + 150).toBeLessThanOrEqual(vh);
    expect(Number.parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(vh);
  });
});

describe("the type popover and the full-screen layer", () => {
  const APP: EndpointPart = { typeIri: "https://ontology.example.test/base/t/MobileApp", typeLabel: "mobile app", words: "" };
  it("Escape closes the + New menu only (one layer at a time), then the layer", () => {
    render(<PlanValueGraph data={{ ...mk([lv("Goal", 5, { when: "2027-06-30" })]), endpoint: { subject: APP, reference: NONE, text: "", source: {} } }} editing onChangeLevels={() => {}} title="Learn" />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    fireEvent.click(within(screen.getByTestId("plan-graph-fullscreen")).getByRole("button", { name: "+ New" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByTestId("plan-graph-fullscreen")).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByTestId("plan-graph-fullscreen")).toBeNull();
  });

  it("Tab from the last control of an open type popover wraps to its first, not to the layer", async () => {
    render(<PlanValueGraph data={{ ...mk([lv("Status", 9, { when: "2026-10-27" }), lv("Goal", 5, { when: "2027-06-30" })]), endpoint: { subject: APP, reference: NONE, text: "", source: {} } }} editing onChangeLevels={() => {}} title="Learn" />);
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    fireEvent.click(within(screen.getByTestId("plan-graph-fullscreen")).getAllByRole("button", { name: "Subject: mobile app" })[0]!);
    const link = await screen.findByRole("link", { name: /Open in GilbVeda/ });
    link.focus();
    const ok = fireEvent.keyDown(link, { key: "Tab" });
    expect(ok).toBe(false); // the popover took the key (wrap), the layer did not
    expect(document.activeElement).toBe(link);
  });

  it("a scroll closes an open type popover; so does a press outside it", async () => {
    render(<PlanValueGraph data={{ ...mk([lv("Goal", 5, { when: "2027-06-30" })]), endpoint: { subject: APP, reference: NONE, text: "", source: {} } }} editing onChangeLevels={() => {}} />);
    const trigger = () => screen.getAllByRole("button", { name: "Subject: mobile app" })[0]!;
    fireEvent.click(trigger());
    await screen.findByTestId("endpoint-type-popover");
    await act(async () => {
      fireEvent.scroll(window);
    });
    expect(screen.queryByTestId("endpoint-type-popover")).toBeNull();
    fireEvent.click(trigger());
    await screen.findByTestId("endpoint-type-popover");
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId("endpoint-type-popover")).toBeNull();
  });
});
