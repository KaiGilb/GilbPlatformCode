import { describe, expect, it } from "vitest";
import { neighbourhoodHopsFor } from "./neighbourHops";

describe("neighbourhoodHopsFor", () => {
  it("walks nothing without a selection, including an empty id and a temp id", () => {
    expect(neighbourhoodHopsFor("3", null)).toBe(0);
    expect(neighbourhoodHopsFor("3", undefined)).toBe(0);
    expect(neighbourhoodHopsFor("1", "")).toBe(0);
    expect(neighbourhoodHopsFor("all", "temp:draft")).toBe(0);
    expect(neighbourhoodHopsFor("1", "temp:")).toBe(0);
  });

  it("does not treat a word that merely starts with temp as a draft", () => {
    expect(neighbourhoodHopsFor("2", "temporary")).toBe(2);
    expect(neighbourhoodHopsFor("1", "Temp:1")).toBe(1);
  });

  it("maps 1, 2, and 3, and walks 3 when the filter is all", () => {
    expect(neighbourhoodHopsFor("1", "rec1")).toBe(1);
    expect(neighbourhoodHopsFor("2", "rec1")).toBe(2);
    expect(neighbourhoodHopsFor("3", "rec1")).toBe(3);
    expect(neighbourhoodHopsFor("all", "rec1")).toBe(3);
  });
});
