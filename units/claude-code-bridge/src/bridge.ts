#!/usr/bin/env node
// gilb-claude-code bridge (web app <-> Claude Code on this computer).
//
// Lets an app's agent pane (GilbApp, or any app that uses the gilb-claude-code package) talk to the Claude Code that is
// installed and logged in on THIS computer, the way the Claudian plugin does in Obsidian. Start it in a terminal, then
// in the app pick Connect > Claude Code.
//
//   node bridge.mjs [--allow-origin https://your-app.example]
//
// Always on without a window (macOS LaunchAgent, Windows per-user Run entry): `node bridge.mjs --install` (then --code, --status, --uninstall). See README.md.
//
// What it is, and what it is NOT (decided, see README.md):
//   * It runs the person's own official `claude` CLI as a child process (headless, stream-json). It never reads,
//     copies, forwards or shows a Claude login token, and it holds no Anthropic API key.
//   * Billing is the person's Claude subscription, always. ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN and
//     ANTHROPIC_BASE_URL (and the cloud-provider switches) are removed from every child's environment, `claude auth
//     status` must say "logged in with a Claude subscription" before the bridge starts, and each turn is stopped if
//     the CLI reports an API-key source.
//   * It listens on 127.0.0.1 only, answers only the origins on its allow-list (the ones the
//     host app built into this file; others only by an explicit --allow-origin), and needs a pairing secret that is first
//     handed over by a short code printed in this terminal.
//   * GilbPlatform tools reach Claude Code as an MCP server this bridge hosts for the length of one turn. A tool call
//     is relayed to the app's page (which holds the person's DPoP key) and run on GilbPlatform from there, so no
//     GilbPlatform token ever reaches this process.
//   * Claude Code's built-in tools (shell, files, web) are switched off for these turns.
//   * A hand-off to another agent (run_named_role, ask_agent_concept) runs as a NESTED turn of the same kind: the page
//     opens it with `parentTurnId` (and `parentCallId` when it knows which call asked); it gets its own `claude -p` and
//     its own MCP tool set, the same environment stripping, the same subscription check. One level only (a hand-off
//     cannot hand off). Up to MAX_HANDOFFS_AT_ONCE run at once. The turn and its hand-offs share one budget of tool
//     calls (TURN_MAX_TOOL_CALLS) and each hand-off has a time limit (HOP_MAX_MS). The first time that budget is
//     spent, the person's turn gets one `budget_spent` event and its final message carries `budgetSpent: true`.
//
// Zero dependencies. Node 18 or newer.

import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream";
import { spawn, execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import type { AddressInfo } from "node:net";
import type { ChildProcess, ExecFileException } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extractTimeLines } from "@kaigilb/gilbplatformcode-time-line";
import { ALLOWED, ALLOWED_LIST, DOMAIN_CATALOG, NEVER_SETTINGS, applyGrants, createGrantBook, hashOf, macOf, mergeGrant, neverReason, storeFolder, validateRequest, validateSetting } from "./settingGrants.js";
import type { ProjectRef } from "./settingGrants.js";
// Setting grants (0.4.1): the allow-list and its checks are exported so the tests (and the app's tooling) use the very code the bridge runs.
export { ALLOWED, ALLOWED_LIST, DOMAIN_CATALOG, NEVER_SETTINGS, applyGrants, createGrantBook, hashOf, macOf, mergeGrant, neverReason, storeFolder, validateRequest, validateSetting };

/** What the code reads from a caught error (Node errors carry `code`; our own body errors carry `status`). */
type ErrLike = { code?: string; message?: string; status?: number };
/** A tool the app page offers for one turn. */
interface ToolSpec { name: string; description?: string; inputSchema?: unknown }
/** The answer to one relayed tool call. */
interface ToolResult { text: string; isError: boolean }
interface PendingCall { resolve: (r: ToolResult) => void; reject: (e: unknown) => void; name: string; rpcId: unknown }
/** One issued pairing secret, kept by the hash of the secret. */
interface Pairing { origin: string | null; principalHash: string | null; issued: number; lastUsed: number; saved: number }
/** A row of the pairings file, before it is checked. */
type PairingRow = { hash?: unknown; origin?: unknown; principalHash?: unknown; issued?: unknown; lastUsed?: unknown } | null;
/** One chat turn (a hand-off is a nested turn). */
interface Turn {
  id: string;
  /** Pictures of this turn (sent to the child on stdin, never logged); empty for most turns and every hand-off. */
  images: TurnImage[];
  mcpToken: string;
  system: string;
  tools: ToolSpec[];
  model: string;
  /** The effort the person chose ("" when none): passed to the child as --effort. A hand-off inherits its parent's. */
  effort: string;
  /** Code turn only: Opus (or whichever model the turn has) hands coding jobs to the `sonnet-coder` subagent. */
  delegate: boolean;
  /** Code turn only: the page shows an Open button for the built app, so the prompt tells the agent to build (client.preview). */
  preview: boolean;
  pending: Map<string, PendingCall>;
  closed: boolean;
  child: ChildProcess | null;
  send: (event: string, data: unknown) => void;
  parent: Turn | null;
  /** Nested turns this turn has opened. A turn holds at most MAX_HANDOFFS_AT_ONCE. */
  handoffs: Set<Turn>;
  /** The id of the parent's pending relayed call this nested turn answers. "" when the page did not send one. */
  parentCallId: string;
  /** The last ids of calls that were cancelled, so a late result for one is told "ignored", not "no such call". */
  cancelled: Set<string>;
  root: { calls: number };
  /** Set on the person's turn (never on `root`, the shared counter) the first time a relayed call is refused for the budget. */
  budgetSpent: boolean;
  /** A code turn: Claude Code may read, edit and run commands inside the workspace folder. */
  code: boolean;
  /** 0.3.19: the access mode as it was when this turn was created. The turn never looks at the live mode again. */
  computer: boolean;
  filesOnly: boolean;
  /** Code turn only: the project (a direct subfolder of the code folder) this turn runs inside, or null for the code folder itself. */
  proj: { path: string; name: string; id: string } | null;
  /** Code turn only: "each-write" makes Claude Code ask the bridge (bridge_approve) before a write or a command. */
  approval: "session" | "each-write";
  /** Questions put to the person in this turn (each-write), kept after the answer so a second answer is told "already answered". */
  /** SHA-256 hex of the pairing secret that started this turn: only that pairing may answer its questions. */
  owner: string;
  /** When the turn began (ms), the time of its last sign of life (ms), what that was (the activity wording), and how many tool calls it made. */
  startedAt: number;
  lastActivityAt: number;
  lastActivity: string;
  toolCalls: number;
  /** How many hand-offs this (top-level) turn has started. */
  handoffCount: number;
  /** Set when the person's pairing asked for the turn to be cancelled (POST /v1/turn/cancel). */
  cancelRequested: boolean;
  approvals: Map<string, { settle: (allow: boolean, message?: string, scope?: WebScope) => void; answered: boolean }>;
  /** Folder mode: the person allowed every WebFetch for the rest of THIS turn. Never copied to a hand-off, a later turn or another pairing. */
  webTurnGrant: boolean;
  /** 0.4.0: the last Time line value sent to the page as `time_left` for this (top) turn; undefined until one is sent. */
  timeLeftLast?: string;
  /** 0.4.0: how many `time_left` events were sent for this turn (TIME_LEFT_MAX_EVENTS + 1 once the cap notice is written). */
  timeLeftSent?: number;
}
/** How far an allowed WebFetch reaches: this page only, or every page for the rest of the turn. */
export type WebScope = "once" | "turn";
export const WEB_SCOPES: WebScope[] = ["once", "turn"];
/** A JSON-RPC message from the local claude process. */
interface McpMsg { id?: unknown; method?: string; params?: { _meta?: { progressToken?: unknown }; protocolVersion?: string; name?: unknown; arguments?: unknown; requestId?: unknown } }
/** One line of claude's stream-json output (only the fields read here). */
interface ClaudeEvent {
  type?: string;
  subtype?: string;
  model?: string;
  apiKeySource?: unknown;
  cwd?: unknown;
  tools?: unknown[];
  mcp_servers?: unknown[];
  num_turns?: number;
  is_error?: boolean;
  result?: unknown;
  permissionMode?: unknown;
  message?: { content?: unknown; model?: unknown; usage?: unknown };
  /** Set on an `assistant` line a sub-agent wrote; the person's own steps carry none. */
  parent_tool_use_id?: unknown;
  /** Per-model token counts on a `result` line. Only the fields named here are read. */
  modelUsage?: Record<string, ModelUsageCounts>;
}
/** The counts a `modelUsage` entry may carry. Anything else on the entry is ignored. */
interface ModelUsageCounts {
  inputTokens?: unknown;
  outputTokens?: unknown;
  cacheReadInputTokens?: unknown;
  cacheCreationInputTokens?: unknown;
  contextWindow?: unknown;
}
/** A count the page may be shown: a finite integer from 0 to 1e9. Anything else is left out. */
const USAGE_MAX = 1_000_000_000;
function usageCount(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > USAGE_MAX) return undefined;
  return v;
}
/** Token summary for one result: `model`, `contextWindow`, and whichever of the four counts are valid. */
interface TurnUsage {
  model: string;
  contextWindow: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}
/** The counts one model call used, from an `assistant` line's `message.usage` (the CLI's snake_case names). */
interface StepUsage {
  inputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}
/**
 * The usage of one top-level `assistant` line, or undefined when the line is a sub-agent's, is for another model than
 * `reportedModel`, or carries no usage object. A bad count is left out of the answer (never replaced by another number).
 */
function stepUsage(ev: ClaudeEvent, reportedModel: string): StepUsage | undefined {
  if (ev.parent_tool_use_id !== undefined && ev.parent_tool_use_id !== null) return undefined;
  const m = ev.message;
  if (!m || typeof m !== "object") return undefined;
  if (typeof m.model === "string" && m.model !== "" && reportedModel !== "" && baseModelId(m.model) !== baseModelId(reportedModel)) return undefined;
  const raw = m.usage;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const u = raw as Record<string, unknown>;
  const step: StepUsage = {};
  const inputTokens = usageCount(u.input_tokens);
  const cacheReadInputTokens = usageCount(u.cache_read_input_tokens);
  const cacheCreationInputTokens = usageCount(u.cache_creation_input_tokens);
  if (inputTokens !== undefined) step.inputTokens = inputTokens;
  if (cacheReadInputTokens !== undefined) step.cacheReadInputTokens = cacheReadInputTokens;
  if (cacheCreationInputTokens !== undefined) step.cacheCreationInputTokens = cacheCreationInputTokens;
  // A line that carries no context (usage {} or only output_tokens) is not a step: it must not replace a good one.
  if (!((inputTokens ?? 0) > 0 || (cacheReadInputTokens ?? 0) > 0 || (cacheCreationInputTokens ?? 0) > 0)) return undefined;
  return step;
}
/** A model id without a trailing bracket suffix such as `[1m]`, lower-cased, for comparing the init id with a step's id. */
function baseModelId(id: string): string {
  return id.replace(/\[[^\]]*\]$/, "").trim().toLowerCase();
}
/**
 * The token summary of one result. Picks `modelUsage[reportedModel]`, or the only entry when there is exactly one.
 * A missing or invalid context window means no summary. No other field of the result is copied.
 * Since 0.3.11 the three context counts come from `lastStep` (the turn's last top-level model call) when there was one:
 * the result's modelUsage adds up every call of the turn, and each tool step re-sends the whole context, so its sum is
 * several times the real context. Without a last step the result's counts are used. outputTokens stays the turn's sum.
 */
function turnUsage(modelUsage: ClaudeEvent["modelUsage"], reportedModel: string, lastStep?: StepUsage): TurnUsage | undefined {
  if (!modelUsage || typeof modelUsage !== "object" || Array.isArray(modelUsage)) return undefined;
  let key: string | undefined;
  let raw: ModelUsageCounts | undefined;
  if (Object.prototype.hasOwnProperty.call(modelUsage, reportedModel)) {
    key = reportedModel;
    raw = modelUsage[reportedModel];
  } else {
    const entries = Object.entries(modelUsage);
    if (entries.length !== 1) return undefined;
    const only = entries[0];
    if (!only) return undefined;
    key = only[0];
    raw = only[1];
  }
  if (key === undefined || !raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const contextWindow = usageCount(raw.contextWindow);
  if (contextWindow === undefined) return undefined;
  const usage: TurnUsage = { model: key, contextWindow };
  // A kept last step is used whole: a count it lacks is 0, never filled from the summed modelUsage.
  const src: { inputTokens?: number | undefined; cacheReadInputTokens?: number | undefined; cacheCreationInputTokens?: number | undefined } = lastStep
    ? { inputTokens: lastStep.inputTokens ?? 0, cacheReadInputTokens: lastStep.cacheReadInputTokens ?? 0, cacheCreationInputTokens: lastStep.cacheCreationInputTokens ?? 0 }
    : {
        inputTokens: usageCount(raw.inputTokens),
        cacheReadInputTokens: usageCount(raw.cacheReadInputTokens),
        cacheCreationInputTokens: usageCount(raw.cacheCreationInputTokens),
      };
  const { inputTokens, cacheReadInputTokens, cacheCreationInputTokens } = src;
  const outputTokens = usageCount(raw.outputTokens);
  if (inputTokens !== undefined) usage.inputTokens = inputTokens;
  if (outputTokens !== undefined) usage.outputTokens = outputTokens;
  if (cacheReadInputTokens !== undefined) usage.cacheReadInputTokens = cacheReadInputTokens;
  if (cacheCreationInputTokens !== undefined) usage.cacheCreationInputTokens = cacheCreationInputTokens;
  return usage;
}
interface RunClaudeOut { result?: ClaudeEvent; error?: string; sessionId: string; model: string; apiKeyRefused?: boolean; bridgeRefused?: true; lastStep?: StepUsage | undefined }
interface ClaudeMode { sessionId: string; resume: boolean }
/** The JSON `claude auth status` prints. */
interface AuthStatus { loggedIn?: unknown; authMethod?: unknown; subscriptionType?: unknown; email?: string }
/** The status.json file the CLI side writes next to the control token. */
interface StatusFile { ok?: boolean; port?: number; at?: unknown; reason?: unknown; billing?: unknown; pid?: number }
export interface LaunchctlResult { code: number; out: string }
export interface ServiceResult { ok: boolean; message: string }
export interface ServiceDeps {
  launchctl: (args: string[]) => Promise<LaunchctlResult>;
  uid: number;
  home: string;
  nodePath: string;
  file: string;
  env: NodeJS.ProcessEnv;
  log?: ((line: string) => void) | undefined;
  platform?: string | undefined;
  check?: typeof checkSubscriptionLogin | undefined;
  sleep?: ((ms: number) => Promise<unknown>) | undefined;
  // Windows Always On only (everything below is injected by the tests; the CLI uses the real ones).
  /** Runs a program with an argument list and no shell (reg.exe, taskkill.exe, wscript.exe). */
  exec?: ((file: string, args: string[], o?: { detached?: boolean }) => Promise<LaunchctlResult>) | undefined;
  /** The service files on disk. */
  sfs?: ServiceFs | undefined;
  /** Is a process with this pid running? */
  alive?: ((pid: number) => boolean) | undefined;
  /** GET /v1/hello on 127.0.0.1:port; null when nothing answers. */
  hello?: ((port: number) => Promise<{ bridge?: string; build?: string } | null>) | undefined;
  /** Files for resolving `claude` (tests). */
  files?: PlatformOpts["files"] | undefined;
  /** The clock, in milliseconds (the supervisor's heartbeat is read against it). */
  now?: (() => number) | undefined;
}
export interface ServiceFs {
  mkdirp(p: string): void;
  write(p: string, data: string | Buffer): void;
  read(p: string): string;
  exists(p: string): boolean;
  rm(p: string): void;
  /** Removes the folder only when it holds nothing. */
  rmdirIfEmpty(p: string): void;
  /** File names (not paths) in a folder; empty when it is not there. */
  list?(p: string): string[];
}

export const BRIDGE_VERSION = "1";
/** Package version of this bridge. `/v1/hello` reports it; an older bridge sends none. */
export const BRIDGE_BUILD = "0.4.1";
export const DEFAULT_PORT = 47821;
const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Environment variables that would make the CLI bill an API key, a gateway or a cloud provider instead of the subscription,
 * or sign in as someone else. Exact names first, then whole families by prefix, so a variable added in a later CLI version
 * under a known family is still removed. (Names checked against `strings` of claude 2.1.310.)
 */
export const BILLING_ENV_DENY = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_CUSTOM_HEADERS",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_SESSION_ACCESS_TOKEN",
  "CLAUDE_CODE_REMOTE_SDK_URL",
  "CLAUDE_API_KEY",
];

/** Families removed by prefix: provider and gateway switches, API-key helpers, other-account tokens, cloud bearer tokens. */
export const BILLING_ENV_DENY_PREFIXES = [
  "ANTHROPIC_",
  "CLAUDE_CODE_USE_",
  "CLAUDE_CODE_OAUTH_",
  "CLAUDE_CODE_CUSTOM_OAUTH",
  "CLAUDE_CODE_API_",
  "CLAUDE_CODE_GATEWAY_",
  "CLAUDE_CODE_HOST_",
  "CLAUDE_CODE_PROVIDER_",
  "CLAUDE_CODE_MODEL_CATALOG",
  "CLAUDE_CODE_CLIENT_",
  "CLAUDE_BRIDGE_",
  "CLAUDE_BG_",
  "AWS_BEARER_TOKEN_",
];

const envDenied = (k: string) => {
  const u = k.toUpperCase(); // Windows env names are case-insensitive
  return BILLING_ENV_DENY.includes(u) || BILLING_ENV_DENY_PREFIXES.some((p) => u.startsWith(p));
};

/** The environment a `claude` child gets: ours, minus everything in {@link BILLING_ENV_DENY} and {@link BILLING_ENV_DENY_PREFIXES}. */
export function childEnv(env: NodeJS.ProcessEnv = process.env) {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) if (!envDenied(k)) out[k] = v;
  // The Claude CLI gives up on one MCP tool call after its own default wait, far shorter than a hand-off may run here.
  // Make it wait as long as the bridge does (a larger value the person set themselves is kept).
  const own = Number(out.MCP_TOOL_TIMEOUT);
  if (!(Number.isFinite(own) && own > MCP_TOOL_TIMEOUT_MS)) out.MCP_TOOL_TIMEOUT = String(MCP_TOOL_TIMEOUT_MS);
  // Belt and braces: the CLI's idle limit (reset by progress) gets the same value.
  const ownIdle = Number(out.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT);
  if (!(Number.isFinite(ownIdle) && ownIdle > MCP_TOOL_TIMEOUT_MS)) out.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT = String(MCP_TOOL_TIMEOUT_MS);
  return out;
}

/**
 * The only environment variable names a CODE turn's Claude Code gets (on Windows, matched without regard to case): ordinary paths, language,
 * terminal and proxy settings, and the usual version-manager homes. Tokens and keys in the person's environment are not passed on.
 * The Claude Code names (CLAUDE_CODE_*, CLAUDE_CONFIG_DIR) are kept too, except any whose name holds TOKEN, KEY or SECRET; the
 * billing variables childEnv removes stay removed. A name that starts with LC_ is a locale setting and is kept.
 */
export const CODE_ENV_ALLOW: readonly string[] = [
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP", "LANG", "LANGUAGE", "TZ", "TERM", "COLORTERM", "NO_COLOR", "FORCE_COLOR",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
  "NVM_DIR", "NVM_BIN", "VOLTA_HOME", "FNM_DIR", "PNPM_HOME", "COREPACK_HOME",
  // What the bridge itself sets for the child (see childEnv):
  "MCP_TOOL_TIMEOUT", "CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT", "CLAUDE_CONFIG_DIR",
];
/** Added on Windows. */
export const CODE_ENV_ALLOW_WIN32: readonly string[] = [
  "SystemRoot", "SystemDrive", "windir", "ComSpec", "PATHEXT", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA", "ProgramData",
  "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "CommonProgramFiles", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS",
];

/** The environment of a code turn's child: {@link childEnv} (so the billing variables are gone first), cut down to {@link CODE_ENV_ALLOW}. */
export function codeChildEnv(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform, extraPrefixes: readonly string[] = []): NodeJS.ProcessEnv {
  const win = platform === "win32";
  const norm = (k: string) => (win ? k.toUpperCase() : k);
  const spellings = [...CODE_ENV_ALLOW, ...(win ? CODE_ENV_ALLOW_WIN32 : [])];
  const allow = new Set(spellings.map(norm));
  const kept = new Map<string, { k: string; v: string | undefined; exact: boolean }>();
  for (const [k, v] of Object.entries(childEnv(env))) {
    const n = norm(k);
    const secretName = /TOKEN|KEY|SECRET/i.test(k); // for every name, LC_* and CLAUDE_CODE_* included
    const ok = (!secretName && (allow.has(n) || n.startsWith("LC_") || n.startsWith("CLAUDE_CODE_") || n === "CLAUDE_CONFIG_DIR")) || extraPrefixes.some((p) => n.startsWith(norm(p))); // extraPrefixes: test-only
    if (!ok) continue;
    // One spelling per name on Windows (names are case-insensitive there): the allow-list's own spelling if present, else the first seen.
    const prev = kept.get(n);
    const exact = spellings.includes(k);
    if (!prev || (!prev.exact && exact)) kept.set(n, { k, v, exact });
  }
  const out: NodeJS.ProcessEnv = {};
  for (const { k, v } of kept.values()) out[k] = v;
  return out;
}

// Single-file use (downloaded from the app): allowed-origins.json is not next to this file, so these built-in
// defaults apply. The source keeps this list EMPTY: the host app names its own origins, and the Vite plugin
// (claudeCodeBridgeFile({ defaultAllowedOrigins })) writes them into this one line when it serves or emits the file.
export const DEFAULT_ALLOWED_ORIGINS: string[] = [];

// Self-update (SU-1: the pure checks only; nothing here reads the network or writes a file). Like DEFAULT_ALLOWED_ORIGINS,
// the source keeps both lines EMPTY and the host app's build writes them in: the address the manifest and the file are
// fetched from, and the pinned public keys (32 raw bytes, base64). Each line must appear exactly once, as written.
export const UPDATE_ORIGIN = "";
export const UPDATE_KEYS: { id: string; key: string }[] = [];

/** The manifest of one signed bridge file (`format` and `signature` are checked, then dropped). */
export interface UpdateManifest { version: string; sha256: string; size: number; signedAt: string; minBridge?: string; keyId: string }
export type UpdateVerdict = { ok: true; manifest: UpdateManifest } | { ok: false; code: string; message: string };

const UPDATE_LABEL = "gilb-claude-code-bridge-update-v1";
const UPDATE_MAX_BYTES = 5 * 1024 * 1024;
const UPDATE_MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
/** A signing time older than this is not trusted (a host cannot pin a person to an ancient signed build). */
export const UPDATE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;
/** DER prefix of an ed25519 SubjectPublicKeyInfo; the 32 raw key bytes follow. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * The exact text a bridge update signature covers (UTF-8, LF, no trailing newline). The fixed first line binds the
 * signature to this purpose, so a signature made for anything else (e.g. an ontology snapshot) can never be replayed.
 * When `minBridge` is absent the last line is `minBridge=` with nothing after the equals sign: the line is always
 * present, so the signed text has one shape and an absent value cannot be confused with a dropped line.
 * The second line is `origin=<UPDATE_ORIGIN>` (SU-5a): the origin baked into the bridge that checks it. The manifest JSON does not carry it;
 * the bridge supplies its own, so a manifest signed for another app's origin fails as UpdateSignature (no cross-app replay).
 */
export function updateSignedText(m: { origin: string; version: string; sha256: string; size: number; signedAt: string; minBridge?: string }): string {
  return [UPDATE_LABEL, `origin=${m.origin}`, `version=${m.version}`, `sha256=${m.sha256}`, `size=${m.size}`, `signedAt=${m.signedAt}`, `minBridge=${m.minBridge ?? ""}`].join("\n");
}

/**
 * Compares two dotted build numbers ("0.3.15"): -1, 0 or 1; null when either is not digits separated by dots. A missing
 * part counts as 0, so "0.3" equals "0.3.0". (No equivalent helper existed in this file, so this is new.)
 */
export function compareBuilds(a: string, b: string): number | null {
  if (typeof a !== "string" || typeof b !== "string") return null;
  const shape = /^\d+(\.\d+)*$/;
  if (!shape.test(a) || !shape.test(b)) return null;
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const updateFail = (code: string, message: string): { ok: false; code: string; message: string } => ({ ok: false, code, message });
const UPDATE_BAD_MSG = "The update information from the server could not be read. Try again later.";
const UPDATE_SIG_MSG = "The update did not pass the signature check, so it was NOT installed. Your bridge is unchanged. Tell support.";

/**
 * Decides whether a downloaded manifest may be acted on. Pure: no network, no files. Order matters: the signature is
 * checked BEFORE any version is compared, so an unsigned manifest learns nothing about versions.
 * Codes: UpdateBad (shape, version, or a signing time more than 24 h ahead), UpdateOff (no pinned keys, or a pinned key
 * that is not 32 bytes), UpdateSignature (unknown key id, wrong or unverifiable signature), UpdateCurrent (version not
 * strictly higher than `running`; not an error, nothing is installed), UpdateTooOld (`minBridge` above `running`).
 */
export function verifyUpdateManifest(raw: unknown, ctx: { running: string; keys: { id: string; key: string }[]; now: Date; origin: string }): UpdateVerdict {
  // a. shape
  const r = raw as Record<string, unknown> | null;
  const isPlain = r !== null && typeof r === "object" && !Array.isArray(r) && (Object.getPrototypeOf(r) === Object.prototype || Object.getPrototypeOf(r) === null);
  if (!isPlain) return updateFail("UpdateBad", UPDATE_BAD_MSG);
  const { format, version, sha256, size, signedAt, minBridge, keyId, signature } = r;
  if (format !== 1 || typeof version !== "string" || typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) return updateFail("UpdateBad", UPDATE_BAD_MSG);
  if (typeof size !== "number" || !Number.isInteger(size) || size < 1 || size > UPDATE_MAX_BYTES) return updateFail("UpdateBad", UPDATE_BAD_MSG);
  const isoShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  if (typeof signedAt !== "string" || !isoShape.test(signedAt) || Number.isNaN(Date.parse(signedAt))) return updateFail("UpdateBad", UPDATE_BAD_MSG);
  if (typeof keyId !== "string" || keyId === "" || typeof signature !== "string" || signature === "") return updateFail("UpdateBad", UPDATE_BAD_MSG);
  if (minBridge !== undefined && typeof minBridge !== "string") return updateFail("UpdateBad", UPDATE_BAD_MSG);
  // Dotted numbers only, before the signature: a newline or "=" must never reach the signed text.
  const dotted = /^\d+(\.\d+)*$/;
  if (!dotted.test(version) || (minBridge !== undefined && !dotted.test(minBridge as string))) return updateFail("UpdateBad", UPDATE_BAD_MSG);
  const m: UpdateManifest = { version, sha256, size, signedAt, keyId, ...(minBridge !== undefined ? { minBridge } : {}) };
  // b. keys
  if (ctx.keys.length === 0 || typeof ctx.origin !== "string" || ctx.origin === "") return updateFail("UpdateOff", "This bridge cannot update itself. Use the command below.");
  // c. key id
  const pinned = ctx.keys.find((k) => k.id === keyId);
  if (!pinned) return updateFail("UpdateSignature", UPDATE_SIG_MSG);
  // d. signature
  const rawKey = Buffer.from(pinned.key, "base64");
  if (rawKey.length !== 32) return updateFail("UpdateOff", "This bridge cannot update itself. Use the command below.");
  // Strict base64 of exactly 64 bytes, and the one canonical spelling: no newline, url-safe, missing padding or trailing junk.
  const sigBytes = Buffer.from(signature, "base64");
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signature) || sigBytes.toString("base64") !== signature) return updateFail("UpdateSignature", UPDATE_SIG_MSG);
  let good = false;
  try {
    const publicKey = crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]), format: "der", type: "spki" });
    good = crypto.verify(null, Buffer.from(updateSignedText({ ...m, origin: ctx.origin }), "utf8"), publicKey, sigBytes);
  } catch {
    good = false;
  }
  if (!good) return updateFail("UpdateSignature", UPDATE_SIG_MSG);
  // e. strictly higher than the running build
  const cmp = compareBuilds(version, ctx.running);
  if (cmp === null) return updateFail("UpdateBad", UPDATE_BAD_MSG);
  if (cmp <= 0) return updateFail("UpdateCurrent", "This bridge is already the newest.");
  // f. minimum bridge
  if (minBridge !== undefined) {
    const floor = compareBuilds(minBridge as string, ctx.running);
    if (floor === null) return updateFail("UpdateBad", UPDATE_BAD_MSG);
    if (floor > 0) return updateFail("UpdateTooOld", "This bridge is too old to update by itself. Use the command below.");
  }
  // g. signing time not in the future
  if (Date.parse(signedAt) - ctx.now.getTime() > UPDATE_MAX_FUTURE_MS) return updateFail("UpdateBad", UPDATE_BAD_MSG);
  // h. not older than 400 days
  if (ctx.now.getTime() - Date.parse(signedAt) > UPDATE_MAX_AGE_MS) return updateFail("UpdateBad", "This update is too old to trust. Use the command below.");
  return { ok: true, manifest: m };
}

/** Whether downloaded bytes are the file the manifest describes: same length, same sha256, and the version it names inside. */
export function fileMatchesManifest(bytes: Uint8Array, m: { version: string; sha256: string; size: number }): { ok: true } | { ok: false; code: "UpdateMismatch"; message: string } {
  const bad = { ok: false as const, code: "UpdateMismatch" as const, message: "The downloaded file did not match what the server announced. Nothing was installed. Try again in a minute." };
  if (bytes.length !== m.size) return bad;
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== m.sha256) return bad;
  if (!Buffer.from(bytes).toString("utf8").includes(`BRIDGE_BUILD = "${m.version}"`)) return bad;
  return { ok: true };
}

/** One answer of the injected fetch. `truncated` is set when the byte cap stopped the read (bytes then holds exactly the cap). */
export interface UpdateFetchResult { status: number; finalUrl: string; bytes: Uint8Array; truncated?: boolean }
export interface UpdateFs {
  writeFileExclusive(p: string, bytes: Uint8Array, mode: number): Promise<void>;
  readFile(p: string): Promise<Uint8Array>;
  copyFile(src: string, dst: string): Promise<void>;
  rename(src: string, dst: string): Promise<void>;
  unlink(p: string): Promise<void>;
  writeFile(p: string, text: string, mode: number): Promise<void>;
  realpath(p: string): Promise<string>;
  /** lstat: a symlink is reported as one (never followed). */
  lstat(p: string): Promise<{ isFile(): boolean; isSymbolicLink?(): boolean }>;
  stat(p: string): Promise<{ uid: number; mode: number }>;
}
export interface UpdateDeps {
  origin: string;
  keys: { id: string; key: string }[];
  running: string;
  file: string;
  /** The path the person ran (process.argv[1] as given), when it is this file reached by another name. Default: `file`. */
  runPath?: string;
  /** Tests: another platform / user id. Default: this process. */
  platform?: string;
  getuid?: () => number;
  stateDir: string;
  fetch: (url: string, opts: { timeoutMs: number; maxBytes: number }) => Promise<UpdateFetchResult>;
  fs: UpdateFs;
  selfTest: (p: string) => Promise<{ code: number; stdout: string }>;
  now: () => Date;
  random: () => string;
  log: (msg: string) => void;
}
export type UpdateResult =
  | { updated: true; from: string; to: string }
  | { updated: false; reason: "current" }
  | { updated: false; code: string; message: string };

const UPDATE_MANIFEST_PATH = "/app/claude-code-bridge.json";
const UPDATE_FILE_PATH = "/app/claude-code-bridge.mjs";
const UPDATE_MANIFEST_MAX_BYTES = 8 * 1024;
let updateRunning = false;
/** Is an update running now? (hello reports it.) */
export const isUpdateRunning = (): boolean => updateRunning;
const rfail = (code: string, message: string): { updated: false; code: string; message: string } => ({ updated: false, code, message });

/**
 * The install pipeline (design section 3). Every effect is injected, so it is testable. Order: origin check, can-write
 * check (no network), manifest fetch, verify, file fetch, size/hash/version check, temp write (0600, exclusive), self-test,
 * re-hash from disk, copy the old file to `.prev`, atomic rename. The running file is changed ONLY by the rename; any
 * failure before it removes the temp file and leaves the file and `.prev` as they were. One run at a time.
 */
export async function runUpdate(deps: UpdateDeps): Promise<UpdateResult> {
  if (updateRunning) return rfail("UpdateRunning", "An update is already running.");
  updateRunning = true;
  try {
    return await runUpdateInner(deps);
  } finally {
    updateRunning = false;
  }
}

/** Two paths name the same place? Windows paths differ only in case (C:\\ and c:\\), so there they are compared without case. */
const samePath = (a: string, b: string, platform: string = process.platform): boolean => (platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);

/**
 * Can this bridge file be replaced safely from the app? (1) The path the person RUNS is a plain file, not a symlink (a symlink
 * would send the update to the link's target folder). (2) That is also its real path. (3) Its folder is owned by this user and
 * has no group or other write bit, so nobody else can swap the temp file or the `.prev` name. Windows: no mode check (it has no
 * owner and mode bits like these); the symlink check stays. Needs no network.
 */
export async function updateCanWrite(dfs: Pick<UpdateFs, "realpath" | "lstat" | "stat">, file: string, o: { runPath?: string | undefined; platform?: string | undefined; getuid?: (() => number) | undefined } = {}): Promise<boolean> {
  try {
    const run = o.runPath ?? file;
    const st = await dfs.lstat(run);
    if (st.isSymbolicLink?.() === true || !st.isFile()) return false;
    const platform = o.platform ?? process.platform;
    if (!samePath(await dfs.realpath(file), path.resolve(file), platform)) return false;
    if (platform !== "win32") {
      const uid = (o.getuid ?? process.getuid?.bind(process))?.();
      const dir = await dfs.stat(path.dirname(file));
      if (uid === undefined || dir.uid !== uid || (dir.mode & 0o022) !== 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** What `checkUpdate` found: a newer signed version, "already newest" (with the version the server offers), or a failure. */
export type UpdateCheck =
  | { kind: "available"; manifest: UpdateManifest }
  | { kind: "current"; latest: string }
  | { kind: "fail"; result: { updated: false; code: string; message: string } };

const UPDATE_NET_MSG = "Could not reach the server to fetch the update. Check your internet and try again.";

/** GET one file from the fixed origin: null on a thrown error, a timeout, a status other than 200, or a final address on another origin. */
async function updateGet(deps: Pick<UpdateDeps, "fetch">, origin: string, urlPath: string, timeoutMs: number, maxBytes: number): Promise<UpdateFetchResult | null> {
  try {
    const r = await deps.fetch(origin + urlPath, { timeoutMs, maxBytes });
    if (r.status !== 200 || new URL(r.finalUrl).origin !== origin) return null;
    return r;
  } catch {
    return null;
  }
}

/** Steps 2 to 5 of the pipeline: the fixed https origin, the manifest fetch (10 s, 8 KB), the shape and signature check, the version check. No file is touched. */
export async function checkUpdate(deps: Pick<UpdateDeps, "origin" | "keys" | "running" | "fetch" | "now">): Promise<UpdateCheck & { origin?: string }> {
  let origin: string;
  try {
    const u = new URL(deps.origin);
    if (u.protocol !== "https:") throw new Error("not https");
    origin = u.origin;
  } catch {
    return { kind: "fail", result: rfail("UpdateOff", "This bridge cannot update itself. Use the command below.") };
  }
  const mr = await updateGet(deps, origin, UPDATE_MANIFEST_PATH, 10_000, UPDATE_MANIFEST_MAX_BYTES);
  if (!mr) return { kind: "fail", result: rfail("UpdateNetwork", UPDATE_NET_MSG) };
  let parsed: unknown;
  try {
    if (mr.truncated) throw new Error("too big");
    parsed = JSON.parse(Buffer.from(mr.bytes).toString("utf8"));
  } catch {
    return { kind: "fail", result: rfail("UpdateBad", UPDATE_BAD_MSG) };
  }
  const v = verifyUpdateManifest(parsed, { running: deps.running, keys: deps.keys, now: deps.now(), origin });
  if (v.ok) return { kind: "available", manifest: v.manifest, origin };
  // UpdateCurrent comes only after the signature passed, so the version it names is a signed one.
  if (v.code === "UpdateCurrent") return { kind: "current", latest: String((parsed as { version?: unknown }).version) };
  return { kind: "fail", result: rfail(v.code, v.message) };
}

async function runUpdateInner(deps: UpdateDeps): Promise<UpdateResult> {
  const { fs: dfs } = deps;
  // The can-write check comes first: it needs no network.
  if (!(await updateCanWrite(dfs, deps.file, deps))) return rfail("UpdateCannotWrite", "This bridge file cannot be replaced from the app. Use the command below.");
  // Steps 2 to 5
  const c = await checkUpdate(deps);
  if (c.kind === "current") return { updated: false, reason: "current" };
  if (c.kind === "fail") return c.result;
  const manifest = c.manifest;
  const origin = c.origin as string;
  // d. file
  const fr = await updateGet(deps, origin, UPDATE_FILE_PATH, 60_000, manifest.size + 1);
  if (!fr) return rfail("UpdateNetwork", UPDATE_NET_MSG);
  // e. size, hash, version inside
  const first = fileMatchesManifest(fr.bytes, manifest);
  if (!first.ok) return { updated: false, code: first.code, message: first.message };
  // g. temp file next to the bridge file, exclusive, 0600
  // The name ends in .mjs: node loads any other extension as CommonJS and would refuse the self-test.
  const temp = path.join(path.dirname(deps.file), `${path.basename(deps.file).replace(/\.mjs$/, "")}.update-${deps.random()}.mjs`);
  const diskFail = (err: unknown): UpdateResult => {
    const why = String((err as ErrLike)?.code ?? "error").replace(/[^A-Za-z0-9_]/g, "").slice(0, 24) || "error";
    return rfail("UpdateDisk", `Could not write the update to your computer (${why}). Nothing was changed.`);
  };
  const cleanup = async (): Promise<void> => {
    try { await dfs.unlink(temp); } catch { /* ignore */ }
  };
  try {
    await dfs.writeFileExclusive(temp, fr.bytes, 0o600);
  } catch (err) {
    if ((err as ErrLike)?.code !== "EEXIST") await cleanup(); // never remove a file we did not create
    return diskFail(err);
  }
  try {
    // h. self-test
    let st: { code: number; stdout: string };
    try { st = await deps.selfTest(temp); } catch { st = { code: -1, stdout: "" }; }
    if (st.code !== 0 || st.stdout.trim() !== `build ${manifest.version}`) {
      await cleanup();
      return rfail("UpdateSelfTest", "The new version could not start on this computer, so it was NOT installed.");
    }
    // i. re-hash what is on disk
    let again: Uint8Array;
    try { again = await dfs.readFile(temp); } catch (err) { await cleanup(); return diskFail(err); }
    const second = fileMatchesManifest(again, manifest);
    if (!second.ok) {
      await cleanup();
      return { updated: false, code: second.code, message: second.message };
    }
    // j. keep the old file as `.prev`: written to a fresh exclusive name, then renamed over `.prev` (a link planted at `.prev` is replaced, never followed)
    const prevTemp = `${deps.file}.prev-${deps.random()}`;
    try {
      await dfs.writeFileExclusive(prevTemp, await dfs.readFile(deps.file), 0o600);
      await dfs.rename(prevTemp, deps.file + ".prev");
    } catch (err) {
      try { await dfs.unlink(prevTemp); } catch { /* ignore */ }
      await cleanup();
      return diskFail(err);
    }
    // k. the one step that changes the running file
    try { await dfs.rename(temp, deps.file); } catch (err) { await cleanup(); return diskFail(err); }
  } catch (err) {
    await cleanup();
    return diskFail(err);
  }
  // l. a note for the next start; the install already happened, so a failure here is only logged
  try {
    await dfs.writeFile(path.join(deps.stateDir, "update.json"), JSON.stringify({ from: deps.running, to: manifest.version, at: deps.now().toISOString(), sha256: manifest.sha256 }), 0o600);
  } catch {
    deps.log("update: installed, but update.json could not be written");
  }
  deps.log(`update: ok from ${deps.running} to ${manifest.version} sha256 ${manifest.sha256.slice(0, 12)}`);
  return { updated: true, from: deps.running, to: manifest.version };
}

/** GET with a hard byte cap and same-origin redirects only (at most 3). Stops reading once the cap is passed. */
export function realFetch(url: string, opts: { timeoutMs: number; maxBytes: number }): Promise<UpdateFetchResult> {
  return new Promise((resolve, reject) => {
    const origin = new URL(url).origin;
    let cur: http.ClientRequest | null = null;
    let curRes: http.IncomingMessage | null = null;
    // On the time limit the connection is destroyed too, so a slow server cannot keep a socket (and its buffer) alive.
    const timer = setTimeout(() => { curRes?.destroy(); cur?.destroy(); reject(new Error("timeout")); }, opts.timeoutMs);
    const done = (fn: () => void): void => { clearTimeout(timer); fn(); };
    const go = (u: string, redirects: number): void => {
      const mod = u.startsWith("https:") ? https : http;
      const req = mod.get(u, { headers: { "user-agent": "gilb-claude-code-bridge-update" } }, (res) => {
        curRes = res;
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          let next: URL;
          try { next = new URL(res.headers.location, u); } catch { return done(() => reject(new Error("bad redirect"))); }
          if (next.origin !== origin || redirects >= 3) return done(() => resolve({ status, finalUrl: next.href, bytes: new Uint8Array(0) }));
          return go(next.href, redirects + 1);
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (c: Buffer) => {
          total += c.length;
          if (total > opts.maxBytes) {
            const keep = opts.maxBytes - (total - c.length);
            chunks.push(c.subarray(0, keep));
            const bytes = new Uint8Array(Buffer.concat(chunks));
            req.destroy();
            return done(() => resolve({ status, finalUrl: u, bytes, truncated: true }));
          }
          chunks.push(c);
        });
        res.on("end", () => done(() => resolve({ status, finalUrl: u, bytes: new Uint8Array(Buffer.concat(chunks)) })));
        res.on("error", (e) => done(() => reject(e)));
      });
      cur = req;
      req.on("error", (e) => done(() => reject(e)));
    };
    go(url, 0);
  });
}

/** The real file operations for `runUpdate`. */
export const realFs: UpdateFs = {
  async writeFileExclusive(p, bytes, mode) {
    const h = await fs.promises.open(p, "wx", mode);
    try { await h.writeFile(bytes); } finally { await h.close(); }
  },
  async readFile(p) { return new Uint8Array(await fs.promises.readFile(p)); },
  copyFile: (src, dst) => fs.promises.copyFile(src, dst),
  rename: (src, dst) => fs.promises.rename(src, dst),
  unlink: (p) => fs.promises.unlink(p),
  async writeFile(p, text, mode) { await fs.promises.writeFile(p, text, { mode }); },
  realpath: (p) => fs.promises.realpath(p),
  lstat: (p) => fs.promises.lstat(p),
  stat: (p) => fs.promises.stat(p),
};

/** The exit code that asks the supervisor (launchd, the Windows supervisor) to start the bridge again right after an update. */
export const UPDATE_EXIT_CODE = 75;
/** A supervisor.json beat this young counts as alive. */
const SUPERVISOR_LIVE_MS = 10_000;

/**
 * Will something start this bridge again when it exits? True when launchd runs it under the install label (`XPC_SERVICE_NAME`),
 * when `GILB_BRIDGE_SUPERVISED=1` is set (the plist and the Windows supervisor set it), or when supervisor.json (its text, read
 * by the caller; null if none) beats within 10 s and names this process as its child. Pure.
 */
export function isSupervised(env: NodeJS.ProcessEnv, files: { label: string; supervisorJson: string | null; now: number; pid: number }): boolean {
  if (env.GILB_BRIDGE_SUPERVISED === "1") return true;
  if (env.XPC_SERVICE_NAME !== undefined && env.XPC_SERVICE_NAME === files.label) return true;
  if (files.supervisorJson) {
    try {
      const r = JSON.parse(files.supervisorJson) as SupervisorRecord | null;
      if (r && typeof r.beat === "number" && Math.abs(files.now - r.beat) <= SUPERVISOR_LIVE_MS && r.child === files.pid) return true;
    } catch {
      /* not a record */
    }
  }
  return false;
}

/** --rollback: put `<file>.prev` back as the bridge file, by a copy next to it and a rename (never a half-written file). */
export function rollbackBridge(file: string, io: { stat: (p: string) => { isFile(): boolean }; copyFile: (a: string, b: string) => void; rename: (a: string, b: string) => void; rm: (p: string) => void } = { stat: (p) => fs.statSync(p), copyFile: (a, b) => fs.copyFileSync(a, b, fs.constants.COPYFILE_EXCL), rename: (a, b) => fs.renameSync(a, b), rm: (p) => fs.rmSync(p, { force: true }) }): { ok: boolean; message: string } {
  const prev = `${file}.prev`;
  try {
    if (!io.stat(prev).isFile()) throw new Error("not a file");
  } catch {
    return { ok: false, message: "No previous bridge to roll back to." };
  }
  const tmp = path.join(path.dirname(file), `${path.basename(file).replace(/\.mjs$/, "")}.rollback-${process.pid}.mjs`);
  try {
    io.copyFile(prev, tmp);
    io.rename(tmp, file);
  } catch (e) {
    try { io.rm(tmp); } catch { /* ignore */ }
    return { ok: false, message: `Could not roll back: ${(e as ErrLike)?.code ?? "error"}. The bridge file is unchanged.` };
  }
  return { ok: true, message: `Rolled back to the previous bridge. Restart it: stop the bridge window (Ctrl+C) and start it again, or, if it runs always-on, run  node ${file} --install  again.` };
}

/** The environment of the self-test child: PATH and HOME, plus the few names Windows needs to start node. Nothing else (no secrets) is passed on. */
export function selfTestEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const k of ["PATH", "HOME", "SystemRoot", "TEMP", "TMP"]) if (env[k] !== undefined) out[k] = env[k];
  return out;
}

/** Control characters (escape codes, newlines) removed from a value before it is written to the log. */
export function cleanForLog(v: unknown): string {
  return String(v).replace(/[\x00-\x1f\x7f]/g, "");
}

/** Runs the new file with `--selftest` in its own process (no shell, 15 s, minimal environment). */
export function realSelfTest(p: string): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [p, "--selftest"], { timeout: 15_000, shell: false, env: selfTestEnv() }, (err, stdout) => {
      const code = err ? (typeof (err as ExecFileException).code === "number" ? ((err as ExecFileException).code as number) : 1) : 0;
      resolve({ code, stdout: String(stdout ?? "") });
    });
  });
}

/**
 * The relay window (for Safari). Safari blocks an https page's fetch to http://127.0.0.1 as mixed content, so the page opens
 * this bridge-served window instead and talks to it by postMessage; this window's fetches are same-origin. One self-contained
 * page, its script pinned by a sha256 in the Content-Security-Policy. The allow-list is embedded as JSON with `<`, `>`, `&`
 * and the two line separators written as \u escapes, so an origin can never close the script tag.
 */
const RELAY_SCRIPT = `
var ALLOW = __ALLOW__;
var BUILD = __BUILD__;
var peer = null;
var aborts = {};
var statusEl = document.getElementById("status");
function post(msg, target) { try { window.opener.postMessage(msg, target); } catch (e) {} }
// The opener's origin cannot be read up front, so say "ready" to each allowed origin; a wrong origin drops it.
for (var i = 0; i < ALLOW.length; i++) post({ type: "gilb-bridge-ready", build: BUILD }, ALLOW[i]);
// The page went away: abort every open request, so the bridge stops the turns that page started.
function abortAll() { for (var k in aborts) { try { aborts[k].abort(); } catch (e) {} } }
setInterval(function () {
  if (!window.opener || window.opener.closed) {
    statusEl.textContent = "The page that opened this window has closed. You can close it.";
    abortAll();
  }
}, 2000);
var HEADERS = ["content-type", "x-bridge-secret", "accept"];
addEventListener("message", function (ev) {
  if (!window.opener || ev.source !== window.opener || ALLOW.indexOf(ev.origin) < 0) return;
  var m = ev.data;
  if (!m || typeof m !== "object" || typeof m.type !== "string") return;
  if (m.type !== "gilb-bridge-req" && m.type !== "gilb-bridge-abort" && m.type !== "gilb-bridge-bye") return;
  if (peer === null) peer = ev.origin;
  else if (ev.origin !== peer) return;
  if (m.type === "gilb-bridge-bye") { abortAll(); return; }
  statusEl.textContent = "Connected to " + peer;
  var id = m.id;
  if (typeof id !== "string" && typeof id !== "number") return;
  var reply = function (o) { o.id = id; window.opener.postMessage(o, peer); };
  if (m.type === "gilb-bridge-abort") {
    var a = aborts[id];
    if (a) a.abort();
    return;
  }
  var u;
  try { u = new URL(String(m.path), location.origin); } catch (e) { u = null; }
  var method = m.method === undefined ? "GET" : m.method;
  if (!u || u.origin !== location.origin || u.pathname.indexOf("/v1/") !== 0 || (method !== "GET" && method !== "POST")) {
    return reply({ type: "gilb-bridge-err", message: "Not an allowed request." });
  }
  var headers = {};
  var given = m.headers && typeof m.headers === "object" ? m.headers : {};
  for (var k in given) {
    var name = k.toLowerCase();
    if (HEADERS.indexOf(name) >= 0 && typeof given[k] === "string") headers[name] = given[k];
  }
  headers["x-gilb-relay-origin"] = peer;
  var ctl = new AbortController();
  aborts[id] = ctl;
  var init = { method: method, headers: headers, signal: ctl.signal, cache: "no-store" };
  if (method === "POST" && typeof m.body === "string") init.body = m.body;
  fetch(u.pathname + u.search, init).then(function (r) {
    var ct = r.headers.get("content-type") || "";
    // The head first, for every answer, so a streaming page learns the status before the first chunk.
    reply({ type: "gilb-bridge-head", status: r.status, contentType: ct });
    if (ct.indexOf("text/event-stream") === 0 && r.body) {
      var rd = r.body.getReader();
      var dec = new TextDecoder();
      var pump = function () {
        return rd.read().then(function (x) {
          if (x.done) { reply({ type: "gilb-bridge-end" }); return; }
          reply({ type: "gilb-bridge-chunk", chunk: dec.decode(x.value, { stream: true }) });
          return pump();
        });
      };
      return pump();
    }
    return r.text().then(function (t) { reply({ type: "gilb-bridge-res", status: r.status, headers: { "content-type": ct }, body: t }); });
  }).catch(function (e) {
    reply({ type: "gilb-bridge-err", message: ctl.signal.aborted ? "aborted" : String(e && e.message ? e.message : e) });
  }).then(function () { delete aborts[id]; });
});
`;

/** Builds the relay page and its CSP header value for this allow-list. */
export function relayPage(allowedOrigins: readonly string[]) {
  const escJson = (v: unknown) =>
    JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const script = RELAY_SCRIPT.replace("__ALLOW__", () => escJson(allowedOrigins)).replace("__BUILD__", () => escJson(BRIDGE_BUILD));
  const hash = crypto.createHash("sha256").update(script, "utf8").digest("base64");
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Claude Code bridge window</title></head>' +
    '<body style="font:16px system-ui;padding:16px"><p>Claude Code bridge window \u2014 keep this open while you chat. You can minimise it.</p>' +
    '<p id="status">Waiting for the page that opened this window.</p><script>' + script + "</script></body></html>";
  const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`;
  return { html, csp };
}

/**
 * One browser origin the person is allowing, checked strictly: `https://host[:port]`, or `http://` for this computer only
 * (localhost, 127.0.0.1, [::1]). No path, no query, no wildcard, no credentials. Returns the canonical origin string.
 * Throws an Error whose message is a sentence for the person. ⛔ There is no way to say "any origin".
 */
export function normalizeOrigin(input: unknown) {
  const raw = String(input ?? "").trim();
  if (raw.includes('"')) throw new Error(`${JSON.stringify(raw)} is not an origin: an origin never contains a quote mark.`);
  if (!raw || raw.includes("*")) throw new Error(`"${raw}" is not an origin. Use the exact address of the app, for example https://app.example.com (no wildcard).`);
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`"${raw}" is not an origin. Use the exact address of the app, for example https://app.example.com.`);
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && loopback)) {
    throw new Error(`"${raw}" must be https:// (http:// is accepted only for localhost, 127.0.0.1 and [::1]).`);
  }
  if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) {
    throw new Error(`"${raw}" is not an origin: give only scheme, host and port, for example ${u.origin}.`);
  }
  if (raw.replace(/\/+$/, "") !== u.origin) {
    throw new Error(`"${raw}" is not written the plain way (lower case, no default port). Write it as ${u.origin}.`);
  }
  return u.origin;
}

export function loadAllowedOrigins(extra: unknown[] = []) {
  let file: { origins: readonly string[] } = { origins: DEFAULT_ALLOWED_ORIGINS };
  try {
    file = JSON.parse(fs.readFileSync(path.join(HERE, "allowed-origins.json"), "utf8"));
  } catch (err) {
    if ((err as ErrLike)?.code !== "ENOENT") throw err;
  }
  const fromEnv = (process.env.GILB_BRIDGE_ALLOW_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // Added origins (flag, environment) must be well formed; the file and the built-in list are trusted as shipped.
  return [...new Set([...file.origins, ...fromEnv.map(normalizeOrigin), ...extra.map(normalizeOrigin)])];
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
export function newPairingCode() {
  const bytes = crypto.randomBytes(6);
  let s = "";
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}
const normCode = (c: unknown) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const BAD_REQUEST = "Bad request.";
const callerKey = (req: IncomingMessage) => sha(String(req.headers["x-bridge-secret"])).toString("hex");
const sha = (s: unknown) => crypto.createHash("sha256").update(String(s)).digest();
const same = (a: unknown, b: unknown) => crypto.timingSafeEqual(sha(a), sha(b));

// ---- Windows support ----------------------------------------------------------------------------------------------
// Node can start a `.exe` on Windows but not a `.cmd`/`.bat` without a shell (since the fix for CVE-2024-27980 it throws EINVAL),
// and a shell would put text in front of cmd.exe. So on Windows the bridge never uses a shell: it starts `claude.exe` itself, or
// reads npm's `.cmd` shim to find what the shim runs and starts that (node + a script, or an .exe). Anything else is refused.

/** Pieces the Windows code reads from outside, replaceable in tests. */
export interface PlatformOpts {
  platform?: string | undefined;
  /** How long a process group gets to end after SIGTERM before SIGKILL (default 2000 ms). */
  graceMs?: number | undefined;
  /** Where "~" is (os.homedir(): USERPROFILE on Windows). */
  home?: string | undefined;
  /** The node that runs a `.js` Claude Code entry (default: this process's node). */
  nodePath?: string | undefined;
  /** File access for the Windows lookups: whether a file exists, and its text. */
  files?: { exists: (p: string) => boolean; read: (p: string) => string } | undefined;
  /** execFile for taskkill. */
  execFile?: ((file: string, args: string[], opts: { windowsHide: boolean }, cb: (err: Error | null) => void) => unknown) | undefined;
}

const realFiles = {
  exists: (p: string) => {
    try {
      fs.accessSync(p, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },
  read: (p: string) => fs.readFileSync(p, "utf8"),
};

/** An environment variable by name, ignoring case (Windows names are case-insensitive, a copied env object is not). */
function envGet(env: NodeJS.ProcessEnv, name: string): string | undefined {
  if (env[name] !== undefined) return env[name];
  const want = name.toLowerCase();
  for (const k of Object.keys(env)) if (k.toLowerCase() === want) return env[k];
  return undefined;
}

/** The extensions Node can start without a shell, plus the two shim kinds this file reads, in the order PATHEXT lists them. */
const WIN_EXTS = [".com", ".exe", ".bat", ".cmd"];
function winExts(env: NodeJS.ProcessEnv): string[] {
  const raw = envGet(env, "PATHEXT");
  const listed = (raw ?? "").split(";").map((e) => e.trim().toLowerCase()).filter((e) => WIN_EXTS.includes(e));
  return [...new Set(listed.length ? listed : [".exe", ".cmd", ".bat", ".com"])];
}

/** What a `.cmd` made by npm's cmd-shim runs: an `.exe`, or a node script, relative to the shim's folder. Null when the file is anything else. */
export function parseCmdShim(text: string): { kind: "exe" | "node"; target: string } | null {
  const lines = text.split(/\r?\n/);
  // node script: `"%_prog%"  "%dp0%\node_modules\...\cli.js" %*`, with `SET "_prog=node"` in the file (no other program, no extra arguments)
  if (lines.some((l) => /^\s*SET "_prog=node"\s*$/i.test(l))) {
    for (const l of lines) {
      const m = /"%_prog%"[ \t]+"%dp0%[\\/]+([^"%\r\n]+)"[ \t]+%\*[ \t]*$/.exec(l);
      if (m) return /\.(c|m)?js$/i.test(m[1]!) ? { kind: "node", target: m[1]! } : null;
    }
    return null;
  }
  // a program: `"%dp0%\...\claude.exe"   %*`
  for (const l of lines) {
    const m = /^"%dp0%[\\/]+([^"%\r\n]+)"[ \t]+%\*[ \t]*$/.exec(l);
    if (m) return /\.(exe|com)$/i.test(m[1]!) ? { kind: "exe", target: m[1]! } : null;
  }
  return null;
}

/** Is `target` inside `base`'s folder tree? Compared after resolving, case-insensitive, never a UNC path. */
export function insideFolder(W: typeof path.win32, base: string, target: string): boolean {
  const b = W.resolve(base).toLowerCase().replace(/[\\/]+$/, "");
  const t = W.resolve(target).toLowerCase();
  if (t.startsWith("\\\\") || b.startsWith("\\\\")) return false;
  return t.startsWith(`${b}\\`) && !t.slice(b.length + 1).split("\\").includes("..");
}

/** How to start Claude Code: `command` with `prefix` before the real arguments. `shown` is the path to tell the person. */
export type ClaudeLaunch = { ok: true; command: string; prefix: string[]; shown: string } | { ok: false; reason: string };

/** Windows wording for "claude is not there". A bare name is never handed to the system, which would look in the current folder first. */
export function claudeMissing() {
  return "Claude Code is not installed on this computer (the `claude` command was not found). Install Claude Code with Anthropic's Windows installer, log in with your Claude subscription (`claude auth login`), then start the bridge again.";
}

export function refusedLaunch(found: string) {
  return `Claude Code was found as ${found}, which the bridge cannot start safely. Install Claude Code with Anthropic's Windows installer, then start the bridge again.`;
}

/**
 * Works out how to start `claude`. Off Windows: the name as given, nothing added. On Windows: an absolute path, and never a shell
 * (`.exe` directly; a `.js` file or an npm `.cmd` shim as node + the script; anything else is refused).
 */
export function resolveClaudeLaunch(bin: string, env: NodeJS.ProcessEnv = process.env, o: PlatformOpts = {}): ClaudeLaunch {
  const platform = o.platform ?? process.platform;
  if (platform !== "win32") return { ok: true, command: bin, prefix: [], shown: bin };
  const W = path.win32;
  const files = o.files ?? realFiles;
  const nodePath = o.nodePath ?? process.execPath;
  const found = resolveBin(bin, env, o.home ?? os.homedir(), "win32", files);
  // Not found: refuse. Never pass the bare name on: CreateProcess looks in the current folder before PATH, so a planted claude.exe there would run.
  if (!found || !files.exists(found)) return { ok: false, reason: claudeMissing() };
  const ext = W.extname(found).toLowerCase();
  if (ext === ".exe" || ext === ".com") return { ok: true, command: found, prefix: [], shown: found };
  if (ext === ".js" || ext === ".cjs" || ext === ".mjs") return { ok: true, command: nodePath, prefix: [found], shown: found };
  if (ext === ".cmd" || ext === ".bat") {
    let shim: ReturnType<typeof parseCmdShim> = null;
    try {
      shim = parseCmdShim(files.read(found));
    } catch {
      /* unreadable: refused below */
    }
    if (shim) {
      const base = W.dirname(found);
      const target = W.resolve(base, shim.target);
      if (insideFolder(W, base, target) && files.exists(target)) {
        return shim.kind === "exe" ? { ok: true, command: target, prefix: [], shown: target } : { ok: true, command: nodePath, prefix: [target], shown: target };
      }
    }
  }
  return { ok: false, reason: refusedLaunch(found) };
}

/**
 * Stops a child. Off Windows: SIGTERM, as before. On Windows kill() ends only that process and leaves what it started, so the
 * whole tree is ended with taskkill (absolute path under SystemRoot). Resolves when it is done.
 */
/** Marks a child that leads its own process group (spawned `detached` off Windows): stopping it stops the whole group. */
const GROUP_LEADER = Symbol("groupLeader");
const KILL_GRACE_MS = 2000;
const groupGone = (pid: number): boolean => {
  try {
    process.kill(-pid, 0);
    return false;
  } catch (e) {
    return (e as ErrLike).code === "ESRCH";
  }
};
/** SIGTERM to the whole group, SIGKILL after the grace, then waits until no member is left (at most a few seconds more). */
export async function killGroup(pid: number, graceMs = KILL_GRACE_MS): Promise<void> {
  const wait = async (ms: number) => {
    const until = Date.now() + ms;
    while (!groupGone(pid) && Date.now() < until) await new Promise((r) => setTimeout(r, 25));
    return groupGone(pid);
  };
  if (groupGone(pid)) return;
  try { process.kill(-pid, "SIGTERM"); } catch { /* gone, or not ours to signal */ }
  if (await wait(graceMs)) return;
  try { process.kill(-pid, "SIGKILL"); } catch { /* gone */ }
  await wait(3000);
}
// ---- noting what a code turn started (0.3.19) ---------------------------------------------------------------------------
// No guessing: the bridge only ever stops a process it SAW below a code turn's claude (a parent walk of a plain `ps` list) and whose start time
// still matches what it saw. It never reads environments, never matches text, never kills by name.
/** One live process: its pid, its parent, and a start-time text that tells a recycled pid apart. */
export interface ProcRow { pid: number; ppid: number; start: string }
/** macOS and Linux `ps -A -o pid=,ppid=,lstart=` (no environment, no command line). */
export function parsePs(text: string): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]{8}\s+\d{4})\s*$/.exec(line);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), start: m[3]!.replace(/\s+/g, " ") });
  }
  return rows;
}
/** Windows: the process list as JSON from `Get-CimInstance Win32_Process`. */
export function parseWinProcs(text: string): ProcRow[] | null {
  try {
    const v = JSON.parse(text) as unknown;
    const arr = Array.isArray(v) ? v : [v];
    return arr.flatMap((r) => {
      const o = r as { ProcessId?: unknown; ParentProcessId?: unknown; CreationDate?: unknown };
      return typeof o?.ProcessId === "number" && typeof o.ParentProcessId === "number" ? [{ pid: o.ProcessId, ppid: o.ParentProcessId, start: String(o.CreationDate ?? "") }] : [];
    });
  } catch {
    return null;
  }
}
export const WINDOWS_PROC_SCRIPT = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate | ConvertTo-Json -Compress";
/**
 * How long close() lets an open response finish before it cuts the connections. Measured on GitHub's Windows runner: taskkill returns about 100 ms
 * before the child's 'close', so the turn's SSE response is still open when close() starts, and server.close() then waited for the keep-alive
 * timeout (3 to 4 s; runs 46020685013 and 46020700133). 250 ms is a grace for a response that is finishing its last write.
 */
const CLOSE_GRACE_MS = 250;
/**
 * How long a stop or a close waits for a last look at the process list before it goes on with what is already known. Off Windows the list is `ps`
 * (about 20 ms); on Windows it is a PowerShell start that took several seconds on GitHub's runner (run 46025210385: a whole close of 4891 ms), and a
 * stop must not wait that long. The look is still taken, because it finds processes that left the tree; it just cannot hold the stop.
 */
const SNAPSHOT_CAP_MS = 1500;
type ListRun = (file: string, args: string[], env: NodeJS.ProcessEnv) => Promise<string | null>;
const realListRun: ListRun = (file, args, env) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: 20000, maxBuffer: 64 * 1024 * 1024, env, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout)));
  });
/** All live processes by absolute program and a minimal environment. Null: it could not be read. */
export async function listProcs(platform: string, env: NodeJS.ProcessEnv = process.env, run: ListRun = realListRun): Promise<ProcRow[] | null> {
  if (platform === "win32") {
    const out = await run(windowsPowerShell(env), ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_PROC_SCRIPT], dialogEnv("win32", env));
    return out === null ? null : parseWinProcs(out);
  }
  const out = await run("/bin/ps", ["-A", "-o", "pid=,ppid=,lstart="], { PATH: "/usr/bin:/bin", LC_ALL: "C" });
  return out === null ? null : parsePs(out);
}
/** The same list, synchronously (for the exit hook). Null: unreadable, or Windows. */
export function listProcsSync(platform: string): ProcRow[] | null {
  if (platform === "win32") return null;
  try {
    return parsePs(execFileSync("/bin/ps", ["-A", "-o", "pid=,ppid=,lstart="], { timeout: 5000, encoding: "utf8", env: { PATH: "/usr/bin:/bin", LC_ALL: "C" }, maxBuffer: 64 * 1024 * 1024 }));
  } catch {
    return null;
  }
}
/** Every process below `root` by the parent links of this list (not `root` itself). */
export function descendantsOf(rows: readonly ProcRow[], root: number): ProcRow[] {
  const kids = new Map<number, ProcRow[]>();
  for (const r of rows) kids.set(r.ppid, [...(kids.get(r.ppid) ?? []), r]);
  const out: ProcRow[] = [];
  const seen = new Set<number>([root]);
  const todo = [root];
  while (todo.length > 0) {
    for (const k of kids.get(todo.pop()!) ?? []) {
      if (seen.has(k.pid)) continue;
      seen.add(k.pid);
      out.push(k);
      todo.push(k.pid);
    }
  }
  return out;
}
const pidAliveNow = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as ErrLike).code === "EPERM";
  }
};
/**
 * Stops these processes: SIGTERM, then (only for those `stillMine` re-confirms, by a fresh process list and their start times) SIGKILL after the grace,
 * and waits until they are gone (Windows: taskkill /T /F by pid, from the real SystemRoot). Returns the pids still alive.
 */
export async function killPids(pids: readonly number[], o: { graceMs?: number | undefined; platform?: string | undefined; env?: NodeJS.ProcessEnv | undefined; execFile?: PlatformOpts["execFile"] | undefined; stillMine?: ((pids: number[]) => Promise<number[]>) | undefined } = {}): Promise<number[]> {
  const list = [...new Set(pids)].filter((p) => p > 1 && p !== process.pid);
  if (list.length === 0) return [];
  const platform = o.platform ?? process.platform;
  if (platform === "win32") {
    const env = o.env ?? process.env;
    const root = envGet(env, "SystemRoot") ?? envGet(env, "windir") ?? "C:\\Windows";
    const run = o.execFile ?? ((file, args, opts, cb) => execFile(file, args, opts, (e) => cb(e)));
    await Promise.all(list.map((pid) => new Promise<void>((resolve) => {
      try { run(path.win32.join(root, "System32", "taskkill.exe"), ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve()); } catch { resolve(); }
    })));
    return list.filter(pidAliveNow);
  }
  const wait = async (ms: number) => {
    const until = Date.now() + ms;
    while (list.some(pidAliveNow) && Date.now() < until) await new Promise((r) => setTimeout(r, 25));
  };
  for (const p of list) { try { process.kill(p, "SIGTERM"); } catch { /* gone */ } }
  await wait(o.graceMs ?? KILL_GRACE_MS);
  const alive = list.filter(pidAliveNow);
  if (alive.length > 0) {
    const still = o.stillMine ? await o.stillMine(alive) : alive; // a pid that no longer matches what was seen is not touched
    for (const p of still) { try { process.kill(p, "SIGKILL"); } catch { /* gone */ } }
    await wait(3000);
  }
  return list.filter(pidAliveNow);
}

/** State-folder lock files held by bridges of this process (a second bridge on the same folder is refused even in the same process). */
const HELD_LOCKS = new Set<string>();
export function killChild(child: ChildProcess | null | undefined, env: NodeJS.ProcessEnv = process.env, o: PlatformOpts = {}): Promise<void> {
  if (!child) return Promise.resolve();
  const platform = o.platform ?? process.platform;
  if (platform !== "win32") {
    const leader = (child as unknown as Record<symbol, number | undefined>)[GROUP_LEADER];
    if (leader !== undefined) return killGroup(leader, o.graceMs);
    // A chat child leads no group of its own: SIGTERM it, and if it is still there after the same grace a code child's group gets, SIGKILL it.
    child.kill("SIGTERM");
    if (typeof child.once !== "function" || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let hard: NodeJS.Timeout | undefined;
      const done = () => { clearTimeout(soft); clearTimeout(hard); resolve(); };
      const soft = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* gone */ }
        hard = setTimeout(done, 3000); // as killGroup: a last wait for the exit after the SIGKILL
        hard.unref();
      }, o.graceMs ?? KILL_GRACE_MS);
      soft.unref();
      child.once("exit", done);
    });
  }
  const pid = child.pid;
  const root = envGet(env, "SystemRoot") ?? envGet(env, "windir") ?? "C:\\Windows";
  const run = o.execFile ?? ((file, args, opts, cb) => execFile(file, args, opts, (e) => cb(e)));
  return new Promise<void>((resolve) => {
    if (pid === undefined) {
      child.kill();
      return resolve();
    }
    try {
      run(path.win32.join(root, "System32", "taskkill.exe"), ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, (err) => {
        if (err) child.kill(); // taskkill could not run, or the process is already gone
        resolve();
      });
    } catch {
      child.kill();
      resolve();
    }
  });
}

/** A command path as the person should type it. Off Windows: as it is. In PowerShell: under the home folder as "$HOME\...", else single-quoted. */
export function commandPathForPerson(file: string, home = os.homedir(), platform = process.platform): string {
  if (platform !== "win32") return file;
  const W = path.win32;
  const rel = W.relative(home, file);
  if (rel && !rel.startsWith("..") && !W.isAbsolute(rel) && !/[$`"]/.test(rel)) return `"$HOME\\${rel}"`;
  return `'${file.replace(/'/g, "''")}'`;
}

/**
 * Checks, with the CLI's own `auth status`, that the person is logged in with a Claude SUBSCRIPTION.
 * Runs with the billing variables removed, so what it reports is what every turn will use.
 * @returns {Promise<{ok:true, info:{email?:string, subscriptionType:string}} | {ok:false, reason:string}>}
 */
export function checkSubscriptionLogin(claudeBin = "claude", env: NodeJS.ProcessEnv = process.env, platformOpts: PlatformOpts = {}): Promise<{ ok: true; info: { email?: string | undefined; subscriptionType: string } } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    const launch = resolveClaudeLaunch(claudeBin, env, platformOpts);
    if (!launch.ok) {
      resolve({ ok: false, reason: launch.reason });
      return;
    }
    execFile(launch.command, [...launch.prefix, "auth", "status"], { env: childEnv(env), timeout: 20000, windowsHide: true }, (err: ExecFileException | null, stdout) => {
      if (err && !stdout) {
        const missing = err.code === "ENOENT";
        resolve({
          ok: false,
          reason: missing
            ? "Claude Code is not installed on this computer (the `claude` command was not found). Install it from https://claude.com/claude-code, log in with your Claude subscription, then start this bridge again."
            : "Could not ask Claude Code who is logged in (`claude auth status` failed). Update Claude Code, then start this bridge again.",
        });
        return;
      }
      let st: AuthStatus;
      try {
        st = JSON.parse(String(stdout));
      } catch {
        resolve({ ok: false, reason: "Could not read the answer of `claude auth status`. Update Claude Code, then start this bridge again." });
        return;
      }
      if (!st.loggedIn) {
        resolve({ ok: false, reason: "Claude Code is not logged in. Run `claude auth login` and choose your Claude subscription, then start this bridge again." });
        return;
      }
      if (st.authMethod !== "claude.ai" || !st.subscriptionType) {
        resolve({
          ok: false,
          reason: `Claude Code is logged in, but not with a Claude subscription (login type: ${st.authMethod ?? "unknown"}). This bridge only runs on a Claude subscription, never on an API key. Run \`claude auth login\` and choose your Claude subscription, then start this bridge again.`,
        });
        return;
      }
      resolve({ ok: true, info: { email: st.email, subscriptionType: String(st.subscriptionType) } });
    });
  });
}

// ---- code mode: one folder the person chose ---------------------------------------------------------------------------
/** The only Claude Code tools a code turn has. */
/** How long the person has to answer an approve-before-each-write question. */
export const APPROVAL_WAIT_MS = 10 * 60 * 1000;
/** The one extra tool of the per-turn MCP server in an each-write code turn: Claude Code asks it before a write or a command. */
export const APPROVE_TOOL = "bridge_approve";
/** The one tool a sandboxed code turn in a project has to ASK for a wider setting (0.4.1). It can only ask: approval comes from the app, never from the chat. */
export const REQUEST_SETTING_TOOL = "request_setting";
/** No approve, grant or confirm field: the request carries what is wanted and why, nothing that could approve it. */
export const requestSettingSchema = {
  type: "object", additionalProperties: false, required: ["setting", "value", "reason"],
  properties: {
    setting: { type: "string", enum: Object.keys(ALLOWED), description: "The one sandbox setting to widen." },
    value: { description: "true for sandbox.network.allowLocalBinding; the path of one socket inside the project for sandbox.network.allowUnixSockets; one host from the list for sandbox.network.allowedDomains." },
    reason: { type: "string", description: "One short sentence: what is blocked and why you need this." },
  },
};
const requestSettingDescription = `Ask the person to widen ONE sandbox setting for this project. You cannot grant it yourself: the person approves in the app, then the next turn has it. Allowed: ${ALLOWED_LIST.join(" | ")}. After asking, stop this turn and say what is blocked.`;
const approveSchema = { type: "object", properties: { tool_name: { type: "string" }, input: { type: "object" }, tool_use_id: { type: "string" } }, required: ["tool_name", "input"] };
export const CODE_TOOLS = ["Bash", "Read", "Edit", "Write", "Glob", "Grep", "NotebookEdit"];
/** Native Windows runs a reduced code mode: files only, no commands (and so no sandbox to start). */
export const FILES_ONLY_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep"];
/** The two web tools of a folder-mode code turn (0.3.12): WebSearch runs freely; every WebFetch is asked of the person through bridge_approve. */
export const WEB_TOOLS = ["WebSearch", "WebFetch"];
/** The model names a turn may ask for: these aliases, or a full model name. Anything else is refused. */
export const MODEL_ALIASES = ["opus", "sonnet", "haiku", "fable"];
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const FULL_MODEL = /^claude-[a-z0-9][a-z0-9.-]{0,62}$/;
const modelAllowed = (m: unknown): m is string => typeof m === "string" && (MODEL_ALIASES.includes(m) || FULL_MODEL.test(m));
const effortAllowed = (e: unknown): e is string => typeof e === "string" && EFFORTS.includes(e);
/** Claude Code's subagent tool. The CLI (2.1.325) accepts `Agent` in --tools and lists it as `Task` in the init event. Present only when delegateCoding is on. */
export const SUBAGENT_TOOL = "Agent";
const SUBAGENT_TOOL_NAMES = ["Agent", "Task"];
/** The built-in subagent types of Claude Code 2.1.325. A delegating folder code turn denies them in its settings, so only sonnet-coder can be started. */
export const BUILTIN_AGENT_TYPES = ["general-purpose", "Explore", "Plan", "claude", "statusline-setup", "web-fetch", "claude-code-guide"];
const ONLY_CODER_MSG = "Only the sonnet-coder agent may be started in a code turn.";
/** Appended to a delegating code turn's system prompt. */
export const DELEGATE_SENTENCE = "Hand each coding job to the sonnet-coder agent with a detailed brief (files, exact change, checks to run). Then check its work yourself: read the diff and run the checks. Do the planning, reviewing and talking to the person yourself. Put the Agent.Coder rules that apply, and the library units to reuse, into each brief by link and by their text, because the coder cannot read links.";
export const CODER_STANDARDS_SENTENCE = "Before you write or change code, load your platform's coding standards: hand the job to its coding agent (Agent.Coder) with run_named_role when your standing offers it, otherwise open that agent's standards with the platform tools (find_standard or read_record). Before writing new code, search the platform's shared code library for a unit that already does the job, and name each standard you follow by its link.";
/** Added to a code turn's prompt only when the page says it shows an Open button (client.preview === true): the agent builds, the bridge serves the build. */
export const PREVIEW_SENTENCE = "When you change the app, finish by running `npm run build` in the project folder. Do not tell the person to run a terminal command or to start a server. The chat shows an Open button for the built app; after a rebuild, tell them to press Open again to see the new build.";
/** The tail of every code turn's system prompt: the standards sentence, then (when delegating) the delegate sentence. One place, so no branch (project or not, folder or computer) can miss either. */
function codeTurnTail(delegate: boolean | undefined, sep: string, preview = false): string {
  return `${sep}${CODER_STANDARDS_SENTENCE}${delegate ? `${sep}${DELEGATE_SENTENCE}` : ""}${preview ? `${sep}${PREVIEW_SENTENCE}` : ""}`;
}
const CODER_PROMPT = "You write and change code from a brief. Work only inside the folder you were started in. Follow the brief exactly: do not add or change anything it does not ask for. Run the project's tests and typecheck when it has them. Report the files you changed, the exact commands you ran and their results. Claim nothing you did not run. Follow the standards the brief gives you; when the brief names a library unit to reuse, use it rather than writing your own.";
/** The one custom subagent of a delegating code turn. Folder mode gives it exactly the code tools of the turn; computer mode leaves tools out (it inherits). */
export function delegateAgents(filesOnly: boolean, computer: boolean): string {
  const agent: Record<string, unknown> = {
    description: "Writes and changes code from a detailed brief, then reports what it changed and the checks it ran.",
    prompt: CODER_PROMPT,
    model: "sonnet",
  };
  if (!computer) agent.tools = [...(filesOnly ? FILES_ONLY_TOOLS : CODE_TOOLS)];
  return JSON.stringify({ "sonnet-coder": agent });
}
const FOLDER_PROMPT = "Choose the folder where the AI may build your app";
const FOLDER_SUGGEST = /^[A-Za-z0-9 ._-]{1,64}$/;
/** A folder name the page may send: the character rule, no space at either end, and not only spaces and dots. */
const folderNameOk = (n: unknown): n is string => typeof n === "string" && FOLDER_SUGGEST.test(n) && n === n.trim() && !/^[ .]+$/.test(n);
const DIALOG_MAX_MS = 5 * 60 * 1000;
const FILES_ONLY_SENTENCE = "You cannot run commands on this computer: you can only read and write files in this folder. If a step needs a command (install, build, run), tell the person the exact command to run themselves.";
/** Folder mode, 0.3.12: the web tools. A search is free; a page is asked of the person. */
export const WEB_SENTENCE = "You may search the web; opening a web page asks the person first.";
const NETWORK_SENTENCE = "The network reaches only package registries and GitHub's read-only download hosts (codeload.github.com, raw.githubusercontent.com).";
const APP_FOLDER_SENTENCE = "Make each new app in its own subfolder of the code folder, named after the app in lower case with dashes (for example hello-gilbapp). Never put app files at the top level of the code folder. When the person asks about an existing app, work in its subfolder; if it is unclear which app they mean, ask.";
export const GITHUB_ARCHIVE_SENTENCE = "To use code from a public GitHub repository, download the archive of a pinned commit and unpack only the folder you need straight into this folder, in one command, for example: mkdir -p vendor && curl -sSfL https://codeload.github.com/<owner>/<repo>/tar.gz/<commit> | tar -xz -C vendor --strip-components=2 <repo>-<commit>/units/<name> (this gives vendor/<name> for a folder at units/<name>, as in the platform's code library; for a folder at another depth, set --strip-components to the number of path parts before its name). git clone, pull and push do not work in this folder.";
/** A session-approval code turn cannot answer an approval prompt, so a command Claude Code cannot check is refused: say so before it happens (not used in each-write turns, where the person is asked). */
export const PLAIN_COMMANDS_SENTENCE = "Keep every command inside this folder and plain: no temporary folder or other folder outside it, no $VARIABLE in a path, and no recursive delete (rm -r or rm -rf, in any spelling). Claude Code asks before it runs a command it cannot check; nobody can answer here, so the command is refused, and Claude Code then refuses every later command that needs approval in this turn.";
/** Claude Code refuses to let a code turn write .npmrc; the bridge writes the project's install-links line itself, and the coder checks it is there. */
export const NPMRC_SENTENCE = "Never write or change a .npmrc or .yarnrc file here: Claude Code refuses it as a sensitive file. Before you install packages, open this folder's .npmrc with the Read tool, never with cat or another shell command: a project folder made in the chat gets the one line install-links=true from the bridge, so code-library units install as copies. If that line is not there, or the Read tool refuses the file, tell the person to add the line to a plain .npmrc file in that folder themselves, and until then pass --install-links to every npm install and npm ci.";
/** What the bridge writes into a project folder it creates, so code-library units install as copies (the agent may not write .npmrc). */
export const PROJECT_NPMRC_TEXT = "install-links=true\n";
/** The vendoring and .npmrc sentences of a folder-mode code turn; the plain-commands one only where nobody can answer an approval (session). */
const vendorSentences = (approval: "session" | "each-write") => approval === "each-write" ? `${GITHUB_ARCHIVE_SENTENCE} ${NPMRC_SENTENCE}` : `${GITHUB_ARCHIVE_SENTENCE} ${PLAIN_COMMANDS_SENTENCE} ${NPMRC_SENTENCE}`;
/** Printed by a start and by --install when full access is on. 0.3.19: the way off is the access switch in GilbApp or `--access folder`; running the install line again without --full-access keeps the saved mode. */
export const FULL_ACCESS_NOTICE = "Full access: commands run without asking inside a sandbox; they can write only in your code folder, ~/Developer and temp, and your keys and the bridge's files are locked. Turn it off: use the access switch in GilbApp, or run the bridge with --access folder. Running the install line again without --full-access keeps the mode saved on this computer.";
/** Windows has no sandbox here: computer mode there asks about every call. */
export const FULL_ACCESS_NOTICE_WINDOWS = "Full computer access is ON: chat code turns can read and change anything your user can, run any command, use the network and your logins, like Claude Code in your terminal. Windows has no sandbox here, so every call is asked in the chat. Turn it off: use the access switch in GilbApp, or run the bridge with --access folder. Running the install line again without --full-access keeps the mode saved on this computer.";
/** Printed when --full-access is given but the saved mode on this computer says folder: the saved mode wins. */
export const FULL_ACCESS_SAVED_FOLDER_NOTICE = "The mode saved on this computer is folder mode, and it wins over --full-access. To turn full access on, use the access switch in GilbApp (a window on this computer asks you to allow it).";
/**
 * Computer mode loads the person's own MCP servers too (no --strict-mcp-config), and a person often has several Gilb connectors
 * (GilbPlatform, gilb-kai, gilb-kaidev, ...). Agents picked the wrong one: the wrong principal, a vault never selected.
 * This chat's connector is the bridge's `gilb` server, so the prompt names it and says the others are not this chat's.
 */
export const GILB_CONNECTOR_SENTENCE = "For GilbPlatform, use only the mcp__gilb__* tools; other Gilb connectors are not this chat's.";

/** The computer-mode paragraph for a turn started inside a project folder. */
const computerProjectParagraph = (project: string, p: string, folder: string) => `You are working on the person's own computer with the same access as Claude Code in their terminal. Start in the project folder "${project}" (${p}) inside the code folder "${folder}". Anything that needs the person's permission is asked of them in the chat; if they decline, say so in one line and do not try another way around it. ${GILB_CONNECTOR_SENTENCE} When you finish, list the files you changed.`;
const PROJECT_PACKAGE_JSON_SENTENCE = "Before any npm, pnpm or yarn install, make sure this project folder has its own package.json (run npm init -y first if it has none), so packages are installed here and not in a parent folder.";
/** The computer-mode paragraph for a turn started in the code folder. */
const computerParagraph = (name: string, p: string) => `You are working on the person's own computer with the same access as Claude Code in their terminal. Start in the folder "${name}" (${p}). ${APP_FOLDER_SENTENCE} Anything that needs the person's permission is asked of them in the chat; if they decline, say so in one line and do not try another way around it. ${GILB_CONNECTOR_SENTENCE} When you finish, list the files you changed.`;
const OWN_PACKAGE_JSON_SENTENCE = "Before any npm, pnpm or yarn install, make sure the app's subfolder has its own package.json (run npm init -y there first if it has none), so packages are installed there and not in a parent folder.";
/**
 * Computer mode: tell the person's own Claude Code (and so every MCP server it starts, the gilb-connector among them) which
 * Claude session this turn belongs to. Each turn is a new `claude -p --resume` process, so the parent process changes every
 * turn; the session id does not. The connector keys the person's remembered vault choice on it.
 */
export function withSessionId(env: NodeJS.ProcessEnv, computer: boolean | undefined, sessionId: string): NodeJS.ProcessEnv {
  return computer && sessionId ? { ...env, GILB_CLAUDE_SESSION_ID: sessionId } : env;
}

/** The only characters an each-write glob may use. Braces, brackets, backslashes, "~" and ":" can reach elsewhere or hide a "..". */
const SAFE_GLOB = /^[A-Za-z0-9_\-./*?]+$/;
const CODE_CWD_ERROR = "The bridge stopped this code turn: Claude Code did not start in the code folder.";
/** A refused init named a credential other than the subscription (a non-empty apiKeySource other than "none"). */
export const API_KEY_REFUSED_ERROR = "Claude Code did not confirm that this run uses your Claude subscription: it reported another credential (an API key or a key helper), not your Claude subscription, so the bridge stopped it. Remove ANTHROPIC_API_KEY / apiKeyHelper from your Claude Code settings, or run `claude auth login` with your subscription.";
/** Every other billing refusal: no init, init after the answer, or a missing, null, empty or non-string apiKeySource. */
export const SUBSCRIPTION_UNPROVEN_ERROR = "Claude Code did not confirm that this run uses your Claude subscription (it did not say how it is signed in before it answered), so the bridge stopped the run. The bridge never runs on an API key. Send your message again; if this repeats, run `claude auth status` in Terminal.";
/** A project name: 1 to 64 letters, digits, dots, dashes or underscores, starting with a letter or digit (so never "." or ".."). */
export const validProjectName = (n: unknown): n is string => typeof n === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(n);
/** Windows reserved device names (with or without an extension), refused on every platform so a project folder can move between computers. */
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const projectNameOk = (n: unknown): n is string => validProjectName(n) && n.toLowerCase() !== "node_modules" && !WIN_RESERVED.test(n) && !/[. ]$/.test(n);
const PROJECT_CHANGED = "The project folder changed on disk.";
const NO_SUCH_PROJECT = "No such project.";
const CODE_FOLDER_CHANGED = "The code folder changed on disk. Choose it again.";
/**
 * The answer once code mode is already off.
 * @param why The reason it was switched off, in a few words.
 * @returns The sentence a code turn is given, ending with the same next step as a real folder change.
 */
const codeModeOff = (why: string) => `Code mode is off because ${why}. Choose the code folder again.`;
const SANDBOX_START_ERROR = "Claude Code could not start its sandbox on this computer, so the code turn was stopped.";
const CODE_LIMITS_ERROR = "The bridge stopped this code turn: Claude Code did not start with the folder limits.";

type Dirent = { name: string; isDirectory(): boolean; isSymbolicLink(): boolean };
/**
 * THE one way the bridge reads a real path: the system's own spelling (on a case-insensitive disk the real case; on Windows the long
 * name, not the 8.3 short one). Every comparison of folders goes through it, so two forms of one path never meet.
 */
export function realPath(p: string): string {
  return fs.realpathSync.native(p);
}
/** Why a child's init was refused or code mode went off. A closed list: the page may switch on these codes, never on a sentence. */
export type CodeOffCode = "init-first-not-root" | "init-outside-folder" | "init-no-cwd" | "init-folder-missing" | "folder-check-failed" | "folder-missing";
/** What a code turn's init event is checked against and how the folder is read. `realpath` and `idOf` are only for tests. */
export interface InitFolderCheck {
  /** 1 for the first init of this child, 2 and up for a later one. Anything but a positive whole number is refused. */
  initNumber: number;
  /** The `cwd` the init event reported (anything: it is the child's word). */
  reported: unknown;
  /** The checked folder: its real path and its device:inode recorded at the check. */
  root: { path: string; id: string };
  realpath?: ((p: string) => string) | undefined;
  idOf?: ((p: string) => string) | undefined;
  /** Is this path a directory? Defaults to the file system. For tests. */
  isDirectory?: ((p: string) => boolean) | undefined;
}
/**
 * Is the working folder a code turn's child reports at one init acceptable? Pure: no child, no bridge state.
 *
 * At any init the reported folder must be an absolute path to a directory, and the init number a positive whole number.
 * Init 1: the reported folder must be exactly the checked folder (same real path, and the same device and inode as recorded at the check).
 * Init 2 and later: the real path of the reported folder (links resolved, the real letter case) must be the root's real path or lie under
 * it (the root's real path plus the platform's own separator, so "a-evil" is not inside "a"), and the root itself must still be the same
 * folder (same real path, same device and inode). A path that cannot be resolved is a mismatch.
 *
 * Decision: a later init may name a subfolder because a real agent moves into a subfolder to work (cd src, a build step) and
 * Claude Code then reports that folder in a later init; that is still inside the folder the person chose. Init 1 may not, because the
 * bridge started the child itself: at that moment anything but the root means the child did not start where the bridge put it.
 * @param c The init number, what it reported and the checked root.
 * @returns ok, or the reason code of the refusal.
 */
export function initFolderDecision(c: InitFolderCheck): { ok: true } | { ok: false; reasonCode: CodeOffCode } {
  const real = c.realpath ?? realPath;
  const id = c.idOf ?? ((p: string) => {
    try {
      const st = fs.lstatSync(p, { bigint: true });
      return st.isDirectory() ? `${st.dev}:${st.ino}` : "";
    } catch {
      return "";
    }
  });
  const isDir = c.isDirectory ?? ((p: string) => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
  if (!Number.isInteger(c.initNumber) || c.initNumber < 1) return { ok: false, reasonCode: "folder-check-failed" };
  if (typeof c.reported !== "string" || c.reported === "" || !path.isAbsolute(c.reported)) return { ok: false, reasonCode: "init-no-cwd" };
  if (c.root.id === "") return { ok: false, reasonCode: "folder-check-failed" };
  if (c.initNumber === 1) {
    try {
      return real(c.reported) === c.root.path && id(c.reported) === c.root.id ? { ok: true } : { ok: false, reasonCode: "init-first-not-root" };
    } catch {
      return { ok: false, reasonCode: "init-folder-missing" };
    }
  }
  let now: string;
  try {
    now = real(c.reported);
  } catch {
    return { ok: false, reasonCode: "init-folder-missing" };
  }
  if (now !== c.root.path && !now.startsWith(c.root.path.endsWith(path.sep) ? c.root.path : c.root.path + path.sep)) return { ok: false, reasonCode: "init-outside-folder" };
  if (!isDir(now)) return { ok: false, reasonCode: "init-folder-missing" };
  try {
    if (real(c.root.path) !== c.root.path || id(c.root.path) !== c.root.id) return { ok: false, reasonCode: "folder-check-failed" };
  } catch {
    return { ok: false, reasonCode: "folder-missing" };
  }
  return { ok: true };
}
/**
 * The cause of "init-outside-folder", in the one wording both the stopped turn and the later off sentence use. The code is only ever set at
 * init 2 or later (init 1 gives "init-first-not-root"), so the child did start in the folder: saying "did not start" would name the wrong cause.
 */
const MOVED_OUTSIDE = "Claude Code moved outside the code folder";
/**
 * One reason per cause: the words after "Code mode is off because", one per reason code (no two codes share a sentence), with no path in them.
 * The paired hello and the answer to a code turn both build their sentence from this, so the two never disagree.
 */
const CODE_OFF_WHY: Record<CodeOffCode, string> = {
  "init-first-not-root": "an earlier code turn was stopped: Claude Code started in another folder than the code folder",
  "init-outside-folder": `an earlier code turn was stopped: ${MOVED_OUTSIDE}`,
  "init-no-cwd": "an earlier code turn was stopped: Claude Code did not say which folder it works in",
  "init-folder-missing": "an earlier code turn was stopped: Claude Code reported a folder that cannot be found",
  "folder-check-failed": "the code folder changed on disk",
  "folder-missing": "the code folder cannot be found",
};
/** What the stopped turn itself is told: the real reason, one per code. */
const CODE_STOP_ERROR: Record<CodeOffCode, string> = {
  "init-first-not-root": CODE_CWD_ERROR,
  "init-no-cwd": CODE_CWD_ERROR,
  "init-outside-folder": `The bridge stopped this code turn: ${MOVED_OUTSIDE}.`,
  "init-folder-missing": "The bridge stopped this code turn: Claude Code reported a folder that cannot be found.",
  "folder-check-failed": CODE_FOLDER_CHANGED,
  "folder-missing": CODE_FOLDER_CHANGED,
};
export interface WorkspaceCheckOpts {
  home: string;
  platform: string;
  stateDirs: string[];
  realpath?: ((p: string) => string) | undefined;
  stat?: ((p: string) => { isDirectory(): boolean }) | undefined;
  readdir?: ((p: string) => string[]) | undefined;
}

/**
 * Is this folder fit to be a code folder? It must exist (it is never created), and it must not be the filesystem root, the
 * home folder or a parent of it, a folder that holds secrets or this bridge's own state, or a folder that directly holds .ssh, .aws or .gnupg.
 */
export function validateWorkspace(input: string, o: WorkspaceCheckOpts): { ok: true; path: string; name: string } | { ok: false; reason: string } {
  const win = o.platform === "win32";
  const P = win ? path.win32 : path.posix;
  const ci = win || o.platform === "darwin";
  // the system's own spelling (on a case-insensitive disk the real case, not the case that was typed)
  const realpath = o.realpath ?? realPath;
  const stat = o.stat ?? ((p: string) => fs.statSync(p));
  const readdir = o.readdir ?? ((p: string) => fs.readdirSync(p));
  const key = (p: string) => (ci ? p.toLowerCase() : p);
  const inside = (child: string, parent: string) => {
    const c = key(child);
    const pa = key(parent);
    return c === pa || c.startsWith(pa.endsWith(P.sep) ? pa : pa + P.sep);
  };
  const missing = `The code folder ${input} does not exist or is not a folder.`;
  let real: string;
  try {
    const resolved = P.resolve(input);
    if (!input || !stat(resolved).isDirectory()) return { ok: false, reason: missing };
    real = P.resolve(realpath(resolved));
  } catch {
    return { ok: false, reason: missing };
  }
  if (P.parse(real).root === real) return { ok: false, reason: `The code folder ${real} is the root of the disk. Make a folder for your code, for example ~/MyJackfruitCode, and start the bridge with --workspace ~/MyJackfruitCode.` };
  const tryReal = (p: string) => {
    try {
      return P.resolve(realpath(p));
    } catch {
      return P.resolve(p);
    }
  };
  const homes = [...new Set([P.resolve(o.home), tryReal(o.home)])];
  if (homes.some((h) => key(h) === key(real))) return { ok: false, reason: `The code folder cannot be your home folder. Make a folder for your code, for example ~/MyJackfruitCode, and start the bridge with --workspace ~/MyJackfruitCode.` };
  if (homes.some((h) => inside(h, real))) return { ok: false, reason: `The code folder ${real} holds your home folder. Choose a folder inside it, for example ~/MyJackfruitCode.` };
  if (!homes.some((h) => inside(real, h))) return { ok: false, reason: `The code folder must be inside your home folder, for example ~/MyJackfruitCode.` };
  const secretNames = [".ssh", ".aws", ".gnupg", ".config", ".claude", ...(o.platform === "darwin" ? ["Library"] : []), ...(win ? ["AppData"] : [])];
  const barred = [...homes.flatMap((h) => secretNames.map((n) => P.join(h, n))), ...o.stateDirs.flatMap((d) => [P.resolve(d), tryReal(d)])];
  const hit = barred.find((b) => inside(real, b));
  if (hit) return { ok: false, reason: `The code folder ${real} is inside ${hit}, which holds secrets or the bridge's own files. Make a folder for your code, for example ~/MyJackfruitCode.` };
  const holds = o.stateDirs.flatMap((d) => [P.resolve(d), tryReal(d)]).find((d) => inside(d, real));
  if (holds) return { ok: false, reason: `The code folder ${real} holds the bridge's own state folder ${holds}. Choose a folder made for your code, for example ~/MyJackfruitCode.` };
  try {
    const names = readdir(real).map((n) => key(n));
    const bad = [".ssh", ".aws", ".gnupg"].find((n) => names.includes(n));
    if (bad) return { ok: false, reason: `The code folder ${real} contains a ${bad} folder, so it looks like a home folder. Choose a folder made for your code.` };
  } catch {
    return { ok: false, reason: missing };
  }
  return { ok: true, path: real, name: P.basename(real) };
}

/** A CLAUDE_CONFIG_DIR the person set holds Claude Code's own login and settings: it is unreadable in a code turn too. `~` is left for Claude Code to expand. */
function configDirDeny(dir: string): string[] {
  const d = dir.trim();
  if (!d) return [];
  return [d.startsWith("~") ? d : path.resolve(d)];
}

/**
 * Folders and single files that hold credentials, `~/`-relative (0.3.17). ONE list for both modes: folder mode (codeTurnSettings) and full
 * access (computerSandboxSettings) both deny reading all of it, so full access can never read more than folder mode. `~/.config` also covers
 * `~/.config/gcloud`; `~/.base-deploy` and `~/Developer/.base-deploy` hold the signing and deploy keys.
 */
export function credentialReadDeny(platform: string): string[] {
  const list = ["~/.ssh", "~/.aws", "~/.gnupg", "~/.config", "~/.claude", "~/.gilb-claude-code-bridge", "~/.base-deploy", "~/Developer/.base-deploy", "~/.npmrc", "~/.yarnrc", "~/.yarnrc.yml", "~/.pypirc", "~/.netrc", "~/.git-credentials", "~/.docker", "~/.kube", "~/.azure"];
  if (platform !== "win32") {
    list.push("~/Library/Keychains", "~/Library/Application Support/Google/Chrome", "~/Library/Application Support/Firefox", "~/Library/Safari");
  }
  return list;
}

/** The credential list as absolute paths for this home (`~` expanded), plus a CLAUDE_CONFIG_DIR the person set. One source for the sandbox, the permission rules and the approval check. */
export function credentialPlaces(home: string, platform: string, claudeConfigDir = ""): string[] {
  const absHome = (p: string) => (p.startsWith("~/") ? path.join(home, p.slice(2)) : p.startsWith("~") ? path.join(home, p.slice(1)) : p);
  return [...new Set([...credentialReadDeny(platform), ...configDirDeny(claudeConfigDir)].map(absHome))];
}

/** Each place and its real-path spelling. */
function withRealPaths(list: readonly string[]): string[] {
  return [...new Set(list.flatMap((p) => [p, resolveThroughLinks(p)]))];
}

/** Permission rules (0.3.17) that keep Claude Code's own file tools out of these absolute places: Read and Edit (Edit covers Write), the place and everything under it. */
export function fileToolDenyRules(places: readonly string[]): string[] {
  return withRealPaths(places).flatMap((p) => ["Read", "Edit"].flatMap((t) => [`${t}(/${p})`, `${t}(/${p}/**)`]));
}

/** The Claude Code settings a code turn runs with (passed inline with --settings, never a file in the folder). */
export function codeTurnSettings(home: string, platform: string, extraDenyRead: string[] = [], approval: "session" | "each-write" = "session", claudeConfigDir = "", delegate = false, storeDeny: readonly string[] = []) {
  // sandbox paths are home-relative (`~/`), which Claude Code expands itself; the file-tool rules need absolute paths, so they use `home`
  const fileRules = fileToolDenyRules([...credentialPlaces(home, platform, claudeConfigDir), ...extraDenyRead.filter((p) => path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p))]);
  const agentDeny = delegate ? SUBAGENT_TOOL_NAMES.flatMap((n) => BUILTIN_AGENT_TYPES.map((t) => `${n}(${t})`)) : [];
  if (platform === "win32") {
    // Files-only mode: no command tool, so no sandbox block; the permission rules stay.
    return { permissions: { deny: ["WebFetch", "WebSearch", ...agentDeny, ...fileRules], disableBypassPermissionsMode: "disable" } }; // Windows files-only: no web tools
  }
  const denyRead = credentialReadDeny(platform);
  return {
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: approval !== "each-write", // each-write: every command asks too, because a command can write
      network: {
        // a project's own tests start a local server; binding a local port does not widen outbound reach or the folder rules.
        allowLocalBinding: true,
        allowedDomains: ["registry.npmjs.org", "registry.yarnpkg.com", "pypi.org", "files.pythonhosted.org", "codeload.github.com", "raw.githubusercontent.com"],
      },
      // storeDeny (0.4.1) is the bridge's grant store: a command may neither read nor write it, so it cannot plant or edit a grant.
      filesystem: { denyRead: [...denyRead, ...extraDenyRead, ...configDirDeny(claudeConfigDir), ...storeDeny], ...(storeDeny.length > 0 ? { denyWrite: [...storeDeny] } : {}) },
    },
    permissions: {
      deny: [...agentDeny, ...fileRules],
      disableBypassPermissionsMode: "disable",
    },
  };
}

/** Where `~/.gilb-claude-code-bridge*` begins: the bridge's state folder, its file and any other install's folder. */
const BRIDGE_STATE_PREFIX = ".gilb-claude-code-bridge";
/** The connector's keys and script (`~/.gilb-connector*`): unreadable and unwritable in a sandboxed turn. */
const CONNECTOR_PREFIX = ".gilb-connector";

/**
 * The places a sandboxed computer-mode turn can neither read nor write (0.3.13): ssh keys, the deploy folders (`~/Developer/.base-deploy`
 * and, since 0.3.17, `~/.base-deploy` where the signing keys live), the bridge's own files and state, LaunchAgents, the cloud and gpg logins, .netrc, the gh login and the macOS Keychain folders. Absolute paths (the sandbox and the
 * permission rules both take them). `extra` only ADDS places (tests use it for fake ones); nothing here can be switched off.
 */
export function protectedPlaces(home: string, extra: readonly string[] = [], readdir: (p: string) => string[] = (p) => fs.readdirSync(p)): string[] {
  const j = (...p: string[]) => path.join(home, ...p);
  const list = [j(".ssh"), j("Developer", ".base-deploy"), j(".base-deploy"), j(BRIDGE_STATE_PREFIX), j("Library", "LaunchAgents"), j(".aws"), j(".gnupg"), j(".netrc"), j(".config", "gh"), j("Library", "Keychains"), j(".claude.json"), j(CONNECTOR_PREFIX)];
  try {
    for (const e of readdir(home)) if (e.startsWith(BRIDGE_STATE_PREFIX) || e.startsWith(CONNECTOR_PREFIX)) list.push(j(e));
  } catch {
    /* an unreadable home leaves the fixed list */
  }
  list.push(...extra.filter((e) => typeof e === "string" && path.isAbsolute(e)));
  return [...new Set(list)];
}

/** Splits a path into its names. On Windows both `\` and `/` separate; elsewhere only `/` does (a backslash is a name character there). */
const pathNames = (p: string): string[] => p.split(path.sep === "\\" ? /[\\/]+/ : /\/+/).filter((x) => x !== "");
/** A path as the system would reach it: every link followed (a link whose target is missing resolves to where the target would be), `..` applied after the links. */
export function resolveThroughLinks(p: string): string {
  // An absolute path starts at its root ("/" or "C:\\"); the root is not a name to walk.
  const root0 = path.isAbsolute(p) ? path.parse(p).root : "/";
  const parts = pathNames(p.slice(path.isAbsolute(p) ? root0.length : 0));
  let cur = root0;
  let hops = 0;
  while (parts.length > 0) {
    const seg = parts.shift()!;
    if (seg === ".") continue;
    if (seg === "..") {
      cur = path.dirname(cur);
      continue;
    }
    const next = path.join(cur, seg);
    let target: string | null = null;
    try {
      if (fs.lstatSync(next).isSymbolicLink()) target = fs.readlinkSync(next);
    } catch {
      /* does not exist: kept as written */
    }
    if (target !== null) {
      if (++hops > 40) return path.join(cur, seg, ...parts); // a loop: stop following, keep the rest
      if (path.isAbsolute(target)) cur = path.parse(target).root;
      parts.unshift(...pathNames(path.isAbsolute(target) ? target.slice(path.parse(target).root.length) : target));
    } else {
      cur = next;
    }
  }
  return cur;
}

export interface ProtectOpts {
  home: string;
  places: readonly string[];
  /** The folder a relative path is resolved against (the turn's start folder). */
  base: string;
  /** Names are compared without case (macOS and Windows disks). */
  ci: boolean;
}
const lowerIf = (ci: boolean, s: string) => (ci ? s.toLowerCase() : s);
const underPlace = (ci: boolean, real: string, place: string) => {
  const a = lowerIf(ci, real);
  const b = lowerIf(ci, place);
  return a === b || a.startsWith(b.endsWith(path.sep) || b.endsWith("/") ? b : `${b}${path.sep}`);
};
/** The protected place this path reaches (written plainly, through `~`, `$HOME`, `..` or a link, even a dangling one), or null. A path that cannot be read as one (a NUL byte) counts as protected: it is refused. */
export function protectedHit(raw: string, o: ProtectOpts): string | null {
  if (raw.includes("\0")) return raw;
  const home = o.home;
  const forms = new Set<string>();
  const expand = (s: string) => {
    if (s === "~" || s.startsWith("~/")) return path.join(home, s.slice(1));
    const m = /^\$(?:\{HOME\}|HOME)(?=\/|$)/.exec(s);
    return m ? path.join(home, s.slice(m[0].length)) : s;
  };
  const x = expand(raw);
  const abs = path.isAbsolute(x) ? x : path.join(o.base, x);
  forms.add(abs); // as written, links followed after `..` was applied to the real folders
  forms.add(path.resolve(abs)); // after a plain lexical normalisation
  const prefixHome = lowerIf(o.ci, resolveThroughLinks(home));
  for (const f of forms) {
    const real = resolveThroughLinks(f);
    for (const cand of [f, path.resolve(f), real]) {
      for (const place of o.places) {
        const placeReal = resolveThroughLinks(place);
        if (underPlace(o.ci, cand, place) || underPlace(o.ci, cand, placeReal) || underPlace(o.ci, real, placeReal) || underPlace(o.ci, real, place)) return place;
      }
    }
    // `~/.gilb-claude-code-bridge*`: any name that starts so, directly in the home folder (also one that does not exist yet).
    const rel = lowerIf(o.ci, real);
    if (rel.startsWith(`${prefixHome}${path.sep}`)) {
      const first = rel.slice(prefixHome.length + 1).split(/[\\/]/)[0] ?? "";
      for (const pre of [BRIDGE_STATE_PREFIX, CONNECTOR_PREFIX]) if (first.startsWith(lowerIf(o.ci, pre))) return path.join(home, pre) + "*";
    }
  }
  return null;
}

/** Does this Glob pattern name a protected place before any `**`? Absolute, `~` and `$HOME` patterns are read segment by segment; a pattern that starts with `**` is left to the permission deny rules. */
export function globHitsProtected(pattern: string, o: ProtectOpts): string | null {
  if (pattern.includes("\0")) return pattern;
  let pat = pattern;
  if (pat === "~" || pat.startsWith("~/")) pat = path.join(o.home, pat.slice(1));
  else if (/^\$(?:\{HOME\}|HOME)(?=\/|$)/.test(pat)) pat = path.join(o.home, pat.replace(/^\$(?:\{HOME\}|HOME)/, ""));
  const segs = (path.isAbsolute(pat) ? pat : path.join(o.base, pat)).split(path.sep === "\\" ? /[\\/]+/ : /\/+/).filter((x) => x !== "");
  if (!/[*?[\]{}]/.test(pat)) return protectedHit(pattern, o);
  const segRe = (g: string) => {
    let r = "";
    for (let i = 0; i < g.length; i++) {
      const c = g[i]!;
      if (c === "*") r += "[^/]*";
      else if (c === "?") r += "[^/]";
      else if (c === "[") {
        const e = g.indexOf("]", i + 1);
        if (e < 0) r += "\\[";
        else {
          r += `[${g.slice(i + 1, e).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
          i = e;
        }
      } else if (c === "{") {
        const e = g.indexOf("}", i + 1);
        if (e < 0) r += "\\{";
        else {
          r += `(?:${g.slice(i + 1, e).split(",").map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`;
          i = e;
        }
      } else r += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`^${r}$`, o.ci ? "i" : "");
  };
  for (const place of o.places) {
    for (const pl of new Set([place, resolveThroughLinks(place)])) {
      const ps = pathNames(pl);
      let ok = true;
      for (let i = 0; i < ps.length && ok; i++) {
        const s = segs[i];
        if (s === undefined) ok = false; // the pattern ends above the place: it names the folder at most
        else if (s === "**") ok = false; // anything may follow: the deny rules decide
        else if (!segRe(s).test(ps[i]!)) ok = false;
      }
      if (ok && segs.length > ps.length) return place; // a pattern that ends AT the place lists its name only
    }
  }
  return null;
}

/** Places a sandboxed command may not WRITE although they sit inside a writable area: the server-ops checkout. (Reads stay open.) */
export function writeOnlyPlaces(home: string): string[] {
  return [path.join(home, "Developer", "GilbServerOps")];
}
/** Where a sandboxed turn may write: the code folder (the workspace root, which holds every project), ~/Developer, /tmp and the temp folders. Nothing else in home. */
export function writableAreas(home: string, workspaceRoot: string, tmpDirs: readonly string[] = []): string[] {
  return [workspaceRoot, path.join(home, "Developer"), "/tmp", ...tmpDirs];
}
const WRITE_PRUNE = new Set(["node_modules", ".git", ".npm-cache", "Library", ".Trash"]);
/** Every existing `.claude` folder under these roots (settings and hooks that Claude Code would run outside the sandbox). Bounded: depth 6, 5000 entries, one second. */
export function claudeDirs(roots: readonly string[], max = 5000, ms = 1000): string[] {
  const found: string[] = [];
  let seen = 0;
  const stop = Date.now() + ms;
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || seen > max || Date.now() > stop) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      seen++;
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      if (e.name === ".claude") found.push(full);
      else if (!WRITE_PRUNE.has(e.name)) walk(full, depth + 1);
    }
  };
  for (const r of roots) walk(r, 0);
  return found;
}
/** Glob forms of the same rule, so a `.claude` folder made DURING the turn is covered too (checked live: see the README). */
export function claudeGlobs(workspaceRoot: string, home: string): string[] {
  return [workspaceRoot, `${home}/Developer`].flatMap((r) => [`${r}/.claude`, `${r}/.claude/**`, `${r}/**/.claude`, `${r}/**/.claude/**`]);
}
/** Git runs code from these on the person's next `git`: hooks; config (hooksPath, fsmonitor, sshCommand, pager, `!` aliases, filter and textconv drivers); info/attributes (selects the filters). They are denied for every repo that EXISTS when the turn starts. A deny glob on .git/config would also refuse `git init`, so none is used: a repo created during the turn is the documented gap. The rest of .git (index, objects, refs, COMMIT_EDITMSG) stays writable. */
export function gitPlaces(roots: readonly string[], max = 5000, ms = 1000): string[] {
  const found: string[] = [];
  let seen = 0;
  const stop = Date.now() + ms;
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || seen > max || Date.now() > stop) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      seen++;
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      if (e.name === ".git") found.push(path.join(full, "hooks"), path.join(full, "config"), path.join(full, "info", "attributes"));
      else if (!WRITE_PRUNE.has(e.name)) walk(full, depth + 1);
    }
  };
  for (const r of roots) walk(r, 0);
  return found;
}
/** Why a file tool may not WRITE this path (null = it may): outside the writable areas, a `.claude` settings or hooks place, or a write-only-protected place. Links are followed. */
export function writeBlock(raw: string, o: ProtectOpts, areas: readonly string[], writeOnly: readonly string[]): string | null {
  if (raw.includes("\0")) return "The path is not valid.";
  const x = raw === "~" || raw.startsWith("~/") ? path.join(o.home, raw.slice(1)) : /^\$(?:\{HOME\}|HOME)(?=\/|$)/.test(raw) ? path.join(o.home, raw.replace(/^\$(?:\{HOME\}|HOME)/, "")) : raw;
  const abs = path.isAbsolute(x) ? x : path.join(o.base, x);
  const real = resolveThroughLinks(abs);
  const lex = resolveThroughLinks(path.resolve(abs));
  for (const c of [real, lex]) {
    const segs = lowerIf(o.ci, c).split("/");
    const last = segs[segs.length - 1] ?? "";
    if (segs.includes(".claude") || last === ".claude.json" || last === ".mcp.json") return "Claude Code settings and hooks cannot be written here (a .claude folder, .claude.json or .mcp.json).";
    const gi = segs.indexOf(".git");
    if (gi >= 0 && (segs[gi + 1] === "hooks" || segs[gi + 1] === "config" || (segs[gi + 1] === "info" && segs[gi + 2] === "attributes"))) return "Git hooks and config cannot be written here (.git/hooks, .git/config, .git/info/attributes).";
    for (const w of writeOnly) if (underPlace(o.ci, c, w) || underPlace(o.ci, c, resolveThroughLinks(w))) return `This place is protected: ${w}.`;
  }
  const roots = areas.flatMap((a) => [a, resolveThroughLinks(a)]);
  if (!roots.some((a) => underPlace(o.ci, real, a)) || !roots.some((a) => underPlace(o.ci, lex, a))) return "Writes are allowed only in the code folder, ~/Developer and the temp folder.";
  return null;
}

/**
 * Computer mode with the OS sandbox (0.3.13). Commands run with no question inside Claude Code's own sandbox (Seatbelt on macOS, bubblewrap
 * on Linux): they may write the home folder, the temp folders and the code folder, reach any host, and can neither read nor write the
 * protected places, however the command is written. The permission rules are the second line for Claude Code's own file tools and for
 * Glob and Grep; the short `ask` list sends sudo, security, launchctl, osascript and GilbServerOps ship/server commands to the person.
 */
export const ASKED_COMMAND_RULES = ["sudo", "security", "launchctl", "osascript"].flatMap((c) => [`Bash(${c})`, `Bash(${c} *)`, `Bash(*${c} *)`]).concat(["Bash(*GilbServerOps*)"]);
export function computerSandboxSettings(home: string, folder: string, places: readonly string[], tmpDirs: readonly string[] = [], extraWriteDeny: readonly string[] = [], claudeConfigDir = "", platform: string = process.platform) {
  const withReal = withRealPaths;
  const deny = withReal(places);
  // Full access never reads less-protected than folder mode (0.3.17): the folder-mode credential list and the CLAUDE_CONFIG_DIR are denied for reading too.
  const denyReadAll = withReal([...places, ...credentialPlaces(home, platform, claudeConfigDir)]);
  const ruleDeny = fileToolDenyRules(denyReadAll); // Claude Code's own Read and Edit tools: the same places as the sandbox's denyRead
  return {
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: true,
      network: {
        // a project's own tests start a local server; binding a local port does not widen outbound reach or the folder rules.
        allowLocalBinding: true,
        allowedDomains: ["*"],
      },
      filesystem: {
        allowWrite: withReal(writableAreas(home, folder, tmpDirs)),
        denyWrite: [...deny, ...withReal([...writeOnlyPlaces(home), ...extraWriteDeny])],
        denyRead: denyReadAll,
      },
    },
    permissions: {
      deny: [...ruleDeny, ...withReal(writeOnlyPlaces(home)).flatMap((p) => [`Edit(/${p})`, `Edit(/${p}/**)`])],
      ask: [...ASKED_COMMAND_RULES],
      disableBypassPermissionsMode: "disable",
    },
  };
}

/** Is this Bash command one of the short list the person is asked about (second line only: the sandbox already blocks what they would do to a protected place)? */
const ASKED_WORD = /(?:^|[;&|(`{\n]|\$\()\s*(?:(?:[A-Za-z_][A-Za-z0-9_]*=\S*|env|command|exec|nohup|time|timeout|caffeinate|arch|setsid|ionice|nice|xargs|builtin|sh|bash|zsh|-\S+|[0-9][0-9.]*[smhd]?|\S*\/)\s+)*["']?(?:\S*\/)?(?:sudo|security|launchctl|osascript)(?![A-Za-z0-9_.-])/;
export function askedCommand(c: string): boolean {
  return ASKED_WORD.test(c) || (/GilbServerOps/i.test(c) && /ship|server/i.test(c));
}

/** Fail closed: a code turn's init event may list only the code tools and this bridge's MCP tools, and no other permission mode. */
function codeInitOk(ev: ClaudeEvent, approval: "session" | "each-write" = "session", filesOnly = false, computer = false, delegate = false): boolean {
  if (computer) return ev.permissionMode === (approval === "each-write" ? "default" : "acceptEdits"); // no tool-list check: Claude Code has its own tools
  if (!Array.isArray(ev.tools)) return false; // fail closed: a tool list that is not an array is not checked
  const tools = ev.tools;
  const allowed = [...(filesOnly ? FILES_ONLY_TOOLS : [...CODE_TOOLS, ...WEB_TOOLS]), ...(delegate ? SUBAGENT_TOOL_NAMES : [])];
  if (!tools.every((t) => typeof t === "string" && (allowed.includes(t) || t.startsWith("mcp__gilb__")))) return false;
  // The asking mode is passed as `manual`, an alias of `default`; the real CLI 2.1.323 reports it as "default" (probe, 2026-11-13).
  return ev.permissionMode === (approval === "each-write" ? "default" : "acceptEdits");
}

/** One line saying what a tool call does, for the `activity` event. */
function toolSummary(tool: string, input: Record<string, unknown>, roots: string[]): string {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  if (tool === "Read" || tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
    const p = (tool === "NotebookEdit" ? str(input.notebook_path) : "") || str(input.file_path) || str(input.notebook_path) || str(input.path);
    if (!p) return tool;
    for (const r of roots) {
      const rel = path.relative(r, path.resolve(r, p));
      if (p && rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)) return rel.split(path.sep).join("/");
    }
    return "(outside the folder)";
  }
  if (tool === "Bash") return (str(input.description) || str(input.command)).slice(0, 120) || tool;
  if (tool === "Glob" || tool === "Grep") return str(input.pattern).slice(0, 120) || tool;
  return tool;
}

/** 0.4.0 `time_left`: of each text block of an assistant message at most this many characters are read for the Time line. */
export const TIME_LEFT_SCAN_MAX = 262_144;
/** 0.4.0 `time_left`: at most this many events are sent for one turn. */
export const TIME_LEFT_MAX_EVENTS = 30;
/**
 * The Time line value the agent wrote in one stream event, or null. Only an `assistant` event's `text` blocks are read (never `tool_use`
 * blocks or their input, never `user` events, never a partial delta, never the final `result`, never a sub-agent's event), and of each block only the first
 * TIME_LEFT_SCAN_MAX characters. The value is the LAST one of the message. Never throws on a strange shape: it returns null.
 * Exported for tests, like the other pure helpers of this file.
 */
export function latestTimeLeft(ev: ClaudeEvent): string | null {
  if (ev.type !== "assistant") return null;
  // A sub-agent's event (same test as stepUsage): only the TOP agent's estimate counts.
  if (ev.parent_tool_use_id !== undefined && ev.parent_tool_use_id !== null) return null;
  const content = ev.message?.content;
  if (!Array.isArray(content)) return null;
  let last: string | null = null;
  for (const b of content as Array<Record<string, unknown> | null>) {
    if (!b || typeof b !== "object" || b.type !== "text" || typeof b.text !== "string") continue;
    const { values } = extractTimeLines(b.text.slice(0, TIME_LEFT_SCAN_MAX));
    const v = values[values.length - 1];
    if (v !== undefined) last = v;
  }
  return last;
}

/** Every summary shown to the person is one bounded piece of text. */
const SUMMARY_CAP = 300;
const cap = (s: string, n = SUMMARY_CAP) => {
  if (s.length <= n) return s;
  // Cut by code point, never inside a surrogate pair; the result with "…" is at most n UTF-16 units.
  let out = "";
  for (const c of s) {
    if (out.length + c.length > n - 1) break;
    out += c;
  }
  return `${out}…`;
};

const SNAPSHOT_CAP = 20000;
const LIST_CAP = 200;
/** Every file under `root` as relative path -> size and mtime. lstat only (a symlink is one entry, never followed); .git and node_modules skipped. */
export function snapshotFolder(root: string): { files: Map<string, string>; truncated: boolean } {
  const files = new Map<string, string>();
  let truncated = false;
  const stack = [""];
  while (stack.length > 0 && !truncated) {
    const rel = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }) as unknown as Dirent[];
    } catch {
      continue;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      let st: fs.Stats;
      try {
        st = fs.lstatSync(path.join(root, r));
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (e.name !== ".git" && e.name !== "node_modules" && e.name !== ".npm-cache") stack.push(r);
        continue;
      }
      if (files.size >= SNAPSHOT_CAP) {
        truncated = true;
        break;
      }
      files.set(r, `${st.size}:${st.mtimeMs}`);
    }
  }
  return { files, truncated };
}

export function diffSnapshots(a: { files: Map<string, string>; truncated: boolean }, b: { files: Map<string, string>; truncated: boolean }) {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [k, v] of b.files) {
    if (!a.files.has(k)) added.push(k);
    else if (a.files.get(k) !== v) changed.push(k);
  }
  for (const k of a.files.keys()) if (!b.files.has(k)) removed.push(k);
  const cut = (l: string[]) => l.sort().slice(0, LIST_CAP);
  return {
    added: cut(added), changed: cut(changed), removed: cut(removed),
    addedCount: added.length, changedCount: changed.length, removedCount: removed.length,
    truncated: a.truncated || b.truncated,
  };
}

const MAX_BODY = 2 * 1024 * 1024;
/** `/v1/turn` only: room for up to 4 pictures (10 MiB decoded is about 13.4 MiB of base64) plus the text. */
const MAX_TURN_BODY = 16 * 1024 * 1024;

// Pictures in a turn. KEEP IN STEP with IMAGE_RULES in units/claude-code-client/src/client.ts (the client checks the same rules first).
export const IMAGE_MAX_COUNT = 4;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
const IMAGE_DEFAULT_PROMPT = "Please look at the attached picture.";
const BASE64_STRICT = /^[A-Za-z0-9+/]*={0,2}$/; // flat (a grouped repeat overflows the regex stack on megabytes); the length is checked to be a multiple of 4 too
export interface TurnImage { mediaType: string; data: string }

function imageMagicOk(type: string, b: Buffer): boolean {
  const at = (off: number, bytes: number[]) => b.length >= off + bytes.length && bytes.every((v, i) => b[off + i] === v);
  if (type === "image/png") return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (type === "image/jpeg") return at(0, [0xff, 0xd8, 0xff]);
  if (type === "image/gif") return at(0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || at(0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  if (type === "image/webp") return at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]);
  return false;
}

/** Checks the pictures of a turn before anything starts. Returns the pictures, or a plain sentence saying what is wrong. */
export function validateTurnImages(raw: unknown): { images: TurnImage[] } | { error: string } {
  if (raw === undefined) return { images: [] };
  if (!Array.isArray(raw)) return { error: "images must be a list of pictures." };
  if (raw.length > IMAGE_MAX_COUNT) return { error: `A turn can carry at most ${IMAGE_MAX_COUNT} pictures.` };
  const out: TurnImage[] = [];
  let total = 0;
  for (let i = 0; i < raw.length; i++) {
    const n = i + 1;
    const it = raw[i] as { mediaType?: unknown; data?: unknown } | null;
    if (!it || typeof it !== "object" || typeof it.mediaType !== "string" || typeof it.data !== "string") return { error: `Picture ${n} must have a mediaType and base64 data.` };
    if (!(IMAGE_TYPES as readonly string[]).includes(it.mediaType)) return { error: `Picture ${n} is not a PNG, JPEG, GIF or WebP picture.` };
    if (it.data.length === 0 || it.data.length % 4 !== 0 || !BASE64_STRICT.test(it.data)) return { error: `Picture ${n} is not valid base64 data.` };
    const bytes = Buffer.from(it.data, "base64");
    if (bytes.length === 0) return { error: `Picture ${n} is empty.` };
    if (!imageMagicOk(it.mediaType, bytes)) return { error: `Picture ${n} does not look like the ${it.mediaType} picture it says it is.` };
    if (bytes.length > IMAGE_MAX_BYTES) return { error: `Picture ${n} is larger than ${IMAGE_MAX_BYTES / 1048576} MiB.` };
    total += bytes.length;
    if (total > IMAGE_MAX_TOTAL_BYTES) return { error: `The pictures together are larger than ${IMAGE_MAX_TOTAL_BYTES / 1048576} MiB.` };
    out.push({ mediaType: it.mediaType, data: it.data });
  }
  return { images: out };
}

/** The one stdin line for a turn with pictures: the pictures first, then the text. */
function imageStdin(images: TurnImage[], prompt: string): string {
  const content: unknown[] = images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } }));
  content.push({ type: "text", text: prompt.trim() ? prompt : IMAGE_DEFAULT_PROMPT });
  return JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n";
}
// Matches the longest hand-off the connector allows (HOP_MAX_MS_BY_ROLE in gilb-connector).
const TOOL_WAIT_MS = 30 * 60 * 1000;
const MAX_TURNS_AT_ONCE = 4;
/** How many nested hand-offs one turn may have running at once. */
export const MAX_HANDOFFS_AT_ONCE = 4;
/** `parentCallId` on a nested turn: the bridge's own id for the relayed call that asked. */
const PARENT_CALL_ID = /^[0-9a-f]{16}$/;
// A person turn and every hand-off it opens (a nested `claude -p`) draw on ONE budget of tool calls, as /base/ai/chat's
// turn and its hops draw on one round ceiling (the server's Claude Code route allows the same 600 and refuses past it).
export const TURN_MAX_TOOL_CALLS = 600;
// A hand-off may run this long before the bridge stops it (its parent turn gets an error for that tool call).
export const HOP_MAX_MS = 30 * 60 * 1000;
// How long the Claude CLI is told to wait for one tool call (MCP_TOOL_TIMEOUT): the longest hand-off plus a minute.
/** A pending tool call tells the CLI "still working" this often (MCP notifications/progress), so its idle cut never fires. */
export const PROGRESS_EVERY_MS = 15 * 1000;
export const MCP_TOOL_TIMEOUT_MS = HOP_MAX_MS + 60 * 1000;
// The tools whose call is a hand-off: the page runs a nested turn for each.
// How many cancelled call ids a turn remembers.
const MAX_CANCELLED_KEPT = 256;
const HAND_OFF_TOOLS = new Set(["run_named_role", "ask_agent_concept"]);
// A pairing lives 30 days after it was last used (sliding) and at most this many are kept.
export const PAIRING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_PAIRINGS = 20;
const PERSIST_EVERY_MS = 60 * 1000; // "last used" is written to disk at most this often

/** A copy of the environment without any spelling of `name` (an environment variable name is case-insensitive on Windows, and npm reads either case). */
function envWithout(e: NodeJS.ProcessEnv, name: string): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const k of Object.keys(e)) if (k.toLowerCase() !== name.toLowerCase()) out[k] = e[k];
  return out;
}

/** Is `cmd` a program on PATH? */
function onPath(cmd: string): boolean {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  return dirs.some((d) => {
    try {
      fs.accessSync(path.join(d, cmd), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * The command that shows `abs` in the system's file manager (pure; tests inspect it). The path is one argv element, never a shell string.
 * macOS: `open -R` REVEALS the folder in its parent in Finder. Plain `open <dir>` and `open -a Finder <dir>` both LAUNCH a bundle folder
 * (x.app, .bundle, .prefPane, .workflow, .pkg, or any folder with the bundle bit) instead of showing it, checked on macOS; `-R` never runs anything.
 */
export function openFolderCommand(platform: string, abs: string): { file: string; args: string[] } {
  if (platform === "darwin") return { file: "open", args: ["-R", abs] };
  if (platform === "win32") return { file: "explorer.exe", args: [abs] };
  return { file: "xdg-open", args: [abs] };
}
/** Opens `abs` in the system's file manager. explorer.exe exits 1 even when it worked, so only a failure to start counts. */
/**
 * The structural guarantee that no test ever opens a real window or a real file manager: the three leaves that start a GUI program call this first.
 * Under a test runner (VITEST, or NODE_ENV=test) it throws. A person running the bridge never sets either, so it never refuses there.
 */
export function guiAllowed(what: string): void {
  if (process.env.VITEST || process.env.NODE_ENV === "test") throw new Error(`GUI refused under test: ${what}`);
}
function systemOpenFolder(platform: string, abs: string): Promise<void> {
  guiAllowed("open folder");
  const { file, args } = openFolderCommand(platform, abs);
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 10_000, windowsHide: false }, (err) => {
      const e = err as (ExecFileException & { killed?: boolean }) | null;
      if (!e) return resolve();
      if (platform === "win32" && typeof e.code === "number" && !e.killed) return resolve();
      reject(e);
    });
  });
}

const WINDOWS_FOLDER_SCRIPT = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '${FOLDER_PROMPT}'; $d.ShowNewFolderButton = $true; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }`;

/** The command of the system's own folder dialog: an absolute program and a constant text. Null: no dialog can be shown (no zenity). */
export function folderDialogCommand(platform: string, env: NodeJS.ProcessEnv, zenity: string | null = null): { file: string; args: string[] } | null {
  if (platform === "darwin") return { file: "/usr/bin/osascript", args: ["-e", `POSIX path of (choose folder with prompt "${FOLDER_PROMPT}" default location (path to home folder))`] };
  if (platform === "win32") return { file: windowsPowerShell(env), args: ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_FOLDER_SCRIPT] };
  return zenity ? { file: zenity, args: ["--file-selection", "--directory", `--title=${FOLDER_PROMPT}`] } : null;
}

/** The system's own folder dialog, on this computer. The commands and their text are constants: no page text goes into them. Resolves the path, or null for cancel. */
function systemFolderDialog(platform: string, env: NodeJS.ProcessEnv, zenity: string | null = null): Promise<string | null> {
  try { guiAllowed("folder dialog"); } catch (e) { return Promise.reject(e); }
  const cmd = folderDialogCommand(platform, env, zenity);
  if (!cmd) return Promise.reject(new Error("no zenity in /usr/bin or /bin"));
  const { file, args } = cmd;
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: DIALOG_MAX_MS, windowsHide: false, env: dialogEnv(platform, env) }, (err, stdout, stderr) => {
      const out = String(stdout ?? "").replace(/[\r\n]+$/, "");
      if (!err) return resolve(out === "" ? null : out.replace(/(.)[\\/]+$/, "$1"));
      const e = err as ErrLike & { killed?: boolean; code?: number | string };
      // Cancel: osascript exits 1 with "User canceled (-128)"; zenity exits 1; the Windows script prints nothing. A dialog left open for the whole wait is a cancel too.
      if (e.killed || /-128|cancel/i.test(String(stderr ?? "")) || Number(e.code) === 1) return resolve(null);
      reject(new Error(String(stderr ?? "").trim().split("\n").pop() || e.message || "unknown error"));
    });
  });
}

// ---- the access mode, kept between runs (0.3.19) ----------------------------------------------------------------------
export type AccessMode = "folder" | "computer";
/** Where the mode is kept: `access.json` in the state folder. */
export const ACCESS_FILE = "access.json";
const ACCESS_FILE_MAX = 4096;
/** Windows: is the file's owner the user running the bridge? (Owner SID against the current user's SID, through the system's own PowerShell.) Any failure is "no". */
export function windowsOwnerIsMe(file: string): boolean {
  try {
    const root = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
    const ps = path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const script = `$f = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${Buffer.from(file, "utf8").toString("base64")}')); $o = (Get-Acl -LiteralPath $f).GetOwner([System.Security.Principal.SecurityIdentifier]).Value; $id = [System.Security.Principal.WindowsIdentity]::GetCurrent(); $m = $id.User.Value; $admin = (New-Object System.Security.Principal.WindowsPrincipal($id)).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator); if ($o -eq $m -or ($admin -and $o -eq 'S-1-5-32-544')) { [Console]::Out.Write('OWNER-OK') }`; // an elevated user's new files are owned by the Administrators group, not by the user SID
    const out = execFileSync(ps, ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 15000, windowsHide: true, encoding: "utf8", env: dialogEnv("win32", process.env) });
    return out === "OWNER-OK";
  } catch {
    return false;
  }
}
/**
 * Reads the saved mode. `exists` is whether anything is at the path (a bad file still counts: it says folder and `--full-access` does
 * not override it). Only `{"version":1,"mode":"folder"|"computer"}` gives computer; a bad shape, a read error, a link, a thing that is not
 * a regular file, one over 4 KB, or (macOS, Linux) one that is not owned by this user, that others can write, or that has a second hard link; (Windows) one whose owner is not the current user: folder.
 */
export function readAccessFile(file: string, platform: string = process.platform, uid: number | undefined = process.getuid?.(), winOwnerOk: (file: string) => boolean = windowsOwnerIsMe): { exists: boolean; mode: AccessMode } {
  const r = readStrictText(file, platform, uid, winOwnerOk);
  if (!r.exists || r.text === null) return { exists: r.exists, mode: "folder" };
  try {
    const v = JSON.parse(r.text) as { version?: unknown; mode?: unknown } | null;
    if (v && typeof v === "object" && !Array.isArray(v) && v.version === 1 && v.mode === "computer") return { exists: true, mode: "computer" };
  } catch { /* bad text */ }
  return { exists: true, mode: "folder" };
}
/**
 * The strict file read behind access.json and access-limits.json: O_NOFOLLOW, a regular file, at most 4 KB, and (macOS, Linux) owned by this
 * user, not writable by group or others, one hard link; (Windows) owned by the current user. `text` is null for anything else.
 */
export function readStrictText(file: string, platform: string = process.platform, uid: number | undefined = process.getuid?.(), winOwnerOk: (file: string) => boolean = windowsOwnerIsMe): { exists: boolean; text: string | null } {
  let ls: fs.Stats;
  try {
    ls = fs.lstatSync(file);
  } catch (e) {
    return { exists: (e as ErrLike).code !== "ENOENT", text: null };
  }
  if (ls.isSymbolicLink() || !ls.isFile() || ls.size > ACCESS_FILE_MAX) return { exists: true, text: null };
  let fd = -1;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.size > ACCESS_FILE_MAX || st.ino !== ls.ino || st.dev !== ls.dev) return { exists: true, text: null };
    // The POSIX owner / mode / link checks apply where the file system has them (a pretend platform on a Windows host has none).
    if (platform !== "win32" && process.platform !== "win32" && ((uid !== undefined && st.uid !== uid) || (st.mode & 0o022) !== 0 || st.nlink > 1)) return { exists: true, text: null };
    if (platform === "win32" && !winOwnerOk(file)) return { exists: true, text: null };
    const buf = Buffer.alloc(ACCESS_FILE_MAX + 1);
    const n = fs.readSync(fd, buf, 0, ACCESS_FILE_MAX + 1, 0);
    if (n > ACCESS_FILE_MAX) return { exists: true, text: null };
    return { exists: true, text: buf.subarray(0, n).toString("utf8") };
  } catch {
    return { exists: true, text: null };
  } finally {
    if (fd >= 0) {
      try { fs.closeSync(fd); } catch { /* closed anyway */ }
    }
  }
}
/** Markers kept next to access.json. `access.seeded`: an access setting has been saved here before (a missing access.json then never lets a --full-access flag seed computer again). `access-lowered`: a lowering to folder was started and may not have reached access.json (the next start is folder). */
export const ACCESS_SEEDED = "access.seeded";
export const ACCESS_LOWERED = "access-lowered";
export const LIMITS_FILE = "access-limits.json";
/** Writes the saved mode: a temp file (mode 0600) renamed over the old one; records that a setting has been saved here. Throws when it cannot. */
export function writeAccessFile(file: string, mode: AccessMode, at: string = new Date().toISOString()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, mode, at }), { mode: 0o600, flag: "wx" });
  fs.renameSync(tmp, file);
  try { fs.writeFileSync(path.join(path.dirname(file), ACCESS_SEEDED), "1", { mode: 0o600 }); } catch { /* the marker is a second line of defence */ }
}
/** Rewrites an existing regular access.json in place (no temp file, no directory write, no new block): the fallback when the atomic write fails. Throws when it cannot. */
export function overwriteAccessFile(file: string, mode: AccessMode, at: string = new Date().toISOString()): void {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error("not a regular file");
    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, JSON.stringify({ version: 1, mode, at }), 0);
  } finally {
    fs.closeSync(fd);
  }
}
/** Can a file be made (and removed) in this folder? */
export function folderWritable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const probe = path.join(dir, `.probe-${process.pid}-${crypto.randomBytes(4).toString("hex")}`);
    fs.writeFileSync(probe, "", { flag: "wx", mode: 0o600 });
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}
/** The ON-window counters, kept in the state folder. */
export interface AccessLimits { stamps: number[]; denials: number; cooldownUntil: number; lockedUntil: number; lastDenialAt: number }
export const freshLimits = (): AccessLimits => ({ stamps: [], denials: 0, cooldownUntil: 0, lockedUntil: 0, lastDenialAt: 0 });
const DAY_MS = 24 * 3_600_000;
/** What the counters become when the file cannot be trusted (missing after it had existed, a link, wrong owner, garbage): the hour's cap is reached and ON waits 10 minutes. */
export const failClosedLimits = (now: number): AccessLimits => ({ stamps: [now, now, now, now, now], denials: 0, cooldownUntil: now + 600_000, lockedUntil: 0, lastDenialAt: 0 });
/** Reads the counters with the access.json checks; every time stamp is capped at now (stamps) or now + 24 h (waits). Anything wrong: `bad`. */
export function parseLimits(text: string | null, now: number): AccessLimits | null {
  if (text === null) return null;
  try {
    const v = JSON.parse(text) as Partial<AccessLimits> & { version?: unknown };
    const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
    if (!v || v.version !== 1 || !Array.isArray(v.stamps) || !v.stamps.every(num) || !num(v.denials) || !num(v.cooldownUntil) || !num(v.lockedUntil)) return null;
    const last = num(v.lastDenialAt) ? Math.min(v.lastDenialAt, now) : 0;
    let denials = Math.max(0, Math.min(100, Math.floor(v.denials)));
    if (denials > 0 && last > 0 && now - last >= DAY_MS) denials = 0; // a day without a refusal: the count starts again
    return { stamps: v.stamps.slice(-100).map((x) => Math.min(x, now)), denials, cooldownUntil: Math.min(v.cooldownUntil, now + DAY_MS), lockedUntil: Math.min(v.lockedUntil, now + DAY_MS), lastDenialAt: last };
  } catch {
    return null;
  }
}
export function writeLimitsFile(file: string, l: AccessLimits): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, ...l }), { mode: 0o600, flag: "wx" });
  fs.renameSync(tmp, file);
}
/** `--access-reset` (and `--uninstall`, `--install --access folder`): fresh counters and no lock. Never throws. */
export function resetLimits(stateDir: string): void {
  try { if (!fs.statSync(stateDir).isDirectory()) return; } catch { return; } // no state folder: nothing to reset (and none is made)
  try { writeLimitsFile(path.join(stateDir, LIMITS_FILE), freshLimits()); } catch { /* the next start reads what is there */ }
}
/** `--access`: only `folder` is accepted on the command line (it can lower the mode, never raise it). Returns the refusal text, or "" when fine. */
export function accessFlagProblem(v: string | undefined): string {
  if (v === undefined || v === "folder") return "";
  if (v === "computer") return "--access computer is refused: full access can only be turned on in GilbApp, where a window on this computer asks you to allow it. (--access folder turns it off.)";
  return `--access takes "folder" (it turns full access off). Got "${cleanForLog(v)}".`;
}
/** `--access folder`: writes the saved mode as folder. Always wins over --full-access and over what the file said. */
export function applyAccessFlag(stateDir: string, v: string | undefined): { ok: boolean; message: string } {
  const bad = accessFlagProblem(v);
  if (bad) return { ok: false, message: bad };
  if (v === undefined) return { ok: true, message: "" };
  try {
    writeAccessFile(path.join(stateDir, ACCESS_FILE), "folder");
    resetLimits(stateDir); // a reinstall with --access folder also clears a 24 h lock
  } catch (e) {
    return { ok: false, message: `Could not save folder mode in ${path.join(stateDir, ACCESS_FILE)}: ${(e as ErrLike).message}` };
  }
  return { ok: true, message: "" };
}
/**
 * `--install --full-access`: the flag is NOT kept in the service's launch arguments (a downgrade, a rollback or a lost access.json would then bring
 * full access back with no window). It seeds access.json once, only when there is no file yet. Never throws.
 */
export function seedAccessFile(stateDir: string, wantComputer: boolean, platform: string = process.platform): void {
  if (!wantComputer) return;
  if (readAccessFile(path.join(stateDir, ACCESS_FILE), platform).exists) return;
  try { writeAccessFile(path.join(stateDir, ACCESS_FILE), "computer"); } catch { /* the notice says what the saved mode is */ }
}
/** `dev:ino` of a path (what it leads to, or the link itself when `follow` is false), or null when it does not exist or the disk gives no id. */
function diskIdentity(p: string, follow: boolean): string | null {
  try {
    const st = follow ? fs.statSync(p) : fs.lstatSync(p);
    return st.ino ? `${st.dev}:${st.ino}` : null;
  } catch {
    return null;
  }
}
/** The state folder may not sit inside the code folder or ~/Developer: a code turn can write both. Returns the refusal text, or "". */
export function stateDirProblem(stateDir: string, workspace: string | undefined, home: string, platform: string = process.platform, identityOf: (p: string, follow: boolean) => string | null = diskIdentity, writable: readonly string[] = []): string {
  const ci = platform === "darwin" || platform === "win32";
  const P = platform === "win32" ? path.win32 : path;
  // Case on a case-insensitive disk, and Unicode spelling (composed or decomposed: macOS keeps both names for one folder).
  const fold = (r: string) => (ci ? r.toLowerCase() : r).normalize("NFC");
  const norm = (p: string) => fold(resolveThroughLinks(P.resolve(p)));
  /** The path as written (made absolute, `..` folded, NO link followed): a link in it can be re-pointed later by whoever may write there. */
  const lit = (p: string) => fold(P.resolve(p));
  const inside = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith(P.sep) ? parent : parent + P.sep);
  // The literal path (and so every ancestor of it) AND the resolved path: either one inside a code place refuses.
  const sds = [norm(stateDir), lit(stateDir)];
  const within = (root: string) => { const rs = [norm(root), lit(root)]; return sds.some((s) => rs.some((r) => inside(s, r))); };
  // By IDENTITY too (spelling-proof): the device:inode of the state folder and of every ancestor of it, along the path as written (each name looked at itself and
  // as it leads on) and along the resolved path; the code folder's or ~/Developer's own id among them means the state folder is inside it.
  const real = !(platform === "win32" || process.platform === "win32");
  const ancestorIds = new Set<string>();
  if (real) {
    const chain = (p: string) => { const out: string[] = []; for (let c = P.resolve(p); ; ) { out.push(c); const up = P.dirname(c); if (up === c) break; c = up; } return out; };
    for (const c of chain(stateDir)) for (const follow of [false, true]) { const id = identityOf(c, follow); if (id) ancestorIds.add(id); }
    for (const c of chain(resolveThroughLinks(P.resolve(stateDir)))) { const id = identityOf(c, true); if (id) ancestorIds.add(id); }
  }
  const sameFolder = (root: string) => { if (!real) return false; const id = identityOf(P.resolve(root), true); return id !== null && ancestorIds.has(id); };
  if (workspace && (within(workspace) || sameFolder(workspace))) return `The state folder ${stateDir} is inside the code folder, where a code turn can change it. Choose a --state-dir outside it.`;
  if (within(P.join(home, "Developer")) || sameFolder(P.join(home, "Developer"))) return `The state folder ${stateDir} is inside ~/Developer, where a code turn can change it. Choose a --state-dir outside it.`;
  // Any other place the sandbox settings let a turn write (/tmp, the temp folders): a turn could swap a FOLDER ABOVE the state folder for its own.
  for (const area of writable) if (area && (within(area) || sameFolder(area))) return `The state folder ${stateDir} is inside ${area}, a place a sandboxed code turn can write. Choose a --state-dir outside it.`;
  return "";
}
/** `--access-reset`, run by the person in a Terminal: clears the ON counters and the 24 h lock that three refusals in a row set. A running bridge reads the file at every request. */
export async function accessReset(opts: CliOptions, deps: ServiceDeps): Promise<ServiceResult> {
  const lbl = badLabel(opts);
  if (lbl) return lbl;
  const f = serviceFiles(opts, deps.home, deps.platform);
  const file = path.join(f.stateDir, LIMITS_FILE);
  try {
    if (!fs.statSync(f.stateDir).isDirectory()) throw new Error("not a folder");
  } catch {
    return { ok: false, message: `No bridge state folder at ${f.stateDir}, so nothing was reset. If the bridge uses its own state folder, add --state-dir <that folder>.` };
  }
  try {
    writeLimitsFile(file, freshLimits());
  } catch (e) {
    return { ok: false, message: `Could not reset ${file}: ${(e as ErrLike).message}` };
  }
  return { ok: true, message: `Reset ${file}: asking to turn on full access is unlocked and the counters are cleared.` };
}
/**
 * A service installed before 0.3.19 still carries `--full-access` in its launch arguments. When the bridge starts with it: the first value is saved
 * in access.json (once, only when no setting was ever saved here), and the flag is taken out of the service's own entry (macOS: the LaunchAgent
 * plist; Windows: the launcher script), written to a temp file and renamed, the same text otherwise. Idempotent. Returns a line for the log, or "".
 */
export function migrateServiceFlag(opts: CliOptions, home: string, platform: string = process.platform, env: NodeJS.ProcessEnv = process.env, where: { target?: string; stateDir?: string } = {}): string {
  if (!opts.fullAccess || !LABEL_RE.test(opts.label)) return "";
  if (platform !== "win32" && env.GILB_BRIDGE_SUPERVISED !== "1") return ""; // only the service (launchd) edits its own entry, never a Terminal or dev start
  const win = platform === "win32";
  const files = win ? serviceFilesWin(opts, home, "win32", env) : serviceFiles(opts, home, platform);
  const target = where.target ?? (win ? (files as ReturnType<typeof serviceFilesWin>).launcher : (files as ReturnType<typeof serviceFiles>).plist); // the exact path the installer writes (`where` is for tests of a pretend Windows)
  let raw: Buffer;
  try {
    if (fs.lstatSync(target).isSymbolicLink()) return `left ${target} alone: it is a link (take --full-access out of its target yourself, or run the install line again)`;
    raw = fs.readFileSync(target);
  } catch { return ""; } // no service entry: nothing to take it out of
  const utf16le = raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe;
  const text = utf16le ? raw.subarray(2).toString("utf16le") : raw.toString("utf8");
  // Only an entry this bridge's installer wrote: the plist names this label; the launcher carries our mark.
  if (win ? !isOurLauncher(text) : !text.includes(`<key>Label</key>`) || !text.includes(`<string>${opts.label}</string>`)) return "";
  const next = win ? text.replace(/ --full-access(?= )/g, "") : text.replace(/[ \t]*<string>--full-access<\/string>\r?\n/g, "");
  if (next === text) return "";
  const stateDir = where.stateDir ?? files.stateDir;
  if (!fs.existsSync(path.join(stateDir, ACCESS_SEEDED))) seedAccessFile(stateDir, true, platform);
  try {
    const tmp = `${target}.${process.pid}.tmp`;
    fs.rmSync(tmp, { force: true });
    fs.writeFileSync(tmp, utf16le ? utf16(next) : next, { mode: win ? 0o666 : 0o644, flag: "wx" });
    fs.renameSync(tmp, target);
  } catch (e) {
    return `could not take --full-access out of ${target} (${(e as ErrLike).message}); run the install line again to take it out`;
  }
  return `took --full-access out of ${target}: the saved mode in ${path.join(stateDir, ACCESS_FILE)} is what counts now`;
}
/**
 * The stop signals of a bridge started as a program. SIGINT, SIGTERM and (macOS, Linux) SIGHUP close it, which stops every code child and what they
 * started; `exit` is a last synchronous SIGKILL of what is still tracked. Returns a function that takes them off again (tests).
 */
export function installProcessHandlers(bridge: { close(): Promise<void>; killAllSync?(): void }, proc: NodeJS.Process = process, platform: string = process.platform): () => void {
  const stop = () => void bridge.close().then(() => proc.exit(0), () => proc.exit(1));
  const onExit = () => bridge.killAllSync?.();
  const sigs: NodeJS.Signals[] = platform === "win32" ? ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"] : ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const sg of sigs) proc.on(sg, stop);
  proc.on("exit", onExit);
  return () => { for (const sg of sigs) proc.off(sg, stop); proc.off("exit", onExit); };
}
/** `--uninstall`: forget the saved mode and its history markers (no file = folder, and a later `--install --full-access` seeds again) and clear the ON counters. Never throws. */
export function clearAccessFile(stateDir: string): void {
  try {
    for (const f of [ACCESS_FILE, ACCESS_SEEDED, ACCESS_LOWERED]) fs.rmSync(path.join(stateDir, f), { force: true });
  } catch { /* the next start reads a bad file as folder */ }
  resetLimits(stateDir);
}
/** `--unpair-all` with no bridge running: the saved mode becomes folder (written even when there was no file, so --full-access cannot seed it again). Never throws. */
export function resetAccessFile(stateDir: string): void {
  try { writeAccessFile(path.join(stateDir, ACCESS_FILE), "folder"); } catch { /* the next start reads what is there */ }
}

// ---- the access dialog: the system's own window on this computer ---------------------------------------------------------
const ACCESS_DIALOG_TITLE = "GilbApp: full access for Claude Code";
const ACCESS_DIALOG_SECONDS = 120;
const ACCESS_ALLOW_LABEL = "Allow full access";
const ACCESS_MAC_LINES = [
  "Let the AI use this Mac like Claude Code in your Terminal?",
  "",
  "It can read most files on this Mac.",
  "It can run commands without asking you first.",
  "It can use the internet.",
  "It can change files only in your code folder, ~/Developer and temp.",
  "Locked, never read or changed: your keys (~/.ssh, ~/.base-deploy, ~/.aws), your logins (~/.config, ~/.npmrc, git and Docker logins, browser profiles) and the bridge's own files.",
  "sudo, security, launchctl, osascript and server ship commands still ask you first.",
  "",
  "Folder mode is safer. You can switch back in GilbApp at any time.",
];
/** Linux: the macOS text with the computer named plainly. */
const ACCESS_LINUX_LINES = ACCESS_MAC_LINES.map((l) => l.replace("this Mac like Claude Code in your Terminal", "this computer like Claude Code in your terminal").replace("on this Mac", "on this computer"));
const ACCESS_WINDOWS_LINES = [
  "Let the AI use this PC like Claude Code in your terminal?",
  "",
  "It can read and change anything your Windows user can.",
  "It can run commands and use the internet and your logins.",
  "Windows has no safety box for this,",
  "so the AI asks you in the chat before every single action.",
  "",
  "Folder mode is safer: it can only edit files in your code folder.",
  "You can switch back in GilbApp at any time.",
];
export const ACCESS_DIALOG_TEXT = { darwin: ACCESS_MAC_LINES.join("\n"), win32: ACCESS_WINDOWS_LINES.join("\n"), linux: ACCESS_LINUX_LINES.join("\n") };
/** The dialog text with ONE added line after the first (title) line: `Asked by: <origin>`. The origin is an allowed origin that the caller checked, shown plainly; a non-https one gets "(local)". It is only ever passed as an argument. */
export function accessDialogText(platform: string, origin: string): string {
  const lines = platform === "darwin" ? ACCESS_MAC_LINES : platform === "win32" ? ACCESS_WINDOWS_LINES : ACCESS_LINUX_LINES;
  return [lines[0]!, `Asked by: ${origin}${origin.startsWith("https://") ? "" : " (local)"}`, ...lines.slice(1)].join("\n"); // a page that is not https is on this computer or its network: say so
}
/** An origin fit to show: `https://host[:port]` or `http://` for this computer (a bracketed IPv6 address too), nothing else. */
export const originFitForDialog = (o: unknown): o is string => typeof o === "string" && o.length <= 200 && /^https?:\/\/([A-Za-z0-9.\-]+|\[[0-9a-f:]+\])(:\d{1,5})?$/.test(o);
/**
 * The environment of a consent-dialog child (0.3.19): nothing from the bridge's environment except a short list the window needs, and a fixed PATH.
 * The dialog program itself is always run by absolute path, so a planted program on the person's PATH can never answer for the person.
 */
export function dialogEnv(platform: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const keep = platform === "win32"
    ? ["SystemRoot", "windir", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "USERNAME", "COMPUTERNAME", "ComSpec", "PATHEXT"]
    : ["HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR", "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "XAUTHORITY"];
  const out: NodeJS.ProcessEnv = {};
  for (const k of keep) {
    const v = envGet(env, k);
    if (v !== undefined) out[k] = v;
  }
  if (platform === "win32") {
    const root = envGet(env, "SystemRoot") ?? envGet(env, "windir") ?? "C:\\Windows";
    out.PATH = `${path.win32.join(root, "System32")};${root}`;
  } else {
    out.PATH = "/usr/bin:/bin";
  }
  return out;
}
/** The system's own PowerShell, from the real SystemRoot (never found through PATH). */
export const windowsPowerShell = (env: NodeJS.ProcessEnv): string => path.win32.join(envGet(env, "SystemRoot") ?? envGet(env, "windir") ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
/** zenity, found once at start in the two system folders only (never through PATH, never /usr/local or a home folder). Null: no dialog can be shown. */
export function resolveZenity(exists: (p: string) => boolean = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }): string | null {
  return ["/usr/bin/zenity", "/bin/zenity"].find((p) => exists(p)) ?? null;
}
/** What macOS prints when Allow was clicked. Nothing else counts. */
export const ACCESS_MAC_ALLOW_OUT = "button returned:Allow full access, gave up:false";
/** What the Windows form prints when Allow was clicked. Nothing else counts. */
export const ACCESS_WINDOWS_ALLOW_OUT = "GILB-ACCESS-ALLOWED";
const psQuote = (t: string) => `'${t.replace(/'/g, "''")}'`;
const b64 = (t: string) => Buffer.from(t, "utf8").toString("base64");
/** The Windows form. The text (with the asking page) is a base64 DATA value inside the script, decoded by PowerShell: `-Command` would glue extra arguments into the command, so an argument is not safe there. */
const accessWindowsScript = (text: string) => [
  "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing",
  "$script:ok = $false",
  "$f = New-Object System.Windows.Forms.Form",
  `$f.Text = ${psQuote(ACCESS_DIALOG_TITLE)}`,
  "$f.TopMost = $true; $f.StartPosition = 'CenterScreen'; $f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false; $f.MinimizeBox = $false; $f.ShowInTaskbar = $true",
  "$f.ClientSize = New-Object System.Drawing.Size(540, 290)",
  "$l = New-Object System.Windows.Forms.Label",
  `$l.Text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(text)}'))`,
  "$l.Location = New-Object System.Drawing.Point(14, 14); $l.Size = New-Object System.Drawing.Size(512, 220)",
  "$c = New-Object System.Windows.Forms.Button; $c.Text = 'Cancel'; $c.DialogResult = [System.Windows.Forms.DialogResult]::Cancel",
  "$c.Location = New-Object System.Drawing.Point(300, 248); $c.Size = New-Object System.Drawing.Size(110, 30)",
  `$a = New-Object System.Windows.Forms.Button; $a.Text = ${psQuote(ACCESS_ALLOW_LABEL)}`,
  "$a.Location = New-Object System.Drawing.Point(416, 248); $a.Size = New-Object System.Drawing.Size(110, 30)",
  "$a.Add_Click({ $script:ok = $true; $f.Close() })",
  "$f.Controls.Add($l); $f.Controls.Add($c); $f.Controls.Add($a)",
  "$f.AcceptButton = $c; $f.CancelButton = $c",
  `$t = New-Object System.Windows.Forms.Timer; $t.Interval = ${ACCESS_DIALOG_SECONDS * 1000}; $t.Add_Tick({ $t.Stop(); $f.Close() }); $t.Start()`,
  "$f.Add_Shown({ $f.Activate(); $c.Focus() })",
  "[void]$f.ShowDialog()",
  `if ($script:ok) { [Console]::Out.Write(${psQuote(ACCESS_WINDOWS_ALLOW_OUT)}) }`,
].join("\n");
/** The command a platform runs for the access dialog. Constant text only: nothing from a request goes in. */
export function accessDialogCommand(platform: string, env: NodeJS.ProcessEnv = process.env, origin = "", zenity = "/usr/bin/zenity"): { file: string; args: string[] } {
  const text = accessDialogText(platform, origin);
  if (platform === "darwin") {
    // The text and the title go in as arguments of the script's `run` handler, so no character of either can end the script.
    return {
      file: "/usr/bin/osascript",
      args: [
        "-e", "on run argv",
        "-e", `display dialog (item 1 of argv) with title (item 2 of argv) buttons {"Cancel", "${ACCESS_ALLOW_LABEL}"} default button "Cancel" cancel button "Cancel" with icon caution giving up after ${ACCESS_DIALOG_SECONDS}`,
        "-e", "end run",
        text,
        ACCESS_DIALOG_TITLE,
      ],
    };
  }
  if (platform === "win32") return { file: windowsPowerShell(env), args: ["-NoProfile", "-NonInteractive", "-Command", accessWindowsScript(text)] };
  return { file: zenity, args: ["--question", "--no-markup", `--title=${ACCESS_DIALOG_TITLE}`, `--text=${text}`, `--ok-label=${ACCESS_ALLOW_LABEL}`, "--cancel-label=Cancel", `--timeout=${ACCESS_DIALOG_SECONDS}`, "--width=520"] };
}
/** Did this finished dialog command mean Allow? Only the exact success of each platform: macOS's exact line (trailing newline only), Windows' exact token, zenity's exit 0. */
export function accessDialogAllowed(platform: string, code: number, stdout: string): boolean {
  const out = stdout.replace(/\r?\n$/, "");
  if (platform === "darwin") return code === 0 && out === ACCESS_MAC_ALLOW_OUT;
  if (platform === "win32") return code === 0 && out === ACCESS_WINDOWS_ALLOW_OUT;
  return code === 0;
}
export type AccessDialogResult = "allow" | "cancel" | "timeout";
type AccessRun = (file: string, args: string[], o: { timeout: number; env: NodeJS.ProcessEnv }) => Promise<{ code: number | null; stdout: string; stderr: string; killed: boolean; spawnError: boolean }>;
const realAccessRun: AccessRun = (file, args, o) => {
  guiAllowed("access dialog");
  return new Promise((resolve) => {
    execFile(file, args, { timeout: o.timeout, windowsHide: false, env: o.env }, (err, stdout, stderr) => {
      const e = err as (ErrLike & { killed?: boolean; code?: number | string }) | null;
      const code = !e ? 0 : typeof e.code === "number" ? e.code : null;
      resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), killed: !!e?.killed, spawnError: !!e && typeof e.code !== "number" });
    });
  });
};
/** Opens the access dialog and waits. Resolves allow / cancel / timeout; REJECTS when the dialog could not be shown (the caller never allows then). `run` is replaceable by tests. */
export async function systemAccessDialog(platform: string, env: NodeJS.ProcessEnv, run: AccessRun = realAccessRun, o: { origin?: string; zenity?: string | null } = {}): Promise<AccessDialogResult> {
  if (platform !== "darwin" && platform !== "win32" && !o.zenity) throw new Error("no zenity in /usr/bin or /bin");
  const c = accessDialogCommand(platform, env, o.origin ?? "", o.zenity ?? undefined);
  const r = await run(c.file, c.args, { timeout: (ACCESS_DIALOG_SECONDS + 30) * 1000, env: dialogEnv(platform, env) });
  if (r.killed) return "timeout";
  if (r.spawnError) throw new Error(`could not open the dialog (${c.file})`);
  if (accessDialogAllowed(platform, r.code ?? -1, r.stdout)) return "allow";
  if (platform === "darwin") {
    if (r.code === 0 && /gave up:true/.test(r.stdout)) return "timeout";
    if (r.code === 0 || /-128|cancel/i.test(r.stderr) || r.code === 1) return "cancel";
    throw new Error("the dialog failed");
  }
  if (platform === "win32") {
    if (r.code === 0) return "cancel";
    throw new Error("the dialog failed");
  }
  if (r.code === 5) return "timeout";
  if (r.code === 1) return "cancel";
  throw new Error("the dialog failed");
}

export interface BridgeOptions {
  port?: number | undefined;
  claudeBin?: string | undefined;
  allowedOrigins?: string[] | undefined;
  workDir?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  log?: ((line: string) => void) | undefined;
  maxPairFailures?: number | undefined;
  pairingsFile?: string | undefined;
  pairingTtlMs?: number | undefined;
  maxPairings?: number | undefined;
  now?: (() => number) | undefined;
  maxToolCalls?: number | undefined;
  hopMaxMs?: number | undefined;
  progressEveryMs?: number | undefined;
  controlToken?: string | undefined;
  /** Tests: pretend to be another platform, with file access and taskkill replaced. */
  platformOpts?: PlatformOpts | undefined;
  /** The one folder a code turn may work in (already checked by validateWorkspace). Unset: no code mode. */
  workspace?: string | undefined;
  /**
   * Computer mode: code turns run like Claude Code in the person's terminal. The mode is runtime state (0.3.19) kept in `access.json` in the
   * state folder. The command line can only SEED it (`--full-access` counts only when no access.json exists yet) or LOWER it (`--access folder`);
   * it is raised only by POST /v1/access after the person clicks Allow in a window the bridge opens on this computer. No body field, header or
   * env var sets it, and a file that is not exactly {"version":1,"mode":"computer"} (owned by the user, not a link, not writable by others) reads as folder.
   */
  fullAccess?: boolean | undefined;
  /** Opens the access dialog (told which allowed page asked) and resolves allow / cancel / timeout, or rejects when no dialog can open. Tests inject this so no real dialog opens. */
  accessDialog?: ((origin: string) => Promise<AccessDialogResult>) | undefined;
  /** TEST-ONLY: replaces the program runner under the real access dialog (so the command and its environment can be seen without a window). */
  accessRun?: AccessRun | undefined;
  /** TEST-ONLY: the zenity to use (null: none). Default: found once at start in /usr/bin then /bin. */
  zenityPath?: string | null | undefined;
  /** How long a stopped process group gets after SIGTERM before SIGKILL (default 2000 ms). Tests make it short. */
  killGraceMs?: number | undefined;
  /** TEST-ONLY: replaces the process list (default: ps on macOS, /proc on Linux, PowerShell on Windows). */
  procList?: (() => Promise<ProcRow[] | null>) | undefined;
  /** TEST-ONLY: awaited right after the post-Allow scan, where a slow process list would leave a gap (a test switches to folder in it). */
  afterAllowScan?: (() => Promise<void>) | undefined;
  /** TEST-ONLY: replaces the synchronous process list of the exit hook. */
  procListSync?: (() => ProcRow[] | null) | undefined;
  /** How often the descendants of a running code child are noted (default 250 ms). */
  snapshotMs?: number | undefined;
  /** TEST-ONLY: the Windows owner check of access.json (default: the real one through PowerShell). */
  winOwnerOk?: ((file: string) => boolean) | undefined;
  /** TEST-ONLY, undocumented: extra name prefixes a code child's environment keeps (the stand-in claude is configured through FAKE_* variables). */
  codeEnvExtraPrefixes?: string[] | undefined;
  /** TEST-ONLY, undocumented: the platform whose case rules the folder-prefix test follows (default: the real one). */
  pathPlatform?: string | undefined;
  /** TEST-ONLY, undocumented: called in a code turn right after the last folder check and right before the child starts (tests swap the folder here). */
  beforeSpawn?: (() => void) | undefined;
  /** TEST-ONLY, undocumented: called in runClaude after the no-folder check and before the folder is compared again (tests swap the folder here, so this check is the one that refuses). */
  beforeRecheck?: (() => void) | undefined;
  /** TEST-ONLY, undocumented: called in a project create right after the folder is made and right before its .npmrc is written (tests plant a file or a symlink, or make the folder read-only, here). */
  beforeProjectNpmrc?: ((projectPath: string) => void) | undefined;
  /** TEST-ONLY, undocumented: called in a code turn between the folder snapshot and the folder check (tests swap the folder here). A returned promise is waited for, so a test can hold the turn there. A hook that returns nothing is not waited for. */
  afterSnapshot?: (() => void | Promise<void>) | undefined;
  /** TEST-ONLY, undocumented: the platform the code mode is chosen for (files-only on "win32"), when the real one cannot be pretended (the stand-in claude cannot start under a pretend-Windows launch). */
  codePlatform?: string | undefined;
  /** Where the chosen code folder is kept between runs (workspace.json). Unset: memory only. */
  workspaceFile?: string | undefined;
  /** Where "~" is for the folder checks and "Make ~/<name>" (default os.homedir()). Tests. */
  home?: string | undefined;
  /** Opens the system's folder dialog and resolves the chosen path, or null when the person cancelled. Tests inject this so no real dialog opens. */
  chooseFolder?: (() => Promise<string | null>) | undefined;
  /** Opens an absolute folder in the system's file manager (Finder, Explorer, xdg-open). Resolves when it started; rejects when it could not. Tests inject this so no real window opens. */
  openFolder?: ((abs: string) => Promise<void>) | undefined;
  /** Is this program on PATH? (the zenity lookup on Linux). Tests inject this. */
  which?: ((cmd: string) => boolean) | undefined;
  /** TEST-ONLY, undocumented: extra folders added to the sandbox's denyRead list (the probe uses it for its decoy secret folder). */
  extraDenyRead?: string[] | undefined;
  /** TEST-ONLY, undocumented: absolute places ADDED to the protected list of a sandboxed computer-mode turn (fake keys for a live test). It can only add; the fixed list is always there. */
  extraProtected?: string[] | undefined;
  /** How long an approval question waits for the person before it is denied (default APPROVAL_WAIT_MS). Tests make it short. */
  approvalWaitMs?: number | undefined;
  /** The install label this process runs under (macOS launchd names the job by it). Default DEFAULT_LABEL. */
  label?: string | undefined;
  /** The bridge's state folder (where `update.json` and Windows' `supervisor.json` live). Default ~/.gilb-claude-code-bridge. */
  stateDir?: string | undefined;
  /** TEST-ONLY: replaces the places setting grants treat as writable by a sandboxed turn (default: `writableAreas`, the list the emitted settings use). */
  sandboxWritableAreas?: readonly string[] | undefined;
  /** TEST-ONLY: replaces parts of the real update dependencies (origin, keys, running, file, fetch, fs, selfTest, now, random). */
  updateDeps?: Partial<UpdateDeps> | undefined;
  /** TEST-ONLY: replaces `runUpdate` itself. */
  updateRun?: ((deps: UpdateDeps) => Promise<UpdateResult>) | undefined;
  /** TEST-ONLY: how an automatic restart waits for a running turn: how often it looks, and how long it waits before stopping the turn. Defaults 250 ms and 10 minutes. */
  updateRestart?: { pollMs?: number; capMs?: number } | undefined;
  /** What ends the process after an update restart (default process.exit). Tests inject a recorder. */
  exit?: ((code: number) => void) | undefined;
  /** TEST-ONLY, undocumented: log the raw arguments object `bridge_approve` receives (the probe prints it). Off otherwise: it holds tool inputs. */
  logApproveArgs?: boolean | undefined;
  /** TEST-ONLY: lower the preview copy caps (files, bytes) so the too-large answers can be tested without a huge fixture. */
  previewLimits?: { maxFiles?: number; maxBytes?: number } | undefined;
}

// ---- preview: serve a project's BUILT app to the person's browser (read-only, loopback only) --------------------------------------
// The agent builds inside its sandbox (`npm run build`); the bridge never runs a project script outside it. These helpers find the build
// folder and the pinned port from fixed names, and serve the folder with a small static server in this process. No child process, no CORS.

/** The build folders, in the order they are tried. The agent never names one. */
const PREVIEW_FOLDERS = ["dist", "build"] as const;
/** The config files a project's port is read from, as TEXT (never imported or run), in the order they are tried. */
const PREVIEW_CONFIGS = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs", "nuxt.config.ts", "nuxt.config.js"];
const PREVIEW_CONFIG_MAX = 64 * 1024;
/** Ports that are never a preview port: Gilb's own rigs and the identity/user servers. */
const PREVIEW_BAD_PORTS = new Set([5432, 3306, 6379, 27017, 8787, 8789, 5173, 5197, 5251]);
/** Rule_Code_dev-ports blocks that belong to other services: the workers (8780-8799) and pages-dev (8800-8819). */
const previewPortRefused = (n: number) => n < 1024 || n > 65535 || PREVIEW_BAD_PORTS.has(n) || (n >= 8780 && n <= 8819);
/** At most this many previews run at once; the next one closes the one started first. */
const PREVIEW_MAX = 4;
/** The fixed content-type map; anything else is application/octet-stream. */
const PREVIEW_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".map": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".xml": "application/xml",
};
/** Why a preview could not start: the HTTP status and the JSON body to answer with. */
export class PreviewRefusal extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) {
    super(String(body.error));
  }
}

/** The first of `dist`, `build` that is a real directory (not a link) inside the project, holding a regular `index.html`; or null. WHY fixed names: the agent and package.json never choose what is served. */
export function findBuildFolder(projectReal: string): { folder: "dist" | "build"; root: string } | null {
  for (const folder of PREVIEW_FOLDERS) {
    try {
      const cand = path.join(projectReal, folder);
      const st = fs.lstatSync(cand);
      if (!st.isDirectory() || st.isSymbolicLink()) continue;
      const root = fs.realpathSync.native(cand);
      if (!root.startsWith(projectReal + path.sep)) continue;
      const idx = fs.lstatSync(path.join(root, "index.html"));
      if (idx.isFile()) return { folder, root };
    } catch {
      /* not there: try the next name */
    }
  }
  return null;
}

/** The port a project pins in its vite/nuxt config (preview, else server, else devServer), as a literal integer; null when none is pinned. The file is read as text only. */
export function pinnedPort(projectReal: string): number | null {
  let text = "";
  for (const name of PREVIEW_CONFIGS) {
    const f = path.join(projectReal, name);
    let fd = -1;
    try {
      if (!fs.lstatSync(f).isFile()) continue; // a link or a folder is not read
      fd = fs.openSync(f, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
      const buf = Buffer.alloc(PREVIEW_CONFIG_MAX);
      text = buf.subarray(0, fs.readSync(fd, buf, 0, PREVIEW_CONFIG_MAX, 0)).toString("utf8");
      break;
    } catch {
      continue;
    } finally {
      if (fd >= 0) fs.closeSync(fd);
    }
  }
  // Comments go first so a commented-out port is not taken. `[^{}]*?` stays inside the one block (no nested braces).
  text = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const key of ["preview", "server", "devServer"]) {
    const m = new RegExp(`\\b${key}\\s*:\\s*\\{[^{}]*?\\bport\\s*:\\s*(\\d+)\\s*(?:,|\\}|$)`, "m").exec(text);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Is something listening on this port at this address? A TCP connect with a 300 ms limit; any failure counts as "no". */
function tcpAnswers(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (v: boolean) => { s.destroy(); resolve(v); };
    s.setTimeout(300, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

/** Why a snapshot could not be made: the HTTP status and body to answer with. */
const BUILD_CHANGED = { error: "build-changed", message: "The build changed while it was being opened. Press Open again." };
const PREVIEW_MAX_FILES = 20_000;
const PREVIEW_MAX_BYTES = 512 * 1024 * 1024;
const PREVIEW_MAX_DEPTH = 64;
/** The copy gives the event loop back at least this often. */
const PREVIEW_YIELD_MS = 16;
/** macOS: refuse a link in ANY part of the path, not only the last (used INSTEAD of O_NOFOLLOW: the two together give EINVAL). 0 elsewhere. */
const O_NOFOLLOW_ANY = process.platform === "darwin" ? 0x20000000 : 0;

/**
 * Copy a build folder into `dest` (a folder the bridge owns, outside every place a sandboxed turn can write) and return how many files were copied.
 * WHY a copy: the agent can swap a folder for a symlink while a request is being served, and the bridge (outside the sandbox) would follow it.
 * What is served is this copy, which the agent cannot reach. WHY the copy itself is careful: it also runs while the agent may be swapping links.
 * Each source file is lstat-ed in the walk, opened without following links (O_NOFOLLOW, plus O_NOFOLLOW_ANY on macOS), and must then be the SAME file
 * (device and inode) and a regular file; its real location is checked to be inside the source (/proc/self/fd on Linux, realpath elsewhere).
 * Any mismatch aborts the whole snapshot. Symlinks, special files, dot-entries and hard-linked files (nlink > 1) are skipped, never followed.
 */
export async function snapshotBuild(srcRoot: string, dest: string, limits: { maxFiles?: number; maxBytes?: number } = {}): Promise<number> {
  try {
    return await snapshotBuildInner(srcRoot, dest, limits);
  } catch (e) {
    if (e instanceof PreviewRefusal) throw e;
    throw new PreviewRefusal(409, BUILD_CHANGED); // the folder moved or vanished under the copy
  }
}
async function snapshotBuildInner(srcRoot: string, dest: string, limits: { maxFiles?: number; maxBytes?: number }): Promise<number> {
  const maxFiles = limits.maxFiles ?? PREVIEW_MAX_FILES;
  const maxBytes = limits.maxBytes ?? PREVIEW_MAX_BYTES;
  const rootStat = fs.lstatSync(srcRoot);
  const inRoot = (p: string) => p === srcRoot || p.startsWith(srcRoot + path.sep);
  let files = 0;
  let seen = 0;
  let bytes = 0;
  let sinceYield = 0;
  /** The copy is synchronous file work; without this it would hold the event loop (every other request waits) for the whole copy. */
  let lastYield = performance.now();
  const yieldLoop = () => { sinceYield = 0; lastYield = performance.now(); return new Promise<void>((r) => setImmediate(r)); };
  /** Yield when 16 ms have passed since the last yield (a slow disk makes 200 files far too many), whatever the count. */
  const maybeYield = () => (performance.now() - lastYield >= PREVIEW_YIELD_MS ? yieldLoop() : undefined);
  const changed = () => new PreviewRefusal(409, BUILD_CHANGED);
  const tooLarge = () => new PreviewRefusal(413, { error: "build-too-large" });
  async function copyFile(src: string, to: string, ls: fs.Stats) {
    const fd = fs.openSync(src, fs.constants.O_RDONLY | (O_NOFOLLOW_ANY || (fs.constants.O_NOFOLLOW ?? 0)));
    let out = -1;
    try {
      const st = fs.fstatSync(fd);
      if (!st.isFile() || st.dev !== ls.dev || st.ino !== ls.ino) throw changed();
      if (st.nlink > 1) return; // a hard link may be a second name for a file outside the build: never copied
      // Where the open file really is. /proc/self/fd names the file the fd holds; elsewhere realpath is the best there is (macOS has O_NOFOLLOW_ANY too).
      let where: string;
      if (process.platform === "linux") where = fs.readlinkSync(`/proc/self/fd/${fd}`);
      else where = fs.realpathSync.native(src);
      if (!inRoot(where)) throw changed();
      if (st.size + bytes > maxBytes) throw tooLarge();
      out = fs.openSync(to, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
      const buf = Buffer.allocUnsafe(64 * 1024);
      for (;;) {
        const n = fs.readSync(fd, buf, 0, buf.length, null);
        if (n === 0) break;
        bytes += n;
        if (bytes > maxBytes) throw tooLarge();
        fs.writeSync(out, buf, 0, n);
        sinceYield += n;
        if (sinceYield >= 16 * 1024 * 1024 || performance.now() - lastYield >= PREVIEW_YIELD_MS) await yieldLoop(); // a big file: every 16 MB or 16 ms
      }
      files += 1;
    } finally {
      fs.closeSync(fd);
      if (out >= 0) fs.closeSync(out);
    }
  }
  async function walk(src: string, to: string, depth: number) {
    if (depth > PREVIEW_MAX_DEPTH) throw tooLarge();
    const names = fs.readdirSync(src);
    for (const name of names) {
      if (name.startsWith(".")) continue;
      if (++seen > maxFiles) throw tooLarge(); // every entry counts, so a huge folder stops early
      const s = path.join(src, name);
      const t = path.join(to, name);
      let ls: fs.Stats;
      try {
        ls = fs.lstatSync(s);
      } catch {
        throw changed();
      }
      if (ls.isSymbolicLink()) continue;
      try {
        if (ls.isDirectory()) {
          fs.mkdirSync(t, { mode: 0o700 });
          await walk(s, t, depth + 1);
        } else if (ls.isFile()) {
          await copyFile(s, t, ls);
          await maybeYield();
        }
      } catch (e) {
        if (e instanceof PreviewRefusal) throw e;
        throw changed(); // ELOOP, ENOENT, EACCES...: the folder is not what the walk saw
      }
    }
  }
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  await walk(srcRoot, dest, 0);
  const again = fs.lstatSync(srcRoot);
  if (again.isSymbolicLink() || again.ino !== rootStat.ino || again.dev !== rootStat.dev || fs.realpathSync.native(srcRoot) !== srcRoot) throw changed();
  return files;
}

/**
 * The request handler of one preview server: GET and HEAD of files under `root` only.
 * WHY so strict: the page it serves is the person's own build, but the port is reachable by every page in every tab (DNS rebinding,
 * a link planted in the build), so it must serve nothing but the build folder, set no CORS and no cookies, and follow no link out.
 */
function previewHandler(ref: { root: string }, port: number) {
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const O_RO = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  const base = { "x-content-type-options": "nosniff", "cache-control": "no-store", "referrer-policy": "no-referrer" };
  const plain = (res: ServerResponse, status: number, text: string, extra: Record<string, string> = {}) => {
    res.writeHead(status, { ...base, "content-type": "text/plain; charset=utf-8", ...extra });
    res.end(text);
  };
  /** Serve one file: its real path must be inside the root, and it is opened without following a link and checked as a regular file on the handle itself. */
  async function sendFile(root: string, cand: string, req: IncomingMessage, res: ServerResponse): Promise<"sent" | "dir" | "missing" | "blocked"> {
    const inside = (real: string) => real === root || real.startsWith(root + path.sep);
    let real: string;
    try {
      real = await fs.promises.realpath(cand);
    } catch {
      return "missing";
    }
    if (!inside(real)) return "blocked"; // a link out: a hard 404, never the app route
    let fh: fs.promises.FileHandle;
    try {
      fh = await fs.promises.open(real, O_RO);
    } catch {
      return "missing"; // includes ELOOP (a link swapped in) and EISDIR-like refusals
    }
    try {
      const st = await fh.stat();
      if (st.isDirectory()) { await fh.close(); return "dir"; }
      if (!st.isFile()) { await fh.close(); return "missing"; }
      // The client may be gone already (a reset): then no stream is made, and the handle is closed here, never left to the garbage collector.
      if (res.destroyed || req.destroyed || req.socket.destroyed) { await fh.close(); return "sent"; }
      res.writeHead(200, { ...base, "content-type": PREVIEW_TYPES[path.extname(real).toLowerCase()] ?? "application/octet-stream", "content-length": String(st.size) });
      if (req.method === "HEAD") { await fh.close(); res.end(); return "sent"; }
      // pipeline closes the stream (and with it the handle) on success, on a read error and on a client abort.
      pipeline(fh.createReadStream({ autoClose: true }), res, () => {});
      return "sent";
    } catch {
      await fh.close().catch(() => {});
      return "missing";
    }
  }
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (!hosts.has(String(req.headers.host ?? ""))) return plain(res, 421, "Misdirected request");
    const root = ref.root; // one root for the whole request: a new snapshot may take over between requests, never inside one
    if (req.method !== "GET" && req.method !== "HEAD") return plain(res, 405, "Method not allowed", { allow: "GET, HEAD" });
    const raw = (req.url ?? "").split("?")[0]!.split("#")[0]!;
    if (!raw.startsWith("/") || /%2f|%5c|%00/i.test(raw) || raw.includes("\\")) return plain(res, 400, "Bad request");
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return plain(res, 400, "Bad request");
    }
    if (decoded.includes("\0") || decoded.includes("\\")) return plain(res, 400, "Bad request");
    const segs = decoded.split("/").slice(1);
    const trailing = segs.length > 0 && segs[segs.length - 1] === "";
    if (trailing) segs.pop();
    if (segs.some((s) => s === "" || s.startsWith("."))) return plain(res, 404, "Not found");
    const last = segs[segs.length - 1] ?? "";
    // A path that is a file or a directory with an index.html is served as is.
    if (segs.length === 0) {
      if ((await sendFile(root, path.join(root, "index.html"), req, res)) === "sent") return;
      return plain(res, 404, "Not found");
    }
    const cand = path.join(root, ...segs);
    const first = await sendFile(root, trailing ? path.join(cand, "index.html") : cand, req, res);
    if (first === "sent") return;
    if (first === "blocked") return plain(res, 404, "Not found");
    if (first === "dir") {
      const idx = await sendFile(root, path.join(cand, "index.html"), req, res);
      if (idx === "sent") return;
      return plain(res, 404, "Not found"); // no directory listing, and a real folder is not an app route
    }
    // Not found: an app route (no extension) gets the app's own index.html, so a refresh on a deep link works.
    if (path.extname(last) === "" && !(trailing && (await realIsDir(root, cand)))) {
      if ((await sendFile(root, path.join(root, "index.html"), req, res)) === "sent") return;
    }
    return plain(res, 404, "Not found");
  };
  async function realIsDir(root: string, p: string): Promise<boolean> {
    try {
      const r = await fs.promises.realpath(p);
      return (r === root || r.startsWith(root + path.sep)) && (await fs.promises.stat(r)).isDirectory();
    } catch {
      return false;
    }
  }
}

/** One running preview: the build folder it serves, its port, and the listening servers (127.0.0.1, and ::1 when the machine has IPv6). */
interface Preview {
  /** What the servers serve: the current snapshot folder (swapped in place when the person presses Open again on the same port). */
  ref: { root: string };
  port: number;
  servers: http.Server[];
  folder: "dist" | "build";
}

/** Close every server of a preview and drop its open connections; resolves when they are all closed. */
function closePreviewServers(p: Preview): Promise<void> {
  return Promise.all(p.servers.map((s) => new Promise<void>((resolve) => { s.close(() => resolve()); s.closeAllConnections(); }))).then(() => undefined);
}

/** Start the static server for `root` on `port`. Throws PreviewRefusal 409 port-in-use when anything already answers there or a listen fails. */
async function startPreviewServers(ref: { root: string }, port: number): Promise<http.Server[]> {
  const inUse = new PreviewRefusal(409, { error: "port-in-use", port });
  if ((await tcpAnswers("127.0.0.1", port)) || (await tcpAnswers("::1", port))) throw inUse;
  const handler = previewHandler(ref, port);
  const servers: http.Server[] = [];
  const listenOn = (host: string) => new Promise<http.Server>((resolve, reject) => {
    const s = http.createServer((req, res) => { handler(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }); });
    s.once("error", reject);
    s.listen({ host, port, exclusive: true }, () => resolve(s));
  });
  try {
    servers.push(await listenOn("127.0.0.1"));
  } catch {
    throw inUse;
  }
  try {
    servers.push(await listenOn("::1"));
  } catch (e) {
    // No IPv6 on this machine: carry on with 127.0.0.1 only. Any other failure stops both.
    if ((e as NodeJS.ErrnoException).code !== "EADDRNOTAVAIL") {
      await closePreviewServers({ ref, port, servers, folder: "dist" });
      throw inUse;
    }
  }
  return servers;
}

/**
 * @param {object} [opts]
 * @param {number} [opts.port]
 * @param {string} [opts.claudeBin]
 * @param {string[]} [opts.allowedOrigins]
 * @param {string} [opts.workDir]   Where claude runs (an empty folder: its session store is keyed by it).
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {(line:string)=>void} [opts.log]
 * @param {number} [opts.maxPairFailures]
 * @param {string} [opts.pairingsFile]  Where issued pairing secrets (as SHA-256 hashes) are kept so they survive a restart. Unset: memory only.
 * @param {number} [opts.pairingTtlMs]  A pairing expires this long after it was last used (sliding). Default PAIRING_TTL_MS (30 days).
 * @param {number} [opts.maxPairings]   Stored pairings cap; the least recently used go first. Default MAX_PAIRINGS.
 * @param {() => number} [opts.now]     Clock in ms (tests).
 * @param {number} [opts.maxToolCalls]  Tool calls one person turn and its hand-offs may relay (default TURN_MAX_TOOL_CALLS).
 * @param {number} [opts.hopMaxMs]      How long one hand-off may run (default HOP_MAX_MS).
 * @param {number} [opts.progressEveryMs] How often a pending tool call gets a progress notification (default PROGRESS_EVERY_MS).
 */
export function createBridge(opts: BridgeOptions = {}) {
  const claudeBin = opts.claudeBin ?? "claude";
  const allowedOrigins = opts.allowedOrigins ?? loadAllowedOrigins();
  const workDir = opts.workDir ?? path.join(os.homedir(), ".gilb-claude-code-bridge", "work");
  const env = opts.env ?? process.env;
  const log = opts.log ?? (() => {});
  const platform = opts.platformOpts?.platform ?? process.platform;
  const home = opts.home ?? opts.platformOpts?.home ?? os.homedir();
  const codePlatform = opts.codePlatform ?? platform;
  // 0.3.19: the access mode is runtime state. Every turn takes its own copy at creation (turn.computer, turn.filesOnly) and uses only that;
  // the live value is read for /v1/hello and for NEW turns.
  const accessFile = opts.stateDir ? path.join(opts.stateDir, ACCESS_FILE) : null;
  const savedAccess = accessFile ? readAccessFile(accessFile, platform, process.getuid?.(), opts.winOwnerOk) : { exists: false, mode: "folder" as AccessMode };
  /** zenity, found once at start in the two system folders (the test hook `which` stands in for the lookup). */
  const zenity: string | null = opts.zenityPath !== undefined ? opts.zenityPath : opts.which ? (opts.which("zenity") ? "/usr/bin/zenity" : null) : platform === "darwin" || platform === "win32" ? null : resolveZenity();
  /** The bridge's own state folder as it is on disk (a custom --state-dir too): barred to every code turn. */
  const stateProtected: string[] = opts.stateDir ? [...new Set([path.resolve(opts.stateDir), resolveThroughLinks(path.resolve(opts.stateDir))])] : [];
  const protectedExtra = [...(opts.extraProtected ?? []), ...stateProtected];
  const fileThere = (f: string) => { try { return fs.lstatSync(f, { throwIfNoEntry: false }) != null; } catch { return true; } };
  const seededMarker = opts.stateDir ? path.join(opts.stateDir, ACCESS_SEEDED) : null;
  const loweredMarker = opts.stateDir ? path.join(opts.stateDir, ACCESS_LOWERED) : null;
  const hadMarkers = { seeded: !!seededMarker && fileThere(seededMarker), lowered: !!loweredMarker && fileThere(loweredMarker) };
  // A lowering that did not reach access.json (the marker), or a setting that has existed and is now gone or unreadable, is folder: a --full-access flag never seeds again once a setting has been saved here.
  let accessMode: AccessMode = hadMarkers.lowered ? "folder" : savedAccess.exists ? savedAccess.mode : opts.fullAccess === true && !hadMarkers.seeded ? "computer" : "folder";
  let accessSource: "flag" | "file" | "default" = hadMarkers.lowered || savedAccess.exists || hadMarkers.seeded ? "file" : opts.fullAccess === true ? "flag" : "default";
  if (opts.fullAccess === true && !savedAccess.exists && hadMarkers.seeded) log("ignoring --full-access: an access setting has been saved on this computer before; use the access switch in GilbApp");
  if (accessMode === "computer" && opts.stateDir && !folderWritable(opts.stateDir)) {
    accessMode = "folder"; // the state folder cannot be written, so a later lowering could not be saved: start in folder mode
    accessSource = "file";
    log("full access is saved, but the state folder cannot be written, so the bridge starts in folder mode");
  }
  if (!savedAccess.exists && accessMode === "computer" && accessFile) {
    try { writeAccessFile(accessFile, "computer"); } catch (e) { log(`could not save the access mode: ${(e as ErrLike)?.message ?? e}`); }
  }
  /** `install-id` only records that this state folder has been started before (so a missing access-limits.json after that is tampering, not a first run). */
  let installFresh = true;
  if (opts.stateDir) {
    const idFile = path.join(opts.stateDir, "install-id");
    // A plain read: it is only a "started before" marker, so it needs none of the owner checks (on Windows those start PowerShell, which is slow).
    let idText = "";
    try { idText = fs.readFileSync(idFile, "utf8"); } catch { /* none */ }
    if (/^[0-9a-f]{16}$/.test(idText.trim())) {
      installFresh = false;
    } else {
      try {
        fs.mkdirSync(opts.stateDir, { recursive: true, mode: 0o700 });
        fs.rmSync(idFile, { force: true });
        fs.writeFileSync(idFile, crypto.randomBytes(8).toString("hex"), { mode: 0o600, flag: "wx" });
      } catch (e) { log(`could not save the install id: ${(e as ErrLike)?.message ?? e}`); }
    }
  }
  /** Windows folder mode is files only; computer mode never is. */
  const filesOnlyFor = (m: AccessMode) => codePlatform === "win32" && m !== "computer";
  const sandboxTmpDirs = () => [...new Set([os.tmpdir(), envGet(env, "TMPDIR") ?? ""].filter((x) => x && path.isAbsolute(x)))];
  /** 0.3.13: computer mode on macOS and Linux runs inside Claude Code's OS sandbox (Windows has none, so every call is asked there). Decided by the turn's own copy of the mode. */
  const sandboxedTurn = (t: Turn) => t.computer && codePlatform !== "win32" && t.code && t.approval === "session";
  // --- Setting grants (0.4.1) ---
  // Needs the bridge's own state folder: the grants are kept there, where a code turn can neither read nor write (denyRead, denyWrite).
  // The state folder's real place, found ONCE here. The store and the secret are read and written through this path only (never the configured one, which
  // may run through a link that can be re-pointed between a check and a read); grantsOff() also turns grants off if the configured path leads elsewhere.
  const stateRealAtStart = opts.stateDir ? resolveThroughLinks(path.resolve(opts.stateDir)) : "";
  const grantBook = opts.stateDir ? createGrantBook({ stateDir: stateRealAtStart, bridgeVersion: BRIDGE_BUILD, log }) : null;
  /** The folders that hold the grants, as the path is written and as the disk resolves it. Denied for write (and read) in both sandbox modes. */
  const grantStoreDeny: string[] = opts.stateDir ? [...new Set([storeFolder(path.resolve(opts.stateDir)), storeFolder(resolveThroughLinks(path.resolve(opts.stateDir)))])] : [];
  const projectRefOf = (t: Turn): ProjectRef | null => (t.proj ? { id: t.proj.name, folderId: t.proj.id, root: t.proj.path } : null);
  /**
   * Why setting grants are off, or "": the state folder is inside the code folder (or ~/Developer), where a code turn can write, so the store could not be
   * kept away from it. The path is tested as written AND as the disk resolves it, and also off when it resolves somewhere else than at start.
   */
  /** `dev:ino` of a path that is a plain directory (a link, a file or a missing path gives null; nothing is followed). */
  const folderIdNow = (p: string): string | null => {
    try {
      const st = fs.lstatSync(p);
      return st.isDirectory() && st.ino ? `${st.dev}:${st.ino}` : null;
    } catch {
      return null;
    }
  };
  const stateIds: [string | null, string | null] = opts.stateDir ? [folderIdNow(stateRealAtStart), folderIdNow(storeFolder(stateRealAtStart))] : [null, null];
  /** Once any check has failed, setting grants stay off until the bridge restarts, even if the check would pass again (a folder swapped away and back). */
  let grantsLatched = "";
  const latchGrantsOff = (why: string): string => {
    if (!grantsLatched) {
      grantsLatched = why;
      log(`Setting grants are off: ${why}`);
    }
    return grantsLatched;
  };
  /** The checks themselves, asked afresh at every use (no remembered "ok"): a link can be re-pointed at any time. `ids` = also compare the folders' device:inode with start. */
  const grantsOffCore = (ids: boolean): string => {
    if (!opts.stateDir) return "";
    const areas = opts.sandboxWritableAreas ?? writableAreas(home, workspace?.path ?? "", sandboxTmpDirs());
    const why = stateDirProblem(path.resolve(opts.stateDir), workspace?.path || undefined, home, platform, undefined, [...areas, ...areas.map((a) => (a ? resolveThroughLinks(a) : a))]);
    if (why) return why;
    if (resolveThroughLinks(path.resolve(opts.stateDir)) !== stateRealAtStart) return `The state folder ${opts.stateDir} now leads to a different place than when the bridge started (a link was changed), so no stored grant can be trusted. Restart the bridge.`;
    // The state folder and its projects folder must still be the very folders seen at start (device:inode, looked at without following a link, and plain
    // directories): a swap of the folder itself or of any folder above it shows here, whatever name the path still has.
    if (ids) {
      const now: [string | null, string | null] = [folderIdNow(stateRealAtStart), folderIdNow(storeFolder(stateRealAtStart))];
      if (now[0] === null || now[0] !== stateIds[0] || now[1] === null || now[1] !== stateIds[1]) return `The state folder ${opts.stateDir} (or its projects folder) is no longer the folder the bridge started with, so no stored grant can be trusted. Restart the bridge.`;
    }
    return "";
  };
  /** Why setting grants are off, or "". The first failure latches: grants stay off (tool not offered, routes 409, nothing applied) until the bridge restarts. */
  const grantsOff = (): string => {
    if (grantsLatched) return grantsLatched;
    const why = grantsOffCore(true);
    return why ? latchGrantsOff(why) : "";
  };
  /** Does this turn get the request tool? A top code turn inside a project, running inside the OS sandbox. */
  const settingTurn = (t: Turn): boolean => grantBook !== null && grantsOff() === "" && t.code && !t.parent && t.proj !== null && (t.computer ? sandboxedTurn(t) : !t.filesOnly && codePlatform !== "win32");
  /** The turn's settings with this project's grants applied (read afresh from disk, every one checked again). */
  const withGrants = <T extends Record<string, any>>(t: Turn, base: T, mode: "folder" | "computer"): T => {
    const ref = projectRefOf(t);
    return grantBook && ref && grantsOff() === "" ? applyGrants(base, grantBook.grantsFor(ref), mode, ref, grantBook.key()) : base;
  };
  const protectOpts = (t: Turn): ProtectOpts => ({ home, places: [...new Set([...protectedPlaces(home, protectedExtra), ...credentialPlaces(home, codePlatform, envGet(env, "CLAUDE_CONFIG_DIR") ?? "")])], base: t.proj?.path ?? workspace?.path ?? home, ci: codePlatform === "darwin" || codePlatform === "win32" });
  /** The folder's identity on disk (device and inode of its real path), so a different folder put at the same path is noticed. "" = unknown. */
  const idOf = (p: string): string => {
    try {
      const st = fs.lstatSync(p, { bigint: true });
      return st.isDirectory() ? `${st.dev}:${st.ino}` : "";
    } catch {
      return "";
    }
  };
  let workspace: { path: string; name: string; id: string } | null = null;
  /**
   * Code mode is off while a folder IS saved: why (a fixed code), a path-free sentence, and since when.
   * Null while code mode is on, and for a bridge that never had a folder. It is cleared wherever a folder is chosen,
   * so an old refusal cannot outlive that choice.
   */
  let codeOff: { reasonCode: CodeOffCode; sentence: string; since: string } | null = null;
  /**
   * The folder code mode was switched off for, kept so the next use can check it again (it is also in workspace.json).
   * Gotcha: a mismatch must NEVER forget this folder. One init that reports a subfolder, or one failed check, used to set the folder to
   * null for every chat until the person chose it again, although nothing was wrong with the folder. A mismatch stops that turn only.
   */
  let savedFolder: { path: string; name: string; id: string; given: string } | null = null;
  /** The folder as it was given (a symlink may differ from its real path): tool summaries accept both. */
  let workspaceGiven: string | null = null;
  const turnRoots = (t: Turn) => (t.proj ? [t.proj.path] : workspace ? workspaceRoots() : []);
  const workspaceRoots = () => (workspace ? [workspace.path, workspaceGiven ?? workspace.path] : []);
  function saveWorkspace(real: string) {
    if (!opts.workspaceFile) return;
    try {
      fs.mkdirSync(path.dirname(opts.workspaceFile), { recursive: true, mode: 0o700 });
      const tmp = `${opts.workspaceFile}.${process.pid}.tmp`;
      fs.rmSync(tmp, { force: true });
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, path: real }), { mode: 0o600, flag: "wx" });
      fs.renameSync(tmp, opts.workspaceFile);
    } catch (e) {
      log(`could not save the code folder: ${(e as ErrLike)?.message ?? e}`); // it still works until the bridge restarts
    }
  }
  /** The folder checks, with this bridge's own state folders barred. */
  function checkFolder(input: string) {
    const stateDirs: string[] = [];
    if (opts.workspaceFile) stateDirs.push(path.dirname(opts.workspaceFile));
    stateDirs.push(path.join(home, ".gilb-claude-code-bridge"));
    try {
      for (const e of fs.readdirSync(home)) if (e.startsWith(".gilb-claude-code-bridge")) stateDirs.push(path.join(home, e));
    } catch {
      /* the listed state folders are still checked */
    }
    return validateWorkspace(input, { home, platform, stateDirs });
  }
  /**
   * Switches code mode off WITHOUT forgetting the folder: the saved folder (and workspace.json) stay, and the next use checks it again.
   * @param reasonCode Why, from the closed list.
   */
  function switchOff(reasonCode: CodeOffCode) {
    if (workspace) savedFolder = { path: workspace.path, name: workspace.name, id: workspace.id, given: workspaceGiven ?? workspace.path };
    log(`code mode is off (reason ${reasonCode})`);
    codeOff = { reasonCode, sentence: codeModeOff(CODE_OFF_WHY[reasonCode]), since: new Date(now()).toISOString() };
    workspace = null;
    workspaceGiven = null;
  }
  /**
   * Is the code folder still the folder that was checked? Its real path now must equal the stored real path and pass the checks again.
   * If not, code mode is switched off for this use (the folder stays saved, workspace.json is left as it is) and false is returned.
   * @returns True when the folder is still the one that was checked.
   */
  function folderStillGood(): boolean {
    // Nothing is chosen, so there is nothing to compare. That is not a change on disk; the caller says why code mode is off.
    if (!workspace) return false;
    let ok = false;
    let why = "";
    try {
      const nowPath = realPath(workspace.path);
      if (nowPath !== workspace.path) why = `its real path is now ${nowPath}`;
      else if (workspace.id === "" || idOf(nowPath) !== workspace.id) why = "it is no longer the same folder (device and inode differ)";
      else {
        const v = checkFolder(nowPath);
        if (v.ok) ok = true;
        else why = v.reason;
      }
    } catch (e) {
      why = (e as ErrLike)?.message ?? String(e);
    }
    if (!ok) {
      log(`the code folder changed on disk (${why}); code mode is off until the folder is checked again`);
      // The folder really changed. Remember that, so a later turn is not told the folder changed again when nothing is left to compare.
      switchOff("folder-check-failed");
    }
    return ok;
  }
  /**
   * The one folder check a stored folder goes through, at start-up and again at the next use after code mode was switched off.
   * It passes only when checkFolder passes; then the folder becomes the code folder.
   * @param input The folder as saved.
   * @returns The checked folder, or the reason it was not used.
   */
  function adoptSavedFolder(input: string): { ok: true; path: string; name: string } | { ok: false; reason: string } {
    const v = checkFolder(input);
    if (v.ok) {
      workspace = { path: v.path, name: v.name, id: idOf(v.path) };
      workspaceGiven = v.path;
      codeOff = null; // a stored folder that still passes is a fresh choice; no earlier refusal applies
    }
    return v;
  }
  /**
   * The next use after code mode was switched off: the saved folder goes through the same check the start-up read applies (adoptSavedFolder).
   * Pass: code mode is on again. Fail: it stays off and says why. A folder that is no longer the same folder (path or device and inode)
   * stays off too: only choosing it again accepts a different folder.
   * It never runs while a code turn or a folder dialog is open, so it cannot race the turn guard that Choose uses.
   */
  function recheckSavedFolder() {
    // A refused child that has not exited yet counts like a running turn: its turn may have left the table when its page hung up.
    if (workspace || !codeOff || !savedFolder || codeChildAlive() || dialogOpen) return;
    const saved = savedFolder;
    const offBefore = codeOff;
    const v = adoptSavedFolder(saved.path);
    if (v.ok && (v.path !== saved.path || idOf(v.path) !== saved.id)) {
      // Passed the checks, but it is another folder than the one that was chosen: take the adoption back.
      workspace = null;
      workspaceGiven = null;
      codeOff = { reasonCode: "folder-check-failed", sentence: codeModeOff(CODE_OFF_WHY["folder-check-failed"]), since: offBefore.since };
      log(`the saved code folder is still not used: it is no longer the same folder (reason folder-check-failed)`);
      return;
    }
    if (v.ok) {
      // The spelling it was given (a link) comes back with it, so a tool summary of a path under the link is still inside the folder.
      workspaceGiven = saved.given;
      log("the saved code folder passed the check again; code mode is on");
      return;
    }
    const code: CodeOffCode = fs.existsSync(saved.path) ? "folder-check-failed" : "folder-missing";
    codeOff = { reasonCode: code, sentence: codeModeOff(CODE_OFF_WHY[code]), since: offBefore.since };
    log(`the saved code folder is still not used: ${v.reason} (reason ${code})`);
  }
  /** Is the project still the folder that was checked: a real directory (not a link), the same real path, device and inode? */
  function projectStillGood(pr: { path: string; id: string }): boolean {
    try {
      const st = fs.lstatSync(pr.path);
      if (!st.isDirectory() || st.isSymbolicLink()) return false;
      return realPath(pr.path) === pr.path && pr.id !== "" && idOf(pr.path) === pr.id;
    } catch {
      return false;
    }
  }
  /** A direct subfolder of the code folder named `name`, as a real directory (never a link): its real path and identity, or null. */
  function resolveProject(name: unknown): { path: string; name: string; id: string } | null {
    if (!workspace || !projectNameOk(name)) return null;
    try {
      const cand = path.join(workspace.path, name);
      const st = fs.lstatSync(cand);
      if (!st.isDirectory() || st.isSymbolicLink()) return null;
      const real = realPath(cand);
      if (path.dirname(real) !== workspace.path) return null;
      const id = idOf(real);
      return id === "" ? null : { path: real, name: path.basename(real), id };
    } catch {
      return null;
    }
  }
  if (opts.workspace) {
    let real = opts.workspace;
    try {
      real = realPath(opts.workspace);
    } catch {
      /* main() checked it; keep what was given */
    }
    workspace = { path: real, name: path.basename(real), id: idOf(real) };
    workspaceGiven = opts.workspace;
    codeOff = null; // a folder given at start is a fresh choice; no earlier refusal applies
    saveWorkspace(real); // --workspace wins and is kept
  } else if (opts.workspaceFile && fs.existsSync(opts.workspaceFile)) {
    try {
      const stored = JSON.parse(fs.readFileSync(opts.workspaceFile, "utf8"));
      if (stored && stored.version === 1 && typeof stored.path === "string") {
        const v = adoptSavedFolder(stored.path);
        if (!v.ok) log(`the stored code folder is not used: ${v.reason}`);
      } else log("the stored code folder file is not in a known shape; it is ignored");
    } catch (e) {
      log(`the stored code folder could not be read: ${(e as ErrLike)?.message ?? e}`);
    }
  }
  const approvalWaitMs = opts.approvalWaitMs ?? APPROVAL_WAIT_MS;
  /** The sentence a code turn is told while code mode is off: built from the reason code, so it is the one the paired hello gives. */
  const offAnswer = () => (codeOff ? codeModeOff(CODE_OFF_WHY[codeOff.reasonCode]) : codeModeOff("no code folder is chosen"));
  /**
   * The answer of a paired route while code mode is off with a saved folder: the sentence and the reason code, the same pair the hello gives
   * (`message`, `reason`), plus `error` so a page that reads `error` shows the sentence.
   * @returns The body.
   */
  const offBody = () => ({ error: offAnswer(), reason: codeOff ? codeOff.reasonCode : undefined, message: offAnswer() });
  /**
   * No code folder for a paired route: the off reason when a folder is saved and off, else the "no code folder" sentence.
   * Status: 404 as before (the page treats a 404 from /v1/workspace as "no folder"), and 409 for a preview, because the client reads a 404 preview
   * that does not start with "This bridge has no code folder" as "update the bridge".
   * @param res The response.
   * @param offStatus The status used while code mode is off.
   */
  const noFolder = (res: ServerResponse, offStatus = 404) => (codeOff && savedFolder ? json(res, offStatus, offBody()) : json(res, 404, { error: NO_WORKSPACE }));
  const NO_WORKSPACE = "This bridge has no code folder. Start it with --workspace <folder>.";
  const maxPairFailures = opts.maxPairFailures ?? 5;
  const maxToolCalls = opts.maxToolCalls ?? TURN_MAX_TOOL_CALLS;
  const hopMaxMs = opts.hopMaxMs ?? HOP_MAX_MS;
  const progressEveryMs = opts.progressEveryMs ?? PROGRESS_EVERY_MS;
  let port = opts.port ?? DEFAULT_PORT;
  // How to start claude, worked out once (Windows: never through a shell; a claude that cannot be started safely is refused).
  const launch = resolveClaudeLaunch(claudeBin, env, opts.platformOpts);
  /**
   * The budget for the process listings on the close path. close() sets the moment it ends (SNAPSHOT_CAP_MS after it starts) and every listing it
   * waits for (the last look in stopChild, the look in killAllTracked, and the two inside killEntries) shares it, so the whole close waits at most
   * that long for listings, not once per listing. Outside close it is null: a stop waits at most SNAPSHOT_CAP_MS for its own look, and the
   * periodic tracking is never capped.
   */
  let closeListingDeadline: number | null = null;
  let closeCapLogged = false;
  const TIMED_OUT = Symbol("listing budget spent");
  const listingLeft = () => (closeListingDeadline === null ? SNAPSHOT_CAP_MS : Math.max(0, closeListingDeadline - Date.now()));
  async function withinListingBudget<T>(p: Promise<T>): Promise<T | typeof TIMED_OUT> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([p, new Promise<typeof TIMED_OUT>((r) => { timer = setTimeout(() => r(TIMED_OUT), listingLeft()); timer.unref(); })]);
    } finally {
      clearTimeout(timer);
    }
  }
  const logListingCap = () => {
    if (closeListingDeadline !== null) { if (closeCapLogged) return; closeCapLogged = true; }
    log(`close: process listing took over ${SNAPSHOT_CAP_MS} ms; killed the tracked tree only`);
  };
  /** Stops a child (and its group). A tracked code child is looked at first, so what it started is known before the group is gone and its children are re-parented. */
  const stopChild = async (c: ChildProcess | null | undefined): Promise<void> => {
    const tr = c?.pid !== undefined ? tracks.get(c.pid) : undefined;
    if (tr && platform !== "win32" && listingLeft() > 0) await withinListingBudget(snapshotTrack(tr)); // Windows: no wait before the kill (the last periodic look is used) // a last look, but a stop never waits long for it
    return killChild(c, env, { ...opts.platformOpts, graceMs: opts.killGraceMs });
  };
  /**
   * Code-turn children that are still alive, kept apart from the turns table (a turn leaves the table the moment its page hangs up, while its
   * claude, or something it started, may still run). A code child leads its own process group (off Windows); when claude ends, whatever is
   * left in its group is stopped too, and only then is it forgotten. ON is refused while this is not empty.
   */
  const liveGroups = new Map<number, ChildProcess>();
  /**
   * Chat children (and hand-offs) that have not exited. A chat child is in the turns table only while its page is there; after a hang-up it is in
   * neither `turns` nor `liveGroups`, and its stop is the unawaited one from the hang-up. close() stops these too and waits for them to exit, inside
   * its listing budget, so a bridge file replaced by an update, or a process that exits, is not left with a chat child still ending.
   */
  const liveChat = new Set<ChildProcess>();
  /**
   * The folder each live code child was started in, by pid: so a new code turn in that folder waits for the child, not only for the turns table.
   * Both keys are taken when the child starts and never updated (not on a rename, not when the folder is deleted); they go only when the child
   * exits. The guard (codeChildAlive) holds a folder that matches either key.
   */
  const liveFolder = new Map<number, { path: string; id: string }>();
  /**
   * A folder's real path as the one-turn guard compares it: `realpath.native`, which also gives the on-disk spelling of a case-insensitive disk.
   * A folder that cannot be read (deleted, or renamed away) keeps its spelling through `path.resolve`, so it can still match a stored path.
   * @param p The folder.
   * @returns The real path, or the resolved path when it cannot be read.
   */
  const guardPath = (p: string): string => {
    try {
      return realPath(p);
    } catch {
      return path.resolve(p);
    }
  };
  /** What each live code child is known to have started: its start time and the descendants seen so far (a parent walk of a plain process list, every 250 ms while it runs and just before any stop). */
  interface Track { pid: number; start: string; desc: Map<number, string> }
  const tracks = new Map<number, Track>();
  /** Recorded processes a stop could not end (pid -> start time). ON stays refused while one is alive and still matches. */
  const residual = new Map<number, string>();
  const procList: () => Promise<ProcRow[] | null> = opts.procList ?? (() => listProcs(platform, env));
  const liveFile = opts.stateDir ? path.join(opts.stateDir, "live-groups.json") : null;
  const LIVE_FILE_DESC_MAX = 40;
  /** live-groups.json: each running code child (pid + start time) and the descendants seen, so the next start can stop EXACTLY those if this bridge is killed. */
  const persistTracks = () => {
    if (!liveFile) return;
    try {
      fs.mkdirSync(path.dirname(liveFile), { recursive: true, mode: 0o700 });
      const tmp = `${liveFile}.${process.pid}.tmp`;
      fs.rmSync(tmp, { force: true });
      const groups = [...tracks.values()].slice(0, 5).map((t) => ({ pid: t.pid, start: t.start, desc: [...t.desc].slice(-LIVE_FILE_DESC_MAX).map(([pid, start]) => [pid, start]) }));
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, groups }), { mode: 0o600, flag: "wx" });
      fs.renameSync(tmp, liveFile);
    } catch (e) {
      log(`could not save the live process list: ${(e as ErrLike)?.message ?? e}`);
    }
  };
  async function snapshotTrack(tr: Track) {
    const rows = await procList();
    if (!rows) return;
    let changed = false;
    const me = rows.find((r) => r.pid === tr.pid);
    if (me && !tr.start) { tr.start = me.start; changed = true; }
    for (const d of descendantsOf(rows, tr.pid)) {
      if (tr.desc.get(d.pid) !== d.start) { tr.desc.set(d.pid, d.start); changed = true; }
    }
    if (changed) persistTracks();
  }
  /** Recorded processes (pid + start time) that are alive now AND still have the recorded start time. */
  const stillMatching = (entries: Iterable<[number, string]>, rows: readonly ProcRow[]): number[] => {
    const byPid = new Map(rows.map((r) => [r.pid, r]));
    return [...entries].filter(([pid, start]) => start !== "" && byPid.get(pid)?.start === start && pid !== process.pid).map(([pid]) => pid);
  };
  /** The recorded descendants (and survivors) of this install's code turns that are alive: what ON must wait for. */
  async function livingTurnProcs(except: ReadonlySet<number> = new Set()): Promise<{ pids: number[]; known: boolean }> {
    const entries: [number, string][] = [...residual];
    for (const tr of tracks.values()) {
      if (except.has(tr.pid)) continue;
      entries.push(...tr.desc);
      if (platform === "win32") entries.push([tr.pid, tr.start]);
    }
    if (entries.length === 0) return { pids: [], known: true }; // nothing recorded: no process list is needed (on Windows that is a PowerShell start)
    const rows = await procList();
    if (!rows) return { pids: [], known: false };
    const pids = stillMatching(entries, rows);
    for (const [pid] of [...residual]) if (!pids.includes(pid)) residual.delete(pid);
    return { pids, known: true };
  }
  /** Ends recorded processes: SIGTERM, then SIGKILL, after a fresh look at each one's start time; whatever survives is remembered. Returns how many survive. */
  async function killEntries(entries: [number, string][]): Promise<number> {
    if (entries.length === 0) return 0;
    const budgeted = closeListingDeadline !== null; // only close() has a budget; the tracking that runs while turns live is never capped
    const startOf = new Map(entries);
    const listed = budgeted ? (listingLeft() > 0 ? await withinListingBudget(procList()) : TIMED_OUT) : await procList();
    let left: number[];
    if (listed === TIMED_OUT) {
      // No fresh look in the budget: end what is already known, without checking start times again (they were recorded at the last look).
      logListingCap();
      left = await killPids(entries.map(([pid]) => pid), { graceMs: opts.killGraceMs, platform, env, execFile: opts.platformOpts?.execFile });
    } else {
      const rows = listed;
      if (!rows) return entries.length;
      left = await killPids(stillMatching(entries, rows), {
        graceMs: opts.killGraceMs, platform, env, execFile: opts.platformOpts?.execFile,
        stillMine: async (alive) => {
          const now2 = budgeted ? (listingLeft() > 0 ? await withinListingBudget(procList()) : TIMED_OUT) : await procList();
          if (now2 === TIMED_OUT) { logListingCap(); return alive; }
          return now2 ? stillMatching(alive.map((p): [number, string] => [p, startOf.get(p) ?? ""]), now2) : [];
        },
      });
    }
    for (const pid of left) residual.set(pid, startOf.get(pid) ?? "");
    return left.length;
  }
  /** Everything recorded below this install's code turns, except the turns in `except`: a fresh look first, then SIGTERM, SIGKILL, a wait. Returns how many are still alive. */
  async function killAllTracked(except: ReadonlySet<number> = new Set()): Promise<number> {
    for (const tr of [...tracks.values()]) {
      if (except.has(tr.pid)) continue;
      if (closeListingDeadline !== null && listingLeft() === 0) { logListingCap(); break; } // the budget is spent: no new listing is started
      const seen = await withinListingBudget(snapshotTrack(tr).then(() => true, () => true));
      if (seen === TIMED_OUT) logListingCap();
    }
    const entries: [number, string][] = [];
    for (const tr of tracks.values()) if (!except.has(tr.pid)) entries.push(...tr.desc);
    return killEntries(entries);
  }
  let snapTimer: NodeJS.Timeout | null = null;
  function ensureSnapTimer() {
    if (snapTimer || tracks.size === 0) return;
    let busy = false;
    snapTimer = setInterval(() => {
      if (tracks.size === 0) { clearInterval(snapTimer!); snapTimer = null; return; }
      if (busy) return;
      busy = true;
      void (async () => { for (const tr of [...tracks.values()]) await snapshotTrack(tr); })().finally(() => { busy = false; });
    }, opts.snapshotMs ?? (platform === "win32" ? 5000 : 250)); // Windows: each look starts PowerShell, so it is rarer there
    snapTimer.unref();
  }
  function trackCodeChild(child: ChildProcess) {
    const pid = child.pid;
    if (pid === undefined) return;
    liveGroups.set(pid, child);
    const tr: Track = { pid, start: "", desc: new Map() };
    tracks.set(pid, tr);
    persistTracks();
    if (platform !== "win32") void snapshotTrack(tr); // Windows: each look starts PowerShell, so none at the start of a turn (a turn is often over before it would finish)
    ensureSnapTimer();
    if (platform !== "win32") (child as unknown as Record<symbol, number>)[GROUP_LEADER] = pid;
    let reaped = false;
    const reap = () => {
      if (reaped) return;
      reaped = true;
      const done = () => {
        delete (child as unknown as Record<symbol, number | undefined>)[GROUP_LEADER];
        liveGroups.delete(pid);
        liveFolder.delete(pid);
        tracks.delete(pid);
        persistTracks();
      };
      // claude is gone: its group, then what was seen below it (a child that left the group), then forget it
      void (async () => {
        if (platform !== "win32") await killGroup(pid, opts.killGraceMs);
        await killEntries([...tr.desc]);
      })().then(done, done);
    };
    child.on("exit", reap);
    child.on("error", reap);
  }

  let pairingCode = newPairingCode();
  let pairFailures = 0;
  const pairingTtlMs = opts.pairingTtlMs ?? PAIRING_TTL_MS;
  const maxPairings = opts.maxPairings ?? MAX_PAIRINGS;
  const now = opts.now ?? Date.now;
  /** sha256 hex of each issued secret -> { origin (the page it was issued to, or null for a non-browser), principalHash, issued, lastUsed, saved } */
  const pairings = new Map<string, Pairing>();

  function loadPairings() {
    if (!opts.pairingsFile) return;
    let rows: unknown;
    try {
      if (fs.statSync(opts.pairingsFile).size > 1024 * 1024) return; // far more than maxPairings rows: not our file
      rows = JSON.parse(fs.readFileSync(opts.pairingsFile, "utf8")).pairings;
    } catch {
      return; // no file, or a damaged one: nobody is paired, the person pairs again
    }
    if (!Array.isArray(rows)) return;
    for (const r of rows.slice(0, 1000) as PairingRow[]) {
      if (!r || typeof r.hash !== "string" || !/^[0-9a-f]{64}$/.test(r.hash)) continue;
      if (typeof r.issued !== "number" || typeof r.lastUsed !== "number") continue;
      if (!Number.isFinite(r.issued) || !Number.isFinite(r.lastUsed)) continue;
      if (now() - r.lastUsed > pairingTtlMs) continue;
      const lastUsed = Math.min(r.lastUsed, now()); // a time in the future cannot make a pairing immortal
      pairings.set(r.hash, {
        origin: typeof r.origin === "string" ? r.origin : null,
        principalHash: typeof r.principalHash === "string" ? r.principalHash : null,
        issued: r.issued,
        lastUsed,
        saved: lastUsed,
      });
    }
    while (pairings.size > maxPairings) dropOldest();
  }
  function dropOldest() {
    let oldest: string | null = null;
    for (const [h, p] of pairings) if (oldest === null || p.lastUsed < pairings.get(oldest)!.lastUsed) oldest = h;
    if (oldest !== null) pairings.delete(oldest);
  }
  function savePairings() {
    if (!opts.pairingsFile) return;
    try {
      const dir = path.dirname(opts.pairingsFile);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.chmodSync(dir, 0o700);
      const tmp = `${opts.pairingsFile}.${process.pid}.tmp`;
      fs.rmSync(tmp, { force: true });
      const rows = [...pairings].map(([hash, p]) => ({ hash, origin: p.origin, principalHash: p.principalHash, issued: p.issued, lastUsed: p.lastUsed }));
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, pairings: rows }), { mode: 0o600, flag: "wx" });
      fs.renameSync(tmp, opts.pairingsFile);
      for (const p of pairings.values()) p.saved = p.lastUsed;
    } catch (e) {
      log(`could not save pairings: ${(e as ErrLike)?.message ?? e}`); // the bridge still works; the person may have to pair again after a restart
    }
  }
  loadPairings();
  /** @type {Map<string, any>} */
  const turns = new Map<string, Turn>();

  const hostOk = (req: IncomingMessage) => {
    const h = String(req.headers.host ?? "");
    return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
  };

  function cors(origin: string | undefined, res: ServerResponse) {
    if (origin === undefined) return true; // not a browser (curl, the tests)
    if (!allowedOrigins.includes(origin)) return false;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-bridge-secret");
    // Chrome Private Network Access: a public page may reach 127.0.0.1 only if the preflight says so.
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Access-Control-Max-Age", "600");
    return true;
  }

  /**
   * Whose request this is. A relayed request (from this bridge's own relay window) carries Origin = the bridge's own origin and
   * `x-gilb-relay-origin` = the page that opened the window, which must be on the allow-list; that page is then the origin for
   * everything downstream. `x-gilb-relay-origin` from anywhere else is refused, so a website cannot use it.
   * Returns { origin, relayed } or null (refuse).
   */
  function effectiveOrigin(req: IncomingMessage): { origin: string | undefined; relayed: boolean } | null {
    const raw = req.headers.origin;
    const relay = req.headers["x-gilb-relay-origin"];
    if (raw !== undefined && raw === `http://${String(req.headers.host ?? "")}`) {
      if (typeof relay !== "string" || !allowedOrigins.includes(relay)) return null;
      return { origin: relay, relayed: true };
    }
    // A browser sends no Origin on a same-origin GET, so the relay window's hello arrives with the header and no Origin.
    // /v1/hello needs no pairing and is answered to a caller with no Origin anyway, so that one request is let through as such.
    if (relay !== undefined && !(raw === undefined && req.method === "GET" && req.url?.split("?")[0] === "/v1/hello")) return null;
    return { origin: raw, relayed: false };
  }

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };

  function readBody(req: IncomingMessage, maxBody = MAX_BODY): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBody) {
          reject(Object.assign(new Error("too large"), { status: 413 }));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve(text ? JSON.parse(text) : {});
        } catch {
          reject(Object.assign(new Error("not json"), { status: 400 }));
        }
      });
      req.on("error", reject);
    });
  }

  /** True when the request carries a live secret that was issued to THIS origin. Using it slides its expiry. */
  const hasSecret = (req: IncomingMessage, origin: string | undefined) => {
    const s = req.headers["x-bridge-secret"];
    if (typeof s !== "string" || !s) return false;
    const hash = sha(s).toString("hex");
    const p = pairings.get(hash);
    if (!p) return false;
    const t = now();
    if (t - p.lastUsed > pairingTtlMs) {
      pairings.delete(hash);
      savePairings();
      return false;
    }
    if (p.origin !== (origin ?? null)) return false;
    p.lastUsed = t;
    if (t - p.saved >= PERSIST_EVERY_MS) savePairings();
    return true;
  };

  function newPairing() {
    pairingCode = newPairingCode();
    pairFailures = 0;
    log(`Pairing code: ${pairingCode}`);
  }

  /** What `request_setting` answers the agent. Never holds the nonce or the hash; those go to the app only. */
  function requestSettingFor(turn: Turn, args: unknown): { text: string; isError: boolean } {
    const ref = projectRefOf(turn);
    if (!grantBook || !ref || !turn.proj) return { text: "This turn cannot ask for a setting.", isError: true };
    if (idOf(turn.proj.path) !== turn.proj.id) return { text: "The project folder changed on disk, so this turn cannot ask for a setting.", isError: true };
    const r = grantBook.request(ref, args, turn.id);
    if (r.status === "refused") return { text: `Refused: ${r.reason}\nAllowed:\n${r.allowed.join("\n")}`, isError: true };
    return { text: "Pending the person's approval in the app. Stop this turn now and say what is blocked; the person approves in the app, and the next turn has it.", isError: false };
  }

  // ---- MCP server (one per turn), spoken to by `claude` over HTTP on 127.0.0.1 ----------------------------------
  function mcpReply(turn: Turn, msg: McpMsg): unknown {
    const { id, method, params } = msg;
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
    const bad = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
    if (method === "initialize") {
      return ok({
        protocolVersion: params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "gilb", version: BRIDGE_VERSION },
      });
    }
    if (method === "ping") return ok({});
    // Every code turn has the bridge's approval tool: a folder turn's WebFetch is asked in both approval settings.
    const askingTurn = turn.code && (turn.computer || turn.approval === "each-write" || !turn.filesOnly);
    if (method === "tools/list") {
      return ok({
        tools: [
          ...turn.tools.filter((t: ToolSpec) => !(settingTurn(turn) && t.name === REQUEST_SETTING_TOOL)).map((t: ToolSpec) => ({
            name: t.name,
            description: t.description ?? "",
            inputSchema: t.inputSchema ?? { type: "object", properties: {} },
          })),
          ...(askingTurn ? [{ name: APPROVE_TOOL, description: "Permission prompt tool: decides whether Claude Code may run a tool.", inputSchema: approveSchema }] : []),
          ...(settingTurn(turn) ? [{ name: REQUEST_SETTING_TOOL, description: requestSettingDescription, inputSchema: requestSettingSchema }] : []),
        ],
      });
    }
    if (method === "tools/call") {
      const name = params?.name;
      // The bridge answers this one itself: never relayed to the page, never counted against the tool budget.
      if (askingTurn && name === APPROVE_TOOL) {
        return decideApproval(turn, (params?.arguments ?? {}) as Record<string, unknown>).then((d) => ok({ content: [{ type: "text", text: JSON.stringify(d) }] }));
      }
      // Also answered by the bridge itself. It can only ASK: it saves one pending request and never touches a grant.
      if (name === REQUEST_SETTING_TOOL && settingTurn(turn)) {
        const text = requestSettingFor(turn, params?.arguments);
        return Promise.resolve(ok({ content: [{ type: "text", text: text.text }], isError: text.isError }));
      }
      if (!turn.tools.some((t: ToolSpec) => t.name === name)) return Promise.resolve(bad(-32602, `Unknown tool ${name}`));
      noteActivity(turn, cap(String(name)), true);
      return relayToolCall(turn, String(name), JSON.stringify(params?.arguments ?? {}), id).then(
        (r) => ok({ content: [{ type: "text", text: r.text }], isError: r.isError }),
        (e: unknown) => ok({ content: [{ type: "text", text: String((e as ErrLike)?.message ?? e) }], isError: true }),
      );
    }
    return bad(-32601, `Method not found: ${method}`);
  }

  /**
   * Stops the nested turn that is answering the pending call `callId`, if one can be picked out.
   * A nested turn that named this call is that one. An older page that sent no id is stopped only when it is the only
   * such hand-off still running, and only when this call is itself a hand-off. Anything else is left running.
   */
  function stopHandoffFor(turn: Turn, callId: string) {
    const stop = (h: Turn) => {
      h.closed = true;
      void stopChild(h.child);
      turn.handoffs.delete(h);
    };
    for (const h of turn.handoffs) {
      if (h.parentCallId === callId) {
        stop(h);
        return;
      }
    }
    const p = turn.pending.get(callId);
    if (!p || !HAND_OFF_TOOLS.has(p.name)) return;
    const unnamed = [...turn.handoffs].filter((h) => h.parentCallId === "");
    if (unnamed.length === 1) stop(unnamed[0]!);
  }

  /**
   * The CLI abandoned (or its process ended with) a pending call. Settle it; if it was the call that a hand-off runs for,
   * stop that nested claude; and tell the page so it stops working on it.
   */
  function cancelCall(turn: Turn, id: string) {
    const p = turn.pending.get(id);
    if (!p) return;
    stopHandoffFor(turn, id);
    turn.pending.delete(id);
    turn.cancelled.add(id);
    if (turn.cancelled.size > MAX_CANCELLED_KEPT) turn.cancelled.delete(turn.cancelled.values().next().value as string);
    p.resolve({ text: "This call was cancelled.", isError: true });
    turn.send("tool_cancelled", { type: "tool_cancelled", id });
  }

  /** The person's turn. A hand-off reaches it through `parent`; `parent === null` is that turn. */
  function personTurn(turn: Turn): Turn {
    let t = turn;
    while (t.parent) t = t.parent;
    return t;
  }

  /**
   * Does this path land inside the folder? It is resolved the way the OS does: segment by segment from the folder (or from the root for an
   * absolute path), and every existing segment is resolved through symlinks before the next one is applied, so `link/..` is the parent of the
   * link's target. A symlink that cannot be resolved (dangling) anywhere on the way counts as outside. A path that starts with `~` is a
   * home-relative path (Claude Code expands it) and is outside; so is one that starts with `$` (a variable no tool expands, but never a path to trust).
   */
  function insideWorkspace(p: string, root0?: string): boolean {
    if (!workspace || typeof p !== "string" || !p || p.includes("\0") || p.startsWith("~") || p.startsWith("$")) return false;
    // Resolved physically as written, and physically again after a plain lexical normalisation (a tool may drop "x/.." before it looks at the disk),
    // and the lexical result must itself be inside.
    const base = root0 ?? workspace.path;
    const lexical = path.resolve(base, p);
    return physicallyInside(p, base) && physicallyInside(lexical, base) && within(lexical, base);
  }
  function physicallyInside(p: string, base?: string): boolean {
    if (!workspace) return false;
    // An absolute path starts at its root ("/" or "C:\\"); the root is not a segment to walk.
    const root = path.isAbsolute(p) ? path.parse(p).root : "";
    let cur = root || (base ?? workspace.path);
    let exists = true;
    for (const seg of p.slice(root.length).split(/[\\/]+/)) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") {
        cur = path.dirname(cur);
        continue;
      }
      cur = path.join(cur, seg);
      if (!exists) continue; // below something that is not there yet: nothing further down exists either
      let st: fs.Stats;
      try {
        st = fs.lstatSync(cur);
      } catch (e) {
        if ((e as ErrLike).code === "ENOENT") {
          exists = false;
          continue;
        }
        return false;
      }
      if (st.isSymbolicLink()) {
        try {
          cur = realPath(cur);
        } catch {
          return false; // a link to nowhere
        }
      }
    }
    return within(cur, base);
  }
  /** Is `p` the code folder or below it? Compared as text: NFC-normalised, and case-insensitively on macOS and Windows. Nothing is rewritten. */
  function within(p: string, base?: string): boolean {
    if (!workspace) return false;
    const pp = opts.pathPlatform ?? platform;
    const ci = pp === "darwin" || pp === "win32";
    const norm = (x: string) => (ci ? x.normalize("NFC").toLowerCase() : x.normalize("NFC"));
    const root = norm(base ?? workspace.path).replace(/[\\/]+$/, "");
    const c = norm(p);
    return c === root || c.startsWith(root + path.sep) || c.startsWith(`${root}/`);
  }

  /** Puts one question to the person and waits. Resolves true only when the person allowed it. */
  function askPerson(turn: Turn, tool: string, summary: string, detail = "", notice = "", scopes: WebScope[] | null = null): Promise<{ allow: boolean; message: string; scope: WebScope }> {
    return new Promise((resolve) => {
      const id = crypto.randomBytes(8).toString("hex");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const entry = {
        answered: false,
        settle: (allow: boolean, message = "The person declined.", scope: WebScope = "once") => {
          if (entry.answered) return;
          entry.answered = true;
          if (timer !== undefined) clearTimeout(timer);
          const sc: WebScope = allow && scopes?.includes(scope) ? scope : "once"; // a deny has no reach; neither has a scope the question did not offer
          turn.send("approval_done", { id, allow, ...(scopes ? { scope: sc } : {}) });
          resolve({ allow, message, scope: sc });
        },
      };
      turn.approvals.set(id, entry);
      timer = setTimeout(() => entry.settle(false, "The person did not answer."), approvalWaitMs);
      turn.send("approval_request", { id, tool, summary, ...(detail ? { detail } : {}), ...(notice ? { notice } : {}), ...(scopes ? { scopes } : {}) });
    });
  }

  /**
   * Approval text is never cut: a run of whitespace is one space.
   * The app shows a long request folded; the person can open the whole text, and approving approves all of it.
   * The ceiling is the relay's practical size: a text over it is not asked about at all.
   */
  const APPROVAL_COMMAND_MAX = 200_000;
  const APPROVAL_PATH_MAX = 1000;
  /** Any character that could hide part of a question: C0/C1 controls (but not TAB, LF, CR), Unicode format characters (bidi, zero-width, soft hyphen, BOM ...) and blank fillers. */
  const HIDDEN_CHARS = /[\p{Cc}\p{Cf}\u115F\u1160\u3164\uFFA0\u2800\u180E]/u;
  // Also: after NFC, a combining mark that stays (strike-through, stacked marks, ...) hides or alters what is read. Ordinary accented letters compose to one character and pass.
  const hasHidden = (x: string) => HIDDEN_CHARS.test(x.replace(/[\t\n\r]/g, "")) || /\p{M}/u.test(x.normalize("NFC"));
  const HAS_BREAK = /[\n\r\u2028\u2029]/;
  const HIDDEN_MSG = "The request contains hidden or control characters, so it cannot be shown for approval; ask for it without them.";
  /** Text shown to the person: every line break (LF, CRLF, CR, U+2028, U+2029) is one " ⏎ " marker; runs of spaces, tabs and other space separators are one space. */
  /** Commands, URLs and queries: every non-ASCII character is shown as <U+XXXX> (a typed ⏎ included, so it cannot fake a line break marker). U+2028 and U+2029 are left for showText, which marks them as line breaks. */
  const escapeNonAscii = (x: string) => x.replace(/[^\x00-\x7F]/gu, (c) => { const cp = c.codePointAt(0)!; return cp === 0x2028 || cp === 0x2029 ? c : `<U+${cp.toString(16).toUpperCase().padStart(4, "0")}>`; });
  const showCommand = (x: string) => showText(escapeNonAscii(x));
  /** The first detail line of a question about a path with non-ASCII characters: each distinct code point once, in order of first appearance (20 at most, then "…"). "" when the path is plain ASCII. */
  const nonAsciiNote = (texts: string[]): string => {
    const seen: string[] = [];
    for (const t of texts) for (const c of t) {
      const cp = c.codePointAt(0)!;
      if (cp > 0x7f) {
        const u = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
        if (!seen.includes(u)) seen.push(u);
      }
    }
    return seen.length === 0 ? "" : `Path contains non-ASCII characters: ${seen.slice(0, 20).join(" ")}${seen.length > 20 ? " …" : ""}`;
  };
  /** The model's description: the only thing `detail` ever holds (capped at 200). The bridge's own lines go in `notice`, a separate field the page can show apart. */
  const descOf = (desc: string) => {
    // From the raw text, non-ASCII as <U+XXXX>; cut by code point and never inside an escape (an escape that does not fit is left out whole).
    const shown = showCommand(desc);
    if (shown.length <= 200) return shown;
    const parts = shown.match(/<U\+[0-9A-F]{4,6}>|[\s\S]/gu) ?? [];
    let out = "";
    for (const p of parts) {
      if (out.length + p.length > 199) break;
      out += p;
    }
    return `${out}…`;
  };
  const NOTICE_MAX = 400;
  const HOST_LINE_MAX = 300;
  const TOO_LONG_ADDRESS = "The address is too long to show for approval; ask for it without that.";
  /** Tools whose fields are not paths: no path note. Every other tool (MultiEdit, MCP tools ...) gets it for file_path, notebook_path and path. */
  const NOT_PATH_TOOLS = new Set(["Bash", "WebFetch", "WebSearch"]);
  const PATH_KEYS = new Set(["file_path", "notebook_path", "path"]);
  /** A copy of the input with every string escaped as a command is (<U+XXXX>), except the values of path keys at the TOP level (the only ones pathNote covers), which keep their characters. Nested path keys are escaped like any other string. */
  const escapeInput = (root: unknown): unknown => {
    // Iterative, so depth cannot overflow the stack. No prototype on a copied object: an own "__proto__" key is a plain key, so JSON.stringify shows it.
    const copy = (v: unknown): unknown => {
      if (typeof v === "string") return escapeNonAscii(v); // from the raw text, never the NFC form (U+212A must show as <U+212A>, not "K")
      if (Array.isArray(v)) return new Array<unknown>(v.length);
      if (v && typeof v === "object") return Object.create(null);
      return v;
    };
    const out = copy(root);
    const work: { src: unknown; dst: unknown; top: boolean }[] = [{ src: root, dst: out, top: true }];
    while (work.length > 0) {
      const { src, dst, top } = work.pop()!;
      if (Array.isArray(src)) {
        const d = dst as unknown[];
        for (let i = 0; i < src.length; i++) {
          d[i] = copy(src[i]);
          if (d[i] !== src[i] && typeof src[i] === "object" && src[i] !== null) work.push({ src: src[i], dst: d[i], top: false });
        }
      } else if (src && typeof src === "object") {
        const d = dst as Record<string, unknown>;
        for (const [k, x] of Object.entries(src as Record<string, unknown>)) {
          const ek = escapeNonAscii(k);
          if (top && PATH_KEYS.has(k) && typeof x === "string") d[ek] = x;
          else {
            d[ek] = copy(x);
            if (x && typeof x === "object") work.push({ src: x, dst: d[ek], top: false });
          }
        }
      }
    }
    return out;
  };
  const TOOL_NAME_OK = /^[A-Za-z0-9_-]{1,128}$/;
  const BAD_TOOL_MSG = "The tool name is not valid.";
  const RESERVED_MSG = "The request holds a reserved key (__proto__); ask for it without that.";
  const CTOR_NOTICE = "Request holds a field named constructor/prototype.";
  const LOOKALIKE_MSG = "Two fields in the request look the same; ask for it without that.";
  /** What is wrong with the input's keys: `deny` is a message when it holds "__proto__" at any depth, or two keys of one object that show as the same text; `ctor` is true when some key is "constructor" or "prototype" (asked about, with a notice). Iterative, so depth cannot overflow the stack. */
  const inputKeyProblem = (root: unknown): { deny: string; ctor: boolean } => {
    const stack: unknown[] = [root];
    let dup = "";
    let ctor = false;
    while (stack.length > 0) {
      const v = stack.pop();
      if (Array.isArray(v)) {
        for (const x of v) stack.push(x);
      } else if (v && typeof v === "object") {
        const seen = new Set<string>();
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
          if (k === "__proto__") return { deny: RESERVED_MSG, ctor };
          if (k === "constructor" || k === "prototype") ctor = true;
          const e = showText(JSON.stringify(escapeNonAscii(k))); // exactly the text the card shows for this key
          if (seen.has(e)) dup = LOOKALIKE_MSG;
          seen.add(e);
          stack.push(x);
        }
      }
    }
    return { deny: dup, ctor };
  };
  const pathNote = (tool: string, input: Record<string, unknown>) => (!NOT_PATH_TOOLS.has(tool) ? nonAsciiNote(["file_path", "notebook_path", "path"].map((k) => input[k]).filter((v): v is string => typeof v === "string")) : "");
  const ONLY_HTTP_MSG = "Only http and https addresses can be fetched.";
  const USERINFO_MSG = "The address hides its real host (user@host form); ask for it without that.";
  const showText = (x: string) => x.split(/\r\n|[\n\r\u2028\u2029]/).join(" ⏎ ").replace(/[ \t\p{Zs}]+/gu, " ").trim();
  const TOO_LONG_COMMAND = "The command is too long to show for approval; ask for it in smaller steps.";
  const TOO_LONG_PATH = "The path is too long to show for approval.";
  const TOO_LONG_REQUEST = "The request is too long to show for approval; ask for it in smaller steps.";

  /** Is this host the person's own computer or local network? `host` is the URL parser's hostname (IPv4 forms already decoded to dotted decimal). */
  const v4Local = (a: number, b: number) => a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  const isOwnNetworkHost = (hostname: string): boolean => {
    let h = hostname.toLowerCase().replace(/\.$/, "");
    if (h.startsWith("[") && h.endsWith("]")) {
      h = h.slice(1, -1);
      const sides = h.split("::");
      if (sides.length > 2) return true;
      const parse = (x: string) => (x === "" ? [] : x.split(":"));
      let l = parse(sides[0]!);
      let r = sides.length === 2 ? parse(sides[1]!) : [];
      const exp = (g: string[]) => g.flatMap((x) => (x.includes(".") ? (() => { const q = x.split(".").map(Number); return [((q[0]! << 8) | q[1]!).toString(16), ((q[2]! << 8) | q[3]!).toString(16)]; })() : [x]));
      l = exp(l);
      r = exp(r);
      if (sides.length === 1 && l.length !== 8) return true;
      if (l.length + r.length > 8) return true;
      const g = [...l, ...Array(8 - l.length - r.length).fill("0"), ...r].map((x) => parseInt(x, 16));
      if (g.some((x) => !Number.isFinite(x))) return true;
      if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return true; // :: and ::1
      if ((g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xffc0) === 0xfec0 || (g[0]! & 0xfe00) === 0xfc00 || (g[0]! & 0xff00) === 0xff00) return true; // link-local, site-local, fc00::/7, multicast
      const embedded = (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && (g[5] === 0xffff || g[5] === 0)) || (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0);
      if (embedded && v4Local(g[6]! >> 8, g[6]! & 255)) return true; // IPv4-mapped / compatible / NAT64
      return false;
    }
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    if (m) return v4Local(Number(m[1]), Number(m[2]));
    if (!h.includes(".")) return true; // single label (a name on this network)
    return /\.(local|localhost|internal|lan|localdomain|intranet|home\.arpa)$/.test(h);
  };
  /** An IP written in a form other than plain dotted decimal (a bare decimal, octal or hex number): asked once, like a local host, so a look-alike cannot slip past. */
  const oddIpForm = (rawUrl: string, hostname: string): boolean => {
    const raw = /^[A-Za-z][A-Za-z0-9+.-]*:[\\/]*([^\\/?#]*)/.exec(rawUrl)?.[1]?.replace(/:\d*$/, "") ?? "";
    return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) && raw.toLowerCase() !== hostname;
  };
  const LOCAL_NOTICE = " \u2014 this computer or your local network";
  /** The WebFetch display, shared by every mode: the URL shown (non-ASCII as <U+XXXX>) with a `Host:` notice, or a denial message. */
  const webFetchView = (input: Record<string, unknown>): { deny: string } | { summary: string; notice: string; local: boolean; origin: string; rest: string } => {
    const t = typeof input.url === "string" ? input.url : "";
    if (hasHidden(t)) return { deny: HIDDEN_MSG };
    const summary = showCommand(t) || "WebFetch";
    let host: string;
    try {
      const u = new URL(t);
      if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname) return { deny: ONLY_HTTP_MSG };
      if (u.username || u.password) return { deny: USERINFO_MSG };
      host = u.hostname;
    } catch {
      return { deny: ONLY_HTTP_MSG }; // does not parse: nothing to ask about
    }
    const line = `Host: ${host}`;
    if (line.length > HOST_LINE_MAX) return { deny: TOO_LONG_ADDRESS };
    if (summary.length > APPROVAL_COMMAND_MAX) return { deny: TOO_LONG_REQUEST };
    const local = isOwnNetworkHost(host) || oddIpForm(t, host);
    const u2 = new URL(t);
    return { summary, notice: local ? `${line}${LOCAL_NOTICE}` : line, local, origin: `${u2.protocol}//${u2.host}`, rest: escapeNonAscii(u2.pathname + u2.search + u2.hash) };
  };
  /** The `activity` text of a web call: the URL as shown; over the cap, the scheme and host stay whole and the rest is cut. */
  const webActivity = (view: { summary: string; origin: string; rest: string }): string => (view.summary.length <= SUMMARY_CAP ? view.summary : `${view.origin}${cap(view.rest, Math.max(SUMMARY_CAP - view.origin.length, 2))}`);
  /** One more tool call against the turn's budget. False (and the page told, once) when it is spent. */
  function spendToolCall(turn: Turn): boolean {
    turn.root.calls += 1;
    if (turn.root.calls <= maxToolCalls) return true;
    const root = personTurn(turn);
    if (!root.budgetSpent) {
      root.budgetSpent = true;
      root.send("budget_spent", { type: "budget_spent", maxToolCalls });
    }
    return false;
  }
  const BUDGET_MSG = "This turn has used all its tool rounds. Tell the person what you did, and stop.";

  /** Tools of Claude Code that touch no place by themselves (subagents and todo lists): they run unasked in a sandboxed computer turn; their own file and shell calls come here like any other. */
  const SANDBOX_FREE_TOOLS = new Set(["TodoWrite", "BashOutput", "KillShell", "KillBash", "ExitPlanMode", "EnterPlanMode", "Task", "Agent", "TaskOutput", "TaskStop", "Skill", "SlashCommand", "ToolSearch"]);
  /**
   * 0.3.13, computer mode with the OS sandbox (approval `session`): what `bridge_approve` answers WITHOUT asking the person.
   * A file tool is allowed unless a path it names is a protected place (read through `~`, `$HOME`, `..` and every link); a command is allowed
   * (the sandbox, not this text, is what locks the protected places) unless it is on the short asked list; null = ask the person like each-write does.
   */
  function sandboxDecision(turn: Turn, tool: string, input: Record<string, unknown>): Record<string, unknown> | null {
    const deny = (message: string) => ({ behavior: "deny", message });
    const allow = () => ({ behavior: "allow", updatedInput: input });
    const po = protectOpts(turn);
    const expand = (raw: string) => (raw === "~" || raw.startsWith("~/") ? path.join(home, raw.slice(1)) : /^\$(?:\{HOME\}|HOME)(?=\/|$)/.test(raw) ? path.join(home, raw.replace(/^\$(?:\{HOME\}|HOME)/, "")) : raw);
    let root = po.base;
    for (const k of ["file_path", "notebook_path", "path"]) {
      const v = input[k];
      if (v === undefined) continue;
      if (typeof v !== "string" || v === "") return deny("The path is not valid.");
      const hit = protectedHit(v, po);
      if (hit) return deny(`This place is protected: ${hit}.`);
      if (k === "path" && (tool === "Glob" || tool === "Grep")) root = path.resolve(po.base, expand(v));
    }
    if (tool === "Edit" || tool === "Write" || tool === "MultiEdit" || tool === "NotebookEdit") {
      for (const k of ["file_path", "notebook_path", "path"]) {
        const v = input[k];
        if (typeof v !== "string") continue;
        const why = writeBlock(v, po, writableAreas(home, workspace?.path ?? home, sandboxTmpDirs()), writeOnlyPlaces(home));
        if (why) return deny(why);
      }
    }
    if (tool === "Glob") {
      if (typeof input.pattern !== "string") return deny("The pattern is not valid.");
      const hit = globHitsProtected(input.pattern, { ...po, base: root });
      if (hit) return deny(`This place is protected: ${hit}.`);
    }
    if (tool === "Bash") {
      if (input.dangerouslyDisableSandbox === true) return deny("Commands run only inside the sandbox on this computer.");
      return askedCommand(typeof input.command === "string" ? input.command : "") ? null : allow();
    }
    if (tool === "Read" || tool === "Edit" || tool === "Write" || tool === "MultiEdit" || tool === "NotebookEdit" || tool === "Glob" || tool === "Grep") return allow();
    if (SANDBOX_FREE_TOOLS.has(tool)) return allow();
    return null;
  }

  /** What `bridge_approve` answers to Claude Code: {"behavior":"allow","updatedInput":...} or {"behavior":"deny","message":...}. */
  async function decideApproval(turn: Turn, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (opts.logApproveArgs) log(`bridge_approve raw arguments: ${JSON.stringify(args)}`);
    const tool = typeof args.tool_name === "string" ? args.tool_name : "";
    const input = args.input && typeof args.input === "object" ? (args.input as Record<string, unknown>) : {};
    const deny = (message: string) => ({ behavior: "deny", message });
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const scope = turn.proj?.path ?? workspace?.path ?? "";
    if (!TOOL_NAME_OK.test(tool)) return deny(BAD_TOOL_MSG);
    const keyProblem = inputKeyProblem(input);
    if (keyProblem.deny) return deny(keyProblem.deny);
    // Starting the sonnet-coder subagent changes nothing by itself; each write and command it then makes is asked like any other. No other subagent type may start.
    if (turn.delegate && SUBAGENT_TOOL_NAMES.includes(tool)) return input.subagent_type === "sonnet-coder" ? { behavior: "allow", updatedInput: input } : deny(ONLY_CODER_MSG);
    const sandboxed = sandboxedTurn(turn);
    if (sandboxed && tool !== "WebFetch" && tool !== "WebSearch") {
      const d = sandboxDecision(turn, tool, input);
      if (d) return d;
    }
    if (turn.computer && !(sandboxed && (tool === "WebFetch" || tool === "WebSearch"))) {
      // Computer mode (each-write, Windows, and what the sandbox leaves to the person): every request is asked of the person, no automatic allow or deny by path.
      let summary: string;
      let detail = "";
      let notice = "";
      // 0.3.17: a protected place or a credential place is refused outright here too (Windows, each-write); the person is not asked.
      if (tool !== "Bash") {
        const po = protectOpts(turn);
        for (const k of ["file_path", "notebook_path", "path"]) {
          const v = input[k];
          if (typeof v !== "string" || v === "") continue;
          const hit = protectedHit(v, po);
          if (hit) return deny(`This place is protected: ${hit}.`);
        }
      }
      // A path is shown exactly: a line break or a hidden character in any path field is a denial; so is a path over the limit.
      for (const k of ["file_path", "notebook_path", "path"]) {
        const v = input[k];
        if (typeof v === "string") {
          if (hasHidden(v) || HAS_BREAK.test(v)) return deny(HIDDEN_MSG);
          if (v.length > APPROVAL_PATH_MAX) return deny(TOO_LONG_PATH);
        }
      }
      if (hasHidden(tool) || hasHidden(str(input.description))) return deny(HIDDEN_MSG);
      if (tool === "Bash") {
        const c = str(input.command);
        if (hasHidden(c)) return deny(HIDDEN_MSG);
        summary = showCommand(c) || "Bash";
        if (summary.length > APPROVAL_COMMAND_MAX) return deny(TOO_LONG_COMMAND);
        detail = descOf(str(input.description));
      } else if (tool === "Read" || tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
        const p = (tool === "NotebookEdit" ? str(input.notebook_path) : "") || str(input.file_path) || str(input.notebook_path) || str(input.path);
        // "~" and "$" paths are shown exactly as given (never resolved against the folder); absolute as given; other relative ones resolved against the start folder.
        summary = p ? (p.startsWith("~") || p.startsWith("$") || path.isAbsolute(p) ? p : path.resolve(scope || "/", p)) : tool;
        if (summary.length > APPROVAL_PATH_MAX) return deny(TOO_LONG_PATH);
      } else if (tool === "WebFetch" || tool === "WebSearch") {
        const t = str(tool === "WebFetch" ? input.url : input.query);
        if (hasHidden(t)) return deny(HIDDEN_MSG);
        summary = showCommand(t) || tool;
        if (tool === "WebFetch") {
          let host: string;
          try {
            const u = new URL(t);
            if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname) return deny(ONLY_HTTP_MSG);
            if (u.username || u.password) return deny(USERINFO_MSG);
            host = u.hostname;
          } catch {
            return deny(ONLY_HTTP_MSG); // does not parse: nothing to ask about
          }
          const line = `Host: ${host}`;
          if (line.length > HOST_LINE_MAX) return deny(TOO_LONG_ADDRESS);
          notice = line;
        }
      } else {
        let j: string;
        let ej: string;
        try {
          j = JSON.stringify(input);
          ej = JSON.stringify(escapeInput(input));
        } catch {
          return deny(TOO_LONG_REQUEST); // cannot be printed: never fall back to the raw text
        }
        if (hasHidden(j)) return deny(HIDDEN_MSG);
        summary = showText(`${escapeNonAscii(tool || "tool")} ${ej}`);
      }
      if (summary.length > APPROVAL_COMMAND_MAX) return deny(TOO_LONG_REQUEST);
      const note = pathNote(tool, input);
      if (note) notice = notice ? `${notice}\n${note}` : note;
      if (keyProblem.ctor) notice = notice ? `${notice}\n${CTOR_NOTICE}` : CTOR_NOTICE;
      if (notice.length > NOTICE_MAX) return deny(TOO_LONG_ADDRESS);
      const a = await askPerson(turn, tool, summary, detail, notice);
      return a.allow ? { behavior: "allow", updatedInput: input } : deny(a.message);
    }
    // Folder mode on the web (0.3.12): a search is free; a page is always asked, once or for the rest of this turn.
    if (tool === "WebSearch") {
      if (!spendToolCall(turn)) return deny(BUDGET_MSG);
      const q = showCommand(str(input.query));
      noteActivity(turn, cap(q || tool), false);
      turn.send("activity", { tool, summary: cap(q || tool) });
      return { behavior: "allow", updatedInput: input };
    }
    if (tool === "WebFetch") {
      if (hasHidden(str(input.description))) return deny(HIDDEN_MSG);
      const view = webFetchView(input);
      if ("deny" in view) return deny(view.deny);
      let notice = view.notice;
      if (keyProblem.ctor) notice = `${notice}\n${CTOR_NOTICE}`;
      if (notice.length > NOTICE_MAX) return deny(TOO_LONG_ADDRESS);
      const runs = (): Record<string, unknown> => {
        // A page that runs is always shown to the person, and counts against the turn's tool budget.
        if (!spendToolCall(turn)) return deny(BUDGET_MSG);
        noteActivity(turn, cap(view.summary), false);
        turn.send("activity", { tool, summary: webActivity(view) });
        return { behavior: "allow", updatedInput: input };
      };
      // A local or private host is asked every time, once only: a turn grant never covers it. Other pages: the display denials above still applied.
      if (turn.webTurnGrant && !view.local) return runs();
      const a = await askPerson(turn, tool, view.summary, "", notice, view.local ? ["once"] : WEB_SCOPES);
      if (!a.allow) return deny(a.message);
      if (a.scope === "turn") turn.webTurnGrant = true;
      return runs();
    }
    // A session turn cannot ask the person anything else: what Claude Code would ask about is refused.
    if (turn.approval === "session") return deny("Nobody can answer here, so this is refused.");
    if (tool === "Read") {
      if (!insideWorkspace(str(input.file_path), scope)) return deny("Outside the code folder.");
      return { behavior: "allow", updatedInput: input };
    }
    if (tool === "Glob" || tool === "Grep") {
      // `path`: absent means the folder itself; present it must be a non-empty string inside the folder (no "~", no non-string).
      if (input.path !== undefined && (typeof input.path !== "string" || input.path === "")) return deny("Outside the code folder.");
      if (!insideWorkspace(str(input.path) || scope, scope)) return deny("Outside the code folder.");
      // A glob (Glob's pattern, Grep's glob filter) may use only plain characters, no climbing out and no absolute start.
      const glob = tool === "Glob" ? input.pattern : input.glob;
      if (tool === "Glob" || glob !== undefined) {
        if (typeof glob !== "string" || !SAFE_GLOB.test(glob) || glob.split("/").includes("..") || glob.startsWith("/") || glob.startsWith("\\")) return deny("Outside the code folder.");
      }
      return { behavior: "allow", updatedInput: input };
    }
    let summary: string;
    let detail = "";
    if (tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
      // NotebookEdit is decided on notebook_path, the others on file_path; and any path key present, whichever it is, must be inside.
      const main = tool === "NotebookEdit" ? input.notebook_path : input.file_path;
      if (typeof main !== "string" || main === "") return deny("Outside the code folder.");
      for (const k of ["file_path", "notebook_path", "path"]) {
        if (input[k] !== undefined && (typeof input[k] !== "string" || !insideWorkspace(input[k] as string, scope))) return deny("Outside the code folder.");
      }
      for (const k of ["file_path", "notebook_path", "path"]) {
        const v = input[k];
        if (typeof v === "string" && (hasHidden(v) || HAS_BREAK.test(v))) return deny(HIDDEN_MSG);
      }
      if (str(main).length > APPROVAL_PATH_MAX) return deny(TOO_LONG_PATH);
      summary = toolSummary(tool, input, turnRoots(turn)); // the path inside the folder, shown exactly
    } else if (tool === "Bash") {
      // The question shows the whole command (whitespace collapsed, never cut); the model's own description is only a second line.
      const c = str(input.command);
      if (hasHidden(c) || hasHidden(str(input.description))) return deny(HIDDEN_MSG);
      summary = showCommand(c) || "Bash";
      if (summary.length > APPROVAL_COMMAND_MAX) return deny(TOO_LONG_COMMAND);
      detail = descOf(str(input.description));
    } else {
      return deny("This tool is not allowed in a code turn.");
    }
    let notice = pathNote(tool, input);
    if (keyProblem.ctor) notice = notice ? `${notice}\n${CTOR_NOTICE}` : CTOR_NOTICE;
    if (notice.length > NOTICE_MAX) return deny(TOO_LONG_ADDRESS);
    const a = await askPerson(turn, tool, summary, detail, notice);
    return a.allow ? { behavior: "allow", updatedInput: input } : deny(a.message);
  }

  function relayToolCall(turn: Turn, name: string, args: unknown, rpcId?: unknown): Promise<ToolResult> {
    return new Promise((resolve, reject) => {
      if (turn.closed) return reject(new Error("The app page left; the turn was cancelled."));
      // One budget for the turn and its hand-offs: past it nothing more is relayed, and the model is told so.
      // The first refusal marks the person's turn and tells its stream once; the final message repeats the mark.
      turn.root.calls += 1;
      if (turn.root.calls > maxToolCalls) {
        const root = personTurn(turn);
        if (!root.budgetSpent) {
          root.budgetSpent = true;
          root.send("budget_spent", { type: "budget_spent", maxToolCalls });
        }
        return reject(new Error("This turn has used all its tool rounds. Tell the person what you did, and stop."));
      }
      const id = crypto.randomBytes(8).toString("hex");
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fulfill = (r: ToolResult) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        resolve(r);
      };
      const fail = (e: unknown) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        reject(e);
      };
      // The page never answered. Reject with the timeout sentence (once), and still stop the hand-off and tell the page,
      // the same as a cancel. cancelCall then resolves the pending entry; fulfill ignores that second settlement.
      timer = setTimeout(() => {
        if (settled) return;
        fail(new Error("The app did not answer the tool call in time."));
        cancelCall(turn, id);
      }, TOOL_WAIT_MS);
      turn.pending.set(id, { resolve: fulfill, reject: fail, name, rpcId });
      turn.send("tool_request", { id, name, arguments: args });
    });
  }

  async function handleMcp(req: IncomingMessage, res: ServerResponse, turnId: string, token: string) {
    // Only the local claude process uses this; a browser must never reach it.
    if (req.headers.origin !== undefined) return json(res, 403, { error: "no browsers here" });
    const turn = turns.get(turnId);
    if (!turn || !same(token, turn.mcpToken)) return json(res, 404, { error: "no such turn" });
    if (req.method === "GET" || req.method === "DELETE") {
      res.writeHead(405, { allow: "POST" });
      return res.end();
    }
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
    }
    const batch = Array.isArray(body);
    const msgs: McpMsg[] = batch ? body as unknown as McpMsg[] : [body as McpMsg];
    // A tool call that carries a progressToken, from a client that accepts SSE, is answered as a stream: progress
    // notifications while it is pending, then the result. Everything else is answered as before.
    const only = msgs[0];
    const ptoken = !batch ? only?.params?._meta?.progressToken : undefined;
    if (!batch && only?.method === "tools/call" && only.id !== undefined && ptoken !== undefined && ptoken !== null &&
        String(req.headers.accept ?? "").includes("text/event-stream")) {
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" });
      const write = (m: unknown) => {
        if (res.writableEnded || res.destroyed) return;
        res.write(`event: message\ndata: ${JSON.stringify(m)}\n\n`);
      };
      let n = 0;
      const timer = setInterval(() => {
        n += 1;
        write({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: ptoken, progress: n, message: "still working" } });
      }, progressEveryMs);
      // The CLI gave up by closing this request before any reply was written: drop the pending call (and its hand-off).
      // A close after the reply (the normal end of the stream) does nothing more.
      let replied = false;
      res.on("close", () => {
        clearInterval(timer);
        if (replied || !only) return;
        for (const [pid, p] of [...turn.pending]) if (String(p.rpcId) === String(only.id)) cancelCall(turn, pid);
      });
      try {
        write(await mcpReply(turn, only));
        replied = true;
      } finally {
        clearInterval(timer);
      }
      if (!res.writableEnded && !res.destroyed) res.end();
      return;
    }
    const replies = [];
    for (const m of msgs) {
      if (m && m.id === undefined) {
        // A notification. The one that matters: the CLI gave up on a call it made.
        if (m.method === "notifications/cancelled" && m.params?.requestId !== undefined) {
          for (const [pid, p] of [...turn.pending]) if (String(p.rpcId) === String(m.params.requestId)) cancelCall(turn, pid);
        }
        continue;
      }
      replies.push(await mcpReply(turn, m));
    }
    if (replies.length === 0) {
      res.writeHead(202);
      return res.end();
    }
    return json(res, 200, batch ? replies : replies[0]);
  }

  // ---- one chat turn ---------------------------------------------------------------------------------------------
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** Computer mode: the person's own Claude Code, started as their terminal would (own prompt, CLAUDE.md, skills, hooks and MCP servers all load). */
  function computerArgs(turn: Turn, mode: ClaudeMode, mcp: unknown): string[] {
    const args = [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--mcp-config", JSON.stringify(mcp), // no --strict-mcp-config: the person's own MCP servers load too
      "--allowedTools", "mcp__gilb",
      // session: edits are accepted. each-write: `manual` (the CLI's name for the asking mode; it reports "default") asks, and the bridge's own tool answers.
      "--permission-mode", turn.approval === "each-write" ? "manual" : "acceptEdits",
      "--permission-prompts", "host",
      "--permission-prompt-tool", `mcp__gilb__${APPROVE_TOOL}`,
      "--settings", JSON.stringify(sandboxedTurn(turn) ? withGrants(turn, computerSandboxSettings(home, workspace?.path ?? home, protectedPlaces(home, protectedExtra), sandboxTmpDirs(), [...claudeDirs([workspace?.path ?? home, path.join(home, "Developer")]), ...gitPlaces([workspace?.path ?? home, path.join(home, "Developer")]), ...claudeGlobs(workspace?.path ?? home, home), ...grantStoreDeny], envGet(env, "CLAUDE_CONFIG_DIR") ?? ""), "computer") : { permissions: { deny: fileToolDenyRules(protectOpts(turn).places), disableBypassPermissionsMode: "disable" } }),
      "--append-system-prompt", `${turn.system}\n\n${turn.proj ? computerProjectParagraph(turn.proj.name, turn.proj.path, workspace?.name ?? "") : computerParagraph(workspace?.name ?? "", workspace?.path ?? "")}${codeTurnTail(turn.delegate, "\n\n", turn.preview)}`,
      "--system-prompt-snapshot", "off",
    ];
    if (mode.resume) args.push("--resume", mode.sessionId);
    else args.push("--session-id", mode.sessionId);
    if (turn.model) args.push("--model", turn.model);
    if (turn.effort) args.push("--effort", turn.effort);
    if (turn.delegate) args.push("--agents", delegateAgents(false, true));
    return args;
  }

  function claudeArgs(turn: Turn, mode: ClaudeMode) {
    const mcp = { mcpServers: { gilb: { type: "http", url: `http://127.0.0.1:${port}/mcp/${turn.id}/${turn.mcpToken}` } } };
    const filesOnly = turn.filesOnly;
    if (turn.code && turn.computer) {
      const a = computerArgs(turn, mode, mcp);
      if (turn.images.length > 0) a.push("--input-format", "stream-json");
      return a;
    }
    const args = turn.code ? [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--tools", [...(filesOnly ? FILES_ONLY_TOOLS : [...CODE_TOOLS, ...WEB_TOOLS]), ...(turn.delegate ? [SUBAGENT_TOOL] : [])].join(","),
      "--restricted",
      "--strict-mcp-config",
      "--mcp-config", JSON.stringify(mcp),
      "--allowedTools", "mcp__gilb",
      // session: edits are accepted; the bridge's own tool answers every other ask (only a WebFetch is put to the person; the rest is refused). each-write: `manual` asks, and the bridge's own tool answers.
      "--permission-mode", turn.approval === "each-write" ? "manual" : "acceptEdits",
      "--permission-prompts", turn.approval === "each-write" || !filesOnly ? "host" : "none",
      ...(turn.approval === "each-write" || !filesOnly ? ["--permission-prompt-tool", `mcp__gilb__${APPROVE_TOOL}`] : []),
      "--disable-slash-commands",
      "--settings", JSON.stringify(withGrants(turn, codeTurnSettings(os.homedir(), codePlatform, [...(opts.extraDenyRead ?? []), ...stateProtected], turn.approval, envGet(env, "CLAUDE_CONFIG_DIR") ?? "", turn.delegate, grantStoreDeny), "folder")),
      "--system-prompt", turn.system,
      "--system-prompt-snapshot", "off",
      "--append-system-prompt", turn.proj
        ? `You are working in the project folder "${turn.proj.name}" inside the code folder "${workspace?.name ?? ""}" on the person's own computer. ${filesOnly ? "Read and write files only inside this project folder." : "Read, write and run commands only inside this project folder."} ${filesOnly ? FILES_ONLY_SENTENCE : `${NETWORK_SENTENCE} ${PROJECT_PACKAGE_JSON_SENTENCE} ${vendorSentences(turn.approval)}`} ${filesOnly ? "" : `${WEB_SENTENCE} `}When something is refused, say so in one line and do not try another way around it. When you finish, list the files you changed.${codeTurnTail(turn.delegate, " ", turn.preview)}`
        : `You are working in the code folder "${workspace?.name ?? ""}" on the person's own computer. ${filesOnly ? "Read and write files only inside this folder." : "Read, write and run commands only inside this folder."} ${filesOnly ? FILES_ONLY_SENTENCE : `${NETWORK_SENTENCE} ${OWN_PACKAGE_JSON_SENTENCE} ${vendorSentences(turn.approval)}`} ${APP_FOLDER_SENTENCE} ${filesOnly ? "" : `${WEB_SENTENCE} `}When something is refused, say so in one line and do not try another way around it. When you finish, list the files you changed.${codeTurnTail(turn.delegate, " ", turn.preview)}`,
    ] : [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      // Claude Code's own tools (shell, files, web) are OFF: a pane turn cannot touch this computer.
      "--tools", "",
      // Only the GilbPlatform tools this turn was given, and nothing else is allowed to prompt.
      "--strict-mcp-config",
      "--mcp-config", JSON.stringify(mcp),
      "--allowedTools", "mcp__gilb",
      "--permission-mode", "dontAsk",
      "--disable-slash-commands",
      // Restricted mode ignores the person's user/project/local settings files: their hooks (shell commands),
      // permission rules and any apiKeyHelper do not apply to a pane turn. It also removes code-running tools.
      "--restricted",
      "--system-prompt", turn.system,
      "--system-prompt-snapshot", "off",
    ];
    if (mode.resume) args.push("--resume", mode.sessionId);
    else args.push("--session-id", mode.sessionId);
    if (turn.model) args.push("--model", turn.model);
    if (turn.effort) args.push("--effort", turn.effort);
    if (turn.delegate) args.push("--agents", delegateAgents(filesOnly, false));
    // Pictures go on stdin as one stream-json line, so they are never in the argument list.
    if (turn.images.length > 0) args.push("--input-format", "stream-json");
    return args;
  }

  /** Records a sign of life on the top-level turn (a hand-off's activity counts for the turn that asked for it). */
  function noteActivity(turn: Turn, what: string, countCall: boolean) {
    const top = turn.parent ?? turn;
    top.lastActivityAt = now();
    top.lastActivity = what;
    if (countCall) top.toolCalls += 1;
  }

  /** Code turn: turns the CLI's assistant/user stream events into `activity` and `tool_error` events. */
  function codeEvents(turn: Turn, ev: ClaudeEvent, tracked: Map<string, { tool: string; summary: string }>) {
    const content = ev.message?.content;
    if (!Array.isArray(content)) return;
    for (const b of content as Array<Record<string, unknown>>) {
      if (!b || typeof b !== "object") continue;
      if (ev.type === "assistant" && b.type === "tool_use" && typeof b.name === "string" && !b.name.startsWith("mcp__") && !(!turn.computer && (b.name === "WebFetch" || b.name === "WebSearch"))) { // folder mode: bridge_approve shows the URL or query itself
        const summary = toolSummary(b.name, (b.input ?? {}) as Record<string, unknown>, turnRoots(turn));
        if (typeof b.id === "string") tracked.set(b.id, { tool: b.name, summary });
        noteActivity(turn, cap(summary), true);
        turn.send("activity", { tool: b.name, summary: cap(summary) });
      } else if (ev.type === "user" && b.type === "tool_result" && b.is_error === true && typeof b.tool_use_id === "string") {
        const t = tracked.get(b.tool_use_id);
        if (!t) continue;
        const raw = b.content;
        const text = typeof raw === "string" ? raw : Array.isArray(raw) ? (raw as Array<{ text?: unknown }>).map((x) => (typeof x?.text === "string" ? x.text : "")).join(" ") : "";
        turn.send("tool_error", { tool: t.tool, summary: cap(t.summary), text: text.slice(0, 200) });
      }
    }
  }

  /**
   * `time_left`: tells the page the Time line VALUE an agent has just written, as soon as it is written (the page otherwise sees the
   * agent's text only when the turn ends). Why it is shaped like this:
   *  - Only the TOP turn: a hand-off's nested turn reads and sends nothing (owner's decision, 2026-11-28: only the top agent's estimate drives the bar).
   *  - Only whole `assistant` events (see latestTimeLeft): what the agent did with tools, tool results and partial text never counts.
   *  - The value only, never text: the payload is exactly { value }; the line stays in the text and the turn's result is unchanged.
   *  - Caps: sent only when the value differs from the last one sent, and at most TIME_LEFT_MAX_EVENTS per turn (one log line when the cap is first hit).
   *  - Never throws: a failure sends nothing and the turn goes on.
   */
  function timeLeftEvents(turn: Turn, ev: ClaudeEvent) {
    if (turn.parent) return;
    try {
      const value = latestTimeLeft(ev);
      if (value === null || value === turn.timeLeftLast) return;
      const sent = turn.timeLeftSent ?? 0;
      if (sent > TIME_LEFT_MAX_EVENTS) return; // the notice is already written
      if (sent === TIME_LEFT_MAX_EVENTS) {
        turn.timeLeftSent = sent + 1;
        log(`time_left: turn ${turn.id} reached ${TIME_LEFT_MAX_EVENTS} events; no more are sent for this turn`);
        return;
      }
      turn.timeLeftLast = value;
      turn.timeLeftSent = sent + 1;
      turn.send("time_left", { value });
    } catch {
      /* the estimate is a convenience: nothing is sent and the turn goes on */
    }
  }

  /** Runs `claude` once. Resolves { result?, error?, sessionId, model, apiKeyRefused?, bridgeRefused? }. */
  function runClaude(turn: Turn, mode: ClaudeMode, prompt: string): Promise<RunClaudeOut> {
    return new Promise((resolve) => {
      const { computer, filesOnly } = turn; // this turn's own copy of the mode
      if (!launch.ok) return resolve({ error: launch.reason, sessionId: mode.sessionId, model: "" });
      // The last look at the folder before the child starts there.
      // No folder means code mode is already off. Say why. Calling it a change on disk would be false: nothing was compared.
      // bridgeRefused: this turn is a bridge safety refusal. A resumed turn must not be tried again.
      if (turn.code && !workspace) return resolve({ error: offAnswer(), sessionId: mode.sessionId, model: "", bridgeRefused: true });
      if (turn.code) opts.beforeRecheck?.();
      if (turn.code && !folderStillGood()) return resolve({ error: CODE_FOLDER_CHANGED, sessionId: mode.sessionId, model: "", bridgeRefused: true });
      if (turn.code && turn.proj && !projectStillGood(turn.proj)) return resolve({ error: PROJECT_CHANGED, sessionId: mode.sessionId, model: "", bridgeRefused: true });
      // What the child must report as its own working folder (its init event's cwd is its getcwd()): the checked real path and identity.
      const scope = turn.proj ?? workspace;
      const expectFolder = turn.code && scope ? { path: scope.path, id: scope.id } : null;
      if (turn.code) opts.beforeSpawn?.();
      let child: ChildProcess;
      try {
        child = spawn(launch.command, [...launch.prefix, ...claudeArgs(turn, mode)], {
          cwd: turn.code && scope ? scope.path : workDir,
          // A code turn's npm may not write ~/.npm, nor the temp folder (the sandbox refuses both), so its cache lives in the folder.
          // A code turn's child gets only the allow-listed names; a chat turn's environment is unchanged.
          env: withSessionId((turn.code ? (computer ? (sandboxedTurn(turn) && workspace && envGet(env, "npm_config_cache") === undefined ? { ...childEnv(env), npm_config_cache: path.join(workspace.path, ".npm-cache") } : childEnv(env)) : workspace && !filesOnly ? { ...envWithout(codeChildEnv(env, platform, opts.codeEnvExtraPrefixes), "npm_config_cache"), npm_config_cache: path.join((scope ?? workspace).path, ".npm-cache") } : codeChildEnv(env, platform, opts.codeEnvExtraPrefixes)) : childEnv(env)), turn.code && computer, mode.sessionId),
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          // A code turn leads its own process group (off Windows), so a stop reaches everything it started.
          ...(turn.code && platform !== "win32" ? { detached: true } : {}),
        });
      } catch (e) {
        return resolve({ error: `Could not start Claude Code: ${(e as ErrLike)?.message ?? e}`, sessionId: mode.sessionId, model: "" });
      }
      if (turn.code) {
        trackCodeChild(child);
        if (child.pid !== undefined && scope) liveFolder.set(child.pid, { path: guardPath(scope.path), id: scope.id });
      }
      turn.child = child;
      if (!turn.code) {
        liveChat.add(child);
        child.once("exit", () => liveChat.delete(child));
      }
      let buf = "";
      let stderr = "";
      let model = "";
      let result: ClaudeEvent | null = null;
      let lastStep: StepUsage | undefined; // usage of the last top-level assistant line seen (the context at the end of the turn)
      let refused = false;
      let sawInit = false;
      let initCount = 0; // which system/init this child has sent; the refusal log names the one that disagreed
      let initOk = false; // fail closed: the first init must have said apiKeySource "none" before any answer
      let otherCredential = false; // a refused init named a credential other than the subscription
      let limitsRefused = false; // code turn: the init event did not show the folder limits
      let cwdRefused = false; // code turn: the child is not running in the checked code folder
      let cwdCode: CodeOffCode = "init-first-not-root"; // why, when cwdRefused
      const tracked = new Map<string, { tool: string; summary: string }>(); // code turn: tool_use id -> what it was
      child.stderr!.on("data", (d) => {
        stderr = (stderr + d).slice(-2000);
      });
      // A line that is not one JSON object, but names an init or an apiKeySource, fails closed (a forged stream can
      // glue two values onto one line, or leave the last line without a newline). Any other unreadable line is skipped.
      const lineNamesInit = (line: string) => line.includes('"init"') || line.includes("apiKeySource");
      const refuseUnreadable = () => {
        refused = true;
        void stopChild(child);
      };
      const drain = () => {
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            if (lineNamesInit(line)) refuseUnreadable();
            continue;
          }
          // A value that parses but is not an object (array, number, string, null) is not an init event. The same text still fails closed.
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            if (lineNamesInit(line)) refuseUnreadable();
            continue;
          }
          const ev = parsed as ClaudeEvent;
          if (ev.type === "assistant" && result === null) {
            const step = stepUsage(ev, model);
            if (step) lastStep = step;
          }
          if (ev.type === "system" && ev.subtype === "init") {
            initCount += 1; // 1 is the first init of this child, even when a later one is the one that is refused
            const later = sawInit;
            sawInit = true;
            if (!later) model = ev.model ?? ""; // the model stays the one from the first init
            // The CLI says where its credential comes from. The first init must arrive before any answer and must be the
            // exact string "none" (the subscription login). A later init is re-checked and must also say "none"; it is
            // accepted only when the first init was already accepted, and it does not change that. An API key, a helper,
            // a missing field or any other shape stops the turn.
            const subscription = ev.apiKeySource === "none";
            const accept = subscription && (later ? initOk : result === null);
            if (accept && !later) initOk = true;
            else if (!accept) {
              refused = true;
              if (typeof ev.apiKeySource === "string" && ev.apiKeySource !== "" && ev.apiKeySource !== "none") otherCredential = true;
              void stopChild(child);
            }
            // What the CLI itself says it is running with, shown once, for the first init that proved the subscription.
            if (accept && !later) turn.send("status", { apiKeySource: ev.apiKeySource ?? null, tools: ev.tools ?? [], mcpServers: ev.mcp_servers ?? [], model });
            // A code turn must show the folder limits too: only the code tools (and this bridge's MCP tools), and no other permission mode.
            if (turn.code && !codeInitOk(ev, turn.approval, filesOnly, computer, turn.delegate)) {
              limitsRefused = true;
              void stopChild(child);
            } else if (turn.code) {
              // Verify the CHILD, not the path: its own working folder must be inside the checked one (exactly it at init 1). Tools only run after init.
              const verdict: { ok: true } | { ok: false; reasonCode: CodeOffCode } = expectFolder ? initFolderDecision({ initNumber: initCount, reported: ev.cwd, root: expectFolder }) : { ok: false, reasonCode: "init-first-not-root" };
              if (!verdict.ok) {
                cwdRefused = true;
                // The log has to show what this init reported. 300 characters is enough to recognise a path and short enough for one line.
                const reportedCwd = typeof ev.cwd === "string" && ev.cwd !== "" ? ev.cwd.slice(0, 300) : "no cwd";
                const expectedPath = expectFolder ? expectFolder.path : "no folder";
                log(`the code turn's child did not start in the code folder (init ${initCount}: it reported ${reportedCwd}, expected ${expectedPath}, reason ${verdict.reasonCode}); this turn is stopped and code mode is off until the folder is checked again`);
                // The next code turn must give this init's own reason (it did not start in the folder, or it moved out of it). "Changed on disk"
                // would be a lie: the folder was not compared again.
                // The folder stays saved: this one turn is stopped, and the next use checks the folder again.
                cwdCode = verdict.reasonCode;
                switchOff(verdict.reasonCode);
                void stopChild(child);
              }
            }
          } else if (ev.type === "result") {
            result = ev;
          } else if (turn.code && !refused && !limitsRefused && !cwdRefused && (ev.type === "assistant" || ev.type === "user")) {
            codeEvents(turn, ev, tracked);
          }
          // Every mode, but only after an init that proved the subscription and only while the turn is not being refused (the same fail-closed rule as the answer).
          if (ev.type === "assistant" && initOk && !refused && !limitsRefused && !cwdRefused) timeLeftEvents(turn, ev);
        }
      };
      child.stdout!.on("data", (d) => {
        buf += d;
        drain();
      });
      child.on("error", (e) => resolve({ error: `Could not start Claude Code: ${e.message}`, sessionId: mode.sessionId, model }));
      child.on("close", () => {
        turn.child = null;
        // This claude is gone: nothing waits for the calls it still had open.
        for (const pid of [...turn.pending.keys()]) cancelCall(turn, pid);
        // A last line with no newline is still one event: a result may be the answer, an init runs the same checks.
        if (buf.trim()) {
          buf += "\n";
          drain();
        }
        // Fail closed: an answer is shown only after an init event that proved the subscription. The one exception is a
        // result that says no turn ran (num_turns 0, e.g. a lost session to resume): nothing was billed, and the retry is checked itself.
        if (!initOk && result && !(result.num_turns === 0 && result.is_error === true && !sawInit)) refused = true;
        const noStart = turn.code && !filesOnly && (!computer || sandboxedTurn(turn)) && !sawInit && !initOk && !limitsRefused && !cwdRefused && /sandbox/i.test(`${stderr}\n${result && typeof result.result === "string" ? result.result : ""}`);
        if (noStart) {
          const lines = stderr.trim().split("\n").map((l) => l.trim()).filter(Boolean);
          const last = lines.length > 0 ? lines[lines.length - 1]! : String(result?.result ?? "").trim().split("\n").pop()!.trim();
          resolve({ error: `${SANDBOX_START_ERROR} ${last.slice(0, 300)}`.trim(), sessionId: mode.sessionId, model });
        } else if (limitsRefused) {
          resolve({ error: CODE_LIMITS_ERROR, sessionId: mode.sessionId, model, bridgeRefused: true });
        } else if (cwdRefused) {
          resolve({ error: CODE_STOP_ERROR[cwdCode], sessionId: mode.sessionId, model, bridgeRefused: true });
        } else if (refused) {
          resolve({
            error: otherCredential ? API_KEY_REFUSED_ERROR : SUBSCRIPTION_UNPROVEN_ERROR,
            sessionId: mode.sessionId,
            model,
            apiKeyRefused: true,
          });
        } else if (result) {
          resolve({ result, sessionId: mode.sessionId, model, lastStep });
        } else {
          resolve({ error: `Claude Code stopped without an answer.${stderr ? ` ${stderr.trim().split("\n").slice(-2).join(" ")}` : ""}`, sessionId: mode.sessionId, model });
        }
      });
      child.stdin!.on("error", () => {});
      child.stdin!.end(turn.images.length > 0 ? imageStdin(turn.images, prompt) : prompt);
    });
  }

  /** While the bridge updates itself (or is about to restart after it) no turn may start: its claude child would be cut off or orphaned. */
  const updating = () => isUpdateRunning() || restartPending;
  const UPDATING = { error: "The bridge is updating. Send your message again in a minute.", code: "UpdateRunning" };
  async function handleTurn(req: IncomingMessage, res: ServerResponse) {
    if (updating()) return json(res, 409, UPDATING);
    let body;
    try {
      body = await readBody(req, MAX_TURN_BODY);
    } catch (e) {
      return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
    }
    // Pictures are checked before anything is started. A hand-off is text only.
    const imgCheck = validateTurnImages(body.images);
    if ("error" in imgCheck) return json(res, 400, { error: imgCheck.error });
    if (imgCheck.images.length > 0 && typeof body.parentTurnId === "string" && body.parentTurnId) return json(res, 400, { error: "A hand-off cannot carry pictures." });
    // Code mode: one folder the person chose, one code turn at a time. Chat is the default and is unchanged.
    if (body.mode !== undefined && body.mode !== "chat" && body.mode !== "code") return json(res, 400, { error: 'mode must be "chat" or "code"' });
    if (body.approval !== undefined && body.approval !== "session" && body.approval !== "each-write") return json(res, 400, { error: 'approval must be "session" or "each-write"' });
    // An id from the page is a string or nothing; any other shape is a bad request (never turned into text, which can throw).
    if (body.parentTurnId !== undefined && typeof body.parentTurnId !== "string") return json(res, 400, { error: BAD_REQUEST });
    // The model and the effort the person chose (chat and code turns); delegateCoding is for code turns only.
    if (body.model !== undefined && !modelAllowed(body.model)) return json(res, 400, { error: "That model is not allowed." });
    if (body.effort !== undefined && !effortAllowed(body.effort)) return json(res, 400, { error: "That effort is not allowed." });
    if (body.delegateCoding !== undefined && (typeof body.delegateCoding !== "boolean" || (body.mode !== "code" && body.delegateCoding))) return json(res, 400, { error: typeof body.delegateCoding === "boolean" ? "delegateCoding is only for code turns." : BAD_REQUEST });
    const me = callerKey(req);
    const isCode = body.mode === "code";
    let proj: { path: string; name: string; id: string } | null = null;
    if (isCode) {
      if (typeof body.parentTurnId === "string" && body.parentTurnId) return json(res, 400, { error: "A hand-off cannot be a code turn." });
      // Code mode was switched off earlier: the saved folder is checked again first. If it still fails, say why. A bridge that never had a folder still says it has none.
      recheckSavedFolder();
      if (!workspace) return json(res, 409, codeOff ? offBody() : { error: NO_WORKSPACE });
      if (dialogOpen) return json(res, 409, { error: "A folder dialog is open on this computer. Finish it first." });
      if (accessDialogOpen) return json(res, 409, { error: "The full access window is open on this computer. Answer it first.", code: "AccessDialogOpen" });
      // Folder mode could not be written down: until it can be, no code turn (a restart might bring full access back).
      if (accessUnsaved && !(accessMode === "folder" && saveAccess("folder"))) return json(res, 409, { error: "The folder mode could not be saved on this computer, so code turns are stopped until it can be.", code: "AccessNotSaved" });
      accessUnsaved = false;
      if (body.project !== undefined) {
        proj = resolveProject(body.project);
        if (!proj) return json(res, 400, { error: NO_SUCH_PROJECT });
      }
      // One code turn at a time per project (or per code folder itself, when no project is named), asked of the one predicate, which
      // holds the folder by its device:inode or its real path; another folder is not held up.
      const running = codeChildAlive(proj ?? workspace);
      if (running) {
        const refusal = {
          error: proj ? `A code turn is already running in ${proj.name}.` : `A code turn is already running in ${workspace.name}. Wait for it to finish.`,
          code: "CodeTurnRunning",
          project: proj ? proj.name : null,
        };
        // A turn in the table: its id and start time go only to the pairing that owns it; anyone else learns that one is running, no more.
        // A child whose turn has left the table (its page hung up, or it was refused and is being stopped) has no turn to name.
        return json(res, 429, running !== true && running.owner === me ? { ...refusal, ownTurn: true, turnId: running.id, startedAt: new Date(running.startedAt).toISOString() } : { ...refusal, ownTurn: false });
      }
    }
    // A hand-off (run_named_role / ask_agent_concept) is a NESTED turn: the page opens it on this bridge, naming the turn
    // that asked and, when it knows it, the call that asked. One level only, up to MAX_HANDOFFS_AT_ONCE at once, on the
    // parent's budget, and it never resumes or reads a session.
    const parentId = typeof body.parentTurnId === "string" ? body.parentTurnId : "";
    let parent: Turn | null = null;
    let parentCallId = "";
    if (parentId) {
      parent = turns.get(parentId) ?? null;
      // A turn of another pairing is answered exactly like an unknown one.
      if (!parent || parent.closed || parent.cancelRequested || parent.owner !== me) return json(res, 404, { error: "The turn that asked for this hand-off is not running." });
      if (parent.parent) return json(res, 400, { error: "A hand-off cannot hand off again." });
      if (body.parentCallId !== undefined) {
        const raw = body.parentCallId;
        const pending = typeof raw === "string" ? parent.pending.get(raw) : undefined;
        if (typeof raw !== "string" || !PARENT_CALL_ID.test(raw) || !pending || !HAND_OFF_TOOLS.has(pending.name)) {
          return json(res, 409, { error: "The call that asked for this hand-off is no longer waiting." });
        }
        parentCallId = raw;
      }
      if (parent.handoffs.size >= MAX_HANDOFFS_AT_ONCE) {
        return json(res, 429, { error: `Too many hand-offs are running for this turn at once (${MAX_HANDOFFS_AT_ONCE}). Wait for one to answer.` });
      }
    } else if ([...turns.values()].filter((t) => !t.parent).length >= MAX_TURNS_AT_ONCE) {
      return json(res, 429, { error: "Too many turns at once.", code: "TooManyTurns" });
    }
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const system = typeof body.system === "string" ? body.system : "";
    const tools: ToolSpec[] = Array.isArray(body.tools) ? body.tools.filter((t: ToolSpec) => t && typeof t.name === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(t.name)) : [];
    if ((!prompt.trim() && imgCheck.images.length === 0) || !system.trim()) return json(res, 400, { error: "prompt and system are required." });
    // A hand-off carries its own model and effort when it names them, otherwise it inherits its parent's.
    const model = typeof body.model === "string" ? body.model : parent ? parent.model : "";
    const effort = typeof body.effort === "string" ? body.effort : parent ? parent.effort : "";
    const delegate = isCode && body.delegateCoding === true;
    const client = body.client;
    const preview = isCode && typeof client === "object" && client !== null && (client as { preview?: unknown }).preview === true;
    const resumeId = !parent && typeof body.sessionId === "string" && UUID.test(body.sessionId) ? body.sessionId : "";

    // Code turn: the snapshot of the folder comes first (it can take a while on a big folder), and the folder is checked again
    // immediately before the spawn, so a swap during the snapshot is seen. The child's cwd is the checked real path.
    const before = isCode && workspace ? snapshotFolder(proj ? proj.path : workspace.path) : null;
    if (isCode) {
      const held: unknown = opts.afterSnapshot?.();
      // A test holds this turn here, after the entry guard and before the check, while another turn switches code mode off. A hook that returns nothing is not a promise, so a normal turn stays synchronous and the one-at-a-time rule does not change.
      if (held instanceof Promise) await held;
      // The folder may have been given up while this turn waited. That is not a new change on disk.
      if (!workspace) return json(res, 409, offBody());
      if (!folderStillGood()) return json(res, 409, { error: CODE_FOLDER_CHANGED });
      if (proj && !projectStillGood(proj)) return json(res, 409, { error: PROJECT_CHANGED });
    }
    if (updating()) return json(res, 409, UPDATING); // an update began while this request was read; no await from here to the turn being registered
    const turn: Turn = {
      id: crypto.randomBytes(8).toString("hex"),
      images: imgCheck.images,
      mcpToken: crypto.randomBytes(24).toString("hex"),
      system,
      tools,
      model,
      effort,
      delegate,
      preview,
      pending: new Map(),
      closed: false,
      child: null,
      send: () => {},
      parent,
      handoffs: new Set(),
      parentCallId,
      cancelled: new Set(),
      root: parent ? parent.root : { calls: 0 },
      budgetSpent: false,
      code: isCode,
      computer: accessMode === "computer",
      filesOnly: filesOnlyFor(accessMode),
      proj,
      approval: isCode && body.approval === "each-write" ? "each-write" : "session",
      approvals: new Map(),
      webTurnGrant: false,
      owner: me,
      startedAt: now(),
      lastActivityAt: now(),
      lastActivity: "",
      toolCalls: 0,
      handoffCount: 0,
      cancelRequested: false,
    };
    if (parent) {
      parent.handoffs.add(turn);
      parent.handoffCount += 1;
    }
    turns.set(turn.id, turn);
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const send = (event: string, data: unknown) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    turn.send = send;
    send("turn_started", { turnId: turn.id, startedAt: new Date(turn.startedAt).toISOString(), mode: isCode ? "code" : "chat", project: proj ? proj.name : null });
    send("start", { ok: true, turnId: turn.id });
    const beat = setInterval(() => {
      if (!res.writableEnded) res.write(": keepalive\n\n");
    }, 10000);

    // A hand-off is stopped by the bridge after HOP_MAX_MS, whatever the page does.
    const hopTimer = parent
      ? setTimeout(() => {
          send("error", { message: "The hand-off took too long and was stopped." });
          void stopChild(turn.child);
          finish();
        }, hopMaxMs)
      : null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(beat);
      if (hopTimer) clearTimeout(hopTimer);
      if (parent) parent.handoffs.delete(turn);
      // A turn that ends takes every hand-off it still has with it.
      for (const h of [...turn.handoffs]) {
        h.closed = true;
        void stopChild(h.child);
      }
      turn.handoffs.clear();
      turn.closed = true;
      for (const a of [...turn.approvals.values()]) a.settle(false, "The person did not answer."); // the page left the turn: deny what still waits
      for (const p of turn.pending.values()) p.reject(new Error("The turn ended."));
      turn.pending.clear();
      grantBook?.endTurn(turn.id); // its request_setting count is dropped; a request it made says "turn ended"
      turns.delete(turn.id);
    };
    res.on("close", () => {
      if (!res.writableEnded) {
        // The page went away mid-turn.
        void stopChild(turn.child);
      }
      finish();
    });

    const sendFilesChanged = () => {
      if (before && workspace) turn.send("files_changed", diffSnapshots(before, snapshotFolder(proj ? proj.path : workspace.path)));
    };
    try {
      // A resumed session already holds the thread. A new one is given the earlier turns as text.
      const history = !parent && typeof body.history === "string" ? body.history.slice(0, 60000) : "";
      const freshPrompt = history ? `Earlier in this conversation:\n${history}\n\nThe person's new message:\n${prompt}` : prompt;
      let sessionId = resumeId || crypto.randomUUID();
      let out = await runClaude(turn, { sessionId, resume: Boolean(resumeId) }, resumeId ? prompt : freshPrompt);
      // A turn the bridge itself refused is not retried: a retry would hide the true reason and run Claude Code again after a safety refusal.
      if (resumeId && (out.error || out.result?.num_turns === 0) && !out.apiKeyRefused && !out.bridgeRefused && !turn.closed && !turn.cancelRequested) {
        // The session is gone (different folder, cleaned up): start a new one with the thread as text.
        sessionId = crypto.randomUUID();
        out = await runClaude(turn, { sessionId, resume: false }, freshPrompt);
      }
      sendFilesChanged();
      if (turn.cancelRequested) {
        send("error", { message: "The turn was cancelled." });
      } else if (out.error || !out.result) {
        send("error", { message: out.error ?? "Claude Code gave no answer." });
      } else if (out.result.is_error) {
        send("error", { message: `Claude Code: ${String(out.result.result ?? "the turn failed").slice(0, 500)}` });
      } else {
        // Usage is only for the person's turn. A hand-off already sends its own message; that message stays as it was.
        const usage = parent ? undefined : turnUsage(out.result.modelUsage, out.model, out.lastStep);
        send("message", {
          role: "assistant",
          content: String(out.result.result ?? ""),
          model: out.model,
          ...(turn.effort ? { effort: turn.effort } : {}),
          ...(turn.images.length > 0 ? { images: turn.images.length } : {}),
          ...(isCode ? { delegateCoding: turn.delegate } : {}),
          payer: "person-claude-code",
          ...(isCode ? { mode: "code", ...(turn.filesOnly ? { codeMode: "files-only" } : {}), ...(turn.computer ? { access: "computer" } : {}), ...(proj ? { project: proj.name } : {}) } : {}),
          sessionId: out.sessionId,
          ...(usage ? { usage } : {}),
          // Only the person's turn is marked, so a nested hand-off's message leaves the field out.
          ...(turn.budgetSpent ? { budgetSpent: true } : {}),
        });
      }
    } catch (e) {
      send("error", { message: `The bridge failed: ${(e as ErrLike)?.message ?? e}` });
    } finally {
      finish();
      res.end();
    }
  }

  // ---- choosing the code folder from chat ------------------------------------------------------------------------
  let dialogOpen = false;
  const codeTurnRunning = () => [...turns.values()].some((t) => t.code);
  /**
   * THE one answer to "is a code child alive": the turns table holds a code turn, OR a code child's process group has not exited
   * (a turn leaves the table when its page hangs up, while its child may still be alive; a refused child is being stopped, so the wait is bounded).
   * Every guard that says "A code turn is running" uses this: Change, New, the re-check (any folder), and the start of a code turn (one folder).
   *
   * One folder is held when EITHER its device:inode OR its real path matches the folder of a running code turn or a live code child.
   * @param folder One folder (a project, or the code folder itself): its path and its device:inode, or nothing for any folder.
   * @returns The code turn in the table that runs there, `true` for a live child whose turn has left the table, or null when there is none.
   */
  const codeChildAlive = (folder?: { path: string; id: string }): Turn | true | null => {
    if (folder === undefined) return [...turns.values()].find((t) => t.code) ?? (liveGroups.size > 0 ? true : null);
    // Decision: both keys, because each one alone lets a second child into the files the first child works in.
    // - device:inode: a folder renamed while its child lives keeps its inode, and a code turn under the new name is the same folder (H1).
    // - real path: a folder deleted or moved away and made again at the same path has a new inode, but the child was given that path,
    //   so a child that writes by absolute path works in the new folder too (T4-1). The stored path is never updated on a rename.
    // Gotcha: a deleted folder's inode can be given to a new, unrelated folder, which is then held until the child exits. That errs on the
    // safe side (a 429), so it is left as it is. An empty id (a folder that cannot be read) matches nothing by id.
    const real = guardPath(folder.path);
    const id = idOf(real);
    const held = (k: { path: string; id: string }) => k.path === real || (id !== "" && k.id === id);
    // A turn's project (and the code folder) keep the real path and id taken at their check; they are compared as stored.
    const inTable = [...turns.values()].find((t) => {
      const scope = t.proj ?? workspace;
      return t.code && scope !== null && held(scope);
    });
    if (inTable) return inTable;
    return [...liveFolder.values()].some(held) ? true : null;
  };
  /**
   * The 409 answer for "a code turn is running" on Change (both places) and New. Open never refuses while a code turn runs. Only a paired caller reaches these routes, so it also names the
   * folder the running turn works in: the last part of the path, never the whole path.
   * @returns The answer body.
   */
  const runningAnswer = () => {
    const t = [...turns.values()].find((x) => x.code);
    const live = [...liveFolder.values()][0];
    const folder = t ? (t.proj ? t.proj.name : workspace ? workspace.name : savedFolder ? savedFolder.name : "") : live ? path.basename(live.path) : "";
    return { error: "A code turn is running. Wait for it to finish.", ...(folder ? { runningProjectFolder: folder } : {}) };
  };
  const switchTo = (v: { path: string; name: string }) => {
    workspace = { path: v.path, name: v.name, id: idOf(v.path) };
    workspaceGiven = v.path;
    codeOff = null; // choosing or creating a folder starts code mode again; the old reason must not answer the next turn
    savedFolder = null;
    saveWorkspace(v.path);
    void closeAllPreviews(); // a preview belongs to the code folder it was started in
  };

  async function handleChoose(req: IncomingMessage, res: ServerResponse) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
    }
    // The suggestion is checked even though only "Create it" uses it; it never goes into a script.
    if (body.suggest !== undefined && !folderNameOk(body.suggest)) return json(res, 400, { error: "suggest must be 1 to 64 letters, digits, spaces, dots, dashes or underscores." });
    if (codeChildAlive()) return json(res, 409, runningAnswer());
    if (dialogOpen) return json(res, 409, { error: "A folder dialog is already open on this computer." });
    if (accessDialogOpen) return json(res, 409, { error: "The full access window is open on this computer. Answer it first.", code: "AccessDialogOpen" });
    recheckSavedFolder();
    if (workspace) folderStillGood();
    if (!opts.chooseFolder && platform !== "darwin" && platform !== "win32" && !zenity) {
      return json(res, 501, { error: "No folder dialog on this computer. Start the bridge with --workspace <folder>." });
    }
    dialogOpen = true;
    let picked: string | null;
    try {
      picked = await (opts.chooseFolder ?? (() => systemFolderDialog(platform, env, zenity)))();
    } catch (e) {
      return json(res, 500, { error: `The folder dialog failed: ${(e as ErrLike)?.message ?? e}` });
    } finally {
      dialogOpen = false;
    }
    if (picked === null || picked === "") return json(res, 200, { chosen: false });
    if (codeChildAlive()) return json(res, 409, runningAnswer());
    const v = checkFolder(picked);
    if (!v.ok) return json(res, 422, { error: v.reason });
    switchTo(v);
    return json(res, 200, { chosen: true, name: v.name, path: v.path });
  }

  // ---- projects: the direct subfolders of the code folder ----------------------------------------------------------
  const PROJECT_LIST_CAP = 500;
  function handleProjects(res: ServerResponse) {
    recheckSavedFolder();
    if (workspace) folderStillGood();
    if (!workspace) return noFolder(res);
    const out: { name: string; modified: string }[] = [];
    try {
      for (const e of fs.readdirSync(workspace.path)) {
        if (e.startsWith(".") || !projectNameOk(e)) continue;
        try {
          const st = fs.lstatSync(path.join(workspace.path, e));
          if (st.isDirectory() && !st.isSymbolicLink()) out.push({ name: e, modified: st.mtime.toISOString() });
        } catch {
          /* gone while listing */
        }
      }
    } catch (e) {
      return json(res, 500, { error: `Could not read the code folder: ${(e as ErrLike)?.message ?? e}` });
    }
    out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return json(res, 200, { projects: out.slice(0, PROJECT_LIST_CAP) });
  }

  // ---- setting grants (0.4.1): the app's routes. Only a paired app reaches them; nothing the chat session can call grants. ----------------
  /** POST /v1/settings/{requests,grant,decline,grants,revoke}. The bridge's own part of the approval: it holds the pending request, the nonce and the hash. */
  async function handleSettings(req: IncomingMessage, res: ServerResponse, route: string) {
    if (!grantBook) return json(res, 409, { error: "This bridge has no state folder, so it cannot keep setting grants.", code: "NoStateFolder" });
    const off = grantsOff();
    if (off) return json(res, 409, { error: `Setting grants are off: ${off}`, code: "StateFolderInsideCode" });
    let body: Record<string, unknown>;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
    }
    // A project is named as /v1/projects lists it; `..`, a slash or any path text is not a name and finds nothing.
    const project = (): ProjectRef | null => {
      const p = resolveProject(body.project);
      return p ? { id: p.name, folderId: p.id, root: p.path } : null;
    };
    if (route === "/v1/settings/requests") {
      const ref = project();
      if (!ref) return json(res, 400, { error: NO_SUCH_PROJECT });
      // The card needs the exact value, the reason, and the nonce and hash it sends back with its click.
      return json(res, 200, { requests: grantBook.listRequests(ref.id).map((r) => ({ requestId: r.requestId, nonce: r.nonce, hash: r.hash, setting: r.normalized.setting, value: r.normalized.value, reason: r.reason, createdAt: r.createdAt, project: r.project.id, turnEnded: r.turnEnded })) });
    }
    if (route === "/v1/settings/grants") {
      const ref = project();
      if (!ref) return json(res, 400, { error: NO_SUCH_PROJECT });
      return json(res, 200, { grants: grantBook.listGrants(ref) });
    }
    if (route === "/v1/settings/grant") {
      const r = grantBook.grant(body.requestId, body.nonce, body.hash, callerKey(req));
      if (!r.ok && r.latch) latchGrantsOff(r.error);
      return r.ok ? json(res, 200, { grant: r.grant }) : json(res, r.status, { error: r.error });
    }
    if (route === "/v1/settings/decline") return grantBook.decline(body.requestId) ? json(res, 200, { ok: true }) : json(res, 404, { error: "No such pending request." });
    if (route === "/v1/settings/revoke") {
      const r = grantBook.revoke(body.grantId);
      return r.ok ? json(res, 200, { ok: true }) : json(res, r.status, { error: r.error });
    }
    return json(res, 404, { error: "No such route." });
  }

  /** The names /v1/projects lists now: direct subfolders of the code folder that are real directories, not links, with an allowed name. */
  function projectNames(): string[] {
    if (!workspace) return [];
    const ws = workspace.path;
    try {
      return fs.readdirSync(ws).filter((e) => {
        if (e.startsWith(".") || !projectNameOk(e)) return false;
        try {
          const st = fs.lstatSync(path.join(ws, e));
          return st.isDirectory() && !st.isSymbolicLink();
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }

  // ---- preview of the built app (POST /v1/preview) -------------------------------------------------------------------
  /** One running preview and the snapshot folder it serves. */
  interface Running extends Preview { snap: string }
  const previews = new Map<string, Running>();
  /** Starts are one at a time, so two presses of Open cannot both pass the port probe and race for the port. */
  let previewChain: Promise<unknown> = Promise.resolve();
  /** Raised by every close (bridge close, unpair, workspace change): a start that began before it must end by cleaning up, never by listening. */
  let previewGen = 0;
  let snapSeq = 0;
  let bridgeClosing = false;
  /** Where snapshots live: inside the bridge's state folder, which a sandboxed turn can neither read nor write (stateProtected, in every access mode). Null when the bridge has no state folder. */
  const previewsDir = opts.stateDir ? path.join(opts.stateDir, "previews") : null;
  const rmSnap = (dir: string) => fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  /** A leftover snapshot (a crash, a kill) is never served: they are all removed when the bridge starts. */
  const sweepSnapshots = () => { if (previewsDir) try { fs.rmSync(previewsDir, { recursive: true, force: true }); } catch { /* the next start tries again */ } };
  const closeRunning = async (p: Running) => { await closePreviewServers(p); await rmSnap(p.snap); };
  const closeAllPreviews = async (): Promise<void> => {
    previewGen += 1;
    const all = [...previews.values()];
    previews.clear();
    await Promise.all(all.map(closeRunning));
    await previewChain; // a start in flight sees the new generation and removes what it made
  };
  /** The origins a preview must never share: every origin that is paired, and every origin that may pair (an allowed app could pair later). */
  const pairedOriginList = () => [...new Set([...allowedOrigins, ...[...pairings.values()].map((p) => p.origin).filter((o): o is string => typeof o === "string")])];
  async function startPreview(name: string, gen: number): Promise<{ url: string; project: string; folder: "dist" | "build" }> {
    const cancelled = () => new PreviewRefusal(409, { error: "preview-cancelled", message: "The preview was stopped while it was starting." });
    if (gen !== previewGen) throw cancelled(); // a close came after the request arrived
    const proj = resolveProject(name);
    if (!proj || !workspace || !within(proj.path) || !proj.path.startsWith(fs.realpathSync.native(workspace.path) + path.sep)) throw new PreviewRefusal(400, { error: "bad-project" });
    const build = findBuildFolder(proj.path);
    if (!build) throw new PreviewRefusal(404, { error: "no-build", message: `No build yet for ${name}. Run npm run build in the project folder, then press Open again.` });
    const pinned = pinnedPort(proj.path);
    if (pinned === null) throw new PreviewRefusal(409, { error: "no-port", message: "Pin this project's port from your dev-ports map in vite.config (server.port and preview.port, strictPort: true), rebuild, then press Open again." });
    if (previewPortRefused(pinned) || pinned === port) throw new PreviewRefusal(409, { error: "bad-port", port: pinned });
    const urlOf = `http://localhost:${pinned}/`;
    const mine = new Set([`http://localhost:${pinned}`, `http://127.0.0.1:${pinned}`, `http://[::1]:${pinned}`]);
    if (pairedOriginList().some((o) => mine.has(o))) throw new PreviewRefusal(409, { error: "origin-paired", port: pinned });
    // No state folder, or one a sandboxed turn could write: no place that is safe for the copy, so no preview (never another place).
    if (!previewsDir || stateDirProblem(opts.stateDir!, workspace.path, home, platform) !== "") throw new PreviewRefusal(409, { error: "no-preview-place", message: "This bridge has no state folder that a code turn cannot change, so it cannot open a preview." });
    // The snapshot: what is served is a copy the agent cannot touch. A new one at every Open replaces the one before it.
    const snap = path.join(previewsDir, `${name}-${++snapSeq}`);
    let made = false;
    try {
      fs.mkdirSync(previewsDir, { recursive: true, mode: 0o700 });
      made = true;
      await snapshotBuild(build.root, snap, opts.previewLimits ?? {});
      const snapReal = fs.realpathSync.native(snap); // what a request's realpath will be compared with (the state folder may be reached through a link)
      const idx = fs.lstatSync(path.join(snap, "index.html"), { throwIfNoEntry: false });
      if (!idx?.isFile()) throw new PreviewRefusal(404, { error: "no-build", message: `No build yet for ${name}. Run npm run build in the project folder, then press Open again.` });
      if (gen !== previewGen) throw cancelled();
      const have = previews.get(name);
      if (have && have.port === pinned) {
        // Same port: the servers stay, they serve the new copy from the next request on; the old copy goes.
        const old = have.snap;
        have.ref.root = snapReal;
        have.snap = snap;
        have.folder = build.folder;
        await rmSnap(old);
        return { url: urlOf, project: name, folder: build.folder };
      }
      if (have) { previews.delete(name); await closeRunning(have); }
      while (previews.size >= PREVIEW_MAX) {
        const oldest = previews.keys().next().value as string;
        const p = previews.get(oldest)!;
        previews.delete(oldest);
        await closeRunning(p);
      }
      const ref = { root: snapReal };
      const servers = await startPreviewServers(ref, pinned);
      if (gen !== previewGen) { await closePreviewServers({ ref, port: pinned, servers, folder: build.folder }); throw cancelled(); }
      previews.set(name, { ref, snap, port: pinned, servers, folder: build.folder });
      return { url: urlOf, project: name, folder: build.folder };
    } catch (e) {
      if (made && previews.get(name)?.snap !== snap) await rmSnap(snap);
      throw e;
    }
  }
  async function handlePreview(req: IncomingMessage, res: ServerResponse) {
    if (bridgeClosing) return json(res, 503, { error: "The bridge is stopping." });
    const gen = previewGen; // taken when the request arrives: a close, unpair or switch while it is read or started cancels it
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
    }
    recheckSavedFolder();
    if (workspace) folderStillGood();
    if (!workspace) return noFolder(res, 409);
    const name = body.project;
    // The name is one plain folder name AND one the project list shows; startPreview then checks the real path again.
    const plainName = typeof name === "string" && name !== "" && name.length <= 128 && !/[\\/\0]/.test(name) && name !== "." && name !== ".." && !name.startsWith(".");
    if (!plainName || !projectNames().includes(name)) return json(res, 400, { error: "bad-project" });
    const run = previewChain.then(() => startPreview(name, gen));
    previewChain = run.catch(() => {});
    try {
      return json(res, 200, await run);
    } catch (e) {
      if (e instanceof PreviewRefusal) return json(res, e.status, e.body);
      log(`preview: ${(e as ErrLike)?.message ?? e}`);
      return json(res, 500, { error: "bridge error" });
    }
  }

  async function handleProjectCreate(req: IncomingMessage, res: ServerResponse) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
    }
    recheckSavedFolder();
    if (workspace) folderStillGood();
    if (!workspace) return noFolder(res);
    if (dialogOpen) return json(res, 409, { error: "A folder dialog is open on this computer. Finish it first." });
    const name = body.name;
    if (!projectNameOk(name)) return json(res, 400, { error: "name must be 1 to 64 letters, digits, dots, dashes or underscores, starting with a letter or digit." });
    const exists = "A project with this name already exists.";
    const ci = (opts.pathPlatform ?? platform) === "darwin" || (opts.pathPlatform ?? platform) === "win32";
    try {
      if (ci && fs.readdirSync(workspace.path).some((e) => e.toLowerCase() === name.toLowerCase())) return json(res, 409, { error: exists });
      fs.mkdirSync(path.join(workspace.path, name), { mode: 0o700 });
    } catch (e) {
      if ((e as ErrLike).code === "EEXIST") return json(res, 409, { error: exists });
      return json(res, 500, { error: `Could not make the project: ${(e as ErrLike)?.message ?? e}` });
    }
    // A repo before any turn (friction 47), so the selective-commit step can run and the deny on .git hooks, config and
    // info/attributes (gitPlaces) covers it: that deny is computed from repos that exist when a turn starts.
    // `--template=` copies no template, so no hooks arrive from the person's git setup; the config files of the person
    // are not read, and `core.hooksPath` is pinned off, so nothing in the environment can add a hook either.
    // GIT_CONFIG_GLOBAL points at an empty place so the person's global git config is not read (their init.defaultBranch, core.hooksPath
    // or any other setting must not shape this repo). On Windows that place is "NUL", not os.devNull: os.devNull there is `\\.\nul`, and
    // Git for Windows 2.56.1 cannot open it ("fatal: unable to access '\\.\nul': Invalid argument", measured on GitHub's Windows runner,
    // run 46016776658), so git init failed and no repo was made. Git's own words go into the log line below.
    try {
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", "init", "--quiet", "--template=", path.join(workspace.path, name)], {
        stdio: ["ignore", "ignore", "pipe"], timeout: 10_000, encoding: "utf8",
        env: { ...env, GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : os.devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_TEMPLATE_DIR: "" },
      });
    } catch (e) {
      const err = e as ErrLike & { status?: number | null; stderr?: unknown };
      const words = typeof err.stderr === "string" ? cleanForLog(err.stderr.trim().slice(0, 300)) : ""; // git's words are not ours: no line break of theirs may start a second log line
      log(`project ${name}: git init failed: ${cleanForLog(err.status ?? err.code ?? err.message ?? e)}${words ? `: ${words}` : ""}`);
    }
    opts.beforeProjectNpmrc?.(path.join(workspace.path, name));
    let npmrc = false;
    try {
      fs.writeFileSync(path.join(workspace.path, name, ".npmrc"), PROJECT_NPMRC_TEXT, { flag: "wx", mode: 0o644 });
      npmrc = true;
    } catch (e) {
      log(`project ${name}: .npmrc not written: ${(e as ErrLike)?.code ?? (e as ErrLike)?.message ?? e}`);
    }
    return json(res, 200, { name, npmrc }); // the answer's shape is unchanged: a failed git init is only logged
  }

  async function handleCreate(req: IncomingMessage, res: ServerResponse) {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
    }
    const name = body.name;
    if (!folderNameOk(name)) return json(res, 400, { error: "name must be 1 to 64 letters, digits, spaces, dots, dashes or underscores." });
    if (codeChildAlive()) return json(res, 409, runningAnswer());
    if (dialogOpen) return json(res, 409, { error: "A folder dialog is open on this computer. Finish it first." });
    recheckSavedFolder();
    if (workspace) folderStillGood();
    const target = path.join(home, name);
    const exists = `The folder ~/${name} already has files. Choose it with the folder dialog instead.`;
    let made = false;
    try {
      const st = fs.lstatSync(target);
      if (!st.isDirectory() || fs.readdirSync(target).length > 0) return json(res, 409, { error: exists });
    } catch (e) {
      if ((e as ErrLike).code !== "ENOENT") return json(res, 500, { error: `Could not look at ~/${name}: ${(e as ErrLike)?.message ?? e}` });
      try {
        fs.mkdirSync(target, { mode: 0o700 });
        made = true;
      } catch (e2) {
        return json(res, 500, { error: `Could not make ~/${name}: ${(e2 as ErrLike)?.message ?? e2}` });
      }
    }
    const v = checkFolder(target);
    if (!v.ok) {
      if (made) {
        try {
          fs.rmdirSync(target); // only the empty folder this request just made
        } catch {
          /* left as it is */
        }
      }
      return json(res, 422, { error: v.reason });
    }
    switchTo(v);
    return json(res, 200, { name: v.name, path: v.path });
  }

  // ---- opening the code folder (or a project) in Finder / Explorer ------------------------------------------------
  const OPEN_PER_MIN = 10;
  const openStamps = new Map<string, number[]>();
  const canOpenFolder = () => !!opts.openFolder || platform === "darwin" || platform === "win32" || (opts.which ?? onPath)("xdg-open");
  async function handleOpenFolder(req: IncomingMessage, res: ServerResponse) {
    if (updating()) return json(res, 409, UPDATING);
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
    }
    if (updating()) return json(res, 409, UPDATING);
    recheckSavedFolder();
    if (workspace) folderStillGood();
    if (!workspace) return noFolder(res);
    if (!canOpenFolder()) return json(res, 501, { error: "This computer cannot open folders from the bridge." });
    let target = workspace.path;
    if (body.project !== undefined && body.project !== null) {
      if (!projectNameOk(body.project)) return json(res, 400, { error: "project must be a plain folder name." });
      const cand = path.join(workspace.path, body.project);
      let real: string;
      try {
        if (!fs.statSync(cand).isDirectory()) return json(res, 404, { error: NO_SUCH_PROJECT });
        real = realPath(cand);
      } catch {
        return json(res, 404, { error: NO_SUCH_PROJECT });
      }
      if (!within(real)) return json(res, 400, { error: "That folder is outside the code folder." });
      target = real;
    }
    // At most OPEN_PER_MIN opens a minute for each pairing.
    const me = callerKey(req);
    const t = now();
    const recent = (openStamps.get(me) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= OPEN_PER_MIN) {
      openStamps.set(me, recent);
      return json(res, 429, { error: "Too many folder opens. Wait a minute." });
    }
    recent.push(t);
    openStamps.set(me, recent);
    try {
      await (opts.openFolder ?? ((abs) => systemOpenFolder(platform, abs)))(path.resolve(target));
    } catch {
      return json(res, 500, { error: "The folder could not be opened." });
    }
    return json(res, 200, { opened: true });
  }

  // ---- routing -----------------------------------------------------------------------------------------------------
  // ---- self-update (POST /v1/update; the pure checks and the pipeline are above, in runUpdate) ----
  const updateStateDir = opts.stateDir ?? path.join(home, ".gilb-claude-code-bridge");
  const updateFile = (): string => {
    try {
      return fs.realpathSync(fileURLToPath(import.meta.url));
    } catch {
      return fileURLToPath(import.meta.url);
    }
  };
  /** The path the person ran, as given (process.argv[1]), when it names this bridge file; else the file itself. A symlink there is refused. */
  const updateRunPath = (): string => {
    try {
      const a = process.argv[1];
      if (a && samePath(fs.realpathSync(a), updateFile(), platform)) return path.resolve(a);
    } catch {
      /* not started as a program */
    }
    return updateFile();
  };
  /** The real update dependencies, with whatever a test replaced. */
  const realUpdateDeps = (): UpdateDeps => ({
    origin: UPDATE_ORIGIN, keys: UPDATE_KEYS, running: BRIDGE_BUILD, file: updateFile(), runPath: updateRunPath(), stateDir: updateStateDir,
    fetch: realFetch, fs: realFs, selfTest: realSelfTest, now: () => new Date(), random: () => crypto.randomBytes(6).toString("hex"),
    log: (l) => log(l),
    ...opts.updateDeps,
  });
  const supervisedNow = (): boolean => {
    let supervisorJson: string | null = null;
    if (!env.GILB_BRIDGE_SUPERVISED && platform === "win32") {
      try { supervisorJson = fs.readFileSync(path.join(updateStateDir, "supervisor.json"), "utf8"); } catch { /* none */ }
    }
    return isSupervised(env, { label: opts.label ?? DEFAULT_LABEL, supervisorJson, now: Date.now(), pid: process.pid });
  };
  const UPDATE_HTTP: Record<string, number> = { UpdateRunning: 409, UpdateCannotWrite: 409, UpdateOff: 501, UpdateNetwork: 502, UpdateBad: 502, UpdateSignature: 422, UpdateMismatch: 422, UpdateTooOld: 422, UpdateSelfTest: 422, UpdateDisk: 500 };
  const updateFailure = (res: ServerResponse, code: string, message: string, from: string) => {
    log(`update: ${code} (running ${from})`);
    return json(res, UPDATE_HTTP[code] ?? 500, { error: message, code });
  };
  /** Set once an automatic restart is on its way: no new turn may start. */
  let restartPending = false;
  const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  /** The end of an automatic restart: wait for a running turn (it cannot start one now, but be safe), stop what is left, close through the bridge's own close(), then exit 75. */
  async function restartAfterUpdate() {
    const pollMs = opts.updateRestart?.pollMs ?? 250;
    const capMs = opts.updateRestart?.capMs ?? 10 * 60 * 1000;
    // The deferral watches turns and code groups only, not liveChat: a chat child whose page is gone is not waited for here. closeBridge, called
    // below, stops the chat children that are left and waits for them to exit, so exit(75) never finds one still ending.
    if (turns.size > 0 || liveGroups.size > 0) {
      log("Update installed; restart deferred until the running turn ends");
      const capAt = Date.now() + capMs;
      while ((turns.size > 0 || liveGroups.size > 0) && Date.now() < capAt) await sleepMs(pollMs);
    }
    // The turns still here are cancelled the way the Stop route cancels one (so none is started again), then close() stops their children.
    for (const t of turns.values()) t.cancelRequested = true;
    // close() stops every child that is still running, then closes the listener; a stuck keep-alive connection cannot hold the exit longer than 3 s.
    try {
      await Promise.race([closeBridge(), sleepMs(3000)]);
    } catch (e) {
      log(`restart: close failed: ${cleanForLog((e as Error)?.name ?? "Error")}: ${cleanForLog((e as Error)?.message ?? e)}`); // one line, no stack; still exit: the new file is installed
    }
    (opts.exit ?? ((c: number) => process.exit(c)))(UPDATE_EXIT_CODE);
  }
  // ---- the access switch (0.3.19) ---------------------------------------------------------------------------------------
  /** True while the access window is open (and while ON checks what is running): no new code turn starts, no folder dialog opens, no second access window, no update. */
  let accessDialogOpen = false;
  /** Counts every lowering, so a window answered after the person switched to folder cannot raise the mode again. */
  let accessEpoch = 0;
  /** Set when "folder" could not be written down by any means: no code turn starts until it can be. */
  let accessUnsaved = false;
  const ACCESS_COOLDOWNS_MS = [30_000, 120_000];
  const ACCESS_ON_PER_HOUR = 5;
  const ACCESS_ON_PER_DAY = 10;
  const ACCESS_DENIALS_TO_LOCK = 3;
  const limitsFile = opts.stateDir ? path.join(opts.stateDir, LIMITS_FILE) : null;
  const memLimits = freshLimits();
  /** The ON counters. From the state folder with the access.json checks, every time; a file that is missing after the install started, or is not trusted, means the limit is reached for now (and a fresh file is written). */
  function getLimits(t: number): AccessLimits {
    if (!limitsFile) return memLimits;
    const r = readStrictText(limitsFile, platform, undefined, opts.winOwnerOk);
    const got = parseLimits(r.text, t);
    if (got) return got;
    log("the access limits file is missing or not trusted: ON waits 10 minutes");
    const closed = failClosedLimits(t);
    try { writeLimitsFile(limitsFile, closed); } catch { /* nothing more to do */ }
    return closed;
  }
  const saveLimits = (l: AccessLimits) => {
    if (!limitsFile) return;
    try { writeLimitsFile(limitsFile, l); } catch (e) { log(`could not save the access limits: ${(e as ErrLike)?.message ?? e}`); }
  };
  if (limitsFile && installFresh && !fileThere(limitsFile)) saveLimits(freshLimits()); // the file is made once; after that, missing means tampered
  const canAccessDialog = () => !!opts.accessDialog || platform === "darwin" || platform === "win32" || !!zenity;
  const rmMarker = (f: string | null) => { if (f) { try { fs.rmSync(f, { force: true }); } catch { /* the next start reads the marker as folder */ } } };
  /**
   * Saves the mode. Lowering that cannot be written atomically is written in place; only if that fails too, and a setting has been saved here before
   * (so a --full-access flag cannot seed again), is the file removed. `false`: none of it worked.
   */
  const saveAccess = (m: AccessMode): boolean => {
    if (!accessFile) return true; // memory only (tests, a bridge made without a state folder)
    try {
      writeAccessFile(accessFile, m, new Date(now()).toISOString());
      return true;
    } catch (e) {
      log(`could not save the access mode: ${(e as ErrLike)?.message ?? e}`);
    }
    if (m === "folder") {
      try {
        overwriteAccessFile(accessFile, "folder", new Date(now()).toISOString());
        return true;
      } catch { /* try removing it */ }
      try {
        if (seededMarker && fileThere(seededMarker)) {
          fs.rmSync(accessFile, { force: true });
          if (!fileThere(accessFile)) return true;
        }
      } catch { /* all failed */ }
    }
    return false;
  };
  /** Any code child that is still alive, in the turns table or not, or anything tagged or seen below one. */
  async function codeActivity(): Promise<"busy" | "unknown" | "free"> {
    if (codeChildAlive()) return "busy";
    const v = await livingTurnProcs();
    return !v.known ? "unknown" : v.pids.length > 0 ? "busy" : "free";
  }
  /** Folder mode now, no questions. Code turns that run in computer mode are cancelled; their process groups and everything tagged or seen below them are stopped (SIGTERM, then SIGKILL), and this waits until they are gone. */
  async function lowerAccess(): Promise<{ changed: boolean; cancelled: number; saved: boolean }> {
    const changed = accessMode !== "folder";
    accessEpoch += 1;
    accessMode = "folder";
    accessSource = "file";
    // The lowering is written down first (a marker beside access.json), so a restart after a failed save still starts in folder.
    if (loweredMarker) { try { fs.mkdirSync(path.dirname(loweredMarker), { recursive: true, mode: 0o700 }); fs.writeFileSync(loweredMarker, "1", { mode: 0o600 }); } catch { /* the folder is not writable: the start-up probe covers it */ } }
    let cancelled = 0;
    const stops: Promise<void>[] = [];
    // A folder-mode code turn that is running is not touched by a switch to folder.
    const keep = new Set<number>([...turns.values()].flatMap((t) => (t.code && !t.computer && !t.closed && t.child?.pid !== undefined ? [t.child.pid] : [])));
    for (const t of [...turns.values()]) {
      if (!t.code || !t.computer || t.parent || t.closed) continue;
      t.cancelRequested = true;
      for (const h of t.handoffs) {
        h.closed = true;
        stops.push(stopChild(h.child));
      }
      stops.push(stopChild(t.child));
      cancelled += 1;
    }
    const saved = saveAccess("folder");
    if (saved) rmMarker(loweredMarker);
    accessUnsaved = !saved;
    await Promise.all(stops);
    await killAllTracked(keep); // what left the group (setsid) or was started by a tagged helper
    return { changed, cancelled, saved };
  }
  async function handleAccess(req: IncomingMessage, res: ServerResponse) {
    if (updating()) return json(res, 409, UPDATING);
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
    }
    if (body.mode !== "folder" && body.mode !== "computer") return json(res, 400, { error: 'mode must be "folder" or "computer"' });
    if (updating()) return json(res, 409, UPDATING);
    if (body.mode === "folder") {
      const r = await lowerAccess();
      if (!r.saved) return json(res, 500, { error: "Folder mode is on now, but it could not be saved on this computer, so no code turn starts until it can be.", access: "folder", changed: r.changed, cancelled: r.cancelled, code: "AccessNotSaved" });
      return json(res, 200, { access: "folder", changed: r.changed, cancelled: r.cancelled });
    }
    // Turning it ON: never without the window, and only when nothing else is going on.
    if (accessMode === "computer") return json(res, 200, { access: "computer", changed: false });
    // The window names the page that asked: the request's own Origin, and only when it is one of the allowed apps.
    const asking = effectiveOrigin(req)?.origin;
    if (!originFitForDialog(asking) || !allowedOrigins.includes(asking)) return json(res, 403, { error: "Full access can only be asked for by an allowed app, in a browser.", code: "AccessOriginRequired" });
    if (dialogOpen) return json(res, 409, { error: "A folder dialog is open on this computer. Finish it first." });
    if (accessDialogOpen) return json(res, 409, { error: "The full access window is already open on this computer.", code: "AccessDialogOpen" });
    if (!canAccessDialog()) return json(res, 501, { error: "This computer cannot show the full access window (zenity is missing), so full access cannot be turned on from the app.", code: "AccessDialogUnavailable" });
    const t0 = now();
    const L = getLimits(t0);
    if (t0 < L.lockedUntil) return json(res, 429, { error: "Full access was refused several times, so asking is locked. Run `node bridge.mjs --access-reset` in a Terminal to unlock it (add --state-dir if this bridge has its own).", code: "AccessLocked", retryAfterSec: Math.ceil((L.lockedUntil - t0) / 1000) });
    if (t0 < L.cooldownUntil) return json(res, 429, { error: "You just said no. Try again later.", code: "AccessCooldown", retryAfterSec: Math.ceil((L.cooldownUntil - t0) / 1000) });
    L.stamps = L.stamps.filter((x) => t0 - x < DAY_MS);
    const lastHour = L.stamps.filter((x) => t0 - x < 3_600_000);
    if (lastHour.length >= ACCESS_ON_PER_HOUR) return json(res, 429, { error: "Too many requests to turn on full access. Try again later.", code: "AccessTooMany", retryAfterSec: Math.ceil((lastHour[0]! + 3_600_000 - t0) / 1000) });
    if (L.stamps.length >= ACCESS_ON_PER_DAY) return json(res, 429, { error: "Too many requests to turn on full access today. Try again tomorrow.", code: "AccessTooManyToday", retryAfterSec: Math.ceil((L.stamps[0]! + DAY_MS - t0) / 1000) });
    // From here to the answer no code turn can start (accessDialogOpen is set before anything is awaited), and nothing is awaited between the checks above and this line.
    accessDialogOpen = true;
    try {
      const TURN_RUNNING = { error: "Something the AI started is still running. Switch when it has finished.", code: "TurnRunning" };
      const busy = await codeActivity();
      if (busy === "busy") return json(res, 409, TURN_RUNNING);
      if (busy === "unknown") return json(res, 409, { error: "The bridge could not check what is running on this computer, so nothing was changed.", code: "AccessScanFailed" });
      L.stamps.push(t0);
      saveLimits(L);
      const epoch = accessEpoch;
      let result: AccessDialogResult | "failed";
      try {
        result = await (opts.accessDialog ?? ((o: string) => systemAccessDialog(platform, env, opts.accessRun, { origin: o, zenity })))(asking);
      } catch (e) {
        log(`access dialog could not open: ${cleanForLog((e as ErrLike)?.message ?? e)}`);
        result = "failed";
      }
      if (result === "failed") {
        L.stamps.pop(); // a window that could not open is not a refusal and does not count
        saveLimits(L);
        return json(res, 501, { error: "The full access window could not open on this computer, so nothing was changed.", code: "AccessDialogUnavailable" });
      }
      if (result === "timeout") {
        // No answer is not a refusal: it only waits a little, and does not count toward the lock.
        L.cooldownUntil = now() + ACCESS_COOLDOWNS_MS[0]!;
        saveLimits(L);
        return json(res, 403, { error: "Nobody answered the window on this computer, so full access stays off.", code: "AccessDenied" });
      }
      if (result !== "allow") {
        L.denials += 1;
        L.lastDenialAt = now();
        L.cooldownUntil = now() + ACCESS_COOLDOWNS_MS[Math.min(L.denials - 1, ACCESS_COOLDOWNS_MS.length - 1)]!;
        if (L.denials >= ACCESS_DENIALS_TO_LOCK) {
          L.lockedUntil = now() + DAY_MS; // three Nos in a row: asking is locked for a day (or until --access-reset)
          L.cooldownUntil = L.lockedUntil;
        }
        saveLimits(L);
        return json(res, 403, { error: "Full access was not allowed on this computer.", code: "AccessDenied" });
      }
      if (updating()) return json(res, 409, UPDATING);
      if (epoch !== accessEpoch) return json(res, 409, { error: "The mode was switched to folder while the window was open, so nothing was changed.", code: "AccessChanged" });
      const after = await codeActivity(); // checked again after Allow, before anything is written
      await opts.afterAllowScan?.();
      if (after !== "free") return json(res, 409, after === "busy" ? TURN_RUNNING : { error: "The bridge could not check what is running on this computer, so nothing was changed.", code: "AccessScanFailed" });
      // A Folder request that landed during the scan wins: checked once more, with nothing awaited between here and the write.
      if (epoch !== accessEpoch) return json(res, 409, { error: "The mode was switched to folder while the window was open, so nothing was changed.", code: "AccessChanged" });
      if (!saveAccess("computer")) return json(res, 500, { error: "Could not save the mode on this computer, so nothing was changed.", code: "AccessNotSaved" });
      rmMarker(loweredMarker);
      saveLimits({ ...L, denials: 0, cooldownUntil: 0, lockedUntil: 0 });
      accessUnsaved = false;
      accessMode = "computer";
      accessSource = "file";
      return json(res, 200, { access: "computer", changed: true });
    } finally {
      accessDialogOpen = false;
    }
  }

  async function handleUpdate(req: IncomingMessage, res: ServerResponse) {
    let body: Record<string, unknown> = {};
    try {
      body = await readBody(req);
    } catch {
      body = {}; // the body is ignored except { check: true }
    }
    if (turns.size > 0) return json(res, 409, { error: "A chat turn is still running. Update when it has finished.", code: "TurnRunning" });
    if (accessDialogOpen) return json(res, 409, { error: "The full access window is open on this computer. Answer it first.", code: "AccessDialogOpen" });
    if (liveGroups.size > 0) return json(res, 409, { error: "Something the AI started is still running. Update when it has finished.", code: "TurnRunning" });
    const deps = realUpdateDeps();
    if (body.check === true) {
      const c = await checkUpdate(deps);
      if (c.kind === "available") return json(res, 200, { current: deps.running, latest: c.manifest.version, available: true });
      if (c.kind === "current") return json(res, 200, { current: deps.running, latest: c.latest, available: false });
      return updateFailure(res, c.result.code, c.result.message, deps.running);
    }
    const r = await (opts.updateRun ?? runUpdate)(deps);
    if ("code" in r) return updateFailure(res, r.code, r.message, deps.running);
    if (!r.updated) {
      log(`update: current (running ${deps.running})`);
      return json(res, 200, { updated: false, reason: "current" });
    }
    const automatic = supervisedNow();
    if (automatic) {
      // Only when the answer has been sent: close the listener, give the client a moment to read it, then end the process.
      // The supervisor (launchd, the Windows supervisor) starts the new file with the same flags.
      restartPending = true;
      res.once("finish", () => {
        setTimeout(() => void restartAfterUpdate(), 150);
      });
    } else {
      log(`Updated to ${r.to}. Stop this window (Ctrl+C) and start the bridge again.`);
    }
    return json(res, 200, { updated: true, from: r.from, to: r.to, restart: automatic ? "automatic" : "manual" });
  }

  /** hello.update: no network, only a look at the file. */
  async function updateHello() {
    const d = realUpdateDeps();
    return { supported: d.origin.startsWith("https://") && d.keys.length > 0, supervised: supervisedNow(), canWrite: await updateCanWrite(d.fs, d.file, d), busy: isUpdateRunning() };
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    if (!hostOk(req)) return json(res, 403, { error: "bad host" });
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const mcp = /^\/mcp\/([0-9a-f]+)\/([0-9a-f]+)$/.exec(url.pathname);
    if (mcp) return handleMcp(req, res, mcp[1]!, mcp[2]!);

    // The local control door (`--code`): the same user, on this computer, with the token file only they can read. Never a
    // browser: a request that carries an Origin is refused, and no CORS header is ever set on this path.
    if (url.pathname === "/control/code" || url.pathname === "/control/unpair-all") {
      const tok = req.headers["x-bridge-control"];
      const want = url.pathname === "/control/code" ? "GET" : "POST";
      if (!opts.controlToken || req.headers.origin !== undefined || req.method !== want) return json(res, 403, { error: "not allowed" });
      if (typeof tok !== "string" || !same(tok, opts.controlToken)) return json(res, 401, { error: "bad control token" });
      if (want === "POST") {
        const n = pairings.size;
        pairings.clear();
        savePairings();
        await lowerAccess(); // --unpair-all also puts the mode back to folder
        return json(res, 200, { removed: n });
      }
      return json(res, 200, { code: pairingCode });
    }

    if (req.method === "GET" && url.pathname === "/relay") {
      const { html, csp } = relayPage(allowedOrigins);
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-frame-options": "DENY",
        "content-security-policy": csp,
      });
      return res.end(html);
    }

    const who = effectiveOrigin(req);
    if (!who || (!who.relayed && !cors(who.origin, res))) return json(res, 403, { error: "This origin is not allowed." });
    const origin = who.origin;
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/v1/hello") {
      const paired = hasSecret(req, origin);
      // The next use after code mode was switched off: check the saved folder again (a paired caller only, so an unpaired hello does no work on disk).
      if (paired) recheckSavedFolder();
      return json(res, 200, { bridge: "gilb-claude-code-bridge", version: BRIDGE_VERSION, build: BRIDGE_BUILD, billing: "claude-subscription", relay: true, codeTurns: true, ...(canOpenFolder() ? { openFolder: true } : {}), workspace: workspace !== null, ...(paired && !workspace && codeOff && savedFolder ? { codeModeOff: { reason: codeOff.reasonCode, message: codeOff.sentence, folderName: savedFolder.name } } : {}), codeMode: workspace ? (filesOnlyFor(accessMode) ? "files-only" : "full") : null, access: workspace ? accessMode : null, options: { ...(accessMode === "computer" && codePlatform !== "win32" ? { approvals: { mode: "sandboxed" } } : {}), ...(workspace ? { web: filesOnlyFor(accessMode) ? { search: false, fetch: "off" } : { search: true, fetch: "ask" } } : {}), models: [...MODEL_ALIASES], efforts: [...EFFORTS], delegateCoding: true, images: { maxCount: IMAGE_MAX_COUNT, maxBytes: IMAGE_MAX_BYTES, types: [...IMAGE_TYPES] } }, ...(hasSecret(req, origin) ? { update: await updateHello(), access: accessMode, accessChangeable: true, accessSource, ...(accessUnsaved ? { accessSaveFailed: true } : {}) } : {}) });
    }
    if (req.method === "POST" && url.pathname === "/v1/pair") {
      let body;
      try {
        body = await readBody(req);
      } catch (e) {
        return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
      }
      if (typeof body.code !== "string") return json(res, 400, { error: BAD_REQUEST });
      if (normCode(body.code).length === 6 && normCode(body.code) === normCode(pairingCode)) {
        const secret = crypto.randomBytes(32).toString("hex");
        const t = now();
        const ph = typeof body.principalHash === "string" && /^[0-9a-f]{64}$/.test(body.principalHash) ? body.principalHash : null;
        pairings.set(sha(secret).toString("hex"), { origin: origin ?? null, principalHash: ph, issued: t, lastUsed: t, saved: t });
        while (pairings.size > maxPairings) dropOldest();
        savePairings();
        newPairing(); // single use: the next tab needs the next code
        return json(res, 200, { secret });
      }
      pairFailures += 1;
      if (pairFailures >= maxPairFailures) newPairing(); // brute force burns the code
      return json(res, 401, { error: "That code is not right. Look at the code in the terminal where the bridge runs." });
    }
    if (url.pathname.startsWith("/v1/")) {
      if (!hasSecret(req, origin)) return json(res, 401, { error: "Pair first." });
      if (req.method === "POST" && url.pathname === "/v1/check") return json(res, 200, { ok: true });
      if (req.method === "POST" && url.pathname === "/v1/workspace") {
        recheckSavedFolder();
        return workspace ? json(res, 200, { name: workspace.name, path: workspace.path }) : noFolder(res);
      }
      if (req.method === "POST" && url.pathname === "/v1/projects") return handleProjects(res);
      if (url.pathname === "/v1/preview") {
        if (req.method !== "POST") { res.setHeader("allow", "POST"); return json(res, 405, { error: "Use POST." }); }
        return handlePreview(req, res);
      }
      if (req.method === "POST" && url.pathname === "/v1/projects/create") return handleProjectCreate(req, res);
      if (req.method === "POST" && url.pathname === "/v1/workspace/choose") return handleChoose(req, res);
      if (req.method === "POST" && url.pathname === "/v1/workspace/create") return handleCreate(req, res);
      if (req.method === "POST" && url.pathname === "/v1/workspace/open") { await closeAllPreviews(); return handleOpenFolder(req, res); }
      if (req.method === "POST" && url.pathname === "/v1/unpair") {
        pairings.delete(sha(String(req.headers["x-bridge-secret"])).toString("hex"));
        savePairings();
        await closeAllPreviews();
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/v1/turn") return handleTurn(req, res);
      if (req.method === "POST" && url.pathname === "/v1/update") return handleUpdate(req, res);
      if (req.method === "POST" && url.pathname === "/v1/access") return handleAccess(req, res);
      if (req.method === "POST" && url.pathname === "/v1/turns") {
        const me = callerKey(req);
        const iso = (ms: number) => new Date(ms).toISOString();
        return json(res, 200, {
          turns: [...turns.values()].filter((t) => !t.parent && t.owner === me).map((t) => ({
            turnId: t.id,
            mode: t.code ? "code" : "chat",
            project: t.proj ? t.proj.name : null,
            startedAt: iso(t.startedAt),
            lastActivityAt: iso(t.lastActivityAt),
            lastActivity: t.lastActivity,
            toolCalls: t.toolCalls,
            handoffs: t.handoffCount,
            ...(t.images.length > 0 ? { images: t.images.length } : {}),
          })),
        });
      }
      if (req.method === "POST" && url.pathname === "/v1/turn/cancel") {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
        }
        if (typeof body.turnId !== "string") return json(res, 400, { error: BAD_REQUEST });
        const t = turns.get(body.turnId);
        // Only the pairing that started the turn may cancel it; any other gets the same answer as an unknown turn.
        if (!t || t.parent || t.closed || t.owner !== callerKey(req)) return json(res, 200, { cancelled: false });
        t.cancelRequested = true;
        for (const h of t.handoffs) {
          h.closed = true;
          void stopChild(h.child);
        }
        void stopChild(t.child);
        return json(res, 200, { cancelled: true });
      }
      if (req.method === "POST" && url.pathname === "/v1/approval") {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
        }
        if (typeof body.turnId !== "string" || typeof body.id !== "string") return json(res, 400, { error: BAD_REQUEST });
        const t = turns.get(body.turnId);
        // Only the pairing that started the turn may answer; any other gets the same answer as an unknown question.
        const a = t && t.owner === callerKey(req) ? t.approvals.get(body.id) : undefined;
        if (!a) return json(res, 404, { error: "no such approval question" });
        if (typeof body.allow !== "boolean") return json(res, 400, { error: "allow must be true or false" });
        if (body.scope !== undefined && body.scope !== "once" && body.scope !== "turn") return json(res, 400, { error: 'scope must be "once" or "turn"' });
        if (a.answered) return json(res, 409, { error: "already answered" });
        a.settle(body.allow, undefined, body.scope === "turn" ? "turn" : "once");
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname.startsWith("/v1/settings/")) return handleSettings(req, res, url.pathname);
      if (req.method === "POST" && url.pathname === "/v1/tool-result") {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          return json(res, (e as ErrLike).status ?? 400, { error: (e as ErrLike).message });
        }
        if (typeof body.turnId !== "string" || typeof body.id !== "string") return json(res, 400, { error: BAD_REQUEST });
        const turn = turns.get(body.turnId);
        const p = turn?.pending.get(body.id);
        // Only the pairing that started the turn may answer its calls; any other gets the same answer as an unknown turn.
        if (turn && turn.owner !== callerKey(req)) return json(res, 404, { error: "No such tool call is waiting." });
        if (turn && !p && turn.cancelled.has(body.id)) return json(res, 200, { ignored: true, reason: "cancelled" });
        if (!turn || !p) return json(res, 404, { error: "No such tool call is waiting." });
        turn.pending.delete(body.id);
        p.resolve({ text: typeof body.result === "string" ? body.result : JSON.stringify(body.result ?? null), isError: body.isError === true });
        return json(res, 200, { ok: true });
      }
    }
    return json(res, 404, { error: "not found" });
  }

  /**
   * At start (after the lock on the state folder is ours): stop EXACTLY what an earlier run recorded in live-groups.json (a hard kill, a closed
   * Terminal, a crash): each recorded code child and descendant, only while its pid still has the start time that was recorded. Nothing is
   * found by name, text or environment.
   */
  async function sweepLeftovers() {
    if (!liveFile) return;
    let entries: [number, string][] = [];
    const roots: [number, string][] = [];
    // The owner check is skipped on Windows (it starts PowerShell): the entries only ever stop a process whose pid AND start time match, which same-user code could stop anyway.
    const r = readStrictText(liveFile, platform, undefined, () => true);
    try {
      const v = r.text === null ? null : (JSON.parse(r.text) as { groups?: unknown });
      if (v && Array.isArray(v.groups)) {
        for (const g of (v.groups as { pid?: unknown; start?: unknown; desc?: unknown }[]).slice(0, 5)) {
          if (typeof g?.pid !== "number" || !Number.isInteger(g.pid) || typeof g.start !== "string") continue;
          roots.push([g.pid, g.start]);
          entries.push([g.pid, g.start]);
          if (Array.isArray(g.desc)) for (const d of (g.desc as unknown[]).slice(0, LIVE_FILE_DESC_MAX)) if (Array.isArray(d) && typeof d[0] === "number" && Number.isInteger(d[0]) && typeof d[1] === "string") entries.push([d[0], d[1]]);
        }
      }
    } catch { /* none, or unreadable */ }
    const rows = entries.length > 0 ? await procList() : null;
    if (rows) {
      for (const pid of stillMatching(roots, rows)) if (platform !== "win32") await killGroup(pid, opts.killGraceMs); // a recorded claude that is still the same process: its group goes
      const n = stillMatching(entries, rows).length;
      if (n > 0) log(`stopping ${n} process(es) left by an earlier run`);
      await killEntries(entries);
    }
    entries = [];
    persistTracks(); // the list is empty now
  }
  /** The lock on the state folder: one bridge at a time (pid + start time). A second one refuses to start and names --state-dir. */
  const lockFile = opts.stateDir ? path.join(opts.stateDir, "bridge.lock") : null;
  let lockHeld = false;
  async function takeLock() {
    if (!lockFile) return;
    if (HELD_LOCKS.has(lockFile)) throw new Error(`another bridge in this process is already using the state folder ${opts.stateDir}. Give this one its own --state-dir.`);
    fs.mkdirSync(path.dirname(lockFile), { recursive: true, mode: 0o700 });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // No process list here: on Windows that is a PowerShell start, which would delay the listener by seconds. The start time is added once the port is open.
        fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, start: "" }), { flag: "wx", mode: 0o600 });
        lockHeld = true;
        HELD_LOCKS.add(lockFile);
        return;
      } catch (e) {
        if ((e as ErrLike).code !== "EEXIST") throw e;
      }
      let owner: { pid?: unknown; start?: unknown } = {};
      try { owner = JSON.parse(fs.readFileSync(lockFile, "utf8")) as typeof owner; } catch { /* a damaged lock is stale */ }
      const pidOk = typeof owner.pid === "number" && Number.isInteger(owner.pid) && owner.pid !== process.pid;
      let ownerAlive = pidOk && pidAliveNow(owner.pid as number);
      // A lock with no start time that is older than a minute was left by a bridge that died before it could add one: its pid may belong to something else now.
      if (ownerAlive && owner.start === "" && Date.now() - (fs.statSync(lockFile, { throwIfNoEntry: false })?.mtimeMs ?? 0) > 60_000) ownerAlive = false;
      if (ownerAlive && typeof owner.start === "string" && owner.start !== "") {
        const rows = await procList(); // only when there is a live owner to tell apart from a recycled pid
        if (rows !== null && rows.find((r) => r.pid === owner.pid)?.start !== owner.start) ownerAlive = false;
      }
      if (ownerAlive) throw new Error(`another bridge (process ${owner.pid}) is already using the state folder ${opts.stateDir}. Give this one its own --state-dir.`);
      try { fs.rmSync(lockFile, { force: true }); } catch { /* the next attempt tells */ }
    }
    throw new Error(`could not lock the state folder ${opts.stateDir}`);
  }
  /** Adds this process's start time to the lock, off the start-up path. */
  function recordLockStart() {
    if (!lockFile || !lockHeld || platform === "win32") return; // Windows: no PowerShell for it; the pid alone holds the lock (a lock with no start time goes stale after a minute)
    void procList().then((rows) => {
      const mine = rows?.find((r) => r.pid === process.pid)?.start;
      if (mine && lockHeld) { try { fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, start: mine }), { mode: 0o600 }); } catch { /* the pid alone still holds the lock */ } }
    }, () => {});
  }
  const releaseLock = () => {
    if (lockHeld && lockFile) { HELD_LOCKS.delete(lockFile); try { fs.rmSync(lockFile, { force: true }); } catch { /* stale: the next start replaces it */ } }
    lockHeld = false;
  };
  const closeBridge = (): Promise<void> => {
    bridgeClosing = true; // from here no preview starts, even on a connection that is still open
    closeListingDeadline = Date.now() + SNAPSHOT_CAP_MS;
    closeCapLogged = false;
    const previewsClosed = closeAllPreviews();
    const stopChat = async (c: ChildProcess) => {
      if (c.exitCode !== null || c.signalCode !== null) return;
      const gone = new Promise<void>((r) => c.once("exit", () => r()));
      // The same stop as the hang-up gives (SIGTERM, then SIGKILL after the grace), with the grace cut to what is left of the close budget, so a child
      // that ignores SIGTERM is gone when close() returns and still cannot hold close() longer than the budget.
      await withinListingBudget(Promise.all([killChild(c, env, { ...opts.platformOpts, graceMs: Math.min(opts.killGraceMs ?? KILL_GRACE_MS, listingLeft()) }), gone]));
    };
    const stopped = Promise.all([...turns.values()].map((t) => stopChild(t.child)).concat([...liveGroups.values()].map((c) => stopChild(c)), [...liveChat].map(stopChat))).then(() => killAllTracked()).then(() => previewsClosed);
    return stopped.then(() => new Promise<void>((resolve) => {
      // The children are dead by now, so a response still open belongs to a dead turn. server.close() closes only the connections that are idle
      // at the moment it is called, so close those first, and give a response that is finishing its last write a short grace before cutting the rest.
      // (closeIdleConnections / closeAllConnections exist from Node 18.2; the unit allows Node >=18, so each is checked.)
      if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
      const cut = setTimeout(() => { if (typeof server.closeAllConnections === "function") server.closeAllConnections(); }, CLOSE_GRACE_MS);
      server.close(() => { clearTimeout(cut); closeListingDeadline = null; releaseLock(); resolve(); });
    }));
  };
  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      log(`error: ${e?.message ?? e}`);
      if (!res.headersSent) json(res, 500, { error: "bridge error" });
      else res.end();
    });
  });

  return {
    server,
    get port() {
      return port;
    },
    get pairingCount() {
      return pairings.size;
    },
    get pairingCode() {
      return pairingCode;
    },
    /** The code folder now in use (given, stored or chosen), or null. */
    get workspacePath() {
      return workspace ? workspace.path : null;
    },
    /** The access mode now ("folder" | "computer") and where it came from. */
    get access() {
      return accessMode;
    },
    get accessSource() {
      return accessSource;
    },
    async start() {
      // Setting grants start here, after every start check: the projects folder is made now (so its identity is taken before any turn runs), and the
      // secret and the stored grants are read from disk this once. They are never read from disk again until the next start.
      if (grantBook && opts.stateDir) {
        let off = grantsOffCore(false);
        if (!off) {
          try { fs.mkdirSync(storeFolder(stateRealAtStart), { recursive: true, mode: 0o700 }); } catch { /* the check below says so */ }
          stateIds[1] = folderIdNow(storeFolder(stateRealAtStart));
          if (stateIds[1] === null) off = `The projects folder in ${opts.stateDir} could not be made, or is not a plain folder.`;
          else off = grantsOffCore(true);
        }
        if (off) latchGrantsOff(off);
        else grantBook.load();
      }
      fs.mkdirSync(workDir, { recursive: true, mode: 0o700 });
      await takeLock(); // one bridge per state folder: a second refuses here
      sweepSnapshots(); // the lock is ours, so no other bridge's snapshots are here
      try {
        return await new Promise<number>((resolve, reject) => {
          server.once("error", reject);
          server.listen(port, "127.0.0.1", () => {
            port = (server.address() as AddressInfo).port;
            // The folder is ours and so is the port: stop exactly what an earlier run recorded.
            sweepLeftovers().then(() => resolve(port), () => resolve(port));
            recordLockStart();
          });
        });
      } catch (e) {
        releaseLock();
        throw e;
      }
    },
    /** Last resort, synchronous (for `process.on("exit")`): SIGKILL each tracked code child's group and each recorded descendant, only while its start time still matches what was seen. */
    killAllSync() {
      const rows = (opts.procListSync ?? (() => listProcsSync(platform)))();
      if (!rows) return;
      const byPid = new Map(rows.map((r) => [r.pid, r]));
      for (const tr of tracks.values()) {
        if (tr.start !== "" && byPid.get(tr.pid)?.start === tr.start && platform !== "win32") { try { process.kill(-tr.pid, "SIGKILL"); } catch { /* gone */ } }
        for (const [pid, start] of tr.desc) {
          if (pid !== process.pid && byPid.get(pid)?.start === start) { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
        }
      }
      releaseLock();
    },
    close() {
      return closeBridge();
    },
  };
}

// ---- always-on service (macOS LaunchAgent; Windows below) -----------------------------------------------------------------------------
export const DEFAULT_LABEL = "com.gilb.claude-code-bridge";
const defaultStateDir = (home = os.homedir()) => path.join(home, ".gilb-claude-code-bridge");
/** A label becomes part of file names and a registry value name: letters, digits, dot, dash, underscore; 1 to 64 characters; starts and ends with a letter or digit (Windows drops a trailing dot from a folder name). */
export const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/;
const LABEL_MESSAGE = "--label may use letters, digits, dot, dash and underscore only (1 to 64 characters, starting and ending with a letter or digit).";
const badLabel = (opts: CliOptions): ServiceResult | null => (LABEL_RE.test(opts.label) ? null : { ok: false, message: LABEL_MESSAGE });

/** Reads the command line into a plain object. Unknown flags are refused by main() before this is used. */
export function parseCli(argv: string[]) {
  const val = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--") ? argv[i + 1] : undefined;
  };
  // Repeatable: every value after each --allow-origin.
  // A flag with no value, or in `--allow-origin=X` form, is NOT skipped: a missing or odd value is passed on as it is (an
  // empty string for "no value"), so normalizeOrigin refuses it out loud instead of the origin quietly not being allowed.
  const valAll = (name: string) =>
    argv.flatMap((a, i) => {
      if (a.startsWith(`${name}=`)) return [a.slice(name.length + 1)];
      if (a !== name) return [];
      return [argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--") ? argv[i + 1]! : ""];
    });
  const modes = ["--install", "--uninstall", "--status", "--code", "--unpair-all", "--access-reset", "--supervise", "--help", "-h"].filter((m) => argv.includes(m));
  // --workspace: a relative folder is taken from where the command was typed. A flag with no value gives "" so main() refuses it out loud.
  const wsRaw = valAll("--workspace")[0];
  const workspace = wsRaw === undefined ? undefined : wsRaw === "" ? "" : path.isAbsolute(wsRaw) || /^[A-Za-z]:[\\/]/.test(wsRaw) ? wsRaw : path.resolve(process.cwd(), wsRaw);
  return {
    mode: modes.length === 0 ? "run" : modes[0]!.replace(/^-+/, "") === "h" ? "help" : modes[0] === "--unpair-all" ? "unpairAll" : modes[0] === "--access-reset" ? "accessReset" : modes[0]!.replace(/^-+/, ""),
    modes,
    claude: val("--claude"),
    port: val("--port") === undefined ? undefined : Number(val("--port")),
    allowOrigins: valAll("--allow-origin"),
    allowOrigin: val("--allow-origin"),
    label: val("--label") ?? DEFAULT_LABEL,
    stateDir: val("--state-dir"),
    workspace,
    fullAccess: argv.includes("--full-access"),
    /** `--access folder`: lowers the saved mode (never raises it). Every value given is checked: the first that is not "folder" is kept here so main() and --install refuse it. */
    access: ((all) => all.find((v) => v !== "folder") ?? all[0])(valAll("--access")),
  };
}

export type CliOptions = ReturnType<typeof parseCli>;

const xmlEsc = (t: unknown) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The LaunchAgent plist text. Absolute node and bridge paths, the PATH that finds `claude`, always on, one log file. */
export function buildPlist({ label, node, file, args = [], pathEnv, logFile, workDir }: { label: string; node: string; file: string; args?: string[]; pathEnv: string; logFile: string; workDir: string }) {
  const items = [node, file, ...args].map((a) => `    <string>${xmlEsc(a)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEsc(label)}</string>
  <key>ProgramArguments</key>
  <array>
${items}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xmlEsc(pathEnv)}</string>
    <key>GILB_BRIDGE_SUPERVISED</key>
    <string>1</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${xmlEsc(workDir)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>StandardOutPath</key>
  <string>${xmlEsc(logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEsc(logFile)}</string>
</dict>
</plist>
`;
}

/**
 * The absolute path of `name`: an explicit path as given, else the first executable on PATH or in the usual install folders.
 * On Windows ("win32"): PATH splits on `;`, a name without an extension is tried with each PATHEXT extension Node can start
 * (.com .exe .bat .cmd; never the extensionless `claude` script npm also writes), and the usual folders are
 * %USERPROFILE%\.local\bin (Anthropic's installer) and %APPDATA%\npm (npm -g).
 */
export function resolveBin(name: string, env: NodeJS.ProcessEnv = process.env, home = os.homedir(), platform: string = process.platform, files: NonNullable<PlatformOpts["files"]> = realFiles) {
  if (platform === "win32") {
    const W = path.win32;
    const exts = winExts(env);
    const withExt = (base: string): string[] => {
      const e = W.extname(base).toLowerCase();
      if (WIN_EXTS.includes(e) || [".js", ".cjs", ".mjs"].includes(e)) return [base];
      return exts.flatMap((x) => [base + x, base + x.toUpperCase()]);
    };
    if (/[\\/]/.test(name) || W.isAbsolute(name)) {
      const abs = W.resolve(name);
      return withExt(abs).find((f) => files.exists(f)) ?? abs;
    }
    const appData = envGet(env, "APPDATA") ?? W.join(home, "AppData", "Roaming");
    const dirs = [
      ...String(envGet(env, "PATH") ?? "").split(";").map((d) => d.trim().replace(/^"(.*)"$/, "$1")),
      W.join(home, ".local", "bin"),
      W.join(appData, "npm"),
      W.join(home, ".claude", "local"),
    ].filter((d) => d && W.isAbsolute(d)); // a relative PATH entry ("." or "bin") would mean the current folder
    for (const d of dirs) {
      const f = withExt(W.join(d, name)).find((c) => files.exists(c));
      if (f) return f;
    }
    return null;
  }
  if (name.includes("/")) return path.resolve(name);
  const dirs = [...String(env.PATH ?? "").split(":"), path.join(home, ".local", "bin"), path.join(home, ".claude", "local"), "/opt/homebrew/bin", "/usr/local/bin"].filter(Boolean);
  for (const d of dirs) {
    const f = path.join(d, name);
    try {
      fs.accessSync(f, fs.constants.X_OK);
      return f;
    } catch {
      /* next */
    }
  }
  return null;
}

/** Real launchctl, used by the CLI. Tests pass their own. Resolves { code, out }. */
export function runLaunchctl(args: string[]): Promise<LaunchctlResult> {
  return new Promise((resolve) => {
    execFile("/bin/launchctl", args, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: `${stdout}${stderr}`.trim() }));
  });
}

const serviceFiles = (opts: CliOptions, home: string, platform: string = process.platform) => {
  // Windows: every other label has its own state folder, so two installs never share a token, status or supervisor file.
  const stateDir = opts.stateDir ? path.resolve(opts.stateDir) : platform === "win32" && opts.label !== DEFAULT_LABEL ? `${defaultStateDir(home)}-${opts.label}` : defaultStateDir(home);
  return {
    stateDir,
    plist: path.join(home, "Library", "LaunchAgents", `${opts.label}.plist`),
    logFile: path.join(home, "Library", "Logs", opts.label === DEFAULT_LABEL ? "gilb-claude-code-bridge.log" : `${opts.label}.log`),
    statusFile: path.join(stateDir, "status.json"),
    tokenFile: path.join(stateDir, "control-token"),
    pairingsFile: path.join(stateDir, "pairings.json"),
  };
};

/**
 * `--install`: checks the subscription login first (never installs a bridge that could not start), then writes the plist
 * with the absolute node, bridge file and claude paths recorded, and (re)loads it. Installing again restarts on the new file.
 * deps: { launchctl, uid, home, nodePath, file, env, log }
 */
export async function serviceInstall(opts: CliOptions, deps: ServiceDeps): Promise<ServiceResult> {
  const { launchctl, uid, home, nodePath, file, env, log } = deps;
  const platform = deps.platform ?? process.platform;
  if (platform !== "darwin" && platform !== "win32") return { ok: false, message: "--install works on macOS only (and on Windows). On other systems start the bridge in a terminal." };
  const lbl = badLabel(opts);
  if (lbl) return lbl;
  const port0 = opts.port ?? DEFAULT_PORT;
  if (!Number.isInteger(port0) || port0 < 1 || port0 > 65535) return { ok: false, message: "--port must be a number from 1 to 65535." };
  const claudeBin = resolveBin(opts.claude ?? "claude", env, home, platform === "win32" ? "win32" : process.platform, deps.files);
  if (!claudeBin) return { ok: false, message: "Claude Code (`claude`) was not found. Install it and run `claude auth login`, then run --install again." };
  const login = await (deps.check ?? checkSubscriptionLogin)(claudeBin, env);
  if (!login.ok) return { ok: false, message: `Not installed.\n${login.reason}` };
  const port = opts.port ?? DEFAULT_PORT;
  // Persisted in the LaunchAgent: the origins the person allowed at install time (checked now, so a typo never installs).
  let extraOrigins: string[];
  try {
    extraOrigins = [...new Set<string>((opts.allowOrigins ?? (opts.allowOrigin ? [opts.allowOrigin] : [])).map(normalizeOrigin))];
  } catch (e) {
    return { ok: false, message: `Not installed.\n${(e as ErrLike).message}` };
  }
  const accessBad = accessFlagProblem(opts.access);
  if (accessBad) return { ok: false, message: `Not installed.\n${accessBad}` };
  if (platform === "win32") return installWindows(opts, deps, { claudeBin, port, extraOrigins });
  const f = serviceFiles(opts, home);
  const args = ["--port", String(port), "--claude", claudeBin, "--state-dir", f.stateDir];
  for (const o of extraOrigins) args.push("--allow-origin", o);
  if (opts.workspace) args.push("--workspace", opts.workspace);
  const stateBad = stateDirProblem(f.stateDir, opts.workspace, home, platform);
  if (stateBad) return { ok: false, message: `Not installed.\n${stateBad}` };
  const pathEnv = [...new Set([path.dirname(nodePath), path.dirname(claudeBin), "/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"])].join(":");
  fs.mkdirSync(path.dirname(f.plist), { recursive: true });
  fs.mkdirSync(path.dirname(f.logFile), { recursive: true });
  fs.mkdirSync(f.stateDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(f.stateDir, 0o700);
  const accessSet = applyAccessFlag(f.stateDir, opts.access);
  if (!accessSet.ok) return { ok: false, message: `Not installed.\n${accessSet.message}` };
  if (opts.access === undefined) seedAccessFile(f.stateDir, opts.fullAccess, "darwin");
  if (!fs.existsSync(f.logFile)) fs.writeFileSync(f.logFile, "", { mode: 0o600 }); // the log shows the pairing code: this user only
  fs.chmodSync(f.logFile, 0o600);
  fs.writeFileSync(f.plist, buildPlist({ label: opts.label, node: nodePath, file, args, pathEnv, logFile: f.logFile, workDir: f.stateDir }), { mode: 0o644 });
  const domain = `gui/${uid}`;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  await launchctl(["bootout", `${domain}/${opts.label}`]); // not loaded yet is fine
  // bootout returns before the old copy is gone, and a bootstrap in that gap fails with "Input/output error": wait until it is unloaded.
  for (let i = 0; i < 40; i++) {
    if ((await launchctl(["print", `${domain}/${opts.label}`])).code !== 0) break;
    await sleep(250);
  }
  let r = await launchctl(["bootstrap", domain, f.plist]);
  for (let i = 0; i < 3 && r.code !== 0; i++) {
    await sleep(1000);
    r = await launchctl(["bootstrap", domain, f.plist]);
  }
  if (r.code !== 0) return { ok: false, message: `launchctl could not load the agent: ${r.out || `exit ${r.code}`}` };
  log?.(`installed ${f.plist}`);
  const me = opts.stateDir ? ` --state-dir ${f.stateDir}` : "";
  const flags = `${opts.label === DEFAULT_LABEL ? "" : ` --label ${opts.label}`}${me}`;
  return {
    ok: true,
    message: `Always-on bridge installed (${opts.label}). It starts when you log in and restarts if it stops.
  Billing: Claude subscription (checked at every start; never an API key)
  Log:     ${f.logFile}
  Get your pairing code:  node ${file} --code${flags}
  Check it:               node ${file} --status${flags}
  Remove it:              node ${file} --uninstall${flags}
  If a bridge is already running in a Terminal window, close that window: only one can hold port ${port}.${installAccessNotice(f.stateDir, opts, "darwin")}`,
  };
}

/** The access lines of an install message: what the saved mode on this computer is, and what the flags did to it. Reads the real state folder. */
function installAccessNotice(stateDir: string, opts: CliOptions, platform: string): string {
  const saved = readAccessFile(path.join(stateDir, ACCESS_FILE), platform);
  const on = platform === "win32" ? FULL_ACCESS_NOTICE_WINDOWS : FULL_ACCESS_NOTICE;
  if (saved.exists) return saved.mode === "computer" ? `\n  ${on}` : opts.fullAccess && opts.access !== "folder" ? `\n  ${FULL_ACCESS_SAVED_FOLDER_NOTICE}` : "";
  return opts.fullAccess ? `\n  ${on}` : "";
}

export async function serviceUninstall(opts: CliOptions, deps: ServiceDeps): Promise<ServiceResult> {
  const lbl = badLabel(opts);
  if (lbl) return lbl;
  if ((deps.platform ?? process.platform) === "win32") return uninstallWindows(opts, deps);
  const f = serviceFiles(opts, deps.home);
  const r = await deps.launchctl(["bootout", `gui/${deps.uid}/${opts.label}`]);
  const had = fs.existsSync(f.plist);
  fs.rmSync(f.plist, { force: true });
  clearAccessFile(f.stateDir); // uninstall puts the mode back to folder (no saved mode)
  return { ok: true, message: had || r.code === 0 ? `Removed ${opts.label}. The bridge no longer starts at login.` : `${opts.label} was not installed.` };
}

/** What to suggest when the bridge does not answer: --status where a service is installed, else the PowerShell window it runs in. */
function hintStatus(opts: CliOptions, deps: ServiceDeps): string {
  if ((deps.platform ?? process.platform) !== "win32") return "Try --status.";
  const installed = (deps.sfs ?? realServiceFs).exists(serviceFilesWin(opts, deps.home, "win32", deps.env).launcher);
  return installed ? "Try --status." : "Check that the bridge is still running in its PowerShell window.";
}

/** Asks the running bridge for its pairing code over 127.0.0.1 with the token only this user can read. */
export async function fetchCode(opts: CliOptions, deps: ServiceDeps): Promise<ServiceResult> {
  const lbl = badLabel(opts);
  if (lbl) return lbl;
  const f = serviceFiles(opts, deps.home, deps.platform);
  let token;
  let st: StatusFile = {};
  try {
    token = fs.readFileSync(f.tokenFile, "utf8").trim();
    st = JSON.parse(fs.readFileSync(f.statusFile, "utf8"));
  } catch {
    return { ok: false, message: (deps.platform ?? process.platform) === "win32" ? "No bridge has been started for this user yet (no control token). Run --install, or start the bridge in a PowerShell window." : "No bridge has been started for this user yet (no control token). Run --install, or start the bridge." };
  }
  const port = opts.port ?? st.port ?? DEFAULT_PORT;
  const tryStatus = hintStatus(opts, deps);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/control/code`, { headers: { "x-bridge-control": token } });
    if (!res.ok) return { ok: false, message: `The bridge on port ${port} did not give the code (${res.status}). Is it the current one? ${tryStatus}` };
    const b: { code?: unknown } = await res.json();
    return { ok: true, message: `Pairing code: ${b.code}\nIn the app, press Connect, choose Claude Code, and type it.` };
  } catch {
    return { ok: false, message: `The bridge is not answering on port ${port}. ${tryStatus}${st.ok === false ? ` Last start failed: ${st.reason}` : ""}` };
  }
}

/**
 * `--unpair-all`: every page loses its pairing. A running bridge is told over the local control door (it holds the list in
 * memory); if none answers, the file is emptied so the next start loads nothing.
 */
export async function unpairAll(opts: CliOptions, deps: ServiceDeps): Promise<ServiceResult> {
  const lbl = badLabel(opts);
  if (lbl) return lbl;
  const f = serviceFiles(opts, deps.home, deps.platform);
  const done = (n: number) => ({ ok: true, message: `Removed ${n} pairing${n === 1 ? "" : "s"}. Every app must be paired again with a new code.` });
  let token = null;
  let st: StatusFile = {};
  try {
    token = fs.readFileSync(f.tokenFile, "utf8").trim();
    st = JSON.parse(fs.readFileSync(f.statusFile, "utf8"));
  } catch {
    /* no running bridge known */
  }
  if (token) {
    const port = opts.port ?? st.port ?? DEFAULT_PORT;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/control/unpair-all`, { method: "POST", headers: { "x-bridge-control": token } });
      if (res.ok) return done(((await res.json()) as { removed?: number }).removed ?? 0);
      return { ok: false, message: `The bridge on port ${port} did not clear the pairings (${res.status}). Is it the current one? ${hintStatus(opts, deps)}` };
    } catch {
      /* not answering: clear the file below */
    }
  }
  resetAccessFile(f.stateDir); // no bridge answered: the saved mode becomes folder here
  let n = 0;
  try {
    n = JSON.parse(fs.readFileSync(f.pairingsFile, "utf8")).pairings.length;
  } catch {
    /* none */
  }
  try {
    if (fs.existsSync(f.pairingsFile)) fs.writeFileSync(f.pairingsFile, JSON.stringify({ version: 1, pairings: [] }), { mode: 0o600 });
  } catch (e) {
    return { ok: false, message: `Could not clear ${f.pairingsFile}: ${(e as ErrLike).message}` };
  }
  return done(n);
}

export async function serviceStatus(opts: CliOptions, deps: ServiceDeps): Promise<ServiceResult> {
  const lbl = badLabel(opts);
  if (lbl) return lbl;
  if ((deps.platform ?? process.platform) === "win32") return statusWindows(opts, deps);
  const f = serviceFiles(opts, deps.home);
  const lines = [];
  const installed = fs.existsSync(f.plist);
  lines.push(`Installed:  ${installed ? `yes (${f.plist})` : "no"}`);
  const r = await deps.launchctl(["print", `gui/${deps.uid}/${opts.label}`]);
  const pid = /\bpid = (\d+)/.exec(r.out)?.[1];
  lines.push(`Loaded:     ${r.code === 0 ? (pid ? `yes, running (pid ${pid})` : "yes, not running right now") : "no"}`);
  let st: StatusFile | null = null;
  try {
    st = JSON.parse(fs.readFileSync(f.statusFile, "utf8"));
  } catch {
    /* none yet */
  }
  const port = opts.port ?? st?.port ?? DEFAULT_PORT;
  if (st) {
    lines.push(`Last start: ${st.ok ? `ok at ${st.at}` : `FAILED at ${st.at}: ${st.reason}`}`);
    lines.push(`Billing:    ${st.ok ? st.billing : "not running: the subscription check failed, so no turn can run (never an API key)"}`);
  } else lines.push("Last start: none recorded");
  let answering = false;
  try {
    const h = await fetch(`http://127.0.0.1:${port}/v1/hello`, { signal: AbortSignal.timeout(3000) });
    answering = h.ok;
  } catch {
    /* not up */
  }
  lines.push(`Answering:  ${answering ? `yes, http://127.0.0.1:${port}` : `no (port ${port})`}`);
  lines.push(`Log:        ${f.logFile}`);
  return { ok: true, message: lines.join("\n") };
}

// ---- always-on service (Windows) ---------------------------------------------------------------------------------------
// How it works, in one place:
//   * Start at login, no admin: one value under HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run (per user; the
//     machine-wide keys are not touched). It runs wscript.exe on a tiny JScript file that starts `node bridge.mjs --supervise`
//     with its window hidden (WshShell.Run, window style 0). wscript.exe has no console window of its own, and node's console is hidden.
//   * Restart if it stops: `--supervise` runs the real bridge as a child and starts it again with a growing wait.
//   * Everything the install makes: that one Run value, the launcher file and the log under %LOCALAPPDATA%\gilb-claude-code-bridge,
//     and (while running) supervisor.json and supervisor.stop in the state folder. --uninstall removes all of them.

export const WIN_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
/** The exit code of a bridge that found its port taken. The supervisor stops on it instead of looping. */
export const EXIT_PORT_IN_USE = 98;
/** Waits before each restart: 1 s, 2 s, 5 s, then 30 s. */
export const SUPERVISOR_DELAYS_MS = [1000, 2000, 5000, 30000];
/** A bridge that ran this long counts as healthy: the next stop starts the waits again from 1 s. */
export const SUPERVISOR_STABLE_MS = 5 * 60 * 1000;
/** A Run value is a command line of at most 260 characters (Microsoft Learn: "Run and RunOnce Registry Keys"). */
const RUN_VALUE_MAX = 260;
const LOG_ROTATE_BYTES = 5 * 1024 * 1024;

const realServiceFs: ServiceFs = {
  mkdirp: (p) => void fs.mkdirSync(p, { recursive: true }),
  write: (p, data) => fs.writeFileSync(p, data),
  read: (p) => fs.readFileSync(p, "utf8"),
  exists: (p) => fs.existsSync(p),
  rm: (p) => fs.rmSync(p, { force: true }),
  list: (p) => {
    try {
      return fs.readdirSync(p);
    } catch {
      return [];
    }
  },
  rmdirIfEmpty: (p) => {
    try {
      fs.rmdirSync(p); // refuses a folder that holds anything
    } catch {
      /* not empty or not there */
    }
  },
};

/** Runs a program with an argument list. No shell: nothing is ever parsed by cmd.exe or PowerShell. */
export function runExec(file: string, args: string[], o: { detached?: boolean } = {}): Promise<LaunchctlResult> {
  return new Promise((resolve) => {
    if (o.detached) {
      // Starting something that outlives us: no pipes to it, so nothing it starts can hold this command open. Done when the starter exits.
      const c = spawn(file, args, { stdio: "ignore", windowsHide: true });
      c.once("error", (e) => resolve({ code: 1, out: e.message }));
      c.once("exit", (code) => resolve({ code: code ?? 1, out: "" }));
      return;
    }
    execFile(file, args, { windowsHide: true }, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: `${stdout}${stderr}`.trim() }));
  });
}

export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as ErrLike).code === "EPERM";
  }
}

async function realHello(port: number): Promise<{ bridge?: string; build?: string } | null> {
  try {
    const h = await fetch(`http://127.0.0.1:${port}/v1/hello`, { signal: AbortSignal.timeout(2000) });
    return h.ok ? ((await h.json()) as { bridge?: string; build?: string }) : null;
  } catch {
    return null;
  }
}

/** One argument as the Windows C runtime reads it back (what reg.exe, node and wscript all use). */
export function winQuoteArg(a: string): string {
  if (a !== "" && !/[\s"]/.test(a)) return a;
  let r = '"';
  let bs = 0;
  for (const ch of a) {
    if (ch === "\\") {
      bs++;
    } else if (ch === '"') {
      r += `${"\\".repeat(bs * 2 + 1)}"`;
      bs = 0;
    } else {
      r += `${"\\".repeat(bs)}${ch}`;
      bs = 0;
    }
  }
  return `${r}${"\\".repeat(bs * 2)}"`;
}
export const winCommandLine = (args: string[]) => args.map(winQuoteArg).join(" ");

/** A JScript string literal. JSON is one, except that U+2028 and U+2029 end a line in JScript. */
const jsString = (t: string) => JSON.stringify(t).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** Where everything lives. `P` is path.win32 on Windows (and in the tests that pretend to be Windows). */
export function serviceFilesWin(opts: CliOptions, home: string, platform: string, env: NodeJS.ProcessEnv) {
  const P = platform === "win32" ? path.win32 : path;
  // Each label has its own state folder (token, status, pairings, supervisor and stop files): two installs never share one.
  const stateDir = opts.stateDir ? P.resolve(opts.stateDir) : P.join(home, opts.label === DEFAULT_LABEL ? ".gilb-claude-code-bridge" : `.gilb-claude-code-bridge-${opts.label}`);
  const localDir = P.join(env.LOCALAPPDATA ?? P.join(home, "AppData", "Local"), "gilb-claude-code-bridge");
  const sys32 = P.join(env.SystemRoot ?? env.windir ?? "C:\\Windows", "System32");
  return {
    P,
    stateDir,
    localDir,
    launcher: P.join(localDir, `start-${opts.label}.js`),
    logFile: P.join(localDir, opts.label === DEFAULT_LABEL ? "bridge.log" : `${opts.label}.log`),
    supervisorFile: P.join(stateDir, "supervisor.json"),
    stopFile: P.join(stateDir, "supervisor.stop"),
    ownerFile: P.join(stateDir, "service-owner.json"),
    statusFile: P.join(stateDir, "status.json"),
    wscript: P.join(sys32, "wscript.exe"),
    reg: P.join(sys32, "reg.exe"),
  };
}
type WinFiles = ReturnType<typeof serviceFilesWin>;

/** The command line the Run value holds, and the arguments for starting the same thing right now. */
const wscriptArgs = (f: WinFiles) => ["//B", "//Nologo", "//E:JScript", f.launcher];
const runValue = (f: WinFiles) => winCommandLine([f.wscript, ...wscriptArgs(f)]);

/** The first line of every launcher this bridge writes. --uninstall touches only a launcher that has it. */
const LAUNCHER_MARK = "// Written by `node bridge.mjs --install` for the Gilb Claude Code bridge. `--uninstall` removes it.";
/** A launcher file is UTF-16; read as text it has NULs between the letters. */
const plainText = (raw: unknown) => String(raw).replace(/\0/g, "").replace(/\ufeff|\ufffd/g, "");
const isOurLauncher = (raw: unknown) => plainText(raw).includes(LAUNCHER_MARK);

function launcherText(f: WinFiles, command: string[]): string {
  return [
    LAUNCHER_MARK,
    "// Starts the bridge supervisor with no window (window style 0). It decides nothing and reads nothing.",
    'var sh = new ActiveXObject("WScript.Shell");',
    `sh.CurrentDirectory = ${jsString(f.stateDir)};`,
    `sh.Run(${jsString(winCommandLine(command))}, 0, false);`,
    "",
  ].join("\r\n");
}
/** UTF-16 with a byte order mark: Windows Script Host reads any user name in it correctly. */
const utf16 = (t: string) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(t, "utf16le")]);

const psSingle = (t: string) => `'${t.replace(/'/g, "''")}'`;

function readJson<T>(sfs: ServiceFs, p: string): T | null {
  try {
    return JSON.parse(sfs.read(p)) as T;
  } catch {
    return null;
  }
}

/** What a running supervisor keeps in supervisor.json. */
interface SupervisorRecord { pid?: number; instance?: string; label?: string; at?: string; beat?: number; child?: number }
/** The supervisor rewrites its record this often (its "I am alive" beat). */
export const SUPERVISOR_BEAT_MS = 1000;
/** A beat this young is trusted at once; an older one is looked at again after SUPERVISOR_RECHECK_MS. */
const BEAT_FRESH_MS = 3500;
const SUPERVISOR_RECHECK_MS = 1600;

/**
 * Is the supervisor named in supervisor.json really running? A bare pid proves nothing: Windows reuses pids, and the file stays
 * behind after a crash or a power cut. So the pid must be alive AND the record must be beating: its `beat` time is recent, or it
 * changes within a moment. Only a running supervisor rewrites it. Anything else is stale (null), and the caller replaces it.
 */
export async function liveSupervisor(read: (p: string) => string, file: string, alive: (pid: number) => boolean, sleep: (ms: number) => Promise<unknown>, now: () => number): Promise<SupervisorRecord | null> {
  const get = async (): Promise<SupervisorRecord | null> => {
    for (let i = 0; i < 2; i++) {
      try {
        const r = JSON.parse(read(file)) as SupervisorRecord | null;
        return r && typeof r === "object" ? r : null;
      } catch {
        if (i === 0) await sleep(100); // a rewrite in progress, or no file
      }
    }
    return null;
  };
  const r = await get();
  if (!r || !Number.isInteger(r.pid) || typeof r.instance !== "string" || typeof r.beat !== "number" || !alive(r.pid!)) return null;
  if (Math.abs(now() - r.beat) < BEAT_FRESH_MS) return r;
  await sleep(SUPERVISOR_RECHECK_MS);
  const r2 = await get();
  return r2 && r2.pid === r.pid && r2.instance === r.instance && r2.beat !== r.beat && alive(r.pid!) ? r2 : null;
}

const depsClock = (deps: ServiceDeps) => ({
  alive: deps.alive ?? pidAlive,
  sleep: deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))),
  now: deps.now ?? Date.now,
});

/** Asks this label's running supervisor to stop (a marker file it polls), waits for it to go. Never force-kills a pid. A record that is not a live supervisor is stale and is removed; another label's supervisor is left alone. */
async function stopSupervisor(f: WinFiles, deps: ServiceDeps, sfs: ServiceFs, label: string): Promise<{ wasRunning: boolean; stillRunning: number | null; foreign?: string }> {
  const { alive, sleep, now } = depsClock(deps);
  const sup = await liveSupervisor((p) => String(sfs.read(p)), f.supervisorFile, alive, sleep, now);
  if (!sup) {
    sfs.rm(f.supervisorFile);
    sfs.rm(f.stopFile);
    return { wasRunning: false, stillRunning: null };
  }
  if (sup.label !== label) return { wasRunning: false, stillRunning: null, foreign: sup.label ?? "another install" };
  sfs.write(f.stopFile, String(Date.now()));
  for (let i = 0; i < 80 && alive(sup.pid!); i++) await sleep(250); // 20 s
  if (alive(sup.pid!)) return { wasRunning: true, stillRunning: sup.pid! };
  sfs.rm(f.supervisorFile);
  sfs.rm(f.stopFile);
  return { wasRunning: true, stillRunning: null };
}

/** Another label's install that uses this port, found from its launcher file. */
function labelOnPort(f: WinFiles, sfs: ServiceFs, label: string, port: number): string | null {
  for (const name of sfs.list?.(f.localDir) ?? []) {
    const m = /^start-(.+)\.js$/i.exec(name);
    if (!m || m[1] === label) continue;
    let text = "";
    try {
      text = plainText(sfs.read(f.P.join(f.localDir, name)));
    } catch {
      continue;
    }
    if (!text.includes(LAUNCHER_MARK)) continue;
    if (new RegExp(`--port ${port}(?![0-9])`).test(text)) return m[1]!;
  }
  return null;
}

async function installWindows(opts: CliOptions, deps: ServiceDeps, ctx: { claudeBin: string; port: number; extraOrigins: string[] }): Promise<ServiceResult> {
  const { home, nodePath, file, env } = deps;
  const { claudeBin, port, extraOrigins } = ctx;
  const sfs = deps.sfs ?? realServiceFs;
  const exec = deps.exec ?? runExec;
  const { alive, sleep, now } = depsClock(deps);
  const hello = deps.hello ?? realHello;
  const f = serviceFilesWin(opts, home, "win32", env);
  // A % in a path would be expanded by Windows inside the command; refuse rather than start the wrong file.
  const bad = [nodePath, file, claudeBin, f.stateDir, f.launcher].find((p) => p.includes("%"));
  if (bad) return { ok: false, message: `Not installed.\nThe path ${bad} contains a % sign, which Windows would expand inside the start-up command. Move the file to a folder without one.` };
  const base = ["--port", String(port), "--claude", claudeBin, "--state-dir", f.stateDir];
  for (const o of extraOrigins) base.push("--allow-origin", o);
  if (opts.workspace) base.push("--workspace", opts.workspace);
  const stateBadW = stateDirProblem(f.stateDir, opts.workspace, home, "win32");
  if (stateBadW) return { ok: false, message: `Not installed.\n${stateBadW}` };
  const value = runValue(f);
  if (value.length > RUN_VALUE_MAX) return { ok: false, message: `Not installed.\nThe start-up command would be ${value.length} characters; Windows allows ${RUN_VALUE_MAX} in a Run entry. Use a shorter --label.` };

  // One label, one state folder, one port. Refuse before anything is stopped or written.
  const owner = readJson<{ label?: string }>(sfs, f.ownerFile);
  if (owner?.label && owner.label !== opts.label) return { ok: false, message: `Not installed.\nThe state folder ${f.stateDir} belongs to the install "${owner.label}". Each --label needs its own --state-dir (leave --state-dir out and it gets its own).` };
  const clash = labelOnPort(f, sfs, opts.label, port);
  if (clash) return { ok: false, message: `Not installed.\nPort ${port} is already used by the install "${clash}". Give this one its own --port, or remove the other first:  node ${commandPathForPerson(file, home, "win32")} --uninstall --label ${clash}` };

  const prev = await stopSupervisor(f, deps, sfs, opts.label); // installing again restarts on the new file
  if (prev.foreign) return { ok: false, message: `Not installed.\nThe state folder ${f.stateDir} is in use by the install "${prev.foreign}". Each --label needs its own --state-dir.` };
  if (prev.stillRunning) return { ok: false, message: `Not installed.\nThe bridge started by an earlier install (process ${prev.stillRunning}) did not stop within 20 seconds. End it in Task Manager (Details tab), then run --install again.` };
  sfs.rm(f.stopFile);
  sfs.mkdirp(f.stateDir);
  // The saved access mode goes through the real file helpers; a test's fake service files get a plain write instead (no real folder is made for a pretend Windows path).
  const winFile = path.win32.join(f.stateDir, ACCESS_FILE);
  const winSaved = (): "computer" | "folder" | null => {
    if (!sfs.exists(winFile)) return null;
    try { const v = JSON.parse(sfs.read(winFile)) as { version?: unknown; mode?: unknown }; return v.version === 1 && v.mode === "computer" ? "computer" : "folder"; } catch { return "folder"; }
  };
  if (deps.sfs) {
    if (opts.access === "folder") sfs.write(winFile, JSON.stringify({ version: 1, mode: "folder", at: new Date().toISOString() }));
    else if (opts.access === undefined && opts.fullAccess && winSaved() === null) sfs.write(winFile, JSON.stringify({ version: 1, mode: "computer", at: new Date().toISOString() }));
  } else {
    const accessSet = applyAccessFlag(f.stateDir, opts.access);
    if (!accessSet.ok) return { ok: false, message: `Not installed.\n${accessSet.message}` };
    if (opts.access === undefined) seedAccessFile(f.stateDir, opts.fullAccess, "win32");
  }
  sfs.mkdirp(f.localDir);
  sfs.write(f.ownerFile, JSON.stringify({ label: opts.label }));
  // The log shows the pairing code. It sits under %LOCALAPPDATA%, inside the user's own profile folder, whose default access rights
  // (inherited, not changed here) give it to this user, SYSTEM and Administrators only.
  if (!sfs.exists(f.logFile)) sfs.write(f.logFile, "");
  sfs.write(f.launcher, utf16(launcherText(f, [nodePath, file, "--supervise", ...base, "--label", opts.label])));
  const add = await exec(f.reg, ["add", WIN_RUN_KEY, "/v", opts.label, "/t", "REG_SZ", "/d", value, "/f"]);
  if (add.code !== 0) {
    sfs.rm(f.launcher);
    return { ok: false, message: `Not installed. Windows would not add the start-up entry: ${add.out || `exit ${add.code}`}` };
  }
  // Start it now the way login will: the same wscript command, no logout needed.
  const started = await exec(f.wscript, wscriptArgs(f), { detached: true });
  if (started.code !== 0) return { ok: false, message: `The start-up entry is installed, but Windows Script Host did not start the bridge: ${started.out || `exit ${started.code}`}\nIt may be switched off on this computer. See ${f.logFile}` };
  let up: { bridge?: string; build?: string } | null = null;
  let supervised = false;
  let ours = false;
  for (let i = 0; i < 80; i++) {
    up = await hello(port);
    const sup = await liveSupervisor((p) => String(sfs.read(p)), f.supervisorFile, alive, sleep, now);
    supervised = !!sup && sup.label === opts.label;
    // What answers is THIS install's bridge only if it is the child this supervisor started: the bridge writes status.json with its own pid after it binds the port.
    const st = readJson<StatusFile>(sfs, f.statusFile);
    ours = !!(up && supervised && sup!.child && st?.ok && st.pid === sup!.child && alive(st.pid));
    if (ours) break;
    if (up && !supervised && i >= 12) break; // something else holds the port and our supervisor has given up
    await sleep(250);
  }
  const me = opts.stateDir ? ` --state-dir ${psSingle(f.stateDir)}` : "";
  const flags = `${opts.label === DEFAULT_LABEL ? "" : ` --label ${opts.label}`}${me}`;
  const cmd = commandPathForPerson(file, home, "win32");
  if (up && !ours) {
    return { ok: false, message: `The start-up entry is installed, but another bridge already holds port ${port} and the installed one gave way (it never runs two).\n  Close that bridge (a PowerShell window running it, or its node.exe in Task Manager; for another install, run its --uninstall --label), then run:  node ${cmd} --install${flags}` };
  }
  if (!up) return { ok: false, message: `The start-up entry is installed, but the bridge did not answer on port ${port} within 20 seconds.\n  Read the log:  Get-Content ${psSingle(f.logFile)} -Tail 30` };
  return {
    ok: true,
    message: `Always-on bridge installed (${opts.label}). It starts when you log in and restarts if it stops.
  Billing: Claude subscription (checked at every start; never an API key)
  Log:     ${f.logFile}
  Get your pairing code:  node ${cmd} --code${flags}
  Check it:               node ${cmd} --status${flags}
  Remove it:              node ${cmd} --uninstall${flags}
  If a bridge is already running in a PowerShell window, close that window: only one can hold port ${port}.${deps.sfs ? (winSaved() === "computer" ? `\n  ${FULL_ACCESS_NOTICE_WINDOWS}` : winSaved() === "folder" && opts.fullAccess && opts.access !== "folder" ? `\n  ${FULL_ACCESS_SAVED_FOLDER_NOTICE}` : "") : installAccessNotice(f.stateDir, opts, "win32")}`,
  };
}

async function uninstallWindows(opts: CliOptions, deps: ServiceDeps): Promise<ServiceResult> {
  const sfs = deps.sfs ?? realServiceFs;
  const exec = deps.exec ?? runExec;
  const f = serviceFilesWin(opts, deps.home, "win32", deps.env);
  const q = await exec(f.reg, ["query", WIN_RUN_KEY, "/v", opts.label]);
  // Ours only if the entry holds exactly the command this bridge writes for this label, or the launcher carries the bridge's mark.
  const entryOurs = q.code === 0 && q.out.includes(runValue(f));
  let launcherOurs = false;
  try {
    launcherOurs = sfs.exists(f.launcher) && isOurLauncher(sfs.read(f.launcher));
  } catch {
    /* unreadable: not ours */
  }
  if (q.code === 0 && !entryOurs && !launcherOurs) {
    return { ok: false, message: `A start-up entry named ${opts.label} exists, but this bridge did not make it (its command is not the bridge's). It was left alone. Remove it yourself if you want it gone.` };
  }
  const had = entryOurs || launcherOurs;
  // Entry first, so nothing starts it again while it is being stopped.
  if (entryOurs) {
    const d = await exec(f.reg, ["delete", WIN_RUN_KEY, "/v", opts.label, "/f"]);
    if (d.code !== 0) return { ok: false, message: `Windows would not remove the start-up entry ${opts.label}: ${d.out || `exit ${d.code}`}` };
  }
  const stop = await stopSupervisor(f, deps, sfs, opts.label);
  clearAccessFile(f.stateDir); // uninstall puts the mode back to folder (no saved mode)
  if (stop.stillRunning) return { ok: false, message: `The start-up entry is removed, but the bridge (process ${stop.stillRunning}) did not stop within 20 seconds. End it in Task Manager (Details tab).` };
  if (had) {
    sfs.rm(f.launcher);
    sfs.rm(f.logFile);
    sfs.rm(`${f.logFile}.1`);
    const owner = readJson<{ label?: string }>(sfs, f.ownerFile);
    if (owner?.label === opts.label) sfs.rm(f.ownerFile);
    sfs.rmdirIfEmpty(f.localDir);
  }
  return {
    ok: true,
    message: had || stop.wasRunning ? `Removed ${opts.label}. The bridge no longer starts at login${stop.wasRunning ? " and has been stopped" : ""}. Your pairings in ${f.stateDir} are kept.` : `${opts.label} was not installed.`,
  };
}

async function statusWindows(opts: CliOptions, deps: ServiceDeps): Promise<ServiceResult> {
  const sfs = deps.sfs ?? realServiceFs;
  const exec = deps.exec ?? runExec;
  const { alive, sleep, now } = depsClock(deps);
  const hello = deps.hello ?? realHello;
  const f = serviceFilesWin(opts, deps.home, "win32", deps.env);
  const lines = [];
  const entry = (await exec(f.reg, ["query", WIN_RUN_KEY, "/v", opts.label])).code === 0;
  const installed = entry && sfs.exists(f.launcher);
  lines.push(`Installed:  ${installed ? `yes (start-up entry ${opts.label})` : entry ? "damaged: the start-up entry is there but its launcher file is missing; run --install again" : "no"}`);
  // Only a live supervisor of THIS label counts; a stale file, or another label's supervisor, is "no".
  const rec = await liveSupervisor((p) => String(sfs.read(p)), f.supervisorFile, alive, sleep, now);
  const sup = rec && rec.label === opts.label ? rec : null;
  const st = readJson<StatusFile>(sfs, f.statusFile);
  const bridgePid = sup && st?.pid && st.pid === sup.child && alive(st.pid) ? st.pid : null;
  lines.push(`Running:    ${sup ? `yes (supervisor pid ${sup.pid}${bridgePid ? `, bridge pid ${bridgePid}` : ", bridge restarting"})` : "no"}`);
  const port = opts.port ?? st?.port ?? DEFAULT_PORT;
  if (st) {
    lines.push(`Last start: ${st.ok ? `ok at ${st.at}` : `FAILED at ${st.at}: ${st.reason}`}`);
    lines.push(`Billing:    ${st.ok ? st.billing : "not running: the subscription check failed, so no turn can run (never an API key)"}`);
  } else lines.push("Last start: none recorded");
  const h = await hello(port);
  lines.push(`Answering:  ${h ? (bridgePid ? `yes, http://127.0.0.1:${port}${h.build ? ` (build ${h.build})` : ""}` : `no (something else answers on port ${port}; it is not this install's bridge)`) : `no (port ${port})`}`);
  lines.push(`Log:        ${f.logFile}`);
  return { ok: true, message: lines.join("\n") };
}

// ---- the supervisor (`--supervise`): the thing the login item runs --------------------------------------------------------
export interface SupervisedChild {
  pid?: number | undefined;
  exited: Promise<{ code: number | null; signal: string | null }>;
  kill(): Promise<void>;
}
export interface SuperviseLoopOpts {
  spawnChild: () => SupervisedChild;
  now: () => number;
  sleep: (ms: number) => Promise<unknown>;
  /** Resolves when the supervisor must stop (uninstall, Ctrl+C, shutdown). */
  stop: Promise<void>;
  log: (line: string) => void;
}

/** Runs the bridge as a child and starts it again when it ends: after 1 s, 2 s, 5 s, then 30 s. A bridge that stayed up for 5 minutes starts the waits over. Never two bridges: a child that found the port taken ends the loop. */
export async function superviseLoop(o: SuperviseLoopOpts): Promise<"stopped" | "port-in-use"> {
  let stopped = false;
  void o.stop.then(() => {
    stopped = true;
  });
  let fails = 0;
  while (!stopped) {
    const t0 = o.now();
    const child = o.spawnChild();
    o.log(`bridge started (pid ${child.pid ?? "?"})`);
    const r = await Promise.race([child.exited.then((e) => ({ e })), o.stop.then(() => null)]);
    if (r === null) {
      o.log("stop requested; ending the bridge");
      await child.kill();
      return "stopped";
    }
    const upMs = o.now() - t0;
    if (r.e.code === EXIT_PORT_IN_USE) {
      o.log(`the bridge found port taken (exit ${EXIT_PORT_IN_USE}): another bridge is running. Not starting a second one; the supervisor ends here.`);
      return "port-in-use";
    }
    fails = upMs >= SUPERVISOR_STABLE_MS ? 1 : fails + 1;
    const delay = SUPERVISOR_DELAYS_MS[Math.min(fails - 1, SUPERVISOR_DELAYS_MS.length - 1)]!;
    o.log(`bridge stopped (${r.e.code === null ? `signal ${r.e.signal ?? "none"}` : `exit ${r.e.code}`}) after ${Math.round(upMs / 1000)} s; starting it again in ${delay / 1000} s`);
    const w = await Promise.race([o.sleep(delay).then(() => "slept"), o.stop.then(() => "stop")]);
    if (w === "stop") return "stopped";
  }
  return "stopped";
}

export interface SuperviseIo {
  home?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string;
  /** The bridge file to run as the child. */
  file?: string;
  alive?: (pid: number) => boolean;
  spawnChild?: () => SupervisedChild;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
  /** How often the stop marker is looked for. */
  pollMs?: number;
  /** How often supervisor.json is rewritten with a new beat. */
  beatMs?: number;
  /** Real runs only: Ctrl+C, SIGTERM and Ctrl+Break also stop it. */
  signals?: boolean;
}

/** `--supervise`: one supervisor per state folder; stops when supervisor.stop appears. Its own lines and the bridge's output go to the log. */
export async function runSupervisor(cli: CliOptions, io: SuperviseIo = {}): Promise<"stopped" | "port-in-use" | "already-running"> {
  const home = io.home ?? os.homedir();
  const env = io.env ?? process.env;
  const platform = io.platform ?? process.platform;
  const f = serviceFilesWin(cli, home, platform, env);
  const alive = io.alive ?? pidAlive;
  const log = (line: string) => {
    try {
      fs.appendFileSync(f.logFile, `${new Date().toISOString()} supervisor: ${line}\n`);
    } catch {
      /* no log is not a reason to stop */
    }
  };
  fs.mkdirSync(f.localDir, { recursive: true });
  fs.mkdirSync(f.stateDir, { recursive: true, mode: 0o700 });
  // One supervisor per state folder. A record is trusted only while its owner is alive AND beating (see liveSupervisor); any other is replaced.
  const sleepFn = io.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const clock = io.now ?? Date.now;
  const instance = crypto.randomUUID();
  let childPid: number | undefined;
  const record = () => JSON.stringify({ pid: process.pid, instance, label: cli.label, at: startedAt, beat: clock(), child: childPid });
  const startedAt = new Date().toISOString();
  for (let tries = 0; ; tries++) {
    try {
      fs.writeFileSync(f.supervisorFile, record(), { flag: "wx", mode: 0o600 });
      break;
    } catch (e) {
      if ((e as ErrLike).code !== "EEXIST" || tries > 2) throw e;
      const other = await liveSupervisor((p) => fs.readFileSync(p, "utf8"), f.supervisorFile, alive, sleepFn, clock);
      if (other && other.pid !== process.pid) {
        log(`another supervisor (pid ${other.pid}) is already running; this one ends`);
        return "already-running";
      }
      fs.rmSync(f.supervisorFile, { force: true });
    }
  }
  let finish: () => void = () => {};
  const stop = new Promise<void>((resolve) => (finish = resolve));
  const timer = setInterval(() => {
    if (fs.existsSync(f.stopFile)) finish();
  }, io.pollMs ?? 500);
  // The beat: proves to --install / --status / the next supervisor that this one is running, not just a pid some other process now has.
  const beat = () => {
    try {
      let cur: SupervisorRecord | null = null;
      try {
        cur = JSON.parse(fs.readFileSync(f.supervisorFile, "utf8"));
      } catch (e) {
        if ((e as ErrLike).code !== "ENOENT") return; // being rewritten: next beat
      }
      if (cur && cur.instance !== instance) {
        log("supervisor.json now belongs to another supervisor; this one ends");
        finish();
        return;
      }
      const tmp = `${f.supervisorFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, record(), { mode: 0o600 });
      fs.renameSync(tmp, f.supervisorFile);
    } catch {
      /* a missed beat is not a reason to stop */
    }
  };
  const beatTimer = setInterval(beat, io.beatMs ?? SUPERVISOR_BEAT_MS);
  const onSignal = () => finish();
  const sigs: NodeJS.Signals[] = platform === "win32" ? ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"] : ["SIGINT", "SIGTERM"];
  if (io.signals) for (const s of sigs) process.on(s, onSignal);

  const bridgeFile = io.file ?? fs.realpathSync(fileURLToPath(import.meta.url));
  const childArgs = ["--port", String(cli.port ?? DEFAULT_PORT), "--claude", cli.claude ?? "claude", "--state-dir", f.stateDir];
  for (const o of cli.allowOrigins ?? []) childArgs.push("--allow-origin", o);
  if (cli.workspace) childArgs.push("--workspace", cli.workspace);
  const realSpawn = (): SupervisedChild => {
    try {
      if (fs.statSync(f.logFile).size > LOG_ROTATE_BYTES) fs.renameSync(f.logFile, `${f.logFile}.1`); // no child holds it now
    } catch {
      /* no log yet */
    }
    const fd = fs.openSync(f.logFile, "a");
    const c = spawn(process.execPath, [bridgeFile, ...childArgs], { stdio: ["ignore", fd, fd], windowsHide: true, env: { ...env, GILB_BRIDGE_SUPERVISOR_PID: String(process.pid), GILB_BRIDGE_SUPERVISED: "1" } });
    fs.closeSync(fd);
    const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      c.once("exit", (code, signal) => resolve({ code, signal }));
      c.once("error", (e) => {
        log(`could not start the bridge: ${e.message}`);
        resolve({ code: null, signal: null });
      });
    });
    return { pid: c.pid, exited, kill: () => killChild(c, env) };
  };
  log(`supervisor started (pid ${process.pid}), bridge file ${bridgeFile}`);
  try {
    const result = await superviseLoop({
      spawnChild: () => {
        const c = (io.spawnChild ?? realSpawn)();
        childPid = c.pid;
        beat();
        return c;
      },
      now: io.now ?? Date.now,
      sleep: io.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      stop,
      log,
    });
    log(`supervisor ends (${result})`);
    return result;
  } finally {
    clearInterval(timer);
    clearInterval(beatTimer);
    if (io.signals) for (const s of sigs) process.off(s, onSignal);
    try {
      if ((JSON.parse(fs.readFileSync(f.supervisorFile, "utf8")) as SupervisorRecord).instance === instance) fs.rmSync(f.supervisorFile, { force: true });
    } catch {
      /* already gone */
    }
  }
}

/**
 * True for a node path that will not last: fnm's per-terminal link (`fnm_multishells`, either separator) or anything under the temp folder.
 * Recording one in the login item breaks it once that folder is cleaned up.
 */
export function isEphemeralNodePath(p: string): boolean {
  if (/[\\/]fnm_multishells[\\/]/.test(p)) return true;
  const tmp = path.resolve(os.tmpdir());
  const r = path.resolve(p);
  return r === tmp || r.startsWith(tmp + path.sep);
}

/**
 * The node to record in the plist: the name on the person's PATH (survives a brew upgrade) when it is this very node and will last,
 * else this node's own path. fnm's per-terminal multishell link is never recorded.
 */
export function stableNodePath(t: { named?: string | null; execPath?: string; realpath?: (p: string) => string } = {}) {
  const named = t.named !== undefined ? t.named : resolveBin("node");
  const execPath = t.execPath ?? process.execPath;
  const realpath = t.realpath ?? ((p: string) => fs.realpathSync(p));
  try {
    if (named && !isEphemeralNodePath(named) && realpath(named) === realpath(execPath)) return named;
  } catch {
    /* fall through */
  }
  return execPath;
}

// ---- command line ----------------------------------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  // --selftest comes before anything else: the update checks the new file with it. It opens no port, reads no state, starts nothing.
  if (argv.includes("--selftest")) {
    console.log(`build ${BRIDGE_BUILD}`);
    process.exit(0);
  }
  if (argv.includes("--rollback")) {
    const r = rollbackBridge(fs.realpathSync(fileURLToPath(import.meta.url)));
    (r.ok ? console.log : console.error)(r.message);
    process.exit(r.ok ? 0 : 1);
  }
  const cli = parseCli(argv);
  if (cli.mode === "help") {
    console.log(`Usage: node bridge.mjs [--port N] [--claude PATH] [--allow-origin ORIGIN]... [--state-dir DIR] [--workspace FOLDER] [--full-access] [--access folder]
       node bridge.mjs --install | --uninstall | --status | --code | --unpair-all | --access-reset   (${process.platform === "win32" ? "Windows: starts at login with no window, through a per-user Run entry" : "macOS: an always-on LaunchAgent"}; add --label L to use another label)
       node bridge.mjs --selftest   prints the build number and exits (the app's update uses it to check a new file)
       node bridge.mjs --rollback   puts the previous bridge file (kept as <file>.prev by an update) back; restart the bridge after it
       --full-access only sets the first value: once this computer has a saved mode, the saved mode wins. The access switch in GilbApp changes it (turning it on opens a window here that you must allow). --access folder turns full access off; --access computer is refused.
       --label L: letters, digits, dot, dash, underscore, 1 to 64 characters.${process.platform === "win32" ? `
       Windows: a second --label is a separate install (own state folder, log, launcher, start-up entry) and needs its own --port.` : ""}`);
    return;
  }
  // A misspelled option (--allow-orgin) must not be quietly ignored: the bridge would start without what the person asked for.
  const KNOWN = new Set(["--port", "--claude", "--allow-origin", "--state-dir", "--workspace", "--full-access", "--access", "--label", "--install", "--uninstall", "--status", "--code", "--unpair-all", "--access-reset", "--supervise", "--selftest", "--rollback", "--help", "-h"]);
  const unknown = argv.filter((a) => a.startsWith("-") && !KNOWN.has(a.split("=")[0]!));
  if (unknown.length > 0) {
    console.error(`Unknown option: ${unknown.join(" ")}\nOptions: --port, --claude, --allow-origin, --state-dir, --workspace, --full-access, --access, --label, --install, --uninstall, --status, --code, --unpair-all, --access-reset, --selftest, --rollback, --help`);
    process.exit(2);
  }
  const accessBad = accessFlagProblem(cli.access);
  if (accessBad) {
    console.error(accessBad);
    process.exit(2);
  }
  if (cli.modes.length > 1) {
    console.error(`Use one of ${cli.modes.join(", ")} at a time.`);
    process.exit(2);
  }
  const home = os.homedir();
  const platform = process.platform;
  const deps = {
    platform,
    launchctl: runLaunchctl,
    uid: process.getuid?.() ?? 0,
    home,
    nodePath: stableNodePath(),
    file: fs.realpathSync(fileURLToPath(import.meta.url)),
    env: process.env,
    log: () => {},
  };
  if ((cli.mode === "supervise" || cli.mode === "run") && cli.fullAccess) {
    const line = migrateServiceFlag(cli, home, platform, process.env);
    if (line) console.log(`  ${line}`);
  }
  if (cli.mode === "supervise") {
    const r = await runSupervisor(cli, { home, env: process.env, platform, signals: true });
    process.exit(r === "port-in-use" ? 1 : 0);
  }
  if (cli.mode !== "run") {
    const fn = { install: serviceInstall, uninstall: serviceUninstall, status: serviceStatus, code: fetchCode, unpairAll, accessReset }[cli.mode];
    const out = await fn!(cli, deps);
    (out.ok ? console.log : console.error)(out.message);
    process.exit(out.ok ? 0 : 1);
  }

  const claudeBin = cli.claude ?? "claude";
  const port = cli.port ?? DEFAULT_PORT;
  const extra = cli.allowOrigins ?? [];
  let allowedOrigins;
  try {
    allowedOrigins = loadAllowedOrigins(extra);
  } catch (e) {
    console.error(`\n${(e as ErrLike).message}\n`);
    process.exit(2);
  }
  const f = serviceFiles(cli, home);
  const accessSet = applyAccessFlag(f.stateDir, cli.access); // --access folder always wins, before the bridge reads the saved mode
  if (!accessSet.ok) {
    console.error(`\n${accessSet.message}\n`);
    process.exit(2);
  }
  let workspace: string | undefined;
  if (cli.workspace !== undefined) {
    const stateDirs = [f.stateDir, defaultStateDir(home)];
    try {
      for (const e of fs.readdirSync(home)) if (e.startsWith(".gilb-claude-code-bridge")) stateDirs.push(path.join(home, e));
    } catch {
      /* the listed state folders are still checked */
    }
    const v = validateWorkspace(cli.workspace, { home, platform, stateDirs });
    if (!v.ok) {
      console.error(`\n${v.reason}\n`);
      process.exit(2);
    }
    workspace = v.path;
  }
  const stateBadRun = stateDirProblem(f.stateDir, workspace, home, platform);
  if (stateBadRun) {
    console.error(`\n${stateBadRun}\n`);
    process.exit(2);
  }
  const writeStatus = (o: Record<string, unknown>) => {
    try {
      fs.mkdirSync(f.stateDir, { recursive: true, mode: 0o700 });
      fs.rmSync(f.statusFile, { force: true });
      fs.writeFileSync(f.statusFile, JSON.stringify({ ...o, at: new Date().toISOString(), pid: process.pid }), { mode: 0o600, flag: "wx" });
    } catch {
      /* the bridge still runs without a status file */
    }
  };

  const launch = resolveClaudeLaunch(claudeBin, process.env);
  const login = await checkSubscriptionLogin(claudeBin);
  if (!login.ok) {
    console.error(`\nThe bridge did not start.\n${login.reason}\n`);
    writeStatus({ ok: false, reason: String(login.reason).replace(/\s+/g, " ").trim() });
    process.exit(1);
  }
  // The local control token: a fresh one at every start, written only once the port is ours (a second bridge that fails to
  // bind must not overwrite the running one's token or status). Readable by this user only. `--code` uses it.
  const controlToken = crypto.randomBytes(32).toString("hex");
  const bridge = createBridge({ port, claudeBin, controlToken, allowedOrigins, pairingsFile: f.pairingsFile, workDir: path.join(f.stateDir, "work"), workspace, fullAccess: cli.fullAccess, workspaceFile: path.join(f.stateDir, "workspace.json"), label: cli.label, stateDir: f.stateDir, log: (l) => console.log(`  ${l}`) });
  try {
    await bridge.start();
  } catch (e) {
    const why = (e as ErrLike).code === "EADDRINUSE" ? `port ${port} is already in use (is the bridge already running?)` : (e as ErrLike).message;
    console.error(`\nThe bridge did not start: ${why}\n`);
    if ((e as ErrLike).code !== "EADDRINUSE") writeStatus({ ok: false, reason: why }); // a bridge that already runs keeps its own token and status
    process.exit((e as ErrLike).code === "EADDRINUSE" ? EXIT_PORT_IN_USE : 1); // the supervisor reads this one: never two bridges
  }
  try {
    fs.mkdirSync(f.stateDir, { recursive: true, mode: 0o700 });
    fs.rmSync(f.tokenFile, { force: true }); // never write through a symlink
    fs.writeFileSync(f.tokenFile, controlToken, { mode: 0o600, flag: "wx" });
  } catch {
    /* --code will say there is no token */
  }
  // A note left by an update that restarted this bridge: say so once, then remove it.
  const updateNote = path.join(f.stateDir, "update.json");
  try {
    const n = JSON.parse(fs.readFileSync(updateNote, "utf8")) as { from?: unknown; to?: unknown; at?: unknown };
    console.log(`  updated from ${cleanForLog(n.from)} to ${cleanForLog(n.to)} at ${cleanForLog(n.at)}`);
    fs.rmSync(updateNote, { force: true });
  } catch (e) {
    if ((e as ErrLike).code !== "ENOENT") {
      console.log("  update.json could not be read; removed it");
      try { fs.rmSync(updateNote, { force: true }); } catch { /* ignore */ }
    }
  }
  const who = login.info.email ? ` (${login.info.email})` : "";
  const billing = `Claude subscription${who}, plan ${login.info.subscriptionType}`;
  writeStatus({ ok: true, port: bridge.port, billing });
  console.log(`
Gilb Claude Code bridge
  Listening:    http://127.0.0.1:${bridge.port}  (this computer only)
  Billing:      ${billing}
                API keys are removed from every Claude Code run; none is ever used.
  Claude Code:  your own \`${platform === "win32" && launch.ok ? launch.shown : claudeBin}\`; chat turns: tools off (no shell, no files, no web)${bridge.workspacePath ? `; code turns: ${bridge.access === "computer" ? "computer mode (full access)" : "folder mode (only the code folder)"}` : ""}
${bridge.access === "computer" ? `  ${platform === "win32" ? FULL_ACCESS_NOTICE_WINDOWS : FULL_ACCESS_NOTICE}\n` : cli.fullAccess ? `  ${FULL_ACCESS_SAVED_FOLDER_NOTICE}\n` : ""}${bridge.workspacePath ? `  Code folder:  ${bridge.workspacePath}  (${bridge.access === "computer" ? "the start folder of a code turn; full computer access is on" : platform === "win32" ? "a code turn may read and edit files only there; it cannot run commands on Windows" : "a code turn may read, edit and run commands only there"})\n` : ""}
  Allowed apps: ${allowedOrigins.join(", ")}
                (any other web page is refused; add one with --allow-origin)

  Pairing code: ${bridge.pairingCode}
  In the app that gave you this command, press Connect, choose Claude Code, and type this code.
  Press Ctrl+C to stop. (Later: \`node ${commandPathForPerson(fileURLToPath(import.meta.url), home, platform)} --code\` prints the current code.)
`);
  const stop = () => bridge.close().then(() => process.exit(0));
  // Started by --supervise: when the supervisor is gone (killed, not stopped), do not carry on as an unwatched second bridge.
  const supervisorPid = Number(process.env.GILB_BRIDGE_SUPERVISOR_PID);
  if (supervisorPid > 0) setInterval(() => void (pidAlive(supervisorPid) || stop()), 5000).unref();
  installProcessHandlers(bridge, process, platform); // SIGINT, SIGTERM, SIGHUP (a closed Terminal), SIGBREAK; exit kills what is left
}

// Started as a program? Compare real paths: node gives import.meta.url the real path, while argv[1] keeps the symlink a person
// (or a symlinked home or app folder) reached the file through.
const isMain = (() => {
  try {
    return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) {
  main();
}
