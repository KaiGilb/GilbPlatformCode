import { useCallback, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ComponentType, type ReactElement, type ReactNode } from "react";
import { ClaudeCodeBridgeError, type ClaudeCodeClient, type ClaudeCodeReadback } from "@kaigilb/gilbplatformcode-claude-code-client";
import type { BridgeCommands } from "@kaigilb/gilbplatformcode-claude-code-client";

export interface ClaudeCodeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

/** The built-in button. An app with its own design system passes its own through `Button`. */
function DefaultButton({ variant = "primary", className, ...rest }: ClaudeCodeButtonProps): ReactElement {
  return <button {...rest} className={`gcc-btn gcc-btn--${variant}${className ? ` ${className}` : ""}`} />;
}

export type ClaudeCodeSystem = "mac" | "windows" | "linux";

/** Which tab to open on, from the browser's platform string. Windows, then Linux (not Android), else Mac. */
export function defaultSystem(platformString: string): ClaudeCodeSystem {
  if (platformString.includes("Win")) return "windows";
  if (platformString.includes("Linux") && !platformString.includes("Android")) return "linux";
  return "mac";
}

function detectSystem(): ClaudeCodeSystem {
  try {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    return defaultSystem(nav.userAgentData?.platform || nav.platform || nav.userAgent || "");
  } catch {
    return "mac";
  }
}

const SYSTEMS: { id: ClaudeCodeSystem; label: string }[] = [
  { id: "mac", label: "Mac" },
  { id: "windows", label: "Windows" },
  { id: "linux", label: "Linux" },
];

export interface ClaudeCodeConnectProps {
  client: ClaudeCodeClient;
  /** From `bridgeCommands(...)`. */
  commands: BridgeCommands;
  /** Called once, after the person typed the right code and the secret is kept for this tab. */
  onConnected: (readback: ClaudeCodeReadback) => void;
  /** Where to show errors. When omitted the component shows them itself, under the form. Called with null to clear. */
  onError?: (message: string | null) => void;
  /** Where a person asks for Windows support. The host passes it (this unit names no host); without it the Windows tab shows no mail link. */
  supportEmail?: string;
  /** Your own button component (same props as a `<button>` plus `variant`). Default: a plain button styled by claude-code.css. */
  Button?: ComponentType<ClaudeCodeButtonProps>;
}

/**
 * The Connect > Claude Code flow, in two steps, ready to drop in under your own provider chooser:
 *   1. instructions: the one-off command and the always-on command, each with Copy;
 *   2. the code box: it looks for the bridge on this computer, then trades the typed code for the secret.
 * Rendering it IS choosing Claude Code, so mount it when the person picks that provider and unmount it on Cancel.
 */
export function ClaudeCodeConnect({ client, commands, onConnected, onError, supportEmail, Button = DefaultButton }: ClaudeCodeConnectProps): ReactElement {
  const [stage, setStage] = useState<"steps" | "code">("steps");
  const [copied, setCopied] = useState(false);
  const [copiedAlways, setCopiedAlways] = useState(false);
  const [bridgeUp, setBridgeUp] = useState<boolean | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  const [copiedAuth, setCopiedAuth] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedNode, setCopiedNode] = useState(false);
  const [system, setSystem] = useState<ClaudeCodeSystem>(detectSystem);
  const tabRefs = useRef<Partial<Record<ClaudeCodeSystem, HTMLButtonElement | null>>>({});
  const codeId = useId();
  const uid = useId();

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

  const cmdBox = ({ text, testId, copyLabel, copiedFlag, onCopied, copyTestId }: {
    text: string;
    testId?: string;
    copyLabel?: string;
    copiedFlag: boolean;
    onCopied: () => void;
    copyTestId?: string;
  }) => (
    <div className="gcc-cmd">
      <code className="gcc-cmd__code" data-testid={testId}>
        {text}
      </code>
      <Button type="button" variant="ghost" onClick={() => copy(text, onCopied)} data-testid={copyTestId} aria-label={copyLabel}>
        {copiedFlag ? "Copied" : "Copy"}
      </Button>
    </div>
  );

  const T = system === "linux" ? "terminal" : "Terminal";

  const selectSystem = (id: ClaudeCodeSystem) => {
    setSystem(id);
    tabRefs.current[id]?.focus();
  };
  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = SYSTEMS.findIndex((x) => x.id === system);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % SYSTEMS.length;
    else if (e.key === "ArrowLeft") next = (i + SYSTEMS.length - 1) % SYSTEMS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = SYSTEMS.length - 1;
    if (next === null) return;
    e.preventDefault();
    selectSystem(SYSTEMS[next]!.id);
  };

  const section = (id: string, title: string, children: ReactNode) => (
    <div className="gcc-section" role="group" aria-labelledby={`${uid}-${id}`}>
      <h3 className="gcc-section__title" id={`${uid}-${id}`}>
        {title}
      </h3>
      {children}
    </div>
  );

  const codeEntry =
    stage === "steps" ? (
      <Button type="button" onClick={() => void enterCode()}>
        I've started it — enter code
      </Button>
    ) : (
      <div data-testid="claude-code-connect">
        {bridgeUp === false ? (
          <p className="gcc-text" data-testid="claude-code-bridge-hint">
            Not reachable on this computer yet. Check the {T} window is still open, then try again. The command is:{" "}
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
    );

  const sectionThree =
    system === "linux"
      ? section(
          "code",
          "3 · Enter your pairing code",
          <>
            <p className="gcc-text">The code is shown in the terminal window.</p>
            {codeEntry}
          </>,
        )
      : section(
          "code",
          "3 · Enter your pairing code",
          <>
            <p className="gcc-text">Option Always On: get your code by pasting this in Terminal.</p>
            {cmdBox({ text: commands.code, testId: "claude-code-code-command", copyLabel: "Copy code command", copiedFlag: copiedCode, onCopied: () => setCopiedCode(true) })}
            <p className="gcc-note" data-testid="claude-code-node-note">
              Type it exactly, starting with node. Without node your Mac answers "Permission denied".
            </p>
            <p className="gcc-text">Option One Session: the code is shown in the Terminal window.</p>
            {codeEntry}
          </>,
        );

  const sectionOne = section(
    "before",
    "1 · Before you start",
    <>
      <p className="gcc-text">You need two programs on your computer:</p>
      <ul className="gcc-list">
        <li>
          <p className="gcc-text">
            <strong>Claude Code</strong>, signed in with your Claude subscription. Sign in once in {T}:
          </p>
          {cmdBox({ text: "claude auth login", copyLabel: "Copy sign-in command", copiedFlag: copiedAuth, onCopied: () => setCopiedAuth(true) })}
        </li>
        <li>
          <p className="gcc-text">
            <strong>Node.js 18 or newer</strong>, the free program that runs the bridge. To check, type this in {T}; it should show v18 or higher:
          </p>
          {cmdBox({ text: "node --version", testId: "claude-code-node-check", copyLabel: "Copy node check command", copiedFlag: copiedNode, onCopied: () => setCopiedNode(true) })}
          <p className="gcc-text">
            Get it from{" "}
            <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">
              nodejs.org
            </a>{" "}
            if it is missing.
          </p>
        </li>
      </ul>
      <p className="gcc-text">It is billed to your Claude subscription, and your turns stay on your computer.</p>
    </>,
  );

  const oneSession = (
    <div className="gcc-choice">
      <p className="gcc-choice__title">Option One Session</p>
      <p className="gcc-text">Paste this in {T} and keep that window open. It shows your pairing code.</p>
      {cmdBox({ text: commands.start, testId: "claude-code-command", copiedFlag: copied, onCopied: () => setCopied(true) })}
    </div>
  );

  const sectionTwoMac = section(
    "start",
    "2 · Start the bridge on your computer",
    <>
      <p className="gcc-text">Choose one option.</p>
      <div className="gcc-choices">
        <div className="gcc-choice">
          <p className="gcc-choice__title">Option Always On</p>
          <p className="gcc-text">Paste this once in Terminal. It starts by itself each time you log in.</p>
          {cmdBox({
            text: commands.install,
            testId: "claude-code-install-command",
            copyTestId: "claude-code-install-copy",
            copyLabel: "Copy always-on command",
            copiedFlag: copiedAlways,
            onCopied: () => setCopiedAlways(true),
          })}
        </div>
        {oneSession}
      </div>
    </>,
  );

  const sectionTwoLinux = section("start", "2 · Start the bridge on your computer", oneSession);

  const windowsPanel = section(
    "windows",
    "Windows is not available yet",
    <p className="gcc-text">
      Claude Code cannot connect from a Windows computer yet. If you need it, ask us
      {supportEmail ? (
        <>
          {" "}at{" "}
          <a href={`mailto:${supportEmail}?subject=Claude%20Code%20on%20Windows`} data-testid="claude-code-windows-request">
            {supportEmail}
          </a>
        </>
      ) : null}{" "}
      and we will tell you when it works.
    </p>,
  );

  const panelBody =
    system === "windows" ? (
      windowsPanel
    ) : stage === "code" ? (
      sectionThree
    ) : (
      <>
        {sectionOne}
        {system === "linux" ? sectionTwoLinux : sectionTwoMac}
        {sectionThree}
      </>
    );

  return (
    <div className="gcc-connect">
      <div className="gcc-steps" data-testid={stage === "steps" ? "claude-code-steps" : undefined}>
        <div className="gcc-tabs" role="tablist" aria-label="Your computer">
          {SYSTEMS.map(({ id, label }) => (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${id}`}
              aria-selected={system === id}
              aria-controls={`${uid}-panel-${id}`}
              tabIndex={system === id ? 0 : -1}
              className="gcc-tab"
              data-testid={`claude-code-tab-${id}`}
              onClick={() => setSystem(id)}
              onKeyDown={onTabKey}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="gcc-steps gcc-panel" role="tabpanel" id={`${uid}-panel-${system}`} aria-labelledby={`${uid}-tab-${system}`}>
          {panelBody}
        </div>
      </div>
      {!onError && ownError ? (
        <p className="gcc-error" role="alert" data-testid="claude-code-error">
          {ownError}
        </p>
      ) : null}
    </div>
  );
}
