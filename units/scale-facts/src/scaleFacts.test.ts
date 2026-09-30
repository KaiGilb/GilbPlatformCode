import { describe, expect, it } from "vitest";
import {
  emptyScale,
  extrasFromScale,
  formatContextWindow,
  isTimeUnit,
  parseContextWindow,
  parseDatedLevel,
  scaleFromExtras,
  scaleHasContent,
  todayIsoDate,
} from "./scaleFacts";

describe("scale facts", () => {
  it("formats a local date and recognises time words without treating kilo as time", () => {
    expect(todayIsoDate(new Date(2020, 0, 5, 15, 4))).toBe("2020-01-05");
    expect(isTimeUnit(" Hours ")).toBe(true);
    expect(isTimeUnit("kilosecond")).toBe(false);
    expect(isTimeUnit("%")).toBe(false);
    expect(isTimeUnit("kg")).toBe(false);
    expect(isTimeUnit("")).toBe(false);
  });

  it("lets the last From line win and does not strip a From already inside a body", () => {
    expect(parseContextWindow("From: first\nFrom: second\nKeep\nUntil: end")).toEqual({
      from: "second",
      until: "end",
      body: "Keep",
    });
    expect(formatContextWindow("From: already", "2020", "2021")).toBe(
      "From: 2020\nUntil: 2021\nFrom: already",
    );
  });

  it("reads a bracket date, and otherwise keeps the first ten characters of when", () => {
    expect(parseDatedLevel("[2020-01-02]  hello", "ignored")).toEqual({
      when: "2020-01-02",
      value: "hello",
    });
    expect(parseDatedLevel("hello", "soonest!!!extra")).toEqual({
      when: "soonest!!!",
      value: "hello",
    });
    expect(parseDatedLevel({ "@value": 3 }, 20200102)).toEqual({ when: "20200102", value: "3" });
  });

  it("does not count endpoints as content, and an empty camel string blocks that field only", () => {
    const scale = emptyScale(new Date(2020, 0, 5));
    scale.endpoints = "0..1";
    expect(scaleHasContent(scale)).toBe(false);
    scale.tag = "speed";
    expect(scaleHasContent(scale)).toBe(true);
    expect(scaleFromExtras({ "a:tag": "", tag: "hidden", "a:unit": 0 }).tag).toBe("");
    expect(scaleFromExtras({ "a:tag": "", tag: "hidden", "a:unit": 0 }).unit).toBe("0");
  });

  it("writes the window as paramSlot and the endpoint in the singular", () => {
    const scale = emptyScale(new Date(2020, 0, 5));
    scale.endpoints = " 0..1 ";
    scale.from = "2020";
    scale.context = "body";
    scale.status = { when: "2020-01-02", value: "  4 " };
    scale.goal = { when: "2020-01-02", value: "   " };
    const extras = extrasFromScale(scale);
    expect(extras["a:endpoint"]).toBe("0..1");
    expect(extras["a:paramSlot"]).toBe("From: 2020\nbody");
    expect(extras["a:status"]).toBe("4");
    expect(extras["a:statusWhen"]).toBe("2020-01-02");
    expect(extras["a:goal"]).toBeUndefined();
  });
});
