// The one line a page shows next to its heading while it revalidates ("Updating…") and after ("Updated 14:05"), and the outcome of a Refresh press in plain words (never the faint 12 px line).
// Every user-facing sentence, the locale and every class name is a parameter; the defaults are the English words and classes the source app used.
import { useCallback, useRef, useState } from "react";

const hhmm = (ms: number, locale?: string) => new Date(ms).toLocaleTimeString(locale ?? [], { hour: "2-digit", minute: "2-digit", hour12: false });
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** When a copy was loaded, for a person to read: the time alone when it is from today, else the day too ("Mon 26 Oct, 01:53"; with the year when it is not this year). A three-day-old copy must not read as today's. */
/** `locale` (a BCP 47 tag) is used for the time and the day; without it the time follows the runtime's locale and the day is written as "en-GB". */
export function whenText(ms: number, now: number = Date.now(), locale?: string): string {
  if (sameDay(ms, now)) return hhmm(ms, locale);
  const d = new Date(ms);
  const day = d.toLocaleDateString(locale ?? "en-GB", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }) });
  return `${day}, ${hhmm(ms, locale)}`;
}
/** Every sentence the unit writes. A host passes only the ones it changes (`Partial<UpdatedLabels>`); the rest keep the defaults in `DEFAULT_LABELS`. */
export type UpdatedLabels = {
  /** While a revalidation runs, and the first note after a Refresh press. */
  updating: string;
  /** After an answer; `when` is the `whenText` of the time. */
  updated: (when: string) => string;
  /** The stale-copy note; `when` is the `whenText` of the copy, `why` the `plainWhy` of the error. */
  stale: (when: string, why: string) => string;
  /** `plainWhy`'s reason when the error carries none that fits. */
  noReason: string;
  /** Refresh brought something new. */
  justUpdated: string;
  /** Refresh brought nothing new. */
  nothingNew: string;
  /** Refresh threw. */
  couldNotUpdate: string;
};
/** The English words the source app used. */
export const DEFAULT_LABELS: UpdatedLabels = {
  updating: "Updating…",
  updated: (when) => `Updated ${when}`,
  stale: (when, why) => `Showing what was loaded on ${when}; could not reach your workspace. ${why}.`,
  noReason: "the platform did not answer",
  justUpdated: "Updated just now",
  nothingNew: "Nothing new",
  couldNotUpdate: "Could not update just now. What you see is as it was. Try again in a minute.",
};
const words = (labels?: Partial<UpdatedLabels>): UpdatedLabels => ({ ...DEFAULT_LABELS, ...labels });

/** The classes each line carries unless the host passes its own. They use four host CSS variables: `--ink-faint`, `--ink`, `--bad`, `--ink-soft`. */
export const DEFAULT_CLASSES = {
  line: "text-[12px] text-[var(--ink-faint)]",
  stale: "text-[14px] font-semibold text-[var(--ink)]",
  error: "text-[14px] font-semibold text-[var(--bad)]",
  note: "text-[13px] text-[var(--ink-soft)]",
} as const;

/** A copy older than this that could not be brought up to date says so. */
export const STALE_NOTE_AFTER_MS = 60 * 60_000;
/** "Updating…" while a revalidation runs, else "Updated <when>" (nothing before the first answer). A polite live region. */
/** `labels`, `locale` and `className` are optional; see `UpdatedLabels`, `whenText` and `DEFAULT_CLASSES`. */
export function UpdatedLine({ updating, updatedAt, testid, labels, locale, className }: { updating: boolean; updatedAt: number | null | undefined; testid?: string; labels?: Partial<UpdatedLabels>; locale?: string; className?: string }) {
  const l = words(labels);
  const text = updating ? l.updating : updatedAt ? l.updated(whenText(updatedAt, undefined, locale)) : "";
  return <span role="status" aria-live="polite" data-testid={testid ?? "updated-line"} className={className ?? DEFAULT_CLASSES.line}>{text}</span>;
}

/** The reason a failed update gives, in a few plain words (never a stack or an address). */
/** `noReason` is what it says when there is none that fits (default: `DEFAULT_LABELS.noReason`). */
export function plainWhy(error: unknown, noReason: string = DEFAULT_LABELS.noReason): string {
  const m = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const clean = m.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  return clean.length > 0 && clean.length <= 120 ? clean : noReason;
}
/**
 * p154 b3: shown when the last update failed AND the copy on screen is older than an hour (a copy from disk, a platform that cannot be reached): what is shown, from when, and why it is not newer.
 * Plain reading size, never the faint line. Nothing when there is no error, no copy, or the copy is recent.
 */
export function StaleNote({ error, updatedAt, now, testid, labels, locale, className }: { error: unknown; updatedAt: number | null | undefined; now?: number; testid?: string; labels?: Partial<UpdatedLabels>; locale?: string; className?: string }) {
  const l = words(labels);
  const at = now ?? Date.now();
  if (!error || !updatedAt || at - updatedAt < STALE_NOTE_AFTER_MS) return null;
  return <p role="status" data-testid={testid ?? "stale-note"} className={className ?? DEFAULT_CLASSES.stale}>{l.stale(whenText(updatedAt, at, locale), plainWhy(error, l.noReason))}</p>;
}

export type RefreshNote = { kind: "updating" | "new" | "same" | "error"; text: string };
/**
 * A Refresh button's feedback. `run` loads now and returns what it brought: `{ ok, sig }` (a signature of the data, to tell "Nothing new" from "Updated just now") or `{ ok: false, why }`.
 * The note: "Updating…", then "Updated just now" / "Nothing new" / the reason in plain words.
 */
export function useRefreshNote(run: () => Promise<{ ok: true; sig: string } | { ok: false; why: string }>, sigNow: () => string, options?: { labels?: Partial<UpdatedLabels> }) {
  const [note, setNote] = useState<RefreshNote | null>(null);
  const busy = useRef(false);
  const labelsNow = useRef(options?.labels); // read at press time, so `press` keeps its identity when only the labels change
  labelsNow.current = options?.labels;
  const press = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const l = words(labelsNow.current);
    const before = sigNow();
    setNote({ kind: "updating", text: l.updating });
    try {
      const r = await run();
      setNote(r.ok ? (r.sig === before ? { kind: "same", text: l.nothingNew } : { kind: "new", text: l.justUpdated }) : { kind: "error", text: r.why });
    } catch { setNote({ kind: "error", text: l.couldNotUpdate }); } finally { busy.current = false; }
  }, [run, sigNow]);
  return { note, press, clear: () => setNote(null) };
}

/** The note as a line: an error is an alert in the page's error colour at reading size. */
/** `errorClassName` styles the alert, `className` the other notes. */
export function RefreshNoteLine({ note, testid, className, errorClassName }: { note: RefreshNote | null; testid?: string; className?: string; errorClassName?: string }) {
  if (!note) return null;
  if (note.kind === "error") return <p role="alert" data-testid={testid ?? "refresh-note"} className={errorClassName ?? DEFAULT_CLASSES.error}>{note.text}</p>;
  return <p role="status" aria-live="polite" data-testid={testid ?? "refresh-note"} className={className ?? DEFAULT_CLASSES.note}>{note.text}</p>;
}
