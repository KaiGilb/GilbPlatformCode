// Stakeholder line, and Authority — a stakeholder of type Authority. Both use OrgRecordPicker.
// A plain stakeholder is one t:StakeholderOf. An authority is one t:AuthorityOf, shown on
// both lines (marked on the Stakeholder line). A name with no record stays text.

import { useCallback, useRef, useState } from "react";
import { OrgRecordPicker, type PickerFind, type PickerIncomplete } from "@kaigilb/gilbplatformcode-record-picker";
import { FieldRow } from "@kaigilb/gilbplatformcode-field-row";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { EntityRefValue } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";
import { entityDisplayName } from "./entityDisplayName";
import {
  alreadyLinked,
  authoritiesOf,
  actsForOnRelation,
  RESOURCE_OWNER_RELATION_TYPE,
  resourceOwnersOf,
  legacyAuthorityOf,
  sameRecord,
  stakeholdersOf,
  STAKEHOLDER_RELATION_FACT,
  STAKEHOLDER_RELATION_TYPE,
  STAKEHOLDER_ROLES,
  stakeholderTagTexts,
  stakeholdersWithoutTag,
  type LinkedStakeholder,
  CONSTRAINT_AUTHORITY_WHY,
  CONSTRAINT_LAST_PERSON,
  NOT_A_PERSON,
  isPersonStakeholderType,
  removingLastPersonAuthority,
} from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import { isResourceType } from "@kaigilb/gilbplatformcode-plan-kinds";
import { rowServedFact, sameServedList } from "@kaigilb/gilbplatformcode-plan-card-facts";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { writeSource, type MergePatchValue } from "./writeSource";
import { SEARCH_INCOMPLETE_HITS, SEARCH_INCOMPLETE_NONE } from "./planSearch";
import { vaultNamespaceOfEntityUri } from "./vaultNamespaceOfEntityUri";
import { useStakeholderLinesHost, type StakeholderLinesHost } from "./host";

function servedRaw(row: BaseRecord, slug: string): unknown {
  return rowServedFact(row, slug);
}

function writeNotice(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (/\b403\b/.test(msg)) return "You cannot write to this vault.";
  return msg || "Couldn't save — your change was rolled back. Try again.";
}

const VERSION_UNREAD = "This record's version could not be read, so the list was not saved. Reload and try again.";
const FACTS_CONFLICT = "This changed elsewhere. The card now shows the latest; your change was not saved.";

/** String tags are not objects, so `sameServedList` would call two different names the same. */
function sameStakeholderValue(a: unknown, b: unknown): boolean {
  if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) return true;
  if (JSON.stringify(stakeholderTagTexts(a)) !== JSON.stringify(stakeholderTagTexts(b))) return false;
  return sameServedList(a, b);
}

/** One stakeholder write. The patch is built from the row whose ETag the write will use. Opaque facts stay as they were. */
async function writeFacts(
  host: StakeholderLinesHost,
  planVault: string,
  row: GridRecord,
  build: (row: GridRecord) => Record<string, MergePatchValue>,
): Promise<void> {
  const gate = await host.ensureEtagUnchanged(planVault, row, (fresh) => {
    const patch = build(fresh);
    for (const slug of Object.keys(patch)) {
      if (!sameStakeholderValue(servedRaw(row, slug), servedRaw(fresh, slug))) return false;
    }
    return true;
  });
  if ("unreadable" in gate) throw new Error(VERSION_UNREAD);
  if ("conflict" in gate) throw new Error(FACTS_CONFLICT);
  const ready = gate.row;
  const patch = build(ready);
  const src = writeSource(ready);
  const pre = { ifMatch: ready.etag };
  const { etag } = src.length
    ? await host.patchRecord!(ready.id, patch, ready.entityUri ?? null, src[0], pre)
    : await host.patchRecord!(ready.id, patch, ready.entityUri ?? null, undefined, pre);
  const stored = { ...host.applyPatch(ready, patch, etag, { keepOpaque: true }), updatedAt: Date.now() };
  host.storePlanRow(planVault, stored);
  if (stored.entityUri) host.setRecordRead(stored.id, stored.entityUri, stored);
}

function useOpenInItsVault(fallback: (id: string) => void) {
  const host = useStakeholderLinesHost();
  const openRecordInVault = host.useOpenRecordInVault();
  return useCallback(
    (uri: string) => {
      const ref = entityRefFromFact(uri);
      if (!ref) return;
      const vault = vaultNamespaceOfEntityUri(uri);
      if (vault && openRecordInVault) {
        openRecordInVault(vault, ref.id, { push: true });
        return;
      }
      fallback(ref.id);
    },
    [fallback, openRecordInVault],
  );
}

function useLoadedStakeholder(uri: string, vaultId: string): { label: string; handle: string | null } {
  const host = useStakeholderLinesHost();
  const ref = entityRefFromFact(uri);
  const list = host.useRecords(vaultId);
  const fromList = ref
    ? (list.data ?? []).find((r) => r.id === ref.id || r.entityUri === ref.uri || r.entityUri === uri)
    : undefined;
  // The record read the name control of `entity-ref-value` already holds, and not a fetch of our own: the chip name is that
  // control's read.
  const q = host.useRecordRead(ref, uri);
  const facts = fromList?.facts ?? q.data?.facts;
  const label = facts ? entityDisplayName(facts, { entityUri: uri, fallback: ref?.id || uri }) : ref?.id || uri;
  // The `@tag` beside the chip is the record's MAIN tag, read from the platform, ⛔ not the `tagString` fact of the
  // loaded record. It is the same cache entry the pane's Tags section changes, so Make main shows here at once.
  const main = host.useMainTag(uri);
  const handle = main.data?.known && main.data.tag ? `@${main.data.tag}` : null;
  return { label, handle };
}

function StakeholderChip({
  uri,
  vaultId,
  editing,
  busy,
  onOpen,
  onRemove,
}: {
  uri: string;
  vaultId: string;
  editing: boolean;
  busy: boolean;
  onOpen: (uri: string) => void;
  onRemove: () => void;
}) {
  const loaded = useLoadedStakeholder(uri, vaultId);
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {editing ? <RemoveControl label={`Remove ${loaded.label}`} disabled={busy} onClick={onRemove} /> : null}
      <EntityRefValue value={uri} vaultId={vaultId} onOpen={() => onOpen(uri)} quiet />
      {loaded.handle ? <span className="text-[13px] text-[var(--ink-faint)]">{loaded.handle}</span> : null}
    </span>
  );
}

type StakeholderSearchRole = "line" | "authority" | "owner" | "acts";

/** The line, Authority, and acts-for pickers do not share an answer: each role is its own cache entry. */
function stakeholderSearchKey(role: StakeholderSearchRole, vaultsKey: string, needle: string) {
  return ["stakeholder-search", role, vaultsKey, needle] as const;
}

/** Try again invalidates the picker's own cache entry for this text. */
function stakeholderIncomplete(
  host: StakeholderLinesHost,
  role: StakeholderSearchRole,
  vaultsKey: string,
  needle: string,
): PickerIncomplete {
  const text = needle.trim();
  return {
    none: SEARCH_INCOMPLETE_NONE,
    hits: SEARCH_INCOMPLETE_HITS,
    onRetry: () => {
      void host.invalidateSearch({ queryKey: stakeholderSearchKey(role, vaultsKey, text) });
    },
  };
}

function noteAnswer(_answer: PickerFind, _text: string): void {}

export function PlanStakeholders({
  record,
  vaultId,
  planVault = vaultId,
  editing,
  offer,
  onOpen,
  onNotice,
  onPicked,
}: {
  record: BaseRecord;
  vaultId: string;
  /** The record's own vault. The stakeholder relation is written there. */
  planVault?: string;
  editing: boolean;
  /** Show the search box even when the card is not in edit mode. Omitted: only while editing. */
  offer?: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
  /** A pick closed the quiet add. The card's edit mode is a separate flag. */
  onPicked?: () => void;
}) {
  const host = useStakeholderLinesHost();
  if (!(host.writePairRelation && host.endRelation && host.patchRecord && host.renderCreateStakeholder)) { editing = false; offer = false; }
  const showPicker = offer ?? editing;
  const relations = host.useRelations(record.id, record.entityUri ?? null);
  const types = host.useStakeholderKinds(showPicker);
  const vaults = host.useHeldVaults();
  const open = useOpenInItsVault(onOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pickerEpoch, setPickerEpoch] = useState(0);
  const [prefill, setPrefill] = useState("");
  const linkingTag = useRef<string | null>(null);
  const linking = useRef(new Set<string>());
  const names = types.data?.names ?? [];
  const linked = stakeholdersOf(relations.data);
  const marked = authoritiesOf(relations.data);
  // A Resource Owner is a special stakeholder: shown here marked, like an Authority (Development Resource card only).
  const owners = isResourceType(record.typeUri) && !host.hasSubstitutedType(record) ? resourceOwnersOf(relations.data) : [];
  const legacy = legacyAuthorityOf((record.served?.facts as Record<string, unknown> | undefined) ?? null);
  const legacyHolder = legacy && !marked.some((s) => sameRecord(s.uri, legacy.holder)) ? legacy.holder : null;
  const tags = stakeholderTagTexts(servedRaw(record, "stakeholders"));
  const none = linked.length === 0 && marked.length === 0 && owners.length === 0 && !legacyHolder && tags.length === 0;
  const [searchText, setSearchText] = useState("");
  const vaultsKey = vaults.join("|");

  async function saveFacts(build: (row: GridRecord) => Record<string, MergePatchValue>) {
    const row = host.liveRow(planVault, record.id, record);
    await writeFacts(host, planVault, row, build);
  }

  function fail(e: unknown) {
    const msg = writeNotice(e);
    setError(msg);
    onNotice(msg);
  }

  async function clearTag(tag: string | null) {
    if (!tag) return;
    await saveFacts((row) => ({ stakeholders: stakeholdersWithoutTag(servedRaw(row, "stakeholders"), tag) }));
  }

  async function linkUri(uri: string) {
    const full = uri.startsWith("http") ? uri : host.memberEntityUri(uri, null, vaultId);
    const current = host.getRelations(record.id, record.entityUri ?? null) ?? relations.data;
    const legacyNow = legacyAuthorityOf((host.liveRow(planVault, record.id, record).served?.facts as Record<string, unknown> | undefined) ?? null);
    if (
      authoritiesOf(current).some((s) => sameRecord(s.uri, full)) ||
      (legacyNow && sameRecord(legacyNow.holder, full))
    ) {
      setError("Already an Authority here.");
      return;
    }
    if (owners.length > 0 && resourceOwnersOf(current).some((s) => sameRecord(s.uri, full))) {
      setError("Already a Resource Owner here.");
      return;
    }
    if (alreadyLinked(current, full)) return;
    const row = host.liveRow(planVault, record.id, record);
    const tag = linkingTag.current;
    const written = await host.writePairRelation!({
      sourceId: row.id,
      targetId: full,
      sourceEntityUri: row.entityUri ?? null,
      targetEntityUri: full,
      typeCurie: STAKEHOLDER_RELATION_TYPE,
      roles: { source: STAKEHOLDER_ROLES.source, target: STAKEHOLDER_ROLES.target },
      extraFacts: { "a:relationType": STAKEHOLDER_RELATION_FACT },
      vaultNamespace: planVault,
    });
    const relation = written.uri ?? full;
    const nextRows: RecordRelation[] = [
      ...(host.getRelations(row.id, row.entityUri ?? null) ?? []),
      {
        relation,
        role: STAKEHOLDER_ROLES.source,
        type: STAKEHOLDER_RELATION_TYPE,
        members: [{ member: full, role: STAKEHOLDER_ROLES.target }],
      },
    ];
    host.setRelations(row.id, row.entityUri ?? null, nextRows);
    if (tag) {
      try {
        await clearTag(tag);
        linkingTag.current = null;
      } catch (e) {
        await host.endRelation!(relation, planVault).catch(() => undefined);
        host.setRelations(row.id, row.entityUri ?? null, (prev) =>
          (prev ?? []).filter((r) => r.relation !== relation),
        );
        throw e;
      }
    }
  }

  async function addLink(uri: string) {
    if (busy) return;
    // The same person picked twice before the first write answers: `busy` is state and still false, so guard by address.
    const key = uri.startsWith("http") ? uri : host.memberEntityUri(uri, null, vaultId);
    if (linking.current.has(key)) return;
    linking.current.add(key);
    setBusy(true);
    setError(null);
    try {
      await linkUri(uri);
      onNotice(null);
      onPicked?.();
    } catch (e) {
      fail(e);
    } finally {
      linking.current.delete(key);
      setBusy(false);
    }
  }

  async function removeLink(relation: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await host.endRelation!(relation, planVault);
      host.setRelations(record.id, record.entityUri ?? null, (prev) =>
        (prev ?? []).filter((r) => r.relation !== relation),
      );
      onNotice(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function removeTag(tag: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await clearTag(tag);
      onNotice(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2" data-testid="plan-stakeholders">
      {none ? null : (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {linked.map((s) => (
            <StakeholderChip
              key={s.relation}
              uri={s.uri}
              vaultId={vaultId}
              editing={editing}
              busy={busy}
              onOpen={open}
              onRemove={() => void removeLink(s.relation)}
            />
          ))}
          {marked.map((s) => (
            <span key={s.relation} className="inline-flex min-w-0 items-center gap-1">
              <EntityRefValue value={s.uri} vaultId={vaultId} onOpen={() => open(s.uri)} quiet />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-ghost)]">Authority</span>
            </span>
          ))}
          {owners.map((s) => (
            <span key={s.relation} className="inline-flex min-w-0 items-center gap-1">
              <EntityRefValue value={s.uri} vaultId={vaultId} onOpen={() => open(s.uri)} quiet />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-ghost)]">Resource Owner</span>
            </span>
          ))}
          {legacyHolder ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <EntityRefValue value={legacyHolder} vaultId={vaultId} onOpen={() => open(legacyHolder)} quiet />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-ghost)]">Authority</span>
            </span>
          ) : null}
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1">
              {editing ? <RemoveControl label={`Remove ${tag}`} disabled={busy} onClick={() => void removeTag(tag)} /> : null}
              <span className="text-[14px] text-[var(--ink)]">{tag}</span>
              {editing ? (
                <button
                  type="button"
                  className="min-h-11 px-1 text-sm text-[var(--accent)]"
                  disabled={busy}
                  onClick={() => {
                    linkingTag.current = tag;
                    setSearchText(tag);
                    setPrefill(tag);
                    setPickerEpoch((n) => n + 1);
                  }}
                >
                  Link
                </button>
              ) : null}
            </span>
          ))}
        </div>
      )}
      {none && relations.isError ? <p className="text-xs text-[var(--bad)]">Could not read stakeholders.</p> : null}
      {error ? (
        <p role="alert" className="text-[13px] text-[var(--bad)]">
          {error}
        </p>
      ) : null}
      {showPicker ? (
        <>
          <OrgRecordPicker
            key={pickerEpoch}
            vaultId={vaultId}
            label="Search"
            placeholder="Search stakeholders"
            untilEngaged
            exclude={linked.map((s) => s.uri)}
            find={(q) => host.findStakeholders(vaults, names, q)}
            queryKey={stakeholderSearchKey("line", vaultsKey, searchText.trim())}
            staleTime={30_000}
            searchOnMount={false}
            enabled={names.length > 0}
            onAnswer={noteAnswer}
            whenIncomplete={stakeholderIncomplete(host, "line", vaultsKey, searchText)}
            initialText={prefill}
            pendingText="Searching stakeholders…"
            errorText="Could not search stakeholders. That is not a statement that there are none."
            noneText="No stakeholder record matches."
            partialText="No match among the stakeholder records read; the list may not be whole."
            autoFocus={false}
            onTextChange={setSearchText}
            onPick={(hit) => void addLink(hit.uri)}
          />
          <button
            type="button"
            className="min-h-11 self-start text-left text-sm text-[var(--accent)]"
            disabled={busy}
            onClick={() => setCreating(true)}
          >
            + New stakeholder
          </button>
        </>
      ) : null}
      {creating
        ? host.renderCreateStakeholder!({
          open: true,
          stakeholders: true,
          source: null,
          drawnVaultIds: [vaultId, planVault],
          onClose: () => setCreating(false),
          onCreated: (id) => {
            setCreating(false);
            void host.invalidateSearch({ queryKey: ["stakeholder-search", "line"], refetchType: "active" });
            void (async () => {
              let uri = id;
              if (!/^https?:\/\//.test(id)) {
                const rec = await host.readRecord(id, planVault).catch(() => null);
                uri = rec?.entityUri || host.memberEntityUri(id, null, planVault);
              }
              await addLink(uri);
            })();
          },
        })
        : null}
    </div>
  );
}

function authorityText(record: BaseRecord): string | null {
  const raw = servedRaw(record, "authority");
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** One authority chip. Acts-for is read off the relation document (not the reverse-lookup row). */
function AuthorityChip({
  uri,
  relation,
  legacyActsFor,
  vaultId,
  planVault,
  editing,
  busy,
  open,
  findActs,
  vaultsKey,
  offer,
  onRemove,
  onActsFor,
  onPicked,
}: {
  uri: string;
  /** Null when this chip is the deprecated record-level holder, not a relation yet. */
  relation: string | null;
  legacyActsFor: string | null;
  vaultId: string;
  planVault: string;
  editing: boolean;
  busy: boolean;
  open: (uri: string) => void;
  findActs: (text: string) => Promise<{ hits: { uri: string; label: string }[]; complete: boolean }>;
  vaultsKey: string;
  /** Show the acts-for search even when the card is not in edit mode. */
  offer?: boolean;
  onRemove: () => void;
  onActsFor: (actsFor: string | null) => void;
  onPicked?: () => void;
}) {
  const showPicker = offer ?? editing;
  const host = useStakeholderLinesHost();
  const [actsText, setActsText] = useState("");
  const loaded = useLoadedStakeholder(uri, vaultId);
  const doc = host.useRelationDoc(relation, planVault);
  const fromDoc = relation ? actsForOnRelation(doc.data) : null;
  const actsFor = fromDoc ?? (relation ? null : legacyActsFor);
  return (
    <span className="inline-flex min-w-0 flex-col gap-1" data-authority-for={uri}>
      <span className="inline-flex min-w-0 items-center gap-1">
        {editing ? <RemoveControl label={`Remove ${loaded.label}`} disabled={busy} onClick={onRemove} /> : null}
        <EntityRefValue value={uri} vaultId={vaultId} onOpen={() => open(uri)} quiet />
      </span>
      {actsFor || showPicker ? (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
        <span className="text-[13px] text-[var(--ink-faint)]">acts for</span>
        {actsFor ? (
          <>
            {editing ? (
              <RemoveControl label={`Remove acts for ${loaded.label}`} disabled={busy} onClick={() => onActsFor(null)} />
            ) : null}
            <EntityRefValue value={actsFor} vaultId={vaultId} onOpen={() => open(actsFor)} quiet />
          </>
        ) : null}
      </span>
      ) : null}
      {showPicker ? (
        <OrgRecordPicker
          vaultId={vaultId}
          label={`Acts for ${loaded.label}`}
          placeholder="Search records"
          untilEngaged
          exclude={actsFor ? [actsFor] : []}
          find={findActs}
          queryKey={stakeholderSearchKey("acts", vaultsKey, actsText.trim())}
          staleTime={30_000}
          searchOnMount={false}
          onAnswer={noteAnswer}
          whenIncomplete={stakeholderIncomplete(host, "acts", vaultsKey, actsText)}
          pendingText="Searching records…"
          errorText="Could not search records. That is not a statement that there are none."
          noneText="No record matches."
          partialText="No match among the records read; the list may not be whole."
          autoFocus={false}
          onTextChange={setActsText}
          onPick={(hit) => {
            onPicked?.();
            onActsFor(hit.uri);
          }}
        />
      ) : null}
    </span>
  );
}

export function PlanAuthority({
  record,
  vaultId,
  planVault = vaultId,
  editing,
  offer,
  personOnly = false,
  resourceOwner = false,
  onOpen,
  onNotice,
  onPicked,
}: {
  record: BaseRecord;
  vaultId: string;
  /** The record's own vault. The authority relation is written there. */
  planVault?: string;
  editing: boolean;
  /** Show the search box even when the card is not in edit mode. Omitted: only while editing. */
  offer?: boolean;
  /** A constraint: every stakeholder is listed, and only a person may be chosen. */
  personOnly?: boolean;
  /** The Resource Owner line of a Development Resource: this component with `t:ResourceOwnerOf`, no old holder or text. */
  resourceOwner?: boolean;
  onOpen: (id: string) => void;
  onNotice: (notice: string | null) => void;
  /** A pick closed the quiet add. */
  onPicked?: () => void;
}) {
  const host = useStakeholderLinesHost();
  if (!(host.endRelation && host.writeAuthorityRelation && host.endThenWriteAuthority && host.patchRecord && host.renderCreateStakeholder)) { editing = false; offer = false; }
  const showPicker = offer ?? editing;
  const word = resourceOwner ? "Resource Owner" : "Authority";
  const relationType = resourceOwner ? RESOURCE_OWNER_RELATION_TYPE : undefined;
  const relations = host.useRelations(record.id, record.entityUri ?? null);
  const people = host.usePersonAuthorities(record, vaultId);
  const types = host.useStakeholderKinds(showPicker);
  const vaults = host.useHeldVaults();
  const open = useOpenInItsVault(onOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pickerEpoch, setPickerEpoch] = useState(0);
  const [prefill, setPrefill] = useState("");
  const linkingText = useRef(false);
  const picking = useRef(new Set<string>());
  const names = types.data?.names ?? [];
  const kindSet = types.data;
  const heldOf = (rows: readonly RecordRelation[] | null | undefined) => (resourceOwner ? resourceOwnersOf(rows) : authoritiesOf(rows));
  const auths = heldOf(relations.data);
  const legacy = resourceOwner ? null : legacyAuthorityOf((record.served?.facts as Record<string, unknown> | undefined) ?? null);
  const legacyRow = legacy && !auths.some((s) => sameRecord(s.uri, legacy.holder)) ? legacy : null;
  const text = resourceOwner ? null : authorityText(record);
  const none = auths.length === 0 && !legacyRow && !text;
  const [holderText, setHolderText] = useState("");
  const vaultsKey = vaults.join("|");
  const findHolder = useCallback(
    async (q: string) => {
      const page = await host.findStakeholders(vaults, names, q);
      if (!personOnly) return page;
      return {
        ...page,
        hits: page.hits.map((h) =>
          h.typeName && isPersonStakeholderType(h.typeName, kindSet) ? h : { ...h, note: NOT_A_PERSON },
        ),
      };
    },
    [vaults, names, personOnly, kindSet],
  );
  const findActs = useCallback((q: string) => host.findAnyRecords(vaults, q), [vaults]);

  function refuse(sentence: string) {
    setError(sentence);
    onNotice(sentence);
  }

  function personHit(typeUri: string | null | undefined): boolean {
    const set = host.getKindSet() ?? kindSet;
    return isPersonStakeholderType(typeUri, set);
  }

  function currentRelations(row: BaseRecord): RecordRelation[] {
    return host.getRelations(row.id, row.entityUri ?? null) ?? relations.data ?? [];
  }

  function remember(row: BaseRecord, written: RecordRelation, drop: readonly string[] = []) {
    host.setRelations(row.id, row.entityUri ?? null, (prev) => [
      ...(prev ?? []).filter((r) => r.relation !== written.relation && !drop.includes(r.relation)),
      written,
    ]);
  }

  async function saveFacts(build: (row: GridRecord) => Record<string, MergePatchValue>) {
    const row = host.liveRow(planVault, record.id, record);
    await writeFacts(host, planVault, row, build);
  }

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      onNotice(null);
    } catch (e) {
      const msg = writeNotice(e);
      setError(msg);
      onNotice(msg);
    } finally {
      setBusy(false);
    }
  }

  async function addUri(uri: string) {
    const full = uri.startsWith("http") ? uri : host.memberEntityUri(uri, null, vaultId);
    // A second pick of the same person while the first write runs is ignored (`busy` is state, so two quick picks both see it false).
    if (picking.current.has(full)) return;
    picking.current.add(full);
    try {
      await addUriOnce(full);
    } finally {
      picking.current.delete(full);
    }
  }

  async function addUriOnce(full: string) {
    const row = host.liveRow(planVault, record.id, record);
    const current = currentRelations(row);
    const legacyNow = resourceOwner ? null : legacyAuthorityOf((row.served?.facts as Record<string, unknown> | undefined) ?? null);
    const already =
      heldOf(current).some((s) => sameRecord(s.uri, full)) ||
      (legacyNow != null && sameRecord(legacyNow.holder, full));
    if (already) {
      if (linkingText.current) {
        linkingText.current = false;
        await saveFacts(() => ({ authority: null }));
      }
      return;
    }
    const input = {
      recordId: row.id,
      recordUri: row.entityUri ?? null,
      stakeholderUri: full,
      vaultId: planVault,
      ...(relationType ? { relationType } : {}),
    };
    const plain = stakeholdersOf(current).find((s) => sameRecord(s.uri, full));
    // End the plain stakeholder first, then write the authority, so the two never both hold.
    const written = plain ? await host.endThenWriteAuthority!(plain.relation, input) : await host.writeAuthorityRelation!(input);
    remember(row, written, plain ? [plain.relation] : []);
    if (linkingText.current) {
      linkingText.current = false;
      await saveFacts(() => ({ authority: null }));
    }
  }

  async function changeActs(link: LinkedStakeholder, actsFor: string | null) {
    const row = host.liveRow(planVault, record.id, record);
    const written = await host.endThenWriteAuthority!(link.relation, {
      recordId: row.id,
      recordUri: row.entityUri ?? null,
      stakeholderUri: link.uri,
      vaultId: planVault,
      actsFor,
      ...(relationType ? { relationType } : {}),
    });
    remember(row, written, [link.relation]);
  }

  async function changeLegacyActs(actsFor: string | null) {
    const row = host.liveRow(planVault, record.id, record);
    const legacyNow = legacyAuthorityOf((row.served?.facts as Record<string, unknown> | undefined) ?? null);
    if (!legacyNow) return;
    if (!actsFor) {
      await saveFacts(() => ({ authorityActsFor: null }));
      return;
    }
    const written = await host.writeAuthorityRelation!({
      recordId: row.id,
      recordUri: row.entityUri ?? null,
      stakeholderUri: legacyNow.holder,
      vaultId: planVault,
      actsFor,
    });
    remember(row, written);
    await saveFacts(() => ({ authorityHolder: null, authorityActsFor: null }));
  }

  return (
    <div className="flex min-w-0 w-full flex-1 flex-col gap-2" data-testid={resourceOwner ? "plan-resource-owner" : "plan-authority"}>
      {auths.length > 0 || legacyRow ? (
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          {auths.map((s) => (
            <AuthorityChip
              key={s.relation}
              uri={s.uri}
              relation={s.relation}
              legacyActsFor={null}
              vaultId={vaultId}
              planVault={planVault}
              editing={editing}
              busy={busy}
              open={open}
              findActs={findActs}
              vaultsKey={vaults.join("|")}
              offer={showPicker}
              onPicked={onPicked}
              onRemove={() => {
                if (personOnly && removingLastPersonAuthority(people.people, s.uri)) {
                  refuse(CONSTRAINT_LAST_PERSON);
                  return;
                }
                void run(async () => {
                  await host.endRelation!(s.relation, planVault);
                  host.setRelations(record.id, record.entityUri ?? null, (prev) =>
                    (prev ?? []).filter((r) => r.relation !== s.relation),
                  );
                });
              }}
              onActsFor={(next) => void run(() => changeActs(s, next))}
            />
          ))}
          {legacyRow ? (
            <AuthorityChip
              key={`legacy:${legacyRow.holder}`}
              uri={legacyRow.holder}
              relation={null}
              legacyActsFor={legacyRow.actsFor}
              vaultId={vaultId}
              planVault={planVault}
              editing={editing}
              busy={busy}
              open={open}
              findActs={findActs}
              vaultsKey={vaults.join("|")}
              offer={showPicker}
              onPicked={onPicked}
              onRemove={() => void run(() => saveFacts(() => ({ authorityHolder: null, authorityActsFor: null })))}
              onActsFor={(next) => void run(() => changeLegacyActs(next))}
            />
          ) : null}
        </div>
      ) : null}
      {text ? (
        <div className="flex w-full min-w-0 items-center gap-1">
          {editing ? <RemoveControl label={`Remove ${text}`} disabled={busy} onClick={() => void run(() => saveFacts(() => ({ authority: null })))} /> : null}
          <div className="min-w-0 w-full flex-1">
            <FieldRow
              label="Authority text"
              value={text}
              readOnly={!showPicker}
              onCommitValue={(v) => {
                void run(() => saveFacts(() => ({ authority: v.trim() ? v.trim() : null })));
              }}
            />
          </div>
          {editing ? (
            <button
              type="button"
              className="min-h-11 px-1 text-sm text-[var(--accent)]"
              disabled={busy}
              onClick={() => {
                linkingText.current = true;
                setHolderText(text);
                setPrefill(text);
                setPickerEpoch((n) => n + 1);
              }}
            >
              Link
            </button>
          ) : null}
        </div>
      ) : null}
      {none && relations.isError ? <p className="text-xs text-[var(--bad)]">Could not read stakeholders.</p> : null}
      {error ? (
        <p role="alert" className="text-[13px] text-[var(--bad)]">
          {error}
        </p>
      ) : null}
      {showPicker ? (
        <>
          <OrgRecordPicker
            key={pickerEpoch}
            vaultId={vaultId}
            label={word}
            placeholder="Search stakeholders"
            untilEngaged
            exclude={[...auths.map((s) => s.uri), ...(legacyRow ? [legacyRow.holder] : [])]}
            find={findHolder}
            queryKey={stakeholderSearchKey(resourceOwner ? "owner" : "authority", vaultsKey, holderText.trim())}
            staleTime={30_000}
            searchOnMount={false}
            enabled={names.length > 0}
            onAnswer={noteAnswer}
            whenIncomplete={stakeholderIncomplete(host, resourceOwner ? "owner" : "authority", vaultsKey, holderText)}
            initialText={prefill}
            pendingText="Searching stakeholders…"
            errorText="Could not search stakeholders. That is not a statement that there are none."
            noneText="No stakeholder record matches."
            partialText="No match among the stakeholder records read; the list may not be whole."
            autoFocus={false}
            onTextChange={setHolderText}
            onPick={(hit) => {
              if (personOnly && !personHit(hit.typeName)) {
                refuse(CONSTRAINT_AUTHORITY_WHY);
                return;
              }
              onPicked?.();
              void run(() => addUri(hit.uri));
            }}
          />
          <button
            type="button"
            className="min-h-11 self-start text-left text-sm text-[var(--accent)]"
            disabled={busy}
            onClick={() => setCreating(true)}
          >
            + New stakeholder
          </button>
        </>
      ) : null}
      {creating
        ? host.renderCreateStakeholder!({
          open: true,
          stakeholders: true,
          source: null,
          drawnVaultIds: [vaultId, planVault],
          onClose: () => setCreating(false),
          onCreated: (id) => {
            setCreating(false);
            void host.invalidateSearch({ queryKey: ["stakeholder-search", "authority"], refetchType: "active" });
            void (async () => {
              let uri = id;
              let rec: Awaited<ReturnType<StakeholderLinesHost["readRecord"]>> = null;
              if (!/^https?:\/\//.test(id)) {
                rec = await host.readRecord(id, planVault).catch(() => null);
                uri = rec?.entityUri || host.memberEntityUri(id, null, planVault);
              } else if (personOnly) {
                rec = await host.readRecord(id, id).catch(() => null);
              }
              if (personOnly && !personHit(rec?.typeUri)) {
                refuse(CONSTRAINT_AUTHORITY_WHY);
                return;
              }
              onPicked?.();
              await run(() => addUri(uri));
            })();
          },
        })
        : null}
    </div>
  );
}
