/**
 * The words and the two acts of a save that met someone else's change of the same value. One wording and one pair of buttons, for the
 * Table's cell and for a host's own form (GilbApp's card), so the person meets the same choice wherever the clash happens.
 */

/** What a clash says: their stored value, the person's own, and the two acts. */
export const CONFLICT_WORDS = {
  theirs: (text: string) => `Changed by someone else: ${text}`,
  mine: (text: string) => `Yours: ${text}`,
  useTheirs: "Use theirs",
  keepMine: "Keep mine",
} as const;

const BUTTON =
  "min-h-[28px] rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--paper-2)] px-2.5 text-[12.5px] font-semibold text-[var(--ink)] hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

/**
 * The two acts of a clash, a line of their own with the buttons at its right, each its own width: the act that writes ("Keep mine") is
 * rightmost, the one that changes nothing ("Use theirs") at its left (the platform's order for a row of buttons).
 *
 * @param props the two acts, and the line's test id
 */
export function ConflictActs(props: { onUseTheirs: () => void; onKeepMine: () => void; testId?: string }) {
  return (
    <div className="flex w-full flex-none items-center justify-end gap-2" data-testid={props.testId}>
      <button type="button" className={BUTTON} onClick={props.onUseTheirs}>
        {CONFLICT_WORDS.useTheirs}
      </button>
      <button type="button" className={BUTTON + " border-[var(--accent)]"} onClick={props.onKeepMine}>
        {CONFLICT_WORDS.keepMine}
      </button>
    </div>
  );
}
