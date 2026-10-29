/**
 * A FULL list on its own full-window sheet (not hundreds of rows inline). One sheet for
 * the Employees and the Units groups (`kind` names the group; every test id is `org-<kind>-…`). Opened by "Show all N" on the card.
 * The search box is at the top; the list is the rows the card has READ so far, 50 more with each "Show more" (the same reads the card made: nothing
 * is read twice, and nothing here reads a row the reader was not given). Back or Escape or the system Back return to the card (the sheet is a history
 * entry, `useSheetHistory`), the focus returns to "Show all"; a tap on a row opens it and closes the sheet.
 * Typing filters the loaded rows after a pause and makes NO request; the sentence under the box says what was searched (the rows loaded, not
 * everyone, while more can be loaded).
 * A full-window sheet like the Add Information chooser (z-[70]: above the phone Detail drawer and the bottom nav).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EMPLOYEE_FOCUS } from "./OrgEmployeeRow";
import { useDebouncedValue } from "@kaigilb/gilbplatformcode-record-picker";
import { FULL_LIST_STEP, SEARCH_DEBOUNCE_MS, filterEmployeesByName, noMatchSentence, searchScopeSentence, stillLoadingSentence, type ListNoun } from "./orgEmployeeSearch";
import { eventTargetInTopDialog, modalIsOpen } from "@kaigilb/gilbplatformcode-open-popups";

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** What a list row needs: an id and a name to search by. */
export interface ListItem {
  id: string;
  name: string | null;
}

/** What the card's read of a group gives the card and its sheet. */
export interface ListRead<T extends ListItem> {
  q: { hasNextPage?: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown; isError: boolean; error: unknown };
  items: T[];
  hasMore: boolean;
  /** The group's count text ("10 people shown of 1,000 records"). */
  count: string;
  clickedThrough: boolean;
  leftOut: boolean;
}

/** The words and test-id prefix of one group. */
export interface ListLabels {
  kind: "employees" | "units";
  title: string;
  noun: ListNoun;
  searchLabel: string;
  /** Nothing read so far could be shown, more can be read (no number). */
  truncated: string;
  /** Clicked through to the end, nothing could be shown (no number). */
  none: string;
  /** The standing note when some entries were left out (no number); null: the group has none. */
  leftOut: string | null;
}

export function OrgListSheet<T extends ListItem>({
  read,
  labels,
  initialQuery,
  renderRow,
  onClose,
}: {
  read: ListRead<T>;
  labels: ListLabels;
  initialQuery: string;
  /** One row (the card gives the caller's own press handler). */
  renderRow: (item: T) => ReactNode;
  onClose: () => void;
}) {
  const { q, items, hasMore } = read;
  const k = `org-${labels.kind}`;
  const [query, setQuery] = useState(initialQuery);
  const settled = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const asked = useRef(false);
  const matches = useMemo(() => filterEmployeesByName(items, settled), [items, settled]);
  // Opening the full list loads the first page of it (once): the card read 10, the list shows 50 more.
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    if (q.hasNextPage && !q.isFetchingNextPage && items.length < FULL_LIST_STEP) void q.fetchNextPage();
  }, [q, items.length]);
  // The focus goes into the sheet (to its title, which a screen reader reads), not into the search box: on a phone that would raise the keyboard over the list.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  // Escape closes THIS sheet and nothing under it (the phone's Detail drawer listens on the document): first in line (capture), then stopped.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalIsOpen() && !eventTargetInTopDialog(e.target)) return;
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  // Tab stays inside the sheet.
  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    // In document order (a selector list is not always answered in it).
    const focusables = [...(rootRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === headingRef.current || !rootRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !rootRef.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };
  const typed = query.trim() !== "";
  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${k}-sheet-title`}
      data-testid={`${k}-sheet`}
      className="fixed inset-0 z-[70] flex flex-col bg-[var(--paper)] text-[var(--ink)]"
      onKeyDown={trap}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-4">
        <div className="flex items-center gap-3 pt-3">
          <button type="button" data-testid={`${k}-sheet-back`} className={`min-h-11 shrink-0 pr-2 font-[var(--serif)] text-base italic text-[var(--accent)] ${EMPLOYEE_FOCUS}`} onClick={onClose}>
            ‹ Back
          </button>
          <h2 id={`${k}-sheet-title`} ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 font-[var(--serif)] text-lg font-bold outline-none">
            {labels.title}
          </h2>
        </div>
        {/* On its own line: beside the title it took the room on a phone and cut the title ("Emplo…"). */}
        <p className="pb-1 pl-1 text-[12.5px] text-[var(--ink-soft)]" data-testid={`${k}-sheet-count`}>
          {read.count}
        </p>
        <div className="pb-2">
          <input
            type="search"
            data-testid={`${k}-sheet-search`}
            aria-label={labels.searchLabel}
            placeholder={labels.searchLabel}
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-base text-[var(--ink)]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {typed ? (
            <p className="pt-1 text-[12px] text-[var(--ink-faint)]" data-testid={`${k}-sheet-scope`} aria-live="polite">
              {searchScopeSentence({ loaded: items.length, hasMore, where: "list", noun: labels.noun })}
            </p>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto pb-8" data-testid={`${k}-sheet-list`}>
          {q.isError ? (
            <p role="alert" className="py-1 text-[12.5px] text-[var(--bad)]" data-testid={`${k}-error`}>
              The {labels.title.toLowerCase()} could not be read ({q.error instanceof Error ? q.error.message : String(q.error)}). That is not a statement that there are none.
            </p>
          ) : null}
          {settled.trim() !== "" && matches.length === 0 ? (
            q.isFetchingNextPage ? (
              <p className="py-1 text-[12.5px] text-[var(--ink-soft)]" data-testid={`${k}-loading`} aria-live="polite">
                {stillLoadingSentence({ loaded: items.length, noun: labels.noun })}
              </p>
            ) : (
              <p className="py-1 text-[12.5px] text-[var(--ink-soft)]" data-testid={`${k}-nomatch`}>
                {noMatchSentence({ loaded: items.length, hasMore, where: "list", noun: labels.noun })}
              </p>
            )
          ) : null}
          <div className="divide-y divide-[var(--line)]">{matches.map((p) => (
              <div key={p.id}>{renderRow(p)}</div>
            ))}</div>
          {items.length === 0 && hasMore && !q.isFetchingNextPage ? (
            <p className="py-1 text-[12.5px] text-[var(--ink-soft)]" data-testid={`${k}-truncated`}>
              {labels.truncated}
            </p>
          ) : null}
          {read.clickedThrough ? (
            <p className="py-1 text-[12.5px] text-[var(--ink-soft)]" data-testid={`${k}-none`}>
              {labels.none}
            </p>
          ) : null}
          {items.length > 0 && read.leftOut && labels.leftOut ? (
            <p className="py-1 text-[12px] text-[var(--ink-faint)]" data-testid={`${k}-leftout`}>
              {labels.leftOut}
            </p>
          ) : null}
          {hasMore ? (
            <button type="button" className={`min-h-11 w-full py-2 text-left text-[15px] text-[var(--accent)] ${EMPLOYEE_FOCUS}`} data-testid={`${k}-more`} disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
              {q.isFetchingNextPage ? "Reading…" : "Show more"}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
