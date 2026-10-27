import type { ReactElement } from "react";

export interface ClaudeCodeBadgeProps {
  /** Name shown above Disconnect. Default "Claude Code". Another provider's badge can reuse this with its own name. */
  label?: string;
  onDisconnect: () => void;
  /** test id of the Disconnect button. Default `claude-code-connected`. */
  disconnectTestId?: string;
}

/** The compact "connected" badge: the name, with Disconnect beneath it. */
export function ClaudeCodeBadge({ label = "Claude Code", onDisconnect, disconnectTestId = "claude-code-connected" }: ClaudeCodeBadgeProps): ReactElement {
  return (
    <div className="gcc-badge" role="group" aria-label={`${label} connected`}>
      <span className="gcc-badge__label" data-testid="agent-connected-badge">
        {label}
      </span>
      <button
        type="button"
        className="gcc-badge__disconnect"
        onClick={onDisconnect}
        aria-label={`${label} connected — disconnect`}
        data-testid={disconnectTestId}
      >
        Disconnect
      </button>
    </div>
  );
}
