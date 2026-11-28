/**
 * Approved actions (0.4.2): how a code turn can ASK for one fixed action to be run for the person, and how the person's one click runs it.
 *
 * The agent can only ASK (`request_action`). The bridge checks the request against a CLOSED registry (ACTION_KINDS): a kind that is not in it, a database
 * migration, a free command, an ssh shell, the disk unlock, vault deletion and a change to the registry have no kind at all, so they are refused as unknown.
 * Only the app, over a paired link, can run a pending request, and only after the checks of `approve()` in their fixed order. There is no approve tool
 * in the chat's tool set. This file is inlined into bridge/bridge.mjs by scripts/build-bridge.mjs (see settingGrants.ts); keep its imports to fs, path, crypto
 * (the file check of settingGrants.ts, plainFileCheck, is handed in as an option, so there is no import between the two).
 *
 * WHAT THIS PROTECTS AND WHAT IT DOES NOT (Kai, 2026-11-28; the computer is the release authority):
 *  - The ship key `<state>/ship/gilb_ship_kai-bridge` must exist on this computer, as a plain file with one name and mode 0600, and is checked on EVERY
 *    request and EVERY approval (never remembered from start). A computer without it cannot ship: nothing is listed, everything is refused with CANNOT_SHIP.
 *  - The Origin check (the approving pairing must have been issued to exactly the one origin the host names, whole-string) stops OTHER WEB PAGES only. A local program can send any
 *    Origin header, so it is not proof of anything against a local attacker.
 *  - The real proof is the pairing code (shown on Kai's own computer) plus the key on disk: the same trust as pairing today. Anyone who can run code as Kai
 *    can already read the key and ship without the bridge, so this adds no new power for that attacker, and it stops everything that is weaker than that
 *    (a web page, a chat session, another person's pairing, another project).
 *  - `principalHash` is only a label the page sent at pairing; no ship decision reads it. The bridge cannot verify a WebID (no DPoP or OIDC check exists).
 *  - A result is DATA for the chat. A "ship Y" inside a log or a result never runs anything: only a new request and a new click can.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** The file check of settingGrants.ts (plainFileCheck), the same one that guards the grant secret. Handed in so this file imports nothing of the bridge's. */
export type FileCheck = (file: string, o?: { mode600?: boolean; platform?: string }) => { ok: true } | { ok: false; reason: string };

/** The one sentence every ship refusal says when this computer has no usable key. */
export const CANNOT_SHIP = "this computer cannot ship; ask Kai";
export const SHIP_KEY_NAME = "gilb_ship_kai-bridge";
export const GRANT_KIND = "setting.grant";
export const SHIP_BACKEND = "ship.backend";
export const REQUEST_ACTION_TOOL = "request_action";
export const ACTION_STATUS_TOOL = "action_status";
/** Tool names the bridge answers itself; a tool the page supplies under these names is never offered. */
export const ACTION_TOOL_NAMES: readonly string[] = [REQUEST_ACTION_TOOL, ACTION_STATUS_TOOL];
/** Kinds that have no entry and never will in v1: named only so the refusal can say so. Everything not in ACTION_KINDS is refused anyway. */
export const NEVER_KINDS: readonly string[] = ["db.migrate", "disk.unlock", "vault.delete", "shell", "ssh", "exec", "registry.change", "ship.static", "deploy-key"];
export const GRANT_TTL_MS = 10 * 60 * 1000;
export const LOG_TAIL_LINES = 200;
const MAX_CALLS_PER_TURN = 20;
const MAX_KEPT = 50;
const MAX_CARD_LOG_LINES = 200;
const SHA40 = /^[0-9a-f]{40}$/;
const REQUEST_ID = /^[0-9a-f]{24}$/;

/** What the gate (GilbServerOps draft #38, `ship-backend`) answers. The fake in the tests mirrors these. Source: the brief for batch 2; the gate itself is not readable from this unit. */
export const SHIP_EXIT_MEANING: Record<number, string> = {
  0: "shipped", 1: "a step failed", 2: "refused", 3: "a guard refused", 4: "busy: another ship is running", 5: "flip guard", 6: "fault",
};

// --- the closed registry -----------------------------------------------------------------------------------------------

export interface ActionKind {
  name: string;
  /** Strict, anchored regexes, one per argument; no other key is accepted. Empty for a kind that another module checks (setting.grant). */
  argSchema: Record<string, RegExp>;
  /** The project ids whose chats may request it. `null`: any project (checked by the module behind it). */
  projects: readonly string[] | null;
  /** Who may approve: this computer, by the key on disk (+ the origin and the session owner). The only value in v1. */
  approvers: "releaseAuthority";
}
export const ACTION_KINDS: Readonly<Record<string, ActionKind>> = Object.freeze({
  [GRANT_KIND]: { name: GRANT_KIND, argSchema: {}, projects: null, approvers: "releaseAuthority" },
  [SHIP_BACKEND]: { name: SHIP_BACKEND, argSchema: { sha: SHA40 }, projects: ["GilbPlatform"], approvers: "releaseAuthority" },
});

/** The key file of this install's ships. */
export const shipKeyPath = (stateDir: string) => path.join(stateDir, "ship", SHIP_KEY_NAME);

/**
 * "" when the ship key passes THE check of the grant secret (plainFileCheck) with mode 0600; else the local reason ("missing", "mode", "hard-link",
 * "symlink", ...). Asked afresh each time. The key is never opened for reading here, so its bytes are never in memory, a log or a message.
 */
export function shipKeyProblem(stateDir: string, check: FileCheck, platform: string = process.platform): string {
  const r = check(shipKeyPath(stateDir), { mode600: true, platform });
  return r.ok ? "" : r.reason;
}

// --- redaction -------------------------------------------------------------------------------------------------------

const SECRET_PATTERNS: readonly RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g, /github_pat_[A-Za-z0-9_]{20,}/g, /sk-[A-Za-z0-9_-]{16,}/g, /AKIA[0-9A-Z]{16}/g,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{12,}/gi, /((?:token|secret|password|passwd|api[_-]?key)\s*[=:]\s*)\S{6,}/gi,
];
/** Removes token patterns and private-key blocks from log text, line by line (the state of an open key block is kept between lines). */
export function createRedactor() {
  let inKey = false;
  return (line: string): string => {
    if (inKey) { if (/-----END [A-Z ]*PRIVATE KEY-----/.test(line)) inKey = false; return "[redacted: private key]"; }
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line)) { inKey = !/-----END [A-Z ]*PRIVATE KEY-----/.test(line); return "[redacted: private key]"; }
    let out = line;
    for (const re of SECRET_PATTERNS) out = out.replace(re, (_m, p1) => (typeof p1 === "string" && !/^(Bearer|Basic)$/i.test(p1) ? p1 : "") + "[redacted]");
    return out;
  };
}

// --- effects, all injectable (the defaults are the real commands) ----------------------------------------------------

export interface PrInRange { number: number; title: string; mergedBy: string | null; merged: boolean; review: "approved" | "changes-requested" | "none" }
export interface ShipDeps {
  /** True for fakes: a result then says MOCK and never REAL. */
  isMock?: boolean;
  /** The live backend's SHA from /version, or null when it cannot be read. */
  fetchVersion(): Promise<string | null>;
  /** Is `sha` an ancestor of (or equal to) origin/main? */
  onMain(sha: string): Promise<boolean>;
  /** live..target: how the target stands against the live SHA, and the pull requests in that range. */
  range(live: string, sha: string): Promise<{ relation: "ahead" | "identical" | "behind" | "diverged"; prs: PrInRange[] }>;
  ci(sha: string): Promise<"success" | "failure" | "pending">;
  /** The change-log dry run: `available: false` when this repo has no change-log script (then the card says so and does not block). */
  changelogDryRun(sha: string): Promise<{ available: boolean; uncovered: number[] }>;
  /** Runs argv with execFile and no shell; each output line goes to onLine; resolves with the exit code (-1: could not start). */
  run(argv: string[], env: Record<string, string>, onLine: (l: string) => void): Promise<number>;
  /** After exit 0 and REAL: branch from main, compile the change log for the SHA, open the PR. pr null + note when the repo has no such script. */
  gather(sha: string): Promise<{ pr: number | null; note?: string }>;
}

/** The real runner: execFile, shell false, no stdin, line-buffered output. `execFileImpl` is injectable so a test can see the exact call. */
export function runCommand(execFileImpl: typeof import("node:child_process").execFile, argv: string[], env: Record<string, string>, onLine: (l: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const [file, ...args] = argv;
    if (!file || !path.isAbsolute(file)) return resolve(-1); // an absolute path only: never a name looked up on PATH
    let tail = "";
    const feed = (b: Buffer | string) => { tail += String(b); let i; while ((i = tail.indexOf("\n")) >= 0) { onLine(tail.slice(0, i).replace(/\r$/, "")); tail = tail.slice(i + 1); } };
    const child = execFileImpl(file, args, { shell: false, env, windowsHide: true, timeout: 30 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 }, (err) => {
      if (tail) onLine(tail);
      const code = (err as (NodeJS.ErrnoException & { code?: number | string }) | null)?.code;
      resolve(!err ? 0 : typeof code === "number" ? code : -1);
    });
    child.stdout?.on("data", feed);
    child.stderr?.on("data", feed);
    child.stdin?.end();
  });
}

// --- the book ---------------------------------------------------------------------------------------------------------

export interface ActionBookOptions {
  stateDir: string;
  now?: () => Date;
  log?: (s: string) => void;
  /** The origin an approval's pairing must have, whole-string; "" (the unit ships host-agnostic) means no pairing qualifies, so nothing can be approved. No environment variable. */
  shipOrigin: string;
  deps: ShipDeps;
  /** plainFileCheck of settingGrants.ts. */
  fileCheck: FileCheck;
  /** The ssh program (absolute path) and the gate's address. */
  sshPath: string;
  shipHost?: string;
  platform?: string;
  ttlMs?: number;
  /** TEST-ONLY: the projects that may request a ship (replaces the kind's own list). */
  shipProjects?: readonly string[];
  /** TEST-ONLY: the ids made for a request (default random). */
  newId?: () => string;
}
export interface Session { projectId: string; sessionId: string; /** sha256 hex of the pairing secret that started the session (Turn.owner). */ owner: string }

type Status = "checking" | "refused" | "ready" | "running" | "done" | "declined" | "expired";
interface Action {
  requestId: string; kind: string; args: Record<string, string>; argv: string[]; projectId: string; sessionId: string; owner: string;
  rangeHead: string; liveShaAtRequest: string; nonce: string; exp: number; hash: string;
  status: Status; reason?: string; createdAt: string; card?: Card | undefined; used: boolean; log: string[]; logPath: string; result?: ActionResult;
}
export interface Card {
  requestId: string; kind: string; project: string; session: string; argvLine: string; sha: string; liveSha: string; range: string;
  prs: PrInRange[]; ci: string; changelog: { available: boolean; uncovered: number[] }; chained: string[]; purge: string; expiresAt: string; hash: string;
  buttons: string[]; log: string[];
}
export interface ActionResult {
  requestId: string; kind: string; args: Record<string, string>; exit: number; exitMeaning: string; verdict: "REAL" | "MOCK" | "UNPROVEN";
  liveSha: string | null; logTail: string[]; logPath: string; gatherPr: number | null; gatherNote?: string;
}
export type RequestOutcome = { ok: true; requestId: string; status: "pending" } | { ok: false; reason: string };
export type ApproveOutcome = { ok: true; status: "running" } | { ok: false; status: number; error: string };

/** The text a hash is made of: keys sorted at every level, so the same request always has the same bytes. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
const eq = (a: string, b: string) => {
  const h = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};

export function createActionBook(o: ActionBookOptions) {
  const now = o.now ?? (() => new Date());
  const log = o.log ?? (() => {});
  const platform = o.platform ?? process.platform;
  const shipOrigin = o.shipOrigin;
  const ttl = o.ttlMs ?? GRANT_TTL_MS;
  const host = o.shipHost ?? "100.64.103.65";
  const actions = new Map<string, Action>();
  const calls = new Map<string, number>();
  const settles = new Map<string, Promise<void>>();
  const runsDir = path.join(o.stateDir, "ship", "runs");

  const keyProblem = () => shipKeyProblem(o.stateDir, o.fileCheck, platform);
  /** Logs the LOCAL reason (never the key) and gives back the one sentence the caller may say. */
  const cannotShip = (why: string, where: string): string => { log(`ship refused (${where}): the ship key is not usable here: ${why}`); return CANNOT_SHIP; };

  /** Exactly what is run: an absolute program and fixed arguments; the only free part is the SHA, which is 40 hex or the request never gets here. */
  function argvFor(sha: string): string[] {
    return [o.sshPath, "-i", shipKeyPath(o.stateDir), "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
      "-o", `UserKnownHostsFile=${path.join(o.stateDir, "ship", "known_hosts")}`, "-o", "ConnectTimeout=20", `gilbship@${host}`, `ship-backend ${sha}`];
  }
  /** A minimal environment: no agent socket (only the key named in argv can be used), nothing else from the bridge's own. */
  function envFor(): Record<string, string> {
    const e: Record<string, string> = {};
    for (const k of platform === "win32" ? ["SystemRoot", "USERPROFILE", "PATH", "Path"] : ["PATH", "HOME"]) { const v = process.env[k]; if (v !== undefined) e[k] = v; }
    return e;
  }
  function sweep(): void {
    const t = now().getTime();
    for (const a of actions.values()) if ((a.status === "ready" || a.status === "checking") && t > a.exp) { a.status = "expired"; a.reason = "The request expired."; }
    while (actions.size > MAX_KEPT) {
      const old = [...actions.values()].find((a) => a.status !== "running" && a.status !== "ready" && a.status !== "checking");
      if (!old) break;
      actions.delete(old.requestId);
    }
  }
  const newId = o.newId ?? (() => crypto.randomBytes(12).toString("hex"));

  /** The prechecks, run by the bridge outside any sandbox. Returns a reason when the request must be refused (no card), else fills the card. */
  async function precheck(a: Action): Promise<string | null> {
    const sha = a.args.sha!;
    const live = await o.deps.fetchVersion();
    if (!live || !SHA40.test(live)) return "The live version could not be read from /version, so nothing can be compared.";
    a.liveShaAtRequest = live;
    if (!(await o.deps.onMain(sha))) return "That SHA is not on origin/main.";
    const r = await o.deps.range(live, sha);
    if (r.relation === "identical") return "That SHA is already live.";
    if (r.relation === "behind") return "That SHA is older than the live one. A rollback is a person's act, not a request.";
    if (r.relation !== "ahead") return "That SHA does not build on the live one (the histories have split).";
    const bad = r.prs.find((p) => !p.merged || p.review !== "approved");
    if (bad) return `Pull request #${bad.number} in the range is ${!bad.merged ? "not merged" : "not approved by a review"}.`;
    const ci = await o.deps.ci(sha);
    if (ci !== "success") return `CI for that SHA is ${ci}, not green.`;
    const cl = await o.deps.changelogDryRun(sha);
    if (cl.uncovered.length > 0) return `The change-log dry run has UNCOVERED: ${cl.uncovered.map((n) => `#${n}`).join(", ")}.`;
    a.rangeHead = sha;
    a.exp = now().getTime() + ttl;
    const preimage = { kind: a.kind, args: a.args, argv: a.argv, projectId: a.projectId, sessionId: a.sessionId, rangeHead: a.rangeHead, liveShaAtRequest: live, nonce: a.nonce, exp: a.exp };
    a.hash = crypto.createHash("sha256").update(canonicalJson(preimage)).digest("hex");
    a.card = {
      requestId: a.requestId, kind: a.kind, project: a.projectId, session: a.sessionId, argvLine: a.argv.join(" "), sha, liveSha: live, range: `${live}..${sha}`, prs: r.prs,
      ci, changelog: cl, chained: cl.available ? ["after a real ship: change-log branch and pull request"] : ["change log: not available for this repo"],
      purge: "not needed (a backend ship changes no static asset)", expiresAt: new Date(a.exp).toISOString(), hash: a.hash, buttons: ["Yes, ship", "No"], log: [],
    };
    return null;
  }

  async function execute(a: Action): Promise<void> {
    const redact = createRedactor();
    try { fs.mkdirSync(runsDir, { recursive: true, mode: 0o700 }); } catch { /* the log then lives in memory only */ }
    const onLine = (l: string) => {
      const c = redact(l);
      a.log.push(c);
      if (a.log.length > 5000) a.log.splice(0, a.log.length - 5000);
      if (a.card) a.card.log = a.log.slice(-MAX_CARD_LOG_LINES);
      try { fs.appendFileSync(a.logPath, c + "\n", { mode: 0o600 }); } catch { /* memory still has it */ }
    };
    let exit = -1;
    try { exit = await o.deps.run(a.argv, envFor(), onLine); } catch (e) { onLine(`could not run: ${(e as Error).message}`); }
    let liveSha: string | null = null;
    try { liveSha = await o.deps.fetchVersion(); } catch { liveSha = null; }
    // REAL only when /version, read off the box after the run, is the SHA (a MOCK dependency set can never say REAL).
    const verdict: ActionResult["verdict"] = o.deps.isMock ? "MOCK" : liveSha === a.args.sha ? "REAL" : "UNPROVEN";
    let gatherPr: number | null = null;
    let gatherNote: string | undefined;
    if (exit === 0 && verdict !== "UNPROVEN" && liveSha === a.args.sha) {
      try { const g = await o.deps.gather(a.args.sha!); gatherPr = g.pr; gatherNote = g.note; } catch (e) { gatherNote = `the change-log step failed: ${(e as Error).message}`; }
    }
    a.result = {
      requestId: a.requestId, kind: a.kind, args: a.args, exit, exitMeaning: SHIP_EXIT_MEANING[exit] ?? "could not run", verdict, liveSha,
      logTail: a.log.slice(-LOG_TAIL_LINES), logPath: a.logPath, gatherPr, ...(gatherNote ? { gatherNote } : {}),
    };
    a.status = "done";
  }

  return {
    /** The request tool. Only asks: the kind and arguments are checked, a key is required, and the prechecks run after this answers. */
    request(kind: unknown, args: unknown, s: Session, callId: string): RequestOutcome {
      const made = (calls.get(callId) ?? 0) + 1;
      if (calls.size >= 1000 && !calls.has(callId)) calls.delete(calls.keys().next().value as string);
      calls.set(callId, made);
      if (made > MAX_CALLS_PER_TURN) return { ok: false, reason: `too many action requests in this turn (at most ${MAX_CALLS_PER_TURN}).` };
      const def = typeof kind === "string" && Object.prototype.hasOwnProperty.call(ACTION_KINDS, kind) ? ACTION_KINDS[kind] : undefined;
      if (!def || def.name === GRANT_KIND) return { ok: false, reason: `unknown kind ${JSON.stringify(typeof kind === "string" ? kind.slice(0, 40) : kind)}${typeof kind === "string" && NEVER_KINDS.includes(kind) ? ", and it never will exist" : ""}. Kinds: ${Object.keys(ACTION_KINDS).join(", ")}.` };
      const why = keyProblem();
      if (why) return { ok: false, reason: cannotShip(why, "request") };
      const allowed = def.name === SHIP_BACKEND && o.shipProjects ? o.shipProjects : def.projects;
      if (allowed && !allowed.includes(s.projectId)) return { ok: false, reason: `a chat in project ${JSON.stringify(s.projectId)} may not request ${def.name}.` };
      const a0 = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : null;
      const keys = a0 ? Object.keys(a0) : [];
      if (!a0 || keys.length !== Object.keys(def.argSchema).length || keys.some((k) => !Object.prototype.hasOwnProperty.call(def.argSchema, k))) return { ok: false, reason: `the arguments must be exactly: ${Object.keys(def.argSchema).join(", ")}.` };
      const clean: Record<string, string> = {};
      for (const k of keys) {
        const v = a0[k];
        if (typeof v !== "string" || !def.argSchema[k]!.test(v)) return { ok: false, reason: `argument ${k} must be a full 40-character lower-case hex SHA (no branch, tag or short SHA).` };
        clean[k] = v;
      }
      sweep();
      // One live request per project and kind: a flood must not wear the person down.
      for (const x of actions.values()) if ((x.status === "ready" || x.status === "checking" || x.status === "running") && x.projectId === s.projectId && x.kind === kind) return { ok: false, reason: "another request of this kind is already waiting or running for this project." };
      const requestId = newId();
      const a: Action = {
        requestId, kind: def.name, args: clean, argv: argvFor(clean.sha!), projectId: s.projectId, sessionId: s.sessionId, owner: s.owner, rangeHead: "", liveShaAtRequest: "",
        nonce: crypto.randomBytes(32).toString("hex"), exp: now().getTime() + ttl, hash: "", status: "checking", createdAt: now().toISOString(), used: false, log: [],
        logPath: path.join(runsDir, `${requestId}.log`),
      };
      actions.set(requestId, a);
      settles.set(requestId, (async () => {
        let bad: string | null;
        try { bad = await precheck(a); } catch (e) { bad = `a check could not run: ${(e as Error).message}`; }
        if (bad) { a.status = "refused"; a.reason = bad; a.card = undefined; } else a.status = "ready";
      })());
      return { ok: true, requestId, status: "pending" };
    },
    /** TEST/INTERNAL: resolves when the prechecks (or the run) of a request have finished. */
    async settled(requestId: string): Promise<void> { await settles.get(requestId); },
    /** What the chat's `action_status` shows: the state and, at the end, the result. Never the nonce or the hash. Only the session's own owner sees it. */
    status(requestId: unknown, owner: string): { status: Status | "unknown"; reason?: string; result?: ActionResult } {
      sweep();
      const a = typeof requestId === "string" ? actions.get(requestId) : undefined;
      if (!a || a.owner !== owner) return { status: "unknown" };
      return { status: a.status, ...(a.reason ? { reason: a.reason } : {}), ...(a.result ? { result: a.result } : {}) };
    },
    /** The cards of this owner's requests that are ready, running or finished: what GilbApp shows. */
    cards(owner: string): { card: Card; status: Status; result?: ActionResult }[] {
      sweep();
      return [...actions.values()].filter((a) => a.owner === owner && a.card && (a.status === "ready" || a.status === "running" || a.status === "done")).map((a) => ({ card: a.card!, status: a.status, ...(a.result ? { result: a.result } : {}) }));
    },
    /**
     * The person's one click. The checks run in this order; the FIRST that fails refuses, ships nothing and leaves the request as it was:
     * 1 the key, 2 the pairing's origin, 3 the pairing owns the session, 4 the request is pending/unexpired/unused and the hash is the one shown, then 5 the run.
     * The nonce is used up (synchronously, before any await) before the run starts, so two approvals at once run one ship.
     */
    approve(requestId: unknown, hash: unknown, who: { pairingOrigin: string | null; owner: string }): ApproveOutcome {
      const why = keyProblem();
      if (why) return { ok: false, status: 403, error: cannotShip(why, "approval") };
      if (!shipOrigin || who.pairingOrigin !== shipOrigin) { log("ship approval refused: the pairing's origin is not the ship origin."); return { ok: false, status: 403, error: "This page may not approve a ship." }; }
      sweep();
      const a = typeof requestId === "string" && REQUEST_ID.test(requestId) ? actions.get(requestId) : undefined;
      // Another pairing's request is "unknown" to this one, the same answer the turn routes give.
      if (!a || a.owner !== who.owner) return { ok: false, status: 404, error: "No such pending request." };
      if (a.status === "expired") return { ok: false, status: 410, error: "The request expired. Ask again." };
      if (a.status !== "ready" || a.used || !a.card) return { ok: false, status: a.status === "checking" ? 409 : 404, error: a.status === "checking" ? "The checks have not finished yet." : "No such pending request." };
      if (now().getTime() > a.exp) { a.status = "expired"; return { ok: false, status: 410, error: "The request expired. Ask again." }; }
      if (typeof hash !== "string" || !eq(a.hash, hash)) return { ok: false, status: 409, error: "The request is not the one that was shown." };
      for (const x of actions.values()) if (x.status === "running") return { ok: false, status: 409, error: "Another ship is running." };
      a.used = true; // the nonce is used up here, before the run, in the same tick as the check
      a.status = "running";
      settles.set(a.requestId, execute(a).catch((e) => { a.status = "done"; log(`ship run failed: ${(e as Error).message}`); }));
      return { ok: true, status: "running" };
    },
    /** The person's "no". Only the session's owner; the nonce is spent with it. */
    decline(requestId: unknown, owner: string): boolean {
      const a = typeof requestId === "string" ? actions.get(requestId) : undefined;
      if (!a || a.owner !== owner || a.status !== "ready") return false;
      a.status = "declined"; a.used = true;
      return true;
    },
    /** The turn that asked is over: its call count is dropped. */
    endTurn(callId: string): void { calls.delete(callId); },
    /** Is shipping possible on this computer right now? (asked afresh; for the tool list) */
    canShip(): boolean { return keyProblem() === ""; },
  };
}

// --- the real effects ---------------------------------------------------------------------------------------------------

export interface RealDepsOptions { repo: string; versionUrl: string; ghPath: string; sshExec: typeof import("node:child_process").execFile; fetchImpl?: typeof fetch }
/**
 * The real defaults: `gh api` for every GitHub read (no bridge-owned clone: it needs no git credentials and no disk, and it works the same on Windows),
 * a plain https GET for /version, and execFile for the ship. They have NEVER been run against GitHub or the server from this code (UNPROVEN).
 */
export function realShipDeps(r: RealDepsOptions): ShipDeps {
  const gh = (apiPath: string): Promise<any> => new Promise((resolve, reject) => {
    r.sshExec(r.ghPath, ["api", apiPath], { shell: false, timeout: 30_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(String(stdout))); } catch (e) { reject(e); }
    });
  });
  const repo = r.repo;
  return {
    async fetchVersion() {
      try {
        const res = await (r.fetchImpl ?? fetch)(r.versionUrl, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return null;
        const j: any = await res.json();
        const v = [j?.sha, j?.commit, j?.gitSha, j?.git?.sha].find((x) => typeof x === "string" && SHA40.test(x));
        return v ?? null;
      } catch { return null; }
    },
    async onMain(sha) { const c = await gh(`repos/${repo}/compare/${sha}...main`); return c.status === "behind" || c.status === "identical"; },
    async range(live, sha) {
      const c = await gh(`repos/${repo}/compare/${live}...${sha}`);
      const relation = c.status === "ahead" || c.status === "identical" || c.status === "behind" ? c.status : "diverged";
      const prs = new Map<number, PrInRange>();
      for (const cm of (c.commits ?? []).slice(0, 100)) {
        for (const p of await gh(`repos/${repo}/commits/${cm.sha}/pulls`)) {
          if (prs.has(p.number)) continue;
          const full = await gh(`repos/${repo}/pulls/${p.number}`);
          const reviews: any[] = await gh(`repos/${repo}/pulls/${p.number}/reviews`);
          const last = new Map<string, string>();
          for (const rv of reviews) if (rv.state === "APPROVED" || rv.state === "CHANGES_REQUESTED") last.set(rv.user?.login, rv.state);
          const states = [...last.values()];
          prs.set(p.number, { number: p.number, title: String(p.title), mergedBy: full.merged_by?.login ?? null, merged: !!full.merged, review: states.includes("CHANGES_REQUESTED") ? "changes-requested" : states.includes("APPROVED") ? "approved" : "none" });
        }
      }
      return { relation, prs: [...prs.values()] };
    },
    async ci(sha) {
      const j = await gh(`repos/${repo}/commits/${sha}/check-runs`);
      const runs: any[] = j.check_runs ?? [];
      if (runs.length === 0 || runs.some((x) => x.status !== "completed")) return "pending";
      return runs.every((x) => ["success", "skipped", "neutral"].includes(x.conclusion)) ? "success" : "failure";
    },
    async changelogDryRun() { return { available: false, uncovered: [] }; },
    run: (argv, env, onLine) => runCommand(r.sshExec, argv, env, onLine),
    async gather() { return { pr: null, note: "not available for this repo (no change-log script is known for the backend)" }; },
  };
}
