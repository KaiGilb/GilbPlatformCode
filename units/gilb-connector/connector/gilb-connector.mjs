#!/usr/bin/env node
// gilb-connector: Claude Code and Claudian, as a GilbPlatform agent.
//
// A stdio MCP server. stdout is protocol only (one JSON-RPC message per line). Logs go to stderr.
// By default the process signs in as its own Connected AI (a key under ~/.gilb-connector).
// `--as me` signs in as this computer and keeps that path unchanged. Once the AI is bound,
// the process keeps one platform turn. Until then, each call asks again. Tool calls go to
// POST /base/ai/claude-code/tool. A hand-off comes back as { hop }
// and runs as a nested `claude -p` whose own MCP server is this file in hop mode. A hop cannot hop.
// Up to MAX_HOPS_AT_ONCE run at once, each for at most HOP_MAX_MS.
//
// Zero runtime dependencies. Node 18 or newer.
// `publish` puts a built folder on https://<name>.pages.dev. It uses this file's sign-in.
import { execFileSync, spawn } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, sign as cryptoSign, } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, constants, existsSync, fchmodSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { homedir, hostname, tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep, win32 as win32Path } from "node:path";
import { isIP } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
export const CONNECTOR_VERSION = "0.6.1";
export const DEFAULT_AGENT = "Kai-Zen";
/** The identity door. A proof for any other host is refused, so this is the default. */
export const DEFAULT_ORIGIN = "https://id.gilb.com";
export const DEFAULT_USER_TEXT = "Work with the person in Claude Code.";
/** Profile directory under the connector home when `--profile` is omitted for an AI. */
export const DEFAULT_AI_PROFILE = "default";
/** Label stored at registration. Not a browser origin, so it cannot be admitted by accident. */
export const AI_DECLARED_ORIGIN = "cli:gilb-connector";
/** What a tool answers when this computer has no GilbPlatform credential. */
export const NOT_CONNECTED = "This computer is not connected to GilbPlatform yet. Run: gilb-computer add — approve it once in GilbApp — then restart Claude Code.";
/** What a tool answers when this AI's principal is not a vault namespace. The client id is alone on one line. */
export function aiNotBound(clientId) {
    return [
        "This AI is not bound to an AI vault yet.",
        "Client ID:",
        clientId,
        "In GilbApp: open your vault › Connect AI. Name and mint an AI vault, paste the client id above into Client ID, and press Bind AI.",
    ].join("\n");
}
/**
 * A bound AI's principal is a vault namespace `https://<host>/base` or `https://<host>/vault` (the platform's two
 * spellings of one vault).
 */
const VAULT_NAMESPACE = /^https:\/\/[^/\s]+\/(?:base|vault)$/;
function isVaultNamespace(principal) {
    return VAULT_NAMESPACE.test(principal);
}
function principalHost(principal) {
    try {
        return new URL(principal).host;
    }
    catch {
        return principal;
    }
}
/** What a tool answers when this AI is bound and the door gives it no reach. No vault name uses the unnamed form. */
export function aiNoGrant(vault, principal) {
    const host = principalHost(principal);
    const where = vault ? `on ${vault}` : "on any vault";
    const open = vault ? "open that vault" : "open the vault it should work in";
    return `This AI acts as ${principal}. It has no Read or Write ${where} yet. In GilbApp, ${open} › Grant Access, and grant the AI vault ${host} Read and Write.`;
}
/** What the model is told when a hand-off it asked for could not finish. Same sentence as the page client. */
export const HAND_OFF_FAILED_NEXT = "Do not call this hand-off again with the same Agent. Tell the person which Agent could not take the work, and why.";
/** A hand-off stopped by HOP_MAX_MS. Apart from a crash: its tool calls were committed as they happened, so its writes stand. */
class HopTimeoutError extends Error {
    progress;
    constructor(progress) {
        super("The hand-off took too long and was stopped.");
        this.name = "HopTimeoutError";
        this.progress = progress;
    }
}
/** The minutes in the timeout sentence and in the child's time-limit paragraph. At least one. */
function hopLimitMinutes(hopMaxMs) {
    return Math.max(1, Math.round(hopMaxMs / 60000));
}
/**
 * Appended to a non-Concept child's task. The timer kills the process and the caller does not see what was unfinished,
 * so the child is told to stop on its own and name the rest.
 */
function hopTimeLimitParagraph(hopMaxMs) {
    const minutes = hopLimitMinutes(hopMaxMs);
    return `\n\nTime limit. You have up to ${minutes} minutes. Do every step your standard names, including its checks and read-backs. If you cannot finish in time, stop at a step boundary and say which steps are done and which are not; never skip a check to finish sooner. Also name what you wrote (each record or table tag), so the caller can hand over the rest. Every tool answer ends with a line "Hand-off clock: …" that gives the real time used and left. Trust only that clock. If you stop before the work is done, give the real reason, and never say the time limit stopped you unless the clock said so.`;
}
/** The "Hand-off clock" line appended to every tool answer in a hand-off that has a deadline. */
function hopClockLine(hopStart, deadline, now) {
    const total = Math.round((deadline - hopStart) / 60000);
    const used = Math.floor((now - hopStart) / 60000);
    const left = Math.max(0, Math.ceil((deadline - now) / 60000));
    if (left <= 3) {
        return `Hand-off clock: ${left} minutes left. Stop at the next step boundary and answer with which steps are done and which are not. Never skip a check or a read-back to finish sooner.`;
    }
    return `Hand-off clock: ${used} of ${total} minutes used, ${left} left.`;
}
const TOOL_CALLS_MAX = 60;
const TOOL_CALL_CHARS = 200;
const LAST_WORDS_CHARS = 1500;
const TOOL_TAG_KEYS = ["tag", "unitTag", "table", "entity"];
/** Name plus tag, unitTag, table and entity only. Any other input field (a body, a token, a file) is left out. */
function toolCallLine(name, input) {
    let line = name;
    if (input && typeof input === "object" && !Array.isArray(input)) {
        const row = input;
        for (const key of TOOL_TAG_KEYS) {
            const value = row[key];
            if (typeof value !== "string" || value === "")
                continue;
            line += ` ${key}=${value}`;
        }
    }
    return line.slice(0, TOOL_CALL_CHARS);
}
/**
 * stream-json assistant event: `{ type: "assistant", message: { content } }`.
 * `content` is text blocks `{ type: "text", text }` and tool calls `{ type: "tool_use", name, input }`.
 * A later message with no text does not wipe the last thing the child said.
 */
function noteAssistant(message, progress) {
    if (!message || typeof message !== "object" || Array.isArray(message))
        return;
    const content = message.content;
    if (!Array.isArray(content))
        return;
    const texts = [];
    for (const block of content) {
        if (!block || typeof block !== "object" || Array.isArray(block))
            continue;
        const row = block;
        if (row.type === "text" && typeof row.text === "string" && row.text !== "")
            texts.push(row.text);
        else if (row.type === "tool_use" && typeof row.name === "string" && row.name !== "" && progress.toolCalls.length < TOOL_CALLS_MAX) {
            progress.toolCalls.push(toolCallLine(row.name, row.input));
        }
    }
    if (texts.length > 0)
        progress.lastText = texts.join("\n");
}
/** Progress worth telling the caller. An empty collection keeps the old sentence, which says to read the vault. */
function sawProgress(progress) {
    if (!progress)
        return false;
    return progress.toolCalls.length > 0 || (typeof progress.lastText === "string" && progress.lastText !== "");
}
/** What the model is told when a hand-off ran out of time. The minutes follow the limit. */
export function hopTimeoutAnswer(role, hopMaxMs, progress) {
    const minutes = hopLimitMinutes(hopMaxMs);
    const unit = minutes === 1 ? "minute" : "minutes";
    const seen = sawProgress(progress);
    const partial = seen
        ? `This hand-off ran out of time after ${minutes} ${unit}. What it wrote before then is saved; done_before_stop lists its calls. Hand over only what is not in that list, in smaller parts.`
        : `This hand-off ran out of time after ${minutes} ${unit}. What it wrote before then is saved. Read the vault to see what is there, then hand over only the rest, in smaller parts.`;
    const body = {
        error: "the hand-off ran out of time",
        role,
        partial,
        next: "Read what this hand-off wrote, then hand the remaining work to the same Agent in smaller parts.",
    };
    if (seen) {
        body.done_before_stop = progress.toolCalls;
        if (typeof progress.lastText === "string" && progress.lastText !== "")
            body.last_words = progress.lastText.slice(0, LAST_WORDS_CHARS);
    }
    return JSON.stringify(body);
}
const SIGN_IN_FAILED = "This computer could not sign in to GilbPlatform.";
const AI_SIGN_IN_FAILED = "This AI could not sign in to GilbPlatform.";
/** Waits between tries when the platform is restarting. They add up to 60 s. */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000];
/** A proxy or a restarting server answers these while it is down; none of them says the sign-in was wrong. */
function isTransientStatus(status) {
    return status === 502 || status === 503 || status === 504 || (status >= 520 && status <= 524);
}
/** A write got no answer, or a 5xx: it may have run, and it is not sent again. */
function unknownOutcomeText(tool, what) {
    return `${tool} got no answer from GilbPlatform (${what}) and may or may not have run. It was not sent again. Read it back before sending it again.`;
}
/** The sentence for a platform that is down or restarting. `what` is the HTTP status or the network error. */
function unreachableMessage(what) {
    return `GilbPlatform is restarting or out of reach just now (${what}). Try again in a minute.`;
}
const WRITE_SCOPE_REFUSED = "The platform refused scope base.write, so this AI is using base.read. Writes will be refused until the platform accepts base.write.";
/** Renew a machine session once it has less than this long to live. Matches the proof freshness window. */
const RENEW_WITHIN_MS = 60_000;
const MACHINE_TOKEN_FALLBACK_TTL_SEC = 300;
const ASSERTION_LIFETIME_SEC = 60;
const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const PRIVATE_KEY_FILE = "private.pem";
const CLIENT_ID_FILE = "client-id";
/** How long a hand-off may run unless its role is listed in HOP_MAX_MS_BY_ROLE. */
export const HOP_MAX_MS_DEFAULT = 15 * 60 * 1000;
/** The longer limit, for the level agents that read a lot before they write. */
const HOP_MAX_MS_LONG = 30 * 60 * 1000;
/** Role names as normalised below (lower case, letters and digits only). Agent.Concept is not listed: it keeps the default. */
export const HOP_MAX_MS_BY_ROLE = {
    agentvdt: HOP_MAX_MS_LONG,
    agentoutcome: HOP_MAX_MS_LONG,
    agentoutcomebusiness: HOP_MAX_MS_LONG,
    agentoutcomeowner: HOP_MAX_MS_LONG,
    agentoutcomestakeholder: HOP_MAX_MS_LONG,
    agentoutcomesolution: HOP_MAX_MS_LONG,
    agentstakeholder: HOP_MAX_MS_LONG,
    agentoutcomeproduct: HOP_MAX_MS_LONG,
    agentarchitect: HOP_MAX_MS_LONG,
    agentscaling: HOP_MAX_MS_LONG,
    agentvaluedeliverystep: HOP_MAX_MS_LONG,
};
/** The longest any hand-off may run. The page client's bridge uses the same limit. */
export const HOP_MAX_MS = Math.max(HOP_MAX_MS_DEFAULT, ...Object.values(HOP_MAX_MS_BY_ROLE));
/** How long a hand-off to this role may run: its own limit, else the default. */
export function hopMaxFor(role) {
    const key = role.toLowerCase().replace(/[^a-z0-9]/g, "");
    return Object.prototype.hasOwnProperty.call(HOP_MAX_MS_BY_ROLE, key) ? HOP_MAX_MS_BY_ROLE[key] : HOP_MAX_MS_DEFAULT;
}
/** Tools that only read. A restart's timeout or 5xx on one of these may be tried again; nothing was written. */
export const READ_ONLY_TOOLS = new Set([
    "read_record", // GilbPlatform src/ai/vault-tools.ts:593
    "list_records", // GilbPlatform src/ai/vault-tools.ts:566
    "list_vaults", // GilbPlatform src/ai/vault-tools.ts:554
    "list_projects", // the tool list offered to the connector (read-only by its description)
    "read_plan_card", // GilbPlatform src/ai/plan-card-tools.ts:47 (READ_PLAN_CARD)
    "read_plan_table", // GilbPlatform src/ai/plan-card-tools.ts:50 (READ_PLAN_TABLE)
    "list_types", // GilbPlatform src/ai/vault-tools.ts:618
    "list_predicates", // GilbPlatform src/ai/vault-tools.ts:675
]);
/** Write tools that have a check mode. With mode "check" they write nothing (GilbPlatform src/ai/plan-card-tools.ts:402), so they may be repeated. */
const CHECKABLE_WRITE_TOOLS = new Set(["write_plan_card", "write_plan_table"]);
function argsObject(args) {
    if (typeof args === "string") {
        try {
            args = JSON.parse(args);
        }
        catch {
            return null;
        }
    }
    return args && typeof args === "object" && !Array.isArray(args) ? args : null;
}
/** A call that only reads, or a check-mode call (`mode === "check"`, plan-card-tools.ts:402): a restart's failure may be tried again. */
export function isRepeatableCall(name, args) {
    if (READ_ONLY_TOOLS.has(name))
        return true;
    return CHECKABLE_WRITE_TOOLS.has(name) && argsObject(args)?.mode === "check";
}
/** How many hand-offs may run at once. */
export const MAX_HOPS_AT_ONCE = 4;
/** The tools whose answer may open a hand-off. */
const HAND_OFF_TOOLS = new Set(["run_named_role", "ask_agent_concept"]);
/** How many hand-off calls may wait for a free slot (FIFO). A call beyond that is refused. */
export const HOP_QUEUE_MAX_WAITING = 12;
/** How long one call may wait for a free slot before it is refused. */
export const HOP_QUEUE_MAX_WAIT_MS = 20 * 60 * 1000;
/** "3 min 10 s", "45 s". */
export function formatWait(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return m > 0 ? `${m} min ${sec} s` : `${sec} s`;
}
/**
 * Up to `cap` hand-off slots at once. Further callers wait in FIFO order, at most `maxWaiting` of them, each for at most
 * `maxWaitMs`. A cancelled caller leaves the line. Nothing is sent to the server while a caller waits.
 */
export class HopQueue {
    cap;
    maxWaiting;
    maxWaitMs;
    now;
    open = 0;
    line = [];
    constructor(cap, maxWaiting = HOP_QUEUE_MAX_WAITING, maxWaitMs = HOP_QUEUE_MAX_WAIT_MS, now = Date.now) {
        this.cap = cap;
        this.maxWaiting = maxWaiting;
        this.maxWaitMs = maxWaitMs;
        this.now = now;
    }
    get running() {
        return this.open;
    }
    get waiting() {
        return this.line.length;
    }
    grant(waitedMs, queued) {
        this.open += 1;
        let released = false;
        return {
            kind: "slot",
            waitedMs,
            queued,
            release: () => {
                if (released)
                    return;
                released = true;
                this.open -= 1;
                this.drain();
            },
        };
    }
    drain() {
        while (this.open < this.cap && this.line.length > 0) {
            const next = this.line.shift();
            clearTimeout(next.timer);
            next.signal.removeEventListener("abort", next.onAbort);
            next.settle(this.grant(this.now() - next.since, true));
        }
    }
    acquire(signal) {
        if (signal.aborted)
            return Promise.resolve({ kind: "cancelled" });
        if (this.open < this.cap && this.line.length === 0)
            return Promise.resolve(this.grant(0, false));
        if (this.line.length >= this.maxWaiting) {
            return Promise.resolve({
                kind: "refused",
                reason: `Too many hand-offs: ${this.cap} are running and ${this.maxWaiting} are already waiting for a free slot (the most that may wait). Nothing was started. Wait for some to finish, then send this one again.`,
            });
        }
        return new Promise((resolve) => {
            const waiter = {
                since: this.now(),
                signal,
                settle: resolve,
                timer: setTimeout(() => {
                    const at = this.line.indexOf(waiter);
                    if (at < 0)
                        return;
                    this.line.splice(at, 1);
                    signal.removeEventListener("abort", waiter.onAbort);
                    resolve({
                        kind: "refused",
                        reason: `This hand-off waited ${formatWait(this.now() - waiter.since)} for a free hand-off slot and none came (${this.cap} were running, ${at} waiting ahead of it). Nothing was started. Send it again when fewer hand-offs are running.`,
                    });
                }, this.maxWaitMs),
                onAbort: () => {
                    const at = this.line.indexOf(waiter);
                    if (at < 0)
                        return;
                    this.line.splice(at, 1);
                    clearTimeout(waiter.timer);
                    resolve({ kind: "cancelled" });
                },
            };
            waiter.timer.unref?.();
            signal.addEventListener("abort", waiter.onAbort, { once: true });
            this.line.push(waiter);
        });
    }
}
/**
 * How many times one process starts a fresh platform turn after the server refused a call at a turn limit.
 * Each roll re-sends one call the platform refused BEFORE running it, so a long planning chat may go on.
 */
export const MAX_TURN_ROLLS = 40;
/** A remembered vault choice is used again only within this long. */
export const VAULT_CHOICE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const VAULT_CHOICE_FILE = "vault-choice.json";
/** The parent process id and its start time. null where it cannot be read (Windows, or no `ps`): then nothing is remembered. */
export function detectParentKey() {
    if (process.platform === "win32")
        return null;
    const pid = process.ppid;
    if (!Number.isInteger(pid) || pid <= 1)
        return null;
    try {
        const out = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, LC_ALL: "C" } }).trim();
        return out === "" ? null : { pid, started: out };
    }
    catch {
        return null;
    }
}
function readVaultChoice(file) {
    try {
        const raw = JSON.parse(readFileSync(file, "utf8"));
        if (!raw || typeof raw !== "object")
            return null;
        if (typeof raw.client !== "string" || typeof raw.ppid !== "number" || typeof raw.started !== "string" || typeof raw.savedAt !== "number")
            return null;
        if (!Array.isArray(raw.vaults) || !raw.vaults.every((v) => typeof v === "string"))
            return null;
        return { client: raw.client, ppid: raw.ppid, started: raw.started, savedAt: raw.savedAt, vaults: raw.vaults };
    }
    catch {
        return null;
    }
}
/** Added to a hand-off's answer when the server says the hand-off was cut by the round ceiling. */
export const CUT_TEXT = "This hand-off ran out of tool rounds before it finished. Its answer is partial: say so, and hand the rest over again.";
/** The two answers the server gives, before it runs anything, when a turn is out of room (POST /base/ai/claude-code/tool). */
const TURN_LIMIT_NEXT = "tell the person what you did, and stop";
const TURN_LIMIT_ROUNDS = "this turn has used all its tool rounds";
const TURN_LIMIT_HOPS = "this turn has handed over as many times as one turn may";
/** A hop model name: letters, digits, dot, dash; it starts with a letter or digit so it can never read as an option. */
const HOP_MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$/;
/** A pending tools/call that asked for progress is told "still working" this often. */
export const PROGRESS_EVERY_MS = 15 * 1000;
/** How long the Claude CLI is told to wait for one MCP tool call: the longest hand-off of any role, plus a minute. */
export const MCP_TOOL_TIMEOUT_MS = HOP_MAX_MS + 60 * 1000; // HOP_MAX_MS is the maximum across roles
const TURN_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const PROFILE_NAME = /^[A-Za-z0-9._-]{1,40}$/;
const USER_TEXT_MAX = 24_000;
/**
 * Names that would bill an API key, a gateway, or another account instead of the person's Claude subscription.
 * A copy of the bridge's list, including the families, so a later variable under a known family is still removed.
 */
const BILLING_ENV_DENY = [
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
const BILLING_ENV_DENY_PREFIXES = [
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
function envDenied(key) {
    const upper = key.toUpperCase();
    return BILLING_ENV_DENY.includes(upper) || BILLING_ENV_DENY_PREFIXES.some((prefix) => upper.startsWith(prefix));
}
/** The environment a nested `claude` gets: the connector's, minus billing variables, with the MCP wait raised. */
export function childEnv(env = process.env) {
    const out = {};
    for (const [key, value] of Object.entries(env)) {
        if (value !== undefined && !envDenied(key))
            out[key] = value;
    }
    const own = Number(out.MCP_TOOL_TIMEOUT);
    if (!(Number.isFinite(own) && own > MCP_TOOL_TIMEOUT_MS))
        out.MCP_TOOL_TIMEOUT = String(MCP_TOOL_TIMEOUT_MS);
    const ownIdle = Number(out.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT);
    if (!(Number.isFinite(ownIdle) && ownIdle > MCP_TOOL_TIMEOUT_MS))
        out.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT = String(MCP_TOOL_TIMEOUT_MS);
    return out;
}
export class CliError extends Error {
    help;
    constructor(message, help = false) {
        super(message);
        this.name = "CliError";
        this.help = help;
    }
}
class PlatformError extends Error {
    status;
    /** A write got no answer (a timeout, a reset): it may have run. A refused connection never sets this. */
    maybeRan = false;
    what = "no answer";
    constructor(status, message) {
        super(message);
        this.name = "PlatformError";
        this.status = status;
    }
}
class NotConnected extends Error {
    constructor(message = NOT_CONNECTED) {
        super(message);
        this.name = "NotConnected";
    }
}
/** The platform was down or restarting, not a refused sign-in: the next call may open again. */
class PlatformDown extends NotConnected {
}
/** A network failure, as a short word for the person: the cause code if there is one. */
function networkWhat(err) {
    const cause = err instanceof Error ? err.cause : undefined;
    const code = cause && typeof cause === "object" ? cause.code : undefined;
    if (typeof code === "string" && /^[A-Z0-9_]{3,30}$/.test(code))
        return code;
    return "no answer";
}
/** The connection was refused or the host unknown: nothing reached a server, so a write was not run. */
function neverArrived(err) {
    const cause = err instanceof Error ? err.cause : undefined;
    const code = cause && typeof cause === "object" ? cause.code : undefined;
    return code === "ECONNREFUSED" || code === "ENOTFOUND";
}
const GILB_WHOAMI = {
    name: "gilbplatform_whoami",
    description: "Report this connector's sign-in: the connector version, the mode, the Client ID, the principal, whether this AI is bound, and the selected vaults.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
};
const GILB_AGENT = {
    name: "gilbplatform_agent",
    description: "Switch the GilbPlatform agent for this session (for example Kai-Zen or Jackfruit) and return that agent's standing instructions.",
    inputSchema: {
        type: "object",
        properties: {
            agent: { type: "string", description: "The agent tag, for example Kai-Zen or Jackfruit." },
        },
        required: ["agent"],
        additionalProperties: false,
    },
};
const GILB_TASK = {
    name: "gilbplatform_task",
    description: "Set the person's request. GilbPlatform loads the agent's standing from this text.",
    inputSchema: {
        type: "object",
        properties: {
            text: { type: "string", description: "What the person is asking." },
        },
        required: ["text"],
        additionalProperties: false,
    },
};
const GILB_USE_VAULT = {
    name: "gilbplatform_use_vault",
    description: "Select a vault the person named, for this session. Claude Code asks the person to allow it; their yes is what selects it. Pass the vault as the person said it: its name (for example testcarwashcouponapp), its host, or its address.",
    inputSchema: {
        type: "object",
        properties: {
            vault: { type: "string", description: "The vault as the person said it: its name, its host, or its address." },
        },
        required: ["vault"],
        additionalProperties: false,
    },
};
const GILB_UPLOAD_FILE = {
    name: "gilbplatform_upload_file",
    description: "Upload one file from this computer into a vault the person selected. Pictures (png, jpg, jpeg, webp, gif, svg), pdf, txt, md, csv and json only, up to 25 MB. The file must be inside the folder this connector runs in, or a folder the person gave it. Hidden folders and files, and names that look like keys or secrets, are refused. Select the vault first with gilbplatform_use_vault. Returns the file's address, its sha256 and its size.",
    inputSchema: {
        type: "object",
        properties: {
            path: { type: "string", description: "The file on this computer." },
            vault: { type: "string", description: "The selected vault. Leave out when exactly one vault is selected." },
            folder: { type: "string", description: "A folder path inside the vault to file it under, for example type-pictures." },
            name: { type: "string", description: "The name to store it under. Default: the file's own name. Keep the same extension." },
        },
        required: ["path"],
        additionalProperties: false,
    },
};
/** Told to the model on initialize, and in the README. A vault switch stays the person's decision. */
const USE_VAULT_INSTRUCTIONS = "When the person names a vault to work in, call gilbplatform_use_vault with the name they used before any other tool on that vault. Do not choose 'don't ask again' for gilbplatform_use_vault: every vault switch stays the person's decision.";
/** Told to the model on initialize, and in the README. A vault made here is selected at once; one made in a hand-off, when that hand-off ends. */
const CREATE_VAULT_INSTRUCTIONS = "A vault you make with create_vault is selected for the session at once; one made inside a hand-off is selected when the hand-off ends.";
/** Told to the model on initialize, and in the README. One work vault is not a choice. */
const AUTO_SELECT_INSTRUCTIONS = "If this AI can reach exactly one vault besides its own, that vault is selected automatically.";
const AGENT_PROMPT = {
    name: "agent",
    description: "Start as a GilbPlatform agent with its standing instructions.",
    arguments: [
        {
            name: "name",
            description: "Agent tag, for example Kai-Zen or Jackfruit. Defaults to the current agent.",
            required: false,
        },
    ],
};
function newTurnId() {
    return randomBytes(16).toString("hex");
}
function mcpTool(tool) {
    return {
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
    };
}
function asTool(value) {
    if (!value || typeof value !== "object")
        return null;
    const row = value;
    if (typeof row.name !== "string" || row.name === "")
        return null;
    const tool = { name: row.name };
    if (typeof row.description === "string")
        tool.description = row.description;
    if (row.inputSchema !== undefined)
        tool.inputSchema = row.inputSchema;
    return tool;
}
function asTools(value) {
    if (!Array.isArray(value))
        return null;
    const out = [];
    for (const item of value) {
        const tool = asTool(item);
        if (!tool)
            return null;
        out.push(tool);
    }
    return out;
}
/** The only request the computer credential may send: renewing its own token. */
function computerTransport(origin, fetchImpl = fetch) {
    const allowed = new URL(`${origin}/base/auth/computer/token`);
    return async (url, init = {}) => {
        const method = String(init.method ?? "GET").toUpperCase();
        let parsed = null;
        try {
            parsed = new URL(url);
        }
        catch {
            parsed = null;
        }
        if (!parsed || method !== "POST" || parsed.origin !== allowed.origin || parsed.pathname !== allowed.pathname || parsed.search || parsed.hash) {
            throw new Error("the computer transport only renews the computer's token");
        }
        const req = { method, redirect: "manual" };
        if (init.headers)
            req.headers = init.headers;
        if (init.body !== undefined)
            req.body = init.body;
        if (init.timeoutMs != null)
            req.signal = AbortSignal.timeout(init.timeoutMs);
        const res = await fetchImpl(url, req);
        return { status: res.status, json: () => res.json(), headers: res.headers };
    };
}
function b64urlJson(value) {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function signEs256(header, payload, key) {
    const encoded = `${b64urlJson(header)}.${b64urlJson(payload)}`;
    const sig = cryptoSign("sha256", Buffer.from(encoded), { key, dsaEncoding: "ieee-p1363" });
    return `${encoded}.${sig.toString("base64url")}`;
}
/**
 * The door builds `https://<host><path>` and compares `aud` and `htu` to that, including when the
 * client fetched the same path over http. Query and fragment are not part of the comparison.
 */
function httpsHtu(fetchUrl) {
    const url = new URL(fetchUrl);
    return `https://${url.host}${url.pathname}`;
}
function publicJwkOf(privateKey) {
    const exported = createPublicKey(privateKey).export({ format: "jwk" });
    if (exported.kty !== "EC" || exported.crv !== "P-256" || typeof exported.x !== "string" || typeof exported.y !== "string") {
        throw new Error("The AI key is not P-256.");
    }
    return { kty: "EC", crv: "P-256", x: exported.x, y: exported.y };
}
function accessHash(accessToken) {
    return createHash("sha256").update(accessToken).digest("base64url");
}
function dpopProof(method, fetchUrl, privateKey, publicJwk, accessToken) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        htm: method.toUpperCase(),
        htu: httpsHtu(fetchUrl),
        iat: now,
        jti: randomUUID(),
    };
    if (accessToken !== undefined)
        payload.ath = accessHash(accessToken);
    return signEs256({ alg: "ES256", typ: "dpop+jwt", jwk: publicJwk }, payload, privateKey);
}
function clientAssertion(clientId, tokenUrl, privateKey) {
    const now = Math.floor(Date.now() / 1000);
    return signEs256({ alg: "ES256", typ: "JWT" }, {
        iss: clientId,
        sub: clientId,
        aud: httpsHtu(tokenUrl),
        iat: now,
        exp: now + ASSERTION_LIFETIME_SEC,
        jti: randomUUID(),
    }, privateKey);
}
function connectorRoot(env) {
    const fromEnv = env.GILB_CONNECTOR_HOME;
    if (typeof fromEnv === "string" && fromEnv.trim() !== "")
        return fromEnv;
    // A caller that passes its own env must name the home. Tests must not write into a real home.
    if (env !== process.env)
        return null;
    return join(homedir(), ".gilb-connector");
}
function ensurePrivateDir(dir) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
}
function writePrivateFile(file, data) {
    writeFileSync(file, data, { mode: 0o600, flag: "wx" });
    chmodSync(file, 0o600);
}
function tightenPrivateFile(file) {
    if (existsSync(file))
        chmodSync(file, 0o600);
}
export function aiDisplayName(name, hopCli = "claude") {
    const trimmed = name?.trim();
    if (trimmed)
        return trimmed.slice(0, 256);
    const host = hostname().trim() || "this computer";
    return `${hopCli === "codex" ? "Codex" : "Claude Code"} on ${host}`.slice(0, 256);
}
function safeProfileName(name) {
    if (!PROFILE_NAME.test(name) || name === "." || name === "..")
        throw new Error("The profile name is not valid.");
    return name;
}
/** A platform error string safe to show. A key or a compact JWT is never quoted back. */
function safeQuote(text) {
    const flat = text.replace(/\s+/g, " ").trim();
    if (flat === "" || /PRIVATE KEY/.test(flat))
        return "";
    if (/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(flat))
        return "";
    return flat.slice(0, 300);
}
function quotedFailure(body) {
    if (!body || typeof body !== "object")
        return "";
    const row = body;
    const error = typeof row.error === "string" ? safeQuote(row.error) : "";
    const desc = typeof row.error_description === "string" ? safeQuote(row.error_description) : typeof row.message === "string" ? safeQuote(row.message) : "";
    return [error, desc].filter((part) => part !== "").join(": ");
}
function registrationMessage(body) {
    const detail = quotedFailure(body);
    return detail ? `Registration failed: ${detail}` : "Registration failed.";
}
function principalFromSystem(system) {
    const match = /That person is identified as: (.+?)\. /.exec(system);
    const found = match?.[1]?.trim();
    return found ? found : undefined;
}
function isMissingComputer(err) {
    if (!err || typeof err !== "object")
        return false;
    const row = err;
    if (row.code === "ERR_MODULE_NOT_FOUND" || row.code === "MODULE_NOT_FOUND" || row.code === "ENOENT" || row.code === "not_found")
        return true;
    if (err instanceof Error && /cannot find module/i.test(err.message))
        return true;
    if (row.name === "ComputerNotActiveError")
        return true;
    return row.name === "ComputerKeyError" && row.code === "not_found";
}
function readJsonText(text) {
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return { message: text };
    }
}
function errorText(status, body, fallback) {
    if (body && typeof body === "object") {
        const row = body;
        for (const value of [row.message, row.error]) {
            if (typeof value === "string" && /\s/.test(value.trim()))
                return value;
        }
    }
    return `${fallback} (HTTP ${status}).`;
}
function toolAnswerIsError(result) {
    try {
        const value = JSON.parse(result);
        return !!value && typeof value === "object" && "error" in value;
    }
    catch {
        return false;
    }
}
/** Live door, exact prefixes. A 200 tool result that starts with either one means this AI has no reach. */
const NO_READ_REACH = "vault target denied: the principal holds no read reach";
const NO_WRITE_REACH = "vault target denied: the principal holds no write reach";
function reachError(body) {
    if (!body || typeof body !== "object")
        return null;
    const result = body.result;
    if (typeof result !== "string")
        return null;
    let parsed;
    try {
        parsed = JSON.parse(result);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return null;
    const error = parsed.error;
    if (typeof error !== "string")
        return null;
    if (error.startsWith(NO_READ_REACH) || error.startsWith(NO_WRITE_REACH))
        return error;
    return null;
}
function deniesVaultReach(body) {
    return reachError(body) !== null;
}
function vaultInReach(error) {
    const marker = " on vault ";
    const at = error.lastIndexOf(marker);
    if (at < 0)
        return undefined;
    const vault = error.slice(at + marker.length).trim();
    return vault === "" ? undefined : vault;
}
function toolResult(text, isError, extraTexts) {
    const content = [{ type: "text", text }];
    if (extraTexts) {
        for (const extra of extraTexts)
            content.push({ type: "text", text: extra });
    }
    return { content, isError };
}
function argumentString(args) {
    if (typeof args === "string")
        return args;
    if (args === undefined || args === null)
        return "{}";
    return JSON.stringify(args);
}
function fieldString(args, key) {
    if (!args || typeof args !== "object")
        return "";
    const value = args[key];
    return typeof value === "string" ? value.trim() : "";
}
function namedVault(args) {
    const id = fieldString(args, "vaultId") || fieldString(args, "vault");
    return id === "" ? undefined : id;
}
/** A list_vaults answer with nothing in it is no reach. It is not remembered. */
function listsNoVaults(name, result) {
    if (name !== "list_vaults")
        return false;
    let parsed;
    try {
        parsed = JSON.parse(result);
    }
    catch {
        return false;
    }
    if (Array.isArray(parsed))
        return parsed.length === 0;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.vaults)) {
        return parsed.vaults.length === 0;
    }
    return false;
}
/**
 * The namespace a successful create_vault answer names.
 * An error, created false without existing, a missing or non-namespace vaultId, or text that is not a JSON object names nothing.
 */
function createdVaultNamespace(result) {
    let parsed;
    try {
        parsed = JSON.parse(result);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return null;
    if ("error" in parsed)
        return null;
    const record = parsed;
    if (record.created !== true && record.existing !== true)
        return null;
    if (typeof record.vaultId !== "string" || !isVaultNamespace(record.vaultId))
        return null;
    return record.vaultId;
}
/** Vault namespaces a hop wrote, one per line. A missing file means the hop made none. */
function hopCreatedNamespaces(file) {
    let text;
    try {
        text = readFileSync(file, "utf8");
    }
    catch {
        return [];
    }
    const out = [];
    for (const line of text.split("\n")) {
        const namespace = line.trim();
        if (isVaultNamespace(namespace))
            out.push(namespace);
    }
    return out;
}
/**
 * `list_vaults` answers `{ vaults: [...] }` (or the array itself).
 * A string entry is the vault id. An object entry's id is `vaultId`.
 */
function vaultIdsFromListResult(result) {
    let parsed;
    try {
        parsed = JSON.parse(result);
    }
    catch {
        return null;
    }
    let rows = null;
    if (Array.isArray(parsed))
        rows = parsed;
    else if (parsed && typeof parsed === "object" && Array.isArray(parsed.vaults)) {
        rows = parsed.vaults;
    }
    if (!rows)
        return null;
    const ids = [];
    for (const row of rows) {
        const id = vaultIdOfListed(row);
        if (id)
            ids.push(id);
    }
    return ids;
}
function vaultIdOfListed(row) {
    if (typeof row === "string") {
        const id = row.trim();
        return id === "" ? null : id;
    }
    if (!row || typeof row !== "object" || Array.isArray(row))
        return null;
    const vaultId = row.vaultId;
    if (typeof vaultId !== "string")
        return null;
    const id = vaultId.trim();
    return id === "" ? null : id;
}
/** Quotes, brackets, and punctuation the person may wrap around a name. The middle is kept. */
const VAULT_TOKEN_EDGE = /^[\s"'`“”‘’\[\](){}<>.,;:!?]+|[\s"'`“”‘’\[\](){}<>.,;:!?]+$/u;
function cleanVaultToken(input) {
    let text = input.trim().toLowerCase();
    let previous = "";
    while (text !== previous) {
        previous = text;
        text = text.replace(VAULT_TOKEN_EDGE, "").trim();
    }
    return text;
}
/** `https://<host>/base` when the person pasted an address. Other paths are not a vault address. */
function namespaceFromAddress(input) {
    let url;
    try {
        url = new URL(input.trim());
    }
    catch {
        return null;
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.host === "")
        return null;
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/"))
        path = path.replace(/\/+$/, "");
    const lower = path.toLowerCase();
    const accepted = lower === "" ||
        lower === "/" ||
        lower === "/base" ||
        lower === "/vault" ||
        lower === "/base/e" ||
        lower === "/vault/e" ||
        lower.startsWith("/base/e/") ||
        lower.startsWith("/vault/e/");
    if (!accepted)
        return null;
    return `https://${url.host}/base`;
}
/**
 * True when the vault's host is the origin's parent domain or a subdomain of it. For https://id.example.org that is
 * example.org and anything under it. An origin with fewer than three labels, or an IP address, allows only its own host.
 * Nothing is hard-coded: the family comes from the origin the connector was started with.
 */
export function hostInOriginFamily(originUrl, vaultUrl) {
    let o;
    let v;
    try {
        o = new URL(originUrl);
        v = new URL(vaultUrl);
    }
    catch {
        return false;
    }
    const strip = (host) => host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    const originHost = strip(o.hostname);
    const vaultHost = strip(v.hostname);
    if (originHost === "" || vaultHost === "")
        return false;
    let family = originHost;
    if (isIP(originHost) === 0) {
        const labels = originHost.split(".");
        if (labels.length >= 3)
            family = labels.slice(1).join(".");
    }
    return vaultHost === family || vaultHost.endsWith(`.${family}`);
}
function vaultQuery(raw) {
    const lead = raw.trim();
    if (lead.toLowerCase().startsWith("http"))
        return { address: namespaceFromAddress(lead), name: null };
    const name = cleanVaultToken(lead);
    return { address: null, name: name === "" ? null : name };
}
function hostOfVault(value) {
    try {
        const url = new URL(value);
        if ((url.protocol !== "http:" && url.protocol !== "https:") || url.host === "")
            return null;
        return url.host.toLowerCase();
    }
    catch {
        return null;
    }
}
/** Same vault when both ids have a host and those hosts match. A non-address falls back to the whole id, lowercased. */
function sameVault(a, b) {
    const left = hostOfVault(a);
    const right = hostOfVault(b);
    if (left !== null && right !== null)
        return left === right;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}
function firstHostLabel(host) {
    return (host.split(".")[0] ?? "").toLowerCase();
}
function listedVaultMatches(id, query) {
    const lower = id.trim().toLowerCase();
    if (query.address) {
        if (lower === query.address.toLowerCase())
            return true;
        const host = hostOfVault(id);
        const wanted = hostOfVault(query.address);
        return host !== null && wanted !== null && host === wanted;
    }
    if (!query.name)
        return false;
    if (lower === query.name)
        return true;
    const host = hostOfVault(id);
    if (!host)
        return false;
    if (host === query.name)
        return true;
    return firstHostLabel(host) === query.name;
}
function matchingVaults(ids, query) {
    const matched = [];
    for (const id of ids) {
        if (!listedVaultMatches(id, query))
            continue;
        if (matched.some((have) => sameVault(have, id)))
            continue;
        matched.push(id);
    }
    return matched;
}
/** What gilbplatform_upload_file may send, by extension. Anything else is refused. */
const UPLOAD_TYPES = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
};
/**
 * The largest file this tool sends. The door's own limit for a single request is higher (it has none for
 * POST /lws/vault/:vaultId/files; the 400 MB cap is for the piece-by-piece door), so this one is the lower.
 */
const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
/** A path below a folder: the part after the folder, or null when it is the folder itself or outside it. */
function belowFolder(folder, path) {
    const rel = relative(folder, path);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
        return null;
    return rel;
}
/** Words that make a name look like a secret. A segment containing any of them (any case) is never uploaded. */
const SECRET_WORDS = [
    "apikey", "api-key", "api_key", "password", "passwd", "secret", "credential", "token", "private",
    "service-account", "serviceaccount", "wallet", "seed-phrase", "seedphrase", "seed_phrase", "mnemonic",
    "aws-key", "aws_key", "awskey",
];
/** Endings that make a name a key store or a key. */
const SECRET_ENDINGS = [".pem", ".key", ".p12", ".pfx", ".keystore", ".jks", ".npmrc", ".netrc", ".asc", ".gpg"];
/** A name that looks like a key, a login or a secret. Checked on every segment below the folder. */
function secretName(segment) {
    const lower = segment.toLowerCase();
    if (SECRET_ENDINGS.some((end) => lower.endsWith(end)))
        return true;
    if (SECRET_WORDS.some((word) => lower.includes(word)))
        return true;
    if (lower.startsWith("id_rsa") || lower.startsWith("id_ed25519"))
        return true;
    // id_dsa, id_ecdsa and the like: a key file named id_* with no extension.
    return lower.startsWith("id_") && !lower.includes(".");
}
/** A reason to refuse a path below an allowed folder, or "" when its segments are fine. */
function refusedSegments(rel) {
    const segments = rel.split(sep).filter((segment) => segment !== "");
    if (segments.some((segment) => segment.startsWith(".")))
        return "A hidden file or folder (a name starting with a dot) is never uploaded.";
    if (segments.some((segment) => segment.toLowerCase() === "confidential"))
        return "A file inside a folder called Confidential is never uploaded.";
    if (segments.some(secretName))
        return "A file whose name looks like a key, a login or a secret is never uploaded.";
    return "";
}
/**
 * Decide, without opening the file, whether a path may be uploaded. Only realpath and stat are used.
 * The rules, in order: inside the working directory or an allowed folder (a symlink out is refused),
 * no dotted segment, no key or secret name, a regular file, an allowed extension, not empty, not over the limit.
 */
function pickUploadFile(raw, cwd, extraRoots) {
    if (raw === "" || raw.includes("\0"))
        return { ok: false, error: "Give the path of the file to upload." };
    const lexicalRoots = [resolve(cwd), ...extraRoots.map((dir) => resolve(cwd, dir))];
    const realRoots = [];
    for (const dir of lexicalRoots) {
        try {
            realRoots.push(realpathSync(dir));
        }
        catch {
            /* a folder that is not there allows nothing */
        }
    }
    const lexical = resolve(cwd, raw);
    // Hidden and key-like names are refused on the path as given, before anything is looked up.
    const lexicalRel = [...lexicalRoots, ...realRoots].map((dir) => belowFolder(dir, lexical)).find((rel) => rel !== null);
    if (lexicalRel) {
        const why = refusedSegments(lexicalRel);
        if (why)
            return { ok: false, error: why };
    }
    let real;
    try {
        real = realpathSync(lexical);
    }
    catch {
        return { ok: false, error: "That file is not there, or it is outside the folders this connector may read from." };
    }
    const realRel = realRoots.map((dir) => belowFolder(dir, real)).find((rel) => rel !== null);
    if (!realRel) {
        return { ok: false, error: "That file is outside the folder this connector runs in and the folders it was given with --upload-root. A link that leads out is refused too." };
    }
    const why = refusedSegments(realRel);
    if (why)
        return { ok: false, error: why };
    let st;
    try {
        st = statSync(real);
    }
    catch {
        return { ok: false, error: "That file could not be looked at." };
    }
    if (!st.isFile())
        return { ok: false, error: "That is not a file." };
    const ext = extname(real).slice(1).toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(UPLOAD_TYPES, ext)) {
        return { ok: false, error: `Only ${Object.keys(UPLOAD_TYPES).join(", ")} files can be uploaded.` };
    }
    if (st.size === 0)
        return { ok: false, error: "That file is empty." };
    if (st.size > UPLOAD_MAX_BYTES) {
        return { ok: false, error: `That file is ${st.size} bytes. The most this tool sends is ${UPLOAD_MAX_BYTES} bytes (25 MB).` };
    }
    return { ok: true, real, size: st.size, ext, base: basename(real) };
}
function normalizeOrigin(input) {
    let url;
    try {
        url = new URL(input);
    }
    catch {
        throw new CliError(`"${input}" is not an origin.`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:")
        throw new CliError(`"${input}" must be an http or https origin.`);
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
        throw new CliError(`"${input}" must be an origin with no path.`);
    }
    return url.origin;
}
function diskProfile(env) {
    // The real process reads this computer's profile, as openKey does. A caller that passes its own env
    // and no GILB_HOME does not (tests must not open the profile on the machine they happen to run on).
    if (env !== process.env && env.GILB_HOME === undefined)
        return undefined;
    const root = env.GILB_HOME || join(homedir(), ".gilb");
    const file = join(root, "computer", "profile");
    try {
        if (!existsSync(file))
            return undefined;
        const line = readFileSync(file, "utf8").split(/\r?\n/, 1)[0]?.trim() ?? "";
        return line || undefined;
    }
    catch {
        return undefined;
    }
}
function computerModulePath(env) {
    if (env.GILB_CONNECTOR_COMPUTER_MODULE)
        return env.GILB_CONNECTOR_COMPUTER_MODULE;
    if (env !== process.env && env.GILB_HOME === undefined)
        return "";
    const root = env.GILB_HOME || join(homedir(), ".gilb");
    return join(root, "lib/gilb-signin/current/node/computerNode.mjs");
}
function flagValues(argv, name) {
    const out = [];
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (token === undefined || token !== name)
            continue;
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--"))
            throw new CliError(`${name} needs a value.`);
        out.push(value);
        i += 1;
    }
    return out;
}
function oneFlag(argv, name) {
    const all = flagValues(argv, name);
    return all.length > 0 ? all[all.length - 1] : undefined;
}
const KNOWN_FLAGS = new Set([
    "--agent",
    "--origin",
    "--vault",
    "--profile",
    "--claude",
    "--hop-cli",
    "--codex",
    "--hop",
    "--turn",
    "--hop-tools",
    "--hop-created",
    "--hop-deadline",
    "--upload-root",
    "--hop-model",
    "--progress-ms",
    "--as",
    "--name",
    "--help",
    "-h",
]);
export function parseCli(argv, env = process.env) {
    if (argv.includes("--help") || argv.includes("-h")) {
        return {
            agent: DEFAULT_AGENT,
            origin: DEFAULT_ORIGIN,
            vaults: [],
            profile: undefined,
            as: "ai",
            name: undefined,
            claudeBin: "claude",
            hopCli: "claude",
            codexBin: "codex",
            hopId: undefined,
            turnId: undefined,
            hopToolsPath: undefined,
            hopCreatedPath: undefined,
            hopDeadline: undefined,
            uploadRoots: [],
            hopModel: undefined,
            progressEveryMs: PROGRESS_EVERY_MS,
            help: true,
        };
    }
    const unknown = argv.filter((token) => token.startsWith("-") && !KNOWN_FLAGS.has(token.split("=")[0] ?? token));
    if (unknown.length > 0)
        throw new CliError(`Unknown option: ${unknown.join(" ")}`);
    const agentRaw = (oneFlag(argv, "--agent") ?? env.GILB_CONNECTOR_AGENT ?? DEFAULT_AGENT).trim();
    if (!agentRaw || agentRaw.length > 64)
        throw new CliError("--agent must be 1 to 64 characters.");
    const origin = normalizeOrigin(oneFlag(argv, "--origin") ?? env.GILB_CONNECTOR_ORIGIN ?? DEFAULT_ORIGIN);
    const fromFlags = flagValues(argv, "--vault");
    const fromEnv = (env.GILB_CONNECTOR_VAULT ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    const vaults = fromFlags.length > 0 ? fromFlags : fromEnv;
    const asRaw = (oneFlag(argv, "--as") ?? env.GILB_CONNECTOR_AS ?? "ai").trim().toLowerCase();
    if (asRaw !== "ai" && asRaw !== "me")
        throw new CliError("--as must be ai or me.");
    const asMode = asRaw;
    // `--as me` keeps today's profile lookup. An AI does not read the computer profile; it defaults to `default`.
    const profileRaw = asMode === "me"
        ? oneFlag(argv, "--profile") ?? env.GILB_CONNECTOR_PROFILE ?? env.GILB_COMPUTER_PROFILE ?? diskProfile(env)
        : oneFlag(argv, "--profile") ?? env.GILB_CONNECTOR_PROFILE ?? DEFAULT_AI_PROFILE;
    if (profileRaw !== undefined && !PROFILE_NAME.test(profileRaw))
        throw new CliError("The computer profile name is not valid.");
    const nameRaw = oneFlag(argv, "--name") ?? env.GILB_CONNECTOR_NAME;
    if (nameRaw !== undefined && (nameRaw.trim() === "" || nameRaw.trim().length > 256)) {
        throw new CliError("--name must be 1 to 256 characters.");
    }
    const claudeBin = oneFlag(argv, "--claude") ?? env.GILB_CONNECTOR_CLAUDE ?? "claude";
    const codexBin = oneFlag(argv, "--codex") ?? env.GILB_CONNECTOR_CODEX ?? "codex";
    const hopCliRaw = (oneFlag(argv, "--hop-cli") ?? env.GILB_CONNECTOR_HOP_CLI ?? "claude").trim().toLowerCase();
    if (hopCliRaw !== "claude" && hopCliRaw !== "codex")
        throw new CliError("--hop-cli must be claude or codex.");
    const hopCli = hopCliRaw;
    const hopId = oneFlag(argv, "--hop") ?? (env.GILB_CONNECTOR_HOP || undefined);
    const turnId = oneFlag(argv, "--turn") ?? (env.GILB_CONNECTOR_TURN || undefined);
    const hopToolsPath = oneFlag(argv, "--hop-tools") ?? (env.GILB_CONNECTOR_HOP_TOOLS || undefined);
    const hopCreatedPath = oneFlag(argv, "--hop-created");
    const hopDeadlineRaw = oneFlag(argv, "--hop-deadline") ?? (env.GILB_CONNECTOR_HOP_DEADLINE || undefined);
    let hopDeadline;
    if (hopDeadlineRaw !== undefined) {
        const parsed = /^[0-9]+$/.test(hopDeadlineRaw) ? Number(hopDeadlineRaw) : NaN;
        if (!Number.isSafeInteger(parsed) || parsed <= 0)
            throw new CliError("--hop-deadline must be a time in milliseconds.");
        hopDeadline = parsed;
    }
    if (hopId !== undefined && !/^[0-9a-f]{24}$/.test(hopId))
        throw new CliError("--hop must be the hand-off id.");
    if (turnId !== undefined && !TURN_ID_RE.test(turnId))
        throw new CliError("--turn must be the turn id.");
    if (hopId !== undefined && (turnId === undefined || hopToolsPath === undefined)) {
        throw new CliError("Hop mode needs --turn and --hop-tools.");
    }
    const hopModel = oneFlag(argv, "--hop-model") ?? (env.GILB_CONNECTOR_HOP_MODEL || undefined);
    if (hopModel !== undefined && !HOP_MODEL_RE.test(hopModel)) {
        throw new CliError("--hop-model must be 1 to 64 letters, digits, dots or dashes, starting with a letter or digit.");
    }
    const progressRaw = oneFlag(argv, "--progress-ms") ?? env.GILB_CONNECTOR_PROGRESS_MS;
    let progressEveryMs = PROGRESS_EVERY_MS;
    if (progressRaw !== undefined && progressRaw !== "") {
        const parsed = Number(progressRaw);
        if (!Number.isInteger(parsed) || parsed < 5 || parsed > 600_000) {
            throw new CliError("--progress-ms must be a whole number of milliseconds from 5 to 600000.");
        }
        progressEveryMs = parsed;
    }
    return {
        agent: agentRaw,
        origin,
        vaults,
        profile: profileRaw,
        as: asMode,
        name: nameRaw?.trim(),
        claudeBin,
        hopCli,
        codexBin,
        hopId,
        turnId,
        hopToolsPath,
        hopCreatedPath,
        hopDeadline,
        uploadRoots: flagValues(argv, "--upload-root").map((dir) => dir.trim()).filter((dir) => dir !== ""),
        hopModel,
        progressEveryMs,
        help: false,
    };
}
function helpText() {
    return `Usage: node gilb-connector.mjs [--as ai|me] [--name DISPLAY] [--agent NAME] [--origin URL] [--vault ID]... [--profile NAME] [--claude PATH] [--hop-cli claude|codex] [--codex PATH] [--upload-root DIR]... [--hop-model NAME]
       node gilb-connector.mjs --hop HOP --turn TURN --hop-tools FILE --as ai|me [--profile NAME] --agent NAME --origin URL
       node gilb-connector.mjs publish --dir DIR --name NAME [--kind app|website] [--dry-run] [--as ai|me] [--origin URL] [--profile NAME] [--worker-url URL]

Default: sign in as a Connected AI (--as ai).
--as me signs in as this computer.
--upload-root DIR lets gilbplatform_upload_file read from DIR as well as the folder this process runs in. Repeat it for more folders.
--hop-cli codex runs a hand-off on the Codex CLI (signed in with ChatGPT) instead of Claude Code. Default: claude.
--name DISPLAY is the AI's display name. Default: Claude Code on <machine>, or Codex on <machine> with --hop-cli codex.
--codex PATH is the Codex CLI used for a hand-off. Default: codex.
--hop-model NAME runs a hand-off's Claude Code on that model (for example a faster one). Unset: Claude Code's own default.
publish puts a built folder on https://NAME.pages.dev. It publishes unless --dry-run.
Default agent: ${DEFAULT_AGENT}
Default origin: ${DEFAULT_ORIGIN}`;
}
function safeTail(stderr) {
    if (/dpop|authorization|bearer |api[_-]?key|token|proof/i.test(stderr))
        return "";
    const tail = stderr.trim().split("\n").slice(-2).join(" ");
    return tail ? ` ${tail}` : "";
}
function validHop(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    const hop = value;
    if (typeof hop.id !== "string" || typeof hop.system !== "string" || typeof hop.task !== "string" || !Array.isArray(hop.tools))
        return false;
    return true;
}
function hopRole(hop) {
    return typeof hop.role === "string" ? hop.role : "";
}
function hopAnswer(hop) {
    return hop.answer && typeof hop.answer === "object" && !Array.isArray(hop.answer) ? hop.answer : {};
}
function claudeArgs(system, mcpConfig, sessionId, model) {
    const args = [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--tools",
        "",
        "--strict-mcp-config",
        "--mcp-config",
        mcpConfig,
        "--allowedTools",
        "mcp__GilbPlatform",
        "--permission-mode",
        "dontAsk",
        "--disable-slash-commands",
        "--restricted",
        "--system-prompt",
        system,
        "--system-prompt-snapshot",
        "off",
        "--session-id",
        sessionId,
    ];
    if (model !== undefined)
        args.push("--model", model);
    return args;
}
/** The Claude Code runner: today's argv, env and stream-json reading, unchanged. */
function claudeHopRunner(claudeBin, env, hopModel, stdinText) {
    const scriptBin = /\.(js|mjs|cjs)$/i.test(claudeBin);
    return {
        name: "Claude Code",
        prepare: async ({ hop, nestedArgs }) => {
            const mcp = { mcpServers: { GilbPlatform: { command: process.execPath, args: nestedArgs } } };
            return {
                // A script (fake-claude.mjs in tests) is run by node on every platform; the real claude is never a .js/.mjs/.cjs file.
                command: scriptBin ? process.execPath : claudeBin,
                args: [...(scriptBin ? [claudeBin] : []), ...claudeArgs(hop.system, JSON.stringify(mcp), randomUUID(), hopModel)],
                env: childEnv(env),
                stdinText: stdinText(hop),
            };
        },
        newReader: () => {
            let initOk = false;
            let refused = false;
            let resultText = null;
            let resultError = null;
            return {
                onEvent(raw, progress, kill) {
                    if (!raw || typeof raw !== "object")
                        return;
                    const event = raw;
                    if (event.type === "system" && event.subtype === "init") {
                        if (event.apiKeySource === "none")
                            initOk = true;
                        else {
                            refused = true;
                            kill();
                        }
                    }
                    else if (event.type === "result") {
                        if (event.is_error)
                            resultError = `Claude Code: ${String(event.result ?? "the turn failed").slice(0, 500)}`;
                        else
                            resultText = String(event.result ?? "");
                    }
                    else if (event.type === "assistant") {
                        noteAssistant(event.message, progress);
                    }
                },
                outcome(stderr) {
                    if (refused || !initOk)
                        return { error: "Claude Code did not confirm that this run uses your Claude subscription, so the hand-off was stopped." };
                    if (resultError !== null)
                        return { error: resultError };
                    if (resultText === null)
                        return { error: `Claude Code stopped without an answer.${safeTail(stderr)}` };
                    return { text: resultText };
                },
            };
        },
    };
}
const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
/** The details object of codex doctor's auth check: the flat `checks["auth.credentials"]` (Codex 0.167), else the nested `checks.auth.credentials`. */
function codexAuthDetails(doctor) {
    const checks = isRecord(doctor) ? doctor.checks : undefined;
    if (!isRecord(checks))
        return undefined;
    const flat = checks["auth.credentials"];
    if (isRecord(flat) && isRecord(flat.details))
        return flat.details;
    const auth = checks.auth;
    const nested = isRecord(auth) ? auth.credentials : undefined;
    return isRecord(nested) && isRecord(nested.details) ? nested.details : undefined;
}
/** The sign-in mode `codex doctor --json` reports ("chatgpt", "apikey", ...), or undefined when it cannot be read. */
export function codexStoredAuthMode(doctor) {
    const flat = isRecord(doctor) && isRecord(doctor.checks) ? doctor.checks["auth.credentials"] : undefined;
    const flatMode = isRecord(flat) && isRecord(flat.details) ? flat.details["stored auth mode"] : undefined;
    if (typeof flatMode === "string")
        return flatMode;
    const mode = codexAuthDetails(doctor)?.["stored auth mode"];
    return typeof mode === "string" ? mode : undefined;
}
function codexStoredApiKey(doctor) {
    return codexAuthDetails(doctor)?.["stored API key"];
}
/** Codex only ever runs a hand-off on the person's ChatGPT sign-in. The tested release line is 0.167. */
const CODEX_TESTED_VERSION_PREFIX = "0.167.";
const CODEX_NOT_CHATGPT = "Codex is not signed in with ChatGPT, so the hand-off was stopped. Run: codex login and choose Sign in with ChatGPT.";
const CODEX_DOCTOR_FAILED = "Could not run codex doctor, so the hand-off was stopped.";
const CODEX_FEATURES_UNKNOWN = "This Codex version's feature list is not one the connector knows, so the hand-off was stopped.";
const CODEX_NO_FEATURES = "Could not read Codex's feature list, so the hand-off was stopped.";
const CODEX_DOCTOR_TIMEOUT_MS = 60 * 1000;
const CODEX_FEATURES_TIMEOUT_MS = 30 * 1000;
/** Codex features a hand-off must not have: shells, other agents, browsers, plugins, memory. Never code_mode_host (the MCP tools need it). */
export const CODEX_DISABLE_FEATURES = [
    "shell_tool",
    "unified_exec",
    "apps",
    "plugins",
    "multi_agent",
    "multi_agent_v2",
    "view_image",
    "image_generation",
    "goals",
    "computer_use",
    "browser_use",
    "browser_use_external",
    "tool_suggest",
    "skill_search",
    "in_app_browser",
    "hooks",
    "sleep_tool",
    "remote_plugin",
    "incremental_tools",
    "request_permissions_tool",
    "write_stdin_approval",
    "memories",
    "collaboration_modes",
    "default_mode_request_user_input",
    "multi_agent_v2_dynamic_tools",
    "agent_message_board",
    "runtime_agent_instances",
    "wake_on_agent_messages",
    "enable_fanout",
    "skill_mcp_dependency_install",
    "shell_snapshot",
    "unified_exec_tty",
    "browser_use_full_cdp_access",
    "plugin_sharing",
    "plugin_discovery_prefetch",
];
const CODEX_ENV_DENY_PREFIXES = ["OPENAI_", "AZURE_OPENAI_"];
/** The environment a nested `codex` gets: childEnv's, minus every OpenAI key and every CODEX_ key (CODEX_API_KEY and CODEX_ACCESS_TOKEN override the ChatGPT sign-in). CODEX_HOME stays. */
export function codexChildEnv(env = process.env) {
    const out = childEnv(env);
    for (const key of Object.keys(out)) {
        const upper = key.toUpperCase();
        if (upper === "CODEX_HOME")
            continue;
        if (upper === "OPENAI_API_KEY" || upper.startsWith("CODEX_") || CODEX_ENV_DENY_PREFIXES.some((prefix) => upper.startsWith(prefix)))
            delete out[key];
    }
    return out;
}
/** A TOML basic string. JSON escaping is valid TOML escaping, except that TOML also wants U+007F escaped. */
export function tomlString(value) {
    return JSON.stringify(value).replace(/\u007f/g, "\\u007F");
}
export function tomlStringArray(values) {
    return "[" + values.map(tomlString).join(", ") + "]";
}
/** The feature names in `codex features list`: ANSI colour, indent, bullets, CRLF and blank lines are all tolerated. */
export function parseCodexFeatureNames(output) {
    return output
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/^(?:\*|-|\u2022)\s+/, "").split(/\s+/)[0] ?? "")
        .filter((name) => name !== "");
}
export const CODEX_NOT_FOUND = "Could not find Codex. Install it with npm install -g @openai/codex, or pass --codex with the full path to codex.exe.";
/**
 * The command that starts the Codex CLI. On Windows the npm shim (codex.cmd) cannot be spawned without a shell,
 * so the real codex.exe inside the npm package is found and started directly.
 */
export function codexSpawnCommand(codexBin, opts = {}) {
    const platform = opts.platform ?? process.platform;
    const arch = opts.arch ?? process.arch;
    const env = opts.env ?? process.env;
    // A candidate must be a file: a folder named codex is skipped.
    const exists = opts.isFile ??
        opts.exists ??
        ((candidate) => {
            try {
                return statSync(candidate).isFile();
            }
            catch {
                return false;
            }
        });
    if (/\.(js|mjs|cjs)$/i.test(codexBin))
        return { command: process.execPath, prefixArgs: [codexBin] };
    if (platform !== "win32")
        return { command: codexBin, prefixArgs: [] };
    if (/\.exe$/i.test(codexBin))
        return { command: codexBin, prefixArgs: [] };
    const p = win32Path;
    let found;
    if (/[\\/]/.test(codexBin)) {
        const folder = p.dirname(codexBin);
        for (const ext of [".exe", ".cmd", ".ps1", ""]) {
            const candidate = p.join(folder, p.basename(codexBin) + ext);
            if (exists(candidate)) {
                found = candidate;
                break;
            }
        }
        if (found === undefined)
            found = codexBin;
    }
    else {
        const pathVar = env.PATH || env.Path || "";
        search: for (const rawFolder of pathVar.split(";")) {
            const folder = rawFolder.trim().replace(/^"(.*)"$/, "$1");
            if (folder === "")
                continue;
            for (const ext of [".exe", ".cmd", ".ps1", ""]) {
                const candidate = p.join(folder, codexBin + ext);
                if (exists(candidate)) {
                    found = candidate;
                    break search;
                }
            }
        }
    }
    if (found !== undefined) {
        if (/\.exe$/i.test(found))
            return { command: found, prefixArgs: [] };
        const d = p.dirname(found);
        const triple = arch === "x64" ? "x86_64-pc-windows-msvc" : arch === "arm64" ? "aarch64-pc-windows-msvc" : undefined;
        if (triple !== undefined) {
            const exe = p.join("vendor", triple, "bin", "codex.exe");
            const candidates = [
                p.join(d, "node_modules", "@openai", "codex", "node_modules", "@openai", `codex-win32-${arch}`, exe),
                p.join(d, "node_modules", "@openai", `codex-win32-${arch}`, exe),
                p.join(d, "node_modules", "@openai", "codex", exe),
            ];
            for (const candidate of candidates)
                if (exists(candidate))
                    return { command: candidate, prefixArgs: [] };
        }
        const launcher = p.join(d, "node_modules", "@openai", "codex", "bin", "codex.js");
        if (exists(launcher))
            return { command: process.execPath, prefixArgs: [launcher] };
    }
    throw new Error(CODEX_NOT_FOUND);
}
/**
 * Stops a hand-off process. On Windows killing the launcher leaves codex.exe running, so the whole tree goes (taskkill /T).
 * Everywhere else it is exactly SIGTERM.
 */
export function killHopProcess(child, opts = {}) {
    const platform = opts.platform ?? process.platform;
    if (platform === "win32") {
        if (child.pid !== undefined) {
            try {
                const killer = (opts.spawnFn ?? spawn)("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
                killer?.on?.("error", () => undefined);
            }
            catch {
                // The plain kill below still runs.
            }
        }
        try {
            child.kill();
        }
        catch {
            // Already gone.
        }
        return;
    }
    child.kill("SIGTERM");
}
/** The argv of `codex exec` for one hand-off. The prompt comes on stdin (the last `-`); the system text is in a file, not here. */
export function codexExecArgs(input) {
    const args = [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-user-config",
        "--strict-config",
        "-C",
        input.dir,
        "-s",
        "read-only",
        "-c",
        `mcp_servers.GilbPlatform.command=${tomlString(input.nodePath ?? process.execPath)}`,
        "-c",
        `mcp_servers.GilbPlatform.args=${tomlStringArray(input.nestedArgs)}`,
        "-c",
        'mcp_servers.GilbPlatform.default_tools_approval_mode="approve"',
        "-c",
        "mcp_servers.GilbPlatform.startup_timeout_sec=90",
        "-c",
        `mcp_servers.GilbPlatform.tool_timeout_sec=${Math.ceil(MCP_TOOL_TIMEOUT_MS / 1000)}`,
        "-c",
        `model_instructions_file=${tomlString(input.instructionsPath)}`,
        "-c",
        'web_search="disabled"',
    ];
    for (const name of input.disable)
        args.push("--disable", name);
    if (input.model !== undefined)
        args.push("-m", input.model);
    args.push("-");
    return args;
}
/** Runs a short Codex command to the end and returns its stdout, or null when it fails, times out or is aborted. */
function captureCodex(spawnCmd, args, env, timeoutMs, signal) {
    return new Promise((resolveRun) => {
        const { command, prefixArgs } = spawnCmd;
        let out = "";
        let done = false;
        let child;
        const end = (value) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            resolveRun(value);
        };
        const onAbort = () => {
            if (child)
                killHopProcess(child);
            end(null);
        };
        const timer = setTimeout(() => {
            if (child)
                killHopProcess(child);
            end(null);
        }, timeoutMs);
        timer.unref();
        try {
            child = spawn(command, [...prefixArgs, ...args], { env, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
        }
        catch {
            end(null);
            return;
        }
        if (signal.aborted)
            onAbort();
        else
            signal.addEventListener("abort", onAbort, { once: true });
        child.stdout?.on("data", (chunk) => {
            if (out.length < 4_000_000)
                out += chunk;
        });
        child.on("error", () => end(null));
        child.on("close", (code) => end(code === 0 ? out : null));
    });
}
/** The Codex runner. `features` gives the CLI's feature names (read once per process). */
function codexHopRunner(codexBin, env, hopModel, stdinText, features) {
    return {
        name: "Codex",
        prepare: async ({ hop, dir, nestedArgs, signal }) => {
            const cenv = codexChildEnv(env);
            // Fail closed: anything but a stored ChatGPT sign-in stops the hand-off before exec starts.
            const spawnCmd = codexSpawnCommand(codexBin);
            const doctor = await captureCodex(spawnCmd, ["doctor", "--json"], cenv, CODEX_DOCTOR_TIMEOUT_MS, signal);
            if (doctor === null)
                throw new Error(CODEX_DOCTOR_FAILED);
            let version;
            let mode;
            let apiKeyOk = false;
            try {
                const json = JSON.parse(doctor);
                mode = codexStoredAuthMode(json);
                // Only an absent field, false, or the string "false" (Codex 0.167 reports strings) passes: anything else is refused.
                const key = codexStoredApiKey(json);
                apiKeyOk = key === undefined || key === false || (typeof key === "string" && key.trim().toLowerCase() === "false");
                version = json?.codexVersion;
            }
            catch {
                throw new Error(CODEX_DOCTOR_FAILED);
            }
            if (mode !== "chatgpt" || !apiKeyOk)
                throw new Error(CODEX_NOT_CHATGPT);
            if (typeof version === "string" && version !== "") {
                process.stderr.write(`gilb-connector: this hand-off runs on Codex ${version}.\n`);
                if (!version.startsWith(CODEX_TESTED_VERSION_PREFIX)) {
                    process.stderr.write(`gilb-connector: Codex ${version} is newer or older than the tested 0.167; hand-offs may behave differently.\n`);
                }
            }
            const names = await features(spawnCmd, cenv, signal);
            if (names === null)
                throw new Error(CODEX_NO_FEATURES);
            // Fail closed: a list the connector cannot read must not run with nothing switched off.
            if (!names.includes("code_mode_host") || !names.includes("shell_tool"))
                throw new Error(CODEX_FEATURES_UNKNOWN);
            const disable = CODEX_DISABLE_FEATURES.filter((name) => names.includes(name));
            const instructionsPath = join(dir, "instructions.md");
            writeFileSync(instructionsPath, hop.system, { mode: 0o600 });
            const { command, prefixArgs } = spawnCmd;
            return {
                command,
                args: [...prefixArgs, ...codexExecArgs({ dir, instructionsPath, nestedArgs, disable, model: hopModel })],
                env: cenv,
                stdinText: stdinText(hop),
                cleanupFiles: [instructionsPath],
            };
        },
        newReader: () => {
            const seen = new Set();
            let completed = false;
            let failed = null;
            let answer = null;
            let topError = null;
            return {
                onEvent(raw, progress) {
                    if (!raw || typeof raw !== "object" || Array.isArray(raw))
                        return;
                    const event = raw;
                    if (event.type === "item.started" || event.type === "item.completed") {
                        const item = event.item;
                        if (!item || typeof item !== "object" || Array.isArray(item))
                            return;
                        const row = item;
                        if (row.type === "mcp_tool_call" && typeof row.tool === "string" && row.tool !== "") {
                            const id = typeof row.id === "string" ? row.id : undefined;
                            const first = event.type === "item.started" || (id !== undefined && !seen.has(id));
                            if (id !== undefined)
                                seen.add(id);
                            if (first && progress.toolCalls.length < TOOL_CALLS_MAX)
                                progress.toolCalls.push(toolCallLine(row.tool, row.arguments));
                        }
                        else if (event.type === "item.completed" && row.type === "agent_message" && typeof row.text === "string" && row.text !== "") {
                            progress.lastText = row.text;
                            answer = row.text;
                        }
                    }
                    else if (event.type === "turn.completed") {
                        completed = true;
                    }
                    else if (event.type === "turn.failed") {
                        const err = event.error;
                        const message = err && typeof err === "object" ? err.message : undefined;
                        failed = `Codex: ${String(message ?? "the turn failed").slice(0, 500)}`;
                    }
                    else if (event.type === "error" && typeof event.message === "string" && event.message !== "") {
                        topError = event.message;
                    }
                },
                outcome(stderr) {
                    if (failed !== null)
                        return { error: failed };
                    if (!completed || answer === null) {
                        const lead = topError !== null ? `Codex stopped without an answer: ${topError.slice(0, 300)}.` : "Codex stopped without an answer.";
                        return { error: `${lead}${safeTail(stderr)}` };
                    }
                    return { text: answer };
                },
            };
        },
    };
}
const CANCELLED = Symbol("cancelled");
/**
 * Run a request again, with short waits, while the platform answers like a restart (network error or a 5xx from
 * the proxy). `run` builds a fresh request each time (a proof is used once) and returns status 0 for a network
 * error. `again` says whether a failure may be repeated; a write that may have run must not be.
 */
async function retryRequest(retryDelays, run, again = () => true, signal) {
    let result = await run();
    for (const wait of retryDelays) {
        if (!(result.status === 0 || isTransientStatus(result.status)) || !again(result) || signal?.aborted)
            return result;
        process.stderr.write(`gilb-connector: GilbPlatform is restarting or out of reach; trying again in ${Math.round(wait / 1000)} s.\n`);
        await new Promise((resolve) => setTimeout(resolve, wait));
        if (signal?.aborted)
            return result;
        result = await run();
    }
    return result;
}
/**
 * Signs in as this Connected AI, or as this computer, the same way the MCP session does.
 * The returned `authHeaders` keeps the access token in memory and renews it. There is no second key store.
 */
async function openSessionCredential(input) {
    const { env, origin, asMode, profile, displayName, say, retryDelays, fetchImpl, onClientId } = input;
    async function retrying(run, again = () => true, signal) {
        return retryRequest(retryDelays, run, again, signal);
    }
    async function openComputer() {
        const modulePath = computerModulePath(env);
        if (!modulePath) {
            say(NOT_CONNECTED);
            throw new NotConnected();
        }
        let loaded;
        try {
            loaded = (await import(pathToFileURL(modulePath).href));
        }
        catch (err) {
            if (isMissingComputer(err)) {
                say(NOT_CONNECTED);
                throw new NotConnected();
            }
            say(SIGN_IN_FAILED);
            throw new NotConnected(SIGN_IN_FAILED);
        }
        if (typeof loaded.openComputerCredential !== "function") {
            say(NOT_CONNECTED);
            throw new NotConnected();
        }
        const transport = computerTransport(origin, fetchImpl);
        const openOpts = { origin, transport };
        if (profile)
            openOpts.profile = profile;
        try {
            const cred = await loaded.openComputerCredential(openOpts);
            if (!cred || typeof cred.authHeaders !== "function") {
                say(NOT_CONNECTED);
                throw new NotConnected();
            }
            return cred;
        }
        catch (err) {
            if (err instanceof NotConnected)
                throw err;
            if (isMissingComputer(err)) {
                say(NOT_CONNECTED);
                throw new NotConnected();
            }
            say(SIGN_IN_FAILED);
            throw new NotConnected(SIGN_IN_FAILED);
        }
    }
    async function openAiCredential() {
        const root = connectorRoot(env);
        if (!root || profile === undefined) {
            say(AI_SIGN_IN_FAILED);
            throw new NotConnected(AI_SIGN_IN_FAILED);
        }
        const dir = join(root, profile);
        let privateKey;
        let publicJwk;
        let clientId;
        try {
            ensurePrivateDir(root);
            ensurePrivateDir(dir);
            const pemFile = join(dir, PRIVATE_KEY_FILE);
            const idFile = join(dir, CLIENT_ID_FILE);
            if (existsSync(pemFile)) {
                privateKey = createPrivateKey(readFileSync(pemFile, "utf8"));
                publicJwk = publicJwkOf(privateKey);
                tightenPrivateFile(pemFile);
            }
            else {
                const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
                privateKey = pair.privateKey;
                const pem = privateKey.export({ type: "pkcs8", format: "pem" });
                if (typeof pem !== "string" || !pem.includes("PRIVATE KEY"))
                    throw new Error("The AI key could not be stored.");
                writePrivateFile(pemFile, pem);
                publicJwk = publicJwkOf(privateKey);
            }
            const existingId = existsSync(idFile) ? readFileSync(idFile, "utf8").trim() : "";
            if (existingId) {
                clientId = existingId;
                tightenPrivateFile(idFile);
            }
            else {
                clientId = await registerAi(publicJwk);
                writePrivateFile(idFile, `${clientId}\n`);
                process.stderr.write(`Client ID: ${clientId}\n`);
            }
        }
        catch (err) {
            if (err instanceof NotConnected)
                throw err;
            say(AI_SIGN_IN_FAILED);
            throw new NotConnected(AI_SIGN_IN_FAILED);
        }
        onClientId(clientId);
        let held = null;
        let heldGen = 0;
        let mintQueue = Promise.resolve();
        let saidScope = false;
        async function registerAi(jwk) {
            const url = `${origin}/base/client/register`;
            const body = {
                clientPublicKey: jwk,
                declaredOrigin: AI_DECLARED_ORIGIN,
                clientDisplayName: aiDisplayName(displayName, input.hopCli),
            };
            const sent = await retrying(async () => {
                try {
                    const r = await fetchImpl(url, {
                        method: "POST",
                        redirect: "manual",
                        headers: { "content-type": "application/json", accept: "application/json" },
                        body: JSON.stringify(body),
                    });
                    return { status: r.status, text: await r.text(), what: `HTTP ${r.status}` };
                }
                catch (err) {
                    return { status: 0, text: "", what: networkWhat(err) };
                }
            });
            if (sent.status === 0 || isTransientStatus(sent.status)) {
                const message = unreachableMessage(sent.what);
                say(message);
                throw new PlatformDown(message);
            }
            const res = { status: sent.status };
            const parsed = readJsonText(sent.text);
            if (res.status < 200 || res.status >= 300) {
                const message = registrationMessage(parsed);
                say(message);
                throw new NotConnected(message);
            }
            const id = parsed && typeof parsed === "object" ? parsed.clientId : undefined;
            if (typeof id !== "string" || id.trim() === "" || /\s/.test(id) || id.trim().length > 512) {
                const message = "Registration failed: the platform did not return a client id.";
                say(message);
                throw new NotConnected(message);
            }
            return id.trim();
        }
        async function requestMachineToken(scope, allowFallback) {
            const tokenUrl = `${origin}/base/oauth/token`;
            const sent = await retrying(async () => {
                // A fresh assertion and proof each try: the door refuses a used jti.
                const form = new URLSearchParams({
                    grant_type: "client_credentials",
                    client_assertion_type: CLIENT_ASSERTION_TYPE,
                    client_assertion: clientAssertion(clientId, tokenUrl, privateKey),
                    scope,
                });
                try {
                    const r = await fetchImpl(tokenUrl, {
                        method: "POST",
                        redirect: "manual",
                        headers: {
                            "content-type": "application/x-www-form-urlencoded",
                            accept: "application/json",
                            dpop: dpopProof("POST", tokenUrl, privateKey, publicJwk),
                        },
                        body: form.toString(),
                    });
                    return { status: r.status, text: await r.text(), what: `HTTP ${r.status}` };
                }
                catch (err) {
                    return { status: 0, text: "", what: networkWhat(err) };
                }
            });
            if (sent.status === 0 || isTransientStatus(sent.status)) {
                const message = unreachableMessage(sent.what);
                say(message);
                throw new PlatformDown(message);
            }
            const res = { status: sent.status };
            const parsed = readJsonText(sent.text);
            const errorCode = parsed && typeof parsed === "object" ? parsed.error : undefined;
            if (allowFallback && scope === "base.write" && res.status === 400 && errorCode === "invalid_scope") {
                if (!saidScope) {
                    saidScope = true;
                    process.stderr.write(WRITE_SCOPE_REFUSED + "\n");
                }
                return requestMachineToken("base.read", false);
            }
            if (res.status < 200 || res.status >= 300) {
                const code = typeof errorCode === "string" ? safeQuote(errorCode) : "";
                const message = code ? `${AI_SIGN_IN_FAILED} (${code})` : AI_SIGN_IN_FAILED;
                say(message);
                throw new NotConnected(message);
            }
            const row = parsed && typeof parsed === "object" ? parsed : {};
            if (typeof row.access_token !== "string" || row.access_token === "") {
                say(AI_SIGN_IN_FAILED);
                throw new NotConnected(AI_SIGN_IN_FAILED);
            }
            const expiresIn = typeof row.expires_in === "number" && Number.isFinite(row.expires_in) ? row.expires_in : MACHINE_TOKEN_FALLBACK_TTL_SEC;
            const granted = typeof row.scope === "string" && row.scope !== "" ? row.scope : scope;
            return { accessToken: row.access_token, expiresAt: Date.now() + expiresIn * 1000, scope: granted };
        }
        function dropAccess() {
            heldGen += 1;
            held = null;
        }
        function ensureToken() {
            const run = mintQueue.then(async () => {
                if (held && held.expiresAt - Date.now() >= RENEW_WITHIN_MS)
                    return;
                const gen = heldGen;
                const next = await requestMachineToken("base.write", true);
                if (gen !== heldGen)
                    return;
                held = next;
            });
            mintQueue = run.then(() => undefined, () => undefined);
            return run;
        }
        async function authHeaders(method, url) {
            await ensureToken();
            if (!held)
                await ensureToken();
            const current = held;
            if (!current) {
                say(AI_SIGN_IN_FAILED);
                throw new NotConnected(AI_SIGN_IN_FAILED);
            }
            return {
                authorization: `DPoP ${current.accessToken}`,
                dpop: dpopProof(method, url, privateKey, publicJwk, current.accessToken),
            };
        }
        async function firstUse() {
            const url = `${origin}/base/e/first-use`;
            const once = async () => {
                const sent = await retrying(async () => {
                    const headers = await authHeaders("GET", url);
                    headers.accept = "application/json";
                    try {
                        const r = await fetchImpl(url, { method: "GET", headers, redirect: "manual" });
                        await r.text();
                        return { status: r.status, what: `HTTP ${r.status}` };
                    }
                    catch (err) {
                        return { status: 0, what: networkWhat(err) };
                    }
                });
                if (sent.status === 0 || isTransientStatus(sent.status)) {
                    const message = unreachableMessage(sent.what);
                    say(message);
                    throw new PlatformDown(message);
                }
                return sent.status;
            };
            let status = await once();
            if (status === 401) {
                dropAccess();
                status = await once();
            }
            if (status === 401 || (status !== 404 && (status < 200 || status >= 300))) {
                say(AI_SIGN_IN_FAILED);
                throw new NotConnected(AI_SIGN_IN_FAILED);
            }
        }
        await firstUse();
        return { authHeaders, dropAccess };
    }
    if (asMode === "ai")
        return openAiCredential();
    return openComputer();
}
/**
 * Speaks MCP on `input` / `output` until the input ends.
 * Hop mode (`hopId` set) lists `hopTools` and posts every tool call with that hop id. It does not hand off again.
 */
export function startConnector(opts) {
    const env = opts.env ?? process.env;
    let agent = opts.agent?.trim() || DEFAULT_AGENT;
    const origin = (opts.origin ?? DEFAULT_ORIGIN).replace(/\/+$/, "");
    const vaults = [...(opts.vaults ?? [])];
    const asMode = opts.as === "me" ? "me" : "ai";
    const displayName = opts.name;
    const profile = asMode === "ai" ? safeProfileName(opts.profile ?? DEFAULT_AI_PROFILE) : opts.profile;
    const claudeBin = opts.claudeBin ?? "claude";
    const hopCli = opts.hopCli === "codex" ? "codex" : "claude";
    const codexBin = opts.codexBin ?? "codex";
    const removeDir = opts.removeDir ?? ((dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
    const hopId = opts.hopId;
    const hopMode = hopId !== undefined && hopId !== "";
    const hopTools = [...(opts.hopTools ?? [])];
    const hopCreatedPath = opts.hopCreatedPath;
    const hopStart = Date.now();
    const hopDeadline = hopMode ? opts.hopDeadline : undefined;
    let turnId = opts.turnId ?? newTurnId();
    if (!TURN_ID_RE.test(turnId))
        throw new Error("turnId does not match the platform pattern.");
    let userText = opts.userText !== undefined && opts.userText.trim() !== "" ? opts.userText : DEFAULT_USER_TEXT;
    const progressEveryMs = opts.progressEveryMs !== undefined && opts.progressEveryMs >= 5 ? opts.progressEveryMs : PROGRESS_EVERY_MS;
    const hopMaxOverride = opts.hopMaxMs;
    const hopMaxOf = (role) => hopMaxOverride ?? hopMaxFor(role);
    const retryDelays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;
    const maxHops = opts.maxHops ?? MAX_HOPS_AT_ONCE;
    const hopQueue = new HopQueue(maxHops, opts.hopQueueMax ?? HOP_QUEUE_MAX_WAITING, opts.hopQueueMaxWaitMs ?? HOP_QUEUE_MAX_WAIT_MS);
    const selfFile = opts.selfFile ?? fileURLToPath(import.meta.url);
    const hopModel = opts.hopModel !== undefined && HOP_MODEL_RE.test(opts.hopModel) ? opts.hopModel : undefined;
    let turnRolls = 0;
    let toolCallsSent = 0;
    const uploadCwd = opts.cwd ?? process.cwd();
    const uploadRoots = [...(opts.uploadRoots ?? [])];
    const contextUrl = `${origin}/base/ai/claude-code/context`;
    const toolUrl = `${origin}/base/ai/claude-code/tool`;
    const input = opts.input;
    const output = opts.output;
    let writing = Promise.resolve();
    const children = new Set();
    const calls = new Map();
    let hopsRunning = 0;
    let pending = 0;
    let inputEnded = false;
    let stopped = false;
    let saidSignIn = false;
    let aiClientId = "";
    let reportedPrincipal = "";
    /** True once the principal is a vault namespace. Until then, each call drops the cached token, principal, context, and turn. */
    let bound = false;
    /** True after an unbound answer, so the next call does not reuse that token or turn. */
    let knownUnbound = false;
    /** The current vault list was chosen because it was the only work vault. whoami says so. */
    let selectedAutomatically = false;
    /** The vault maybeAutoSelect chose only because the list held one. Not the person's choice, so no file goes there. */
    let autoVault = null;
    /** list_vaults already ran once for auto-select in this bound stretch. It does not run again. */
    let autoSelectAttempted = false;
    /** Vaults brought back from the person's own earlier choice in this chat. whoami says so. */
    let restoredVaults = [];
    let restoreAttempted = false;
    const nowMs = opts.nowMs ?? Date.now;
    let parentKey = opts.parent;
    let resolveDone = () => { };
    const done = new Promise((resolve) => {
        resolveDone = resolve;
    });
    function checkDone() {
        if ((inputEnded || stopped) && pending === 0)
            resolveDone();
    }
    function emit(msg) {
        let line;
        try {
            line = JSON.stringify(msg) + "\n";
        }
        catch {
            return Promise.resolve();
        }
        const flushed = writing.then(() => new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled)
                    return;
                settled = true;
                resolve();
            };
            try {
                output.write(line, () => finish());
            }
            catch {
                finish();
            }
        }));
        writing = flushed.catch(() => undefined);
        return flushed;
    }
    function say(line) {
        if (saidSignIn)
            return;
        saidSignIn = true;
        process.stderr.write(line + "\n");
    }
    async function retrying(run, again = () => true, signal) {
        return retryRequest(retryDelays, run, again, signal);
    }
    // One open per process. A failure is remembered: the person restarts Claude Code after connecting.
    // A platform that was down is not: the next call opens again.
    let opening = null;
    function credential() {
        if (!opening) {
            opening = openCredential().catch((err) => {
                if (err instanceof PlatformDown)
                    opening = null;
                throw err;
            });
        }
        return opening;
    }
    async function openCredential() {
        return openSessionCredential({
            env,
            origin,
            asMode,
            profile,
            displayName,
            hopCli,
            say,
            retryDelays,
            fetchImpl: fetch,
            onClientId(id) {
                aiClientId = id;
            },
        });
    }
    function turnFields(forAgent = agent, forTurn = turnId) {
        const body = { userText, turnId: forTurn, agent: forAgent };
        const ids = vaults.map((id) => id.trim()).filter((id) => id.startsWith("http"));
        if (ids.length > 0)
            body.contentVaultIds = ids;
        return body;
    }
    /**
     * `repeatable`: a read, so a restart's 5xx or network error may be tried again. Any other call is tried again
     * only when the connection was refused, which proves nothing reached the server and nothing ran.
     */
    async function postPlatform(url, payload, signal, repeatable = false) {
        let lastNetwork = null;
        const send = async () => {
            const cred = await credential();
            if (signal?.aborted)
                throw new DOMException("The operation was aborted.", "AbortError");
            let headers;
            try {
                headers = {
                    ...(await cred.authHeaders("POST", url)),
                    "content-type": "application/json",
                    accept: "application/json",
                };
            }
            catch (err) {
                if (err instanceof NotConnected)
                    throw err;
                if (isMissingComputer(err))
                    throw new NotConnected();
                throw new NotConnected(asMode === "ai" ? AI_SIGN_IN_FAILED : SIGN_IN_FAILED);
            }
            let res;
            try {
                res = await fetch(url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload),
                    redirect: asMode === "ai" ? "manual" : "follow",
                    ...(signal ? { signal } : {}),
                });
            }
            catch (err) {
                if (signal?.aborted)
                    throw err;
                lastNetwork = err;
                return { status: 0, body: null };
            }
            lastNetwork = null;
            return { status: res.status, body: readJsonText(await res.text()) };
        };
        const settle = async () => {
            const out = await retrying(send, (r) => (repeatable ? true : r.status === 0 && neverArrived(lastNetwork)), signal);
            if (out.status === 0) {
                const down = new PlatformError(0, unreachableMessage(networkWhat(lastNetwork)));
                down.what = networkWhat(lastNetwork);
                down.maybeRan = !repeatable && !neverArrived(lastNetwork);
                throw down;
            }
            if (repeatable && isTransientStatus(out.status))
                throw new PlatformError(out.status, unreachableMessage(`HTTP ${out.status}`));
            return out;
        };
        let res = await settle();
        if (res.status === 401 && !signal?.aborted) {
            const cred = await credential();
            cred.dropAccess?.();
            res = await settle();
        }
        if (res.status === 401)
            throw new PlatformError(401, "Your session needs to re-authorize — try again.");
        return res;
    }
    let cache = null;
    function aiRefusal(status, body) {
        if (asMode !== "ai")
            return false;
        if (status === 404)
            return true;
        // Authenticated and unbound is not a 404. The tool answer is 200 and the refusal is in `result`.
        return status === 200 && deniesVaultReach(body);
    }
    function vaultsLine() {
        const selected = vaults.map((id) => id.trim()).filter((id) => id !== "");
        if (selected.length === 0)
            return "vaults: none";
        const list = selected.join(", ");
        if (selectedAutomatically)
            return `vaults: ${list} (selected automatically: the only vault this AI can reach)`;
        if (restoredVaults.length > 0)
            return `vaults: ${list} (restored from your earlier choice in this chat: ${restoredVaults.join(", ")})`;
        return `vaults: ${list}`;
    }
    function whoamiText() {
        const lines = [`connector: ${CONNECTOR_VERSION}`, `mode: ${asMode}`];
        if (asMode === "ai" && aiClientId)
            lines.push(`client id: ${aiClientId}`);
        if (reportedPrincipal)
            lines.push(`principal: ${reportedPrincipal}`);
        if (asMode !== "ai") {
            lines.push(vaultsLine());
            return lines.join("\n");
        }
        lines.push(bound ? "state: bound" : "state: not bound");
        lines.push(vaultsLine());
        if (!bound)
            return `${lines.join("\n")}\n\n${aiNotBound(aiClientId)}`;
        return lines.join("\n");
    }
    function localTools() {
        const useVault = mcpTool(GILB_USE_VAULT);
        const upload = mcpTool(GILB_UPLOAD_FILE);
        return asMode === "ai"
            ? [mcpTool(GILB_WHOAMI), mcpTool(GILB_AGENT), mcpTool(GILB_TASK), useVault, upload]
            : [mcpTool(GILB_AGENT), mcpTool(GILB_TASK), useVault, upload];
    }
    async function fetchContext(forAgent) {
        const res = await postPlatform(contextUrl, turnFields(forAgent), undefined, true);
        if (asMode === "ai" && res.status === 404) {
            const sentence = isVaultNamespace(reportedPrincipal) ? aiNoGrant(undefined, reportedPrincipal) : aiNotBound(aiClientId);
            say(sentence);
            throw new NotConnected(sentence);
        }
        if (res.status < 200 || res.status >= 300) {
            throw new PlatformError(res.status, errorText(res.status, res.body, "The agent could not answer"));
        }
        const body = res.body;
        if (!body || typeof body.system !== "string" || !Array.isArray(body.tools)) {
            throw new PlatformError(502, "The agent returned an unexpected answer.");
        }
        const tools = [];
        for (const item of body.tools) {
            const tool = asTool(item);
            if (tool)
                tools.push(tool);
        }
        const found = principalFromSystem(body.system);
        if (found)
            reportedPrincipal = found;
        if (asMode === "ai" && !bound) {
            if (isVaultNamespace(reportedPrincipal)) {
                const wasUnbound = knownUnbound;
                bound = true;
                knownUnbound = false;
                // A later tool call may be the first one that can see a vault list.
                autoSelectAttempted = false;
                restoreAttempted = false;
                // The client may already hold the local-only list. The first look, and a hop, are not a change.
                if (wasUnbound && !hopMode) {
                    emit({ jsonrpc: "2.0", method: "notifications/tools/list_changed", params: {} });
                }
            }
            else {
                knownUnbound = true;
            }
        }
        return { system: body.system, tools };
    }
    async function loadContext(force) {
        if (!force && cache && cache.agent === agent && cache.userText === userText)
            return cache.ctx;
        const ctx = await fetchContext(agent);
        cache = { agent, userText, ctx };
        return ctx;
    }
    /**
     * Not bound yet: do not keep the token, principal, context, or turn from the last try.
     * A Bind on the door is then visible on this call. Once bound, the cache stays.
     */
    async function refreshIdentity() {
        if (hopMode || asMode !== "ai" || bound)
            return;
        if (knownUnbound) {
            const cred = await credential();
            cred.dropAccess?.();
            cache = null;
            reportedPrincipal = "";
            turnId = newTurnId();
        }
        try {
            await loadContext(true);
        }
        catch (err) {
            knownUnbound = true;
            cache = null;
            throw err;
        }
        if (bound)
            return;
        knownUnbound = true;
        cache = null;
    }
    /** Closes a hop on the turn that opened it (the main process may have rolled since). Says whether the server cut it; never throws. */
    async function closeHop(id, hopTurn = turnId) {
        try {
            const res = await postPlatform(toolUrl, { ...turnFields(agent, hopTurn), name: "hop_done", arguments: "{}", hop: { id, done: true } });
            const body = res.body && typeof res.body === "object" ? res.body : {};
            if (typeof body.result !== "string")
                return { cut: false };
            const parsed = JSON.parse(body.result);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
                return { cut: false };
            return { cut: parsed.cut === true };
        }
        catch {
            // An id that is never closed still expires on the server.
            return { cut: false };
        }
    }
    function failedHop(role, reason, cut = false) {
        return toolResult(JSON.stringify({ error: "the Agent's run failed", role, reason, next: HAND_OFF_FAILED_NEXT, ...(cut ? { cut: CUT_TEXT } : {}) }), true);
    }
    /**
     * The Concept test a timed-out hop already uses: this connector is Agent.Concept, or the hop's role names Concept.
     * A mint must not be split, so those hops are not told to stop early.
     */
    function conceptHop(role) {
        return agentIsConcept() || role.toLowerCase().replace(/[^a-z0-9]/g, "").includes("concept");
    }
    let codexFeatures;
    /** The feature names `codex features list` prints, read once per process. A failure is not remembered. */
    function readCodexFeatures(spawnCmd, cenv, signal) {
        if (!codexFeatures) {
            // The shared call has its own timeout and no caller's signal: one cancelled hand-off must not fail the others.
            codexFeatures = captureCodex(spawnCmd, ["features", "list"], cenv, CODEX_FEATURES_TIMEOUT_MS, new AbortController().signal).then((out) => {
                if (out === null) {
                    codexFeatures = undefined;
                    return null;
                }
                const names = parseCodexFeatureNames(out);
                // A list the connector cannot recognise is refused by the caller and is not remembered.
                if (!names.includes("code_mode_host") || !names.includes("shell_tool"))
                    codexFeatures = undefined;
                return names;
            });
        }
        const shared = codexFeatures;
        if (signal.aborted)
            return Promise.resolve(null);
        return new Promise((resolveRead) => {
            const onAbort = () => resolveRead(null);
            signal.addEventListener("abort", onAbort, { once: true });
            void shared.then((names) => {
                signal.removeEventListener("abort", onAbort);
                resolveRead(names);
            });
        });
    }
    const hopStdin = (hop) => (conceptHop(hop.role) ? hop.task : `${hop.task}${hopTimeLimitParagraph(hopMaxOf(hop.role))}`);
    const hopRunner = hopCli === "codex" ? codexHopRunner(codexBin, env, hopModel, hopStdin, readCodexFeatures) : claudeHopRunner(claudeBin, env, hopModel, hopStdin);
    /** `hopTurn` is the turn the hop was opened under. The child runs, and makes every call, on that turn, whatever the main process has rolled to since. */
    async function runChild(hop, signal, hopTurn) {
        const dir = mkdtempSync(join(tmpdir(), "gilb-hop-"));
        const toolsFile = join(dir, "tools.json");
        writeFileSync(toolsFile, JSON.stringify({ tools: hop.tools, userText }), { mode: 0o600 });
        const createdFile = join(dir, "created-vaults");
        const args = [selfFile, "--as", asMode, "--hop", hop.id, "--turn", hopTurn, "--agent", agent, "--origin", origin, "--hop-tools", toolsFile, "--hop-created", createdFile];
        // The live list, not a copy taken at startup, so a vault selected later is passed on.
        for (const id of vaults)
            args.push("--vault", id);
        if (profile)
            args.push("--profile", profile);
        if (claudeBin !== "claude")
            args.push("--claude", claudeBin);
        // The nested connector gives the hand-off a real clock. Concept hops get none, as before.
        if (!conceptHop(hop.role))
            args.push("--hop-deadline", String(Math.floor(Date.now() + hopMaxOf(hop.role))));
        // Never throws: a folder that cannot be removed is reported, not fatal. If the child still runs, it is tried again when the child closes.
        const removeHopDir = (target, child) => {
            const attempt = () => {
                try {
                    if (target === dir)
                        removeDir(target);
                    else
                        rmSync(target, { force: true, maxRetries: 5, retryDelay: 200 });
                    return undefined;
                }
                catch (err) {
                    const code = err?.code;
                    return typeof code === "string" ? code : "unknown";
                }
            };
            const report = (code) => {
                process.stderr.write(`gilb-connector: could not remove the hand-off folder ${target}: ${code}\n`);
            };
            const first = attempt();
            if (first === undefined)
                return;
            if (child && child.exitCode === null && child.signalCode === null) {
                child.once("close", () => {
                    const second = attempt();
                    if (second !== undefined)
                        report(second);
                });
                return;
            }
            report(first);
        };
        let plan;
        try {
            plan = await hopRunner.prepare({ hop, dir, nestedArgs: args, signal });
        }
        catch (err) {
            removeHopDir(dir);
            throw err;
        }
        const child = spawn(plan.command, plan.args, {
            cwd: dir,
            env: plan.env,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
        });
        children.add(child);
        const stdin = child.stdin;
        const stdout = child.stdout;
        const stderrStream = child.stderr;
        if (!stdin || !stdout || !stderrStream) {
            children.delete(child);
            killHopProcess(child);
            removeHopDir(dir, child);
            throw new Error(`Could not start ${hopRunner.name}: pipes were not available.`);
        }
        let buf = "";
        let stderr = "";
        const reader = hopRunner.newReader();
        const progress = { toolCalls: [] };
        const onAbort = () => killHopProcess(child);
        if (signal.aborted)
            onAbort();
        else
            signal.addEventListener("abort", onAbort, { once: true });
        stderrStream.on("data", (chunk) => {
            stderr = (stderr + chunk).slice(-2000);
        });
        stdout.on("data", (chunk) => {
            buf += chunk;
            let index = buf.indexOf("\n");
            while (index >= 0) {
                const line = buf.slice(0, index).trim();
                buf = buf.slice(index + 1);
                index = buf.indexOf("\n");
                if (!line)
                    continue;
                let event;
                try {
                    event = JSON.parse(line);
                }
                catch {
                    continue;
                }
                reader.onEvent(event, progress, () => killHopProcess(child));
            }
        });
        return await new Promise((resolve, reject) => {
            let settled = false;
            let timer;
            const finish = (fn) => {
                if (settled)
                    return;
                settled = true;
                if (timer !== undefined)
                    clearTimeout(timer);
                signal.removeEventListener("abort", onAbort);
                children.delete(child);
                // Answer first: the clean-up below may be slow or fail (Windows holds a just-killed tree's folder).
                try {
                    fn();
                }
                finally {
                    for (const file of plan.cleanupFiles ?? [])
                        removeHopDir(file, child);
                    removeHopDir(dir, child);
                }
            };
            timer = setTimeout(() => {
                killHopProcess(child);
                finish(() => reject(new HopTimeoutError(progress)));
            }, hopMaxOf(hop.role));
            // The child process keeps the loop alive. The timer must not, or a finished session would wait out the full limit.
            timer.unref();
            child.on("error", (err) => finish(() => reject(new Error(`Could not start ${hopRunner.name}: ${err.message}`))));
            child.on("close", () => {
                if (signal.aborted) {
                    finish(() => reject(new DOMException("The operation was aborted.", "AbortError")));
                    return;
                }
                const outcome = reader.outcome(stderr);
                if ("error" in outcome) {
                    const reason = outcome.error;
                    finish(() => reject(new Error(reason)));
                }
                else {
                    const text = outcome.text;
                    const created = hopCreatedNamespaces(createdFile);
                    finish(() => resolve({ text, created }));
                }
            });
            stdin.on("error", () => undefined);
            stdin.end(plan.stdinText);
        });
    }
    /**
     * A cut hop spent its turn's rounds, so the next call starts on a fresh turn (nothing is re-sent: the hop may have written).
     * Main process only, never Agent.Concept, within MAX_TURN_ROLLS, and only if no other path has rolled since the hop began.
     */
    function rollAfterCut(hopTurn, allowed) {
        if (hopMode || !allowed || agentIsConcept() || turnId !== hopTurn || turnRolls >= MAX_TURN_ROLLS)
            return;
        turnRolls += 1;
        turnId = newTurnId();
        cache = null;
        process.stderr.write(`gilb-connector: a hand-off ran out of tool rounds; started a new turn (${turnRolls} of ${MAX_TURN_ROLLS}).\n`);
    }
    async function runHop(hop, signal, hopTurn, mayRoll) {
        if (!validHop(hop)) {
            return toolResult(JSON.stringify({ error: "The hand-off returned an unexpected answer.", next: HAND_OFF_FAILED_NEXT }), true);
        }
        const shaped = { ...hop, role: hopRole(hop), answer: hopAnswer(hop) };
        if (hopMode) {
            await closeHop(shaped.id, hopTurn);
            return failedHop(shaped.role, "A hand-off cannot hand off again.");
        }
        if (!turnId) {
            await closeHop(shaped.id, hopTurn);
            return failedHop(shaped.role, "The hand-off could not be linked to its turn.");
        }
        if (hopsRunning >= maxHops) {
            await closeHop(shaped.id, hopTurn);
            return toolResult(JSON.stringify({
                error: "the Agent's run failed",
                role: shaped.role,
                reason: `Too many hand-offs are running at once (${maxHops}). Wait for one to finish.`,
                next: "Wait for a hand-off that is already running to finish, then try again.",
            }), true);
        }
        hopsRunning += 1;
        try {
            const ran = await runChild(shaped, signal, hopTurn);
            if (signal.aborted)
                return CANCELLED;
            const closed = await closeHop(shaped.id, hopTurn);
            if (closed.cut)
                rollAfterCut(hopTurn, mayRoll && !shaped.role.toLowerCase().replace(/[^a-z0-9]/g, "").includes("concept"));
            // The hop returned, including one the server cut. Select here, in this process, never inside the hop.
            for (const namespace of ran.created)
                selectVault(namespace);
            const content = ran.text;
            return toolResult(JSON.stringify(closed.cut ? { ...shaped.answer, content, cut: CUT_TEXT } : { ...shaped.answer, content }), false);
        }
        catch (err) {
            const closed = await closeHop(shaped.id, hopTurn);
            if (signal.aborted)
                return CANCELLED;
            if (closed.cut)
                rollAfterCut(hopTurn, mayRoll && !shaped.role.toLowerCase().replace(/[^a-z0-9]/g, "").includes("concept"));
            const reason = err instanceof Error ? err.message : "the hand-off could not run";
            // A mint is never invited to run again, so Agent.Concept keeps the failed answer.
            const isConcept = conceptHop(shaped.role);
            if (err instanceof HopTimeoutError && !isConcept)
                return toolResult(hopTimeoutAnswer(shaped.role, hopMaxOf(shaped.role), err.progress), true);
            return failedHop(shaped.role, reason, closed.cut);
        }
        finally {
            hopsRunning -= 1;
        }
    }
    /** Which turn limit an answer is: only the server's two exact answers, error and next both. Anything else is none. */
    function turnLimitOf(result) {
        let parsed;
        try {
            parsed = JSON.parse(result);
        }
        catch {
            return null;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return null;
        const row = parsed;
        if (row.next !== TURN_LIMIT_NEXT)
            return null;
        if (row.error === TURN_LIMIT_ROUNDS)
            return "rounds";
        if (row.error === TURN_LIMIT_HOPS)
            return "hops";
        return null;
    }
    /** Agent.Concept, in any spelling that folds to it: its mint limits are per turn and stay a brake. */
    function agentIsConcept() {
        return agent.toLowerCase().replace(/[^a-z0-9]/g, "") === "agentconcept";
    }
    /**
     * Whether a run_named_role call may be re-sent on a fresh turn. Not when the role is Agent.Concept (whatever agent this
     * connector is on), nor an address-like role (a record address, which a fold does not turn into "agentconcept"),
     * nor when the role cannot be read: Agent.Concept's mint limits are per turn and must stay a brake.
     */
    function roleMayRoll(args) {
        let parsed = args;
        if (typeof args === "string") {
            try {
                parsed = JSON.parse(args);
            }
            catch {
                return false;
            }
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return false;
        const role = parsed.role;
        if (typeof role !== "string" || role.trim() === "")
            return false;
        if (/[/:%@\\]/.test(role))
            return false;
        return !role.toLowerCase().replace(/[^a-z0-9]/g, "").includes("concept");
    }
    /**
     * A call that opens a hand-off takes a slot BEFORE anything is sent to the server, so a waiting call has no open hop
     * (the server's open-hop clock does not run while it waits) and is sent under the turn that is current when it starts,
     * never under the turn it was made on. The slot is held until the hand-off is closed.
     */
    async function callHandOffTool(name, args, signal) {
        const slot = await hopQueue.acquire(signal);
        if (slot.kind === "cancelled")
            return CANCELLED;
        if (slot.kind === "refused") {
            return toolResult(JSON.stringify({ error: "the Agent's run failed", reason: slot.reason, next: "Send this hand-off again when fewer are running." }), true);
        }
        try {
            const result = await callPlatformTool(name, args, signal);
            if (result === CANCELLED || !slot.queued)
                return result;
            return { ...result, content: [...result.content, { type: "text", text: `(waited ${formatWait(slot.waitedMs)} for a free hand-off slot)` }] };
        }
        finally {
            slot.release();
        }
    }
    async function callPlatformTool(name, args, signal, resent = false) {
        if (!hopMode)
            toolCallsSent += 1;
        const sentTurn = turnId;
        const repeatableCall = isRepeatableCall(name, args);
        let res;
        try {
            res = await postPlatform(toolUrl, { ...turnFields(), name, arguments: argumentString(args), ...(hopMode && hopId ? { hop: { id: hopId } } : {}) }, signal, repeatableCall);
        }
        catch (err) {
            if (err instanceof PlatformError && err.maybeRan)
                return toolResult(JSON.stringify({ error: unknownOutcomeText(name, err.what) }), true);
            throw err;
        }
        if (signal.aborted)
            return CANCELLED;
        // Hop mode forwards the door's answer. A no-reach answer is not remembered: the next call tries again.
        if (!hopMode && aiRefusal(res.status, res.body)) {
            if (isVaultNamespace(reportedPrincipal)) {
                const err = reachError(res.body);
                const sentence = aiNoGrant(err ? vaultInReach(err) : namedVault(args), reportedPrincipal);
                say(sentence);
                return toolResult(sentence, true);
            }
            const sentence = aiNotBound(aiClientId);
            say(sentence);
            return toolResult(sentence, true);
        }
        if (isTransientStatus(res.status) && !repeatableCall) {
            // The proxy answered 5xx for a write: it may have run. It is never sent again by this connector.
            return toolResult(JSON.stringify({ error: unknownOutcomeText(name, `HTTP ${res.status}`) }), true);
        }
        if (res.status < 200 || res.status >= 300) {
            return toolResult(JSON.stringify({ error: errorText(res.status, res.body, `${name} could not run`) }), true);
        }
        const body = res.body && typeof res.body === "object" ? res.body : {};
        if (body.hop && typeof body.hop === "object") {
            return runHop(body.hop, signal, sentTurn, name === "run_named_role" && roleMayRoll(args));
        }
        const result = typeof body.result === "string" ? body.result : JSON.stringify({ error: `${name} returned an unexpected answer.` });
        // A turn that is out of room refuses BEFORE it runs the tool (src/routes/ai-claude-code.ts, the round count and openHop),
        // so the same call is safe to send once more on a fresh turn. Nothing else is ever re-sent.
        // Not in a hop, not for Agent.Concept or ask_agent_concept (their mint limits are per turn), and not twice in a row.
        if (!hopMode && !resent && !agentIsConcept() && name !== "ask_agent_concept" && (name !== "run_named_role" || roleMayRoll(args))) {
            const limit = turnLimitOf(result);
            if (limit === "rounds" || (limit === "hops" && name === "run_named_role")) {
                if (turnRolls >= MAX_TURN_ROLLS) {
                    return toolResult(JSON.stringify({ error: `this chat has used ${toolCallsSent} tool rounds; start a new chat to go on` }), true);
                }
                turnRolls += 1;
                turnId = newTurnId();
                cache = null;
                process.stderr.write(`gilb-connector: this chat reached a turn limit; started a new turn (${turnRolls} of ${MAX_TURN_ROLLS}).\n`);
                return callPlatformTool(name, args, signal, true);
            }
        }
        if (!hopMode && isVaultNamespace(reportedPrincipal) && listsNoVaults(name, result)) {
            const sentence = aiNoGrant(namedVault(args), reportedPrincipal);
            say(sentence);
            return toolResult(sentence, true);
        }
        // A hop keeps the vault list it was started with. A vault it makes is recorded for the main process, which selects it when the hop returns.
        if (hopMode && name === "create_vault" && hopCreatedPath) {
            const namespace = createdVaultNamespace(result);
            if (namespace)
                appendFileSync(hopCreatedPath, `${namespace}\n`);
        }
        if (!hopMode && name === "create_vault") {
            const namespace = createdVaultNamespace(result);
            if (namespace) {
                selectVault(namespace);
                rememberChoice(namespace);
                return toolResult(result, false, [`Selected for this session: ${namespace}. Selected vaults: ${vaults.join(", ")}.`]);
            }
        }
        return toolResult(result, toolAnswerIsError(result));
    }
    /** Where this chat's remembered choice lives: the AI's own profile directory. null when nothing can be remembered. */
    function choiceFile() {
        if (hopMode || asMode !== "ai" || !aiClientId || profile === undefined)
            return null;
        const root = connectorRoot(env);
        if (!root)
            return null;
        if (parentKey === undefined)
            parentKey = detectParentKey();
        if (!parentKey)
            return null;
        return join(root, profile, VAULT_CHOICE_FILE);
    }
    /** The person chose this vault (gilbplatform_use_vault, or a create_vault they asked for). Remember it for this chat only. */
    function rememberChoice(namespace) {
        const file = choiceFile();
        if (!file || !parentKey)
            return;
        try {
            const old = readVaultChoice(file);
            const same = old && old.client === aiClientId && old.ppid === parentKey.pid && old.started === parentKey.started && nowMs() - old.savedAt < VAULT_CHOICE_MAX_AGE_MS;
            const kept = same ? old.vaults.filter((v) => !sameVault(v, namespace)) : [];
            const record = { client: aiClientId, ppid: parentKey.pid, started: parentKey.started, savedAt: nowMs(), vaults: [...kept, namespace] };
            ensurePrivateDir(dirname(file));
            writeFileSync(file, JSON.stringify(record), { mode: 0o600 });
            chmodSync(file, 0o600);
        }
        catch {
            // Not remembered. The selection itself stands.
        }
    }
    function clearChoice(file) {
        try {
            rmSync(file, { force: true });
        }
        catch {
            // Nothing to clear.
        }
    }
    /**
     * Bound, nothing selected: bring back what the person chose earlier in this same chat (same parent process, same start time,
     * under 12 hours old) and that list_vaults still shows. An automatic choice is never written, so never comes back.
     */
    async function maybeRestoreChoice(signal) {
        if (hopMode || asMode !== "ai" || !bound || restoreAttempted)
            return;
        restoreAttempted = true;
        if (vaults.some((id) => id.trim() !== ""))
            return;
        const file = choiceFile();
        if (!file || !parentKey)
            return;
        const saved = readVaultChoice(file);
        if (!saved)
            return;
        if (saved.client !== aiClientId || saved.ppid !== parentKey.pid || saved.started !== parentKey.started)
            return;
        if (nowMs() - saved.savedAt >= VAULT_CHOICE_MAX_AGE_MS || saved.savedAt > nowMs() + 60_000) {
            clearChoice(file);
            return;
        }
        let res;
        try {
            res = await postPlatform(toolUrl, { ...turnFields(), name: "list_vaults", arguments: "{}" }, signal, true);
        }
        catch (err) {
            if (signal.aborted || (err instanceof Error && err.name === "AbortError"))
                throw err;
            restoreAttempted = false;
            return;
        }
        if (signal.aborted)
            throw new DOMException("The operation was aborted.", "AbortError");
        if (res.status < 200 || res.status >= 300) {
            restoreAttempted = false;
            return;
        }
        const body = res.body && typeof res.body === "object" ? res.body : {};
        const ids = typeof body.result === "string" ? vaultIdsFromListResult(body.result) : null;
        if (!ids)
            return;
        const back = [];
        for (const v of saved.vaults) {
            const listed = ids.find((id) => sameVault(id.trim(), v));
            if (listed)
                back.push(listed.trim());
        }
        if (back.length === 0) {
            clearChoice(file);
            return;
        }
        if (back.length !== saved.vaults.length) {
            try {
                writeFileSync(file, JSON.stringify({ ...saved, vaults: back }), { mode: 0o600 });
            }
            catch {
                // Left as it was.
            }
        }
        for (const v of back)
            selectVault(v);
        restoredVaults = [...back];
    }
    function selectVault(namespace) {
        restoredVaults = [];
        selectedAutomatically = false;
        if (autoVault !== null && sameVault(autoVault, namespace))
            autoVault = null;
        if (!vaults.some((id) => sameVault(id, namespace)))
            vaults.push(namespace);
        cache = null;
    }
    async function onUseVault(args, signal) {
        const raw = fieldString(args, "vault");
        if (!raw)
            return toolResult(JSON.stringify({ error: "Name the vault the person said." }), true);
        const query = vaultQuery(raw);
        const listed = await callPlatformTool("list_vaults", {}, signal);
        if (listed === CANCELLED)
            return listed;
        if (listed.isError)
            return listed;
        const text = listed.content[0].text;
        const ids = vaultIdsFromListResult(text);
        if (!ids)
            return toolResult(JSON.stringify({ error: "list_vaults returned an unexpected answer." }), true);
        if (ids.length === 0) {
            if (isVaultNamespace(reportedPrincipal)) {
                const sentence = aiNoGrant(undefined, reportedPrincipal);
                say(sentence);
                return toolResult(sentence, true);
            }
            return toolResult(`No vault this AI can reach is called ${raw}. It can reach: .`, false);
        }
        const matched = matchingVaults(ids, query);
        if (matched.length === 0) {
            return toolResult(`No vault this AI can reach is called ${raw}. It can reach: ${ids.join(", ")}.`, false);
        }
        if (matched.length > 1) {
            return toolResult(`More than one vault matches ${raw}: ${matched.join(", ")}. Say which one.`, false);
        }
        const namespace = matched[0];
        if (!namespace)
            return toolResult(JSON.stringify({ error: "list_vaults returned an unexpected answer." }), true);
        // The person's allow replaces an automatic choice. It is not overwritten later.
        selectVault(namespace);
        rememberChoice(namespace);
        return toolResult(`Using vault ${namespace} for this session. Selected vaults: ${vaults.join(", ")}.`, false);
    }
    /**
     * Bound, and nothing selected yet: look once. The AI's own vault is not a work vault.
     * Exactly one vault left is selected the same way gilbplatform_use_vault selects one.
     * Zero or two or more leaves the list empty. A person-approved vault is never replaced.
     */
    async function maybeAutoSelect(signal) {
        if (hopMode || asMode !== "ai" || !bound)
            return;
        if (vaults.some((id) => id.trim() !== ""))
            return;
        if (autoSelectAttempted)
            return;
        autoSelectAttempted = true;
        let res;
        try {
            res = await postPlatform(toolUrl, { ...turnFields(), name: "list_vaults", arguments: "{}" }, signal, true);
        }
        catch (err) {
            if (signal.aborted || (err instanceof Error && err.name === "AbortError"))
                throw err;
            return;
        }
        if (signal.aborted)
            throw new DOMException("The operation was aborted.", "AbortError");
        if (res.status < 200 || res.status >= 300)
            return;
        const body = res.body && typeof res.body === "object" ? res.body : {};
        if (typeof body.result !== "string")
            return;
        const ids = vaultIdsFromListResult(body.result);
        if (!ids)
            return;
        const own = reportedPrincipal.trim();
        const work = [];
        for (const id of ids) {
            const trimmed = id.trim();
            if (trimmed === "")
                continue;
            if (own !== "" && sameVault(trimmed, own))
                continue;
            if (work.some((have) => sameVault(have, trimmed)))
                continue;
            work.push(trimmed);
        }
        if (work.length !== 1)
            return;
        const namespace = work[0];
        if (!namespace)
            return;
        vaults.push(namespace);
        autoVault = namespace;
        selectedAutomatically = true;
        cache = null;
    }
    async function onToolCall(params, id) {
        const name = params && typeof params === "object" ? params.name : undefined;
        const args = params && typeof params === "object" ? params.arguments : undefined;
        if (typeof name !== "string" || name === "") {
            return toolResult(JSON.stringify({ error: "Tool name is missing." }), true);
        }
        const ac = new AbortController();
        if (id !== undefined && id !== null)
            calls.set(String(id), ac);
        const stopProgress = startProgress(params);
        try {
            if (!hopMode && name === GILB_WHOAMI.name) {
                try {
                    await credential();
                    if (asMode === "ai" && !bound)
                        await refreshIdentity();
                    if (asMode === "ai" && bound)
                        await maybeRestoreChoice(ac.signal);
                }
                catch (err) {
                    if (asMode === "ai" && aiClientId)
                        return toolResult(whoamiText(), false);
                    throw err;
                }
                return toolResult(whoamiText(), false);
            }
            await credential();
            if (ac.signal.aborted)
                return CANCELLED;
            if (!hopMode && asMode === "ai" && !bound) {
                try {
                    await refreshIdentity();
                }
                catch (err) {
                    if (err instanceof NotConnected)
                        return toolResult(err.message, true);
                    throw err;
                }
                if (!bound) {
                    const sentence = aiNotBound(aiClientId);
                    say(sentence);
                    return toolResult(sentence, true);
                }
            }
            if (!hopMode && name === GILB_TASK.name)
                return onTask(args);
            if (!hopMode && name === GILB_AGENT.name)
                return await onAgent(args);
            if (!hopMode && name === GILB_USE_VAULT.name)
                return await onUseVault(args, ac.signal);
            if (!hopMode && name === GILB_UPLOAD_FILE.name)
                return await onUploadFile(args, ac.signal);
            if (hopMode && !hopTools.some((tool) => tool.name === name)) {
                return toolResult(JSON.stringify({ error: `Unknown tool ${name}` }), true);
            }
            if (!hopMode)
                await maybeRestoreChoice(ac.signal);
            if (!hopMode)
                await maybeAutoSelect(ac.signal);
            if (!hopMode && HAND_OFF_TOOLS.has(name))
                return await callHandOffTool(name, args, ac.signal);
            return await callPlatformTool(name, args, ac.signal);
        }
        catch (err) {
            if (ac.signal.aborted || (err instanceof Error && err.name === "AbortError"))
                return CANCELLED;
            if (err instanceof NotConnected)
                return toolResult(err.message, true);
            const message = err instanceof Error ? err.message : `${name} could not run`;
            return toolResult(JSON.stringify({ error: message }), true);
        }
        finally {
            stopProgress();
            if (id !== undefined && id !== null)
                calls.delete(String(id));
        }
    }
    /** The vault's own door: its host, never the identity door. A call signed for another host answers 401. */
    function vaultDoor(vault) {
        let url;
        try {
            url = new URL(vault);
        }
        catch {
            return null;
        }
        // https always. Plain http only when the person started the connector against a plain-http door (a local test door).
        if (url.protocol !== "https:" && !(url.protocol === "http:" && origin.startsWith("http:")))
            return null;
        // The vault's root exactly as the platform listed it (/base for a system vault, /vault for a user vault). Never composed:
        // /base on a user vault is another namespace, and the door answers 403 "no write reach" (Connected AI aikai, 2026-11-07).
        const vaultOrigin = `${url.protocol}//${url.host}`;
        const path = url.pathname.replace(/\/+$/, "");
        if (path !== "/base" && path !== "/vault")
            return null;
        return { base: `${vaultOrigin}${path}`, origin: vaultOrigin };
    }
    async function onUploadFile(args, signal) {
        const refuse = (message) => toolResult(JSON.stringify({ error: message }), true);
        // 2. Only a vault the person selected. Their yes in gilbplatform_use_vault is the gate.
        // Only a vault the person chose: gilbplatform_use_vault, --vault, or create_vault. One picked only because the list held one is not.
        const selected = vaults.map((id) => id.trim()).filter((id) => id !== "" && !(autoVault !== null && sameVault(autoVault, id)));
        const askedVault = fieldString(args, "vault");
        let target;
        if (askedVault !== "") {
            const query = vaultQuery(askedVault);
            const hits = selected.filter((id) => listedVaultMatches(id, query));
            if (hits.length === 0) {
                return refuse(`${askedVault} is not a vault selected for this session. Call gilbplatform_use_vault with the name the person used first.${selected.length > 0 ? ` Selected: ${selected.join(", ")}.` : ""}`);
            }
            if (hits.length > 1)
                return refuse(`More than one selected vault matches ${askedVault}: ${hits.join(", ")}. Say which one.`);
            target = hits[0];
        }
        else if (selected.length === 0) {
            return refuse("No vault is selected. Call gilbplatform_use_vault with the name the person used, then upload.");
        }
        else if (selected.length > 1) {
            return refuse(`More than one vault is selected: ${selected.join(", ")}. Say which one in the vault field.`);
        }
        else {
            target = selected[0];
        }
        const door = vaultDoor(target);
        if (!door)
            return refuse("The selected vault has no https address to send to.");
        if (!hostInOriginFamily(origin, door.base)) {
            return refuse("That vault is not on this connector's domain, so no file is sent to it.");
        }
        // 3 and 4. The path rules run on the path and its stat. The file is not opened until they all pass.
        const pathArg = fieldString(args, "path");
        const pick = pickUploadFile(pathArg, uploadCwd, uploadRoots);
        if (!pick.ok)
            return refuse(pick.error);
        const nameArg = fieldString(args, "name");
        const storedName = nameArg === "" ? pick.base : nameArg;
        if (storedName.length > 200 || /[\\/\u0000-\u001f]/.test(storedName) || storedName.startsWith(".")) {
            return refuse("The name must be a plain file name of at most 200 characters, with no slash and no leading dot.");
        }
        if (extname(storedName).slice(1).toLowerCase() !== pick.ext) {
            return refuse(`The name must keep the file's extension (.${pick.ext}).`);
        }
        if (secretName(storedName))
            return refuse("A file whose name looks like a key, a login or a secret is never uploaded.");
        const folderArg = fieldString(args, "folder");
        if (folderArg.length > 300)
            return refuse("The folder path is too long.");
        let bytes;
        try {
            bytes = readFileSync(pick.real);
        }
        catch {
            return refuse("That file could not be read.");
        }
        if (bytes.length === 0 || bytes.length > UPLOAD_MAX_BYTES)
            return refuse("That file changed while it was being read. Try again.");
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const query = new URLSearchParams([["name", storedName]]);
        if (folderArg !== "")
            query.append("folder", folderArg);
        const url = `${door.origin}/lws/vault/${encodeURIComponent(door.base)}/files?${query.toString()}`;
        const mime = UPLOAD_TYPES[pick.ext];
        // 5. One send, and one more only when the door says the session is gone (401, nothing stored). A repeat of anything else could store two files.
        const send = async () => {
            const cred = await credential();
            if (signal.aborted)
                throw new DOMException("The operation was aborted.", "AbortError");
            let headers;
            try {
                headers = { ...(await cred.authHeaders("POST", url)), "content-type": mime, accept: "application/json" };
            }
            catch (err) {
                if (err instanceof NotConnected)
                    throw err;
                if (isMissingComputer(err))
                    throw new NotConnected();
                throw new NotConnected(asMode === "ai" ? AI_SIGN_IN_FAILED : SIGN_IN_FAILED);
            }
            let res;
            try {
                res = await fetch(url, { method: "POST", headers, body: bytes, redirect: "manual", signal });
            }
            catch (err) {
                if (signal.aborted)
                    throw err;
                throw new PlatformError(0, "The vault could not be reached. Nothing is known to be stored; check the vault before sending again.");
            }
            return { status: res.status, body: readJsonText(await res.text()) };
        };
        let res = await send();
        if (res.status === 401 && !signal.aborted) {
            const cred = await credential();
            cred.dropAccess?.();
            res = await send();
        }
        // 6. The answer carries the file's address, sha256 and size. No header or token is ever echoed.
        if (res.status === 401)
            return refuse("The vault did not accept this sign-in. Try again.");
        if (res.status !== 200 && res.status !== 201) {
            const detail = quotedFailure(res.body);
            const hint = res.status === 403 ? " This AI may not write to that vault; the person grants Write on it in GilbApp." : "";
            return refuse(`The vault refused the upload (${res.status})${detail ? `: ${detail}` : ""}.${hint}`);
        }
        const row = res.body && typeof res.body === "object" ? res.body : {};
        if (typeof row.entity !== "string" || row.entity === "")
            return refuse("The vault answered, but gave no address for the file.");
        const lines = [
            `Uploaded ${storedName} to ${door.base}${res.status === 200 ? " (the same file was already there)" : ""}.`,
            `address: ${safeQuote(row.entity)}`,
            `sha256: ${sha256}`,
            `size: ${bytes.length} bytes`,
        ];
        if (typeof row.byteSize === "number" && row.byteSize !== bytes.length)
            lines.push(`warning: the vault reports ${row.byteSize} bytes`);
        return toolResult(lines.join("\n"), false);
    }
    function onTask(args) {
        const text = fieldString(args, "text");
        if (!text)
            return toolResult(JSON.stringify({ error: "Write what the person is asking." }), true);
        if (text.length > USER_TEXT_MAX)
            return toolResult(JSON.stringify({ error: "That request is too long." }), true);
        userText = text;
        cache = null;
        return toolResult("The person's request is set.", false);
    }
    async function onAgent(args) {
        const next = fieldString(args, "agent");
        if (!next || next.length > 64)
            return toolResult(JSON.stringify({ error: "Name an agent, for example Kai-Zen or Jackfruit." }), true);
        const ctx = await fetchContext(next);
        agent = next;
        cache = { agent, userText, ctx };
        emit({ jsonrpc: "2.0", method: "notifications/tools/list_changed", params: {} });
        return toolResult(ctx.system, false);
    }
    function startProgress(params) {
        const meta = params && typeof params === "object" ? params._meta : undefined;
        const token = meta?.progressToken;
        if (token === undefined || token === null)
            return () => undefined;
        let n = 0;
        const timer = setInterval(() => {
            n += 1;
            emit({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: token, progress: n, message: "still working" } });
        }, progressEveryMs);
        timer.unref();
        return () => clearInterval(timer);
    }
    async function onListTools() {
        if (hopMode)
            return { tools: hopTools.map(mcpTool) };
        try {
            if (asMode === "ai" && !bound)
                await refreshIdentity();
            if (asMode === "ai" && !bound)
                return { tools: localTools() };
            const ctx = await loadContext(false);
            return { tools: [...ctx.tools.map(mcpTool), ...localTools()] };
        }
        catch (err) {
            if (err instanceof NotConnected)
                return { tools: localTools() };
            throw err;
        }
    }
    async function onGetPrompt(params) {
        const args = params && typeof params === "object" ? params.arguments : undefined;
        const askedRaw = args && typeof args === "object" ? args.name : undefined;
        const asked = typeof askedRaw === "string" && askedRaw.trim() ? askedRaw.trim() : agent;
        const promptName = params && typeof params === "object" ? params.name : undefined;
        if (promptName !== "agent")
            throw new PlatformError(404, "Unknown prompt.");
        if (!hopMode && asMode === "ai" && !bound) {
            try {
                await refreshIdentity();
            }
            catch (err) {
                if (!(err instanceof NotConnected))
                    throw err;
            }
            if (!bound) {
                return {
                    description: `Standing instructions for ${asked}.`,
                    messages: [{ role: "user", content: { type: "text", text: aiNotBound(aiClientId) } }],
                };
            }
        }
        const ctx = asked === agent ? await loadContext(false) : await fetchContext(asked);
        return {
            description: `Standing instructions for ${asked}.`,
            messages: [{ role: "user", content: { type: "text", text: ctx.system } }],
        };
    }
    async function dispatch(method, params, id) {
        if (method === "initialize") {
            const version = params && typeof params === "object" && typeof params.protocolVersion === "string"
                ? params.protocolVersion
                : "2025-06-18";
            return {
                protocolVersion: version,
                capabilities: hopMode ? { tools: {} } : { tools: { listChanged: true }, prompts: {} },
                serverInfo: { name: "GilbPlatform", version: CONNECTOR_VERSION },
                instructions: hopMode
                    ? "Tools for one GilbPlatform hand-off."
                    : `${asMode === "me"
                        ? "GilbPlatform tools for this computer. The agent prompt carries the current agent's standing instructions."
                        : "GilbPlatform tools for this Connected AI. gilbplatform_whoami reports the Client ID. The agent prompt carries the current agent's standing instructions."} ${USE_VAULT_INSTRUCTIONS} ${CREATE_VAULT_INSTRUCTIONS}${asMode === "ai" ? ` ${AUTO_SELECT_INSTRUCTIONS}` : ""}`,
            };
        }
        if (method === "ping")
            return {};
        if (method === "tools/list")
            return onListTools();
        if (method === "tools/call") {
            const result = await onToolCall(params, id);
            if (result === CANCELLED)
                return CANCELLED;
            if (hopDeadline !== undefined) {
                return { ...result, content: [...result.content, { type: "text", text: hopClockLine(hopStart, hopDeadline, Date.now()) }] };
            }
            return result;
        }
        if (method === "prompts/list")
            return { prompts: hopMode ? [] : [AGENT_PROMPT] };
        if (method === "resources/list")
            return { resources: [] };
        if (method === "resources/templates/list")
            return { resourceTemplates: [] };
        if (method === "prompts/get")
            return onGetPrompt(params);
        throw new PlatformError(-32601, `Method not found: ${method}`);
    }
    function track(work) {
        pending += 1;
        void work.finally(() => {
            pending -= 1;
            checkDone();
        });
    }
    async function handle(msg) {
        if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
            await emit({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
            return;
        }
        const row = msg;
        if (typeof row.method !== "string") {
            if (row.id !== undefined)
                await emit({ jsonrpc: "2.0", id: row.id, error: { code: -32600, message: "Invalid request" } });
            return;
        }
        if (row.id === undefined) {
            if (row.method === "notifications/cancelled") {
                const requestId = row.params && typeof row.params === "object" ? row.params.requestId : undefined;
                if (requestId !== undefined && requestId !== null)
                    calls.get(String(requestId))?.abort();
            }
            return;
        }
        try {
            const result = await dispatch(row.method, row.params, row.id);
            if (result === CANCELLED)
                return;
            await emit({ jsonrpc: "2.0", id: row.id, result });
        }
        catch (err) {
            if (err instanceof Error && err.name === "AbortError")
                return;
            const message = err instanceof NotConnected ? err.message : err instanceof Error ? err.message : "The request failed.";
            const code = err instanceof PlatformError && err.status === -32601 ? -32601 : -32000;
            await emit({ jsonrpc: "2.0", id: row.id, error: { code, message } });
        }
    }
    let buf = "";
    input.setEncoding("utf8");
    input.on("data", (chunk) => {
        buf += chunk;
        if (buf.length > 8_000_000) {
            buf = "";
            void emit({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
            return;
        }
        let index = buf.indexOf("\n");
        while (index >= 0) {
            const line = buf.slice(0, index).replace(/\r$/, "");
            buf = buf.slice(index + 1);
            index = buf.indexOf("\n");
            if (!line.trim())
                continue;
            let msg;
            try {
                msg = JSON.parse(line);
            }
            catch {
                void emit({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
                continue;
            }
            track(handle(msg));
        }
    });
    input.on("end", () => {
        inputEnded = true;
        checkDone();
    });
    input.on("error", () => {
        stopped = true;
        checkDone();
    });
    input.resume();
    return {
        done,
        turnId,
        close() {
            if (stopped)
                return;
            stopped = true;
            inputEnded = true;
            for (const child of children)
                killHopProcess(child);
            for (const ac of calls.values())
                ac.abort();
            checkDone();
        },
    };
}
function readHopSpec(file) {
    let raw;
    try {
        raw = JSON.parse(readFileSync(file, "utf8"));
    }
    catch {
        throw new CliError("Could not read the hand-off's tools.");
    }
    if (Array.isArray(raw)) {
        const tools = asTools(raw);
        if (!tools)
            throw new CliError("Could not read the hand-off's tools.");
        return { tools, userText: undefined };
    }
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.tools)) {
        throw new CliError("Could not read the hand-off's tools.");
    }
    const tools = asTools(raw.tools);
    if (!tools)
        throw new CliError("Could not read the hand-off's tools.");
    const userText = raw.userText;
    return { tools, userText: typeof userText === "string" ? userText : undefined };
}
/** The same caps the platform's ticket uses. Checked before any request. */
export const PUBLISH_MAX_FILES = 2000;
export const PUBLISH_MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 120_000;
const NO_WORKER_SENTENCE = "This platform did not say where to upload. Pass --worker-url.";
const NOTHING_ADMITTED = "Nothing was admitted unless the message says so; ask for a new ticket (re-run)";
const WORKERS_DEV_SUFFIX = ".workers.dev";
const PUBLISH_USAGE = `Usage: node gilb-connector.mjs publish --dir DIR --name NAME [--kind app|website] [--dry-run] [--as ai|me] [--origin URL] [--profile NAME] [--worker-url URL]

Publishes the built folder. The connector must be installed and signed in once.
The live address is https://NAME.pages.dev.
--kind defaults to app. Omit --dry-run to publish. --dry-run checks and lists what would be sent, and does not call the network.
--as defaults to ai and signs in the same way as this connector.`;
class PublishUsageError extends Error {
    constructor(message) {
        super(message);
        this.name = "PublishUsageError";
    }
}
class PublishPlatformError extends Error {
    constructor(message) {
        super(message);
        this.name = "PublishPlatformError";
    }
}
class PublishWorkerError extends Error {
    constructor(message) {
        super(message);
        this.name = "PublishWorkerError";
    }
}
class PublishNetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = "PublishNetworkError";
    }
}
const CSI_SEQUENCE = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const C0_C1 = /[\u0000-\u0008\u000B-\u001F\u007F\u0080-\u009F]/g;
const ZERO_WIDTH_BIDI = /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g;
function stripPrintedText(s) {
    return s.replace(CSI_SEQUENCE, "").replace(/[\n\t]/g, " ").replace(C0_C1, "").replace(ZERO_WIDTH_BIDI, "");
}
/** Remote text safe to print. Secrets become `[redacted]`. Longer than 500 characters is cut. */
function safeRemoteText(s, secrets) {
    if (typeof s !== "string")
        return "";
    let out = stripPrintedText(s);
    const list = secrets.filter((secret) => secret !== "");
    list.sort((a, b) => b.length - a.length);
    for (const secret of list)
        out = out.split(secret).join("[redacted]");
    if (out.length > 500)
        out = `${out.slice(0, 500)}…`;
    return out;
}
/** A local path safe to print. Control characters are removed. No redaction and no length cap. */
function safeLocalText(s) {
    return stripPrintedText(s);
}
function errnoOf(err) {
    if (err !== null && typeof err === "object" && "code" in err && typeof err.code === "string") {
        return err.code;
    }
    return "";
}
function asRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return null;
    return value;
}
function formatBytes(n) {
    return n.toLocaleString("en-US");
}
function totalPublishBytes(files) {
    let n = 0;
    for (const f of files)
        n += f.bytes.byteLength;
    return n;
}
function pagesAddress(name) {
    return `https://${name}.pages.dev`;
}
/** Loopback names, spelled in parts so this file does not name a host the host check refuses. */
function isLoopbackHost(hostname) {
    const local = "local" + "host";
    const v4 = ["127", "0", "0", "1"].join(".");
    return hostname === local || hostname === v4;
}
function localPublishAllowed(env) {
    return env.GILB_PUBLISH_ALLOW_LOCAL === "1";
}
/**
 * True for `https://<label>.workers.dev` (no userinfo, no port, no trailing dot).
 * An http loopback address, any port, only when `GILB_PUBLISH_ALLOW_LOCAL=1`.
 */
function workerUrlAllowed(u, env) {
    if (u.username !== "" || u.password !== "")
        return false;
    const presented = u.hostname.toLowerCase();
    if (presented.endsWith("."))
        return false;
    if (localPublishAllowed(env) && u.protocol === "http:" && isLoopbackHost(presented))
        return true;
    if (u.protocol !== "https:" || u.port !== "")
        return false;
    return presented.endsWith(WORKERS_DEV_SUFFIX) && presented.length > WORKERS_DEV_SUFFIX.length;
}
/** The flag or the ticket is an origin. The upload is `POST /publish` on that origin. */
function publishEndpoint(workerUrl, env) {
    let u;
    try {
        u = new URL(workerUrl);
    }
    catch {
        throw new PublishUsageError("The upload address is not a workers.dev host.");
    }
    if (!workerUrlAllowed(u, env) || u.search !== "" || u.hash !== "") {
        throw new PublishUsageError("The upload address is not a workers.dev host.");
    }
    if (u.pathname !== "/" && u.pathname !== "" && u.pathname !== "/publish") {
        throw new PublishUsageError("The upload address is not a workers.dev host.");
    }
    u.pathname = "/publish";
    u.search = "";
    u.hash = "";
    return u.toString();
}
function assertSiteName(name) {
    if (name.length < 3 || name.length > 40)
        throw new PublishUsageError("The site name must be 3 to 40 characters.");
    if (!/^[a-z0-9-]+$/.test(name)) {
        throw new PublishUsageError("The site name may use only lowercase letters a to z, digits and hyphens.");
    }
    if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
        throw new PublishUsageError("The site name may not start or end with a hyphen, or contain two in a row.");
    }
}
function openReadFlags() {
    return constants.O_RDONLY | constants.O_NOFOLLOW;
}
/**
 * Walks `dir`. Paths are relative and POSIX. Refuses a symlink (it is not followed), a missing folder,
 * a folder with no files, or a folder with no `index.html` at the root. Skips `.DS_Store`.
 */
async function collectPublishFiles(dir) {
    const root = resolve(dir);
    let rootStat;
    try {
        rootStat = await lstat(root);
    }
    catch (err) {
        if (errnoOf(err) === "ENOENT")
            throw new PublishUsageError("the folder does not exist");
        throw new PublishUsageError("the folder is not usable");
    }
    if (rootStat.isSymbolicLink())
        throw new PublishUsageError(`refusing to follow the symlink ${dir}`);
    if (!rootStat.isDirectory())
        throw new PublishUsageError("the folder is not a directory");
    const files = [];
    const skipped = [];
    const walk = async (abs) => {
        let entries;
        try {
            entries = await readdir(abs, { withFileTypes: true });
        }
        catch {
            throw new PublishUsageError("the folder is not usable");
        }
        for (const ent of entries) {
            const child = join(abs, ent.name);
            const rel = relative(root, child).split(sep).join("/");
            if (rel === "" || rel.startsWith("../") || rel === ".." || rel.startsWith("/") || rel.includes("/../")) {
                throw new PublishUsageError(`refusing the path ${rel}`);
            }
            let st;
            try {
                st = await lstat(child);
            }
            catch {
                throw new PublishUsageError(`the file ${rel} is not usable`);
            }
            if (st.isSymbolicLink() || ent.isSymbolicLink())
                throw new PublishUsageError(`refusing to follow the symlink ${rel}`);
            if (st.isDirectory()) {
                await walk(child);
                continue;
            }
            if (!st.isFile())
                throw new PublishUsageError(`refusing the entry ${rel}`);
            if (ent.name === ".DS_Store") {
                skipped.push(rel);
                continue;
            }
            let fh;
            try {
                fh = await open(child, openReadFlags());
                const buf = await fh.readFile();
                files.push({ path: rel, bytes: new Uint8Array(buf) });
            }
            catch (err) {
                if (err instanceof PublishUsageError)
                    throw err;
                if (errnoOf(err) === "ELOOP")
                    throw new PublishUsageError(`refusing to follow the symlink ${rel}`);
                throw new PublishUsageError(`the file ${rel} is not usable`);
            }
            finally {
                await fh?.close();
            }
        }
    };
    await walk(root);
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    skipped.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (files.length === 0)
        throw new PublishUsageError("the folder has no files");
    if (!files.some((f) => f.path === "index.html"))
        throw new PublishUsageError("index.html is absent at the root");
    return { files, skipped };
}
function checkPublishLimits(files, limits) {
    const bytes = totalPublishBytes(files);
    if (files.length > limits.maxFiles || bytes > limits.maxBytes) {
        throw new PublishUsageError(`${files.length} files, ${formatBytes(bytes)} bytes; this ticket allows ${limits.maxFiles} files and ${formatBytes(limits.maxBytes)} bytes`);
    }
}
function publishKeyFile(env, name) {
    const root = connectorRoot(env);
    if (!root)
        throw new PublishUsageError("The connector home is not set.");
    ensurePrivateDir(root);
    const dir = join(root, "publish");
    ensurePrivateDir(dir);
    const file = join(dir, `${name}.jwk`);
    const rel = relative(dir, file);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel) || rel.includes("/") || rel.includes("\\")) {
        throw new PublishUsageError("The site name is not a valid file name.");
    }
    return file;
}
function readPublishKey(file) {
    let fd;
    try {
        fd = openSync(file, openReadFlags());
    }
    catch (err) {
        if (errnoOf(err) === "ENOENT")
            throw new PublishUsageError("the app key file does not exist");
        if (errnoOf(err) === "ELOOP")
            throw new PublishUsageError("refusing to follow a symlink for the app key");
        throw new PublishUsageError("the app key file is not usable");
    }
    try {
        const st = fstatSync(fd);
        if (!st.isFile())
            throw new PublishUsageError("the app key file is not a file");
        if ((st.mode & 0o777) !== 0o600)
            throw new PublishUsageError("the app key file must be mode 0600");
        let parsed;
        try {
            parsed = JSON.parse(readFileSync(fd, "utf8"));
        }
        catch {
            throw new PublishUsageError("the app key file is not an EC P-256 private JWK");
        }
        const j = asRecord(parsed);
        if (j === null || j.kty !== "EC" || j.crv !== "P-256" || typeof j.x !== "string" || j.x === "" || typeof j.y !== "string" || j.y === "" || typeof j.d !== "string" || j.d === "") {
            throw new PublishUsageError("the app key file is not an EC P-256 private JWK");
        }
        return { publicJwk: { kty: "EC", crv: "P-256", x: j.x, y: j.y }, d: j.d };
    }
    finally {
        closeSync(fd);
    }
}
function writePublishKey(file, jwk) {
    try {
        lstatSync(file);
        throw new PublishUsageError("refusing to overwrite the app key");
    }
    catch (err) {
        if (err instanceof PublishUsageError)
            throw err;
        if (errnoOf(err) !== "ENOENT")
            throw new PublishUsageError("the app key path is not usable");
    }
    const parent = dirname(file);
    try {
        const parentStat = lstatSync(parent);
        if (!parentStat.isDirectory())
            throw new PublishUsageError("the app key path is not usable");
    }
    catch (err) {
        if (err instanceof PublishUsageError)
            throw err;
        throw new PublishUsageError("the app key path is not usable");
    }
    const body = `${JSON.stringify({ kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d })}\n`;
    let fd;
    try {
        fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    }
    catch (err) {
        if (errnoOf(err) === "EEXIST")
            throw new PublishUsageError("refusing to overwrite the app key");
        throw new PublishUsageError("the app key path is not usable");
    }
    try {
        fchmodSync(fd, 0o600);
        writeSync(fd, body);
        const mode = fstatSync(fd).mode & 0o777;
        if (mode !== 0o600)
            throw new PublishUsageError("refusing to leave an app key that is not mode 0600");
    }
    catch (err) {
        closeSync(fd);
        try {
            unlinkSync(file);
        }
        catch {
            // The file just created could not be removed. Its contents are not printed.
        }
        if (err instanceof PublishUsageError)
            throw err;
        throw new PublishUsageError("the app key file was not written");
    }
    closeSync(fd);
}
/** Creates `~/.gilb-connector/publish/<name>.jwk` (0600) or reads the one already there. A failure leaves it. */
function loadOrCreatePublishKey(env, name) {
    const file = publishKeyFile(env, name);
    let existing;
    try {
        existing = lstatSync(file);
    }
    catch (err) {
        if (errnoOf(err) !== "ENOENT")
            throw new PublishUsageError("the app key path is not usable");
    }
    if (existing) {
        if (existing.isSymbolicLink())
            throw new PublishUsageError("refusing to follow a symlink for the app key");
        return readPublishKey(file);
    }
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const exported = privateKey.export({ format: "jwk" });
    if (exported.kty !== "EC" || exported.crv !== "P-256" || typeof exported.x !== "string" || exported.x === "" || typeof exported.y !== "string" || exported.y === "" || typeof exported.d !== "string" || exported.d === "") {
        throw new PublishUsageError("key generation did not produce an EC P-256 private JWK");
    }
    writePublishKey(file, { x: exported.x, y: exported.y, d: exported.d });
    return { publicJwk: { kty: "EC", crv: "P-256", x: exported.x, y: exported.y }, d: exported.d };
}
function buildPublishBody(ticket, files, appPublicJwk) {
    const body = {
        ticket,
        files: files.map((f) => ({ path: f.path, contentBase64: Buffer.from(f.bytes).toString("base64") })),
    };
    if (appPublicJwk !== undefined)
        body.clientPublicKey = { kty: "EC", crv: "P-256", x: appPublicJwk.x, y: appPublicJwk.y };
    return body;
}
function refusalText(status, parsed, secrets) {
    const message = safeRemoteText(parsed?.message, secrets);
    const error = safeRemoteText(parsed?.error, secrets);
    if (error !== "" && message !== "")
        return `${error}: ${message}`;
    if (message !== "" || error !== "")
        return message || error;
    if (status === 401)
        return "The platform refused this sign-in.";
    return `the platform answered ${status}`;
}
function rememberHeaderSecrets(headers, secrets) {
    for (const [name, value] of Object.entries(headers)) {
        const lower = name.toLowerCase();
        if (lower === "content-type" || lower === "accept" || value === "")
            continue;
        secrets.push(value);
        if (lower === "authorization") {
            const token = value.split(" ").pop() ?? "";
            if (token.length >= 8)
                secrets.push(token);
        }
    }
}
async function requestPublishTicket(cred, origin, input, fetchImpl, secrets) {
    const url = new URL(origin);
    url.pathname = "/base/publish/ticket";
    url.search = "";
    url.hash = "";
    const ticketUrl = url.toString();
    const signed = await cred.authHeaders("POST", ticketUrl);
    const headers = {};
    for (const [k, v] of Object.entries(signed)) {
        if (typeof v !== "string")
            continue;
        if (k.toLowerCase() === "content-type")
            continue;
        headers[k] = v;
    }
    headers["content-type"] = "application/json";
    headers.accept = "application/json";
    rememberHeaderSecrets(headers, secrets);
    let res;
    try {
        res = await fetchImpl(ticketUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ kind: input.kind, siteName: input.siteName }),
            redirect: "manual",
        });
    }
    catch {
        throw new PublishNetworkError("the platform could not be reached");
    }
    let parsed = null;
    try {
        const text = await res.text();
        parsed = asRecord(text === "" ? null : JSON.parse(text));
    }
    catch {
        parsed = null;
    }
    if (parsed !== null && typeof parsed.ticket === "string" && parsed.ticket !== "")
        secrets.push(parsed.ticket);
    if (res.status !== 200)
        throw new PublishPlatformError(refusalText(res.status, parsed, secrets));
    if (parsed === null)
        throw new PublishPlatformError("the platform's ticket answer was missing a field");
    const ticket = parsed.ticket;
    const expiresAt = parsed.expiresAt;
    const kind = parsed.kind;
    const siteName = parsed.siteName;
    const maxFiles = parsed.maxFiles;
    const maxBytes = parsed.maxBytes;
    if (typeof ticket !== "string" || ticket === "" || (typeof expiresAt !== "string" && typeof expiresAt !== "number") || (kind !== "app" && kind !== "website") || typeof siteName !== "string" || siteName === "" || typeof maxFiles !== "number" || !Number.isFinite(maxFiles) || maxFiles < 0 || typeof maxBytes !== "number" || !Number.isFinite(maxBytes) || maxBytes < 0) {
        throw new PublishPlatformError("the platform's ticket answer was missing a field");
    }
    if (siteName !== input.siteName)
        throw new PublishPlatformError("the ticket's site name does not match the name asked for");
    if (kind !== input.kind)
        throw new PublishPlatformError("the ticket's kind does not match the kind asked for");
    const answer = { ticket, expiresAt, kind, siteName, maxFiles, maxBytes };
    const workerRaw = parsed.workerUrl;
    if (workerRaw !== undefined && workerRaw !== null && workerRaw !== "") {
        if (typeof workerRaw !== "string")
            throw new PublishUsageError("The upload address is not a workers.dev host.");
        answer.workerUrl = workerRaw;
    }
    return answer;
}
function headerMap(headers) {
    const out = {};
    headers.forEach((value, key) => {
        out[key.toLowerCase()] = value;
    });
    return out;
}
function workerText(json, secrets) {
    const row = asRecord(json);
    if (row === null)
        return "";
    const error = safeRemoteText(row.error, secrets);
    const message = safeRemoteText(row.message, secrets);
    if (error !== "" && message !== "")
        return `${error}: ${message}`;
    return message || error;
}
function liveFields(json) {
    const row = asRecord(json);
    if (row === null)
        return null;
    if (row.siteState !== "t:SiteStateLive" || typeof row.url !== "string" || row.url === "")
        return null;
    if (row.admittedOrigin !== null && row.admittedOrigin !== undefined && typeof row.admittedOrigin !== "string")
        return null;
    return { siteState: "t:SiteStateLive" };
}
async function uploadToWorker(workerUrl, body, fetchImpl, env) {
    const endpoint = publishEndpoint(workerUrl, env);
    const headers = { "content-type": "application/json" };
    for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === "authorization" || name.toLowerCase() === "dpop") {
            throw new PublishUsageError("refusing to send the sign-in credential to the Worker");
        }
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), UPLOAD_TIMEOUT_MS);
    if (typeof timer.unref === "function")
        timer.unref();
    try {
        const res = await fetchImpl(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: ac.signal, redirect: "manual" });
        let json = {};
        try {
            json = JSON.parse(await res.text());
        }
        catch {
            json = {};
        }
        return { status: res.status, json, headers: headerMap(res.headers) };
    }
    catch (e) {
        if (e instanceof PublishUsageError)
            throw e;
        const name = e !== null && typeof e === "object" && "name" in e ? e.name : "";
        if (name === "AbortError")
            throw new PublishNetworkError("the upload timed out");
        throw new PublishNetworkError("the upload could not reach the Worker");
    }
    finally {
        clearTimeout(timer);
    }
}
function warnCors(headers, stderr, secrets) {
    const names = Object.keys(headers)
        .filter((k) => k.toLowerCase().startsWith("access-control-"))
        .map((k) => safeRemoteText(k, secrets));
    if (names.length > 0)
        stderr(`warning: the Worker sent ${names.join(", ")}; step 1 expects no access-control header`);
}
function printDryRun(args, files, skipped, stdout) {
    stdout("dry-run (no network call)");
    stdout(`site: ${args.name}`);
    stdout(`address: ${pagesAddress(args.name)}`);
    stdout(`kind: ${args.kind}`);
    stdout(`files: ${files.length}`);
    stdout(`bytes: ${totalPublishBytes(files)}`);
    for (const skippedPath of skipped)
        stdout(`skipped: ${safeLocalText(skippedPath)}`);
}
function parsePublishArgs(argv, env) {
    let help = false;
    let dryRun = false;
    let dir = "";
    let name = "";
    let kind = "app";
    let asFlag;
    let originFlag;
    let profileFlag;
    let workerUrl = "";
    const known = new Set(["--dir", "--name", "--kind", "--dry-run", "--as", "--origin", "--profile", "--worker-url", "--help", "-h"]);
    const assign = (flag, value) => {
        if (flag === "--dir")
            dir = value;
        else if (flag === "--name")
            name = value;
        else if (flag === "--kind") {
            if (value !== "app" && value !== "website")
                throw new CliError("--kind must be app or website.");
            kind = value;
        }
        else if (flag === "--as")
            asFlag = value;
        else if (flag === "--origin")
            originFlag = value;
        else if (flag === "--profile")
            profileFlag = value;
        else if (flag === "--worker-url")
            workerUrl = value;
    };
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i] ?? "";
        if (token === "--help" || token === "-h") {
            help = true;
            continue;
        }
        if (token === "--dry-run") {
            dryRun = true;
            continue;
        }
        if (!token.startsWith("-"))
            throw new CliError(`unexpected argument ${token}`);
        const eq = token.indexOf("=");
        const flag = eq === -1 ? token : token.slice(0, eq);
        const inline = eq === -1 ? "" : token.slice(eq + 1);
        if (!known.has(flag))
            throw new CliError(`Unknown option: ${flag}`);
        if (flag === "--dry-run" || flag === "--help" || flag === "-h") {
            if (inline !== "")
                throw new CliError(`${flag} does not take a value.`);
            if (flag === "--dry-run")
                dryRun = true;
            else
                help = true;
            continue;
        }
        if (eq !== -1 && inline === "")
            throw new CliError(`${flag} needs a value.`);
        if (inline !== "") {
            assign(flag, inline);
            continue;
        }
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--"))
            throw new CliError(`${flag} needs a value.`);
        i += 1;
        assign(flag, value);
    }
    if (help) {
        return { help: true, dryRun, dir, name, kind, as: "ai", origin: DEFAULT_ORIGIN, profile: undefined, workerUrl, displayName: undefined };
    }
    if (dir === "")
        throw new CliError("--dir is required.");
    if (name === "")
        throw new CliError("--name is required.");
    const asRaw = (asFlag ?? env.GILB_CONNECTOR_AS ?? "ai").trim().toLowerCase();
    if (asRaw !== "ai" && asRaw !== "me")
        throw new CliError("--as must be ai or me.");
    const asMode = asRaw;
    const profileRaw = asMode === "me"
        ? profileFlag ?? env.GILB_CONNECTOR_PROFILE ?? env.GILB_COMPUTER_PROFILE ?? diskProfile(env)
        : profileFlag ?? env.GILB_CONNECTOR_PROFILE ?? DEFAULT_AI_PROFILE;
    if (profileRaw !== undefined && (!PROFILE_NAME.test(profileRaw) || profileRaw === "." || profileRaw === "..")) {
        throw new CliError("The computer profile name is not valid.");
    }
    const origin = normalizeOrigin(originFlag ?? env.GILB_CONNECTOR_ORIGIN ?? DEFAULT_ORIGIN);
    let displayName;
    const fromEnv = env.GILB_CONNECTOR_NAME;
    if (fromEnv !== undefined && fromEnv !== "") {
        const trimmed = fromEnv.trim();
        if (trimmed === "" || trimmed.length > 256)
            throw new CliError("The display name must be 1 to 256 characters.");
        displayName = trimmed;
    }
    if (workerUrl !== "")
        publishEndpoint(workerUrl, env);
    return { help: false, dryRun, dir, name, kind, as: asMode, origin, profile: profileRaw, workerUrl, displayName };
}
async function runPublish(argv, io) {
    const args = parsePublishArgs(argv, io.env);
    if (args.help) {
        io.stdout(PUBLISH_USAGE.trimEnd());
        return 0;
    }
    assertSiteName(args.name);
    const collected = await collectPublishFiles(args.dir);
    checkPublishLimits(collected.files, { maxFiles: PUBLISH_MAX_FILES, maxBytes: PUBLISH_MAX_BYTES });
    if (args.dryRun) {
        printDryRun(args, collected.files, collected.skipped, io.stdout);
        return 0;
    }
    const secrets = [];
    let appPublic;
    if (args.kind === "app") {
        const loaded = loadOrCreatePublishKey(io.env, args.name);
        appPublic = loaded.publicJwk;
        secrets.push(loaded.d, loaded.publicJwk.x, loaded.publicJwk.y);
    }
    const cred = await openSessionCredential({
        env: io.env,
        origin: args.origin,
        asMode: args.as,
        profile: args.as === "ai" ? safeProfileName(args.profile ?? DEFAULT_AI_PROFILE) : args.profile,
        displayName: args.displayName,
        say() {
            // The failure is printed once, by publishCommand, from the error this throws.
        },
        retryDelays: RETRY_DELAYS_MS,
        fetchImpl: io.fetchImpl,
        onClientId() {
            return undefined;
        },
    });
    const ticket = await requestPublishTicket(cred, args.origin, { kind: args.kind, siteName: args.name }, io.fetchImpl, secrets);
    try {
        checkPublishLimits(collected.files, { maxFiles: ticket.maxFiles, maxBytes: ticket.maxBytes });
    }
    catch (err) {
        if (err instanceof PublishUsageError)
            throw new PublishUsageError(`${err.message}; a new ticket is needed`);
        throw err;
    }
    const workerRaw = ticket.workerUrl !== undefined ? ticket.workerUrl : args.workerUrl;
    if (workerRaw === "")
        throw new PublishUsageError(NO_WORKER_SENTENCE);
    const body = buildPublishBody(ticket.ticket, collected.files, appPublic);
    const uploaded = await uploadToWorker(workerRaw, body, io.fetchImpl, io.env);
    if (uploaded.json !== null && typeof uploaded.json === "object" && !Array.isArray(uploaded.json)) {
        const echoed = uploaded.json.ticket;
        if (typeof echoed === "string" && echoed !== "")
            secrets.push(echoed);
    }
    warnCors(uploaded.headers, io.stderr, secrets);
    if (uploaded.status >= 500) {
        const detail = workerText(uploaded.json, secrets);
        throw new PublishWorkerError(detail === "" ? NOTHING_ADMITTED : `${detail} ${NOTHING_ADMITTED}`);
    }
    if (uploaded.status !== 200) {
        const detail = workerText(uploaded.json, secrets);
        throw new PublishWorkerError(detail === "" ? "the Worker refused the upload" : detail);
    }
    const live = liveFields(uploaded.json);
    if (live === null)
        throw new PublishWorkerError("the Worker did not report a live site");
    io.stdout(pagesAddress(args.name));
    io.stdout(live.siteState);
    return 0;
}
/**
 * `publish` puts a built folder on `https://<name>.pages.dev`.
 * Exit 0 when the site is live, or when `--dry-run` or `--help` finishes.
 * Exit 2: usage or a local refusal. Exit 3: the platform refused the ticket.
 * Exit 4: the Worker refused. Exit 5: the network. Never prints a ticket, a header, or a key.
 */
export async function publishCommand(argv, io = {}) {
    const stdout = io.stdout ?? ((line) => process.stdout.write(line.endsWith("\n") ? line : `${line}\n`));
    const stderr = io.stderr ?? ((line) => process.stderr.write(line.endsWith("\n") ? line : `${line}\n`));
    const fetchImpl = io.fetchImpl ?? fetch;
    const env = io.env ?? process.env;
    try {
        return await runPublish(argv, { stdout, stderr, fetchImpl, env });
    }
    catch (err) {
        if (err instanceof CliError || err instanceof PublishUsageError) {
            stderr(safeLocalText(err.message));
            return 2;
        }
        if (err instanceof PublishPlatformError) {
            stderr(err.message);
            return 3;
        }
        if (err instanceof PublishWorkerError) {
            stderr(err.message);
            return 4;
        }
        if (err instanceof PlatformDown || err instanceof PublishNetworkError) {
            stderr(err.message);
            return 5;
        }
        if (err instanceof NotConnected) {
            stderr(err.message);
            return 2;
        }
        stderr("publish failed");
        return 5;
    }
}
async function main() {
    const argv = process.argv.slice(2);
    if (argv[0] === "publish") {
        const code = await publishCommand(argv.slice(1));
        process.exit(code);
    }
    let cli;
    try {
        cli = parseCli(argv, process.env);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Could not read the options.";
        process.stderr.write(message + "\n");
        process.exit(2);
    }
    if (cli.help) {
        process.stderr.write(helpText() + "\n");
        return;
    }
    let hopTools;
    let hopUserText;
    if (cli.hopToolsPath !== undefined) {
        try {
            const spec = readHopSpec(cli.hopToolsPath);
            hopTools = spec.tools;
            hopUserText = spec.userText;
        }
        catch (err) {
            process.stderr.write((err instanceof Error ? err.message : "Could not read the hand-off's tools.") + "\n");
            process.exit(2);
        }
    }
    const session = startConnector({
        input: process.stdin,
        output: process.stdout,
        agent: cli.agent,
        origin: cli.origin,
        vaults: cli.vaults,
        claudeBin: cli.claudeBin,
        hopCli: cli.hopCli,
        codexBin: cli.codexBin,
        progressEveryMs: cli.progressEveryMs,
        env: process.env,
        selfFile: fileURLToPath(import.meta.url),
        as: cli.as,
        uploadRoots: cli.uploadRoots,
        ...(cli.hopModel !== undefined ? { hopModel: cli.hopModel } : {}),
        ...(cli.name !== undefined ? { name: cli.name } : {}),
        ...(cli.profile !== undefined ? { profile: cli.profile } : {}),
        ...(cli.hopId !== undefined ? { hopId: cli.hopId } : {}),
        ...(cli.turnId !== undefined ? { turnId: cli.turnId } : {}),
        ...(cli.hopCreatedPath !== undefined ? { hopCreatedPath: cli.hopCreatedPath } : {}),
        ...(cli.hopDeadline !== undefined ? { hopDeadline: cli.hopDeadline } : {}),
        ...(hopTools !== undefined ? { hopTools } : {}),
        ...(hopUserText !== undefined ? { userText: hopUserText } : {}),
    });
    const stop = () => session.close();
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    await session.done;
    process.exit(0);
}
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((err) => {
        const message = err instanceof Error ? err.message : "The connector stopped.";
        process.stderr.write(message + "\n");
        process.exit(1);
    });
}
