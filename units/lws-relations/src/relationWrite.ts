// Relation write client.
// CREATE and UPDATE both PUT /base/r/:id — the recorded relation door on Base
// (`src/routes/relation.ts`). AfterWrite `syncRelationMembers` fills `relation_members`,
// which `readRelations` (GET /base/e/:id/relations) returns as `/base/r/<id>` edges.
//
// As of 2026-09-01, POST `/lws/vault/<VAULT>/c` minted a
// `/base/e/<id>` CapableOf entity (Base `lwsCreate` → `baseEntityUri`). That is a node,
// not a line. ⛔ W-MINT is mint an entity. ⛔ W-LINK is a `{ "@id" }` fact on a record.
// ⛔ Do not invent a Lookup row. PUT `/base/r/:id` requires an id in the path — that is
// the upsert contract, ⛔ not a computed field-fill of content. No `/base/r/` mint
// Location exists on Base (only PUT `/:id` and POST `/:id/end`).
//
// CREATE body `type` is the CURIE `t:<Type>` ingest accepts. FIND `?type=`
// stays bare. Pair after CREATE: `readRelations` of the source (the graph's find).
//
// Multi-vault (2026-07-28): MUST name the viewed vault. Defaulting to baseOrigin/kaizen made
// creates land in https://kaizen.example.test/base and 403 for authors who only
// hold write on their person vault.

import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { BASE_RELATION_URL, recordDoor } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { GENERIC_PREDICATE_CURIE, RELATION_CATEGORY_CURIE } from "./relationPredicates";
import { liveIsOfferable, readUserLinkPlaneCatalog } from "./linkPlaneCatalog";
import { boundAwait, BoundTimeoutError, isBoundTimeout } from "./boundAwait";
import * as dpopModule from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { NotSignedInError, bearerHeaderFor, tokenManager } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { readRelationDoc } from "./relationDoc";
import { readRelations, uriTail } from "./relations";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { inheritFolderPublic } from "./folderPublic";
import { mintRelationId } from "./relationId";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { typeLocalName } from "@kaigilb/gilbplatformcode-lws-vault-sets";

export interface WriteRelationInput {
  /** Source record opaque id or full entity URI. */
  sourceId: string;
  /** Target record opaque id or full entity URI. */
  targetId: string;
  /**
   * Relation type CURIE — the relation's `@type`, which IS the predicate .
   *
   * ⚠ Omitting it no longer writes the `t:Relation` CATEGORY term. It falls back to the
   * adjudicated generic predicate `t:ConnectedTo` — see GENERIC_PREDICATE_CURIE for the
   * measurement that forced this. `t:Relation` names the category whose members are the six
   * base relations; stamping it on an edge is a plane confusion and renders unlabelled.
   */
  typeCurie?: string;
  /** Optional explicit relation id or URI. Omitted → W-MINT (server mints). Known id → PUT update,
   *  unless `asCreate` says this id is a CREATE (a client id, including a retry of a timed-out write). */
  relationId?: string;
  /**
   * With `relationId`, CREATE under that id. The reverse lookup and, for `t:PartOf`, folder-public
   * inheritance still run. Without this flag a `relationId` is an UPDATE of a stored relation.
   */
  asCreate?: boolean;
  /**
   * Viewed vault namespace (`ReachableVault.vaultId`, e.g. https://ben.example.test/base).
   * Required for multi-vault: Base stamps the new relation into this vault under write authz.
   */
  vaultNamespace?: string | null;
  /** Prefer framed @id for source when known (avoids wrong-host example.test/kaizen mint). */
  sourceEntityUri?: string | null;
  /** Prefer framed @id for target when known. */
  targetEntityUri?: string | null;
  /** Vault-side steered facts on the relation itself (status, location, occurredAt). */
  extraFacts?: Record<string, unknown>;
  /** Datom valid-from — when this assertion holds. */
  validFrom?: string;
  /**
   * Role fact keys for the two members, used IN PLACE of `role:source` and `role:target`.
   * Omitted: those two keys, and the type is checked against the user-plane link catalogue.
   * Set: the given type is checked against the master (the term exists and is a relation),
   * because a relation such as `t:StakeholderOf` is not on the link plane on purpose.
   * The two role keys are never written beside `role:source` / `role:target`.
   */
  roles?: { source: string; target: string };
  /**
   * Called once, after the write headers exist and immediately before `fetch`.
   * A timeout before this is a request that never left the browser.
   */
  onSent?: () => void;
  /**
   * Set when the caller's own bound has already fired. Checked immediately before
   * `fetch`: an abandoned write does not send and does not call `onSent`.
   */
  signal?: AbortSignal;
}

/**
 * Member entity URI for a relation role value.
 * Prefer full framed @id; else compose from the viewed vault namespace; last resort baseOrigin
 * (dev single-host only — wrong under apex multi-vault).
 */
export function memberEntityUri(
  idOrUri: string,
  preferredUri?: string | null,
  vaultNamespace?: string | null,
): string {
  if (preferredUri?.startsWith("http://") || preferredUri?.startsWith("https://")) {
    return preferredUri;
  }
  if (idOrUri.startsWith("http://") || idOrUri.startsWith("https://")) return idOrUri;
  if (vaultNamespace) {
    const base = vaultNamespace.replace(/\/$/, "");
    // namespace https://ben.example.test/base → entity https://ben.example.test/base/e/<id>
    // Note: some vaults store entities under ownerHost (kaizen) while vault_id is the person
    // namespace — callers should pass preferredUri from the list/hydrate frame when present.
    return `${base}/e/${idOrUri}`;
  }
  return `${baseOrigin()}/base/e/${idOrUri}`;
}

function termLocalName(value: unknown): string {
  if (typeof value === "string") return typeLocalName(value);
  if (value && typeof value === "object" && "@id" in value) return typeLocalName(String((value as { "@id": unknown })["@id"] ?? ""));
  return "";
}

function termIsRelation(doc: Record<string, unknown>): boolean {
  const kind = doc["a:nodeKind"] ?? doc.nodeKind;
  if (kind === "relation") return true;
  const predicate = doc["a:isRelationPredicate"] ?? doc.isRelationPredicate;
  if (predicate === true || predicate === "true") return true;
  const types = Array.isArray(doc["@type"]) ? doc["@type"] : [doc["@type"]];
  if (types.some((t) => termLocalName(t) === "Relation")) return true;
  const parent = termLocalName(doc["a:subTypeOf"] ?? doc.subTypeOf);
  return parent === "Relation" || parent === "ConnectedTo";
}

function subTypeUri(doc: Record<string, unknown>): string | null {
  const sub = doc["a:subTypeOf"] ?? doc.subTypeOf;
  if (typeof sub === "string" && /^https?:\/\//.test(sub)) return sub;
  if (sub && typeof sub === "object" && typeof (sub as { "@id"?: unknown })["@id"] === "string") {
    const id = (sub as { "@id": string })["@id"];
    return /^https?:\/\//.test(id) ? id : null;
  }
  return null;
}

/**
 * The type names a relation on the master: the term document exists, and it (or a parent,
 * at most eight hops) is a relation. Used only when the caller names role keys, so a
 * type that is not on the user link plane can still be written. One hop is not enough:
 * `t:StakeholderOf` may be a relation only by being a kind of an intermediate type.
 */
async function assertMasterRelation(typeCurie: string): Promise<void> {
  const bare = typeLocalName(typeCurie);
  let url = `${termOrigin().replace(/\/$/, "")}/base/t/${encodeURIComponent(bare)}`;
  const seen = new Set<string>();
  for (let hop = 0; hop < 8; hop++) {
    if (seen.has(url)) break;
    seen.add(url);
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Refusing to write ${typeCurie}: the master did not serve that term (${res.status}).`);
    }
    const doc = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!doc || typeof doc !== "object") break;
    if (termIsRelation(doc)) return;
    const next = subTypeUri(doc);
    if (!next) break;
    url = next;
  }
  throw new Error(`Refusing to write ${typeCurie}: the master term is not a relation.`);
}

/**
 * Write a reified binary relation source→target on Base.
 *
 * CREATE (no `relationId`): PUT `/base/r/:id` — the recorded relation CREATE door.
 * Path id is the upsert contract. ⛔ Not POST `/lws/vault/<VAULT>/c` (that mints `/base/e/`,
 * which `readRelations` cannot return as an edge). Pair: `readRelations` of the source.
 *
 * UPDATE (known `relationId`): PUT `/base/r/:id` at the stored URI.
 *
 * Uses DPoP write auth (same as record replace) so first-party SPA can write.
 */
export async function writePairRelation(
  input: WriteRelationInput,
): Promise<{ id: string; changed: boolean; uri?: string | null; notMadePublic?: string[]; relations?: RecordRelation[] }> {
  // 🔴 A CATEGORY term is not a predicate. Writing `t:Relation` as an edge's `@type` is what
  // produced the owner's unlabelled edges on 2026-08-02: the write succeeded, the store was correct,
  // and the edge could not be labelled because no verb exists for a category. Refuse it at the
  // one door every relation write passes through, rather than trusting five call sites. This
  // does not narrow what may be written — `t:Relation` was never a legitimate predicate.
  if (input.typeCurie === RELATION_CATEGORY_CURIE) {
    throw new Error(
      `Refusing to write ${RELATION_CATEGORY_CURIE} as a relation predicate: it is the ` +
        `category of predicates, not one of them. Use ${GENERIC_PREDICATE_CURIE} for a ` +
        `generic link.`,
    );
  }
  // Refuse-board + live user-plane gate. A typed washed / easy-to-use /
  // speaks / wrecked (or any CURIE not on the live a:linkPlane=user set) must not
  // create a join. Cold catalog does not widen the door: only a live hit writes.
  // A caller that names `roles` is not a link-plane join: the type is checked on the
  // master instead, and omitting the type must not fall through to t:ConnectedTo.
  if (input.roles && !input.typeCurie) {
    throw new Error("A relation that names its roles must also name its type.");
  }
  const typeCurie = input.typeCurie ?? GENERIC_PREDICATE_CURIE;
  if (input.roles) {
    await assertMasterRelation(typeCurie);
  } else if (!liveIsOfferable(typeCurie)) {
    const cat = await readUserLinkPlaneCatalog();
    if (!cat.terms.some((t) => t.curie === typeCurie)) {
      throw new Error(
        `Refusing to write ${typeCurie} as a relation predicate: it is not a live ` +
          `user-plane join (a:linkPlane=user). Degree-verbs and happenings are not joins.`,
      );
    }
  }
  const source = memberEntityUri(input.sourceId, input.sourceEntityUri, input.vaultNamespace);
  const target = memberEntityUri(input.targetId, input.targetEntityUri, input.vaultNamespace);
  const sourceRole = input.roles?.source ?? "role:source";
  const targetRole = input.roles?.target ?? "role:target";
  const facts: Record<string, unknown> = {
    [sourceRole]: { "@id": source },
    [targetRole]: { "@id": target },
    ...(input.extraFacts ?? {}),
  };

  // A known id with no `asCreate` is an UPDATE: no reverse lookup, no folder-public inheritance.
  // A CREATE — minted here, or a client id for a retry — shares one function below.
  if (input.relationId && !input.asCreate) {
    return putKnownRelation(input, typeCurie, facts);
  }
  return createPairRelation(input, typeCurie, facts);
}

/** The part-of predicate a virtual-folder link is written with ("into a folder"). */
const FOLDER_LINK_CURIE = "t:PartOf";

/**
 * The same 10 s bound as a DPoP proof (`dpopBoundMs`). Vitest throws if a test replaces
 * `./dpop` and leaves the export off; that case still waits 10 s, which is the bound.
 */
function signingInBoundMs(): number {
  try {
    const read = dpopModule.dpopBoundMs;
    if (typeof read === "function") return read();
  } catch {
    // The mock has no dpopBoundMs. The product bound is 10 s.
  }
  return 10_000;
}

/**
 * PUT `/base/r/:id` — CREATE (path id from mintRelationId) and UPDATE (stored id).
 * AfterWrite on Base syncs `relation_members`. Graph reads those as edges.
 */
async function putKnownRelation(
  input: WriteRelationInput,
  typeCurie: string,
  facts: Record<string, unknown>,
): Promise<{ id: string; changed: boolean; uri?: string | null }> {
  // 🔴 ALWAYS A TAIL in the path. A full URI in the PATH composed
  // `…/base/r/https://…/base/r/<id>` — a write to nowhere. Tailing here is what lets a
  // caller pass the relation's OWN URI, which is the only way an existing relation is
  // updated at the vault that actually holds it.
  const id = uriTail(input.relationId!);
  const url = BASE_RELATION_URL(id, input.relationId?.includes("://") ? input.relationId : (input.vaultNamespace ?? null));
  // The bridge mint sits before `onSent`. The same 10 s bound as a DPoP proof, so a stuck
  // sign-in ends here and never reaches `fetch`.
  const session = await boundAwait(tokenManager.getSession().catch(() => null), signingInBoundMs(), "signing in");
  const agent = session?.principal ?? `${baseOrigin()}/base/e/anonymous`;
  const body: Record<string, unknown> = {
    type: typeCurie,
    agent,
    facts,
  };
  if (input.validFrom?.trim()) body.valid_from = input.validFrom.trim();
  if (input.vaultNamespace?.trim()) {
    body.vault = input.vaultNamespace.trim();
  }
  let headers: Record<string, string>;
  try {
    headers = {
      ...(await dpopModule.dpopWriteAuth("PUT", url)),
      "content-type": "application/json",
      accept: "application/json",
    };
  } catch (e) {
    // A timed-out proof never fell through to a second wait. A refused proof still may use the bearer floor.
    if (isBoundTimeout(e)) throw e;
    headers = {
      ...(await bearerHeaderFor(url, "PUT")),
      "content-type": "application/json",
      accept: "application/json",
    };
  }
  // After the proof exists, and only if the caller has not already given up. A bound that
  // fired while the session or the proof was in flight must not send, and must not call onSent.
  if (input.signal?.aborted) throw new BoundTimeoutError("writing the link");
  input.onSent?.();
  const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
  if (res.status === 401) {
    dpopModule.invalidateDpop();
    tokenManager.invalidate();
    throw new NotSignedInError();
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`relation write failed: ${res.status} ${detail}`.trim());
  }
  const json = (await res.json().catch(() => ({}))) as { changed?: boolean; entity?: unknown };
  // The relation's OWN URI as the vault issued it (the write answer's `entity`),
  // so a caller never has to re-list a folder to find the link it just made.
  const uri = typeof json.entity === "string" && json.entity !== "" ? json.entity : null;
  return { id, changed: !!json.changed || res.status === 201, uri };
}

/**
 * CREATE — PUT `/base/r/:id` (same door as UPDATE). Path id is a client id (`asCreate`) or a
 * fresh mint. Pair: `readRelations` of the source. For `t:PartOf`, folder-public inheritance.
 * One function for both, so the folder-public block is not copied.
 * ⛔ Not POST `/c`. ⛔ F-LIVE of CapableOf as records is the entity plane, not this edge.
 */
async function createPairRelation(
  input: WriteRelationInput,
  typeCurie: string,
  facts: Record<string, unknown>,
): Promise<{ id: string; changed: boolean; uri?: string | null; notMadePublic?: string[]; relations?: RecordRelation[] }> {
  const vault = input.vaultNamespace?.trim();
  if (!vault) {
    throw new Error("Relation mint names the vault. No vault was given.");
  }
  const id = input.relationId ? uriTail(input.relationId) : mintRelationId();
  const result = await putKnownRelation({ ...input, relationId: id }, typeCurie, facts);
  // Graph reverse-lookup. GET /base/e/:id/relations returns `/base/r/<id>` after
  // syncRelationMembers on the PUT. A miss here is a miss, ⛔ not a painted line.
  // The rows are returned so a create-surface heal can use this read and not ask again.
  const relations = await readRelations(uriTail(input.sourceId), input.sourceEntityUri ?? vault);
  if (typeCurie !== FOLDER_LINK_CURIE) return { ...result, relations };
  // 🔴 The ONE door every folder link passes through, so an item linked INTO a public folder
  // becomes public here, whichever of the call sites linked it (2026-09-26). Measured M1:
  // two members linked after the folder went public were never granted. ⛔ Never thrown — the link
  // itself landed; what was not made public is RETURNED for the caller to say out loud.
  const notMadePublic = await inheritFolderPublic({
    folderId: input.targetId,
    folderDoor: recordDoor(input.targetEntityUri, input.vaultNamespace),
    memberId: input.sourceId,
    relationId: uriTail(result.id),
    relationUri: result.uri ?? null,
    memberEntityUri: input.sourceEntityUri ?? null,
    vaultNamespace: input.vaultNamespace,
  });
  return { ...result, notMadePublic, relations };
}

/**
 * The connection outlived its own ending — thrown so the read-back finding cannot be
 * swallowed by the same `catch` that tolerates a read-back which merely failed to run.
 */
export class RelationSurvivedEndError extends Error {
  override name = "RelationSurvivedEndError";
}

/** What the vault reports it did, plus what a read-back of the store then showed. */
export interface EndRelationResult {
  /** The relation URI the VAULT SAYS it acted on — the server's own answer, not ours. */
  relation: string | null;
  /** The vault's `changed` flag: true on a real ending, false on the idempotent replay. */
  changed: boolean;
  /**
   * Did a read-back of the store CONFIRM the members are gone?
   * `true` confirmed · `false` never returned (a surviving connection THROWS instead) ·
   * `null` the read-back itself could not run, so nothing is claimed either way.
   */
  verified: boolean | null;
}

/** Host of a vault namespace / entity URI, or null when it is not a URL. */
export function hostOfUri(uri: string | null | undefined): string | null {
  if (!uri?.trim()) return null;
  try {
    return new URL(uri.trim()).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * END a reified relation: the connection held, and no longer holds (e.g. un-link an item
 * from a virtual folder, or `End relation` on the edge pane).
 *
 * ── 🔴 WHY THIS IS A POST TO `/end` AND NOT A PUT — DEF-6, measured 2026-08-16 ────────────
 * This function used to `PUT {type, agent, facts:{}}` at `/base/r/:id`, with NO `pod` field.
 * That is the wrong door, and the wrongness is INVISIBLE from the response:
 *
 *   • `PUT /base/r/:id` is an UPSERT AT AN EXPLICIT URL. Base resolves the create-scope vault
 *     from the body's `pod`, and with none supplied falls back to `writeTargetVaultForRequirer`
 *     — THE PRINCIPAL'S OWN VAULT — then MINTS the relation URI under that vault's host
 *     (`relationUri(vaultMintHost(createScopeVault), id)`, Base `src/routes/relation.ts`).
 *   • So the id tail was resolved against a vault NOBODY CHOSE. On production the signed-in
 *     principal lives in BaseID, so the write minted a BRAND NEW entity
 *     `https://id.example.test/base/r/<id>` — a SYSTEM vault — while the relation being ended sat
 *     untouched at `https://admin.example.test/base/r/<id>`.
 *   • The write genuinely CREATED something, so Base honestly answered `201 changed:true`.
 *     The person saw success; the connection was still there. Measured first-hand in the
 *     production store `base` on M1, 2026-08-16: the admin relation still carried live
 *     `role:source` + `role:target` (op=1, tx_to IS NULL) and two `base.relation_members`
 *     rows, while a new `id.example.test` entity held exactly one live fact, `a:relationSelf`.
 *
 * ⚠ THE `201` WAS NOT A LIE ABOUT ITS OWN WRITE — it was a true answer to a different
 * question. That is precisely [[Rule_Code_base-evidence#RuleBaseevidStateRowNotExistence]]:
 * a status code is a RESPONSE, never evidence of the state change you wanted.
 *
 * ── The door that performs the act ────────────────────────────────────────────────────────
 * Base ships `POST /base/r/:id/end` for exactly this (the typing gate BVGATE_01
 * ruling 2026-08-02 §5). It differs from the PUT in the two ways that matter here:
 *
 *   1. It RESOLVES its subject instead of constructing it — `resolveEntityUriById` widens by
 *      id tail across vault hosts, so the relation is found where it actually lives.
 *   2. It performs the four invariants server-side and atomically: preserve the stored
 *      `@type` · assert `a:relationLifecycleState = "ended"` · omit every `role:` fact so
 *      ingest closes each with a `valid_to` · re-derive `base.relation_members` in the same
 *      transaction. A client-composed full-state PUT can violate all four silently, and this
 *      client violated two of them.
 *
 * The body is IGNORED by the route by design — the predicate is read from the store and the
 * agent is the resolved principal. So this client sends NO type and NO agent, which is the
 * strongest possible form of BVGATE_03 §F2 ("`deleteRelation` must not CHOOSE the `@type`"):
 * it cannot choose what it does not send.
 *
 * ⚠ MEASURED WIRE TRAP — send NO `content-type`. Fastify rejects an EMPTY body carrying
 * `content-type: application/json` with `400 "Body cannot be empty when content-type is set
 * to 'application/json'"` BEFORE routing (measured against production 2026-08-16). A 400 here
 * would look like a route problem and is not one.
 *
 * ── Reporting the STORED outcome, never the response ─────────────────────────────────────
 * Two guards, because a `2xx` alone is what produced DEF-6:
 *
 *   (1) THE ACT MUST HAVE LANDED ON THE CONNECTION WE NAMED. The route returns the URI it
 *       acted on. When the caller knows which vault the connection lives in, a mismatch is
 *       REFUSED and named. This also covers the residue DEF-6 left behind: where a stray
 *       twin bears the same id tail under another host AND is itself live, the resolver's
 *       liveness preference cannot discriminate and may return the wrong bearer.
 *   (2) THE STORE MUST AGREE. A read-back that still frames role members means the
 *       connection survived — report FAILURE, whatever the status code said.
 *
 * ⛔ Neither guard makes the act broader or more likely to fire. Both can only turn a
 * reported success into a reported failure; nothing here deletes more, or anything else.
 *
 * @param relationIdOrUri the relation's opaque id, or its full `/base/r/<id>` URI
 * @param vaultNamespace the vault the connection is expected to live in
 *   (`ReachableVault.vaultId`); when known it is CHECKED against the act's own reported subject
 * @returns what the vault reported and what the read-back confirmed
 * @throws NotSignedInError on 401
 * @throws Error when the act landed on a different vault, or the connection survived it
 */
export async function endRelation(
  relationIdOrUri: string,
  vaultNamespace?: string | null,
): Promise<EndRelationResult> {
  const id = uriTail(relationIdOrUri);
  if (!id) throw new Error("Missing relation id");
  // Address the ENDING at the relation's own origin. The caller passes the full URI on
  // every graph path, and `vaultNamespace` names the vault when it does not: either is an address
  // the vault itself gave us. This is what makes guard (1) below near-unreachable rather than
  // load-bearing — the route can no longer resolve a twin under another host, because it is
  // no longer asked about any host but the one named here.
  const url = `${BASE_RELATION_URL(id, relationIdOrUri.includes("://") ? relationIdOrUri : vaultNamespace)}/end`;
  let headers: Record<string, string>;
  try {
    headers = { ...(await dpopModule.dpopWriteAuth("POST", url)), accept: "application/json" };
  } catch (e) {
    if (isBoundTimeout(e)) throw e;
    // Bearer floor — the same fallback the sibling PUT uses; `/end` binds the same requirer.
    headers = { ...(await bearerHeaderFor(url, "POST")), accept: "application/json" };
  }
  // No body and no `content-type` — see the wire trap above.
  const res = await fetch(url, { method: "POST", headers });
  if (res.status === 401) {
    dpopModule.invalidateDpop();
    tokenManager.invalidate();
    throw new NotSignedInError();
  }
  if (res.status === 404) {
    // 🔴 `verified: true` HERE WAS A CLAIM NOBODY CHECKED, and the door fix in this
    // same lane made it reachable. A 404 on `/end` cannot tell three things apart:
    //   • there is genuinely no such relation ("nothing to end" — the old reading);
    //   • the request was addressed at a vault that does not hold it (Base now resolves
    //     an id at the host the request NAMED and at no other — so a cross-vault connection
    //     404s at the viewed vault even though it exists);
    //   • C2b non-disclosure hid it.
    // Only the first justifies "verified". Reporting it for all three turned a misaddressed
    // END into a silent success: the pane closed, `?rel=` was dropped, and the connection came
    // back on the next refresh. `null` is the honest value — the confirming read did not run —
    // and `changed: false` is what tells the caller nothing happened.
    return { relation: null, changed: false, verified: null };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Not ended: the vault refused (${res.status}). ${detail}`.trim());
  }
  const json = (await res.json().catch(() => ({}))) as { relation?: unknown; changed?: unknown };
  const relation = typeof json.relation === "string" ? json.relation : null;
  const changed = json.changed === true;

  // ── Guard (1): the act's own reported subject must be where we SENT the act ────────────
  //
  // 🔴 `wantHost` was `hostOfUri(vaultNamespace)`, and that is not the
  // address this request used. Once the act is addressed by the relation's OWN URI (which it
  // now is, so a cross-vault End reaches the vault that holds it), the two diverge by construction:
  // the POST goes to ben, ben ends it and truthfully answers with its own URI, and the
  // guard compared that against the vault the user happens to be VIEWING and threw
  // "Nothing in this vault was changed by the app" — for an act that had just succeeded.
  // Unrecoverable: every retry repeated it, and the cache was never invalidated.
  //
  // ⚠ The DEF-6 protection is UNWEAKENED, and this is in fact its exact statement: DEF-6 was
  // "we posted to one address and the vault applied it somewhere else". `url` IS the address we
  // posted to, so comparing against it catches that case directly, instead of via a proxy
  // (`vaultNamespace`) that only coincided with it while every relation lived in the viewed vault.
  // The ADDRESS the caller named: the relation's own URI when it carries one, else the vault
  // they named. ⛔ NOT `url` — with neither supplied `url` falls back to baseOrigin, and
  // comparing against a default nobody chose would fire the guard on a caller who named no
  // address at all (which `relationEnd.def6.test.ts` pins, correctly: no name, no check).
  const addressed = relationIdOrUri.includes("://") ? relationIdOrUri : vaultNamespace;
  const wantHost = hostOfUri(addressed);
  const gotHost = hostOfUri(relation);
  if (wantHost && gotHost && wantHost !== gotHost) {
    throw new Error(
      `Not ended here: the vault applied this to ${relation}, which is not in the vault this act ` +
        `was addressed to (${addressed}). Nothing there was changed by the app. Reload to see ` +
        `what the vault holds.`,
    );
  }

  // ── Guard (2): read the store back — the status code is not the outcome ────────────────
  let verified: boolean | null = null;
  try {
    // 🔴 THE DOOR, and here it made the guard answer YES unconditionally. This read-back
    // exists precisely because "the status code is not the outcome"; asked at the apex it 404s
    // for EVERY vault-hosted relation, `after` is `null`, and the guard concludes `verified =
    // true` without ever having looked at the vault. A guard that cannot fail is not a guard.
    // Addressed at the relation's own URI, falling back to the vault this end was scoped to.
    const after = await readRelationDoc(
      id,
      relationIdOrUri.includes("://") ? relationIdOrUri : vaultNamespace ?? null,
    );
    // A 404 read-back (`null`) means the address no longer frames a relation — ended.
    if (after && (after.sourceUri || after.targetUri)) {
      throw new RelationSurvivedEndError(
        `Not ended: the vault still holds this connection (${after.uri}) after reporting ` +
          `success. Nothing was removed. Reload and try again — if it persists this is a ` +
          `vault-side defect, not a display problem.`,
      );
    }
    verified = true;
  } catch (e) {
    // Only the survival finding is a failure. A read-back that could not RUN proves nothing
    // in either direction, so it is disclosed as unverified rather than reported as either.
    if (e instanceof RelationSurvivedEndError) throw e;
    if (e instanceof NotSignedInError) throw e;
    verified = null;
  }
  return { relation, changed, verified };
}
