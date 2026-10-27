// PlanButtonRow — a card's button row, in Mac order:
// right-aligned, the positive action (Done, Save, Add, Make…) is the rightmost child, and
// Cancel / Clear / Remove / Discard sit to its left. Callers pass the children in that order;
// this only lays them out, it does not restyle the buttons.
import type { ReactNode } from "react";

export function PlanButtonRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div data-plan-button-row="" className={`flex w-full flex-wrap items-center justify-end gap-3 ${className}`.trim()}>
      {children}
    </div>
  );
}
