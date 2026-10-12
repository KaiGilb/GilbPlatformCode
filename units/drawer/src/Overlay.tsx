// A slide-over panel (a drawer) for a narrow window, drawn from the editorial-tokens variables.
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@kaigilb/gilbplatformcode-class-merge";

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  title: string;
  /** Accessible label if the visible title should differ from the a11y name. */
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * A hand-authored, accessible slide-over used on Compact/Medium widths to map the
 * left (selection+agent) and right (detail+commands) regions to a Drawer / Sheet —
 * the 1:1 role->surface mapping AdaptiveThreePaneRegions guarantees on a phone.
 * No @radix/vaul dependency (keeps the dep set to the React-19-proven floor).
 *
 * a11y: role="dialog" + aria-modal, Escape to close, backdrop click to close,
 * focus moved in on open and restored on close, background scroll locked.
 */
export function Overlay({ open, onClose, side, title, ariaLabel, children }: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // The latest onClose, read when Escape is pressed. The effect below runs on `open` only: if it
  // depended on onClose, a host passing a new function each render would restore focus and move
  // it into the panel again on every render, taking focus away from an input inside the drawer.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      // A control inside the drawer that handled Escape itself (a menu, a picker) keeps it.
      if (e.key === "Escape" && !e.defaultPrevented) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the panel (next frame so it's mounted + transitioned in).
    const id = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(id);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    // Stops at bottom-16 so the fixed bottom nav bar (h-16) stays visible + tappable
    // BELOW the drawer/scrim — the same fixed button that opened the pane also closes it.
    <div className="fixed inset-x-0 top-0 bottom-16 z-50" role="presentation">
      {/* backdrop (secondary dismiss; the bottom-bar toggle is the primary close) */}
      <button
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_38%,transparent)] animate-[fade_.15s_ease]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        tabIndex={-1}
        className={cn(
          "absolute top-0 bottom-0 w-[86%] max-w-[380px] bg-[var(--paper-2)] shadow-[var(--shadow-lg)] outline-none flex flex-col",
          side === "left"
            ? "left-0 border-r border-[var(--line-2)] animate-[slideL_.2s_ease]"
            : "right-0 border-l border-[var(--line-2)] animate-[slideR_.2s_ease]",
        )}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--line-2)] flex-none">
          <span className="font-[family-name:var(--serif)] text-[15px] font-semibold text-[var(--ink)]">{title}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-11 w-11 min-h-[44px] min-w-[44px] grid place-items-center rounded-full text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--sel)]"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
      <style>{`
        @keyframes fade{from{opacity:0}to{opacity:1}}
        @keyframes slideL{from{transform:translateX(-100%)}to{transform:translateX(0)}}
        @keyframes slideR{from{transform:translateX(100%)}to{transform:translateX(0)}}
      `}</style>
    </div>
  );
}
