# fake-platform: design (R5-C3a plan, approved with decisions in section 11; part 1 built in 0.1.0)

One shared test unit. An app's tests `import` it and use it in place of the live GilbPlatform. It is a
`fetch`-compatible stand-in that answers the platform's real routes with the platform's real shapes, state in memory.

Build status: parts 1 and 2 are in `src/` (rows 5 and 7-20, the DPoP check, `ROUTES`, the hooks, `seedFile`, `seedPicture`); rows 1-4 and 6 (sign-in, check-name, create-named) are the next part and answer `404 fake_platform_no_such_route` until built.

Source for every row: GilbPlatform `origin/main` at `619aca557597b1bc50dd6e1340ebc274039be9c2` (2026-11-10), read
with `git show`. Cited as `path:line`. Anything I did not read is marked UNVERIFIED.
Client side: the units in `units/` (`signin`, `picture-set`, `vault-access`, `lws-records`, `record-sync`, `picture-upload`).

## 1. Public API

```ts
export function createFakePlatform(options?: FakePlatformOptions): FakePlatform;

interface FakePlatformOptions {
  /** The platform origin the app signs in at. Default "https://fake.test" (the apex: the code bank sets its base origin to the apex). */
  origin?: string;
  /** Domain vault hosts live under: a vault named "ann" is https://ann.<domain>/vault. Default: the origin's host. */
  domain?: string;
  /** Extra hosts answered as this platform (a dev rig: "localhost:5173", "ann.localhost:5173"). Any other host is a violation. */
  hosts?: string[];
  /** "strict" (default): a call without a well-formed Authorization+DPoP pair answers 401 on EVERY route (catches an unsigned call).
   *  "platform": copy the platform exactly (see section 4): /lws and /files treat no header as anonymous. */
  dpop?: "strict" | "platform";
  /** Fixed one-time code, or a function of the email. Default "000000". */
  code?: string | ((email: string) => string);
  /** create-named answers vaultId on "/base" (what the signin unit documents) or "/vault" (what the list shows). Default "base". UNMEASURED: see Doubts 1. */
  createNamedVaultSegment?: "base" | "vault";
  /** A taken vault name: "refuse" = 409 (the cross-store mint, production), "suffix" = silent name2 (the local mint). Default "refuse". */
  nameCollision?: "refuse" | "suffix";
  /** Listing rows carry `transcodedFrom`: GilbPlatform 78d1fb1d (#691), live in production 2026-11-10. Default true. */
  listingCarriesTranscodedFrom?: boolean;
  now?: () => number;                       // for iat windows, updatedAt
}

interface FakePlatform {
  /** Drop-in fetch. `vi.stubGlobal("fetch", fake.fetch)` or `window.fetch = fake.fetch`. */
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** A record-sync PlatformClient for one origin: { origin, fetch } (speed-lab's `client()`). */
  client(origin?: string): { origin: string; fetch: (url: string, init?: RequestInit) => Promise<Response> };
  /** A `Transport` for the signin unit (its http.ts/vaults.ts take `{ transport }`). */
  transport: (url: string, init: RequestInit & { timeoutMs?: number }) => Promise<Response>;
  /** The auth host for lws-session-bridge `setLwsAuth` that signs real-shaped proofs (so apps need no installFakeAuth stub). */
  authHost(person: PersonRef): LwsAuthHost;

  state: FakeState;                         // read-only view, section 3
  calls: Calls;                             // section 6
  violations: string[];                     // every request the fake did not answer by a table row, or to a foreign host

  // seeding: no request, no call recorded
  seedPerson(p: { email: string; vaultName?: string; represents?: string }): Person; // vaultName set => has a landing vault
  seedVault(v: { name: string; owner: PersonRef; partOf?: VaultRef; represents?: string }): Vault;
  seedRecord(v: VaultRef, r: { type: string; facts: Record<string, unknown>; id?: string }): FakeRecord;      // type bare: "Sailboat"
  seedFile(v: VaultRef, f: { name: string; bytes: Uint8Array; mediaType?: string; type?: string; transcodedFrom?: FileRef; storedWith?: string }): FakeFile;
  seedPicture(v: VaultRef, p: { name: string; master: Uint8Array; thumb: Uint8Array }): { master: FakeFile; thumb: FakeFile }; // thumb.transcodedFrom = master
  grant(v: VaultRef, who: PersonRef | string, mode: "read" | "write" | "append" | "control"): void;           // write also plants read
  takeName(name: string): void;             // someone else holds it; check-name and create-named see it
  signInAs(p: PersonRef): { token: string; principal: string };                                              // skip the code step; token carries cnf.jkt of the key the test gives

  // another device / another person acts (no call recorded; moves the position and the etag)
  edit(id: string, facts: Record<string, unknown>): void;   // null removes a fact, as PATCH does
  remove(id: string): void;                                  // leaves the live list, enters the ended list
  bump(id: string): void;                                    // etag moves; the app's next If-Match is stale
  revokeAccess(p: PersonRef, v: VaultRef): void;             // owner took the person's access away

  // failure + timing
  failNext(match: Match, f: { status: number; body?: unknown; message?: string; times?: number; skip?: number }): Unfail;
  dropNext(match: Match, opts?: { times?: number; skip?: number }): Unfail;   // fetch rejects with TypeError, as a lost network does
  hold(match: Match): Release;              // matching requests wait until Release()
  offline: boolean;                         // every request rejects with TypeError, nothing recorded
  latencyMs?: () => number;

  reset(): void;                            // back to the freshly created state
}
type Match = `${"GET"|"POST"|"PUT"|"PATCH"|"DELETE"} ${string}` | RegExp;      // "POST /base/vault/create-named", "GET /lws/vault/:vault/files"
```

One factory, one `fetch`. Several people and several vault hosts live in one fake: the host in the URL picks the origin the
app addressed; the token picks who is calling.

## 2. Route table (the only dispatch source)

Rows are the whole set the fake answers. Statuses are what the platform answers; sentence text is copied where the client reads it.
Error body everywhere: `{ "error": <token>, "message": <sentence> }` (`src/lws/routes.ts:1167-1170`, `src/server/app.ts:192`).

| # | Method + path | Request (platform refuses more than this) | Answer | Statuses | Mirrors (origin/main) |
|---|---|---|---|---|---|
| 1 | POST `/base/auth/email/request-code` | JSON `{email (len>=3), return_to?, name?}`, nothing else | `{requested:true}` always (no oracle). Fake stores the code. | 200; 400 unknown field or short email; 400 wrongSignInHost if posted to a vault host | `src/routes/email-auth.ts:289-355`, schema `:68-82` |
| 2 | POST `/base/auth/email/verify-code` | JSON `{email, code (1-32), dpopJwk:object, client?, name?}`, nothing else | Returning person: `{token, principal, needsVaultName:false}`. New person, no name: `{token, principal, needsVaultName:true, suggestedName, webIdDomain}`. New + name, mint live: `{token, principal, needsVaultName:false, vaultName, vault, vaultId, aliasUri}`. New + name, name taken/reserved: `{token, principal, needsVaultName:true, suggestedName, nameOutcome}` (never a hard block). Token = JWT with `cnf.jkt` (thumbprint of the sent `dpopJwk`), `iss`, `sub`, `exp`, `iat`. | 200; 401 wrong, expired or used code (`Invalid or expired email one-time code`); 400 schema | `email-auth.ts:358-565`, schema `:84-108`; 401 `:437` |
| 3 | POST `/onboard/api/name-prep` | JSON `{email}` | Returning: `{isReturning:true, webIdDomain}`. New: `{isReturning:false, suggestedName, webIdDomain, address}` | 200; 400 `{error:"email_required"}` | `src/routes/onboarding.ts:895-926` |
| 4 | POST `/onboard/api/check-name` | JSON `{name}` | `{available, reserved, requested, normalized?:true, note?, name, webIdDomain, address, suggestion?, message?}`. Name is normalised (lower case, keep a-z 0-9, empty gives `user`). `normalized:true` + `note:"'<requested>' is saved as '<name>': a vault name keeps only a–z and 0–9."` only when it changed the name. Reserved or under 3 chars: `available:false, reserved:true, message:"'<name>' is a reserved name — please choose another."`, no suggestion. Taken: `suggestion` = first free `name2…`, `address` is the suggestion's, `message:"'<name>' is taken — we suggest '<s>'. Accept it or edit."`. `address` = `https://<name>.<domain>/vault`. | 200 always | `onboarding.ts:929-972`; `src/auth/reserved-names.ts:18-39,159,169`; `src/auth/name-registry.ts:190-225` |
| 5 | GET `/lws/vaults` | auth | `application/ld+json` `{ "@context", "@id", total, vaults:[{ "@id"?, vaultId, name, represents, partOf:{vaultId..}\|null, parentAmbiguous, modes:["read"\|"write"..], isLandingVault, podName, podNameKnown }], complete:true, incompletePeers:0 }`, sorted by name then vaultId. Only vaults the caller reaches. No credential: same document, `vaults:[]`. | 200 | `src/lws/routes.ts:782`; `src/lws/vaults.ts:563-717`, node type `:129-189`, `podName` keys `src/read/name-resolve-crossing.ts:130,145` |
| 6 | POST `/base/vault/create-named` | strict auth. JSON `{name (1-63), represents, parentVault?}`, nothing else. `represents` is a full type IRI; missing or empty fails (no default). `parentVault` omitted: parent defaults to the caller's own landing vault. | 201 `{vault, vaultId, name, parent, represents, created:true}`; 202 same with `status:"partial"`, `parent:null`, `represents:null`, `message` (re-send the same request to finish). `vaultId` per option `createNamedVaultSegment`. Name is normalised; the answer's `name` is the issued name. | 201; 202; 400 no/empty `represents` (sentence names `represents`), reserved name, `parentVault is not a known vault entity: <x>`; 401 no/bad token; 403 not a vault the caller controls; 409 name taken (refuse mode, message `REFUSED: the name '<n>' on '<server>' is already held…`, may carry `suggestion`) | `src/routes/vault.ts:376-417`, schema `:104-115`; `src/auth/create-named-vault.ts:153-198,470-520,632-641,644-662`; `src/auth/cross-store-mint.ts:461-475`; parent default `vault-hierarchy.ts:193-196`, `create-named-vault.ts:585-587` |
| 7 | POST `/lws/vault/:vault/c` | auth. `:vault` = `https://<host>/vault` or `/base` (https only). JSON `{type?, facts, agent?}`, `facts` required, nothing else. `Slug`, `Idempotency-Key` headers optional. | `{ "@id": "https://<vaulthost>/lws/r/<id>" }` + `Location` (same) + `ETag`. | 201; 400 vault not an https vaultId (`vault name not resolved…`), no `facts`; 401 bad credential; 403 `vault target denied: the principal holds no write reach on vault <id>`; 409 a fact key names no defined term (UndefinedTermError) | `src/lws/routes.ts:838-876`; schema `:1156-1165`; answer `:349-377`; resolver `src/authz/vault-target.ts:155,304-324`; `src/lws/crud.ts:264-278`; 409 `src/write/errors.ts:663-685` |
| 8 | GET `/lws/r/:id` | auth optional (anon sees nothing) | `{ "@context":"https://www.w3.org/ns/lws/v1", "@id":<entity URI>, "@type":"t:<Type>", <bare fact keys…> }` + `ETag`. An ended record answers a type-only document with `a:entityLifecycleState:"ended"` (follows the platform source, `src/lws/resource-frame.ts:33-40`; pinned by a test; not measured on the wire, see Doubts 2). | 200; 404 absent, unreadable, or no read reach (non-disclosure) | `routes.ts:585-593`, `getResource :152-215`; `src/lws/resource-frame.ts:27-41` |
| 9 | PATCH `/lws/r/:id` | auth; body JSON merge patch (content-type `application/merge-patch+json` accepted); `If-Match` optional; `null` removes a fact | `{ "@id": <lws uri> }` + `ETag` + `Location` | **200**; 404 absent or caller cannot read; 403 no write; 412 stale `If-Match`; 409 undefined term | `routes.ts:1026-1073`; `crud.ts:459-524` (200 at `:519`), 412 `:421-429` |
| 10 | PUT `/lws/r/:id` | auth; `{type?, facts, agent?}`; `If-Match` **required** | as 9 | 200/201 as the platform; **428** no `If-Match`; 412 stale | `routes.ts:998-1024`; `crud.ts:300-311` (428), `:376,424-427` (412). Optional, phase 2 (lws-records `retypeRecord`/replace use it) |
| 11 | DELETE `/lws/r/:id` | auth; `If-Match` optional | empty body | 204; 404 absent or unreadable; 403 no write; 412 stale | `routes.ts:1075-1140`; `crud.ts:632-733` |
| 12 | GET `/lws/vault/:vault/records` | auth. Query keys the fake accepts (platform): `type` (repeatable, bare `[A-Za-z0-9_-]{1,64}`), `include=body`, `limit` (only with include=body; clamped 200; default 200 with include), `offset`, `after`, `since` (`start`\|`head`\|cursor), `lifecycle` (`live`\|`ended`), `filter=<attr>=<value>` | `{ "@context","@id",total,totalItemsKind:"exact"\|"atLeast",returnedRecords,complete,pageSize,offset,[nextOffset only with include=body, no since/after],[nextCursor],records:[{entity,typeUri,updatedAt,label,vault,vaultAmbiguous,[endingActorKind on ended],[body,etag only with include=body]}],types,vault,scannedVaults }`. Newest first live; `since` ascending; no `type` = every record. Unknown bare type = `records:[]`, 200. `since=head`: no rows, `nextCursor` = now. `nextCursor` on a live one-type page only when `complete:false`. | 200; 400 `type_token_unresolved` for `t:Name` or a URI; 400 `since_cursor_invalid`; 400 `since`+`offset`; 400 `after` with `offset`/`since`/`lifecycle=ended`/not exactly one type; 400 `include` not `body`; 400 `lifecycle` not live/ended; 403 no read reach | `routes.ts:712-727`; `src/lws/records.ts:205-243` (type), `:246-252`, `:261-284` (include/limit/cap), `:288-294`, `:503-566` (since/after rules), `:941-1059` (answer) |
| 13 | PUT `/lws/vault/:vault/files?name=&folder=&tag=&storedWith=`; POST `/lws/vault/:vault/files` is the same row | auth write; raw bytes as body, `Content-Type` = media type; exactly one non-empty `name`; `thumbnail=whole`/`face=`/`fileType=` are NOT faked (see section 7) | `{entity, contentHash (bare 64-hex SHA-256 of the bytes, `src/files/file-store.ts` a:fileContentHash; the ETag of GET /files/:id is `"sha256:<hex>"`), byteSize, created}` + `Location: /files/<id>` when created | **201** new content; **200** identical bytes again (`created:false`, no Location); 400 no/many `name`, no body, bad Content-Type; 401; 403 no write reach (before the body is read) | `src/routes/files.ts:1354-1363`; `uploadFileToVault :695-716`; stream/validate `:380-597` (name `:388-393`, answer `:577-596`) |
| 14 | GET `/lws/vault/:vault/files` | auth read. Query keys (any other = 400): `folder, tag, unfiled, unattached, storedWith, transcodedFrom, limit (digits), offset (digits), as, lifecycle (live\|ended\|all)` | `{vault, scannedVaults, count, files:[{entity,fileName,mediaType,typeUri,contentHash,byteSize,folderPaths,tags,storedWith,updatedAt,ended,transcodedFrom}]}` (12 fields per file, not 13 as section 2 first said; `transcodedFrom` only when `listingCarriesTranscodedFrom` is on). Ordered by `fileName` (nulls last), then entity. Page = `limit` (default 50, max 200) at `offset`. `count` = total matching, not the page. **No `nextCursor`, no `next…` field of any kind.** `transcodedFrom` filter: only copies of that original. | 200; 400 unknown query key; 403 no read reach | `src/routes/file-browse.ts:73-100,208-250`; `src/read/file-browse.ts:66-68,79-134,283-499` |
| 15 | GET `/files/:id` | auth read; `Range` optional (not faked, section 7) | the bytes, `Content-Type` = media type, `ETag: "sha256:<hash>"`, `Accept-Ranges: bytes`, `X-Content-Type-Options: nosniff`. An ENDED file still answers (ending keeps the bytes). | 200; 404 absent, not a file, or no read (non-disclosure, byte-identical); 401 bad credential | `src/routes/files.ts:1321-1325`; `downloadFile :870-986` (404 `:917`, headers `:952-954`) |
| 16 | DELETE `/files/:id` | auth write | empty. Marks the file ended; bytes kept; the listing hides it under `live`. Idempotent. | 204 (also when already ended); 404 absent or no read; 403 reader without write | `files.ts:1385-1389`; `deleteFileRoute :749-809` |
| 17 | PATCH `/lws/r/<file id>` | as row 9, on a file record (`{transcodedFrom:{"@id":<entity>}}` is what picture-set sends) | as row 9 | as row 9 | `routes.ts:1026-1073`; client `units/picture-set/src/uploadSet.ts:55,84,95` |
| 18 | POST `/base/authz/grant-vault` | strict auth. JSON `{vault, grantee, mode}`, nothing else; mode in `read\|write\|append\|control`. Caller must hold Control. `write` also plants `read`. Idempotent. A grantee that is a vault address (`/vault`, `/base`) resolves to that vault holder's opaque principal `…/base/p/<id>`; `grantee` in the answer is the resolved principal. | `{vault, grantee:<resolved>, mode, granted:true}` | **201**; 400 schema, bad mode, grantee is the public marker; 401; 403 `Principal <p> does not hold acl:Control on the target vault <v> — grant/revoke requires vault ownership or a delegated Control capability…` | `src/routes/authz.ts:1457-1550` (201 `:1547-1548`, write plants read `:1537-1540`), schema `:154-165`, gate `:638-693`, resolve `src/authz/vault-grant.ts:293-311` |
| 19 | POST `/base/authz/revoke-vault` | as 18 | `{vault, grantee:<resolved>, mode, revoked:<boolean>}`; `revoked:false` when nothing live was held. Revoking write leaves the read. | **200**; 400; 401; 403 as 18 | `authz.ts:1581-1616`; `vault-grant.ts:635-653` |
| 20 | GET `/base/consent/vault-acl?vault=` | strict auth | `{vault, scope:"pod", note, acl:[{principal,levels,label,webId,kind,labelSource,registered,viewer}], edges:[], chainReach:[], unclassifiedRows:0}`. `acl` sorted by principal; `levels` in the platform's order read, append, write, control (`entity-acl.ts:73`); the owner has no stored grant in the fake, so the owner row is `levels:["control"]`, `kind:"owner-inferred"` (an owner who is also granted modes shows them, `kind:"grant"`); a stored grant is `kind:"grant"`. Whether the platform stores a self-grant for the owner is UNVERIFIED (Doubts, part 2). | 200; **404 `{error:"not found"}`** when the caller holds no Control (non-disclosure); 401 | `src/routes/consent.ts:119-135`; `src/authz/entity-acl.ts:452-476,492-569` |

Not one row above is optional except 10 (phase 2). Everything else the platform has (types, selfcard, notes, help-pictures,
`/base/files`, public/reach grants, `create-named-vault` at `/base/auth/email/create-named-vault`, `dpop-token` bridge) is NOT in
the table, so the fake answers it `404 {error:"fake_platform_no_such_route"}` and records it in `violations`.

## 3. State model

| Store | Holds | Notes |
|---|---|---|
| people | email, principal (`https://<id host>/base/p/<id>`), landing vault id, normalised email | `seedPerson`, or made by verify-code |
| codes | email to code (+ the name posted at request-code, platform `setPendingVaultName` `email-auth.ts:351`) | a code is single use; a wrong code is 401 |
| sessions | token to `{principal, email, jkt, exp}`; used proof `jti`s | token minted at verify-code from the sent `dpopJwk` |
| nameRegistry | normalised name to holder (vault or `takeName`) | check-name, create-named, verify-code-with-name all read it |
| vaults | `{id (https://<name>.<domain>/vault), name, represents, partOf, owner, host}` | the id the list serves; create-named answers the option's segment |
| grants | vaultId to principal to set of modes | owner has control implicitly (acl shows `owner-inferred`); reach = owner or any grant; list `modes` = read/write the person holds |
| records | `{id, vaultId, type (bare), facts (bare keys), version, etag, seq, updatedAt, endedAt?}` | etag `"sha256:<hex of canonical facts>"`; `seq` is one counter for the whole fake (positions) |
| endedLog | `{entity, vaultId, seq}` | feeds `lifecycle=ended` and `since` on it |
| files | `{id, vaultId, bytes, fileName, mediaType, typeUri, contentHash, folderPaths, tags, storedWith, facts (transcodedFrom…), endedAt?, updatedAt}` | `contentHash` = SHA-256 hex; same bytes in a vault answers 200 not 201 |
| calls / violations | section 6 | |

Entity URI of a record or file: `https://<vaulthost>/vault/e/<id>` (the id the platform's `lwsIdOfEntity` recovers, `src/lws/uri.ts:43-49`).
Cursors are opaque strings the fake seals with vault + caller + lifecycle, as the platform does; a cursor from another vault or person is `400 since_cursor_invalid`.

## 4. DPoP and the Bearer token

The fake does **not** verify signatures (no real crypto). It checks the headers and the proof's claims, which is enough to
catch a call made without signing, with the wrong method or URL, or with a reused proof.

What the client sends (`units/signin/src/dpop.ts:113-129`): `Authorization: DPoP <token>`, `DPoP: <compact JWS>`, header
`{alg:"ES256", typ:"dpop+jwt", jwk}`, claims `{jti, htm, htu, iat, ath}`. `htu` is `https://` + the request's host + path, query dropped,
**even when the request went over http** (`dpop.ts:93-101`).

| Check in the fake | What the platform refuses | Status | Source |
|---|---|---|---|
| `Authorization` present, scheme `DPoP` or `Bearer` | other scheme: "Unsupported Authorization scheme" | 401 | `src/auth/bearer-principal.ts:183` |
| token decodes, `exp` in future, `iss`/`sub`/`cnf.jkt` present, token is one the fake minted | malformed, expired, untrusted, not DPoP-bound | 401 | `src/auth/verify.ts:232,240,276,375,381,389` |
| proof decodes, `typ` is `dpop+jwt`, has `jwk` | invalid proof | 401 | `verify.ts:412` |
| `htm` equals the method | "DPoP proof htm does not match the request method" | 401 | `verify.ts:442` |
| `htu` equals `https://<host><path>` | "DPoP proof htu does not match the request URI" | 401 | `verify.ts:446` |
| `ath` equals base64url SHA-256 of the token | "ath does not match" / malformed | 401 | `verify.ts:464,469` |
| `iat` within the freshness window (fake: 60 s) | "outside the freshness window" | 401 | `verify.ts:150` |
| `jti` present and not used before | "has no jti" / "already been used (replay rejected)" | 401 | `verify.ts:169,175` |
| thumbprint of proof `jwk` equals token `cnf.jkt` | "DPoP proof key does not match the token's bound key" | 401 | `verify.ts:422` |

Two modes (`options.dpop`):

- **platform**: a copy of the platform's two postures. `/lws/*` and `/files/*` ride the Bearer floor: no `Authorization` header is
  anonymous, not 401 (list vaults gives `vaults:[]` with 200; vault routes 403; a record read 404; writes 403);
  `Authorization: DPoP <token>` with no `DPoP` header is accepted (proof-less) (`bearer-principal.ts:112,136-156`, `lws/auth.ts:77-106`).
  `/base/vault/*`, `/base/authz/*`, `/base/consent/*` are strict: no or non-DPoP header is 401 (`src/auth/principal.ts:145-158,233-249`; `consent.ts:124`; `vault.ts:381-385`).
- **strict** (default, a deliberate STRICTER-than-platform setting, labelled by an `x-fake-platform-note` response header on every
  401 it causes): every route behaves as the strict posture. A call that forgot to sign fails in the test, where production would
  quietly treat it as anonymous.

## 5. Honesty rule (as speed-lab T8, widened)

1. `ROUTES` is the one dispatch table. Each row carries `source: "src/path.ts:LINE"` at a pinned GilbPlatform SHA (`PLATFORM_SHA` exported).
2. Any method+path not in `ROUTES` answers `404 {error:"fake_platform_no_such_route"}`, is pushed to `violations`, and `fake.assertClean()` throws on it.
   A host that is not the origin, a `hosts` entry or a vault host under `domain`: `fetch` rejects with `TypeError`, recorded as a violation.
3. Query keys and body fields the platform's schema refuses (`additionalProperties:false`, ajv `removeAdditional:false`, `src/server/app.ts:339-340`)
   answer 400 in the fake too. The fake never accepts an extra key, and never invents a field the platform does not send (no `nextCursor` on the file listing).
4. The fake never accepts something the platform refuses to make a test pass: `t:Name` as a records `type` is 400; an `http://` vault id is 400.
5. Tests shipped with the unit (`test/honesty.test.ts`): (a) every `ROUTES` row has a `source` that matches `path:number`; (b) when a
   GilbPlatform checkout is present, `git grep` finds the row's path string in that file at that SHA; (c) an unlisted route 404s;
   (d) the file listing never carries a `next*` key; (e) each answer is compared to a golden shape captured from section 2 (keys and types).
6. A stricter-than-platform behaviour (strict DPoP, the `PLATFORM_SHA` lag) is stated here and marked in the answer, never silent.

## 6. Failure injection and call inspection

```ts
interface Calls {
  all: Call[];                                          // in order
  of(match: Match): Call[];
  last(match?: Match): Call | undefined;
  count(match?: Match): number;
  clear(): void;
}
interface Call {
  n: number; method: string; url: string; host: string; path: string; query: Record<string, string[]>;
  headers: Record<string, string>; body: unknown;      // JSON parsed; raw bytes kept as Uint8Array for uploads
  as?: { principal: string; email: string };           // who the token says
  proof: { ok: boolean; reason?: string };             // what the DPoP check found
  status: number | "network-error"; injected?: boolean; at: number;
}
```

| Need | Call |
|---|---|
| a status for the next matching request(s) | `failNext("PUT /lws/vault/:vault/files", {status:503, times:2, skip:1})` (replaces `failUploads`, `__fake.fail`, `failAfter`) |
| lost network on one route | `dropNext(match)` |
| whole network gone | `fake.offline = true` |
| a slow vault, a list whose first page answers and the rest waits | `hold(match)` returns `release`; `failNext(..., {skip:n})` for "fail after n" (replaces `holdAfter`, `failAfter`) |
| another device changed a record | `edit`, `remove`, `bump` |
| a person's access taken away | `revokeAccess(person, vault)`: reads answer what the platform answers (403 on the list, 404 on a record or file) |
| what did the app send? | `calls.of("POST /base/vault/create-named").at(-1).body` (replaces `createBodies`, `grantCalls`, `listQueries`, `uploads`, `ended`, `requests`) |

Injected answers use the platform's error shape `{error:"Injected", message}` unless `body` is given.

## 7. Deliberately NOT faked

| Not faked | Why |
|---|---|
| Real signature checking, JWK/JWS crypto, token issuer keys | Not crypto (brief). Claims are checked, signatures are not. |
| Email delivery, rate limits, `return_to` branding, review credentials | Only `{requested:true}` and a stored code. |
| Ontology: which terms exist | A vault accepts a configurable set of fact keys (default: any); `UndefinedTermError` 409 only for keys the test lists as undefined. The unit must not copy GilbVeda. |
| `?thumbnail=whole`, `?face=`, `?fileType=` on upload; `Range` on download; `file-uploads` pieces | Server-side image work; a test seeds the thumbnail with `seedPicture`. A request carrying them answers 400 `fake_platform_not_faked`, never a silent pass. |
| Placement across stores, crossing hops, `partial` mint except by `failNext`-style option `createNamed:"partial"` | One store. 202 is available on request only. |
| Multi-vault reach (`partOf` subtree scans), vault-to-vault reach edges, public grants, groups | The list and grants are whole-vault person grants only. |
| `/base/auth/email/create-named-vault`, `/base/auth/session/dpop-token`, `/base/vault/set-represents`, types/notes/selfcard/help routes | No clone in the code bank calls them; the table stays closed until one does. |
| Idempotency-Key replay | Header accepted and ignored. |
| Server timing, CORS, cookies | A fetch stand-in has no browser. verify-code sets no cookie. |

## 8. Migration of the three copies

| Copy | Today (lines) | Becomes | Lines removed |
|---|---|---|---|
| run 5 `PictureRecords5/app` | `src/fake/fakePlatform.ts` 521 + `src/fake/seedPictures.ts` 3 (base64 pictures stay, 3). 8 test files import `installFakePlatform` (about 30 uses of `__fake.fail/hold/edit/remove/bump/revokeAccess/offline`); `src/main.tsx` imports it for `dev:fake` | `const fake = createFakePlatform({hosts:[location.host]}); window.fetch = fake.fetch`; `__fake.X` becomes `fake.X`; `?seed`/`?as`/`?fresh`/`?taken` URL switches become a 25-line `devFake.ts` that calls `seedPerson`/`seedRecord`/`takeName` | about 515 (all of fakePlatform.ts); about 25 added in an app-side seed file |
| pictures-example | `src/fakeVault.ts` 139 + auth stub inside it (`installFakeAuth`), `test/helpers.ts` 44, `src/main.fake.tsx` 95 | `createFakePlatform()` + `fake.authHost(person)` for `setLwsAuth`; `helpers.ts` keeps `setup()` (about 15 lines); `main.fake.tsx` keeps its picture-drawing seed loop and calls `fake.seedPicture` | about 139 (fakeVault) + about 30 from helpers; main.fake.tsx loses about 10 |
| speed-lab | `src/fakePlatform.ts` 168 (records list + its own `PATCH …/records/<id>` route), `src/standin.ts` 17 (glue, stays), `test/T8-stand-in-honesty.test.ts` 30 | `fake.client(ann.origin)` for `completeCopy`; records seeded with `seedRecord`; rename is a real `PATCH /lws/r/<id>`, so `lws-records` `patchRecord` replaces the stand-in's own write route; T8 becomes the unit's `honesty.test.ts` (kept as a thin check that the app's calls are all in `ROUTES`); `latencyMs`, `hold`, `holdAfter`, `failAfter`, `renameBehindBack` map to `latencyMs`, `hold`, `failNext skip`, `edit` | about 168 + about 25 of T8 |

Net: about 820 hand-written lines out of three apps, one place that carries the platform's shapes.

## 9. Disagreements: copy vs platform (the bugs the unit must not copy)

R5 = run 5 `fakePlatform.ts`. PE = pictures-example `fakeVault.ts`. SL = speed-lab `fakePlatform.ts`. Platform lines are origin/main.

| # | Copy, route | The copy | The platform | Source |
|---|---|---|---|---|
| 1 | PE `GET …/files` | `{files:[{entity, body:<record>}]}` (its comment: "the app's own assumption") | `{vault, scannedVaults, count, files:[{entity,fileName,mediaType,typeUri,contentHash,byteSize,folderPaths,tags,storedWith,updatedAt,ended,transcodedFrom}]}`, no `body` | `src/read/file-browse.ts:79-134,478-499` |
| 2 | R5 `GET …/files` | `{files:[{entity,fileName,mediaType,typeUri,byteSize}]}`, no `count`, no `limit`/`offset`, newest first, all in one answer | adds `count` (total), `contentHash, folderPaths, tags, storedWith, updatedAt, ended, transcodedFrom`; ordered by `fileName` then entity; page 50, max 200, `limit`/`offset` | `file-browse.ts:289-290,475-498`; `routes/file-browse.ts:238-239` |
| 3 | R5 + PE + SL (files, records) | no `nextCursor` on the file listing: **agrees** with the platform. But R5's record list sends `nextCursor` and `nextOffset` on every page, including the last and without `include=body` | `nextOffset` only with `include=body` and no `since`/`after`; `nextCursor` only on an incomplete one-type live page or in `since` mode | `src/lws/records.ts:1034-1054` |
| 4 | R5 `POST /base/vault/create-named` | 201 `{vaultId}`; `vaultId` is the `/vault` address; refuses 400 when `parentVault` is absent (unless a Person landing vault) | 201/202 `{vault, vaultId, name, parent, represents, created:true}`; parent defaults to the caller's landing vault; the unit documents `vaultId` on `/base` | `create-named-vault.ts:470-520,632-641`; `vault-hierarchy.ts:193-196`; `units/signin/src/vaults.ts` (CreatedNamedVault doc) |
| 5 | R5 create-named: taken name | 409 `{error:"Conflict", message:"'<n>' is taken."}` | 409 `VaultNameTaken` with the sentence `REFUSED: the name '<n>' on '<server>' is already held…` (+ `suggestion`) on the cross-store path; the local path silently suffixes instead | `cross-store-mint.ts:116-126,467-475`; `vault-hierarchy.ts:164-181` |
| 6 | R5 `POST /onboard/api/check-name` | no `requested`/`normalized`/`note`; empty name stays empty; `reserved` always false; no 3-char minimum; address built from the page scheme and host (`http://x.localhost/vault`) | `requested` always; `normalized:true`+`note` when changed; empty becomes `user`; reserved/short names `reserved:true`; address `https://<name>.<domain>/vault` | `onboarding.ts:929-972`; `reserved-names.ts:18-39,159,169`; `name-registry.ts:224` |
| 7 | R5 `POST /onboard/api/name-prep` | `{isReturning}` only | adds `webIdDomain`, and for a new person `suggestedName`, `address`; 400 `email_required` | `onboarding.ts:895-926` |
| 8 | R5 `POST …/verify-code` | `{token, principal}` or `{…, needsVaultName:true, suggestedName}`; with a name it makes the vault silently and answers only `{token, principal}`; the name is not normalised; a wrong code is never refused; `dpopJwk` is not required | adds `needsVaultName:false`, `vaultName, vault, vaultId, aliasUri` on a live first mint, `webIdDomain` on the needs-name arm; wrong code 401; `dpopJwk` required | `email-auth.ts:358-565` |
| 9 | R5 `POST /lws/vault/:v/c` | `@id` = the entity URI (`<origin>/vault/e/<id>`); `Location` = `<origin>/lws/r/<id>` | both `@id` and `Location` are `https://<vaulthost>/lws/r/<id>` | `routes.ts:349-377`; `lws/uri.ts:55-65` |
| 10 | R5 `PATCH /lws/r/:id` | **204**, empty body, `ETag: "<n>"` | **200** with `{ "@id": … }` + `ETag` (`"sha256:…"`) | `routes.ts:1026-1073`; `crud.ts:519` |
| 11 | PE `PATCH /lws/r/:id` | 200 `{etag:'"v2"'}` | 200 `{ "@id": <lws uri> }`, ETag header | `routes.ts:349-377` |
| 12 | R5 + PE ETags | `"<version number>"` (R5), `"v2"` (PE) | strong ETag `"sha256:<64 hex of the state hash>"` | `src/lws/crud.ts:150-156` |
| 13 | R5 `GET /lws/r/:id` of a deleted record | 404 | ended record answers 200 with a type-only document marked ended (per `frameLwsResource`); UNVERIFIED on the wire (lws-records says a later GET 404s) | `resource-frame.ts:33-40`; `units/lws-records/src/records.ts:869` |
| 14 | R5 `GET …/records` | `type` other than `Sailboat` is 400; every row carries `body` + `etag` whether or not `include=body` was sent; no `vault`/`vaultAmbiguous`; the `since` pass returns every changed row in one `complete:true` page, ignoring `limit` | an unknown bare type is 200 `records:[]`; body+etag only with `include=body`; `vault`+`vaultAmbiguous` on every row; the `since` pass is paged by `limit` and `complete:false` + `nextCursor` | `records.ts:205-243,941-1059` |
| 15 | R5 `POST /lws/vault/:v/files` upload | always 201 `created:true`, `contentHash:"fake-<id>"` | 201 new, **200** identical bytes (`created:false`, no `Location`); `contentHash` is SHA-256 hex | `files.ts:577-596` |
| 16 | PE upload | `{entity}` only, 201 always | `{entity, contentHash, byteSize, created}` + `Location` | `files.ts:577-596` |
| 17 | R5 `POST /base/authz/grant-vault` | **200** `{ok:true, vault, grantee, mode}` | **201** `{vault, grantee, mode, granted:true}` | `authz.ts:1547-1548` |
| 18 | R5 `POST /base/authz/revoke-vault` | 200 `{revoked:true\|false}` | 200 `{vault, grantee, mode, revoked}` | `authz.ts:1615` |
| 19 | R5 `GET /base/consent/vault-acl` | 200 `{note:"", acl:[…], edges:[]}`; acl rows `{principal,levels,label,webId,kind}`; owner label "You"; unsorted | `{vault, scope, note:<long sentence>, acl:[+labelSource,registered,viewer], edges, chainReach, unclassifiedRows}`; acl sorted by principal | `entity-acl.ts:452-476,552-567`; `consent.ts:134` |
| 20 | R5 vault with revoked access | 403 on the vault list, **on a record GET and on a file GET too**; sentence `vault target denied: no read reach` | 403 `vault target denied: the principal holds no read reach on vault <id>` on the vault-scoped list and files routes; **404** on `GET /lws/r/:id` and `GET /files/:id` | `vault-target.ts:320-323`; `routes.ts:1055-1058`; `files.ts:917` |
| 21 | R5 vault ids | `http://<name>.localhost/vault` (page scheme) accepted as a vault id | a vault id must be `https://<host>/vault` or `/base`; anything else is 400 `vault name not resolved` | `vault-target.ts:155,164-166,312` |
| 22 | R5 `DELETE /files/:id` | no write check; any caller may end any file | a reader without write: 403; no read: 404 | `files.ts:774-780,758-760` |
| 23 | R5 + PE + SL: auth | no token check anywhere (PE stubs the bridge with `DPoP fake-token` / `fake-proof`) | a presented bad token or proof is 401; strict routes without DPoP are 401 | `bearer-principal.ts:107-184`; `principal.ts:233-249`; `verify.ts` |
| 24 | SL `PATCH /lws/vault/<v>/records/<id>` | answers a rename here (200 `{ok:true, etag}`); its header says "the real platform's write differs" | no such route; a record is patched at `PATCH /lws/r/<id>` | `routes.ts:1026-1073` (no `…/records/:id` route is registered) |
| 25 | SL `GET …/records?type=t:CatalogEntry` | strips `t:` itself and answers 200 | `t:` as a list `type` is 400 `type_token_unresolved`. **Not a bug for `completeCopy` users:** `completeCopy` takes the `t:` off before it sends (`units/record-sync/src/completeCopy.ts:344`), so the app never sends it. Only the stand-in's own tolerance of `t:` is wrong (corrected in 0.1.0 part 1: a `t:` type is 400). My first report called this an app bug; it was not. | `records.ts:205-221`; `units/record-sync/src/completeCopy.ts:344` |
| 26 | SL unknown vault | 404 `{error:"vault_not_found"}` | 403 `vault target denied…` (an unreachable vault, existing or not) | `vault-target.ts:320-323` |
| 27 | SL query keys | 400 `unsupported_parameter` for `offset` and `filter` (T8 asserts `offset=5` is 400) | `offset` and `filter` are accepted | `records.ts:246-252,483-501` |
| 28 | SL `limit` without `include=body` | honoured, clamped 1-200 | ignored; the page is the search page size | `records.ts:269,274` |
| 29 | SL rows without `include=body` | `{entity,typeUri,label,updatedAt}` | plus `vault`, `vaultAmbiguous` | `records.ts:941-950` |

Row 3 is the one place the three copies and the platform AGREE (no `nextCursor` on the file listing), listed so the unit keeps it.
Rows 27 to 29 are stricter or looser than the platform on purpose in SL (its T8 test); the unit follows the platform instead.

## 10. Doubts (each a possible defect; not resolved by reading)

1. **create-named `vaultId` segment. UNMEASURED** (the coordinator will measure it before release; default stays `"base"`). `units/signin/src/vaults.ts` says create-named answers `https://<slug>.<domain>/base`; GilbPlatform `vaultAddressFor` says new user vaults are `/vault` (`name-registry.ts:190-225`). I read no measured answer. The option `createNamedVaultSegment` carries both; default `"base"` follows the unit. Needs one measurement.
2. **Ended record read. DECIDED:** follow the platform source: 200 type-only document marked ended (`src/lws/resource-frame.ts:33-40`; read path `src/lws/routes.ts:195-215`). Part 1 does this and a test pins it (`test/records.test.ts`, "an ended record answers the type-only 200"). Not measured on the wire; `lws-records` (`records.ts:869`) and run 5 say a later GET is 404.
3. **File listing `transcodedFrom` per entry. RESOLVED (coordinator):** production carries it since GilbPlatform `78d1fb1d` (#691, live 2026-11-10); `listingCarriesTranscodedFrom: true` stays the default. The picture-set README sentence that the listing "does NOT carry `transcodedFrom`" (`units/picture-set/README.md:91`, and the comment at `units/picture-set/src/files.ts:24`) is **stale**; to be corrected in that unit, not here.
4. **Strict DPoP default. APPROVED (coordinator); "platform" mode exists too.** Stricter than the platform on `/lws` and `/files` (the platform treats no header as anonymous and accepts a proof-less `DPoP` token). Chosen to catch an unsigned call, as the brief asks; Kai should confirm.
5. **Empty-proof behaviour on strict routes.** `principal.ts:151` passes `""` when the `DPoP` header is missing; I did not read `verify.ts:380-412` to see the exact refusal, only that all failures are 401 (`verify.ts:353`). Fake answers 401.
6. **Validation error body.** Fastify schema failures (400) use the app's error handler (`src/server/app.ts:192`+). I read the `{error,message}` window but not the exact `error` token for a schema failure. Fake uses `{error:"Bad Request", message}`.
7. **409 name-taken body.** `VaultNameTaken` carries `suggestion`; whether the handler spreads it into the JSON I did not read. Fake includes it.
8. **`vault` in grant/revoke body.** The schema comment says the `/base` namespace (`authz.ts:158`); the vault-access unit sends the vault id as listed (`/vault`). I did not read `authorizeHoldsControl` to see if both resolve. Fake accepts both forms for the same vault.
9. **`transcodedFrom` PATCH on a file entity.** Routed through the same `PATCH /lws/r/:id`; picture-set does it in production, so it works there; I did not read why `readEntityControl` admits a file entity. Fake allows it.
10. **Record document `@id`.** Fake builds `https://<host>/vault/e/<id>`; run 5 measured bare keys "like production". I did not read `frameEntity`, so the exact `@context` and key spelling beyond lws-records' own comments (`vaultContext.ts:518-520`) are UNVERIFIED.
11. **Records `type` for a typed fact set.** Run 5's create body sends `type:"t:Sailboat"`; the platform's create takes `type` as given (`lwsCreateBodySchema`, `routes.ts:1156-1165`); the list takes the bare name. Fake maps `t:Name` on create to the bare name on list. Not read in `lwsCreate` whether the platform stores `t:Name` or a full IRI, only that `typeUri` is returned on list rows.
12. **`PLATFORM_SHA` lag.** origin/main is ahead of production (see 3). The unit pins a SHA and says so; an app that ships before the platform does can pass against the fake and fail live.
13. **Sign-in host.** `wrongSignInHostRefusal` refuses request-code on a vault host (`email-auth.ts:296-300`). I did not read `wrong-sign-in-host.ts` for the body. Fake answers 400 `{error:"WrongSignInHost", message}` placeholder.

## 11. Decisions on the doubts (coordinator, at the start of part 1 / C3b)

| Doubt | Decision |
|---|---|
| 1 create-named `vaultId` segment | keep the option; default `"base"`; **UNMEASURED** until measured before release |
| 2 ended record read | follow the platform source (200 type-only document); cite `src/lws/resource-frame.ts:33-40`; a test pins it |
| 3 listing `transcodedFrom` | production carries it since GilbPlatform `78d1fb1d` (#691, live 2026-11-10); default `true`; the picture-set README sentence saying otherwise is stale |
| 4 strict DPoP default | approved; `dpop: "platform"` exists too |

## 12. Part 1 as built: what differs from the plan above

| Item | Plan | Built (0.1.0) |
|---|---|---|
| Default origin | `https://id.fake.test` | `https://fake.test` (the apex; vault hosts `<name>.fake.test`), because the code bank's credential rule sends credentials to the base origin and its subdomains |
| `transport`, `authHost`, `seedFile`, `seedPicture`, `takeName` | in the API | later parts (files, sign-in) |
| `fake.state` | a read-only view | the live state maps (not frozen): tests may read them; do not write them |
| Fastify validation 400 | `{error:"Bad Request", message}` (doubt 6) | the same; message follows Fastify's wording (`body must have required property 'facts'`, `body must NOT have additional properties`); `error` token unverified |
| `filter=` on the record list | the platform has it | answers `400 fake_platform_not_faked` in part 1 |
| Write refused (403) message on PATCH, PUT, DELETE | the platform's write gate | `Principal <p> is not authorized to write <entity> (no current write-grant)`: modelled on the upload gate's sentence (`src/routes/files.ts:654-657`), the LWS write gate's own sentence was not read |
| PATCH on an ended record | not stated | 404 (not read in `lwsMergePatch` for an ended control row) |
| Merge patch | RFC 7386 | shallow: a fact is replaced or removed whole (`applyMergePatch` was not read) |
| `GET /lws/r/:id` media type | not stated | `application/ld+json` when the request accepts it, else `application/json` (`negotiateMediaType` not read) |
| Host-agnostic check script | n/a | not shipped: this unit names platform hosts on purpose (the type IRI `veda.gilb.com`) |

## 13. Part 2 as built: files and grants

| Item | Plan | Built (0.1.0 part 2) |
|---|---|---|
| Files in state | `files` store | `state.files`: a file is a record-shaped entity (so `PATCH` and `GET /lws/r/<id>` reach it, row 17 = row 9's route) plus `bytes`; it is not in `state.records`, so the record list never shows it (`src/lws/records.ts:406`) |
| `contentHash` | `sha256:<hex>` in the brief | bare 64-hex SHA-256, as the platform names it (`a:fileContentHash`, `src/read/file-browse.ts:93`); only the ETag of `GET /files/:id` is `"sha256:<hex>"` (`src/routes/files.ts:953`) |
| Identical upload | same bytes | same vault, bytes, name, media type, folders, tags, stored-with and uploader (the identity hash, `src/files/file-store.ts:444-454`); an ended file does not match |
| File listing fields | 13 | 12: entity, fileName, mediaType, typeUri, contentHash, byteSize, folderPaths, tags, storedWith, updatedAt, ended, transcodedFrom (`src/read/file-browse.ts:478-497`) |
| `vault-acl` level order | read, write, append, control | read, append, write, control (`src/authz/entity-acl.ts:73`) |
| `vault-acl` owner row | read, write, control | the owner holds no stored grant in the fake: `["control"]`, `owner-inferred` (`entity-acl.ts:540-555`); see doubts below |
| Bare-host grantee | "check what the platform answers" | the platform RESOLVES a bare host or `/i` WebID that names a vault to the holder's principal and grants it (201); only one that names no vault on this host family is 400 `"<x>" names no one on GilbPlatform…` (`src/authz/vault-grant.ts:214-230,293-311`). vault-access refuses it before sending: a client over-refusal |
| Query schema of the listing | n/a | an unknown key, a non-digit `limit`/`offset`, an empty value or a bad `lifecycle` is 400 (Fastify wording; `error` token unverified) |
| Order of 400 vs 401 | schema first on the platform | the fake authenticates first: an unsigned call with a bad body is 401 here, 400 on the platform |

Doubts, part 2 (each a possible defect):

1. **Owner row of `vault-acl`.** If the platform stores a self-grant for a vault's creator (`seedCreatorGrant`, `src/routes/vault.ts:570`), the owner row would be `read, write, control` with `kind: "grant"`. I read no stored answer. The fake follows the source's rule for an owner with no stored grant.
2. **Vault address grantee resolves to the holder's opaque principal** (`/base/p/<id>`). The platform may instead key a person's vault-root URI as the principal (`src/routes/email-auth.ts:510-517`); the fake's people use opaque principals everywhere, consistently.
3. **File `typeUri`** is the full GilbVeda IRI, as record rows are; the stored form for a file's type (`t:File` or the IRI) was not read.
4. **File order** is code-point order on `fileName`; the platform sorts in SQL, whose collation I did not read. Names differing only by case or accents may order differently.
5. **`transcodedFrom` filter** matches on the id tail of the master's URI, not the whole URI (`transcodeCandidates` was not read).
6. **Files in `type=` lists.** `GET …/records?type=ImageFile` lists no files in the fake; the platform's typed list may include them.
7. **Listing during a write.** The listing's `count` is the live total; the platform caps it for a `transcodedFrom` lookup at 201 (`src/read/file-browse.ts:70-75`); not modelled.
8. **`GET /lws/r/<file id>`** serves a document of the file's facts; its real shape was not read.
9. **Control holders in `/lws/vaults`.** A control-only grant lists nothing (the list speaks read and write); the platform's derivation of `modes` for a control holder was not read.
10. **Public and reach grants, groups** are not modelled (`grant-vault-public`, `grant-vault-reach`, `/base/g/`): an opaque key is stored as sent.
