# lws-session-bridge

The one seam through which GilbPlatform client code gets its credential headers, so the same client works with any signed-in session and never sends a credential to a host outside the platform.

## What this is

The one seam through which GilbPlatform client code gets its credential headers, so the same client works with any signed-in session and never sends a credential to a host outside the platform.

A client that reads and writes vault records has to sign each request, drop the token when the server answers 401, and read who is signed in. This unit holds those calls under the names the app they were taken from gave them, and answers them from a host the app sets once. A client module copied from that app then changes only its import path. Plain functions, no React.

- `setLwsAuth(host)`: set once at start-up. Every function below delegates to it. Called before it is set, they throw a sentence that names `setLwsAuth` (the async ones reject with it). `resetLwsAuth()` forgets the host (a test seam).
- `bearerHeaderFor(url, method?)`, `dpopReadAuth(method, url)`, `dpopWriteAuth(method, url)`: the headers of one request. Each first asks `credentialAllowedAt(url)` of `vault-origin-rule` and answers `{}` for a URL outside the platform, without asking the host. Otherwise it answers what the host answers.
- `invalidateDpop()`, `tokenManager.invalidate()`: drop the held token so the next use signs in again.
- `tokenManager.getSession()`: the live session as `LwsSession` (`principal`, `vault`, `vaults`).
- `dpopBoundMs()`: 10 000, the number of milliseconds a caller waits for the session before a write.
- `NotSignedInError`, `OriginNotAllowedError`: the two errors a request that cannot be signed throws. Copied from the app with their sentences, because the app's code tests `instanceof` against them.
- `LwsAuthHost`, `LwsSession`, `LwsSessionVault`, `LwsVaultInfo`: the types.
- `lwsAuthFromSession(session, options?)`: the default host, over the `signin` unit's `SessionCredential`. Every header it answers is the sender-constrained pair `{ authorization: "DPoP <token>", dpop: "<proof>" }`.
- `options.proofOriginFor = { fetchOrigin, proofOrigin }` (optional, since 0.1.1): a request sent to `fetchOrigin` (exact origin match) is signed for `proofOrigin` plus the request's path, query dropped (`src/proofHtu.ts`); the `fetch` still goes to the original URL. Why: a front door at `fetchOrigin` (an apex) forwards the request to the identity host, and the server compares the proof's `htu` with the host it received, so a proof for the apex is refused (401 "DPoP proof htu does not match the request URI"). The rule (RuleRigdevDpopHtuReceivedHost): rewrite the proof's origin only for requests sent to the forwarding origin. ⛔ Never set `fetchOrigin` to a vault host: a request sent to a vault host is signed for that vault host, and rewriting it is itself a 401. Every other URL is signed for itself; without the option nothing changes.

The names and signatures are exactly the ones the app's client modules import from its `token`, `bearer` and `dpop` modules (the call sites, by file and line at the commit below):

| Name | Signature | Call sites in the app |
|---|---|---|
| `bearerHeaderFor` | `(url: string) => Promise<Record<string, string>>` (here `(url, method?)`, see below) | `records.ts:246` (`authHeader`; its callers: `readRecord` GET :652, `patchRecord` PATCH :984), `relations.ts:87` (GET :106), `search.ts:93` (GET :233), `vaultSets.ts:64`, `relationWrite.ts:326` and `:509`, `entityShare.ts:584` |
| `dpopReadAuth` | `(method: string, url: string) => Promise<Record<string, string>>` | `vaultSets.ts:78, 81, 99`, `relationDoc.ts:168`, `attributeFind.ts:54`, `vaultContext.ts:449` (a dynamic import) |
| `dpopWriteAuth` | `(method: string, url: string) => Promise<Record<string, string>>` | `records.ts:532` (create POST), `relationWrite.ts:318` (PUT) and `:505` (POST), `entityShare.ts:578` |
| `invalidateDpop` | `() => void` | `records.ts:272`, `vaultSets.ts:115`, `relationDoc.ts:214`, `attributeFind.ts:61`, `relationWrite.ts:337, 514` (as `dpopModule.invalidateDpop`), `entityShare.ts:591` |
| `tokenManager.invalidate` | `() => void` | `records.ts:254`, `relations.ts:110`, `search.ts:243`, `relationWrite.ts:338, 515`, `entityShare.ts:592`, `hooks.ts:334` |
| `tokenManager.getSession` | `() => Promise<LwsSession>` | `relationWrite.ts:304` (reads `.principal`), `entityShare.ts:624` (reads `.principal`), `hooks.ts:46` (the whole session) and `:336` |
| `NotSignedInError` | `class extends Error`, `new NotSignedInError()` | `instanceof` or `throw` in `records.ts`, `vaultSets.ts`, `search.ts`, `relations.ts`, `relationDoc.ts`, `attributeFind.ts`, `relationWrite.ts`, `entityShare.ts`, `hooks.ts:49, 94, 338` |
| `OriginNotAllowedError` | `class extends Error`, `new OriginNotAllowedError(detail: string)` | thrown by the app's own token mint only |
| `dpopBoundMs` | `() => number` | `relationWrite.ts:279` (`dpopModule.dpopBoundMs`, read inside a `try`; a missing export gives the same 10 s) |

The session fields read at the call sites: `principal` at `relationWrite.ts:304` and `entityShare.ts:624`; the whole `{ principal, vault, vaults }` at `hooks.ts:46` (the shell's session query; `useVaults` reads `vaults` and `principal`).

The unit holds one piece of module state, the host set with `setLwsAuth`. An app must have ONE copy of it: two installed copies are two seams, and a client module that imports one is signed by the host set on the other. It reads the settings of `base-origin` through `vault-origin-rule` when a function is called. Its peers: `vault-origin-rule` (with `base-origin`) and `signin`.

`src/proofHtu.ts` is a named copy of `proofHtu` from `units/request-htu/src/requestHtu.ts` at main d65985d, verbatim (token-equal with comments stripped); it is not exported from the unit.

## What this is not

- Not a sign-in. It signs nothing itself: the default host asks `signin`'s `SessionCredential`, and any other host signs as it likes.
- Not the app's cookie bridge. The app's token module minted a bearer token from a session cookie; an app on its own origin cannot hold that cookie, so none of it is here: not `getToken`, `probe`, `adoptDirect`, the cookie mint, the token types or the mint timers.
- Not a bearer-token bridge. `bearerHeaderFor` keeps its name so a copied client module does not change, but the default host answers a DPoP pair for it (see Wrong readings).
- Not the app's whole DPoP module. `dpopCredential`, `dpopAgentTurnAuth`, `__setDpopBoundForTest`, the proof and `htu` code and the 10 s timers that wrapped the mint and the proof are not taken: the signing is `signin`'s.
- Not a place to add a second host check. The one rule is `credentialAllowedAt`, asked here for every host.

## How to take it

Package: `@kaigilb/gilbplatformcode-lws-session-bridge`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/lws-session-bridge` prints:

```sh
npm install <path-to-the-library>/units/lws-session-bridge
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, which the other units set: the peer `signin` ships TypeScript source that does not pass it, and a unit's type check reads its peers' source.

## Examples

```ts
import { setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { lwsAuthFromSession, setLwsAuth, bearerHeaderFor } from "@kaigilb/gilbplatformcode-lws-session-bridge";

// Once at start-up:
setBaseOrigin("https://platform.example.test");
setSystemVaultHosts(["ontology.platform.example.test"]);
const credential = new SessionCredential({ dpopMintUrl: "https://platform.example.test/base/auth/session/dpop-token" });
setLwsAuth(lwsAuthFromSession(credential));

await bearerHeaderFor("https://platform.example.test/lws/r/abc", "PATCH"); // { authorization: "DPoP …", dpop: "…" }
await bearerHeaderFor("https://evil.example/lws/r/abc"); // {}  (no header, and the credential is not asked)
```

## What the host must supply

- `setBaseOrigin(...)` and `setSystemVaultHosts([...])` from `base-origin`, once at start-up: the gate reads them. With no platform origin set, every URL gets `{}`.
- `setLwsAuth(host)`, once at start-up, before any client call. For an app that signs in with `signin`, `setLwsAuth(lwsAuthFromSession(credential))`.
- On a local development rig only: `setLocalRigHosts([...])` from `base-origin`, as `vault-origin-rule` says.

## Do not

- Do not import this unit's functions in one copy and call `setLwsAuth` in another. One copy of the unit per app.
- Do not form an `Authorization` or `DPoP` header by hand in a client module; ask this unit, so the platform-host gate is asked every time.
- Do not cache the headers it returns. A DPoP proof is fresh on every call and the server refuses a reused one.
- Do not read the header keys in a capitalised spelling. They are `authorization` and `dpop`, as the app's own DPoP seam answered them.
- Do not write a host whose `bearerHeaderFor` forms its own gate. The gate is here; a host is asked only for a URL the platform may send a credential to.

## Wrong readings

- "`bearerHeaderFor` returns a bearer token." The app's returned `{ authorization: "Bearer <token>" }` from a token minted off the session cookie. The default host here cannot hold that cookie, so it answers the DPoP pair for the same call. This changes what is on the wire for every read, PATCH and DELETE the client makes through `bearerHeaderFor`; whether the server accepts a DPoP-only credential on those routes is not proven here (the app's own create already uses it on `/lws/vault/<id>/c`).
- "`bearerHeaderFor(url)` knows the request's method." It does not: the app's call took the URL alone, a bearer token being the same for every method. A DPoP proof names the method (`htm`), so the default host signs for the `method` the caller passes and for `GET` when it passes none. A caller that sends a PATCH, DELETE, PUT or POST through `bearerHeaderFor(url)` without naming the method is sent a proof for a GET, which a server that checks `htm` refuses. This is the one parameter this unit adds to the app's signature; it is optional, so every call of the app still compiles.
- "The header keys are `Authorization` and `DPoP`." They are lower case, `authorization` and `dpop`: the sign-in unit's `SessionCredential.authHeaders` answers capitalised keys, and the host maps them, because the app's own seam answered lower case and its callers read `bearer.authorization` (`vaultSets.ts:78`: a missing key sends the call down the DPoP fallback, which is the same pair signed a second time). A capitalised key beside the app's lower-case `accept` or `content-type` would also double a header.
- "`invalidateDpop` signs out." It drops the held token only (`session.invalidate()` with no argument); the key is kept and the next use signs in again. `tokenManager.invalidate` does the same. Signing out (`invalidate(true)`) is the host app's own act.
- "A 401 on a read drops the bearer token and a 401 on a create drops the DPoP token." In the app that was two different tokens. Here both are the one held token, so `tokenManager.invalidate` and `invalidateDpop` do the same thing.
- "The sign-in unit's errors reach the client." They do not: the default host throws THIS unit's `NotSignedInError` for the sign-in unit's, and this unit's `OriginNotAllowedError` for the sign-in unit's (its detail is the sign-in unit's sentence). Any other error passes as it is. The two sentences differ from the sign-in unit's and the app's code tests `instanceof` against these classes.
- "The `OriginNotAllowedError` sentence is as the app wrote it." One part is not: the app named its development address, `add http://localhost:5197 to GilbPlatform's FIRST_PARTY_ORIGINS?`; here it reads `add this app's origin to GilbPlatform's FIRST_PARTY_ORIGINS?`, because a unit that names a host fails its own host-agnostic check. The rest of the sentence, and `NotSignedInError`'s, are the app's.
- "The 10 s timers are kept." They are not: the app wrapped the mint and the proof in a bound and dropped a mint that never settled. `signin` has no bound, so a host that never answers is never cut off here. `dpopBoundMs()` is only the number a caller (`relationWrite`) uses for its own wait.
- "An unset seam is silent for a foreign URL." It is not: the unset check runs before the gate, so a missing `setLwsAuth` is loud for every URL. But a call site that swallows errors (`vaultContext`'s datom-log read, which sends no header when the sign-in throws) swallows this one too and reads anonymously.
- "`getSession()` returns the sign-in unit's object." It returns a fresh copy in the app's shape; changing it changes nothing in the credential.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`. Copied by script: `src/lib/base/token.ts` lines 18-55 (`NotSignedInError` and `OriginNotAllowedError`, with their doc comments) to `src/errors.ts`. Every other file is new. The functions are the app's `bearer.ts` (`bearerHeaderFor`, line 26), `dpop.ts` (`dpopReadAuth` 294, `dpopWriteAuth` 310, `invalidateDpop` 331, `dpopBoundMs` 49) and `token.ts` (`tokenManager`, 209) replaced by the seam; the app's `credentialAllowedAt` gate (`bearer.ts:27`, `dpop.ts:184`) is asked here for all three header-forming calls. `signin` (this repository) is the engine under the default host.

Named changes, and only these:

1. the sentence of `OriginNotAllowedError` (line 51): `add http://localhost:5197 to GilbPlatform's FIRST_PARTY_ORIGINS?` is `add this app's origin to GilbPlatform's FIRST_PARTY_ORIGINS?`;
2. comments that name a host are reworded, no code changed.

`src/lwsAuth.ts`, `src/fromSession.ts` and `src/index.ts` are new. Tests: `lwsAuth.test.ts` (the delegation of every member, the unset seam, the gate on nine foreign URLs and the F-3 table of `credentialSystemHost.f3.test.ts` ported to the three header-forming calls: a system host outside the build's own family gets no header and the host is not asked, inside it gets the pair), `fromSession.test.ts` (keys and values, the method each header is signed for, real proofs read back, the session copy, the drop of the token, the error mapping) and `errors.test.ts` (the sentences, and the two assertions of `deadNameInAppCopy.c2045.test.ts` "one red panel, ONE product name" that call the real constructor). Left out, with reasons: `token.test.ts` and `dpop.test.ts` (they pin the app's cookie mint, the 10 s bounds and the proof code, none of which is taken); `credentialSeam.f3.test.ts` (it walks the app's source tree); the "never `Bearer undefined`" tests of `credentialSystemHost.f3.test.ts` and `dpop.test.ts` (they pin the app's bearer mint, which has no counterpart); the dead-name detector tests of `deadNameInAppCopy.c2045.test.ts` (they scan the app's files). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units; `scripts/check-host-agnostic.mjs` is the one of `ontology-reads` with this unit's allowed imports.
