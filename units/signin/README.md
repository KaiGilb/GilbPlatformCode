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

The taking application is not the data of record. This module writes no vault facts. Browser `sessionStorage` / `localStorage` hold only a 15-minute pending mailbox key `${appId}.pendingSignInEmail`. The session token and the DPoP key live in memory only.

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
  dpopMintUrl: `${ORIGIN}/base/auth/session/dpop-token`, // optional: keeps a sign-in across reloads
});
await session.signInWithCode(ORIGIN, email, code);       // verify-code with the credential's own key
const headers = await session.authHeaders("GET", url);   // Authorization + a fresh DPoP proof
```

- One DPoP key per credential. The kit makes it (private half non-extractable), or the host passes `key` for a key the kit cannot hold, such as a Secure Enclave signer: `{ publicJwk, sign }`, where `sign` returns a raw 64-byte ES256 signature. A DER signature is refused with an error that says DER.
- Concurrent callers share one mint. It re-mints inside a 60 s guard band. `authHeaders(method, url, freshForMs)` re-mints first when the token would not last `freshForMs`.
- `invalidate()` is the re-mint after a 401. `invalidate(true)` is sign-out: a mint already on the wire is dropped, and a kit-made key is replaced. A host-passed key is never dropped.
- Never cache `authHeaders`. Each proof is single-use.

## Machine credential (`./machine`)

```ts
import { importMachineKey, MachineCredential } from "@kaigilb/gilbplatformcode-signin/machine";

const key = await importMachineKey(env.MACHINE_JWK); // P-256 private JWK, held as a worker secret
const machine = new MachineCredential({ idOrigin: ID_ORIGIN, clientId, key: key! });
const headers = await machine.authHeaders("POST", url);
```

The token is reused until 30 s before it expires. `invalidate()` after a 401. A refusal, an unreachable endpoint, and a 2xx with no token are `MachineTokenError` (`status` 0 means no answer arrived).

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

## Do not

- Do not sign every call for the identity host. A vault call signed that way is refused with 401 `DPoP proof htu does not match the request URI`.
- Do not persist the DPoP key or the token to `localStorage`. That is a platform decision, not an app one.
- Do not treat a native bridge that sends no `Origin` header as proof that the platform admits your app. Admission is measured from a browser origin.
- Do not call a platform host through a proxy that rewrites the host. The server compares `htu` with the host it received.

## Verify (in this artefact)

```sh
cd units/signin
npm install
npm test
npm run typecheck
npm run check:host-agnostic
```

Tests mock fetch or run a local `node:http` server. They prove request shape, host injection, proof shape and the credential's races, not a live mailbox. The host-agnostic check fails when any source line names a vault host, or when a headless entry (`core`, `session`, `machine`) or a file it imports reaches anything but a sibling module.

## Source

The private `gilb-signin` package, 0.5.0. The card keeps this unit's host-agnostic default: the vault-address preview shows only when name-prep returns a `webIdDomain`.
