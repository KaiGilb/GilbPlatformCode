// Resolve a tag to the record it names, through the platform's existing tag route.
//
//   typed text ──parse (src/tag.ts)──▶ { tag, vault name }
//   vault name ──the caller's vault list──▶ vault id
//   GET /base/tag/resolve?tagString=<tag>&vault=<vault id>  ──▶ the record, or the route's miss
//
// The route is the platform's own. It is vault-scoped and takes a vault ID, never a vault name, and it has no default vault.
//
// ⚠ WHERE THE VAULT NAMES COME FROM. A vault's short name (`t/VaultName`) is a register column,
//   not a stored fact, and the platform has no route that gives an app the short names of the
//   vaults it can reach (read on the platform, 2026-09-30: `GET /lws/vaults` serves
//   the display name; `GET /base/vault/name-resolve` is loopback-only). So this module does not
//   look a name up. The caller hands it the pairs it knows: `{ vaultId, vaultName }`.
//   ⛔ This module never works a vault name out of a vault id's host, or the reverse.
import { expectStatus, request, routeUrl, type PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { parseTag, type TagContext, type TagGrammar, type TagRefusal } from "./tag";


/** A vault the caller knows both the id and the registered short name of. */
export interface NamedVault {
  vaultId: string;
  vaultName: string;
}

export type TagLookup =
  | { status: "resolved"; record: string; tagHandle: string }
  /** The route's own structured miss: no such tag in that vault, OR one the caller may not
   *  read. The route folds the two together on purpose; this does not try to tell them apart. */
  | { status: "miss" };

/** Ask the platform which record a tag string names in one vault. */
export async function lookupTagString(
  platform: PlatformClient,
  query: { tag: string; vaultId: string },
): Promise<TagLookup> {
  const url = `${routeUrl(platform, "base/tag/resolve")}?tagString=${encodeURIComponent(query.tag)}&vault=${encodeURIComponent(query.vaultId)}`;
  const answer = expectStatus(await request(platform, "GET", url), "GET", [200]);
  const body = answer.json;
  if (body?.status === "resolved" && typeof body.targetEntity === "string" && typeof body.tagHandle === "string")
    return { status: "resolved", record: body.targetEntity, tagHandle: body.tagHandle };
  if (body?.status === "miss") return { status: "miss" };
  // Neither of the two answers the route gives. ⛔ Not read as a miss: a miss means "free".
  throw new Error(`GET ${url} answered 200 with neither a hit nor a miss: ${answer.text.slice(0, 200)}`);
}

export type TagResolution =
  | { status: "resolved"; record: string; tagHandle: string; tag: string; vaultName: string; vaultId: string; form: "full" | "short" }
  | { status: "miss"; tag: string; vaultName: string; vaultId: string; form: "full" | "short" }
  /** The text is not a tag in this context. */
  | { status: "refused"; reason: TagRefusal }
  /** The text is a tag, and its vault name is not one the caller listed. Nothing was asked. */
  | { status: "unknown-vault"; tag: string; vaultName: string };

/** Resolve typed text. The full form resolves anywhere; the short form only inside the holder's
 *  own vault (`context.ownVaultName` set). */
export async function resolveTag(
  platform: PlatformClient,
  grammar: TagGrammar,
  input: { text: string; vaults: readonly NamedVault[]; context: TagContext },
): Promise<TagResolution> {
  const parsed = parseTag(input.text, grammar, input.context);
  if (!parsed.ok) return { status: "refused", reason: parsed.reason };
  const matches = input.vaults.filter((v) => v.vaultName === parsed.vaultName);
  if (matches.length === 0) return { status: "unknown-vault", tag: parsed.tag, vaultName: parsed.vaultName };
  if (new Set(matches.map((v) => v.vaultId)).size > 1)
    // Vault names are unique per server. Two ids under one name means the caller's list is
    // wrong, and picking one would resolve in a vault nobody chose.
    throw new Error(`the vault list names ${JSON.stringify(parsed.vaultName)} for more than one vault id`);
  const vaultId = matches[0]!.vaultId;
  const hit = await lookupTagString(platform, { tag: parsed.tag, vaultId });
  const where = { tag: parsed.tag, vaultName: parsed.vaultName, vaultId, form: parsed.form };
  return hit.status === "resolved" ? { ...hit, ...where } : { status: "miss", ...where };
}
