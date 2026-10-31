// The line that says whether what was typed has left the browser: "Not saved yet…" / "Saving…" / "Saved" / the failure's own words. Silent at `idle`.
//
// It exists because a save that never happened looked exactly like a save that did. Before it, My Note and Where / How we met were written only on
// blur, so a person who typed and refreshed lost the text, and nothing on screen or in the DOM told the two cases apart. A failed durable write
// must surface, and so must one that has not been attempted yet.
//
// It is deliberately NOT a Save button: these are open fields you tap and write into, and a Save control puts back the extra tap that was removed.
// It reports; it does not ask for a tap. It is deliberately silent at `idle`: chrome that is always on screen stops being read.

import type { AnnotationSaveState as SaveState } from "./useAnnotationDraft";

export interface AnnotationSaveStateProps {
  state: SaveState;
  /** The write failure's own message. Shown verbatim — ⛔ never summarised into "failed". */
  error: string | null;
  /** Test-id stem, e.g. `connection-origin` → `connection-origin-save-state`. */
  testId: string;
  /** Field-specific lead-in for a failure, e.g. "Could not save where you met". */
  errorCopy: string;
}

/**
 * Reports whether this field's text has reached the vault.
 *
 * @param props see {@link AnnotationSaveStateProps}
 * @returns the status line, or `null` at `idle` (nothing to say yet)
 *
 * ⚠ `pending` says *"Not saved yet"* rather than *"Saving…"* and the difference is the
 * whole point: during the debounce nothing has been sent, and a person deciding whether it
 * is safe to leave needs the true one.
 */
export function AnnotationSaveState({ state, error, testId, errorCopy }: AnnotationSaveStateProps) {
  if (state === "idle") return null;

  if (state === "error") {
    return (
      <p
        className="text-sm"
        style={{ color: "var(--bad)" }}
        role="alert"
        data-testid={`${testId}-save-error`}
        data-save-state="error"
      >
        {errorCopy} — {error}
      </p>
    );
  }

  const copy =
    state === "pending" ? "Not saved yet…" : state === "saving" ? "Saving…" : "Saved";
  return (
    <p
      className="text-xs"
      style={{ color: state === "saved" ? "var(--ink-faint)" : "var(--accent-ink)" }}
      data-testid={`${testId}-save-state`}
      data-save-state={state}
      // Announced politely: a save landing is worth knowing and ⛔ not worth interrupting.
      aria-live="polite"
    >
      {copy}
    </p>
  );
}
