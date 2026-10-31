// The fields of a stakeholder kind's set that the card's own edit path does NOT write: each is shown with its stored value, and either
// says why it is not offered for edit, or (a reference the checked write of `holder-reference` writes) offers an add that goes ONLY
// through `addReference`, naming the vault that holds the record.
// ⛔ No field is named here: every field, label and rule comes from the session reading.
//
// A link field is a PICKER, in the look of a search-and-pick: type a name, choose a record of the carrier's vault, and it is added
// through the SAME checked write. What may be chosen is the rule of `card-references` (`linkTargets`: the reference rules and the
// reference reading, ⛔ no kind typed here); the checked write checks the choice again and refuses anything else with
// nothing sent. A preferred channel (`contact-term`) is ⛔ not a record: the choices are the record's own
// contact fields that hold a value. Chosen links are shown by name (`EntityRefValue`), each with a remove control.
// Only the carrier's own vault is searched: the checked write admits no target in any other vault, a held
// one included.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CardGroup, CardIcon, type CardIconName } from "@kaigilb/gilbplatformcode-card-group";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import {
  admittedTargetNames,
  channelChoices,
  channelLabelOf,
  findLinkTargets,
  matchingTargets,
  relationCopyOf,
  useAddCardReference,
  useRemoveCardReference,
  type CardReferencesHost,
} from "@kaigilb/gilbplatformcode-card-references";
import { EntityRefValue, isEntityRefValue } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { RecordFacts } from "@kaigilb/gilbplatformcode-lws-records";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { storedValuesOf, termName, type CardField } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import { referenceReadingQuery } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import type { KindFieldSet, StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { useStakeholderSetFieldsHost } from "./setFieldsHost";

/** A preferred channel is not a relation to another record: it is a contact preference (the master's `contact-term` rule). */
export const isChannelField = (f: { rule?: string | null }) => f.rule === "contact-term";

/** The group kind of a set field: what the chooser and the card's sections know it by. */
export function setFieldKind(f: CardField): string {
  return `${isChannelField(f) ? "channel" : "relation"}-${termName(f.term) ?? "field"}`;
}

/** Whether a set field has anything for presentation to show: a stored value, or a stated reason it is shown and not edited. */
export function setFieldHasContent(f: CardField & { shownBecause: string | null }, facts: RecordFacts): boolean {
  return storedValuesOf(f, facts).length > 0;
}

/**
 * The remaining fields of the kind's set, each as its own framed group. `only` draws the relations (links to other
 * records: Represents, Member of, …) or the contact preferences (the preferred channel) alone, so the card can set each under its own heading.
 */
export function StakeholderSetFields({
  fields,
  facts,
  fieldSets,
  canEdit,
  holdingVault,
  agent,
  carrier,
  vaultId,
  onOpenRef,
  recordId,
  carrierKind,
  only,
}: {
  fields: readonly (CardField & { shownBecause: string | null })[];
  facts: RecordFacts;
  fieldSets: StakeholderFieldSets;
  /** The card may write at all (vault grant, write guard, and the field set known). */
  canEdit: boolean;
  /** The vault that holds this record, as the merged list attributes it; null = not known yet. */
  holdingVault: string | null;
  agent: string | null;
  carrier: string | null;
  vaultId: string;
  /** Opens the record a value names. Since 0.1.1 the second argument is the value itself (the record's full address), so the host can name the vault. */
  onOpenRef?: (id: string, uri?: string) => void;
  /** The record's id, for a link's remove (the record's own one-key write). */
  recordId?: string;
  /** The carrier's kind as the master's field sets read it (the picker's rule input). */
  carrierKind?: KindFieldSet | null;
  only?: "relations" | "preferences";
}) {
  const shown = fields.filter((f) => (only === "preferences" ? isChannelField(f) : only === "relations" ? !isChannelField(f) : true));
  if (shown.length === 0) return null;
  return (
    <div aria-label="More fields of this kind" role="group" className="contents" data-testid="stakeholder-set-fields">
      {shown.map((f) => (
        <SetField
          key={f.term}
          field={f}
          values={storedValuesOf(f, facts)}
          facts={facts}
          fieldSets={fieldSets}
          canEdit={canEdit}
          holdingVault={holdingVault}
          agent={agent}
          carrier={carrier}
          vaultId={vaultId}
          onOpenRef={onOpenRef}
          recordId={recordId ?? null}
          carrierKind={carrierKind ?? null}
        />
      ))}
    </div>
  );
}

export function SetField({
  field,
  values,
  facts,
  fieldSets,
  canEdit,
  holdingVault,
  agent,
  carrier,
  vaultId,
  onOpenRef,
  recordId,
  carrierKind,
}: {
  field: CardField & { shownBecause: string | null };
  values: string[];
  facts: RecordFacts;
  fieldSets: StakeholderFieldSets;
  canEdit: boolean;
  holdingVault: string | null;
  agent: string | null;
  carrier: string | null;
  vaultId: string;
  /** Opens the record a value names. Since 0.1.1 the second argument is the value itself (the record's full address), so the host can name the vault. */
  onOpenRef?: (id: string, uri?: string) => void;
  recordId: string | null;
  carrierKind: KindFieldSet | null;
}) {
  const host = useStakeholderSetFieldsHost();
  if (!host.changeRecordFactItems) recordId = null;
  const addRef = useAddCardReference(fieldSets);
  const removeRef = useRemoveCardReference(host as CardReferencesHost);
  const [answer, setAnswer] = useState<{ ok: boolean; text: string } | null>(null);
  const name = field.label ?? field.slug ?? field.writeKey ?? field.term;
  const canAdd = field.mode === "reference-add" && canEdit && !!holdingVault && !!agent && !!carrier;
  // Why the add is not offered, when the field is one the package writes. Stated, ⛔ never silent.
  const addWithheld =
    field.mode !== "reference-add" || !canEdit
      ? null
      : !holdingVault
        ? "Which vault holds this record is not known yet, so no reference is written. Open the record from Stakeholders."
        : !carrier
          ? "This record has no address yet, so no reference is written."
          : !agent
            ? "Not signed in, so no reference is written."
            : null;
  const isChannel = field.rule === "contact-term";

  const add = async (target: string) => {
    if (!canAdd) return;
    setAnswer(null);
    try {
      await addRef.mutateAsync({ vaultId: holdingVault!, agent: agent!, carrier: carrier!, field, target });
      setAnswer({ ok: true, text: "Added." });
    } catch (err) {
      setAnswer({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  };
  const remove = async (target: string) => {
    if (!canAdd || !recordId) return;
    setAnswer(null);
    try {
      await removeRef.mutateAsync({ recordId, carrier, factKeys: field.factKeys, target, label: name });
      setAnswer({ ok: true, text: "Removed." });
    } catch (err) {
      setAnswer({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  };
  const busy = addRef.isPending || removeRef.isPending;

  // Presentation reads the stored values and hides everything that edits; a field with nothing stored is not drawn.
  const mode = useCardMode();
  const present = mode.managed && mode.presentation;
  // An "Added." / "Removed." answer belongs to the edit that made it: it is gone once the card is back in presentation.
  useEffect(() => {
    if (present) setAnswer(null);
  }, [present]);
  const tname = termName(field.term);
  const copy = relationCopyOf(tname);
  const title = isChannel ? name : (copy?.label ?? name);
  const icon: CardIconName = isChannel ? "channel" : (copy?.icon ?? "relation");
  const channelName = (v: string) => (isChannel && carrierKind ? channelLabelOf(carrierKind, v) : null);

  return (
    <CardGroup
      kind={setFieldKind(field)}
      addable={canAdd}
      label={title}
      testId="stakeholder-set-field"
      dataAttrs={{ "data-field-term": field.term, "data-field-mode": field.mode }}
      title={title}
      icon={icon}
      helper={isChannel ? "Which of this record's contact values to try first." : copy?.helper}
      empty={values.length === 0}
    >
      {values.length === 0 ? (
        <span className="py-2 text-[13px] text-[var(--ink-faint)]" data-testid="stakeholder-set-none">
          {isChannel ? "None chosen yet." : "None yet."}
        </span>
      ) : isChannel ? (
        // The chosen channel is a selected chip; while editing it carries its (−), and the other contact values are chips to pick.
        <div className="flex flex-wrap items-center gap-2 py-2" data-testid="stakeholder-channel-selected">
          {values.map((v) => (
            <span key={v} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-3 text-[14px] text-[var(--ink)]" data-testid="stakeholder-link" data-chip="selected">
              {canAdd && !present && recordId ? (
                <RemoveControl testId="stakeholder-link-remove" label={`Remove from ${name}`} disabled={busy} onClick={() => void remove(v)} />
              ) : null}
              {channelName(v) ?? (isEntityRefValue(v) ? v : v)}
            </span>
          ))}
        </div>
      ) : (
        values.map((v) => (
          <div key={v} className="flex items-center gap-2.5 py-2" data-testid="stakeholder-link">
            {/* The delete control is at the LEFT of the row, in front of the link it removes (edit mode only). */}
            {canAdd && !present && recordId && (
              <RemoveControl testId="stakeholder-link-remove" label={`Remove from ${title}`} disabled={busy} onClick={() => void remove(v)} />
            )}
            <CardIcon name={icon} className="shrink-0 text-[16px] text-[var(--ink-faint)]" />
            <div className="min-w-0 flex-1">
              {isEntityRefValue(v) ? (
                <EntityRefValue value={v} vaultId={vaultId} onOpen={onOpenRef ? (id) => onOpenRef(id, v) : undefined} quiet={present} />
              ) : (
                <span className="text-[14px] text-[var(--ink)] break-words">{v}</span>
              )}
            </div>
          </div>
        ))
      )}
      {!present && field.mode === "shown" && field.shownBecause && (
        <span className="py-2 text-[11.5px] text-[var(--ink-faint)]" data-testid="stakeholder-field-not-editable">
          Not edited on this card: {field.shownBecause}.
        </span>
      )}
      {!present && addWithheld && (
        <span className="py-2 text-[11.5px] text-[var(--ink-faint)]" data-testid="stakeholder-reference-withheld">
          {addWithheld}
        </span>
      )}
      {!present && canAdd &&
        (isChannel ? (
          <ChannelPicker fieldSets={fieldSets} carrierKind={carrierKind} facts={facts} stored={values} busy={busy} onChoose={(t) => void add(t)} />
        ) : (
          <div className="py-2">
            <RecordLinkPicker
              name={title}
              field={field}
              fieldSets={fieldSets}
              carrierKind={carrierKind}
              vault={holdingVault!}
              carrier={carrier!}
              stored={values}
              busy={busy}
              onChoose={(t) => void add(t)}
            />
          </div>
        ))}
      {answer && !present && (
        <span
          role={answer.ok ? "status" : "alert"}
          className={`py-1 text-[12px] ${answer.ok ? "text-[var(--ink-faint)]" : "text-[var(--warn)]"}`}
          data-testid="stakeholder-reference-answer"
        >
          {answer.text}
        </span>
      )}
    </CardGroup>
  );
}

/** A record link's picker: type; the matches listed; tap one. */
function RecordLinkPicker({
  name,
  field,
  fieldSets,
  carrierKind,
  vault,
  carrier,
  stored,
  busy,
  onChoose,
}: {
  name: string;
  field: CardField;
  fieldSets: StakeholderFieldSets;
  carrierKind: KindFieldSet | null;
  vault: string;
  carrier: string;
  stored: readonly string[];
  busy: boolean;
  onChoose: (target: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const references = useQuery({ ...referenceReadingQuery(fieldSets), enabled: open });
  const admitted = useMemo(
    () => (references.data && field.rule && carrierKind ? admittedTargetNames(references.data, field.rule, carrierKind.name) : null),
    [references.data, field.rule, carrierKind],
  );
  // One walk of the vault's typed list per vault and rule, shared by every card for a minute.
  const targets = useQuery({
    queryKey: ["gilb-stakeholders", "link-targets", vault, field.rule ?? "", carrierKind?.name ?? "", (admitted ?? []).join(",")],
    queryFn: () => findLinkTargets(fieldSets, vault, admitted!),
    enabled: open && !!admitted,
    staleTime: 60_000,
  });
  const hits = matchingTargets(targets.data?.candidates ?? [], draft).filter((c) => c.record !== carrier && !stored.includes(c.record));
  const failed = references.error ?? targets.error;
  const reading = open && !failed && (references.isPending || targets.isPending);

  return (
    <div className="flex flex-col gap-2" data-testid="stakeholder-link-picker">
      <input
        aria-label={`Add to ${name}: find a record in this vault by name`}
        value={draft}
        placeholder={`Add to ${name}: find a record by name`}
        autoComplete="off"
        disabled={busy}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setOpen(true);
          setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft("");
            setOpen(false);
          }
        }}
        className="min-h-[44px] w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      />
      {reading ? <p className="text-xs text-[var(--ink-faint)]">Searching this vault…</p> : null}
      {open && failed ? (
        <p className="text-xs text-[var(--bad)]" role="alert">
          Could not list this vault's records ({failed instanceof Error ? failed.message : String(failed)}). That is not a statement that the
          record does not exist.
        </p>
      ) : null}
      {open && hits.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="stakeholder-link-hits">
          {hits.slice(0, 20).map((c) => (
            <li key={c.record}>
              <button
                type="button"
                className="min-h-11 w-full rounded-md border border-[var(--line)] px-2 text-left text-sm text-[var(--ink)] disabled:opacity-50"
                disabled={busy}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  setDraft("");
                  setOpen(false);
                  onChoose(c.record);
                }}
              >
                {c.label ?? c.record}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && targets.data && hits.length === 0 ? (
        <p className="text-xs text-[var(--ink-faint)]" data-testid="stakeholder-link-none">
          {draft.trim()
            ? `No record named “${draft.trim()}” in this vault that ${name} may point at.`
            : `No record in this vault that ${name} may point at.`}
          {targets.data.complete ? "" : " The vault's list was not read to its end, so this is not the whole answer."}
        </p>
      ) : null}
    </div>
  );
}

/** A preferred channel's picker: the record's own contact fields that hold a value. */
function ChannelPicker({
  fieldSets,
  carrierKind,
  facts,
  stored,
  busy,
  onChoose,
}: {
  fieldSets: StakeholderFieldSets;
  carrierKind: KindFieldSet | null;
  facts: RecordFacts;
  stored: readonly string[];
  busy: boolean;
  onChoose: (target: string) => void;
}) {
  const references = useQuery(referenceReadingQuery(fieldSets));
  if (references.error)
    return (
      <p className="text-xs text-[var(--bad)]" role="alert">
        The contact kinds could not be read ({references.error instanceof Error ? references.error.message : String(references.error)}).
      </p>
    );
  if (!references.data || !carrierKind) return <p className="text-xs text-[var(--ink-faint)]">Reading the contact kinds…</p>;
  const choices = channelChoices(references.data, carrierKind, facts as Record<string, unknown>).filter((c) => !stored.includes(c.target));
  if (choices.length === 0)
    return (
      <p className="text-xs text-[var(--ink-faint)]" data-testid="stakeholder-channel-none">
        This record holds no other contact value to choose as its channel.
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 py-2" data-testid="stakeholder-channel-choices">
      <span className="text-[12px] text-[var(--ink-faint)]">Choose:</span>
      {choices.map((c) => (
        <button
          key={c.target}
          type="button"
          disabled={busy}
          data-chip="choice"
          className="min-h-10 rounded-full border border-dashed border-[var(--ink-faint)] px-3 text-sm text-[var(--ink)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          onClick={() => onChoose(c.target)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
