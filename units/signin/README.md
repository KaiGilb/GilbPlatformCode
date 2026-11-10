# Sign-in unit

Reusable GilbPlatformCode login artefact. One email one-time-code card, the DPoP proof every signed-in call carries, the session credential an app holds after sign-in, and a machine agent's sign-in. Not a second login. Passkey offer is host wiring, not this unit.

## What this is

The email one-time-code card, the DPoP proof on every signed-in call, the session credential an app holds, a machine agent's sign-in, and creating a named vault and listing the vaults a person can reach.

Four entries:

| Entry | What it is | React |
|---|---|---|
| `.` | The card (`SignInCard`, `VaultNameStep`) and everything in `./core` | yes (peer) |
| `./core` | Headless: the HTTP calls, DPoP proofs, the transport, the pending-mailbox key | no |
| `./session` | `SessionCredential`: the token and DPoP key a signed-in app holds | no |
| `./machine` | `MachineCredential`: a worker signs in as its own registered client | no |

`./signin.css` styles the card.

## Injected (never baked)

| Input | Meaning |
|---|---|
| `app.id` | Storage prefix, e.g. `"gilbapp"` |
| `app.productName` / `app.title` | Words on the card |
| `app.origin` | Vault-server origin. No trailing slash. Not hardcoded. |
| `app.returnTo()` | Absolute URL branded into the one-time-code email |
| `auth` | Host-supplied request / verify / name. HTTP helpers live in `./core`. |
| `dpopMintUrl` | `./session` only. The DPoP session bridge URL. Optional. |
| `idOrigin`, `clientId`, `key` | `./machine` only. The identity origin, the registered client, its private key. |
| `transport` | Optional on every HTTP call. Default: the global `fetch`, looked up per call. |

The taking application is not the data of record. This module writes no vault facts. Browser `sessionStorage` / `localStorage` hold only a 15-minute pending mailbox key `${appId}.pendingSignInEmail`. The session token and the DPoP key are held in memory. On a cookieless page they are also kept in IndexedDB on that page's origin until the token expires; see "Stays signed in across a reload".

## Wire (paths join the injected origin)

```
POST {origin}/base/auth/email/request-code
{ "email": "<mailbox>", "return_to"?: "<absolute url>" }

POST {origin}/base/auth/email/verify-code
{ "email": "<mailbox>", "code": "<6 digits>", "dpopJwk": {}, "name"?: "<vault slug>" }

POST {origin}/onboard/api/name-prep
POST {origin}/onboard/api/check-name
```

JSON keys `email`, `code`, `return_to`, `dpopJwk`, `name`, `principal` are the existing auth contract. They are not vault datoms. Do not write `a:email` for sign-in.

Session bridge (`./session`, only when the host passes `dpopMintUrl`):

```
POST {dpopMintUrl}            credentials: include, X-Base-Csrf: 1
{ "dpopJwk": {} }
→ { "access_token", "expires_in"?, "cnf"?: { "jkt" }, "principal", "vault"?, "vaults"?: [{ "vaultId", "modes" }] }
```

401 is `NotSignedInError`. 403 is `OriginNotAllowedError` (this app's origin is not admitted). A 2xx with no token is refused.

Reachable vaults after a code sign-in (`./session`). verify-code returns no vault list, and the bridge above is first-party only, so a third-party app reads the list itself:

```
GET {origin}/lws/vaults       credentials: omit, Authorization + DPoP, Accept: application/ld+json, application/json
→ { "vaults": [{ "vaultId", "modes" }], "complete", "incompletePeers" }
```

`REACHABLE_VAULTS_PATH` is that path. A list that cannot be read, or that is partial (`complete: false`), leaves the sign-in in place and sets `session.vaultsProblem`.

Machine token (`./machine`):

```
POST {idOrigin}/base/oauth/token        DPoP: <proof>, x-www-form-urlencoded
grant_type=client_credentials
client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
client_assertion=<ES256 JWS: iss = sub = clientId, aud = the token URL's htu, exp = iat + 60 s, jti>
scope=base.write
→ { "access_token", "token_type": "DPoP", "expires_in", "scope" }
```

Every authenticated call carries two headers: `Authorization: DPoP <token>` and `DPoP: <proof>`. The proof's `htu` is derived from the URL of the request being made, so a call to a vault is signed for that vault's own host. There is no parameter to choose `htu`; that parameter would be the defect.

## Session credential (`./session`)

```ts
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";

const session = new SessionCredential({
  dpopMintUrl: `${ORIGIN}/base/auth/session/dpop-token`, // optional: first-party only, re-mints from the session cookie
});
await session.signInWithCode(ORIGIN, email, code);       // verify-code with the credential's own key
const headers = await session.authHeaders("GET", url);   // Authorization + a fresh DPoP proof
```

- One DPoP key per credential. The kit makes it (private half non-extractable), or the host passes `key` for a key the kit cannot hold, such as a Secure Enclave signer: `{ publicJwk, sign }`, where `sign` returns a raw 64-byte ES256 signature. A DER signature is refused with an error that says DER.
- Concurrent callers share one mint. It re-mints inside a 60 s guard band. A token whose expiry cannot be read counts as lasting 5 minutes. `authHeaders(method, url, freshForMs)` re-mints first when the token would not last `freshForMs`.
- `invalidate()` is the re-mint after a 401. It keeps the in-memory key and drops the stored token. `invalidate(true)` is sign-out: a mint already on the wire is dropped, a kit-made key is replaced, and the stored record is deleted. A host-passed key is never dropped and never stored.
- Never cache `authHeaders`. Each proof is single-use.
- `signInWithCode` then calls `loadReachableVaults(origin)`: `GET {origin}/lws/vaults`, one fresh proof, cookies omitted. A trailing slash on `origin` is removed. Modes narrow to read and write; an entry with no `vaultId` is dropped. `principal` and `vault` stay as they were. A list problem does not throw: the request was unreachable, not 2xx, not readable, `vaults` was not an array, `complete` was false, or the proof could not be built because the token runs out inside the 60 s guard. The vaults stay as they were when no list was read, and `session.vaultsProblem` is the sentence. The list is stored only on the token the read started with. A sign-out while the proof is built or while the request is on the wire throws `NotSignedInError` and stores nothing. A newer sign-in, or a plain `invalidate()`, stores nothing and does not throw.
- After a code sign-in the session holds each reachable vault's `vaultId` and `modes`. For names, parents and the landing flag, call `listReachableVaults` (units/reachable-vaults).

## Machine credential (`./machine`)

```ts
import { importMachineKey, MachineCredential } from "@kaigilb/gilbplatformcode-signin/machine";

const key = await importMachineKey(env.MACHINE_JWK); // P-256 private JWK, held as a worker secret
const machine = new MachineCredential({ idOrigin: ID_ORIGIN, clientId, key: key! });
const headers = await machine.authHeaders("POST", url);
```

The token is reused until 30 s before it expires. `invalidate()` after a 401. A refusal, an unreachable endpoint, a 2xx with no token, and a 2xx whose body is not JSON are `MachineTokenError` (`status` 0 means no answer arrived).

## Take

```ts
import { SignInCard } from "./src/index.ts";
import "./src/signin.css";

<SignInCard app={hostApp} auth={hostAuth} onSignedIn={() => { /* host adopts token */ }} />
```

Headless (no React):

```ts
import { requestSignInCode, verifySignInCodeHttp, generateDpopKeyPair, dpopHeaders } from "./src/core.ts";
```

### Installing it into your app

Your app needs TypeScript 5.7 or later, with `strict` on. The source uses the generic `Uint8Array<ArrayBuffer>`, which an older compiler rejects ("Type 'Uint8Array' is not generic"), and without `strict` the card does not typecheck.

Install it as a copy, not a link, so your app has one copy of React. First put this line in your app's own `.npmrc` (the unit's own `.npmrc` does not apply to your app's install):

```
install-links=true
```

Then install it:

```sh
npm install <path-to-the-library>/units/signin
```

Every later `npm install` and `npm ci`, CI included, then keeps the copy. Without that line a plain install makes a link, the unit brings a second copy of React, and the app fails with "Invalid hook call" and a type error that "two different types with this name exist". A one-off `npm install --install-links <path>` works only until the next plain install, and `npm ci` then refuses the lock file.

## Make a vault for your app

`createNamedVault` posts once to `{origin}/base/vault/create-named` (signed, DPoP):

```
{ "name": "<vault name>", "represents": "<GilbVeda type IRI>", "parentVault"?: "<vault id>" }
```

`represents` is REQUIRED and must be the full IRI of a live GilbVeda type (for example a person type or your app's own type). The platform refuses a vault without one ("represents is required: ..."), and the kit throws before any network call when it is empty. Success is 201 `{ vault, vaultId, name, parent, represents, created: true }`. A refusal (400, 403, 404, 502, 503) throws `VaultRequestRefusedError` carrying `status` and `platformMessage`, the platform's `message ?? error` word for word. It is posted once and never retried: the platform has no idempotency.

The platform normalises every name: lower-case, only a-z and 0-9 kept, and `user` when nothing is left. `johndeveloper-sailboats` is saved as `johndevelopersailboats`, so look it up by `normaliseVaultName("johndeveloper-sailboats")`, not by what was typed. `checkVaultName` answers the normalised `name` and the raw text in `requested`; it carries `suggestion` (a free name) and `message` only when the name is taken.

```ts
import { checkVaultName, createNamedVault, listVaults, normaliseVaultName } from "@kaigilb/gilbplatformcode-signin/core";

const origin = "https://<your-vault-host>";                      // injected, never baked
const check = await checkVaultName(origin, "johndeveloper-sailboats");
const name = check.available ? check.requested! : check.suggestion;  // suggestion only when taken
if (!name) throw new Error(check.message);
const made = await createNamedVault(origin, { name, represents: "<GilbVeda type IRI>" }, { credential });
const again = (await listVaults(origin, { credential })).find((v) => v.name === normaliseVaultName(name));
console.log(made.vaultId === again?.vaultId, again?.represents, again?.isLandingVault);
// a vault's address is https://<name>.gilb.com/vault, e.g. https://johndevelopersailboats.gilb.com/vault
```

The `vaultId` create-named answers is the home namespace `https://<slug>.<domain>/base`, while `listVaults` shows the same vault as `https://<slug>.<domain>/vault`. Match a made vault in `listVaults` by its normalised name or by host (`sameVaultHost(a, b)`), not by the full `vaultId` string. `vault` (the entity URI) is absent when the answer did not carry it.

The platform answers 202 instead of 201 when the mint is partial: the vault's facts are committed but the register commit did not happen. The result then has `complete: false`: send the same request again to finish it. The kit never retries for you.

`credential` is the `SessionCredential` the app signed in with. `listVaults(origin, { credential, transport? })` reads `GET {origin}/lws/vaults` signed the same way `loadReachableVaults` does and returns `{ vaultId, modes, name?, represents?, isLandingVault, partOf? }[]`. `represents` is a string whether the platform sent a string or `{"@id": ...}`. An entry with no `vaultId` is dropped.

## Do not

- Do not sign every call for the identity host. A vault call signed that way is refused with 401 `DPoP proof htu does not match the request URI`.
- Do not persist the DPoP key or the token to `localStorage`, and do not write a second copy beside the session credential's IndexedDB record. The credential stores the CryptoKey objects itself on a cookieless page. An app does not export the private key.
- Do not treat a native bridge that sends no `Origin` header as proof that the platform admits your app. Admission is measured from a browser origin.
- Do not call a platform host through a proxy that rewrites the host. The server compares `htu` with the host it received.

## Changes in 0.2.1

After an email-code sign-in (signInWithCode) the session holds no vault list, until a token renewal brings one. Call listReachableVaults (units/reachable-vaults) after sign-in for the vaults this person can reach; do not read them from the session. `signInWithCode` adopts the token with an empty vault list. No code changed.

## Verify (in this artefact)

```sh
cd units/signin
npm install
npm test
npm run typecheck
npm run check:host-agnostic
```

Tests mock fetch or run a local `node:http` server. They prove request shape, host injection, proof shape and the credential's races, not a live mailbox. The host-agnostic check fails when any source line names a host on its fixed list (see `scripts/check-host-agnostic.mjs`), or when a headless entry (`core`, `session`, `machine`) or a file it imports reaches anything but a sibling module. The one exception is the first-party page-host literals in `credentialsForPage` (`src/http.ts`): each appears once, and they classify the page for the verify-code cookie decision rather than naming a request target.

## Source

The private `gilb-signin` package, 0.5.0. The card keeps this unit's host-agnostic default: the vault-address preview shows when check-name returns an `address`, or else when name-prep returns a `webIdDomain`.

## Changes in 0.2.2

verify-code sends cookies only on a first-party page. `credentialsForPage` answers "include" for an exact hostname of gilb.com, www.gilb.com, localhost, 127.0.0.1 or [::1], and "omit" for every other page and for a page with no location. An explicit credentials option still wins. An attested third-party origin gets no Access-Control-Allow-Credentials, so "include" there made the browser drop the verify-code answer. The token is already in the JSON.

`signInWithCode` reads the reachable vaults from `GET /lws/vaults` after the code is accepted. verify-code returns none, and the session-cookie bridge is first-party only, so a third-party app was left with `vaults: []`. A list that cannot be read or is only partial stays signed in; `session.vaultsProblem` is the sentence. `loadReachableVaults(origin)` is that read on its own.

A list problem never rejects the sign-in. A token with under 60 s left, and no bridge, used to make the proof throw `NotSignedInError` while the token stayed held. That failure now keeps the vaults as they were and sets `vaultsProblem` to "Could not read your vault list: your sign-in runs out too soon. Sign in again." A sign-out while the proof is built still throws `NotSignedInError` and stores nothing.

The list is stored only on the access token it was read with. A newer sign-in that replaced the token, or a plain `invalidate()` that dropped it, stores nothing and does not throw. The caller still gets the session this read built. A sign-out still throws `NotSignedInError`.

A trailing slash on `origin` is stripped once, so `loadReachableVaults("https://x.test/")` requests `https://x.test/lws/vaults`.

## Changes in 0.2.3

Patch release, additive only.

- `CheckNameResult` gains optional `suggestion` (the platform's offer when the name is taken) and `requested` (the raw name sent). `checkVaultName` fills both.
- New `normaliseVaultName(raw)`: the platform's rule, including the `user` fallback.
- New `listVaults(origin, { credential, transport? })`: `ListedVault[]` with name, represents, isLandingVault and partOf. The session's own vault list is unchanged.
- New `createNamedVault(origin, { name, represents, parentVault? }, { credential, transport? })`. `represents` is required. One post, no retry.
- New exported error `VaultRequestRefusedError` (`status`, `platformMessage`).
- `createNamedVault` never returns an empty `vaultId`: when a 2xx answer names none (or is not JSON), it reads `listVaults` once and returns the vault whose name is the normalised name, or throws `VaultRequestRefusedError` saying the vault was made but is not in the list yet. It never re-posts.
- `CreatedNamedVault.complete` (true on 201, false on 202: send the same request again to finish it); `vault` is optional and left out when the answer did not carry it; new `sameVaultHost(a, b)`; `vaultId` is the `/base` namespace, not the `/vault` one `listVaults` shows.

## Changes in 0.2.4

Patch release, additive only.

A cookieless page has no platform cookie, so the access token and the DPoP key used to die with the page. `SessionCredential` now keeps them in IndexedDB on that page's origin when no `dpopMintUrl` is set: the key as non-extractable CryptoKey objects, the token, its expiry, and the session. `restore()` adopts that record on start-up when the token still has its 60 second guard, and makes no request. Sign-out deletes the record. A storage failure leaves the in-memory sign-in working. A page that passes `dpopMintUrl`, `store: false`, or a host-held `key` stores nothing. When `dpopMintUrl` is set, an explicit `store` is ignored and nothing is stored: the page re-mints from the session cookie, as before.

A store call the credential waits for gives up after 400 ms (`STORE_TIMEOUT_MS`). That timeout is a storage failure. The person stays signed in for this page. `restore()` on a timed-out load returns null and does not delete the record, so a later reload can still read it. `signInWithCode`, `adopt`, and `loadReachableVaults` do not wait for the save: they start it and return. `invalidate(true)` starts the delete at once and waits at most 400 ms. `authHeaders` does not wait on the store.

`restore()` does not replace a sign-in this credential already holds. If a token is already held when it is called, or a sign-in or `adopt` starts while the load is in flight, it adopts nothing, writes nothing, and clears nothing, and returns the held session (or null when that sign-in has not produced a token yet). A sign-out during `restore()` still wins: the result is null and the record is deleted.

Only a fresh sign-in (`signInWithCode`, or `adopt` of a new token) may create or replace the record. Every later save from that credential, including a vault-list refresh, writes only when a record is already stored and its public key is this credential's key. If the record is gone, or it holds another key, the save writes nothing. A credential that `restore()` adopted is in that update-only state. Two tabs can share the record: when one tab signs out, the other's later save does not put the record back, and a reload stays signed out.

`restore()` checks that the stored private key matches the stored public key. It signs a fixed challenge with the private key and verifies that signature with the public key. A mismatch is not a session: `restore()` deletes the record and returns null.

## Stays signed in across a reload

A published app is a third-party page. It gets no platform cookie, so the session bridge cannot re-mint after a reload. On that path `SessionCredential` keeps the sign-in in IndexedDB on the app's own origin.

What is stored: one record in the database `gilb-signin-session`, object store `session`, key `current`. The record is version `1`. It holds the DPoP key pair as CryptoKey objects, the access token, its expiry (`expiresAt`, epoch milliseconds), and the session (`principal`, `vault`, `vaults`, `vaultsProblem`). The private key is not exported and stays non-extractable. IndexedDB structured-clones the CryptoKey objects. `publicKeyId` is the public key's JWK `x` and `y` joined by `.`, compared inside an update's transaction; `restore()` clears a record whose `publicKeyId` is missing or is not that public key.

How long: until the token's own expiry. `restore()` returns the session when the token still has more than 60 seconds of life (`EXPIRY_GUARD_MS`). When the record is absent, the version is not 1, the record is malformed, the public key does not match the private key, or the token is inside that guard, `restore()` clears it and returns null. The pair check signs a fixed challenge with the stored private key and verifies it with the stored public key. No request is made and the private key is not exported. This version has no renewal. A new sign-in is the way back in after the token expires.

`restore()` is a no-op when this credential is already signed in, or when a sign-in is already on the wire. It does not adopt the loaded record, does not write, and does not clear. The result is the session already held, or null if the sign-in has not returned a token yet. A sign-out during that load still wins.

A store call the credential waits for gives up after 400 ms (`STORE_TIMEOUT_MS`). A timed-out save or a timed-out clear is a storage failure: the person stays signed in for this page, in memory. A timed-out load makes `restore()` return null and leaves the record where it is, so the next reload can still adopt it. `signInWithCode`, `adopt`, and `loadReachableVaults` start the save and do not wait for it. `invalidate(true)` starts the delete immediately and waits at most 400 ms. `authHeaders` does not touch the store.

The private key cannot be read out as JWK or PKCS8. Any script on the app's origin can still use it, while the page is open or on a later visit, to sign DPoP proofs. An XSS in the app can do that. Sign-out (`invalidate(true)`) deletes the record. A later `restore()` then returns null.

A first-party app that passes `dpopMintUrl` stores nothing: the cookie bridge re-mints, as before. An explicit `store` passed together with `dpopMintUrl` is ignored. Nothing is written and `restore()` returns null. `store: false` stores nothing. A host-passed `key` is never stored; the host owns it. Pass `store` to replace the IndexedDB adapter, for tests or for a host that keeps the record itself, only on a credential that does not pass `dpopMintUrl`.

Only the save that follows a fresh sign-in (`signInWithCode`, or `adopt` of a new token) may create the record or replace whatever was there. Later saves from that same credential — a vault-list refresh, a dropped token after a 401 — are updates. An update writes only when the stored record exists and its public key is this credential's key, compared in one readwrite transaction. If the record is missing or holds another key, the update writes nothing. `restore()` puts the credential into that update-only state. Two open tabs share one record. Tab A signs out and the record is deleted. Tab B, which restored earlier, may later refresh its vault list: that save does not put the record back. A reload stays signed out.

```ts
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";

const session = new SessionCredential();
const restored = await session.restore(); // no request; null when the token is inside 60 seconds or missing
if (!restored) {
  // show the sign-in card, then:
  await session.signInWithCode(ORIGIN, email, code);
}
```

IndexedDB can fail (it is missing, the quota is full, the browser is in private mode, the open is blocked, or a call does not settle within 400 ms). Sign-in still works in memory. `restore()` returns null. A load that timed out does not delete the record.

Sign-out starts the delete before `invalidate(true)` returns when the database is already open, so a page that closes immediately still has a delete transaction queued. IndexedDB commits that transaction asynchronously. If the browser discards the document before the commit, the record can remain. A save that was already committing can also land, and this credential deletes again when that save finishes — which does not run if the page is already gone. The next `restore()` still refuses a token inside the 60 second guard.

A plain `invalidate()` (the re-mint after a 401) keeps the in-memory key and drops the stored token. The key stays in the record with an empty token, so the rejected token is not what a reload adopts. `restore()` sees no usable token, clears the record, and returns null.
