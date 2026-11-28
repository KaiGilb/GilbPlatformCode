// QA (Agent.Tester) for the Time line reader, spec A. Pure functions: REAL (ran on the built code).
import { describe, expect, it } from "vitest";
import { extractTimeLines, parseTimeLine } from "./timeLine";
import { snapToValue, type TimeValue } from "./timeValues";

const T = (v: string): string => `[Time until I need you: ${v}]`;
const FENCE = "```";

describe("qatime A: the reader takes these lines (value read)", () => {
  const cases: [string, string, string][] = [
    ["exact 1 min", T("1 min"), "1 min"],
    ["exact 5 hours +", T("5 hours +"), "5 hours +"],
    ["lower-case head and value", "[time until i need you: 30 min]", "30 min"],
    ["upper-case", "[TIME UNTIL I NEED YOU: 1 HOUR]", "1 hour"],
    ["no space after colon", "[Time until I need you:30min]", "30 min"],
    ["many spaces", "[Time until I need you:    30     min   ]", "30 min"],
    ["tab inside", "[Time until I need you:\t30\tmin]", "30 min"],
    ["5 hours+", T("5 hours+"), "5 hours +"],
    ["5hours+", T("5hours+"), "5 hours +"],
    ["5h+", T("5h+"), "5 hours +"],
    ["hr", T("1 hr"), "1 hour"],
    ["hrs", T("3 hrs"), "3 hours"],
    ["minutes", T("30 minutes"), "30 min"],
    ["mins", T("10 mins"), "10 min"],
    ["m", T("5m"), "5 min"],
    ["decimal comma", T("1,5 hours"), "1 hour"],
    ["decimal point", T("1.5 hours"), "1 hour"],
    ["about", T("about 45 minutes"), "1 hour"],
    ["tilde", T("~ 10 min"), "10 min"],
    ["0.5 min", T("0.5 min"), "1 min"],
    ["2 hours is a tie, longer wins", T("2 hours"), "3 hours"],
    ["20 min is a tie, longer wins", T("20 min"), "30 min"],
    ["7.5 min is a tie, longer wins", T("7.5 min"), "10 min"],
    ["3 min is a tie, longer wins", T("3 min"), "5 min"],
    ["7 min nearer 5", T("7 min"), "5 min"],
    ["8 min nearer 10", T("8 min"), "10 min"],
    ["100 hours", T("100 hours"), "5 hours +"],
    ["leading/trailing spaces on the line", `   ${T("5 min")}  \t`, "5 min"],
  ];
  it.each(cases)("%s", (_n, line, want) => {
    expect(parseTimeLine(line)).toEqual({ value: want });
    const r = extractTimeLines(`a\n${line}\nb`);
    expect(r.text).toBe("a\nb");
    expect(r.values).toEqual([want]);
    expect(r.hidden).toBe(1);
  });
});

describe("qatime A: Time line whose value cannot be read is hidden, no value", () => {
  // F2 (T5): the fourth column is the value now read ([] = still no value). Hand-checked: 1h30 is 5.4e6 ms, at 1.75/7, nearest 1 hour;
  // 90 seconds is 90 000 ms, at 5.875/7, nearest 1 min.
  // F3 (U2): the fifth column is how many Time lines are taken (1 unless the line holds two brackets).
  const cases: [string, string, TimeValue[]?, number?][] = [
    ["5+ hours", T("5+ hours"), ["5 hours +"]],
    ["5 hours or more", T("5 hours or more"), ["5 hours +"]],
    ["1h30", T("1h30"), ["1 hour"]],
    ["90 seconds", T("90 seconds"), ["1 min"]],
    ["1e3 min", T("1e3 min")],
    ["full-width digits", T("１０ min"), ["10 min"]],
    ["negative", T("-5 min")],
    ["400-digit number overflows to Infinity", T("9".repeat(400) + " min")],
    // F2b: moved here from the readable cases. A value text over 64 characters is unreadable at once (it was read as "5 hours +").
    ["huge digits (300 digits, over the 64-character limit)", T("9".repeat(300) + " min")],
    ["zero", T("0 min")],
    ["empty value", "[Time until I need you:]"],
    ["word", T("soon")],
    ["two lines on one line", `${T("5 min")} ${T("10 min")}`, ["5 min", "10 min"], 2],
    ["10 000 character value", T("x".repeat(10_000))],
    ["10 000 spaces value", T("1" + " ".repeat(10_000) + "?")],
  ];
  it.each(cases)("%s", (_n, line, want = [], hiddenWant = 1) => {
    const r = extractTimeLines(`a\n${line}\nb`);
    expect(r.text).toBe("a\nb");
    expect(r.values).toEqual(want);
    expect(r.hidden).toBe(hiddenWant);
  });
});

describe("qatime A: a long value is fast", () => {
  it("10 000 digits then no unit, under 200 ms", () => {
    const t0 = performance.now();
    extractTimeLines(T("1".repeat(10_000)));
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("qatime A: layout and line breaks", () => {
  it("only the line", () => {
    expect(extractTimeLines(T("5 min"))).toEqual({ text: "", values: ["5 min"], hidden: 1 });
  });
  it("only the line with a final break", () => {
    expect(extractTimeLines(T("5 min") + "\n").text).toBe("");
  });
  it("first line", () => expect(extractTimeLines(`${T("5 min")}\nbody`).text).toBe("body"));
  it("last line, no final break: the break before it goes", () => expect(extractTimeLines(`body\n${T("5 min")}`).text).toBe("body"));
  it("last line with final break", () => expect(extractTimeLines(`body\n${T("5 min")}\n`).text).toBe("body\n"));
  it("twice in a row", () => {
    const r = extractTimeLines(`a\n${T("30 min")}\n${T("10 min")}\nb`);
    expect(r).toEqual({ text: "a\nb", values: ["30 min", "10 min"], hidden: 2 });
  });
  it("Windows line breaks", () => {
    expect(extractTimeLines(`a\r\n${T("30 min")}\r\nb\r\n`).text).toBe("a\r\nb\r\n");
    expect(extractTimeLines(`a\r\n${T("30 min")}`).text).toBe("a");
  });
  it("blank lines around it are kept, only one break goes", () => {
    expect(extractTimeLines(`a\n\n${T("30 min")}\n\nb`).text).toBe("a\n\n\nb");
  });
  it("no line: the same string", () => {
    const s = "plain\n\n  text \r\n[Time until] nope";
    expect(extractTimeLines(s)).toEqual({ text: s, values: [], hidden: 0 });
  });
  it("non-string gives empty text and does not throw", () => {
    expect(extractTimeLines(undefined as unknown as string)).toEqual({ text: "", values: [], hidden: 0 });
    expect(extractTimeLines(null as unknown as string).hidden).toBe(0);
  });
  it("5 000 lines with a line every 10th: correct and fast", () => {
    const src: string[] = [];
    for (let i = 0; i < 5000; i++) src.push(i % 10 === 0 ? T("5 min") : `line ${i}`);
    const text = src.join("\n");
    const t0 = performance.now();
    const r = extractTimeLines(text);
    const ms = performance.now() - t0;
    expect(r.hidden).toBe(500);
    expect(r.values).toHaveLength(500);
    expect(r.text).toBe(src.filter((_, i) => i % 10 !== 0).join("\n"));
    expect(ms).toBeLessThan(500);
    console.log("QATIME 5000 lines ms", ms.toFixed(1));
  });
  it("5 000 Time lines in a row, fast", () => {
    const text = Array.from({ length: 5000 }, () => T("5 min")).join("\n");
    const t0 = performance.now();
    const r = extractTimeLines(text);
    expect(r.hidden).toBe(5000);
    expect(r.text).toBe("");
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("qatime A: fences keep a quoted line, and only a quoted line", () => {
  it("fence quotes", () => {
    const s = `x\n${FENCE}\n${T("5 min")}\n${FENCE}\ny`;
    expect(extractTimeLines(s)).toEqual({ text: s, values: [], hidden: 0 });
  });
  it("~~~ fence quotes", () => {
    const s = `x\n~~~\n${T("5 min")}\n~~~\ny`;
    expect(extractTimeLines(s).hidden).toBe(0);
  });
  it("fence with a language tag quotes, a later line is read", () => {
    const s = `${FENCE}text\n${T("5 min")}\n${FENCE}\n${T("10 min")}`;
    const r = extractTimeLines(s);
    expect(r.values).toEqual(["10 min"]);
    expect(r.text).toBe(`${FENCE}text\n${T("5 min")}\n${FENCE}`);
  });
  it("indented fence (up to 3 spaces) quotes", () => {
    const s = `  ${FENCE}\n${T("5 min")}\n  ${FENCE}`;
    expect(extractTimeLines(s).hidden).toBe(0);
  });
  it("unclosed fence quotes to the end", () => {
    const s = `${FENCE}\n${T("5 min")}\nmore`;
    expect(extractTimeLines(s)).toEqual({ text: s, values: [], hidden: 0 });
  });
  it("a Time line after a closed fence is read", () => {
    const s = `${FENCE}\ncode\n${FENCE}\n${T("5 min")}`;
    expect(extractTimeLines(s).values).toEqual(["5 min"]);
  });
  it("DEFECT-A1: a ~~~ line inside a fenced block is code, so the Time line below it is still a quote", () => {
    const s = `${FENCE}\n~~~\n${T("5 min")}\n${FENCE}`;
    expect(extractTimeLines(s)).toEqual({ text: s, values: [], hidden: 0 });
  });
  it("DEFECT-A1b: a fence line inside a ~~~ block is code, so the Time line below it is still a quote", () => {
    const s = `~~~\n${FENCE}\n${T("5 min")}\n~~~`;
    expect(extractTimeLines(s)).toEqual({ text: s, values: [], hidden: 0 });
  });
  it("DEFECT-A1c: fence, ~~~ (code), fence closes the block, so a later Time line is outside it and must be hidden", () => {
    const s = `${FENCE}\n~~~\n${FENCE}\n${T("5 min")}\nafter`;
    expect(extractTimeLines(s).hidden).toBe(1);
  });
  it("DEFECT-A1d: a four-backtick fence holding a three-backtick line: the Time line inside is a quote", () => {
    const s = `${FENCE}\`\n${FENCE}\n${T("5 min")}\n${FENCE}\n${FENCE}\``;
    expect(extractTimeLines(s)).toEqual({ text: s, values: [], hidden: 0 });
  });
});

describe("qatime A: characterisation, lines the reader leaves in the bubble (judged in the report)", () => {
  // F2 (T4): the third column is how many Time lines are now taken from the line. Decorated lines and brackets inside a sentence go;
  // a bracket in inline code (a quote) and a bracket with no closing "]" stay.
  const stay: [string, string, number][] = [
    ["list item", `- ${T("30 min")}`, 1],
    ["numbered item", `1. ${T("30 min")}`, 1],
    ["blockquote", `> ${T("30 min")}`, 1],
    ["inline code", `\`${T("30 min")}\``, 0],
    ["bold", `**${T("30 min")}**`, 1],
    ["trailing text", `${T("30 min")} thanks`, 1],
    ["leading text", `Estimate: ${T("30 min")}`, 1],
    ["no closing bracket", "[Time until I need you: 30 min", 0],
    ["non-breaking space in front", ` ${T("30 min")}`, 1],
    ["heading", `# ${T("30 min")}`, 1],
  ];
  it.each(stay)("%s: hidden count after F2", (n, line, want) => {
    const r = extractTimeLines(`a\n${line}\nb`);
    console.log("QATIME STAYS:", n, "hidden=", r.hidden, JSON.stringify(r.text));
    expect(r.hidden).toBe(want);
  });
});

describe("qatime A: streaming option, partial last line", () => {
  it("a partial head on the last line is hidden while streaming only", () => {
    expect(extractTimeLines("a\n[Time until", { streaming: true }).text).toBe("a");
    expect(extractTimeLines("a\n[Time until").text).toBe("a\n[Time until");
  });
  it("a normal bracket line is not eaten while streaming", () => {
    expect(extractTimeLines("a\n[x]", { streaming: true }).hidden).toBe(0);
  });
});

describe("qatime A: snapToValue", () => {
  it("gives the marks for their own times, and handles junk", () => {
    expect(snapToValue(60_000)).toBe("1 min");
    expect(snapToValue(18_000_000)).toBe("5 hours +");
    expect(snapToValue(Infinity)).toBe("5 hours +");
    expect(snapToValue(NaN)).toBe("1 min");
    expect(snapToValue(-1)).toBe("1 min");
    expect(snapToValue(0)).toBe("1 min");
    expect(snapToValue(-Infinity)).toBe("1 min");
  });
});
