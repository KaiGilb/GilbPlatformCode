// gilb-claude-code, page side. The person's own Claude Code, on their own computer, as an app's agent.
//
// A small local bridge (bridge/bridge.mjs) runs the person's official `claude` CLI on their Claude subscription. This
// module is the page's side of it. It knows nothing about any one app: the app hands in what it has (its platform
// origin, how it signs a request, where to keep the secret) and gets back a client.
//
//   pair     the person types the short code the bridge printed in their terminal; the bridge answers with a secret.
//            The secret is kept in localStorage (this origin only: every tab and browser restart shares it), keyed by the
//            signed-in principal. The bridge keeps it too (hashed) until Disconnect, a 401, or 30 idle days.
//            ⛔ Nothing is written to any vault, and the secret is never sent anywhere but the bridge on the person's own computer.
//   a turn   1. GilbPlatform composes the turn: system prompt (+ the picked agent's standing instructions) and the tool
//               list (POST <platformOrigin>/base/ai/claude-code/context).
//            2. The bridge runs Claude Code with them and streams back. When Claude Code calls a vault tool, the bridge
//               asks THIS page to run it: the page calls GilbPlatform (POST <platformOrigin>/base/ai/claude-code/tool)
//               with the app's own sign-in, as the person, and hands the answer back. The bridge never holds a
//               GilbPlatform credential, and ⛔ no Claude credential is ever seen here.

export const CLAUDE_CODE_PROVIDER = "claude-code" as const;

/** What the bridge says on `/v1/hello`. */
const BRIDGE_NAME = "gilb-claude-code-bridge";

/** The bridge could not be reached, refused, or failed a turn. `status` 0 = not reachable on this computer. */
export class ClaudeCodeBridgeError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ClaudeCodeBridgeError";
    this.status = status;
  }
}

/** GilbPlatform refused or could not answer the turn's context request (the tool calls report their errors to the model instead). */
export class ClaudeCodePlatformError extends Error {
  readonly status: number;
  /** The body's `error` token when it sent one, else undefined. */
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ClaudeCodePlatformError";
    this.status = status;
    this.code = code;
  }
}

export interface ClaudeCodeTurn {
  role: "user" | "assistant";
  content: string;
  model?: string;
  payer?: string;
}

/** What a code turn on this bridge may do: "full" (files and commands in a sandbox) or "files-only" (native Windows: no commands). */
export type CodeMode = "full" | "files-only";

export interface ClaudeCodeReply {
  role: "assistant";
  content: string;
  model: string;
  payer: "person-claude-code";
  /** True when the turn ended because its tool rounds were used up. Absent otherwise. The page sends {@link BUDGET_SPENT_CONTINUE} to go on. */
  budgetSpent?: boolean;
  /** Code mode only: "files-only" when the turn could not run commands (Windows). Absent for a full code turn and for chat. */
  codeMode?: "files-only";
  /** Code mode only: "computer" when the bridge runs with full computer access (--full-access). Absent otherwise. */
  access?: "computer";
  /** Code turn only: the project the turn ran in. Absent for a turn in the code folder itself and for chat. */
  project?: string;
}

/** The text the page sends to go on after a turn ended because its tool rounds were used up. */
export const BUDGET_SPENT_CONTINUE = "continue";

/** What the page tells the app while a turn runs. `standing` carries the platform's raw report; the app reads it as it likes. */
export type ClaudeCodeStreamEvent =
  | { event: "start"; data: { ok: true } }
  | { event: "tool"; data: { name: string; ok: boolean } }
  | { event: "slipped"; data: { ids: string[] } }
  | { event: "standing"; data: unknown }
  // Code mode only (the bridge's code turn). A malformed one is dropped, never thrown.
  | { event: "code_activity"; data: { tool: string; summary: string } }
  | { event: "code_tool_error"; data: { tool: string; summary: string; text: string } }
  | { event: "files_changed"; data: FilesChanged }
  | { event: "approval_request"; data: ApprovalRequest }
  | { event: "approval_done"; data: { id: string; allow: boolean } };

/** What a code turn changed in the folder, as the bridge counted it. Each list holds at most 200 relative paths. */
export interface FilesChanged {
  added: string[];
  changed: string[];
  removed: string[];
  addedCount: number;
  changedCount: number;
  removedCount: number;
  truncated: boolean;
}

/** One question the bridge puts to the person before a write or a command (approval "each-write"). */
export interface ApprovalRequest {
  id: string;
  tool: string;
  summary: string;
  /** A second line, when the bridge sent one (for a command: the model's own description of it). */
  detail?: string;
}

/** The bridge never cuts an approval question: it sends the whole text (up to 2000 characters) or does not ask. The detail line is capped at 200. */
const APPROVAL_SUMMARY_MAX = 2000;
const APPROVAL_DETAIL_MAX = 200;
const isStr = (v: unknown): v is string => typeof v === "string";
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Turns one bridge code event into a stream event, or null when its shape is wrong. */
function codeStreamEvent(name: string, d: Record<string, unknown>): ClaudeCodeStreamEvent | null {
  if (name === "activity" && isStr(d.tool) && isStr(d.summary)) return { event: "code_activity", data: { tool: d.tool, summary: d.summary } };
  if (name === "tool_error" && isStr(d.tool) && isStr(d.summary) && isStr(d.text)) return { event: "code_tool_error", data: { tool: d.tool, summary: d.summary, text: d.text } };
  if (name === "files_changed" && isStrList(d.added) && isStrList(d.changed) && isStrList(d.removed) && isCount(d.addedCount) && isCount(d.changedCount) && isCount(d.removedCount) && typeof d.truncated === "boolean") {
    return { event: "files_changed", data: { added: d.added, changed: d.changed, removed: d.removed, addedCount: d.addedCount, changedCount: d.changedCount, removedCount: d.removedCount, truncated: d.truncated } };
  }
  if (name === "approval_request" && isStr(d.id) && d.id !== "" && isStr(d.tool) && isStr(d.summary) && d.summary.length <= APPROVAL_SUMMARY_MAX && !(isStr(d.detail) && d.detail.length > APPROVAL_DETAIL_MAX)) return { event: "approval_request", data: { id: d.id, tool: d.tool, summary: d.summary, ...(isStr(d.detail) && d.detail !== "" ? { detail: d.detail } : {}) } };
  if (name === "approval_done" && isStr(d.id) && typeof d.allow === "boolean") return { event: "approval_done", data: { id: d.id, allow: d.allow } };
  return null;
}

/** A message the person wrote while a Claude Code turn was already running. */
export interface SlippedMessage {
  id: string;
  text: string;
}

/** The same sentence GilbPlatform uses, so the model reads one wording whichever path runs. */
export const SLIPPED_LEAD =
  "The person wrote this while you were working. Read it now and take it into account before your next step:";

/** The text appended to a tool answer: a blank line, the lead, a blank line, the texts joined by a blank line. */
export function slippedSuffix(msgs: readonly SlippedMessage[]): string {
  return "\n\n" + SLIPPED_LEAD + "\n\n" + msgs.map((m) => m.text).join("\n\n");
}

export interface ClaudeCodeConnection {
  provider: typeof CLAUDE_CODE_PROVIDER;
  secret: string;
  connected_at: number;
}

export interface ClaudeCodeReadback {
  provider: typeof CLAUDE_CODE_PROVIDER;
  connected: true;
  connected_at: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export interface ClaudeCodeClientConfig {
  /** Who is signed in. The pairing secret is stored per principal. An empty principal is "nobody": nothing connects. */
  principal: string;
  /** The GilbPlatform origin the app talks to, e.g. `https://platform.example.test`. The two routes below it are fixed. */
  platformOrigin: string;
  /**
   * The app's own request signing for GilbPlatform: the headers (`authorization`, `dpop`, ...) for ONE request.
   * The page calls this per request, so a DPoP proof is bound to that method and URL.
   */
  getAuthHeaders: (method: string, url: string) => Promise<Record<string, string>> | Record<string, string>;
  /** Called when GilbPlatform answers 401 so the app can drop its cached proof/token before the one retry. */
  invalidateAuth?: () => void;
  /** REQUIRED. Where the bridge listens on the person's own computer: the loopback URL the host app passes in. */
  bridgeUrl: string;
  /** Default `globalThis.localStorage` (per origin, shared by tabs and restarts). The secret never leaves this origin. */
  storage?: StorageLike;
  /** Prefix for the storage keys. Default `gilb`. */
  storageNamespace?: string;
  /** The command the person is told to run when no bridge answers. A function is called at the moment of the message. */
  startCommand?: string | (() => string);
  /** Turns a failed response into a sentence. Default reads `message`/`error` from the body. */
  errorText?: (status: number, body: unknown, fallback: string) => string;
}

export interface SendClaudeCodeOpts {
  /** Names the thread (the agent or own-agent entry) so its Claude Code session is kept apart. */
  thread: string;
  /** Vaults already selected in the app (`contentVaultIds`). Only `http…` ids are sent. */
  contentVaultIds?: string[];
  /** Picker id of a platform agent. */
  agent?: string;
  /** An own agent's entry URI. When set, sent instead of `agent`. */
  agentEntry?: string;
  onEvent?: (ev: ClaudeCodeStreamEvent) => void;
  /**
   * The person's messages slipped into this running turn. Taken when a top-level tool answer is about to go back to
   * Claude Code and added after it; ⛔ never into a hand-off's nested turn.
   */
  takeSlipped?: () => readonly SlippedMessage[];
  /**
   * Told, for the turn and for each hand-off's nested turn, what the CLI itself says it runs with. `apiKeySource` is
   * "none" on a subscription; the bridge stops any run that says otherwise.
   */
  onBridgeStatus?: (status: { nested: boolean; apiKeySource: string | null; model: string }) => void;
  /**
   * "code" runs the turn in the folder the bridge was started with (`--workspace`): Claude Code may read, edit and run commands there.
   * Default "chat" (no tools). A hand-off's nested turn is always a chat turn.
   */
  mode?: "chat" | "code";
  /**
   * Code mode only. "session" (default): the person approved once, when they started the turn. "each-write": the bridge asks before
   * each write and each command, and {@link onApproval} answers.
   */
  approval?: "session" | "each-write";
  /**
   * Code mode only (bridge 0.3.0): the project, a direct subfolder of the bridge's code folder, this turn runs inside. The kept Claude Code
   * session is per project (and thread). Absent: the code folder itself. An unknown project is a 400 from the bridge, "No such project.".
   */
  project?: string;
  /**
   * Called when the bridge asks the person to approve a write or a command. Resolve true to allow. No handler, or a handler that
   * throws or rejects, answers "no". The turn keeps running while this waits.
   */
  onApproval?: (req: ApprovalRequest) => Promise<boolean>;
}

/** What `/base/ai/claude-code/tool` answers when the tool is a hand-off: a nested turn for THIS page to run on the person's Claude Code. */
export interface ClaudeCodeHop {
  id: string;
  via: string;
  role: string;
  task: string;
  system: string;
  tools: unknown[];
  /** The tool answer's fixed part (role, procedures, standing outcome). The nested turn's final text is added as `content`. */
  answer: Record<string, unknown>;
}

export interface ClaudeCodeClient {
  readonly principal: string;
  readonly bridgeUrl: string;
  /** True when a bridge answers on this computer. Does not need the secret. */
  probe(): Promise<boolean>;
  /** The same check as probe(), plus the build `/v1/hello` reports. An older bridge sends none, so `build` is null. */
  bridgeInfo(): Promise<{ reachable: boolean; build: string | null; codeTurns: boolean; workspace: boolean; codeMode: CodeMode | null; access: "folder" | "computer" | null }>;
  /** The code folder this bridge was started with (`POST /v1/workspace`, needs the pairing), or null when it has none (or you are not connected). */
  workspaceInfo(): Promise<{ name: string; path: string } | null>;
  /**
   * Opens the system's own folder dialog ON THE COMPUTER THE BRIDGE RUNS ON and waits for the person (up to 5 minutes), then keeps the
   * chosen folder as the code folder. `suggest` (default "MyJackfruitCode") is only a name the page may offer to make with createWorkspace.
   * Cancel -> { chosen: false }. A refusal (a folder that is not fit, a code turn running, no dialog on this computer) throws a ClaudeCodeBridgeError
   * carrying the bridge's own sentence. Needs the pairing.
   */
  chooseWorkspace(suggest?: string): Promise<{ chosen: false } | { chosen: true; name: string; path: string }>;
  /** Makes ~/<name> on the bridge's computer (no dialog), and keeps it as the code folder. A folder that already has files -> 409 with the bridge's sentence. */
  createWorkspace(name: string): Promise<{ name: string; path: string }>;
  /** The projects (direct subfolders) of the bridge's code folder: `{ name, modified }`, sorted by name. Needs the pairing; goes through the relay when open. */
  listProjects(): Promise<{ name: string; modified: string }[]>;
  /** Makes the project `name` (a subfolder) in the code folder. 409 when it exists, 400 for a bad name, with the bridge's sentence. */
  createProject(name: string): Promise<{ name: string }>;
  /** Trades the code printed in the bridge's terminal for a secret and keeps it for this tab. Wrong code -> 401 with the bridge's own sentence. */
  pair(code: string): Promise<ClaudeCodeReadback>;
  /** Trades the code for a secret and returns it WITHOUT keeping it (for an app that stores it itself). */
  requestSecret(code: string): Promise<string>;
  save(secret: string): ClaudeCodeConnection;
  load(): ClaudeCodeConnection | null;
  /** Connected read-back for the UI. ⛔ Does not expose the secret. */
  readConnected(): ClaudeCodeReadback | null;
  /** Forget the secret here and, best effort, ask the bridge to forget it too. */
  disconnect(): void;
  /**
   * Opens the bridge's relay window (`<bridge origin>/relay`), for a browser that blocks this page's direct fetch to the
   * bridge (Safari: mixed content). While the window is open and ready, EVERY bridge call goes through it, by postMessage;
   * while it is not, every call is a direct fetch. ⛔ Call it from a click handler: it calls `window.open` before anything
   * else, because popup blockers only allow that inside the click. Resolves true when the window said it is ready (within
   * 10 s); false when the popup was blocked, when nothing answered in time (an older bridge without /relay, which serves a
   * 404 page; the window is then closed again), or when the window closed first. When it is already open it is focused
   * and this resolves true. Nothing about the relay is kept: after a page reload the person opens it again with a click.
   */
  openRelay(): Promise<boolean>;
  /** "closed" (no window, direct fetch), "opening" (window opened, waiting for its ready message), "open" (calls go through it). */
  relayState(): "closed" | "opening" | "open";
  /** Calls `cb` each time {@link relayState} changes. Returns the function that stops it. */
  onRelayChange(cb: (state: "closed" | "opening" | "open") => void): () => void;
  /** Closes the relay window if there is one, and fails every request still going through it. */
  closeRelay(): void;
  /**
   * A cheap check: true when a direct `GET /v1/hello` throws a TypeError within 1.5 s while the relay is not open. That is
   * what a browser that blocks the call looks like, but it is the same TypeError as "the bridge is not running", so this
   * alone cannot tell the two apart; the Connect UI combines it with what else it knows. False when the relay is open,
   * when the bridge answered, or when nothing came back in 1.5 s.
   */
  directBlocked(): Promise<boolean>;
  /** Sends the thread to the person's Claude Code and returns the assistant turn. */
  sendTurn(messages: ClaudeCodeTurn[], opts: SendClaudeCodeOpts): Promise<ClaudeCodeReply>;
}

/** Most tool requests of one turn handled at once; the rest wait their turn. A running hand-off counts as one. */
const MAX_CONCURRENT_TOOLS = 6;
const DISCONNECTED = "Claude Code was disconnected, so the turn was stopped.";

/** What the page says to the model that asked for a hand-off that could not finish. */
const HAND_OFF_FAILED_NEXT =
  "Do not call this hand-off again with the same Agent. Tell the person which Agent could not take the work, and why.";

interface BridgeTurnOut {
  content: string;
  model: string;
  sessionId: string | undefined;
  budgetSpent?: boolean;
  codeMode?: "files-only";
  access?: "computer";
  project?: string;
}

/** The bridge events only a code turn sends. */
const CODE_BRIDGE_EVENTS = new Set(["activity", "tool_error", "files_changed", "approval_request", "approval_done"]);

interface SseEvent {
  event: string;
  data: unknown;
}

async function* readBridgeSse(res: Response, stop?: AbortSignal): AsyncGenerator<SseEvent> {
  const reader = res.body?.getReader();
  if (!reader) throw new ClaudeCodeBridgeError(502, "The bridge returned an unexpected answer.");
  // `stop` ends the read from outside (a tool answer failed while the loop waits for the next event): cancelling the reader ends the loop quietly.
  const onStop = () => void reader.cancel().catch(() => undefined);
  if (stop?.aborted) onStop();
  else stop?.addEventListener("abort", onStop, { once: true });
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buf += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        let event = "message";
        const data: string[] = [];
        for (const raw of part.split("\n")) {
          const line = raw.replace(/\r$/, "");
          if (!line || line.startsWith(":")) continue;
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        }
        if (data.length === 0) continue;
        let parsed: unknown = {};
        try {
          parsed = JSON.parse(data.join("\n"));
        } catch {
          parsed = { message: data.join("\n") };
        }
        yield { event, data: parsed };
      }
      if (done) break;
    }
  } finally {
    stop?.removeEventListener("abort", onStop);
    // The caller stopped reading (an error mid-turn): close the stream so the bridge sees the page leave and ends the turn.
    reader.cancel().catch(() => undefined);
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function toolAnswerOk(result: string): boolean {
  try {
    const v = JSON.parse(result) as unknown;
    return !(v && typeof v === "object" && "error" in v);
  } catch {
    return true;
  }
}

/** GilbPlatform's own ceiling, inside a tool answer's JSON. Not the bridge's longer sentence. */
const PLATFORM_BUDGET_ERROR = "this turn has used all its tool rounds";

function platformBudgetSpent(result: string): boolean {
  try {
    const v = JSON.parse(result) as unknown;
    return !!v && typeof v === "object" && (v as { error?: unknown }).error === PLATFORM_BUDGET_ERROR;
  } catch {
    return false;
  }
}

function transcriptOf(turns: ClaudeCodeTurn[]): string {
  return turns.map((t) => `${t.role === "user" ? "Person" : "Agent"}: ${t.content}`).join("\n\n");
}

/** A fresh id for one person turn. GilbPlatform keeps the turn's limits (rounds, mint caps, open hand-offs) under it. */
function newTurnId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function defaultErrorText(status: number, body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as { message?: unknown; error?: unknown };
    for (const v of [b.message, b.error]) if (typeof v === "string" && /\s/.test(v.trim())) return v;
  }
  return `${fallback} (HTTP ${status}).`;
}

/**
 * Builds the page-side client for ONE signed-in principal. Make a new one when the principal changes.
 *
 * A hand-off the model asks for (run_named_role, ask_agent_concept) comes back from GilbPlatform as a `hop`: the Agent's
 * composed prompt and its tools. It runs here as a nested turn on the SAME bridge, so on the person's own Claude Code and
 * subscription; its tool calls go to GilbPlatform with the hop's id; its final text is the hand-off's answer. GilbPlatform
 * makes no model call for it, and no key of anyone is involved.
 */
export function createClaudeCodeClient(config: ClaudeCodeClientConfig): ClaudeCodeClient {
  const { principal } = config;
  if (typeof config.bridgeUrl !== "string" || config.bridgeUrl === "") {
    throw new Error("createClaudeCodeClient: bridgeUrl is required (the URL the bridge listens on, on the person's own computer).");
  }
  const bridgeUrl = config.bridgeUrl.replace(/\/+$/, "");
  const platform = config.platformOrigin.replace(/\/+$/, "");
  const contextUrl = `${platform}/base/ai/claude-code/context`;
  const toolUrl = `${platform}/base/ai/claude-code/tool`;
  const ns = config.storageNamespace ?? "gilb";
  const errorText = config.errorText ?? defaultErrorText;
  /** SHA-256 hex of the principal, so the bridge can tell pairings apart without learning who signed in. "" when unavailable. */
  async function hashPrincipal(p: string): Promise<string> {
    try {
      const d = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(p));
      return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return "";
    }
  }
  const store = (): StorageLike | null => {
    try {
      return config.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    } catch {
      return null;
    }
  };
  const storageKey = `${ns}.claude-code-bridge.${principal}`;
  const sessionPrefix = `${ns}.claude-code-session.${principal}.`;

  const notRunning = () => {
    const cmd = typeof config.startCommand === "function" ? config.startCommand() : config.startCommand;
    return cmd
      ? `The Claude Code bridge is not reachable on this computer. Start it in Terminal with: ${cmd}`
      : "The Claude Code bridge is not reachable on this computer. Start it with the command shown under Connect > Claude Code.";
  };

  // ---- The transport: ONE function every bridge call goes through, with two routes. -------------------------------------
  const bridgeOrigin = new URL(bridgeUrl).origin;
  const RELAY_ALLOWED_HEADERS = ["content-type", "x-bridge-secret", "accept"];
  const RELAY_HEAD_TIMEOUT_MS = 15000;
  /** The folder dialog may stay open 5 minutes on the bridge's side; the relay waits a little longer. */
  const CHOOSE_HEAD_TIMEOUT_MS = 5 * 60 * 1000 + 30000;
  const RELAY_READY_TIMEOUT_MS = 10000;
  const RELAY_POLL_MS = 1000;
  const RELAY_CLOSED = "The Claude Code bridge window was closed. Open it again to go on.";
  type RelayState = "closed" | "opening" | "open";
  interface RelayedRequest {
    /** Status 0 on the way in: before the head, a failure rejects; after it, the stream errors. */
    onHead(status: number, contentType: string): void;
    onChunk(text: string): void;
    onEnd(): void;
    onRes(status: number, contentType: string, body: string): void;
    fail(err: Error): void;
  }
  let relayWindow: Window | null = null;
  let relayStateNow: RelayState = "closed";
  const relayListeners = new Set<(s: RelayState) => void>();
  const relayed = new Map<string, RelayedRequest>();
  let relayCounter = 0;
  let relayPoll: ReturnType<typeof setInterval> | null = null;
  let openWaiting: ((ok: boolean) => void)[] = [];
  let openTimer: ReturnType<typeof setTimeout> | null = null;

  function setRelayState(next: RelayState) {
    if (relayStateNow === next) return;
    relayStateNow = next;
    for (const cb of [...relayListeners]) {
      try {
        cb(next);
      } catch {
        /* a listener's error is its own */
      }
    }
  }
  function postRelay(msg: Record<string, unknown>) {
    try {
      relayWindow?.postMessage(msg, bridgeOrigin);
    } catch {
      /* the window is gone; the poll will notice */
    }
  }
  /** The window is gone (closed, or closeRelay): forget it and fail every request still going through it. */
  function relayGone() {
    if (relayPoll !== null) clearInterval(relayPoll);
    relayPoll = null;
    if (openTimer !== null) clearTimeout(openTimer);
    openTimer = null;
    globalThis.removeEventListener?.("message", onRelayMessage as EventListener);
    relayWindow = null;
    const waiting = openWaiting;
    openWaiting = [];
    const open = [...relayed.values()];
    relayed.clear();
    for (const r of open) r.fail(new ClaudeCodeBridgeError(0, RELAY_CLOSED));
    setRelayState("closed");
    for (const w of waiting) w(false);
  }
  function onRelayMessage(ev: MessageEvent) {
    // Only the window we opened, and only from the bridge's own origin. Anything else is ignored.
    if (relayWindow === null || ev.source !== relayWindow || ev.origin !== bridgeOrigin) return;
    const m = ev.data as Record<string, unknown> | null;
    if (!m || typeof m !== "object" || typeof m.type !== "string") return;
    if (m.type === "gilb-bridge-ready") {
      if (relayStateNow === "opening") {
        if (openTimer !== null) clearTimeout(openTimer);
        openTimer = null;
        setRelayState("open");
        const waiting = openWaiting;
        openWaiting = [];
        for (const w of waiting) w(true);
      }
      return;
    }
    if (typeof m.id !== "string") return;
    const r = relayed.get(m.id);
    if (!r) return;
    if (m.type === "gilb-bridge-head") r.onHead(Number(m.status), typeof m.contentType === "string" ? m.contentType : "");
    else if (m.type === "gilb-bridge-chunk") r.onChunk(typeof m.chunk === "string" ? m.chunk : "");
    else if (m.type === "gilb-bridge-end") r.onEnd();
    else if (m.type === "gilb-bridge-res") {
      const h = m.headers && typeof m.headers === "object" ? (m.headers as Record<string, unknown>) : {};
      r.onRes(Number(m.status), typeof h["content-type"] === "string" ? h["content-type"] : "", typeof m.body === "string" ? m.body : "");
    } else if (m.type === "gilb-bridge-err") {
      r.fail(m.message === "aborted" ? new DOMException("aborted", "AbortError") : new ClaudeCodeBridgeError(0, notRunning()));
    }
  }

  /** One request through the relay window. Resolves at the head with a Response whose body is fed by the window's messages. */
  function relayRequest(path: string, init: RequestInit, headTimeoutMs: number = RELAY_HEAD_TIMEOUT_MS): Promise<Response> {
    const signal = init.signal ?? undefined;
    if (signal?.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
    const headers: Record<string, string> = {};
    const given = (init.headers ?? {}) as Record<string, string>;
    for (const k of Object.keys(given)) {
      const name = k.toLowerCase();
      if (RELAY_ALLOWED_HEADERS.includes(name) && typeof given[k] === "string") headers[name] = given[k];
    }
    const id = `r${++relayCounter}`;
    return new Promise<Response>((resolve, reject) => {
      let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
      let headSeen = false;
      const enc = new TextEncoder();
      const finish = () => {
        relayed.delete(id);
        clearTimeout(headTimer);
        signal?.removeEventListener("abort", onAbort);
      };
      const abortRemote = () => {
        if (relayed.has(id)) postRelay({ type: "gilb-bridge-abort", id });
      };
      const fail = (err: Error) => {
        finish();
        if (!headSeen) reject(err);
        else
          try {
            controller?.error(err);
          } catch {
            /* already closed */
          }
      };
      const onAbort = () => {
        abortRemote();
        fail(signal?.reason instanceof Error ? signal.reason : new DOMException("aborted", "AbortError"));
      };
      const headTimer = setTimeout(() => {
        abortRemote();
        fail(new ClaudeCodeBridgeError(0, notRunning()));
      }, headTimeoutMs);
      signal?.addEventListener("abort", onAbort, { once: true });
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
        cancel() {
          // The reader stopped (readBridgeSse does on Stop): tell the window to drop the request.
          abortRemote();
          finish();
        },
      });
      relayed.set(id, {
        onHead(status, contentType) {
          if (headSeen) return;
          clearTimeout(headTimer);
          try {
            const nullBody = status === 204 || status === 205 || status === 304;
            resolve(new Response(nullBody ? null : stream, { status, headers: contentType ? { "content-type": contentType } : {} }));
            headSeen = true;
            if (nullBody) controller?.close();
          } catch {
            fail(new ClaudeCodeBridgeError(0, notRunning()));
          }
        },
        onChunk(text) {
          if (!headSeen) return;
          try {
            controller?.enqueue(enc.encode(text));
          } catch {
            /* cancelled */
          }
        },
        onEnd() {
          if (!headSeen) return;
          finish();
          try {
            controller?.close();
          } catch {
            /* cancelled */
          }
        },
        onRes(_status, _contentType, body) {
          if (!headSeen) return;
          finish();
          try {
            if (body) controller?.enqueue(enc.encode(body));
            controller?.close();
          } catch {
            /* cancelled */
          }
        },
        fail,
      });
      postRelay({ type: "gilb-bridge-req", id, path, method: init.method ?? "GET", headers, ...(typeof init.body === "string" ? { body: init.body } : {}) });
    });
  }

  /**
   * THE one way to reach the bridge. The relay window open: the request goes through it, never also direct. Otherwise it is a
   * direct fetch. `keepalive` has no meaning through the relay (the window sends it), so it is dropped there.
   */
  function bridgeRequest(path: string, init: RequestInit, headTimeoutMs?: number): Promise<Response> {
    if (relayStateNow === "open" && relayWindow !== null) return relayRequest(path, init, headTimeoutMs);
    return fetch(`${bridgeUrl}${path}`, init);
  }

  async function bridgeFetch(path: string, init: RequestInit, headTimeoutMs?: number): Promise<Response> {
    try {
      return await bridgeRequest(path, init, headTimeoutMs);
    } catch (e) {
      if (init.signal?.aborted) throw new ClaudeCodeBridgeError(499, DISCONNECTED);
      if (e instanceof ClaudeCodeBridgeError) throw e;
      throw new ClaudeCodeBridgeError(0, notRunning());
    }
  }

  async function postPlatform(url: string, payload: unknown, sig?: AbortSignal): Promise<Response> {
    const send = async () =>
      fetch(url, {
        ...(sig ? { signal: sig } : {}),
        method: "POST",
        headers: {
          ...(await config.getAuthHeaders("POST", url)),
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    let res = await send();
    if (res.status === 401) {
      config.invalidateAuth?.();
      res = await send();
    }
    if (res.status === 401) {
      config.invalidateAuth?.();
      throw new ClaudeCodePlatformError(401, "Your session needs to re-authorize — try again.");
    }
    return res;
  }

  /** The bridge requests of turns that are running now, so Disconnect can stop them at once. */
  const inflight = new Set<AbortController>();

  async function runTurn(messages: ClaudeCodeTurn[], opts: SendClaudeCodeOpts, signal: AbortSignal): Promise<ClaudeCodeReply> {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") throw new ClaudeCodePlatformError(400, "Write a message first.");
    const conn = client.load();
    if (!conn) throw new ClaudeCodeBridgeError(401, "Claude Code is not connected. Press Connect.");

    const vaults = (opts.contentVaultIds ?? []).map((id) => id.trim()).filter((id) => id.startsWith("http"));
    const turnFields: Record<string, unknown> = { userText: last.content, turnId: newTurnId() };
    if (vaults.length > 0) turnFields.contentVaultIds = vaults;
    const agentEntry = opts.agentEntry?.trim();
    if (agentEntry) turnFields.agentEntry = agentEntry;
    else if (opts.agent?.trim()) turnFields.agent = opts.agent.trim();

    /** The bridge does not know our secret any more (it was reset, expired the pairing, or another tab disconnected): forget it, and say so. */
    const bridgeForgotUs = (): ClaudeCodeBridgeError => {
      try {
        store()?.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      return new ClaudeCodeBridgeError(401, "The bridge no longer knows this pairing. Press Connect and enter its new code.");
    };

    /** Set when this person turn, or a hand-off inside it, ran out of tool rounds. The reply carries it. */
    let turnBudgetSpent = false;

    /**
     * Runs ONE turn on the bridge (the person's turn, or a hand-off's nested turn when `parentTurnId` is set) and relays
     * its tool calls to `onTool` until it ends. The same loop for both, so a nested turn is exactly a turn.
     */
    async function streamBridgeTurn(
      body: Record<string, unknown>,
      onTool: (name: string, args: string, bridgeTurnId: string, sig: AbortSignal, callId: string) => Promise<{ result: string; isError: boolean }>,
      announceStart: boolean,
      onStatus?: (data: { apiKeySource: string | null; model: string }) => void,
      turnSignal: AbortSignal = signal,
    ): Promise<BridgeTurnOut> {
      const res = await bridgeFetch("/v1/turn", {
        signal: turnSignal,
        method: "POST",
        headers: { "content-type": "application/json", "x-bridge-secret": conn!.secret },
        body: JSON.stringify(body),
      });
      if (res.status === 401) throw bridgeForgotUs();
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new ClaudeCodeBridgeError(res.status, typeof err?.error === "string" ? err.error : "The bridge could not run the turn.");
      }
      let turnId = "";
      let out: BridgeTurnOut | null = null;
      let streamError: string | null = null;
      let spent = false;

      // Tool requests are handled side by side, so one long call (a hand-off) never holds up the others. At most
      // MAX_CONCURRENT_TOOLS run at once; the rest wait in order. Each is keyed by its request id, as the bridge sent it.
      const stop = new AbortController(); // a failure in a handler, or leaving the turn, ends the read of the stream
      const onTurnLeft = () => stop.abort();
      if (turnSignal.aborted) stop.abort();
      else turnSignal.addEventListener("abort", onTurnLeft, { once: true });
      const open = new Map<string, AbortController>();
      const waiting: (() => void)[] = [];
      const handlers: Promise<void>[] = [];
      let running = 0;
      let fatal: unknown = null;
      const failTurn = (e: unknown) => {
        if (fatal === null) fatal = e;
        stop.abort();
      };
      const abortAll = () => {
        for (const c of open.values()) c.abort();
      };
      const pump = () => {
        while (running < MAX_CONCURRENT_TOOLS && waiting.length > 0) waiting.shift()!();
      };
      const handle = (id: string, name: string, args: string, forTurn: string) => {
        const ctl = new AbortController();
        open.set(id, ctl);
        const onLeave = () => ctl.abort();
        if (turnSignal.aborted) ctl.abort();
        else turnSignal.addEventListener("abort", onLeave, { once: true });
        handlers.push(
          new Promise<void>((started) => {
            waiting.push(started);
            pump();
          }).then(async () => {
            if (ctl.signal.aborted) {
              open.delete(id);
              turnSignal.removeEventListener("abort", onLeave);
              return;
            }
            running += 1;
            try {
              const answer = await onTool(name, args, forTurn, ctl.signal, id);
              // Cancelled (the bridge's call was abandoned) or the turn is over: nothing to answer.
              if (ctl.signal.aborted) return;
              const back = await bridgeFetch("/v1/tool-result", {
                signal: ctl.signal,
                method: "POST",
                headers: { "content-type": "application/json", "x-bridge-secret": conn!.secret },
                body: JSON.stringify({ turnId: forTurn, id, result: answer.result, isError: answer.isError }),
              });
              // The bridge did not take the answer (restarted, disconnected, or the turn is gone): it would wait for it
              // for 15 minutes. Stop here instead; leaving the stream (see readBridgeSse) ends the turn on the bridge.
              if (back.status === 401) throw bridgeForgotUs();
              if (!back.ok) throw new ClaudeCodeBridgeError(back.status, "The bridge did not take the tool's answer, so the turn was stopped. Try again.");
            } catch (err) {
              if (!ctl.signal.aborted) failTurn(err);
            } finally {
              running -= 1;
              open.delete(id);
              turnSignal.removeEventListener("abort", onLeave);
              pump();
            }
          }),
        );
      };

      /** The bridge asks whether a write or command may go ahead: the page's handler answers, off the read loop. */
      // Each open question can be let go: when the bridge says it is done (answered, timed out, the turn ended) or the turn ends,
      // the wait for the app's handler stops (as "no") and nothing is posted for it, so a handler that never settles cannot hold the turn.
      const questions = new Map<string, { done: boolean; release: () => void }>();
      const closeQuestion = (id: string) => {
        const q = questions.get(id);
        if (!q) return;
        q.done = true;
        q.release();
      };
      const askPerson = (req: ApprovalRequest) => {
        const q = { done: false, release: () => {} };
        const released = new Promise<boolean>((resolve) => {
          q.release = () => resolve(false);
        });
        questions.set(req.id, q);
        handlers.push(
          (async () => {
            let allow = false;
            try {
              allow = (await Promise.race([Promise.resolve(opts.onApproval?.(req)), released])) === true;
            } catch {
              allow = false;
            }
            if (q.done || stop.signal.aborted) return;
            try {
              const back = await bridgeFetch("/v1/approval", {
                signal: stop.signal,
                method: "POST",
                headers: { "content-type": "application/json", "x-bridge-secret": conn!.secret },
                body: JSON.stringify({ turnId, id: req.id, allow }),
              });
              if (back.status === 401) throw bridgeForgotUs();
              // 404 or 409: the question timed out or was answered already; nothing more to do.
            } catch (err) {
              if (!stop.signal.aborted) failTurn(err);
            }
          })(),
        );
      };

      let readErr: unknown = null;
      try {
        for await (const ev of readBridgeSse(res, stop.signal)) {
          const data = (ev.data ?? {}) as Record<string, unknown>;
          if (ev.event === "start") {
            turnId = typeof data.turnId === "string" ? data.turnId : "";
            if (announceStart) opts.onEvent?.({ event: "start", data: { ok: true } });
          } else if (ev.event === "status") {
            onStatus?.({ apiKeySource: typeof data.apiKeySource === "string" ? data.apiKeySource : null, model: typeof data.model === "string" ? data.model : "" });
          } else if (ev.event === "tool_request") {
            handle(String(data.id ?? ""), String(data.name ?? "tool"), typeof data.arguments === "string" ? data.arguments : "{}", turnId);
          } else if (ev.event === "tool_cancelled") {
            // The bridge's call for this id was abandoned (its Claude Code gave up on it): stop working on it, answer nothing.
            open.get(String(data.id ?? ""))?.abort();
          } else if (ev.event === "budget_spent") {
            spent = true;
            turnBudgetSpent = true;
          } else if (ev.event === "message") {
            if (data.budgetSpent === true) {
              spent = true;
              turnBudgetSpent = true;
            }
            const content = typeof data.content === "string" ? data.content.trim() : "";
            if (content) {
              out = {
                content,
                model: typeof data.model === "string" ? data.model : "",
                sessionId: typeof data.sessionId === "string" ? data.sessionId : undefined,
                ...(data.codeMode === "files-only" ? { codeMode: "files-only" as const } : {}),
                ...(data.access === "computer" ? { access: "computer" as const } : {}),
                ...(typeof data.project === "string" && data.project ? { project: data.project } : {}),
              };
            }
          } else if (ev.event === "error") {
            streamError = typeof data.message === "string" ? data.message : "Claude Code could not answer.";
          } else if (announceStart && CODE_BRIDGE_EVENTS.has(ev.event)) {
            const ce = codeStreamEvent(ev.event, data);
            if (ce) {
              opts.onEvent?.(ce);
              if (ce.event === "approval_request") askPerson(ce.data);
              else if (ce.event === "approval_done") closeQuestion(ce.data.id);
            }
          }
        }
      } catch (err) {
        readErr = err;
      }
      for (const id of [...questions.keys()]) closeQuestion(id); // the stream ended: no question is still open
      // The turn is over. A turn that failed or was left stops its handlers and drops their answers; one that ended with
      // its answer waits for the handlers still running, so an answer the bridge cannot take is still reported.
      if (readErr || fatal !== null || streamError) abortAll();
      await Promise.allSettled(handlers);
      turnSignal.removeEventListener("abort", onTurnLeft);
      if (fatal !== null) throw fatal;
      // Disconnect (or a cancelled hand-off) ended the read: say so, not "the bridge returned something unexpected".
      if (turnSignal.aborted) throw new ClaudeCodeBridgeError(499, DISCONNECTED);
      if (readErr) throw readErr;
      if (streamError) throw new ClaudeCodeBridgeError(502, streamError);
      if (!out) throw new ClaudeCodeBridgeError(502, "Claude Code returned no answer.");
      // The person's turn also picks up a hand-off, or a platform tool answer, that spent the budget.
      if (spent || (announceStart && turnBudgetSpent)) out.budgetSpent = true;
      return out;
    }

    // 1. What makes this the platform's agent: the composed prompt and the tools.
    const ctxRes = await postPlatform(contextUrl, turnFields);
    const ctxBody = await readJson(ctxRes);
    if (!ctxRes.ok) {
      const code = ctxBody && typeof ctxBody === "object" ? (ctxBody as { error?: unknown }).error : undefined;
      throw new ClaudeCodePlatformError(
        ctxRes.status,
        errorText(ctxRes.status, ctxBody, "The agent could not answer"),
        typeof code === "string" ? code : undefined,
      );
    }
    const ctx = ctxBody as { system?: unknown; tools?: unknown; standing?: unknown };
    if (typeof ctx.system !== "string" || !Array.isArray(ctx.tools)) {
      throw new ClaudeCodePlatformError(502, "The agent returned an unexpected answer.");
    }
    if (ctx.standing !== undefined && ctx.standing !== null) opts.onEvent?.({ event: "standing", data: ctx.standing });

    /** One tool call of the person's turn (hopId unset) or of a hand-off's nested turn (hopId set), run on GilbPlatform as the person. */
    const callTool = async (
      name: string,
      args: string,
      hopId: string | undefined,
      bridgeTurnId: string,
      sig: AbortSignal,
      callId: string,
    ): Promise<{ result: string; isError: boolean }> => {
      let result: string;
      let isError = false;
      try {
        const tr = await postPlatform(toolUrl, { ...turnFields, name, arguments: args, ...(hopId ? { hop: { id: hopId } } : {}) }, sig);
        const body = await readJson(tr);
        if (!tr.ok) {
          isError = true;
          result = JSON.stringify({ error: errorText(tr.status, body, `${name} could not run`) });
        } else {
          const b = body && typeof body === "object" ? (body as { result?: unknown; hop?: unknown }) : {};
          if (b.hop && typeof b.hop === "object" && !hopId) {
            // A hand-off: GilbPlatform prepared it; the model runs here, on the person's own Claude Code.
            const done = await runHop(b.hop as ClaudeCodeHop, bridgeTurnId, sig, callId);
            result = done.result;
            isError = done.isError;
          } else {
            const r = b.result;
            result = typeof r === "string" ? r : JSON.stringify({ error: `${name} returned an unexpected answer.` });
            isError = !toolAnswerOk(result);
          }
        }
      } catch (err) {
        isError = true;
        result = JSON.stringify({ error: err instanceof Error ? err.message : `${name} could not run` });
      }
      if (platformBudgetSpent(result)) turnBudgetSpent = true;
      // Top-level answers only. If this turn was already left, take nothing: the answer is not posted, so the text would be lost.
      if (!hopId && !sig.aborted) {
        const slipped = opts.takeSlipped?.() ?? [];
        if (slipped.length > 0) {
          result = result + slippedSuffix(slipped);
          opts.onEvent?.({ event: "slipped", data: { ids: slipped.map((s) => s.id) } });
        }
      }
      opts.onEvent?.({ event: "tool", data: { name, ok: !isError } });
      return { result, isError };
    };

    /** Runs a hand-off as a nested turn and answers the tool call that asked for it. */
    const runHop = async (hop: ClaudeCodeHop, parentTurnId: string, sig: AbortSignal, callId: string): Promise<{ result: string; isError: boolean }> => {
      if (typeof hop.id !== "string" || typeof hop.system !== "string" || typeof hop.task !== "string" || !Array.isArray(hop.tools)) {
        return { result: JSON.stringify({ error: "The hand-off returned an unexpected answer.", next: HAND_OFF_FAILED_NEXT }), isError: true };
      }
      // However the nested turn ends (or never starts), its id stops working on GilbPlatform once its answer goes back to the asking turn.
      const closeHop = async () => {
        try {
          await postPlatform(toolUrl, { ...turnFields, name: "hop_done", arguments: "{}", hop: { id: hop.id, done: true } });
        } catch {
          // Best effort: an id that is never closed still expires on the server.
        }
      };
      // A hand-off is a nested turn OF a running turn. Without that turn's id it would open as a turn of its own, linked to nothing.
      if (!parentTurnId) {
        await closeHop();
        return { result: JSON.stringify({ error: "The hand-off could not be linked to its turn.", next: HAND_OFF_FAILED_NEXT }), isError: true };
      }
      try {
        const nestedBody: Record<string, unknown> = { prompt: hop.task, system: hop.system, tools: hop.tools, parentTurnId };
        if (typeof callId === "string" && callId !== "") nestedBody.parentCallId = callId;
        const done = await streamBridgeTurn(
          nestedBody,
          (name, args, _turn, toolSig, nestedCallId) => callTool(name, args, hop.id, "", toolSig, nestedCallId),
          false,
          (d) => opts.onBridgeStatus?.({ nested: true, ...d }),
          sig,
        );
        await closeHop();
        return { result: JSON.stringify({ ...hop.answer, content: done.content }), isError: false };
      } catch (err) {
        await closeHop();
        return {
          result: JSON.stringify({
            error: "the Agent's run failed",
            role: hop.role,
            reason: err instanceof Error ? err.message : "the hand-off could not run",
            next: HAND_OFF_FAILED_NEXT,
          }),
          isError: true,
        };
      }
    };

    // 2. The turn, on the person's computer. A session is reused only when it already covers the thread before this message.
    // A code session lives in the bridge's code folder, a chat session in its empty one: they are never resumed into each other.
    const codeMode = opts.mode === "code";
    const project = codeMode && typeof opts.project === "string" && opts.project ? opts.project : "";
    // Each component is encoded, so project "alpha" with thread "notes" can never be the key of no project with thread "alpha/notes".
    const skey = codeMode ? `${sessionPrefix}mode-code/${project ? `${encodeURIComponent(project)}/` : ""}${encodeURIComponent(opts.thread)}` : `${sessionPrefix}${opts.thread}`;
    let sessionId: string | undefined;
    try {
      const kept = JSON.parse(store()?.getItem(skey) ?? "null") as { sessionId?: string; covers?: number } | null;
      if (kept && typeof kept.sessionId === "string" && kept.covers === messages.length - 1) sessionId = kept.sessionId;
    } catch {
      sessionId = undefined;
    }
    const earlier = messages.slice(0, -1);
    const out = await streamBridgeTurn(
      {
        prompt: last.content,
        history: earlier.length > 0 ? transcriptOf(earlier) : "",
        system: ctx.system,
        tools: ctx.tools,
        ...(sessionId ? { sessionId } : {}),
        ...(codeMode ? { mode: "code", approval: opts.approval === "each-write" ? "each-write" : "session", ...(project ? { project } : {}) } : {}),
      },
      (name, args, bridgeTurnId, toolSig, callId) => callTool(name, args, undefined, bridgeTurnId, toolSig, callId),
      true,
      (d) => opts.onBridgeStatus?.({ nested: false, ...d }),
    );
    if (out.sessionId) {
      try {
        store()?.setItem(skey, JSON.stringify({ sessionId: out.sessionId, covers: messages.length + 1 }));
      } catch {
        /* quota */
      }
    }
    return {
      role: "assistant",
      content: out.content,
      model: out.model,
      payer: "person-claude-code",
      ...(out.budgetSpent ? { budgetSpent: true } : {}),
      ...(out.codeMode ? { codeMode: out.codeMode } : {}),
      ...(out.access ? { access: out.access } : {}),
      ...(out.project ? { project: out.project } : {}),
    };
  }

  const client: ClaudeCodeClient = {
    principal,
    bridgeUrl,

    async probe() {
      try {
        const res = await bridgeRequest("/v1/hello", { method: "GET" });
        if (!res.ok) return false;
        const body = (await res.json()) as { bridge?: unknown };
        return body.bridge === BRIDGE_NAME;
      } catch {
        return false;
      }
    },

    async bridgeInfo() {
      try {
        const res = await bridgeRequest("/v1/hello", { method: "GET" });
        if (!res.ok) return { reachable: false, build: null, codeTurns: false, workspace: false, codeMode: null, access: null };
        const body = (await res.json()) as { bridge?: unknown; build?: unknown; codeTurns?: unknown; workspace?: unknown; codeMode?: unknown; access?: unknown };
        return {
          reachable: body.bridge === BRIDGE_NAME,
          build: typeof body.build === "string" ? body.build : null,
          // An older bridge sends neither.
          codeTurns: body.codeTurns === true,
          workspace: body.workspace === true,
          codeMode: body.codeMode === "full" || body.codeMode === "files-only" ? body.codeMode : null,
          access: body.access === "folder" || body.access === "computer" ? body.access : null,
        };
      } catch {
        return { reachable: false, build: null, codeTurns: false, workspace: false, codeMode: null, access: null };
      }
    },

    async workspaceInfo() {
      const conn = client.load();
      if (!conn) return null;
      const res = await bridgeFetch("/v1/workspace", {
        method: "POST",
        headers: { "content-type": "application/json", "x-bridge-secret": conn.secret },
        body: "{}",
      });
      if (res.status === 404) return null;
      if (res.status === 401) throw new ClaudeCodeBridgeError(401, "The bridge no longer knows this pairing. Press Connect and enter its new code.");
      if (!res.ok) throw new ClaudeCodeBridgeError(res.status, "The bridge could not tell its code folder.");
      const body = (await res.json().catch(() => null)) as { name?: unknown; path?: unknown } | null;
      return body && typeof body.name === "string" && typeof body.path === "string" ? { name: body.name, path: body.path } : null;
    },

    async chooseWorkspace(suggest) {
      const conn = client.load();
      if (!conn) throw new ClaudeCodeBridgeError(401, "Connect to Claude Code first.");
      // The bridge answers only when the person closes its dialog (up to 5 minutes); a direct fetch has no timeout of its own, and the relay's wait is longer here.
      const res = await bridgeFetch(
        "/v1/workspace/choose",
        { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": conn.secret }, body: JSON.stringify(suggest === undefined ? {} : { suggest }) },
        CHOOSE_HEAD_TIMEOUT_MS,
      );
      const body = (await res.json().catch(() => null)) as { chosen?: unknown; name?: unknown; path?: unknown; error?: unknown } | null;
      if (!res.ok) throw new ClaudeCodeBridgeError(res.status, typeof body?.error === "string" && body.error ? body.error : "The bridge could not open the folder dialog.");
      if (body?.chosen === false) return { chosen: false };
      if (body?.chosen === true && typeof body.name === "string" && typeof body.path === "string") return { chosen: true, name: body.name, path: body.path };
      throw new ClaudeCodeBridgeError(502, "The bridge returned an unexpected answer.");
    },

    async createWorkspace(name) {
      const conn = client.load();
      if (!conn) throw new ClaudeCodeBridgeError(401, "Connect to Claude Code first.");
      const res = await bridgeFetch("/v1/workspace/create", {
        method: "POST",
        headers: { "content-type": "application/json", "x-bridge-secret": conn.secret },
        body: JSON.stringify({ name }),
      });
      const body = (await res.json().catch(() => null)) as { name?: unknown; path?: unknown; error?: unknown } | null;
      if (!res.ok) throw new ClaudeCodeBridgeError(res.status, typeof body?.error === "string" && body.error ? body.error : "The bridge could not make that folder.");
      if (body && typeof body.name === "string" && typeof body.path === "string") return { name: body.name, path: body.path };
      throw new ClaudeCodeBridgeError(502, "The bridge returned an unexpected answer.");
    },

    async listProjects() {
      const conn = client.load();
      if (!conn) throw new ClaudeCodeBridgeError(401, "Connect to Claude Code first.");
      const res = await bridgeFetch("/v1/projects", { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": conn.secret }, body: "{}" });
      const body = (await res.json().catch(() => null)) as { projects?: unknown; error?: unknown } | null;
      if (!res.ok) throw new ClaudeCodeBridgeError(res.status, typeof body?.error === "string" && body.error ? body.error : "The bridge could not list the projects.");
      if (!body || !Array.isArray(body.projects)) throw new ClaudeCodeBridgeError(502, "The bridge returned an unexpected answer.");
      return (body.projects as Array<{ name?: unknown; modified?: unknown }>)
        .filter((p) => p && typeof p.name === "string" && p.name !== "")
        .map((p) => ({ name: p.name as string, modified: typeof p.modified === "string" ? p.modified : "" }));
    },

    async createProject(name) {
      const conn = client.load();
      if (!conn) throw new ClaudeCodeBridgeError(401, "Connect to Claude Code first.");
      const res = await bridgeFetch("/v1/projects/create", { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": conn.secret }, body: JSON.stringify({ name }) });
      const body = (await res.json().catch(() => null)) as { name?: unknown; error?: unknown } | null;
      if (!res.ok) throw new ClaudeCodeBridgeError(res.status, typeof body?.error === "string" && body.error ? body.error : "The bridge could not make that project.");
      if (body && typeof body.name === "string") return { name: body.name };
      throw new ClaudeCodeBridgeError(502, "The bridge returned an unexpected answer.");
    },

    async requestSecret(code) {
      const principalHash = await hashPrincipal(principal);
      const res = await bridgeFetch("/v1/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(principalHash ? { code: code.trim(), principalHash } : { code: code.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { secret?: unknown; error?: unknown } | null;
      if (!res.ok || !body || typeof body.secret !== "string" || !body.secret) {
        throw new ClaudeCodeBridgeError(
          res.status,
          typeof body?.error === "string" && body.error ? body.error : "The bridge did not accept that code.",
        );
      }
      return body.secret;
    },

    save(secret) {
      const stored: ClaudeCodeConnection = { provider: CLAUDE_CODE_PROVIDER, secret, connected_at: Date.now() };
      try {
        store()?.setItem(storageKey, JSON.stringify(stored));
      } catch {
        /* quota — the caller still has `stored` */
      }
      return stored;
    },

    async pair(code) {
      const secret = await client.requestSecret(code);
      const stored = client.save(secret);
      return { provider: stored.provider, connected: true, connected_at: stored.connected_at };
    },

    load() {
      if (!principal) return null;
      try {
        const raw = store()?.getItem(storageKey);
        if (!raw) return null;
        const row = JSON.parse(raw) as Record<string, unknown>;
        if (!row || typeof row.secret !== "string" || !row.secret) return null;
        return {
          provider: CLAUDE_CODE_PROVIDER,
          secret: row.secret,
          connected_at: typeof row.connected_at === "number" ? row.connected_at : 0,
        };
      } catch {
        return null;
      }
    },

    readConnected() {
      const stored = client.load();
      return stored ? { provider: CLAUDE_CODE_PROVIDER, connected: true, connected_at: stored.connected_at } : null;
    },

    disconnect() {
      for (const ctl of inflight) ctl.abort();
      const stored = client.load();
      try {
        const s = store();
        if (s) {
          s.removeItem(storageKey);
          for (let i = s.length - 1; i >= 0; i--) {
            const k = s.key(i);
            if (k && k.startsWith(sessionPrefix)) s.removeItem(k);
          }
        }
      } catch {
        /* ignore */
      }
      if (stored) {
        // Direct: `keepalive`, so it is still sent if the page unloads right after Disconnect. Through the relay window there
        // is no keepalive (the window sends it, and it may already be unreachable): it is sent and any failure is ignored.
        void bridgeRequest("/v1/unpair", {
          method: "POST",
          headers: { "x-bridge-secret": stored.secret },
          keepalive: true,
        }).then((r) => void r.body?.cancel().catch(() => undefined), () => undefined);
      }
    },

    openRelay() {
      // Already open: focus it. (Opening the same named window again would reload it and cut requests in flight.)
      if (relayStateNow === "open" && relayWindow && !relayWindow.closed) {
        try {
          relayWindow.focus();
        } catch {
          /* ignore */
        }
        return Promise.resolve(true);
      }
      // window.open FIRST, with nothing awaited before it: a popup blocker only allows it inside the click.
      const win = typeof window !== "undefined" ? window.open(`${bridgeOrigin}/relay`, "gilb-claude-code-bridge", "popup,width=460,height=240") : null;
      if (!win) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        if (relayWindow !== null && relayWindow !== win) relayGone();
        openWaiting.push(resolve);
        if (relayWindow === win && relayStateNow === "opening") return; // the same window, still waiting
        relayWindow = win;
        globalThis.addEventListener?.("message", onRelayMessage as EventListener);
        setRelayState("opening");
        if (relayPoll === null) {
          relayPoll = setInterval(() => {
            if (relayWindow === null || relayWindow.closed) relayGone();
          }, RELAY_POLL_MS);
        }
        if (openTimer !== null) clearTimeout(openTimer);
        openTimer = setTimeout(() => {
          // Nothing said ready (an older bridge serves a 404 page here): close the window and report it.
          const w = relayWindow;
          try {
            w?.close();
          } catch {
            /* ignore */
          }
          relayGone();
        }, RELAY_READY_TIMEOUT_MS);
      });
    },

    relayState() {
      return relayStateNow;
    },

    onRelayChange(cb) {
      relayListeners.add(cb);
      return () => void relayListeners.delete(cb);
    },

    closeRelay() {
      const w = relayWindow;
      if (w === null) return;
      try {
        w.close();
      } catch {
        /* ignore */
      }
      relayGone();
    },

    async directBlocked() {
      if (relayStateNow === "open") return false;
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      try {
        const r = await bridgeRequest("/v1/hello", { method: "GET", signal: ctl.signal });
        void r.body?.cancel().catch(() => undefined);
        return false;
      } catch (e) {
        return e instanceof TypeError;
      } finally {
        clearTimeout(t);
      }
    },

    sendTurn(messages, opts) {
      const ctl = new AbortController();
      inflight.add(ctl);
      return runTurn(messages, opts, ctl.signal).finally(() => inflight.delete(ctl));
    },
  };
  return client;
}
