// The Development Resource card: its Budget level is the Goal point. `markerHalf(kind, resource)` is the one function of the
// geometry that reads the card's kind, through `kindClass` of the value-card-model unit.
import { describe, expect, it } from "vitest";
import { kindClass } from "@kaigilb/gilbplatformcode-value-card-model";
import { MARKER, markerHalf } from "./geometry";
import * as api from "./index";

describe("markerHalf(kind, resource)", () => {
  it("Budget on a Resource is sized as a Goal", () => {
    expect(markerHalf("Budget", true)).toBe(MARKER.goal.half);
    expect(markerHalf("Budget", true)).toBe(17);
    expect(markerHalf("Budget", true)).toBe(markerHalf("Goal"));
    expect(markerHalf("budget", true)).toBe(17);
    expect(markerHalf("  BUDGET ", true)).toBe(17);
  });

  it("Budget on a Value (or with no flag) is a custom kind: the diamond", () => {
    expect(markerHalf("Budget")).toBe(MARKER.other.half);
    expect(markerHalf("Budget", false)).toBe(12.8);
    expect(markerHalf("Budget", undefined)).toBe(12.8);
  });

  it("Goal is the Goal marker on both cards", () => {
    expect(markerHalf("Goal")).toBe(17);
    expect(markerHalf("Goal", true)).toBe(17);
    expect(markerHalf("goal", false)).toBe(17);
  });

  it("every other kind is the same on both cards", () => {
    const want: [string, number][] = [
      ["Status", 12],
      ["Past", 12.5],
      ["Tolerable", 15],
      ["Fail", 15],
      ["Survival", 15],
      ["Wish", 15.3],
      ["Fuel", 12.8],
      ["", 12.8],
    ];
    for (const [kind, half] of want) {
      expect(markerHalf(kind), kind).toBe(half);
      expect(markerHalf(kind, true), kind).toBe(half);
      expect(markerHalf(kind, false), kind).toBe(half);
    }
  });

  it("the kind is trimmed first (through kindClass), where 0.1.0 read the raw text: ' Status ' is a Status", () => {
    expect(markerHalf(" Status ")).toBe(12);
    expect(markerHalf("\tWish\n")).toBe(15.3);
  });

  it("it follows kindClass of the model unit: the same word gives the same class", () => {
    for (const kind of ["Budget", "Goal", " Status ", "Fuel"]) {
      for (const resource of [true, false]) {
        const k = kindClass(kind, resource);
        const half = markerHalf(kind, resource);
        expect(half, `${kind} ${resource}`).toBe(markerHalf(k));
      }
    }
  });

  it("takes two parameters (the second is optional) and is exported from the index", () => {
    expect(api.markerHalf).toBe(markerHalf);
    expect(markerHalf.length).toBe(2);
  });
});
