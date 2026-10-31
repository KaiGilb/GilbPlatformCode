// An always-editable typed field of the card; the control is chosen by the field kind. In presentation it is text.
import { useEffect, useRef, useState } from "react";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { EntityRefValue, isEntityRefValue } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { FieldSpec } from "@kaigilb/gilbplatformcode-record-types";

export function FieldEditor({
  field,
  isName,
  autoFocus,
  value,
  registerRef,
  onChange,
  onBlur,
  onEnterAdvance,
  readOnly,
  vaultId,
  onOpenRef,
}: {
  field: FieldSpec;
  isName: boolean;
  /** Focus this field as soon as it mounts (a freshly-minted record's name field) — the
   * ref-timing-independent half of the auto-focus fix. */
  autoFocus?: boolean;
  value: string;
  registerRef: (el: HTMLElement | null) => void;
  onChange: (v: string) => void;
  onBlur: () => void;
  onEnterAdvance?: () => void;
  /** True when the vault being edited grants no write — the field still SHOWS its value (a
   * read grant is a real grant) but cannot be changed. */
  readOnly?: boolean;
  vaultId?: string;
  onOpenRef?: (id: string) => void;
}) {
  const inputCls =
    "w-full min-h-[44px] px-3 rounded-[var(--r-md)] bg-[var(--surface)] border border-[var(--line)] text-[14px] text-[var(--ink)] outline-none focus:border-[var(--focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] placeholder:text-[var(--ink-ghost)]";
  const placeholder = isName ? "Untitled" : field.placeholder;
  const asRef = !!vaultId && isEntityRefValue(value);
  const mode = useCardMode();
  const present = mode.managed && mode.presentation;
  const [wantFocus, setWantFocus] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (present || !wantFocus) return;
    elRef.current?.focus();
    setWantFocus(false);
  }, [present, wantFocus]);
  const register = (el: HTMLElement | null) => {
    elRef.current = el;
    registerRef(el);
  };
  if (present) {
    if (!value.trim() && !asRef) return null;
    return (
      <div className="flex flex-col gap-0 py-1" data-testid="field-present" data-field-slug={field.slug}>
        <span className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]">{field.label}</span>
        {asRef && vaultId ? (
          <EntityRefValue value={value} vaultId={vaultId} onOpen={onOpenRef} quiet />
        ) : mode.canEdit && !readOnly ? (
          <button
            type="button"
            className="block min-h-10 w-full break-words rounded-[var(--r-sm)] py-1.5 text-left text-[15px] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            aria-label={`Edit ${field.label}`}
            data-testid="field-present-value"
            onClick={() => {
              setWantFocus(true);
              mode.enter();
            }}
          >
            {value}
          </button>
        ) : (
          <p className="break-words text-[15px] text-[var(--ink)]" data-testid="field-present-value">{value}</p>
        )}
      </div>
    );
  }
  return (
    <label className={`flex flex-col gap-1 ${mode.managed ? "py-2" : ""}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-ghost)]">{field.label}</span>
      {asRef && vaultId && <EntityRefValue value={value} vaultId={vaultId} onOpen={onOpenRef} />}
      {asRef && readOnly ? null : field.kind === "textarea" ? (
        <textarea
          ref={register}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          readOnly={readOnly}
          placeholder={placeholder}
          rows={4}
          className={inputCls + " resize-y leading-relaxed py-2"}
        />
      ) : field.kind === "select" ? (
        <select
          ref={register}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={readOnly}
          className={inputCls}
        >
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o.charAt(0).toUpperCase() + o.slice(1)}
            </option>
          ))}
        </select>
      ) : (
        <input
          ref={register}
          autoFocus={autoFocus}
          type={field.kind === "email" ? "email" : field.kind === "url" ? "url" : field.kind === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={
            onEnterAdvance
              ? (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onEnterAdvance();
                  }
                }
              : undefined
          }
          readOnly={readOnly}
          placeholder={placeholder}
          className={inputCls}
        />
      )}
    </label>
  );
}
