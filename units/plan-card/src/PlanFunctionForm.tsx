// The Function template, one CardGroup per line. The source sits under the statement.
// Plain lines keep their who in a:lineSources. Meter and Status keep it on the entry.
// A link is a:statedBy or a:derivedFrom. a:source stays text. A reference never carries a source.

import { PlanButtonRow } from "@kaigilb/gilbplatformcode-plan-button-row";
import { useEffect, useMemo, useRef, useState, type ComponentProps, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { FieldRow } from "@kaigilb/gilbplatformcode-field-row";
import { modalIsOpen, insideOpenLayer } from "@kaigilb/gilbplatformcode-open-popups";
import { CardGroup, type CardIconName } from "@kaigilb/gilbplatformcode-card-group";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { PlanImpacts } from "@kaigilb/gilbplatformcode-plan-impacts";
import { PlanFunctionOfValue, PlanPartOf, PlanPartOfSystem, PlanSolutionOf, PlanSolutions, PlanSubFunctions, PlanValueOfFunction } from "@kaigilb/gilbplatformcode-plan-tag-links";
import { PlanDescriptionParts } from "@kaigilb/gilbplatformcode-description-parts-view";
import { PlanTypeLevelVersion } from "@kaigilb/gilbplatformcode-plan-type-level-version";
import { PlanAuthority, PlanStakeholders } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { PersonAuthoritySearch } from "./PersonAuthoritySearch";
import { PlanSource } from "@kaigilb/gilbplatformcode-plan-source";
import { PlanEndpointBody } from "@kaigilb/gilbplatformcode-value-endpoint-line";
import { PlanScaleBody } from "@kaigilb/gilbplatformcode-value-scale-line";
import { PlanValueLevelsBody } from "@kaigilb/gilbplatformcode-value-levels-line";
import { PlanValueMetersBody } from "@kaigilb/gilbplatformcode-value-meters-line";
import { PlanValuePictureBody } from "@kaigilb/gilbplatformcode-value-illustration";
import { PlanVariablesBody } from "@kaigilb/gilbplatformcode-value-qualifiers-line";
import type { ValueLineProps } from "@kaigilb/gilbplatformcode-value-line-kit";
import {
  isTypeName,
  linkAddress,
  readPartOfFact,
  solutionOfFunctions,
  solutionsTargeting,
} from "@kaigilb/gilbplatformcode-plan-links-model";
import {
  carryLine,
  carryMeter,
  lineOthers,
  localToday,
  planSourceEmpty,
  planSourceEqual,
  readConcept,
  readLevelLines,
  readLineSources,
  readMeters,
  rowServedFact,
  sameServedList,
  sourceWithStatedBy,
  withLineOthers,
  writeConcept,
  writeLevelLines,
  writeLineSource,
  writeMeters,
  PLAN_STATUS_WORDS,
  type PlanConcept,
  type PlanLevelLine,
  type PlanMeterKind,
  type PlanMeters,
  type PlanSourceValue,
} from "@kaigilb/gilbplatformcode-plan-card-facts";
import { entityDisplayName } from "./entityDisplayName";
import {
  CONSTRAINT_AUTHORITY_WHY,
  CONSTRAINT_UNLINKED,
  isConstraintType,
  isPersonStakeholderType,
  authoritiesOf,
  resourceOwnersOf,
  legacyAuthorityOf,
  stakeholdersOf,
  stakeholderTagTexts,
  type StakeholderTypeSet,
} from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import { PlanTypeField, TYPE_TRIGGER_ATTR, PlanTypeReplaceAsk } from "@kaigilb/gilbplatformcode-plan-type-field";
import { PLAN_VALUE_LINE_LABELS, isResourceType, isValueCardType, planLevelDefault, planLinesFor, planTypeChangeSentence, planTypePair, type PlanLineKey } from "@kaigilb/gilbplatformcode-plan-kinds";
import { planVaultOf } from "./planVault";
import {
  LEGACY_ENDPOINT_SLUG,
  VALUE_PATCH_SLUGS,
  VALUE_SLUG_LIST,
  VALUE_SLUGS,
  carryOthers,
  carryRaw,
  isLevelType,
  latestChange,
  levelKey,
  levelsSettingBoth,
  levelsUsingQualifier,
  othersOf,
  readLegacyLevels,
  readLegacyMeters,
  readLegacyVariables,
  readValueCard,
  removeLevelQualifier,
  renameLevelQualifier,
  scaleLinkPatch,
  scaleRowOf,
  valueCardPatch,
  type ValueCardData,
} from "@kaigilb/gilbplatformcode-value-card-model";
import { MoveStopped, useValueLevels, useValueMeters, useValueQualifiers, useValueScale } from "@kaigilb/gilbplatformcode-value-card-write";
import { isPartType } from "@kaigilb/gilbplatformcode-description-parts-model";
import { PLAN_FIND_CAP_PART_OF, planFindCapFor, planFindRows } from "./planFind";
import { impactsOnSolution } from "@kaigilb/gilbplatformcode-plan-impacts-model";
import { typeLocalName } from "@kaigilb/gilbplatformcode-type-curie";
import type { OrgRecordHit } from "@kaigilb/gilbplatformcode-record-picker";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import {
  ADD_LEVEL,
  NOT_A_PROJECT_LEVEL,
  levelKnown,
  optionLabel,
  pickerNodes,
  useProjectLevels,
} from "@kaigilb/gilbplatformcode-project-levels";
import { writeSource, type MergePatchValue } from "./writeSource";
import { usePlanCardHost } from "./host";

const STATUS_DUP = "That status is already recorded for that date.";
const LIST_CONFLICT =
  "This changed elsewhere. The card now shows the latest; your last change was not saved — make it again.";
const METER_LABEL = { human: "HumanAgent", ai: "AiAgent", instrument: "Instrument" } as const;

const SAVE_409 = "Not saved: someone else changed this Value. Reload to see it.";
const SAVE_DOWN = "Not saved: the vault did not answer. Try again.";

/** A plain sentence for a save that failed with a 409, a 5xx or no answer at all; null for any other failure. */
function saveFailureSentence(e: unknown): string | null {
  const status = e && typeof e === "object" ? (e as { status?: unknown }).status : undefined;
  if (status === 409) return SAVE_409;
  if (typeof status === "number" && status >= 500) return SAVE_DOWN;
  if (e instanceof TypeError) return SAVE_DOWN;
  return null;
}

const NO_PART_ROWS: readonly BaseRecord[] = [];
type Patch = Record<string, MergePatchValue>;
type Draft = {
  concept: PlanConcept;
  ontologyTerm: string;
  level: string;
  sources: Record<string, PlanSourceValue>;
  meters: PlanMeters;
  lines: PlanLevelLine[];
  /** The Value card's Scale, variables, Endpoint, Meters and Levels. Empty on every other type. */
  value: ValueCardData;
};

const box =
  "min-h-[44px] w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

function servedRaw(row: BaseRecord, slug: string): unknown {
  return rowServedFact(row, slug);
}

const LIST_SLUGS = ["hasMeter", "levelStatements", "lineSources"] as const;
type ListSlug = (typeof LIST_SLUGS)[number];
const STALE_LIST = "This record changed or could not be read — reload before saving";
const VERSION_UNREAD = "This record's version could not be read, so the list was not saved. Reload and try again.";

function cloneRaw(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function listSnapshot(row: BaseRecord): Record<ListSlug, unknown> {
  return {
    hasMeter: cloneRaw(servedRaw(row, "hasMeter")),
    levelStatements: cloneRaw(servedRaw(row, "levelStatements")),
    lineSources: cloneRaw(servedRaw(row, "lineSources")),
  };
}

function storedString(row: BaseRecord, slug: string): string {
  const raw = servedRaw(row, slug);
  if (typeof raw === "string") return raw;
  return row.facts[slug] ?? "";
}

function valueFacts(row: BaseRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const slug of VALUE_SLUG_LIST) out[slug] = servedRaw(row, slug);
  return out;
}

function valuePatch(row: BaseRecord, d: Draft): Patch | null {
  const next = valueCardPatch(d.value);
  const prev = valueCardPatch(readValueCard(valueFacts(row), null, isResourceType(row.typeUri)));
  const patch: Patch = {};
  for (const slug of VALUE_PATCH_SLUGS) {
    if (JSON.stringify(next[slug] ?? null) !== JSON.stringify(prev[slug] ?? null)) patch[slug] = (next[slug] ?? null) as MergePatchValue;
  }
  // The Endpoint moved to a:endpoint. When it is written there, the older a:valueEndpoint is dropped.
  if (VALUE_SLUGS.endpoint in patch && servedRaw(row, LEGACY_ENDPOINT_SLUG) !== undefined) patch[LEGACY_ENDPOINT_SLUG] = null;
  return Object.keys(patch).length ? patch : null;
}

export function draftFrom(record: BaseRecord, partRows: readonly BaseRecord[] = []): Draft {
  const read = readLevelLines(servedRaw(record, "levelStatements"));
  return {
    concept: readConcept(servedRaw(record, "concept")),
    ontologyTerm: storedString(record, "ontologyTerm"),
    level: storedString(record, "level"),
    sources: readLineSources(servedRaw(record, "lineSources")),
    meters: readMeters(servedRaw(record, "hasMeter")),
    lines: withLineOthers(read.status ? [read.status, ...read.past] : [], read.others ?? []),
    // The Scale is the t:Scale record a:hasScale points at (one of the Value's parts), else an older inline one.
    value: readValueCard(valueFacts(record), scaleRowOf(valueFacts(record), partRows, record.entityUri), isResourceType(record.typeUri)),
  };
}

function sourceWho(sources: Record<string, PlanSourceValue>, key: string): PlanSourceValue {
  return sources[key] ?? {};
}

function lineSourcesPatch(row: BaseRecord, who: PlanSourceValue, key: string, force: boolean): Patch | null {
  const prev = readLineSources(servedRaw(row, "lineSources"))[key] ?? {};
  if (!force && planSourceEqual(who, prev)) return null;
  return { lineSources: writeLineSource(servedRaw(row, "lineSources"), key, who) };
}

function withSource(row: BaseRecord, d: Draft, key: string, patch: Patch, force: boolean): Patch | null {
  const extra = lineSourcesPatch(row, sourceWho(d.sources, key), key, force);
  if (extra?.lineSources !== undefined) patch.lineSources = extra.lineSources;
  return Object.keys(patch).length ? patch : null;
}

function textPatch(row: BaseRecord, d: Draft, slug: "ontologyTerm", key: string): Patch | null {
  const next = d[slug];
  const patch: Patch = {};
  if (next !== storedString(row, slug)) patch[slug] = next.trim() ? next : null;
  return withSource(row, d, key, patch, false);
}

function levelPatch(row: BaseRecord, d: Draft): Patch | null {
  const patch: Patch = {};
  if (d.level !== storedString(row, "level")) patch.level = d.level;
  return withSource(row, d, "a:level", patch, patch.level !== undefined);
}

function meterPatch(row: BaseRecord, d: Draft): Patch | null {
  const next = writeMeters(d.meters);
  const prev = writeMeters(readMeters(servedRaw(row, "hasMeter")));
  if (JSON.stringify(next) === JSON.stringify(prev)) return null;
  return { hasMeter: next };
}

function linesPatch(row: BaseRecord, d: Draft): Patch | null {
  const next = writeLevelLines(d.lines);
  const prev = writeLevelLines(draftFrom(row).lines);
  if (JSON.stringify(next) === JSON.stringify(prev)) return null;
  return { levelStatements: next };
}

function noneFitsPatch(row: BaseRecord, d: Draft): Patch | null {
  const had = linkAddress(row, "fvParent");
  const patch: Patch = {};
  if (had) patch.fvParent = null;
  return withSource(row, d, "a:fvParent", patch, !!had);
}

function repeatedStatus(lines: readonly PlanLevelLine[]): boolean {
  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.when}\n${line.status}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

const STATUS_LINE_KEY = "lineKey";
let statusLineSerial = 0;

/** A line the Status editor is in the middle of changing. Not saved, so a reorder cannot see it. */
function statusLineKey(line: PlanLevelLine): string {
  const current = (line as { lineKey?: string }).lineKey;
  if (current) return current;
  const key = `s${++statusLineSerial}`;
  Object.defineProperty(line, STATUS_LINE_KEY, { value: key, enumerable: false, writable: true, configurable: true });
  return key;
}

function copyStatusLineKey<T extends PlanLevelLine>(next: T, prev: PlanLevelLine): T {
  const key = (prev as { lineKey?: string }).lineKey;
  if (key) Object.defineProperty(next, STATUS_LINE_KEY, { value: key, enumerable: false, writable: true, configurable: true });
  return next;
}

/** A real calendar day. Empty and half-typed values are not. */
function completeDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Newest first. `newestIndex` wins a tied date, so a line just added can become Status. */
function orderLines(lines: readonly PlanLevelLine[], newestIndex: number): PlanLevelLine[] {
  const tagged = lines.map((line, index) => ({ line, index: index === newestIndex ? lines.length + 1 : index }));
  tagged.sort((a, b) => {
    if (a.line.when !== b.line.when) return a.line.when < b.line.when ? 1 : -1;
    return b.index - a.index;
  });
  return tagged.map((t) => t.line);
}

/** The next Status word. No current line → Planned. The last word, or a word not in the list, stays. */
function nextStatusWord(current: string | null): string {
  if (current == null) return PLAN_STATUS_WORDS[0];
  const i = (PLAN_STATUS_WORDS as readonly string[]).indexOf(current);
  if (i < 0 || i >= PLAN_STATUS_WORDS.length - 1) return current;
  return PLAN_STATUS_WORDS[i + 1]!;
}

function LineWords({ kind, when, word }: { kind: "Status" | "Past"; when: string; word: string }) {
  return (
    <>
      <span className="font-semibold">{kind}</span>
      {` [${when}] ${word}`}
    </>
  );
}

/**
 * The row a save should send If-Match for. The loaded list wins when it is the truth
 * (nothing saved here yet, the same version, or a newer write). A save this card just
 * made wins when the list is missing or still on an older version. Otherwise the prop.
 */
export function pickLive(
  listRow: GridRecord | undefined,
  saved: GridRecord | null,
  record: BaseRecord,
): GridRecord {
  if (
    listRow &&
    (saved == null || listRow.etag === saved.etag || (listRow.updatedAt ?? 0) > (saved.updatedAt ?? 0))
  ) {
    return listRow;
  }
  if (saved) return saved;
  return { updatedAt: Date.now(), ...record };
}

function lastSegment(url: string): string {
  const parts = url.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? url;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function PlanGroup({
  kind,
  title,
  icon,
  empty,
  required = false,
  keepInEdit = true,
  aside,
  children,
}: {
  kind: string;
  title: string;
  icon: CardIconName;
  empty: boolean;
  required?: boolean;
  /** False: an empty group stays hidden in Edit until the person adds it from "+ Add information". */
  keepInEdit?: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <CardGroup
      kind={kind}
      title={title}
      label={title}
      icon={icon}
      empty={empty}
      keepInEdit={keepInEdit}
      helper={required ? "required" : undefined}
      aside={aside}
      dataAttrs={
        title === "Authority"
          ? { "data-plan-label": "Authority", ...(required ? { "data-plan-required": "true" } : {}) }
          : undefined
      }
    >
      {children}
    </CardGroup>
  );
}

/** The quiet "+ Add" panel. Escape or a click outside the group closes it. A pick closes it from the caller. */
function QuietScope({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const mode = useCardMode();
  useEffect(() => {
    // Edit mode keeps the search open. Its Escape belongs to the picker, then to leaving the card.
    if (!open || mode.editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (modalIsOpen()) return;
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      // Status (and every other quiet line) stays open while a dialog opened from it is up.
      // The dialog is portaled outside this section, so a mousedown in it is not "outside".
      if (insideOpenLayer(t)) return;
      const section = ref.current?.closest("section");
      if (section?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose, mode.editing]);
  return <div ref={ref}>{children}</div>;
}

/** A plain line. Its own editor does not turn the card into Edit; focus may move into the source under it. */
function PlanField(props: ComponentProps<typeof FieldRow>) {
  return <FieldRow {...props} enterCard={false} retainFocusWithinSection />;
}

function AddAside({ onAdd }: { onAdd: () => void }) {
  const mode = useCardMode();
  if (!mode.managed || mode.editing) return null;
  return (
    <button type="button" className="min-h-11 px-3 text-[15px] text-[var(--ink-soft)]" onClick={onAdd}>
      + Add
    </button>
  );
}

export function PlanFunctionForm({
  record,
  vaultId,
  canEdit,
  onOpen,
  onNotice,
}: {
  record: BaseRecord;
  vaultId: string;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
}) {
  const host = usePlanCardHost();
  if (!(host.patchRecord && host.useRetypeRecord && host.migratedAuthorityRelation && host.writeAuthorityRelation)) canEdit = false;
  const mode = useCardMode();
  const editing = mode.editing && canEdit;
  const self = host.useSelfSource();
  const selfRef = useRef(self);
  selfRef.current = self;
  // Lines whose source the person picked or cleared while that line is open. A new value on such a line keeps their choice.
  const chosen = useRef(new Set<string>());
  const constraint = isConstraintType(record.typeUri);
  const pair = planTypePair(record.typeUri);
  const relationQuery = host.useRelations(record.id, record.entityUri ?? null);
  const linesFor = planLinesFor(record.typeUri);
  const planVault = planVaultOf(record, vaultId);
  const subFind = host.usePlanFind(planVault, "a:fvParent", linesFor.includes("subFunctions") ? record : null);
  const valueFind = host.usePlanFind(planVault, "a:measures", linesFor.includes("functionOfValue") ? record : null);
  // A Value's Ambition Level is optional: it shows only when it has parts (or the person adds it).
  const ambitionFind = host.usePlanFind(planVault, "a:partOf", record, planFindCapFor(isValueCardType(record.typeUri)));
  /** The time of the last confirmed save made on this card (ms). */
  const [savedAt, setSavedAt] = useState(0);
  const [quiet, setQuiet] = useState<null | "stakeholder" | "authority" | "resourceOwner" | "part" | "value" | "solutionOf" | "solutions" | "system" | "impacts">(null);
  const [meterOpen, setMeterOpen] = useState({ human: false, ai: false, instrument: false });
  const [replaceAsk, setReplaceAsk] = useState<{ term: string } | null>(null);
  // When the Replace question closes, the focus returns to the Type field's trigger.
  const askWasOpen = useRef(false);
  useEffect(() => {
    if (replaceAsk) {
      askWasOpen.current = true;
      return;
    }
    if (!askWasOpen.current) return;
    askWasOpen.current = false;
    document.querySelector<HTMLElement>(`[data-testid="plan-type-field"] [${TYPE_TRIGGER_ATTR}]`)?.focus();
  }, [replaceAsk]);
  const [vedaOpen, setVedaOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const statusSelectRef = useRef<HTMLSelectElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  /** The date being typed. Null means the input shows the line. Saved on blur or Enter, never per digit. */
  const dateDraftRef = useRef<string | null>(null);
  const boundStatusKey = useRef<string | null>(null);
  const [dateDraft, setDateDraft] = useState<string | null>(null);
  const openPartAdd = useRef<() => void>(() => {});
  const pickedMeansFor = useRef(false);
  const pickedMeasuresFor = useRef(false);
  const wantStatusFocus = useRef(false);
  // The chooser's press is `element.click()` (detail 0), and StrictMode runs that effect twice. A person's own press is not ignored.
  const scriptStatusAdd = useRef(false);
  const releaseScriptStatusAdd = useRef(false);
  if (releaseScriptStatusAdd.current) {
    releaseScriptStatusAdd.current = false;
    scriptStatusAdd.current = false;
  }
  useEffect(() => {
    if (!editing) return;
    setLevelOpen(false);
    setStatusOpen(false);
  }, [editing]);
  useEffect(() => {
    if (!wantStatusFocus.current) return;
    const el = statusSelectRef.current;
    if (!el) return;
    wantStatusFocus.current = false;
    el.focus();
  });
  const relationsRef = useRef(relationQuery.data);
  relationsRef.current = relationQuery.data;
  const retype = host.useRetypeRecord?.(vaultId);
  // A stable list while the find has no rows (a new [] each render would make the baseline new each render).
  const partRows = ambitionFind.data?.rows ?? NO_PART_ROWS;
  const partRowsRef = useRef(partRows);
  partRowsRef.current = partRows;
  const draftOf = (row: BaseRecord) => draftFrom(row, partRowsRef.current);
  const baseline = useMemo(() => draftFrom(record, partRows), [record, partRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState(baseline);
  const draftRef = useRef(draft);
  const baseRef = useRef(baseline);
  const knownRef = useRef(listSnapshot(record));
  const queue = useRef(Promise.resolve());
  const [ask, setAsk] = useState<string | null>(null);
  const [retyping, setRetyping] = useState(false);
  const [pickedAuthority, setPickedAuthority] = useState<OrgRecordHit | null>(null);
  const [makingPerson, setMakingPerson] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [addingLevel, setAddingLevel] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addParent, setAddParent] = useState("");
  const projectLevels = useProjectLevels(planVault);
  const people = host.usePersonAuthorities(record, vaultId);
  draftRef.current = draft;
  if (baseline !== baseRef.current) {
    const dirty = JSON.stringify(draftRef.current) !== JSON.stringify(baseRef.current);
    baseRef.current = baseline;
    if (!dirty) {
      draftRef.current = baseline;
      setDraft(baseline);
      knownRef.current = listSnapshot(record);
    }
  }

  /**
   * One write of the Value, now (not queued): the etag gate, the patch `build` makes, the store. True when the patch landed
   * (or there was nothing to write); false when it was not written (version unreadable, a conflict, a stale list).
   */
  async function applyBuild(build: (row: BaseRecord, d: Draft) => Patch | null, snapshot: Draft): Promise<boolean> {
    const row = host.liveRow(planVault, record.id, record);
    const gate = await host.ensureEtagUnchanged(planVault, row, (fresh) => {
      const built = build(fresh, snapshot);
      const touching = built ? Object.keys(built) : [];
      for (const slug of touching) {
        if ((LIST_SLUGS as readonly string[]).includes(slug)) {
          if (!sameServedList(knownRef.current[slug as ListSlug], servedRaw(fresh, slug))) return false;
        } else if (JSON.stringify(servedRaw(row, slug) ?? null) !== JSON.stringify(servedRaw(fresh, slug) ?? null)) {
          return false;
        }
      }
      return true;
    });
    if ("unreadable" in gate) {
      onNotice(VERSION_UNREAD);
      return false;
    }
    if ("conflict" in gate) {
      const fresh = host.liveRow(planVault, record.id, record);
      const next = draftOf(fresh);
      draftRef.current = next;
      setDraft(next);
      baseRef.current = next;
      knownRef.current = listSnapshot(fresh);
      onNotice(LIST_CONFLICT);
      return false;
    }
    const ready = gate.row;
    const built = build(ready, snapshot);
    const patch: Patch = built ? { ...built } : {};
    // The draft may replace only lists it was built from. A row that holds
    // other members (count or content) is not overwritten; typed text stays.
    let stale = false;
    for (const slug of LIST_SLUGS) {
      if (!Object.prototype.hasOwnProperty.call(patch, slug)) continue;
      if (sameServedList(knownRef.current[slug], servedRaw(ready, slug))) continue;
      delete patch[slug];
      stale = true;
    }
    if (stale) onNotice(STALE_LIST);
    const known =
      host.getRelations(ready.id, ready.entityUri ?? null) ?? relationsRef.current;
    const migrated = await host.migratedAuthorityRelation!(ready, vaultId, known);
    if (migrated) {
      patch.authorityHolder = null;
      patch.authorityActsFor = null;
      if (migrated.relation) {
        const prev = host.getRelations(ready.id, ready.entityUri ?? null) ?? known ?? [];
        host.setRelations(ready.id, ready.entityUri ?? null, [...prev.filter((r) => r.relation !== migrated.relation!.relation), migrated.relation]);
      }
    }
    if (Object.keys(patch).length === 0) return true;
    try {
      const src = writeSource(ready);
      const pre = { ifMatch: ready.etag };
      const { etag } = src.length
        ? await host.patchRecord!(ready.id, patch, ready.entityUri ?? null, src[0], pre)
        : await host.patchRecord!(ready.id, patch, ready.entityUri ?? null, undefined, pre);
      const stored: GridRecord = { ...host.applyPatch(ready, patch, etag), updatedAt: Date.now() };
      host.storePlanRow(planVault, stored);
      setSavedAt(stored.updatedAt);
      if (stored.entityUri) host.setRecordRead(stored.id, stored.entityUri, stored);
      const remembered = { ...knownRef.current };
      for (const slug of LIST_SLUGS) {
        if (Object.prototype.hasOwnProperty.call(patch, slug)) remembered[slug] = cloneRaw(patch[slug]);
      }
      knownRef.current = remembered;
      if (!stale) onNotice(null);
      return true;
    } catch (e) {
      if (!host.isConflict(e)) throw e;
      const fresh = await host.reconcileAfterConflict(planVault, ready);
      if (fresh) {
        const next = draftOf(fresh);
        draftRef.current = next;
        setDraft(next);
        knownRef.current = listSnapshot(fresh);
      }
      onNotice(LIST_CONFLICT);
    }
    return false;
  }

  /** A write failed: the card goes back to the stored Value and says why. */
  function rollBackAfterFailure(e: unknown) {
    const row = host.liveRow(planVault, record.id, record);
    const rolled = draftOf(row);
    draftRef.current = rolled;
    setDraft(rolled);
    knownRef.current = listSnapshot(row);
    onNotice(saveFailureSentence(e) ?? (e instanceof Error ? e.message : "Couldn't save — your change was rolled back. Try again."));
  }

  function enqueue(build: (row: BaseRecord, d: Draft) => Patch | null) {
    const snapshot = draftRef.current;
    const job = queue.current.then(() => applyBuild(build, snapshot));
    queue.current = job.then(() => {}, rollBackAfterFailure);
  }

  function edit(partial: Partial<Draft>) {
    const next = { ...draftRef.current, ...partial };
    draftRef.current = next;
    setDraft(next);
  }

  /**
   * The source a line gets with a new value the person wrote: they are the source, in place of an older person or words
   * (a document the line was taken from stays).
   * Their own pick or clear on this line wins; so does an unknown self (the value is written with no source added).
   */
  function stamped(key: string, current: PlanSourceValue): PlanSourceValue {
    const me = selfRef.current;
    if (!me || chosen.current.has(key)) return current;
    return sourceWithStatedBy(current, me["@id"]);
  }

  function stampedSources(key: string): Record<string, PlanSourceValue> {
    const sources = draftRef.current.sources;
    return { ...sources, [key]: stamped(key, sourceWho(sources, key)) };
  }

  /** A source-only write for a line whose value was written elsewhere (a link made by its own picker). */
  function stampLine(key: string) {
    if (!selfRef.current || chosen.current.has(key)) return;
    edit({ sources: stampedSources(key) });
    enqueue((row, d) => lineSourcesPatch(row, d.sources[key] ?? {}, key, false));
  }

  function commitSource(key: string, next: PlanSourceValue, build?: (row: BaseRecord, d: Draft) => Patch | null) {
    chosen.current.add(key);
    const sources = { ...draftRef.current.sources, [key]: next };
    edit({ sources });
    enqueue(build ?? ((row, d) => lineSourcesPatch(row, d.sources[key] ?? {}, key, false)));
  }

  function commitMeterSource(kind: PlanMeterKind, next: PlanSourceValue) {
    chosen.current.add(`meter:${kind}`);
    const prev = draftRef.current.meters[kind];
    const meters = { ...draftRef.current.meters, [kind]: carryMeter({ ...prev, source: next }, prev) };
    edit({ meters });
    enqueue(meterPatch);
  }

  function commitStatusSource(next: PlanSourceValue) {
    chosen.current.add("status");
    const lines = draftRef.current.lines;
    if (!lines[0]) return;
    edit({ lines: withLineOthers([carryLine({ ...lines[0], source: next }, lines[0]), ...lines.slice(1)], lineOthers(lines)) });
    enqueue(linesPatch);
  }

  /** The Status line this edit started on, even if a reorder would have moved it. */
  function rememberStatusLine(): number {
    const lines = draftRef.current.lines;
    if (boundStatusKey.current) {
      const found = lines.findIndex((line) => (line as { lineKey?: string }).lineKey === boundStatusKey.current);
      if (found >= 0) return found;
    }
    if (!lines[0]) return -1;
    boundStatusKey.current = statusLineKey(lines[0]);
    return 0;
  }

  function commitStatusDate() {
    const value = dateDraftRef.current;
    if (value == null) return;
    dateDraftRef.current = null;
    setDateDraft(null);
    const lines = draftRef.current.lines;
    const idx = rememberStatusLine();
    boundStatusKey.current = null;
    if (idx < 0 || !completeDate(value)) return;
    const line = lines[idx];
    if (!line || line.when === value) return;
    const nextLine = copyStatusLineKey(carryLine({ ...line, when: value, source: stamped("status", line.source) }, line), line);
    putLines(orderLines(lines.map((item, i) => (i === idx ? nextLine : item)), idx));
  }

  function putLines(lines: PlanLevelLine[]) {
    const carried = withLineOthers(lines, lineOthers(draftRef.current.lines));
    if (repeatedStatus(carried)) {
      setStatusError(STATUS_DUP);
      return;
    }
    setStatusError(null);
    const next = { ...draftRef.current, lines: carried };
    draftRef.current = next;
    setDraft(next);
    enqueue(linesPatch);
  }

  function addStatus() {
    const lines = draftRef.current.lines;
    const added: PlanLevelLine = {
      status: nextStatusWord(lines[0] ? lines[0].status : null),
      when: localToday(),
      source: selfRef.current ? sourceWithStatedBy({}, selfRef.current["@id"]) : {},
    };
    const joined = [...lines, added];
    wantStatusFocus.current = true;
    if (repeatedStatus(joined)) {
      setStatusError(STATUS_DUP);
      setStatusOpen(true);
      return;
    }
    putLines(orderLines(joined, lines.length));
    setStatusOpen(true);
  }

  function onNewStatusClick(e: ReactMouseEvent<HTMLButtonElement>) {
    if (e.detail === 0) {
      if (scriptStatusAdd.current) return;
      scriptStatusAdd.current = true;
      releaseScriptStatusAdd.current = true;
    }
    addStatus();
  }

  async function chooseLevel(token: string) {
    const prev = draftRef.current.level;
    const prevSources = draftRef.current.sources;
    edit({ level: token, sources: stampedSources("a:level") });
    try {
      await projectLevels.ensure();
      enqueue(levelPatch);
    } catch (e) {
      edit({ level: prev, sources: prevSources });
      onNotice(e instanceof Error ? e.message : "Could not save the level.");
    }
  }

  async function confirmAddLevel() {
    try {
      const token = await projectLevels.add(addLabel, addParent || null);
      setAddingLevel(false);
      setAddLabel("");
      setAddParent("");
      edit({ level: token, sources: stampedSources("a:level") });
      enqueue(levelPatch);
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Could not add the level.");
    }
  }

  function askType(next: string) {
    const current = constraint ? pair.constraint : pair.plain;
    setPickedAuthority(null);
    setMakingPerson(false);
    if (next === current) {
      setAsk(null);
      return;
    }
    setAsk(next);
  }

  const becoming = !!ask && isConstraintType(ask);
  const hasPerson = people.people.length > 0;
  const needsPick = becoming && !people.pending && !people.error && !hasPerson;
  const changeBlocked = becoming && (people.pending || people.error || (!hasPerson && !pickedAuthority));

  async function adoptPerson(id: string) {
    const rec = await host.readRecord(id, planVault).catch(() => null);
    const set = host.getKindSet();
    if (!isPersonStakeholderType(rec?.typeUri, set)) {
      onNotice(CONSTRAINT_AUTHORITY_WHY);
      return;
    }
    const uri = rec?.entityUri || host.memberEntityUri(id, null, planVault);
    const label = entityDisplayName(rec?.facts, { entityUri: uri, fallback: id }).trim() || id;
    setPickedAuthority({ uri, label, typeName: typeLocalName(rec?.typeUri ?? "") });
    onNotice(null);
  }

  function changeType() {
    if (retyping || !ask || changeBlocked) return;
    const typeName = ask;
    const link = becoming && !hasPerson ? pickedAuthority : null;
    setRetyping(true);
    void (async () => {
      let retyped = false;
      try {
        await retype!.mutateAsync({ record, typeName });
        retyped = true;
        if (link) {
          const row = host.liveRow(planVault, record.id, record);
          const written = await host.writeAuthorityRelation!({
            recordId: row.id,
            recordUri: row.entityUri ?? null,
            stakeholderUri: link.uri,
            vaultId: planVault,
          });
          host.setRelations(row.id, row.entityUri ?? null, (prev) => [
            ...(prev ?? relationsRef.current ?? []).filter((r) => r.relation !== written.relation),
            written,
          ]);
        }
        setAsk(null);
        setPickedAuthority(null);
        onNotice(null);
      } catch (e) {
        onNotice(retyped ? CONSTRAINT_UNLINKED : e instanceof Error ? e.message : "Could not set type");
      } finally {
        setRetyping(false);
      }
    })();
  }

  // A choice lasts while its line is open (or the card is in Edit). Closed lines forget it, so the next edit of that line is a new one.
  const lineOpen: Record<string, boolean> = {
    "a:level": editing || levelOpen,
    "meter:human": editing || meterOpen.human,
    "meter:ai": editing || meterOpen.ai,
    "meter:instrument": editing || meterOpen.instrument,
    status: editing || statusOpen,
    "a:ontologyTerm": editing || vedaOpen,
    "a:partOf": editing || quiet === "system",
    "a:meansFor": editing || quiet === "solutionOf",
    "a:measures": editing || quiet === "value",
  };
  useEffect(() => {
    for (const key of [...chosen.current]) if (!lineOpen[key]) chosen.current.delete(key);
  });

  const status = draft.lines[0] ?? null;
  const past = draft.lines.slice(1);
  const editorLine =
    (boundStatusKey.current
      ? draft.lines.find((line) => (line as { lineKey?: string }).lineKey === boundStatusKey.current)
      : null) ?? status;
  const statusWords =
    status && !(PLAN_STATUS_WORDS as readonly string[]).includes(status.status)
      ? [status.status, ...PLAN_STATUS_WORDS]
      : [...PLAN_STATUS_WORDS];
  const levelOptions = pickerNodes(projectLevels.tree, draft.level);
  const levelNode = levelOptions.find((n) => n.token === draft.level) ?? null;
  // Shown in the control only. A native select does not fire change when the person picks the value it already shows, so this is not written on open.
  const levelPreferred = planLevelDefault(record.typeUri);
  const levelPreselect =
    !draft.level.trim() && levelPreferred && levelOptions.some((n) => n.token === levelPreferred) ? levelPreferred : "";
  const levelSelected = levelNode ? draft.level : levelPreselect;
  const levelOutside = draft.level.trim() !== "" && !levelKnown(draft.level, projectLevels.tree);
  const levelShown = levelOutside ? draft.level : levelNode?.label || draft.level;
  const closeQuiet = () => setQuiet(null);
  const servedFacts = (record.served?.facts as Record<string, unknown> | undefined) ?? null;
  const rels = relationQuery.data;
  const relationsKnown = !relationQuery.isPending && !relationQuery.isError;
  const stakeholderEmpty =
    relationsKnown &&
    stakeholdersOf(rels).length === 0 &&
    authoritiesOf(rels).length === 0 &&
    !legacyAuthorityOf(servedFacts) &&
    stakeholderTagTexts(servedRaw(record, "stakeholders")).length === 0 &&
    planSourceEmpty(sourceWho(draft.sources, "a:stakeholders"));
  const authorityTextNow = typeof servedRaw(record, "authority") === "string" ? String(servedRaw(record, "authority")).trim() : "";
  const authorityEmpty =
    relationsKnown &&
    authoritiesOf(rels).length === 0 &&
    !legacyAuthorityOf(servedFacts) &&
    !authorityTextNow &&
    planSourceEmpty(sourceWho(draft.sources, "a:authority"));
  const partEmpty = !linkAddress(record, "fvParent") && planSourceEmpty(sourceWho(draft.sources, "a:fvParent"));
  const subKids = planFindRows(subFind.data).filter((r) => isTypeName(r.typeUri, "Function"));
  const valueKids = planFindRows(valueFind.data).filter((r) => isTypeName(r.typeUri, "Value"));
  const subEmpty = !subFind.isLoading && !subFind.isError && subKids.length === 0;
  const valueEmpty = !valueFind.isLoading && !valueFind.isError && valueKids.length === 0;
  // The Type: a:ontologyTerm; with none, the old a:concept's @id is read as the Type; a label-only concept shows under it as an earlier note.
  const vedaTerm = draft.ontologyTerm.trim();
  const oldConceptId = draft.concept.id.trim();
  const oldConceptLabel = draft.concept.label.trim();
  const shownType = vedaTerm !== "" ? vedaTerm : oldConceptId;
  const earlierNote = !oldConceptLabel ? "" : !oldConceptId || oldConceptId !== shownType ? oldConceptLabel : "";
  const typeEmpty =
    (shownType === "" || shownType === "none") && !oldConceptLabel && planSourceEmpty(sourceWho(draft.sources, "a:ontologyTerm"));
  /** One patch: the chosen term, and (when `dropConcept`) the old concept nulled with it. */
  function writeType(v: string, dropConcept: boolean) {
    edit({
      ontologyTerm: v,
      ...(v.trim() ? { sources: stampedSources("a:ontologyTerm") } : {}),
      ...(dropConcept ? { concept: { label: "", id: "" } } : {}),
    });
    enqueue((row, d) => {
      const patch = textPatch(row, d, "ontologyTerm", "a:ontologyTerm") ?? {};
      if (dropConcept && writeConcept(readConcept(servedRaw(row, "concept"))) !== null) patch.concept = null;
      return Object.keys(patch).length ? patch : null;
    });
  }
  /** The only way the label-only (or any unshown) earlier concept goes: the person clicks its x. */
  function removeEarlierNote() {
    edit({ concept: { label: "", id: "" } });
    enqueue((row) => (writeConcept(readConcept(servedRaw(row, "concept"))) !== null ? { concept: null } : null));
  }
  const meterEmpty = (["human", "ai", "instrument"] as const).every(
    (kind) => !draft.meters[kind].method.trim() && planSourceEmpty(draft.meters[kind].source),
  );
  const solutionOfLinks = relationsKnown ? solutionOfFunctions(rels) : [];
  const solutionOfEmpty = solutionOfLinks.length === 0 && planSourceEmpty(sourceWho(draft.sources, "a:meansFor"));
  const impactLinks = relationsKnown ? impactsOnSolution(rels) : [];
  const impactsEmpty = impactLinks.length === 0;
  const solutionsLinks = relationsKnown ? solutionsTargeting(rels) : [];
  const solutionsEmpty = solutionsLinks.length === 0;
  const systemReading = readPartOfFact(record);
  const systemEmpty = systemReading.kind === "empty" && planSourceEmpty(sourceWho(draft.sources, "a:partOf"));

  // A Value and a Development Resource use the one card; `isResource` marks the four places it differs.
  const isValueType = isValueCardType(record.typeUri);
  const isResource = isResourceType(record.typeUri);
  // A Value's level records are also parts of it (a:partOf), but they are not Description parts.
  // Hidden until it has a part. While the parts are still being read it counts as empty; if they cannot be read it is shown, so nothing is hidden by a failure.
  const ambitionEmpty = !ambitionFind.isError && planFindRows(ambitionFind.data).filter((r) => isPartType(r.typeUri)).length === 0;
  const description = (
    <PlanGroup
      key="description"
      kind="plan-description"
      title={isValueType ? "Ambition Level" : "Description"}
      icon="note"
      empty={isValueType ? ambitionEmpty : false}
      keepInEdit={!isValueType}
      aside={canEdit ? <AddAside onAdd={() => openPartAdd.current()} /> : undefined}
    >
      <PlanDescriptionParts
        record={record}
        vaultId={vaultId}
        planVault={planVault}
        canEdit={canEdit}
        onOpen={onOpen}
        onNotice={onNotice}
        onBindAdd={(open) => {
          openPartAdd.current = open;
        }}
      />
    </PlanGroup>
  );

  const valueRows = partRows;
  // Version never goes back on screen in a session: a delete of a child is a change.
  const versionFloor = useRef<{ id: string; at: number }>({ id: record.id, at: 0 });
  const [, setTouched] = useState(0);
  const onTouched = () => {
    versionFloor.current = { id: record.id, at: Date.now() };
    setTouched((n) => n + 1);
  };
  // The last sentence a child list said, so the rename helper can add its own group sentence to the reason.
  const lastHostNotice = useRef<string | null>(null);
  const hostNotice = (text: string | null) => {
    lastHostNotice.current = text;
    onNotice(text);
  };
  const qualifierHost = useValueQualifiers({ enabled: isValueType, record, vaultId, planVault, rows: valueRows, onNotice: hostNotice, onTouched });
  const scaleHost = useValueScale({ enabled: isValueType, record, vaultId, planVault, onNotice: hostNotice, onTouched });
  const meterHost = useValueMeters({ enabled: isValueType, record, vaultId, planVault, rows: valueRows, onNotice, onTouched });
  // The old stored lists, read-only while the Value has no records of that kind (a move turns them into records).
  const legacyLevels = useMemo(
    () => (isValueType && !valueRows.some((r) => isLevelType(r.typeUri)) ? readLegacyLevels(servedRaw(record, VALUE_SLUGS.levels)) : []),
    [isValueType, valueRows, record], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const legacyQualifiers = useMemo(
    () => (isValueType && qualifierHost.items.length === 0 ? readLegacyVariables(servedRaw(record, VALUE_SLUGS.scaleVariables)) : []),
    [isValueType, qualifierHost.items.length, record], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const legacyMeters = useMemo(
    () => (isValueType && meterHost.items.length === 0 ? readLegacyMeters(servedRaw(record, VALUE_SLUGS.meters)) : []),
    [isValueType, meterHost.items.length, record], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shownQualifiers = legacyQualifiers.length ? legacyQualifiers : qualifierHost.items;
  const shownMeters = legacyMeters.length ? legacyMeters : meterHost.items;
  const levelHost = useValueLevels({
    enabled: isValueType,
    record,
    vaultId,
    planVault,
    rows: valueRows,
    variableOrder: shownQualifiers.map((v) => v.name.trim()).filter(Boolean),
    onNotice: hostNotice,
    onTouched,
  });
  const shownLevels = legacyLevels.length ? legacyLevels : levelHost.items;
  const valueData = useMemo(
    () => ({ ...draft.value, levels: shownLevels, variables: shownQualifiers, meters: shownMeters, ...(isResource ? { resource: true } : {}) }),
    [draft.value, shownLevels, shownQualifiers, shownMeters, isResource],
  );
  const [moving, setMoving] = useState(false);
  type QualifierAsk =
    | { kind: "rename"; from: string; to: string; count: number; next: ValueCardData }
    | { kind: "taken"; from: string; to: string; count: number; next: ValueCardData; canMerge: boolean; optionsChange: boolean }
    | { kind: "remove"; from: string; count: number; next: ValueCardData };
  const [renameAsk, setRenameAsk] = useState<QualifierAsk | null>(null);
  /** Records a stopped move made and could not remove: their tags, and what retries the removal. */
  const [stuck, setStuck] = useState<{ tags: string[]; undos: (() => Promise<string[]>)[] } | null>(null);
  useEffect(() => {
    if (!renameAsk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRenameAsk(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [renameAsk]);
  /** One click moves the old levels, qualifiers and meters into their own records, then one patch removes the old lists. */
  async function moveOldLists(): Promise<void> {
    if (moving || stuck) return;
    setMoving(true);
    const done: { undo: () => Promise<string[]> }[] = [];
    try {
      const gone: Record<string, MergePatchValue> = {};
      const left = (list: readonly unknown[]) => {
        const rest = othersOf(list);
        return (rest.length ? rest : null) as MergePatchValue;
      };
      if (legacyLevels.length) {
        done.push(await levelHost.moveIn(legacyLevels));
        gone[VALUE_SLUGS.levels] = left(legacyLevels);
      }
      if (legacyQualifiers.length) {
        done.push(await qualifierHost.moveIn(legacyQualifiers));
        gone[VALUE_SLUGS.scaleVariables] = left(legacyQualifiers);
      }
      if (legacyMeters.length) {
        done.push(await meterHost.moveIn(legacyMeters));
        gone[VALUE_SLUGS.meters] = left(legacyMeters);
      }
      enqueue(() => gone);
    } catch (e) {
      // Put the Value back as it was: end what was made; the old lists are untouched. A record that cannot be ended is never hidden.
      const undos = [...done.map((d) => d.undo), ...(e instanceof MoveStopped ? [e.undo] : [])].reverse();
      const tags = await removeMade(undos);
      if (tags.length) {
        setStuck({ tags, undos });
        onNotice(null);
      } else {
        const why = e instanceof MoveStopped ? e.reason : e;
        onNotice(why instanceof Error && why.message ? `Not moved: ${why.message}` : "Not moved. Nothing was changed.");
      }
    } finally {
      setMoving(false);
    }
  }
  async function removeMade(undos: readonly (() => Promise<string[]>)[]): Promise<string[]> {
    const tags: string[] = [];
    for (const u of undos) tags.push(...(await u().catch(() => ["a record"])));
    return tags;
  }
  async function retryRemoving(): Promise<void> {
    if (!stuck || moving) return;
    setMoving(true);
    try {
      const tags = await removeMade(stuck.undos);
      if (tags.length) setStuck({ tags, undos: stuck.undos });
      else {
        setStuck(null);
        onNotice("Those records were removed. Nothing was moved; the old lists are as they were.");
      }
    } finally {
      setMoving(false);
    }
  }
  function applyValueChange(next: ValueCardData) {
    // Levels, qualifier definitions and meters are their own records: a changed list is written record by record, never into the Value.
    if (next.levels !== shownLevels && !legacyLevels.length) levelHost.commit(next.levels);
    if (next.variables !== shownQualifiers && !legacyQualifiers.length) qualifierHost.commit(next.variables);
    if (next.meters !== shownMeters && !legacyMeters.length) meterHost.commit(next.meters);
    const d = draft.value;
    const rest = { ...next, levels: d.levels, variables: d.variables, meters: d.meters };
    if (rest.scale !== d.scale || rest.endpoint !== d.endpoint) {
      edit({ value: rest });
      if (rest.endpoint !== d.endpoint) enqueue(valuePatch);
      if (rest.scale !== d.scale) enqueueScale(rest.scale);
    }
  }
  /**
   * The Scale is its own record. An edit patches that record; the first edit of an older Scale makes the record and then
   * points the Value at it (a:hasScale -> {"@id"}), in one group that ends the new record again if the Value patch fails.
   */
  function enqueueScale(scale: ValueCardData["scale"]) {
    const snapshot = draftRef.current;
    const job = queue.current.then(() =>
      scaleHost.save(scale, (uri) => applyBuild((row) => (Object.keys(scaleLinkPatch(row, uri)).length ? (scaleLinkPatch(row, uri) as Patch) : null), snapshot), saveFailureSentence),
    );
    queue.current = job.then(() => {}, rollBackAfterFailure);
  }
  const valueProps: ValueLineProps = {
    data: valueData,
    editing,
    canEdit,
    vaultId,
    record,
    onOpen,
    selfId: self?.["@id"] ?? null,
    host: {
      progress: levelHost.progress ?? null,
      capped: ambitionFind.data?.capped ? { total: ambitionFind.data.total, cap: ambitionFind.data.cap ?? PLAN_FIND_CAP_PART_OF } : null,
      onNotice,
    },
    ...(legacyLevels.length || legacyQualifiers.length || legacyMeters.length
      ? {
          legacy: {
            levels: legacyLevels.length,
            qualifiers: legacyQualifiers.length,
            meters: legacyMeters.length,
            busy: moving,
            canMove: canEdit,
            onMove: () => void moveOldLists(),
          },
        }
      : {}),
    onRenameQualifier: (from, to) => {
      // Rename helper: the definition record and every level's choice change as ONE group. The definition is written
      // FIRST, then the levels (themselves one group with its rollback). If either step fails, everything is put back and
      // the card says so: "None of the N levels renamed; they are back as they were."
      const eqName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
      const old = shownQualifiers.find((v) => eqName(v.name, from));
      if (!old || shownQualifiers.some((v) => eqName(v.name, to)) || legacyQualifiers.length || legacyLevels.length) return;
      const levels = shownLevels.map((l) => renameLevelQualifier(l, from, to));
      const variables = carryOthers(
        shownQualifiers.map((v) => (v === old ? carryRaw({ ...v, name: to }, v) : v)),
        shownQualifiers,
      );
      const before = shownQualifiers;
      const changed = levels.filter((l, i) => l !== shownLevels[i]).length;
      lastHostNotice.current = null;
      void (async () => {
        const groupNotice = (why: string | null) =>
          onNotice(
            `${why ? why + " " : ""}Couldn't rename [${from}] to [${to}]. None of the ${changed} level${changed === 1 ? "" : "s"} renamed; they are back as they were.`,
          );
        const defOk = await (qualifierHost.commitAndWait ?? (async () => true))(variables);
        if (defOk === false) {
          // Nothing else was written; the definition write rolled itself back.
          groupNotice(lastHostNotice.current);
          return;
        }
        if (changed === 0) return;
        if ((await (levelHost.commitAndWait ?? (async () => true))(levels)) === false) {
          // The levels rolled themselves back (runGroup); the definition goes back too.
          const why = lastHostNotice.current;
          await (qualifierHost.commitAndWait ?? (async () => true))(before);
          groupNotice(why);
        }
      })();
    },
    onChange: (next) => {
      if (next.variables !== shownQualifiers && !legacyQualifiers.length && !legacyLevels.length) {
        const before = new Map(shownQualifiers.map((v) => [levelKey(v), v.name.trim()] as const));
        // Renaming a qualifier also renames it in the levels that use it: ask first, when there are any (or when the name is taken).
        for (const v of next.variables) {
          const was = before.get(levelKey(v));
          const now = v.name.trim();
          if (was && now && was !== now) {
            const count = levelsUsingQualifier(shownLevels, was).length;
            const other = next.variables.find((o) => o !== v && o.name.trim().toLowerCase() === now.toLowerCase());
            if (other) {
              const have = new Set(other.options.map((o) => o.name.trim().toLowerCase()));
              const extra = (shownQualifiers.find((q) => levelKey(q) === levelKey(v))?.options ?? []).filter((o) => o.name.trim() && !have.has(o.name.trim().toLowerCase()));
              setRenameAsk({
                kind: "taken",
                from: was,
                to: other.name.trim(),
                count,
                next,
                canMerge: !levelsSettingBoth(shownLevels, was, now),
                optionsChange: extra.length > 0,
              });
              return;
            }
            if (count > 0) {
              setRenameAsk({ kind: "rename", from: was, to: now, count, next });
              return;
            }
          }
        }
        // Removing a qualifier that levels use: ask, then take the choice out of those levels too.
        const nowKeys = new Set(next.variables.map((v) => levelKey(v)));
        for (const v of shownQualifiers) {
          const name = v.name.trim();
          if (nowKeys.has(levelKey(v)) || !name) continue;
          const count = levelsUsingQualifier(shownLevels, name).length;
          if (count > 0) {
            setRenameAsk({ kind: "remove", from: name, count, next });
            return;
          }
        }
      }
      applyValueChange(next);
    },
  };
  const askBox = (() => {
    if (!renameAsk) return null;
    const ask = renameAsk;
    const box = "flex flex-wrap items-center gap-2 py-2 text-[14px]";
    const accent = "min-h-11 px-3 text-[var(--accent)]";
    const soft = "min-h-11 px-3 text-[var(--ink-soft)]";
    const levels = (n: number) => `${n} ${n === 1 ? "level" : "levels"}`;
    if (ask.kind === "taken") {
      // The new name is another qualifier's: refuse the rename. Merge only when no level sets both.
      const writes = (ask.optionsChange ? 1 : 0) + ask.count + 1;
      return (
        <div role="alertdialog" aria-label="Qualifier name taken" className={box} data-testid="plan-qualifier-taken">
          <span>{`[${ask.to}] already exists. Choose another name, or merge?`}</span>
          {ask.canMerge ? (
            <>
              <span className="text-[var(--ink-soft)]">{`Merge moves ${levels(ask.count)} to [${ask.to}] and removes [${ask.from}]: ${writes} ${writes === 1 ? "write" : "writes"} (${ask.optionsChange ? "1 qualifier + " : ""}${ask.count} ${ask.count === 1 ? "level" : "levels"} + 1 removal).`}</span>
            </>
          ) : (
            <span className="text-[var(--ink-soft)]">{`Some level sets both [${ask.from}] and [${ask.to}], so they cannot be merged.`}</span>
          )}
          <PlanButtonRow>
            <button type="button" className={soft} onClick={() => setRenameAsk(null)}>
              Choose another name
            </button>
            {ask.canMerge ? (
              <button
                type="button"
                className={accent}
                onClick={() => {
                  setRenameAsk(null);
                  mergeQualifier(ask.from, ask.to, ask.next);
                }}
              >
                Merge
              </button>
            ) : null}
          </PlanButtonRow>
        </div>
      );
    }
    if (ask.kind === "remove") {
      return (
        <div role="alertdialog" aria-label="Remove qualifier from levels" className={box} data-testid="plan-qualifier-remove">
          <span>{`Used by ${levels(ask.count)}. Remove [${ask.from}] from them too?`}</span>
          <PlanButtonRow>
            <button type="button" className={soft} onClick={() => setRenameAsk(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={accent}
              onClick={() => {
                setRenameAsk(null);
                applyValueChange({ ...ask.next, levels: shownLevels.map((l) => removeLevelQualifier(l, ask.from)) });
              }}
            >
              Remove
            </button>
          </PlanButtonRow>
        </div>
      );
    }
    return (
      <div role="alertdialog" aria-label="Rename qualifier" className={box} data-testid="plan-qualifier-rename">
        <span>{`Renames [${ask.from}] on ${levels(ask.count)}`}</span>
        <PlanButtonRow>
          <button type="button" className={soft} onClick={() => setRenameAsk(null)}>
            Cancel
          </button>
          <button
            type="button"
            className={accent}
            onClick={() => {
              setRenameAsk(null);
              applyValueChange({ ...ask.next, levels: shownLevels.map((l) => renameLevelQualifier(l, ask.from, ask.to)) });
            }}
          >
            Rename
          </button>
        </PlanButtonRow>
      </div>
    );
  })();
  const stuckBox = stuck ? (
    <div role="alert" className="flex flex-wrap items-center gap-2 py-2 text-[14px]" data-testid="plan-move-stuck">
      <span>{`Move stopped. ${stuck.tags.length} ${stuck.tags.length === 1 ? "record was" : "records were"} made and could not be removed: ${stuck.tags.join(", ")}. Nothing else changed.`}</span>
      <button type="button" className="min-h-11 px-3 text-[var(--accent)]" disabled={moving} onClick={() => void retryRemoving()}>
        Try removing them again
      </button>
    </div>
  ) : null;
  /** Merge qualifier `from` into the existing `to`: each level's choice moves to `to`, then the old definition goes. */
  function mergeQualifier(from: string, to: string, next: ValueCardData) {
    const eqName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const old = shownQualifiers.find((v) => eqName(v.name, from));
    const variables = next.variables
      .filter((v) => !(old && levelKey(v) === levelKey(old)))
      .map((v) => {
        if (!old || !eqName(v.name, to)) return v;
        const have = new Set(v.options.map((o) => o.name.trim().toLowerCase()));
        const extra = old.options.filter((o) => o.name.trim() && !have.has(o.name.trim().toLowerCase()));
        return extra.length ? carryRaw({ ...v, options: [...v.options, ...extra] }, v) : v;
      });
    applyValueChange({ ...next, variables: carryOthers(variables, next.variables), levels: shownLevels.map((l) => renameLevelQualifier(l, from, to)) });
  }
  const valueGroup = (key: PlanLineKey, kind: string, icon: CardIconName, empty: boolean, body: ReactNode) => (
    <PlanGroup key={key} kind={kind} title={PLAN_VALUE_LINE_LABELS[key] ?? key} icon={icon} empty={empty}>
      {body}
    </PlanGroup>
  );
  const scale = valueGroup("scale", "plan-scale", "note", false, <PlanScaleBody {...valueProps} />);
  const scaleVariables = valueGroup(
    "scaleVariables",
    "plan-scale-variables",
    "record",
    false,
    <>
      <PlanVariablesBody {...valueProps} />
      {askBox}
      {stuckBox}
    </>,
  );
  const endpoint = valueGroup("endpoint", "plan-endpoint", "pin", false, <PlanEndpointBody {...valueProps} />);
  const valueMeters = valueGroup(
    "valueMeters",
    "plan-value-meters",
    "clock",
    false,
    <PlanValueMetersBody {...valueProps} />,
  );
  const valueLevels = valueGroup(
    "valueLevels",
    "plan-value-levels",
    "pin",
    false,
    <PlanValueLevelsBody {...valueProps} />,
  );
  const valueGraph = valueGroup("valueGraph", "plan-picture", "relation", false, <PlanValuePictureBody {...valueProps} />);

  const askNode = (
    <>
      {ask ? (
        <div className="flex flex-col gap-2 py-2">
          <p className="text-[13px] text-[var(--ink)]">{planTypeChangeSentence(ask)}</p>
          {needsPick ? (
            <div data-testid="plan-retype-authority">
              {pickedAuthority ? <span className="text-[14px] text-[var(--ink)]">{pickedAuthority.label}</span> : null}
              <PersonAuthoritySearch
                vaultId={vaultId}
                onPick={(hit) => {
                  const set = host.getKindSet();
                  if (!isPersonStakeholderType(hit.typeName, set)) {
                    onNotice(CONSTRAINT_AUTHORITY_WHY);
                    return;
                  }
                  setPickedAuthority(hit);
                  onNotice(null);
                }}
                onNew={() => setMakingPerson(true)}
              />
            </div>
          ) : null}
          <PlanButtonRow>
            <button
              type="button"
              className="min-h-11 px-2 text-sm text-[var(--ink-faint)]"
              onClick={() => {
                setAsk(null);
                setPickedAuthority(null);
                setMakingPerson(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="min-h-11 px-2 text-sm text-[var(--accent)]"
              disabled={retyping || changeBlocked}
              title={
                !retyping && changeBlocked
                  ? people.error
                    ? "Could not read who already requires it."
                    : CONSTRAINT_AUTHORITY_WHY
                  : undefined
              }
              onClick={changeType}
            >
              Change
            </button>
          </PlanButtonRow>
          {makingPerson ? (
            host.renderCreateStakeholder({
              open: true,
              stakeholders: true,
              source: null,
              initialTypeId: "person",
              drawnVaultIds: [vaultId, planVault],
              onClose: () => setMakingPerson(false),
              onCreated: (id) => {
                setMakingPerson(false);
                void host.invalidateAuthoritySearch();
                void adoptPerson(id);
              },
            })
          ) : null}
        </div>
      ) : null}
    </>
  );

  const stakeholder = (
    <PlanGroup
      key="stakeholder"
      kind="plan-stakeholder"
      title="Stakeholder"
      icon="relation"
      empty={isValueType ? false : stakeholderEmpty}
      aside={<AddAside onAdd={() => setQuiet("stakeholder")} />}
    >
      <QuietScope open={quiet === "stakeholder"} onClose={closeQuiet}>
        <div className="flex w-full flex-col py-2">
          <PlanStakeholders
            record={record}
            vaultId={vaultId}
            planVault={planVault}
            editing={editing}
            offer={quiet === "stakeholder" ? true : undefined}
            onOpen={onOpen}
            onNotice={onNotice}
            onPicked={closeQuiet}
          />
          {isValueType ? null : (
          <PlanSource
            value={sourceWho(draft.sources, "a:stakeholders")}
            editing={editing || quiet === "stakeholder"}
            vaultId={vaultId}
            record={record}
            inputLabel="Stakeholder source"
            onOpen={onOpen}
            onCommit={(next) => commitSource("a:stakeholders", next)}
          />
          )}
        </div>
      </QuietScope>
    </PlanGroup>
  );

  const authority = (
    <PlanGroup
      key="authority"
      kind="plan-authority"
      title="Authority"
      icon="represents"
      empty={authorityEmpty}
      required={constraint}
      aside={<AddAside onAdd={() => setQuiet("authority")} />}
    >
      <QuietScope open={quiet === "authority"} onClose={closeQuiet}>
        <div className="flex w-full flex-col py-2">
          <PlanAuthority
            record={record}
            vaultId={vaultId}
            planVault={planVault}
            editing={editing}
            offer={quiet === "authority" ? true : undefined}
            personOnly={constraint}
            onOpen={onOpen}
            onNotice={onNotice}
            onPicked={closeQuiet}
          />
          <PlanSource
            value={sourceWho(draft.sources, "a:authority")}
            editing={editing || quiet === "authority"}
            vaultId={vaultId}
            record={record}
            inputLabel="Authority source"
            onOpen={onOpen}
            onCommit={(next) => commitSource("a:authority", next)}
          />
        </div>
      </QuietScope>
    </PlanGroup>
  );

  // A Development Resource's Resource Owner: the Authority line over `t:ResourceOwnerOf`.
  const resourceOwner = (
    <PlanGroup
      key="resourceOwner"
      kind="plan-resource-owner"
      title={PLAN_VALUE_LINE_LABELS.resourceOwner ?? "Resource Owner"}
      icon="represents"
      empty={relationsKnown && resourceOwnersOf(rels).length === 0}
      aside={<AddAside onAdd={() => setQuiet("resourceOwner")} />}
    >
      <QuietScope open={quiet === "resourceOwner"} onClose={closeQuiet}>
        <div className="flex w-full flex-col py-2">
          <PlanAuthority
            record={record}
            vaultId={vaultId}
            planVault={planVault}
            editing={editing}
            offer={quiet === "resourceOwner" ? true : undefined}
            resourceOwner
            onOpen={onOpen}
            onNotice={onNotice}
            onPicked={closeQuiet}
          />
        </div>
      </QuietScope>
    </PlanGroup>
  );

  const partOf = (
    <PlanGroup
      key="part"
      kind="plan-part-of"
      title="Part of"
      icon="memberOf"
      empty={partEmpty}
      aside={<AddAside onAdd={() => setQuiet("part")} />}
    >
      <QuietScope open={quiet === "part"} onClose={closeQuiet}>
        <div className="flex w-full flex-col py-2">
          <PlanPartOf
            record={record}
            vaultId={vaultId}
            planVault={planVault}
            canEdit={canEdit}
            offer={quiet === "part"}
            onOpen={onOpen}
            onNotice={onNotice}
            onPicked={closeQuiet}
          />
          {canEdit && (editing || quiet === "part") ? (
            <button type="button" className="min-h-11 self-start text-left text-sm text-[var(--accent)]" onClick={() => enqueue(noneFitsPatch)}>
              None fits
            </button>
          ) : null}
          <PlanSource
            value={sourceWho(draft.sources, "a:fvParent")}
            editing={editing || quiet === "part"}
            vaultId={vaultId}
            record={record}
            inputLabel="Part of source"
            onOpen={onOpen}
            onCommit={(next) => commitSource("a:fvParent", next)}
          />
        </div>
      </QuietScope>
    </PlanGroup>
  );

  const subFunctions = (
    <PlanGroup key="subs" kind="plan-sub-functions" title="Sub-functions" icon="memberOf" empty={subEmpty}>
      <div className="py-2">
        <PlanSubFunctions record={record} vaultId={vaultId} planVault={planVault} onOpen={onOpen} />
      </div>
    </PlanGroup>
  );

  const levelText = levelShown.trim() || "";
  const levelDefaultText = levelPreferred ?? "";
  const versionRaw = latestChange(
    {
      updatedAt: Math.max(
        savedAt,
        typeof (record as { updatedAt?: unknown }).updatedAt === "number" ? (record as unknown as { updatedAt: number }).updatedAt : 0,
        versionFloor.current.id === record.id ? versionFloor.current.at : 0,
      ),
    },
    [...valueRows, ...meterHost.lineRows] as readonly { updatedAt?: unknown }[],
  );
  // Never backwards in a session: a delete of the newest child must not make the date fall to the next newest.
  if (versionFloor.current.id !== record.id) versionFloor.current = { id: record.id, at: 0 };
  if (versionRaw && versionRaw.getTime() > versionFloor.current.at) versionFloor.current = { id: record.id, at: versionRaw.getTime() };
  const versionAt = versionFloor.current.at > 0 ? new Date(versionFloor.current.at) : versionRaw;
  const addLevelForm = (
    <>
      {addingLevel ? (
        <div className="flex w-full flex-col gap-2">
          <input aria-label="New level label" value={addLabel} placeholder="Label" onChange={(e) => setAddLabel(e.target.value)} className={box} />
          <select aria-label="New level parent" value={addParent} onChange={(e) => setAddParent(e.target.value)} className={box}>
            <option value="">main level</option>
            {projectLevels.tree.map((node) => (
              <option key={node.token} value={node.token}>
                {optionLabel(node)}
              </option>
            ))}
          </select>
          <PlanButtonRow>
            <button
              type="button"
              className="min-h-11 px-2 text-sm text-[var(--ink-faint)]"
              onClick={() => {
                setAddingLevel(false);
                setAddLabel("");
                setAddParent("");
                setLevelOpen(false);
              }}
            >
              Cancel
            </button>
            <button type="button" className="min-h-11 px-2 text-sm text-[var(--accent)]" onClick={() => void confirmAddLevel()}>
              Add level
            </button>
          </PlanButtonRow>
        </div>
      ) : null}
    </>
  );
  const typeLevel = (
    <PlanTypeLevelVersion
      key="type-level"
      recordId={record.id}
      typeLabel={isResource ? "Development Resource" : isValueType ? "Value" : constraint ? pair.constraintWord : pair.plainWord}
      typeName={isResource ? "Resource" : isValueType ? "Value" : constraint ? pair.constraint : pair.plain}
      typeSwitch={
        isValueType
          ? null
          : {
              plainWord: pair.plainWord,
              constraintWord: pair.constraintWord,
              constraint,
              onPick: (toConstraint) => askType(toConstraint ? pair.constraint : pair.plain),
            }
      }
      editing={editing}
      canEdit={canEdit}
      levelOpen={levelOpen}
      setLevelOpen={setLevelOpen}
      levelText={levelText}
      levelDefaultText={levelDefaultText}
      levelSelected={levelSelected}
      levelOptions={levelOptions}
      optionLabel={optionLabel as (node: never) => string}
      addLevelValue={ADD_LEVEL}
      addingLevel={addingLevel}
      onAddLevel={() => setAddingLevel(true)}
      onChooseLevel={(token) => {
        setAddingLevel(false);
        void chooseLevel(token);
        if (!editing) setLevelOpen(false);
      }}
      version={versionAt}
      below={
        <>
          {(editing || levelOpen) && levelOutside ? <span className="text-[14px] text-[var(--ink)]">{draft.level}</span> : null}
          {levelOutside ? <p className="text-[12px] text-[var(--warn)]">{NOT_A_PROJECT_LEVEL}</p> : null}
          {addLevelForm}
        </>
      }
      ask={askNode}
    />
  );

  const meter = (
    <PlanGroup key="meter" kind="plan-meter" title="Meter" icon="clock" empty={meterEmpty}>
      {(["human", "ai", "instrument"] as const).map((kind) => {
        const label = METER_LABEL[kind];
        const entry = draft.meters[kind];
        const show = editing || meterOpen[kind] || !!entry.method.trim() || !planSourceEmpty(entry.source);
        if (!show) return null;
        return (
          <div key={kind} className="flex w-full flex-col py-2">
            <p className="text-[13px] text-[var(--ink-soft)]">{label}</p>
            <PlanField
              hideLabel
              label={label}
              value={entry.method}
              readOnly={!canEdit}
              onEditingChange={(open) => setMeterOpen((m) => ({ ...m, [kind]: open }))}
              onCommitValue={(v) => {
                const now = draftRef.current.meters[kind];
                const source = v.trim() ? stamped(`meter:${kind}`, now.source) : now.source;
                const meters = { ...draftRef.current.meters, [kind]: carryMeter({ ...now, method: v, source }, now) };
                edit({ meters });
                enqueue(meterPatch);
              }}
            />
            <PlanSource
              value={entry.source}
              editing={editing || meterOpen[kind]}
              vaultId={vaultId}
              record={record}
              inputLabel={`${label} source`}
              onOpen={onOpen}
              onCommit={(next) => commitMeterSource(kind, next)}
            />
          </div>
        );
      })}
    </PlanGroup>
  );

  const statusGroup = (
    <PlanGroup
      key="status"
      kind="plan-status"
      title="Status"
      icon="clock"
      empty={false}
      aside={canEdit ? <AddAside onAdd={addStatus} /> : undefined}
    >
      <QuietScope open={statusOpen} onClose={() => setStatusOpen(false)}>
      <div className="flex w-full flex-col py-2">
        {status && (editing || statusOpen) ? (
          <div className="flex w-full flex-col gap-2">
            <p className="text-left text-[14px] font-normal text-[var(--ink)]">
              <LineWords kind="Status" when={status.when} word={status.status} />
            </p>
            <input
              ref={dateInputRef}
              aria-label="Status date"
              type="date"
              value={dateDraft != null ? dateDraft : (editorLine?.when ?? "")}
              onChange={(e) => {
                rememberStatusLine();
                dateDraftRef.current = e.target.value;
                setDateDraft(e.target.value);
              }}
              onBlur={() => commitStatusDate()}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                commitStatusDate();
              }}
              className={box}
            />
            <select
              ref={statusSelectRef}
              aria-label="Status"
              value={editorLine?.status ?? ""}
              onChange={(e) => {
                const lines = draftRef.current.lines;
                const dateLive = dateInputRef.current != null && document.activeElement === dateInputRef.current;
                const drafting = dateDraftRef.current != null || dateLive;
                const idx = drafting ? rememberStatusLine() : 0;
                const line = lines[idx];
                if (!line) return;
                const nextLine = copyStatusLineKey(
                  carryLine({ ...line, status: e.target.value, source: stamped("status", line.source) }, line),
                  line,
                );
                const next = lines.map((item, i) => (i === idx ? nextLine : item));
                // A date still being typed must stay on this line. Reordering would point the input at another one.
                if (drafting) putLines(next);
                else putLines(orderLines(next, idx));
              }}
              className={box}
            >
              {statusWords.map((word) => (
                <option key={word} value={word}>
                  {word}
                </option>
              ))}
            </select>
            <p className="text-[12px] text-[var(--ink-soft)]">To keep the old status as Past, use + Add</p>
          </div>
        ) : status ? (
          <button
            type="button"
            aria-label="Status"
            className="min-h-11 text-left text-[14px] font-normal text-[var(--ink)]"
            onClick={() => {
              if (canEdit) setStatusOpen(true);
            }}
          >
            <LineWords kind="Status" when={status.when} word={status.status} />
          </button>
        ) : (
          <p className="py-2 text-[14px] text-[var(--ink-soft)]">No status yet</p>
        )}
        {status ? (
          <PlanSource
            value={status.source}
            editing={editing || statusOpen}
            vaultId={vaultId}
            record={record}
            inputLabel="Status source"
            onOpen={onOpen}
            onCommit={commitStatusSource}
          />
        ) : null}
      </div>
      </QuietScope>
      {past.map((line, i) => (
        <div key={`${line.when}-${line.status}-${i}`} className="flex w-full flex-col py-2">
          <div className="flex min-w-0 items-center gap-2">
            {editing ? (
              <button
                type="button"
                aria-label={`Delete past ${line.when} ${line.status}`}
                className="min-h-11 min-w-11 text-[16px] text-[var(--bad)]"
                onClick={() => putLines(draftRef.current.lines.filter((_, idx) => idx !== i + 1))}
              >
                ×
              </button>
            ) : null}
            <span className="text-[14px] font-normal text-[var(--ink)]">
              <LineWords kind="Past" when={line.when} word={line.status} />
            </span>
          </div>
          <PlanSource
            value={line.source}
            editing={false}
            vaultId={vaultId}
            record={record}
            inputLabel="Past source"
            onOpen={onOpen}
            onCommit={() => {}}
          />
        </div>
      ))}
      {editing ? (
        <button
          type="button"
          className="min-h-11 self-start py-2 text-left text-sm text-[var(--accent)]"
          data-card-add={draft.lines.length === 0 ? "" : undefined}
          onClick={onNewStatusClick}
        >
          + New status
        </button>
      ) : null}
      {statusError ? (
        <p role="alert" className="text-[13px] text-[var(--warn)]">
          {statusError}
        </p>
      ) : null}
    </PlanGroup>
  );

  const functionOfValue = (
    <PlanGroup
      key="value"
      kind="plan-function-of-value"
      title={isValueType ? "Value of Function" : "Function of Value"}
      icon="relation"
      empty={isValueType ? false : valueEmpty}
      aside={<AddAside onAdd={() => setQuiet("value")} />}
    >
      <QuietScope open={quiet === "value"} onClose={closeQuiet}>
        {isValueType ? (
          <div className="flex w-full flex-col py-2">
            <PlanValueOfFunction
              record={record}
              vaultId={vaultId}
              planVault={planVault}
              canEdit={canEdit}
              offer={quiet === "value"}
              onOpen={onOpen}
              onNotice={onNotice}
              onPicked={() => {
                pickedMeasuresFor.current = chosen.current.has("a:measures");
                closeQuiet();
              }}
              onWritten={() => {
                const skip = pickedMeasuresFor.current || chosen.current.has("a:measures");
                pickedMeasuresFor.current = false;
                if (!skip) stampLine("a:measures");
              }}
            />
            <PlanSource
              value={sourceWho(draft.sources, "a:measures")}
              editing={editing || quiet === "value"}
              vaultId={vaultId}
              record={record}
              inputLabel="Value of Function source"
              onOpen={onOpen}
              onCommit={(next) => commitSource("a:measures", next)}
            />
          </div>
        ) : (
          <div className="py-2">
            <PlanFunctionOfValue
              record={record}
              vaultId={vaultId}
              planVault={planVault}
              canEdit={canEdit}
              offer={quiet === "value"}
              onOpen={onOpen}
              onNotice={onNotice}
              onPicked={closeQuiet}
            />
          </div>
        )}
      </QuietScope>
    </PlanGroup>
  );

  const gilbVeda = (
    <PlanGroup key="veda" kind="plan-type" title="Type" icon="record" empty={typeEmpty} keepInEdit={false}>
      <div className="flex w-full flex-col py-2">
        <PlanTypeField
          term={shownType}
          canEdit={canEdit}
          editing={editing}
          onOpenChange={setVedaOpen}
          search={host.searchTypes}
          blankReach={host.blankReach}
          onOpenOntology={host.openOntologyConcept}
          renderTypeIcon={host.renderTypeIcon}
          onChoose={(v) => {
            const now = draftRef.current;
            const oldId = now.concept.id.trim();
            // The old concept goes in the same patch only when it said the same thing (its @id is the chosen term). A different @id: ask first.
            // A label-only concept is free text a person typed; picking a Type NEVER clears it (the x on "Earlier note" does).
            if (oldId && oldId !== v.trim()) {
              setReplaceAsk({ term: v });
              return;
            }
            writeType(v, !!oldId);
          }}
        />
        {earlierNote ? (
          <p className="flex items-center gap-1 text-[13px] text-[var(--ink-soft)]" data-testid="plan-type-earlier">
            <span>Earlier note: {earlierNote}</span>
            {canEdit ? (
              <button
                type="button"
                aria-label="Remove earlier note"
                title="Remove earlier note"
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-[14px] text-[var(--ink-soft)]"
                onClick={removeEarlierNote}
              >
                <span aria-hidden>×</span>
              </button>
            ) : null}
          </p>
        ) : null}
        {replaceAsk ? (
          <PlanTypeReplaceAsk
            what={draft.concept.label.trim() || lastSegment(draft.concept.id.trim())}
            onKeep={() => {
              writeType(replaceAsk.term, false);
              setReplaceAsk(null);
            }}
            onReplace={() => {
              writeType(replaceAsk.term, true);
              setReplaceAsk(null);
            }}
          />
        ) : null}
        <PlanSource
          value={sourceWho(draft.sources, "a:ontologyTerm")}
          editing={editing || vedaOpen}
          vaultId={vaultId}
          record={record}
          inputLabel="Type source"
          onOpen={onOpen}
          onCommit={(next) => commitSource("a:ontologyTerm", next, (row, d) => textPatch(row, d, "ontologyTerm", "a:ontologyTerm"))}
        />
      </div>
    </PlanGroup>
  );

  const impacts = (
    <PlanGroup
      key="impacts"
      kind="plan-impacts"
      title="Impacts"
      icon="relation"
      empty={impactsEmpty}
      aside={<AddAside onAdd={() => setQuiet("impacts")} />}
    >
      <QuietScope open={quiet === "impacts"} onClose={closeQuiet}>
        <div className="py-2">
          <PlanImpacts
            record={record}
            vaultId={vaultId}
            planVault={planVault}
            canEdit={canEdit}
            offer={quiet === "impacts"}
            onOpen={onOpen}
            onNotice={onNotice}
            onPicked={closeQuiet}
          />
        </div>
      </QuietScope>
    </PlanGroup>
  );

  const solutionOf = (
    <PlanGroup
      key="solution-of"
      kind="plan-solution-of"
      title="Solution of Function"
      icon="relation"
      empty={solutionOfEmpty}
      aside={<AddAside onAdd={() => setQuiet("solutionOf")} />}
    >
      <QuietScope open={quiet === "solutionOf"} onClose={closeQuiet}>
        <div className="flex w-full flex-col py-2">
          <PlanSolutionOf
            record={record}
            vaultId={vaultId}
            planVault={planVault}
            canEdit={canEdit}
            offer={quiet === "solutionOf"}
            onOpen={onOpen}
            onNotice={onNotice}
            onPicked={() => {
              pickedMeansFor.current = chosen.current.has("a:meansFor");
              closeQuiet();
            }}
            onWritten={() => {
              const skip = pickedMeansFor.current || chosen.current.has("a:meansFor");
              pickedMeansFor.current = false;
              if (!skip) stampLine("a:meansFor");
            }}
          />
          <PlanSource
            value={sourceWho(draft.sources, "a:meansFor")}
            editing={editing || quiet === "solutionOf"}
            vaultId={vaultId}
            record={record}
            inputLabel="Solution of Function source"
            onOpen={onOpen}
            onCommit={(next) => commitSource("a:meansFor", next)}
          />
        </div>
      </QuietScope>
    </PlanGroup>
  );

  const solutions = (
    <PlanGroup
      key="solutions"
      kind="plan-solutions"
      title="Solutions"
      icon="relation"
      empty={solutionsEmpty}
      aside={<AddAside onAdd={() => setQuiet("solutions")} />}
    >
      <QuietScope open={quiet === "solutions"} onClose={closeQuiet}>
        <div className="py-2">
          <PlanSolutions
            record={record}
            vaultId={vaultId}
            planVault={planVault}
            canEdit={canEdit}
            offer={quiet === "solutions"}
            onOpen={onOpen}
            onNotice={onNotice}
            onPicked={closeQuiet}
          />
        </div>
      </QuietScope>
    </PlanGroup>
  );

  const partOfSystem = (
    <PlanGroup
      key="system"
      kind="plan-part-of-system"
      title="Part of System"
      icon="memberOf"
      empty={systemEmpty}
      aside={<AddAside onAdd={() => setQuiet("system")} />}
    >
      <QuietScope open={quiet === "system"} onClose={closeQuiet}>
        <div className="flex w-full flex-col py-2">
          <PlanPartOfSystem
            record={record}
            vaultId={vaultId}
            planVault={planVault}
            canEdit={canEdit}
            offer={quiet === "system"}
            onOpen={onOpen}
            onNotice={onNotice}
            onPicked={closeQuiet}
            onWrite={(uri) => {
              if (!uri) {
                enqueue(() => ({ partOf: null }));
                return;
              }
              // The pick closes this panel; a source chosen in it is still remembered here (it is dropped after this render).
              if (selfRef.current) edit({ sources: stampedSources("a:partOf") });
              enqueue((row, d) => withSource(row, d, "a:partOf", { partOf: { "@id": uri } }, false));
            }}
          />
          <PlanSource
            value={sourceWho(draft.sources, "a:partOf")}
            editing={editing || quiet === "system"}
            vaultId={vaultId}
            record={record}
            inputLabel="Part of System source"
            onOpen={onOpen}
            onCommit={(next) => commitSource("a:partOf", next)}
          />
        </div>
      </QuietScope>
    </PlanGroup>
  );

  const byLine: Record<PlanLineKey, ReactNode> = {
    description,
    type: null,
    stakeholder,
    authority,
    resourceOwner,
    partOf,
    subFunctions,
    level: null,
    meter,
    status: statusGroup,
    impacts,
    functionOfValue,
    solutions,
    gilbveda: gilbVeda,
    solutionOf,
    partOfSystem,
    scale,
    scaleVariables,
    endpoint,
    valueMeters,
    valueLevels,
    valueGraph,
  };
  // The Type · Level · Version line is not in any type's template: it renders first for every Plan type.
  const lines = [typeLevel, ...planLinesFor(record.typeUri).map((key) => byLine[key])];

  return (
    <div data-testid="plan-function-form" className="flex flex-col gap-4">
      {lines}
    </div>
  );
}

/** The one Plan form. The file name stays; this is the name the Solution card uses too. */
export const PlanForm = PlanFunctionForm;
