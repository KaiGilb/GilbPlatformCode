// The id tail shown after a label that another row in the same list also carries.
// A copy of the app's `IdTail` component (`src/components/records/IdTail.tsx`).

export function IdTail({ tail }: { tail: string }) {
  return <span className="ml-1.5 font-mono text-[10.5px] text-[var(--ink-ghost)]">{tail}</span>;
}
