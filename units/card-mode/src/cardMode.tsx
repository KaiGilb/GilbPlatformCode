/**
 * A record card's two modes: presentation (values read as text, no remove control, no empty fields, no
 * placeholder) and edit (the remove control and the add rows are shown and every field is editable in place).
 *
 * One page-level flag lives here, for the whole card. It is turned on and off like this:
 *   ON  - a click or tap on any value of the card, or the card's own Edit button (the way in for a card that has no value yet,
 *         and for a keyboard);
 *   OFF - Done, Escape, a click outside the card, or Tab out of it.
 * Presentation (the default) reads values as text: no remove control, no add row, no empty field, no placeholder.
 *
 * Outside a card there is no provider: `useCardMode()` then answers "always editing", so every component that
 * reads it behaves as it would with no modes at all.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface CardMode {
  /** True when a provider exists (a card); false = legacy "always editing". */
  readonly managed: boolean;
  /** The card may be written at all (vault grant, field set known). When false it is presentation for good. */
  readonly canEdit: boolean;
  /** Presentation: values as text, no remove control, no empty fields, no add rows. */
  readonly presentation: boolean;
  /** Edit: the remove control and the add rows are shown and every field is editable in place. */
  readonly editing: boolean;
  /** Turn edit mode on (a click into a value, or the Edit button). A no-op when the card cannot be written. */
  enter(): void;
  /** Back to presentation. */
  leave(): void;
  /** Every group the card has, shown or not (the chooser lists the ones that are not shown). */
  readonly groups: ReadonlyMap<string, GroupInfo>;
  /** Groups the person added from the chooser in this edit: shown empty, with their add row, until edit mode is left. */
  readonly opened: ReadonlySet<string>;
  /** The group the chooser just opened: it scrolls into view and takes focus once. */
  readonly focusKind: string | null;
  /** Test seam: a suite of the card's FIELDS keeps every group shown in edit mode, as the card was before groups hid. */
  readonly showAll: boolean;
  /** Add this group (turns edit mode on). */
  openGroup(kind: string): void;
  clearFocus(): void;
  /** A group tells the card what it is and whether it is shown; returns its undo. */
  register(info: GroupInfo): () => void;
  /** The "Add information" chooser (the "+" at the top and the "+ Add Information" button at the foot both open it). */
  readonly chooserOpen: boolean;
  setChooserOpen(open: boolean): void;
}

/** What the chooser needs to know of one group. */
export interface GroupInfo {
  readonly kind: string;
  /** The words the chooser shows ("Email", "Represents"). */
  readonly label: string;
  /** The chooser's heading it is listed under ("Connection points"). */
  readonly section: string;
  readonly shown: boolean;
  /** False for a group the card cannot add to (a relation it may only show). */
  readonly addable: boolean;
}

const LEGACY: CardMode = {
  managed: false,
  canEdit: true,
  presentation: false,
  editing: true,
  enter() {},
  leave() {},
  groups: new Map(),
  opened: new Set(),
  focusKind: null,
  showAll: true,
  openGroup() {},
  clearFocus() {},
  register: () => () => {},
  chooserOpen: false,
  setChooserOpen() {},
};
const Ctx = createContext<CardMode>(LEGACY);

/** What a component of the card asks: am I in presentation, may I enter edit, … Without a provider: always editing. */
export function useCardMode(): CardMode {
  return useContext(Ctx);
}

/** Clicks inside these never leave edit mode: a picker sheet or dialog opened from the card is part of the card's work. */
const KEEP_EDIT_SELECTOR = '[role="dialog"], [aria-modal="true"], [data-card-keep-edit]';

/**
 * Test seam - never called by product code. A suite of the card's FIELD behaviour (what is saved, what is refused) that was written
 * when every field was always editable can hold its cards in edit mode (they open in it and nothing leaves it), so it keeps
 * testing the field and not the mode. The flag is process-global.
 */
let defaultStartEditing = false;
export function __startCardsInEditMode(on: boolean): void {
  defaultStartEditing = on;
}

export function CardModeProvider({
  canEdit,
  startEditing = false,
  rootClassName,
  children,
}: {
  canEdit: boolean;
  /** A record the person has just made opens in edit mode (its name box is focused). */
  startEditing?: boolean;
  /** The mode's root wraps the record's header band as well as its body: `contents` keeps the layout as it was. */
  rootClassName?: string;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState((startEditing || defaultStartEditing) && canEdit);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [focusKind, setFocusKind] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [groups, setGroups] = useState<ReadonlyMap<string, GroupInfo>>(new Map());
  const rootRef = useRef<HTMLDivElement>(null);
  const enter = useCallback(() => {
    if (canEdit) setEditing(true);
  }, [canEdit]);
  const leave = useCallback(() => {
    if (defaultStartEditing) return;
    setEditing(false);
    // A group added in this edit and left empty is gone again (it was never a value).
    setOpened(new Set());
    setFocusKind(null);
  }, []);
  const openGroup = useCallback(
    (kind: string) => {
      if (!canEdit) return;
      setEditing(true);
      setOpened((o) => new Set(o).add(kind));
      setFocusKind(kind);
    },
    [canEdit],
  );
  const clearFocus = useCallback(() => setFocusKind(null), []);
  const register = useCallback((info: GroupInfo) => {
    setGroups((g) => {
      const had = g.get(info.kind);
      if (had && had.label === info.label && had.section === info.section && had.shown === info.shown && had.addable === info.addable) return g;
      return new Map(g).set(info.kind, info);
    });
    return () =>
      setGroups((g) => {
        if (!g.has(info.kind)) return g;
        const n = new Map(g);
        n.delete(info.kind);
        return n;
      });
  }, []);

  // A card that may no longer be written is presentation (a grant moved while it was open).
  useEffect(() => {
    if (!canEdit) setEditing(false);
  }, [canEdit]);

  // OUT: a click anywhere outside the card (a picker sheet or dialog it opened does not count as outside).
  // Listens on `click`, ⛔ not `pointerdown`: the field being left has already blurred and saved by then.
  useEffect(() => {
    if (!editing) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || !(t instanceof Element) || !t.isConnected) return;
      if (rootRef.current?.contains(t)) return;
      if (t.closest(KEEP_EDIT_SELECTOR)) return;
      // A dialog or sheet that is open right now owns the screen: do not leave under it.
      if (document.querySelector('[role="dialog"][aria-modal], [aria-modal="true"]')) return;
      leave();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [editing, leave]);

  const value = useMemo<CardMode>(
    () => ({
      managed: true,
      canEdit,
      presentation: !editing,
      editing,
      enter,
      leave,
      groups,
      opened,
      focusKind,
      showAll: defaultStartEditing,
      openGroup,
      clearFocus,
      register,
      chooserOpen,
      setChooserOpen,
    }),
    [canEdit, editing, enter, leave, groups, opened, focusKind, openGroup, clearFocus, register, chooserOpen],
  );

  return (
    <Ctx.Provider value={value}>
      <div
        ref={rootRef}
        data-testid="card-mode-root"
        data-card-mode={editing ? "edit" : "presentation"}
        className={rootClassName}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || !editing) return;
          // A picker's own Escape (it closes itself) is not the card's: only an Escape no one handled leaves.
          if (e.defaultPrevented) return;
          const t = e.target as HTMLElement;
          if (t.closest(KEEP_EDIT_SELECTOR)) return;
          // The field in focus saves on blur; blur it first, then leave.
          (document.activeElement as HTMLElement | null)?.blur?.();
          leave();
        }}
        onBlur={(e) => {
          if (!editing) return;
          const next = e.relatedTarget as Node | null;
          // Tab (or a click on another control) to somewhere outside the card: leave. A blur to nothing (a click on the
          // card's padding, or outside: the document click above decides that) or to a sheet it opened does not leave here.
          if (!next) return;
          if (rootRef.current?.contains(next)) return;
          if ((next as Element).closest?.(KEEP_EDIT_SELECTOR)) return;
          setTimeout(leave, 0);
        }}
      >
        {children}
      </div>
    </Ctx.Provider>
  );
}

/**
 * The card's own Edit / Done link and "+" (an italic "Edit" link and a bold "+"): the way in for a card
 * with no value yet (nothing to click) and for a keyboard. The "+" opens the same chooser as the "+ Add Information" button at the
 * foot of the card. At least 40 px, labelled, visible focus; coloured with `--accent`.
 *
 * The host draws these in a fixed header band, on the avatar-and-name line, so they never scroll away.
 * `CardModeActions` is that pair of buttons; `CardModeHint` is the
 * one quiet line that stays at the top of the card body; `CardModeBar` is both, for a host that has no header band.
 * One actions container, `shrink-0`, so the labels (the chips) that later sit beside the name never push the buttons onto another line.
 */
export function CardModeActions({ compact = false, add = true }: { compact?: boolean; add?: boolean }) {
  const mode = useCardMode();
  if (!mode.managed || !mode.canEdit) return null;
  const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const icon = (d: string) => (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
  return (
    <>
      <button
        type="button"
        data-testid={mode.editing ? "card-done" : "card-edit"}
        aria-pressed={mode.editing}
        aria-label={mode.editing ? "Done editing this card" : "Edit this card"}
        title={mode.editing ? "Done" : "Edit"}
        className={
          compact
            ? `flex min-h-10 w-10 items-center justify-center text-[var(--accent)] ${focus}`
            : `min-h-10 whitespace-nowrap px-2 font-[var(--serif)] text-base italic text-[var(--accent)] ${focus}`
        }
        onClick={() => (mode.editing ? mode.leave() : mode.enter())}
      >
        {compact
          ? mode.editing
            ? icon("M5 12.5l4.5 4.5L19 7.5")
            : icon("M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 7.5l3 3")
          : mode.editing
            ? "Done"
            : "Edit"}
      </button>
      {add ? (
      <button
        type="button"
        data-testid="card-add-info"
        aria-label="Add information"
        aria-haspopup="dialog"
        className={`flex min-h-10 ${compact ? "w-10" : "min-w-10"} items-center justify-center text-2xl font-bold leading-none text-[var(--accent)] ${focus}`}
        onClick={() => mode.setChooserOpen(true)}
      >
        <span aria-hidden="true">+</span>
      </button>
      ) : null}
    </>
  );
}

/**
 * The one quiet line that says how the card is edited (it scrolls with the body; the buttons do not). Drawn in Edit only. It does not say how to start
 * editing; a click on a value does that.
 */
export function CardModeHint() {
  const mode = useCardMode();
  if (!mode.managed || !mode.canEdit || !mode.editing) return null;
  return (
    <p className="text-[12.5px] text-[var(--ink-faint)]" data-testid="card-mode-hint">
      Editing. Changes save as you leave a field.
    </p>
  );
}

/** The hint and the buttons on one row: for a host with no header band. */
export function CardModeBar() {
  const mode = useCardMode();
  if (!mode.managed || !mode.canEdit) return null;
  return (
    <div className="flex items-center justify-between gap-3" data-testid="card-mode-bar">
      <CardModeHint />
      <div className="flex shrink-0 flex-nowrap items-center gap-1">
        <CardModeActions />
      </div>
    </div>
  );
}
