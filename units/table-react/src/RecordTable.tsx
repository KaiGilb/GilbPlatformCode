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
import { NAME_COLUMN_ID, narrowFieldsOfRow, type Cell, type TableColumn, type TableModel, type TableRow } from "@kaigilb/gilbplatformcode-table-core";

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
  /**
   * The person went to a cell that holds a link: a mouse pointer came over it, it was tapped or clicked, or it took the selection.
   * For a host that reads a link's name only on request (a name it did not read by itself, to keep its requests bounded). It is
   * told the cell's first link, the one the cell draws.
   */
  onRefIntent?: (ref: TableRef) => void;
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
/**
 * How a field's label is drawn, in the grid's header and beside a value in the narrow list alike: small spaced capitals, the host
 * app's style for a field label and a table heading. The letters are the label as its term gives it (`TableColumn.label`); the
 * capitals are drawn by the style, never typed into the text, so a screen reader and a copy get the label in its own case.
 */
const LABEL_STYLE = "font-semibold uppercase tracking-wide";
/** A link's chip: every link value is drawn in one, whether its cell holds one value or several. */
const CHIP = "inline-flex min-w-0 items-center rounded-[var(--r-sm)] border border-[var(--line)] px-1.5 leading-[20px]";
const NARROW_LINE = 20;
/** The height of a list row's line that holds a cell with several values: room for a finger on the cell and its "+N". */
const NARROW_TOUCH_LINE = 44;
/** A value longer than this is not also put into its tooltip: it is in the page once, in its cell. */
const TITLE_MAX = 300;
/** How long the list of all values stays after the pointer leaves, so the pointer can cross onto it, ms. */
const LEAVE_MS = 150;

type RenderRef = ((ref: TableRef) => ReactNode) | undefined;

/** How long after an outside touch its click is still held back, ms: a tap's click follows its touch at once; later is another act. */
const DISMISS_CLICK_MS = 700;
/**
 * How long after a press the focus changes it causes still count as that press's, ms. A press moves the focus (onto "+N", or off it)
 * before its click arrives; for a finger the focus moves only after the finger is lifted. Past this, a focus change is the keyboard's.
 */
const PRESS_FOCUS_MS = 700;

/**
 * Holds back the click that follows a touch which only put a list away, so the same tap does not also act on what lies under it (a
 * row would open its record). It lets go after that one click, when the touch turns into a scroll, or after {@link DISMISS_CLICK_MS}.
 */
function holdBackNextClick(): void {
  const done = () => {
    document.removeEventListener("click", swallow, true);
    document.removeEventListener("pointercancel", done, true);
    clearTimeout(timer);
  };
  const swallow = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    done();
  };
  const timer = setTimeout(done, DISMISS_CLICK_MS);
  document.addEventListener("click", swallow, true);
  document.addEventListener("pointercancel", done, true);
}

/**
 * A cell that holds several values: its first value, "+N" for the rest, and the list of ALL of them on request. So no value is cut
 * without a sign, and every value can be read from the cell without opening the record.
 *
 * WHAT OPENS THE LIST, and what puts it away. Three things can hold it open, and each is ended by its own opposite:
 *  - a mouse pointer on "+N" or on the list (`hover`): ended by the pointer leaving both. A finger is not a hover: the mouse events a
 *    browser makes up after a touch come with a touch pointer type and are not counted;
 *  - focus that came from the keyboard (`focus`): ended by the focus leaving. Focus that a press put there is not counted: a tap also
 *    focuses the button, and counting it would keep the list open after the second tap (Agent.Tester round 2, F-N1);
 *  - a tap or a click on the cell or on "+N" (`pinned`): ended by a second tap or click anywhere on the same cell, in any order
 *    ("+N" then the value beside it, the value then "+N", the cell's edge ...). A press on the cell may take the focus off "+N" before
 *    its click arrives; that focus change is the press's own and decides nothing: the click does (Agent.Tester round 3, F-R1).
 * And these end all three at once: Escape; any scroll outside the list (the list is fixed to the screen and would stay behind its
 * cell); a press anywhere outside the cell and the list. When that press is a finger's, it ONLY puts the list away: its click is held
 * back, so the first tap outside never also opens the row under it.
 *
 * The list is drawn outside the table (a portal, fixed to the screen), because the table clips what is inside it.
 *
 * @param props the cell's values; the host's way to name a link; whether "+N" takes a Tab stop; and `roomy`, for a touch layout,
 *   where the cell and the area a finger can hit around "+N" are at least 44 px high
 */
function ManyValues({ items, renderRef, tabbable, roomy }: { items: readonly Cell[]; renderRef: RenderRef; tabbable: boolean; roomy: boolean }) {
  const more = items.length - 1;
  const cellRef = useRef<HTMLSpanElement | null>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number | null; bottom: number | null; maxHeight: number } | null>(null);
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When the cell was last pressed, until that press's click (0: no press is under way). Focus changes that soon after are the press's. */
  const pressedAt = useRef(0);
  /** When the list was last pressed: the focus leaving "+N" for that is not leaving; reading or scrolling the list must not put it away. */
  const pressedListAt = useRef(0);
  const justPressed = (at: number) => at !== 0 && performance.now() - at < PRESS_FOCUS_MS;
  const open = hover || focus || pinned;
  const isMouse = (e: { pointerType?: string }) => e.pointerType !== "touch" && e.pointerType !== "pen";
  const stay = () => {
    if (leave.current !== null) clearTimeout(leave.current);
    leave.current = null;
    setHover(true);
  };
  const go = () => {
    if (leave.current !== null) clearTimeout(leave.current);
    leave.current = setTimeout(() => setHover(false), LEAVE_MS);
  };
  const closeAll = useCallback(() => {
    setHover(false);
    setFocus(false);
    setPinned(false);
  }, []);
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

  // While the list is open: any scroll but the list's own, and a press anywhere outside the cell and the list, put it away.
  useEffect(() => {
    if (!open) return;
    const within = (el: HTMLElement | null, target: EventTarget | null) => target instanceof Node && !!el && el.contains(target);
    const onScroll = (e: Event) => {
      if (!within(listRef.current, e.target)) closeAll();
    };
    const onPress = (e: PointerEvent) => {
      if (within(listRef.current, e.target)) {
        pressedListAt.current = performance.now();
        return;
      }
      if (within(cellRef.current, e.target)) return;
      closeAll();
      // A finger's press outside only puts the list away: the click it would make is held back.
      if (!isMouse(e)) holdBackNextClick();
    };
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPress, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPress, true);
    };
  }, [open, closeAll]);

  const first = items[0] as Cell;
  // The area a finger can hit around "+N", larger than the chip is drawn: a box centred on the chip, 44 px wide (the chip's own width
  // when that is more) and 44 px high where the layout has the room (the narrow one); in the grid it is the row's 36 px high.
  const hitArea = " relative after:absolute after:left-1/2 after:top-1/2 after:w-[max(44px,100%)] after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] " + (roomy ? "after:h-[44px]" : "after:h-[36px]");
  return (
    <span
      ref={cellRef}
      // A tap or click anywhere on the cell opens the list, and the next one on the same cell puts it away. It never reaches the row.
      onClick={(e) => {
        e.stopPropagation();
        pressedAt.current = 0;
        setPinned((p) => !p);
      }}
      onPointerDown={() => { pressedAt.current = performance.now(); }}
      className={"flex min-w-0 flex-1 cursor-pointer items-center gap-1 self-stretch" + (roomy ? " min-h-[44px]" : "")}
      data-list-count={items.length}
      data-list-open={open ? "true" : undefined}
    >
      <span className={CHIP}>
        <CellView cell={first} renderRef={renderRef} tabbable={false} roomy={false} chip={false} />
      </span>
      <button
        ref={anchor}
        type="button"
        tabIndex={tabbable ? 0 : -1}
        aria-expanded={open}
        aria-label={`${more} more ${more === 1 ? "value" : "values"}: show all ${items.length}`}
        data-testid="record-table-more"
        data-more-count={more}
        onPointerEnter={(e) => { if (isMouse(e)) stay(); }}
        onPointerLeave={(e) => { if (isMouse(e)) go(); }}
        onFocus={() => { if (!justPressed(pressedAt.current)) setFocus(true); }}
        onBlur={() => {
          setFocus(false);
          // The focus left by the keyboard: what a key press pinned goes too. But a press on this cell (its click decides, and must find
          // the list as it was) or on the list (not leaving at all) also takes the focus off "+N", and that changes nothing here.
          if (!justPressed(pressedAt.current) && !justPressed(pressedListAt.current)) setPinned(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); closeAll(); }
          // Space and Enter are this button's own (they click it); they must not also open the row.
          if (e.key === " " || e.key === "Enter") e.stopPropagation();
        }}
        className={"flex-none rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--paper-2)] px-1.5 text-[12px] font-semibold leading-[20px] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" + hitArea}
      >
        +{more}
      </button>
      {open && place
        ? createPortal(
            <div
              ref={listRef}
              role="group"
              aria-label={`All ${items.length} values`}
              data-testid="record-table-all-values"
              onPointerEnter={(e) => { if (isMouse(e)) stay(); }}
              onPointerLeave={(e) => { if (isMouse(e)) go(); }}
              // The list is drawn elsewhere but is this cell's child to React: a click in it must not count as a click on the cell.
              onClick={(e) => e.stopPropagation()}
              className="fixed z-[1000] w-[264px] overflow-auto rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-2 text-[13px] text-[var(--ink)] shadow-[var(--shadow-md)]"
              style={{ left: place.left, maxHeight: place.maxHeight, ...(place.top !== null ? { top: place.top } : { bottom: place.bottom ?? 0 }) }}
            >
              <ul className="flex flex-col gap-1">
                {items.map((item, i) => (
                  <li key={i} className="flex min-w-0 items-center break-words leading-[20px]">
                    <CellView cell={item} renderRef={renderRef} tabbable={false} roomy={false} wrap />
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

/**
 * One cell's content. An empty cell draws nothing at all. A cell with several values draws the first and "+N" for the rest.
 *
 * @param props the cell; the host's way to name a link; whether the cell's own control takes a Tab stop; `roomy`, for a touch layout
 *   (see {@link ManyValues}); and `wrap`, for the list of all values, where a value is shown whole on as many lines as it needs
 */
function CellView({ cell, renderRef, tabbable, roomy, wrap = false, chip = true }: { cell: Cell; renderRef: RenderRef; tabbable: boolean; roomy: boolean; wrap?: boolean; chip?: boolean }) {
  const clip = wrap ? "min-w-0 break-words" : "truncate";
  // A link is a chip wherever it is drawn. `chip` false: the caller has already drawn the chip around this value.
  const inChip = (link: ReactNode) => (chip ? <span className={CHIP} data-chip="link">{link}</span> : link);
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
        return inChip(
          <span className={`${clip} text-[var(--ink-faint)]`} title={`${cell.uri} (an address this record does not explain; shown as stored)`} data-ref-state="unknown">
            {cell.uri}
          </span>,
        );
      }
      return inChip(
        <span className={wrap ? "min-w-0 break-words" : "min-w-0 truncate"} data-ref-state={renderRef ? "named-by-host" : "unresolved"} title={renderRef ? undefined : cell.uri}>
          {renderRef ? renderRef({ uri: cell.uri, id: cell.id }) : cell.uri}
        </span>,
      );
    case "list": {
      const first = cell.items[0];
      if (!first) return null;
      if (cell.items.length > 1) return <ManyValues items={cell.items} renderRef={renderRef} tabbable={tabbable} roomy={roomy} />;
      return (
        <span className="flex min-w-0 items-center gap-1" data-list-count={cell.items.length}>
          <span className={CHIP}>
            <CellView cell={first} renderRef={renderRef} tabbable={false} roomy={false} chip={false} />
          </span>
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
  onRefIntent,
  narrow = false,
  label = "Records",
  rowHeight = 36,
  overscan = 12,
}: RecordTableProps<R>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const columns: readonly TableColumn[] = useMemo(() => table?.columns ?? [], [table]);
  const data: TableRow<R>[] = useMemo(() => (loading || !table ? [] : table.rows), [loading, table]);
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

  // A list row shows its name and, under it, only the columns that hold a value in THAT row (the first `NARROW_FIELDS` of them, in
  // column order): a row with no values is its name alone. So a row's height is worked out from its own cells; no row is measured.
  // A line with several values is `NARROW_TOUCH_LINE` high, so a finger has 44 px on the cell without the chip being drawn larger.
  const narrowHeightFor = (lines: number, roomy: number) => 30 + lines * NARROW_LINE + roomy * (NARROW_TOUCH_LINE - NARROW_LINE) + 10;
  const isManyValued = (cell: Cell | undefined) => cell?.kind === "list" && cell.items.length > 1;
  const narrowHeightOf = (index: number) => {
    const shown = narrowFieldsOfRow(columns, rows[index]?.original.cells ?? [], NARROW_FIELDS);
    return narrowHeightFor(shown.length, shown.filter((f) => isManyValued(f.cell)).length);
  };
  /** The height of a row of the list's skeleton: a name and two lines. */
  const narrowRowHeight = narrowHeightFor(2, 0);
  // The first link a cell draws, for the host that reads a link's name on request.
  const firstRefOf = (cell: Cell | undefined): TableRef | null => {
    const first = cell?.kind === "list" ? cell.items[0] : cell;
    return first?.kind === "ref" && first.known ? { uri: first.uri, id: first.id } : null;
  };
  const refIntent = (cell: Cell | undefined) => {
    const ref = onRefIntent ? firstRefOf(cell) : null;
    if (ref) onRefIntent?.(ref);
  };
  const headerSpace = narrow ? 0 : HEADER_HEIGHT;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (narrow ? narrowHeightOf(index) : rowHeight),
    overscan,
    rangeExtractor,
    // The header row sits above the rows inside the scrolling box, and stays over them: a row brought into view stops below it.
    scrollMargin: headerSpace,
    scrollPaddingStart: headerSpace,
  });
  // A change of layout changes every row's height.
  useEffect(() => {
    virtualizer.measure();
  }, [narrow, columns, rowHeight, rows, virtualizer]);

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
                      {narrowFieldsOfRow(columns, row.original.cells, NARROW_FIELDS).map(({ column, cell }) => (
                        <span key={column.id} className="flex min-w-0 items-center gap-2 text-[12.5px] leading-[20px]" data-column-id={column.id}>
                          <span className={"w-[38%] max-w-[150px] shrink-0 truncate text-[10.5px] text-[var(--ink-faint)] " + LABEL_STYLE} data-field-label>
                            {column.label}
                          </span>
                          <span className="flex min-w-0 flex-1 items-center text-[var(--ink)]" onClickCapture={() => refIntent(cell)}>
                            <CellView cell={cell} renderRef={renderRef} tabbable roomy />
                          </span>
                        </span>
                      ))}
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
                    "flex min-w-0 items-center px-2.5 text-[11.5px] text-[var(--ink-soft)] " +
                    LABEL_STYLE +
                    " " +
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
                      <div
                        key={cell.id}
                        role="gridcell"
                        aria-colindex={i + 1}
                        data-column-id={cell.column.id}
                        // A mouse over the cell, or a tap or click on it, is the person going to that cell (a touch is not a hover).
                        onPointerEnter={(e) => { if (e.pointerType !== "touch" && e.pointerType !== "pen") refIntent(cell.getValue() as Cell); }}
                        onClickCapture={() => refIntent(cell.getValue() as Cell)}
                        className={cellBase + " border-r border-[var(--line-2)] " + (selected ? "bg-[var(--sel)]" : "") + focusLines}
                      >
                        {/* A cell's "+N" takes a Tab stop only in the row that holds the row Tab stop: one Tab from the row reaches it. */}
                        <CellView cell={cell.getValue() as Cell} renderRef={renderRef} tabbable={isTabStop} roomy={false} />
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
