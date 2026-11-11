import type { Caller } from "./auth";
import { badRequest, forbidden, json, type Core, type Req } from "./http";
import { LWS_CONTEXT } from "./http";
import type { Vault } from "./types";
import { LWS_CONTENT } from "./content";

/** Root `https://<host>/base` or `https://<host>/vault`, or a one-segment legacy slug under either (src/authz/vault-target.ts:155). */
const ACCEPTED_VAULT_ID = /^https:\/\/[^/\s?#]+\/(?:base|vault)(?:\/[A-Za-z0-9_-]+)?$/;
const ACCEPTED_FORM = "the vaultId field from GET /lws/vaults — an https URI of the form https://<host>/vault (user vault) or https://<host>/base (system vault)";

export type Reach = Set<"read" | "write">;

/** The whole-vault modes this person holds: the owner both, a grant its mode (write brings read), nothing after `revokeAccess`. */
export function reachOf(core: Core, caller: Caller | null, vault: Vault): Reach {
  const out: Reach = new Set();
  if (!caller || vault.pending) return out;
  if (core.s.revoked.has(`${vault.id}\n${caller.principal}`)) return out;
  if (vault.owner === caller.principal) return new Set(["read", "write"]);
  for (const m of core.s.grants.get(vault.id)?.get(caller.principal) ?? []) {
    if (m === "read") out.add("read");
    if (m === "write") {
      out.add("write");
      out.add("read");
    }
  }
  return out;
}

export interface NewVault {
  name: string;
  owner: string;
  represents: string | null;
  partOf?: string | null;
  host?: string;
  pending?: boolean;
  /** The email of the person who minted it through create-named. */
  mintedBy?: string | null;
}
/** A vault in the fake's state: id `https://<host>/vault`, its own entity URI, a name registered to its owner. */
export function makeVault(core: Core, n: NewVault): Vault {
  const host = n.host ?? `${n.name}.${core.o.domain}`;
  const id = `https://${host}/vault`;
  if (core.s.vaults.has(id)) throw new Error(`fake-platform: vault ${id} is already seeded`);
  const v: Vault = { id, name: n.name, host, owner: n.owner, represents: n.represents, partOf: n.partOf ?? null, entity: `https://${host}/vault/e/${core.nextId()}`, pending: n.pending ?? false, mintedBy: n.mintedBy ?? null };
  core.s.vaults.set(id, v);
  return v;
}

export function vaultByText(core: Core, text: string): Vault | null {
  let host: string;
  try {
    host = new URL(text).host;
  } catch {
    return null;
  }
  for (const v of core.s.vaults.values()) if (v.host === host) return v;
  return null;
}

/**
 * THE ONE RESOLVER (src/authz/vault-target.ts:304-324): a malformed vault id is 400, a vault the caller cannot reach at `mode` is 403 (existing or not).
 */
export function resolveVault(core: Core, caller: Caller | null, segment: string, mode: "read" | "write"): Vault | Response {
  const token = segment.trim();
  if (token === "") return badRequest("vault target required: this route is vault-scoped and the request named no vault. There is no default vault (3P.C.EveryEntityInNamedVault) — name the vault in the path.");
  if (token.length > 512 || /[\s?#]/.test(token)) return badRequest(`vault target malformed: ${JSON.stringify(token.slice(0, 64))}`);
  if (!ACCEPTED_VAULT_ID.test(token)) {
    return new Response(JSON.stringify({ error: "vault_name_unresolved", message: `vault name not resolved: "${token}" is not a vaultId URI`, accepted: ACCEPTED_FORM }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const v = vaultByText(core, token);
  if (!v || !reachOf(core, caller, v).has(mode)) return forbidden(`vault target denied: the principal holds no ${mode} reach on vault ${token}`);
  return v;
}

/**
 * GET /lws/vaults.
 * Mirrors: src/lws/routes.ts:782; src/lws/vaults.ts:563-717 (document :710-717, node :129-189, anonymous :615); podName keys src/read/name-resolve-crossing.ts:130,145.
 * `@id` of a vault node is left out (the platform omits it for a bare namespace with no vault entity, vaults.ts:684-686).
 */
export function listVaults(core: Core, req: Req, caller: Caller | null): Response {
  const vaults = [];
  for (const v of core.s.vaults.values()) {
    const modes = [...reachOf(core, caller, v)].sort();
    if (modes.length === 0) continue;
    const landing = caller !== null && [...core.s.people.values()].some((p) => p.principal === caller.principal && p.landingVaultId === v.id);
    const parent = v.partOf ? core.s.vaults.get(v.partOf) : undefined;
    vaults.push({
      "@id": v.entity,
      vaultId: v.id,
      name: v.name,
      represents: v.represents,
      partOf: parent ? { vaultId: parent.id } : null,
      parentAmbiguous: false,
      modes,
      isLandingVault: landing,
      podName: v.name,
      podNameKnown: true,
    });
  }
  vaults.sort((a, b) => a.name.localeCompare(b.name) || a.vaultId.localeCompare(b.vaultId));
  return json(200, { "@context": LWS_CONTEXT, "@id": `https://${core.o.host}/lws/vaults`, total: vaults.length, vaults, complete: true, incompletePeers: 0 }, { "content-type": LWS_CONTENT });
}
