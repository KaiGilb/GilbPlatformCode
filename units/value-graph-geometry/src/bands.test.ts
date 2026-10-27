import { describe, expect, it } from "vitest";
import { arrowBands, BAND_GREEN, BAND_RED, BAND_YELLOW, buildAxis } from "./geometry";

// Axis 0..100 over pixels 0..1000 (10 px per unit), no padding surprises: values 0 and 100 are the extremes.
const axisFor = (dir: "lower" | "higher" | "target") => buildAxis([0, 100], dir, 0, 1000);
const pick = (b: ReturnType<typeof arrowBands>) => b.map((x) => ({ tone: x.tone, fill: x.fill, x0: Math.round(x.x0), x1: Math.round(x.x1) }));

describe("arrowBands (green after Goal)", () => {
  it("higher: red to Tolerable, yellow to Goal, green from Goal to the arrowhead", () => {
    const a = axisFor("higher");
    const [px] = [a.toPx];
    const b = arrowBands("higher", [80], [40], a);
    expect(b.map((x) => x.tone)).toEqual(["red", "yellow", "green"]);
    expect(b[0]).toMatchObject({ fill: BAND_RED, x0: px(a.min), x1: px(40) });
    expect(b[1]).toMatchObject({ fill: BAND_YELLOW, x0: px(40), x1: px(80) });
    expect(b[2]).toMatchObject({ fill: BAND_GREEN, x0: px(80), x1: px(a.max) });
    expect(b[2].x1).toBe(1000);
  });

  it("lower: numbers fall to the right; green runs from Goal to the right end", () => {
    const a = axisFor("lower");
    const b = arrowBands("lower", [20], [60], a);
    expect(b.map((x) => x.tone)).toEqual(["red", "yellow", "green"]);
    expect(b[0]).toMatchObject({ fill: BAND_RED, x0: 0, x1: a.toPx(60) });
    expect(b[1]).toMatchObject({ fill: BAND_YELLOW, x0: a.toPx(60), x1: a.toPx(20) });
    expect(b[2]).toMatchObject({ fill: BAND_GREEN, x0: a.toPx(20), x1: 1000 });
  });

  it("lower or higher without a Tolerable: green only", () => {
    expect(arrowBands("higher", [50], [], axisFor("higher")).map((x) => x.tone)).toEqual(["green"]);
    expect(arrowBands("lower", [50], [], axisFor("lower")).map((x) => x.tone)).toEqual(["green"]);
  });

  it("several Goals: green starts at the Goal nearest the worse end", () => {
    const h = axisFor("higher");
    expect(arrowBands("higher", [90, 70], [], h)[0].x0).toBe(h.toPx(70));
    const l = axisFor("lower");
    expect(arrowBands("lower", [10, 30], [], l)[0].x0).toBe(l.toPx(30));
  });

  it("no Goal: no bands", () => {
    expect(arrowBands("higher", [], [40], axisFor("higher"))).toEqual([]);
  });

  it("target with a Tolerable on each side: red, yellow, green, yellow, red", () => {
    const a = axisFor("target");
    const b = arrowBands("target", [40, 60], [20, 80], a);
    expect(pick(b)).toEqual([
      { tone: "green", fill: BAND_GREEN, x0: a.toPx(40), x1: a.toPx(60) },
      { tone: "yellow", fill: BAND_YELLOW, x0: a.toPx(20), x1: a.toPx(40) },
      { tone: "red", fill: BAND_RED, x0: 0, x1: a.toPx(20) },
      { tone: "yellow", fill: BAND_YELLOW, x0: a.toPx(60), x1: a.toPx(80) },
      { tone: "red", fill: BAND_RED, x0: a.toPx(80), x1: 1000 },
    ].map((x) => ({ ...x, x0: Math.round(x.x0), x1: Math.round(x.x1) })));
  });

  it("target with no Tolerable on a side: yellow to the line end on that side", () => {
    const a = axisFor("target");
    const b = arrowBands("target", [40, 60], [20], a);
    expect(b.map((x) => x.tone)).toEqual(["green", "yellow", "red", "yellow"]);
    expect(b[3]).toMatchObject({ fill: BAND_YELLOW, x0: a.toPx(60), x1: 1000 });
    const none = arrowBands("target", [40, 60], [], a);
    expect(none.map((x) => x.tone)).toEqual(["green", "yellow", "yellow"]);
    expect(none[1]).toMatchObject({ x0: 0, x1: a.toPx(40) });
  });

  it("target with a single Goal: red to Tolerable, yellow to Goal, green away from the Tolerable", () => {
    const a = axisFor("target");
    const lowT = arrowBands("target", [50], [30], a);
    expect(lowT.map((x) => x.tone)).toEqual(["red", "yellow", "green"]);
    expect(lowT[0]).toMatchObject({ x0: 0, x1: a.toPx(30) });
    expect(lowT[1]).toMatchObject({ x0: a.toPx(30), x1: a.toPx(50) });
    expect(lowT[2]).toMatchObject({ x0: a.toPx(50), x1: 1000 });
    const highT = arrowBands("target", [50], [70], a);
    expect(highT.map((x) => x.tone)).toEqual(["green", "yellow", "red"]);
    expect(highT[0]).toMatchObject({ x0: 0, x1: a.toPx(50) });
    expect(highT[2]).toMatchObject({ x0: a.toPx(70), x1: 1000 });
  });

  it("target with a single Goal and no Tolerable: green from the Goal to the arrowhead", () => {
    const a = axisFor("target");
    const b = arrowBands("target", [50], [], a);
    expect(b.map((x) => x.tone)).toEqual(["green"]);
    expect(b[0]).toMatchObject({ x0: a.toPx(50), x1: 1000 });
  });
});
