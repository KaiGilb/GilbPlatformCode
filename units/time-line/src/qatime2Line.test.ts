// QA round 2 (Agent.Tester) for the Time line reader at 7450ed07: fences, decoration, in-sentence brackets, bounds, new value forms.
// Pure functions: REAL. The expectations come from the spec (CommonMark fence rules, the A rule), not from the code.
import { loadavg } from "node:os";
import { describe, expect, it } from "vitest";
import { extractTimeLines, parseTimeLine } from "./timeLine";
import type { TimeValue } from "./timeValues";

const HEAD = "[Time until I need you:";
const T = (v: string): string => `${HEAD} ${v}]`;
const IN = T("1 min");
const AFTER = T("10 min");

// ---------------------------------------------------------------------------------------------------------------------
// Fences: an oracle written from the CommonMark rules, run over every pairing.
// ---------------------------------------------------------------------------------------------------------------------
interface Fence { ch: string; len: number }
function oracleOpen(line: string): Fence | null {
  const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return null;
  if (m[1]![0] === "`" && m[2]!.includes("`")) return null;
  return { ch: m[1]![0]!, len: m[1]!.length };
}
function oracleClose(line: string, f: Fence): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return !!m && m[1]![0] === f.ch && m[1]!.length >= f.len;
}
/** Which lines of a plain document (no containers) are quoted, by the CommonMark rules. */
function oracleQuoted(lines: string[]): boolean[] {
  let f: Fence | null = null;
  return lines.map((l) => {
    if (f) {
      if (oracleClose(l, f)) f = null;
      return true;
    }
    const o = oracleOpen(l);
    if (o) { f = o; return true; }
    return false;
  });
}

describe("qatime2 A: fences, every pairing, a Time line inside and one after", () => {
  const chars = ["`", "~"];
  const lens = [3, 4, 5, 6];
  const indents = [0, 1, 2, 3, 4];
  const infos = ["", "ts", " text more", "``x"]; // "``x": a backtick in a backtick fence's info string is not a fence
  const trailings = ["", "  ", " x"]; // " x" after a closer means it does not close
  const cases: { name: string; doc: string[] }[] = [];
  for (const oc of chars) for (const ol of lens) for (const ind of indents) for (const info of infos)
    for (const cc of chars) for (const cl of lens) for (const ci of [0, 3, 4]) for (const tr of trailings) {
      const open = " ".repeat(ind) + oc.repeat(ol) + info;
      const close = " ".repeat(ci) + cc.repeat(cl) + tr;
      cases.push({ name: `open[${JSON.stringify(open)}] close[${JSON.stringify(close)}]`, doc: ["head", open, IN, close, AFTER, "tail"] });
    }
  it(`all ${cases.length} pairings agree with the CommonMark oracle`, () => {
    const bad: string[] = [];
    for (const c of cases) {
      const quoted = oracleQuoted(c.doc);
      const want = c.doc.filter((l, i) => quoted[i] || (l !== IN && l !== AFTER));
      const wantValues: TimeValue[] = [];
      if (!quoted[2]) wantValues.push("1 min");
      if (!quoted[4]) wantValues.push("10 min");
      const r = extractTimeLines(c.doc.join("\n"));
      if (r.text !== want.join("\n") || JSON.stringify(r.values) !== JSON.stringify(wantValues)) {
        bad.push(`${c.name}: values ${JSON.stringify(r.values)} want ${JSON.stringify(wantValues)}; text ${JSON.stringify(r.text)}`);
      }
    }
    console.log("QATIME2 fence pairings run:", cases.length, "disagreements:", bad.length);
    if (bad.length > 0) console.log("QATIME2 first disagreements:\n" + bad.slice(0, 12).join("\n"));
    expect(bad).toEqual([]);
  });

  it("two blocks in a row, each with a line inside, one between, one after", () => {
    const f = "```";
    const doc = [f, IN, f, AFTER, "~~~~", IN, "~~~~", AFTER].join("\n");
    const r = extractTimeLines(doc);
    expect(r.values).toEqual(["10 min", "10 min"]);
    expect(r.text).toBe([f, IN, f, "~~~~", IN, "~~~~"].join("\n"));
  });

  // Containers: a fenced block inside a list item or a blockquote is still a fenced block (CommonMark), so a line quoted there is a quote.
  it("a block inside a blockquote keeps its quoted line", () => {
    const doc = ["> ```", `> ${IN}`, "> ```", AFTER].join("\n");
    const r = extractTimeLines(doc);
    expect(r.text).toBe(["> ```", `> ${IN}`, "> ```"].join("\n"));
    expect(r.values).toEqual(["10 min"]);
  });
  it("a block inside a list item (indent 3) keeps its quoted line", () => {
    const doc = ["1. Write it like this:", "   ```", `   ${IN}`, "   ```", AFTER].join("\n");
    const r = extractTimeLines(doc);
    expect(r.text).toBe(["1. Write it like this:", "   ```", `   ${IN}`, "   ```"].join("\n"));
  });
  it("a block inside a nested list item (indent 4) keeps its quoted line", () => {
    const doc = ["- item", "  - sub", "    ```", `    ${IN}`, "    ```", AFTER].join("\n");
    const r = extractTimeLines(doc);
    expect(r.text).toBe(["- item", "  - sub", "    ```", `    ${IN}`, "    ```"].join("\n"));
  });
  it("a block opened on a list-marker line keeps its quoted line", () => {
    const doc = ["- ```", `  ${IN}`, "  ```", AFTER].join("\n");
    const r = extractTimeLines(doc);
    expect(r.text).toBe(["- ```", `  ${IN}`, "  ```"].join("\n"));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Decorated whole lines and brackets inside a sentence
// ---------------------------------------------------------------------------------------------------------------------
describe("qatime2 A: decorated whole lines are removed whole", () => {
  const whole: [string, string][] = [
    ["quote", `> ${IN}`],
    ["two quote marks", `> > ${IN}`],
    ["quote without space", `>${IN}`],
    ["quote, list, bold", `> - **${IN}**`],
    ["bullet -", `- ${IN}`],
    ["bullet *", `* ${IN}`],
    ["bullet +", `+ ${IN}`],
    ["numbered 1.", `1. ${IN}`],
    ["numbered 12)", `12) ${IN}`],
    ["heading #", `# ${IN}`],
    ["heading ######", `###### ${IN}`],
    ["heading and bold", `## **${IN}**`],
    ["bold", `**${IN}**`],
    ["bold underscores", `__${IN}__`],
    ["italic", `*${IN}*`],
    ["italic underscore", `_${IN}_`],
    ["strike", `~~${IN}~~`],
    ["bold italic", `***${IN}***`],
    ["no-break space in front", ` ${IN}`],
    ["ideographic space in front", `　${IN}`],
    ["line separator in front", ` ${IN}`],
    ["em space and tab", ` \t${IN}`],
    ["trailing spaces", `${IN}   `],
    ["list item, bold, with spaces", `  -   **${IN}**  `],
    ["quote then heading", `> # ${IN}`],
  ];
  it.each(whole)("%s", (_n, line) => {
    const r = extractTimeLines(`a\n${line}\nb`);
    expect(r.text).toBe("a\nb");
    expect(r.values).toEqual(["1 min"]);
    expect(r.hidden).toBe(1);
  });
});

describe("qatime2 A: lines that are not whole Time lines: the bracket is cut with one space, the rest stays", () => {
  // [name, line, text left, values, hidden]
  // F3 (U3): a null left part means the whole line goes, with its line break (what is left was nothing but decoration).
  const cut: [string, string, string | null, TimeValue[], number][] = [
    ["start of a sentence", `${IN} Then I continue.`, "Then I continue.", ["1 min"], 1],
    ["middle of a sentence", `I will ${IN} continue.`, "I will continue.", ["1 min"], 1],
    ["end of a sentence", `I will continue. ${IN}`, "I will continue.", ["1 min"], 1],
    ["no spaces around", `a${IN}b`, "ab", ["1 min"], 1],
    ["space only after", `(${IN} ok)`, "(ok)", ["1 min"], 1],
    ["two brackets in a sentence", `A ${IN} B ${AFTER} C`, "A B C", ["1 min", "10 min"], 2],
    ["three brackets in a sentence", `A ${T("1 min")} B ${T("5 min")} C ${T("30 min")} D`, "A B C D", ["1 min", "5 min", "30 min"], 3],
    ["two brackets side by side in a sentence", `A ${IN} ${AFTER} B`, "A B", ["1 min", "10 min"], 2],
    ["unreadable bracket in a sentence", `A ${T("soon")} B`, "A B", [], 1],
    ["two list markers (spec: only ONE is allowed, so it is not a whole line)", `- - ${IN}`, null, ["1 min"], 1],
    ["emphasis on one side only", `**${IN}`, null, ["1 min"], 1],
    ["emphasis on the other side only", `${IN}**`, null, ["1 min"], 1],
    ["seven hash marks (not a heading)", `####### ${IN}`, null, ["1 min"], 1],
    ["list item with bold and words after", `- **${IN}** now`, "- **** now", ["1 min"], 1],
    ["list marker, words, bracket", `- Next step ${IN}`, "- Next step", ["1 min"], 1],
    ["heading with words and bracket", `## Plan ${IN}`, "## Plan", ["1 min"], 1],
    ["table row", `| a | ${IN} |`, "| a | |", ["1 min"], 1],
    ["table cell alone", `| ${IN} |`, null, ["1 min"], 1],
    ["markdown link whose text is the bracket", `[${IN}](https://x)`, "[](https://x)", ["1 min"], 1],
    ["bracket in link text with words", `see [${IN} here](https://x)`, "see [here](https://x)", ["1 min"], 1],
    ["unclosed backtick before the bracket", `\`code ${IN}`, "`code", ["1 min"], 1],
    ["bracket after a closed code span", `\`c\` ${IN}`, "`c`", ["1 min"], 1],
    ["two spaces before: one goes", `A  ${IN} B`, "A  B", ["1 min"], 1],
    ["marker with no space (not a list marker)", `-${IN}`, null, ["1 min"], 1],
    ["quote mark and words", `> note ${IN}`, "> note", ["1 min"], 1],
    ["the bracket in a quote with text after", `> ${IN} more`, "> more", ["1 min"], 1],
    ["upper-case head inside a sentence", `x [TIME UNTIL I NEED YOU: 5 MIN] y`, "x y", ["5 min"], 1],
  ];
  it.each(cut)("%s", (_n, line, left, values, hidden) => {
    const r = extractTimeLines(`a\n${line}\nb`);
    console.log("QATIME2 CUT:", _n, JSON.stringify(line), "->", JSON.stringify(r.text.split("\n")[1] ?? null), JSON.stringify(r.values), r.hidden);
    expect(r.text).toBe(left === null ? "a\nb" : `a\n${left}\nb`);
    expect(r.values).toEqual(values);
    expect(r.hidden).toBe(hidden);
  });

  const stay: [string, string][] = [
    ["inline code, one backtick", `\`${IN}\``],
    ["inline code in a sentence", `Write \`${IN}\` on its own line.`],
    ["inline code, two backticks", `\`\`${IN}\`\``],
    ["inline code, three backticks (on one line)", `\`\`\`${IN}\`\`\``],
    ["inline code with a backtick inside, double fence", `\`\`a \` ${IN}\`\``],
    ["no closing bracket", `${HEAD} 5 min`],
    ["bracket split over two lines (line one)", `${HEAD}`],
  ];
  it.each(stay)("a quote stays: %s", (_n, line) => {
    const r = extractTimeLines(`a\n${line}\nb`);
    console.log("QATIME2 STAY:", _n, JSON.stringify(r.text.split("\n")[1] ?? null), r.hidden);
    expect(r.text).toBe(`a\n${line}\nb`);
    expect(r.hidden).toBe(0);
    expect(r.values).toEqual([]);
  });

  it("a code span of one bracket and a bare bracket in one line: only the bare one goes", () => {
    const r = extractTimeLines(`Say \`${IN}\` and then ${AFTER} ok`);
    expect(r.text).toBe(`Say \`${IN}\` and then ok`);
    expect(r.values).toEqual(["10 min"]);
  });
  it("a bracket split over two lines stays as written (not found) and costs nothing", () => {
    const r = extractTimeLines(`${HEAD}\n5 min]`);
    console.log("QATIME2 split over two lines:", JSON.stringify(r));
    expect(r).toEqual({ text: `${HEAD}\n5 min]`, values: [], hidden: 0 });
  });
  it("RISK-2 (F3, U2): two brackets that make up the whole line are each cut and read: both values, hidden is 2", () => {
    const r = extractTimeLines(`a\n${T("1 min")} ${T("10 min")}\nb`);
    expect(r).toEqual({ text: "a\nb", values: ["1 min", "10 min"], hidden: 2 });
  });
  it("RISK-2b (F3, U2): the same with a list marker: the line goes whole, both values read, hidden 2", () => {
    expect(extractTimeLines(`- ${T("1 min")} ${T("10 min")}`)).toEqual({ text: "", values: ["1 min", "10 min"], hidden: 2 });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The bounds
// ---------------------------------------------------------------------------------------------------------------------
describe("qatime2 A: the 64-character value bound", () => {
  // The value text is what stands between the colon and the closing bracket. "~" in front is ignored by the reader, so the length can be set exactly.
  const val = (n: number): string => "~".repeat(n - 5) + "5 min";
  it.each([[63, ["5 min"]], [64, ["5 min"]], [65, []]] as [number, TimeValue[]][])("value of %i characters (no space after the colon)", (n, want) => {
    const line = `${HEAD}${val(n)}]`;
    expect(line.length - HEAD.length - 1).toBe(n);
    const r = extractTimeLines(`a\n${line}\nb`);
    expect(r.text).toBe("a\nb");
    expect(r.values).toEqual(want);
    expect(r.hidden).toBe(1);
  });
  it("NOTE-1 (F3, U4): the bound counts the value after its outer spaces are taken off, so 64 characters after the canonical space is read, and so is 63", () => {
    expect(extractTimeLines(`${HEAD} ${val(64)}]`).values).toEqual(["5 min"]);
    expect(extractTimeLines(`${HEAD} ${val(63)}]`).values).toEqual(["5 min"]);
  });
  it("in a sentence the same bound holds", () => {
    const r = extractTimeLines(`x ${HEAD}${val(65)}] y`);
    expect(r).toEqual({ text: "x y", values: [], hidden: 1 });
    const q = extractTimeLines(`x ${HEAD}${val(64)}] y`);
    expect(q).toEqual({ text: "x y", values: ["5 min"], hidden: 1 });
  });
});

describe("qatime2 A: the 400-character line bound", () => {
  const padTo = (line: string, n: number): string => " ".repeat(n - line.length) + line;
  it.each([399, 400, 401])("a whole-line Time line padded to %i characters is removed and read", (n) => {
    const line = padTo(IN, n);
    expect(line.length).toBe(n);
    expect(extractTimeLines(`a\n${line}\nb`)).toEqual({ text: "a\nb", values: ["1 min"], hidden: 1 });
  });
  it.each([399, 400, 401])("a decorated whole line (list item) padded to %i characters is removed whole", (n) => {
    const line = "- " + " ".repeat(n - 2 - IN.length) + IN;
    expect(line.length).toBe(n);
    const r = extractTimeLines(`a\n${line}\nb`);
    console.log("QATIME2 decorated line of", n, "->", JSON.stringify(r.text.length), JSON.stringify(r.text.split("\n")[1]?.slice(0, 5)));
    expect(r.values).toEqual(["1 min"]);
    // NOTE-2 (F3, U3): over 400 the line is only searched for brackets, but what is left is nothing but decoration (a bullet and spaces), so the line goes whole
    expect(r.text).toBe("a\nb");
  });
  it.each([399, 400, 401])("an in-sentence bracket in a line of %i characters is cut, the sentence stays", (n) => {
    const tail = " end";
    const lead = "w".repeat(n - IN.length - tail.length - 1);
    const line = `${lead} ${IN}${tail}`;
    expect(line.length).toBe(n);
    const r = extractTimeLines(`a\n${line}\nb`);
    expect(r.text).toBe(`a\n${lead}${tail}\nb`);
    expect(r.values).toEqual(["1 min"]);
  });
});

describe("qatime2 A: cost stays in step with the size (200 000 characters)", () => {
  const SIZE = 200_000;
  const timed = (name: string, text: string, check?: (r: ReturnType<typeof extractTimeLines>) => void): void => {
    it(name, () => {
      const t0 = performance.now();
      const r = extractTimeLines(text);
      const ms = performance.now() - t0;
      const t1 = performance.now();
      extractTimeLines(text + text); // double the size: a quadratic reader would show it
      const ms2 = performance.now() - t1;
      console.log(`QATIME2 TIME ${name}: ${ms.toFixed(1)} ms for ${text.length} chars, ${ms2.toFixed(1)} ms for ${2 * text.length}, hidden ${r.hidden}, load ${loadavg().map((x) => x.toFixed(1)).join("/")}`);
      expect(ms).toBeLessThan(2000);
      expect(ms2).toBeLessThan(4000);
      check?.(r);
    });
  };
  timed("backticks on one line", "`".repeat(SIZE));
  timed("a letter, then backticks, then a bracket at the end", "x" + "`".repeat(SIZE) + " " + IN, (r) => expect(r.hidden).toBe(1));
  timed("open brackets on one line", "[".repeat(SIZE));
  timed("open brackets then a bracket", "[".repeat(SIZE) + IN, (r) => expect(r.hidden).toBe(1));
  timed("heads with no closing bracket", HEAD.repeat(Math.floor(SIZE / HEAD.length)));
  timed("heads each followed by a closing bracket on one line", `${T("5 min")} `.repeat(Math.floor(SIZE / (T("5 min").length + 1))), (r) => expect(r.hidden).toBeGreaterThan(5000));
  timed("alternating spaces and tabs then a bracket", " \t".repeat(SIZE / 2) + IN, (r) => expect(r.hidden).toBe(1));
  timed("many list markers on one line then a bracket", "- ".repeat(SIZE / 2) + IN, (r) => expect(r.hidden).toBe(1));
  timed("many quote marks on one line then a bracket", "> ".repeat(SIZE / 2) + IN, (r) => expect(r.hidden).toBe(1));
  timed("many bold marks around a bracket", "**".repeat(SIZE / 4) + IN + "**".repeat(SIZE / 4), (r) => expect(r.hidden).toBe(1));
  timed("a long whole-line value", `${HEAD} ${"1".repeat(SIZE)}]`, (r) => expect(r.hidden).toBe(1));
  timed("backtick runs of growing length then a bracket", Array.from({ length: 600 }, (_, i) => "`".repeat(i + 1)).join(" a ") + ` ${IN}`);
  timed("pairs of backtick runs of equal length", "`a ".repeat(SIZE / 3), undefined);
  timed("lines of '- ' + bracket (short lines)", `- ${IN}\n`.repeat(SIZE / 20), (r) => expect(r.text).toBe(""));
  timed("lines of 399 characters with a decorated bracket", `- ${" ".repeat(399 - 2 - IN.length)}${IN}\n`.repeat(SIZE / 400), (r) => expect(r.text).toBe(""));
  timed("many empty lines", "\n".repeat(SIZE));
  timed("many CRLF lines with a bracket every tenth", Array.from({ length: SIZE / 10 }, (_, i) => (i % 10 === 0 ? IN : "word")).join("\r\n"));
  timed("many fence lines", "```\n".repeat(SIZE / 4));
  timed("fences with a line in each block", `\`\`\`\n${IN}\n\`\`\`\n`.repeat(SIZE / 50), (r) => expect(r.hidden).toBe(0));
  timed("non-breaking spaces then a bracket", " ".repeat(SIZE) + IN, (r) => expect(r.hidden).toBe(1));
  timed("an unclosed fence then many lines", "```\n" + `${IN}\n`.repeat(SIZE / 40), (r) => expect(r.hidden).toBe(0));
  timed("mixed heads with brackets of 65 characters", `${HEAD}${"~".repeat(60)}5 min] x `.repeat(SIZE / 100), (r) => expect(r.values).toEqual([]));
  timed("mixed-case heads", "[tImE uNtIl I nEeD yOu: 5 min] ".repeat(SIZE / 31), (r) => expect(r.hidden).toBeGreaterThan(5000));
});

// ---------------------------------------------------------------------------------------------------------------------
// The value forms
// ---------------------------------------------------------------------------------------------------------------------
describe("qatime2 A: value forms and their neighbours", () => {
  // [value, expected value or "unreadable", why that is sensible]
  const forms: [string, TimeValue | "unreadable", string][] = [
    ["5+ hours", "5 hours +", "the top"],
    ["+5 hours", "5 hours +", "a leading plus is ignored (F3, U5)"],
    ["5 hours or more", "5 hours +", "the top"],
    ["at least 2 hours", "3 hours", "2 hours is a tie, the longer wins"],
    ["under 5 min", "5 min", "taken as 5 min"],
    ["less than 1 min", "1 min", "taken as 1 min"],
    ["more than 5 hours", "5 hours +", "the top"],
    ["90 s", "1 min", "90 seconds snaps to 1 min"],
    ["90 sec", "1 min", ""],
    ["90 secs", "1 min", ""],
    ["30 seconds", "1 min", "nearest, the shortest mark"],
    ["1h30", "1 hour", "90 min snaps to 1 hour"],
    ["1h30m", "1 hour", ""],
    ["1 h 30", "1 hour", ""],
    ["1 hour 30 minutes", "1 hour", ""],
    ["2h 0m", "3 hours", "2 hours is a tie, the longer wins"],
    ["0h 30m", "30 min", ""],
    ["1:30", "unreadable", "a clock form is not read: a hole, hidden without a value"],
    ["1.5h 30m", "3 hours", "2 hours, a tie"],
    ["30m 1h", "1 hour", "wrong order is still added up: 90 min"],
    ["1h 90m", "3 hours", "150 min, nearer 3 hours"],
    ["１ｈ３０", "1 hour", "NFKC: full-width"],
    ["１０ ｍｉｎ", "10 min", "NFKC: full-width"],
    ["1\th", "1 hour", "a tab inside"],
    ["5 months", "unreadable", "must not read as 5 min"],
    ["5 mo", "unreadable", "must not read as 5 min"],
    ["2 days", "5 hours +", "a day is 5 hours or more (F3, U5)"],
    ["1 day", "5 hours +", "a day is 5 hours or more (F3, U5)"],
    ["1 hour, 30 min", "1 hour", "a comma between terms is read (F3, U5)"],
    ["5", "unreadable", "no unit"],
    ["", "unreadable", "empty"],
    ["0 min", "unreadable", "zero"],
    ["0h 0m", "unreadable", "zero"],
    ["-5 min", "unreadable", "negative"],
    ["5 min+", "5 min", "a plus after a value is ignored below the top"],
    ["~ 30 min", "30 min", ""],
    ["approx. 30 min", "30 min", ""],
    ["roughly 10 min", "10 min", ""],
    ["around 1 hr", "1 hour", ""],
    ["up to 30 min", "30 min", ""],
    ["30 min or longer", "30 min", ""],
    ["1,5 hours", "1 hour", "decimal comma"],
    ["1.5 hours", "1 hour", ""],
    ["1e3 min", "unreadable", "no exponent"],
    ["5 min 30", "5 min", "5 min 30 s snaps to 5 min"],
    ["10 minutes 30 seconds", "10 min", ""],
    ["999999999999 hours", "5 hours +", "huge but finite"],
  ];
  it.each(forms)("[%s] gives %s (%s)", (v, want) => {
    const raw = `${HEAD} ${v}]`;
    const p = parseTimeLine(raw);
    const got = p === "unreadable" ? "unreadable" : p === null ? "not a line" : p.value;
    console.log("QATIME2 FORM:", JSON.stringify(v), "->", got);
    expect(got).toBe(want);
    const r = extractTimeLines(`a\n${raw}\nb`);
    expect(r.text).toBe("a\nb");
    expect(r.hidden).toBe(1);
    expect(r.values).toEqual(want === "unreadable" ? [] : [want]);
  });
});
