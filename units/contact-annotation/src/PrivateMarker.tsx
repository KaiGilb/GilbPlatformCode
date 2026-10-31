// The ONE "Private" marker that both holder-only fields (My Note, Where / How we met) wear. It takes no className or variant: two markers must be
// the same. It reports only; it gates nothing. What it promises is what the annotations route does: the note and the line are stored private, and
// read back only by (caller, held party), so the contact can never read them.

export function PrivateMarker({ testId }: { testId: string }) {
  return (
    <span
      className="text-[11px] uppercase tracking-wide"
      style={{ color: "var(--ink-faint)" }}
      data-testid={testId}
      data-private-marker="true"
    >
      Private
    </span>
  );
}
