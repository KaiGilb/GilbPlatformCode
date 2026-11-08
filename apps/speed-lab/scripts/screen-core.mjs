// Pure screen-timing rules: steps, the done rule, the summary. No browser.
// A settle() timeline may include an unchanged "tick" snapshot. The in-page probe does not store those;
// it checks the clock each frame instead. The tick stands for that clock check.

const KINDS = new Set(["click", "wait", "click-css", "wait-css", "click-label", "pause"]);

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Steps separated by ";" (a CSS selector may contain a comma). */
export function parseScreenSteps(str) {
  const parts = String(str ?? "").split(";").map((s) => s.trim()).filter((s) => s !== "");
  return parts.map((part) => {
    const i = part.indexOf(":");
    const kind = (i === -1 ? part : part.slice(0, i)).trim();
    const arg = i === -1 ? "" : part.slice(i + 1).trim();
    if (!KINDS.has(kind)) throw new Error(`unknown step kind: ${kind || part}`);
    if (arg === "") throw new Error(`step ${kind} needs an argument`);
    if (kind === "pause" && !/^\d+$/.test(arg)) throw new Error("step pause needs a whole number");
    return { kind, arg };
  });
}

function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Playwright selector for a click or wait step. */
export function selectorOf(step) {
  if (step.kind === "click" || step.kind === "wait") return `[data-testid="${esc(step.arg)}"]`;
  if (step.kind === "click-css" || step.kind === "wait-css") return String(step.arg);
  if (step.kind === "click-label") return `[aria-label="${esc(step.arg)}"]`;
  throw new Error(`step ${step.kind} has no selector`);
}

/** Median, min, max of the finite numbers. Even median is the mean of the two middle values. Rounded to 1 decimal. */
export function summarise(values) {
  const nums = [];
  for (const v of values ?? []) {
    if (typeof v === "number" && Number.isFinite(v)) nums.push(v);
  }
  const n = nums.length;
  if (n === 0) return { n: 0, median: null, min: null, max: null };
  nums.sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  return { n, median: round1(median), min: round1(nums[0]), max: round1(nums[n - 1]) };
}

function signature(rows) {
  return JSON.stringify(rows.map((r) => [r.key, r.text === true, r.face, r.sig ?? ""]));
}

function allText(rows, minRows) {
  if (rows.length < minRows) return false;
  for (const r of rows) if (r.text !== true) return false;
  return true;
}

function complete(rows, minRows) {
  if (!allText(rows, minRows)) return false;
  for (const r of rows) if (r.face === "loading") return false;
  return true;
}

function countsOf(rows) {
  let painted = 0;
  let none = 0;
  let broken = 0;
  for (const r of rows) {
    if (r.face === "painted") painted++;
    else if (r.face === "none") none++;
    else if (r.face === "broken") broken++;
  }
  return { rows: rows.length, painted, none, broken };
}

const EMPTY_COUNTS = { rows: null, painted: null, none: null, broken: null };

/**
 * Done when the snapshot at lastChange is complete (enough rows, every row has text, none still loading)
 * and a later snapshot shows that same screen still complete at least quietMs afterwards.
 * doneAt is lastChange, not the tick. Stops at the first such tick.
 */
export function settle(timeline, { quietMs, minRows }) {
  let lastSig = null;
  let lastChange = null;
  let changeRows = null;
  let prevAllText = false;
  let prevPainted = new Set();
  let firstRowAt = null;
  let allTextAt = null;
  let lastFaceAt = null;
  let done = false;
  let doneAt = null;
  let doneRows = null;

  for (const snap of timeline) {
    const rows = Array.isArray(snap.rows) ? snap.rows : [];
    const sig = signature(rows);
    if (sig !== lastSig) {
      lastSig = sig;
      lastChange = snap.t;
      changeRows = rows;
      if (firstRowAt === null && rows.some((r) => r.text === true)) firstRowAt = snap.t;
      const textReady = allText(rows, minRows);
      if (textReady && !prevAllText) allTextAt = snap.t;
      prevAllText = textReady;
      let became = false;
      const nextPainted = new Set();
      for (const r of rows) {
        if (r.face !== "painted") continue;
        const key = String(r.key);
        nextPainted.add(key);
        if (!prevPainted.has(key)) became = true;
      }
      if (became) lastFaceAt = snap.t;
      prevPainted = nextPainted;
    }
    if (!done && lastChange !== null && complete(rows, minRows) && snap.t >= lastChange + quietMs) {
      done = true;
      doneAt = lastChange;
      doneRows = changeRows;
      break;
    }
  }

  return {
    done,
    doneAt,
    firstRowAt,
    allTextAt,
    lastFaceAt,
    counts: doneRows ? countsOf(doneRows) : EMPTY_COUNTS,
  };
}

/** origin + pathname. Query and hash are dropped. */
export function redactUrl(u) {
  try {
    const url = new URL(u);
    return url.origin + url.pathname;
  } catch {
    return "(unparsable)";
  }
}
