import { useCallback, useId, useState, type ButtonHTMLAttributes, type ComponentType, type ReactElement } from "react";
import { ClaudeCodeBridgeError, type ClaudeCodeClient, type ClaudeCodeReadback } from "@kaigilb/gilbplatformcode-claude-code-client";
import type { BridgeCommands } from "@kaigilb/gilbplatformcode-claude-code-client";

export interface ClaudeCodeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

/** The built-in button. An app with its own design system passes its own through `Button`. */
function DefaultButton({ variant = "primary", className, ...rest }: ClaudeCodeButtonProps): ReactElement {
  return <button {...rest} className={`gcc-btn gcc-btn--${variant}${className ? ` ${className}` : ""}`} />;
}

export interface ClaudeCodeConnectProps {
  client: ClaudeCodeClient;
  /** From `bridgeCommands(...)`. */
  commands: BridgeCommands;
  /** Called once, after the person typed the right code and the secret is kept for this tab. */
  onConnected: (readback: ClaudeCodeReadback) => void;
  /** Where to show errors. When omitted the component shows them itself, under the form. Called with null to clear. */
  onError?: (message: string | null) => void;
  /** Your own button component (same props as a `<button>` plus `variant`). Default: a plain button styled by claude-code.css. */
  Button?: ComponentType<ClaudeCodeButtonProps>;
}

/**
 * The Connect > Claude Code flow, in two steps, ready to drop in under your own provider chooser:
 *   1. instructions: the one-off command and the always-on command, each with Copy;
 *   2. the code box: it looks for the bridge on this computer, then trades the typed code for the secret.
 * Rendering it IS choosing Claude Code, so mount it when the person picks that provider and unmount it on Cancel.
 */
export function ClaudeCodeConnect({ client, commands, onConnected, onError, Button = DefaultButton }: ClaudeCodeConnectProps): ReactElement {
  const [stage, setStage] = useState<"steps" | "code">("steps");
  const [copied, setCopied] = useState(false);
  const [copiedAlways, setCopiedAlways] = useState(false);
  const [bridgeUp, setBridgeUp] = useState<boolean | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  const codeId = useId();

  const setError = useCallback(
    (msg: string | null) => {
      if (onError) onError(msg);
      else setOwnError(msg);
    },
    [onError],
  );

  const enterCode = useCallback(async () => {
    setError(null);
    setPairCode("");
    setBridgeUp(null);
    setStage("code");
    setBridgeUp(await client.probe());
  }, [client, setError]);

  const pair = useCallback(async () => {
    if (pairing || !pairCode.trim()) return;
    setError(null);
    setPairing(true);
    try {
      const readback = await client.pair(pairCode);
      setPairCode("");
      onConnected(readback);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claude Code could not connect.");
      if (err instanceof ClaudeCodeBridgeError && err.status === 0) setBridgeUp(false);
    } finally {
      setPairing(false);
    }
  }, [client, pairing, pairCode, onConnected, setError]);

  const copy = (text: string, done: () => void) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    done();
  };

  return (
    <div className="gcc-connect">
      {stage === "steps" ? (
        <div className="gcc-steps" data-testid="claude-code-steps">
          <p>Run Claude Code from your own computer. It is billed to your Claude subscription, and your turns stay on your machine.</p>
          <p>
            Before you start: Claude Code installed and signed in with your Claude subscription (<code className="gcc-mono">claude auth login</code>), and
            Node 18 or newer.
          </p>
          <p>Paste this one command in Terminal:</p>
          <div className="gcc-cmd">
            <code className="gcc-cmd__code" data-testid="claude-code-command">
              {commands.start}
            </code>
            <Button type="button" variant="ghost" onClick={() => copy(commands.start, () => setCopied(true))}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p>Keep that window open. It shows a pairing code.</p>
          <p className="gcc-steps__heading">Always on (starts when you log in)</p>
          <p>On a Mac you can instead keep it running with no Terminal window. Paste this once:</p>
          <div className="gcc-cmd">
            <code className="gcc-cmd__code" data-testid="claude-code-install-command">
              {commands.install}
            </code>
            <Button
              type="button"
              variant="ghost"
              onClick={() => copy(commands.install, () => setCopiedAlways(true))}
              data-testid="claude-code-install-copy"
              aria-label="Copy always-on command"
            >
              {copiedAlways ? "Copied" : "Copy"}
            </Button>
          </div>
          <p>
            Then get your code with <code className="gcc-mono">{commands.code}</code>.
          </p>
          <Button type="button" onClick={() => void enterCode()}>
            I've started it — enter code
          </Button>
        </div>
      ) : (
        <div data-testid="claude-code-connect">
          {bridgeUp === false ? (
            <p className="gcc-steps" data-testid="claude-code-bridge-hint">
              Not reachable on this computer yet. Check the Terminal window is still open, then try again. The command is:{" "}
              <code className="gcc-mono gcc-break">{commands.start}</code>
            </p>
          ) : null}
          <form
            className="gcc-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (bridgeUp === false) void enterCode();
              else void pair();
            }}
          >
            {bridgeUp === false ? (
              <Button type="submit">Try again</Button>
            ) : (
              <>
                <label className="gcc-sr-only" htmlFor={codeId}>
                  Code from the bridge terminal
                </label>
                <input
                  id={codeId}
                  className="gcc-input"
                  value={pairCode}
                  onChange={(e) => setPairCode(e.target.value)}
                  placeholder="Code from the terminal"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={bridgeUp === null || pairing}
                />
                <Button type="submit" disabled={bridgeUp === null || pairing || !pairCode.trim()}>
                  Pair
                </Button>
              </>
            )}
          </form>
        </div>
      )}
      {!onError && ownError ? (
        <p className="gcc-error" role="alert" data-testid="claude-code-error">
          {ownError}
        </p>
      ) : null}
    </div>
  );
}
