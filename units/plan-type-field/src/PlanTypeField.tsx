// The "Type" group of a Plan card: ONE GilbVeda type, chosen with the shared GilbVeda search (TypeChooser) and shown as the
// chip whose click opens the term's definition. It is stored as the term URL in `a:ontologyTerm`; "No GilbVeda type" stores `none`.
// An old typed URL still shows. The old `a:concept` is never written here; the form reads it as a fallback and clears it by rule.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { TypeChooser, type TypeOption, type TypeSearchFn } from "@kaigilb/gilbplatformcode-type-chooser";
import { TypePictureButton, TypeTermPopover } from "@kaigilb/gilbplatformcode-type-term-popover";
import { CARD_ADD_ATTR } from "@kaigilb/gilbplatformcode-card-group";

export const NO_TYPE = "none";

/** Marks the field's trigger button (Change / Choose a type): where the focus returns. */
export const TYPE_TRIGGER_ATTR = "data-plan-type-trigger";

const quiet = "min-h-11 px-3 text-[14px] text-[var(--accent)]";
const chipClass =
  "inline-flex min-h-11 items-center gap-1 rounded-full border border-[var(--line)] px-3 py-0.5 text-[14px] text-[var(--accent)]";

const lastSegment = (url: string): string => {
  const parts = url.replace(/[/#]+$/, "").split(/[/#]/).filter(Boolean);
  const last = parts[parts.length - 1] ?? url;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

/** The term URL a GilbVeda type name has. */
export const termUrlOf = (typeName: string): string => `${termOrigin()}/base/t/${typeName}`;

export function PlanTypeField({
  term,
  canEdit,
  editing,
  onChoose,
  onOpenChange,
  onOpenOntology,
  search,
  blankReach,
  renderTypeIcon,
}: {
  /** `a:ontologyTerm` as stored, or the old concept's `@id` when that is the fallback. "" or "none" = no type. */
  term: string;
  canEdit: boolean;
  /** The card is in Edit: the chip carries a Change control. */
  editing: boolean;
  /** The person chose a term URL, or `none`. */
  onChoose: (term: string) => void;
  /** The picker opened or closed (the form keeps the line's source editable meanwhile). */
  onOpenChange?: (open: boolean) => void;
  /** Optional second action in each definition popover (the host's in-app Ontology section). */
  onOpenOntology?: (typeName: string) => void;
  /** The GilbVeda search the type chooser asks (passed straight to `TypeChooser`). */
  search: TypeSearchFn;
  /** What typing will reach, said before the first answer (passed straight to `TypeChooser`). */
  blankReach: string;
  /** Draws a type option's icon in the chooser (passed straight to `TypeChooser`). */
  renderTypeIcon?: (option: TypeOption, className: string) => ReactNode;
}) {
  const [picking, setPicking] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // When the picker closes (a pick, No type, Cancel, Escape) the focus goes back to the field's trigger
  // (Change / Choose a type), not to the page. A Replace question that takes the focus first keeps it; it hands it back on close.
  const wantFocus = useRef(false);
  const open = (v: boolean) => {
    if (!v) wantFocus.current = true;
    setPicking(v);
    onOpenChange?.(v);
  };
  useEffect(() => {
    if (picking || !wantFocus.current) return;
    if (document.querySelector('[data-testid="plan-type-replace-ask"]')) {
      wantFocus.current = false;
      return;
    }
    const trigger = root.current?.querySelector<HTMLElement>(`[${TYPE_TRIGGER_ATTR}]`);
    if (trigger) {
      trigger.focus();
      wantFocus.current = false;
    }
  }, [picking, term]);
  const t = term.trim();
  const has = t !== "" && t !== NO_TYPE;
  const name = has ? lastSegment(t) : "";
  const isUrl = /^https?:\/\//i.test(t);
  return (
    <div ref={root} className="flex w-full flex-col gap-1 py-2" data-testid="plan-type-field">
      {has ? (
        <div className="flex flex-wrap items-center gap-2">
          {isUrl ? (
            <TypePictureButton
              typeName={name}
              label={name}
              ariaLabel={`Type picture: ${name}`}
              px={20}
              triggerTestId="plan-type-picture"
              popoverTestId="plan-type-picture-popover"
              onOpenOntology={onOpenOntology}
            />
          ) : null}
          {isUrl ? (
            <TypeTermPopover
              typeName={name}
              label={name}
              triggerTestId="plan-type-chip"
              popoverTestId="plan-type-popover"
              ariaLabel={`Type ${name}`}
              className={chipClass}
              onOpenOntology={onOpenOntology}
            >
              {name}
            </TypeTermPopover>
          ) : (
            <span className={chipClass} data-testid="plan-type-chip">
              {t}
            </span>
          )}
          {isUrl ? (
            <TypeTermPopover
              typeName={name}
              label={name}
              triggerTestId="plan-type-about"
              popoverTestId="plan-type-about-popover"
              ariaLabel={`About type ${name}`}
              className="-ml-1 inline-flex min-h-11 min-w-11 items-center justify-center text-[12px] text-[var(--accent)]"
              onOpenOntology={onOpenOntology}
            >
              ↗
            </TypeTermPopover>
          ) : null}
          {canEdit && !picking ? (
            <button type="button" className={quiet} aria-label="Edit Type" {...{ [TYPE_TRIGGER_ATTR]: "" }} onClick={() => open(true)}>
              Change
            </button>
          ) : null}
        </div>
      ) : t === NO_TYPE && !picking ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] text-[var(--ink-soft)]">No GilbVeda type</span>
          {canEdit ? (
            <button type="button" className={quiet} aria-label="Edit Type" {...{ [TYPE_TRIGGER_ATTR]: "" }} onClick={() => open(true)}>
              Change
            </button>
          ) : null}
        </div>
      ) : canEdit && editing && !picking ? (
        <button type="button" className={`${quiet} self-start`} {...{ [CARD_ADD_ATTR]: "", [TYPE_TRIGGER_ATTR]: "" }} onClick={() => open(true)}>
          Choose a type
        </button>
      ) : null}
      {picking ? (
        <div
          data-testid="plan-type-picker"
          className="w-full"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              open(false);
            }
          }}
        >
          <TypeChooser
            label="Type"
            idPrefix="plan-type"
            autoFocus
            showSpecHint={false}
            planes={["all"]}
            searchPlaceholder="Search GilbVeda types…"
            search={search}
            blankReach={blankReach}
            renderTypeIcon={renderTypeIcon}
            onPick={(o) => {
              open(false);
              onChoose(termUrlOf(o.typeName));
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={quiet}
              onClick={() => {
                open(false);
                onChoose(NO_TYPE);
              }}
            >
              No GilbVeda type
            </button>
            <button type="button" className={quiet} onClick={() => open(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
