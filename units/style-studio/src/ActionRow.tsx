import type { ReactNode } from "react";
import { ActionRow as SlotActionRow } from "@kaigilb/gilbplatformcode-style-runtime/react";

/**
 * Mac-order action row (RuleUiActionRowMacOrder), spec-object API. It renders style-runtime's row (one component,
 * one CSS): right-aligned; the positive action is rightmost and the default (Return); Cancel sits immediately to its
 * left (Esc); a destructive or third action sits alone at the far left. When the destructive act IS the row's
 * purpose (a delete confirmation) pass `primary.danger`: it becomes the rightmost red button and Cancel is the
 * default. Labels must be verbs. Under 380px the buttons share the width equally, same order.
 * Styled by the sheet's own button classes/tokens (gs-btn, gs-btn--secondary, gs-btn--danger).
 * New code can use `ActionRow` from style-runtime/react directly (slots as nodes); this is an adapter over it.
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

export function ActionRow({ primary, cancel, destructive, className }: ActionRowProps) {
  const confirmMode = primary.danger === true;
  return (
    <SlotActionRow
      className={className}
      confirm={confirmMode}
      destructive={
        destructive ? (
          <button type="button" className="gs-btn gs-btn--danger" disabled={destructive.disabled} onClick={destructive.onClick}>
            {destructive.label}
          </button>
        ) : undefined
      }
      cancel={
        cancel ? (
          <button
            type="button"
            className="gs-btn gs-btn--secondary"
            data-default={confirmMode ? "true" : undefined}
            disabled={cancel.disabled}
            onClick={cancel.onClick}
          >
            {cancel.label}
          </button>
        ) : undefined
      }
      primary={
        <button
          type={primary.type ?? "button"}
          className={`gs-btn${primary.danger ? " gs-btn--danger gs-btn--primary" : ""}`}
          data-default={confirmMode ? undefined : "true"}
          disabled={primary.disabled}
          onClick={primary.onClick}
        >
          {primary.label}
        </button>
      }
    />
  );
}
