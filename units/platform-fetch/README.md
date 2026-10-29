# platform-fetch

An authenticated fetch for a platform client: it moves every URL under the platform-host rule first, then signs it for that one request with the session's DPoP proof.

## What this is

An authenticated fetch for a platform client: it moves every URL under the platform-host rule first, then signs it for that one request with the session's DPoP proof.

A function that gives a `fetch`. The platform clients of the library (`record-sync`, `tag-client`) never see a credential: they take a `fetch` as an argument, and this is the one a GilbPlatform app hands them. For each call it does three things in this order: it re-addresses the URL with `atVaultOrigin` (so a URL built as text from data can never choose the host the credential goes to), it asks the session bridge for the DPoP headers of THIS method and THIS (moved) URL, and it calls the inner fetch with the init as given plus those headers. A fresh proof is made for every call.

- `platformFetch(inner?)`: returns `(rawUrl, init?) => Promise<Response>`. `inner` defaults to the global `fetch` (looked up when the request is made). The method is the init's, upper-cased for the signer, `GET` when the init has none. The signer's headers are set on top of the init's headers (a header of the same name is replaced); every other field of the init is passed on as it is.
- `TermFetch`: the type of `inner` and of the fetch it gives: `(url: string, init?: RequestInit) => Promise<Response>`.

The unit reads module state of `vault-origin-rule` (through `base-origin`: the platform origin and the system vault hosts) and of `lws-session-bridge` (the host set with `setLwsAuth`) and holds none itself.

## What this is not

- Not a credential holder: the proof is made by the host the session bridge was given. This unit forms no token.
- Not a retry. A 401 is the caller's: nothing here calls `invalidateDpop` or asks again.
- Not a cache and not a time bound. A caller that wants a request bounded does it around the call.
- Not a read/write choice: see Wrong readings.

## How to take it

Package: `@kaigilb/gilbplatformcode-platform-fetch`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/platform-fetch` prints:

```sh
npm install <path-to-the-library>/units/platform-fetch
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as `lws-records`' does, because a unit's type check reads its peers' source and the peer `signin` does not pass it. An app must have ONE copy of `base-origin` and of `lws-session-bridge`: two copies would sign with a different session, or move a URL by a different origin, than the rest of the app.

## Examples

```ts
import { setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { platformFetch } from "@kaigilb/gilbplatformcode-platform-fetch";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

// Once at start-up:
setBaseOrigin("https://platform.example.test");
setSystemVaultHosts(["veda.platform.example.test"]);
setLwsAuth(appSession); // the app's host: bearerHeaderFor, dpopReadAuth, dpopWriteAuth, invalidateDpop, tokenManager

const platform: PlatformClient = { origin: "https://u.platform.example.test", fetch: platformFetch() };
// platform.fetch("https://evil.example/vault/e/x") asks https://platform.example.test/vault/e/x, signed for that URL.
```

## What the host must supply

- `setBaseOrigin(...)` and `setSystemVaultHosts([...])` from `base-origin`, once at start-up (the rule of `vault-origin-rule` reads them), and `setLwsAuth(host)` from `lws-session-bridge`, once, before the first request. Without the session set, a call throws a sentence that names `setLwsAuth` and nothing is sent.
- On a local development rig only: `setLocalRigHosts([...])` from `base-origin`, as `vault-origin-rule` says.
- Nothing else. No setting of its own and no start-up call.

## Module state

None of its own. It reads the settings of `base-origin` and the session of `lws-session-bridge` when a request is made.

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not pass a URL that you have already moved and expect it to stay: it is judged again, and a host outside the platform family is moved to the platform origin.
- Do not use it for a host that is not the platform's and needs no credential: it will move the URL.
- Do not add a second host check around it. The rule is `vault-origin-rule`'s, in one place.

## Wrong readings

- "A read is signed with the read proof." It is not: every request, a read included, is signed with the WRITE proof (`dpopWriteAuth`), whatever the method. `dpopReadAuth` is never asked. This is the app's behaviour, kept.
- "A URL the bridge will not sign for is refused." It is not: `lws-session-bridge` answers no headers for a URL outside the platform (a scheme other than `http` or `https`, for one) without asking the host, and the request is sent as the caller made it, unsigned. After the platform-host rule an `http(s)` URL always lands on a platform host, so this reaches only such odd URLs.
- "The fragment of a URL is kept." It is dropped: `atVaultOrigin` returns the path and the query.
- "The signer sees the URL as the caller wrote it." It sees the moved one, so the proof is made for the URL that is actually asked.
- "The inner fetch bounds the request." Nothing here has a time limit; a caller that bounds the call (for example by waiting at most some seconds) does not cancel the request.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, file `src/lib/base/stakeholderCard.ts`, copied by script to `src/platformFetch.ts`: lines 641-657 (the doc comment and `platformFetch`). The app calls it in four places: `linkTargets.ts:54`, `recordTags.ts:117`, `stakeholderCard.ts:688` and `recordPerson.ts:193`, each to give a platform client its `fetch`.

**Merged units compared and taken or not.** `vault-origin-rule` holds `atVaultOrigin` and `lws-session-bridge` holds `dpopWriteAuth`; both are peers, with the same names, and the signature of `dpopWriteAuth` there, `(method: string, url: string) => Promise<Record<string, string>>`, is the one the app's `dpopWriteAuth` is called with. No merged unit builds a fetch, so none holds this function (searched by name over every `units/*/src`).

Named changes, and only these:

1. the imports: `atVaultOrigin` comes from the peer `vault-origin-rule` and `dpopWriteAuth` from the peer `lws-session-bridge` (the source imports them from the app's `./config` and `./dpop`);
2. `TermFetch` is declared in the file as the structural `(url: string, init?: RequestInit) => Promise<Response>`. The source imports the type from `gilb-stakeholders`, where it is declared in `src/terms.ts` (line 44) as exactly that one-line type;
3. comments: a ticket tag is removed, and the example host in the warning is written as an `example.test` host; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; a fake inner fetch and a fake session set with `setLwsAuth`, as `lws-session-bridge`'s own tests do, the platform origin set with `setBaseOrigin`, the hosts are `example.test` hosts; no network): ported from `GilbApp` `src/lib/base/credentialHost.d10.test.ts` (the block about the credentialed fetch handed to `gilb-stakeholders`, 6 of its tests, which call `platformFetch` alone; rewritten with `example.test` hosts, a fake inner fetch and a fake session, since the app's runs a real signer); new, in `platformFetch.test.ts` (27 in all, of which the 6 are the ported ones: the method and the proof asked for, the headers, the moved URL, what is left alone, a URL the bridge will not sign for, the session not set, the default inner fetch, the export list). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out: `recordPerson.c214gapp31b.live.test.ts` (it uses `platformFetch` inside the record-person flow) and the tests of the other call sites (`linkTargets`, `recordTags`, `stakeholderCard`), which call `platformFetch` together with code that is not in this unit; the other blocks of `credentialHost.d10.test.ts` (they call the record, relation and photo clients).
