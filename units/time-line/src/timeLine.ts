/**
 * The Time line (Wait.Known): the one line the agent writes to say how long until it needs the person again.
 * Pure: no React, no storage, no DOM, no clock.
 *
 * The contract, character for character (its home is the rule Kai-Zen.AskRules.TimeLeft):
 *   [Time until I need you: <value>]
 * where <value> is one of: 1 min, 5 min, 10 min, 30 min, 1 hour, 3 hours, 5 hours +
 * The agent writes it alone on its own line. The app reads it and hides it from the bubble.
 */

import { snapToValue, type TimeValue } from "./timeValues";

/** How every Time line starts. */
export const TIME_LINE_HEAD = "[Time until I need you:";

/** The exact line for a value. */
export function timeLine(value: TimeValue): string {
  return `${TIME_LINE_HEAD} ${value}]`;
}

const UNIT_MS: Readonly<Record<string, number>> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
/** Words that do not change the reading, in front of the number. */
const LEADING_WORDS = /^(?:(?:approx\.?|roughly|around|about|at least|more than|less than|over|under|up to|≈|~|\+)\s*)+/;
/** Words and marks that do not change the reading, after the value. */
const TRAILING_WORDS = /(?:\s*(?:or more|or longer|\+))+$/;
/**
 * One term of a time: a number, an optional "+", and a unit, then an optional "," or "and" before the next term.
 * Seconds: s, sec, secs, second, seconds. Minutes: m, min, mins, minute, minutes. Hours: h, hr, hrs, hour, hours. Days: d, day, days.
 */
const TERM_RE = /\s*(\d+(?:[.,]\d+)?)\s*(\+)?\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)?\s*(?:,\s*|and\s+)?/y;

/** The unit letter of a unit word. */
const unitOf = (word: string): "s" | "m" | "h" | "d" => (word.startsWith("h") ? "h" : word.startsWith("s") ? "s" : word.startsWith("d") ? "d" : "m");

/**
 * Read the text after the head. The value is read as NFKC (full-width digits and letters count). Compound times add up:
 * "1h30", "1h 30m", "1 hour 30 minutes". A last number with no unit after hours means minutes; after minutes, seconds.
 */
function readValue(raw: string): { value: TimeValue } | "unreadable" {
  const text = raw.normalize("NFKC").trim().toLowerCase().replace(LEADING_WORDS, "").replace(TRAILING_WORDS, "").trim();
  let ms = 0;
  let pos = 0;
  let terms = 0;
  let prev: "s" | "m" | "h" | "d" | null = null;
  while (pos < text.length) {
    TERM_RE.lastIndex = pos;
    const m = TERM_RE.exec(text);
    if (!m || m[0] === "") return "unreadable";
    let unit: "s" | "m" | "h" | "d" | null = m[3] ? unitOf(m[3]) : null;
    if (unit === null) {
      // A bare number is allowed only as the tail of a compound time ("1h30").
      if (prev === "d") unit = "h";
      else if (prev === "h") unit = "m";
      else if (prev === "m") unit = "s";
      else return "unreadable";
    }
    ms += Number((m[1] ?? "").replace(",", ".")) * (UNIT_MS[unit] ?? 0);
    prev = unit;
    terms += 1;
    pos += m[0].length;
  }
  if (terms === 0 || !Number.isFinite(ms) || ms <= 0) return "unreadable";
  // A time of 5 hours or more, with or without a "+", is the top value: snapToValue says so.
  return { value: snapToValue(ms) };
}

/** The longest value text that is read. The longest honest value ("about 1 hour 30 minutes or more") is far under it. */
const VALUE_MAX = 64;
/** A line longer than this is never tried as a whole-line Time line (only its brackets are cut). */
const WHOLE_LINE_MAX = 400;

/** Spaces and tabs off both ends, with no regex: its cost grows in step with the size, never with its square. */
function trimSpaces(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && (s[a] === " " || s[a] === "\t")) a += 1;
  while (b > a && (s[b - 1] === " " || s[b - 1] === "\t")) b -= 1;
  return s.slice(a, b);
}

/**
 * Read ONE line. Spaces and tabs around it are ignored.
 * Returns null when it is not a Time line (it does not start with the head, in any letter case, or does not end with "]").
 * Returns "unreadable" when it is a Time line whose value cannot be read: the app still hides it, it only has no estimate from it.
 * Otherwise the value: an exact one, or a lenient reading ("30 MIN", "5hours+", "1 hr", "1,5 hours", "about 45 minutes") snapped to the nearest value.
 * Never throws.
 * Spec: Kai-Zen.AskRules.TimeLeft — the contract line (meter: unit test).
 */
export function parseTimeLine(line: string): { value: TimeValue } | "unreadable" | null {
  try {
    if (typeof line !== "string" || /[\r\n]/.test(line)) return null;
    const t = trimSpaces(line);
    if (t.length < TIME_LINE_HEAD.length + 1 || !t.endsWith("]")) return null;
    if (t.slice(0, TIME_LINE_HEAD.length).toLowerCase() !== TIME_LINE_HEAD.toLowerCase()) return null;
    // Decision: a value longer than this is unreadable at once, so what the agent writes cannot make the reader slow. The line is still hidden.
    // The bound counts the value after its outer spaces and tabs are taken off (the space after the colon is not part of it).
    const inner = trimSpaces(t.slice(TIME_LINE_HEAD.length, -1));
    if (inner.length > VALUE_MAX) return "unreadable";
    return readValue(inner);
  } catch {
    return null;
  }
}

/** An open fence: its character and how many of them opened it. */
interface Fence { ch: "`" | "~"; len: number }

/** A line as the fence reader sees it: what is left after the containers, and what the line says about list items. */
interface Scanned {
  /** The line without its containers (quote marks, list markers) and the white space in front of them. */
  rest: string;
  /** The line is inside the list item that was open (it is indented to the item's content). */
  inItem: boolean;
  /** The column where this line's own list marker puts its content, or null when it starts no list item. */
  contentCol: number | null;
  /** Nothing but white space. */
  blank: boolean;
}

const isSpace = (c: string | undefined): boolean => c === " " || c === "\t";

/**
 * Take the containers off the front of a line, with an index walk (no regex, no copy per step), so a hostile line of 200 000 ">" or "- "
 * costs time in step with its size. The rule:
 *  - White space in front: at the top level (no list item open) up to 3 spaces count, as in CommonMark; more makes the line indented code,
 *    which has no containers and no fence. Inside an open list item (indented to its content) any amount is taken off.
 *  - Then, repeatedly, and with any amount of white space after each: a ">" with one optional space, and a list marker
 *    ("-", "*", "+" or 1 to 9 digits and "." or ")", followed by a space or tab).
 */
function scanLine(line: string, itemCol: number | null): Scanned {
  const n = line.length;
  let i = 0;
  let width = 0;
  while (i < n && isSpace(line[i])) {
    width += line[i] === "\t" ? 4 : 1;
    i += 1;
  }
  if (i === n) return { rest: "", inItem: false, contentCol: null, blank: true };
  const inItem = itemCol !== null && width >= itemCol;
  if (width > 3 && !inItem) return { rest: line, inItem: false, contentCol: null, blank: false };
  let contentCol: number | null = null;
  let sawQuote = false;
  for (;;) {
    const c = line[i];
    if (c === ">") {
      sawQuote = true;
      i += 1;
      width += 1;
      if (isSpace(line[i])) { i += 1; width += 1; }
    } else if (((c === "-" || c === "*" || c === "+") && isSpace(line[i + 1])) || isOrderedMarker(line, i)) {
      let j = i + 1;
      while (j < n && line[j] !== " " && line[j] !== "\t") j += 1; // the end of the marker (a digit run and its dot)
      let k = j;
      let spaces = 0;
      while (k < n && isSpace(line[k])) { k += 1; spaces += 1; }
      width += (j - i) + spaces;
      // Content starts one space after the marker when there are 5 or more; the column is kept only for a marker not behind a quote mark.
      if (!sawQuote && contentCol === null && k < n) contentCol = width - (spaces >= 5 ? spaces - 1 : 0);
      i = k;
      continue;
    } else {
      break;
    }
    while (i < n && isSpace(line[i])) { i += 1; width += 1; }
  }
  return { rest: line.slice(i), inItem, contentCol, blank: false };
}

/** 1 to 9 digits and "." or ")" at `i`, then a space or tab. */
function isOrderedMarker(line: string, i: number): boolean {
  let j = i;
  while (j < line.length && j - i < 10 && line[j] !== undefined && line[j]! >= "0" && line[j]! <= "9") j += 1;
  const digits = j - i;
  return digits >= 1 && digits <= 9 && (line[j] === "." || line[j] === ")") && isSpace(line[j + 1]);
}

/**
 * A fence opens on a container-free form that starts with three or more backticks or tildes.
 * A backtick fence's info string holds no backtick (else the line is an inline code span, not a fence).
 */
function openFence(rest: string): Fence | null {
  const m = /^(`{3,}|~{3,})(.*)$/.exec(rest);
  if (!m) return null;
  const run = m[1] ?? "";
  if (run.startsWith("`") && (m[2] ?? "").includes("`")) return null;
  return { ch: run.startsWith("`") ? "`" : "~", len: run.length };
}

/** A fence closes ONLY on a container-free form of the same character, at least as many, and then nothing but spaces or tabs. */
function closesFence(rest: string, fence: Fence): boolean {
  const m = /^(`{3,}|~{3,})[ \t]*$/.exec(rest);
  const run = m?.[1] ?? "";
  return run !== "" && run.startsWith(fence.ch) && run.length >= fence.len;
}

/** Prefixes an agent may put in front of the line: a quote mark, a heading mark, ONE list marker; and emphasis marks at both ends. */
function bareForm(line: string): string {
  let s = line.trimStart();
  let listDone = false;
  for (let guard = 0; guard < 50; guard++) {
    const before = s;
    s = s.replace(/^>[ \t]?/, "").replace(/^#{1,6}[ \t]+/, "");
    if (!listDone) {
      const next = s.replace(/^(?:[-*+]|\d+[.)])[ \t]+/, "");
      if (next !== s) {
        s = next;
        listDone = true;
      }
    }
    s = s.trimStart().trimEnd();
    for (const mark of ["**", "__", "~~", "*", "_"]) {
      if (s.length > 2 * mark.length && s.startsWith(mark) && s.endsWith(mark)) {
        s = s.slice(mark.length, s.length - mark.length);
        break;
      }
    }
    if (s === before) break;
  }
  return s.trimEnd();
}

/** The inline code spans of a line: a run of backticks to the next run of the same length. Returns [start, end) pairs. */
function codeSpans(line: string): [number, number][] {
  const spans: [number, number][] = [];
  const runs: { at: number; n: number }[] = [];
  for (let i = 0; i < line.length; ) {
    if (line[i] !== "`") { i += 1; continue; }
    let j = i;
    while (line[j] === "`") j += 1;
    runs.push({ at: i, n: j - i });
    i = j;
  }
  for (let r = 0; r < runs.length; r++) {
    const open = runs[r];
    if (!open) continue;
    for (let k = r + 1; k < runs.length; k++) {
      const close = runs[k];
      if (close && close.n === open.n) {
        spans.push([open.at, close.at + close.n]);
        r = k;
        break;
      }
    }
  }
  return spans;
}

/**
 * Cut every Time-line bracket out of a line (outside inline code spans), each with ONE space next to it (the one before, else the one after).
 * Returns the new line and what the brackets said, or null when there is none.
 */
function cutBrackets(line: string): { line: string; reads: ({ value: TimeValue } | "unreadable")[] } | null {
  const head = TIME_LINE_HEAD.toLowerCase();
  const lower = line.toLowerCase();
  const spans = codeSpans(line);
  const found: { start: number; end: number; read: { value: TimeValue } | "unreadable" }[] = [];
  // The spans are in order, so one pointer walks them while the brackets are found in order: no pass over all spans for each bracket.
  let span = 0;
  for (let from = 0; ; ) {
    const start = lower.indexOf(head, from);
    if (start < 0) break;
    const close = line.indexOf("]", start + head.length);
    if (close < 0) break;
    from = close + 1;
    while (span < spans.length && (spans[span]?.[1] ?? 0) <= start) span += 1;
    const inside = spans[span];
    if (inside && start >= inside[0] && start < inside[1]) continue;
    // parseTimeLine is bounded (a long value is unreadable at once), and the brackets do not overlap, so the copies add up to the line.
    const read = parseTimeLine(line.slice(start, close + 1));
    if (read !== null) found.push({ start, end: close + 1, read });
  }
  if (found.length === 0) return null;
  // Built from pieces, left to right, so a long line with many brackets is copied once.
  let out = "";
  let cursor = 0;
  for (const f of found) {
    let a = f.start;
    let b = f.end;
    if (a - 1 >= cursor && line[a - 1] === " ") a -= 1;
    else if (line[b] === " ") b += 1;
    out += line.slice(cursor, a);
    cursor = b;
  }
  out += line.slice(cursor);
  return { line: out, reads: found.map((f) => f.read) };
}

/** How many Time-line heads a line holds (any letter case). */
function countHeads(line: string): number {
  const head = TIME_LINE_HEAD.toLowerCase();
  const lower = line.toLowerCase();
  let n = 0;
  for (let at = lower.indexOf(head); at >= 0; at = lower.indexOf(head, at + head.length)) n += 1;
  return n;
}

/** What may be left of a line after its brackets are cut and still count as nothing: marks, list markers, bars and white space. */
const DECORATION_ONLY = /^(?:[\s|*_~#>+-]|\d{1,9}[.)](?=\s|$))*$/;

/**
 * True when nothing but decoration is left of a line. The left part is trimmed first (linear), and a part still longer than the
 * whole-line limit is not checked, so the cost stays bounded. Real words, or a link like "[](https://x)", are not decoration.
 */
function isDecorationOnly(left: string): boolean {
  const t = left.trim();
  return t.length <= WHOLE_LINE_MAX && DECORATION_ONLY.test(t);
}

/** True when a last line that is still arriving could become a Time line. */
function couldBecomeTimeLine(line: string): boolean {
  const cand = line.replace(/^[ \t]+/, "").toLowerCase();
  const head = TIME_LINE_HEAD.toLowerCase();
  if (cand.length >= 2 && head.startsWith(cand)) return true;
  return cand.startsWith(head) && !cand.includes("]");
}

/**
 * Take the Time lines out of a text. Lines stay exactly as they are (their line breaks too); a removed line goes with ONE line break
 * (the one after it; for the last line, the one before it), so no empty line is left where it stood. Nothing else is tidied.
 *
 * A line inside a fenced code block (``` or ~~~; an unclosed fence runs to the end) is never removed and never read: there the agent is quoting.
 * `values` are the readable values in the order found; `hidden` counts every removed line, readable or not.
 * With `streaming` true the text is still arriving, so a partial last line that could still become a Time line ("[T", "[Time until") is hidden too
 * (counted in `hidden`, no value). This stops the raw line from flashing in the bubble. Without it, a partial last line is ordinary text.
 * A text with no Time line comes back as the same string with `hidden` 0. Never throws; a non-string gives an empty text.
 */
export function extractTimeLines(text: string, opts?: { streaming?: boolean }): { text: string; values: TimeValue[]; hidden: number } {
  if (typeof text !== "string") return { text: "", values: [], hidden: 0 };
  try {
    // Split keeping the line breaks: [line, break, line, break, ..., last line].
    const parts = text.split(/(\r\n|\n|\r)/);
    const lines: string[] = [];
    const breaks: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      lines.push(parts[i] ?? "");
      breaks.push(parts[i + 1] ?? "");
    }
    const values: TimeValue[] = [];
    const removed: boolean[] = lines.map(() => false);
    const shown: string[] = [...lines];
    const head = TIME_LINE_HEAD.toLowerCase();
    let hidden = 0;
    let fence: Fence | null = null;
    // The column of the content of the list item that is open (null: none). A fence line indented to it is inside the item.
    let itemCol: number | null = null;
    lines.forEach((line, i) => {
      const sc = scanLine(line, itemCol);
      // The list-item state follows every line, fenced or not: a blank line keeps it, a line outside the item ends it, a list marker opens one.
      const follow = (): void => {
        if (sc.blank) return;
        if (sc.contentCol !== null) itemCol = sc.contentCol;
        else if (!sc.inItem) itemCol = null;
      };
      // --- Fences (CommonMark, also inside a quote or a list item): a quote is never removed, cut or read ---
      if (fence) {
        if (closesFence(sc.rest, fence)) fence = null;
        follow();
        return;
      }
      const opened = openFence(sc.rest);
      if (opened) {
        fence = opened;
        follow();
        return;
      }
      follow();
      if (line.toLowerCase().includes(head)) {
        // --- The whole line is a Time line, perhaps decorated (a list mark, a quote mark, bold). A long line is not tried: its cost must stay bounded ---
        let read = line.length > WHOLE_LINE_MAX ? null : parseTimeLine(bareForm(line));
        // Two or more brackets that make up the line are not one unreadable line: each is cut and read.
        if (read === "unreadable" && countHeads(line) > 1) read = null;
        if (read !== null) {
          removed[i] = true;
          hidden += 1;
          if (read !== "unreadable") values.push(read.value);
          return;
        }
        // --- A bracket inside a sentence is cut out of it ---
        const cut = cutBrackets(line);
        if (cut) {
          // What is left may be nothing but decoration (a list mark, bold marks, a table bar): then the whole line goes, with its line break.
          if (isDecorationOnly(cut.line)) removed[i] = true;
          else shown[i] = cut.line;
          for (const r of cut.reads) {
            hidden += 1;
            if (r !== "unreadable") values.push(r.value);
          }
          return;
        }
      }
      if (opts?.streaming === true && i === lines.length - 1 && line !== "" && couldBecomeTimeLine(line)) {
        removed[i] = true;
        hidden += 1;
      }
    });
    if (hidden === 0) return { text, values, hidden: 0 };

    const kept: { line: string; brk: string }[] = [];
    lines.forEach((line, i) => {
      if (!removed[i]) kept.push({ line: shown[i] ?? line, brk: breaks[i] ?? "" });
    });
    // The last line has no break after it, so its break is the one before it.
    if (removed[lines.length - 1] && kept.length > 0) {
      const last = kept[kept.length - 1];
      if (last) last.brk = "";
    }
    return { text: kept.map((k) => k.line + k.brk).join(""), values, hidden };
  } catch {
    return { text, values: [], hidden: 0 };
  }
}
