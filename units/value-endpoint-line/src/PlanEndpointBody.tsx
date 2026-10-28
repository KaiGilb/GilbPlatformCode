// The Endpoint line of a Value card: the Subject and the Reference, each a type from the ontology and some words. Every change goes up whole through onChange.

import { useState } from "react";
import { planSourceEmpty } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { TypeChooser, type TypeOption } from "@kaigilb/gilbplatformcode-type-chooser";
import { TypePictureButton, TypeTermPopover } from "@kaigilb/gilbplatformcode-type-term-popover";
import { carryRaw, type EndpointPart } from "@kaigilb/gilbplatformcode-value-card-model";
import { chip, clickable, CommitText, hint, inPlace, own, quiet, Src, TextPiece, useValueLinesHost, type ValueLineProps, ViewSrc } from "@kaigilb/gilbplatformcode-value-line-kit";

const typeNameOf = (iri: string) => iri.replace(/[/#]+$/, "").split(/[/#]/).pop() ?? "";

const partEmpty = (part: EndpointPart) => !part.typeIri && !part.words.trim();

/** The chosen type as a chip; a click shows its definition, a new-tab link to GilbVeda, and the Ontology section. */
function TypeChip({ part }: { part: EndpointPart }) {
  const { openOntologyConcept } = useValueLinesHost();
  const name = typeNameOf(part.typeIri);
  return (
    <TypeTermPopover
      typeName={name}
      label={part.typeLabel}
      triggerTestId="plan-endpoint-type-chip"
      popoverTestId="plan-endpoint-type-popover"
      ariaLabel={`Type ${part.typeLabel || name}`}
      className={`${chip} text-[var(--accent)]`}
      onOpenOntology={(n) => openOntologyConcept?.(n)}
    >
      {part.typeLabel || name}
    </TypeTermPopover>
  );
}

/** The type's GilbVeda picture at 20 px before its label; a click opens the same popover. No picture: nothing, and no space. */
function PartPicture({ label, part }: { label: "Subject" | "Reference"; part: EndpointPart }) {
  const { openOntologyConcept } = useValueLinesHost();
  if (!part.typeIri) return null;
  const name = typeNameOf(part.typeIri);
  return (
    <TypePictureButton
      typeName={name}
      label={part.typeLabel || name}
      ariaLabel={`${label} type: ${part.typeLabel || name}`}
      px={20}
      triggerTestId={`plan-endpoint-picture-${label.toLowerCase()}`}
      popoverTestId="plan-endpoint-type-popover"
      onOpenOntology={(n) => openOntologyConcept?.(n)}
    />
  );
}

/** The shared type search, picking a type for one endpoint part. Escape cancels. */
function PartPicker({
  label,
  onPick,
  onCancel,
  onNone,
}: {
  label: string;
  onPick: (part: Pick<EndpointPart, "typeIri" | "typeLabel">) => void;
  onCancel?: () => void;
  onNone?: () => void;
}) {
  const { searchTypes, blankReach, renderTypeIcon } = useValueLinesHost();
  return (
    <div
      data-testid={`plan-endpoint-picker-${label.toLowerCase()}`}
      className="w-full"
      onKeyDown={(e) => {
        if (e.key === "Escape" && onCancel) {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <TypeChooser
        label={`${label} type`}
        idPrefix={`plan-endpoint-${label.toLowerCase()}`}
        autoFocus
        showSpecHint={false}
        search={searchTypes}
        blankReach={blankReach}
        renderTypeIcon={renderTypeIcon}
        onPick={(o) =>
          onPick({ typeIri: `${termOrigin()}/base/t/${o.typeName}`, typeLabel: o.label })
        }
      />
      {onNone ? (
        <button type="button" className={quiet} onClick={onNone}>
          No reference
        </button>
      ) : null}
    </div>
  );
}

/** "Subject = X, reference = Y" → X and Y, or null when the old text is not in that shape. */
export function parseEndpointText(text: string): { subject: string; reference: string } | null {
  const m = /^\s*subject\s*[=:]\s*(.+?)\s*[,;·]\s*reference\s*[=:]\s*(.+?)\s*$/i.exec(text);
  return m ? { subject: m[1], reference: m[2] } : null;
}

/** One click finds a type for each old word; the person confirms before anything is written. */
function FindTypes({ text, onUse }: { text: string; onUse: (subject: EndpointPart, reference: EndpointPart) => void }) {
  const { searchTypes } = useValueLinesHost();
  const parsed = parseEndpointText(text);
  const [found, setFound] = useState<{ subject: TypeOption | null; reference: TypeOption | null } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!parsed) return null;
  const run = async () => {
    setBusy(true);
    try {
      const [a, b] = await Promise.all([searchTypes(parsed.subject), searchTypes(parsed.reference)]);
      setFound({ subject: a.options[0] ?? null, reference: b.options[0] ?? null });
    } catch {
      setFound({ subject: null, reference: null });
    }
    setBusy(false);
  };
  const part = (o: TypeOption | null, words: string): EndpointPart =>
    o ? { typeIri: `${termOrigin()}/base/t/${o.typeName}`, typeLabel: o.label, words } : { typeIri: "", typeLabel: "", words };
  if (!found) {
    return (
      <button type="button" className={quiet} disabled={busy} onClick={() => void run()}>
        Find types for '{parsed.subject}' and '{parsed.reference}'
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]" data-testid="plan-endpoint-found">
      <span>
        Subject: {found.subject?.label ?? "no type found"} · Reference: {found.reference?.label ?? "no type found"}
      </span>
      {found.subject || found.reference ? (
        <button
          type="button"
          className={quiet}
          onClick={() => onUse(part(found.subject, parsed.subject), part(found.reference, parsed.reference))}
        >
          Use these types
        </button>
      ) : null}
      <button type="button" className={quiet} onClick={() => setFound(null)}>
        Dismiss
      </button>
    </div>
  );
}

/** One part: label, type chip (or picker), free words. `view` makes the pieces click-to-change. */
function EndpointPartLine({
  label,
  part,
  on,
  editing,
  allowNone,
  onChange,
}: {
  label: "Subject" | "Reference";
  part: EndpointPart;
  on: boolean;
  editing: boolean;
  allowNone?: boolean;
  onChange: (next: EndpointPart) => void;
}) {
  const [picking, setPicking] = useState(false);
  const pick = (t: Pick<EndpointPart, "typeIri" | "typeLabel">) => {
    setPicking(false);
    onChange({ ...part, ...t });
  };
  const chipFace = part.typeIri ? <TypeChip part={part} /> : hint(`Add ${label.toLowerCase()} type`);
  if (editing) {
    return (
      <div className="flex w-full flex-col gap-1" data-testid={`plan-endpoint-${label.toLowerCase()}`}>
        <span className="text-[13px] text-[var(--ink-soft)]">{label}</span>
        {part.typeIri ? (
          <span className="flex items-center gap-2">
            <PartPicture label={label} part={part} />
            <TypeChip part={part} />
            <button type="button" className={quiet} onClick={() => setPicking(true)}>
              Change type
            </button>
          </span>
        ) : null}
        {!part.typeIri || picking ? (
          <PartPicker label={label} onPick={pick} onCancel={part.typeIri ? () => setPicking(false) : undefined} />
        ) : null}
        <CommitText
          label={`${label} words`}
          value={part.words}
          placeholder="mobile app"
          onCommit={(words) => onChange({ ...part, words })}
        />
        {allowNone && !partEmpty(part) ? (
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={false} onChange={() => onChange({ typeIri: "", typeLabel: "", words: "" })} />
            No reference
          </label>
        ) : null}
      </div>
    );
  }
  return (
    <span data-testid={`plan-endpoint-${label.toLowerCase()}`} className="inline-flex flex-wrap items-center gap-1">
      <span>{label} =</span>
      {picking ? (
        <PartPicker
          label={label}
          onPick={pick}
          onCancel={() => setPicking(false)}
          onNone={allowNone ? () => { setPicking(false); onChange({ typeIri: "", typeLabel: "", words: "" }); } : undefined}
        />
      ) : on ? (
        <>
          <PartPicture label={label} part={part} />
          <button type="button" aria-label={`Edit ${label} type`} className={clickable} onClick={() => setPicking(true)}>
            {part.typeIri ? part.typeLabel || typeNameOf(part.typeIri) : chipFace}
          </button>
          {part.typeIri ? (
            <TypeTermPopover
              typeName={typeNameOf(part.typeIri)}
              label={part.typeLabel}
              popoverTestId="plan-endpoint-type-popover"
              ariaLabel={`About type ${part.typeLabel || typeNameOf(part.typeIri)}`}
              className="text-[12px] text-[var(--accent)]"
            >
              ↗
            </TypeTermPopover>
          ) : null}
        </>
      ) : part.typeIri ? (
        <>
          <PartPicture label={label} part={part} />
          {chipFace}
        </>
      ) : (
        hint("none")
      )}
      {part.words.trim() || on ? (
        <span>
          (
          <TextPiece on={on} wide label={`${label} words`} value={part.words} empty="words" onCommit={(words) => onChange({ ...part, words })} />)
        </span>
      ) : null}
    </span>
  );
}

export function PlanEndpointBody(p: ValueLineProps) {
  const { data, editing, onChange } = p;
  const e = data.endpoint;
  const put = (partial: Partial<typeof e>, stamp = true) => {
    const next = carryRaw({ ...e, ...partial }, e);
    if (stamp) next.source = own(next.source, p.selfId);
    onChange({ ...data, endpoint: next });
  };
  const on = inPlace(p);
  const legacy = partEmpty(e.subject) && partEmpty(e.reference) && e.text.trim() ? e.text.trim() : "";
  const finder = legacy && (on || editing) ? (
    <FindTypes
      text={legacy}
      onUse={(subject, reference) => put({ subject, reference })}
    />
  ) : null;
  const legacyLine = legacy ? (
    <p className="text-[14px] text-[var(--ink-faint,var(--ink-soft))]" data-testid="plan-endpoint-legacy">
      {legacy}
    </p>
  ) : null;
  if (!editing) {
    const showParts = (!legacy && !(partEmpty(e.subject) && partEmpty(e.reference))) || on;
    return (
      <div className="flex w-full flex-col gap-1">
        {showParts ? (
          <p className="text-[14px] text-[var(--ink)]">
            <EndpointPartLine label="Subject" part={e.subject} on={on} editing={false} onChange={(subject) => put({ subject })} />
            <span> · </span>
            <EndpointPartLine label="Reference" part={e.reference} on={on} editing={false} allowNone onChange={(reference) => put({ reference })} />
          </p>
        ) : null}
        {legacyLine}
        {finder}
        {planSourceEmpty(e.source) && !on ? null : (
          <ViewSrc p={p} value={e.source} label="Endpoint source" onCommit={(source) => put({ source }, false)} />
        )}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2">
      <EndpointPartLine label="Subject" part={e.subject} on={false} editing onChange={(subject) => put({ subject })} />
      <EndpointPartLine label="Reference" part={e.reference} on={false} editing allowNone onChange={(reference) => put({ reference })} />
      {legacyLine}
      {finder}
      <Src p={p} value={e.source} label="Endpoint source" onCommit={(source) => put({ source }, false)} />
    </div>
  );
}
