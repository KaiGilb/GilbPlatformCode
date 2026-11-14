import { useState } from "react";
import { ago, type VisitChange } from "./visit";

/** Every word the banner shows, so a host can translate or reword it. */
export interface SinceWords {
  heading: string;
  added: string;
  changed: string;
  deleted: string;
  dismiss: string;
  /** The button that shows the rest, e.g. "+2 more". */
  more(n: number): string;
  /** The time, e.g. "5 min ago". */
  when(at: number, now: number): string;
}

export const DEFAULT_SINCE_WORDS: SinceWords = {
  heading: "Since your last visit:",
  added: "added",
  changed: "changed",
  deleted: "deleted",
  dismiss: "Dismiss",
  more: (n) => `+${n} more`,
  when: (at, now) => ago(at, now),
};

export interface SinceBannerProps {
  /** From `diffVisit` / `recordVisit`. Empty: nothing is drawn. */
  changes: readonly VisitChange[];
  /** Called when the person dismisses. The banner also hides itself. */
  onDismiss?: () => void;
  /** Reword any of it. */
  words?: Partial<SinceWords>;
  /** How many to show before "+N more". Default 3. */
  shown?: number;
  /** The clock for "5 min ago". Default `Date.now()`. */
  now?: number;
  className?: string;
}

/**
 * One dismissible banner: what others did since the last visit, a few items, then "+N more" that opens the rest.
 * A polite live region (`role="status"`); the dismiss button is a real button with a name. Style: import `./since-banner.css`.
 */
export function SinceBanner({ changes, onDismiss, words, shown = 3, now, className }: SinceBannerProps) {
  const w = { ...DEFAULT_SINCE_WORDS, ...words };
  const [all, setAll] = useState(false);
  const [gone, setGone] = useState(false);
  if (gone || changes.length === 0) return null;
  const visible = all ? changes : changes.slice(0, Math.max(1, shown));
  const rest = changes.length - visible.length;
  const t = now ?? Date.now();
  return (
    <div className={className ? `slv-banner ${className}` : "slv-banner"} role="status" aria-live="polite" data-since-banner>
      <div className="slv-text">
        <strong className="slv-heading">{w.heading}</strong>{" "}
        <ul className="slv-list">
          {visible.map((c) => (
            <li key={`${c.kind}:${c.id}`} className="slv-item" data-since-item data-kind={c.kind}>
              {c.who} {w[c.kind]} {c.label} <span className="slv-when">({w.when(c.at, t)})</span>
            </li>
          ))}
        </ul>
        {rest > 0 ? (
          <button type="button" className="slv-btn slv-more" onClick={() => setAll(true)}>
            {w.more(rest)}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="slv-btn slv-dismiss"
        onClick={() => {
          setGone(true);
          onDismiss?.();
        }}
      >
        {w.dismiss}
      </button>
    </div>
  );
}
