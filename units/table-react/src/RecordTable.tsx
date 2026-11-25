/**
 * The table on screen: a read-only grid of vault records, one row per record and one column per field, drawn only for the rows in view.
 *
 * It draws what `table-core` built and nothing else: an empty cell stays empty, a link is handed to the host to name, a cell with
 * several values says how many it does not show and lists them all on request, and a row is opened by Space or by the button at its
 * left. It reads no record and no vocabulary itself.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { columnSizingFeature, flexRender, tableFeatures, useTable, type ColumnDef } from "@tanstack/react-table";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { NAME_COLUMN_ID, narrowColumns, type Cell, type TableColumn, type TableModel, type TableRow } from "@kaigilb/gilbplatformcode-table-core";

/** A link cell's reference, as the host is asked to draw it. */
export interface TableRef {
  /** The stored address. */
  uri: string;
  /** The record id, when the address is a record's. */
  id: string | null;
}

/** What {@link RecordTable} is given. */
export interface RecordTableProps<R extends BaseRecord = BaseRecord> {
  /** The table to draw, or null while its columns are not known yet. */
  table: TableModel<R> | null;
  /** True while the rows (or the columns) are still being read: the header and rows are drawn as a skeleton in the real layout. */
  loading?: boolean;
  /** The id of the open record: its row is marked selected, and brought into view when it changes. */
  selectedId?: string | null;
  /** Open a record (Space on its row, or the button at the row's left; on a narrow screen, a tap on the row). */
  onOpenRow: (id: string) => void;
  /** Draws a link to another record or term as its name. Absent: the stored address is shown, which says the link is not resolved. */
  renderRef?: (ref: TableRef) => ReactNode;
  /** True on a narrow screen: a list of rows, each with its name and the first field columns, in place of the grid. */
  narrow?: boolean;
  /** What the grid is called for a screen reader, for example the type's name. */
  label?: string;
  /** Height of a grid row, px. Default 36. */
  rowHeight?: number;
  /** Rows drawn above and below the ones in view. Default 12. */
  overscan?: number;
}

/** The table features this grid uses: column sizes. Rows come from the core row model. */
const features = tableFeatures({ columnSizingFeature });
type Features = typeof features;

const NAME_WIDTH = 280;
const FIELD_WIDTH = 190;
const HEADER_HEIGHT = 34;
const SKELETON_ROWS = 12;
const SKELETON_FIELD_COLUMNS = 5;
const NARROW_FIELDS = 3;
const NARROW_LINE = 20;
/** A value longer than this is not also put into its tooltip: it is in the page once, in its cell. */
const TITLE_MAX = 300;
/** How long the list of all values stays after the pointer leaves, so the pointer can cross onto it, ms. */
const LEAVE_MS = 150;

type RenderRef = ((ref: TableRef) => ReactNode) | undefined;

/**
 * The control of a cell that holds more values than it shows: "+N", and the list of ALL the cell's values, shown while the pointer is
 * on it, while it has focus, and after a tap or click until the next one or Escape. So no value is cut without a sign, and every value
 * can be read from the cell.
 *
 * The list is drawn outside the table (a portal, fixed to the screen), because the table clips what is inside it.
 */
function MoreValues({ items, renderRef, tabbable }: { items: readonly Cell[]; renderRef: RenderRef; tabbable: boolean }) {
  const more = items.length - 1;
  const anchor = useRef<HTMLButtonElement | null>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number | null; bottom: number | null; maxHeight: number } | null>(null);
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = hover || focus || pinned;
  const stay = () => {
    if (leave.current !== null) clearTimeout(leave.current);
    leave.current = null;
    setHover(true);
  };
  const go = () => {
    if (leave.current !== null) clearTimeout(leave.current);
    leave.current = setTimeout(() => setHover(false), LEAVE_MS);
  };
  useEffect(() => () => { if (leave.current !== null) clearTimeout(leave.current); }, []);

  // Where the list goes: under the control, or above it when there is more room there. Worked out when it opens.
  useLayoutEffect(() => {
    if (!open) return setPlace(null);
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const above = r.top;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 280));
    if (below >= 160 || below >= above) setPlace({ left, top: r.bottom + 4, bottom: null, maxHeight: Math.max(80, below - 12) });
    else setPlace({ left, top: null, bottom: window.innerHeight - r.top + 4, maxHeight: Math.max(80, above - 12) });
  }, [open]);

  // A list fixed to the screen would stay behind when the table scrolls under it: any scroll closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => { setHover(false); setPinned(false); };
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        tabIndex={tabbable ? 0 : -1}
        aria-expanded={open}
        aria-label={`${more} more ${more === 1 ? "value" : "values"}: show all ${items.length}`}
        data-testid="record-table-more"
        data-more-count={more}
        onMouseEnter={stay}
        onMouseLeave={go}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onClick={(e) => { e.stopPropagation(); setPinned((p) => !p); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); setPinned(false); setHover(false); setFocus(false); }
          // Space and Enter are this button's own; they must not also open the row.
          if (e.key === " " || e.key === "Enter") e.stopPropagation();
        }}
        className="flex-none rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--paper-2)] px-1.5 text-[12px] font-semibold leading-[20px] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        +{more}
      </button>
      {open && place
        ? createPortal(
            <div
              role="group"
              aria-label={`All ${items.length} values`}
              data-testid="record-table-all-values"
              onMouseEnter={stay}
              onMouseLeave={go}
              className="fixed z-[1000] w-[264px] overflow-auto rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-2 text-[13px] text-[var(--ink)] shadow-[var(--shadow-md)]"
              style={{ left: place.left, maxHeight: place.maxHeight, ...(place.top !== null ? { top: place.top } : { bottom: place.bottom ?? 0 }) }}
            >
              <ul className="flex flex-col gap-1">
                {items.map((item, i) => (
                  <li key={i} className="flex min-w-0 items-center break-words leading-[20px]">
                    <CellView cell={item} renderRef={renderRef} tabbable={false} wrap />
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * One cell's content. An empty cell draws nothing at all. A cell with several values draws the first and "+N" for the rest.
 *
 * @param props the cell; the host's way to name a link; whether the cell's own control takes a Tab stop; and `wrap`, for the list of all
 *   values, where a value is shown whole on as many lines as it needs
 */
function CellView({ cell, renderRef, tabbable, wrap = false }: { cell: Cell; renderRef: RenderRef; tabbable: boolean; wrap?: boolean }) {
  const clip = wrap ? "min-w-0 break-words" : "truncate";
  switch (cell.kind) {
    case "empty":
      return null;
    case "value": {
      const text = typeof cell.value === "boolean" ? (cell.value ? "Yes" : "No") : cell.text;
      return (
        <span className={clip} title={!wrap && cell.text.length <= TITLE_MAX ? cell.text : undefined}>
          {text}
        </span>
      );
    }
    case "ref":
      if (!cell.known) {
        return (
          <span className={`${clip} text-[var(--ink-faint)]`} title={`${cell.uri} (an address this record does not explain; shown as stored)`} data-ref-state="unknown">
            {cell.uri}
          </span>
        );
      }
      return (
        <span className={wrap ? "min-w-0 break-words" : "min-w-0 truncate"} data-ref-state={renderRef ? "named-by-host" : "unresolved"} title={renderRef ? undefined : cell.uri}>
          {renderRef ? renderRef({ uri: cell.uri, id: cell.id }) : cell.uri}
        </span>
      );
    case "list": {
      const first = cell.items[0];
      if (!first) return null;
      return (
        <span className="flex min-w-0 items-center gap-1" data-list-count={cell.items.length}>
          <span className="inline-flex min-w-0 items-center rounded-[var(--r-sm)] border border-[var(--line)] px-1.5 leading-[20px]">
            <CellView cell={first} renderRef={renderRef} tabbable={false} />
          </span>
          {cell.items.length > 1 ? <MoreValues items={cell.items} renderRef={renderRef} tabbable={tabbable} /> : null}
        </span>
      );
    }
    case "object":
      return (
        <span className={`${clip} font-[family-name:var(--mono)] text-[11.5px] text-[var(--ink-faint)]`} title={!wrap && cell.json.length <= TITLE_MAX ? cell.json : undefined}>
          {cell.json}
        </span>
      );
    case "unread":
      return (
        <span className={`${clip} italic text-[var(--ink-ghost)]`} title={cell.reason} data-cell-state="unread">
          Not loaded
        </span>
      );
  }
}

/** What a heading says on hover: its words, and for a column that is not a field of the type, why it is there. */
function headingTitle(column: TableColumn | undefined): string | undefined {
  if (!column) return undefined;
  if (column.source === "stored") return `${column.label}: a stored fact that no field describes, shown as stored`;
  if (column.source === "other") return `${column.label}: not a field of this type; shown because a record here holds it`;
  return column.label;
}

function OpenGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 4h6v6M20 4l-8 8M10 20H4v-6M4 20l8-8" />
    </svg>
  );
}

const SKELETON_BAR = "block h-[10px] rounded-full bg-[var(--line)] motion-safe:animate-pulse";

/**
 * The table of one kind of record: a grid on a wide screen, a list on a narrow one.
 *
 * Keys, on a row of the grid: Space opens the record; Arrow up and down, Page up and down, Home and End move to another row and bring
 * it into view. Exactly one drawn row takes the Tab stop at any time.
 *
 * @param props the table from `table-core`, whether it is still loading, the open record, and the host's ways to open a record and to
 *   name a link
 * @returns the grid (or list), filling its parent's height and scrolling inside it
 */
export function RecordTable<R extends BaseRecord = BaseRecord>({
  table,
  loading = false,
  selectedId = null,
  onOpenRow,
  renderRef,
  narrow = false,
  label = "Records",
  rowHeight = 36,
  overscan = 12,
}: RecordTableProps<R>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const columns: readonly TableColumn[] = useMemo(() => table?.columns ?? [], [table]);
  const data: TableRow<R>[] = useMemo(() => (loading || !table ? [] : table.rows), [loading, table]);
  const listColumns = useMemo(() => narrowColumns(columns, NARROW_FIELDS), [columns]);
  const columnById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const defs = useMemo<ColumnDef<Features, TableRow<R>>[]>(
    () =>
      columns.map((column, index): ColumnDef<Features, TableRow<R>> => ({
        id: column.id,
        header: column.label,
        size: column.id === NAME_COLUMN_ID ? NAME_WIDTH : FIELD_WIDTH,
        // The Name column's value is the row's name; every other column's value is its cell (column n is cell n - 1).
        accessorFn: (row) => (column.id === NAME_COLUMN_ID ? row.name : row.cells[index - 1]),
      })),
    [columns],
  );
  const grid = useTable({ features, data, columns: defs, getRowId: (row) => row.id });
  const rows = grid.getRowModel().rows;
  const indexById = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);

  // --- The row the keys act on ---
  // `active` is the row the person last focused or moved to. It is always drawn, in view or not, so that focus is never on a row that
  // leaves the page while the table scrolls (the keys would then go nowhere). Until the person has one, the open record's row is kept.
  const [active, setActive] = useState<string | null>(null);
  const [focusInRow, setFocusInRow] = useState(false);
  const activeIndex = active !== null ? (indexById.get(active) ?? -1) : -1;
  const selectedIndex = selectedId !== null ? (indexById.get(selectedId) ?? -1) : -1;
  const keepIndex = activeIndex >= 0 ? activeIndex : selectedIndex;
  const rangeExtractor = useCallback(
    (range: Range) => {
      const drawn = defaultRangeExtractor(range);
      return keepIndex >= 0 && keepIndex < range.count && !drawn.includes(keepIndex) ? [...drawn, keepIndex].sort((a, b) => a - b) : drawn;
    },
    [keepIndex],
  );

  const narrowRowHeight = 30 + listColumns.length * NARROW_LINE + 10;
  const headerSpace = narrow ? 0 : HEADER_HEIGHT;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (narrow ? narrowRowHeight : rowHeight),
    overscan,
    rangeExtractor,
    // The header row sits above the rows inside the scrolling box, and stays over them: a row brought into view stops below it.
    scrollMargin: headerSpace,
    scrollPaddingStart: headerSpace,
  });
  // A change of layout changes every row's height.
  useEffect(() => {
    virtualizer.measure();
  }, [narrow, narrowRowHeight, rowHeight, virtualizer]);

  // The rows in view (not the extra ones drawn around them).
  const inView = virtualizer.range;
  const isInView = (index: number) => index >= 0 && inView !== null && index >= inView.startIndex && index <= inView.endIndex;
  // Exactly one drawn row takes the Tab stop: the active row while it has focus or is in view, else the open record's row when it is in
  // view, else the first row in view. A row that is out of view and not focused never holds it, so Tab always lands on a row on screen.
  const tabStopIndex = activeIndex >= 0 && (focusInRow || isInView(activeIndex)) ? activeIndex : isInView(selectedIndex) ? selectedIndex : (inView?.startIndex ?? 0);

  // The open record's row is brought into view when the open record changes (a link with a record far down the list opens on it).
  const shownFor = useRef<string | null>(null);
  useEffect(() => {
    if (narrow || selectedId === null || selectedIndex < 0 || shownFor.current === selectedId) return;
    shownFor.current = selectedId;
    virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
  }, [narrow, selectedId, selectedIndex, virtualizer]);

  const pendingFocus = useRef<string | null>(null);
  const moveTo = (index: number) => {
    const target = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!target) return;
    pendingFocus.current = target.id;
    setActive(target.id);
    virtualizer.scrollToIndex(target.index, { align: "auto" });
  };
  // Focus follows the move as soon as the row is in the page (it is drawn at once, because the active row is always drawn).
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    // Compared as text, not put into a selector: a record id is whatever the vault made it.
    const el = [...(scrollRef.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [])].find((row) => row.getAttribute("data-row-id") === id);
    if (el) {
      pendingFocus.current = null;
      el.focus();
    }
  });
  /** Rows a Page key moves by: the rows that fit under the header, less one, so the last row seen stays in sight. */
  const pageRows = () => Math.max(1, Math.floor(((scrollRef.current?.clientHeight ?? 0) - HEADER_HEIGHT) / rowHeight) - 1);
  const onRowKeyDown = (e: KeyboardEvent<HTMLElement>, index: number, id: string) => {
    if (e.target !== e.currentTarget) return; // a key pressed on a control inside the row belongs to that control
    const to: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, PageDown: index + pageRows(), PageUp: index - pageRows(), Home: 0, End: rows.length - 1 };
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onOpenRow(id);
    } else if (e.key in to) {
      // The key is the table's: the browser must not also scroll the box by its own step.
      e.preventDefault();
      moveTo(to[e.key] as number);
    }
  };

  const skeleton = loading || !table;
  const template = (skeleton && columns.length === 0 ? [NAME_WIDTH, ...Array.from({ length: SKELETON_FIELD_COLUMNS }, () => FIELD_WIDTH)] : grid.getAllLeafColumns().map((c) => c.getSize()))
    .map((w) => `${w}px`)
    .join(" ");
  const totalWidth = skeleton && columns.length === 0 ? NAME_WIDTH + SKELETON_FIELD_COLUMNS * FIELD_WIDTH : grid.getTotalSize();
  const frozenCell = "sticky left-0 z-[1] bg-[var(--surface)] border-r border-[var(--line)]";
  const cellBase = "flex min-w-0 items-center px-2.5 text-[13px] text-[var(--ink)]";
  // The focused row's ring is drawn by its cells (a line above and below each, and one at the row's left), because the frozen Name cell
  // lies over the row and would hide a ring drawn on the row itself.
  const focusLines = " group-focus-visible:shadow-[inset_0_2px_0_var(--accent),inset_0_-2px_0_var(--accent)]";
  const focusLinesFirst = " group-focus-visible:shadow-[inset_2px_0_0_var(--accent),inset_0_2px_0_var(--accent),inset_0_-2px_0_var(--accent)]";

  if (narrow) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]" data-testid="record-table" data-layout="list">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto overscroll-y-contain" role="list" aria-label={label} aria-busy={skeleton || undefined}>
          {skeleton ? (
            <div data-testid="record-table-skeleton">
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <div key={i} className="flex flex-col justify-center gap-2 border-b border-[var(--line-2)] px-3" style={{ height: narrowRowHeight }} data-skeleton-row>
                  <span className={SKELETON_BAR} style={{ width: `${55 - (i % 4) * 8}%` }} />
                  <span className={SKELETON_BAR} style={{ width: `${80 - (i % 3) * 12}%` }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index];
                if (!row) return null;
                const selected = row.id === selectedId;
                return (
                  <div key={row.id} role="listitem" className="absolute left-0 top-0 w-full" style={{ height: item.size, transform: `translateY(${item.start}px)` }}>
                    {/* The whole row opens the record on a tap; the name is the button a keyboard and a screen reader use. A cell's
                        own "+N" control sits beside it, not inside it. */}
                    <div
                      onClick={() => onOpenRow(row.id)}
                      className={"flex h-full w-full cursor-pointer flex-col justify-center gap-0.5 border-b border-[var(--line-2)] px-3 " + (selected ? "bg-[var(--sel)]" : "bg-[var(--surface)]")}
                    >
                      <button
                        type="button"
                        data-row-id={row.id}
                        aria-current={selected ? "true" : undefined}
                        onClick={(e) => { e.stopPropagation(); onOpenRow(row.id); }}
                        className="flex min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
                      >
                        <span className="truncate text-[14px] font-semibold text-[var(--ink)]">{row.original.name}</span>
                      </button>
                      {listColumns.map((column) => {
                        const cell = row.original.cells[columns.indexOf(column) - 1] ?? { kind: "empty" };
                        return (
                          <span key={column.id} className="flex min-w-0 items-center gap-2 text-[12.5px] leading-[20px]" data-column-id={column.id}>
                            <span className="w-[38%] max-w-[150px] shrink-0 truncate text-[var(--ink-faint)]">{column.label}</span>
                            <span className="flex min-w-0 flex-1 items-center text-[var(--ink)]">
                              <CellView cell={cell} renderRef={renderRef} tabbable />
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const headerLabels = skeleton && columns.length === 0 ? null : grid.getHeaderGroups()[0]?.headers ?? [];
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]" data-testid="record-table" data-layout="grid">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto overscroll-contain"
        role="grid"
        aria-label={label}
        aria-busy={skeleton || undefined}
        aria-rowcount={skeleton ? undefined : rows.length + 1}
        aria-colcount={headerLabels ? headerLabels.length : undefined}
      >
        <div role="row" aria-rowindex={1} className="sticky top-0 z-[2] grid border-b border-[var(--line)] bg-[var(--paper-2)]" style={{ gridTemplateColumns: template, width: totalWidth, height: HEADER_HEIGHT }}>
          {headerLabels
            ? headerLabels.map((header, i) => (
                <div
                  key={header.id}
                  role="columnheader"
                  aria-colindex={i + 1}
                  data-column-id={header.column.id}
                  data-column-source={columnById.get(header.column.id)?.source}
                  className={
                    "flex min-w-0 items-center px-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--ink-soft)] " +
                    (header.column.id === NAME_COLUMN_ID ? "sticky left-0 z-[3] border-r border-[var(--line)] bg-[var(--paper-2)] pl-[42px]" : "border-r border-[var(--line-2)]")
                  }
                  title={headingTitle(columnById.get(header.column.id))}
                >
                  <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                </div>
              ))
            : Array.from({ length: SKELETON_FIELD_COLUMNS + 1 }, (_, i) => (
                <div key={i} className={"flex items-center px-2.5 " + (i === 0 ? "sticky left-0 z-[3] border-r border-[var(--line)] bg-[var(--paper-2)] pl-[42px]" : "border-r border-[var(--line-2)]")} data-skeleton-header>
                  <span className={SKELETON_BAR} style={{ width: i === 0 ? 70 : 90 - (i % 3) * 14 }} />
                </div>
              ))}
        </div>
        {skeleton ? (
          <div data-testid="record-table-skeleton" style={{ width: totalWidth }}>
            {Array.from({ length: SKELETON_ROWS }, (_, r) => (
              <div key={r} className="grid border-b border-[var(--line-2)]" style={{ gridTemplateColumns: template, height: rowHeight }} data-skeleton-row>
                {template.split(" ").map((_, c) => (
                  <div key={c} className={"flex items-center px-2.5 " + (c === 0 ? frozenCell + " pl-[42px]" : "")}>
                    <span className={SKELETON_BAR} style={{ width: `${c === 0 ? 62 - (r % 4) * 9 : 70 - ((r + c) % 4) * 13}%` }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="relative" style={{ height: virtualizer.getTotalSize(), width: totalWidth }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const selected = row.id === selectedId;
              const isTabStop = item.index === tabStopIndex;
              return (
                <div
                  key={row.id}
                  role="row"
                  aria-rowindex={item.index + 2}
                  aria-selected={selected}
                  tabIndex={isTabStop ? 0 : -1}
                  data-row-id={row.id}
                  onKeyDown={(e) => onRowKeyDown(e, item.index, row.id)}
                  onFocus={(e) => {
                    if (e.target !== e.currentTarget) return;
                    setActive(row.id);
                    setFocusInRow(true);
                  }}
                  onBlur={(e) => {
                    if (e.target === e.currentTarget) setFocusInRow(false);
                  }}
                  className="group absolute left-0 top-0 grid border-b border-[var(--line-2)] outline-none"
                  // The start is counted from the top of the scrolling box; the rows' own box begins under the header.
                  style={{ gridTemplateColumns: template, width: totalWidth, height: item.size, transform: `translateY(${item.start - headerSpace}px)`, scrollMarginTop: HEADER_HEIGHT }}
                >
                  {row.getAllCells().map((cell, i) => {
                    const isName = cell.column.id === NAME_COLUMN_ID;
                    if (isName) {
                      return (
                        <div key={cell.id} role="rowheader" aria-colindex={1} className={cellBase + " gap-1.5 pl-1 " + frozenCell + focusLinesFirst}>
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-label={`Open ${row.original.name}`}
                            title="Open (Space)"
                            onClick={() => onOpenRow(row.id)}
                            data-testid="record-table-open"
                            className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[var(--r-sm)] text-[var(--ink-faint)] hover:bg-[var(--sel)] hover:text-[var(--accent)]"
                          >
                            <OpenGlyph />
                          </button>
                          <span className={"truncate " + (selected ? "font-semibold text-[var(--accent-ink)]" : "font-medium")} title={row.original.name.length <= TITLE_MAX ? row.original.name : undefined}>
                            {row.original.name}
                          </span>
                          {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]" /> : null}
                        </div>
                      );
                    }
                    return (
                      <div key={cell.id} role="gridcell" aria-colindex={i + 1} data-column-id={cell.column.id} className={cellBase + " border-r border-[var(--line-2)] " + (selected ? "bg-[var(--sel)]" : "") + focusLines}>
                        {/* A cell's "+N" takes a Tab stop only in the row that holds the row Tab stop: one Tab from the row reaches it. */}
                        <CellView cell={cell.getValue() as Cell} renderRef={renderRef} tabbable={isTabStop} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
