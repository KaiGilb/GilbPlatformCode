// PlanButtonRow — a button row in the Mac order (RuleUiActionRowMacOrder):
// right-aligned, the positive action rightmost, Cancel/Close immediately to its left, a destructive
// or third action alone at the far left. Two ways to use it:
//   - structured: <PlanButtonRow primary={…} cancel={…} destructive={…} /> — the row puts them in order;
//   - children (the original API): the caller passes the children in Mac order; the row only lays them out.
// It does not restyle the buttons and has no keyboard behaviour (Return / Esc are the host's job; see README).
import { Children, isValidElement, type CSSProperties, type ReactNode } from "react";

export type PlanButtonRowProps = {
  children?: ReactNode;
  className?: string;
  /** The positive action: rightmost, the default (Return). */
  primary?: ReactNode;
  /** Cancel or Close: immediately left of the primary (Esc). */
  cancel?: ReactNode;
  /** A destructive or third action: alone at the far left. */
  destructive?: ReactNode;
  /** For a host without Tailwind: inline layout on the row itself (e.g. display:flex, justifyContent:flex-end, gap). */
  style?: CSSProperties;
};

const BASE = "flex w-full flex-wrap items-center justify-end gap-3";
// Narrow (container under 360px): the three slots share the width in equal parts, same order.
const SLOT = "shrink-0 @max-[360px]:min-w-0 @max-[360px]:flex-1 @max-[360px]:shrink @max-[360px]:[&>*]:w-full";

const POSITIVE_LAST_FORBIDDEN = /^(cancel|close|no|back)$/i;

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function warnIfPositiveNotLast(children: ReactNode) {
  if (typeof process === "undefined" || process.env.NODE_ENV === "production") return;
  const kids = Children.toArray(children);
  const last = kids[kids.length - 1];
  if (last !== undefined && POSITIVE_LAST_FORBIDDEN.test(textOf(last).trim())) {
    console.warn("PlanButtonRow: positive action must be rightmost — RuleUiActionRowMacOrder");
  }
}

export function PlanButtonRow({ children, className = "", primary, cancel, destructive, style }: PlanButtonRowProps) {
  const structured = primary !== undefined || cancel !== undefined || destructive !== undefined;
  if (!structured) {
    warnIfPositiveNotLast(children);
    return (
      <div data-plan-button-row="" className={`${BASE} ${className}`.trim()} style={style}>
        {children}
      </div>
    );
  }
  return (
    <div data-plan-button-row-box="" className="@container w-full">
      <div data-plan-button-row="" data-structured="" className={`flex w-full flex-nowrap items-center justify-end gap-3 ${className}`.trim()} style={style}>
        {destructive !== undefined && (
          <div data-slot="destructive" className={`${SLOT} mr-auto`}>
            {destructive}
          </div>
        )}
        {cancel !== undefined && (
          <div data-slot="cancel" className={SLOT}>
            {cancel}
          </div>
        )}
        {primary !== undefined && (
          <div data-slot="primary" className={SLOT}>
            {primary}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
