import { useEffect, useId, useRef, type ReactNode } from "react";
import "./modalSheet.css";

export interface ModalSheetProps {
  /** The heading. The dialog is named by it (aria-labelledby). */
  title: string;
  /** Escape, a click on the backdrop and the close button all call this. */
  onClose(): void;
  children: ReactNode;
  /** The close button's words. Default "Close". */
  closeLabel?: string;
  /** Added to the panel's class list, for the host's own layout. */
  className?: string;
  /** "first" (default): focus the first focusable thing in the panel, else the panel. "none": focus the panel itself. */
  initialFocus?: "first" | "none";
}

const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';

/** What Tab may land on inside `root`: enabled, not hidden, and not taken out of the tab order. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !(el as HTMLButtonElement).disabled && el.getAttribute("tabindex") !== "-1" && !el.closest("[hidden], [inert]"),
  );
}

/**
 * A modal dialog: a titled panel over a backdrop. Escape or a click on the backdrop closes it. Focus moves into the panel
 * when it opens, Tab and Shift+Tab stay inside it, and focus goes back to what had it before when it closes. The page behind
 * does not scroll while it is open, and gets its own overflow value back afterwards. It draws where it is rendered (no portal).
 */
export function ModalSheet({ title, onClose, children, closeLabel = "Close", className, initialFocus = "first" }: ModalSheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const downInside = useRef(false);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Something inside (an autoFocus field) may already have focus: leave it.
    if (!el.contains(document.activeElement)) (initialFocus === "first" ? focusables(el)[0] ?? el : el).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(el);
      const active = document.activeElement;
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (!el.contains(active) || active === el) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
    };
    // Opening is once; a later change of initialFocus must not steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="ms-backdrop"
      onClick={(e) => {
        // A drag that began inside the panel and ended on the backdrop is not a click on the backdrop.
        if (downInside.current) {
          downInside.current = false;
          return;
        }
        if (e.target === e.currentTarget) closeRef.current();
      }}
    >
      <div
        ref={panel}
        className={className ? `ms-panel ${className}` : "ms-panel"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={() => {
          downInside.current = true;
        }}
      >
        <h2 id={titleId} className="ms-title">{title}</h2>
        <div className="ms-body">{children}</div>
        <button type="button" className="ms-close" onClick={() => closeRef.current()}>{closeLabel}</button>
      </div>
    </div>
  );
}
