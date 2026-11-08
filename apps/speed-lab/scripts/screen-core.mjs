// Pure screen-timing rules: steps, the done rule, the summary, and local-folder overrides. No browser.
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

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

/** "--override" value: "https://host/app/=/path/to/dir". The prefix must be http(s) and end in "/". */
export function parseOverride(str) {
  const raw = String(str ?? "");
  const eq = raw.indexOf("=");
  if (eq === -1) throw new Error("override needs a prefix and a folder, separated by =");
  const prefix = raw.slice(0, eq);
  const dir = raw.slice(eq + 1);
  if (dir === "") throw new Error("override needs a folder");
  let url;
  try { url = new URL(prefix); }
  catch { throw new Error("override prefix is not a url"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("override prefix must be http or https");
  if (!prefix.endsWith("/")) throw new Error("override prefix must end with /");
  return { prefix, dir };
}

/**
 * Where a request sits under an override prefix.
 * Query and hash are ignored. ".." after decoding is "bad". An empty path, or one that ends in "/", is index.html.
 */
export function overridePath(prefixUrl, requestUrl) {
  let prefix;
  try { prefix = new URL(prefixUrl); }
  catch { return { kind: "outside" }; }
  if (prefix.protocol !== "http:" && prefix.protocol !== "https:") return { kind: "outside" };

  const noHash = String(requestUrl ?? "").split("#", 1)[0];
  const noQuery = noHash.split("?", 1)[0];
  const m = /^(https?:)\/\/([^/?#]+)([^?#]*)$/i.exec(noQuery);
  if (!m) return { kind: "outside" };

  let origin;
  try { origin = new URL(`${m[1].toLowerCase()}//${m[2]}`).origin; }
  catch { return { kind: "outside" }; }
  if (origin !== prefix.origin) return { kind: "outside" };

  const rawPath = m[3] === "" ? "/" : m[3];
  const prefixPath = prefix.pathname.endsWith("/") ? prefix.pathname : `${prefix.pathname}/`;
  if (!rawPath.startsWith(prefixPath)) return { kind: "outside" };

  const rest = rawPath.slice(prefixPath.length);
  let decoded;
  try { decoded = decodeURIComponent(rest); }
  catch { return { kind: "bad" }; }
  if (decoded.includes("\0") || decoded.startsWith("/") || decoded.includes("..")) return { kind: "bad" };
  if (decoded === "" || decoded.endsWith("/")) return { kind: "file", rel: "index.html" };
  return { kind: "file", rel: decoded };
}

/** Content-Type for a file name. Unknown extensions are application/octet-stream. */
export function contentTypeOf(name) {
  const base = String(name ?? "").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  const ext = base.slice(dot).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** True when the last path segment has no dot, so a missing file can be the app shell. */
export function spaFallback(rel) {
  const last = String(rel ?? "").split("/").pop() ?? "";
  return last !== "" && !last.includes(".");
}

/** Cache-Control for a file served from the local folder. index.html is never immutable. */
export function cacheControlOf(rel) {
  const norm = String(rel ?? "").replaceAll("\\", "/");
  const base = norm.split("/").pop() ?? "";
  if (base === "index.html") return "no-cache";
  if (norm.startsWith("assets/")) return "public, max-age=31536000, immutable";
  return "no-cache";
}
