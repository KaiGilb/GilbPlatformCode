/** A compact byte size, for example "4.2 KB". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"] as const;
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const unit = units[i] ?? "KB";
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${unit}`;
}

/**
 * A short date. A missing or zero stamp returns "" so the screen does not invent a date.
 * `now` is passed in so a test does not change on the first day of a year.
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

/** Date and time. A missing or zero stamp returns "" so the screen does not invent a moment. */
export function formatDateTime(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
