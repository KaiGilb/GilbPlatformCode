/**
 * Choose ONE record: a search box with a drop-down or list of hits. Type to search the records of the vault that holds the
 * card; the list says when it is not whole (never "no such record" from a partial walk). The caller decides what is searched.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { OrgRecordHit } from "./types";
import { useDebouncedValue } from "./useDebouncedValue";

/** A newer keystroke resets this. 250 ms is the floor for a search that asks every held vault. */
const SEARCH_DEBOUNCE_MS = 250;

const VAULTS_MISSED = "Some vaults could not be searched.";

export type PickerFind = { hits: OrgRecordHit[]; complete: boolean; vaultsMissed?: boolean };

export interface PickerQueryArgs {
  key: readonly unknown[];
  run: () => Promise<PickerFind>;
  enabled: boolean;
  staleTime: number;
}
export interface PickerQueryResult {
  data?: PickerFind;
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
}
export type UsePickerQuery = (a: PickerQueryArgs) => PickerQueryResult;
export const PickerQueryContext = createContext<UsePickerQuery | null>(null);

export type PickerIncomplete = {
  /** Shown, with a Try again button, when the answer is not whole and there are no hits. */
  none: string;
  /** Shown under the hits when the answer is not whole and some hits came back. */
  hits: string;
  onRetry: () => void;
};

export function OrgRecordPicker({
  vaultId,
  exclude = [],
  onPick,
  onCancel,
  autoFocus = true,
  placeholder = "Search organizations",
  label = "Organization",
  find,
  findKey,
  initialText = "",
  hitsTestId = "org-record-hits",
  pendingText = "Searching organizations…",
  errorText = "Could not search organizations. That is not a statement that there are none.",
  noneText = "No organization record matches.",
  partialText = "No match among the records read; the list may not be whole.",
  onTextChange,
  untilEngaged = false,
  whenNoMatch,
  staleTime = 10_000,
  queryKey,
  onAnswer,
  searchOnMount = true,
  enabled = true,
  whenIncomplete,
}: {
  /** The vault that holds the card: the records offered are its own, unless `find` says otherwise. */
  vaultId: string;
  /** Addresses not offered (the record itself, or one already on the line). */
  exclude?: readonly string[];
  onPick: (hit: OrgRecordHit) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  label?: string;
  /** Where the hits come from. */
  find: (text: string) => Promise<PickerFind>;
  /** Cache identity for the find. Defaults to `label`. */
  findKey?: string;
  /** Text the box opens with. The first search uses it at once, not after the debounce. */
  initialText?: string;
  hitsTestId?: string;
  pendingText?: string;
  errorText?: string;
  /** Shown when the find finished and said it was whole. Empty: say nothing. */
  noneText?: string;
  /** Shown when the find finished and the list may not be whole. Empty: say nothing. */
  partialText?: string;
  onTextChange?: (text: string) => void;
  /**
   * When set, the list stays hidden until the box is focused or has text.
   * Omitted: the list shows hits as soon as the find returns.
   */
  untilEngaged?: boolean;
  /**
   * Typed text, and the find finished with no hit. The caller decides what
   * storing those words means. Omitted: only the miss line, as before.
   */
  whenNoMatch?: (text: string) => ReactNode;
  /** How long a finished find may be reused. A caller that wants a remount to search again passes 0. */
  staleTime?: number;
  /**
   * Cache key for this find. Default: the picker's own key, including the debounced text.
   * A caller passes its own key (including the current text) so Try again invalidates that entry.
   */
  queryKey?: readonly unknown[];
  /** An answer arrived for the current debounced text. */
  onAnswer?: (answer: PickerFind, text: string) => void;
  /**
   * When false, an empty box waits until it is focused or opened.
   * Omitted: search on mount, so a closed picker can still say a vault was missed.
   */
  searchOnMount?: boolean;
  /** When false, the box is shown and nothing is searched. The caller's kinds may still be loading. */
  enabled?: boolean;
  /** Say the search was not whole, instead of `noneText`. */
  whenIncomplete?: PickerIncomplete;
}) {
  const [text, setText] = useState(initialText);
  const trimmed = text.trim();
  const debounced = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS);
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Until engaged, the list is a drop-down: open on focus or typing, closed by Escape, a pick, or a click outside.
  // Blur does not close it (a scrollbar click would). Without untilEngaged the list stays.
  const engaged = !untilEngaged || open;
  const onText = useRef(onTextChange);
  onText.current = onTextChange;
  const answerRef = useRef(onAnswer);
  answerRef.current = onAnswer;
  useEffect(() => {
    onText.current?.(text);
  }, [text]);
  useEffect(() => {
    if (!untilEngaged || !open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      // Try again sits under the picker, outside this root. Closing here would hide the hit it just read.
      if (target instanceof Element && target.closest("[data-picker-keep]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [untilEngaged, open]);
  const aligned = trimmed === debounced;
  // An empty box with searchOnMount false waits for focus or open. Typed text searches once it has been still.
  const emptyWaits = !searchOnMount && debounced === "" && !opened;
  const defaultKey = ["record-picker", findKey ?? label, vaultId, debounced] as const;
  // A caller's key carries the live text. Hold the search until the debounce has caught that text.
  const keyWaits = queryKey !== undefined && !aligned;
  const activeKey = queryKey ?? defaultKey;
  const usePickerQuery = useContext(PickerQueryContext);
  if (!usePickerQuery) throw new Error("record-picker: wrap the app in <PickerQueryContext.Provider value={usePickerQuery}>");
  const found = usePickerQuery({
    key: activeKey,
    run: (): Promise<PickerFind> => find(debounced),
    enabled: enabled && !emptyWaits && !keyWaits,
    staleTime,
  });
  useEffect(() => {
    if (!answerRef.current || !aligned || emptyWaits || !enabled) return;
    if (!found.isSuccess || found.isFetching || !found.data) return;
    answerRef.current(found.data, debounced);
  }, [aligned, emptyWaits, enabled, found.isSuccess, found.isFetching, found.data, debounced]);
  const data = found.data;
  const fetching = found.isFetching;
  const errored = found.isError;
  const vaultsMissed = data?.vaultsMissed === true;
  const hits = (data?.hits ?? []).filter((h) => !exclude.includes(h.uri));
  const incomplete = !!whenIncomplete && !!data && !data.complete;
  // An incomplete answer shows every hit it did read (the caller's find caps them). The drop-down's 8 is for a whole list.
  const shownHits = untilEngaged && !(incomplete && hits.length > 0) ? hits.slice(0, 8) : hits;
  // A short page, or a full page cut to 8, both hide names. Say so, or those names cannot be reached.
  const typeToSearchAll = untilEngaged && !!data && !incomplete && (!data.complete || hits.length > 8);
  const miss = !data || incomplete ? "" : data.complete ? noneText : partialText;
  const incompleteNone =
    incomplete && hits.length === 0 && !fetching && !errored && whenIncomplete ? (
      <p className={untilEngaged ? "px-3 py-1.5 text-xs text-[var(--ink-faint)]" : "text-xs text-[var(--ink-faint)]"} data-testid="org-record-none">
        <span>{whenIncomplete.none}</span>{" "}
        <button
          type="button"
          className="text-sm text-[var(--accent)]"
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={whenIncomplete.onRetry}
        >
          Try again
        </button>
      </p>
    ) : null;
  const incompleteHits =
    incomplete && hits.length > 0 && whenIncomplete ? (
      <p className={untilEngaged ? "px-3 py-1.5 text-xs text-[var(--ink-faint)]" : "text-xs text-[var(--ink-faint)]"}>{whenIncomplete.hits}</p>
    ) : null;
  const hitButton = untilEngaged
    ? "flex min-h-9 w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm text-[var(--ink)]"
    : "min-h-11 w-full rounded-md border border-[var(--line)] px-3 text-left text-sm text-[var(--ink)]";
  return (
    <div ref={rootRef} className="relative flex flex-col gap-2" data-testid="org-record-picker">
      <div className="flex items-center gap-2">
        <input
          aria-label={label}
          className="min-h-11 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)]"
          value={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            setOpened(true);
            if (untilEngaged) setOpen(true);
          }}
          onFocus={() => {
            setOpened(true);
            if (untilEngaged) setOpen(true);
          }}
          onClick={() => {
            // A second click does not focus again. The drop-down still opens.
            setOpened(true);
            if (untilEngaged) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            if (onCancel) {
              e.preventDefault();
              onCancel();
              return;
            }
            if (untilEngaged && open) {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
        {onCancel ? (
          <button type="button" className="min-h-11 px-2 font-[var(--serif)] text-base italic text-[var(--accent)]" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      {vaultsMissed ? <p className="text-xs text-[var(--ink-faint)]">{VAULTS_MISSED}</p> : null}
      {!untilEngaged && engaged && fetching ? <p className="text-xs text-[var(--ink-faint)]">{pendingText}</p> : null}
      {!untilEngaged && engaged && errored ? (
        <p className="text-xs text-[var(--bad)]" role="alert">
          {errorText}
        </p>
      ) : null}
      {engaged && shownHits.length > 0 ? (
        <ul
          className={
            untilEngaged
              ? "absolute left-0 right-0 top-full z-30 flex max-h-64 flex-col overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--surface)] shadow-md"
              : "flex flex-col gap-1"
          }
          data-testid={hitsTestId}
          onMouseDown={untilEngaged ? (ev) => ev.preventDefault() : undefined}
        >
          {shownHits.map((h, at) => {
            const heading = h.group && h.group !== shownHits[at - 1]?.group ? h.group : null;
            return (
              <li key={h.uri}>
                {heading ? (
                  <p role="presentation" data-testid="org-record-group" className="px-3 pb-0.5 pt-1.5 text-[11px] uppercase tracking-wide text-[var(--ink-faint)]">
                    {heading}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={hitButton}
                  data-testid="org-record-hit"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    onPick(h);
                    setText("");
                    if (untilEngaged) setOpen(false);
                  }}
                >
                  {h.label}
                  {h.note ? (
                    <>
                      {" "}
                      <span className={untilEngaged ? "text-[11px] text-[var(--ink-faint)]" : "block text-[11px] text-[var(--ink-faint)]"}>
                        {h.note}
                      </span>
                    </>
                  ) : null}
                  {untilEngaged && h.typeName ? (
                    <span className="text-[11px] text-[var(--ink-faint)]" aria-hidden="true">
                      {h.typeName}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {typeToSearchAll ? (
            <li role="note" className="px-3 py-1.5 text-[11px] text-[var(--ink-faint)]">
              Type to search all
            </li>
          ) : null}
          {incompleteHits ? <li>{incompleteHits}</li> : null}
        </ul>
      ) : !untilEngaged && engaged && (data || incompleteNone) && !fetching ? (
        <>
          {miss ? (
            <p className="text-xs text-[var(--ink-faint)]" data-testid="org-record-none">
              {miss}
            </p>
          ) : null}
          {incompleteNone}
          {text.trim() && whenNoMatch ? whenNoMatch(text.trim()) : null}
        </>
      ) : untilEngaged && engaged && shownHits.length === 0 && (fetching || errored || data || incompleteNone) ? (
        <div
          className="absolute left-0 right-0 top-full z-30 max-h-64 overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--surface)] shadow-md"
          onMouseDown={(ev) => ev.preventDefault()}
        >
          {fetching ? <p className="px-3 py-1.5 text-xs text-[var(--ink-faint)]">{pendingText}</p> : null}
          {errored ? (
            <p className="px-3 py-1.5 text-xs text-[var(--bad)]" role="alert">
              {errorText}
            </p>
          ) : null}
          {!fetching && (data || incompleteNone) ? (
            <>
              {miss ? (
                <p className="px-3 py-1.5 text-xs text-[var(--ink-faint)]" data-testid="org-record-none">
                  {miss}
                </p>
              ) : null}
              {incompleteNone}
              {text.trim() && whenNoMatch ? whenNoMatch(text.trim()) : null}
              {typeToSearchAll ? (
                <p role="note" className="px-3 py-1.5 text-[11px] text-[var(--ink-faint)]">
                  Type to search all
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const RecordPicker = OrgRecordPicker;
