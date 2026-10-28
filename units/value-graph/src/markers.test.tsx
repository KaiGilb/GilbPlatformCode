/** Big grab-able markers (44px hit area), labels clear of them, Timeline height, and "+ Status" keeping the whole qualifier set. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/mount";
import { PlanValueGraph } from "./PlanValueGraph";
import { MARKER, markerHalf } from "@kaigilb/gilbplatformcode-value-graph-geometry";
import type { LevelQualifier, ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

afterEach(cleanup);

const lv = (kind: string, value: number, q: Partial<LevelQualifier> = {}): ValueLevel => ({
  kind,
  value,
  qualifier: { when: "", variables: {}, conditions: [], side: "", ...q },
  source: {},
  note: "",
});

const mk = (levels: ValueLevel[]): ValueCardData => ({
  scale: { text: "minutes to learn", unit: "min", rate: "", context: "", direction: "lower", source: {} },
  variables: [],
  endpoint: { subject: { typeIri: "", typeLabel: "", words: "" }, reference: { typeIri: "", typeLabel: "", words: "" }, text: "", source: {} },
  meters: [],
  levels,
});

const kindsData = mk([
  lv("Past", 14, { when: "2025-10-01" }),
  lv("Status", 9, { when: "2026-10-27" }),
  lv("Tolerable", 10),
  lv("Goal", 5.2),
  lv("Wish", 1),
  lv("Fail", 20),
  lv("Survival", 18),
  lv("Stretch", 3),
]);

describe("marker sizes", () => {
  it("size table is as specified", () => {
    expect(MARKER.hit).toBe(44);
    expect(MARKER.status.r).toBe(12);
    expect(MARKER.past).toMatchObject({ r: 11, stroke: 3 });
    expect(MARKER.goal).toMatchObject({ w: 10, h: 34 });
    expect(MARKER.bar).toMatchObject({ w: 8, h: 30 });
    expect(MARKER.other.side).toBe(18);
    expect(MARKER.wish.outer).toBeCloseTo(9 * 1.7, 1);
  });

  it("draws the Status circle r=12, Past r=11 stroke 3, Goal 10x34, Tolerable 8x30 in the Arrow", () => {
    const { container } = render(<PlanValueGraph data={kindsData} editing onChangeLevels={() => {}} />);
    const shape = (label: string) => container.querySelector(`[role=slider][aria-label^="${label}"] .origin-center`)!;
    expect(shape("Status").querySelector("circle")!.getAttribute("r")).toBe("12");
    const past = shape("Past").querySelector("circle")!;
    expect(past.getAttribute("r")).toBe("11");
    expect(past.getAttribute("stroke-width")).toBe("3");
    const goal = shape("Goal").querySelector("rect")!;
    expect([goal.getAttribute("width"), goal.getAttribute("height")]).toEqual(["10", "34"]);
    const tol = shape("Tolerable").querySelector("rect")!;
    expect([tol.getAttribute("width"), tol.getAttribute("height")]).toEqual(["8", "30"]);
    const dia = shape("Stretch").querySelector("rect")!;
    expect([dia.getAttribute("width"), dia.getAttribute("height")]).toEqual(["18", "18"]);
  });

  for (const view of ["Arrow", "Timeline"]) {
    it(`${view}: every marker has a transparent hit rect of at least 44x44, centred`, () => {
      const dated = mk(kindsData.levels.map((l, n) => ({ ...l, qualifier: { ...l.qualifier, when: `2026-0${(n % 8) + 1}-01` } })));
      const { container } = render(<PlanValueGraph data={dated} editing onChangeLevels={() => {}} />);
      if (view === "Timeline") fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
      const sliders = [...container.querySelectorAll("[role=slider]")];
      expect(sliders.length).toBe(8);
      for (const s of sliders) {
        const r = s.querySelector("rect[fill=transparent]")!;
        expect(Number(r.getAttribute("width"))).toBeGreaterThanOrEqual(44);
        expect(Number(r.getAttribute("height"))).toBeGreaterThanOrEqual(44);
        const ring = s.querySelector("[data-focus-ring]")!;
        expect(Number(ring.getAttribute("cx"))).toBeCloseTo(Number(r.getAttribute("x")) + Number(r.getAttribute("width")) / 2, 5);
        expect(s.getAttribute("class")).toContain("group");
        expect((s as HTMLElement).style.cursor).toBe("grab");
      }
    });
  }
});

describe("labels clear of markers and rows do not overlap", () => {
  const stacked = mk([
    lv("Tolerable", 10, { conditions: ["Release 3.0"] }),
    lv("Goal", 5.2, { conditions: ["Release 3.0"] }),
    lv("Past", 14, { when: "2025-10-01", conditions: ["Release 1.0"] }),
    lv("Status", 9, { when: "2026-10-27", conditions: ["Release 1.0"] }),
    lv("Wish", 1, { conditions: ["Release 1.0"] }),
  ]);
  it("kind label sits above half+4, value label below half+4; row extents are disjoint", () => {
    const { container } = render(<PlanValueGraph data={stacked} editing onChangeLevels={() => {}} />);
    const rows = [...container.querySelectorAll("[data-row]")];
    expect(rows.length).toBe(2);
    const extents = rows.map((row) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const s of row.querySelectorAll("[role=slider]")) {
        const hit = s.querySelector("rect[fill=transparent]")!;
        const cy = Number(hit.getAttribute("y")) + Number(hit.getAttribute("height")) / 2;
        const kind = s.getAttribute("aria-label")!.split(",")[0]!;
        const half = markerHalf(kind);
        const texts = [...s.querySelectorAll("text")];
        const kindY = Number(texts[0]!.getAttribute("y"));
        const valY = Number(texts[1]!.getAttribute("y"));
        expect(kindY).toBeLessThanOrEqual(cy - half - 4);
        expect(valY - 11).toBeGreaterThanOrEqual(cy + half + 4 - 2);
        lo = Math.min(lo, kindY - 10, cy - 22);
        hi = Math.max(hi, ...texts.map((t) => Number(t.getAttribute("y")) + 2), cy + 22);
      }
      // The row's label: its words in the SVG (viewing) or its chip strip over the row (editing), found by the row's name.
      const name = row.getAttribute("aria-label")!;
      const strip = container.querySelector<HTMLElement>(`[data-row-chips="${name}"]`)!;
      lo = Math.min(lo, parseFloat(strip.style.top));
      return { lo, hi };
    });
    expect(extents[0]!.hi).toBeLessThanOrEqual(extents[1]!.lo);
  });
});

describe("Timeline height follows its width", () => {
  it("defaults to clamp(width x 0.45, 320, 560); a height prop wins", () => {
    const { container, rerender } = render(<PlanValueGraph data={kindsData} editing={false} onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(container.querySelector("svg")!.getAttribute("height")).toBe("320"); // jsdom width 640 -> 288 -> clamped up
    rerender(<PlanValueGraph data={kindsData} editing={false} height={500} onChangeLevels={() => {}} />);
    expect(container.querySelector("svg")!.getAttribute("height")).toBe("500");
  });
});

describe("+ Status keeps the whole qualifier set (through the + New menu)", () => {
  const row = {
    when: "2027-06-30",
    variables: { Country: ["Norway", "Sweden"], Release: "3.0", "User type": "Novice" } as Record<string, string | string[]>,
    conditions: ["If the war has ended", "in Stockholm"],
    side: "high" as const,
  };
  const base = mk([lv("Goal", 5, row), lv("Tolerable", 9, row), lv("Goal", 4, { variables: { Country: "Denmark" } })]);

  // The expected date below is the UTC day, the card's is the person's local day: they differ between local and UTC midnight.
  // At midday UTC both are the same day in every zone from UTC-11 to UTC+11, so the clock is set there.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  for (const kind of ["Status", "Past"] as const) {
    it(`${kind} from the + New menu copies choices, conditions and side (not the date) and lands on the same row`, () => {
      const onChange = vi.fn();
      const { container, rerender } = render(<PlanValueGraph data={base} editing onChangeLevels={onChange} />);
      expect(container.querySelectorAll("[data-row]").length).toBe(2);
      fireEvent.click(screen.getByRole("button", { name: "+ New" }));
      fireEvent.click(document.querySelector(`[data-newmenu-set="0"] [data-kind-btn="${kind}"]`)!);
      expect(onChange).toHaveBeenCalledTimes(1);
      const next = onChange.mock.calls[0][0] as ValueLevel[];
      const added = next[next.length - 1]!;
      expect(added.kind).toBe(kind);
      expect(added.qualifier.variables).toEqual(row.variables);
      expect(added.qualifier.conditions).toEqual(row.conditions);
      expect(added.qualifier.side).toBe("high");
      expect(added.qualifier.variables).not.toBe(row.variables);
      expect(added.qualifier.conditions).not.toBe(row.conditions);
      expect(added.qualifier.when).toBe(kind === "Status" ? new Date().toISOString().slice(0, 10) : "");
      rerender(<PlanValueGraph data={mk(next)} editing onChangeLevels={onChange} />);
      expect(container.querySelectorAll("[data-row]").length).toBe(2);
      expect(container.querySelector(`[data-row="0"] [data-level="${next.length - 1}"]`)).not.toBeNull();
    });
  }
});
