// The link lines of a Plan card: Part of, Sub-functions, Function of Value, Value of Function, Solution of, Solutions and Part of System.
// Each shows the linked records by their live tag. A reference stores only the address; the tag is read from the record it points at.

import { useContext, useEffect, useMemo, useState } from "react";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { EntityRefValue, refDisplayName } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { OrgRecordPicker } from "@kaigilb/gilbplatformcode-record-picker";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";
import { memberValue } from "@kaigilb/gilbplatformcode-plan-card-facts";
import {
  alreadyMeasuresSentence,
  isTypeName,
  linkAddress,
  partOfExcludedIds,
  PlanChainError,
  pointsAt,
  recordTag,
  wouldLoop,
  readPartOfFact,
  relationMemberIds,
  SOLUTION_OF_ROLES,
  SOLUTION_OF_TYPE,
  solutionOfCacheRow,
  solutionOfFunctions,
  solutionsTargeting,
} from "@kaigilb/gilbplatformcode-plan-links-model";
import { idFromEntityUri } from "@kaigilb/gilbplatformcode-id-tail";
import {
  PlanTagPicker,
  SEARCH_ERROR,
  SEARCH_INCOMPLETE_CREATE,
  TagLink,
  chosenRow,
  noticeFor,
  rowOnHit,
  usePlanPickerFind,
} from "@kaigilb/gilbplatformcode-plan-tag-picker";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { PlanTagLinksHostContext, type PlanTagLinksHost } from "./planTagLinksHost";
import { PlanFindLimitNote, planFindRows } from "./planFindNote";
import { writeSource } from "./writeSource";

/** The host, its writers read as present: each component gives up editing when one of its writers is missing (its first line). */
type PlanHost = Required<PlanTagLinksHost>;

function usePlanTagLinksHost(): PlanHost {
  const host = useContext(PlanTagLinksHostContext);
  if (!host) throw new Error("plan-tag-links: wrap the app in <PlanTagLinksHostContext.Provider value={host}>");
  return host as PlanHost;
}

/** Stands for `useCreateRecord` when the host has none, so the hook is still called, in the same place, on every render. The create is never reached: the component is read-only. */
function useNoCreate(): ReturnType<PlanHost["useCreateRecord"]> {
  return {
    mutateAsync: () => Promise.reject(new Error("plan-tag-links: the host has no useCreateRecord")),
  };
}

/** The app's `VEDA_ID_PREFIX`: a live ontology term is offered as `<prefix><TypeName>`. */
const VEDA_ID_PREFIX = "veda:";

const MISSING_ADDRESS = "The record was made, but its address was not read, so it was not linked.";

const VERSION_UNREAD = "This record's version could not be read, so your change was not saved. Reload and try again.";
const LINK_CONFLICT = "This changed elsewhere. The card now shows the latest; your change was not saved.";

/** Write one link, or retract it with null. A save replaces the row in every list that already holds it. */
async function writeLink(
  host: PlanHost,
  planVault: string,
  target: GridRecord,
  slug: string,
  uri: string | null,
): Promise<void> {
  const started = linkAddress(target, slug);
  const gate = await host.ensureEtagUnchanged(planVault, target, (fresh) => linkAddress(fresh, slug) === started);
  if ("unreadable" in gate) throw new Error(VERSION_UNREAD);
  if ("conflict" in gate) throw new Error(LINK_CONFLICT);
  const ready = gate.row;
  const previous = linkAddress(ready, slug);
  const patch = { [slug]: uri == null ? null : { "@id": uri } };
  const src = writeSource(ready);
  const pre = { ifMatch: ready.etag };
  const { etag } = src.length
    ? await host.patchRecord(ready.id, patch, ready.entityUri ?? null, src[0], pre)
    : await host.patchRecord(ready.id, patch, ready.entityUri ?? null, undefined, pre);
  const updated = { ...host.applyPatch(ready, patch, etag), updatedAt: Date.now() };
  host.storePlanRow(planVault, updated);
  if (updated.entityUri) host.setPlanRecord(updated.id, updated.entityUri, updated);
  if (slug !== "measures" && slug !== "fvParent") return;
  const attr = `a:${slug}`;
  if (previous) host.dropPlanFind(planVault, attr, idFromEntityUri(previous), target.id);
  if (uri) host.prependPlanFind(planVault, attr, idFromEntityUri(uri), updated);
}

export function PlanPartOf({
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
  /** The record's own vault. Creates and the part-of find use it. `vaultId` stays the screen vault. */
  planVault?: string;
  canEdit: boolean;
  /** Show the search when the card is not in edit mode (the group's "+ Add"). */
  offer?: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
  onPicked?: () => void;
}) {
  const mode = useCardMode();
  const host = usePlanTagLinksHost();
  canEdit = canEdit && host.patchRecord !== undefined && host.useCreateRecord !== undefined;
  const list = host.useRecords(vaultId);
  const create = (host.useCreateRecord ?? useNoCreate)(planVault);
  const [busy, setBusy] = useState(false);
  const pool = list.data ?? [];
  const excluded = useMemo(() => partOfExcludedIds(record, pool), [record, pool]);
  const parent = linkAddress(record, "fvParent");
  const editing = mode.editing && canEdit;
  const showPicker = editing || (offer && canEdit);

  async function run(tag: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onNotice(noticeFor(e, tag));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="plan-part-of">
      <div className="flex items-start gap-2">
        {editing && parent ? (
          <RemoveControl
            label="Remove Part of"
            disabled={busy}
            onClick={() => {
              const row = host.liveRow(vaultId, record.id, record);
              void run("", async () => {
                await writeLink(host, planVault, row, "fvParent", null);
                onNotice(null);
              });
            }}
          />
        ) : null}
        {parent ? (
          <EntityRefValue value={parent} vaultId={vaultId} onOpen={onOpen} quiet />
        ) : (
          <span className="text-[14px] text-[var(--ink)]">(none fits)</span>
        )}
      </div>
      {showPicker ? (
        <PlanTagPicker
          vaultId={vaultId}
          planVault={planVault}
          ariaLabel="Part of"
          placeholder="Find a Function by tag"
          kindLabel="Function"
          pool={pool}
          typeName="Function"
          typeNames={["Function", "FunctionConstraint"]}
          excluded={excluded}
          busy={busy}
          onChoose={(chosen) => {
            if (!chosen.entityUri) {
              onNotice("That record's address was not read, so it was not linked.");
              return;
            }
            const parentUri = chosen.entityUri;
            const chosenName = recordTag(chosen.facts) || refDisplayName(chosen.facts, parentUri);
            const selfName = recordTag(record.facts) || refDisplayName(record.facts, record.entityUri);
            void run(chosenName, async () => {
              let loop = false;
              try {
                loop = await wouldLoop({ id: record.id, entityUri: record.entityUri }, parentUri, host.readRecord);
              } catch (e) {
                onNotice(e instanceof PlanChainError ? e.message : "Could not check the chain — try again.");
                return;
              }
              if (loop) {
                onNotice(`${chosenName} is under ${selfName}, so it cannot be its Part of.`);
                return;
              }
              const row = host.liveRow(vaultId, record.id, record);
              onPicked?.();
              await writeLink(host, planVault, row, "fvParent", parentUri);
              onNotice(null);
            });
          }}
          onCreate={(tag) => {
            const spec = host.resolveType("function");
            if (!spec) {
              onNotice("Function is not a type this app can create.");
              return;
            }
            void run(tag, async () => {
              const created = await create.mutateAsync({ type: spec, facts: { unitTag: tag }, nameOnly: true });
              host.invalidatePlanSearch(planVault);
              if (!created.entityUri) {
                onNotice(MISSING_ADDRESS);
                return;
              }
              const row = host.liveRow(vaultId, record.id, record);
              await writeLink(host, planVault, row, "fvParent", created.entityUri);
              onNotice(null);
            });
          }}
        />
      ) : null}
    </div>
  );
}

const findQuiet = "text-[12px] text-[var(--ink-soft)]";

function byTag(a: { id: string; facts: Record<string, string> }, b: { id: string; facts: Record<string, string> }): number {
  return recordTag(a.facts).localeCompare(recordTag(b.facts)) || a.id.localeCompare(b.id);
}

export function PlanSubFunctions({
  record,
  vaultId,
  planVault = vaultId,
  onOpen,
}: {
  record: BaseRecord;
  vaultId: string;
  /** The record's own vault. The sub-function find is asked there. */
  planVault?: string;
  onOpen: (id: string) => void;
}) {
  const host = usePlanTagLinksHost();
  const find = host.usePlanFind(planVault, "a:fvParent", record);
  const kids = planFindRows(find.data).filter((r) => isTypeName(r.typeUri, "Function")).sort(byTag);
  const retry = () => void host.invalidatePlanFind(planVault, "a:fvParent", record.id);
  return (
    <div className="flex flex-col gap-1" data-testid="plan-sub-functions">
      {find.isError ? (
        <button type="button" className={findQuiet} onClick={retry}>
          Could not read the sub-functions — try again
        </button>
      ) : (
        kids.map((k) => <TagLink key={k.id} id={k.id} entityUri={k.entityUri} facts={k.facts} vaultId={vaultId} onOpen={onOpen} />)
      )}
      <PlanFindLimitNote data={find.data} word="sub-functions" singular="sub-function" onRetry={retry} />
    </div>
  );
}

export function PlanFunctionOfValue({
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
  /** The record's own vault. The Value create and the measures find use it. */
  planVault?: string;
  canEdit: boolean;
  /** Show "+ Value" when the card is not in edit mode (the group's "+ Add"). */
  offer?: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
  onPicked?: () => void;
}) {
  const mode = useCardMode();
  const host = usePlanTagLinksHost();
  canEdit = canEdit && host.patchRecord !== undefined && host.createRecord !== undefined;
  const list = host.useRecords(vaultId);
  const find = host.usePlanFind(planVault, "a:measures", record);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const pool = list.data ?? [];
  const values = planFindRows(find.data).filter((r) => isTypeName(r.typeUri, "Value")).sort(byTag);
  // The values that hold no name or `unitTag` are named by their main tag: ONE batch call for the list.
  const mains = host.useMainTagsForRows(values);
  const retryValues = () => void host.invalidatePlanFind(planVault, "a:measures", record.id);
  const editing = mode.editing && canEdit;
  const showAdd = editing || (offer && canEdit);
  useEffect(() => {
    if (offer) setAdding(true);
  }, [offer]);

  async function run(tag: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onNotice(noticeFor(e, tag));
    } finally {
      setBusy(false);
    }
  }

  function otherTag(addr: string): string {
    const canonical = linkAddress({ facts: { measures: addr } }, "measures") ?? addr;
    const named = pool.find((r) => r.id === canonical || r.entityUri === canonical || r.id === addr || r.entityUri === addr);
    const tag = named ? recordTag(named.facts, mains.get(named.entityUri ?? canonical)) : "";
    return tag || refDisplayName(null, canonical);
  }

  return (
    <div className="flex flex-col gap-2" data-testid="plan-function-of-value">
      {find.isError ? (
        <button type="button" className={findQuiet} onClick={retryValues}>
          Could not read the values — try again
        </button>
      ) : (
        values.map((v) => (
          <div key={v.id} className="flex items-start gap-2">
            {editing ? (
              <RemoveControl
                label={`Remove ${recordTag(v.facts, mains.get(v.entityUri ?? "")) || v.id}`}
                disabled={busy}
                onClick={() => {
                  if (!pointsAt(v, "measures", record)) return;
                  const row = host.liveRow(vaultId, v.id, v);
                  void run(recordTag(v.facts), async () => {
                    await writeLink(host, planVault, row, "measures", null);
                    onNotice(null);
                  });
                }}
              />
            ) : null}
            <TagLink id={v.id} entityUri={v.entityUri} facts={v.facts} vaultId={vaultId} onOpen={onOpen} />
          </div>
        ))
      )}
      <PlanFindLimitNote data={find.data} word="values" singular="value" onRetry={retryValues} />
      {showAdd ? (
        <button type="button" className="min-h-11 self-start text-left text-sm text-[var(--accent)]" onClick={() => setAdding(true)}>
          + Value
        </button>
      ) : null}
      {showAdd && adding ? (
        <PlanTagPicker
          vaultId={vaultId}
          planVault={planVault}
          ariaLabel="Function of Value"
          placeholder="Find a Value by tag"
          kindLabel="Value"
          pool={pool}
          typeName="Value"
          excluded={new Set()}
          busy={busy}
          onChoose={(chosen) => {
            if (!record.entityUri) {
              onNotice("This record's address was not read, so it was not linked.");
              return;
            }
            const current = linkAddress(chosen, "measures");
            if (current && !pointsAt(chosen, "measures", record)) {
              onNotice(alreadyMeasuresSentence(recordTag(chosen.facts) || refDisplayName(chosen.facts, chosen.entityUri), otherTag(current)));
              return;
            }
            if (current && pointsAt(chosen, "measures", record)) return;
            const row = host.liveRow(vaultId, chosen.id, chosen);
            onPicked?.();
            void run(recordTag(chosen.facts), async () => {
              await writeLink(host, planVault, row, "measures", record.entityUri!);
              onNotice(null);
            });
          }}
          onCreate={(tag) => {
            if (!record.entityUri) {
              onNotice("This record's address was not read, so it was not linked.");
              return;
            }
            const here = record.entityUri;
            void run(tag, async () => {
              const { id, etag } = await host.createRecord(planVault, host.typeUriForVaultNamespace("Value", planVault), {
                unitTag: tag,
                measures: { "@id": here },
              }, tag);
              if (!id) return;
              host.invalidatePlanSearch(planVault);
              const row: GridRecord = {
                id,
                entityUri: host.memberEntityUri(id, null, planVault),
                typeUri: host.typeUriForVaultNamespace("Value", planVault),
                facts: { unitTag: tag, measures: here },
                opaqueFacts: [],
                etag: etag ?? null,
                updatedAt: Date.now(),
                servedKeys: ["unitTag", "measures"],
                served: {
                  facts: { unitTag: tag, measures: { "@id": here } },
                  context: undefined,
                  etag: etag ?? null,
                },
              };
              host.putRecordInCaches(planVault, row, { insert: true });
              host.prependPlanFind(planVault, "a:measures", record.id, row);
              onNotice(null);
            });
          }}
        />
      ) : null}
    </div>
  );
}

/** The Functions a Value measures: its own `a:measures` links, one or more, in stored order. */
function measuredAddresses(row: { facts?: unknown; served?: { facts?: unknown } }): string[] {
  const out: string[] = [];
  const take = (raw: unknown): void => {
    if (typeof raw === "string") {
      const t = raw.trim();
      if (!t) return;
      if (t.startsWith("{") || t.startsWith("[")) {
        try {
          take(JSON.parse(t) as unknown);
        } catch {
          /* not a link list */
        }
        return;
      }
      const uri = entityRefFromFact(t)?.uri ?? t;
      if (!out.includes(uri)) out.push(uri);
      return;
    }
    if (Array.isArray(raw)) {
      raw.forEach(take);
      return;
    }
    if (raw && typeof raw === "object") {
      const id = (raw as Record<string, unknown>)["@id"];
      if (typeof id === "string") take(id);
    }
  };
  const served = row.served?.facts as Record<string, unknown> | undefined;
  const flat = row.facts as Record<string, unknown> | undefined;
  take(memberValue(served, "measures"));
  if (out.length === 0) take(memberValue(flat, "measures"));
  return out;
}

/** Write the Value's whole `a:measures` list (a list of `{"@id"}`), or retract it when empty. */
async function writeMeasures(
  host: PlanHost,
  planVault: string,
  target: GridRecord,
  uris: readonly string[],
): Promise<void> {
  const started = JSON.stringify(measuredAddresses(target));
  const gate = await host.ensureEtagUnchanged(planVault, target, (fresh) => JSON.stringify(measuredAddresses(fresh)) === started);
  if ("unreadable" in gate) throw new Error(VERSION_UNREAD);
  if ("conflict" in gate) throw new Error(LINK_CONFLICT);
  const ready = gate.row;
  const patch = { measures: uris.length ? uris.map((uri) => ({ "@id": uri })) : null };
  const src = writeSource(ready);
  const pre = { ifMatch: ready.etag };
  const { etag } = src.length
    ? await host.patchRecord(ready.id, patch, ready.entityUri ?? null, src[0], pre)
    : await host.patchRecord(ready.id, patch, ready.entityUri ?? null, undefined, pre);
  const updated = { ...host.applyPatch(ready, patch, etag), updatedAt: Date.now() };
  host.storePlanRow(planVault, updated);
  if (updated.entityUri) host.setPlanRecord(updated.id, updated.entityUri, updated);
}

/** On a Value card: the Function(s) this Value measures. Add with the Function picker, × to remove. */
export function PlanValueOfFunction({
  record,
  vaultId,
  planVault = vaultId,
  canEdit,
  offer = false,
  onOpen,
  onNotice,
  onPicked,
  onWritten,
}: {
  record: BaseRecord;
  vaultId: string;
  planVault?: string;
  canEdit: boolean;
  offer?: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
  onPicked?: () => void;
  /** After the list was written: the caller may stamp the line's `a:measures` source. */
  onWritten?: () => void;
}) {
  const mode = useCardMode();
  const host = usePlanTagLinksHost();
  canEdit = canEdit && host.patchRecord !== undefined && host.createRecord !== undefined;
  const list = host.useRecords(vaultId);
  const [busy, setBusy] = useState(false);
  const pool = list.data ?? [];
  const uris = measuredAddresses(record);
  const excluded = useMemo(() => relationMemberIds(uris), [uris.join("|")]);
  const editing = mode.editing && canEdit;
  const showPicker = editing || (offer && canEdit);

  async function run(tag: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onNotice(noticeFor(e, tag));
    } finally {
      setBusy(false);
    }
  }

  function save(next: string[], tag: string) {
    const row = host.liveRow(vaultId, record.id, record);
    void run(tag, async () => {
      await writeMeasures(host, planVault, row, next);
      onNotice(null);
      if (next.length) onWritten?.();
    });
  }

  function add(uri: string | undefined, tag: string) {
    if (!uri) {
      onNotice("That record's address was not read, so it was not linked.");
      return;
    }
    const canonical = entityRefFromFact(uri)?.uri ?? uri;
    const current = measuredAddresses(host.liveRow(vaultId, record.id, record));
    if (current.includes(canonical)) return;
    onPicked?.();
    save([...current, canonical], tag);
  }

  return (
    <div className="flex flex-col gap-2" data-testid="plan-value-of-function">
      {uris.map((uri) => {
        const row = pool.find((r) => r.entityUri === uri || r.id === uri);
        const tag = tagFor(pool, uri);
        return (
          <div key={uri} className="flex items-start gap-2">
            {editing ? (
              <RemoveControl
                label={`Remove ${tag}`}
                disabled={busy}
                onClick={() => {
                  const current = measuredAddresses(host.liveRow(vaultId, record.id, record));
                  save(
                    current.filter((u) => u !== uri),
                    tag,
                  );
                }}
              />
            ) : null}
            <TagLink id={row?.id ?? uri} entityUri={uri} facts={row?.facts ?? {}} vaultId={vaultId} onOpen={onOpen} />
          </div>
        );
      })}
      {showPicker ? (
        <PlanTagPicker
          vaultId={vaultId}
          planVault={planVault}
          ariaLabel="Value of Function"
          placeholder="Find a Function by tag"
          kindLabel="Function"
          pool={pool}
          typeName="Function"
          excluded={excluded}
          busy={busy}
          onChoose={(chosen) => add(chosen.entityUri, recordTag(chosen.facts))}
          onCreate={(tag) => {
            const spec = host.resolveType("function");
            if (!spec) {
              onNotice("Function is not a type this app can create.");
              return;
            }
            void run(tag, async () => {
              const created = await host.createRecord(planVault, host.typeUriForVaultNamespace("Function", planVault), { unitTag: tag }, tag);
              host.invalidatePlanSearch(planVault);
              const uri = created.id ? host.memberEntityUri(created.id, null, planVault) : undefined;
              if (!uri) {
                onNotice(MISSING_ADDRESS);
                return;
              }
              onPicked?.();
              const current = measuredAddresses(host.liveRow(vaultId, record.id, record));
              await writeMeasures(host, planVault, host.liveRow(vaultId, record.id, record), [...current, uri]);
              onNotice(null);
              onWritten?.();
            });
          }}
        />
      ) : null}
    </div>
  );
}

const SYSTEM_TYPES = ["SoftwareSystem", "System"] as const;

const SOFTWARE_SYSTEM_OPTION = {
  id: `${VEDA_ID_PREFIX}SoftwareSystem`,
  label: "Software System",
  typeName: "SoftwareSystem",
  spec: null,
  kind: "type" as const,
};

/** The tag a linked record is named by: its `unitTag`, else its MAIN tag from `mains`, else its name or id. */
function tagFor(pool: readonly GridRecord[], uri: string, mains?: ReadonlyMap<string, string>): string {
  const row = pool.find((r) => r.entityUri === uri || r.id === uri);
  const tag = row ? recordTag(row.facts, mains?.get(row.entityUri ?? uri)) : "";
  return tag || refDisplayName(row?.facts ?? null, uri);
}

async function writeSolutionOf(
  host: PlanHost,
  vaultId: string,
  source: { id: string; entityUri: string },
  target: { id: string; entityUri: string },
  view: "source" | "target",
): Promise<void> {
  const written = await host.writePairRelation({
    sourceId: source.id,
    targetId: target.id,
    sourceEntityUri: source.entityUri,
    targetEntityUri: target.entityUri,
    typeCurie: SOLUTION_OF_TYPE,
    roles: { source: SOLUTION_OF_ROLES.source, target: SOLUTION_OF_ROLES.target },
    vaultNamespace: vaultId,
  });
  const viewing = view === "source" ? source : target;
  const otherUri = view === "source" ? target.entityUri : source.entityUri;
  const relation = written.uri ?? written.id;
  const prev = host.getRelations(viewing.id, viewing.entityUri) ?? [];
  host.setRelations(viewing.id, viewing.entityUri, [
    ...prev.filter((row) => row.relation !== relation),
    solutionOfCacheRow({ relation, view, otherUri }),
  ]);
}

function SolutionChips({
  links,
  pool,
  vaultId,
  editing,
  busy,
  onOpen,
  onRemove,
}: {
  links: readonly { relation: string; uri: string }[];
  pool: readonly GridRecord[];
  vaultId: string;
  editing: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  onRemove: (relation: string) => void;
}) {
  const host = usePlanTagLinksHost();
  // The linked records that hold no name or `unitTag` are named by their main tag: ONE batch call for all of them, never one per link.
  const mains = host.useMainTagsForRows(
    useMemo(() => links.flatMap((l) => pool.filter((r) => r.entityUri === l.uri || r.id === l.uri)), [links, pool]),
  );
  if (links.length === 0) return null;
  return (
    <>
      {links.map((link) => {
        const tag = tagFor(pool, link.uri, mains);
        const row = pool.find((r) => r.entityUri === link.uri || r.id === link.uri);
        return (
          <div key={link.relation || link.uri} className="flex items-start gap-2">
            {editing ? (
              <RemoveControl label={`Remove ${tag}`} disabled={busy} onClick={() => onRemove(link.relation)} />
            ) : null}
            <TagLink id={row?.id ?? link.uri} entityUri={link.uri} facts={row?.facts ?? {}} vaultId={vaultId} onOpen={onOpen} />
          </div>
        );
      })}
    </>
  );
}

export function PlanSolutionOf({
  record,
  vaultId,
  planVault = vaultId,
  canEdit,
  offer = false,
  onOpen,
  onNotice,
  onPicked,
  onWritten,
}: {
  record: BaseRecord;
  vaultId: string;
  /** The record's own vault. Creating a Function and the Solution-of relation use it. */
  planVault?: string;
  canEdit: boolean;
  offer?: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
  onPicked?: () => void;
  /** After a link to a Function was written (picked or made here): the caller may stamp the line's source. */
  onWritten?: () => void;
}) {
  const mode = useCardMode();
  const host = usePlanTagLinksHost();
  canEdit = canEdit && host.writePairRelation !== undefined && host.endRelation !== undefined && host.useCreateRecord !== undefined;
  const list = host.useRecords(vaultId);
  const relations = host.useRelations(record.id, record.entityUri ?? null);
  const create = (host.useCreateRecord ?? useNoCreate)(planVault);
  const [busy, setBusy] = useState(false);
  const pool = list.data ?? [];
  const known = !relations.isPending && !relations.isError;
  const links = known ? solutionOfFunctions(relations.data) : [];
  const excluded = useMemo(() => relationMemberIds(links.map((link) => link.uri)), [links]);
  const editing = mode.editing && canEdit;
  const showPicker = editing || (offer && canEdit);

  async function run(tag: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onNotice(noticeFor(e, tag));
    } finally {
      setBusy(false);
    }
  }

  function linkFunction(chosen: { id: string; entityUri: string }, tag: string) {
    if (!record.entityUri) {
      onNotice("This record's address was not read, so it was not linked.");
      return;
    }
    const here = record.entityUri;
    onPicked?.();
    void run(tag, async () => {
      await writeSolutionOf(host, planVault, { id: record.id, entityUri: here }, chosen, "source");
      onNotice(null);
      onWritten?.();
    });
  }

  return (
    <div className="flex flex-col gap-2" data-testid="plan-solution-of">
      <SolutionChips
        links={links}
        pool={pool}
        vaultId={vaultId}
        editing={editing}
        busy={busy}
        onOpen={onOpen}
        onRemove={(relation) => {
          void run("", async () => {
            await host.endRelation(relation, planVault);
            host.setRelations(record.id, record.entityUri ?? null, (prev) =>
              (prev ?? []).filter((row) => row.relation !== relation),
            );
            onNotice(null);
          });
        }}
      />
      {showPicker ? (
        <PlanTagPicker
          vaultId={vaultId}
          planVault={planVault}
          ariaLabel="Solution of Function"
          placeholder="Find a Function by tag"
          kindLabel="Function"
          pool={pool}
          typeName="Function"
          excluded={excluded}
          busy={busy}
          onChoose={(chosen) => {
            if (!chosen.entityUri) {
              onNotice("That record's address was not read, so it was not linked.");
              return;
            }
            linkFunction({ id: chosen.id, entityUri: chosen.entityUri }, recordTag(chosen.facts));
          }}
          onCreate={(tag) => {
            const spec = host.resolveType("function");
            if (!spec) {
              onNotice("Function is not a type this app can create.");
              return;
            }
            if (!record.entityUri) {
              onNotice("This record's address was not read, so it was not linked.");
              return;
            }
            const here = record.entityUri;
            void run(tag, async () => {
              const created = await create.mutateAsync({ type: spec, facts: { unitTag: tag }, nameOnly: true });
              host.invalidatePlanSearch(planVault);
              if (!created.entityUri) {
                onNotice(MISSING_ADDRESS);
                return;
              }
              await writeSolutionOf(
                host,
                planVault,
                { id: record.id, entityUri: here },
                { id: created.id, entityUri: created.entityUri },
                "source",
              );
              onNotice(null);
              onWritten?.();
            });
          }}
        />
      ) : null}
    </div>
  );
}

export function PlanSolutions({
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
  /** The record's own vault. Creating a Solution and the Solution-of relation use it. */
  planVault?: string;
  canEdit: boolean;
  offer?: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
  onPicked?: () => void;
}) {
  const mode = useCardMode();
  const host = usePlanTagLinksHost();
  canEdit = canEdit && host.writePairRelation !== undefined && host.endRelation !== undefined && host.useCreateRecord !== undefined;
  const list = host.useRecords(vaultId);
  const relations = host.useRelations(record.id, record.entityUri ?? null);
  const create = (host.useCreateRecord ?? useNoCreate)(planVault);
  const [busy, setBusy] = useState(false);
  const pool = list.data ?? [];
  const known = !relations.isPending && !relations.isError;
  const links = known ? solutionsTargeting(relations.data) : [];
  const excluded = useMemo(() => relationMemberIds(links.map((link) => link.uri)), [links]);
  const editing = mode.editing && canEdit;
  const showPicker = editing || (offer && canEdit);

  async function run(tag: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onNotice(noticeFor(e, tag));
    } finally {
      setBusy(false);
    }
  }

  function linkSolution(chosen: { id: string; entityUri: string }, tag: string) {
    if (!record.entityUri) {
      onNotice("This record's address was not read, so it was not linked.");
      return;
    }
    const here = record.entityUri;
    onPicked?.();
    void run(tag, async () => {
      await writeSolutionOf(host, planVault, chosen, { id: record.id, entityUri: here }, "target");
      onNotice(null);
    });
  }

  return (
    <div className="flex flex-col gap-2" data-testid="plan-solutions">
      <SolutionChips
        links={links}
        pool={pool}
        vaultId={vaultId}
        editing={editing}
        busy={busy}
        onOpen={onOpen}
        onRemove={(relation) => {
          void run("", async () => {
            await host.endRelation(relation, planVault);
            host.setRelations(record.id, record.entityUri ?? null, (prev) =>
              (prev ?? []).filter((row) => row.relation !== relation),
            );
            onNotice(null);
          });
        }}
      />
      {showPicker ? (
        <PlanTagPicker
          vaultId={vaultId}
          planVault={planVault}
          ariaLabel="Solutions"
          placeholder="Find a Solution by tag"
          kindLabel="Solution"
          pool={pool}
          typeName="Solution"
          typeNames={["Solution", "DesignConstraint"]}
          excluded={excluded}
          busy={busy}
          onChoose={(chosen) => {
            if (!chosen.entityUri) {
              onNotice("That record's address was not read, so it was not linked.");
              return;
            }
            linkSolution({ id: chosen.id, entityUri: chosen.entityUri }, recordTag(chosen.facts));
          }}
          onCreate={(tag) => {
            const spec = host.resolveType("solution");
            if (!spec) {
              onNotice("Solution is not a type this app can create.");
              return;
            }
            if (!record.entityUri) {
              onNotice("This record's address was not read, so it was not linked.");
              return;
            }
            const here = record.entityUri;
            void run(tag, async () => {
              const created = await create.mutateAsync({ type: spec, facts: { unitTag: tag }, nameOnly: true });
              host.invalidatePlanSearch(planVault);
              if (!created.entityUri) {
                onNotice(MISSING_ADDRESS);
                return;
              }
              await writeSolutionOf(
                host,
                planVault,
                { id: created.id, entityUri: created.entityUri },
                { id: record.id, entityUri: here },
                "target",
              );
              onNotice(null);
            });
          }}
        />
      ) : null}
    </div>
  );
}

export function PlanPartOfSystem({
  record,
  vaultId,
  planVault = vaultId,
  canEdit,
  offer = false,
  onOpen,
  onNotice,
  onPicked,
  onWrite,
}: {
  record: BaseRecord;
  vaultId: string;
  /** The record's own vault. A new system is created there. */
  planVault?: string;
  canEdit: boolean;
  offer?: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
  onPicked?: () => void;
  /** Merge-patch `a:partOf`. `null` clears the link. A label-only value is not cleared from here. */
  onWrite: (uri: string | null) => void;
}) {
  const mode = useCardMode();
  const host = usePlanTagLinksHost();
  const list = host.useRecords(vaultId);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const pool = list.data ?? [];
  const search = usePlanPickerFind(planVault, SYSTEM_TYPES, draft);
  const reading = readPartOfFact(record);
  const editing = mode.editing && canEdit;
  const showPicker = editing || (offer && canEdit);
  const excluded = useMemo(() => {
    const ids = new Set<string>();
    if (reading.kind === "link") {
      ids.add(reading.uri);
      for (const row of pool) {
        if (row.entityUri === reading.uri || row.id === reading.uri) {
          ids.add(row.id);
          if (row.entityUri) ids.add(row.entityUri);
        }
      }
    }
    return [...ids];
  }, [pool, reading]);

  return (
    <div className="flex flex-col gap-2" data-testid="plan-part-of-system">
      {reading.kind === "link" ? (
        <div className="flex items-start gap-2">
          {editing ? (
            <RemoveControl label="Remove Part of System" disabled={busy} onClick={() => onWrite(null)} />
          ) : null}
          <EntityRefValue value={reading.uri} vaultId={vaultId} onOpen={onOpen} quiet />
        </div>
      ) : reading.kind === "label" ? (
        <span className="text-[14px] text-[var(--ink)]">{reading.label}</span>
      ) : null}
      {showPicker ? (
        <>
          <OrgRecordPicker
            vaultId={planVault}
            label="Part of System"
            placeholder="Find a system"
            exclude={excluded}
            find={search.find}
            queryKey={search.queryKey}
            staleTime={30_000}
            searchOnMount={false}
            onAnswer={search.onAnswer}
            hitsTestId="plan-system-hits"
            pendingText="Searching…"
            errorText={SEARCH_ERROR}
            noneText=""
            partialText=""
            autoFocus={false}
            untilEngaged
            onTextChange={setDraft}
            onPick={(hit) => {
              const chosen = chosenRow(pool, hit.uri, rowOnHit(hit) ?? search.rowFor(hit.uri));
              const uri = chosen?.entityUri || (hit.uri.startsWith("http") ? hit.uri : "");
              if (!uri) {
                onNotice("That record's address was not read, so it was not linked.");
                return;
              }
              onPicked?.();
              onWrite(uri);
              onNotice(null);
            }}
          />
          {search.tagFailed ? (
            <p role="alert" className="text-xs text-[var(--bad)]">
              {SEARCH_ERROR}
            </p>
          ) : null}
          {search.showIncomplete ? (
            <p className="text-xs text-[var(--ink-faint)]">
              <span>{SEARCH_INCOMPLETE_CREATE}</span>{" "}
              <button type="button" className="text-sm text-[var(--accent)]" data-picker-keep="" onMouseDown={(ev) => ev.preventDefault()} onClick={search.retry}>
                Try again
              </button>
            </p>
          ) : null}
          {search.canCreate && host.ConnectedCreateDialog !== undefined ? (
            <button
              type="button"
              data-testid="plan-link-create"
              className="min-h-11 w-full rounded-md border border-[var(--line)] px-2 text-left text-sm text-[var(--ink)] disabled:opacity-50"
              disabled={busy}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => setCreating(true)}
            >
              {`Create System "${draft.trim()}"`}
            </button>
          ) : null}
        </>
      ) : null}
      {creating ? (
        <host.ConnectedCreateDialog
          open
          stakeholders
          source={null}
          drawnVaultIds={[vaultId, planVault]}
          initialTypeOption={SOFTWARE_SYSTEM_OPTION}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setBusy(true);
            void host.readRecord(id, planVault)
              .then((created) => {
                if (!created?.entityUri) {
                  onNotice(MISSING_ADDRESS);
                  return;
                }
                onPicked?.();
                onWrite(created.entityUri);
                onNotice(null);
              })
              .catch((e: unknown) => {
                onNotice(e instanceof Error ? e.message : MISSING_ADDRESS);
              })
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
    </div>
  );
}
