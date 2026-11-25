// The table on screen: a read-only grid of vault records, one row per record and one column per field, drawn only for the rows in view.
//
// It draws what `table-core` built and nothing else: an empty cell stays empty, a link is handed to the host to name, and a row is opened
// by Space or by the button at its left. It reads no record and no vocabulary itself.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { columnSizingFeature, flexRender, tableFeatures, useTable, type ColumnDef } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { NAME_COLUMN_ID, cellText, narrowColumns, type Cell, type TableColumn, type TableModel, type TableRow } from "@kaigilb/gilbplatformcode-table-core";

/** A link cell's reference, as the host is asked to draw it. */
export interface TableRef {
  /** The stored address. */
  uri: string;
  /** The record id, when the address is a record's. */
  id: string | null;
}

export interface RecordTableProps<R extends BaseRecord = BaseRecord> {
  /** The table to draw, or null while its columns are not known yet. */
  table: TableModel<R> | null;
  /** True while the rows (or the columns) are still being read: the header and rows are drawn as a skeleton in the real layout. */
  loading?: boolean;
  /** The id of the open record: its row is marked selected. */
  selectedId?: string | null;
  /** Open a record (Space on its row, or the button at the row's left; on a narrow screen, a tap on the row). */
  onOpenRow: (id: string) => void;
  /** Draws a link to another record or term as its name. Absent: the stored address is shown, which says the link is not resolved. */
  renderRef?: (ref: TableRef) => ReactNode;
  /** The footer line (for a table cut at the row limit), or null for none. */
  footer?: string | null;
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

/** One cell's content. An empty cell draws nothing at all. */
function CellView({ cell, renderRef }: { cell: Cell; renderRef?: (ref: TableRef) => ReactNode }) {
  switch (cell.kind) {
    case "empty":
      return null;
    case "value": {
      const text = typeof cell.value === "boolean" ? (cell.value ? "Yes" : "No") : cell.text;
      return (
        <span className="truncate" title={cell.text}>
          {text}
        </span>
      );
    }
    case "ref":
      if (!cell.known) {
        return (
          <span className="truncate text-[var(--ink-faint)]" title={`${cell.uri} (an address this record does not explain; shown as stored)`} data-ref-state="unknown">
            {cell.uri}
          </span>
        );
      }
      return (
        <span className="min-w-0 truncate" data-ref-state={renderRef ? "named-by-host" : "unresolved"} title={renderRef ? undefined : cell.uri}>
          {renderRef ? renderRef({ uri: cell.uri, id: cell.id }) : cell.uri}
        </span>
      );
    case "list":
      return (
        <span className="flex min-w-0 items-center gap-1 overflow-hidden" title={cell.items.every((i) => i.kind !== "ref") ? cellText(cell) : undefined} data-list-count={cell.items.length}>
          {cell.items.map((item, i) => (
            <span key={i} className="inline-flex min-w-0 max-w-full shrink-0 items-center rounded-[var(--r-sm)] border border-[var(--line)] px-1.5 leading-[20px]">
              <CellView cell={item} renderRef={renderRef} />
            </span>
          ))}
        </span>
      );
    case "object":
      return (
        <span className="truncate font-[family-name:var(--mono)] text-[11.5px] text-[var(--ink-faint)]" title={cell.json}>
          {cell.json}
        </span>
      );
    case "unread":
      return (
        <span className="truncate italic text-[var(--ink-ghost)]" title={cell.reason} data-cell-state="unread">
          Not loaded
        </span>
      );
  }
}

function OpenGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 4h6v6M20 4l-8 8M10 20H4v-6M4 20l8-8" />
    </svg>
  );
}

const SKELETON_BAR = "block h-[10px] rounded-full bg-[var(--line)] motion-safe:animate-pulse";

export function RecordTable<R extends BaseRecord = BaseRecord>({
  table,
  loading = false,
  selectedId = null,
  onOpenRow,
  renderRef,
  footer = null,
  narrow = false,
  label = "Records",
  rowHeight = 36,
  overscan = 12,
}: RecordTableProps<R>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const columns: readonly TableColumn[] = useMemo(() => table?.columns ?? [], [table]);
  const data: TableRow<R>[] = useMemo(() => (loading || !table ? [] : table.rows), [loading, table]);
  const listColumns = useMemo(() => narrowColumns(columns, NARROW_FIELDS), [columns]);

  const defs = useMemo<ColumnDef<Features, TableRow<R>>[]>(
    () =>
      columns.map((column, index): ColumnDef<Features, TableRow<R>> => ({
        id: column.id,
        header: column.label,
        size: column.id === NAME_COLUMN_ID ? NAME_WIDTH : FIELD_WIDTH,
        // The Name column's value is the row's name; a field column's value is its cell (column n is cell n - 1).
        accessorFn: (row) => (column.field === null ? row.name : row.cells[index - 1]),
      })),
    [columns],
  );
  const grid = useTable({ features, data, columns: defs, getRowId: (row) => row.id });
  const rows = grid.getRowModel().rows;

  const narrowRowHeight = 30 + listColumns.length * NARROW_LINE + 10;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (narrow ? narrowRowHeight : rowHeight),
    overscan,
  });
  // A change of layout changes every row's height.
  useEffect(() => {
    virtualizer.measure();
  }, [narrow, narrowRowHeight, rowHeight, virtualizer]);

  // One row takes the Tab stop: the selected one when it is listed, else the row last focused, else the first.
  const [focusId, setFocusId] = useState<string | null>(null);
  const tabStopId = (focusId && rows.some((r) => r.id === focusId) ? focusId : null) ?? (selectedId && rows.some((r) => r.id === selectedId) ? selectedId : null) ?? rows[0]?.id ?? null;
  const pendingFocus = useRef<string | null>(null);
  const focusRow = (index: number) => {
    const target = rows[index];
    if (!target) return;
    pendingFocus.current = target.id;
    setFocusId(target.id);
    virtualizer.scrollToIndex(index);
  };
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
  const onRowKeyDown = (e: KeyboardEvent<HTMLElement>, index: number, id: string) => {
    if (e.target !== e.currentTarget) return; // a key pressed on a control inside the row belongs to that control
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onOpenRow(id);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(Math.min(rows.length - 1, index + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusRow(Math.max(0, index - 1));
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
                    <button
                      type="button"
                      data-row-id={row.id}
                      aria-current={selected ? "true" : undefined}
                      onClick={() => onOpenRow(row.id)}
                      className={
                        "flex h-full w-full flex-col justify-center gap-0.5 border-b border-[var(--line-2)] px-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] " +
                        (selected ? "bg-[var(--sel)]" : "bg-[var(--surface)]")
                      }
                    >
                      <span className="truncate text-[14px] font-semibold text-[var(--ink)]">{row.original.name}</span>
                      {listColumns.map((column) => {
                        const cell = row.original.cells[columns.indexOf(column) - 1] ?? { kind: "empty" };
                        return (
                          <span key={column.id} className="flex min-w-0 items-center gap-2 text-[12.5px] leading-[20px]" data-column-id={column.id}>
                            <span className="w-[38%] max-w-[150px] shrink-0 truncate text-[var(--ink-faint)]">{column.label}</span>
                            <span className="flex min-w-0 flex-1 items-center text-[var(--ink)]">
                              <CellView cell={cell} renderRef={renderRef} />
                            </span>
                          </span>
                        );
                      })}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {footer ? (
          <div role="status" className="flex-none border-t border-[var(--line)] bg-[var(--paper-2)] px-3 py-1.5 text-[12px] text-[var(--ink-soft)]" data-testid="record-table-footer">
            {footer}
          </div>
        ) : null}
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
                  className={
                    "flex min-w-0 items-center px-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--ink-soft)] " +
                    (header.column.id === NAME_COLUMN_ID ? "sticky left-0 z-[3] border-r border-[var(--line)] bg-[var(--paper-2)] pl-[42px]" : "border-r border-[var(--line-2)]")
                  }
                  title={typeof header.column.columnDef.header === "string" ? header.column.columnDef.header : undefined}
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
              return (
                <div
                  key={row.id}
                  role="row"
                  aria-rowindex={item.index + 2}
                  aria-selected={selected}
                  tabIndex={row.id === tabStopId ? 0 : -1}
                  data-row-id={row.id}
                  onKeyDown={(e) => onRowKeyDown(e, item.index, row.id)}
                  onFocus={(e) => {
                    if (e.target === e.currentTarget) setFocusId(row.id);
                  }}
                  className={
                    "group absolute left-0 top-0 grid border-b border-[var(--line-2)] outline-none"
                  }
                  style={{ gridTemplateColumns: template, width: totalWidth, height: item.size, transform: `translateY(${item.start}px)` }}
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
                          <span className={"truncate " + (selected ? "font-semibold text-[var(--accent-ink)]" : "font-medium")} title={row.original.name}>
                            {row.original.name}
                          </span>
                          {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]" /> : null}
                        </div>
                      );
                    }
                    return (
                      <div key={cell.id} role="gridcell" aria-colindex={i + 1} data-column-id={cell.column.id} className={cellBase + " border-r border-[var(--line-2)] " + (selected ? "bg-[var(--sel)]" : "") + focusLines}>
                        <CellView cell={cell.getValue() as Cell} renderRef={renderRef} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {footer ? (
        <div role="status" className="flex-none border-t border-[var(--line)] bg-[var(--paper-2)] px-3 py-1.5 text-[12px] text-[var(--ink-soft)]" data-testid="record-table-footer">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
