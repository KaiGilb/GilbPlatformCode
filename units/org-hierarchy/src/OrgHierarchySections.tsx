/**
 * The organization card's HIERARCHY ("address hierarchy from headquarters, to subs"):
 *   "Part of": the chain from this organization UP to the head office (one parent each), a link per level;
 *   "Units": the units directly below it, each with name, logo and employee count where visible; a unit opens its own card.
 * Setting the parent writes to THIS (the child's) record only; the parent is never written. The writer refuses a loop
 * (`checkParentWrite`), and the reader walks with a visited set and a depth cap, showing "not visible" and "loop" states
 * (`walkUp`). Seeing the units is a read of "who points here" and widens nobody's rung (`orgUnits.ts`).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CardGroup } from "@kaigilb/gilbplatformcode-card-group";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { OrgMark } from "@kaigilb/gilbplatformcode-org-mark";
import { OrgRecordPicker } from "@kaigilb/gilbplatformcode-record-picker";
import { OrgShortList, INLINE_EMPLOYEES, groupCountText, type ListLabels } from "@kaigilb/gilbplatformcode-org-employees";
import { resolveOrgTerms } from "@kaigilb/gilbplatformcode-org-terms";
import { patchRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import { useOrgUnits } from "./useOrgUnits";
import { ORG_DEPTH_CAP, checkParentWrite, walkUp } from "./orgHierarchy";
import { findOrganizationRecords, organizationParentReader } from "./orgRecords";
import { readUnitEmployments, type OrgUnit } from "./orgUnits";

/** The focus ring of a card row that opens a record (exported for the person card's "other cards" rows). */
export const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

/** The words for the end of a chain that did not reach a head office. */
export function chainEndText(end: "head" | "reading" | "not-visible" | "loop" | "too-deep"): string | null {
  if (end === "not-visible") return "Not visible: you may not read the next level up.";
  if (end === "loop") return "Loop: this chain comes back to an organization already in it, so it is not followed further.";
  if (end === "too-deep") return `Stopped: the chain is longer than ${ORG_DEPTH_CAP} levels.`;
  return null;
}

/** The sentence when the write made a loop with another session's write and was taken back. */
export const PARENT_RACE_TEXT = "That would make a loop with another change made at the same moment, so the parent was put back as it was. Choose again.";

/**
 * Write the one parent on THIS record, after the writer's own loop check. Resolves null on success, the sentence on a refusal.
 * The platform has no compare-and-set, so two sessions can each pass the check and then both write (A under B, B under A). After
 * the write the chain is read again from this record; when it now loops, THIS write is taken back (the old parent is written
 * again) and the sentence says so. Of two such writes the later one always sees the earlier, so a loop cannot stay.
 */
export async function setParentOrganization(args: {
  record: { id: string; entityUri: string };
  parent: string | null;
  /** The parent the record held before this write (what is put back), or null. */
  previous?: string | null;
  read?: ReturnType<typeof organizationParentReader>;
  patch?: typeof patchRecord;
}): Promise<string | null> {
  const read = args.read ?? organizationParentReader();
  const check = await checkParentWrite(args.record.entityUri, args.parent, read);
  if (!check.ok) return check.message;
  const terms = await resolveOrgTerms();
  const patch = args.patch ?? patchRecord;
  // The child's side only; a scalar, ⛔ never an array.
  await patch(args.record.id, { [terms.parentOrganization]: args.parent === null ? null : { "@id": args.parent } }, args.record.entityUri);
  if (args.parent === null) return null;
  const after = await walkUp(args.record.entityUri, read);
  if (after.end === "loop") {
    const back = args.previous ? { "@id": args.previous } : null;
    await patch(args.record.id, { [terms.parentOrganization]: back }, args.record.entityUri);
    return PARENT_RACE_TEXT;
  }
  return null;
}

export function OrgPartOfSection({
  record,
  vaultId,
  parentRef,
  canEdit,
  onOpen,
  onSaved,
}: {
  record: { id: string; entityUri: string };
  vaultId: string;
  /** The parent address the record holds (its `a:parentOrganization`), or "". */
  parentRef: string;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onSaved: () => void;
}) {
  const mode = useCardMode();
  const present = mode.managed && mode.presentation;
  const editMode = canEdit && !present;
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const up = useQuery({
    queryKey: ["mynet", "org-chain", record.entityUri, parentRef] as const,
    queryFn: () => walkUp(record.entityUri, organizationParentReader()),
    // A record with no parent is a head office: there is nothing to walk, and nothing to read.
    enabled: !!parentRef,
    staleTime: 15_000,
    retry: false,
  });
  const chain = parentRef ? (up.data?.chain ?? []) : [];
  const end = !parentRef ? "head" : (up.data?.end ?? "reading");
  const act = async (parent: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const refusal = await setParentOrganization({ record, parent, previous: parentRef || null });
      if (refusal) {
        setError(refusal);
        return;
      }
      setPicking(false);
      void qc.invalidateQueries({ queryKey: ["mynet", "org-chain"] });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <CardGroup
      kind="relation-parentOrganization"
      testId="org-partof-section"
      title="Part of"
      label="Part of"
      icon="relation"
      helper={editMode ? "The organization this one belongs to, up to the head office." : undefined}
      empty={!parentRef}
    >
      {up.isError ? (
        <p role="alert" className="py-1 text-[12.5px] text-[var(--bad)]">
          The chain could not be read. That is not a statement that there is no parent.
        </p>
      ) : (
        <ol className="flex flex-col" data-testid="org-chain" data-end={end}>
          {chain.map((n, i) => (
            <li key={n.uri} className="flex items-center gap-2 py-1.5" data-testid="org-chain-node" data-level={i + 1}>
              {i === 0 && editMode ? <RemoveControl label={`Remove parent ${n.label ?? ""}`.trim()} disabled={busy} onClick={() => void act(null)} /> : null}
              <span aria-hidden className="text-[var(--ink-faint)]">↑</span>
              {n.visible ? (
                <button type="button" className={`min-h-9 text-left text-[15px] text-[var(--ink)] hover:text-[var(--accent)] ${FOCUS}`} data-testid="org-chain-link" onClick={() => onOpen(idFromResourceUri(n.uri))}>
                  {n.label ?? "(no name)"}
                </button>
              ) : (
                <span className="text-[15px] text-[var(--ink-faint)]" data-testid="org-chain-hidden">
                  Not visible
                </span>
              )}
              {i === chain.length - 1 && end === "head" ? <span className="text-[12px] text-[var(--ink-faint)]">head office</span> : null}
            </li>
          ))}
          {chainEndText(end) ? (
            <li className="py-1 text-[12.5px] text-[var(--ink-faint)]" data-testid="org-chain-end">
              {chainEndText(end)}
            </li>
          ) : null}
        </ol>
      )}
      {error ? (
        <p role="alert" className="py-1 text-[12.5px] text-[var(--bad)]" data-testid="org-partof-error">
          {error}
        </p>
      ) : null}
      {editMode && !picking && !parentRef ? (
        <button type="button" className={`min-h-11 w-full py-2 text-left text-[15px] text-[var(--accent)] ${FOCUS}`} data-testid="org-partof-add" data-card-add="" onClick={() => setPicking(true)}>
          Set the parent organization
        </button>
      ) : null}
      {editMode && !picking && parentRef ? (
        <button type="button" className={`min-h-10 w-full py-1 text-left text-[13px] text-[var(--ink-soft)] underline ${FOCUS}`} data-testid="org-partof-change" onClick={() => setPicking(true)}>
          Change the parent organization
        </button>
      ) : null}
      {editMode && picking ? (
        <OrgRecordPicker
          vaultId={vaultId}
          exclude={[record.entityUri]}
          label="Parent organization"
          find={(text) => findOrganizationRecords(vaultId, text)}
          onCancel={() => setPicking(false)}
          onPick={(hit) => void act(hit.uri)}
        />
      ) : null}
    </CardGroup>
  );
}

/** The words and test ids of the Units group (the short list and its sheet are `OrgShortList`, shared with Employees). */
const UNITS_LABELS: ListLabels = {
  kind: "units",
  title: "Units",
  noun: "units",
  searchLabel: "Search units",
  truncated: "None of the units read so far could be shown to you. There are more; Show all reads the next ones.",
  none: "None of the units could be shown to you.",
  leftOut: null,
};

/**
 * One unit: its mark, its name and, on the CARD only, its employment count, read lazily for this row alone (`readUnitEmployments`, two finds). The rows of
 * the sheet carry no count: a count is read for the ten rows of the card and for no other row. A count that could not be read is not shown (never 0).
 */
function UnitRow({ u, vaultId, counted, onOpen }: { u: OrgUnit; vaultId: string; counted: boolean; onOpen: (id: string) => void }) {
  const count = useQuery({
    queryKey: ["mynet", "org-unit-employments", vaultId, u.uri] as const,
    queryFn: () => readUnitEmployments(u.uri, vaultId),
    enabled: counted,
    staleTime: 30_000,
    retry: false,
  });
  const employees = counted ? (count.data ?? null) : null; // the sheet's rows show none, even for a count the card already holds
  return (
    <button type="button" className={`flex min-h-12 w-full items-center gap-3 py-2 text-left ${FOCUS}`} data-testid="org-unit" onClick={() => onOpen(u.id)}>
      <OrgMark logo={u.logo} vaultId={vaultId} name={u.name ?? ""} size={36} />
      <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--ink)]" data-testid="org-unit-name">
        {u.name ?? "(no name)"}
      </span>
      {employees !== null ? (
        <span className="shrink-0 text-[12.5px] text-[var(--ink-soft)]" data-testid="org-unit-count">
          {employees} {employees === 1 ? "employment" : "employments"}
        </span>
      ) : null}
    </button>
  );
}

export function OrgUnitsSection({ orgUri, vaultId, onOpen }: { orgUri: string; vaultId: string; onOpen: (id: string) => void }) {
  const read = useOrgUnits(orgUri, vaultId);
  const { q, units, shown, count } = read;
  // The card draws at most 10 rows, so its count is of the rows it draws (the sheet's count, `count`, is of everything loaded).
  const cardCount = groupCountText({ shown: Math.min(units.length, INLINE_EMPLOYEES), loaded: units.length, hasMore: read.hasMore, total: read.total, noun: "units" });
  // A unit's count is read for the first ten units LOADED and for no other, whatever a search then brings into the card's rows: typing makes no request.
  const countedIds = new Set(units.slice(0, INLINE_EMPLOYEES).map((u) => u.id));
  return (
    <CardGroup
      kind="units"
      testId="org-units-section"
      title="Units"
      icon="employment"
      addable={false}
      helper={units.length > 0 ? "Organizations that are directly part of this one." : undefined}
      aside={shown ? <span className="text-[12.5px] text-[var(--ink-soft)]" data-testid="org-units-count">{cardCount}</span> : null}
      empty={!shown && !q.isPending && !q.isError}
    >
      {q.isError ? (
        <p role="alert" className="py-1 text-[12.5px] text-[var(--bad)]" data-testid="org-units-error">
          The units could not be read. That is not a statement that there are none.
        </p>
      ) : q.isPending ? (
        <p className="py-1 text-[12.5px] text-[var(--ink-faint)]">Reading the units…</p>
      ) : (
        <OrgShortList
          read={{ q, items: units, hasMore: read.hasMore, count, clickedThrough: read.clickedThrough, leftOut: false }}
          labels={UNITS_LABELS}
          total={read.total}
          onOpenItem={onOpen}
          renderRow={(u, { where, open }) => <UnitRow u={u} vaultId={vaultId} counted={where === "card" && countedIds.has(u.id)} onOpen={open} />}
        />
      )}
    </CardGroup>
  );
}
