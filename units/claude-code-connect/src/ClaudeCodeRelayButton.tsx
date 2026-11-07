import { useCallback, useEffect, useState, type ComponentType, type ReactElement } from "react";
import type { ClaudeCodeClient } from "@kaigilb/gilbplatformcode-claude-code-client";
import type { ClaudeCodeButtonProps } from "./ClaudeCodeConnect";
import { RELAY_BAR_TEXT, RELAY_FAILED, detectRelayBrowser } from "./ClaudeCodeConnect";

export interface ClaudeCodeRelayButtonProps {
  client: ClaudeCodeClient;
  /** Your own button component. Default: a plain button styled by claude-code.css. */
  Button?: ComponentType<ClaudeCodeButtonProps>;
  /** Called after the bridge window said ready. */
  onOpened?: () => void;
  /** Called with the failure text when the window did not open. When omitted the text is shown inline. */
  onFailed?: (message: string) => void;
  /** Whether this browser needs the bridge window (Safari). Optional; default is read from the user agent. Other browsers render nothing and never call `directBlocked()`. */
  relayBrowser?: boolean;
}

function PlainButton({ variant = "primary", className, ...rest }: ClaudeCodeButtonProps): ReactElement {
  return <button {...rest} className={`gcc-btn gcc-btn--${variant}${className ? ` ${className}` : ""}`} />;
}

/**
 * For the chat header, after pairing. Renders nothing while the bridge window is open, and nothing unless the
 * browser is Safari-family and blocks direct calls to the bridge (Safari). When the person closes the window it checks again.
 */
export function ClaudeCodeRelayButton({ client, Button = PlainButton, onOpened, onFailed, relayBrowser }: ClaudeCodeRelayButtonProps): ReactElement | null {
  const isRelay = relayBrowser ?? detectRelayBrowser();
  const [relay, setRelay] = useState<"closed" | "opening" | "open">(() => client.relayState());
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);

  const check = useCallback(() => {
    let live = true;
    void client.directBlocked().then(
      (b) => {
        if (live) setBlocked(b);
      },
      () => {
        if (live) setBlocked(false);
      },
    );
    return () => {
      live = false;
    };
  }, [client]);

  useEffect(() => {
    if (!isRelay) return;
    let cancel = check();
    setRelay(client.relayState());
    const off = client.onRelayChange((s) => {
      setRelay(s);
      if (s === "closed") {
        cancel();
        cancel = check();
      }
    });
    return () => {
      off();
      cancel();
    };
  }, [client, check, isRelay]);

  if (!isRelay || relay === "open" || !blocked) return null;

  const openWindow = () => {
    // First statement, no await before it: the pop-up is only allowed inside the click.
    const opened = client.openRelay();
    setFailed(false);
    void (async () => {
      if (await opened) onOpened?.();
      else if (onFailed) onFailed(RELAY_FAILED);
      else setFailed(true);
    })();
  };

  return (
    <div className="gcc-note" data-testid="claude-code-relay-bar">
      <p className="gcc-text">{RELAY_BAR_TEXT}</p>
      <Button type="button" variant="ghost" onClick={openWindow} disabled={relay === "opening"} data-testid="claude-code-relay-bar-open">
        {relay === "opening" ? "Opening…" : "Open bridge window"}
      </Button>
      {failed ? (
        <p className="gcc-error" role="alert" data-testid="claude-code-relay-bar-failed">
          {RELAY_FAILED}
        </p>
      ) : null}
    </div>
  );
}
