import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/** One entry of a {@link MenuButton}. */
export interface MenuButtonItem {
  /** Stable key, also the item's `data-menu-item`. */
  id: string;
  label: string;
  /** Called after the menu has closed and the focus is back on the button. */
  onSelect(): void;
  /** Drawn greyed, skipped by the arrow keys, does nothing. */
  disabled?: boolean;
}

export interface MenuButtonProps {
  items: readonly MenuButtonItem[];
  /** The button's accessible name. Default "Menu". */
  label?: string;
  /** Replaces the three dots. Keep it decorative (the button already has `label`). */
  icon?: ReactNode;
  /** Which edge of the button the list lines up with. Default "end" (the right in left-to-right text). */
  align?: "start" | "end";
  className?: string;
  /** Called when the list opens or closes. */
  onOpenChange?(open: boolean): void;
}

const enabledIndexes = (items: readonly MenuButtonItem[]): number[] => items.flatMap((it, i) => (it.disabled ? [] : [i]));

/**
 * The header's "..." menu (three dots, more, overflow): a button that opens a short list of acts.
 * Esc closes it and gives the focus back to the button; so does choosing an item; a press outside closes it;
 * Tab closes it. Down or Up on the button opens it on the first or last item; Up, Down, Home and End move
 * inside it (it wraps). `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`; items are `role="menuitem"`.
 * Style: import `./menu-button.css` (plain CSS in `:where()` over the style tokens).
 */
export function MenuButton({ items, label = "Menu", icon, align = "end", className, onOpenChange }: MenuButtonProps) {
  const [open, setOpenState] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const wanted = useRef<"first" | "last" | null>(null);
  const listId = useId();

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const closeToButton = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, [setOpen]);

  // Focus lands on the first (or last) enabled item when the list opens from the keyboard or a click.
  useEffect(() => {
    if (!open) return;
    const ok = enabledIndexes(items);
    const at = wanted.current === "last" ? ok[ok.length - 1] : ok[0];
    wanted.current = null;
    if (at !== undefined) refs.current[at]?.focus();
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, setOpen]);

  const move = (from: number, to: "next" | "prev" | "first" | "last") => {
    const ok = enabledIndexes(items);
    if (ok.length === 0) return;
    const pos = ok.indexOf(from);
    const at = to === "first" ? 0 : to === "last" ? ok.length - 1 : to === "next" ? (pos + 1) % ok.length : (pos - 1 + ok.length) % ok.length;
    refs.current[ok[at]!]?.focus();
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      wanted.current = e.key === "ArrowUp" ? "last" : "first";
      if (open) {
        const ok = enabledIndexes(items);
        const at = wanted.current === "last" ? ok[ok.length - 1] : ok[0];
        wanted.current = null;
        if (at !== undefined) refs.current[at]?.focus();
      } else setOpen(true);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      closeToButton();
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const from = refs.current.findIndex((r) => r === document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeToButton();
    } else if (e.key === "ArrowDown") (e.preventDefault(), move(from, "next"));
    else if (e.key === "ArrowUp") (e.preventDefault(), move(from, "prev"));
    else if (e.key === "Home") (e.preventDefault(), move(from, "first"));
    else if (e.key === "End") (e.preventDefault(), move(from, "last"));
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div className={className ? `mb-box ${className}` : "mb-box"} ref={box} data-align={align}>
      <button
        ref={trigger}
        type="button"
        className="mb-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-menu-button
        onClick={() => {
          if (!open) wanted.current = "first";
          setOpen(!open);
        }}
        onKeyDown={onTriggerKey}
      >
        {icon ?? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        )}
      </button>
      {open ? (
        <ul className="mb-list" id={listId} role="menu" aria-label={label} onKeyDown={onListKey}>
          {items.map((it, i) => (
            <li key={it.id} role="none">
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                className="mb-item"
                tabIndex={-1}
                aria-disabled={it.disabled ? true : undefined}
                data-menu-item={it.id}
                onClick={() => {
                  if (it.disabled) return;
                  closeToButton();
                  it.onSelect();
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
