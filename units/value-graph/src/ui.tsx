/**
 * The Illustration's UI state and its full-screen layer.
 * `useGraphUi` holds what must survive the switch between the inline graph and the full-screen one (the view, the qualifier filter, whether the
 * layer is open). The inline graph and the full-screen graph are two instances that read and write it; only one is live at a time.
 * The layer is a sheet in a portal to body (z-[70], capture-phase Escape, Tab trap) and locks the body scroll.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { eventTargetInTopDialog, modalIsOpen } from "@kaigilb/gilbplatformcode-open-popups";
import { tabInside, topOpen } from "@kaigilb/gilbplatformcode-open-popups";

export type GraphView = "arrow" | "timeline";

/** What the layer asks the live graph, to settle who a key belongs to. */
export interface GraphControl {
  dragging: () => boolean;
  cancelDrag: () => void;
  /** Closes the level popover when one is open; true when it was. */
  closePopover: () => boolean;
  /** Opens the "+ New" menu under `anchor` (the button), or at the corner when there is none. */
  openMenu: (anchor: DOMRect | null) => void;
}

export function useGraphUi() {
  const [view, setView] = useState<GraphView>("arrow");
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [full, setFull] = useState(false);
  const control = useRef<GraphControl | null>(null);
  const openButton = useRef<HTMLButtonElement | null>(null);
  const was = useRef(false);
  // Closing returns the focus to the full-screen button (which is back once the inline graph is).
  useEffect(() => {
    if (was.current && !full) openButton.current?.focus();
    was.current = full;
  }, [full]);
  return { view, setView, filter, setFilter, full, setFull, control, openButton };
}

export function ViewToggle({ view, onView }: { view: GraphView; onView: (v: GraphView) => void }) {
  return (
    <div className="flex gap-1 text-xs" role="tablist">
      {(["arrow", "timeline"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          onClick={() => onView(v)}
          className={`min-h-[44px] rounded border px-3 py-0.5 ${view === v ? "border-gray-800 bg-gray-800 text-white" : "border-gray-300 text-gray-700"}`}
        >
          {v === "arrow" ? "Arrow" : "Timeline"}
        </button>
      ))}
    </div>
  );
}

/** A key that is typed text, not a command. */
export function inTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
/** A qualifier picker in the layer keeps its own Escape. */
const OWN_ESCAPE = '[role="group"][aria-label^="Choose "]';
const BODY_SPACE = 24;

export function PlanValueGraphFullScreen({
  title,
  chips,
  toggle,
  control,
  onClose,
  children,
}: {
  title: string;
  chips: ReactNode;
  toggle: ReactNode;
  control: MutableRefObject<GraphControl | null>;
  onClose: () => void;
  /** The graph; `height` is the room the Timeline may use (undefined until measured). */
  children: (height: number | undefined) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [bodyH, setBodyH] = useState(0);
  const closeNow = useCallback(onClose, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setBodyH(Math.round(el.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Escape: a drag in progress is cancelled and nothing else; else an open popover closes and nothing else; a qualifier picker keeps its own Escape; otherwise the layer closes. First in line (capture), then stopped, so the Detail drawer under it stays open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalIsOpen() && !eventTargetInTopDialog(e.target)) return;
      if (e.key !== "Escape") return;
      const swallow = () => {
        e.stopImmediatePropagation();
        e.preventDefault();
      };
      const c = control.current;
      if (c?.dragging()) {
        c.cancelDrag();
        swallow();
        return;
      }
      // A portalled popover or menu (the type definition, "+ New", click-to-place) is on the open-popover stack: it takes the key.
      const top = topOpen();
      if (top) {
        top.close();
        swallow();
        return;
      }
      if (c?.closePopover()) {
        swallow();
        return;
      }
      if (rootRef.current?.querySelector(OWN_ESCAPE)) return;
      swallow();
      closeNow();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [control, closeNow]);

  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    // A portalled child that is open owns Tab: it cycles inside it.
    const top = topOpen()?.el();
    if (top) {
      tabInside(e, top);
      return;
    }
    const root = rootRef.current;
    const items = [...(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !root?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !root?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Illustration, full screen"
      data-testid="plan-graph-fullscreen"
      className="fixed inset-0 z-[70] flex flex-col bg-[var(--paper)] text-[var(--ink)]"
      onKeyDown={trap}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line)] px-4 py-2">
        <h2 className="min-w-0 truncate font-[var(--serif)] text-base font-bold">{title}</h2>
        {chips}
        {toggle}
        <button
          ref={closeRef}
          type="button"
          aria-label="Close full screen"
          title="Close (Esc)"
          onClick={onClose}
          className="ml-auto grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-full text-[var(--ink-faint)] hover:bg-[var(--sel)] hover:text-[var(--ink)]"
        >
          ✕
        </button>
      </div>
      <div ref={bodyRef} className="flex-1 overflow-auto p-4">
        {children(bodyH > 0 ? Math.max(200, bodyH - BODY_SPACE) : undefined)}
      </div>
    </div>,
    document.body,
  );
}
