// A test double for the app's AddedByLine (src/components/records/AddedByLine.tsx): who added a note, in the app read through the shell's names.
export function AddedByLine({ item, own, hasSource = true }: { item: string; own: boolean; hasSource?: boolean }) {
  if (!item) return null;
  return (
    <span data-testid="added-by-line">
      {hasSource ? (own ? "Added by you" : "Added by someone else") : "No source named"}
    </span>
  );
}
