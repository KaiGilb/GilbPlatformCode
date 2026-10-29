// Full relation document read — edge pane.
// GET /base/r/:id is DPoP-mandatory (same gate as GET /base/e/:id). A plain Bearer
// resolves to anonymous → C2b 404 non-disclosure. Never treat that 404 as "no relation".

import { BASE_RELATION_URL } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { NotSignedInError, dpopReadAuth, invalidateDpop } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { typeCurieFromJsonLd } from "@kaigilb/gilbplatformcode-type-curie";
import { uriTail } from "./relations";

export interface RelationDoc {
  id: string;
  uri: string;
  typeCurie: string | null;
  sourceUri: string | null;
  targetUri: string | null;
  /** Vault-side extras keyed as stored (a:status, a:location, a:occurredAt, …). */
  extras: Record<string, unknown>;
  /**
   * Every role of the relation OTHER than `role:source`/`role:target`, keyed as read (`role:<name>`), each value an
   * absolute `{ "@id" }` (or an array of them). A rewrite of the relation carries these over (`relationHeldFacts.ts`). Absent = none.
   */
  otherRoles?: Record<string, unknown>;
}

/**
 * The absolute prefix the served `@context` binds to `base:`, derived from the document's own
 * `@id` — `https://<vault>/base/r/<id>` ⇒ `https://<vault>/base/`.
 *
 * ⚠ Derived, ⛔ never guessed and ⛔ never `baseOrigin`. The document root carries the exact
 * request URI by contract (Base `src/jsonld/frame.ts` forces `compacted["@id"] = entity`), so
 * this is the vault's own word for its own namespace. A root that does not match this shape
 * yields `null` and no expansion is attempted.
 */
function vaultBaseFromDocId(docId: unknown): string | null {
  if (typeof docId !== "string") return null;
  const m = /^(https?:\/\/[^/]+\/base)\/[er]\/[^/?#]+$/.exec(docId);
  return m ? `${m[1]}/` : null;
}

/**
 * The absolute URI a role value names.
 *
 * 🔴 EXPANDS THE `base:` CURIE. `GET /base/r/:id` returns member refs COMPACTED against
 * the vault's own `@context` (`{"@id": "base:e/ann-…"}`) — correct JSON-LD, and this client
 * was reading the raw string as if it were a URI. Measured consequence, with the shipped
 * `memberEntityUri`:
 *
 *     read       base:e/ann-06g1nt2pd5v131v2rzf3knf2kc
 *     wouldWrite https://ann.example.test/base/e/base:e/ann-06g1nt2pd5v131v2rzf3knf2kc
 *
 * — a member address that exists at no host, matched by exact string equality on every read
 * path, i.e. permanently unreachable. That is the same corruption `resolveMemberEntityUri`'s
 * own note records as having already hit 2 of 9 relations on 2026-08-01.
 *
 * ⚠ WHY THE FIX IS HERE AND NOT ON THE SERVER. The server's response is CORRECT: `base:e/…`
 * against the document's declared `@context` expands to the absolute URI, and the response
 * shape is pinned (the root `@id` gate + one `jsonld.compact` pass). The consumer that never
 * expands is the defective party, and that consumer is this file. ⛔ A pinned response contract
 * is not this lane's to change.
 *
 * ⚠ SCOPE, stated so it is not mistaken for more: this closes the compaction ONLY on the
 * relation-document read. `relations.memberUrisFromRelationDoc` — the graph's own consumer of
 * the same document — still returns the compacted string, and still drops a cross-vault far
 * member to an "unreadable" pendant because of it. That is a different consumer on a different
 * surface and it stays CARRIED, named, not silently half-fixed here.
 */
function idOf(v: unknown, vaultBase: string | null = null): string | null {
  const resolve = (s: string): string | null => {
    if (s.startsWith("http") || s.startsWith("urn:")) return s;
    if (vaultBase && s.startsWith("base:")) return `${vaultBase}${s.slice("base:".length)}`;
    return null;
  };
  if (typeof v === "string") return resolve(v);
  if (v && typeof v === "object" && "@id" in v) {
    const id = (v as { "@id": unknown })["@id"];
    return typeof id === "string" ? resolve(id) : null;
  }
  return null;
}

function firstValue(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

function roleUri(
  doc: Record<string, unknown>,
  vaultBase: string | null,
  ...keys: string[]
): string | null {
  for (const k of keys) {
    const id = idOf(firstValue(doc[k]), vaultBase);
    if (id) return id;
  }
  return null;
}

export function relationDocFromJson(id: string, doc: Record<string, unknown>): RelationDoc {
  const extras: Record<string, unknown> = {};
  const otherRoles: Record<string, unknown> = {};
  const vaultBase = vaultBaseFromDocId(doc["@id"]);
  for (const [k, v] of Object.entries(doc)) {
    if (k === "role:source" || k === "role:target") continue;
    if (k.startsWith("role:")) {
      const refs = (Array.isArray(v) ? v : [v]).map((x) => idOf(x, vaultBase));
      // A role this reader cannot resolve to an address is kept as read, so a rewrite never silently drops it.
      otherRoles[k] = refs.every((r) => r) ? (refs.length === 1 ? { "@id": refs[0] } : refs.map((r) => ({ "@id": r }))) : v;
      continue;
    }
    if (k.startsWith("@")) continue;
    if (k === "source" || k === "target" || k === "member") continue;
    extras[k] = v;
  }
  return {
    id,
    uri: typeof doc["@id"] === "string" ? doc["@id"] : BASE_RELATION_URL(id),
    typeCurie: typeCurieFromJsonLd(doc["@type"] ?? doc.type),
    sourceUri: roleUri(doc, vaultBase, "role:source", "source"),
    targetUri: roleUri(doc, vaultBase, "role:target", "target"),
    extras,
    ...(Object.keys(otherRoles).length > 0 ? { otherRoles } : {}),
  };
}

async function getRelationJson(url: string): Promise<{ status: number; json: Record<string, unknown> | null; detail: string }> {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { ...(await dpopReadAuth("GET", url)), accept: "application/json" },
  });
  if (res.status === 404 || res.status === 401) {
    const detail = await res.text().catch(() => "");
    return { status: res.status, json: null, detail };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`relation read failed: ${res.status} ${detail}`.trim());
  }
  return { status: res.status, json: (await res.json()) as Record<string, unknown>, detail: "" };
}

/**
 * Read a relation's full document, **at the vault that holds it**.
 *
 * 🔴 THE DOOR. This function used to call `BASE_RELATION_URL(id)` with no second
 * argument, so `vaultOriginOf(null)` re-addressed every relation at `baseOrigin` — the apex.
 * Base resolves an id at the host the request NAMED and at no other
 * (`resolveEntityUriById`, the owner's 2026-07-19 ruling 3P.C.EveryEntityInNamedVault.Base), so a
 * vault-hosted relation 404s there and the pane reported *"Could not read this connection from
 * the vault"* for a connection the vault holds perfectly well (production, 2026-08-20).
 *
 * ⚠ ITS OWN TWIN IS THE PROOF, and it is in the same repo on the same route:
 * `relationPredicates.readRelationType` issues the IDENTICAL `GET /base/r/<id>` with the
 * IDENTICAL `dpopReadAuth`, differing ONLY in that it passes the relation URI as `at`. the owner's
 * edges render their verbs (`connected-to`, `assigned-to`) in the same browser, in the same
 * second, for the same relation ids. ⇒ the route, the credential and the grant were never in
 * question; only the address was. ⛔ Do not "restore" the one-argument form.
 *
 * @param relationIdOrUri the relation's own fully-qualified URI (preferred — it IS the
 *   address), or a bare opaque tail.
 * @param at the vault to ask when only a tail is held — e.g. the vault the shell is reading.
 *   `null`/omitted with a bare tail falls back to {@link baseOrigin}, the earlier reach,
 *   which is correct only for a single-host dev rig.
 */
export async function readRelationDoc(
  relationIdOrUri: string,
  at?: string | null,
): Promise<RelationDoc | null> {
  const id = uriTail(relationIdOrUri);
  // Same shape as `endRelation` (relationWrite.ts): the entity's OWN URI wins, and the named
  // vault is the fallback — either is an address the vault itself gave us, never a guess.
  const url = BASE_RELATION_URL(id, relationIdOrUri.includes("://") ? relationIdOrUri : at ?? null);
  let result = await getRelationJson(url);
  if (result.status === 401) {
    invalidateDpop();
    result = await getRelationJson(url);
    if (result.status === 401) throw new NotSignedInError();
  }
  if (result.status === 404 || !result.json) return null;
  return relationDocFromJson(id, result.json);
}
