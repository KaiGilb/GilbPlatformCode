// "Today" on the Timeline is the person's own calendar day, as a UTC-midnight timestamp: not the UTC day.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/mount";
import { PlanValueGraph } from "./PlanValueGraph";
import type { ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

const zone = process.env.TZ;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

const lv = (kind: string, value: number, when: string): ValueLevel => ({
  kind,
  value,
  qualifier: { when, variables: {}, conditions: [], side: "" },
  source: {},
  note: "",
});
const card = (levels: ValueLevel[]): ValueCardData => ({
  scale: { text: "minutes", unit: "min", rate: "", context: "", direction: "lower", source: {} },
  variables: [],
  endpoint: { subject: { typeIri: "", typeLabel: "", words: "" }, reference: { typeIri: "", typeLabel: "", words: "" }, text: "", source: {} },
  meters: [],
  levels,
});

/** The x of the today line, and of the two points of the line through the levels dated the 26th and the 27th. */
function drawn(at: string, zoneName: string) {
  process.env.TZ = zoneName;
  vi.setSystemTime(new Date(at));
  const { container } = render(<PlanValueGraph data={card([lv("Status", 9, "2026-10-26"), lv("Goal", 5, "2026-10-27")])} editing={false} onChangeLevels={() => {}} />);
  fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
  const today = Number(container.querySelector("[data-today] line")!.getAttribute("x1"));
  const planned = container.querySelector('polyline[data-line="planned"]')!.getAttribute("points")!.split(" ").map((p) => Number(p.split(",")[0]));
  return { today, x26: planned[0]!, x27: planned[1]! };
}

describe("the today line of the Timeline", () => {
  it("just after local midnight in New Zealand (the 27th there, still the 26th in UTC) it is the 27th", () => {
    const { today, x26, x27 } = drawn("2026-10-26T12:30:00Z", "Pacific/Auckland");
    expect(x27).toBeGreaterThan(x26);
    expect(today).toBeCloseTo(x27, 5);
  });

  it("late in the evening in Los Angeles (still the 26th there, already the 27th in UTC) it is the 26th", () => {
    const { today, x26, x27 } = drawn("2026-10-27T03:30:00Z", "America/Los_Angeles");
    expect(x27).toBeGreaterThan(x26);
    expect(today).toBeCloseTo(x26, 5);
  });
});
