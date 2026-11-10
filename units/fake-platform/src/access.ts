import type { Caller } from "./auth";
import { badRequest, forbidden, json, parseBody, schemaRefusal, type Core, type Req } from "./http";
import type { GrantMode, Vault } from "./types";
import { vaultByText } from "./vaults";

const MODES: readonly GrantMode[] = ["read", "write", "append", "control"];
/** src/authz/entity-acl.ts:73: the order levels are listed in. */
const LEVEL_ORDER: Record<GrantMode, number> = { read: 0, append: 1, write: 2, control: 3 };
/** src/authz/entity-acl.ts:471-476 */
const VAULT_ACL_NOTE =
  "Whole-vault grants on both planes: principal/group grants (and owner/delegated control), plus " +
  "vault→vault reach edges into this vault and PUBLIC if declared. Each plane is listed separately — " +
  "edges are cut with revoke-vault-reach, principal grants with revoke-vault. Also includes vaults that " +
  "reach this vault only through a chain of other vaults (reverse seat-closure walk), listed as " +
  "vault-reach-chain with the link to cut. Does NOT include per-record grants.";

const isOpaque = (t: string): boolean => t.includes("/base/p/") || t.includes("/base/g/");

export function holdsControl(core: Core, principal: string, vault: Vault): boolean {
  if (core.s.revoked.has(`${vault.id}\n${principal}`)) return false;
  return vault.owner === principal || (core.s.grants.get(vault.id)?.get(principal)?.has("control") ?? false);
}

/** The Control gate of grant, revoke and the access list (src/routes/authz.ts:638-693). Strict rows: no credential is 401 before this. */
function controlGate(core: Core, caller: Caller | null, vaultText: string): { vault: Vault } | Response {
  const v = vaultByText(core, vaultText);
  if (caller && v && holdsControl(core, caller.principal, v)) return { vault: v };
  return forbidden(`Principal ${caller?.principal ?? "<anon>"} does not hold acl:Control on the target vault ${vaultText} — grant/revoke requires vault ownership or a delegated Control capability (Cycle053 VDS-6 delegable-Control gate)`);
}

const bareOrigin = (t: string): { path: string; url: URL } | null => {
  try {
    const url = new URL(t);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
    return { path: url.pathname.replace(/\/+$/, ""), url };
  } catch {
    return null;
  }
};

/**
 * What a grantee string names. An opaque key stays. A vault address (`/vault`, `/base`), a bare host (`https://<name>.<domain>`, with or without `/`)
 * and a short WebID (`/i`) name the person who holds that vault when there is one; otherwise the string comes back unchanged.
 * Mirrors: src/authz/vault-grant.ts:170-233 (resolveGrantGrantee, the bare-host step :214-230). The fake resolves to the vault owner's principal.
 */
export function resolveGrantee(core: Core, grantee: string): string {
  const t = grantee.trim();
  if (isOpaque(t)) return t;
  const u = bareOrigin(t);
  if (u && ["", "/vault", "/base", "/i"].includes(u.path)) {
    const v = vaultByText(core, `${u.url.origin}/vault`);
    if (v) return v.owner;
  }
  return t;
}

/** An unresolved bare host or short WebID on this platform's host family names nobody (src/authz/vault-grant.ts:293-311, :314-345). */
function refuseNamesNoOne(core: Core, input: string, resolved: string): Response | null {
  if (resolved !== input.trim() || isOpaque(resolved)) return null;
  const u = bareOrigin(resolved);
  if (!u) return null;
  if (u.path === "/vault" || u.path === "/base" || /^\/(vault|base)\/[A-Za-z0-9_-]+$/.test(u.path)) return null;
  if (!["", "/i"].includes(u.path)) return null;
  const host = u.url.host;
  const family = host === core.o.host || core.o.hosts.has(host) || host.endsWith(`.${core.o.domain}`);
  return family ? badRequest(`"${resolved}" names no one on GilbPlatform. Use their vault address, for example https://<name>.${core.o.host}/vault.`) : null;
}

/** The body of grant-vault and revoke-vault (src/routes/authz.ts:154-165): { vault, grantee, mode }, nothing else. */
function grantBody(req: Req): { vault: string; grantee: string; mode: GrantMode } | Response {
  const b = parseBody(req);
  if (!b.ok) return badRequest("Body is not valid JSON");
  const v = b.value;
  if (v === null || typeof v !== "object" || Array.isArray(v)) return schemaRefusal("body must be object");
  const o = v as Record<string, unknown>;
  for (const k of ["vault", "grantee", "mode"]) if (!(k in o)) return schemaRefusal(`body must have required property '${k}'`);
  if (Object.keys(o).some((k) => !["vault", "grantee", "mode"].includes(k))) return schemaRefusal("body must NOT have additional properties");
  for (const k of ["vault", "grantee"]) if (typeof o[k] !== "string" || (o[k] as string).length < 1) return schemaRefusal(`body/${k} must NOT have fewer than 1 characters`);
  if (typeof o.mode !== "string" || !MODES.includes(o.mode as GrantMode)) return schemaRefusal("body/mode must be equal to one of the allowed values");
  return { vault: o.vault as string, grantee: o.grantee as string, mode: o.mode as GrantMode };
}

/**
 * POST /base/authz/grant-vault — grant a person a mode on the whole vault. 201 always (idempotent); `write` also plants `read`.
 * Mirrors: src/routes/authz.ts:1457-1550 (Control gate :1517, resolve :1524, answer 201 `{ vault, grantee, mode, granted: true }` :1547-1548, write plants read :1537-1540),
 * schema :154-165, gate :638-693, bare host / unresolved name :293-311.
 * Order: schema (400), credential (401), Control (403), grantee (400).
 */
export function grantVault(core: Core, req: Req, caller: Caller | null): Response {
  const b = grantBody(req);
  if (b instanceof Response) return b;
  const gate = controlGate(core, caller, b.vault);
  if (gate instanceof Response) return gate;
  const resolved = resolveGrantee(core, b.grantee);
  const refused = refuseNamesNoOne(core, b.grantee, resolved);
  if (refused) return refused;
  const byWho = core.s.grants.get(gate.vault.id) ?? new Map<string, Set<GrantMode>>();
  core.s.grants.set(gate.vault.id, byWho);
  const held = byWho.get(resolved) ?? new Set<GrantMode>();
  held.add(b.mode);
  if (b.mode === "write") held.add("read");
  byWho.set(resolved, held);
  core.s.revoked.delete(`${gate.vault.id}\n${resolved}`);
  return json(201, { vault: b.vault, grantee: resolved, mode: b.mode, granted: true });
}

/**
 * POST /base/authz/revoke-vault — take one mode away. 200 `{ vault, grantee, mode, revoked }`; `revoked:false` when none was held. Revoking write leaves read.
 * Mirrors: src/routes/authz.ts:1581-1616 (answer :1615); src/authz/vault-grant.ts:635-653 (true only when a live grant was retracted; the resolved and the given grantee both tried).
 */
export function revokeVault(core: Core, req: Req, caller: Caller | null): Response {
  const b = grantBody(req);
  if (b instanceof Response) return b;
  const gate = controlGate(core, caller, b.vault);
  if (gate instanceof Response) return gate;
  const resolved = resolveGrantee(core, b.grantee);
  const byWho = core.s.grants.get(gate.vault.id);
  let revoked = false;
  for (const who of new Set([resolved, b.grantee.trim()])) {
    const held = byWho?.get(who);
    if (held?.delete(b.mode)) {
      revoked = true;
      if (held.size === 0) byWho!.delete(who);
    }
  }
  return json(200, { vault: b.vault, grantee: resolved, mode: b.mode, revoked });
}

/**
 * GET /base/consent/vault-acl?vault= — who holds what on the whole vault. 404 `{ error: "not found" }` when the caller holds no Control.
 * Mirrors: src/routes/consent.ts:119-135 (query schema :44-52, 404 :129-131, answer :134); src/authz/entity-acl.ts:452-476 (shape), :492-576 (rows: grants plus the owner's
 * control, sorted by principal, levels in LEVEL_ORDER :73), VAULT_ACL_NOTE :471-476.
 * The owner holds no stored grant in the fake, so the owner row is levels ["control"], kind "owner-inferred" (entity-acl.ts:540-555); an owner who is also granted
 * modes shows them with kind "grant".
 */
export function vaultAcl(core: Core, req: Req, caller: Caller | null): Response {
  for (const k of new Set(req.query.keys())) if (k !== "vault") return schemaRefusal("querystring must NOT have additional properties");
  const vaultText = req.query.get("vault");
  if (vaultText === null) return schemaRefusal("querystring must have required property 'vault'");
  if (vaultText === "") return schemaRefusal("querystring/vault must NOT have fewer than 1 characters");
  const v = vaultByText(core, vaultText);
  if (!caller || !v || !holdsControl(core, caller.principal, v)) return json(404, { error: "not found" });
  const levels = new Map<string, Set<GrantMode>>();
  const stored = new Set<string>();
  for (const [who, modes] of core.s.grants.get(v.id) ?? []) {
    const shown = new Set([...modes].filter((m) => MODES.includes(m)));
    if (shown.size > 0) {
      levels.set(who, shown);
      stored.add(who);
    }
  }
  (levels.get(v.owner) ?? levels.set(v.owner, new Set()).get(v.owner)!).add("control");
  const known = new Map([...core.s.people.values()].map((p) => [p.principal, p]));
  const acl = [...levels.entries()]
    .map(([principal, set]) => ({
      principal,
      levels: [...set].sort((a, b) => LEVEL_ORDER[a] - LEVEL_ORDER[b]),
      label: null,
      webId: null,
      kind: stored.has(principal) ? "grant" : "owner-inferred",
      labelSource: null,
      registered: known.has(principal),
      viewer: principal === caller.principal ? "self" : null,
    }))
    .sort((a, b) => (a.principal < b.principal ? -1 : a.principal > b.principal ? 1 : 0));
  return json(200, { vault: vaultText, scope: "pod", note: VAULT_ACL_NOTE, acl, edges: [], chainReach: [], unclassifiedRows: 0 });
}
