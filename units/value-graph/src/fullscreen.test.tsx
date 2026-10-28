/** The Illustration goes full screen (portal, lifted view and filter) and keeps working there. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { render } from "../test/mount";
import { PlanValueGraph, markerRenders } from "./PlanValueGraph";
import type { ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

const lv = (kind: string, value: number, when: string, variables: Record<string, string> = {}): ValueLevel => ({
  kind,
  value,
  qualifier: { when, variables, conditions: [], side: "" },
  source: {},
  note: "",
});

const data: ValueCardData = {
  scale: { text: "minutes to learn", unit: "min", rate: "", context: "in [Country]", direction: "lower", source: {} },
  variables: [
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
  ],
  endpoint: { subject: { typeIri: "", typeLabel: "", words: "" }, reference: { typeIri: "", typeLabel: "", words: "" }, text: "", source: {} },
  meters: [],
  levels: [
    lv("Past", 14, "2025-10-01", { Country: "Norway" }),
    lv("Status", 9, "2026-10-27", { Country: "Norway" }),
    lv("Goal", 3, "2027-06-30", { Country: "Norway" }),
    lv("Status", 12, "2026-10-27", { Country: "Sweden" }),
  ],
};

const rect = { left: 0, top: 0, right: 640, bottom: 300, width: 640, height: 300, x: 0, y: 0, toJSON: () => ({}) };
const mount = (onChange = vi.fn(), d = data) => {
  render(<PlanValueGraph data={d} editing onChangeLevels={onChange} title="Learnability" />);
  return onChange;
};
const openFull = () => fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
const layer = () => screen.getByRole("dialog", { name: "Illustration, full screen" });
const esc = (el: Element = document.body) => fireEvent.keyDown(el, { key: "Escape" });

describe("full screen: open, close, focus, scroll lock", () => {
  it("the button opens a modal dialog layer and the inline graph shows a placeholder", () => {
    mount();
    const btn = screen.getByRole("button", { name: "Full screen" });
    expect(btn.getAttribute("title")).toBe("Full screen (F)");
    expect(document.querySelector("[data-testid=plan-graph-fullscreen]")).toBeNull();
    fireEvent.click(btn);
    const dlg = layer();
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.parentElement).toBe(document.body);
    expect(dlg.className).toContain("fixed inset-0 z-[70]");
    expect(within(dlg).getByText("Learnability")).toBeTruthy();
    expect(within(dlg).getAllByRole("slider").length).toBe(4);
    // Only one live graph: the inline one is a placeholder.
    expect(screen.getByTestId("plan-graph-placeholder").textContent).toContain("Shown full screen");
    expect(document.querySelectorAll("[role=slider]").length).toBe(4);
    expect(document.activeElement).toBe(within(dlg).getByRole("button", { name: "Close full screen" }));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("after close, focus is on the full-screen button and the body overflow is restored", () => {
    document.body.style.overflow = "auto";
    mount();
    openFull();
    fireEvent.click(screen.getByRole("button", { name: "Close full screen" }));
    expect(document.querySelector("[data-testid=plan-graph-fullscreen]")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Full screen" }));
    expect(document.body.style.overflow).toBe("auto");
  });

  it("the placeholder's Back closes the layer too", () => {
    mount();
    openFull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(document.querySelector("[data-testid=plan-graph-fullscreen]")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Full screen" }));
  });
});

describe("full screen: view and filter are lifted", () => {
  it("a view chosen inline is kept on open, and one changed in full screen is kept on close", () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    openFull();
    const tabs = within(layer()).getAllByRole("tab");
    expect(tabs.find((t) => t.textContent === "Timeline")!.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(within(layer()).getByRole("tab", { name: "Arrow" }));
    fireEvent.click(screen.getByRole("button", { name: "Close full screen" }));
    expect(screen.getByRole("tab", { name: "Arrow" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Timeline" }).getAttribute("aria-selected")).toBe("false");
  });

  const pick = (scope: HTMLElement | Document, name: string) => {
    fireEvent.click(within(scope as HTMLElement).getByRole("button", { name: "Show Country" }));
    const row = within(scope as HTMLElement).getByRole("checkbox", { name: `Show Country ${name}` });
    row.focus();
    if (!(row as HTMLInputElement).checked) fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
  };

  it("a filter chosen inline is kept on open, and one changed in full screen is kept on close", () => {
    mount();
    pick(document.body, "Norway");
    expect(screen.getByRole("button", { name: "Show Country" }).textContent).toContain("Norway");
    expect(document.querySelectorAll("[role=slider]").length).toBe(3);
    openFull();
    expect(within(layer()).getByRole("button", { name: "Show Country" }).textContent).toContain("Norway");
    expect(within(layer()).getAllByRole("slider").length).toBe(3);
    pick(layer(), "Sweden");
    expect(within(layer()).getAllByRole("slider").length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Close full screen" }));
    expect(screen.getByRole("button", { name: "Show Country" }).textContent).toContain("Sweden");
    expect(document.querySelectorAll("[role=slider]").length).toBe(1);
  });
});

describe("full screen: still operational", () => {
  const dragStatus = () => {
    const svg = layer().querySelector("svg")!;
    svg.getBoundingClientRect = () => rect;
    const status = within(layer()).getAllByRole("slider").find((s) => s.getAttribute("aria-label")!.startsWith("Status"))!;
    return { status };
  };

  it("dragging a marker in full screen commits exactly once with the new value", () => {
    const onChange = mount();
    openFull();
    const { status } = dragStatus();
    fireEvent.pointerDown(status, { clientX: 300, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(status, { clientX: 100, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(status, { clientX: 100, clientY: 20, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as ValueLevel[];
    const idx = data.levels.findIndex((l) => l.kind === "Status" && l.value === 9);
    expect(next[idx]!.value).not.toBe(9);
    expect(next.filter((l, i) => l !== data.levels[i]).length).toBe(1);
  });

  it("Past from the + New menu works in the layer and saves through the same callback", () => {
    const onChange = mount(vi.fn(), { ...data, variables: [], levels: [lv("Status", 9, "2026-10-27")] });
    openFull();
    fireEvent.click(within(layer()).getByRole("button", { name: "+ New" }));
    fireEvent.click(document.querySelector('[data-newmenu-set="0"] [data-kind-btn="Past"]')!);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0]![0] as ValueLevel[]).map((l) => l.kind)).toEqual(["Status", "Past"]);
  });

  it("the 200-level budget holds in the layer: one pointermove re-renders at most 2 markers", () => {
    const many: ValueLevel[] = Array.from({ length: 200 }, (_, i) => ({ ...lv("Goal", i + 1, "", {}), qualifier: { when: "", variables: {}, conditions: [`c${i}`], side: "" } }));
    const onChange = mount(vi.fn(), { ...data, variables: [], levels: many });
    openFull();
    layer().querySelector("svg")!.getBoundingClientRect = () => rect;
    const sliders = within(layer()).getAllByRole("slider");
    expect(sliders.length).toBe(200);
    const first = sliders[50]!;
    fireEvent.pointerDown(first, { clientX: 100, clientY: 20, pointerId: 1 });
    markerRenders.count = 0;
    fireEvent.pointerMove(first, { clientX: 300, clientY: 20, pointerId: 1 });
    expect(markerRenders.count).toBeGreaterThan(0);
    expect(markerRenders.count).toBeLessThanOrEqual(2);
    fireEvent.pointerUp(first, { clientX: 300, clientY: 20, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("full screen: Escape arbitration", () => {
  it("Escape during a drag cancels the drag only; with the picker open it closes the picker only; the third closes the layer", () => {
    const onChange = mount();
    openFull();
    const svg = layer().querySelector("svg")!;
    svg.getBoundingClientRect = () => rect;
    const status = within(layer()).getAllByRole("slider").find((s) => s.getAttribute("aria-label")!.startsWith("Status"))!;
    fireEvent.pointerDown(status, { clientX: 300, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(status, { clientX: 100, clientY: 20, pointerId: 1 });
    esc(status);
    expect(layer()).toBeTruthy();
    fireEvent.pointerUp(status, { clientX: 100, clientY: 20, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();

    // The qualifier picker.
    fireEvent.click(within(layer()).getByRole("button", { name: "Show Country" }));
    const group = within(layer()).getByRole("group", { name: "Choose Show Country" });
    const row = within(group).getByRole("checkbox", { name: "Show Country Norway" });
    row.focus();
    esc(row);
    expect(within(layer()).queryByRole("group", { name: "Choose Show Country" })).toBeNull();
    expect(layer()).toBeTruthy();
    expect(within(layer()).getByRole("button", { name: "Show Country" }).textContent).toContain("ALL");

    // Third: the layer.
    esc(document.body);
    expect(document.querySelector("[data-testid=plan-graph-fullscreen]")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Full screen" }));
    expect(document.body.style.overflow).toBe("");
  });

  it("Escape with a Level popover open closes the popover only", () => {
    mount();
    openFull();
    const marker = within(layer()).getAllByRole("slider")[0]!;
    fireEvent.keyDown(marker, { key: "Enter" });
    expect(within(layer()).getByRole("dialog", { name: "Level" })).toBeTruthy();
    esc(marker);
    expect(within(layer()).queryByRole("dialog", { name: "Level" })).toBeNull();
    expect(layer()).toBeTruthy();
    esc(marker);
    expect(document.querySelector("[data-testid=plan-graph-fullscreen]")).toBeNull();
  });

  it("Escape does not reach a listener under the layer", () => {
    mount();
    openFull();
    const under = vi.fn();
    document.addEventListener("keydown", under);
    esc(within(layer()).getAllByRole("slider")[0]!);
    document.removeEventListener("keydown", under);
    expect(under).not.toHaveBeenCalled();
  });
});

describe("full screen: the F key", () => {
  it("F toggles full screen from the Illustration and from the layer", () => {
    mount();
    fireEvent.keyDown(screen.getAllByRole("slider")[0]!, { key: "f" });
    expect(layer()).toBeTruthy();
    fireEvent.keyDown(within(layer()).getAllByRole("slider")[0]!, { key: "F" });
    expect(document.querySelector("[data-testid=plan-graph-fullscreen]")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Full screen" }));
  });

  it("F is ignored inside an input", () => {
    mount();
    fireEvent.keyDown(screen.getAllByRole("slider")[0]!, { key: "Enter" });
    const input = screen.getByLabelText("Value");
    fireEvent.keyDown(input, { key: "f" });
    expect(document.querySelector("[data-testid=plan-graph-fullscreen]")).toBeNull();
  });
});
