// One source control for every Plan line. A person, organization or AI agent that said it is
// a:statedBy. A document it was taken from (a file the Files section lists) or a decision is
// a:derivedFrom. Words are only for someone with no record yet.
// Reading shows "Source: <name> · from <document>" and nothing else. The picker, and "+ New stakeholder",
// open only while this line is being edited (or the card is in Edit). The new record
// is this line's source, through the same Stakeholders create dialog as the Stakeholder line.

import { useCallback, useContext, useMemo, useRef, useState } from "react";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { EntityRefValue } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { OrgRecordPicker, type OrgRecordHit } from "@kaigilb/gilbplatformcode-record-picker";
import { entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";
import {
  asPlanSource,
  planSourceEmpty,
  sourceWithDerivedFrom,
  sourceWithStatedBy,
  sourceWithText,
  type PlanSourceValue,
} from "@kaigilb/gilbplatformcode-plan-card-facts";
import { typeLocalName } from "@kaigilb/gilbplatformcode-type-curie";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { PlanSourceHostContext, type PlanSourceFile, type PlanSourceHost } from "./planSourceHost";

/**
 * The vault namespace named by an entity address: the segment the address carries (`/vault/e/` or `/base/e/`), with the origin before it,
 * or `null` when the address names neither. The namespace is never a fixed `/base`: a `/vault` entity is paired with its own `/vault`.
 */
function vaultNamespaceOfEntityUri(entityUri: string): string | null {
  for (const segment of ["vault", "base"]) {
    const marker = `/${segment}/e/`;
    const at = entityUri.indexOf(marker);
    if (at === -1) continue;
    const origin = entityUri.slice(0, at);
    if (origin === "") return null;
    return `${origin}/${segment}`;
  }
  return null;
}

export const PLAN_SOURCE_PLACEHOLDER = "Source";
/** The heading above the files in the source picker. A pick from this group is a:derivedFrom. */
export const PLAN_SOURCE_DOCUMENTS = "Documents";

/**
 * The files the Files section lists (live, in the held vaults), matched by the Files section's own search
 * (`matchWorkingSetQuery`: name, then type). Nothing is offered for an empty search.
 */
function documentHits(host: PlanSourceHost, files: readonly PlanSourceFile[], text: string): OrgRecordHit[] {
  if (!text.trim()) return [];
  const items = files.map((f) => ({
    id: f.id,
    vaultId: f.sourceVaultId,
    typeUri: f.typeUri ?? "t:File",
    name: f.name,
    updatedAt: f.updatedAt,
    _file: f,
  }));
  const seen = new Set<string>();
  const hits: OrgRecordHit[] = [];
  for (const { _file: f } of host.matchWorkingSetQuery(items, text)) {
    if (!f.entityUri || seen.has(f.entityUri)) continue;
    seen.add(f.entityUri);
    hits.push({ uri: f.entityUri, label: f.name, typeName: typeLocalName(f.typeUri ?? "t:File"), group: PLAN_SOURCE_DOCUMENTS });
  }
  return hits;
}

function usePlanSourceHost(): PlanSourceHost {
  const host = useContext(PlanSourceHostContext);
  if (!host) throw new Error("plan-source: wrap the app in <PlanSourceHostContext.Provider value={host}>");
  return host;
}

function useOpen(fallback: (id: string) => void) {
  const host = usePlanSourceHost();
  const shell = host.useShell();
  return useCallback(
    (uri: string) => {
      const ref = entityRefFromFact(uri);
      if (!ref) return;
      const vault = vaultNamespaceOfEntityUri(uri);
      if (vault && shell.openRecordInVault) {
        shell.openRecordInVault(vault, ref.id, { push: true });
        return;
      }
      fallback(ref.id);
    },
    [fallback, shell.openRecordInVault],
  );
}

export function PlanSource({
  value,
  editing,
  vaultId,
  record,
  inputLabel,
  onOpen,
  onCommit,
  offerNewStakeholder = true,
}: {
  value: PlanSourceValue | string | null | undefined;
  /** The line is being edited, or the card is in Edit: the picker is open. Reading: a name, or nothing. */
  editing: boolean;
  vaultId: string;
  record: BaseRecord;
  /** Accessible name of the picker. The visible word is "Source". */
  inputLabel: string;
  onOpen: (id: string) => void;
  onCommit: (next: PlanSourceValue) => void;
  /** Show "+ New stakeholder" under the picker (default true). */
  offerNewStakeholder?: boolean;
}) {
  const host = usePlanSourceHost();
  const source = asPlanSource(value);
  const filled = !planSourceEmpty(source);
  const openRecord = useOpen(onOpen);
  const shell = host.useShell();
  const vaults = useMemo(() => host.heldVaultIds(shell.vaults ?? []), [shell.vaults]);
  const types = host.useStakeholderTypes(editing);
  const names = types.data?.names ?? [];
  const files = host.useVaultFilesMulti(editing ? vaults : [], "live");
  const filesRef = useRef(files.data);
  filesRef.current = files.data;
  const filesState = `${files.data.length}:${files.isPending ? "p" : "r"}:${files.error ? "e" : "o"}`;
  const find = useCallback(
    async (text: string) => {
      const people = await host.findStakeholderRecords(vaults, names, text);
      return {
        hits: [...people.hits, ...documentHits(host, filesRef.current, text)],
        complete: people.complete && !files.isPending && !files.error,
        vaultsMissed: people.vaultsMissed,
      };
    },
    [vaults, names, files.isPending, files.error],
  );
  const [epoch, setEpoch] = useState(0);
  const [creating, setCreating] = useState(false);

  function commit(next: PlanSourceValue) {
    setEpoch((n) => n + 1);
    onCommit(next);
  }

  // Nothing was said, and the line is not being edited: draw nothing.
  if (!filled && !editing) return null;

  const face = (
    <span className="inline-flex min-w-0 flex-wrap items-center justify-end gap-x-1">
      <span>Source:</span>
      {source.statedBy ? (
        <>
          {" "}
          <EntityRefValue value={source.statedBy} vaultId={vaultId} onOpen={() => openRecord(source.statedBy!)} quiet />
        </>
      ) : null}
      {source.derivedFrom ? (
        <>
          {source.statedBy ? " \u00B7 from " : " from "}
          <EntityRefValue value={source.derivedFrom} vaultId={vaultId} onOpen={() => openRecord(source.derivedFrom!)} quiet />
        </>
      ) : null}
      {source.text ? <span>{` ${source.text}`}</span> : null}
    </span>
  );

  return (
    <div
      data-plan-source={inputLabel}
      data-editing={editing ? "true" : "false"}
      className="flex w-full flex-col items-end gap-1 text-right text-[12px] text-[var(--ink-soft)]"
    >
      {filled ? (
        <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-1">
          {editing ? <RemoveControl label="Remove source" disabled={false} onClick={() => commit({})} /> : null}
          {face}
        </span>
      ) : null}
      {editing ? (
        <div className="flex w-full max-w-sm flex-col items-end">
          <div className="w-full">
            <OrgRecordPicker
              key={epoch}
              vaultId={vaultId}
              label={inputLabel}
              placeholder={PLAN_SOURCE_PLACEHOLDER}
              find={find}
              findKey={`plan-source:${names.join("|")}:${vaults.join("|")}:${filesState}`}
              pendingText="Searching stakeholders…"
              errorText="Could not search stakeholders. That is not a statement that there are none."
              noneText="No stakeholder or document matches."
              partialText="No match among the stakeholder records read; the list may not be whole."
              autoFocus={false}
              untilEngaged
              onPick={(hit) =>
                commit(hit.group === PLAN_SOURCE_DOCUMENTS ? sourceWithDerivedFrom(source, hit.uri) : sourceWithStatedBy(source, hit.uri))
              }
              whenNoMatch={(typed) => (
                <button
                  type="button"
                  className="min-h-11 self-start text-left text-sm text-[var(--accent)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(sourceWithText(source, typed))}
                >
                  {`Use "${typed}" as text`}
                </button>
              )}
            />
          </div>
          {offerNewStakeholder ? (
            <button
              type="button"
              className="min-h-11 self-end text-left text-sm text-[var(--accent)]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setCreating(true)}
            >
              + New stakeholder
            </button>
          ) : null}
        </div>
      ) : null}
      {creating ? (
        <host.ConnectedCreateDialog
          open
          stakeholders
          source={null}
          drawnVaultIds={[vaultId]}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            void (async () => {
              let uri = id;
              if (!/^https?:\/\//.test(id)) {
                const rec = await host.readRecord(id, record.entityUri ?? vaultId).catch(() => null);
                uri = rec?.entityUri || host.memberEntityUri(id, null, vaultId);
              }
              commit(sourceWithStatedBy(source, uri));
            })();
          }}
        />
      ) : null}
    </div>
  );
}
