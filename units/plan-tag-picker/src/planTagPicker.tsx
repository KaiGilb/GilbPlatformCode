// The picker a Plan card uses to link to another Plan record by its tag, and the pieces the card's link views share.
// The picker is OrgRecordPicker. The find is the record vault's own search, not the grid's first page.

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { EntityRefValue, refDisplayName } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { OrgRecordPicker, type PickerFind, type PickerRow } from "@kaigilb/gilbplatformcode-record-picker";
import { duplicateTagSentence, recordTag } from "@kaigilb/gilbplatformcode-plan-links-model";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { PlanTagPickerHostContext, type PlanTagPickerHost } from "./planTagPickerHost";

/** A Value (or other non-tag) create is withheld when the search did not see every record. */
export const SEARCH_INCOMPLETE_CREATE =
  "Not every record could be searched, so Create is not offered. Try again.";

export const SEARCH_ERROR = "Could not search — try again";
const TAG_PART = /^[A-Z][a-zA-Z]*$/;

function usePlanTagPickerHost(): PlanTagPickerHost {
  const host = useContext(PlanTagPickerHostContext);
  if (!host) throw new Error("plan-tag-picker: wrap the app in <PlanTagPickerHostContext.Provider value={host}>");
  return host;
}

/** A plan keyword: every `.` segment is one capital word (`Door.Close`, `X`). `A.` and `speed` are not. */
export function tagShaped(text: string): boolean {
  const parts = text.split(".");
  return parts.length > 0 && parts.every((part) => TAG_PART.test(part));
}

export function planSearchKey(vaultId: string, typeNamesKey: string, needle: string) {
  return ["plan-search", vaultId, typeNamesKey, needle] as const;
}

/** Create / incomplete for a plan picker. The answer is the query's own result, including each hit's row. */
export function usePlanPickerFind(planVault: string, typeNames: readonly string[], draft: string) {
  const namesKey = typeNames.join("\0");
  const names = useMemo(() => (namesKey ? namesKey.split("\0") : []), [namesKey]);
  const host = usePlanTagPickerHost();
  const [answer, setAnswer] = useState<PickerFind | null>(null);
  const [answerText, setAnswerText] = useState("");
  const find = useCallback(
    async (q: string): Promise<PickerFind> => {
      const page = await host.findPlanRecords(planVault, q, names);
      // Label only. The type name is the picker's own, and a plan hit that carries one draws it beside the tag.
      return {
        hits: page.hits.map((hit) => ({ uri: hit.uri, label: hit.label, row: hit.row })),
        complete: page.complete,
      };
    },
    [names, planVault, host],
  );
  const onAnswer = useCallback((next: PickerFind, text: string) => {
    setAnswerText(text);
    setAnswer(next);
  }, []);
  const text = draft.trim();
  const stored = answer && answerText === text ? answer : undefined;
  const settled = stored !== undefined;
  const hits = stored?.hits ?? [];
  const complete = stored?.complete === true;
  const exact = text !== "" && hits.some((hit) => hit.label === text || (hit.row ? recordTag(hit.row.facts) === text : false));
  const needsTag = settled && text !== "" && !exact && tagShaped(text);
  const [tagFree, setTagFree] = useState<"no" | "wait" | "free" | "taken" | "error">("no");
  useEffect(() => {
    if (!needsTag) {
      setTagFree("no");
      return;
    }
    let cancel = false;
    setTagFree("wait");
    host.tagUsed(planVault, text).then(
      (used) => {
        if (!cancel) setTagFree(used ? "taken" : "free");
      },
      () => {
        if (!cancel) setTagFree("error");
      },
    );
    return () => {
      cancel = true;
    };
  }, [needsTag, text, planVault]);
  // A tag-shaped text still asks the vault. Any other text needs a search that saw every record.
  const canCreate = settled && text !== "" && !exact && (tagShaped(text) ? tagFree === "free" : complete);
  const showIncomplete = settled && text !== "" && !complete && !tagShaped(text);
  const queryKey = planSearchKey(planVault, namesKey, text);
  const retry = useCallback(() => {
    void host.invalidateSearch(queryKey);
  }, [namesKey, planVault, host, text]);
  const rowFor = useCallback(
    (uri: string) => (hits.find((hit) => hit.uri === uri || hit.row?.id === uri)?.row as BaseRecord | undefined) ?? null,
    [hits],
  );
  return { find, onAnswer, queryKey, canCreate, showIncomplete, retry, tagFailed: tagFree === "error", rowFor };
}

export function rowOnHit(hit: { uri: string; row?: PickerRow }): BaseRecord | null {
  return (hit.row as BaseRecord | undefined) ?? null;
}

export function chosenRow(pool: readonly GridRecord[], hitUri: string, read: BaseRecord | null): GridRecord | null {
  const live = pool.find((row) => row.entityUri === hitUri || row.id === hitUri || (read != null && row.id === read.id));
  if (live) return live;
  if (!read) return null;
  return { updatedAt: Date.now(), ...read };
}

export function httpStatus(e: unknown): number | undefined {
  if (e && typeof e === "object" && "status" in e && typeof (e as { status: unknown }).status === "number") {
    return (e as { status: number }).status;
  }
  return undefined;
}

export function noticeFor(e: unknown, tag: string): string {
  if (httpStatus(e) === 409) return duplicateTagSentence(tag);
  return e instanceof Error ? e.message : "Couldn't save — your change was rolled back. Try again.";
}

export function TagLink({
  id,
  entityUri,
  facts,
  vaultId,
  onOpen,
}: {
  id: string;
  entityUri?: string;
  facts: Record<string, string>;
  vaultId: string;
  onOpen: (id: string) => void;
}) {
  if (entityUri) return <EntityRefValue value={entityUri} vaultId={vaultId} onOpen={onOpen} quiet />;
  const name = recordTag(facts) || refDisplayName(facts, null);
  return (
    <button type="button" onClick={() => onOpen(id)} className="text-left text-[14px] font-medium text-[var(--ink)] truncate">
      {name}
    </button>
  );
}

export function PlanTagPicker({
  vaultId,
  planVault = vaultId,
  ariaLabel,
  placeholder,
  kindLabel,
  pool,
  typeName,
  typeNames,
  excluded,
  busy,
  onChoose,
  onCreate,
  creates,
}: {
  vaultId: string;
  /** The record's own vault. Search, the tag check, and the picker query use it. */
  planVault?: string;
  ariaLabel: string;
  placeholder: string;
  kindLabel: "Function" | "Value" | "Solution";
  pool: readonly GridRecord[];
  typeName: string;
  /** When set, a hit may be any of these types. `typeName` stays the create type. */
  typeNames?: readonly string[];
  excluded: ReadonlySet<string>;
  busy: boolean;
  onChoose: (row: GridRecord) => void;
  onCreate: (tag: string) => void;
  /** When set, these replace the one create button. Each label is the word in `Create <label> "<text>"`. */
  creates?: readonly { label: string; onCreate: (tag: string) => void }[];
}) {
  const [draft, setDraft] = useState("");
  const names = typeNames ?? [typeName];
  const search = usePlanPickerFind(planVault, names, draft);
  const text = draft.trim();
  const exclude = useMemo(() => [...excluded], [excluded]);
  const createButtons = creates && creates.length > 0 ? creates : [{ label: kindLabel, onCreate }];

  return (
    <div className="flex flex-col gap-2" data-testid="plan-link-picker">
      <OrgRecordPicker
        vaultId={planVault}
        label={ariaLabel}
        placeholder={placeholder}
        exclude={exclude}
        find={search.find}
        queryKey={search.queryKey}
        staleTime={30_000}
        searchOnMount={false}
        onAnswer={search.onAnswer}
        hitsTestId="plan-link-hits"
        pendingText="Searching…"
        errorText={SEARCH_ERROR}
        noneText=""
        partialText=""
        autoFocus={false}
        untilEngaged
        onTextChange={setDraft}
        onPick={(hit) => {
          const chosen = chosenRow(pool, hit.uri, rowOnHit(hit) ?? search.rowFor(hit.uri));
          if (chosen) onChoose(chosen);
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
      {search.canCreate
        ? createButtons.map((create) => (
            <button
              key={create.label}
              type="button"
              data-testid="plan-link-create"
              className="min-h-11 w-full rounded-md border border-[var(--line)] px-2 text-left text-sm text-[var(--ink)] disabled:opacity-50"
              disabled={busy}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => create.onCreate(text)}
            >
              {`Create ${create.label} "${text}"`}
            </button>
          ))
        : null}
    </div>
  );
}
