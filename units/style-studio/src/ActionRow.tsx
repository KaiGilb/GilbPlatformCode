import type { ReactNode } from "react";

/**
 * Mac-order action row (RuleUiActionRowMacOrder): right-aligned; the positive action is rightmost
 * and the default (Return); Cancel sits immediately to its left (Esc); a destructive or third
 * action sits alone at the far left. When the destructive act IS the row's purpose (a delete
 * confirmation) pass `primary.danger`: it becomes the rightmost red button and Cancel is the
 * default. Labels must be verbs. Under 380px the buttons share the width equally, same order.
 * Styled by the sheet's own button classes/tokens (gs-btn, gs-btn--secondary, gs-btn--danger).
 */
export interface ActionSpec {
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}

export interface ActionRowProps {
  primary: ActionSpec & { danger?: boolean };
  cancel?: ActionSpec;
  destructive?: ActionSpec;
  className?: string;
}

const CSS = `
.gs-actionrow{display:flex;flex-wrap:nowrap;justify-content:flex-end;align-items:center;gap:8px;container-type:inline-size}
.gs-actionrow>.gs-actionrow__far{margin-right:auto}
@container (max-width:380px){.gs-actionrow>button{flex:1 1 0;min-width:0}.gs-actionrow>.gs-actionrow__far{margin-right:0}}
@media (max-width:380px){.gs-actionrow>button{flex:1 1 0;min-width:0}.gs-actionrow>.gs-actionrow__far{margin-right:0}}
`;

export function ActionRow({ primary, cancel, destructive, className }: ActionRowProps) {
  const confirmMode = primary.danger === true;
  return (
    <div className={`gs-actionrow${className ? ` ${className}` : ""}`} data-testid="gs-actionrow">
      <style>{CSS}</style>
      {destructive ? (
        <button
          type="button"
          className="gs-btn gs-btn--danger gs-actionrow__far"
          disabled={destructive.disabled}
          onClick={destructive.onClick}
        >
          {destructive.label}
        </button>
      ) : null}
      {cancel ? (
        <button
          type="button"
          className="gs-btn gs-btn--secondary"
          data-default={confirmMode ? "true" : undefined}
          disabled={cancel.disabled}
          onClick={cancel.onClick}
        >
          {cancel.label}
        </button>
      ) : null}
      <button
        type={primary.type ?? "button"}
        className={`gs-btn${primary.danger ? " gs-btn--danger" : ""}`}
        data-default={confirmMode ? undefined : "true"}
        disabled={primary.disabled}
        onClick={primary.onClick}
      >
        {primary.label}
      </button>
    </div>
  );
}
