// A named copy of `formatShortDate` from GilbApp `src/lib/format.ts` (lines 29-37), commit a703b3ed78e612e2cab77e94876ce9bce109d5a3.
// The function is pure and in no other unit; this unit is the only one that needs it, so it is copied here and not exported from the package.

/**
 * A compact grid date: `12 Mar` inside the current year, `12 Mar 24` outside it.
 *
 * `0` and any non-finite stamp return `""`, never "1 Jan 1970": a zero means NOT KNOWN, and an empty cell is the honest cell.
 *
 * @param ms epoch milliseconds, or 0 / non-finite when the surface carries no stamp
 * @param now the instant to take "this year" from, injectable so a test does not drift on 1 Jan
 * @returns the short date, or `""` when there is nothing truthful to print
 */
export function formatShortDate(ms: number | null | undefined, now: Date = new Date()): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return d.getFullYear() === now.getFullYear()
    ? day
    : `${day} ${String(d.getFullYear() % 100).padStart(2, "0")}`;
}
