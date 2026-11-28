/**
 * Setting grants: how a code turn can ask for ONE sandbox setting to be widened, and how the person's approval is kept (0.4.1).
 *
 * The agent can only ASK (`request_setting`). The bridge checks the request against a closed list (ALLOWED), refuses anything on a never-list (NEVER),
 * and keeps at most one pending request per project. Only the app, over the paired link, can turn a pending request into a grant (the nonce and the
 * hash from the card are both needed, once). A grant lives in the bridge's own state folder until it is removed, with no expiry. Every time a turn is
 * built, each stored grant is checked AGAIN (applyGrants), so a planted or hand-edited file widens nothing.
 *
 * This file is inlined into bridge/bridge.mjs by scripts/build-bridge.mjs (the built bridge is ONE file that runs on a person's computer and cannot
 * resolve a relative import). bridge.ts already imports `fs`, `path` and `crypto` under those names, and the build strips this file's own import
 * lines, so keep its imports to exactly those three.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// --- What may be granted ---------------------------------------------------------------------------------------------

/**
 * The only outbound hosts a grant can add. A closed list that ships with the bridge: a domain a person (or an agent) types is never added, and a
 * new domain needs a new bridge release (Kai, 2026-11-28). Matching is exact, byte for byte: no case folding, no trailing dot, no wildcard, so a
 * look-alike (`GitHub.com.`, `github.com.evil.example`, a Cyrillic letter) is simply not in the list.
 */
export const DOMAIN_CATALOG: readonly string[] = ["github.com", "codeload.github.com", "objects.githubusercontent.com", "pypi.org", "files.pythonhosted.org", "crates.io", "static.crates.io", "playwright.azureedge.net"];

/** The three settings a grant may widen. Anything else is refused as "not on the allowed list". */
export const ALLOWED = {
  "sandbox.network.allowLocalBinding": "Let a command in this project open a local port (value: true).",
  "sandbox.network.allowUnixSockets": "Let a command in this project use one Unix socket that is inside the project folder (value: the socket's path).",
  "sandbox.network.allowedDomains": `Let a command in this project reach one more host, exactly one of: ${DOMAIN_CATALOG.join(", ")} (value: the host).`,
} as const;
export type SettingName = keyof typeof ALLOWED;

/** One line per allowed setting, for the refusal the agent sees. */
export const ALLOWED_LIST: readonly string[] = Object.entries(ALLOWED).map(([k, v]) => `${k}: ${v}`);

/**
 * Setting names that are refused whatever ALLOWED says, so a later edit to ALLOWED cannot open one by mistake. A name matches when it is the
 * entry or sits under it (`permissions` covers `permissions.defaultMode`; `sandbox.filesystem` covers every write path, so none outside the project).
 */
export const NEVER_SETTINGS: readonly string[] = [
  "sandbox.enabled", "sandbox.allowunsandboxedcommands", "sandbox.excludedcommands", "sandbox.filesystem",
  "hooks", "env", "apikeyhelper", "mcpservers", "permissions",
];

/** One saved grant's scope: it lasts until the person removes it (Kai, 2026-11-28). There is no other scope and no expiry time. */
export const GRANT_SCOPE = "project-until-removed";
/** Project names the bridge lists: letters, digits, dot, dash, underscore, at most 64, not starting with a dot. Keeps a project id from walking the path. */
const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_GRANTS_PER_PROJECT = 50;
const MAX_REASON = 500;
/** A request's value is at most this long, and a socket path at most this many parts: checked before any disk call (a flood of long paths must stay cheap). */
const MAX_VALUE = 512;
const MAX_SEGMENTS = 32;
/** Parents tried when a path does not exist yet; no loop on the disk is ever longer than this. */
const MAX_RESOLVE_STEPS = 64;
/** At most this many request_setting calls in one turn, refused ones included; every call after it is refused without checking. */
const MAX_CALLS_PER_TURN = 20;
/** A pending request ends this long after it was made, if its turn has not ended it (or a new request) before. */
const PENDING_MS = 15 * 60 * 1000;

// --- Types -----------------------------------------------------------------------------------------------------------

/** The project a request or a grant belongs to: its name in the bridge's project list, the folder's device:inode, and its real path. */
export interface ProjectRef { id: string; folderId: string; root: string }
/** A setting after checking: the name and the exact value that would go into the sandbox. */
export interface NormalizedSetting { setting: SettingName; value: true | string }
export type Verdict = { ok: true; normalized: NormalizedSetting; hash: string } | { ok: false; reason: string };
/** One stored grant. `scope` is always GRANT_SCOPE; `grantedBy` is a short fingerprint of the pairing that approved; `mac` is the keyed seal of this install (macOf). */
export interface SettingGrant {
  id: string; projectId: string; folderId: string; normalized: NormalizedSetting; hash: string; mac: string;
  grantedAt: string; grantedBy: string; bridgeVersion: string; scope: typeof GRANT_SCOPE;
}
export type GrantMode = "folder" | "computer";
type Realpath = (p: string) => string;
/** The disk's own spelling of a path (`.claude` stays `.claude` however it was typed on a case-insensitive disk); the plain call where there is no native one. */
const defaultRp: Realpath = (p) => (typeof fs.realpathSync.native === "function" ? fs.realpathSync.native(p) : fs.realpathSync(p));

// --- Checking one request --------------------------------------------------------------------------------------------

const lower = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** Why this setting or value is on the never-list, or null. Runs BEFORE the allow-list, and again when a grant is loaded. */
export function neverReason(setting: unknown, value: unknown): string | null {
  if (typeof setting === "string") {
    const s = lower(setting);
    for (const n of NEVER_SETTINGS) if (s === n || s.startsWith(`${n}.`) || s.startsWith(`${n}[`)) return `${setting} can never be granted.`;
    if (s.includes(".claude")) return "A .claude path can never be granted.";
  }
  if (typeof value === "string") {
    // Any wildcard host or path, however it is spelled.
    if (/[*?]/.test(value)) return "A wildcard can never be granted.";
    // In any case, on every platform: `.Claude` is the same folder as `.claude` on a case-insensitive disk.
    if (value.split(/[\\/]+/).some((part) => part.toLowerCase() === ".claude") || /(^|[\\/])\.claude\.json$/i.test(value)) return "A .claude path can never be granted.";
    // The docker and ssh-agent sockets hand over the whole computer; refused even if some link inside the project points at them.
    if (/docker\.sock|containerd\.sock|ssh-agent|ssh_auth_sock|agent\.\d+|S\.gpg-agent/i.test(value)) return "That socket can never be granted (docker, ssh-agent and gpg-agent sockets are never allowed).";
  }
  return null;
}

/** The hash a card and a grant are bound to: the project and the exact setting and value. The reason text is not part of it. */
export function hashOf(project: ProjectRef, n: NormalizedSetting): string {
  return crypto.createHash("sha256").update(JSON.stringify(["settingGrant/1", project.id, project.folderId, n.setting, n.value])).digest("hex");
}

/**
 * The path a socket would really have: every link followed. A path that does not exist yet is the real path of its nearest existing parent plus the
 * missing names; a link whose target is missing (it exists, but cannot be resolved) gives null, because the target could be made later anywhere.
 * At most MAX_RESOLVE_STEPS parents are tried; a path that needs more gives null.
 */
function realResolve(p: string, rp: Realpath): string | null {
  const rest: string[] = [];
  let cur = path.resolve(p);
  for (let step = 0; step < MAX_RESOLVE_STEPS; step++) {
    try {
      const r = rp(cur);
      return rest.length ? path.join(r, ...rest.reverse()) : r;
    } catch {
      let linkOrOther = true;
      try { fs.lstatSync(cur); } catch { linkOrOther = false; }
      if (linkOrOther) return null; // it is there but cannot be resolved: a dangling link or a loop
      const up = path.dirname(cur);
      if (up === cur) return null;
      rest.push(path.basename(cur));
      cur = up;
    }
  }
  return null;
}

/** Is `child` strictly inside `root` (not the root itself)? */
function strictlyInside(root: string, child: string): boolean {
  const rel = path.relative(root, child);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/**
 * Checks one setting and value for one project. Pure but for reading links on disk (the `rp` argument stands in for fs.realpathSync in tests).
 * Order: the never-list first, then the allow-list, then the exact rule of that item.
 */
export function validateSetting(setting: unknown, value: unknown, project: ProjectRef, rp: Realpath = defaultRp): Verdict {
  if (!project || typeof project.id !== "string" || !PROJECT_ID_RE.test(project.id) || typeof project.folderId !== "string" || typeof project.root !== "string") return { ok: false, reason: "No such project." };
  const never = neverReason(setting, value);
  if (never) return { ok: false, reason: never };
  if (typeof setting !== "string" || !Object.prototype.hasOwnProperty.call(ALLOWED, setting)) return { ok: false, reason: "That setting is not on the allowed list." };
  const name = setting as SettingName;
  let normalized: NormalizedSetting;
  if (name === "sandbox.network.allowLocalBinding") {
    if (value !== true) return { ok: false, reason: "allowLocalBinding can only be requested with the value true." };
    normalized = { setting: name, value: true };
  } else if (name === "sandbox.network.allowedDomains") {
    // Exact entry of the closed catalog. A typed domain, a wildcard or a look-alike is not one.
    if (typeof value !== "string" || !DOMAIN_CATALOG.includes(value)) return { ok: false, reason: `That host is not in the list this bridge can grant. The only hosts are: ${DOMAIN_CATALOG.join(", ")}.` };
    normalized = { setting: name, value };
  } else {
    if (typeof value !== "string" || value === "" || value.length > 1024 || value.includes("\0")) return { ok: false, reason: "A socket value is the path of one socket inside the project folder." };
    const base = realResolve(project.root, rp);
    if (!base) return { ok: false, reason: "No such project." };
    const real = realResolve(path.isAbsolute(value) ? value : path.join(project.root, value), rp);
    // The REAL path decides, so a link inside the project that points at a socket outside it is refused (and the stored value is the real path the sandbox will see).
    if (!real || !strictlyInside(base, real)) return { ok: false, reason: "A socket must be inside the project folder (links are followed)." };
    const again = neverReason(setting, real);
    if (again) return { ok: false, reason: again };
    normalized = { setting: name, value: real };
  }
  return { ok: true, normalized, hash: hashOf(project, normalized) };
}

/**
 * The reason text, as the person will read it: a short string with no control character of any kind. C0, DEL, C1 and the line and paragraph
 * separators (U+2028, U+2029) become a space; every format character (bidi controls U+202A-202E and U+2066-2069, zero-width U+200B-200D, U+FEFF
 * and the rest of \p{Cf}) is removed, and so are the blank-looking fillers outside Cf (U+034F, Hangul fillers U+115F, U+1160, U+3164, U+FFA0, braille blank U+2800), so nothing can reorder or hide the setting and value drawn next to it. Null if there is none, or it is too long.
 */
function cleanReason(r: unknown): string | null {
  if (typeof r !== "string" || r.length > MAX_REASON) return null;
  const t = r.replace(/[\p{Cf}\u034f\u115f\u1160\u2800\u3164\uffa0]+/gu, "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").trim();
  return t === "" ? null : t;
}

/** The size limits of a request's value, checked before anything touches the disk. Null when it is within them. */
function boundsProblem(setting: unknown, value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > MAX_VALUE) return `A value is at most ${MAX_VALUE} characters.`;
  if (setting === "sandbox.network.allowUnixSockets" && value.split(/[\\/]+/).filter((x) => x !== "").length > MAX_SEGMENTS) return `A socket path has at most ${MAX_SEGMENTS} parts.`;
  return null;
}

/** The request tool's checker: `{setting, value, reason}` for one project. A refusal says why; the caller adds the allowed list. */
export function validateRequest(req: unknown, project: ProjectRef, rp: Realpath = defaultRp): Verdict {
  if (!req || typeof req !== "object") return { ok: false, reason: "The request must be an object with setting, value and reason." };
  const r = req as Record<string, unknown>;
  // Only these three fields: an `approve`, `grant` or `nonce` field in a request is refused, not ignored, so nothing can pretend to approve.
  const extra = Object.keys(r).filter((k) => k !== "setting" && k !== "value" && k !== "reason");
  if (extra.length > 0) return { ok: false, reason: `A request has only setting, value and reason; it cannot carry: ${extra.join(", ")}.` };
  if (cleanReason(r.reason) === null) return { ok: false, reason: `A reason is needed: one short sentence of at most ${MAX_REASON} characters saying what is blocked.` };
  const big = boundsProblem(r.setting, r.value);
  if (big) return { ok: false, reason: big };
  return validateSetting(r.setting, r.value, project, rp);
}

// --- Applying grants to a settings object ----------------------------------------------------------------------------

/**
 * Adds one checked setting to a Claude Code settings object (in place). Adds only what is new. `*` is never added in folder mode, and a computer
 * turn already has `*`, so a host is not listed twice there. This guard is its own step, apart from the checks, on purpose: it is the last line.
 */
export function mergeGrant(settings: Record<string, any>, n: NormalizedSetting, mode: GrantMode): void {
  const sb = settings.sandbox;
  if (!sb || typeof sb !== "object") return; // no sandbox block (Windows files-only): nothing to widen
  if (!sb.network || typeof sb.network !== "object") sb.network = {};
  const net = sb.network;
  if (n.setting === "sandbox.network.allowLocalBinding") {
    net.allowLocalBinding = true;
  } else if (n.setting === "sandbox.network.allowUnixSockets") {
    const list: string[] = Array.isArray(net.allowUnixSockets) ? net.allowUnixSockets : [];
    if (!list.includes(n.value as string)) list.push(n.value as string);
    net.allowUnixSockets = list;
  } else {
    const d = n.value as string;
    if (mode === "folder" && d.includes("*")) return;
    const list: string[] = Array.isArray(net.allowedDomains) ? net.allowedDomains : [];
    if (list.includes("*") || list.includes(d)) return;
    list.push(d);
    net.allowedDomains = list;
  }
}

/**
 * The keyed seal of one stored grant: HMAC-SHA256 under this install's secret (see createGrantBook) over its id, project, folder, setting, value,
 * hash and scope. The hash alone is public arithmetic; only this seal says the bridge itself wrote the entry after the person approved.
 */
export function macOf(key: Buffer, g: Record<string, any>): string {
  const n = g.normalized;
  return crypto.createHmac("sha256", key).update(JSON.stringify(["settingGrant/2", g.id, g.projectId, g.folderId, n?.setting, n?.value, g.hash, g.scope])).digest("hex");
}

/** One stored entry, checked again from nothing: its shape, seal, scope, project, setting, value and hash. Null drops it. */
function recheck(g: unknown, project: ProjectRef, key: Buffer | null | undefined, rp: Realpath): NormalizedSetting | null {
  if (!Buffer.isBuffer(key) || key.length !== 32) return null; // no secret, no valid seal
  if (!g || typeof g !== "object") return null;
  const e = g as Record<string, any>;
  if (typeof e.id !== "string" || e.scope !== GRANT_SCOPE) return null;
  if (e.projectId !== project.id || e.folderId !== project.folderId) return null; // another project's grant
  const n = e.normalized;
  if (!n || typeof n !== "object" || typeof e.hash !== "string") return null;
  if (typeof e.mac !== "string" || !eq(macOf(key, e), e.mac)) return null; // written by hand, by another install, or changed since
  const v = validateSetting(n.setting, n.value, project, rp);
  if (!v.ok) return null; // unknown, on the never-list, outside the project, not in the catalog
  if (v.hash !== e.hash || v.normalized.setting !== n.setting || v.normalized.value !== n.value) return null; // tampered, or a link now points elsewhere
  return v.normalized;
}

/**
 * The settings a turn runs with: `base` plus every stored grant that still passes. Pure: `base` is not changed. A grant that is unknown, tampered
 * with, on the never-list or from another project is dropped, so an item taken out of ALLOWED by a bridge upgrade stops applying at once.
 */
export function applyGrants<T extends Record<string, any>>(base: T, grants: readonly unknown[], mode: GrantMode, project: ProjectRef, key: Buffer | null | undefined, rp: Realpath = defaultRp): T {
  const out = structuredClone(base);
  for (const g of Array.isArray(grants) ? grants : []) {
    const n = recheck(g, project, key, rp);
    if (n) mergeGrant(out, n, mode);
  }
  return out;
}

// --- The store and the pending requests ------------------------------------------------------------------------------

/** One request that waits for the person. The nonce goes to the app only, never to the agent. `turnEnded`: the turn that asked is over (the person may still answer). */
export interface PendingRequest {
  requestId: string; nonce: string; hash: string; reason: string; turnId: string; createdAt: string;
  project: ProjectRef; normalized: NormalizedSetting; turnEnded: boolean;
}
export type RequestResult =
  | { status: "pending"; requestId: string; merged: boolean }
  | { status: "refused"; reason: string; allowed: readonly string[] };
export type GrantResult = { ok: true; grant: SettingGrant } | { ok: false; status: number; error: string };

export interface GrantBookOptions {
  /** The bridge's state folder. The store is `<stateDir>/projects/<projectId>/granted-settings.json`. */
  stateDir: string;
  bridgeVersion: string;
  now?: () => Date;
  realpath?: Realpath;
  log?: (s: string) => void;
}

/** The folder that holds every project's grants. A code turn may neither read nor write it (denyWrite and denyRead). */
export const storeFolder = (stateDir: string) => path.join(stateDir, "projects");
/** The install's secret for sealing grants: 32 random bytes in the store folder (mode 0600), beside the grants and so under the same denyRead and denyWrite. Not a project name, so no project can own it. */
export const SECRET_FILE = ".grant-secret";
const eq = (a: string, b: string) => {
  const h = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};

/** The grant store and the pending requests of one bridge. Reads the file afresh on every call: nothing is cached, so a removed grant is gone at once. */
export function createGrantBook(o: GrantBookOptions) {
  const now = o.now ?? (() => new Date());
  const rp = o.realpath ?? defaultRp;
  const log = o.log ?? (() => {});
  // At most ONE pending request per project (a flood must not wear the person down); in memory only, so a restart clears them.
  const pending = new Map<string, PendingRequest>();
  // How many request_setting calls each running turn has made (refused ones too); a turn's count is dropped when the turn ends.
  const calls = new Map<string, number>();
  const secretFile = path.join(storeFolder(o.stateDir), SECRET_FILE);

  /** The install's secret, or null if there is none yet or the file is not 32 bytes (then no entry can verify). Read afresh each time. */
  function readKey(): Buffer | null {
    try {
      const b = fs.readFileSync(secretFile);
      return b.length === 32 ? b : null;
    } catch {
      return null;
    }
  }
  /** The secret, made once (random, 0600) when the first grant is saved. A file of the wrong size is replaced: what it sealed is gone. */
  function keyForSaving(): Buffer {
    const have = readKey();
    if (have) return have;
    fs.mkdirSync(path.dirname(secretFile), { recursive: true, mode: 0o700 });
    fs.rmSync(secretFile, { force: true });
    const k = crypto.randomBytes(32);
    fs.writeFileSync(secretFile, k, { mode: 0o600, flag: "wx" });
    return k;
  }
  /** Drops a request that has waited too long. */
  function sweep(): void {
    const t = now().getTime();
    for (const [k, p] of pending) if (!(t - Date.parse(p.createdAt) <= PENDING_MS)) pending.delete(k);
  }

  /** The store file of a project, or null for an id that is not a plain project name (`..`, a slash, a long name). */
  function fileFor(projectId: unknown): string | null {
    if (typeof projectId !== "string" || !PROJECT_ID_RE.test(projectId)) return null;
    const f = path.join(storeFolder(o.stateDir), projectId, "granted-settings.json");
    return f.startsWith(storeFolder(o.stateDir) + path.sep) ? f : null;
  }
  /** Every entry in a project's file, unchecked. A missing, unreadable or malformed file gives none (fail closed). */
  function readAll(projectId: string): unknown[] {
    const f = fileFor(projectId);
    if (!f) return [];
    try {
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      return j && j.version === 1 && Array.isArray(j.grants) ? j.grants : [];
    } catch {
      return [];
    }
  }
  function writeAll(projectId: string, grants: unknown[]): void {
    const f = fileFor(projectId);
    if (!f) throw new Error("bad project id");
    fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, grants }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, f);
  }

  return {
    /** The entries a turn for this project is built from. They are checked again by applyGrants; this only reads. */
    grantsFor(project: ProjectRef): unknown[] {
      return readAll(project.id);
    },
    /** The secret that seals this install's grants, for applyGrants; null until the first grant is saved. */
    key(): Buffer | null {
      return readKey();
    },
    /** Grants of one project as the app shows them: only entries that pass the check now (a dropped one is not shown as active). */
    listGrants(project: ProjectRef): SettingGrant[] {
      const key = readKey();
      return readAll(project.id).filter((g) => recheck(g, project, key, rp) !== null) as SettingGrant[];
    },
    /** The request tool: validates, then keeps the request pending. It can neither grant nor write the store. */
    request(project: ProjectRef, req: unknown, turnId: string): RequestResult {
      // The cap comes first and costs nothing: past it a turn gets the same refusal with no checking and no disk work.
      const made = (calls.get(turnId) ?? 0) + 1;
      if (calls.size >= 1000 && !calls.has(turnId)) calls.delete(calls.keys().next().value as string);
      calls.set(turnId, made);
      if (made > MAX_CALLS_PER_TURN) return { status: "refused", reason: `too many setting requests in this turn (at most ${MAX_CALLS_PER_TURN}). Stop this turn and say what is blocked.`, allowed: ALLOWED_LIST };
      const v = validateRequest(req, project, rp);
      if (!v.ok) return { status: "refused", reason: v.reason, allowed: ALLOWED_LIST };
      const reason = cleanReason((req as Record<string, unknown>).reason)!;
      sweep();
      const have = pending.get(project.id);
      if (have) {
        // The same request again is merged into the one that waits (and is the running turn's now); a different one waits its turn,
        // unless the turn that made the waiting one is over: then the slot is free and the old card finds nothing.
        if (have.hash === v.hash) {
          have.turnEnded = false;
          have.turnId = turnId;
          return { status: "pending", requestId: have.requestId, merged: true };
        }
        if (!have.turnEnded) return { status: "refused", reason: "Another request for this project is already waiting for the person's approval. Stop this turn and say what is blocked.", allowed: ALLOWED_LIST };
        pending.delete(project.id);
      }
      // Only entries that still pass the check count: dead ones (a lost secret, a recreated folder) must not fill the cap. Nothing is pruned here.
      const liveKey = readKey();
      if (readAll(project.id).filter((e) => recheck(e, project, liveKey, rp) !== null).length >= MAX_GRANTS_PER_PROJECT) return { status: "refused", reason: "This project already has the most grants it can hold.", allowed: ALLOWED_LIST };
      const p: PendingRequest = {
        requestId: crypto.randomBytes(12).toString("hex"), nonce: crypto.randomBytes(16).toString("hex"), hash: v.hash, reason, turnId,
        createdAt: now().toISOString(), project, normalized: v.normalized, turnEnded: false,
      };
      pending.set(project.id, p);
      return { status: "pending", requestId: p.requestId, merged: false };
    },
    /** What the app shows on a card: the exact setting and value, the reason, and the nonce and hash it must send back. */
    listRequests(projectId: string): PendingRequest[] {
      sweep();
      const p = pending.get(projectId);
      return p ? [p] : [];
    },
    /** The person's approval. Needs the nonce and the hash of the pending request; works once. A refusal leaves the request pending. */
    grant(requestId: unknown, nonce: unknown, hash: unknown, by: string): GrantResult {
      sweep();
      const p = [...pending.values()].find((x) => typeof requestId === "string" && eq(x.requestId, requestId));
      if (!p) return { ok: false, status: 404, error: "No such pending request." };
      if (typeof nonce !== "string" || !eq(p.nonce, nonce)) return { ok: false, status: 403, error: "The nonce does not match this request." };
      if (typeof hash !== "string" || !eq(p.hash, hash)) return { ok: false, status: 409, error: "The request is not the one that was shown." };
      const g: SettingGrant = {
        id: crypto.randomBytes(12).toString("hex"), projectId: p.project.id, folderId: p.project.folderId, normalized: p.normalized, hash: p.hash, mac: "",
        grantedAt: now().toISOString(), grantedBy: by.slice(0, 16), bridgeVersion: o.bridgeVersion, scope: GRANT_SCOPE,
      };
      try {
        const key = keyForSaving();
        g.mac = macOf(key, g);
        // Writing is when dead entries (they fail the check) are dropped; a read never changes the file.
        const rest = readAll(p.project.id).filter((e) => (e as Record<string, unknown>)?.hash !== p.hash && recheck(e, p.project, key, rp) !== null);
        writeAll(p.project.id, [...rest, g]);
      } catch (e) {
        log(`setting grant not saved: ${(e as Error).message}`);
        return { ok: false, status: 500, error: "The grant could not be saved on this computer." };
      }
      pending.delete(p.project.id); // the nonce is used up with the request
      return { ok: true, grant: g };
    },
    /** The person's "no": drops the pending request so a new one can be made. */
    decline(requestId: unknown): boolean {
      sweep();
      for (const [k, p] of pending) if (typeof requestId === "string" && eq(p.requestId, requestId)) { pending.delete(k); return true; }
      return false;
    },
    /** The turn is over: its call count is dropped, and a request it made is marked so (the person may still answer it; another turn's different request may take the slot). */
    endTurn(turnId: string): void {
      calls.delete(turnId);
      for (const p of pending.values()) if (p.turnId === turnId) p.turnEnded = true;
    },
    /** Removes one grant by id from whichever project holds it. The next turn is built without it. */
    revoke(grantId: unknown): boolean {
      if (typeof grantId !== "string" || !/^[0-9a-f]{24}$/.test(grantId)) return false;
      let dirs: string[] = [];
      try { dirs = fs.readdirSync(storeFolder(o.stateDir)); } catch { return false; }
      for (const d of dirs) {
        const all = readAll(d);
        const keep = all.filter((e) => (e as Record<string, unknown>)?.id !== grantId);
        if (keep.length === all.length) continue;
        try { writeAll(d, keep); } catch (e) { log(`grant not removed: ${(e as Error).message}`); return false; }
        return true;
      }
      return false;
    },
  };
}
