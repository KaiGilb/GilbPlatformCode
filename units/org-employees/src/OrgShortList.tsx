/**
 * The SHORT LIST of a group on the organization card, shared by Employees and Units: the first 10 rows, a search box ("Search people" / "Search units") once there is more than a short list, and "Show all N", which
 * opens the full list on its own sheet (`OrgListSheet`, a history entry). The search filters the rows ALREADY LOADED, after a pause, with no request,
 * and says so; it never shows, counts or hints at a row the reader was not given (`orgEmployeeSearch.ts`).
 * The group's frame, its count and its error/pending states stay with the group (`OrgEmployeesSection`, `OrgUnitsSection`); this is what goes inside.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EMPLOYEE_FOCUS } from "./OrgEmployeeRow";
import { OrgListSheet, type ListItem, type ListLabels, type ListRead } from "./OrgListSheet";
import { useDebouncedValue } from "@kaigilb/gilbplatformcode-record-picker";
import { INLINE_EMPLOYEES, SEARCH_DEBOUNCE_MS, filterEmployeesByName, noMatchSentence, searchScopeSentence } from "./orgEmployeeSearch";
import { useOrgEmployeesHost } from "./orgEmployeesHost";

export function OrgShortList<T extends ListItem>({
  read,
  labels,
  total,
  renderRow,
  onOpenItem,
  notes,
}: {
  read: ListRead<T>;
  labels: ListLabels;
  /** The platform's count of records while more can be read (the label of "Show all" says what that number counts). */
  total: number;
  /**
   * One row. `where` is "card" for the (at most 10) rows of the short list and "list" for the sheet's rows; `open` is the row's press handler: from
   * the sheet it closes the sheet and its history entry first and opens the row after (so the card is the entry before it), from the card it just opens.
   */
  renderRow: (item: T, ctx: { where: "card" | "list"; open: (id: string) => void }) => ReactNode;
  onOpenItem: (id: string) => void;
  /** Group-specific standing notes, drawn after the rows (only when there are rows). */
  notes?: ReactNode;
}) {
  const host = useOrgEmployeesHost();
  const { items, hasMore } = read;
  const k = `org-${labels.kind}`;
  const [query, setQuery] = useState("");
  const settled = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const showAllRef = useRef<HTMLButtonElement>(null);
  // After Back or Escape the focus returns to the button that opened the sheet; after opening a row it does not (the card changes).
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!sheetOpen && returnFocus.current) {
      returnFocus.current = false;
      showAllRef.current?.focus();
    }
  }, [sheetOpen]);
  // The sheet is a history entry: the system Back closes it (and nothing else); a reload that landed on its entry steps off it.
  const { requestClose } = host.useSheetHistory(sheetOpen, () => {
    returnFocus.current = true;
    setSheetOpen(false);
  });
  useEffect(() => {
    host.dropStaleSheetEntry();
  }, []);
  const matches = useMemo(() => filterEmployeesByName(items, settled), [items, settled]);
  const rows = matches.slice(0, INLINE_EMPLOYEES);
  // A box over nobody is no use: when this reader's first page lists no one, the search waits for rows to be loaded (Show all, whose list has its own box).
  const searchable = items.length > 0 && (items.length > INLINE_EMPLOYEES || hasMore);
  const typed = query.trim() !== "";
  const showAllLabel = hasMore
    ? `Show all ${total.toLocaleString("en")} ${labels.noun === "units" ? "units" : "records"}`
    : `Show all ${items.length.toLocaleString("en")} ${labels.noun === "units" ? (items.length === 1 ? "unit" : "units") : items.length === 1 ? "person" : "people"}`;
  return (
    <>
      {searchable ? (
        <div className="py-2">
          <input
            type="search"
            data-testid={`${k}-search`}
            aria-label={labels.searchLabel}
            placeholder={labels.searchLabel}
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-base text-[var(--ink)]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {typed ? (
            <p className="pt-1 text-[12px] text-[var(--ink-faint)]" data-testid={`${k}-scope`} aria-live="polite">
              {searchScopeSentence({ loaded: items.length, hasMore, where: "card", noun: labels.noun })}
            </p>
          ) : null}
        </div>
      ) : null}
      {settled.trim() !== "" && searchable && matches.length === 0 ? (
        <p className="py-1 text-[12.5px] text-[var(--ink-soft)]" data-testid={`${k}-nomatch`}>
          {noMatchSentence({ loaded: items.length, hasMore, where: "card", noun: labels.noun })}
        </p>
      ) : null}
      {rows.map((p) => (
        <div key={p.id}>{renderRow(p, { where: "card", open: onOpenItem })}</div>
      ))}
      {settled.trim() !== "" && matches.length > rows.length ? (
        <p className="py-1 text-[12px] text-[var(--ink-faint)]" data-testid={`${k}-matchcount`}>
          Showing the first {rows.length} of {matches.length.toLocaleString("en")} matches.
        </p>
      ) : null}
      {items.length === 0 && hasMore ? (
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
      {items.length > 0 ? notes : null}
      {items.length > INLINE_EMPLOYEES || hasMore ? (
        <button
          ref={showAllRef}
          type="button"
          className={`min-h-11 w-full py-2 text-left text-[15px] text-[var(--accent)] ${EMPLOYEE_FOCUS}`}
          data-testid={`${k}-showall`}
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
        >
          {showAllLabel}
        </button>
      ) : null}
      {sheetOpen ? (
        <OrgListSheet
          read={read}
          labels={labels}
          initialQuery={query}
          renderRow={(item) =>
            renderRow(item, {
              where: "list",
              open: (id) => {
                requestClose(() => onOpenItem(id));
                returnFocus.current = false;
              },
            })
          }
          onClose={() => requestClose()}
        />
      ) : null}
    </>
  );
}
