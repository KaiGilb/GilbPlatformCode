// The Replace question of the Plan Type field, as a proper dialog on the open stack.
// Focus moves in when it opens, Tab stays inside it, Escape means Keep (nothing is lost), and the form
// returns the focus to the Type field's trigger when it closes.
import { useEffect, useRef } from "react";
import { registerOpen, tabInside } from "@kaigilb/gilbplatformcode-open-popups";

export function PlanTypeReplaceAsk({
  what,
  onKeep,
  onReplace,
}: {
  /** The earlier concept, as the person reads it. */
  what: string;
  onKeep: () => void;
  onReplace: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const keep = useRef(onKeep);
  keep.current = onKeep;
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button")?.focus();
    // On the stack, so a layer around the card (the create dialog, the full-screen graph) leaves Escape and Tab to it.
    return registerOpen({ el: () => box.current, close: () => keep.current() });
  }, []);
  return (
    <div
      ref={box}
      role="alertdialog"
      aria-modal="true"
      aria-label="Replace the earlier concept"
      data-testid="plan-type-replace-ask"
      className="flex flex-col gap-1 rounded border border-[var(--line)] p-2 text-[14px]"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onKeep();
        } else if (e.key === "Tab" && box.current) {
          e.stopPropagation();
          tabInside(e, box.current);
        }
      }}
    >
      <span>Replace the earlier concept {what}?</span>
      <div className="flex gap-2">
        <button type="button" className="min-h-11 px-3 text-[var(--ink-soft)]" onClick={onKeep}>
          Keep
        </button>
        <button type="button" className="min-h-11 px-3 font-medium text-[var(--accent)]" onClick={onReplace}>
          Replace
        </button>
      </div>
    </div>
  );
}
