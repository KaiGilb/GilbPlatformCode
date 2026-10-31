// A text field on the address card in the house row, and the address lines under Street.
// Taken from GilbApp `src/components/mynet/PlaceClaimsCard.tsx` (commit in the README).
import type { PlaceTextTerm } from "@kaigilb/gilbplatformcode-place-claims";
import type { PlaceClaimDraft } from "@kaigilb/gilbplatformcode-place-draft";
import { LINE_SLOTS, textFieldLabel } from "./addressLines";

/**
 * A text field, laid out as the other rows of a card: the sub-label in small italic on the left, the value under it, this field's own
 * rung pill on the right.
 */
export function AddressTextRow({
  id,
  label,
  value,
  placeholder,
  hint,
  listId,
  disabled,
  onChange,
  onBlur,
  onEnter,
  rungPill,
  autoFocus,
}: {
  /** The first box of an address just added gets the cursor. */
  autoFocus?: boolean;
  id: string;
  label: string;
  value: string;
  placeholder: string;
  hint?: string;
  listId?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  /** Leaving the field. Optional: the add form commits when focus leaves the whole form instead. */
  onBlur?: () => void;
  /** Enter in the field: a commit, as on the other rows. */
  onEnter?: () => void;
  rungPill?: React.ReactNode;
}) {
  return (
    <div className="relative flex items-start gap-2 bg-[var(--surface)] py-2.5">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="font-[var(--serif)] block text-[13px] italic text-[var(--ink-soft)]">
          {label}
        </label>
        <input
          id={id}
          autoFocus={autoFocus}
          type="text"
          list={listId}
          autoComplete="off"
          disabled={disabled}
          className="mt-0.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[16px] text-[var(--ink)]"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={
            onEnter
              ? (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onEnter();
                  }
                }
              : undefined
          }
        />
        {hint ? <span className="text-[11px] text-[var(--ink-faint)]">{hint}</span> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">{rungPill}</div>
    </div>
  );
}

/**
 * The address lines, "Address 1", "Address 2", then "Postal Code", directly under Street, in the house row. The rows come from the one
 * table (`PLACE_TEXT_SLOTS` of `place-claims`) and the labels from the master, so a further free-text field is a row there and no edit here. Used by
 * both editors (add, and a stored address) so they cannot drift. The postal code is a plain text box with no format check (codes differ by
 * country), kept as typed so "0150" keeps its zero.
 */
export function AddressLineRows({
  idPrefix,
  draft,
  labels,
  onText,
  onBlur,
  onEnter,
}: {
  idPrefix: string;
  draft: PlaceClaimDraft;
  labels: Readonly<Record<string, string>> | undefined;
  onText: (term: PlaceTextTerm, v: string) => void;
  onBlur?: () => void;
  onEnter?: () => void;
}) {
  return (
    <>
      {LINE_SLOTS.map(({ slot, term }) => {
        const label = textFieldLabel(term, labels);
        return (
          <AddressTextRow
            key={slot}
            id={`${idPrefix}-${slot}`}
            label={label}
            value={draft[term]}
            placeholder=""
            onChange={(v) => onText(term, v)}
            onBlur={onBlur}
            onEnter={onEnter}
          />
        );
      })}
    </>
  );
}
