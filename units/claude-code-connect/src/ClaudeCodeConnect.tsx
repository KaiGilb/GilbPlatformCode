import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ComponentType, type ReactElement, type ReactNode } from "react";
import { ClaudeCodeBridgeError, type BridgeEngine, type ClaudeCodeClient, type ClaudeCodeReadback } from "@kaigilb/gilbplatformcode-claude-code-client";
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

/** Mac: look up the newest LTS release on nodejs.org, download its official .pkg, run the installer (asks for the Mac password). Raw string: the shell must see \t, $10, $1 and $V as written. */
export const NODE_INSTALL_MAC = String.raw`V=$(curl -fsSL https://nodejs.org/dist/index.tab | awk -F'\t' 'NR>1 && $10!="-" && v=="" {v=$1} END {print v}') && curl -fsSL "https://nodejs.org/dist/$V/node-$V.pkg" -o /tmp/node.pkg && sudo installer -pkg /tmp/node.pkg -target /`;
/** Windows: winget installs the LTS release of Node.js. */
export const NODE_INSTALL_WINDOWS = "winget install OpenJS.NodeJS.LTS";

const BRAVE_OTHER_BROWSERS_SENTENCE = "Brave needs one setting, shown here when you open this page in Brave.";
export const BRAVE_STEPS_HEADING = "Brave: allow it once yourself. Brave does not ask.";
/** The five steps; the last one differs between the Mac supported-browsers item and step 3. */
export const BRAVE_STEPS: readonly string[] = [
  "In Brave's address bar, click the small icon with two sliders, at the far left just before this site's address.",
  "In the panel that opens, click Site settings at the bottom. It opens in a new tab.",
  "Scroll to the very bottom of that list and find Apps on device. (Not Local network, just above it: leave that one as it is.)",
  "Set Apps on device to Allow.",
];
export const BRAVE_LAST_STEP_ITEM = "Go back to this tab. You can now pair.";
export const BRAVE_LAST_STEP_CHECK = "Go back to this tab and click Check again.";

const SAFARI_WINDOW_SENTENCE = "In Safari, Claude Code works through a small bridge window that you open in step 3. Keep it open while you chat; you can minimise it.";
export const RELAY_OFFER =
  "Safari only reaches the bridge through a small window. Open it, then keep it open while you chat (you can minimise it). If the window says it cannot connect, check the bridge is running: paste the Option Always On command from step 2 again.";
export const RELAY_BAR_TEXT = "Safari needs the bridge window for Claude Code.";
export const RELAY_FAILED =
  "The bridge window did not open. If Safari blocked it, allow pop-ups for this site (Safari › Settings for This Website › Pop-up Windows › Allow) and try again. If it opened but stayed empty, your bridge is older: run the Option Always On command in step 2 again to update it.";

/** An older bridge sends no `engines`, so Codex cannot be confirmed. */
const CODEX_OUT_OF_DATE = "Your bridge is out of date. Update it to use Codex.";
/** The hello's codex entry is still probing and gave no sentence of its own. */
const CODEX_CHECKING = "Checking Codex on your computer…";

/**
 * Reads the codex entry of a paired hello.
 * A missing entry is treated as an older bridge: the page has no sentence it can trust.
 * Spec: Chat.CodexConnect.PagePart.Units — codex readiness.
 */
function codexVerdict(info: { engines?: BridgeEngine[] }): { ready: true } | { ready: false; text: string } {
  const engines = info.engines;
  if (!engines) return { ready: false, text: CODEX_OUT_OF_DATE };
  const entry = engines.find((e) => e.id === "codex");
  if (!entry) return { ready: false, text: CODEX_OUT_OF_DATE };
  if (entry.ready) return { ready: true };
  if (entry.checking && !entry.reason) return { ready: false, text: CODEX_CHECKING };
  return { ready: false, text: entry.reason ?? "" };
}

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
      <ol className="gcc-steps-list">
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

export const WINDOWS_EARLY_NOTICE = "Windows is new. It works on Windows test machines but has not yet been tried by a person on their own PC. If something does not work,";
const WINDOWS_BROWSER_SENTENCE = "Use Chrome on Windows. Edge and Brave use the same engine as Chrome but have not been tried on Windows yet.";
const WINDOWS_OPEN_POWERSHELL = "You will paste commands into PowerShell. To open it: press the Windows key, type PowerShell, and press Enter.";
const WINDOWS_ALLOW_SENTENCE = "When you pair, Chrome may ask to let this page use apps on this device. Choose Allow.";

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
  /** Where a person writes if Windows does not work for them (the Windows early notice). The host passes it (this unit names no host); without it the Windows tab shows no mail link. */
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
  /**
   * Which program step 1 sets up. "claude" (the default) is today's Claude Code setup.
   * "codex" sets up Codex and tells the app only once the bridge reports Codex ready.
   * Spec: Chat.CodexConnect.PagePart.Units — engine on the connect view.
   */
  engine?: "claude" | "codex";
}

/**
 * The Connect > Claude Code flow, in two steps, ready to drop in under your own provider chooser:
 *   1. instructions: the one-off command and the always-on command, each with Copy;
 *   2. the code box: it looks for the bridge on this computer, then trades the typed code for the secret.
 * Rendering it IS choosing Claude Code, so mount it when the person picks that provider and unmount it on Cancel.
 * Pass `engine: "codex"` for the Codex setup. Claude's screens stay as they are.
 */
export function ClaudeCodeConnect({ client, commands, onConnected, onError, supportEmail, supportedBrowsers = SUPPORTED_BROWSERS, notYetBrowsers = NOT_YET_BROWSERS, Button = DefaultButton, relayBrowser, braveBrowser, engine = "claude" }: ClaudeCodeConnectProps): ReactElement | null {
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
  const [copiedNodeInstall, setCopiedNodeInstall] = useState(false);
  const [relay, setRelay] = useState<"closed" | "opening" | "open">(() => client.relayState());
  const [relayFailed, setRelayFailed] = useState(false);
  const [system, setSystem] = useState<ClaudeCodeSystem>(detectSystem);
  const [copiedCodexInstall, setCopiedCodexInstall] = useState(false);
  const [copiedCodexLogin, setCopiedCodexLogin] = useState(false);
  // null until a codex hello has been read. The sentence stays up until the entry is ready.
  const [codexHold, setCodexHold] = useState<string | null>(null);
  const [codexReady, setCodexReady] = useState(false);
  const toldConnected = useRef(false);
  const savedReadback = useRef<ClaudeCodeReadback | null>(null);
  // Once, on the first render: a pair later in this visit must not switch to the already-paired layout.
  const pairedAtMount = useRef<boolean | null>(null);
  if (pairedAtMount.current === null) pairedAtMount.current = engine === "codex" && client.load() !== null;
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
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

  // The app is told once, and only when the codex entry is ready. Claude never comes through here.
  // Spec: Chat.CodexConnect.PagePart.Units — onConnected only when Codex is ready.
  const settleCodex = useCallback((info: { engines?: BridgeEngine[] }, readback: ClaudeCodeReadback | null) => {
    const verdict = codexVerdict(info);
    if (verdict.ready) {
      if (readback && !toldConnected.current) {
        toldConnected.current = true;
        setCodexReady(true);
        onConnectedRef.current(readback);
      }
      return;
    }
    setCodexHold(verdict.text);
  }, []);

  const loadCodexInfo = useCallback(async (): Promise<{ engines?: BridgeEngine[] }> => {
    try {
      return await client.bridgeInfo();
    } catch {
      // A hello that cannot be read has no engines. The person sees the out-of-date sentence.
      return {};
    }
  }, [client]);

  // A later read (Check again, or the pair that just finished) must beat a read that left earlier.
  const codexTicket = useRef(0);
  const refreshCodex = useCallback(async (readback: ClaudeCodeReadback | null, still: () => boolean) => {
    const mine = ++codexTicket.current;
    const info = await loadCodexInfo();
    if (!still() || mine !== codexTicket.current) return;
    settleCodex(info, readback);
  }, [loadCodexInfo, settleCodex]);

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

  useEffect(() => {
    // Claude does not read engines. Codex reads them at once only when this page opens already paired.
    // Spec: Chat.CodexConnect.PagePart.Units — codex readiness at mount.
    if (engine !== "codex" || client.load() === null) return;
    let live = true;
    void refreshCodex(client.readConnected(), () => live);
    return () => {
      live = false;
    };
  }, [engine, client, refreshCodex]);

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
      // Codex stays on this screen until the bridge says it is ready. Claude tells the app at once, as before.
      // Spec: Chat.CodexConnect.PagePart.Units — the readiness check runs after pairing.
      if (engine === "codex") {
        savedReadback.current = readback;
        await refreshCodex(readback, () => true);
      } else {
        onConnected(readback);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : engine === "codex" ? "Codex could not connect." : "Claude Code could not connect.");
      if (err instanceof ClaudeCodeBridgeError && err.status === 0) setBridgeUp(false);
    } finally {
      setPairing(false);
    }
  }, [client, pairing, pairCode, onConnected, setError, engine, refreshCodex]);

  const checkCodexAgain = useCallback(async () => {
    await refreshCodex(savedReadback.current ?? client.readConnected(), () => true);
  }, [refreshCodex, client]);

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

  const T = system === "linux" ? "terminal" : system === "windows" ? "PowerShell" : "Terminal";
  const win = system === "windows";
  const startCmd = win ? commands.windows.start : commands.start;

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
            <code className="gcc-mono gcc-break">{startCmd}</code>{" "}
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
            <p className="gcc-text">Option Always On: get your code by pasting this in {T}.</p>
            {cmdBox({ text: win ? commands.windows.code : commands.code, testId: "claude-code-code-command", copyLabel: "Copy code command", copiedFlag: copiedCode, onCopied: () => setCopiedCode(true) })}
            <p className="gcc-note" data-testid="claude-code-node-note">
              {win ? "Type it exactly, starting with node." : 'Type it exactly, starting with node. Without node your Mac answers "Permission denied".'}
            </p>
            <p className="gcc-text">Option One Session: the code is shown in the {T} window.</p>
            {codeEntry}
          </>,
        );

  const sectionOne = section(
    "before",
    "1 · Before you start",
    <>
      {win ? (
        <>
          <p className="gcc-text" data-testid="claude-code-windows-browser">{WINDOWS_BROWSER_SENTENCE}</p>
          <p className="gcc-text" data-testid="claude-code-windows-open">{WINDOWS_OPEN_POWERSHELL}</p>
        </>
      ) : null}
      <p className="gcc-text">{system === "mac" ? "You need a supported browser and two programs on your computer:" : "You need two programs on your computer:"}</p>
      <ul className="gcc-list">
        {system === "mac" ? (
          <li data-testid="claude-code-supported-browsers">
            <p className="gcc-text">
              <strong>Supported browsers: {listWords(supportedBrowsers)}.</strong>
              {notYetBrowsers.length > 0
                ? ` ${listWords(notYetBrowsers)} cannot connect to ${engine === "codex" ? "Codex" : "Claude Code"} yet. If you are in ${notYetBrowsers.length === 1 ? "it" : "one of them"}, open this page in ${orWords(supportedBrowsers)}.`
                : ""}{" "}
              {engine === "codex" ? SAFARI_WINDOW_SENTENCE.replace("Claude Code", "Codex") : SAFARI_WINDOW_SENTENCE}{" "}{supportedBrowsers.includes("Brave") && !isBrave ? `${BRAVE_OTHER_BROWSERS_SENTENCE} ` : ""}{supportedBrowsers.includes("Brave") && isBrave ? "" : ALLOW_BEFORE_PAIR}
            </p>
            {supportedBrowsers.includes("Brave") && isBrave ? <BraveSteps last={BRAVE_LAST_STEP_ITEM} /> : null}
          </li>
        ) : null}
        {/* Node comes first for Codex: npm needs it. Claude keeps its own order. */}
        {/* Spec: Chat.CodexConnect.PagePart.Units — Node.js before Codex. */}
        {engine === "codex" ? (
          <li>
            <p className="gcc-text">
              <strong>Node.js 18 or newer</strong>, the free program that runs the bridge. To check, type this in {T}; it should show v18 or higher:
            </p>
            {cmdBox({ text: "node --version", testId: "claude-code-node-check", copyLabel: "Copy node check command", copiedFlag: copiedNode, onCopied: () => setCopiedNode(true) })}
            {system === "linux" ? (
              <p className="gcc-text">
                Get it from{" "}
                <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">
                  nodejs.org
                </a>{" "}
                if it is missing.
              </p>
            ) : (
              <>
                <p className="gcc-text">
                  {win ? `If it is missing, paste this in ${T}:` : `If it is missing, paste this in ${T}. It downloads the official installer from nodejs.org and asks for your Mac password:`}
                </p>
                {cmdBox({
                  text: win ? NODE_INSTALL_WINDOWS : NODE_INSTALL_MAC,
                  testId: "claude-code-node-install",
                  copyLabel: "Copy Node install command",
                  copiedFlag: copiedNodeInstall,
                  onCopied: () => setCopiedNodeInstall(true),
                })}
                <p className="gcc-text">
                  Then close and reopen {T} and check again with node --version. Or get it from{" "}
                  <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">
                    nodejs.org
                  </a>
                  {win ? " (choose the LTS Windows installer)." : "."}
                </p>
              </>
            )}
          </li>
        ) : (
          <li>
            <p className="gcc-text">
              {win ? (
                <>
                  <strong>Claude Code for Windows</strong>, signed in with your Claude subscription. Install it from Anthropic's setup page (
                  <a href="https://code.claude.com/docs/en/setup" target="_blank" rel="noopener noreferrer">
                    code.claude.com/docs/en/setup
                  </a>
                  ), then sign in once in {T}:
                </>
              ) : (
                <>
                  <strong>Claude Code</strong>, signed in with your Claude subscription. Sign in once in {T}:
                </>
              )}
            </p>
            {cmdBox({ text: "claude auth login", copyLabel: "Copy sign-in command", copiedFlag: copiedAuth, onCopied: () => setCopiedAuth(true) })}
          </li>
        )}
        {engine === "codex" ? (
          <li>
            <p className="gcc-text">
              <strong>Codex</strong> signed in with your ChatGPT subscription. Install it once in {T}:
            </p>
            {cmdBox({ text: "npm install -g @openai/codex", testId: "codex-install", copyLabel: "Copy install command", copiedFlag: copiedCodexInstall, onCopied: () => setCopiedCodexInstall(true) })}
            <p className="gcc-text">Then sign in:</p>
            {cmdBox({ text: "codex login", testId: "codex-login", copyLabel: "Copy sign-in command", copiedFlag: copiedCodexLogin, onCopied: () => setCopiedCodexLogin(true) })}
            <p className="gcc-text" data-testid="codex-signin-note">
              Choose Sign in with ChatGPT. This app runs Codex only on your ChatGPT sign-in, never on an API key.
            </p>
          </li>
        ) : (
          <li>
          <p className="gcc-text">
            <strong>Node.js 18 or newer</strong>, the free program that runs the bridge. To check, type this in {T}; it should show v18 or higher:
          </p>
          {cmdBox({ text: "node --version", testId: "claude-code-node-check", copyLabel: "Copy node check command", copiedFlag: copiedNode, onCopied: () => setCopiedNode(true) })}
          {system === "linux" ? (
            <p className="gcc-text">
              Get it from{" "}
              <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">
                nodejs.org
              </a>{" "}
              if it is missing.
            </p>
          ) : (
            <>
              <p className="gcc-text">
                {win ? `If it is missing, paste this in ${T}:` : `If it is missing, paste this in ${T}. It downloads the official installer from nodejs.org and asks for your Mac password:`}
              </p>
              {cmdBox({
                text: win ? NODE_INSTALL_WINDOWS : NODE_INSTALL_MAC,
                testId: "claude-code-node-install",
                copyLabel: "Copy Node install command",
                copiedFlag: copiedNodeInstall,
                onCopied: () => setCopiedNodeInstall(true),
              })}
              <p className="gcc-text">
                Then close and reopen {T} and check again with node --version. Or get it from{" "}
                <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">
                  nodejs.org
                </a>
                {win ? " (choose the LTS Windows installer)." : "."}
              </p>
            </>
          )}
        </li>
        )}
      </ul>
      <p className="gcc-text">{engine === "codex" ? "It is billed to your ChatGPT subscription, and your turns stay on your computer." : "It is billed to your Claude subscription, and your turns stay on your computer."}</p>
      {win ? <p className="gcc-text" data-testid="claude-code-windows-allow">{WINDOWS_ALLOW_SENTENCE}</p> : null}
    </>,
  );

  const oneSession = (
    <div className="gcc-choice">
      <p className="gcc-choice__title">Option One Session</p>
      <p className="gcc-text">Paste this in {T} and keep that window open. It shows your pairing code.</p>
      {cmdBox({ text: startCmd, testId: "claude-code-command", copiedFlag: copied, onCopied: () => setCopied(true) })}
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
          <p className="gcc-text">Paste this once in {T}. It starts by itself each time you log in.</p>
          {cmdBox({
            text: win ? commands.windows.install : commands.install,
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

  const windowsEarly = (
    <div className="gcc-note" data-testid="claude-code-windows-early">
      <p className="gcc-text">
        <strong>
          {WINDOWS_EARLY_NOTICE}
          {supportEmail ? (
            <>
              {" write to "}
              <a href={`mailto:${supportEmail}?subject=${engine === "codex" ? "Codex%20on%20Windows" : "Claude%20Code%20on%20Windows"}`} data-testid="claude-code-windows-request">
                {supportEmail}
              </a>
            </>
          ) : (
            " ask us"
          )}
          {" and we will help."}
        </strong>
      </p>
    </div>
  );

  const codexGate =
    engine === "codex" && !codexReady && (codexHold !== null || pairedAtMount.current) ? (
      <>
        {codexHold ? (
          <p className="gcc-text" data-testid="codex-state">
            {codexHold}
          </p>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => void checkCodexAgain()} data-testid="codex-check-again">
          Check again
        </Button>
      </>
    ) : null;

  // Already paired when the page opened: steps 2 and 3 would start a second bridge. Step 1 is what is left.
  // Spec: Chat.CodexConnect.PagePart.Units — already paired at mount.
  const panelBody =
    engine === "codex" && pairedAtMount.current && !codexReady ? (
      <>
        {win ? windowsEarly : null}
        {sectionOne}
        <p className="gcc-text" data-testid="codex-already-paired">
          Your bridge is already paired. Finish step 1, then press Check again.
        </p>
        {codexGate}
      </>
    ) : stage === "code" && engine === "codex" && codexHold !== null ? (
      <>
        {win ? windowsEarly : null}
        {codexGate}
      </>
    ) : stage === "code" ? (
      <>
        {win ? windowsEarly : null}
        {sectionThree}
      </>
    ) : (
      <>
        {win ? windowsEarly : null}
        {sectionOne}
        {system === "linux" ? sectionTwoLinux : sectionTwoMac}
        {sectionThree}
      </>
    );

  // A ready Codex entry has nothing left to show. The app was already told.
  // Spec: Chat.CodexConnect.PagePart.Units — show nothing more once Codex is ready.
  if (engine === "codex" && codexReady) return null;

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
