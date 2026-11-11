# Sign-in unit

Reusable GilbPlatformCode login artefact. One email one-time-code card, the DPoP proof every signed-in call carries, the session credential an app holds after sign-in, and a machine agent's sign-in. Not a second login. Passkey offer is host wiring, not this unit.

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

The taking application is not the data of record. This module writes no vault facts. Browser `sessionStorage` / `localStorage` hold only a 15-minute pending mailbox key `${appId}.pendingSignInEmail`. The session token and the DPoP key are held in memory. On a cookieless page they are also kept in IndexedDB on that page's origin, together with the renewal credential when one was issued, for up to 14 days from last use; see "Stays signed in across a reload".

## Wire (paths join the injected origin)

```
POST {origin}/base/auth/email/request-code
{ "email": "<mailbox>", "return_to"?: "<absolute url>" }

POST {origin}/base/auth/email/verify-code
{ "email": "<mailbox>", "code": "<6 digits>", "dpopJwk": {}, "name"?: "<vault slug>", "renew"?: true, "renewWindowSec"?: <seconds> }

POST {origin}/base/auth/email/renew     DPoP proof only (no Authorization, no ath)
{ "renew": "rsi1.<familyId>.<secret>" }
→ { "token", "renew", "renewExpiresAt", "principal" }

POST {origin}/base/auth/sign-out        Authorization: DPoP <token>, DPoP proof
→ 204

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
- `invalidate()` is the re-mint after a 401. It keeps the in-memory key and drops the stored access token. A renewal credential on that record stays, so a reload can renew. `invalidate(true)` is sign-out: a mint already on the wire is dropped, a kit-made key is replaced, and the stored record is deleted. A host-passed key is never dropped and never stored.
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

`restore()` does not replace a sign-in this credential already holds. If a token is already held when it is called, or a sign-in or `adopt` starts while the load is in flight, it adopts nothing, writes nothing, and clears nothing, and returns the held session (or null when that sign-in has not produced a token yet). A sign-out during `restore()` still wins: the result is null and the record is deleted. A dead sign-in during that load adopts nothing and does not delete the record.

Only a fresh sign-in (`signInWithCode`, or `adopt` of a new token) may create or replace the record. A tab may change the shared record on its own behalf when that record holds this tab's `publicKeyId` and either exactly its current `renew` credential or an earlier `renewExpiresAt` for that same key and the same family, or, when the record has no `renew`, the same access token. The compare is the server time, in one readwrite transaction. The time orders credentials only inside one family. A later `renewExpiresAt` of that family is left alone. An equal time with a different credential of that family is left alone. Another key, another family, or a credential with no family id is left alone. If the record is missing, or it holds another key or credential, the update writes nothing. Only an explicit sign-out (`invalidate(true)` or `signOut`) clears unconditionally. That is the person's intent for this app on this device. A credential that `restore()` adopted is in that update-only state. Two tabs can share the record: when one tab signs out, the other's later save does not put the record back, and a reload stays signed out.

`restore()` checks that the stored private key matches the stored public key. It signs a fixed challenge with the private key and verifies that signature with the public key. A mismatch is not a session: `restore()` deletes the record and returns null.

## Changes in 0.2.5

Patch release, additive only.

A cookieless sign-in can now last up to 14 days from last use. The access token is still the one verify-code minted. When that token is inside the 60 second guard, or already expired, the client renews it with a separate credential instead of sending the person through the code again. Presenting a credential the server has already replaced, after its one acceptance of the immediately previous credential, ends the whole sign-in. This client sends that same credential once more within 45 seconds of the attempt, measured when the request is about to be sent, and once more after that window. Two tabs must still not both present it.

- `SessionCredentialOptions.renew` defaults to true on a credential that stores. It is ignored, and `renew` / `renewWindowSec` are never sent, when `dpopMintUrl` is set, when `store` is `false`, or when the host passes `key`. `renew: false` turns renewal off.
- `renewWindowSec`, when passed, must be an integer from 300 to 1209600. Anything else throws `TypeError` from the constructor. When it is omitted, the client sends 1209600 (14 days).
- `signInWithCode` then sends `renew: true` and `renewWindowSec` on verify-code. The answer's `renew` and `renewExpiresAt` are kept in memory and on the stored record. The record version stays 1. A record without those fields cannot renew.
- `restore()` on start-up renews when the stored token is inside the guard or expired and `renewExpiresAt` is still in the future. That is the only request `restore()` makes. A live token is still adopted with no request. Do not call `renew()` on every visibility change. `authHeaders` renews when the token is near expiry.
- `authHeaders` renews first in that same guard, when a credential is held, on the path a cookie-bridge re-mint already used.
- `renew()` does it when the app asks. It is not part of start-up and not something to call on every focus.
- One renewal runs at a time on a credential. Across tabs it runs inside `navigator.locks` under the name `gilb-signin-renew:` plus the sign-in origin, when that API exists. Inside the lock the client re-reads the store. If the stored credential for this same key and the same family has an earlier `renewExpiresAt`, it is older. This tab does not adopt it: it writes its current record over that credential and continues with its current credential. If the stored credential of this same family has a later `renewExpiresAt`, another tab already rotated this family. When that token is still outside the 60 second guard, this tab adopts the record and does not call the platform. If that token is inside the guard or expired and the adopted renewal is still in date, this tab renews with the adopted credential before it releases the lock. If that renewal has already expired, the sign-in is over: this tab drops its sign-in and clears the record only when the stored record is still that dead credential. A record that holds another key or credential is left alone, and `authHeaders` throws `NotSignedInError`. If the store has no record and this tab had stored one, that is another tab's sign-out only when the record this tab last saw or wrote was this tab's own family: this tab drops the in-memory sign-in and does not present. An empty store left by another family's death, or a record whose family this tab cannot name, does not sign this tab out. This tab keeps its sign-in and writes its own record back when the store is still empty, or when it holds this same family at an earlier `renewExpiresAt` or the same credential. A load that fails or times out is not an empty record. The rotated credential is stored before the lock is released when the stored record holds this tab's current credential, or the same key with an earlier `renewExpiresAt`. The compare is that time, inside the same transaction. A later time in that same family is left alone. An equal time with a different credential of that family is left alone: it is not overwritten and it is not adopted. The compare uses the server's times only. This client does not add a millisecond to a tied time. A stored record of another family, or a credential with no parsable family id, is not adopted and is not written over. This tab renews its own credential. If that family is refused, this tab ends its own in-memory sign-in and clears the store only when the stored record is still that same family. It does not present the other credential. A plain `invalidate()` drops the token and leaves this renew running. A `restore()` in that gap can adopt the stored record before the request is sent. The request presents the credential this tab holds after that adopt, not the secret captured when the renew began. If that save returns and the store still holds an earlier credential, this tab tries the save again before it releases the lock, so a stale write that slipped in does not leave the earlier credential stored. The new session stays in memory. On the next renew, a later `renewExpiresAt` of that same family is adopted, and an earlier one is written over with the credential this tab holds. A save that throws or times out is retried in the background after 0.5 s, 2 s, and 5 s, then on every later call, until it lands or the compare refuses it. A refused compare is not a successful save.
- A 401 from renew ends this tab's sign-in: the token and the credential are dropped, `session` is null, and `authHeaders` throws `NotSignedInError`. The stored record is cleared only when it is still the credential that was refused. A record holding another key, another family, or another credential is left alone. `renew()` returns null. A network error, a timeout, or a 5xx keeps the sign-in and throws `RenewalUnavailableError`. The server may already have rotated. It accepts the immediately previous credential once more, within 60 seconds of that rotation. Within 45 seconds of the recorded attempt (`renewAttemptAt`, compared when the request is about to be sent, after the mark is saved), this client presents that same credential once more. After 45 seconds it presents the held credential one last time. A 200 adopts the new token and clears `renewAttemptAt` and `renewGraceUsed`. A 401 ends the sign-in, which is the same end as giving up, and the server's reuse rule ends the family too. A network error, a timeout, or a 5xx on that last try records a new attempt time. The next try within 45 seconds is a grace retry. The client does not stay in a state that throws `RenewalUnavailableError` and sends nothing. If the attempt mark could not be saved, this page still remembers it and does not present that credential again inside the same 45 second window. A reload in that case does not see the mark. It may present the credential, and that presentation can end the sign-in.
- Every store call the renew path waits for gives up after 400 ms (`STORE_TIMEOUT_MS`). The renew request itself gives up after 10 seconds (`RENEW_TIMEOUT_MS`). The lock callback settles within that request bound plus two store bounds. A timeout is a storage failure. `signOut` and `invalidate(true)` do not wait on a renew lock this page is holding: the wait is aborted and the lock is released.
- If the save of the rotated record throws or times out, the new session stays in memory for this page. A save that does not settle is tried once more before the lock is released. A save that throws is tried several times before the lock is released, so a store that recovers is written before another tab presents the previous credential. It is then tried in the background after 0.5 s, 2 s, and 5 s, and then on every later call, until it lands or the compare refuses it. A compare that does not match is not a successful save. The save may replace a record that holds this tab's current credential, or the same key and the same family with an earlier `renewExpiresAt`. It does not replace a later time, an equal time with a different credential, another family, or another key. An equal server time is not moved: the stored time stays the time the server sent. The retry writes the credential and token this tab holds when it runs, so a plain `invalidate()` is not undone by putting the rejected access token back. Inside the next renew's lock, a stored credential of this family with an earlier `renewExpiresAt` is not adopted: this tab writes its current record over it and continues with its current credential. A stored credential of this family with a later `renewExpiresAt` is adopted when its token is outside the 60 second guard. Another family is left alone. Nothing secret is logged. A reload before that background save lands, within 60 seconds of the rotation, is recovered by the server's one acceptance of the previous credential. After those 60 seconds, the reload can present the previous credential and the sign-in may end. When a renew answer was lost and the previous credential is still what is stored, a reload within 45 seconds presents it once, as the grace retry. After 45 seconds one last try is presented. If the server had rotated, that last try is refused and the sign-in ends.
- With no `navigator.locks`, two tabs can both present the credential. The second answer is 401 and that tab is signed out.
- `signOut(origin)` posts `POST {origin}/base/auth/sign-out` with `Authorization: DPoP <token>` and a `DPoP` proof when the access token is still before its expiry, waits at most 3 seconds, then runs `invalidate(true)`. When no usable token is held and a renewal credential is still in date, it renews first (the same bounds) and signs out with the fresh token. If that renew fails, the local record is still deleted and `serverSignedOut` is false. The local record is deleted even when the server call fails or hangs. The result is `{ serverSignedOut }`. `invalidate(true)` itself is unchanged for existing callers.

## Stays signed in across a reload

A published app is a third-party page. It gets no platform cookie, so the session bridge cannot re-mint after a reload. On that path `SessionCredential` keeps the sign-in in IndexedDB on the app's own origin.

What is stored: one record in the database `gilb-signin-session`, object store `session`, key `current`. The record is version `1`. It holds the DPoP key pair as CryptoKey objects, the access token, its expiry (`expiresAt`, epoch milliseconds), and the session (`principal`, `vault`, `vaults`, `vaultsProblem`). When verify-code issued a renewal, the record also holds `renew` (the credential `rsi1.<familyId>.<secret>`), `renewExpiresAt` (the ISO date it stops being valid), and `origin` (the sign-in origin, no trailing slash, so a later page knows where to renew). After a renew attempt that may have reached the server, the record also holds `renewAttemptAt` (epoch milliseconds of that attempt). Once the grace retry has been handed to the transport, the record also holds `renewGraceUsed: true`, so a reload inside that 45 second window does not present the credential again. After the window, one last try may. A lost last try clears `renewGraceUsed` and replaces `renewAttemptAt`, and the cycle starts again. The private key is not exported and stays non-extractable. IndexedDB structured-clones the CryptoKey objects. `publicKeyId` is the public key's JWK `x` and `y` joined by `.`. Every successful rotation, and the first issue, sets `renewExpiresAt` to the server's time plus the window. The server rotates one family one at a time, so for one key and one family a later `renewExpiresAt` is a newer credential. The family id is the middle part of `rsi1.<familyId>.<secret>`, parsed once by `familyOf` and carried on the expect. One key can hold two live families: a new sign-in reuses the held key and does not end the older family, so a later time from another family is not a newer credential of this one. An update compares `publicKeyId`, that family, and that server time, inside one transaction. The stored credential's family is parsed in the same callback, and nothing awaits there. The same credential may be updated (a mark, or a dropped access token). An earlier time for that same key and the same family may be replaced. A later time is left alone. An equal time with a different credential of that family is left alone: it is not overwritten and it is not adopted. The compare uses the server's times only. This client does not add a millisecond to a tied time. On its own behalf a tab does not write over, clear, or adopt a record of another family, or a credential with no parsable family id. A fresh sign-in still saves unconditionally, which is how a new family takes the store. When the record has no `renew`, the access token is the match. `saveIfCurrent` and `clearIfCurrent` resolve `true` when the write or delete was made and `false` when the compare refused it. `restore()` clears a record whose `publicKeyId` is missing or is not that public key, and only when that record is still the one it read. A record with no `renew` cannot be renewed. A plain `invalidate()` leaves `renew`, `renewExpiresAt`, `origin`, `renewAttemptAt`, and `renewGraceUsed` on the record and clears the access token, when the stored record is that same credential or an earlier `renewExpiresAt` for that key and that family. A later time, another family, or a credential with no family id is left alone. A save of the rotation that is still waiting writes the empty token, not the token that was dropped.

How long: up to the window the app chose at sign-in, at most 14 days from the last successful renewal (`renewWindowSec`, default 1209600). The access token itself is unchanged and still dies on its own expiry. `restore()` returns the session with no request when the token still has more than 60 seconds of life (`EXPIRY_GUARD_MS`). When the token is inside that guard or already expired, and `renewExpiresAt` is still in the future, `restore()` renews instead of clearing. That renew is the only request `restore()` makes. When the record is absent, the version is not 1, the record is malformed, the public key does not match the private key, or the token cannot be used and cannot be renewed, `restore()` clears it and returns null. The pair check signs a fixed challenge with the stored private key and verifies it with the stored public key. The private key is not exported.

`authHeaders` renews on that same guard when a credential is held, then signs the request with the new token. Call `restore()` on start-up. Let `authHeaders` renew near expiry. `renew()` is there when the app explicitly wants a renewal. Do not call it on every visibility change. The proof for `POST {origin}/base/auth/email/renew` carries no access token and no `ath`. The body is `{ renew }`. A 200 replaces the token and the credential and clears `renewAttemptAt` and `renewGraceUsed`. The vault list already held is kept, and `principal` is taken from the answer. A 401 ends this tab's sign-in and clears the stored record only when it is still that same family and the credential that was refused. A record holding another key, another family, or another credential is left alone. A network error, a timeout, or a 5xx leaves the sign-in in place and throws `RenewalUnavailableError`. The server may already have rotated: it accepts the immediately previous credential once, within 60 seconds. This client sends that credential once more within 45 seconds of `renewAttemptAt`, including after a reload. The 45 seconds are measured when the request is about to be sent, after the attempt mark is saved, so transit still fits under the server's 60 seconds. After 45 seconds the client sends the held credential once more. If the server never saw the earlier attempt, that request renews. If the server did rotate, the answer is 401, the sign-in ends, and the family ends with it. A network error, a timeout, or a 5xx on that last try records a new `renewAttemptAt`, and the next try within 45 seconds is a grace retry. If the mark could not be saved, this page does not send that credential again inside the same 45 second window. A reload does not see the mark, so it may present the credential, and that presentation can end the sign-in.

Two tabs share one record. The renewal runs inside `navigator.locks` under `gilb-signin-renew:` plus the origin when that API exists. The client re-reads the store inside the lock. If the stored credential for this key and this family has an earlier `renewExpiresAt`, this tab does not adopt it: it writes its current record over that credential and continues with its current credential. If the stored credential of this same family has a later `renewExpiresAt`, another tab rotated this family. A stored record of another family, or one whose credential has no parsable family id, is not adopted and is not written over. This tab renews the credential it holds. If that family is refused, this tab ends its own in-memory sign-in and clears the store only when the stored record is still that same family, so the other family's record stays. It does not present the other credential. When the later record is this same family, this tab adopts that record when its token is outside the 60 second guard, and does not call the platform. When that token is inside the guard or expired and the renewal is still in date, this tab renews with the adopted credential under the same lock. When that renewal has expired, the sign-in is over: this tab drops its sign-in and clears the record only when it is still that dead credential. A record holding another key or credential is left alone, and the next `authHeaders` throws `NotSignedInError`. If the load returns no record and this tab had stored one before, the other tab signed out only when the record this tab last saw or wrote was this tab's own family. This tab then clears its in-memory sign-in and does not present the credential. An empty store left by another family's death does not sign this tab out. This tab keeps its sign-in and writes its own record back when the store is still empty. A family this tab cannot name is treated the same way: the tab stays signed in. `authHeaders` throws `NotSignedInError` and `renew()` returns null. A load that fails or times out is not an empty record: the sign-in stays, and nothing is presented. The rotated credential is written before the lock is released when the stored record holds this tab's current credential, or the same key and the same family with an earlier `renewExpiresAt`. A later time, an equal time with a different credential, another family, or another key is not overwritten. The order uses the server's times only. If that save throws or times out, this page keeps the new session in memory, does not log the credential, and retries the save in the background after 0.5 s, 2 s, and 5 s, then on every later call, until it lands or the compare refuses it. A refused compare is not a successful save. On the next renew, a stored credential of this family with an earlier `renewExpiresAt` is not adopted: this tab writes its current record over it and continues with its current credential. A later `renewExpiresAt` of this family is adopted instead. Another family is left alone. A reload before the background save lands, within 60 seconds of the rotation, is recovered by the server's one acceptance of the previous credential. After those 60 seconds, the reload can present the previous credential and the sign-in may end. When a renew answer was lost, a reload within 45 seconds can present the stored credential once. After that, one last try is presented, and a refusal ends the sign-in. A sign-out during an in-flight renewal wins: the answer is not stored, and this page does not keep waiting on the lock. With no `navigator.locks`, the two tabs can both present the credential. The platform then ends the sign-in, and the tab whose request arrives second is signed out.

`signOut(origin)` posts the sign-out to the server (`POST {origin}/base/auth/sign-out`, DPoP headers, at most 3 seconds) when the access token is still before its expiry, then deletes the local record the way `invalidate(true)` already did. When no usable token is held and a renewal is still in date, it renews first and signs out with the fresh token. If that renew fails, the local record is still deleted and `serverSignedOut` is false. The local delete runs even when the server call fails or never returns. `{ serverSignedOut: true }` means the server answered 204. A renew already running on this page is not waited on: sign-out aborts that wait and releases the lock.

`restore()` is a no-op when this credential is already signed in, or when a sign-in is already on the wire. It does not adopt the loaded record, does not write, and does not clear. The result is the session already held, or null if the sign-in has not returned a token yet. A sign-out during that load still wins.

When this instance's own sign-in has died — a renew 401, an expired renewal, or a dead family — and the person did not sign out on this instance, `restore()` is a fresh page. It loads the store and adopts a valid record of any family, including a newer sign-in another tab saved. An empty or unusable record returns null. This call does not clear the store unconditionally. Until that `restore()`, or a new sign-in, succeeds, `authHeaders` throws `NotSignedInError` and `renew()` returns null. An app that sees that shows its sign-in card and may call `restore()` first: the store may already hold the person's current sign-in from another tab. A death that lands while a `restore()` is already loading adopts nothing from that load and does not clear; call `restore()` again. `restore()` after an explicit sign-out on this instance (`invalidate(true)` or `signOut`) still clears and returns null. It does not adopt a record that sign-out was clearing.

A fresh sign-in in another tab replaces the stored record. This tab's older family is then not what the store holds. Within 60 seconds of a rotation the server still accepts the previous credential once. After that window, this tab presenting the older credential is the server's reuse rule, and that family ends. The client does not treat the other tab's new sign-in as a sign-out of this one. Two credentials of one family that share a `renewExpiresAt` to the same millisecond are a tie: this client does not add a millisecond, does not adopt the stored tie, and does not write over it, so one of those sign-ins stays only in memory. An empty store signs this tab out only when the record it last saw or wrote was its own family. If another family was stored and cleared before this tab loaded it, the empty store looks like this tab's own sign-out, and this tab signs out without presenting.

A store call the credential waits for gives up after 400 ms (`STORE_TIMEOUT_MS`). A timed-out save or a timed-out clear is a storage failure: the person stays signed in for this page, in memory. A timed-out load makes `restore()` return null and leaves the record where it is, so the next reload can still adopt it. `signInWithCode`, `adopt`, and `loadReachableVaults` start the save and do not wait for it. `invalidate(true)` starts the delete immediately and waits at most 400 ms. `authHeaders` waits on the store only while it is renewing, and those waits are the same 400 ms. The renew request gives up after 10 seconds (`RENEW_TIMEOUT_MS`). The cross-tab lock is released when that work settles, or sooner when `signOut` or `invalidate(true)` aborts it.

The private key cannot be read out as JWK or PKCS8. Any script on the app's origin can still use it, while the page is open or on a later visit, to sign DPoP proofs. The renewal credential is stored beside it: any script on the app's origin can use that credential together with the key, the same way it can use the key alone. An XSS in the app can do that. Sign-out (`signOut(origin)`, or `invalidate(true)`) deletes the record. A later `restore()` then returns null.

A first-party app that passes `dpopMintUrl` stores nothing: the cookie bridge re-mints, as before. An explicit `store` passed together with `dpopMintUrl` is ignored. Nothing is written and `restore()` returns null. `store: false` stores nothing. A host-passed `key` is never stored; the host owns it. Pass `store` to replace the IndexedDB adapter, for tests or for a host that keeps the record itself, only on a credential that does not pass `dpopMintUrl`.

Only the save that follows a fresh sign-in (`signInWithCode`, or `adopt` of a new token) may create the record or replace whatever was there. Later saves from that same credential — a vault-list refresh, a dropped token after a 401, a rotation — are updates. A tab may change the shared record on its own behalf when that record holds this tab's `publicKeyId` and either exactly its current `renew` credential or an earlier `renewExpiresAt` for that same key and the same family, or, when the record has no `renew`, the same access token. It never overwrites a later `renewExpiresAt`, an equal time with a different credential, another family, a credential with no family id, or another key. The time order uses the server's times only. The compare runs in one readwrite transaction. `saveIfCurrent` and `clearIfCurrent` resolve `true` only when the write or delete was made. If the record is missing, or it holds another key or credential, the update writes nothing. Only an explicit sign-out (`invalidate(true)` or `signOut`) clears unconditionally. That is the person's intent for this app on this device. A renew 401, an expired renewal, or an adopted record that cannot be used, clears only when the stored record is still that dead credential. An empty store, after this tab had stored one, signs this tab out only when the record it last saw or wrote was its own family. Another family's empty store does not: this tab writes its own record back when the store is still empty. `restore()` puts the credential into that update-only state. Two open tabs share one record. Tab A signs out and the record is deleted. Tab B, which restored earlier, may later refresh its vault list: that save does not put the record back. A reload stays signed out. On its next renew, when the record tab B last saw or wrote was its own family, tab B sees the empty store and signs out without presenting. An empty store left by another family does not sign tab B out.

```ts
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";

const session = new SessionCredential({ renewWindowSec: 7 * 24 * 60 * 60 }); // optional; default is 14 days
const restored = await session.restore(); // on start-up, and again after this tab's own sign-in has died. A dead tab may find another tab's current sign-in. Renews only when the token is inside 60 seconds and the credential is still in date.
if (!restored) {
  // show the sign-in card, then:
  await session.signInWithCode(ORIGIN, email, code);
}
// Later requests: authHeaders renews when the token is near expiry.
// Do not call renew() on every visibility change.
await session.signOut(ORIGIN); // server sign-out, then the local record is deleted
```

IndexedDB can fail (it is missing, the quota is full, the browser is in private mode, the open is blocked, or a call does not settle within 400 ms). Sign-in still works in memory. `restore()` returns null. A load that timed out does not delete the record.

Sign-out starts the delete before `invalidate(true)` returns when the database is already open, so a page that closes immediately still has a delete transaction queued. IndexedDB commits that transaction asynchronously. If the browser discards the document before the commit, the record can remain. A save that was already committing can also land, and this credential deletes again when that save finishes — which does not run if the page is already gone. The next `restore()` refuses a token inside the 60 second guard when that leftover record has no renewal credential. A leftover record that still holds a live credential is renewed. `signOut(origin)` ends the credential on the server first, so that renewal is refused and the record is then cleared.

A plain `invalidate()` (the re-mint after a 401) keeps the in-memory key and drops the stored access token when the stored record is this tab's credential or an earlier `renewExpiresAt` for that key and that family. If another tab has rotated to a later `renewExpiresAt` in that same family, the write does nothing, and this tab adopts the newer record on its next renew. Another family is left as it is. When the write lands, the key stays in the record with an empty token, so the rejected token is not what a reload adopts. A rotation save that is still waiting writes that empty token, not the token `invalidate()` dropped. `renew`, `renewExpiresAt`, `origin`, `renewAttemptAt`, and `renewGraceUsed` stay on the record, with the session, so a reload renews. When the record has no renewal credential, `restore()` sees no usable token, clears the record, and returns null.
