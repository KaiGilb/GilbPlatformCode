/** Pictures of the Subject and Reference types at the ends of each Arrow row, and changing a row's qualifiers / date in the graph. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { pics, read, render } from "../test/mount";
import { useState } from "react";
import { PlanValueGraph, markerRenders } from "./PlanValueGraph";
import type { EndpointPart, LevelQualifier, ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

const TODAY = "2026-10-27";
beforeEach(() => {
  pics.map = {};
  read.mockResolvedValue({ state: "defined", does: "A phone program." });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
});

const lv = (kind: string, value: number | null, q: Partial<LevelQualifier> = {}): ValueLevel => ({
  kind,
  value,
  qualifier: { when: "", variables: {}, conditions: [], side: "", ...q },
  source: {},
  note: "",
});
const country = (c: string) => ({ Country: c });
const part = (iri: string, label: string): EndpointPart => ({ typeIri: iri, typeLabel: label, words: "" });
const NONE = part("", "");
const APP = part("https://ontology.example.test/base/t/MobileApp", "mobile app");
const USER = part("https://ontology.example.test/base/t/AppUser", "AppUser");
const mk = (levels: ValueLevel[], subject = NONE, reference = NONE, direction: "lower" | "target" = "lower"): ValueCardData => ({
  scale: { text: "minutes to learn", unit: "min", rate: "", context: "", direction, source: {} },
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
  endpoint: { subject, reference, text: "", source: {} },
  meters: [],
  levels,
});
const base = mk([
  lv("Past", 14, { when: "2025-10-01", variables: country("Norway") }),
  lv("Status", 9, { when: TODAY, variables: country("Norway") }),
  lv("Tolerable", 10, { when: "2027-06-30", variables: country("Norway") }),
  lv("Goal", 5, { when: "2027-06-30", variables: country("Norway") }),
  lv("Status", 12, { when: TODAY, variables: country("Sweden") }),
  lv("Goal", 6, { when: "2028-01-01", variables: country("Sweden") }),
]);
const RECT = { left: 0, top: 0, right: 640, bottom: 320, width: 640, height: 320, x: 0, y: 0, toJSON: () => ({}) };

function mount(start: ValueCardData, view: "arrow" | "timeline" = "arrow") {
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
const lastWrite = (log: ReturnType<typeof vi.fn>) => log.mock.calls[log.mock.calls.length - 1]![0] as ValueLevel[];
const countryOf = (l: ValueLevel) => l.qualifier.variables.Country;

describe("pictures at the ends of each Arrow row", () => {
  it("each row has a Subject picture at the left and a Reference picture at the right; the caption is on the top row only", async () => {
    pics.map = { MobileApp: "https://ontology.example.test/files/phone.png", AppUser: "https://ontology.example.test/files/user.png" };
    const { container } = mount(mk(base.levels, APP, USER));
    await waitFor(() => expect(container.querySelectorAll('[data-endpoint-end] img')).toHaveLength(4));
    const rows = container.querySelectorAll("[data-row]").length;
    expect(rows).toBe(2);
    expect(container.querySelectorAll('[data-endpoint-end="subject"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-endpoint-end="reference"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-endpoint-end="subject"] img')).toHaveLength(2);
    expect(container.querySelectorAll('[data-endpoint-end="reference"] img')).toHaveLength(2);
    const sub = container.querySelectorAll<HTMLElement>('[data-endpoint-end="subject"]');
    const ref = container.querySelectorAll<HTMLElement>('[data-endpoint-end="reference"]');
    expect(parseFloat(sub[0]!.style.left)).toBeLessThan(parseFloat(ref[0]!.style.left));
    // The same height as the line of its row.
    expect(sub[0]!.style.top).toBe(ref[0]!.style.top);
    expect(parseFloat(sub[1]!.style.top)).toBeGreaterThan(parseFloat(sub[0]!.style.top));
    const caps = container.querySelectorAll("[data-endpoint-caption]");
    expect(caps).toHaveLength(2);
    expect(container.querySelector('[data-endpoint-caption="subject"]')!.textContent).toBe("mobile app");
    expect(container.querySelector('[data-endpoint-caption="reference"]')!.textContent).toBe("AppUser");
    // 28 px pictures, 44 px hit areas, named for a screen reader.
    expect(sub[0]!.querySelector("img")!.style.width).toBe("28px");
    expect(sub[0]!.style.width).toBe("44px");
    expect(sub[0]!.style.height).toBe("44px");
    expect(screen.getAllByRole("button", { name: "Subject: mobile app" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Reference: AppUser" })).toHaveLength(2);
  });

  it("the line starts and ends at least 36 px clear of the pictures (more when a value label at the end needs room for the caption)", () => {
    const line = (c: HTMLElement) => c.querySelector('[data-row="0"] line[stroke-width="1.5"]')!;
    const a = mount(mk(base.levels));
    const x1 = Number(line(a.container as HTMLElement).getAttribute("x1"));
    const x2 = Number(line(a.container as HTMLElement).getAttribute("x2"));
    a.unmount();
    const b = mount(mk(base.levels, APP, USER));
    expect(Number(line(b.container as HTMLElement).getAttribute("x1"))).toBeGreaterThanOrEqual(x1 + 36);
    expect(Number(line(b.container as HTMLElement).getAttribute("x2"))).toBeLessThanOrEqual(x2 - 36);
  });

  it.each([
    ["target", "subject"],
    ["lower", "reference"],
  ] as const)("Status 0 at the end of the line (%s scale, %s end): no label or date box meets the caption box", (direction, role) => {
    const data = mk(
      [lv("Status", 0, { when: TODAY, variables: country("Norway") }), lv("Goal", 10, { when: "2027-06-30", variables: country("Norway") })],
      APP,
      USER,
      direction,
    );
    const { container } = mount(data);
    const cap = container.querySelector<HTMLElement>(`[data-endpoint-caption="${role}"]`)!;
    const left = parseFloat(cap.style.left);
    const box = { l: left, r: left + parseFloat(cap.style.width), t: parseFloat(cap.style.top), b: parseFloat(cap.style.top) + parseFloat(cap.style.height) };
    const texts = [...container.querySelector('[data-level="0"]')!.querySelectorAll("text")];
    expect(texts.map((t) => t.textContent)).toEqual(["Status", "0", TODAY]); // kind, value, own date
    // The marker really sits at the end this caption belongs to.
    const x = Number(texts[1]!.getAttribute("x"));
    expect(role === "subject" ? x < 320 : x > 320).toBe(true);
    for (const t of texts) {
      const tx = Number(t.getAttribute("x"));
      const ty = Number(t.getAttribute("y"));
      const size = Number(t.getAttribute("font-size"));
      const w = (t.textContent ?? "").length * size * 0.58;
      const hit = tx - w / 2 < box.r && tx + w / 2 > box.l && ty - size < box.b && ty > box.t;
      expect(hit, `${t.textContent} meets the caption`).toBe(false);
    }
  });

  it("uses the GilbVeda type picture when there is one", async () => {
    pics.map = { MobileApp: "https://ontology.example.test/files/phone.png" };
    const { container } = mount(mk(base.levels, APP, USER));
    await waitFor(() => expect(container.querySelectorAll('[data-endpoint-end="subject"] img')).toHaveLength(2));
    expect(container.querySelector('[data-endpoint-end="subject"] img')!.getAttribute("src")).toBe("https://ontology.example.test/files/phone.png");
    // The Reference had no picture: no image and no stand-in drawing, its caption names the end.
    expect(container.querySelectorAll('[data-endpoint-end="reference"] img')).toHaveLength(0);
    expect(container.querySelectorAll('[data-endpoint-end="reference"] svg')).toHaveLength(0);
    expect(container.querySelector('[data-endpoint-caption="reference"]')!.textContent).toBe("AppUser");
  });

  it("a type with no picture draws neither an image nor an svg; the caption stays", () => {
    const { container } = mount(mk(base.levels, part("https://ontology.example.test/base/t/Widget", "Widget")));
    expect(container.querySelectorAll('[data-endpoint-end="subject"] img, [data-endpoint-end="subject"] svg')).toHaveLength(0);
    expect(container.querySelector('[data-endpoint-caption="subject"]')!.textContent).toBe("Widget");
  });

  it("an end whose part has no type shows nothing; both empty shows nothing at either end", () => {
    const only = mount(mk(base.levels, APP, NONE));
    expect(only.container.querySelectorAll('[data-endpoint-end="subject"]')).toHaveLength(2);
    expect(only.container.querySelector('[data-endpoint-end="reference"]')).toBeNull();
    expect(only.container.querySelector('[data-endpoint-caption="reference"]')).toBeNull();
    only.unmount();
    const none = mount(base);
    expect(none.container.querySelector("[data-endpoint-end]")).toBeNull();
    expect(none.container.querySelector("[data-endpoint-caption]")).toBeNull();
  });

  it("a click opens the type's definition with the GilbVeda link", async () => {
    mount(mk(base.levels, APP, USER));
    fireEvent.click(screen.getAllByRole("button", { name: "Subject: mobile app" })[0]!);
    const pop = await screen.findByTestId("endpoint-type-popover");
    expect(within(pop).getByText("A phone program.")).toBeTruthy();
    expect(within(pop).getByRole("link", { name: /Open in GilbVeda/ }).getAttribute("href")).toBe("https://ontology.example.test/base/t/MobileApp");
    expect(pop.getAttribute("aria-label")).toBe("mobile app definition");
  });

  it("direction target: the Subject is still left and the Reference right", () => {
    const { container } = mount(mk(base.levels, APP, USER, "target"));
    const sub = container.querySelector<HTMLElement>('[data-endpoint-end="subject"]')!;
    const ref = container.querySelector<HTMLElement>('[data-endpoint-end="reference"]')!;
    expect(parseFloat(sub.style.left)).toBeLessThan(parseFloat(ref.style.left));
    expect(parseFloat(sub.style.left)).toBeLessThan(parseFloat(ref.style.left));
  });

  it("the Timeline shows the Subject picture (20 px) beside the unit and nothing at the right", async () => {
    pics.map = { MobileApp: "https://ontology.example.test/files/phone.png" };
    const { container } = mount(mk(base.levels, APP, USER), "timeline");
    await waitFor(() => expect(container.querySelectorAll('[data-endpoint-end="subject"] img')).toHaveLength(1));
    const sub = container.querySelectorAll('[data-endpoint-end="subject"]');
    expect(sub).toHaveLength(1);
    expect(sub[0]!.querySelector("img")!.style.width).toBe("20px");
    expect(container.querySelector('[data-endpoint-end="reference"]')).toBeNull();
    expect(container.querySelector("[data-endpoint-caption]")).toBeNull();
    expect(screen.getByRole("button", { name: "Subject: mobile app" })).toBeTruthy();
  });
});

describe("Timeline axis with no picture", () => {
  it("shows the Subject caption (11 px grey) where the picture would be", () => {
    const { container } = mount(mk(base.levels, APP, USER), "timeline");
    const cap = container.querySelector<HTMLElement>('[data-endpoint-caption="subject"]')!;
    expect(cap.textContent).toBe("mobile app");
    expect(cap.className).toContain("text-[11px]");
    expect(cap.className).toContain("text-gray-500");
    expect(container.querySelectorAll('[data-endpoint-end="subject"] img')).toHaveLength(0);
    expect(container.querySelector('[data-endpoint-caption="reference"]')).toBeNull();
  });
});

describe("change a row's qualifiers in the graph", () => {
  const pickCountry = (to: string, from = "Norway") => {
    const group = screen.getByRole("group", { name: /^Choose Country for/ });
    fireEvent.click(within(group).getByRole("checkbox", { name: new RegExp(`${from}$`) }));
    fireEvent.click(within(group).getByRole("checkbox", { name: new RegExp(`${to}$`) }));
    fireEvent.click(within(group).getByRole("button", { name: "Done" }));
  };

  it("the Arrow row shows each qualifier as a chip and has NO date chip (dates are per level)", () => {
    mount(base);
    expect(screen.queryByRole("button", { name: /^Change date/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Change Country, Norway,/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Change Country, Sweden,/ })).toHaveLength(1);
  });

  it("an Arrow qualifier pick moves every level of the row in ONE call", () => {
    const { log } = mount(base);
    fireEvent.click(screen.getByRole("button", { name: /^Change Country, Norway,/ }));
    pickCountry("Sweden");
    expect(log).toHaveBeenCalledTimes(1);
    const next = lastWrite(log);
    expect(next.slice(0, 4).map(countryOf)).toEqual(["Sweden", "Sweden", "Sweden", "Sweden"]);
    // The other set is untouched (the same objects).
    expect(next[4]).toBe(base.levels[4]);
    expect(next[5]).toBe(base.levels[5]);
    // Values and dates did not move.
    expect(next.slice(0, 4).map((l) => [l.kind, l.value, l.qualifier.when])).toEqual(base.levels.slice(0, 4).map((l) => [l.kind, l.value, l.qualifier.when]));
  });

  it("Escape closes the picker and writes nothing", () => {
    const { log } = mount(base);
    fireEvent.click(screen.getByRole("button", { name: /^Change Country, Norway,/ }));
    fireEvent.keyDown(screen.getByRole("group", { name: /^Choose Country for/ }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: /^Choose Country for/ })).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it("a Timeline legend qualifier pick moves every level of the series", () => {
    const { log } = mount(base, "timeline");
    fireEvent.click(screen.getByRole("button", { name: /^Change Country, Norway,/ }));
    pickCountry("Sweden");
    expect(log).toHaveBeenCalledTimes(1);
    const next = lastWrite(log);
    expect(next.slice(0, 4).map(countryOf)).toEqual(["Sweden", "Sweden", "Sweden", "Sweden"]);
    expect(next[4]).toBe(base.levels[4]);
  });

  it("after a qualifier move the focus is on that qualifier's chip in the row's new place", () => {
    mount(base);
    fireEvent.click(screen.getByRole("button", { name: /^Change Country, Norway,/ }));
    pickCountry("Sweden");
    const at = document.activeElement as HTMLElement;
    expect(at.getAttribute("data-chip")).toBe("var:Country");
    expect(at.getAttribute("aria-label")).toMatch(/^Change Country, Sweden,/);
    expect(at.closest("[data-row-idx]")!.getAttribute("data-row-idx")!.split(",")).toContain("3");
  });

  it("every chip is a 44 x 44 px (or larger) hit area, and the strip is 44 px high", () => {
    const { container } = mount(base);
    const chips = [...container.querySelectorAll<HTMLElement>("[data-chip]")];
    expect(chips.length).toBeGreaterThanOrEqual(2);
    for (const c of chips) {
      expect(c.className).toContain("min-h-[44px]");
      expect(c.className).toContain("min-w-[44px]");
    }
    for (const strip of container.querySelectorAll<HTMLElement>("[data-row-chips]")) expect(strip.style.height).toBe("44px");
  });

  it("each Arrow row has its label as an accessible name, viewing and editing", () => {
    const label = "Country = Norway";
    const a = mount(base);
    expect(a.container.querySelector(`[data-row="0"]`)!.getAttribute("aria-label")).toBe(label);
    expect(screen.getByRole("group", { name: label })).toBeTruthy();
    a.unmount();
    const b = render(<PlanValueGraph data={base} editing={false} onChangeLevels={() => {}} />);
    expect(b.container.querySelector(`[data-row="0"]`)!.getAttribute("aria-label")).toBe(label);
  });

  it("viewing (not editing) shows no chips", () => {
    render(<PlanValueGraph data={base} editing={false} onChangeLevels={() => {}} />);
    expect(screen.queryByRole("button", { name: /^Change / })).toBeNull();
  });
});

describe("the 200-level budget is unchanged", () => {
  it("with 200 levels (and endpoint pictures, editing) one pointermove re-renders at most 2 markers; one drop is one call", () => {
    const many: ValueLevel[] = Array.from({ length: 200 }, (_, i) => lv("Goal", i + 1, { conditions: [`c${i}`] }));
    const onChange = vi.fn();
    const { container } = render(<PlanValueGraph data={mk(many, APP, USER)} editing onChangeLevels={onChange} />);
    container.querySelector("svg")!.getBoundingClientRect = () => RECT;
    const sliders = container.querySelectorAll("[role=slider]");
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
