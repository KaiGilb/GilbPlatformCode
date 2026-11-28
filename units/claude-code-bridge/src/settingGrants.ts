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
/** A store file larger than this is not read: it holds no grants (the bridge writes at most 50 per project, far below this). */
const MAX_STORE_BYTES = 1024 * 1024;
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
 * and the rest of \p{Cf}) is removed, and so are the blank-looking fillers outside Cf (U+034F, Hangul fillers U+115F, U+1160, U+3164, U+FFA0, braille blank
 * U+2800, Khmer vowels U+17B4/5, variation selectors U+FE00-FE0F and U+E0100-E01EF), and the no-break and wide spaces (U+00A0, U+2000-200A, U+202F, U+205F, U+3000) become a plain space, so nothing can reorder or hide the setting and value drawn next to it. Null if there is none, or it is too long.
 */
function cleanReason(r: unknown): string | null {
  if (typeof r !== "string" || r.length > MAX_REASON) return null;
  const t = r
    .replace(/[\p{Cf}\u034f\u115f\u1160\u17b4\u17b5\u180b-\u180f\u2800\u3164\ufe00-\ufe0f\uffa0\u{e0100}-\u{e01ef}\u{1d159}]+/gu, "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g, " ")
    .trim();
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
/** `latch`: the caller must keep setting grants off until the bridge restarts (the secret file was found changed). */
export type GrantResult = { ok: true; grant: SettingGrant } | { ok: false; status: number; error: string; latch?: true };
export type RevokeResult = { ok: true } | { ok: false; status: number; error: string; latch?: true };

export interface GrantBookOptions {
  /** The bridge's state folder. The store is `<stateDir>/projects/<projectId>/granted-settings.json`. */
  stateDir: string;
  bridgeVersion: string;
  now?: () => Date;
  realpath?: Realpath;
  log?: (s: string) => void;
  /** TEST-ONLY: the temp file name of an atomic write (default: the file name plus 16 random bytes in hex). */
  tempName?: (file: string) => string;
}

/**
 * The temp names this file writes (`<file>.<32 hex>.tmp`). A kill between fsync and rename leaves one behind, and the secret's copy holds the secret,
 * so load() removes exactly these names, regular files only (never a link, never a folder, never another name).
 */
const TEMP_LEFTOVER_RES: readonly RegExp[] = [/^\.grant-secret\.[0-9a-f]{32}\.tmp$/, /^granted-settings\.json\.[0-9a-f]{32}\.tmp$/];
/** A store folder that is no longer the one the bridge loaded or made (a link, another folder, not a folder): the write stops and grants latch off. */
class FolderSwapped extends Error {}

/** Why plainFileCheck refused a file. "missing" is the only one that is not a sign of tampering. */
export type PlainFileReason = "missing" | "symlink" | "not-regular" | "hard-link" | "mode" | "too-large" | "unreadable";
export type PlainFileResult = { ok: true; bytes?: Buffer } | { ok: false; reason: PlainFileReason };
/**
 * THE check for a file the bridge keeps and trusts (the grant secret, the grant store, and the ship key): opened without following a link (and an lstat first,
 * because Windows has no O_NOFOLLOW), without waiting (a FIFO must not stop the bridge), then it must be a regular file with ONE name (a hard link: the same bytes
 * could be changed through the other name), at most `maxBytes`, and with `mode600` exactly mode 0600 (skipped on Windows, which has no POSIX mode). Asked afresh
 * at every use by the callers that need it; it keeps no result. With `readBytes` the bytes come back; without it the file's contents are never read.
 */
export function plainFileCheck(file: string, o: { maxBytes?: number; readBytes?: boolean; mode600?: boolean; platform?: string } = {}): PlainFileResult {
  const platform = o.platform ?? process.platform;
  let fd = -1;
  try {
    let l: fs.Stats;
    try { l = fs.lstatSync(file); } catch (e) { return { ok: false, reason: (e as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unreadable" }; }
    if (l.isSymbolicLink()) return { ok: false, reason: "symlink" };
    // O_NONBLOCK: opening a FIFO must not wait for a writer (that would stop the whole bridge); anything that is not a regular file is refused just below.
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
    const st = fs.fstatSync(fd);
    if (!st.isFile()) return { ok: false, reason: "not-regular" };
    if (platform !== "win32" && st.nlink > 1) return { ok: false, reason: "hard-link" };
    if (o.mode600 && platform !== "win32" && (st.mode & 0o777) !== 0o600) return { ok: false, reason: "mode" };
    if (o.maxBytes !== undefined && st.size > o.maxBytes) return { ok: false, reason: "too-large" };
    if (!o.readBytes) return { ok: true };
    const buf = Buffer.alloc(st.size);
    const n = fs.readSync(fd, buf, 0, st.size, 0);
    return { ok: true, bytes: buf.subarray(0, n) };
  } catch (e) {
    return { ok: false, reason: (e as NodeJS.ErrnoException).code === "ELOOP" ? "symlink" : "unreadable" };
  } finally {
    if (fd >= 0) { try { fs.closeSync(fd); } catch { /* closed anyway */ } }
  }
}

/** The folder that holds every project's grants. A code turn may neither read nor write it (denyWrite and denyRead). */
export const storeFolder = (stateDir: string) => path.join(stateDir, "projects");
/** The install's secret for sealing grants: 32 random bytes in the store folder (mode 0600), beside the grants and so under the same denyRead and denyWrite. Not a project name, so no project can own it. */
export const SECRET_FILE = ".grant-secret";
const eq = (a: string, b: string) => {
  const h = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};

/**
 * The grant store and the pending requests of one bridge. The bridge is the ONLY legitimate writer of the store, so the secret and every project's
 * entries are read from disk ONCE, by `load()` at start (after the start checks pass), and every later read uses that copy in memory. A grant or a
 * revoke changes memory first and then writes the file (temp file in the same folder, then rename, mode 0600); a file edited while the bridge runs is
 * never read. Before `load()` the book holds nothing.
 */
export function createGrantBook(o: GrantBookOptions) {
  const now = o.now ?? (() => new Date());
  const rp = o.realpath ?? defaultRp;
  const log = o.log ?? (() => {});
  // At most ONE pending request per project (a flood must not wear the person down); in memory only, so a restart clears them.
  const pending = new Map<string, PendingRequest>();
  // How many request_setting calls each running turn has made (refused ones too); a turn's count is dropped when the turn ends.
  const calls = new Map<string, number>();
  const secretFile = path.join(storeFolder(o.stateDir), SECRET_FILE);
  // The copy in memory: the secret (null until one exists) and each project's entries.
  let keyMem: Buffer | null = null;
  let grantsMem = new Map<string, unknown[]>();
  // The store folder and each project's folder as the bridge saw them (device and inode), set at load() or when this book made the folder.
  // A write is refused when the folder is no longer that plain directory (Agent.Hacker round 7, T1: a link swapped in after start).
  const dirIds = new Map<string, { dev: number; ino: number }>();

  /** The install's secret from disk, or null if there is none yet or the file is not 32 bytes (then no entry can verify). Used by load() only. */
  function readKey(): Buffer | null {
    const b = readFileSafe(secretFile, 32);
    return b && b.length === 32 ? b : null;
  }
  /** One warning per file and reason, not one per call (a turn reads the store many times). */
  const warned = new Set<string>();
  const warnOnce = (file: string, why: string) => {
    if (warned.has(file + why)) return;
    warned.add(file + why);
    log(`setting grants: ${file} ${why}, so it is not used.`);
  };
  /**
   * The bytes of one file the bridge keeps, or null. The checks are plainFileCheck's (not a link, a plain file, one name, not too large); a missing file is quietly null.
   */
  function readFileSafe(file: string, max: number): Buffer | null {
    const r = plainFileCheck(file, { maxBytes: max, readBytes: true });
    if (r.ok) return r.bytes ?? null;
    if (r.reason === "hard-link") warnOnce(file, "has more than one name (a hard link)");
    else if (r.reason === "too-large") warnOnce(file, `is larger than ${max} bytes`);
    return null;
  }
  const tempName = o.tempName ?? ((f: string) => `${f}.${crypto.randomBytes(16).toString("hex")}.tmp`);
  /**
   * Called before every write into a store folder. The folder must be a plain directory (lstat, so a link is not followed) with the device and inode
   * recorded at load or when this book made it; the first write to a folder not seen before records it (it is checked to be a plain directory then).
   * A missing folder is made here (0700) and recorded. Anything else throws FolderSwapped: nothing is written, and the caller latches grants off.
   */
  function guardDir(dir: string): void {
    // A project folder is reached THROUGH the store folder, so a link in place of the store folder must fail first (lstat of the child would follow it).
    const root = storeFolder(o.stateDir);
    if (dir !== root) guardDir(root);
    let st: fs.Stats | null = null;
    try { st = fs.lstatSync(dir); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    if (!st) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      st = fs.lstatSync(dir); // a link that appeared between the two calls fails the check below
    }
    if (!st.isDirectory()) throw new FolderSwapped(`${dir} is not a plain folder`);
    const known = dirIds.get(dir);
    if (known && (known.dev !== st.dev || known.ino !== st.ino)) throw new FolderSwapped(`${dir} is not the folder the bridge started with`);
    if (!known) dirIds.set(dir, { dev: st.dev, ino: st.ino });
  }
  /** Refuses a destination that exists and is not a plain file (a link, a folder, a device): a rename would replace it, and a link may be where the agent wants the bytes to go. */
  function destinationOk(f: string): void {
    let st: fs.Stats;
    try { st = fs.lstatSync(f); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return; throw e; }
    if (!st.isFile()) throw new Error(`${f} is not a plain file`);
  }
  /**
   * Writes a whole file the safe way: a temp file in the same folder with a random name, created new (O_EXCL, so an existing file or link at that name
   * fails, never followed or reused; O_NOFOLLOW too) with mode 0600, written, fsynced and closed, then renamed over the name. A destination that is a
   * link or not a plain file is refused before and again just before the rename. A temp file this call made is removed if anything fails.
   */
  function writeFileAtomic(f: string, data: string | Buffer): void {
    guardDir(path.dirname(f));
    destinationOk(f);
    const tmp = tempName(f);
    const fd = fs.openSync(tmp, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } catch (e) {
      try { fs.closeSync(fd); } catch { /* closed anyway */ }
      try { fs.rmSync(tmp, { force: true }); } catch { /* gone */ }
      throw e;
    }
    fs.closeSync(fd);
    try {
      destinationOk(f);
      fs.renameSync(tmp, f);
    } catch (e) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* gone */ }
      throw e;
    }
  }
  /** The secret file against memory: "same", "missing", or "bad" (a link, not a plain single-name file, other bytes, unreadable). */
  function secretState(key: Buffer): "same" | "missing" | "bad" {
    let fd = -1;
    try {
      fd = fs.openSync(secretFile, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
      const st = fs.fstatSync(fd);
      if (!st.isFile() || (process.platform !== "win32" && st.nlink > 1) || st.size !== key.length) return "bad";
      const buf = Buffer.alloc(st.size);
      fs.readSync(fd, buf, 0, st.size, 0);
      return crypto.timingSafeEqual(buf, key) ? "same" : "bad";
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "bad";
    } finally {
      if (fd >= 0) { try { fs.closeSync(fd); } catch { /* closed anyway */ } }
    }
  }
  /** Removes the files in `dir` whose name matches `re` and that are regular files by lstat (a link or a folder of that name is left alone and never followed). */
  function sweepTemps(dir: string, re: RegExp): void {
    let names: string[] = [];
    try { names = fs.readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (!re.test(n)) continue;
      const f = path.join(dir, n);
      try {
        if (!fs.lstatSync(f).isFile()) continue;
        fs.unlinkSync(f);
        log(`setting grants: removed ${f}, a temp file left by a stopped write.`);
      } catch { /* not removable now: it is never read, so it stays harmless */ }
    }
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
  /** Every entry of a project, unchecked, from memory. */
  function readAll(projectId: string): unknown[] {
    return grantsMem.get(projectId) ?? [];
  }
  /** Every entry in a project's file on disk, unchecked. A missing, unreadable or malformed file gives none (fail closed). Used by load() only. */
  function readDisk(projectId: string): unknown[] {
    const f = fileFor(projectId);
    if (!f) return [];
    try {
      const raw = readFileSafe(f, MAX_STORE_BYTES);
      if (!raw) return [];
      const j = JSON.parse(raw.toString("utf8"));
      return j && j.version === 1 && Array.isArray(j.grants) ? j.grants : [];
    } catch {
      return [];
    }
  }
  function writeAll(projectId: string, grants: unknown[]): void {
    const f = fileFor(projectId);
    if (!f) throw new Error("bad project id");
    writeFileAtomic(f, JSON.stringify({ version: 1, grants }, null, 2));
  }

  return {
    /** Reads the secret and every project's file from disk into memory (the only disk read of the store). Call once at start, after the start checks. */
    load(): void {
      grantsMem = new Map();
      dirIds.clear();
      // The store folder must itself be a plain directory (a link is not followed, as with each project folder); its device and inode are kept for every later write.
      const root = storeFolder(o.stateDir);
      let rootStat: fs.Stats | null = null;
      try { rootStat = fs.lstatSync(root); } catch { /* no store yet */ }
      if (rootStat && !rootStat.isDirectory()) { warnOnce(root, "is not a plain folder"); keyMem = null; return; }
      if (rootStat) dirIds.set(root, { dev: rootStat.dev, ino: rootStat.ino });
      sweepTemps(root, TEMP_LEFTOVER_RES[0]!);
      keyMem = readKey();
      let dirs: string[] = [];
      try { dirs = fs.readdirSync(root); } catch { /* no store yet */ }
      for (const d of dirs) {
        if (!PROJECT_ID_RE.test(d)) continue;
        // A project's folder is opened without following a link: it must itself be a plain directory, else that project is skipped.
        const dp = path.join(storeFolder(o.stateDir), d);
        let plain = false;
        try { plain = fs.lstatSync(dp).isDirectory(); } catch { /* gone */ }
        if (!plain) { warnOnce(dp, "is not a plain folder"); continue; }
        const ds = fs.lstatSync(dp);
        dirIds.set(dp, { dev: ds.dev, ino: ds.ino });
        sweepTemps(dp, TEMP_LEFTOVER_RES[1]!);
        grantsMem.set(d, readDisk(d));
      }
    },
    /** The entries a turn for this project is built from. They are checked again by applyGrants; this only reads. */
    grantsFor(project: ProjectRef): unknown[] {
      return readAll(project.id);
    },
    /** The secret that seals this install's grants, for applyGrants; null until the first grant is saved. */
    key(): Buffer | null {
      return keyMem;
    },
    /** Grants of one project as the app shows them: only entries that pass the check now (a dropped one is not shown as active). */
    listGrants(project: ProjectRef): SettingGrant[] {
      return readAll(project.id).filter((g) => recheck(g, project, keyMem, rp) !== null) as SettingGrant[];
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
      if (readAll(project.id).filter((e) => recheck(e, project, keyMem, rp) !== null).length >= MAX_GRANTS_PER_PROJECT) return { status: "refused", reason: "This project already has the most grants it can hold.", allowed: ALLOWED_LIST };
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
      const oldKey = keyMem;
      const oldList = grantsMem.get(p.project.id);
      // The secret file must still be the one the bridge made: gone, it is written again from memory (else grants made now would be lost at the next
      // start); changed, linked or not a plain single-name file, nothing is granted and the caller keeps grants off until the bridge restarts.
      if (keyMem) {
        const st = secretState(keyMem);
        if (st === "bad") {
          log("setting grants: the secret file was changed while the bridge runs.");
          return { ok: false, status: 409, error: "The secret file of the grants was changed while the bridge runs, so nothing can be granted. Setting grants are off until the bridge restarts.", latch: true };
        }
        if (st === "missing") {
          try { writeFileAtomic(secretFile, keyMem); } catch (e) {
            log(`setting grant not saved: ${(e as Error).message}`);
            return { ok: false, status: 500, error: "The grant could not be saved on this computer.", ...(e instanceof FolderSwapped ? { latch: true as const } : {}) };
          }
        }
      }
      try {
        // Memory first, then the file; if the file cannot be written, memory goes back as it was.
        const key = keyMem ?? crypto.randomBytes(32);
        g.mac = macOf(key, g);
        // Saving is when dead entries (they fail the check) are dropped.
        const rest = readAll(p.project.id).filter((e) => (e as Record<string, unknown>)?.hash !== p.hash && recheck(e, p.project, key, rp) !== null);
        keyMem = key;
        grantsMem.set(p.project.id, [...rest, g]);
        if (!oldKey) writeFileAtomic(secretFile, key);
        writeAll(p.project.id, [...rest, g]);
      } catch (e) {
        keyMem = oldKey;
        if (oldList) grantsMem.set(p.project.id, oldList); else grantsMem.delete(p.project.id);
        log(`setting grant not saved: ${(e as Error).message}`);
        // A folder swapped after start is a sign of tampering, like a changed secret: grants stay off until the bridge restarts.
        return { ok: false, status: 500, error: "The grant could not be saved on this computer.", ...(e instanceof FolderSwapped ? { latch: true as const } : {}) };
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
    revoke(grantId: unknown): RevokeResult {
      const none: RevokeResult = { ok: false, status: 404, error: "No such grant." };
      if (typeof grantId !== "string" || !/^[0-9a-f]{24}$/.test(grantId)) return none;
      for (const [d, all] of grantsMem) {
        const keep = all.filter((e) => (e as Record<string, unknown>)?.id !== grantId);
        if (keep.length === all.length) continue;
        grantsMem.set(d, keep); // memory first, then the file; back again if the file cannot be written
        try { writeAll(d, keep); } catch (e) {
          grantsMem.set(d, all);
          log(`grant not removed: ${(e as Error).message}`);
          return { ok: false, status: 500, error: "Could not save the change; nothing was changed.", ...(e instanceof FolderSwapped ? { latch: true as const } : {}) };
        }
        return { ok: true };
      }
      return none;
    },
  };
}
