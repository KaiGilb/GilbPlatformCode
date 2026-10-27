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
//     opens it with `parentTurnId`; it gets its own `claude -p` and its own MCP tool set, the same environment stripping,
//     the same subscription check. One level only (a hand-off cannot hand off), one at a time, and the turn and its
//     hand-off share one budget of tool calls (TURN_MAX_TOOL_CALLS) and the hand-off a time limit (HOP_MAX_MS).
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
    return out;
}
// Single-file use (downloaded from the app): allowed-origins.json is not next to this file, so these built-in
// defaults apply. The source keeps this list EMPTY: the host app names its own origins, and the Vite plugin
// (claudeCodeBridgeFile({ defaultAllowedOrigins })) writes them into this one line when it serves or emits the file.
export const DEFAULT_ALLOWED_ORIGINS = [];
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
/**
 * Checks, with the CLI's own `auth status`, that the person is logged in with a Claude SUBSCRIPTION.
 * Runs with the billing variables removed, so what it reports is what every turn will use.
 * @returns {Promise<{ok:true, info:{email?:string, subscriptionType:string}} | {ok:false, reason:string}>}
 */
export function checkSubscriptionLogin(claudeBin = "claude", env = process.env) {
    return new Promise((resolve) => {
        execFile(claudeBin, ["auth", "status"], { env: childEnv(env), timeout: 20000 }, (err, stdout) => {
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
// A person turn and every hand-off it opens (a nested `claude -p`) draw on ONE budget of tool calls, as /base/ai/chat's
// turn and its hops draw on one round ceiling (TURN_MAX_MODEL_ROUNDS = 240 on the server, which refuses past it too).
export const TURN_MAX_TOOL_CALLS = 240;
// A hand-off may run this long before the bridge stops it (its parent turn gets an error for that tool call).
export const HOP_MAX_MS = 15 * 60 * 1000;
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
    let port = opts.port ?? DEFAULT_PORT;
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
    function cors(req, res) {
        const origin = req.headers.origin;
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
    const hasSecret = (req) => {
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
        if (p.origin !== (req.headers.origin ?? null))
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
            return relayToolCall(turn, String(name), JSON.stringify(params?.arguments ?? {})).then((r) => ok({ content: [{ type: "text", text: r.text }], isError: r.isError }), (e) => ok({ content: [{ type: "text", text: String(e?.message ?? e) }], isError: true }));
        }
        return bad(-32601, `Method not found: ${method}`);
    }
    function relayToolCall(turn, name, args) {
        return new Promise((resolve, reject) => {
            if (turn.closed)
                return reject(new Error("The app page left; the turn was cancelled."));
            // One budget for the turn and its hand-offs: past it nothing more is relayed, and the model is told so.
            turn.root.calls += 1;
            if (turn.root.calls > maxToolCalls) {
                return reject(new Error("This turn has used all its tool rounds. Tell the person what you did, and stop."));
            }
            const id = crypto.randomBytes(8).toString("hex");
            const timer = setTimeout(() => {
                turn.pending.delete(id);
                reject(new Error("The app did not answer the tool call in time."));
            }, TOOL_WAIT_MS);
            turn.pending.set(id, {
                resolve: (r) => {
                    clearTimeout(timer);
                    resolve(r);
                },
                reject: (e) => {
                    clearTimeout(timer);
                    reject(e);
                },
            });
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
        const replies = [];
        for (const m of msgs) {
            if (m && m.id === undefined)
                continue; // a notification
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
            const child = spawn(claudeBin, claudeArgs(turn, mode), {
                cwd: workDir,
                env: childEnv(env),
                stdio: ["pipe", "pipe", "pipe"],
            });
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
                            child.kill("SIGTERM");
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
        // that asked. One level only, one at a time, on the parent's budget, and it never resumes or reads a session.
        const parentId = typeof body.parentTurnId === "string" ? body.parentTurnId : "";
        let parent = null;
        if (parentId) {
            parent = turns.get(parentId) ?? null;
            if (!parent || parent.closed)
                return json(res, 404, { error: "The turn that asked for this hand-off is not running." });
            if (parent.parent)
                return json(res, 400, { error: "A hand-off cannot hand off again." });
            if (parent.handoff)
                return json(res, 429, { error: "A hand-off is already running for this turn." });
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
            handoff: null,
            root: parent ? parent.root : { calls: 0 },
        };
        if (parent)
            parent.handoff = turn;
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
                turn.child?.kill("SIGTERM");
                finish();
            }, hopMaxMs)
            : null;
        const finish = () => {
            clearInterval(beat);
            if (hopTimer)
                clearTimeout(hopTimer);
            if (parent && parent.handoff === turn)
                parent.handoff = null;
            // A turn that ends takes its hand-off with it.
            if (turn.handoff) {
                turn.handoff.child?.kill("SIGTERM");
                turn.handoff.closed = true;
            }
            turn.closed = true;
            for (const p of turn.pending.values())
                p.reject(new Error("The turn ended."));
            turn.pending.clear();
            turns.delete(turn.id);
        };
        res.on("close", () => {
            if (!res.writableEnded) {
                // The page went away mid-turn.
                turn.child?.kill("SIGTERM");
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
        if (!cors(req, res))
            return json(res, 403, { error: "This origin is not allowed." });
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            return res.end();
        }
        if (req.method === "GET" && url.pathname === "/v1/hello") {
            return json(res, 200, { bridge: "gilb-claude-code-bridge", version: BRIDGE_VERSION, billing: "claude-subscription" });
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
                pairings.set(sha(secret).toString("hex"), { origin: req.headers.origin ?? null, principalHash: ph, issued: t, lastUsed: t, saved: t });
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
            if (!hasSecret(req))
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
            for (const t of turns.values())
                t.child?.kill("SIGTERM");
            return new Promise((resolve) => server.close(() => resolve()));
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
/** The absolute path of `name`: an explicit path as given, else the first executable on PATH or in the usual install folders. */
export function resolveBin(name, env = process.env, home = os.homedir()) {
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
        return { ok: false, message: "No bridge has been started for this user yet (no control token). Run --install, or start the bridge." };
    }
    const port = opts.port ?? st.port ?? DEFAULT_PORT;
    try {
        const res = await fetch(`http://127.0.0.1:${port}/control/code`, { headers: { "x-bridge-control": token } });
        if (!res.ok)
            return { ok: false, message: `The bridge on port ${port} did not give the code (${res.status}). Is it the current one? Try --status.` };
        const b = await res.json();
        return { ok: true, message: `Pairing code: ${b.code}\nIn the app, press Connect, choose Claude Code, and type it.` };
    }
    catch {
        return { ok: false, message: `The bridge is not answering on port ${port}. Try --status.${st.ok === false ? ` Last start failed: ${st.reason}` : ""}` };
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
            return { ok: false, message: `The bridge on port ${port} did not clear the pairings (${res.status}). Is it the current one? Try --status.` };
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
       node bridge.mjs --install | --uninstall | --status | --code | --unpair-all   (macOS always-on LaunchAgent; add --label L to use another label)`);
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
    const deps = {
        launchctl: runLaunchctl,
        uid: process.getuid?.() ?? 0,
        home,
        nodePath: stableNodePath(),
        file: fs.realpathSync(fileURLToPath(import.meta.url)),
        env: process.env,
        log: () => { },
    };
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
  Claude Code:  your own \`${claudeBin}\`, tools off (no shell, no files, no web)

  Allowed apps: ${allowedOrigins.join(", ")}
                (any other web page is refused; add one with --allow-origin)

  Pairing code: ${bridge.pairingCode}
  In the app that gave you this command, press Connect, choose Claude Code, and type this code.
  Press Ctrl+C to stop. (Later: \`node ${fileURLToPath(import.meta.url)} --code\` prints the current code.)
`);
    const stop = () => bridge.close().then(() => process.exit(0));
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
