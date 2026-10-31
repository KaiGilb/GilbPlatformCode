/**
 * The "who sees this" switch on a held detail the viewer ADDED: shared with everyone who may read the
 * vault (the default), or private to the person who added it. The caller draws it only on the viewer's own claim (their card is the one `a:statedBy`);
 * a detail another person (or an old vault card) added has none.
 *
 *   - shared: while editing, "Make private to me only" sets it private;
 *   - private: a small "Only you see this" label (always, in presentation too), and while editing "Everyone in this vault" sets it back.
 * The look is the section's own small edit control (a small underlined text button).
 */
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export function HeldVisibilitySwitch({
  isPrivate,
  editing,
  busy = false,
  onSet,
  noun,
}: {
  isPrivate: boolean;
  /** The card is being edited: the switch is a control only then; the "Only you see this" label shows either way. */
  editing: boolean;
  busy?: boolean;
  /** Set it private (`true`) or back to shared (`false`). */
  onSet: (makePrivate: boolean) => void;
  /** What it is, for the accessible name ("interest Sailing"). */
  noun: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3" data-testid="held-visibility">
      {isPrivate ? (
        <span className="text-[12px] text-[var(--ink-soft)]" data-testid="held-private-label">
          Only you see this
        </span>
      ) : null}
      {editing ? (
        <button
          type="button"
          disabled={busy}
          aria-label={isPrivate ? `Show ${noun} to everyone in this vault` : `Make ${noun} private to me only`}
          className={`min-h-10 text-left text-[13px] text-[var(--ink-soft)] underline disabled:opacity-50 ${FOCUS}`}
          data-testid={isPrivate ? "held-visibility-shared" : "held-visibility-private"}
          onClick={() => onSet(!isPrivate)}
        >
          {isPrivate ? "Everyone in this vault" : "Make private to me only"}
        </button>
      ) : null}
    </div>
  );
}
