// The reader's cost grows in step with the text, whatever the agent writes. Each input is large; a reader whose cost grows with the
// square of it would need far more than the limit of 2 s.
import { afterAll, describe, expect, test } from "vitest";
import { TIME_LINE_HEAD, extractTimeLines, timeLine } from "./index";

const times: string[] = [];
afterAll(() => console.log(`TIME-LINE linear guard measured ms: ${times.join(" ")}`));

describe("linear time guard", () => {
  test("200 000 characters of the head repeated with no close", () => {
    const text = (TIME_LINE_HEAD + " ").repeat(Math.ceil(200_000 / (TIME_LINE_HEAD.length + 1))).slice(0, 200_000);
    expect(text.length).toBe(200_000);
    const t0 = performance.now();
    const r = extractTimeLines(text);
    const ms = performance.now() - t0;
    times.push(`openHeads=${ms.toFixed(1)}`);
    expect(r.values).toEqual([]);
    expect(r.text).toBe(text);
    expect(ms).toBeLessThan(2000);
  });
  test("10 000 valid lines", () => {
    const text = Array.from({ length: 10_000 }, () => timeLine("5 min")).join("\n");
    const t0 = performance.now();
    const r = extractTimeLines(text);
    const ms = performance.now() - t0;
    times.push(`validLines=${ms.toFixed(1)}`);
    expect(r.values.length).toBe(10_000);
    expect(r.hidden).toBe(10_000);
    expect(r.text).toBe("");
    expect(ms).toBeLessThan(2000);
  });
});
