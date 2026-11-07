#!/usr/bin/env node
// gilb-claude-code bridge (web app <-> Claude Code on this computer).
//
// Lets an app's agent pane (GilbApp, or any app that uses the gilb-claude-code package) talk to the Claude Code that is
// installed and logged in on THIS computer, the way the Claudian plugin does in Obsidian. Start it in a terminal, then
// in the app pick Connect > Claude Code.
//
//   node bridge.mjs [--allow-origin https://your-app.example]
//
// Always on without a window (macOS): `node bridge.mjs --install` (then --code, --status, --uninstall). See README.md.
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
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
export const BRIDGE_VERSION = "1";
/** Package version of this bridge. `/v1/hello` reports it; an older bridge sends none. */
export const BRIDGE_BUILD = "0.1.8";
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
const envDenied = (k) => {
    const u = k.toUpperCase(); // Windows env names are case-insensitive
    return BILLING_ENV_DENY.includes(u) || BILLING_ENV_DENY_PREFIXES.some((p) => u.startsWith(p));
};
/** The environment a `claude` child gets: ours, minus everything in {@link BILLING_ENV_DENY} and {@link BILLING_ENV_DENY_PREFIXES}. */
export function childEnv(env = process.env) {
    const out = {};
    for (const [k, v] of Object.entries(env))
        if (!envDenied(k))
            out[k] = v;
    // The Claude CLI gives up on one MCP tool call after its own default wait, far shorter than a hand-off may run here.
    // Make it wait as long as the bridge does (a larger value the person set themselves is kept).
    const own = Number(out.MCP_TOOL_TIMEOUT);
    if (!(Number.isFinite(own) && own > MCP_TOOL_TIMEOUT_MS))
        out.MCP_TOOL_TIMEOUT = String(MCP_TOOL_TIMEOUT_MS);
    // Belt and braces: the CLI's idle limit (reset by progress) gets the same value.
    const ownIdle = Number(out.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT);
    if (!(Number.isFinite(ownIdle) && ownIdle > MCP_TOOL_TIMEOUT_MS))
        out.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT = String(MCP_TOOL_TIMEOUT_MS);
    return out;
}
// Single-file use (downloaded from the app): allowed-origins.json is not next to this file, so these built-in
// defaults apply. The source keeps this list EMPTY: the host app names its own origins, and the Vite plugin
// (claudeCodeBridgeFile({ defaultAllowedOrigins })) writes them into this one line when it serves or emits the file.
export const DEFAULT_ALLOWED_ORIGINS = [];
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
setInterval(function () {
  if (!window.opener || window.opener.closed) statusEl.textContent = "The page that opened this window has closed. You can close it.";
}, 2000);
var HEADERS = ["content-type", "x-bridge-secret", "accept"];
addEventListener("message", function (ev) {
  if (!window.opener || ev.source !== window.opener || ALLOW.indexOf(ev.origin) < 0) return;
  var m = ev.data;
  if (!m || typeof m !== "object" || typeof m.type !== "string") return;
  if (m.type !== "gilb-bridge-req" && m.type !== "gilb-bridge-abort") return;
  if (peer === null) peer = ev.origin;
  else if (ev.origin !== peer) return;
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
export function relayPage(allowedOrigins) {
    const escJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const script = RELAY_SCRIPT.replace("__ALLOW__", () => escJson(allowedOrigins)).replace("__BUILD__", () => escJson(BRIDGE_BUILD));
    const hash = crypto.createHash("sha256").update(script, "utf8").digest("base64");
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Claude Code bridge window</title></head>' +
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
export function normalizeOrigin(input) {
    const raw = String(input ?? "").trim();
    if (!raw || raw.includes("*"))
        throw new Error(`"${raw}" is not an origin. Use the exact address of the app, for example https://app.example.com (no wildcard).`);
    let u;
    try {
        u = new URL(raw);
    }
    catch {
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
export function loadAllowedOrigins(extra = []) {
    let file = { origins: DEFAULT_ALLOWED_ORIGINS };
    try {
        file = JSON.parse(fs.readFileSync(path.join(HERE, "allowed-origins.json"), "utf8"));
    }
    catch (err) {
        if (err?.code !== "ENOENT")
            throw err;
    }
    const fromEnv = (process.env.GILB_BRIDGE_ALLOW_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    // Added origins (flag, environment) must be well formed; the file and the built-in list are trusted as shipped.
    return [...new Set([...file.origins, ...fromEnv.map(normalizeOrigin), ...extra.map(normalizeOrigin)])];
}
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
export function newPairingCode() {
    const bytes = crypto.randomBytes(6);
    let s = "";
    for (const b of bytes)
        s += CODE_ALPHABET[b % CODE_ALPHABET.length];
    return `${s.slice(0, 3)}-${s.slice(3)}`;
}
const normCode = (c) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const realFiles = {
    exists: (p) => {
        try {
            fs.accessSync(p, fs.constants.F_OK);
            return true;
        }
        catch {
            return false;
        }
    },
    read: (p) => fs.readFileSync(p, "utf8"),
};
/** An environment variable by name, ignoring case (Windows names are case-insensitive, a copied env object is not). */
function envGet(env, name) {
    if (env[name] !== undefined)
        return env[name];
    const want = name.toLowerCase();
    for (const k of Object.keys(env))
        if (k.toLowerCase() === want)
            return env[k];
    return undefined;
}
/** The extensions Node can start without a shell, plus the two shim kinds this file reads, in the order PATHEXT lists them. */
const WIN_EXTS = [".com", ".exe", ".bat", ".cmd"];
function winExts(env) {
    const raw = envGet(env, "PATHEXT");
    const listed = (raw ?? "").split(";").map((e) => e.trim().toLowerCase()).filter((e) => WIN_EXTS.includes(e));
    return [...new Set(listed.length ? listed : [".exe", ".cmd", ".bat", ".com"])];
}
/** What a `.cmd` made by npm's cmd-shim runs: an `.exe`, or a node script, relative to the shim's folder. Null when the file is anything else. */
export function parseCmdShim(text) {
    const lines = text.split(/\r?\n/);
    // node script: `"%_prog%"  "%dp0%\node_modules\...\cli.js" %*`, with `SET "_prog=node"` in the file (no other program, no extra arguments)
    if (lines.some((l) => /^\s*SET "_prog=node"\s*$/i.test(l))) {
        for (const l of lines) {
            const m = /"%_prog%"[ \t]+"%dp0%[\\/]+([^"%\r\n]+)"[ \t]+%\*[ \t]*$/.exec(l);
            if (m)
                return /\.(c|m)?js$/i.test(m[1]) ? { kind: "node", target: m[1] } : null;
        }
        return null;
    }
    // a program: `"%dp0%\...\claude.exe"   %*`
    for (const l of lines) {
        const m = /^"%dp0%[\\/]+([^"%\r\n]+)"[ \t]+%\*[ \t]*$/.exec(l);
        if (m)
            return /\.(exe|com)$/i.test(m[1]) ? { kind: "exe", target: m[1] } : null;
    }
    return null;
}
export function refusedLaunch(found) {
    return `Claude Code was found as ${found}, which the bridge cannot start safely. Install Claude Code with Anthropic's Windows installer, then start the bridge again.`;
}
/**
 * Works out how to start `claude`. Off Windows: the name as given, nothing added. On Windows: an absolute path, and never a shell
 * (`.exe` directly; a `.js` file or an npm `.cmd` shim as node + the script; anything else is refused).
 */
export function resolveClaudeLaunch(bin, env = process.env, o = {}) {
    const platform = o.platform ?? process.platform;
    if (platform !== "win32")
        return { ok: true, command: bin, prefix: [], shown: bin };
    const W = path.win32;
    const files = o.files ?? realFiles;
    const nodePath = o.nodePath ?? process.execPath;
    const found = resolveBin(bin, env, o.home ?? os.homedir(), "win32", files);
    // Not found: let the start fail with "not installed" the usual way.
    if (!found || !files.exists(found))
        return { ok: true, command: bin, prefix: [], shown: bin };
    const ext = W.extname(found).toLowerCase();
    if (ext === ".exe" || ext === ".com")
        return { ok: true, command: found, prefix: [], shown: found };
    if (ext === ".js" || ext === ".cjs" || ext === ".mjs")
        return { ok: true, command: nodePath, prefix: [found], shown: found };
    if (ext === ".cmd" || ext === ".bat") {
        let shim = null;
        try {
            shim = parseCmdShim(files.read(found));
        }
        catch {
            /* unreadable: refused below */
        }
        if (shim) {
            const target = W.resolve(W.dirname(found), shim.target);
            if (files.exists(target)) {
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
export function killChild(child, env = process.env, o = {}) {
    if (!child)
        return Promise.resolve();
    const platform = o.platform ?? process.platform;
    if (platform !== "win32") {
        child.kill("SIGTERM");
        return Promise.resolve();
    }
    const pid = child.pid;
    const root = envGet(env, "SystemRoot") ?? envGet(env, "windir") ?? "C:\\Windows";
    const run = o.execFile ?? ((file, args, opts, cb) => execFile(file, args, opts, (e) => cb(e)));
    return new Promise((resolve) => {
        if (pid === undefined) {
            child.kill();
            return resolve();
        }
        try {
            run(path.win32.join(root, "System32", "taskkill.exe"), ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, (err) => {
                if (err)
                    child.kill(); // taskkill could not run, or the process is already gone
                resolve();
            });
        }
        catch {
            child.kill();
            resolve();
        }
    });
}
/** A command path as the person should type it. Off Windows: as it is. In PowerShell: under the home folder as "$HOME\...", else single-quoted. */
export function commandPathForPerson(file, home = os.homedir(), platform = process.platform) {
    if (platform !== "win32")
        return file;
    const W = path.win32;
    const rel = W.relative(home, file);
    if (rel && !rel.startsWith("..") && !W.isAbsolute(rel) && !/[$`"]/.test(rel))
        return `"$HOME\\${rel}"`;
    return `'${file.replace(/'/g, "''")}'`;
}
export const WINDOWS_ALWAYS_ON_LATER = "Always On for Windows is coming. For now start the bridge in a PowerShell window and keep it open.";
/**
 * Checks, with the CLI's own `auth status`, that the person is logged in with a Claude SUBSCRIPTION.
 * Runs with the billing variables removed, so what it reports is what every turn will use.
 * @returns {Promise<{ok:true, info:{email?:string, subscriptionType:string}} | {ok:false, reason:string}>}
 */
export function checkSubscriptionLogin(claudeBin = "claude", env = process.env, platformOpts = {}) {
    return new Promise((resolve) => {
        const launch = resolveClaudeLaunch(claudeBin, env, platformOpts);
        if (!launch.ok) {
            resolve({ ok: false, reason: launch.reason });
            return;
        }
        execFile(launch.command, [...launch.prefix, "auth", "status"], { env: childEnv(env), timeout: 20000, windowsHide: true }, (err, stdout) => {
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
            let st;
            try {
                st = JSON.parse(String(stdout));
            }
            catch {
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
const MAX_BODY = 2 * 1024 * 1024;
const TOOL_WAIT_MS = 15 * 60 * 1000;
const MAX_TURNS_AT_ONCE = 4;
/** How many nested hand-offs one turn may have running at once. */
export const MAX_HANDOFFS_AT_ONCE = 4;
/** `parentCallId` on a nested turn: the bridge's own id for the relayed call that asked. */
const PARENT_CALL_ID = /^[0-9a-f]{16}$/;
// A person turn and every hand-off it opens (a nested `claude -p`) draw on ONE budget of tool calls, as /base/ai/chat's
// turn and its hops draw on one round ceiling (TURN_MAX_MODEL_ROUNDS = 240 on the server, which refuses past it too).
export const TURN_MAX_TOOL_CALLS = 240;
// A hand-off may run this long before the bridge stops it (its parent turn gets an error for that tool call).
export const HOP_MAX_MS = 15 * 60 * 1000;
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
export function createBridge(opts = {}) {
    const claudeBin = opts.claudeBin ?? "claude";
    const allowedOrigins = opts.allowedOrigins ?? loadAllowedOrigins();
    const workDir = opts.workDir ?? path.join(os.homedir(), ".gilb-claude-code-bridge", "work");
    const env = opts.env ?? process.env;
    const log = opts.log ?? (() => { });
    const maxPairFailures = opts.maxPairFailures ?? 5;
    const maxToolCalls = opts.maxToolCalls ?? TURN_MAX_TOOL_CALLS;
    const hopMaxMs = opts.hopMaxMs ?? HOP_MAX_MS;
    const progressEveryMs = opts.progressEveryMs ?? PROGRESS_EVERY_MS;
    let port = opts.port ?? DEFAULT_PORT;
    // How to start claude, worked out once (Windows: never through a shell; a claude that cannot be started safely is refused).
    const launch = resolveClaudeLaunch(claudeBin, env, opts.platformOpts);
    const stopChild = (c) => killChild(c, env, opts.platformOpts);
    let pairingCode = newPairingCode();
    let pairFailures = 0;
    const pairingTtlMs = opts.pairingTtlMs ?? PAIRING_TTL_MS;
    const maxPairings = opts.maxPairings ?? MAX_PAIRINGS;
    const now = opts.now ?? Date.now;
    /** sha256 hex of each issued secret -> { origin (the page it was issued to, or null for a non-browser), principalHash, issued, lastUsed, saved } */
    const pairings = new Map();
    function loadPairings() {
        if (!opts.pairingsFile)
            return;
        let rows;
        try {
            if (fs.statSync(opts.pairingsFile).size > 1024 * 1024)
                return; // far more than maxPairings rows: not our file
            rows = JSON.parse(fs.readFileSync(opts.pairingsFile, "utf8")).pairings;
        }
        catch {
            return; // no file, or a damaged one: nobody is paired, the person pairs again
        }
        if (!Array.isArray(rows))
            return;
        for (const r of rows.slice(0, 1000)) {
            if (!r || typeof r.hash !== "string" || !/^[0-9a-f]{64}$/.test(r.hash))
                continue;
            if (typeof r.issued !== "number" || typeof r.lastUsed !== "number")
                continue;
            if (!Number.isFinite(r.issued) || !Number.isFinite(r.lastUsed))
                continue;
            if (now() - r.lastUsed > pairingTtlMs)
                continue;
            const lastUsed = Math.min(r.lastUsed, now()); // a time in the future cannot make a pairing immortal
            pairings.set(r.hash, {
                origin: typeof r.origin === "string" ? r.origin : null,
                principalHash: typeof r.principalHash === "string" ? r.principalHash : null,
                issued: r.issued,
                lastUsed,
                saved: lastUsed,
            });
        }
        while (pairings.size > maxPairings)
            dropOldest();
    }
    function dropOldest() {
        let oldest = null;
        for (const [h, p] of pairings)
            if (oldest === null || p.lastUsed < pairings.get(oldest).lastUsed)
                oldest = h;
        if (oldest !== null)
            pairings.delete(oldest);
    }
    function savePairings() {
        if (!opts.pairingsFile)
            return;
        try {
            const dir = path.dirname(opts.pairingsFile);
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            fs.chmodSync(dir, 0o700);
            const tmp = `${opts.pairingsFile}.${process.pid}.tmp`;
            fs.rmSync(tmp, { force: true });
            const rows = [...pairings].map(([hash, p]) => ({ hash, origin: p.origin, principalHash: p.principalHash, issued: p.issued, lastUsed: p.lastUsed }));
            fs.writeFileSync(tmp, JSON.stringify({ version: 1, pairings: rows }), { mode: 0o600, flag: "wx" });
            fs.renameSync(tmp, opts.pairingsFile);
            for (const p of pairings.values())
                p.saved = p.lastUsed;
        }
        catch (e) {
            log(`could not save pairings: ${e?.message ?? e}`); // the bridge still works; the person may have to pair again after a restart
        }
    }
    loadPairings();
    /** @type {Map<string, any>} */
    const turns = new Map();
    const hostOk = (req) => {
        const h = String(req.headers.host ?? "");
        return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
    };
    function cors(origin, res) {
        if (origin === undefined)
            return true; // not a browser (curl, the tests)
        if (!allowedOrigins.includes(origin))
            return false;
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
    function effectiveOrigin(req) {
        const raw = req.headers.origin;
        const relay = req.headers["x-gilb-relay-origin"];
        if (raw !== undefined && raw === `http://${String(req.headers.host ?? "")}`) {
            if (typeof relay !== "string" || !allowedOrigins.includes(relay))
                return null;
            return { origin: relay, relayed: true };
        }
        // A browser sends no Origin on a same-origin GET, so the relay window's hello arrives with the header and no Origin.
        // /v1/hello needs no pairing and is answered to a caller with no Origin anyway, so that one request is let through as such.
        if (relay !== undefined && !(raw === undefined && req.method === "GET" && req.url?.split("?")[0] === "/v1/hello"))
            return null;
        return { origin: raw, relayed: false };
    }
    const json = (res, status, body) => {
        res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(body));
    };
    function readBody(req) {
        return new Promise((resolve, reject) => {
            let size = 0;
            const chunks = [];
            req.on("data", (c) => {
                size += c.length;
                if (size > MAX_BODY) {
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
                }
                catch {
                    reject(Object.assign(new Error("not json"), { status: 400 }));
                }
            });
            req.on("error", reject);
        });
    }
    /** True when the request carries a live secret that was issued to THIS origin. Using it slides its expiry. */
    const hasSecret = (req, origin) => {
        const s = req.headers["x-bridge-secret"];
        if (typeof s !== "string" || !s)
            return false;
        const hash = sha(s).toString("hex");
        const p = pairings.get(hash);
        if (!p)
            return false;
        const t = now();
        if (t - p.lastUsed > pairingTtlMs) {
            pairings.delete(hash);
            savePairings();
            return false;
        }
        if (p.origin !== (origin ?? null))
            return false;
        p.lastUsed = t;
        if (t - p.saved >= PERSIST_EVERY_MS)
            savePairings();
        return true;
    };
    function newPairing() {
        pairingCode = newPairingCode();
        pairFailures = 0;
        log(`Pairing code: ${pairingCode}`);
    }
    // ---- MCP server (one per turn), spoken to by `claude` over HTTP on 127.0.0.1 ----------------------------------
    function mcpReply(turn, msg) {
        const { id, method, params } = msg;
        const ok = (result) => ({ jsonrpc: "2.0", id, result });
        const bad = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
        if (method === "initialize") {
            return ok({
                protocolVersion: params?.protocolVersion ?? "2025-03-26",
                capabilities: { tools: {} },
                serverInfo: { name: "gilb", version: BRIDGE_VERSION },
            });
        }
        if (method === "ping")
            return ok({});
        if (method === "tools/list") {
            return ok({
                tools: turn.tools.map((t) => ({
                    name: t.name,
                    description: t.description ?? "",
                    inputSchema: t.inputSchema ?? { type: "object", properties: {} },
                })),
            });
        }
        if (method === "tools/call") {
            const name = params?.name;
            if (!turn.tools.some((t) => t.name === name))
                return Promise.resolve(bad(-32602, `Unknown tool ${name}`));
            return relayToolCall(turn, String(name), JSON.stringify(params?.arguments ?? {}), id).then((r) => ok({ content: [{ type: "text", text: r.text }], isError: r.isError }), (e) => ok({ content: [{ type: "text", text: String(e?.message ?? e) }], isError: true }));
        }
        return bad(-32601, `Method not found: ${method}`);
    }
    /**
     * Stops the nested turn that is answering the pending call `callId`, if one can be picked out.
     * A nested turn that named this call is that one. An older page that sent no id is stopped only when it is the only
     * such hand-off still running, and only when this call is itself a hand-off. Anything else is left running.
     */
    function stopHandoffFor(turn, callId) {
        const stop = (h) => {
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
        if (!p || !HAND_OFF_TOOLS.has(p.name))
            return;
        const unnamed = [...turn.handoffs].filter((h) => h.parentCallId === "");
        if (unnamed.length === 1)
            stop(unnamed[0]);
    }
    /**
     * The CLI abandoned (or its process ended with) a pending call. Settle it; if it was the call that a hand-off runs for,
     * stop that nested claude; and tell the page so it stops working on it.
     */
    function cancelCall(turn, id) {
        const p = turn.pending.get(id);
        if (!p)
            return;
        stopHandoffFor(turn, id);
        turn.pending.delete(id);
        turn.cancelled.add(id);
        if (turn.cancelled.size > MAX_CANCELLED_KEPT)
            turn.cancelled.delete(turn.cancelled.values().next().value);
        p.resolve({ text: "This call was cancelled.", isError: true });
        turn.send("tool_cancelled", { type: "tool_cancelled", id });
    }
    /** The person's turn. A hand-off reaches it through `parent`; `parent === null` is that turn. */
    function personTurn(turn) {
        let t = turn;
        while (t.parent)
            t = t.parent;
        return t;
    }
    function relayToolCall(turn, name, args, rpcId) {
        return new Promise((resolve, reject) => {
            if (turn.closed)
                return reject(new Error("The app page left; the turn was cancelled."));
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
            let timer;
            const fulfill = (r) => {
                if (settled)
                    return;
                settled = true;
                if (timer !== undefined)
                    clearTimeout(timer);
                resolve(r);
            };
            const fail = (e) => {
                if (settled)
                    return;
                settled = true;
                if (timer !== undefined)
                    clearTimeout(timer);
                reject(e);
            };
            // The page never answered. Reject with the timeout sentence (once), and still stop the hand-off and tell the page,
            // the same as a cancel. cancelCall then resolves the pending entry; fulfill ignores that second settlement.
            timer = setTimeout(() => {
                if (settled)
                    return;
                fail(new Error("The app did not answer the tool call in time."));
                cancelCall(turn, id);
            }, TOOL_WAIT_MS);
            turn.pending.set(id, { resolve: fulfill, reject: fail, name, rpcId });
            turn.send("tool_request", { id, name, arguments: args });
        });
    }
    async function handleMcp(req, res, turnId, token) {
        // Only the local claude process uses this; a browser must never reach it.
        if (req.headers.origin !== undefined)
            return json(res, 403, { error: "no browsers here" });
        const turn = turns.get(turnId);
        if (!turn || !same(token, turn.mcpToken))
            return json(res, 404, { error: "no such turn" });
        if (req.method === "GET" || req.method === "DELETE") {
            res.writeHead(405, { allow: "POST" });
            return res.end();
        }
        let body;
        try {
            body = await readBody(req);
        }
        catch (e) {
            return json(res, e.status ?? 400, { error: e.message });
        }
        const batch = Array.isArray(body);
        const msgs = batch ? body : [body];
        // A tool call that carries a progressToken, from a client that accepts SSE, is answered as a stream: progress
        // notifications while it is pending, then the result. Everything else is answered as before.
        const only = msgs[0];
        const ptoken = !batch ? only?.params?._meta?.progressToken : undefined;
        if (!batch && only?.method === "tools/call" && only.id !== undefined && ptoken !== undefined && ptoken !== null &&
            String(req.headers.accept ?? "").includes("text/event-stream")) {
            res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" });
            const write = (m) => {
                if (res.writableEnded || res.destroyed)
                    return;
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
                if (replied || !only)
                    return;
                for (const [pid, p] of [...turn.pending])
                    if (String(p.rpcId) === String(only.id))
                        cancelCall(turn, pid);
            });
            try {
                write(await mcpReply(turn, only));
                replied = true;
            }
            finally {
                clearInterval(timer);
            }
            if (!res.writableEnded && !res.destroyed)
                res.end();
            return;
        }
        const replies = [];
        for (const m of msgs) {
            if (m && m.id === undefined) {
                // A notification. The one that matters: the CLI gave up on a call it made.
                if (m.method === "notifications/cancelled" && m.params?.requestId !== undefined) {
                    for (const [pid, p] of [...turn.pending])
                        if (String(p.rpcId) === String(m.params.requestId))
                            cancelCall(turn, pid);
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
    function claudeArgs(turn, mode) {
        const mcp = { mcpServers: { gilb: { type: "http", url: `http://127.0.0.1:${port}/mcp/${turn.id}/${turn.mcpToken}` } } };
        const args = [
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
        if (mode.resume)
            args.push("--resume", mode.sessionId);
        else
            args.push("--session-id", mode.sessionId);
        if (turn.model)
            args.push("--model", turn.model);
        return args;
    }
    /** Runs `claude` once. Resolves { result?, error?, sessionId, model, apiKeyRefused? }. */
    function runClaude(turn, mode, prompt) {
        return new Promise((resolve) => {
            if (!launch.ok)
                return resolve({ error: launch.reason, sessionId: mode.sessionId, model: "" });
            let child;
            try {
                child = spawn(launch.command, [...launch.prefix, ...claudeArgs(turn, mode)], {
                    cwd: workDir,
                    env: childEnv(env),
                    stdio: ["pipe", "pipe", "pipe"],
                    windowsHide: true,
                });
            }
            catch (e) {
                return resolve({ error: `Could not start Claude Code: ${e?.message ?? e}`, sessionId: mode.sessionId, model: "" });
            }
            turn.child = child;
            let buf = "";
            let stderr = "";
            let model = "";
            let result = null;
            let refused = false;
            let sawInit = false;
            let initOk = false; // fail closed: a good init event (apiKeySource "none") must have been seen
            child.stderr.on("data", (d) => {
                stderr = (stderr + d).slice(-2000);
            });
            child.stdout.on("data", (d) => {
                buf += d;
                let i;
                while ((i = buf.indexOf("\n")) >= 0) {
                    const line = buf.slice(0, i).trim();
                    buf = buf.slice(i + 1);
                    if (!line)
                        continue;
                    let ev;
                    try {
                        ev = JSON.parse(line);
                    }
                    catch {
                        continue;
                    }
                    if (ev.type === "system" && ev.subtype === "init") {
                        model = ev.model ?? "";
                        sawInit = true;
                        // What the CLI itself says it is running with: no API key, and which tools exist. Shown to the page.
                        turn.send("status", { apiKeySource: ev.apiKeySource ?? null, tools: ev.tools ?? [], mcpServers: ev.mcp_servers ?? [], model });
                        // The CLI says where its credential comes from. Only the exact string "none" (the subscription login) passes;
                        // an API key, a helper, a missing field or any other shape stops the turn.
                        if (ev.apiKeySource === "none" && result === null)
                            initOk = true; // an init after the answer proves nothing
                        else {
                            refused = true;
                            void stopChild(child);
                        }
                    }
                    else if (ev.type === "result") {
                        result = ev;
                    }
                }
            });
            child.on("error", (e) => resolve({ error: `Could not start Claude Code: ${e.message}`, sessionId: mode.sessionId, model }));
            child.on("close", () => {
                turn.child = null;
                // This claude is gone: nothing waits for the calls it still had open.
                for (const pid of [...turn.pending.keys()])
                    cancelCall(turn, pid);
                // Fail closed: an answer is shown only after an init event that proved the subscription. The one exception is a
                // result that says no turn ran (num_turns 0, e.g. a lost session to resume): nothing was billed, and the retry is checked itself.
                if (!initOk && result && !(result.num_turns === 0 && result.is_error === true && !sawInit))
                    refused = true;
                if (refused) {
                    resolve({
                        error: "Claude Code did not confirm that this run uses your Claude subscription, so the bridge stopped it: a run that would use an API key, not your Claude subscription, is refused. The bridge refuses that. Remove ANTHROPIC_API_KEY / apiKeyHelper from your Claude Code settings, or run `claude auth login` with your subscription.",
                        sessionId: mode.sessionId,
                        model,
                        apiKeyRefused: true,
                    });
                }
                else if (result) {
                    resolve({ result, sessionId: mode.sessionId, model });
                }
                else {
                    resolve({ error: `Claude Code stopped without an answer.${stderr ? ` ${stderr.trim().split("\n").slice(-2).join(" ")}` : ""}`, sessionId: mode.sessionId, model });
                }
            });
            child.stdin.on("error", () => { });
            child.stdin.end(prompt);
        });
    }
    async function handleTurn(req, res) {
        let body;
        try {
            body = await readBody(req);
        }
        catch (e) {
            return json(res, e.status ?? 400, { error: e.message });
        }
        // A hand-off (run_named_role / ask_agent_concept) is a NESTED turn: the page opens it on this bridge, naming the turn
        // that asked and, when it knows it, the call that asked. One level only, up to MAX_HANDOFFS_AT_ONCE at once, on the
        // parent's budget, and it never resumes or reads a session.
        const parentId = typeof body.parentTurnId === "string" ? body.parentTurnId : "";
        let parent = null;
        let parentCallId = "";
        if (parentId) {
            parent = turns.get(parentId) ?? null;
            if (!parent || parent.closed)
                return json(res, 404, { error: "The turn that asked for this hand-off is not running." });
            if (parent.parent)
                return json(res, 400, { error: "A hand-off cannot hand off again." });
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
        }
        else if ([...turns.values()].filter((t) => !t.parent).length >= MAX_TURNS_AT_ONCE) {
            return json(res, 429, { error: "Too many turns at once." });
        }
        const prompt = typeof body.prompt === "string" ? body.prompt : "";
        const system = typeof body.system === "string" ? body.system : "";
        const tools = Array.isArray(body.tools) ? body.tools.filter((t) => t && typeof t.name === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(t.name)) : [];
        if (!prompt.trim() || !system.trim())
            return json(res, 400, { error: "prompt and system are required." });
        const model = parent
            ? parent.model
            : typeof body.model === "string" && /^[A-Za-z0-9][A-Za-z0-9._\-\[\]]{0,79}$/.test(body.model) ? body.model : "";
        const resumeId = !parent && typeof body.sessionId === "string" && UUID.test(body.sessionId) ? body.sessionId : "";
        const turn = {
            id: crypto.randomBytes(8).toString("hex"),
            mcpToken: crypto.randomBytes(24).toString("hex"),
            system,
            tools,
            model,
            pending: new Map(),
            closed: false,
            child: null,
            send: () => { },
            parent,
            handoffs: new Set(),
            parentCallId,
            cancelled: new Set(),
            root: parent ? parent.root : { calls: 0 },
            budgetSpent: false,
        };
        if (parent)
            parent.handoffs.add(turn);
        turns.set(turn.id, turn);
        res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            connection: "keep-alive",
            "x-accel-buffering": "no",
        });
        const send = (event, data) => {
            if (!res.writableEnded)
                res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        turn.send = send;
        send("start", { ok: true, turnId: turn.id });
        const beat = setInterval(() => {
            if (!res.writableEnded)
                res.write(": keepalive\n\n");
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
            if (finished)
                return;
            finished = true;
            clearInterval(beat);
            if (hopTimer)
                clearTimeout(hopTimer);
            if (parent)
                parent.handoffs.delete(turn);
            // A turn that ends takes every hand-off it still has with it.
            for (const h of [...turn.handoffs]) {
                h.closed = true;
                void stopChild(h.child);
            }
            turn.handoffs.clear();
            turn.closed = true;
            for (const p of turn.pending.values())
                p.reject(new Error("The turn ended."));
            turn.pending.clear();
            turns.delete(turn.id);
        };
        res.on("close", () => {
            if (!res.writableEnded) {
                // The page went away mid-turn.
                void stopChild(turn.child);
            }
            finish();
        });
        try {
            // A resumed session already holds the thread. A new one is given the earlier turns as text.
            const history = !parent && typeof body.history === "string" ? body.history.slice(0, 60000) : "";
            const freshPrompt = history ? `Earlier in this conversation:\n${history}\n\nThe person's new message:\n${prompt}` : prompt;
            let sessionId = resumeId || crypto.randomUUID();
            let out = await runClaude(turn, { sessionId, resume: Boolean(resumeId) }, resumeId ? prompt : freshPrompt);
            if (resumeId && (out.error || out.result?.num_turns === 0) && !out.apiKeyRefused && !turn.closed) {
                // The session is gone (different folder, cleaned up): start a new one with the thread as text.
                sessionId = crypto.randomUUID();
                out = await runClaude(turn, { sessionId, resume: false }, freshPrompt);
            }
            if (out.error || !out.result) {
                send("error", { message: out.error ?? "Claude Code gave no answer." });
            }
            else if (out.result.is_error) {
                send("error", { message: `Claude Code: ${String(out.result.result ?? "the turn failed").slice(0, 500)}` });
            }
            else {
                send("message", {
                    role: "assistant",
                    content: String(out.result.result ?? ""),
                    model: out.model,
                    payer: "person-claude-code",
                    sessionId: out.sessionId,
                    // Only the person's turn is marked, so a nested hand-off's message leaves the field out.
                    ...(turn.budgetSpent ? { budgetSpent: true } : {}),
                });
            }
        }
        catch (e) {
            send("error", { message: `The bridge failed: ${e?.message ?? e}` });
        }
        finally {
            finish();
            res.end();
        }
    }
    // ---- routing -----------------------------------------------------------------------------------------------------
    async function handle(req, res) {
        if (!hostOk(req))
            return json(res, 403, { error: "bad host" });
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        const mcp = /^\/mcp\/([0-9a-f]+)\/([0-9a-f]+)$/.exec(url.pathname);
        if (mcp)
            return handleMcp(req, res, mcp[1], mcp[2]);
        // The local control door (`--code`): the same user, on this computer, with the token file only they can read. Never a
        // browser: a request that carries an Origin is refused, and no CORS header is ever set on this path.
        if (url.pathname === "/control/code" || url.pathname === "/control/unpair-all") {
            const tok = req.headers["x-bridge-control"];
            const want = url.pathname === "/control/code" ? "GET" : "POST";
            if (!opts.controlToken || req.headers.origin !== undefined || req.method !== want)
                return json(res, 403, { error: "not allowed" });
            if (typeof tok !== "string" || !same(tok, opts.controlToken))
                return json(res, 401, { error: "bad control token" });
            if (want === "POST") {
                const n = pairings.size;
                pairings.clear();
                savePairings();
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
        if (!who || (!who.relayed && !cors(who.origin, res)))
            return json(res, 403, { error: "This origin is not allowed." });
        const origin = who.origin;
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            return res.end();
        }
        if (req.method === "GET" && url.pathname === "/v1/hello") {
            return json(res, 200, { bridge: "gilb-claude-code-bridge", version: BRIDGE_VERSION, build: BRIDGE_BUILD, billing: "claude-subscription", relay: true });
        }
        if (req.method === "POST" && url.pathname === "/v1/pair") {
            let body;
            try {
                body = await readBody(req);
            }
            catch (e) {
                return json(res, e.status ?? 400, { error: e.message });
            }
            if (normCode(body.code).length === 6 && normCode(body.code) === normCode(pairingCode)) {
                const secret = crypto.randomBytes(32).toString("hex");
                const t = now();
                const ph = typeof body.principalHash === "string" && /^[0-9a-f]{64}$/.test(body.principalHash) ? body.principalHash : null;
                pairings.set(sha(secret).toString("hex"), { origin: origin ?? null, principalHash: ph, issued: t, lastUsed: t, saved: t });
                while (pairings.size > maxPairings)
                    dropOldest();
                savePairings();
                newPairing(); // single use: the next tab needs the next code
                return json(res, 200, { secret });
            }
            pairFailures += 1;
            if (pairFailures >= maxPairFailures)
                newPairing(); // brute force burns the code
            return json(res, 401, { error: "That code is not right. Look at the code in the terminal where the bridge runs." });
        }
        if (url.pathname.startsWith("/v1/")) {
            if (!hasSecret(req, origin))
                return json(res, 401, { error: "Pair first." });
            if (req.method === "POST" && url.pathname === "/v1/check")
                return json(res, 200, { ok: true });
            if (req.method === "POST" && url.pathname === "/v1/unpair") {
                pairings.delete(sha(String(req.headers["x-bridge-secret"])).toString("hex"));
                savePairings();
                return json(res, 200, { ok: true });
            }
            if (req.method === "POST" && url.pathname === "/v1/turn")
                return handleTurn(req, res);
            if (req.method === "POST" && url.pathname === "/v1/tool-result") {
                let body;
                try {
                    body = await readBody(req);
                }
                catch (e) {
                    return json(res, e.status ?? 400, { error: e.message });
                }
                const turn = turns.get(String(body.turnId));
                const p = turn?.pending.get(String(body.id));
                if (turn && !p && turn.cancelled.has(String(body.id)))
                    return json(res, 200, { ignored: true, reason: "cancelled" });
                if (!turn || !p)
                    return json(res, 404, { error: "No such tool call is waiting." });
                turn.pending.delete(String(body.id));
                p.resolve({ text: typeof body.result === "string" ? body.result : JSON.stringify(body.result ?? null), isError: body.isError === true });
                return json(res, 200, { ok: true });
            }
        }
        return json(res, 404, { error: "not found" });
    }
    const server = http.createServer((req, res) => {
        handle(req, res).catch((e) => {
            log(`error: ${e?.message ?? e}`);
            if (!res.headersSent)
                json(res, 500, { error: "bridge error" });
            else
                res.end();
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
        start() {
            fs.mkdirSync(workDir, { recursive: true, mode: 0o700 });
            return new Promise((resolve, reject) => {
                server.once("error", reject);
                server.listen(port, "127.0.0.1", () => {
                    port = server.address().port;
                    resolve(port);
                });
            });
        },
        close() {
            const stopped = Promise.all([...turns.values()].map((t) => stopChild(t.child)));
            return stopped.then(() => new Promise((resolve) => server.close(() => resolve())));
        },
    };
}
// ---- always-on service (macOS LaunchAgent) -----------------------------------------------------------------------------
export const DEFAULT_LABEL = "com.gilb.claude-code-bridge";
const defaultStateDir = (home = os.homedir()) => path.join(home, ".gilb-claude-code-bridge");
/** Reads the command line into a plain object. Unknown flags are refused by main() before this is used. */
export function parseCli(argv) {
    const val = (name) => {
        const i = argv.indexOf(name);
        return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
    };
    // Repeatable: every value after each --allow-origin.
    // A flag with no value, or in `--allow-origin=X` form, is NOT skipped: a missing or odd value is passed on as it is (an
    // empty string for "no value"), so normalizeOrigin refuses it out loud instead of the origin quietly not being allowed.
    const valAll = (name) => argv.flatMap((a, i) => {
        if (a.startsWith(`${name}=`))
            return [a.slice(name.length + 1)];
        if (a !== name)
            return [];
        return [argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : ""];
    });
    const modes = ["--install", "--uninstall", "--status", "--code", "--unpair-all", "--help", "-h"].filter((m) => argv.includes(m));
    return {
        mode: modes.length === 0 ? "run" : modes[0].replace(/^-+/, "") === "h" ? "help" : modes[0] === "--unpair-all" ? "unpairAll" : modes[0].replace(/^-+/, ""),
        modes,
        claude: val("--claude"),
        port: val("--port") === undefined ? undefined : Number(val("--port")),
        allowOrigins: valAll("--allow-origin"),
        allowOrigin: val("--allow-origin"),
        label: val("--label") ?? DEFAULT_LABEL,
        stateDir: val("--state-dir"),
    };
}
const xmlEsc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** The LaunchAgent plist text. Absolute node and bridge paths, the PATH that finds `claude`, always on, one log file. */
export function buildPlist({ label, node, file, args = [], pathEnv, logFile, workDir }) {
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
export function resolveBin(name, env = process.env, home = os.homedir(), platform = process.platform, files = realFiles) {
    if (platform === "win32") {
        const W = path.win32;
        const exts = winExts(env);
        const withExt = (base) => {
            const e = W.extname(base).toLowerCase();
            if (WIN_EXTS.includes(e) || [".js", ".cjs", ".mjs"].includes(e))
                return [base];
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
        ].filter(Boolean);
        for (const d of dirs) {
            const f = withExt(W.join(d, name)).find((c) => files.exists(c));
            if (f)
                return f;
        }
        return null;
    }
    if (name.includes("/"))
        return path.resolve(name);
    const dirs = [...String(env.PATH ?? "").split(":"), path.join(home, ".local", "bin"), path.join(home, ".claude", "local"), "/opt/homebrew/bin", "/usr/local/bin"].filter(Boolean);
    for (const d of dirs) {
        const f = path.join(d, name);
        try {
            fs.accessSync(f, fs.constants.X_OK);
            return f;
        }
        catch {
            /* next */
        }
    }
    return null;
}
/** Real launchctl, used by the CLI. Tests pass their own. Resolves { code, out }. */
export function runLaunchctl(args) {
    return new Promise((resolve) => {
        execFile("/bin/launchctl", args, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: `${stdout}${stderr}`.trim() }));
    });
}
const serviceFiles = (opts, home) => {
    const stateDir = opts.stateDir ? path.resolve(opts.stateDir) : defaultStateDir(home);
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
export async function serviceInstall(opts, deps) {
    const { launchctl, uid, home, nodePath, file, env, log } = deps;
    if ((deps.platform ?? process.platform) === "win32")
        return { ok: false, message: WINDOWS_ALWAYS_ON_LATER };
    if ((deps.platform ?? process.platform) !== "darwin")
        return { ok: false, message: "--install works on macOS only. On other systems start the bridge in a terminal." };
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(opts.label))
        return { ok: false, message: "--label may use letters, digits, dot, dash and underscore only." };
    const port0 = opts.port ?? DEFAULT_PORT;
    if (!Number.isInteger(port0) || port0 < 1 || port0 > 65535)
        return { ok: false, message: "--port must be a number from 1 to 65535." };
    const claudeBin = resolveBin(opts.claude ?? "claude", env, home);
    if (!claudeBin)
        return { ok: false, message: "Claude Code (`claude`) was not found. Install it and run `claude auth login`, then run --install again." };
    const login = await (deps.check ?? checkSubscriptionLogin)(claudeBin, env);
    if (!login.ok)
        return { ok: false, message: `Not installed.\n${login.reason}` };
    const f = serviceFiles(opts, home);
    const port = opts.port ?? DEFAULT_PORT;
    const args = ["--port", String(port), "--claude", claudeBin, "--state-dir", f.stateDir];
    // Persisted in the LaunchAgent: the origins the person allowed at install time (checked now, so a typo never installs).
    let extraOrigins;
    try {
        extraOrigins = [...new Set((opts.allowOrigins ?? (opts.allowOrigin ? [opts.allowOrigin] : [])).map(normalizeOrigin))];
    }
    catch (e) {
        return { ok: false, message: `Not installed.\n${e.message}` };
    }
    for (const o of extraOrigins)
        args.push("--allow-origin", o);
    const pathEnv = [...new Set([path.dirname(nodePath), path.dirname(claudeBin), "/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"])].join(":");
    fs.mkdirSync(path.dirname(f.plist), { recursive: true });
    fs.mkdirSync(path.dirname(f.logFile), { recursive: true });
    fs.mkdirSync(f.stateDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(f.stateDir, 0o700);
    if (!fs.existsSync(f.logFile))
        fs.writeFileSync(f.logFile, "", { mode: 0o600 }); // the log shows the pairing code: this user only
    fs.chmodSync(f.logFile, 0o600);
    fs.writeFileSync(f.plist, buildPlist({ label: opts.label, node: nodePath, file, args, pathEnv, logFile: f.logFile, workDir: f.stateDir }), { mode: 0o644 });
    const domain = `gui/${uid}`;
    const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    await launchctl(["bootout", `${domain}/${opts.label}`]); // not loaded yet is fine
    // bootout returns before the old copy is gone, and a bootstrap in that gap fails with "Input/output error": wait until it is unloaded.
    for (let i = 0; i < 40; i++) {
        if ((await launchctl(["print", `${domain}/${opts.label}`])).code !== 0)
            break;
        await sleep(250);
    }
    let r = await launchctl(["bootstrap", domain, f.plist]);
    for (let i = 0; i < 3 && r.code !== 0; i++) {
        await sleep(1000);
        r = await launchctl(["bootstrap", domain, f.plist]);
    }
    if (r.code !== 0)
        return { ok: false, message: `launchctl could not load the agent: ${r.out || `exit ${r.code}`}` };
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
  If a bridge is already running in a Terminal window, close that window: only one can hold port ${port}.`,
    };
}
export async function serviceUninstall(opts, deps) {
    if ((deps.platform ?? process.platform) === "win32")
        return { ok: false, message: WINDOWS_ALWAYS_ON_LATER };
    const f = serviceFiles(opts, deps.home);
    const r = await deps.launchctl(["bootout", `gui/${deps.uid}/${opts.label}`]);
    const had = fs.existsSync(f.plist);
    fs.rmSync(f.plist, { force: true });
    return { ok: true, message: had || r.code === 0 ? `Removed ${opts.label}. The bridge no longer starts at login.` : `${opts.label} was not installed.` };
}
/** Asks the running bridge for its pairing code over 127.0.0.1 with the token only this user can read. */
export async function fetchCode(opts, deps) {
    const f = serviceFiles(opts, deps.home);
    let token;
    let st = {};
    try {
        token = fs.readFileSync(f.tokenFile, "utf8").trim();
        st = JSON.parse(fs.readFileSync(f.statusFile, "utf8"));
    }
    catch {
        return { ok: false, message: (deps.platform ?? process.platform) === "win32" ? "No bridge has been started for this user yet (no control token). Start the bridge in a PowerShell window." : "No bridge has been started for this user yet (no control token). Run --install, or start the bridge." };
    }
    const port = opts.port ?? st.port ?? DEFAULT_PORT;
    const tryStatus = (deps.platform ?? process.platform) === "win32" ? "Check that the bridge is still running in its PowerShell window." : "Try --status.";
    try {
        const res = await fetch(`http://127.0.0.1:${port}/control/code`, { headers: { "x-bridge-control": token } });
        if (!res.ok)
            return { ok: false, message: `The bridge on port ${port} did not give the code (${res.status}). Is it the current one? ${tryStatus}` };
        const b = await res.json();
        return { ok: true, message: `Pairing code: ${b.code}\nIn the app, press Connect, choose Claude Code, and type it.` };
    }
    catch {
        return { ok: false, message: `The bridge is not answering on port ${port}. ${tryStatus}${st.ok === false ? ` Last start failed: ${st.reason}` : ""}` };
    }
}
/**
 * `--unpair-all`: every page loses its pairing. A running bridge is told over the local control door (it holds the list in
 * memory); if none answers, the file is emptied so the next start loads nothing.
 */
export async function unpairAll(opts, deps) {
    const f = serviceFiles(opts, deps.home);
    const done = (n) => ({ ok: true, message: `Removed ${n} pairing${n === 1 ? "" : "s"}. Every app must be paired again with a new code.` });
    let token = null;
    let st = {};
    try {
        token = fs.readFileSync(f.tokenFile, "utf8").trim();
        st = JSON.parse(fs.readFileSync(f.statusFile, "utf8"));
    }
    catch {
        /* no running bridge known */
    }
    if (token) {
        const port = opts.port ?? st.port ?? DEFAULT_PORT;
        try {
            const res = await fetch(`http://127.0.0.1:${port}/control/unpair-all`, { method: "POST", headers: { "x-bridge-control": token } });
            if (res.ok)
                return done((await res.json()).removed ?? 0);
            return { ok: false, message: `The bridge on port ${port} did not clear the pairings (${res.status}). Is it the current one? ${(deps.platform ?? process.platform) === "win32" ? "Check that the bridge is still running in its PowerShell window." : "Try --status."}` };
        }
        catch {
            /* not answering: clear the file below */
        }
    }
    let n = 0;
    try {
        n = JSON.parse(fs.readFileSync(f.pairingsFile, "utf8")).pairings.length;
    }
    catch {
        /* none */
    }
    try {
        if (fs.existsSync(f.pairingsFile))
            fs.writeFileSync(f.pairingsFile, JSON.stringify({ version: 1, pairings: [] }), { mode: 0o600 });
    }
    catch (e) {
        return { ok: false, message: `Could not clear ${f.pairingsFile}: ${e.message}` };
    }
    return done(n);
}
export async function serviceStatus(opts, deps) {
    if ((deps.platform ?? process.platform) === "win32")
        return { ok: false, message: WINDOWS_ALWAYS_ON_LATER };
    const f = serviceFiles(opts, deps.home);
    const lines = [];
    const installed = fs.existsSync(f.plist);
    lines.push(`Installed:  ${installed ? `yes (${f.plist})` : "no"}`);
    const r = await deps.launchctl(["print", `gui/${deps.uid}/${opts.label}`]);
    const pid = /\bpid = (\d+)/.exec(r.out)?.[1];
    lines.push(`Loaded:     ${r.code === 0 ? (pid ? `yes, running (pid ${pid})` : "yes, not running right now") : "no"}`);
    let st = null;
    try {
        st = JSON.parse(fs.readFileSync(f.statusFile, "utf8"));
    }
    catch {
        /* none yet */
    }
    const port = opts.port ?? st?.port ?? DEFAULT_PORT;
    if (st) {
        lines.push(`Last start: ${st.ok ? `ok at ${st.at}` : `FAILED at ${st.at}: ${st.reason}`}`);
        lines.push(`Billing:    ${st.ok ? st.billing : "not running: the subscription check failed, so no turn can run (never an API key)"}`);
    }
    else
        lines.push("Last start: none recorded");
    let answering = false;
    try {
        const h = await fetch(`http://127.0.0.1:${port}/v1/hello`, { signal: AbortSignal.timeout(3000) });
        answering = h.ok;
    }
    catch {
        /* not up */
    }
    lines.push(`Answering:  ${answering ? `yes, http://127.0.0.1:${port}` : `no (port ${port})`}`);
    lines.push(`Log:        ${f.logFile}`);
    return { ok: true, message: lines.join("\n") };
}
/** The node to record in the plist: the name on the person's PATH (survives a brew upgrade) when it is this very node, else this node's own path. */
function stableNodePath() {
    const named = resolveBin("node");
    try {
        if (named && fs.realpathSync(named) === fs.realpathSync(process.execPath))
            return named;
    }
    catch {
        /* fall through */
    }
    return process.execPath;
}
// ---- command line ----------------------------------------------------------------------------------------------------
async function main() {
    const argv = process.argv.slice(2);
    const cli = parseCli(argv);
    if (cli.mode === "help") {
        console.log(`Usage: node bridge.mjs [--port N] [--claude PATH] [--allow-origin ORIGIN]... [--state-dir DIR]
       ${process.platform === "win32" ? "node bridge.mjs --code | --unpair-all   (--install, --uninstall and --status are not built for Windows yet)" : "node bridge.mjs --install | --uninstall | --status | --code | --unpair-all   (macOS always-on LaunchAgent; add --label L to use another label)"}`);
        return;
    }
    // A misspelled option (--allow-orgin) must not be quietly ignored: the bridge would start without what the person asked for.
    const KNOWN = new Set(["--port", "--claude", "--allow-origin", "--state-dir", "--label", "--install", "--uninstall", "--status", "--code", "--unpair-all", "--help", "-h"]);
    const unknown = argv.filter((a) => a.startsWith("-") && !KNOWN.has(a.split("=")[0]));
    if (unknown.length > 0) {
        console.error(`Unknown option: ${unknown.join(" ")}\nOptions: --port, --claude, --allow-origin, --state-dir, --label, --install, --uninstall, --status, --code, --unpair-all, --help`);
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
        log: () => { },
    };
    if (platform === "win32" && ["install", "uninstall", "status"].includes(cli.mode)) {
        console.error(WINDOWS_ALWAYS_ON_LATER);
        process.exit(1);
    }
    if (cli.mode !== "run") {
        const fn = { install: serviceInstall, uninstall: serviceUninstall, status: serviceStatus, code: fetchCode, unpairAll }[cli.mode];
        const out = await fn(cli, deps);
        (out.ok ? console.log : console.error)(out.message);
        process.exit(out.ok ? 0 : 1);
    }
    const claudeBin = cli.claude ?? "claude";
    const port = cli.port ?? DEFAULT_PORT;
    const extra = cli.allowOrigins ?? [];
    let allowedOrigins;
    try {
        allowedOrigins = loadAllowedOrigins(extra);
    }
    catch (e) {
        console.error(`\n${e.message}\n`);
        process.exit(2);
    }
    const f = serviceFiles(cli, home);
    const writeStatus = (o) => {
        try {
            fs.mkdirSync(f.stateDir, { recursive: true, mode: 0o700 });
            fs.rmSync(f.statusFile, { force: true });
            fs.writeFileSync(f.statusFile, JSON.stringify({ ...o, at: new Date().toISOString(), pid: process.pid }), { mode: 0o600, flag: "wx" });
        }
        catch {
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
    const bridge = createBridge({ port, claudeBin, controlToken, allowedOrigins, pairingsFile: f.pairingsFile, workDir: path.join(f.stateDir, "work"), log: (l) => console.log(`  ${l}`) });
    try {
        await bridge.start();
    }
    catch (e) {
        const why = e.code === "EADDRINUSE" ? `port ${port} is already in use (is the bridge already running?)` : e.message;
        console.error(`\nThe bridge did not start: ${why}\n`);
        if (e.code !== "EADDRINUSE")
            writeStatus({ ok: false, reason: why }); // a bridge that already runs keeps its own token and status
        process.exit(1);
    }
    try {
        fs.mkdirSync(f.stateDir, { recursive: true, mode: 0o700 });
        fs.rmSync(f.tokenFile, { force: true }); // never write through a symlink
        fs.writeFileSync(f.tokenFile, controlToken, { mode: 0o600, flag: "wx" });
    }
    catch {
        /* --code will say there is no token */
    }
    const who = login.info.email ? ` (${login.info.email})` : "";
    const billing = `Claude subscription${who}, plan ${login.info.subscriptionType}`;
    writeStatus({ ok: true, port: bridge.port, billing });
    console.log(`
Gilb Claude Code bridge
  Listening:    http://127.0.0.1:${bridge.port}  (this computer only)
  Billing:      ${billing}
                API keys are removed from every Claude Code run; none is ever used.
  Claude Code:  your own \`${platform === "win32" && launch.ok ? launch.shown : claudeBin}\`, tools off (no shell, no files, no web)

  Allowed apps: ${allowedOrigins.join(", ")}
                (any other web page is refused; add one with --allow-origin)

  Pairing code: ${bridge.pairingCode}
  In the app that gave you this command, press Connect, choose Claude Code, and type this code.
  Press Ctrl+C to stop. (Later: \`node ${commandPathForPerson(fileURLToPath(import.meta.url), home, platform)} --code\` prints the current code.)
`);
    const stop = () => bridge.close().then(() => process.exit(0));
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    if (platform === "win32") {
        process.on("SIGBREAK", stop); // Ctrl+Break
        process.on("SIGHUP", stop); // the console window was closed (Windows ends node about 10 seconds later)
    }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
