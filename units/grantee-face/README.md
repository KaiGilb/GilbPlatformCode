# grantee-face

Loads the profile photo another person shares with the viewer.

## What this is

Loads the profile photo another person shares with the viewer.

Plain functions, no React. A face is fetched from the platform's rung-gated profile-photo route (`/base/connect/profile-photo?principal=<holder>`) with the viewer's credential and handed back as an object URL.

- `loadGranteeFace(principal, viewer)`: the holder's face as an object URL, or `null` when this viewer sees no photo for that holder (the route answered 404). Any other failure throws `Error("profile-photo <status>")`. At most one request per holder and viewer: the answer is remembered, and callers who ask while a request is running share it.
- `peekGranteeFace(principal, viewer)`: what is already decided, without asking: the object URL, `null` ("asked, no photo") or `undefined` ("not asked yet").
- `resetGranteeFaces()`: drops the memo and revokes the object URLs it owns. Call it on sign-out and between tests.
- `MAX_GRANTEE_FACES` (24): the cap on how many faces one render should ask for. The constant is exported for the caller to apply; this unit does not count requests against it.

## What this is not

- Not a vault's own profile photo (`discoverVaultProfilePhoto`, `loadPhotoObjectUrl`): those are in `vault-profile-photo`.
- Not an `<img>` or a component: it returns a URL for the caller to draw.
- Not a writer: nothing can be put into the memo except by the platform's answer.

## How to take it

Package: `@kaigilb/gilbplatformcode-grantee-face`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/grantee-face` prints:

```sh
npm install <path-to-the-library>/units/base-origin <path-to-the-library>/units/signin <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/grantee-face
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```ts
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { loadGranteeFace, peekGranteeFace } from "@kaigilb/gilbplatformcode-grantee-face";

// Once, at start-up:
setBaseOrigin("https://platform.example.test");
setLwsAuth(myAuthHost);

const viewer = "https://id.platform.example.test/base/p/aaaa";
const holder = "https://id.platform.example.test/base/p/cccc";
const shown = peekGranteeFace(holder, viewer); // undefined: not asked yet
const url = await loadGranteeFace(holder, viewer); // an object URL, or null for "no photo"
```

## What the host must supply

- `setBaseOrigin(origin)` of `base-origin`, once. The route is built on it when `loadGranteeFace` runs (the source read a constant when the module loaded). Until it is set, `loadGranteeFace` throws an error naming `setBaseOrigin`.
- `setLwsAuth(host)` of `lws-session-bridge`, once. `dpopReadAuth("GET", url)` signs the one request. Until it is set, `loadGranteeFace` throws an error naming `setLwsAuth`.
- A `fetch` and `URL.createObjectURL` / `URL.revokeObjectURL` (a browser).

## Module state

Three pieces of module state, in `granteeFace.ts`. An app must have ONE copy of this unit, or each copy keeps its own memo and asks again.

- `cachedViewer`: which viewer the memo belongs to. A call with another viewer wipes the memo first, so one viewer's entitled bytes are never shown to another.
- `faces` (a `Map`, replaced on a wipe): holder to object URL, or `null` for "no photo". A wipe revokes every object URL it holds.
- `inFlight` (a `Map`): the running request for each holder, shared by simultaneous callers, removed when it ends.

No `localStorage`, no `sessionStorage`; nothing survives a reload.

## Do not

- Do not turn a failure into `null`. Only a 404 means "this viewer sees no photo"; a 401 or a 5xx says nothing and is not remembered.
- Do not guess which holders have a photo from the shape of their key; every holder is asked.
- Do not put the URL in a bare `<img src>`: the browser sends no credential for it. Use the object URL this unit returns.
- Do not install a second copy of this unit.

## Wrong readings

- "`MAX_GRANTEE_FACES` limits the requests." It is a number for the caller; the unit does not enforce it.
- "A changed viewer keeps the old faces until they expire." It wipes the whole memo, including a request already running for the old viewer (a late answer for the old viewer is still returned to its own caller).
- "`null` and `undefined` from `peekGranteeFace` are the same." `null` is a decided "no photo"; `undefined` is "not asked yet".

## Where it came from

`KaiGilb/GilbApp` (private repo), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, `src/lib/base/granteeFace.ts`, whole (145 lines), copied by script, then edited as the named changes say.

**Merged units compared and taken or not.** `baseOrigin()` of `base-origin` (the setting that replaces the module-load constant) and `dpopReadAuth` of `lws-session-bridge` (the credential seam, replacing the app's `dpop.ts`). No other import.

Named changes, and only these:

1. **a module-load origin becomes a function over the setting**: `BASE_ORIGIN` (a constant read when the module loads) in `photoUrlFor` is `baseOrigin()`, read when the function runs. This is the only change in the code (a comment-stripped diff against the source shows one hunk);
2. the two imports are the units' (`@kaigilb/gilbplatformcode-base-origin`, `@kaigilb/gilbplatformcode-lws-session-bridge`) in place of `./config` and `./dpop`;
3. the header comment is reworded (a host, wikilinks and tags removed); no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; node environment; the host is `platform.example.test`): ported from `src/lib/base/granteeFace.test.ts` 10 of 10 (the one `vi.mock` of the credential seam is the fake auth host, `setLwsAuth`; the object-URL stubs are assigned on `URL` and restored after each test), new `host.test.ts` 14 (exports; the origin read when the function runs and its message; the credential seam; the memo: wipe, revoke, the null viewer, a failure left nothing in flight, a viewer change during a request, one entry per holder), `hostAgnostic.test.ts` 13 (the same host-agnostic check as the other units). Total 37. Nothing left out.
