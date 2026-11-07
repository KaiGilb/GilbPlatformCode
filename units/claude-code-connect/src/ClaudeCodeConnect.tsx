import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ComponentType, type ReactElement, type ReactNode } from "react";
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

/**
 * True only for Safari-family WebKit (Safari on Mac, Safari and every browser on iOS that reports no other name).
 * Those browsers reach the bridge only through the bridge window. This is a display hint from the user-agent
 * string, not security: the bridge and client decide what is allowed.
 */
export function isRelayBrowser(userAgent: string): boolean {
  return /AppleWebKit\//.test(userAgent) && !/(Chrome|Chromium|CriOS|Edg|EdgiOS|Firefox|FxiOS|OPR|Opera|Brave|Vivaldi|Arc)\//.test(userAgent);
}

/** Reads the user agent at render time. Default false when it cannot be read. */
export function detectRelayBrowser(): boolean {
  try {
    return isRelayBrowser(navigator.userAgent || "");
  } catch {
    return false;
  }
}

/**
 * True when the browser is Brave. Brave's user agent looks like Chrome, so this reads its documented API:
 * `navigator.brave` is an object with an `isBrave` function. Default false when it cannot be read.
 * Pass a navigator-like value to test; with none it reads the real `navigator`.
 */
export function isBraveBrowser(nav?: unknown): boolean {
  try {
    const n = (nav === undefined ? (typeof navigator === "undefined" ? undefined : navigator) : nav) as { brave?: { isBrave?: unknown } } | null | undefined;
    const b = n?.brave;
    return typeof b === "object" && b !== null && typeof b.isBrave === "function";
  } catch {
    return false;
  }
}

/**
 * Browsers that pair with Claude Code, shown on the Mac tab. Measured on a Mac, 2026-11-05, bridge 0.1.6:
 * Chrome and Edge pass. Safari works through the bridge window (real Safari 26.5 spike, 2026-11-07; a person paired
 * and chatted through it the same day). Brave works once the person sets Apps on device to Allow in Site settings
 * (a person on a Mac, 2026-11-07, bridge 0.1.7). Nothing else is measured; add a browser here only after it passes.
 */
export const SUPPORTED_BROWSERS: readonly string[] = ["Chrome", "Edge", "Safari", "Brave"];
/** Browsers measured to fail. None now. */
export const NOT_YET_BROWSERS: readonly string[] = [];

const BRAVE_OTHER_BROWSERS_SENTENCE = "Brave needs one setting, shown here when you open this page in Brave.";
export const BRAVE_STEPS_HEADING = "Brave: allow it once yourself. Brave does not ask.";
/** The five steps; the last one differs between the Mac supported-browsers item and step 3. */
export const BRAVE_STEPS: readonly string[] = [
  "Keep this page open. In Brave's address bar, click the small icon at the far left, just before this site's address.",
  "Click Site settings. A settings page opens for this site.",
  "Find Apps on device in the list. (Not Local network: leave that one as it is.)",
  "Set Apps on device to Allow.",
];
export const BRAVE_LAST_STEP_ITEM = "Come back to this page. You can now pair.";
export const BRAVE_LAST_STEP_CHECK = "Come back to this page and click Check again.";

const SAFARI_WINDOW_SENTENCE = "In Safari, Claude Code works through a small bridge window that you open in step 3. Keep it open while you chat; you can minimise it.";
export const RELAY_OFFER =
  "Safari only reaches the bridge through a small window. Open it, then keep it open while you chat (you can minimise it). If the window says it cannot connect, check the bridge is running: paste the Option Always On command from step 2 again.";
export const RELAY_BAR_TEXT = "Safari needs the bridge window for Claude Code.";
export const RELAY_FAILED =
  "The bridge window did not open. If Safari blocked it, allow pop-ups for this site (Safari › Settings for This Website › Pop-up Windows › Allow) and try again. If it opened but stayed empty, your bridge is older: run the Option Always On command in step 2 again to update it.";

/** "A", "A and B", "A, B and C". */
function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
/** "A", "A or B", "A, B or C". */
function orWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

function BraveSteps({ last }: { last: string }): ReactElement {
  return (
    <div className="gcc-note" data-testid="claude-code-brave-steps">
      <p className="gcc-text">
        <strong>{BRAVE_STEPS_HEADING}</strong>
      </p>
      <ol className="gcc-list">
        {[...BRAVE_STEPS, last].map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
    </div>
  );
}

const ALLOW_BEFORE_PAIR = "When you pair, your browser may ask to let this page use apps on this device. Choose Allow.";
const ALLOW_AFTER_BLOCK =
  "If your browser asked to let this page use apps on this device, choose Allow. If you chose Block, open the site settings (the icon left of the address) and allow it, then check again.";

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
  /** Browsers shown as supported on the Mac tab. Optional; defaults to `SUPPORTED_BROWSERS`. */
  supportedBrowsers?: readonly string[];
  /** Browsers shown as not able to connect yet. Optional; defaults to `NOT_YET_BROWSERS`. When empty, the "cannot connect" sentence is left out. */
  notYetBrowsers?: readonly string[];
  /** Your own button component (same props as a `<button>` plus `variant`). Default: a plain button styled by claude-code.css. */
  Button?: ComponentType<ClaudeCodeButtonProps>;
  /** Whether this browser needs the bridge window (Safari). Optional; default is read from the user agent. For tests and hosts. */
  relayBrowser?: boolean;
  /** Overrides Brave detection (`isBraveBrowser()`), for tests and hosts. */
  braveBrowser?: boolean;
}

/**
 * The Connect > Claude Code flow, in two steps, ready to drop in under your own provider chooser:
 *   1. instructions: the one-off command and the always-on command, each with Copy;
 *   2. the code box: it looks for the bridge on this computer, then trades the typed code for the secret.
 * Rendering it IS choosing Claude Code, so mount it when the person picks that provider and unmount it on Cancel.
 */
export function ClaudeCodeConnect({ client, commands, onConnected, onError, supportEmail, supportedBrowsers = SUPPORTED_BROWSERS, notYetBrowsers = NOT_YET_BROWSERS, Button = DefaultButton, relayBrowser, braveBrowser }: ClaudeCodeConnectProps): ReactElement {
  const isRelay = relayBrowser ?? detectRelayBrowser();
  const isBrave = braveBrowser ?? isBraveBrowser();
  const [stage, setStage] = useState<"steps" | "code">("steps");
  const [copied, setCopied] = useState(false);
  const [copiedAlways, setCopiedAlways] = useState(false);
  const [bridgeUp, setBridgeUp] = useState<boolean | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  const [copiedAuth, setCopiedAuth] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedNode, setCopiedNode] = useState(false);
  const [relay, setRelay] = useState<"closed" | "opening" | "open">(() => client.relayState());
  const [relayFailed, setRelayFailed] = useState(false);
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

  // Looks for the bridge again WITHOUT clearing the typed code: the person may have the
  // code already and only started the bridge late (Kai, 2026-11-04).
  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      const up = await client.probe();
      setBridgeUp(up);
      if (up) setError(null);
    } finally {
      setChecking(false);
    }
  }, [client, setError]);

  useEffect(() => {
    setRelay(client.relayState());
    return client.onRelayChange(setRelay);
  }, [client]);

  const openWindow = () => {
    // First statement, no await before it: the pop-up is only allowed inside the click.
    const opened = client.openRelay();
    setRelayFailed(false);
    void (async () => {
      if (await opened) {
        await recheck();
      } else {
        setRelayFailed(true);
      }
    })();
  };

  const pair = useCallback(async () => {
    if (pairing || !pairCode.trim()) return;
    setError(null);
    setPairing(true);
    try {
      const readback = await client.pair(pairCode);
      setPairCode("");
      setBridgeUp(true);
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
        {bridgeUp === false && !isRelay ? (
          <p className="gcc-text" data-testid="claude-code-bridge-hint">
            Not reachable on this computer yet. Check the {T} window is still open, then check again. The command is:{" "}
            <code className="gcc-mono gcc-break">{commands.start}</code>{" "}
            {isBrave ? null : <span data-testid="claude-code-allow-hint">{ALLOW_AFTER_BLOCK}</span>}
          </p>
        ) : null}
        {bridgeUp === false && !isRelay && isBrave ? <BraveSteps last={BRAVE_LAST_STEP_CHECK} /> : null}
        {bridgeUp === false && isRelay ? (
          <div className="gcc-note" data-testid="claude-code-relay">
            <p className="gcc-text">{RELAY_OFFER}</p>
            <Button type="button" variant="ghost" onClick={openWindow} disabled={relay === "opening"} data-testid="claude-code-relay-open">
              {relay === "opening" ? "Opening…" : "Open bridge window"}
            </Button>
            {relayFailed ? (
              <p className="gcc-error" role="alert" data-testid="claude-code-relay-failed">
                {RELAY_FAILED}
              </p>
            ) : null}
          </div>
        ) : null}
        {/* The field and Pair are always there, whatever the bridge check said: a check can run
            before the bridge is up, and hiding the field then left the person stuck (Kai, 2026-11-04).
            If the bridge really is down, Pair fails with status 0 and the hint comes back. */}
        <form
          className="gcc-form"
          onSubmit={(e) => {
            e.preventDefault();
            void pair();
          }}
        >
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
            disabled={pairing}
          />
          <Button type="submit" disabled={pairing || !pairCode.trim()}>
            Pair
          </Button>
          {bridgeUp === false ? (
            <Button type="button" variant="ghost" onClick={() => void recheck()} disabled={checking} data-testid="claude-code-recheck">
              Check again
            </Button>
          ) : null}
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
      <p className="gcc-text">{system === "mac" ? "You need a supported browser and two programs on your computer:" : "You need two programs on your computer:"}</p>
      <ul className="gcc-list">
        {system === "mac" ? (
          <li data-testid="claude-code-supported-browsers">
            <p className="gcc-text">
              <strong>Supported browsers: {listWords(supportedBrowsers)}.</strong>
              {notYetBrowsers.length > 0
                ? ` ${listWords(notYetBrowsers)} cannot connect to Claude Code yet. If you are in ${notYetBrowsers.length === 1 ? "it" : "one of them"}, open this page in ${orWords(supportedBrowsers)}.`
                : ""}{" "}
              {SAFARI_WINDOW_SENTENCE} {supportedBrowsers.includes("Brave") && !isBrave ? `${BRAVE_OTHER_BROWSERS_SENTENCE} ` : ""}{ALLOW_BEFORE_PAIR}
            </p>
            {supportedBrowsers.includes("Brave") && isBrave ? <BraveSteps last={BRAVE_LAST_STEP_ITEM} /> : null}
          </li>
        ) : null}
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
