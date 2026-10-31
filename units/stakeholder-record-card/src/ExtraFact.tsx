// A fact the card holds that is not one of its set's fields: text in presentation, a box in edit where the card may write it.
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { EntityRefValue } from "@kaigilb/gilbplatformcode-entity-ref-value";

/**
 * A fact the card holds that is not one of its set's fields (a "Stated By", a typed extra): in presentation its label and value as
 * text, nothing when it is empty; in edit, the box it always had where the card may write it, otherwise the value as text.
 */
export function ExtraFact({
  label,
  value,
  asRef,
  editable,
  vaultId,
  onOpen,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  asRef: boolean;
  editable: boolean;
  vaultId: string;
  /** Opens the record a reference value names; the second argument is the value (the record's full address). */
  onOpen?: (id: string, uri?: string) => void;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const mode = useCardMode();
  const present = mode.managed && mode.presentation;
  if (present && !value.trim()) return null;
  return (
    <label className="flex flex-col gap-1 py-2">
      <span className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]">{label}</span>
      {asRef && <EntityRefValue value={value} vaultId={vaultId} onOpen={onOpen ? (id) => onOpen(id, value) : undefined} quiet={present} />}
      {!asRef && present && <span className="break-words text-[15px] text-[var(--ink)]" data-testid="extra-fact-value">{value}</span>}
      {!asRef && !present && (
        <input
          value={value}
          readOnly={!editable}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="min-h-[44px] rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
      )}
    </label>
  );
}
