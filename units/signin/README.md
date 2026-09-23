# Sign-in unit

Reusable GilbPlatformCode login artefact. One email one-time-code card. Meaning copied from existing `gilb-signin` (GilbApp + MyNetBase share that card). Not a second login. Passkey offer is host wiring, not this unit.

## Injected (never baked)

| Input | Meaning |
|---|---|
| `app.id` | Storage prefix, e.g. `"gilbapp"` |
| `app.productName` / `app.title` | Words on the card |
| `app.origin` | Vault-server origin. No trailing slash. Not hardcoded. |
| `app.returnTo()` | Absolute URL branded into the one-time-code email |
| `auth` | Host-supplied request / verify / name. HTTP helpers live in `./core`. |

The taking application is not the data of record. This module writes no vault facts. Browser `sessionStorage` / `localStorage` hold only a 15-minute pending mailbox key `${appId}.pendingSignInEmail`.

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

## Take

```ts
import { SignInCard } from "./src/index.ts";
import "./src/signin.css";

<SignInCard app={hostApp} auth={hostAuth} onSignedIn={() => { /* host adopts token */ }} />
```

Headless (no React):

```ts
import { requestSignInCode, verifySignInCodeHttp } from "./src/core.ts";
```

## Verify (in this artefact)

```sh
cd units/signin
npm install
npm test
npm run typecheck
npm run check:host-agnostic
```

Tests mock fetch. They prove request shape and host injection, not a live mailbox.
