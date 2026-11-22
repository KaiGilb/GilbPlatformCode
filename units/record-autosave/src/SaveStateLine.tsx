// The line that says whether what was typed has reached the vault: "Not saved yet…" / "Saving…" / "Saved" / the failure's own words.
// At `idle` it is an empty polite live region (so a later text is announced). It reports; it is not a Save button and asks for no tap (except "Try again" after a failure).

import type { ReactElement } from "react";
import type { AutosaveState } from "./useAutosaveRecord";

export interface SaveStateWords {
  pending: string;
  saving: string;
  saved: string;
  invalid: string;
  error: string;
  retry: string;
}

export const SAVE_STATE_WORDS: SaveStateWords = {
  pending: "Not saved yet…",
  saving: "Saving…",
  saved: "Saved",
  invalid: "Not saved: a field needs a change",
  error: "Not saved",
  retry: "Try again",
};

export function SaveStateLine(props: {
  state: AutosaveState;
  error: string | null;
  onRetry?: () => void;
  words?: Partial<SaveStateWords>;
  testId?: string;
}): ReactElement {
  const { state, error, onRetry, testId } = props;
  const words = { ...SAVE_STATE_WORDS, ...props.words };
  const id = testId ? `${testId}-save-state` : undefined;
  const cls = `autosave-line autosave-line--${state}`;
  // Always drawn: a live region that is already on the page announces the text that is put into it later. At `idle` it is empty.
  if (state === "idle") return <p className={cls} aria-live="polite" data-save-state="idle" data-testid={id} />;

  if (state === "error") {
    return (
      <p className={cls} role="alert" data-save-state="error" data-testid={id}>
        {words.error}: {error}
        {onRetry ? (
          <>
            {" "}
            <button type="button" onClick={onRetry}>
              {words.retry}
            </button>
          </>
        ) : null}
      </p>
    );
  }
  if (state === "invalid") {
    return (
      <p className={cls} role="alert" data-save-state="invalid" data-testid={id}>
        {words.invalid}
      </p>
    );
  }
  // Announced politely: a save landing is worth knowing and not worth interrupting.
  return (
    <p className={cls} aria-live="polite" data-save-state={state} data-testid={id}>
      {words[state]}
    </p>
  );
}
