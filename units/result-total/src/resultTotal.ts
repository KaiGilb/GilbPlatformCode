// The DISCLOSED result total — the client half of Base Cycle144.
//
// Carrier: 3P.C.ResultTotal.DisclosedApproximationAndExactOnRequest.Base (Kai,
// 2026-08-17). Base's read surfaces (`GET /base/search`, `GET /base/page`) used to
// return a REQUIRED numeric `count` that was always an exact census. They now return
//
//     total: { kind: "exact" | "atLeast" | "approximate", value: number } | null
//
// and emit `count` IF AND ONLY IF the total is exact. There is also an
// `X-Base-Total-Kind` response header carrying the same discriminator.
//
// 🔴 WHY THIS MODULE EXISTS AND WHY IT IS THE ONLY ROUTE TO TEXT. The Constraint's
// Scope DISQUALIFIES a surface that "emits an estimated total in a form
// indistinguishable from an exact one". A UI that prints a BOUND as a bare numeral is
// exactly that defect — Kai's ruling was to be *"hones about it… like 'More than
// 10K'"*. So there is deliberately NO function here that turns a non-exact total into
// a bare number, and `formatResultTotal` is the only path from a total to a string.
// ⛔ Do not add a `.value`-to-numeral shortcut.
//
// ⚠ THE FAILURE MODE THIS GUARDS. `count` is still present on every SMALL answer set
// (the bounded walk exhausts the set and reports `exact`), so a client left reading
// `body.count` keeps working right up until a user's result set grows past the
// server's window — it passes a casual smoke test and fails silently in real use.

/** What a reported total IS. Mirrors Base `src/read/search.ts` `ResultTotalKind`. */
export type ResultTotalKind = "exact" | "atLeast" | "approximate";

/** A total that carries its own kind. ⛔ NEVER read `value` without reading `kind`. */
export interface ResultTotal {
  kind: ResultTotalKind;
  value: number;
}

/** The envelope fields any Base read surface may carry a total in. */
export interface TotalBearingWire {
  total?: unknown;
  count?: unknown;
}

// ⚠ EVERY helper below accepts `null | undefined` and uses `== null`, ⛔ not `=== null`.
// This is not defensive noise: these run at an HTTP boundary, the field is OPTIONAL on
// the wire, and a stub or an older vault can hand us `undefined`. Measured 2026-08-18 —
// a `=== null` guard threw `Cannot read properties of undefined (reading 'kind')` and
// the Standards surface rendered that TypeError text at the user instead of its answer.
const KINDS: readonly string[] = ["exact", "atLeast", "approximate"];

/**
 * Reads the disclosed total off a Base response body.
 *
 * Handles BOTH wire generations, which is what lets this land ahead of the server:
 *  - post-Cycle144 — `total: {kind, value}` is authoritative, `total: null` means the
 *    read established none (mode `none`, or a cursored page) and is NOT an error;
 *  - pre-Cycle144 — no `total` key at all, but a numeric `count`. That number was
 *    always a census (the old Find computed `count(*) OVER ()` unconditionally), so
 *    reading it as `exact` is correct rather than merely convenient.
 *
 * @param body the parsed response body
 * @returns the disclosed total, or `null` when none was established
 */
export function readResultTotal(body: TotalBearingWire | null | undefined): ResultTotal | null {
  if (!body || typeof body !== "object") return null;
  const t = body.total;
  if (t !== undefined) {
    if (t === null) return null;
    if (typeof t === "object") {
      const kind = (t as { kind?: unknown }).kind;
      const value = (t as { value?: unknown }).value;
      if (typeof kind === "string" && KINDS.includes(kind) && typeof value === "number" && Number.isFinite(value)) {
        return { kind: kind as ResultTotalKind, value };
      }
    }
    // `total` present but malformed — ⛔ do not silently fall back to `count`, which
    // on this generation of server is only ever emitted UNDER an exact total anyway.
    return null;
  }
  // Pre-Cycle144 server.
  return typeof body.count === "number" && Number.isFinite(body.count)
    ? { kind: "exact", value: body.count }
    : null;
}

/**
 * The exact total, or `null`. The ONE sanctioned way to obtain a census.
 *
 * A caller that needs a census and gets `null` must report the absence or re-ask with
 * `?count=exact` — ⛔ it may never substitute `value`, which under `atLeast` is a floor.
 */
export function exactCount(total: ResultTotal | null | undefined): number | null {
  return total != null && total.kind === "exact" ? total.value : null;
}

/**
 * Narrows a disclosed total by the rows a CLIENT-SIDE filter dropped from the page,
 * preserving the kind. The kind-aware sibling of `narrowTotal` in `recordPlane.ts`
 * (whose numeric contract is pinned by `narrowTotalContract.test.ts` and is left
 * untouched).
 *
 * ⚠ Same HONEST LIMITATION as `narrowTotal`: this subtracts PAGE-LOCAL drops from a
 * WHOLE-RESULT total, so it is a lower-bound approximation. Under an `exact` kind that
 * makes the result no longer strictly a census — but it is the number the surface can
 * actually render, and it is the pre-existing behaviour; ⛔ do not read it as a
 * filtered census.
 *
 * @param total  the server's disclosed total
 * @param seen   ids the server returned on this page
 * @param kept   rows surviving the client-side filter
 */
export function narrowResultTotal(
  total: ResultTotal | null | undefined,
  seen: number,
  kept: number,
): ResultTotal | null {
  if (total == null) return null;
  return { kind: total.kind, value: Math.max(0, total.value - (seen - kept)) };
}

/**
 * Adds a LOCALLY KNOWN exact count (e.g. filename matches the client resolved itself)
 * to a server-disclosed total, preserving the server's kind.
 *
 * ⚠ Adding an exact local count to a BOUND leaves a BOUND — the sum is still only a
 * floor. ⛔ It must never be promoted to `exact` because one of its two terms was.
 * When the server established no total the sum is `null` too: `n` alone is a count of
 * file hits, ⛔ not a total, and printing it as one is the lie this module exists to
 * stop.
 */
export function addLocalCount(total: ResultTotal | null | undefined, n: number): ResultTotal | null {
  if (total == null) return null;
  return { kind: total.kind, value: total.value + n };
}

/**
 * Is this total capable of supporting an ABSENCE claim ("nothing matched")?
 *
 * 🔴 ONLY an exact zero is. A bound of 0, an estimate of 0, and no total at all are
 * each "the server did not establish that the set is empty" — and a surface that says
 * *"the vault found nothing"* on any of them is asserting an absence it cannot see.
 */
export function provesEmpty(total: ResultTotal | null | undefined): boolean {
  return total != null && total.kind === "exact" && total.value === 0;
}

/**
 * The LARGER of two disclosed totals, kind-preserving.
 *
 * ⛔ Never promotes: if either side is non-exact the result is non-exact, because the
 * larger figure is only as trustworthy as the walk that produced it. `null` (no total)
 * loses to any real total, and two nulls give null.
 */
export function maxResultTotal(
  a: ResultTotal | null | undefined,
  b: ResultTotal | null | undefined,
): ResultTotal | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  const bigger = a.value >= b.value ? a : b;
  const kind: ResultTotalKind =
    a.kind === "exact" && b.kind === "exact" ? "exact" : bigger.kind === "exact" ? "atLeast" : bigger.kind;
  return { kind, value: bigger.value };
}

/**
 * The HUMAN phrasing of a disclosed total — Kai's own shapes.
 *
 * @returns "1,234" for a census, "more than 200" for a bound, "about 3000000" for an
 *   estimate, and `null` when there is no total (render nothing — ⛔ never a zero).
 */
export function formatResultTotal(total: ResultTotal | null | undefined): string | null {
  if (total == null) return null;
  const n = total.value.toLocaleString();
  switch (total.kind) {
    case "exact":
      return n;
    case "atLeast":
      return `more than ${n}`;
    case "approximate":
      return `about ${n}`;
  }
}
