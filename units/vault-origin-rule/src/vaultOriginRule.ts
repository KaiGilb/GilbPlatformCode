import { baseOrigin, localRigHosts, systemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { vaultSegmentOf } from "./photoSegments";

/**
 * 🔴 THE VAULT IS ON THE WIRE — CARRY IT.
 *
 * Base serves MANY vaults from one process and routes each request to a vault BY THE HOST THE
 * REQUEST NAMES. An entity's canonical URI already carries that host
 * (`https://<name>.<platform host>/base/e/<id>`), and every list, search and create response hands it
 * back — `VaultRecordRef.entityUri`, `VaultFileRef.entityUri`, `StoredFile.entityUri`,
 * `FanoutHit.entityUri`, `BaseRecord.entityUri`, a framed `@id`, a 201 `Location`.
 *
 * ⛔ What this app used to do — and what this function exists to stop — was throw that host
 * away, keep the trailing opaque id, and re-address it at {@link BASE_ORIGIN}. That asks the
 * WRONG DOOR. It only ever appeared to work because the server compensated by scanning every
 * vault for the id tail, which answered requests about vaults they had not named
 * (3P.C.EveryEntityInNamedVault.Base, 2026-07-19 — DISQUALIFYING, not a trade-off) and which
 * mis-resolved on a tail collision (a granted caller got 403 deleting
 * their OWN entity). That compensation is gone. A dereference now reaches the entity only if
 * the request names the entity's own host.
 *
 * ⛔ THE FIX IS NOT A VAULT PATH SEGMENT on a dereference route. `/lws/vault/<vaultId>/r/<id>` would
 * mint a SECOND canonical identifier for one entity and FAIL
 * 3P.C.Identity.OpaquePermanentCanonicalURI.Base. A vault segment belongs on COLLECTION routes
 * (list / create — see LWS_VAULT_* below), where the request must say which vault it means and no
 * id is present to imply it. On a dereference the vault rides where a URI already keeps it: the
 * AUTHORITY. So "carry the URI" means literally address the entity at its own origin.
 *
 * @param entityUri the entity's own fully-qualified URI, when the caller holds one
 * @returns that URI's origin when its host is one of the platform's (see platformOriginOf below);
 *   {@link BASE_ORIGIN} for any other host, and when no absolute http(s) URI was supplied
 *
 * ⚠ The `BASE_ORIGIN` fallback is for the genuinely id-only paths (a `?rec=` deep link, a
 * localStorage cache key) and for dev, where every vault is served on the one origin. It is NOT
 * a licence to omit the URI: pass `null` explicitly and greppably when you do not have one,
 * so a caller that COULD have carried it is visible instead of silently defaulting.
 */
export function vaultOriginOf(entityUri: string | null | undefined): string {
  if (!entityUri) return baseOrigin();
  try {
    const u = new URL(entityUri);
    if (u.protocol !== "https:" && u.protocol !== "http:") return baseOrigin();
    // ⚠ SAME HOST -> BASE_ORIGIN VERBATIM, so the SCHEME is never flipped.
    // Base mints vault and entity URIs as `https://…` even on a dev rig served over plain
    // a local rig origin. Returning `u.origin` there would re-address every collection
    // read at the rig's `https://` form — a port that is not listening for TLS — and dev would
    // fail whole, with a scheme error that reads nothing like its cause. The authority is the
    // routing fact this function exists to recover; when the authority is already the one we
    // are talking to, the configured origin is the truthful answer and the URI's scheme is a
    // minting artefact, not a routing instruction.
    const base = new URL(baseOrigin());
    if (u.host === base.host) return baseOrigin();
    return platformOriginOf(u, base) ?? systemOriginOf(u) ?? baseOrigin();
  } catch {
    return baseOrigin();
  }
}

/**
 * A whole URL that DATA names (a term's store entity, an entity's history, a mediated photo
 * address), re-addressed by {@link vaultOriginOf}: kept at its own origin when that is one of the
 * platform's hosts, else moved to BASE_ORIGIN, path and query unchanged (Delta10 B1).
 *
 * For a credentialed fetch whose URL arrives whole from data instead of from a builder below.
 * One rule for both, never a second host check beside it.
 *
 * ⚠ The URL is RESOLVED against BASE_ORIGIN first, as the browser's fetch would resolve it against the
 * page: a protocol-relative (`//evil.example/…`), backslashed or space-led URL that `new URL(url)` alone
 * cannot read was once passed on raw, and the browser sent it, credential and all, to the host it named.
 *
 * @param url a URL from data; a non-http(s) scheme is returned as given (it reaches no vault)
 */
export function atVaultOrigin(url: string): string {
  let u: URL;
  try {
    u = new URL(url, baseOrigin());
  } catch {
    return baseOrigin();
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return url;
  return `${vaultOriginOf(u.href)}${u.pathname}${u.search}`;
}

/**
 * 🔴 THE ONE PLATFORM-HOST RULE — which hosts may receive this app's credentials (decision 2026-10-15).
 *
 * Every vault call carries the user's token (a DPoP proof or a Bearer), and its host comes from
 * {@link vaultOriginOf} (a config.ts builder) or {@link atVaultOrigin} (a whole URL from data: the ontology
 * read and PUT, the datom log, the entity history, the mediated photo, every gilb-stakeholders request
 * through `platformFetch`), which read it from a URI the DATA names. Without this rule a fact or a
 * served `@id` naming `evil.example`, `<platform host>.evil.example`, `<name>.<platform host>@evil.example`, a
 * foreign port, plain http or `169.254.169.254` received the token (measured at 9dea5f1).
 *
 * The platform's hosts are BASE_ORIGIN's host and its subdomains — label by label, never a
 * substring, prefix or suffix test on text — over https on the default port. Anything else gets
 * `null`, and {@link vaultOriginOf} asks the apex instead, as it did before Delta9 F4, except a system
 * vault host, which is asked at its own origin and without a credential (s7 walk fix F-3,
 * {@link systemOriginOf}, {@link credentialAllowedAt}).
 * The host is read from the parsed URL, so a userinfo part (`<user>@`) never decides it.
 *
 * LOCAL RIG ONLY. On a dev rig each
 * vault mints as `https://<name>.<rig host>:<port>` while the rig serves plain http on that port,
 * so the URI's scheme fails TLS and no vault call could succeed from a browser. When BASE_ORIGIN
 * is `http://<rig host>:<port>` (a host named by `setLocalRigHosts`) and the vault host is a subdomain of it on that SAME port,
 * the rig is the server: address it over http. The URI itself is untouched (identity stays
 * `https://…`), and the DPoP htu stays `https://<host><path>` (dpop.ts `htuFor`), which is what
 * the server rebuilds. A production build (`https://` BASE_ORIGIN) never takes this branch.
 *
 * ⚠ A custom domain (a vault outside BASE_ORIGIN's host family) is not a platform host here.
 * Adding one is a platform decision; until then it is asked at the apex.
 *
 * @param u the parsed URI whose host is in question
 * @param base the parsed BASE_ORIGIN
 * @returns the origin to fetch at when `u` names a platform host, else null
 */
function platformOriginOf(u: URL, base: URL): string | null {
  if (!isSubdomainOf(u.hostname, base.hostname)) return null;
  if (base.protocol === "https:") {
    return u.protocol === "https:" && u.port === "" ? u.origin : null;
  }
  if (localRigHosts().has(base.hostname) && u.port === base.port) return `http://${u.host}`;
  return null;
}

/**
 * @param u the parsed URI whose host is in question
 * @returns the URI's own origin when it names a system vault host over https on the default port, else null
 */
function systemOriginOf(u: URL): string | null {
  return u.protocol === "https:" && u.port === "" && systemVaultHosts().has(u.hostname) ? u.origin : null;
}

/**
 * Which platform STORE answers at an origin {@link vaultOriginOf} gave. A
 * cross-vault read such as `find-by-attribute` scans the holder's whole reach in the store of the process at the host asked,
 * whatever the host; so it is asked once per store, not once per vault host. Production runs two processes with two databases
 * (Reference_Code_operating-environment-project-base-host-topology, measured 2026-09-08): the IDENTITY node serves the apex
 * (BASE_ORIGIN) and the system hosts; the USER node serves every user vault host.
 *
 * @param origin an origin as {@link vaultOriginOf} returns it
 * @returns "identity" for BASE_ORIGIN and the system hosts, "user" for every other host
 */
export function storeOfOrigin(origin: string): "identity" | "user" {
  if (origin === baseOrigin()) return "identity";
  try {
    return systemOriginOf(new URL(origin)) ? "identity" : "user";
  } catch {
    return "identity";
  }
}

/**
 * 🔴 MAY THIS URL RECEIVE THIS BUILD'S CREDENTIAL? The one credential rule (Delta10 B1, kept by s7 walk
 * fix F-3): only BASE_ORIGIN itself and the hosts {@link platformOriginOf} names as the platform's, at
 * exactly the origin it would ask them at. Everything else, a system host in a dev build included, gets
 * no `Authorization` and no DPoP proof. Every credential this app forms asks this first: the DPoP seam
 * (`dpop.ts` `DpopCredential.authHeaders`) and the Bearer seam (`bearer.ts` `bearerHeaderFor`).
 *
 * The URL is resolved against BASE_ORIGIN as {@link atVaultOrigin} resolves it, so a protocol-relative or
 * odd URL is judged by the host the browser would send it to.
 *
 * @param url the URL the request is sent to
 * @returns true only when the request may carry a credential
 */
export function credentialAllowedAt(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url, baseOrigin());
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const base = new URL(baseOrigin());
  if (u.origin === base.origin) return true;
  return platformOriginOf(u, base) === u.origin;
}

/**
 * True when `host` is `parent` with one or more labels in front, compared label by label.
 *
 * @param host a URL `hostname` (already lower-cased by the URL parser)
 * @param parent the apex hostname
 */
function isSubdomainOf(host: string, parent: string): boolean {
  const h = host.split(".");
  const p = parent.split(".");
  if (h.length <= p.length) return false;
  const tail = h.slice(h.length - p.length);
  if (!tail.every((label, i) => label === p[i])) return false;
  return h.slice(0, h.length - p.length).every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

/**
 * 🔴 THE DOOR FOR A DEREFERENCE — the entity's own URI when held, ELSE THE VAULT'S.
 *
 * {@link vaultOriginOf} recovers the authority from a URI. This says WHICH URI to hand it, and
 * it exists because getting that precedence wrong is a silent 404, not an error.
 *
 * ⛔ The premise this replaces — written in three places on the dereference path and false in
 * all three — was *"no entity URI is held here, so keep the earlier reach (`BASE_ORIGIN`)"*.
 * `BASE_ORIGIN` is not a weaker reach; on production it is **the apex**, which Base routes to
 * exactly ONE vault. So `null` did not mean "ask more broadly", it meant "ask the one vault that
 * certainly does not hold this record". Measured on M1 PRODUCTION 2026-08-21 with one real
 * an admin Bearer, same id, same process, same DB:
 *
 * | request | verdict |
 * |---|---|
 * | `GET https://<apex>/lws/r/osm-r-406091`     | **404** — what this app sent |
 * | `GET https://<place vault host>/lws/r/osm-r-406091` | **200** — the record, at its own vault |
 *
 * ⇒ every record NOT already in the viewed vault's list cache — a search hit, a ⌘K jump, a
 * `?rec=` deep link, a folder member, a relation partner — opened blank in every vault except
 * the one the apex names. A user, 2026-08-21: *"if I click any of the Oslo page goes blank"*.
 *
 * ⚠ **A `podId` IS a URI whose authority is the vault's host** (`https://<host>/base`), so
 * the vault namespace is a truthful door and needs no second primitive — the same reuse
 * `vaultHostAddressing.test.ts` already pins for the collection family.
 *
 * ⛔ It does NOT widen authorization by one row. The door decides WHICH vault is asked; that
 * vault's own `authorizeReadIds` still decides what it answers. Measured the same run: the same
 * `https://<place vault host>/lws/r/osm-r-406091` returns **404** anonymously and **404** for a
 * principal holding no grant on BaseGeo. Asking the right door is not being let in.
 *
 * @param entityUri the entity's own fully-qualified URI when the caller holds one, else null
 * @param vaultId the namespace of the vault the surface is READING (`contentScope.readVaultId`)
 * @returns the URI to address the dereference at, or null when neither is known
 */
export function recordDoor(
  entityUri: string | null | undefined,
  vaultId: string | null | undefined,
): string | null {
  return entityUri || vaultId || null;
}

/** The session->token bridge endpoint (O.7, first-party SPAs only). Cookie + CSRF
 * header in; a 1800 s /lws Bearer + the signed-in principal + vault + reachable vaults out. */
export const sessionTokenUrl = () => `${baseOrigin()}/base/auth/session/token`;

/** The session->DPoP-token bridge endpoint. Same cookie + CSRF gate as the
 * Bearer bridge, PLUS the SPA's public DPoP JWK in the JSON body; a 1800 s `cnf.jkt`-bound
 * DPoP access token out. It is the credential the multi-vault nav authorizes its cross-vault
 * reads with — one sign-in yields a sender-constrained token that reaches the DPoP-mandatory
 * `/base/*` surface a plain Bearer cannot (2S.V.CrossAppIdentityReuse: no second sign-in). */
export const sessionDpopTokenUrl = () => `${baseOrigin()}/base/auth/session/dpop-token`;

/** The DPoP-MANDATORY single-RELATION read (`GET /base/r/<id>`). Same compute-on-read handler
 * as `/base/e/<id>` (a relation is just an entity — Base `routes/read.ts`), so it likewise binds
 * `authenticatedPrincipal` (DPoP scheme only). The relation pane reads it to surface the relation's own
 * `@type` — the adjudicated predicate verb the edge label renders (typing gate). The `<id>` is the relation's opaque id tail (already names its vault). */
export const BASE_RELATION_URL = (id: string, at?: string | null) =>
  `${vaultOriginOf(at)}${vaultSegmentOf(at)}/r/${id}`;

/** The LWS resource root — the entity-dereference surface (`GET/PUT/PATCH/DELETE /lws/r/<id>`).
 * The opaque id already NAMES its vault, so this carries no vault segment (a segment here would
 * mint a second canonical identifier — 3P.C.Identity.OpaquePermanentCanonicalURI). A PUT/DELETE
 * on an existing record therefore lands in that record's OWN vault — i.e. the vault it was read
 * from — with no vault segment needed. */
export const LWS_RESOURCE_URL = (id: string, at?: string | null) =>
  `${vaultOriginOf(at)}/lws/r/${id}`;

/** The RELATIONS reverse-lookup surface — `GET /base/e/<id>/relations`.
 * The record-detail read pane reads it to show which relations a record
 * participates in. It resolves on the SAME `/base` Bearer FLOOR the record read uses (Base
 * `routes/read.ts` readReverse) and is first-party-CORS allow-listed (Base `server/cors.ts`
 * isRelaxedBasePath), so the plain O.7 bridge Bearer reaches it cross-origin. The `<id>` is
 * the opaque record id — the SAME one `/lws/r/<id>` and `/base/e/<id>` are keyed on — so no
 * vault path segment is added (the id already names its vault). */
export const BASE_ENTITY_RELATIONS_URL = (id: string, at?: string | null) =>
  `${vaultOriginOf(at)}${vaultSegmentOf(at)}/e/${id}/relations`;

/** Percent-encodes a vault NAMESPACE into one path segment. */
const vaultSeg = (vaultId: string) => encodeURIComponent(vaultId);

/** The vault-targeted RECORD-SET surface — `GET /lws/vault/<vaultId>/records?type=…`.
 * Origin is `vaultOriginOf(vaultId)`: the vaultId's authority IS the vault's host, so this
 * collection is asked of the node that holds it. The encoded path segment stays —
 * Base resolves which vault from it; the host says which node answers, not which vault. */
export const LWS_VAULT_RECORDS_URL = (vaultId: string) => `${vaultOriginOf(vaultId)}/lws/vault/${vaultSeg(vaultId)}/records`;

/**
 * F-HELD, the ROW-LESS, PER-VIEWER TYPE CENSUS of the named vault:
 * `GET /lws/vault/<vaultId>/types` ([[Template_Code_base-value-io-find#F-HELD]]). The `<CENSUS_DOOR>`
 * the Lookup row names. Same vault-origin reach as the records door. ⚠ A Base that predates the
 * door answers 404 here — that 404 IS the capability probe (`listVaultHeldTypes` → null →
 * the shipped F-CAT sweep), never a HEAD and never a body-shape probe.
 */
export const LWS_VAULT_TYPES_URL = (vaultId: string) => `${vaultOriginOf(vaultId)}/lws/vault/${vaultSeg(vaultId)}/types`;

/** The vault-targeted CREATE surface — `POST /lws/vault/<vaultId>/c`. The vault
 * NAMESPACE is an explicit PATH SEGMENT resolved by Base's ONE write resolver
 * (`resolveVaultTarget(…, "write")`), so a create lands in the NAMED (viewed) vault iff the
 * principal holds a whole-vault write grant on it — fail-closed (403 no-grant / 400 no-vault),
 * never the writer's own sign-in vault. This is a COLLECTION WRITE that MINTS the id, so it
 * carries the vault but NO trailing entity id (naming both would mint a second canonical id —
 * 3P.C.Identity.OpaquePermanentCanonicalURI). It replaces the old `POST /lws/c/<containerId>`
 * form, which resolved the writer's OWN vault and ignored the viewed vault.
 * Origin is `vaultOriginOf(vaultId)`: the vaultId's authority IS the vault's host, so the
 * create is asked of the node that holds it. The encoded path segment stays —
 * Base resolves which vault from it; the host says which node answers, not which vault. */
export const LWS_VAULT_CONTAINER_URL = (vaultId: string) => `${vaultOriginOf(vaultId)}/lws/vault/${vaultSeg(vaultId)}/c`;

/** The vault-targeted FILE-SET surface — `GET /lws/vault/<vaultId>/files`. Moved off
 * `/base/files`; it is on the same `/lws/*` Bearer floor + first-party CORS, so
 * no credential seam changed when it moved.
 * Origin is `vaultOriginOf(vaultId)`: the vaultId's authority IS the vault's host, so this
 * collection is asked of the node that holds it. The encoded path segment stays —
 * Base resolves which vault from it; the host says which node answers, not which vault. */
export const LWS_VAULT_FILES_URL = (vaultId: string) => `${vaultOriginOf(vaultId)}/lws/vault/${vaultSeg(vaultId)}/files`;

