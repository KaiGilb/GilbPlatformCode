/** A level whose number is a range text ("5-10") is drawn as a short bar between its two ends, labelled with the author's text. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/mount";
import { PlanValueGraph } from "./PlanValueGraph";
import type { ValueCardData, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";

afterEach(cleanup);

const lv = (kind: string, value: number | null, valueText?: string): ValueLevel => ({
  kind,
  value,
  ...(valueText ? { valueText } : {}),
  qualifier: { when: "", variables: {}, conditions: [], side: "", },
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

describe("range levels", () => {
  it("Arrow: 5-10 has a bar of non-zero length, the label shows the text, a plain level has no bar", () => {
    const { container } = render(<PlanValueGraph data={mk([lv("Goal", 7.5, "5-10"), lv("Tolerable", 12)])} editing onChangeLevels={() => {}} />);
    const goal = container.querySelector('[role=slider][aria-label^="Goal"]')!;
    const bar = goal.querySelector("[data-range-bar]")!;
    expect(bar).not.toBeNull();
    expect(Math.abs(Number(bar.getAttribute("x2")) - Number(bar.getAttribute("x1")))).toBeGreaterThan(0);
    expect(goal.textContent).toContain("5-10");
    expect(container.querySelector('[role=slider][aria-label^="Tolerable"] [data-range-bar]')).toBeNull();
  });
  it("Arrow: text that is not a number (approx. 5) shows as written, is not drawn on the line, and breaks nothing", () => {
    const { container } = render(<PlanValueGraph data={mk([lv("Goal", null, "approx. 5"), lv("Tolerable", 12)])} editing onChangeLevels={() => {}} />);
    expect(container.querySelector('[role=slider][aria-label^="Goal"]')!.textContent).toContain("approx. 5");
    expect(container.querySelector('[role=slider][aria-label^="Tolerable"]')).not.toBeNull();
  });
  it("Timeline: the bar is vertical, the label and the spoken value carry the text", () => {
    const data = mk([lv("Goal", 7.5, "5-10"), lv("Tolerable", 12)]);
    data.levels[0]!.qualifier.when = "2026-03-01";
    data.levels[1]!.qualifier.when = "2026-06-01";
    const { container } = render(<PlanValueGraph data={data} editing onChangeLevels={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    const goal = container.querySelector('[role=slider][aria-label^="Goal"]')!;
    const bar = goal.querySelector("[data-range-bar]")!;
    expect(Math.abs(Number(bar.getAttribute("y2")) - Number(bar.getAttribute("y1")))).toBeGreaterThan(0);
    expect(goal.getAttribute("aria-valuetext")).toContain("5-10");
    expect(goal.textContent).toContain("5-10");
  });
});
