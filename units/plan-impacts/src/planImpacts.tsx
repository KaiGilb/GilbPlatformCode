// One t:ImpactOn row per Value or Resource. The numbers live on the relation.
// Nothing is written on the Solution, the Value, or the Resource.

import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { EntityRefValue, refDisplayName } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PlanSource } from "@kaigilb/gilbplatformcode-plan-source";
import { PlanTagPicker, httpStatus, noticeFor } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { isTypeName, recordTag, relationMemberIds } from "@kaigilb/gilbplatformcode-plan-links-model";
import { planSourceEmpty, sourceWithStatedBy, type PlanSourceValue } from "@kaigilb/gilbplatformcode-plan-card-facts";
import {
  IMPACT_ON_TYPE,
  IMPACT_RESOURCE_ROLE,
  IMPACT_SOLUTION_ROLE,
  IMPACT_VALUE_ROLE,
  factsFromExtras,
  impactExtraFacts,
  impactNumbersText,
  impactsOnSolution,
  parseImpactFields,
  resourceDrawShown,
  sameImpact,
  scaleUnitOf,
  sortImpacts,
  splitPinned,
  valueEstimateShown,
  type ImpactBasis,
  type ImpactCommit,
  type ImpactLink,
  type ImpactStored,
  type ImpactTargetRole,
} from "@kaigilb/gilbplatformcode-plan-impacts-model";
import { uriTail } from "@kaigilb/gilbplatformcode-id-tail";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { PlanImpactsHostContext, type PlanImpactsHost } from "./planImpactsHost";

/** The host, its writers read as present: the table gives up editing when one is missing (its first lines). */
type PlanHost = Required<PlanImpactsHost>;

function usePlanImpactsHost(): PlanHost {
  const host = useContext(PlanImpactsHostContext);
  if (!host) throw new Error("plan-impacts: wrap the app in <PlanImpactsHostContext.Provider value={host}>");
  return host as PlanHost;
}

/** Stands for `useCreateRecord` when the host has none, so the hook is still called, in the same place, on every render. The create is never reached: the table is then read-only. */
function useNoCreate(): ReturnType<PlanHost["useCreateRecord"]> {
  return {
    mutateAsync: () => Promise.reject(new Error("plan-impacts: the host has no useCreateRecord")),
  };
}

const MISSING_ADDRESS = "The record was made, but its address was not read, so it was not linked.";
const DECIMAL_MESSAGE = "Enter a decimal number.";

const fieldClass =
  "min-h-11 min-w-0 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

type DraftImpact = {
  key: string;
  targetUri: string;
  targetId: string;
  role: ImpactTargetRole;
  tag: string;
  unit: string;
  source: PlanSourceValue;
  /** The person picked or cleared this impact's source: it is not theirs to fill in on write. */
  sourceChosen?: boolean;
};

/** Chip labels are read from the screen vault's list. A create is stored in the record's vault, so the new row is copied across when that list is already loaded. A missing list is left missing. */
function showCreatedOnScreen(host: PlanHost, screenVault: string, recordVault: string, id: string): void {
  if (screenVault === recordVault) return;
  const made = host.getRecordPages(recordVault);
  const row = made?.pages.flatMap((page) => page.records).find((record) => record.id === id);
  if (!row) return;
  const prev = host.getRecordPages(screenVault);
  if (!prev?.pages.length) return;
  const [first, ...rest] = prev.pages;
  if (!first || first.records.some((record) => record.id === row.id)) return;
  host.setRecordPages(screenVault, {
    ...prev,
    pages: [{ ...first, records: [row, ...first.records], total: Math.max(first.total, first.records.length + 1) }, ...rest],
  });
}

function tagFor(pool: readonly GridRecord[], uri: string): string {
  const row = pool.find((r) => r.entityUri === uri || r.id === uri);
  const tag = row ? recordTag(row.facts) : "";
  return tag || refDisplayName(row?.facts ?? null, uri);
}

function storedFrom(parsed: ImpactCommit, source: PlanSourceValue): ImpactStored {
  return {
    role: parsed.role,
    valueEstimate: parsed.valueEstimate,
    resourceDraw: parsed.resourceDraw,
    unit: parsed.unit,
    basis: parsed.basis,
    source,
  };
}

function initialFields(role: ImpactTargetRole, stored: ImpactStored | null, unitPrefill: string) {
  const basis: ImpactBasis = stored?.basis ?? "estimate";
  const unit = stored?.unit ?? unitPrefill;
  if (role === IMPACT_RESOURCE_ROLE) {
    return { status: "", expected: "", amount: stored ? resourceDrawShown(stored.resourceDraw) : "", unit, basis };
  }
  const shown = stored ? valueEstimateShown(stored.valueEstimate) : { text: "", pinned: false };
  const parts = shown.pinned ? splitPinned(shown.text) : null;
  return {
    status: parts?.status ?? (shown.pinned ? "" : shown.text),
    expected: parts?.expected ?? "",
    amount: "",
    unit,
    basis,
  };
}

function ImpactFields({
  role,
  stored,
  unitPrefill,
  onCommit,
  onCancel,
}: {
  role: ImpactTargetRole;
  stored: ImpactStored | null;
  unitPrefill: string;
  onCommit: (parsed: ImpactCommit) => Promise<void>;
  onCancel: () => void;
}) {
  const firstRef = useRef<HTMLInputElement>(null);
  const writing = useRef(false);
  const closed = useRef(false);
  const [fields, setFields] = useState(() => initialFields(role, stored, unitPrefill));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  function set<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setError(null);
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function tryCommit() {
    if (closed.current || writing.current) return;
    const parsed = parseImpactFields(role, fields);
    if (!parsed) {
      setError(DECIMAL_MESSAGE);
      return;
    }
    writing.current = true;
    try {
      await onCommit(parsed);
      closed.current = true;
    } catch {
      // The caller says what failed. The boxes stay.
    } finally {
      writing.current = false;
    }
  }

  return (
    <div data-impact-editor="" className="flex min-w-0 flex-wrap items-center gap-1">
      {role === IMPACT_VALUE_ROLE ? (
        <>
          <input
            ref={firstRef}
            aria-label="Status"
            placeholder="Status"
            autoComplete="off"
            value={fields.status}
            onChange={(e) => set("status", e.target.value)}
            className={`${fieldClass} w-28`}
          />
          <span aria-hidden="true">{"\u2192"}</span>
          <input
            aria-label="Expected"
            placeholder="Expected"
            autoComplete="off"
            value={fields.expected}
            onChange={(e) => set("expected", e.target.value)}
            className={`${fieldClass} w-28`}
          />
        </>
      ) : (
        <input
          ref={firstRef}
          aria-label="Amount"
          placeholder="Amount"
          autoComplete="off"
          value={fields.amount}
          onChange={(e) => set("amount", e.target.value)}
          className={`${fieldClass} w-28`}
        />
      )}
      <input
        aria-label="Unit"
        placeholder="Unit"
        autoComplete="off"
        value={fields.unit}
        onChange={(e) => set("unit", e.target.value)}
        className={`${fieldClass} w-36`}
      />
      <select
        aria-label="Basis"
        value={fields.basis}
        onChange={(e) => set("basis", e.target.value === "measured" ? "measured" : "estimate")}
        className={`${fieldClass} w-32`}
      >
        <option value="estimate">estimate</option>
        <option value="measured">measured</option>
      </select>
      {error ? (
        <p role="alert" className="m-0 text-[12px] text-[var(--bad,#b3261e)]">
          {error}
        </p>
      ) : null}
      <CommitBridge
        tryCommit={tryCommit}
        onCancel={() => {
          if (writing.current || closed.current) return;
          closed.current = true;
          onCancel();
        }}
      />
    </div>
  );
}

/** Enter writes. Escape drops the edit. Blur outside the row writes. A blur into the row does not. */
function CommitBridge({ tryCommit, onCancel }: { tryCommit: () => Promise<void>; onCancel: () => void }) {
  const mark = useRef<HTMLSpanElement>(null);
  const commitRef = useRef(tryCommit);
  const cancelRef = useRef(onCancel);
  commitRef.current = tryCommit;
  cancelRef.current = onCancel;
  useEffect(() => {
    const host = mark.current?.closest("[data-impact-row]");
    if (!(host instanceof HTMLElement)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelRef.current();
        return;
      }
      if (e.key !== "Enter") return;
      const target = e.target;
      if (!(target instanceof HTMLElement) || !target.closest("[data-impact-editor]")) return;
      e.preventDefault();
      void commitRef.current();
    };
    const onFocusOut = (e: FocusEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement) || !target.closest("[data-impact-editor]")) return;
      const next = e.relatedTarget;
      if (next instanceof Node && host.contains(next)) return;
      void commitRef.current();
    };
    host.addEventListener("keydown", onKey);
    host.addEventListener("focusout", onFocusOut);
    return () => {
      host.removeEventListener("keydown", onKey);
      host.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  return <span ref={mark} className="hidden" />;
}

function Numbers({
  stored,
  canEdit,
  onEdit,
}: {
  stored: ImpactStored;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const text = impactNumbersText(stored);
  if (!text) return null;
  const estimate = stored.basis === "estimate";
  return (
    <>
      {canEdit ? (
        <button type="button" className="text-left text-[14px] text-[var(--ink)]" onClick={onEdit}>
          {text}
        </button>
      ) : (
        <span className="text-[14px] text-[var(--ink)]">{text}</span>
      )}
      {estimate ? (
        <span data-impact-basis="estimate" className="text-[12px] text-[var(--ink-soft)]">
          {" (estimate)"}
        </span>
      ) : null}
    </>
  );
}

function ImpactRow({
  tag,
  targetUri,
  editing,
  busy,
  canEdit,
  vaultId,
  record,
  source,
  sourceEditing,
  onOpen,
  onRemove,
  onSource,
  children,
}: {
  tag: string;
  targetUri: string;
  editing: boolean;
  busy: boolean;
  canEdit: boolean;
  vaultId: string;
  record: BaseRecord;
  source: PlanSourceValue;
  sourceEditing: boolean;
  onOpen: (id: string) => void;
  onRemove?: () => void;
  onSource: (next: PlanSourceValue) => void;
  children: ReactNode;
}) {
  return (
    <div data-impact-row={tag} className="flex w-full flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {editing && onRemove ? <RemoveControl label={`Remove ${tag}`} disabled={busy} onClick={onRemove} /> : null}
        <EntityRefValue value={targetUri} vaultId={vaultId} onOpen={onOpen} quiet />
        <span>{": "}</span>
        {children}
      </div>
      <PlanSource
        value={source}
        editing={sourceEditing && canEdit}
        vaultId={vaultId}
        record={record}
        inputLabel={`${tag} source`}
        onOpen={onOpen}
        onCommit={onSource}
      />
    </div>
  );
}

function SavedImpact({
  link,
  tag,
  pool,
  record,
  vaultId,
  planVault,
  canEdit,
  editing,
  busy,
  override,
  selfUri,
  onOpen,
  onNotice,
  onRemember,
  onRemove,
}: {
  link: ImpactLink;
  tag: string;
  pool: readonly GridRecord[];
  record: BaseRecord;
  vaultId: string;
  planVault: string;
  canEdit: boolean;
  editing: boolean;
  busy: boolean;
  override: ImpactStored | null;
  /** The signed-in person's own card, or null when it is not known. A number they write makes them its source. */
  selfUri: string | null;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
  onRemember: (relation: string, stored: ImpactStored) => void;
  onRemove: (relation: string) => void;
}) {
  const host = usePlanImpactsHost();
  const q = host.useRelationDoc(link.relation, planVault);
  const fromDoc = q.data ? factsFromExtras(q.data.extras, link.targetRole) : null;
  const stored = override ?? fromDoc;
  const [open, setOpen] = useState(false);
  const target = pool.find((r) => r.entityUri === link.targetUri || r.id === link.targetUri);
  // Set when the person picks or clears this impact's source while it is open; dropped when it closes.
  const sourceChosen = useRef(false);
  const sourceShown = editing || open;
  useEffect(() => {
    if (!sourceShown) sourceChosen.current = false;
  });

  async function write(base: ImpactStored, source: PlanSourceValue) {
    if (!record.entityUri) throw new Error("This record's address was not read, so it was not linked.");
    const next = { ...base, source };
    await host.writePairRelation({
      relationId: link.relation,
      sourceId: record.id,
      targetId: target?.id ?? uriTail(link.targetUri),
      sourceEntityUri: record.entityUri,
      targetEntityUri: target?.entityUri || link.targetUri,
      typeCurie: IMPACT_ON_TYPE,
      roles: { source: IMPACT_SOLUTION_ROLE, target: link.targetRole },
      vaultNamespace: planVault,
      extraFacts: impactExtraFacts(next, source),
    });
    onRemember(link.relation, next);
  }

  return (
    <ImpactRow
      tag={tag}
      targetUri={link.targetUri}
      editing={editing}
      busy={busy}
      canEdit={canEdit}
      vaultId={vaultId}
      record={record}
      source={stored?.source ?? {}}
      sourceEditing={editing || open}
      onOpen={onOpen}
      onRemove={() => onRemove(link.relation)}
      onSource={(next) => {
        if (!stored) return;
        sourceChosen.current = true;
        void write(stored, next).then(
          () => onNotice(null),
          (e: unknown) => onNotice(noticeFor(e, tag)),
        );
      }}
    >
      {open && stored ? (
        <ImpactFields
          role={link.targetRole}
          stored={stored}
          unitPrefill={stored.unit}
          onCancel={() => setOpen(false)}
          onCommit={async (parsed) => {
            if (sameImpact(stored, parsed)) {
              setOpen(false);
              return;
            }
            try {
              // The new numbers are this person's: they are the source, unless they chose one for this impact.
              const source = selfUri && !sourceChosen.current ? sourceWithStatedBy(stored.source, selfUri) : stored.source;
              await write(storedFrom(parsed, source), source);
              onNotice(null);
              setOpen(false);
            } catch (e) {
              onNotice(noticeFor(e, tag));
              throw e;
            }
          }}
        />
      ) : stored ? (
        <Numbers stored={stored} canEdit={canEdit} onEdit={() => setOpen(true)} />
      ) : null}
    </ImpactRow>
  );
}

export function PlanImpacts({
  record,
  vaultId,
  planVault = vaultId,
  canEdit,
  offer = false,
  onOpen,
  onNotice,
  onPicked,
}: {
  record: BaseRecord;
  vaultId: string;
  /** The record's own vault. Impact relations and a new Value or Resource are created there. */
  planVault?: string;
  canEdit: boolean;
  offer?: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
  onPicked?: () => void;
}) {
  const mode = useCardMode();
  const host = usePlanImpactsHost();
  canEdit = canEdit && host.writePairRelation !== undefined && host.endRelation !== undefined && host.useCreateRecord !== undefined;
  const list = host.useRecords(vaultId);
  const relations = host.useRelations(record.id, record.entityUri ?? null);
  const create = (host.useCreateRecord ?? useNoCreate)(planVault);
  const selfUri = host.useSelfSource()?.["@id"] ?? null;
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<DraftImpact[]>([]);
  const overridesRef = useRef(new Map<string, ImpactStored>());
  const [overrideRev, setOverrideRev] = useState(0);
  const pool = list.data ?? [];
  const known = !relations.isPending && !relations.isError;
  const links = known ? sortImpacts(impactsOnSolution(relations.data), (uri) => tagFor(pool, uri)) : [];
  const editing = mode.editing && canEdit;
  const showPicker = (editing || (offer && canEdit)) && !!record.entityUri;
  const excluded = useMemo(
    () => relationMemberIds([...links.map((link) => link.targetUri), ...drafts.map((d) => d.targetUri)]),
    [links, drafts],
  );

  function remember(relation: string, stored: ImpactStored) {
    overridesRef.current.set(relation, stored);
    setOverrideRev((n) => n + 1);
  }

  function cacheRow(relation: string, targetUri: string, role: ImpactTargetRole): RecordRelation {
    return {
      relation,
      role: IMPACT_SOLUTION_ROLE,
      type: IMPACT_ON_TYPE,
      members: [{ member: targetUri, role }],
    };
  }

  function putCache(relation: string, targetUri: string, role: ImpactTargetRole) {
    host.setRelations(record.id, record.entityUri ?? null, (prev) => [
      ...(prev ?? []).filter((row) => row.relation !== relation),
      cacheRow(relation, targetUri, role),
    ]);
  }

  async function writeNew(draft: DraftImpact, parsed: ImpactCommit) {
    if (!record.entityUri) throw new Error("This record's address was not read, so it was not linked.");
    // A new impact is this person's unless they chose its source (even to clear it).
    const source = !draft.sourceChosen && planSourceEmpty(draft.source) && selfUri ? sourceWithStatedBy({}, selfUri) : draft.source;
    const stored = storedFrom(parsed, source);
    const written = await host.writePairRelation({
      sourceId: record.id,
      targetId: draft.targetId,
      sourceEntityUri: record.entityUri,
      targetEntityUri: draft.targetUri,
      typeCurie: IMPACT_ON_TYPE,
      roles: { source: IMPACT_SOLUTION_ROLE, target: draft.role },
      vaultNamespace: planVault,
      extraFacts: impactExtraFacts(stored, source),
    });
    const relation = written.uri?.includes("://") ? written.uri : written.id;
    remember(relation, stored);
    putCache(relation, draft.targetUri, draft.role);
    setDrafts((prev) => prev.filter((d) => d.key !== draft.key));
    onNotice(null);
  }

  function addDraft(draft: DraftImpact) {
    onPicked?.();
    const mine = planSourceEmpty(draft.source) && selfUri ? sourceWithStatedBy({}, selfUri) : draft.source;
    setDrafts((prev) => [...prev.filter((d) => d.targetUri !== draft.targetUri), { ...draft, source: mine }]);
  }

  async function createTarget(kind: "value" | "resource", tag: string) {
    if (busy) return;
    const spec = host.resolveType(kind);
    const label = kind === "value" ? "Value" : "Resource";
    if (!spec) {
      onNotice(`${label} is not a type this app can create.`);
      return;
    }
    if (!record.entityUri) {
      onNotice("This record's address was not read, so it was not linked.");
      return;
    }
    setBusy(true);
    try {
      const created = await create.mutateAsync({ type: spec, facts: { unitTag: tag }, nameOnly: true });
      host.invalidatePlanSearch(planVault);
      showCreatedOnScreen(host, vaultId, planVault, created.id);
      if (!created.entityUri) {
        onNotice(MISSING_ADDRESS);
        return;
      }
      onNotice(null);
      addDraft({
        key: created.entityUri,
        targetUri: created.entityUri,
        targetId: created.id,
        role: kind === "value" ? IMPACT_VALUE_ROLE : IMPACT_RESOURCE_ROLE,
        tag,
        unit: "",
        source: {},
      });
    } catch (e) {
      onNotice(noticeFor(e, tag));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="plan-impacts" data-impact-rev={overrideRev}>
      {links.map((link) => (
        <SavedImpact
          key={link.relation}
          link={link}
          tag={tagFor(pool, link.targetUri)}
          pool={pool}
          record={record}
          vaultId={vaultId}
          planVault={planVault}
          canEdit={canEdit}
          editing={editing}
          busy={busy}
          override={overridesRef.current.get(link.relation) ?? null}
          selfUri={selfUri}
          onOpen={onOpen}
          onNotice={onNotice}
          onRemember={remember}
          onRemove={(relation) => {
            void (async () => {
              if (busy) return;
              setBusy(true);
              try {
                await host.endRelation(relation, planVault);
                overridesRef.current.delete(relation);
                setOverrideRev((n) => n + 1);
                host.setRelations(record.id, record.entityUri ?? null, (prev) =>
                  (prev ?? []).filter((row) => row.relation !== relation),
                );
                onNotice(null);
              } catch (e) {
                onNotice(noticeFor(e, tagFor(pool, link.targetUri)));
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      ))}
      {drafts.map((draft) => (
        <ImpactRow
          key={draft.key}
          tag={draft.tag}
          targetUri={draft.targetUri}
          editing={editing}
          busy={busy}
          canEdit={canEdit}
          vaultId={vaultId}
          record={record}
          source={draft.source}
          sourceEditing
          onOpen={onOpen}
          onSource={(next) =>
            setDrafts((prev) => prev.map((d) => (d.key === draft.key ? { ...d, source: next, sourceChosen: true } : d)))
          }
        >
          <ImpactFields
            role={draft.role}
            stored={null}
            unitPrefill={draft.unit}
            onCancel={() => setDrafts((prev) => prev.filter((d) => d.key !== draft.key))}
            onCommit={async (parsed) => {
              try {
                await writeNew(draft, parsed);
              } catch (e) {
                onNotice(noticeFor(e, draft.tag));
                throw e;
              }
            }}
          />
        </ImpactRow>
      ))}
      {showPicker ? (
        <PlanTagPicker
          vaultId={vaultId}
          planVault={planVault}
          ariaLabel="Impacts"
          placeholder="Find a Value or Resource by tag"
          kindLabel="Value"
          pool={pool}
          typeName="Value"
          typeNames={["Value", "Resource"]}
          excluded={excluded}
          busy={busy}
          onChoose={(chosen) => {
            if (!chosen.entityUri) {
              onNotice("That record's address was not read, so it was not linked.");
              return;
            }
            if (!record.entityUri) {
              onNotice("This record's address was not read, so it was not linked.");
              return;
            }
            onNotice(null);
            addDraft({
              key: chosen.entityUri,
              targetUri: chosen.entityUri,
              targetId: chosen.id,
              role: isTypeName(chosen.typeUri, "Resource") ? IMPACT_RESOURCE_ROLE : IMPACT_VALUE_ROLE,
              tag: recordTag(chosen.facts) || refDisplayName(chosen.facts, chosen.entityUri),
              unit: scaleUnitOf(chosen),
              source: {},
            });
          }}
          onCreate={() => {}}
          creates={[
            { label: "Value", onCreate: (tag) => void createTarget("value", tag) },
            { label: "Resource", onCreate: (tag) => void createTarget("resource", tag) },
          ]}
        />
      ) : null}
    </div>
  );
}
