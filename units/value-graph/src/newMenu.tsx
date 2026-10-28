/**
 * The Illustration's "+ New" menu: the qualifier sets now drawn, each with the kinds it can take.
 * An HTML overlay (portal to the modal portal target, inline z-index, as the type popover does), not SVG.
 * It owns no data: the graph hands it the sets and gets the pick back. Escape inside it closes only it.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MODAL_LAYER_Z, useModalPortalTarget } from "@kaigilb/gilbplatformcode-open-popups";
import { registerOpen, tabInside } from "@kaigilb/gilbplatformcode-open-popups";

/** The kinds shown directly, in this order. */
export const MENU_KINDS = ["Past", "Status", "Tolerable", "Goal", "Wish"] as const;
/** The same on a Development Resource: Budget for Goal. */
export const RESOURCE_MENU_KINDS = ["Past", "Status", "Tolerable", "Budget", "Wish"] as const;
// No "More ▾", no Fail / Survival in the offer; "Other word…" follows the five (typing "Fail" still makes a Fail level).

export interface MenuSet {
  key: string;
  label: string;
  /** Lower-case kinds the set already holds. */
  has: ReadonlySet<string>;
}

export interface NewMenuProps {
  /** Where the menu sits (viewport px): under the button, or at the pointer. */
  at: { left: number; top: number };
  /** Click-to-place: the heading ("Add here: 30 Jun 2027 · 5.2 min"). Absent for the button menu. */
  heading?: string;
  sets: MenuSet[];
  /** The kinds offered. Omitted: {@link MENU_KINDS}. */
  kinds?: readonly string[];
  /** The kind's marker, drawn small. */
  icon: (kind: string) => ReactNode;
  onPick: (setKey: string, kind: string) => void;
  /** "New qualifier set…"; absent in the click-to-place menu. */
  onNewSet?: () => void;
  onClose: () => void;
}

const ITEM = "button[data-menu-item]";
/** Sets shown before the person searches or asks for all (600 Arrow rows must not mean 4,200 buttons). */
export const MENU_SETS_SHOWN = 12;
/** Most matches a search lists at once. */
const MENU_MATCHES = 40;
/** Room the menu needs at least (heading, two rows of 44 px buttons), used when its height cannot be measured. */
const MENU_MIN_H = 150;

/** "New Status (today)" when the set already has a Status; else the kind. */
export function kindText(kind: string, has: boolean): string {
  return kind === "Status" && has ? "New Status (today)" : kind;
}

export function NewMenu({ at, heading, sets, kinds = MENU_KINDS, icon, onPick, onNewSet, onClose }: NewMenuProps) {
  const target = useModalPortalTarget();
  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  // The set whose "Other word" box is open.
  const [other, setOther] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const many = sets.length > MENU_SETS_SHOWN;
  const shown = useMemo(() => {
    if (!many) return sets;
    const q = query.trim().toLowerCase();
    if (q) return sets.filter((x) => x.label.toLowerCase().includes(q)).slice(0, MENU_MATCHES);
    return showAll ? sets : sets.slice(0, MENU_SETS_SHOWN);
  }, [sets, many, query, showAll]);
  // Kept on screen: there is room below, else it opens upward, and its height never passes the room it has.
  const [place, setPlace] = useState<{ top: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    const vh = typeof window === "undefined" ? 768 : window.innerHeight;
    const measured = box.current?.getBoundingClientRect().height ?? 0;
    const need = Math.max(measured, MENU_MIN_H);
    const below = vh - at.top - 8;
    if (below >= need) return setPlace({ top: at.top, maxHeight: below });
    const above = at.top - 8;
    if (above > below) {
      const h = Math.min(need, above);
      return setPlace({ top: Math.max(4, at.top - h), maxHeight: Math.max(MENU_MIN_H, above) });
    }
    const top = Math.max(4, Math.min(at.top, vh - 8 - need));
    setPlace({ top, maxHeight: Math.max(MENU_MIN_H, vh - top - 8) });
  }, [at.top, shown.length]);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>(ITEM)?.focus();
  }, []);
  // On the open-popover stack: the layers under it leave Escape and Tab to it.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => registerOpen({ el: () => box.current, close: () => closeRef.current() }), []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Nothing typed here is a command for the Illustration underneath (F, N) or for the full-screen Tab trap.
    e.stopPropagation();
    if (e.target instanceof HTMLInputElement && e.key !== "Escape" && e.key !== "Tab") return;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    // Tab stays in the menu (it is portalled out of the layer under it); Escape or a pick closes it and hands the focus back.
    if (e.key === "Tab" && box.current) {
      tabInside(e, box.current);
      return;
    }
    const nav = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "Home" ? 2 : e.key === "End" ? 3 : 0;
    if (!nav) return;
    const items = [...(box.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
    if (!items.length) return;
    e.preventDefault();
    const at0 = items.indexOf(document.activeElement as HTMLElement);
    const next = nav === 2 ? 0 : nav === 3 ? items.length - 1 : (at0 + (nav === 1 ? 1 : -1) + items.length) % items.length;
    items[next]!.focus();
  };

  const left = Math.max(4, Math.min(at.left, (typeof window === "undefined" ? 1024 : window.innerWidth) - 312));
  return createPortal(
    <>
      <div data-newmenu-backdrop aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: MODAL_LAYER_Z - 1 }} onClick={onClose} />
      <div
        ref={box}
        role="menu"
        aria-label={heading ?? "Add a point"}
        data-newmenu
        style={{ position: "fixed", left, top: place?.top ?? at.top, zIndex: MODAL_LAYER_Z, maxHeight: place ? `${place.maxHeight}px` : "70vh" }}
        className="flex w-[304px] max-w-[calc(100vw-8px)] flex-col gap-2 overflow-auto rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-2 text-[13px] text-[var(--ink)] shadow"
        onKeyDown={onKeyDown}
      >
        {heading ? <div className="px-1 font-medium">{heading}</div> : null}
        {many ? (
          <input
            type="search"
            aria-label="Find a set"
            placeholder="Find a set…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-[44px] rounded border border-[var(--line)] bg-[var(--surface)] px-2"
          />
        ) : null}
        {shown.map((s, n) => (
          <div key={s.key} role="group" aria-label={s.label} data-newmenu-set={n} className="flex flex-col gap-1">
            <div className="truncate px-1 text-xs text-[var(--ink-faint)]">{s.label}</div>
            <div className="flex flex-wrap gap-1">
              {kinds.map((k) => {
                const has = s.has.has(k.toLowerCase());
                return (
                  <button
                    key={k}
                    type="button"
                    role="menuitem"
                    data-menu-item
                    data-kind-btn={k}
                    aria-label={k === "Status" && has ? `New Status (today) in ${s.label}` : `Add ${k} to ${s.label}`}
                    className="flex min-h-[44px] items-center gap-1 rounded border border-[var(--line)] px-2 hover:bg-[var(--sel)]"
                    onClick={() => onPick(s.key, k)}
                  >
                    <svg width={24} height={24} viewBox="-18 -18 36 36" aria-hidden="true" className="shrink-0">
                      {icon(k)}
                    </svg>
                    <span>{kindText(k, has)}</span>
                    {has && k !== "Past" ? (
                      <span data-has-one className="text-[10px] text-[var(--ink-faint)]">
                        has one
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {(
                other === s.key ? (
                  <input
                    autoFocus
                    aria-label={`Other word in ${s.label}`}
                    data-other-input
                    placeholder="Other word, Enter"
                    value={otherText}
                    className="min-h-[44px] w-36 rounded border border-[var(--line)] bg-[var(--surface)] px-2"
                    onChange={(e) => setOtherText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const w = otherText.trim();
                      if (w) onPick(s.key, w);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    data-menu-item
                    data-other
                    aria-label={`Other word in ${s.label}`}
                    className="flex min-h-[44px] items-center rounded border border-[var(--line)] px-2 hover:bg-[var(--sel)]"
                    onClick={() => {
                      setOtherText("");
                      setOther(s.key);
                    }}
                  >
                    Other word…
                  </button>
                )
              )}
            </div>
          </div>
        ))}
        {many && !query.trim() && !showAll ? (
          <button
            type="button"
            role="menuitem"
            data-menu-item
            data-show-all
            className="min-h-[44px] rounded border border-dashed border-[var(--line)] px-2 text-left text-[var(--accent)] hover:bg-[var(--sel)]"
            onClick={() => setShowAll(true)}
          >
            Show all ({sets.length})
          </button>
        ) : null}
        {many && query.trim() && shown.length === 0 ? <div className="px-1 text-[var(--ink-faint)]">No set matches.</div> : null}
        {onNewSet ? (
          <button
            type="button"
            role="menuitem"
            data-menu-item
            data-new-set
            className="min-h-[44px] rounded border border-dashed border-[var(--line)] px-2 text-left text-[var(--accent)] hover:bg-[var(--sel)]"
            onClick={onNewSet}
          >
            New qualifier set…
          </button>
        ) : null}
      </div>
    </>,
    target,
  );
}
