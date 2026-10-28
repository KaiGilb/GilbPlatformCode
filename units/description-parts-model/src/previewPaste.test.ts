// The paste template. Cases 1-4 are ported from the app's tests (same inputs and expectations): a child of a skipped
// line, Assumption kept at the top level, and a pasted child that stays on a part of this card. The rest pin the
// reader, odd cases included.
import { describe, expect, it } from "vitest";
import { ASSUMPTION_KEPT, PARENT_NOT_A_PART, keywordProblem, KEYWORD_MESSAGE, previewPaste } from "./planParts";

const free = () => false;
const shape = (text: string, tag = "Walk", taken: (t: string) => boolean = free, lawful?: ReadonlySet<string>) => {
  const preview = previewPaste(text, tag, taken, lawful);
  return preview.parts.map((p) => [p.tag, p.skipped, p.parentTag]);
};

describe("ported", () => {
  it("a child of a skipped line names the skipped tag as its parent (the writer then links whatever record holds that tag)", () => {
    const preview = previewPaste("Run: The walker runs.\n- Fast: Faster than walking.", "Walk", (t) => t === "Walk.Run");
    expect(preview.parts.map((p) => [p.tag, p.skipped, p.parentTag])).toEqual([
      ["Walk.Run", true, null],
      ["Walk.Run.Fast", false, "Walk.Run"],
    ]);
  });

  it("Assumption is kept at the top level: the Keyword in any case on a top-level part is refused, and allowed under a part", () => {
    expect(keywordProblem("Assumption", { topLevel: true })).toBe(ASSUMPTION_KEPT);
    expect(keywordProblem("assumption", { topLevel: true })).toBe(ASSUMPTION_KEPT);
    expect(keywordProblem("ASSUMPTION", { topLevel: true })).toBe(ASSUMPTION_KEPT);
    expect(keywordProblem("Assumption")).toBeNull();
    expect(keywordProblem("assumption")).toBe(KEYWORD_MESSAGE);
    expect(KEYWORD_MESSAGE).toContain("letters only, starting with a capital");
  });

  it("still reads Assumption: Keyword: text as an assumption, not a part named Assumption", () => {
    const preview = previewPaste("Assumption: Floor: The floor is flat.", "Walk", () => false, new Set());
    expect(preview.bad).toEqual([]);
    expect(preview.parts.map((part) => [part.tag, part.assumption, part.skipped])).toEqual([["Walk.Assumption.Floor", true, false]]);
  });

  it("skips the lines under a taken tag that is not a part here, and keeps a child of a part that is", () => {
    const lawful = new Set(["Walk.Step"]);
    const foreign = previewPaste("Bones: x\n- Hip: y\n- - Socket: z", "Walk", (tag) => tag === "Walk.Bones", lawful);
    expect(foreign.parts.map((part) => [part.tag, part.skipped, part.note])).toEqual([
      ["Walk.Bones", true, null],
      ["Walk.Bones.Hip", true, PARENT_NOT_A_PART],
      ["Walk.Bones.Hip.Socket", true, PARENT_NOT_A_PART],
    ]);
    const under = previewPaste("Step: x\n- Lift: y", "Walk", (tag) => tag === "Walk.Step", lawful);
    expect(under.parts.map((part) => [part.tag, part.skipped, part.note, part.parentTag])).toEqual([
      ["Walk.Step", true, null, null],
      ["Walk.Step.Lift", false, null, "Walk.Step"],
    ]);
  });
});

describe("a top-level line", () => {
  it("becomes a part with its Keyword, text, line number and no parent", () => {
    const { parts, bad } = previewPaste("Run: The walker runs.", "Walk", free);
    expect(bad).toEqual([]);
    expect(parts).toEqual([
      { line: 1, tag: "Walk.Run", text: "The walker runs.", source: null, skipped: false, note: null, assumption: false, top: true, parentTag: null },
    ]);
  });

  it("trims the text, allows none, and counts blank lines in the line numbers", () => {
    const { parts } = previewPaste("Run:   spaced out   \n\n   \nStep:\n", "Walk", free);
    expect(parts.map((p) => [p.line, p.tag, p.text])).toEqual([
      [1, "Walk.Run", "spaced out"],
      [4, "Walk.Step", ""],
    ]);
  });

  it("reads CRLF line ends and trailing spaces", () => {
    expect(shape("Run: a  \r\nStep: b\r\n")).toEqual([
      ["Walk.Run", false, null],
      ["Walk.Step", false, null],
    ]);
  });

  it("trims the solution tag", () => {
    expect(shape("Run: a", "  Walk  ")).toEqual([["Walk.Run", false, null]]);
  });

  it("marks a repeated tag, and a tag the host says is taken, as skipped; the first of a repeat is written", () => {
    expect(shape("Run: a\nRun: b")).toEqual([
      ["Walk.Run", false, null],
      ["Walk.Run", true, null],
    ]);
    expect(shape("Run: a\nStep: b", "Walk", (t) => t === "Walk.Step")).toEqual([
      ["Walk.Run", false, null],
      ["Walk.Step", true, null],
    ]);
  });

  it("asks the host about each tag, with the full tag", () => {
    const asked: string[] = [];
    previewPaste("Run: a\n- Fast: b", "Walk", (t) => (asked.push(t), false));
    expect(asked).toEqual(["Walk.Run", "Walk.Run.Fast"]);
  });

  it("is empty for an empty text", () => {
    expect(previewPaste("", "Walk", free)).toEqual({ parts: [], bad: [] });
    expect(previewPaste("\n  \n", "Walk", free)).toEqual({ parts: [], bad: [] });
  });
});

describe("a trailing source", () => {
  it("takes the words after ' <- ' as that part's source, and leaves them out of the text", () => {
    const { parts } = previewPaste("Run: The walker runs. <- Dr Ames", "Walk", free);
    expect(parts[0]).toMatchObject({ text: "The walker runs.", source: "Dr Ames" });
  });

  it("splits at the last ' <- '", () => {
    const { parts } = previewPaste("Run: a <- b <- c", "Walk", free);
    expect(parts[0]).toMatchObject({ text: "a <- b", source: "c" });
  });

  it("needs the spaces around the arrow, and a source of nothing is no source", () => {
    expect(previewPaste("Run: a<-b", "Walk", free).parts[0]).toMatchObject({ text: "a<-b", source: null });
    expect(previewPaste("Run: a <-", "Walk", free).parts[0]).toMatchObject({ text: "a <-", source: null });
    expect(previewPaste("Run: a <-   ", "Walk", free).parts[0]).toMatchObject({ text: "a <-", source: null });
  });

  it("is read on a sub-part and an assumption too", () => {
    const { parts } = previewPaste("Run: a\n- Fast: b <- Ann\nAssumption: Floor: c <- Ben", "Walk", free);
    expect(parts.map((p) => p.source)).toEqual([null, "Ann", "Ben"]);
  });
});

describe("a sub-part", () => {
  it("takes its depth from the leading '- ' marks and is a child of the last part one level up", () => {
    const text = "Run: a\n- Fast: b\n- - Fastest: c\n- Slow: d\nStep: e\n- Lift: f";
    expect(shape(text)).toEqual([
      ["Walk.Run", false, null],
      ["Walk.Run.Fast", false, "Walk.Run"],
      ["Walk.Run.Fast.Fastest", false, "Walk.Run.Fast"],
      ["Walk.Run.Slow", false, "Walk.Run"],
      ["Walk.Step", false, null],
      ["Walk.Step.Lift", false, "Walk.Step"],
    ]);
    const { parts } = previewPaste(text, "Walk", free);
    expect(parts.map((p) => p.top)).toEqual([true, false, false, false, true, false]);
  });

  it("counts an en dash as a mark, and two spaces or a tab of indent as one more mark", () => {
    expect(shape("Run: a\n\u2013 Fast: b\n  - Fastest: c\n\t- Faster: d")).toEqual([
      ["Walk.Run", false, null],
      ["Walk.Run.Fast", false, "Walk.Run"],
      ["Walk.Run.Fast.Fastest", false, "Walk.Run.Fast"],
      ["Walk.Run.Fast.Faster", false, "Walk.Run.Fast"],
    ]);
  });

  it("is not a part (bad, no reason) when there is no part one level up, or no solution tag", () => {
    expect(previewPaste("- Fast: b", "Walk", free)).toEqual({ parts: [], bad: [{ line: 1 }] });
    expect(previewPaste("Run: a\n- - Deep: b", "Walk", free)).toMatchObject({ bad: [{ line: 2 }] });
    expect(previewPaste("Run: a\n- Fast: b", "", free)).toEqual({ parts: [], bad: [{ line: 1 }, { line: 2 }] });
    expect(previewPaste("Run: a", "   ", free)).toEqual({ parts: [], bad: [{ line: 1 }] });
  });

  it("may be named Assumption", () => {
    expect(shape("Run: a\n- Assumption: b")).toEqual([
      ["Walk.Run", false, null],
      ["Walk.Run.Assumption", false, "Walk.Run"],
    ]);
  });

  it("a part lower than the last line at its depth replaces that line on the stack", () => {
    expect(shape("Run: a\n- Fast: b\n- Slow: c\n- - Under: d")).toEqual([
      ["Walk.Run", false, null],
      ["Walk.Run.Fast", false, "Walk.Run"],
      ["Walk.Run.Slow", false, "Walk.Run"],
      ["Walk.Run.Slow.Under", false, "Walk.Run.Slow"],
    ]);
  });
});

describe("lines that are not parts", () => {
  it("gives a reason when the word before the colon has a digit or other non-letter", () => {
    expect(previewPaste("Sync2: x", "Walk", free).bad).toEqual([{ line: 1, why: "not a part: a Keyword is letters only (Sync2 is not)" }]);
    expect(previewPaste("Run: a\n- Sync2: x", "Walk", free).bad).toEqual([{ line: 2, why: "not a part: a Keyword is letters only (Sync2 is not)" }]);
    expect(previewPaste("-Sync: x", "Walk", free).bad).toEqual([{ line: 1, why: "not a part: a Keyword is letters only (-Sync is not)" }]);
    expect(previewPaste("Fast-run: x", "Walk", free).bad).toEqual([{ line: 1, why: "not a part: a Keyword is letters only (Fast-run is not)" }]);
  });

  it("gives no reason for a letters-only word in the wrong case, for plain words, or for a colon first", () => {
    for (const text of ["sync: x", "just some words", ": x", "Run", "- sync: x", "- Run", "Assumption"]) {
      const { parts, bad } = previewPaste(text, "Walk", free);
      expect(parts, text).toEqual([]);
      expect(bad, text).toEqual([{ line: 1 }]);
      expect("why" in bad[0]!, text).toBe(false);
    }
  });
});

describe("assumptions", () => {
  it("'Assumption:' alone opens the section: the lines under it are assumptions with the Assumption part as their parent", () => {
    const { parts, bad } = previewPaste("Assumption:\n- Floor: flat\n- - Level: yes", "Walk", free);
    expect(bad).toEqual([]);
    expect(parts.map((p) => [p.tag, p.assumption, p.top, p.parentTag])).toEqual([
      ["Walk.Assumption.Floor", true, false, "Walk.Assumption"],
      ["Walk.Assumption.Floor.Level", true, false, "Walk.Assumption.Floor"],
    ]);
  });

  it("'Assumption: Keyword: text' is one assumption; a '- ' line after it is another assumption beside it, a '- - ' line is under it", () => {
    const { parts } = previewPaste("Assumption: Floor: flat\n- Level: yes\n- - Deep: no", "Walk", free);
    expect(parts.map((p) => [p.tag, p.assumption, p.parentTag, p.text])).toEqual([
      ["Walk.Assumption.Floor", true, "Walk.Assumption", "flat"],
      ["Walk.Assumption.Level", true, "Walk.Assumption", "yes"],
      ["Walk.Assumption.Level.Deep", true, "Walk.Assumption.Level", "no"],
    ]);
    expect(shape("Assumption: Floor: a\n- - Deep: b")[1]).toEqual(["Walk.Assumption.Floor.Deep", false, "Walk.Assumption.Floor"]);
  });

  it("a second 'Assumption: Keyword: text' after the first is a sibling, not a child", () => {
    expect(shape("Assumption: Floor: a\nAssumption: Roof: b")).toEqual([
      ["Walk.Assumption.Floor", false, "Walk.Assumption"],
      ["Walk.Assumption.Roof", false, "Walk.Assumption"],
    ]);
  });

  it("'Assumption: <sentence>' (no Keyword) is not a part: it is bad with the 'kept' reason, in any case", () => {
    expect(previewPaste("Assumption: The floor is flat.", "Walk", free)).toEqual({ parts: [], bad: [{ line: 1, why: ASSUMPTION_KEPT }] });
    expect(previewPaste("assumption: the floor", "Walk", free).bad).toEqual([{ line: 1, why: ASSUMPTION_KEPT }]);
    expect(previewPaste("ASSUMPTION: The floor", "Walk", free).bad).toEqual([{ line: 1, why: ASSUMPTION_KEPT }]);
  });

  it("a malformed Assumption line ends with an empty stack: the lines under it are bad, and the line above is no parent either", () => {
    const { parts, bad } = previewPaste("Run: a\nAssumption: lower case sentence\n- Sub: b", "Walk", free);
    expect(parts.map((p) => p.tag)).toEqual(["Walk.Run"]);
    expect(bad).toEqual([{ line: 2, why: ASSUMPTION_KEPT }, { line: 3 }]);
  });

  it("is not read without a solution tag", () => {
    expect(previewPaste("Assumption:\nAssumption: Floor: a", "", free)).toEqual({ parts: [], bad: [{ line: 1 }, { line: 2 }] });
  });

  it("marks a repeated assumption tag as skipped", () => {
    expect(shape("Assumption: Floor: a\nAssumption: Floor: b")).toEqual([
      ["Walk.Assumption.Floor", false, "Walk.Assumption"],
      ["Walk.Assumption.Floor", true, "Walk.Assumption"],
    ]);
  });
});

describe("lawfulParentTags", () => {
  it("skips a line whose parent was not made and is not one of this card's parts, with the note", () => {
    const lawful = new Set(["Walk.Step"]);
    const preview = previewPaste("Step: a\n- Lift: b\nBones: c\n- Hip: d", "Walk", (t) => t === "Walk.Bones", lawful);
    expect(preview.parts.map((p) => [p.tag, p.skipped, p.note])).toEqual([
      ["Walk.Step", false, null],
      ["Walk.Step.Lift", false, null],
      ["Walk.Bones", true, null],
      ["Walk.Bones.Hip", true, PARENT_NOT_A_PART],
    ]);
  });

  it("lets a child of a part written in this paste through, and a child of a lawful part", () => {
    const lawful = new Set(["Walk.Old"]);
    const preview = previewPaste("Old: a\n- Fast: b\nNew: c\n- Fast: d", "Walk", (t) => t === "Walk.Old", lawful);
    expect(preview.parts.map((p) => [p.tag, p.skipped, p.note])).toEqual([
      ["Walk.Old", true, null],
      ["Walk.Old.Fast", false, null],
      ["Walk.New", false, null],
      ["Walk.New.Fast", false, null],
    ]);
  });

  it("does not look the Assumption section up as some other record", () => {
    const preview = previewPaste("Assumption: Floor: a\n- Level: b\n- - Deep: c", "Walk", free, new Set());
    expect(preview.parts.map((p) => [p.tag, p.skipped, p.note])).toEqual([
      ["Walk.Assumption.Floor", false, null],
      ["Walk.Assumption.Level", false, null],
      ["Walk.Assumption.Level.Deep", false, null],
    ]);
  });

  it("is off when not passed: a child of a taken tag is written", () => {
    expect(shape("Bones: c\n- Hip: d", "Walk", (t) => t === "Walk.Bones")).toEqual([
      ["Walk.Bones", true, null],
      ["Walk.Bones.Hip", false, "Walk.Bones"],
    ]);
  });
});
