/**
 * The Value card's presentation view: the Scale as an arrow with the
 * levels as points on it, and a Timeline view. In edit, points drag (or arrow-key) to change value.
 */
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type MutableRefObject, type PointerEvent, type ReactNode, type RefObject } from "react";
import { kindClass, type ValueCardData, type ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { ALL_VALUE, carryRaw, levelNumberDisplay, levelRangeEnds, levelNumberTyped, levelHasQualifierValue, levelKey, levelLike, qualifierValues, resolveLevelKey, scaleDirectionOf, scaleQualifierNames, withScaleQualifiers } from "@kaigilb/gilbplatformcode-value-card-model";
import { planCapSentence } from "./planCapSentence";
import { eventTargetInTopDialog, modalIsOpen } from "@kaigilb/gilbplatformcode-open-popups";
import { PlanQualifierValue } from "@kaigilb/gilbplatformcode-qualifier-value-picker";
import { MENU_KINDS, NewMenu, RESOURCE_MENU_KINDS, type MenuSet } from "./newMenu";
import { RowChips, setVariables as setVariablesOf, withVariable } from "./chips";
import { EndpointEnd, endHasType, endRoom } from "./endpoint";
import type { QualifierPick } from "@kaigilb/gilbplatformcode-qualifier-value-picker";
import { PlanValueGraphFullScreen, ViewToggle, inTextField, useGraphUi, type GraphControl, type GraphView } from "./ui";
import {
  allWhole,
  buildAxis,
  arrowBands,
  fmt,
  groupLabel,
  groupLevels,
  DAY,
  dateAxis,
  dateRange,
  formatDay,
  isoDay,
  snapDate,
  type DateAxis,
  niceDateTicks,
  seriesPath,
  isLimitKind,
  staggerRows,
  textWidth,
  currentValues,
  yearOutOfRange,
  YEAR_RANGE_SENTENCE,
  markerHalf,
  MARKER,
  parseDate,
  snapStep,
  snapValue,
  type Axis,
} from "@kaigilb/gilbplatformcode-value-graph-geometry";

export interface PlanValueGraphProps {
  data: ValueCardData;
  /** Dragging and editing are on only when true. */
  editing: boolean;
  /** Called with the whole new level list after a drag or edit ends. */
  onChangeLevels: (next: ValueLevel[]) => void;
  /** Timeline height in px. Default: clamp(width x 0.45, 320, 560). */
  height?: number;
  /** The Value's name, shown in the full-screen header. Default: the Scale's text. */
  title?: string;
  /** While a group write (a row moved) runs: "Moving 12 of 50…" shows in the header and dragging is off. */
  progress?: { done: number; total: number } | null;
  /** The find stopped at its cap: the header says "Showing the first N of M…". */
  capped?: { total: number; cap: number } | null;
  /** A sentence for the card's notice line (also shown in the graph). */
  onNotice?: (notice: string | null) => void;
}

/** What the wrapper hands the live graph: the lifted view, the full-screen button, and the Escape arbitration hooks. */
interface InnerUi {
  view: GraphView;
  onView: (v: GraphView) => void;
  /** Right end of the toolbar row (the full-screen button). */
  trailing?: ReactNode;
  /** Left end of the toolbar row, next to the view tabs (the "+ New" button). */
  lead?: ReactNode;
  /** The layer draws its own toolbar. */
  noToolbar?: boolean;
  control: MutableRefObject<GraphControl | null>;
  /** The "+ New" button, so the menu can hand the focus back to it. */
  newRef: RefObject<HTMLButtonElement | null>;
  /** "New qualifier set…": leave full screen and focus the Levels editor. */
  onNewSet: () => void;
  /** Says a sentence in the graph's notice line. */
  notify: (text: string) => void;
  /** A group write is running (a row move): dragging is off. */
  busy?: boolean;
}

/** The text of the notice when a level vanished under an open popover or a drag. */
const LEVEL_GONE = "This level was removed by someone else.";

/**
 * A level's identity while it is shown: its record key (`lkey`), else a client id made when first seen. An open popover, a
 * drag, a key step and a selection hold this, not the list position, so a list that changes under them (someone else deleted an earlier
 * level) does not move them to another level. An edit that copies a level hands its id on ({@link keepId}).
 */
const clientIds = new WeakMap<object, string>();
let clientSeq = 0;
function idOf(l: ValueLevel): string {
  let id = clientIds.get(l);
  if (!id) {
    id = levelKey(l) ?? `c:${++clientSeq}`;
    clientIds.set(l, id);
  }
  return id;
}
/** `next` is the edited copy of `prev`: same raw members, same record key, same id. */
function keepId<T extends ValueLevel>(next: T, prev: ValueLevel): T {
  clientIds.set(next, idOf(prev));
  return carryRaw(next, prev);
}
/** A level made here has no record yet; its id is a client id (and its record key follows from the host). */
const isClientId = (id: string) => id.startsWith("c:") || id.startsWith("new:");


const ROW_H = 92;
/** Extra height above each Arrow row while editing, for the qualifier chips. */
const CHIP_BAND = 22;
const BENCHMARKS = ["past", "status"];
const PAD = 28;
const MIN_W = 320;
/** The "no date" lane at the right edge of the Timeline, and where its markers and labels may sit. */
const LANE_W = 56;
const LANE_COLS = [0, -12, 12];
const LABEL_SHIFTS = [0, 13, -13, 26, -26];
const LINE_COLOURS = ["#2563eb", "#9333ea", "#0d9488", "#db2777", "#ca8a04", "#4f46e5"];

/**
 * A drag in progress. `t` is the dragged date (ms, UTC midnight; null = the "no date" lane), `t0`/`v0` where it started, `sx`/`sy` the
 * pointer at the start. `lock` (Timeline only) is the direction chosen after the first 6 px: "x" date only, "y" value only.
 */
type Drag = { id: string; i: number; value: number; startPx: number; moved: boolean; t: number | null; t0: number | null; v0: number; sx: number; sy: number; lock: "x" | "y" | null };

/** Movement (px) before a Timeline drag picks its axis. */
const LOCK_PX = 6;
/** Idle time (ms) after the last Alt+arrow before the date step is written. */
const KEY_IDLE_MS = 400;

const UNIT_WORDS: Record<string, [string, string]> = {
  min: ["minute", "minutes"],
  mins: ["minute", "minutes"],
  s: ["second", "seconds"],
  sec: ["second", "seconds"],
  secs: ["second", "seconds"],
  h: ["hour", "hours"],
  hr: ["hour", "hours"],
  hrs: ["hour", "hours"],
  d: ["day", "days"],
};
/** The unit spelled out for a screen reader ("min" -> "minutes"); any other unit is read as written. */
function unitWord(unit: string, v: number): string {
  const w = UNIT_WORDS[unit.trim().toLowerCase()];
  return w ? (v === 1 ? w[0] : w[1]) : unit;
}

function levelName(l: ValueLevel, data: ValueCardData): string {
  // The level's own date first, then its qualifier set (the row label has no date).
  const set = groupLabel(data, l);
  const parts = [l.qualifier.when, set !== "no qualifier" ? set : ""].filter(Boolean);
  return `${l.kind}${parts.length ? ", " + parts.join(" · ") : ""}`;
}

function Marker({ kind, x, y, grey, resource }: { kind: string; x: number; y: number; grey: boolean; resource?: boolean }) {
  const k = kindClass(kind, resource);
  const g = grey ? "#9ca3af" : null;
  const M = MARKER;
  if (k === "status") return <circle cx={x} cy={y} r={M.status.r} fill={g ?? "#111827"} />;
  if (k === "past") return <circle cx={x} cy={y} r={M.past.r} fill="#fff" stroke={g ?? "#9ca3af"} strokeWidth={M.past.stroke} />;
  if (k === "tolerable") return <rect x={x - M.bar.w / 2} y={y - M.bar.h / 2} width={M.bar.w} height={M.bar.h} fill={g ?? "#d97706"} />;
  if (k === "goal") return <rect x={x - M.goal.w / 2} y={y - M.goal.h / 2} width={M.goal.w} height={M.goal.h} fill={g ?? "#16a34a"} />;
  if (k === "fail" || k === "survival")
    return <rect x={x - M.bar.w / 2} y={y - M.bar.h / 2} width={M.bar.w} height={M.bar.h} fill={g ?? "#dc2626"} />;
  if (k === "wish")
    return (
      <polygon
        points={Array.from({ length: 10 }, (_, n) => {
          const r = n % 2 ? M.wish.inner : M.wish.outer;
          const a = (Math.PI / 5) * n - Math.PI / 2;
          return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`;
        }).join(" ")}
        fill={g ?? "#eab308"}
      />
    );
  const d = M.other.side;
  return <rect x={x - d / 2} y={y - d / 2} width={d} height={d} transform={`rotate(45 ${x} ${y})`} fill={g ?? "#6366f1"} />;
}

/** A marker's shape plus its keyboard focus ring. Hover and focus grow it to 1.2x with CSS only (no per-marker state). */
function MarkerShape({ kind, x, y, grey, selected, resource }: { kind: string; x: number; y: number; grey: boolean; selected: boolean; resource?: boolean }) {
  return (
    <>
      <circle
        data-focus-ring
        cx={x}
        cy={y}
        r={markerHalf(kind, resource) * 1.2 + 4}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.5}
        className={selected ? "opacity-100" : "opacity-0 group-focus-visible:opacity-100"}
      />
      <g
        className="origin-center transition-transform [transform-box:fill-box] group-hover:scale-[1.2] group-focus-visible:scale-[1.2]"
      >
        <Marker kind={kind} x={x} y={y} grey={grey} resource={resource} />
      </g>
    </>
  );
}

interface MarkerHandlers {
  startDrag: (e: PointerEvent<SVGGElement>, i: number) => void;
  moveDrag: (e: PointerEvent<SVGGElement>, svg: SVGSVGElement | null) => void;
  endDrag: (e: PointerEvent<SVGGElement>, cx: number, cy: number, popY: number) => void;
  key: (e: KeyboardEvent<SVGGElement>, i: number) => void;
}

/** Test hook: how many times a level marker rendered. A pointermove must re-render the dragged marker only. */
export const markerRenders = { count: 0 };

/** Stable handlers a marker calls; they read the latest view state through a ref. */
interface MarkerApi {
  down: (e: PointerEvent<SVGGElement>, i: number) => void;
  move: (e: PointerEvent<SVGGElement>) => void;
  up: (e: PointerEvent<SVGGElement>, cx: number, cy: number, popY: number) => void;
  key: (e: KeyboardEvent<SVGGElement>, i: number) => void;
  /** A key came up: a pending Alt+arrow date step is written now. */
  keyUp: () => void;
}

interface ArrowMarkerProps {
  api: MarkerApi;
  i: number;
  x: number;
  v: number | null;
  kind: string;
  /** A Development Resource card: Budget is the Goal point. */
  resource?: boolean;
  when: string;
  label: string;
  axisMin: number;
  axisMax: number;
  ay: number;
  top: number;
  popY: number;
  upOff: number;
  downOff: number;
  line: number;
  editing: boolean;
  /** Just added (or picked) and its value popover is open. */
  selected: boolean;
  /** The author's own text of the number when it is not the plain number ("5-10", "approx. 5"); shown instead of the number. */
  text?: string;
  /** A range text is drawn as a short bar from `x1` to `x2` (px). */
  bar?: { x1: number; x2: number };
}

/** One level on the arrow. Memoised: it re-renders only when its own props change. */
const ArrowMarker = memo(function ArrowMarker(p: ArrowMarkerProps) {
  markerRenders.count += 1;
  const { api, i, x, v, kind, when, ay, line } = p;
  const half = markerHalf(kind, p.resource);
  const hit = MARKER.hit;
  return (
    <g
      className="group active:cursor-grabbing"
      tabIndex={0}
      role="slider"
      aria-label={p.label}
      aria-valuenow={v ?? undefined}
      aria-valuemin={p.axisMin}
      aria-valuemax={p.axisMax}
      data-level={i}
      data-selected={p.selected ? "" : undefined}
      style={{ cursor: p.editing && v !== null ? "grab" : "pointer", outline: "none" }}
      onPointerDown={(e) => api.down(e, i)}
      onPointerMove={(e) => api.move(e)}
      onPointerUp={(e) => api.up(e, x, p.top, p.popY)}
      onKeyDown={(e) => api.key(e, i)}
    >
      <rect x={x - hit / 2} y={ay - hit / 2} width={hit} height={hit} fill="transparent" />
      {p.bar ? <line data-range-bar="" x1={p.bar.x1} x2={p.bar.x2} y1={ay} y2={ay} stroke="#6b7280" strokeWidth={5} strokeLinecap="round" opacity={0.45} /> : null}
      <MarkerShape kind={kind} x={x} y={ay} grey={v === null} selected={p.selected} resource={p.resource} />
      <text x={x} y={ay - half - MARKER.gap - line * p.upOff} fontSize={10} textAnchor="middle" fill={v === null ? "#9ca3af" : "#111827"}>{kind}</text>
      <text x={x} y={ay + half + MARKER.gap + 10 + line * p.downOff} fontSize={11} textAnchor="middle" fill={v === null ? "#9ca3af" : "#111827"}>
        {p.text ?? (v === null ? "–" : fmt(v))}
      </text>
      {when && (
        <text x={x} y={ay + half + MARKER.gap + 21 + line * p.downOff} fontSize={9} textAnchor="middle" fill="#9ca3af">{when}</text>
      )}
    </g>
  );
});

interface LineMarkerProps {
  api: MarkerApi;
  i: number;
  x: number;
  y: number;
  v: number;
  kind: string;
  resource?: boolean;
  label: string;
  editing: boolean;
  selected: boolean;
  /** Label shift in px (down is positive), so labels do not overlap. */
  dy: number;
  /** In the "no date" lane: label centred under the marker. */
  lane: boolean;
  /** 1 normal, 0.6 undated, 0.25 dimmed by the legend. */
  opacity: number;
  /** Screen-reader value: "Goal, 5.2 minutes, 30 June 2027". */
  vtext: string;
  /** The author's own text of the number when it is not the plain number ("5-10"); shown on the label instead of the number. */
  text?: string;
  /** A range text is drawn as a short bar from `y1` to `y2` (px) with the marker at its midpoint. */
  bar?: { y1: number; y2: number };
}

/** One level on the timeline. Memoised like {@link ArrowMarker}. */
const LineMarker = memo(function LineMarker(p: LineMarkerProps) {
  markerRenders.count += 1;
  const { api, i, x, y, v } = p;
  const hit = MARKER.hit;
  const half = markerHalf(p.kind, p.resource);
  return (
    <g
      className="group active:cursor-grabbing"
      tabIndex={0}
      role="slider"
      aria-label={p.label}
      aria-valuenow={v}
      aria-valuetext={p.vtext}
      data-level={i}
      data-lane={p.lane ? "" : undefined}
      data-selected={p.selected ? "" : undefined}
      opacity={p.opacity}
      style={{ cursor: p.editing ? "grab" : "pointer", outline: "none" }}
      onPointerDown={(e) => api.down(e, i)}
      onPointerMove={(e) => api.move(e)}
      onPointerUp={(e) => api.up(e, x, y, hit / 2)}
      onKeyDown={(e) => api.key(e, i)}
      onKeyUp={() => api.keyUp()}
    >
      <rect x={x - hit / 2} y={y - hit / 2} width={hit} height={hit} fill="transparent" />
      {p.bar ? <line data-range-bar="" x1={x} x2={x} y1={p.bar.y1} y2={p.bar.y2} stroke="#6b7280" strokeWidth={4} strokeLinecap="round" opacity={0.45} /> : null}
      <MarkerShape kind={p.kind} x={x} y={y} grey={false} selected={p.selected} resource={p.resource} />
      {p.lane ? (
        <text x={x} y={y + half + MARKER.gap + 10 + p.dy} fontSize={10} textAnchor="middle" fill="#111827">{p.kind} {p.text ?? fmt(v)}</text>
      ) : (
        <text x={x + half + MARKER.gap + 6} y={y + 4 + p.dy} fontSize={11} fill="#111827">{p.kind} {p.text ?? fmt(v)}</text>
      )}
    </g>
  );
});

/** Distance from (px, py) to the segment a-b. */
function segDist(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
  return Math.hypot(px - (a.x + u * dx), py - (a.y + u * dy));
}

interface ArrowRowProps {
  g: { key: string; label: string; indexes: number[] };
  r: number;
  top: number;
  plan: { upMax: number; height: number; upOf: Map<number, number>; downOf: Map<number, number> };
  pad: number;
  line: number;
  axis: Axis;
  x0: number;
  x1: number;
  dir: ValueCardData["scale"]["direction"];
  unit: string;
  editing: boolean;
  data: ValueCardData;
  api: MarkerApi;
  /** The level being dragged when it is in this row (else -1), and its live value. */
  liveI: number;
  liveV: number;
  /** The selected level when it is in this row (else -1). */
  selI: number;
}

/** One Arrow row (bands, line, markers). Memoised: a drag re-renders only the row that holds the dragged level. */
const ArrowRow = memo(function ArrowRow(p: ArrowRowProps) {
  const { g, r, top, plan, pad, line: LINE, axis, x0, x1, dir, unit, editing, data, api, liveI, liveV, selI } = p;
  const levels = data.levels;
  const ay = top + 44 + pad + LINE * plan.upMax;
  const shown = (n: number): number | null => (n === liveI ? liveV : levels[n]!.value);
  const val = (kind: string) => {
    const i = g.indexes.find((n) => kindClass(levels[n]!.kind, data.resource) === kind && shown(n) !== null);
    return i === undefined ? null : (shown(i) as number);
  };
  const G = val("goal"), S = val("status"), P = val("past");
  const px = (v: number) => axis.toPx(v);
  // Several Goals/Tolerables at different dates: the bands follow the latest-dated (the current plan); the earlier ones are markers only.
  const current = (kind: string) =>
    currentValues(g.indexes.filter((n) => kindClass(levels[n]!.kind, data.resource) === kind && shown(n) !== null).map((n) => ({ value: shown(n) as number, when: levels[n]!.qualifier.when })));
  const bands = arrowBands(dir, current("goal"), current("tolerable"), axis);
  return (
    <g data-row={r} role="group" aria-label={g.label}>
      <title>{g.label}</title>
      {/* While editing, the qualifier chips (drawn over this row) show the label instead; the row's group name is the label either way. */}
      {!editing && <text x={x0} y={top + 11} fontSize={11} fill="#374151">{g.label}</text>}
      {bands.map((b, n) => (
        <rect key={n} data-band={b.tone} x={b.x0} y={ay - 4} width={b.x1 - b.x0} height={8} fill={b.fill} />
      ))}
      <line x1={x0} x2={x1 - 4} y1={ay} y2={ay} stroke="#6b7280" strokeWidth={1.5} />
      <polygon points={`${x1},${ay} ${x1 - 8},${ay - 4} ${x1 - 8},${ay + 4}`} fill="#6b7280" />
      {dir === "target" && <polygon points={`${x0},${ay} ${x0 + 8},${ay - 4} ${x0 + 8},${ay + 4}`} fill="#6b7280" />}
      {P !== null && S !== null && <line x1={px(P)} x2={px(S)} y1={ay} y2={ay} stroke="#6b7280" strokeDasharray="4 3" />}
      {S !== null && G !== null && (
        <g>
          <line x1={px(S)} x2={px(G)} y1={ay} y2={ay} stroke="#16a34a" strokeDasharray="1 3" strokeWidth={2} />
          <text x={(px(S) + px(G)) / 2} y={ay - 12} fontSize={10} textAnchor="middle" fill="#15803d">
            {fmt(Math.abs(S - G))} {unit} to {data.resource ? "Budget" : "Goal"}
          </text>
        </g>
      )}
      {g.indexes.map((i) => {
        const v = shown(i);
        const x = v === null ? x0 : px(v);
        const l = levels[i]!;
        const typedText = i === liveI ? undefined : levelNumberTyped(l);
        const ends = typedText ? levelRangeEnds(typedText) : null;
        return (
          <ArrowMarker
            key={i}
            api={api}
            i={i}
            x={x}
            v={v}
            kind={l.kind}
            resource={data.resource}
            when={l.qualifier.when}
            label={levelName(l, data)}
            axisMin={axis.min}
            axisMax={axis.max}
            ay={ay}
            top={top}
            popY={plan.height - 8}
            upOff={plan.upOf.get(i) ?? 0}
            downOff={plan.downOf.get(i) ?? 0}
            line={LINE}
            editing={editing}
            selected={selI === i}
            {...(typedText ? { text: levelNumberDisplay(l) } : {})}
            {...(ends ? { bar: { x1: px(ends[0]), x2: px(ends[1]) } } : {})}
          />
        );
      })}
    </g>
  );
});

/**
 * "New qualifier set…": scroll to and focus the card's own "add level" editor (the Levels section). It is found from the graph by
 * walking up to the card that holds it; in-place editing keeps it behind "+ Level", which is pressed first.
 */
export function focusLevelEditor(from: HTMLElement | null): void {
  let tries = 0;
  const go = () => {
    let scope: HTMLElement | null = null;
    for (let a = from?.parentElement ?? null; a; a = a.parentElement) {
      if (a.querySelector('[data-testid="plan-level-add"], [data-testid="plan-levels-view"]')) {
        scope = a;
        break;
      }
    }
    if (!scope) return;
    const panel = scope.querySelector<HTMLElement>('[data-testid="plan-level-panel"], [data-testid="plan-level-add"]');
    if (!panel) {
      if (tries === 0) [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === "+ Level")?.click();
      if (++tries < 6) setTimeout(go, 40);
      return;
    }
    panel.scrollIntoView?.({ block: "center" });
    (panel.querySelector<HTMLElement>('input[aria-label="New level kind"]') ?? panel.querySelector<HTMLElement>("button, input"))?.focus();
  };
  setTimeout(go, 0);
}

function PlanValueGraphInner({ data, editing, onChangeLevels, height, ui }: PlanValueGraphProps & { ui: InnerUi }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const { view, onView, lead, trailing, noToolbar, control, newRef, notify } = ui;
  const busyRef = useRef(false);
  busyRef.current = !!ui.busy;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // Held by the level's identity, not its list position. `ref` is the level as opened: a new level is found again by it once its record key replaced the client id.
  const [open, setOpen] = useState<{ id: string; ref: ValueLevel; x: number; y: number } | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const [draft, setDraft] = useState("");
  /** The level whose popover date field holds a year outside 1900..2200 (it is not written). */
  const [badYearFor, setBadYearFor] = useState<string | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  // Alt+arrow date steps wait here (one write on keyup or after KEY_IDLE_MS), shown live meanwhile.
  const [kbd, setKbd] = useState<{ id: string; t: number } | null>(null);
  const kbdRef = useRef<{ id: string; t: number } | null>(null);
  const kbdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});
  useEffect(
    () => () => {
      if (kbdTimer.current) clearTimeout(kbdTimer.current);
    },
    [],
  );
  // The "+ New" menu: from the button or key N (`place` unset), or from a click on the Timeline (`place` set).
  const [menu, setMenu] = useState<{ at: { left: number; top: number }; place?: { when: string; value: number; heading: string; order: string[] } } | null>(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  // The level just added: its value popover opens (number selected) and it shows as selected.
  const [auto, setAuto] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  // A qualifier or date chip was changed: once the row has moved, the focus goes back to its chip.
  const refocus = useRef<{ i: number; chip: string } | null>(null);
  useEffect(() => {
    const f = refocus.current;
    if (!f) return;
    const box = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-row-idx]") ?? [])].find((b) => b.dataset.rowIdx!.split(",").includes(String(f.i)));
    if (!box) return;
    refocus.current = null;
    (box.querySelector<HTMLElement>(`[data-chip="${f.chip}"]`) ?? box.querySelector<HTMLElement>("[data-chip]"))?.focus();
  });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.max(MIN_W, Math.round(w)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The full-screen layer asks these before it takes an Escape (a drag, then a popover, come first).
  control.current = {
    dragging: () => dragRef.current !== null,
    cancelDrag: () => {
      dragRef.current = null;
      setDrag(null);
    },
    closePopover: () => {
      if (menuRef.current) {
        closeMenu();
        return true;
      }
      if (!openRef.current) return false;
      setOpen(null);
      return true;
    },
    openMenu: (anchor) => {
      if (!editing || !data.levels.length) return;
      setMenu({ at: anchor ? { left: anchor.left, top: anchor.bottom + 4 } : { left: 8, top: 8 } });
    },
  };

  const levels = data.levels;
  /** The list position of the level `id` now, or -1 when it is gone. A new level whose client key became its record's id is found through `ref` (the host aliased the key). */
  const posOf = (id: string, ref?: ValueLevel): number => {
    const at = levels.findIndex((l) => idOf(l) === id);
    if (at >= 0 || !ref) return at;
    const key = levelKey(ref);
    const to = key ? resolveLevelKey(key) : undefined;
    return to && to !== key ? levels.findIndex((l) => levelKey(l) === to) : -1;
  };
  const openAt = open ? posOf(open.id, open.ref) : -1;
  const whole = useMemo(() => allWhole(data), [data]);
  /** The Arrow's rows, from the data only (a drag does not change them). */
  const rows = useMemo(() => groupLevels(data), [data]);
  const numbers = useMemo(
    () =>
      levels.flatMap((l) => {
        if (l.value === null) return [];
        const ends = levelRangeEnds(levelNumberTyped(l) ?? "");
        return ends ? [l.value, ends[0], ends[1]] : [l.value];
      }),
    [levels],
  );
  const dir = scaleDirectionOf(data);
  const unit = data.scale.unit;

  const commit = (i: number, value: number) => {
    if (levels[i].value === value) return;
    onChangeLevels(levels.map((l, n) => (n === i ? keepId({ ...l, value }, l) : l)));
  };
  /** One write for a Timeline drop or key step: the new value and date together (`t` null = no date; `t0` the date it started with). */
  const commitTl = (i: number, value: number, t: number | null, t0: number | null) => {
    const l = levels[i]!;
    const when = t === t0 ? l.qualifier.when : t === null ? "" : isoDay(t);
    if (l.value === value && l.qualifier.when === when) return;
    onChangeLevels(levels.map((x, n) => (n === i ? keepId({ ...x, value, qualifier: { ...x.qualifier, when } }, x) : x)));
  };
  /** A level's own date from its popover: "" = no date; a year outside 1900..2200 or a partial date is not written. */
  const commitWhen = (i: number, when: string) => {
    const l = levels[i];
    if (!l || l.qualifier.when === when) return;
    if (when !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(when) || yearOutOfRange(when))) return;
    onChangeLevels(levels.map((x, n) => (n === i ? keepId({ ...x, qualifier: { ...x.qualifier, when } }, x) : x)));
  };
  /** One call for a whole row or series: `make` changes each of its levels (the same object back = untouched). */
  const moveRow = (indexes: number[], chip: string, make: (l: ValueLevel) => ValueLevel) => {
    const set = new Set(indexes);
    // The row is found again by a target level (Past and Status may join another row of the same qualifiers).
    refocus.current = { i: indexes.find((i) => !BENCHMARKS.includes(kindClass(levels[i]!.kind, data.resource))) ?? indexes[0]!, chip };
    onChangeLevels(
      levels.map((l, n) => {
        if (!set.has(n)) return l;
        const m = make(l);
        return m === l ? l : keepId(m, l);
      }),
    );
  };
  const pickVariable = (indexes: number[], name: string, pick: QualifierPick) =>
    moveRow(indexes, `var:${name}`, (l) => ({ ...l, qualifier: { ...l.qualifier, variables: withVariable(data, l, name, pick) } }));
  /** A qualifier chip (Arrow or Timeline) moves the whole set, Past and Status included (one row per set). */
  const pickRowVariable = pickVariable;
  /** The date chip is gone: a level's date is changed on the Timeline, in its popover, and in the Levels list. */
  // Stable callbacks for the memoised chip strips; they call the latest handlers.
  const act = useRef({ row: pickRowVariable, series: pickVariable });
  act.current = { row: pickRowVariable, series: pickVariable };
  const onRowVar = useCallback((idx: number[], name: string, pick: QualifierPick) => act.current.row(idx, name, pick), []);
  const onSeriesVar = useCallback((idx: number[], name: string, pick: QualifierPick) => act.current.series(idx, name, pick), []);
  flushRef.current = () => {
    if (kbdTimer.current) clearTimeout(kbdTimer.current);
    kbdTimer.current = null;
    const k = kbdRef.current;
    kbdRef.current = null;
    setKbd(null);
    const at = k ? posOf(k.id) : -1;
    const l = at >= 0 ? levels[at] : undefined;
    if (k && at < 0) notify(LEVEL_GONE);
    if (!k || !l || l.value === null) return;
    commitTl(at, l.value, k.t, parseDate(l.qualifier.when));
  };
  const closeMenu = () => {
    const m = menuRef.current;
    setMenu(null);
    if (m && !m.place) newRef.current?.focus();
  };
  /** The sets the menu offers: the same list on both views (a row = a series = a set) (`from` defines the set's qualifier). */
  const setsOf = () =>
    rows.map((g) => ({
      ...g,
      from: g.indexes[0]!,
      has: new Set(g.indexes.map((i) => kindClass(levels[i]!.kind, data.resource))),
    }));
  const valueAxis = () => {
    const ax = buildAxis(numbers, dir, 0, 1);
    return { mid: (ax.min + ax.max) / 2, snap: (v: number) => snapValue(ax, v, whole) };
  };
  /** One write: the new level, appended. It opens selected, with its number ready to type. */
  const addTo = (setKey: string, kind: string, at?: { when: string; value: number }) => {
    const s = setsOf().find((x) => x.key === setKey);
    if (!s) return;
    const { mid, snap } = valueAxis();
    const nl = levelLike(levels[s.from]!, kind, { members: s.indexes.map((i) => levels[i]!), axisMid: mid, snap, ...(data.resource ? { resource: true } : {}), ...(at ?? {}) });
    setMenu(null);
    setOpen(null);
    setAuto(idOf(nl));
    onChangeLevels([...levels, nl]);
  };
  const curRef = useRef<{ h: MarkerHandlers; svg: { current: SVGSVGElement | null } } | null>(null);
  const api = useMemo<MarkerApi>(
    () => ({
      down: (e, i) => curRef.current?.h.startDrag(e, i),
      move: (e) => curRef.current?.h.moveDrag(e, curRef.current.svg.current),
      up: (e, cx, cy, popY) => curRef.current?.h.endDrag(e, cx, cy, popY),
      key: (e, i) => curRef.current?.h.key(e, i),
      keyUp: () => {
        if (kbdRef.current) flushRef.current();
      },
    }),
    [],
  );
  const dragAt = drag ? posOf(drag.id) : -1;
  const kbdAt = kbd ? posOf(kbd.id) : -1;
  const shown = (i: number): number | null => (drag && dragAt === i ? drag.value : levels[i].value);

  useEffect(() => {
    if (auto === null) return;
    const at = posOf(auto);
    const l = at >= 0 ? levels[at] : undefined;
    if (!l) return;
    setAuto(null);
    const root = rootRef.current;
    const g = root?.querySelector(`[data-level="${at}"]`);
    const gr = g?.getBoundingClientRect();
    const rr = root?.getBoundingClientRect();
    setSel(auto);
    setOpen({ id: auto, ref: l, x: gr && rr ? gr.left - rr.left : 40, y: gr && rr ? gr.bottom - rr.top : 40 });
    setDraft(l.value === null ? "" : fmt(l.value));
    (g as SVGGElement | null)?.focus?.();
  }, [auto, levels]); // eslint-disable-line react-hooks/exhaustive-deps

  // A level that was open (or being dragged) and is gone: someone else removed it. Close the popover, drop the drag, say so.
  // (A new level whose record key replaced its client id is not gone: it is found again by its kind and qualifier.)
  useEffect(() => {
    if (open && openAt < 0) {
      setOpen(null);
      setSel(null);
      if (!isClientId(open.id)) notify(LEVEL_GONE);
    }
    const d = dragRef.current;
    if (d && posOf(d.id) < 0) {
      dragRef.current = null;
      setDrag(null);
      notify(LEVEL_GONE);
    }
  }, [levels]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!drag) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (modalIsOpen() && !eventTargetInTopDialog(e.target)) return;
      if (e.key === "Escape") {
        dragRef.current = null;
        setDrag(null);
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [drag]);

  /** The Arrow's geometry: rows, axis, label rows, row tops. From the saved values only, so a drag does not recompute it. */
  const arrow = useMemo(() => {
    if (view !== "arrow" || !levels.length) return null;
    const groups = rows;
    const subject = data.endpoint?.subject;
    const reference = data.endpoint?.reference;
    const hasS = endHasType(subject);
    const hasR = endHasType(reference);
    // The line starts and ends clear of the pictures at its ends.
    // Room for the picture AND its caption, so no value label of a marker at an end meets the caption.
    const widest = Math.max(0, ...numbers.map((v) => textWidth(fmt(v), 11)));
    const x0 = PAD + (hasS ? endRoom(widest) : 0);
    const x1 = width - PAD - (hasR ? endRoom(widest) : 0);
    const axis = buildAxis(numbers, dir, x0, x1);
    const LINE = 11;
    const pad = editing ? CHIP_BAND : 0;
    const plans = groups.map((g) => {
      const marks = g.indexes.map((i) => {
        // Label rows come from the saved values, so a drag does not shift the other labels.
        const v = levels[i].value;
        return { i, x: v === null ? x0 : axis.toPx(v), v };
      });
      const up = staggerRows(marks.map((m) => ({ x: m.x, w: textWidth(levels[m.i].kind, 10) })));
      // Each marker's own date sits under its value: the label is as wide as the wider of the two, and a second label row is two lines down.
      const dated = marks.some((m) => levels[m.i].qualifier.when);
      const down = staggerRows(marks.map((m) => ({ x: m.x, w: Math.max(textWidth(m.v === null ? "–" : fmt(m.v), 11), textWidth(levels[m.i].qualifier.when, 9)) })));
      const step = dated ? 2 : 1;
      const upMax = Math.max(0, ...up);
      const downMax = Math.max(0, ...down) * step;
      const upOf = new Map(marks.map((m, k) => [m.i, up[k]]));
      const downOf = new Map(marks.map((m, k) => [m.i, down[k] * step]));
      return { upMax, downMax, upOf, downOf, height: ROW_H + pad + LINE * (upMax + downMax) };
    });
    const tops: number[] = [];
    let acc = 0;
    plans.forEach((p) => {
      tops.push(acc);
      acc += p.height;
    });
    const total = acc;
    // What each row's chip strip is given: the same objects until the data or the width changes, so the memoised strips do not re-render.
    const chips = groups.map((g, r) => ({
      from: levels[g.indexes.find((i) => !BENCHMARKS.includes(levels[i]!.kind.toLowerCase())) ?? g.indexes[0]!]!,
      bandStyle: { left: PAD, top: tops[r]!, width: Math.max(0, width - 2 * PAD), height: 44 },
      popTop: tops[r]! + 46,
    }));
    return { groups, subject, reference, hasS, hasR, x0, x1, axis, LINE, pad, plans, tops, total, h: total + 44, chips };
  }, [view, rows, levels, data.endpoint, width, numbers, dir, editing]);

  /** The Timeline's geometry, axes and label places. From the saved values and the width only, so a drag does not recompute it. */
  const tl = useMemo(() => {
    if (view !== "timeline" || !levels.length) return null;
    const H = height ?? Math.min(560, Math.max(320, Math.round(width * 0.45)));
    const top = 30;
    const bottom = H - 30;
    const x0 = PAD + 34;
    const laneX0 = width - PAD - LANE_W;
    const x1 = laneX0 - 8;
    const times = levels.map((l) => parseDate(l.qualifier.when));
    const dated = times.filter((t): t is number => t !== null);
    const axis = buildAxis(numbers, dir, top, bottom, dir !== "higher" ? false : true);
    // Better end at the top: lower -> small values on top (no flip); higher -> large values on top (flip).
    // "Today" is the user's own calendar day, not the UTC day.
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const range = dateRange(dated, today);
    const dx = dateAxis(range.min, range.max, x0, x1);
    const xticks = niceDateTicks(range.min, range.max, Math.floor((x1 - x0) / 110));
    const series = rows.map((g, n) => ({ ...g, colour: LINE_COLOURS[n % LINE_COLOURS.length]!, n }));
    const seriesOf = new Map<number, number>();
    series.forEach((s) => s.indexes.forEach((i) => seriesOf.set(i, s.n)));
    const facts = levels.map((l, i) => ({ kind: kindClass(l.kind, data.resource), t: times[i], v: l.value }));

    // Marker places and label shifts come from the saved values, so a drag moves only the dragged marker.
    const lanes = LANE_COLS;
    const place = new Map<number, { x: number; y: number; lane: boolean; dy: number }>();
    const boxes: { l: number; r: number; t: number; b: number }[] = [];
    const laneUsed: { y: number; col: number }[] = [];
    const order = levels
      .map((l, i) => ({ i, v: l.value, t: times[i] }))
      .filter((m) => m.v !== null)
      .sort((a, b) => (a.t === null ? 1 : 0) - (b.t === null ? 1 : 0) || (a.t ?? 0) - (b.t ?? 0) || a.i - b.i);
    for (const m of order) {
      const l = levels[m.i]!;
      const y0 = axis.toPx(m.v as number);
      const half = markerHalf(l.kind, data.resource);
      const text = `${l.kind} ${fmt(m.v as number)}`;
      const lane = m.t === null;
      let x = lane ? laneX0 + LANE_W / 2 : dx.toPx(m.t as number);
      if (lane) {
        const near = laneUsed.filter((u) => Math.abs(u.y - y0) < 2 * half + 14);
        const col = lanes.find((c) => !near.some((u) => u.col === c)) ?? lanes[laneUsed.length % lanes.length]!;
        laneUsed.push({ y: y0, col });
        x += col;
      }
      const w = textWidth(text, lane ? 10 : 11);
      let dy = 0;
      for (const step of LABEL_SHIFTS) {
        const cy = lane ? y0 + half + MARKER.gap + 6 + step : y0 + step;
        const box = lane
          ? { l: x - w / 2, r: x + w / 2, t: cy - 6, b: cy + 6 }
          : { l: x + half + MARKER.gap + 6, r: x + half + MARKER.gap + 6 + w, t: cy - 6, b: cy + 6 };
        dy = step;
        if (!boxes.some((o) => box.l < o.r + 2 && o.l < box.r + 2 && box.t < o.b && o.t < box.b)) {
          boxes.push(box);
          break;
        }
        if (step === LABEL_SHIFTS[LABEL_SHIFTS.length - 1]) boxes.push(box);
      }
      place.set(m.i, { x, y: y0, lane, dy });
    }
    return { H, top, bottom, x0, laneX0, x1, times, axis, today, range, dx, xticks, series, seriesOf, facts, place };
  }, [view, data, levels, width, height, numbers, dir]);

  if (!levels.length) {
    return (
      <div data-kind="plan-value-graph" ref={rootRef} className="text-sm text-gray-500">
        No levels yet. Add Past, Status, Tolerable, {data.resource ? "Budget" : "Goal"} or Wish in Levels.
      </div>
    );
  }

  const toggle = noToolbar ? null : (
    <div className="mb-2 flex items-center gap-1">
      <ViewToggle view={view} onView={onView} />
      {lead}
      {trailing ? <div className="ml-auto">{trailing}</div> : null}
    </div>
  );

  // ----- shared pointer / key handling ----------------------------------------------------
  const axisOf = (a: Axis, vertical: boolean) => ({
    startDrag: (e: PointerEvent<SVGGElement>, i: number) => {
      if (levels[i].value === null) return;
      // While a row move is being written, the graph does not take a drag (the writes run in order and are rolled back in order).
      if (busyRef.current) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const t0 = parseDate(levels[i].qualifier.when);
      const d: Drag = { id: idOf(levels[i]), i, value: levels[i].value as number, startPx: vertical ? e.clientY : e.clientX, moved: false, t: t0, t0, v0: levels[i].value as number, sx: e.clientX, sy: e.clientY, lock: null };
      dragRef.current = d;
      setDrag(d);
    },
    moveDrag: (e: PointerEvent<SVGGElement>, svg: SVGSVGElement | null) => {
      const d = dragRef.current;
      if (!d || !svg) return;
      if (posOf(d.id) < 0) return; // the level is gone; the effect above drops the drag and says so
      const r = svg.getBoundingClientRect();
      const px = vertical ? e.clientY - r.top : e.clientX - r.left;
      const next = { ...d, value: snapValue(a, a.fromPx(px), whole), moved: d.moved || Math.abs((vertical ? e.clientY : e.clientX) - d.startPx) > 3 };
      // The dragged value lives in the ref; the view re-renders only when the snapped value or the moved flag changed.
      dragRef.current = next;
      if (next.value !== d.value || next.moved !== d.moved) setDrag(next);
    },
    endDrag: (e: PointerEvent<SVGGElement>, cx: number, cy: number, popY: number) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      const at = posOf(d.id);
      if (at < 0) {
        // The level was removed by someone else while it was held: nothing is written.
        notify(LEVEL_GONE);
        return;
      }
      if (!editing || !d.moved) {
        setOpen({ id: d.id, ref: levels[at]!, x: cx, y: cy + popY });
        setDraft(fmt(levels[at].value as number));
        return;
      }
      commit(at, d.value);
      void e;
    },
    key: (e: KeyboardEvent<SVGGElement>, i: number) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen({ id: idOf(levels[i]!), ref: levels[i]!, x: 40, y: 40 });
        setDraft(levels[i].value === null ? "" : fmt(levels[i].value as number));
        return;
      }
      if (!editing || levels[i].value === null) return;
      let dir1 = 0;
      if (!vertical) dir1 = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      else dir1 = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!dir1) return;
      e.preventDefault();
      const step = snapStep(a, whole) * (e.shiftKey ? 10 : 1);
      // Moving along the screen axis: flipped axes lose value as they go right/down.
      const sign = a.flip ? -1 : 1;
      const next = snapValue(a, (levels[i].value as number) + dir1 * sign * step, whole);
      commit(i, next);
    },
  });

  /**
   * Timeline pointer and key handling: the marker moves in x (date) and y (value). After LOCK_PX of movement the drag locks to
   * its main direction; Shift releases the lock (both change). Fail and Survival are limit lines: value only. The axes are built from
   * the saved levels, so they do not move during a drag; they re-fit after the drop. A drop writes value and date in one call.
   */
  const timelineOf = (a: Axis, dx: DateAxis, laneX0: number) => {
    const base = axisOf(a, true);
    const span = dx.max - dx.min;
    return {
      ...base,
      moveDrag: (e: PointerEvent<SVGGElement>, svg: SVGSVGElement | null) => {
        const d = dragRef.current;
        if (!d || !svg) return;
        const r = svg.getBoundingClientRect();
        const ox = e.clientX - d.sx;
        const oy = e.clientY - d.sy;
        const dist = Math.hypot(ox, oy);
        const at = posOf(d.id);
        if (at < 0) return; // gone: the effect above drops the drag and says so
        const limit = isLimitKind(levels[at]!.kind);
        let lock = d.lock;
        if (lock === null && dist > LOCK_PX) lock = limit ? "y" : Math.abs(ox) > Math.abs(oy) ? "x" : "y";
        const free = !limit && e.shiftKey && lock !== null;
        const byValue = lock !== null && (free || lock === "y");
        const byDate = lock !== null && (free || lock === "x");
        const value = byValue ? snapValue(a, a.fromPx(e.clientY - r.top), whole) : lock === null ? d.value : d.v0;
        const px = e.clientX - r.left;
        const t = byDate ? (px >= laneX0 ? null : snapDate(dx.fromPx(px), span)) : lock === null ? d.t : d.t0;
        const next: Drag = { ...d, value, t, lock, moved: d.moved || dist > 3 };
        dragRef.current = next;
        if (next.value !== d.value || next.t !== d.t || next.moved !== d.moved || next.lock !== d.lock) setDrag(next);
      },
      endDrag: (e: PointerEvent<SVGGElement>, cx: number, cy: number, popY: number) => {
        const d = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        if (!d) return;
        const at = posOf(d.id);
        if (at < 0) {
          notify(LEVEL_GONE);
          return;
        }
        // Neither value nor date changed: a click, which opens the popover as before.
        if (!editing || (d.value === d.v0 && d.t === d.t0)) {
          setOpen({ id: d.id, ref: levels[at]!, x: cx, y: cy + popY });
          setDraft(fmt(levels[at]!.value as number));
          return;
        }
        commitTl(at, d.value, d.t, d.t0);
        void e;
      },
      key: (e: KeyboardEvent<SVGGElement>, i: number) => {
        if (editing && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && levels[i]!.value !== null) {
          e.preventDefault();
          const id = idOf(levels[i]!);
          const from = kbdRef.current && kbdRef.current.id === id ? kbdRef.current.t : parseDate(levels[i]!.qualifier.when);
          if (from === null) return; // an undated level has no date to step; drag it out of the lane
          const t = from + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 7 : 1) * DAY;
          kbdRef.current = { id, t };
          setKbd({ id, t });
          if (kbdTimer.current) clearTimeout(kbdTimer.current);
          kbdTimer.current = setTimeout(() => flushRef.current(), KEY_IDLE_MS);
          return;
        }
        base.key(e, i);
      },
    };
  };

  const popover = open && openAt >= 0 ? (
    <div
      role="dialog"
      aria-label="Level"
      className="absolute z-10 w-64 rounded border border-gray-300 bg-white p-2 text-xs shadow"
      style={{ left: Math.max(0, Math.min(open.x, width - 270)), top: open.y }}
    >
      <div className="font-medium">{levelName(levels[openAt]!, data)}</div>
      <div className="mt-1 flex items-center gap-1">
        {editing ? (
          <input
            aria-label="Value"
            className="w-20 rounded border border-gray-300 px-1"
            value={draft}
            autoFocus={sel === open.id}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(null);
                return;
              }
              if (e.key === "Enter") {
                const n = Number(draft);
                if (draft.trim() !== "" && Number.isFinite(n)) commit(openAt, n);
              }
            }}
          />
        ) : (
          <span>{levelNumberDisplay(levels[openAt]) || "not set"}</span>
        )}
        <span>{unit}</span>
      </div>
      {editing ? (
        // The level's own date (the Arrow row has no date chip). Written on Enter or when the field is left, never per keystroke.
        <label className="mt-1 flex items-center gap-1">
          <span>Date</span>
          <input
            type="date"
            aria-label="Date"
            key={`${open.id}|${levels[openAt].qualifier.when}`}
            defaultValue={levels[openAt].qualifier.when}
            className="rounded border border-gray-300 px-1"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(null);
              } else if (e.key === "Enter") commitWhen(openAt, e.currentTarget.value);
            }}
            onChange={(e) => setBadYearFor(yearOutOfRange(e.currentTarget.value) ? open.id : null)}
            onBlur={(e) => commitWhen(openAt, e.currentTarget.value)}
          />
        </label>
      ) : null}
      {editing && badYearFor === open.id ? (
        <p role="alert" data-testid="plan-date-year-error" className="mt-1 text-[var(--danger,#b91c1c)]">
          {YEAR_RANGE_SENTENCE}
        </p>
      ) : null}
      {(levels[openAt].source.text || levels[openAt].source.statedBy || levels[openAt].source.derivedFrom) && (
        <div className="mt-1 text-gray-600">
          source: {[levels[openAt].source.text, levels[openAt].source.statedBy, levels[openAt].source.derivedFrom].filter(Boolean).join(" · ")}
        </div>
      )}
      {levels[openAt].note && <div className="text-gray-600">{levels[openAt].note}</div>}
      <button type="button" className="mt-1 min-h-[44px] min-w-[44px] px-2 text-gray-500 underline" onClick={() => setOpen(null)}>
        close
      </button>
    </div>
  ) : null;

  const ariaLabel = (i: number) => levelName(levels[i], data);
  const betterText = dir === "target" ? "best in the middle" : "better →";

  // ----- Arrow view -----------------------------------------------------------------------
  const ArrowView = () => {
    const { groups, subject, reference, hasS, hasR, x0, x1, axis, LINE, pad, plans, tops, total, h, chips: rowChips } = arrow!;
    const svgRef = { current: null as SVGSVGElement | null };
    const h2 = axisOf(axis, false);
    curRef.current = { h: h2, svg: svgRef };
    const rowAy = (r: number) => tops[r]! + 44 + pad + LINE * plans[r]!.upMax;
    return (
      <div className="relative">
      <svg ref={(el) => { svgRef.current = el; }} width={width} height={h} viewBox={`0 0 ${width} ${h}`} className="block select-none" style={{ touchAction: "none" }}>
        {groups.map((g, r) => (
          <ArrowRow
            key={g.key}
            g={g}
            r={r}
            top={tops[r]!}
            plan={plans[r]!}
            pad={pad}
            line={LINE}
            axis={axis}
            x0={x0}
            x1={x1}
            dir={dir}
            unit={unit}
            editing={editing}
            data={data}
            api={api}
            // Only the row that holds the dragged level (or the selected one) is given them, so a pointermove re-renders one row.
            liveI={drag && g.indexes.includes(dragAt) ? dragAt : -1}
            liveV={drag && g.indexes.includes(dragAt) ? drag.value : 0}
            selI={g.indexes.includes(openAt) && sel === open?.id ? openAt : -1}
          />
        ))}
        {axis.ticks.map((t) => (
          <g key={t}>
            <line x1={axis.toPx(t)} x2={axis.toPx(t)} y1={total + 2} y2={total + 8} stroke="#9ca3af" />
            <text x={axis.toPx(t)} y={total + 20} fontSize={10} textAnchor="middle" fill="#6b7280">{fmt(t)}</text>
          </g>
        ))}
        <text x={x0} y={h - 4} fontSize={10} fill="#6b7280">{unit}</text>
        <text x={x1} y={h - 4} fontSize={10} textAnchor="end" fill="#6b7280">{betterText}</text>
      </svg>
      {editing &&
        groups.map((g, r) => (
          <RowChips
            key={g.key}
            data={data}
            from={rowChips[r]!.from}
            mode="band"
            rowId={g.label}
            indexes={g.indexes}
            onVar={onRowVar}
            bandStyle={rowChips[r]!.bandStyle}
            popTop={rowChips[r]!.popTop}
            popLeft={PAD}
          />
        ))}
      {groups.map((g, r) => (
        <Fragment key={`end:${g.key}`}>
          {hasS && <EndpointEnd part={subject} role="Subject" cx={PAD + 14} cy={rowAy(r)} size={28} caption={r === 0} />}
          {hasR && <EndpointEnd part={reference} role="Reference" cx={width - PAD - 14} cy={rowAy(r)} size={28} caption={r === 0} />}
        </Fragment>
      ))}
      </div>
    );
  };

  // ----- Timeline view --------------------------------------------------------------------
  const TimelineView = () => {
    const { H, top, bottom, x0, laneX0, x1, times, axis, today, range, dx, xticks, series, seriesOf, facts, place } = tl!;
    const svgRef = { current: null as SVGSVGElement | null };
    curRef.current = { h: timelineOf(axis, dx, laneX0), svg: svgRef };
    const dimmed = (i: number) => hl !== null && series[seriesOf.get(i)!]?.key !== hl;
    // The dragged (or key-stepped) marker's date: undefined = not moving, null = in the no-date lane.
    const liveT = (i: number): number | null | undefined => (drag && dragAt === i ? drag.t : kbd && kbdAt === i ? kbd.t : undefined);
    const xOf = (i: number): number => {
      const lt = liveT(i);
      return lt === undefined ? place.get(i)!.x : lt === null ? laneX0 + LANE_W / 2 : dx.toPx(lt);
    };
    const pt = (i: number) => `${xOf(i)},${axis.toPx(shown(i) as number)}`;
    const overLane = !!drag && drag.moved && drag.t === null;
    const dragIdx = drag && drag.moved ? dragAt : -1;
    // Click-to-place: a click on an empty spot of the plot offers "Add here" at that date and value, the nearest series first.
    const onPlot = (e: MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!editing || !svg || (e.target as Element).closest?.("[role=slider]")) return;
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      if (px < x0 || px > laneX0 + LANE_W || py < top || py > bottom) return;
      // A click on empty plot while a popover is open only dismisses it.
      if (openRef.current) {
        setOpen(null);
        return;
      }
      const value = snapValue(axis, axis.fromPx(py), whole);
      const t = px >= laneX0 ? null : snapDate(dx.fromPx(px), range.max - range.min);
      const near = (s: (typeof series)[number]) => {
        const pts = s.indexes.filter((i) => place.has(i)).map((i) => ({ x: place.get(i)!.x, y: place.get(i)!.y }));
        const path = seriesPath(facts, s.indexes, dir).order.filter((i) => place.has(i)).map((i) => ({ x: place.get(i)!.x, y: place.get(i)!.y }));
        let best = Infinity;
        for (const q of pts) best = Math.min(best, Math.hypot(q.x - px, q.y - py));
        for (let k = 1; k < path.length; k++) best = Math.min(best, segDist(px, py, path[k - 1]!, path[k]!));
        for (const i of s.indexes) if (isLimitKind(levels[i]!.kind) && levels[i]!.value !== null && px <= x1) best = Math.min(best, Math.abs(axis.toPx(levels[i]!.value as number) - py));
        return best;
      };
      const order = series.map((s) => ({ key: s.key, d: near(s) })).sort((a, b) => a.d - b.d).map((s) => s.key);
      setOpen(null);
      setMenu({
        at: { left: e.clientX, top: e.clientY },
        place: { when: t === null ? "" : isoDay(t), value, heading: `Add here: ${t === null ? "no date" : formatDay(t)} · ${fmt(value)} ${unit}`.trim(), order },
      });
    };
    const inRange = today >= range.min && today <= range.max;
    const betterTop = dir === "target" ? "best in the middle" : "better ↑";
    const subject = data.endpoint?.subject;
    const unitMid = (top + bottom) / 2;
    return (
      <div className="relative">
        <svg ref={(el) => { svgRef.current = el; }} width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block select-none" style={{ touchAction: "none" }} onClick={onPlot}>
          <rect data-lane-bg data-lane-active={overLane ? "" : undefined} x={laneX0} y={top} width={LANE_W} height={bottom - top} fill={overLane ? "#dbeafe" : "#f3f4f6"} />
          <text x={laneX0 + LANE_W / 2} y={top - 6} fontSize={10} textAnchor="middle" fill="#6b7280">no date</text>
          {axis.ticks.map((t) => (
            <g key={t}>
              <line data-grid="y" x1={x0} x2={laneX0 + LANE_W} y1={axis.toPx(t)} y2={axis.toPx(t)} stroke="#e5e7eb" strokeWidth={1} />
              <line x1={x0 - 4} x2={x0} y1={axis.toPx(t)} y2={axis.toPx(t)} stroke="#9ca3af" />
              <text x={x0 - 8} y={axis.toPx(t) + 3} fontSize={10} textAnchor="end" fill="#6b7280">{fmt(t)}</text>
            </g>
          ))}
          {xticks.map((t) => (
            <g key={t.t} data-xtick={t.label}>
              <line data-grid="x" x1={dx.toPx(t.t)} x2={dx.toPx(t.t)} y1={top} y2={bottom} stroke="#e5e7eb" strokeWidth={1} />
              <line x1={dx.toPx(t.t)} x2={dx.toPx(t.t)} y1={bottom} y2={bottom + 4} stroke="#9ca3af" />
              <text x={dx.toPx(t.t)} y={bottom + 16} fontSize={10} textAnchor="middle" fill="#6b7280">{t.label}</text>
            </g>
          ))}
          <line data-axis="y" x1={x0} x2={x0} y1={top} y2={bottom} stroke="#6b7280" strokeWidth={1} />
          <line data-axis="x" x1={x0} x2={laneX0 + LANE_W} y1={bottom} y2={bottom} stroke="#6b7280" strokeWidth={1} />
          <text x={4} y={11} fontSize={10} fill="#6b7280">{betterTop}</text>
          <text data-axis-unit x={12} y={(top + bottom) / 2} fontSize={10} textAnchor="middle" fill="#6b7280" transform={`rotate(-90 12 ${(top + bottom) / 2})`}>{unit}</text>
          {inRange && (
            <g data-today>
              <line x1={dx.toPx(today)} x2={dx.toPx(today)} y1={top} y2={bottom} stroke="#6b7280" strokeWidth={1} strokeDasharray="4 3" />
              <text x={dx.toPx(today)} y={top - 6} fontSize={10} textAnchor="middle" fill="#6b7280">today</text>
            </g>
          )}
          {series.map((s) => {
            const op = hl === null || hl === s.key ? 1 : 0.25;
            const path = seriesPath(facts, s.indexes, dir);
            const solid = path.split >= 0 ? path.order.slice(0, path.split + 1) : [];
            const planned = path.split >= 0 ? path.order.slice(path.split) : path.order;
            const limits = s.indexes.filter((i) => isLimitKind(levels[i].kind) && shown(i) !== null);
            return (
              <g key={s.key} data-series={s.n} opacity={op}>
                {solid.length > 1 && (
                  <polyline data-line="solid" fill="none" stroke={s.colour} strokeWidth={2.5} points={solid.map(pt).join(" ")} />
                )}
                {planned.length > 1 && (
                  <polyline data-line="planned" fill="none" stroke={s.colour} strokeWidth={2.5} strokeDasharray="6 4" points={planned.map(pt).join(" ")} />
                )}
                {limits.map((i) => {
                  const y = axis.toPx(shown(i) as number);
                  return (
                    <g key={i} data-limit={levels[i].kind}>
                      <line x1={x0} x2={x1} y1={y} y2={y} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.4} />
                      <text x={x1} y={y - 4} fontSize={10} textAnchor="end" fill="#dc2626">{levels[i].kind} {fmt(shown(i) as number)}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
          {levels.map((l, i) => {
            const v = shown(i);
            const p = place.get(i);
            if (v === null || !p) return null;
            const y = axis.toPx(v);
            const lt = liveT(i);
            const lane = lt === undefined ? p.lane : lt === null;
            const op = dimmed(i) ? 0.25 : lane ? 0.6 : 1;
            const when = lt === undefined ? times[i] : lt;
            const typedText = drag && dragAt === i ? undefined : levelNumberTyped(l);
            const ends = typedText ? levelRangeEnds(typedText) : null;
            const vtext = `${l.kind}, ${typedText ?? fmt(v)} ${unitWord(unit, v)}, ${when === null ? "no date" : formatDay(when as number, true)}`;
            return (
              <LineMarker key={i} api={api} i={i} x={xOf(i)} y={y} v={v} kind={l.kind} {...(data.resource ? { resource: true } : {})} label={ariaLabel(i)} editing={editing} dy={p.dy} lane={lane} opacity={op} vtext={vtext} {...(typedText ? { text: levelNumberDisplay(l) } : {})} {...(ends ? { bar: { y1: axis.toPx(ends[0]), y2: axis.toPx(ends[1]) } } : {})} selected={openAt === i && sel === open?.id} />
            );
          })}
          {dragIdx >= 0 && drag && (() => {
            const l = levels[dragIdx]!;
            const text = `${l.kind} ${fmt(drag.value)} ${unit} · ${drag.t === null ? "no date" : formatDay(drag.t)}`;
            const w = textWidth(text, 11) + 12;
            const cx = xOf(dragIdx);
            const cy = axis.toPx(drag.value);
            const tx = cx + 22 + w > width ? cx - 22 - w : cx + 22;
            const ty = Math.max(2, cy - 34);
            return (
              <g data-drag-tip pointerEvents="none">
                <rect x={tx} y={ty} width={w} height={20} rx={4} fill="#111827" opacity={0.92} />
                <text x={tx + 6} y={ty + 14} fontSize={11} fill="#fff">{text}</text>
              </g>
            );
          })()}
        </svg>
        {endHasType(subject) && <EndpointEnd part={subject} role="Subject" cx={22} cy={Math.max(36, unitMid - textWidth(unit, 10) / 2 - 20)} size={20} caption={false} />}
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-600" role="group" aria-label="Series">
          {series.map((s) => (
            <span key={s.key} className="inline-flex flex-wrap items-center gap-1">
              <button
                type="button"
                aria-pressed={hl === s.key}
                data-legend={s.n}
                className={`min-h-[44px] rounded px-2 ${hl === s.key ? "bg-gray-100 font-medium text-gray-900" : ""}`}
                onClick={() => setHl(hl === s.key ? null : s.key)}
              >
                <span data-legend-dot style={{ color: s.colour }}>●</span> {s.label}
              </button>
              {editing && setVariablesOf(levels[s.indexes[0]!]!).length > 0 && (
                <RowChips
                  data={data}
                  from={levels[s.indexes[0]!]!}
                  mode="inline"
                  rowId={s.label}
                  indexes={s.indexes}
                  onVar={onSeriesVar}
                />
              )}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const menuSets: MenuSet[] = menu
    ? (() => {
        const all = setsOf();
        const list = menu.place ? menu.place.order.map((k) => all.find((x) => x.key === k)).filter((x): x is (typeof all)[number] => !!x) : all;
        return list.map((x) => ({ key: x.key, label: x.label, has: x.has }));
      })()
    : [];
  return (
    <div data-kind="plan-value-graph" ref={rootRef} className="relative w-full">
      {toggle}
      {view === "arrow" ? ArrowView() : TimelineView()}
      {popover}
      {menu ? (
        <NewMenu
          at={menu.at}
          heading={menu.place?.heading}
          sets={menuSets}
          kinds={data.resource ? RESOURCE_MENU_KINDS : MENU_KINDS}
          icon={(k) => <Marker kind={k} x={0} y={0} grey={false} resource={data.resource} />}
          onPick={(key, kind) => addTo(key, kind, menu.place ? { when: menu.place.when, value: menu.place.value } : undefined)}
          onNewSet={menu.place ? undefined : () => {
            setMenu(null);
            ui.onNewSet();
          }}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  );
}

/** One filter chip: "Country = ALL". A click opens the shared chooser; a pick narrows the Illustration (view state only). */
function FilterChip({
  def,
  value,
  used,
  onPick,
}: {
  def: ValueCardData["variables"][number];
  value: string;
  used: string[];
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <PlanQualifierValue
        single
        label={`Show ${def.name}`}
        name={def.name}
        options={def.options}
        defaultOption={def.defaultOption}
        value={value === ALL_VALUE ? "" : value}
        used={used}
        onCommit={(pick) => onPick(qualifierValues(pick)[0] ?? ALL_VALUE)}
        close={() => setOpen(false)}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={`Show ${def.name}`}
      className="min-h-[44px] rounded border border-gray-300 px-3 py-0.5 text-gray-700"
      onClick={() => setOpen(true)}
    >
      {def.name} = {value}
    </button>
  );
}

/** The Illustration: one filter chooser per qualifier above the arrows (default ALL). A row shows when its level takes in the picked value. */
export function PlanValueGraph(props: PlanValueGraphProps) {
  const { data: given, onChangeLevels, title, progress, capped, onNotice, ...graphProps } = props;
  // The pickers and filter chips list the Scale's names in Scale order (then the defined names the Scale lacks). Read-only: the levels are written, never the list.
  const data = useMemo(() => withScaleQualifiers(given), [given]);
  // The graph's own notice line (also handed to the card's, when it has one).
  const [notice, setNotice] = useState<string | null>(null);
  const notify = useCallback(
    (text: string) => {
      setNotice(text);
      onNotice?.(text);
    },
    [onNotice],
  );
  const { view, setView, filter, setFilter, full, setFull, control, openButton } = useGraphUi();
  const outer = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  // The filter chips are the Scale's names only.
  const scaleNow = scaleQualifierNames(data.scale);
  const defs = data.variables.filter((v) => v.name.trim() && scaleNow.some((x) => x.trim().toLowerCase() === v.name.trim().toLowerCase()));
  const active = defs.filter((v) => (filter[v.name] ?? ALL_VALUE) !== ALL_VALUE);
  const keep = data.levels
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => active.every((v) => levelHasQualifierValue(l, v.name, filter[v.name]!)));
  const narrowed = keep.length !== data.levels.length;
  const inner: ValueCardData = narrowed ? { ...data, levels: keep.map((k) => k.l) } : data;
  const used = (name: string) => {
    const seen = new Set<string>();
    for (const l of data.levels)
      for (const [k, v] of Object.entries(l.qualifier.variables))
        if (k.toLowerCase() === name.toLowerCase()) for (const x of qualifierValues(v)) if (x !== ALL_VALUE) seen.add(x);
    return [...seen];
  };
  const change = (next: ValueLevel[]) => {
    if (narrowed && next.length === keep.length + 1) return onChangeLevels([...data.levels, next[next.length - 1]!]);
    if (!narrowed || next.length !== keep.length) return onChangeLevels(next);
    const all = data.levels.slice();
    keep.forEach((k, n) => {
      all[k.i] = next[n]!;
    });
    onChangeLevels(all);
  };
  const chips = defs.length ? (
    <div className="flex flex-wrap items-start gap-1 text-xs" data-testid="plan-graph-filter">
      {defs.map((v) => (
        <FilterChip
          key={v.name}
          def={v}
          value={filter[v.name] ?? ALL_VALUE}
          used={used(v.name)}
          onPick={(x) => setFilter({ ...filter, [v.name]: x })}
        />
      ))}
    </div>
  ) : null;
  // What the header says besides the filter chips: a row move in progress, the cap note, and a notice.
  const status = (
    <>
      {progress ? (
        <p role="status" data-testid="plan-graph-progress" className="text-xs text-[var(--ink-soft)]">
          Moving {progress.done} of {progress.total}…
        </p>
      ) : null}
      {capped ? (
        <p data-testid="plan-graph-capped" className="text-xs text-[var(--ink-soft)]">
          {planCapSentence(capped.total, "records", capped.cap)}
        </p>
      ) : null}
      {notice ? (
        <p role="status" data-testid="plan-graph-notice" className="flex items-center gap-1 text-xs text-[var(--ink-soft)]">
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss" className="min-h-[44px] min-w-[44px]" onClick={() => setNotice(null)}>
            ✕
          </button>
        </p>
      ) : null}
    </>
  );
  const openNew = () => control.current?.openMenu(newRef.current?.getBoundingClientRect() ?? null);
  const canNew = props.editing && inner.levels.length > 0;
  const newButton = canNew ? (
    <button
      ref={newRef}
      type="button"
      aria-haspopup="menu"
      title="Add a point (N)"
      onClick={openNew}
      className="h-11 min-h-[44px] rounded border border-gray-300 px-3 text-sm text-gray-700"
    >
      + New
    </button>
  ) : null;
  // F opens and closes full screen, N opens the "+ New" menu, from anywhere in the Illustration (the layer's events reach here too), but never while typing.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key.toLowerCase();
    if (k !== "f" && k !== "n") return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || inTextField(e.target)) return;
    if (k === "n") {
      if (!canNew) return;
      e.preventDefault();
      openNew();
      return;
    }
    e.preventDefault();
    setFull(!full);
  };
  const onNewSet = () => {
    setFull(false);
    focusLevelEditor(outer.current);
  };
  const fullButton = (
    <button
      ref={openButton}
      type="button"
      aria-label="Full screen"
      title="Full screen (F)"
      onClick={() => setFull(true)}
      className="grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded border border-gray-300 text-lg text-gray-700"
    >
      ⤢
    </button>
  );
  return (
    <div ref={outer} className="flex flex-col gap-1" onKeyDown={onKeyDown}>
      {full ? (
        <>
          <div className="flex items-center gap-2 rounded border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600" data-testid="plan-graph-placeholder">
            <span>Shown full screen</span>
            <button type="button" className="min-h-11 rounded px-2 text-[var(--accent)] underline" onClick={() => setFull(false)}>
              Back
            </button>
          </div>
          <PlanValueGraphFullScreen
            title={title || data.scale.text || "Illustration"}
            chips={
              <>
                {chips}
                {status}
              </>
            }
            toggle={
              <>
                <ViewToggle view={view} onView={setView} />
                {newButton}
              </>
            }
            control={control}
            onClose={() => setFull(false)}
          >
            {(h) => (
              <PlanValueGraphInner
                {...graphProps}
                height={h ?? graphProps.height}
                data={inner}
                onChangeLevels={change}
                ui={{ view, onView: setView, noToolbar: true, control, newRef, onNewSet, notify, busy: !!progress }}
              />
            )}
          </PlanValueGraphFullScreen>
        </>
      ) : (
        <>
          {chips}
          {status}
          <PlanValueGraphInner {...graphProps} data={inner} onChangeLevels={change} ui={{ view, onView: setView, lead: newButton, trailing: fullButton, control, newRef, onNewSet, notify, busy: !!progress }} />
        </>
      )}
    </div>
  );
}
