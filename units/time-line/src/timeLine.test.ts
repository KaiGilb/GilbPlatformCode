// The Time line (B5): the exact line, the lenient reading, and taking the line out of a text.
// Home of the contract: the rule Kai-Zen.AskRules.TimeLeft.
import { loadavg } from "node:os";
import { afterAll, describe, expect, test } from "vitest";
import { TIME_LINE_HEAD, extractTimeLines, parseTimeLine, timeLine } from "./timeLine";
import { TIME_VALUES, TIME_VALUE_MS } from "./timeValues";

const T = (v: string): string => `[Time until I need you: ${v}]`;

describe("timeLine", () => {
  describe("timeLine and parseTimeLine", () => {
    test("writes the exact line for each of the seven values and reads it back", () => {
      // Spec: Wait.Known — the line the agent writes (meter: unit test)
      expect(TIME_VALUES).toEqual(["1 min", "5 min", "10 min", "30 min", "1 hour", "3 hours", "5 hours +"]);
      expect(TIME_LINE_HEAD).toBe("[Time until I need you:");
      for (const v of TIME_VALUES) {
        expect(timeLine(v)).toBe(`[Time until I need you: ${v}]`);
        expect(parseTimeLine(timeLine(v))).toEqual({ value: v });
      }
      expect(TIME_VALUE_MS).toEqual({ "1 min": 60_000, "5 min": 300_000, "10 min": 600_000, "30 min": 1_800_000, "1 hour": 3_600_000, "3 hours": 10_800_000, "5 hours +": 18_000_000 });
    });

    test("reads letter case loosely: '[time until i need you: 30 MIN]' is 30 min", () => {
      expect(parseTimeLine("[time until i need you: 30 MIN]")).toEqual({ value: "30 min" });
    });
    test("reads a missing space after the colon and a '+' stuck to the unit: '5 hours+' is 5 hours +", () => {
      expect(parseTimeLine("[Time until I need you:5 hours+]")).toEqual({ value: "5 hours +" });
    });
    test("reads '5hours +' as 5 hours +", () => {
      expect(parseTimeLine(T("5hours +"))).toEqual({ value: "5 hours +" });
    });
    test("reads '1 hr' as 1 hour, and two spaces inside as one", () => {
      expect(parseTimeLine(T("1 hr"))).toEqual({ value: "1 hour" });
      expect(parseTimeLine(T("1  hour"))).toEqual({ value: "1 hour" });
    });
    test("snaps 2 hours to 3 hours: it sits at 1.5/7, exactly between 3 hours (1/7) and 1 hour (2/7), and a tie takes the longer", () => {
      expect(parseTimeLine(T("2 hours"))).toEqual({ value: "3 hours" });
    });
    test("snaps 20 min to 30 min: it sits at 3.5/7, exactly between 30 min (3/7) and 10 min (4/7), so the longer", () => {
      expect(parseTimeLine(T("20 min"))).toEqual({ value: "30 min" });
    });
    test("snaps 90 min to 1 hour: 5.4e6 ms is at 1.75/7, nearer 1 hour (2/7) than 3 hours (1/7)", () => {
      expect(parseTimeLine(T("90 min"))).toEqual({ value: "1 hour" });
    });
    test("reads 'about 45 minutes' as 1 hour: 2.7e6 ms is at 2.5/7, a tie between 1 hour and 30 min, so the longer", () => {
      expect(parseTimeLine(T("about 45 minutes"))).toEqual({ value: "1 hour" });
      expect(parseTimeLine(T("~45 min"))).toEqual({ value: "1 hour" });
    });
    test("reads '1,5 hours' and '1.5 hours' as 1 hour (5.4e6 ms, as 90 min)", () => {
      expect(parseTimeLine(T("1,5 hours"))).toEqual({ value: "1 hour" });
      expect(parseTimeLine(T("1.5 hours"))).toEqual({ value: "1 hour" });
    });
    test("reads 5 hours or more as 5 hours +", () => {
      expect(parseTimeLine(T("7 hours"))).toEqual({ value: "5 hours +" });
      expect(parseTimeLine(T("5 hours"))).toEqual({ value: "5 hours +" });
      expect(parseTimeLine(T("300 min"))).toEqual({ value: "5 hours +" });
    });
    test("ignores spaces and a tab around the line", () => {
      expect(parseTimeLine(`  \t[Time until I need you: 5 min]\t  `)).toEqual({ value: "5 min" });
    });
    test("reads the unit words min, mins, minute, minutes, m, h, hrs", () => {
      expect(parseTimeLine(T("10 mins"))).toEqual({ value: "10 min" });
      expect(parseTimeLine(T("10 minute"))).toEqual({ value: "10 min" });
      expect(parseTimeLine(T("10m"))).toEqual({ value: "10 min" });
      expect(parseTimeLine(T("1h"))).toEqual({ value: "1 hour" });
      expect(parseTimeLine(T("3 hrs"))).toEqual({ value: "3 hours" });
    });

    test("is 'unreadable' for a Time line whose value cannot be read", () => {
      for (const v of ["soon", "", " ", "-5 min", "0 min", "NaN min", "5", "min", "5 parsecs"]) {
        expect(parseTimeLine(T(v))).toBe("unreadable");
      }
      expect(parseTimeLine("[Time until I need you:]")).toBe("unreadable");
      expect(parseTimeLine(T("9".repeat(400) + " min"))).toBe("unreadable");
    });

    test("is null for a line that is not a Time line", () => {
      expect(parseTimeLine("Time until I need you: 5 min")).toBeNull();
      expect(parseTimeLine("[Time until I need you: 5 min")).toBeNull();
      expect(parseTimeLine('[Focus: Other idea "Usability"]')).toBeNull();
      expect(parseTimeLine("")).toBeNull();
      expect(parseTimeLine("ok [Time until I need you: 5 min]")).toBeNull();
      expect(parseTimeLine("[Time until I need you: 5 min]\nmore")).toBeNull();
      expect(parseTimeLine(undefined as unknown as string)).toBeNull(); // cast: junk input must not throw
    });
  });

  describe("extractTimeLines", () => {
    const first = T("5 min");
    test("removes a line at the start with its line break", () => {
      expect(extractTimeLines(`${first}\nHello\nworld`)).toEqual({ text: "Hello\nworld", values: ["5 min"], hidden: 1 });
    });
    test("removes a line in the middle with the break after it", () => {
      expect(extractTimeLines(`Hello\n${T("10 min")}\nworld`)).toEqual({ text: "Hello\nworld", values: ["10 min"], hidden: 1 });
    });
    test("removes the last line with the break before it", () => {
      expect(extractTimeLines(`Hello\nworld\n${T("30 min")}`)).toEqual({ text: "Hello\nworld", values: ["30 min"], hidden: 1 });
    });
    test("removes a last line that is followed by a final line break, and leaves that break", () => {
      expect(extractTimeLines(`Hello\n${T("30 min")}\n`)).toEqual({ text: "Hello\n", values: ["30 min"], hidden: 1 });
    });
    test("keeps \\r\\n exactly for the lines that stay", () => {
      expect(extractTimeLines(`a\r\n${first}\r\nb\r\nc`)).toEqual({ text: "a\r\nb\r\nc", values: ["5 min"], hidden: 1 });
      expect(extractTimeLines(`a\r\nb\r\n${first}`)).toEqual({ text: "a\r\nb", values: ["5 min"], hidden: 1 });
    });
    test("keeps a lone \\r exactly", () => {
      expect(extractTimeLines(`a\r${first}\rb`)).toEqual({ text: "a\rb", values: ["5 min"], hidden: 1 });
    });
    test("reads two lines in order", () => {
      expect(extractTimeLines(`${first}\nx\n${T("1 hour")}`)).toEqual({ text: "x", values: ["5 min", "1 hour"], hidden: 2 });
    });
    test("a text that is only the line becomes empty", () => {
      expect(extractTimeLines(first)).toEqual({ text: "", values: ["5 min"], hidden: 1 });
      expect(extractTimeLines(`${first}\n`)).toEqual({ text: "", values: ["5 min"], hidden: 1 });
    });
    test("an indented line is removed too", () => {
      expect(extractTimeLines(`a\n   ${first}\nb`)).toEqual({ text: "a\nb", values: ["5 min"], hidden: 1 });
    });
    test("does not tidy further: a blank line on each side stays as it was", () => {
      expect(extractTimeLines(`a\n\n${first}\n\nb`)).toEqual({ text: "a\n\n\nb", values: ["5 min"], hidden: 1 });
    });
    test("an unreadable line is removed and counted, with no value", () => {
      expect(extractTimeLines(`a\n${T("soon")}\nb`)).toEqual({ text: "a\nb", values: [], hidden: 1 });
    });
    test("a text with no Time line comes back equal, with hidden 0", () => {
      // Spec: Wait.Known — the app reads the line and hides it; other text is untouched (meter: unit test)
      const text = "Hello\n[Focus: x]\n\nworld\r\n";
      expect(extractTimeLines(text)).toEqual({ text, values: [], hidden: 0 });
      expect(extractTimeLines("")).toEqual({ text: "", values: [], hidden: 0 });
    });
    test("a line inside a ``` fence stays and is not read", () => {
      const text = `\`\`\`\n${first}\n\`\`\`\nafter`;
      expect(extractTimeLines(text)).toEqual({ text, values: [], hidden: 0 });
    });
    test("a line inside a ~~~ fence stays and is not read", () => {
      const text = `~~~\n${first}\n~~~\nafter`;
      expect(extractTimeLines(text)).toEqual({ text, values: [], hidden: 0 });
    });
    test("an unclosed fence runs to the end of the text", () => {
      const text = `intro\n\`\`\`\n${first}\nmore`;
      expect(extractTimeLines(text)).toEqual({ text, values: [], hidden: 0 });
    });
    test("a line after a closed fence is removed", () => {
      expect(extractTimeLines(`\`\`\`\ncode\n\`\`\`\n${first}\nend`)).toEqual({ text: "```\ncode\n```\nend", values: ["5 min"], hidden: 1 });
    });
    test("a non-string gives an empty text", () => {
      expect(extractTimeLines(undefined as unknown as string)).toEqual({ text: "", values: [], hidden: 0 });
      expect(extractTimeLines(5 as unknown as string, { streaming: true })).toEqual({ text: "", values: [], hidden: 0 });
    });
  });

  describe("extractTimeLines while streaming", () => {
    const full = timeLine("30 min");
    test("hides the line at every length from 2 characters on, and reads it when it is whole", () => {
      // Spec: Wait.Known — the raw line never flashes in the bubble while it streams (meter: unit test)
      for (let len = 2; len < full.length; len++) {
        const out = extractTimeLines(`Working on it.\n${full.slice(0, len)}`, { streaming: true });
        expect(out).toEqual({ text: "Working on it.", values: [], hidden: 1 });
        expect(out.text).not.toContain("[T");
      }
      expect(extractTimeLines(`Working on it.\n${full}`, { streaming: true })).toEqual({ text: "Working on it.", values: ["30 min"], hidden: 1 });
    });
    test("hides a partial line that is the whole text, at 2 characters and more", () => {
      expect(extractTimeLines("[T", { streaming: true })).toEqual({ text: "", values: [], hidden: 1 });
      expect(extractTimeLines("[Time until", { streaming: true })).toEqual({ text: "", values: [], hidden: 1 });
    });
    test("hides a line that starts with the head and has no closing bracket yet, whatever follows", () => {
      expect(extractTimeLines("x\n[Time until I need you: about", { streaming: true }).text).toBe("x");
      expect(extractTimeLines("x\n  [time until i need you:", { streaming: true }).text).toBe("x");
    });
    test("does not hide other last lines", () => {
      for (const last of ["[1] see note", "[", "[ ]", "[Focus: x", "[Tx", "hello [T"]) {
        const text = `x\n${last}`;
        expect(extractTimeLines(text, { streaming: true })).toEqual({ text, values: [], hidden: 0 });
      }
    });
    test("does not hide a partial last line inside a fence, or when the text ends with a line break", () => {
      const fenced = "```\n[Time until";
      expect(extractTimeLines(fenced, { streaming: true })).toEqual({ text: fenced, values: [], hidden: 0 });
      const ended = "a\n[Time until\n";
      expect(extractTimeLines(ended, { streaming: true })).toEqual({ text: ended, values: [], hidden: 0 });
    });
    test("a partial last line stays when not streaming", () => {
      const text = "x\n[Time until";
      expect(extractTimeLines(text)).toEqual({ text, values: [], hidden: 0 });
      expect(extractTimeLines(text, { streaming: false })).toEqual({ text, values: [], hidden: 0 });
    });
  });

  describe("fences as CommonMark has them (F2, T2)", () => {
    const F = "```";
    test("a ~~~ line inside a ``` block does not close it, and the other way round", () => {
      // Spec: Wait.Known — a quoted line is never taken (meter: unit test)
      const a = `${F}\n~~~\n${T("5 min")}\n${F}`;
      expect(extractTimeLines(a)).toEqual({ text: a, values: [], hidden: 0 });
      const b = `~~~\n${F}\n${T("5 min")}\n~~~`;
      expect(extractTimeLines(b)).toEqual({ text: b, values: [], hidden: 0 });
    });
    test("a closing fence needs the same character, at least as many, and nothing after it", () => {
      const four = `${F}\`\n${F}\n${T("5 min")}\n${F}\n${F}\``;
      expect(extractTimeLines(four)).toEqual({ text: four, values: [], hidden: 0 });
      const withInfo = `${F}\n${F}js\n${T("5 min")}\n${F}`;
      expect(extractTimeLines(withInfo)).toEqual({ text: withInfo, values: [], hidden: 0 });
    });
    test("a line after the real closing fence is outside it", () => {
      expect(extractTimeLines(`${F}\n~~~\n${F}\n${T("5 min")}\nafter`)).toEqual({ text: `${F}\n~~~\n${F}\nafter`, values: ["5 min"], hidden: 1 });
      expect(extractTimeLines(`${F}\n${F}  \n${T("5 min")}`)).toEqual({ text: `${F}\n${F}  `, values: ["5 min"], hidden: 1 });
    });
    test("a line indented four spaces or more is not a fence; three is", () => {
      expect(extractTimeLines(`    ${F}\n${T("5 min")}`)).toEqual({ text: `    ${F}`, values: ["5 min"], hidden: 1 });
      const s = `   ${F}\n${T("5 min")}`;
      expect(extractTimeLines(s)).toEqual({ text: s, values: [], hidden: 0 });
    });
    test("a backtick line with a backtick after it is not a fence", () => {
      expect(extractTimeLines(`${F}a\`b\n${T("5 min")}`)).toEqual({ text: `${F}a\`b`, values: ["5 min"], hidden: 1 });
    });
  });

  describe("decorated lines and brackets inside a sentence (F2, T4)", () => {
    const L = T("5 min");
    test.each([
      ["a list mark", `- ${L}`],
      ["a star list mark", `* ${L}`],
      ["a quote mark", `> ${L}`],
      ["bold", `**${L}**`],
      ["underscore bold", `__${L}__`],
      ["italics", `*${L}*`],
      ["a heading", `### ${L}`],
      ["a numbered item", `1. ${L}`],
      ["a numbered item with a bracket", `2) ${L}`],
      ["a no-break space in front", `\u00A0${L}`],
      ["a quote mark and a list mark and bold", `> - **${L}**`],
    ])("%s: the whole line goes with its one line break", (_n, line) => {
      expect(extractTimeLines(`a\n${line}\nb`)).toEqual({ text: "a\nb", values: ["5 min"], hidden: 1 });
    });
    test("a bracket in the middle of a sentence is cut with the space before it", () => {
      expect(extractTimeLines("Working on it. [Time until I need you: 5 min] Back soon.")).toEqual({ text: "Working on it. Back soon.", values: ["5 min"], hidden: 1 });
    });
    test("a bracket at the start of a sentence is cut with the space after it", () => {
      expect(extractTimeLines(`${L} ok`)).toEqual({ text: "ok", values: ["5 min"], hidden: 1 });
    });
    test("a bracket at the end of a sentence is cut with the space before it", () => {
      expect(extractTimeLines(`Estimate: ${L}`)).toEqual({ text: "Estimate:", values: ["5 min"], hidden: 1 });
    });
    test("two brackets on one line are both cut and counted", () => {
      expect(extractTimeLines(`A ${T("30 min")} B ${T("10 min")} C`)).toEqual({ text: "A B C", values: ["30 min", "10 min"], hidden: 2 });
    });
    test("an unreadable bracket in a sentence is cut and counted with no value", () => {
      expect(extractTimeLines(`A ${T("soon")} B`)).toEqual({ text: "A B", values: [], hidden: 1 });
    });
    test("a bracket inside an inline code span is a quote: it stays and is not read", () => {
      const s = `Use \`${L}\` to tell the app`;
      expect(extractTimeLines(s)).toEqual({ text: s, values: [], hidden: 0 });
      const double = `Use \`\`a ${L} b\`\` here`;
      expect(extractTimeLines(double)).toEqual({ text: double, values: [], hidden: 0 });
    });
    test("a bracket after a code span is still cut", () => {
      expect(extractTimeLines(`\`code\` ${L}`)).toEqual({ text: "`code`", values: ["5 min"], hidden: 1 });
    });
    test("a bracket inside a fence stays", () => {
      const s = `\`\`\`\nsay ${L} now\n\`\`\``;
      expect(extractTimeLines(s)).toEqual({ text: s, values: [], hidden: 0 });
    });
    test("a bracket with no closing ] stays", () => {
      const s = "Start [Time until I need you: 5 min and go on";
      expect(extractTimeLines(s)).toEqual({ text: s, values: [], hidden: 0 });
    });
    test("a decorated line at the end loses the break before it", () => {
      expect(extractTimeLines(`a\n- ${L}`)).toEqual({ text: "a", values: ["5 min"], hidden: 1 });
    });
  });

  describe("more forms of the value (F2, T5)", () => {
    // Hand-checked by position: 1h30 = 5.4e6 ms at 1.75/7 -> 1 hour; 90 seconds = 90 000 ms at 5.875/7 -> 1 min;
    // 1 h 30 min and 1 hour 30 minutes are the same 5.4e6; 1h 5m = 3.9e6 ms, in 3 h..1 h at 1 + 6.9/7.2 -> u 1.9583 -> 1 hour.
    test.each([
      ["5+ hours", "5 hours +"],
      ["5 hours+", "5 hours +"],
      ["5 hours +", "5 hours +"],
      ["5 hours or more", "5 hours +"],
      ["5 hours or longer", "5 hours +"],
      ["at least 5 hours", "5 hours +"],
      ["more than 5 hours", "5 hours +"],
      ["over 6 hours", "5 hours +"],
      ["up to 30 min", "30 min"],
      ["under 10 min", "10 min"],
      ["less than 5 min", "5 min"],
      ["around 10 min", "10 min"],
      ["approx 10 min", "10 min"],
      ["approx. 10 min", "10 min"],
      ["roughly 10 min", "10 min"],
      ["≈10 min", "10 min"],
      ["~10 min", "10 min"],
      ["about 10 min", "10 min"],
      ["１０ min", "10 min"],
      ["３０ ｍｉｎ", "30 min"],
      ["90 seconds", "1 min"],
      ["90 secs", "1 min"],
      ["90 sec", "1 min"],
      ["90 s", "1 min"],
      ["1 second", "1 min"],
      ["1h30", "1 hour"],
      ["1h 30m", "1 hour"],
      ["1 h 30 min", "1 hour"],
      ["1 hour 30 minutes", "1 hour"],
      ["1h 5m", "1 hour"],
      ["2h", "3 hours"],
      ["3h 10m", "3 hours"],
    ])("%s is read as %s", (value, want) => {
      expect(parseTimeLine(T(value))).toEqual({ value: want });
    });
    test.each(["5", "min", "1e3 min", "9".repeat(400) + " min", "0 min", "-5 min", "0h0m", "soon", "5 parsecs", "5 mx", "1h x", ""])("%j stays unreadable", (value) => {
      expect(parseTimeLine(T(value))).toBe("unreadable");
    });
    test("a value of exactly 64 characters after trimming is read; one of 65 is unreadable and still hidden (F2b, F3 U4)", () => {
      const val = (n: number): string => "~".repeat(n - 5) + "5 min";
      expect(parseTimeLine(`${TIME_LINE_HEAD}${val(64)}]`)).toEqual({ value: "5 min" });
      expect(parseTimeLine(`${TIME_LINE_HEAD}${val(65)}]`)).toBe("unreadable");
      expect(extractTimeLines(`a\n${TIME_LINE_HEAD}${val(65)}]\nb`)).toEqual({ text: "a\nb", values: [], hidden: 1 });
    });
  });

  describe("the cost of reading is bounded whatever the agent writes (F2b)", () => {
    // Each input is 200 000 characters. A reader whose cost grows with the SQUARE of the input would need far more than a minute;
    // one that grows in step with it needs a few milliseconds. The limit is 2 s, so load cannot fail them.
    const HEAD = "[Time until I need you:";
    const N = 200_000;
    const timed = <R,>(f: () => R): { result: R; ms: number } => {
      const t0 = performance.now();
      const result = f();
      return { result, ms: performance.now() - t0 };
    };
    const times: string[] = [];
    afterAll(() => console.log(`QATIME F2b measured ms: ${times.join(" ")}`));

    test("a: head + 1 + 200 000 spaces + ?]", () => {
      const { result, ms } = timed(() => parseTimeLine(`${HEAD}1${" ".repeat(N)}?]`));
      times.push(`a=${ms.toFixed(1)}`);
      expect(result).toBe("unreadable");
      expect(ms).toBeLessThan(2000);
    });
    test("b: head + 200 000 x + ]", () => {
      const { result, ms } = timed(() => parseTimeLine(`${HEAD}${"x".repeat(N)}]`));
      times.push(`b=${ms.toFixed(1)}`);
      expect(result).toBe("unreadable");
      expect(ms).toBeLessThan(2000);
    });
    test("c: a long run of spaces, then a bracket in the middle of the line: the bracket is cut and the rest kept byte for byte", () => {
      const line = `a${" ".repeat(N)}b ${HEAD} 5 min] c`;
      const { result, ms } = timed(() => extractTimeLines(line));
      times.push(`c=${ms.toFixed(1)}`);
      expect(result).toEqual({ text: `a${" ".repeat(N)}b c`, values: ["5 min"], hidden: 1 });
      expect(ms).toBeLessThan(2000);
    });
    test("d: 200 000 spaces, a bracket, 200 000 spaces and x on one line", () => {
      const line = `${" ".repeat(N)}${HEAD} 5 min]${" ".repeat(N)}x`;
      const { result, ms } = timed(() => extractTimeLines(line));
      times.push(`d=${ms.toFixed(1)}`);
      // The bracket has a space before it, which goes with it.
      expect(result).toEqual({ text: `${" ".repeat(N - 1)}${" ".repeat(N)}x`, values: ["5 min"], hidden: 1 });
      expect(ms).toBeLessThan(2000);
    });
    test("e: 20 000 lines, each a list item holding the line", () => {
      const text = Array.from({ length: 20_000 }, () => `- ${HEAD} 5 min]`).join("\n");
      const { result, ms } = timed(() => extractTimeLines(text));
      times.push(`e=${ms.toFixed(1)}`);
      expect(result.text).toBe("");
      expect(result.values).toHaveLength(20_000);
      expect(result.hidden).toBe(20_000);
      expect(ms).toBeLessThan(2000);
    });
    test("f: head + 200 000 spaces + ] as the only line", () => {
      const { result, ms } = timed(() => extractTimeLines(`${HEAD}${" ".repeat(N)}]`));
      times.push(`f=${ms.toFixed(1)}`);
      expect(result).toEqual({ text: "", values: [], hidden: 1 });
      expect(ms).toBeLessThan(2000);
    });
    test("a whole-line Time line of 400 characters with a decoration is removed as a whole line; at 401 characters only its bracket is cut", () => {
      const pad = (n: number): string => " ".repeat(n);
      // "- " + head + value + "]" with spaces inside the value to reach the length.
      const make = (len: number): string => {
        const base = `- ${HEAD} 5 min`;
        return `${base}${pad(len - base.length - 1)}]`;
      };
      const l400 = make(400);
      expect(l400).toHaveLength(400);
      // The spaces inside the value, before the "]", are trimmed (F3, U4), so the value is "5 min" and is read.
      expect(extractTimeLines(`a\n${l400}\nb`)).toEqual({ text: "a\nb", values: ["5 min"], hidden: 1 });
      const l401 = make(401);
      expect(l401).toHaveLength(401);
      // 401 characters: not tried as a whole line; the bracket is cut and read; what is left is only "-" and spaces, which is decoration, so the line goes whole (F3, U3).
      expect(extractTimeLines(`a\n${l401}\nb`)).toEqual({ text: "a\nb", values: ["5 min"], hidden: 1 });
    });
  });
});

describe("F3: fences inside containers, whole lines of several brackets, left-over decoration, the value bound, more forms", () => {
  const HEAD = "[Time until I need you:";
  const IN = T("1 min");
  const AFTER = T("10 min");

  describe("U1: a fenced block in a quote or a list item keeps its quoted line", () => {
    const check = (doc: string[], keep: number): void => {
      // `keep` is how many lines stay; the last line of each doc is the Time line after the block, which goes.
      expect(extractTimeLines(doc.join("\n"))).toEqual({ text: doc.slice(0, keep).join("\n"), values: ["10 min"], hidden: 1 });
    };
    for (const f of ["```", "~~~"]) {
      test(`${f} block inside "> "`, () => check([`> ${f}`, `> ${IN}`, `> ${f}`, AFTER], 3));
      test(`${f} block inside "> > "`, () => check([`> > ${f}`, `> > ${IN}`, `> > ${f}`, AFTER], 3));
      test(`${f} block inside "- ", continuation indented 2`, () => check([`- item`, `  ${f}`, `  ${IN}`, `  ${f}`, AFTER], 4));
      test(`${f} block inside "- ", continuation indented 4`, () => check([`- item`, `    ${f}`, `    ${IN}`, `    ${f}`, AFTER], 4));
      test(`${f} block opened ON the list-marker line`, () => check([`- ${f}`, `  ${IN}`, `  ${f}`, AFTER], 3));
      test(`${f} block inside "1. " with indent 3`, () => check([`1. item`, `   ${f}`, `   ${IN}`, `   ${f}`, AFTER], 4));
      test(`${f} block inside "- " with the opener in a nested item`, () => check([`- a`, `  - b`, `    ${f}`, `    ${IN}`, `    ${f}`, AFTER], 5));
    }
    test("a Time line after the item has ended is outside the block and goes", () => {
      // After "- item" a line with no indent ends the item, so its indented fence rule no longer applies: 4 spaces is code, not a fence.
      expect(extractTimeLines(["- item", "text", `    \`\`\``, IN].join("\n"))).toEqual({ text: ["- item", "text", "    ```"].join("\n"), values: ["1 min"], hidden: 1 });
    });
    test("an opener with '>' and a closer with none: the block closes there, and the line after goes", () => {
      expect(extractTimeLines(["> ```", IN, "```", AFTER].join("\n"))).toEqual({ text: ["> ```", IN, "```"].join("\n"), values: ["10 min"], hidden: 1 });
    });
    test("an opener with none and a closer with '>': the block closes there too", () => {
      expect(extractTimeLines(["```", `> ${IN}`, "> ```", AFTER].join("\n"))).toEqual({ text: ["```", `> ${IN}`, "> ```"].join("\n"), values: ["10 min"], hidden: 1 });
    });
    test("an unclosed block in a quote runs to the end", () => {
      const doc = ["> ```", `> ${IN}`, AFTER].join("\n");
      expect(extractTimeLines(doc)).toEqual({ text: doc, values: [], hidden: 0 });
    });
    test("the closer must be the same character and as long: a shorter or another one does not close", () => {
      const doc = ["> ````", `> ${IN}`, "> ```", `> ${AFTER}`, "> ~~~~"].join("\n");
      expect(extractTimeLines(doc)).toEqual({ text: doc, values: [], hidden: 0 });
    });
    test("200 000 '>' and 100 000 '- ' on one line cost time in step with their size", () => {
      const load = loadavg().map((x) => x.toFixed(1)).join(" ");
      const t0 = performance.now();
      const a = extractTimeLines(`${">".repeat(200_000)}${IN}`);
      const msA = performance.now() - t0;
      const t1 = performance.now();
      const b = extractTimeLines(`${"- ".repeat(100_000)}${IN}`);
      const msB = performance.now() - t1;
      console.log(`QATIME F3 long container lines: ">"x200000 ${msA.toFixed(1)} ms, "- "x100000 ${msB.toFixed(1)} ms, load ${load}`);
      expect(a.hidden).toBe(1);
      expect(a.values).toEqual(["1 min"]);
      expect(b.hidden).toBe(1);
      expect(b.values).toEqual(["1 min"]);
      expect(msA).toBeLessThan(2000);
      expect(msB).toBeLessThan(2000);
    });
  });

  describe("U2: two or more brackets that make up the whole line are each read", () => {
    test.each([
      ["two brackets", `${T("1 min")} ${T("10 min")}`, ["1 min", "10 min"]],
      ["three brackets", `${T("1 min")} ${T("5 min")} ${T("30 min")}`, ["1 min", "5 min", "30 min"]],
      ["a list item with two", `- ${T("1 min")} ${T("10 min")}`, ["1 min", "10 min"]],
      ["bold with two", `**${T("1 min")}** **${T("10 min")}**`, ["1 min", "10 min"]],
      ["a quote with three", `> ${T("1 min")} ${T("5 min")} ${T("30 min")}`, ["1 min", "5 min", "30 min"]],
      ["one readable and one not", `${T("1 min")} ${T("soon")}`, ["1 min"]],
    ])("%s: the line goes whole, every value is read, hidden counts each bracket", (_n, line, values) => {
      expect(extractTimeLines(`a\n${line}\nb`)).toEqual({ text: "a\nb", values, hidden: line.split(HEAD).length - 1 });
    });
  });

  describe("U3: what is left after the brackets are cut is decoration: the line goes", () => {
    test.each([
      ["- [T] [T]", `- ${T("1 min")} ${T("10 min")}`],
      ["**[T]** **[T]**", `**${T("1 min")}** **${T("10 min")}**`],
      ["| [T] |", `| ${T("1 min")} |`],
      ["a bracket in a table of bars", `| ${T("1 min")} | ${T("10 min")} |`],
      ["1. [T] [T]", `1. ${T("1 min")} ${T("10 min")}`],
    ])("%s", (_n, line) => {
      const r = extractTimeLines(`a\n${line}\nb`);
      expect(r.text).toBe("a\nb");
      expect(r.hidden).toBe(line.split(HEAD).length - 1);
    });
    test("real words left stay: '- **[T]** now' leaves '- **** now' (empty bold marks: it looks a little broken, but it is what was around the bracket)", () => {
      expect(extractTimeLines(`- **${IN}** now`)).toEqual({ text: "- **** now", values: ["1 min"], hidden: 1 });
    });
    test("'Working on it. [T] Back soon.' keeps its words", () => {
      expect(extractTimeLines(`Working on it. ${IN} Back soon.`)).toEqual({ text: "Working on it. Back soon.", values: ["1 min"], hidden: 1 });
    });
    test("a markdown link whose text was the bracket leaves '[](https://x)' (a known limit)", () => {
      expect(extractTimeLines(`[${IN}](https://x)`)).toEqual({ text: "[](https://x)", values: ["1 min"], hidden: 1 });
    });
    test("a line of 500 characters: '- ' + bracket + spaces goes whole", () => {
      const line = `- ${IN}${" ".repeat(500 - 2 - IN.length)}`;
      expect(line).toHaveLength(500);
      expect(extractTimeLines(`a\n${line}\nb`)).toEqual({ text: "a\nb", values: ["1 min"], hidden: 1 });
    });
    test("a long line whose rest is long and has words is not touched beyond the bracket", () => {
      const rest = `${"w".repeat(500)}`;
      expect(extractTimeLines(`- ${IN} ${rest}`)).toEqual({ text: `- ${rest}`, values: ["1 min"], hidden: 1 });
    });
  });

  describe("U4: the 64-character bound counts the value after its outer spaces are taken off", () => {
    const val = (n: number): string => "~".repeat(n - 5) + "5 min";
    test.each([
      [63, 1, "5 min"],
      [64, 1, "5 min"],
      [65, 1, null],
      [63, 5, "5 min"],
      [64, 5, "5 min"],
      [65, 5, null],
    ])("%i characters after %i spaces after the colon", (n, spaces, want) => {
      const line = `${HEAD}${" ".repeat(spaces)}${val(n)}]`;
      expect(parseTimeLine(line)).toEqual(want === null ? "unreadable" : { value: want });
      expect(extractTimeLines(`a\n${line}\nb`)).toEqual({ text: "a\nb", values: want === null ? [] : [want], hidden: 1 });
      expect(extractTimeLines(`x ${line} y`)).toEqual({ text: "x y", values: want === null ? [] : [want], hidden: 1 });
    });
    test("spaces and tabs around the value do not count", () => {
      expect(parseTimeLine(`${HEAD} \t ${val(64)} \t ]`)).toEqual({ value: "5 min" });
    });
  });

  describe("U5: more forms", () => {
    test.each([
      ["+5 hours", "5 hours +"],
      ["+30 min", "30 min"],
      ["1 hour, 30 min", "1 hour"],
      ["1 hour and 30 minutes", "1 hour"],
      ["1h, 30m", "1 hour"],
      ["10 minutes and 30 seconds", "10 min"],
      ["1 day", "5 hours +"],
      ["2 days", "5 hours +"],
      ["1 d", "5 hours +"],
      ["1d 12h", "5 hours +"],
      ["1 day and 2 hours", "5 hours +"],
      // 0.1 day = 2.4 h = 8.64e6 ms, in the segment 3 h .. 1 h at 1 + (10.8 - 8.64) / 7.2 = 1.3, nearest the 3 hours mark.
      ["0.1 day", "3 hours"],
      ["1,5 hours", "1 hour"],
    ])("%s is read as %s", (v, want) => {
      expect(parseTimeLine(T(v))).toEqual({ value: want });
    });
    test.each(["1:30", "2 months", "1 mo", "1 week", "5 weeks", "soon", "a day", "and", ",", "5 and"])("%j stays unreadable", (v) => {
      expect(parseTimeLine(T(v))).toBe("unreadable");
    });
  });
});
