// The pieces the Value card's lines share: the line props, the inline editors, the source control slot, the unset-qualifier menu and the move button
// for the older stored lists. Every symbol is copied from the app unchanged; the ones below are exported for the line units.

import { type KeyboardEvent as ReactKeyEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { type BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { planSourceEmpty, type PlanSourceValue } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { PlanSource } from "@kaigilb/gilbplatformcode-plan-source";
import { type ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";

export interface ValueLineProps {
  data: ValueCardData;
  /** The card is in Edit mode (and the person may edit). */
  editing: boolean;
  /** The person may edit. Out of Edit mode, a click on a value turns that value into its editor in place. */
  canEdit?: boolean;
  vaultId: string;
  record: BaseRecord;
  onOpen: (id: string) => void;
  /** The signed-in person's record URI. A value they write with no source gets them as its source. */
  selfId: string | null;
  onChange: (next: ValueCardData) => void;
  /** The rename helper: rename the defined qualifier `from` to `to` on its record and on every level's choice, in one group write. */
  onRenameQualifier?: (from: string, to: string) => void;
  /**
   * The Value still holds old stored lists (`a:valueLevels`, `a:scaleQualifierDefinitions`, `a:valueMeters`) and has no records of that kind:
   * each such list is shown read-only, with one button that moves them all into their own records. A count of 0 = that list is records already.
   */
  legacy?: { levels: number; qualifiers: number; meters: number; busy: boolean; canMove: boolean; onMove: () => void };
  /** The Value's children as the card reads them: a group write in progress, the find's cap note, the notice line. */
  host?: {
    progress?: { done: number; total: number } | null;
    capped?: { total: number; cap: number } | null;
    onNotice?: (notice: string | null) => void;
  };
}

export const box =
  "min-h-[44px] w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

export const small =
  "min-h-[36px] rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--focus)]";

export const quiet = "min-h-11 px-3 text-[14px] text-[var(--accent)]";

export const faint = "text-[13px] text-[var(--ink-soft)]";

export const chip = "inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[13px] text-[var(--ink)]";

export const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function own(source: PlanSourceValue, selfId: string | null): PlanSourceValue {
  return selfId && planSourceEmpty(source) ? { statedBy: selfId } : source;
}

/** A text control that keeps what is typed and saves on blur (a textarea) or on blur / Enter (an input). */
export function CommitText({
  label,
  value,
  onCommit,
  multiline = false,
  placeholder,
  className = box,
  type = "text",
  list,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  type?: string;
  list?: string;
}) {
  const [text, setText] = useState(value);
  const grow = useAutoGrow(text);
  useEffect(() => setText(value), [value]);
  const done = () => {
    if (text !== value) onCommit(text);
  };
  if (multiline) {
    return (
      <textarea
        ref={grow}
        aria-label={label}
        className={`${className} block w-full resize-none overflow-hidden py-2`}
        rows={2}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            done();
          }
        }}
      />
    );
  }
  return (
    <input
      aria-label={label}
      type={type}
      list={list}
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          done();
        }
      }}
    />
  );
}

export function Src({
  p,
  value,
  label,
  onCommit,
  offerNewStakeholder,
}: {
  p: ValueLineProps;
  value: PlanSourceValue;
  label: string;
  onCommit: (next: PlanSourceValue) => void;
  offerNewStakeholder?: boolean;
}) {
  return (
    <PlanSource
      value={value}
      editing={p.editing}
      vaultId={p.vaultId}
      record={p.record}
      inputLabel={label}
      onOpen={p.onOpen}
      onCommit={onCommit}
      offerNewStakeholder={offerNewStakeholder}
    />
  );
}

export const clickable =
  "inline cursor-text rounded-sm text-left align-baseline hover:bg-[var(--surface-2,rgba(0,0,0,0.05))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

export const inlineBox =
  "rounded-[var(--r-md)] border border-[var(--focus)] bg-[var(--surface)] px-2 py-0.5 text-[14px] text-[var(--ink)] outline-none";

/** True when a click on a value edits it in place: the person may edit and the card is not in Edit. */
export const inPlace = (p: { editing: boolean; canEdit?: boolean }) => !!p.canEdit && !p.editing;

export const hint = (text: string) => <span className="text-[var(--ink-faint,var(--ink-soft))]">{text}</span>;

/**
 * One value in a read line. Out of in-place mode it is just its face (text). In place, it is a button that turns into
 * its editor; `edit` gets `close` and must end by calling it (the editors below do).
 */
export function Piece({
  on,
  label,
  face,
  edit,
}: {
  on: boolean;
  label: string;
  face: ReactNode;
  edit: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!on) return <>{face}</>;
  if (open) return <>{edit(() => setOpen(false))}</>;
  return (
    <button type="button" aria-label={`Edit ${label}`} className={clickable} onClick={() => setOpen(true)}>
      {face}
    </button>
  );
}

/** Sizes a textarea to its content (min 2 rows). */
export function useAutoGrow(text: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  return ref;
}

/** A text, date or number input in place. Enter or leaving saves a changed value once; Escape saves nothing. */
export function InlineInput({
  label,
  value,
  onCommit,
  close,
  multiline = false,
  type = "text",
  list,
  selectAll = false,
  placeholder,
  wide = false,
  check,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  /** Returns a plain sentence when the text cannot be saved: the input then stays open and shows it. */
  check?: (v: string) => string | null;
  close: () => void;
  multiline?: boolean;
  type?: string;
  list?: string;
  selectAll?: boolean;
  placeholder?: string;
  wide?: boolean;
}) {
  const [text, setText] = useState(value);
  const grow = useAutoGrow(text);
  const finished = useRef(false);
  const [problem, setProblem] = useState<string | null>(null);
  const finish = (save: boolean) => {
    if (finished.current) return;
    if (save && text !== value && check) {
      const bad = check(text);
      if (bad) {
        setProblem(bad);
        return;
      }
    }
    finished.current = true;
    if (save && text !== value) onCommit(text);
    close();
  };
  const common = {
    "aria-label": `Edit ${label}`,
    autoFocus: true,
    value: text,
    placeholder,
    onChange: (e: { target: { value: string } }) => {
      setText(e.target.value);
      setProblem(null);
    },
    onFocus: (e: { target: HTMLInputElement | HTMLTextAreaElement }) => {
      if (selectAll) e.target.select?.();
    },
    onBlur: () => finish(true),
  };
  const keys = (e: ReactKeyEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    } else if (e.key === "Enter" && !(multiline && e.shiftKey)) {
      e.preventDefault();
      finish(true);
    }
  };
  const say = problem ? (
    <span role="alert" className="ml-1 text-xs text-red-600">
      {problem}
    </span>
  ) : null;
  if (multiline) return <textarea {...common} ref={grow} rows={2} className={`${inlineBox} block w-full resize-none overflow-hidden`} onKeyDown={keys} />;
  return (
    <>
      <input {...common} type={type} list={list} className={`${inlineBox} ${wide ? "block w-full" : "min-w-[6rem]"}`} onKeyDown={keys} />
      {say}
    </>
  );
}

/** A select in place. A pick saves (when it differs) and closes; Escape or leaving closes with nothing sent. */
export function InlineSelect({
  label,
  value,
  options,
  onCommit,
  close,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onCommit: (v: string) => void;
  close: () => void;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    try {
      ref.current?.showPicker?.();
    } catch {
      /* the browser wants a real click first: the select is still focused */
    }
  }, []);
  return (
    <select
      ref={ref}
      aria-label={`Edit ${label}`}
      autoFocus
      className={inlineBox}
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v !== value) onCommit(v);
        close();
      }}
      onBlur={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A piece whose editor is a text input. An empty value shows `empty` as a faint, clickable hint. */
export function TextPiece({
  on,
  label,
  value,
  empty,
  onCommit,
  face,
  multiline,
  type,
  list,
  selectAll,
  wide,
  check,
}: {
  on: boolean;
  label: string;
  value: string;
  empty?: string;
  onCommit: (v: string) => void;
  check?: (v: string) => string | null;
  face?: ReactNode;
  multiline?: boolean;
  type?: string;
  list?: string;
  selectAll?: boolean;
  wide?: boolean;
}) {
  const shown = face ?? (value.trim() ? value : empty ? hint(empty) : null);
  return (
    <Piece
      on={on}
      label={label}
      face={shown}
      edit={(close) => (
        <InlineInput
          label={label}
          value={value}
          onCommit={onCommit}
          check={check}
          close={close}
          multiline={multiline}
          type={type}
          list={list}
          selectAll={selectAll}
          wide={wide}
        />
      )}
    />
  );
}

export const faintBtn =
  "cursor-pointer rounded-sm text-[var(--ink-faint,var(--ink-soft))] opacity-60 hover:bg-[var(--surface-2,rgba(0,0,0,0.05))] hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

/** One faint "+ qualifier" chip (its face drawn by CSS) that opens a menu of the qualifiers a level has not set. */
export function UnsetQualifiers({
  n,
  hasBracket,
  names,
  chooser,
  caption,
  onCondition,
}: {
  n: number;
  caption?: string;
  hasBracket: boolean;
  names: string[];
  chooser: (name: string, close: () => void) => ReactNode;
  /** Level lines: the one faint "+" also offers "Add a condition". */
  onCondition?: (v: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [sub, setSub] = useState(!onCondition);
  const [cond, setCond] = useState(false);
  const [name, setName] = useState<string | null>(null);
  if (cond && onCondition) {
    return (
      <span className="mx-1">
        <InlineInput
          label={`Add Level ${n} condition`}
          value=""
          onCommit={onCondition}
          close={() => {
            setCond(false);
            setMenu(false);
          }}
        />
      </span>
    );
  }
  if (name) return <span className="mx-1">{chooser(name, () => setName(null))}</span>;
  if (menu) {
    return (
      <span
        role="menu"
        aria-label={caption ? `Meter ${n} qualifiers` : `Level ${n} unset qualifiers`}
        className="mx-1 inline-flex gap-2 opacity-70"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setMenu(false);
          }
        }}
      >
        {onCondition ? (
          <>
            <button type="button" role="menuitem" className={`${clickable} text-[var(--accent)]`} onClick={() => setSub(!sub)}>
              Add a qualifier ▸
            </button>
            <button
              type="button"
              role="menuitem"
              title="Add a condition"
              className={`${clickable} text-[var(--accent)]`}
              onClick={() => setCond(true)}
            >
              Add a condition
            </button>
          </>
        ) : null}
        {(sub ? names : []).map((q) => (
          <button
            key={q}
            type="button"
            role="menuitem"
            aria-label={caption ? `Set Meter ${n} ${q}` : `Set Level ${n} ${q}`}
            className={`${clickable} text-[var(--accent)]`}
            onClick={() => {
              setMenu(false);
              setName(q);
            }}
          >
            {q}
          </button>
        ))}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={caption ? `Add Meter ${n} qualifier value` : `Add Level ${n} qualifier`}
      title={onCondition ? "Add a qualifier or a condition" : `Set ${names.join(", ")}`}
      className={`${faintBtn} ${onCondition ? (hasBracket ? "ml-1 before:content-['+']" : "ml-1 before:content-['_[+]']") : caption ? "ml-1 before:content-['+_value']" : hasBracket ? "ml-1 before:content-['+_qualifier']" : "ml-1 before:content-['_[+_qualifier']"}`}
      onClick={() => setMenu(true)}
    />
  );
}

/** The "Source: X" line. Out of Edit, a click on it opens the source picker in place; a pick, Escape or a click away closes it. */
export function ViewSrc(props: Parameters<typeof Src>[0]) {
  const { p } = props;
  const on = inPlace(p);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (ref.current?.contains(t)) return;
      if (t instanceof Element && t.closest('[role="dialog"]')) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  if (!on) return <Src {...props} />;
  const filled = !planSourceEmpty(props.value);
  const launch = (e: { target: EventTarget }) => {
    if (open || !filled) return;
    if (e.target instanceof Element && e.target.closest("button, a")) return;
    setOpen(true);
  };
  return (
    <div
      ref={ref}
      {...(open || !filled
        ? {}
        : { role: "button", tabIndex: 0, "aria-label": `Edit ${props.label}`, onClick: launch })}
      onKeyDown={(e) => {
        if (open && e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        } else if (!open && filled && e.key === "Enter" && e.target === e.currentTarget) setOpen(true);
      }}
      className={open || !filled ? "w-full" : "w-full cursor-text"}
    >
      <Src
        {...props}
        p={{ ...p, editing: open }}
        onCommit={(next) => {
          props.onCommit(next);
          setOpen(false);
        }}
      />
    </div>
  );
}

/** "Move 2 levels, 1 qualifier and 3 meters into their own records" (a zero count is left out). */
export function legacyMoveLabel(old: { levels: number; qualifiers: number; meters: number }): string {
  const parts = [
    old.levels ? `${old.levels} ${old.levels === 1 ? "level" : "levels"}` : "",
    old.qualifiers ? `${old.qualifiers} ${old.qualifiers === 1 ? "qualifier" : "qualifiers"}` : "",
    old.meters ? `${old.meters} ${old.meters === 1 ? "meter" : "meters"}` : "",
  ].filter(Boolean);
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "");
  return `Move ${text} into their own records`;
}

/** The one button that moves the old lists. It sits in the first group that still shows an old list. */
export function LegacyMoveButton({ p, group }: { p: ValueLineProps; group: "levels" | "qualifiers" | "meters" }) {
  const old = p.legacy;
  if (!old || !old.canMove) return null;
  const first = old.levels ? "levels" : old.qualifiers ? "qualifiers" : "meters";
  if (first !== group) return null;
  return (
    <button type="button" className={quiet} data-testid="plan-levels-move" disabled={old.busy} onClick={old.onMove}>
      {legacyMoveLabel(old)}
    </button>
  );
}
