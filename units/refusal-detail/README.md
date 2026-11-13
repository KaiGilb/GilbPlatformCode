# refusal-detail

Turns a refused request into one readable line, METHOD path -> HTTP status - the server's own sentence, and shows it on an access-denied screen that tells the person to ask the owner.

## What this is

Turns a refused request into one readable line, METHOD path -> HTTP status - the server's own sentence, and shows it on an access-denied screen that tells the person to ask the owner.

The line carries no query, no headers and no token. The screen shows no codes and no server words on its face; the line sits in a collapsed "Details" block under the owner's name, for the person who has to report it.

- `RefusalDetail`: `{ method, path, status, sentence }`; `sentence` is `string | null`.
- `refusalLine(detail)`: `GET /lws/vault/x/records -> HTTP 403 - vault target denied: no read reach`. With no sentence: `... -> HTTP 403 - no sentence was sent`.
- `readRefusal(method, url, res)`: the refusal a `Response` carries, as a `RefusalDetail`. It reads the body once (`res.text()`; a body that cannot be read counts as empty), takes the sentence from the peer `@kaigilb/gilbplatformcode-server-error` (`serverErrorText(status, parseServerErrorBody(text), "Refused")`), and takes the path from the URL: percent-encoding is kept (an encoded slash stays `%2F`) and the query is dropped. It never throws for a body. It does not look at the status: you call it only for a response you already treat as refused. A platform 400 that names `WrongVaultRoot` or `WrongSignInHost` with a `message` therefore reaches the line as its message.
- `NoAccessError(serverSentence?, detail?, message?)`: "the person may read but not write here". `serverSentence` is the server's own words when it sent any; `detail` is the `RefusalDetail`; `message` defaults to `You have no write access here yet. Ask the owner.`
- `VaultBusyError(status, message)`: the vault (or the edge in front of it) answered 502, 503 or 504. It carries `status`.
- `AccessDeniedScreen({ onSignOut, ownerName, detail?, placeName?, backgroundImage?, backgroundColor? })`: the screen. Title "This <placeName> is private" (`placeName` defaults to `vault`), tagline "Ask its owner, <ownerName>, to add you.", the collapsed `details.refusal-details` with the line (or "No request details were kept for this refusal."), and a "Sign out" button that calls `onSignOut`. The `bg-layer` div is drawn only when `backgroundImage` or `backgroundColor` is given.

- `"./describe"` (since 0.1.1): `describeError(err, { conflict?, more?, fallback? })`, see "One sentence for any error" below.

No writers: the screen has no read-only line, so there is nothing to switch off.

## One sentence for any error

`import { describeError } from "@kaigilb/gilbplatformcode-refusal-detail/describe"` (since 0.1.1). It answers one plain sentence a person can read, never a stack, a status or a raw message. The root entry does not import it and its peers do not change; `./describe` imports only `./refusal`.

| The error | The sentence |
| --- | --- |
| `NoAccessError`, `VaultBusyError` | its own `message` |
| a 403 `RecordForbiddenError` (by `name`) | its `message` |
| `NotSignedInError`, or any error with status 401 and no platform sentence | `Sign in again.` |
| a refusal that carries the platform's sentence: `RequestRefusedError`, or `platformSentence`, `platformMessage`, `serverSentence`, `reason`, `detail.sentence`, or a `RefusalDetail` from `readRefusal` | that sentence |
| `RecordConflictError` (by `name`), status 412 or 428 | `o.conflict`, else `This changed elsewhere. Reload and try again.` |
| anything `o.more(err)` maps (a sentence ends the search; `null` goes on) | that sentence |
| an offline browser, or the message a browser gives a failed fetch ("Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource") | `No connection. Try again.` |
| anything else | `o.fallback`, else `Something went wrong. Try again.` |

Errors from units this one must not import (lws-records, lws-session-bridge) are matched by `name` and `status`. Picture errors live in `picture-errors`, which has this unit as a peer, so importing it here would be a cycle: pass `more` a function that answers `pictureFailure(e)`'s `sentence` and `next` joined, or `null` when its `kind` is `"unknown"`.

```ts
const say = (e: unknown) => describeError(e, { conflict: "This camera was changed elsewhere. Reloaded.", more: pictureSentence });
```

## What this is not

- Not a classifier. Which responses are refusals is the caller's: the unit reads whatever `Response` it is given.
- Not a sender or a retrier. It makes no request.
- Not the write-path conversion. The source app's `mapWriteError` (turning the record client's `RecordForbiddenError` and `RecordConflictError` into its own errors), its `PlantChangedElsewhereError` and its `PictureUnreadableError` are app code and are not taken.
- Not the banner a refused WRITE shows: that is the app's own words. The screen is for a refused READ.
- Not the sign-in screen, the page background files or fonts: the host supplies those.

## How to take it

Package: `@kaigilb/gilbplatformcode-refusal-detail`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/refusal-detail` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/server-error <path-to-the-library>/units/refusal-detail
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`) and one stylesheet, `src/accessDenied.css`; your bundler compiles and imports them.

## Styling

Plain CSS, class-name styling, no variables, no `@import`, no `url(`: `import "@kaigilb/gilbplatformcode-refusal-detail/accessDenied.css";`. The rules are for exactly these selectors: `.bg-layer`, `.display`, `.signin-screen`, `.signin-panel`, `.signin-panel .display`, `.tagline`, `.btn`, `.btn.secondary`, `.btn.full`, `.refusal-details` and its `summary` and `p`. The names are the source app's and are plain: if your page already has classes of those names, load this stylesheet first, or the later rule wins.

The page supplies what the unit does not style: `* { box-sizing: border-box }`, `html, body { margin: 0 }`, the body font and colour, and `button { font: inherit; color: inherit; cursor: pointer }`. Without them the screen still draws (a serif title and a default-font button) but the sizes differ from the source app's. The background picture is a prop (`backgroundImage`, drawn as `url("...")`) and the page's own sky colour is `backgroundColor`.

## Examples

```tsx
import { AccessDeniedScreen, NoAccessError, readRefusal } from "@kaigilb/gilbplatformcode-refusal-detail";
import "@kaigilb/gilbplatformcode-refusal-detail/accessDenied.css";

// The source app's caller: after a refused list read, ask the door once more; 403 only; never throws.
async function readRefused(url: string, headers: HeadersInit) {
  try {
    const res = await fetch(url, { method: "GET", headers, credentials: "omit" });
    if (res.status !== 403) return null;
    return await readRefusal("GET", url, res); // the body has not been read before this
  } catch {
    return null;
  }
}

<AccessDeniedScreen
  ownerName="Ann"
  placeName="garden"
  detail={detail}
  backgroundColor="#cfe6f4"
  backgroundImage="/img/sky.svg"
  onSignOut={signOut}
/>;

// A typed error for a refused write, with the host's own wording:
throw new NoAccessError(detail?.sentence ?? null, detail, "You have no write access to this garden yet. Ask the owner.");
```

## What the host must supply

| Member | Replaces (source app TestFlowerPower, `e39e1732551d9d5e6abf681546b97a3a30311e30`) |
|---|---|
| `ownerName` | `OWNER_NAME` from the app's config, `src/screens/AskOwnerScreen.tsx:3,14` |
| `backgroundImage`, `backgroundColor` | `SIGNIN_BG`, `SIGNIN_BG_COLOR` from the app's backgrounds, `AskOwnerScreen.tsx:4,10` |
| `onSignOut` | as in the source: the app's sign-out callback, `AskOwnerScreen.tsx:7,19` |
| `placeName` | the word "garden", `AskOwnerScreen.tsx:13` |
| `NoAccessError`'s `message` | the sentence "You have no write access to this garden yet. Ask the owner.", `src/data/errors.ts:14` (the source app passes that sentence) |

Also: React 19; the peer `@kaigilb/gilbplatformcode-server-error`; the stylesheet and the page rules named in "Styling"; and the `detail`: build it with `readRefusal` from a `Response` you already treat as refused.

## Do not

- Do not read the response body before calling `readRefusal`: it re-reads `res.text()`, and a body can be read once. Pass a `res.clone()` if you need the body too.
- Do not call `readRefusal` for a success. It does not check the status, and a 200 gets a "no reason was sent" sentence.
- Do not show `serverSentence` or the line on the face of the screen: they belong in the Details block.

## Wrong readings

- "`readRefusal` asks the server." It does not: it reads a `Response` you give it. The source app asked the server once more after a failed list read to get the status (its record reader's error carries no status), and that second request is the caller's.
- "A refused write carries method, path and status." `RecordForbiddenError` of `lws-records` carries only `reason` (the server's sentence), so a write refusal has no method, path or status unless the caller builds the `RefusalDetail` from its own `Response`.
- "`readRefusal` only handles 403." It handles any status; the source app's caller checked for 403 before it called the reader, and that check is not in the unit. This is on purpose: the platform now also answers 400 (`WrongVaultRoot`, `WrongSignInHost`) with a `message`, and the message must reach the line.
- "The path is the decoded path." An encoded slash stays `%2F` and a lower-case `%2f` is written `%2F`.
- "`NoAccessError` says garden." Its default says "here"; the source's own garden wording is what the source app passes.
- "The screen has no dependencies on the page." It needs the page rules named in "Styling".

## Changes in 0.1.1

Additive: the entry `"./describe"` with `describeError` and `DESCRIBE_WORDS` (see "One sentence for any error"). The root entry, its exports and its peers are unchanged. 10 new tests (`src/describe.test.ts`) and 2 in `src/exports.test.ts`.

## Where it came from

TestFlowerPower (local repo `KaiGilb/TestFlowerPower`, not published), commit `e39e1732551d9d5e6abf681546b97a3a30311e30`. Copied by script, then only the named changes.

- `src/data/errors.ts` lines 2-19 (`RefusalDetail`, `refusalLine`, `NoAccessError`) and 44-52 (`VaultBusyError`) to `src/refusal.ts`. Line 1 (the import of `RecordConflictError` and `RecordForbiddenError`) is not taken; lines 21-42 (`PlantChangedElsewhereError`, `PictureUnreadableError`, `mapWriteError`) are not taken.
- `src/data/plants.ts` lines 140-143 (the part of `readRefused` after the status check) to `readRefusal` in `src/refusal.ts`.
- `src/screens/AskOwnerScreen.tsx` lines 1-24 to `src/AccessDeniedScreen.tsx`.
- `src/ui/background.css` lines 2-7 and `src/ui/styles.css` lines 22, 26-33, 87-90, 93, 97 and 127-129 to `src/accessDenied.css`: only the rules for the selectors under "Styling". Of the source's rules at 26-33 the unit takes `.signin-screen`, `.signin-panel`, `.signin-panel .display` and `.tagline`; the other rules that start with `.signin-panel` (the sign-in card, header, title and body, at 34-37) are for a sign-in library and are not taken. Of `.btn` it takes the base rule, `.btn.secondary` and `.btn.full`.

Named changes, and only these:

- R1. The import of `RecordConflictError` and `RecordForbiddenError` is deleted; `mapWriteError`, `PlantChangedElsewhereError` and `PictureUnreadableError` are not taken.
- R2. `NoAccessError`'s constructor gains a third parameter, `message = "You have no write access here yet. Ask the owner."`, and calls `super(message)`.
- R3. `RefusalDetail`, `refusalLine` and `VaultBusyError` are as in the source.
- R4. `readRefusal` is new, lifted from `readRefused`: lines 140-143 with `"GET"` replaced by the `method` parameter and `const detail: RefusalDetail =` by `return`. The status check at line 139 (`if (res.status !== 403) return null;`) is not in it. `parseServerErrorBody` and `serverErrorText` come from the peer `server-error`, which the seam map measured equal to the `lws-records` copy the app used (355 comparisons); a 20-case test pins them.
- S1. The imports are `./refusal`; `OWNER_NAME` and the `SIGNIN_BG*` imports are deleted.
- S2. `AskOwnerScreen` is `AccessDeniedScreen`, with props `ownerName`, `placeName = "vault"`, `backgroundImage`, `backgroundColor` added.
- S3. "This garden is private" is `This ${placeName} is private`; "Ask its owner, {OWNER_NAME}, to add you." is `{ownerName}`.
- S4. The `bg-layer` div is drawn only when `backgroundImage` or `backgroundColor` is given, with those in place of `SIGNIN_BG_COLOR` and `SIGNIN_BG` (same `url("...")` form).
- Comment edits: "garden" and "plant" words and a batch number removed from comments.

`src/index.ts` is new. `src/accessDenied.css` starts with one new comment line.

## Tests

35 tests in 4 files. Ported from TestFlowerPower: `screens/batch8.test.tsx:8` (the Details block) and `:15` (the detail on `NoAccessError`; path `/lws/vault/x/records`), and the `AskOwnerScreen` part of `screens/batch5.test.tsx:35` re-expressed on `AccessDeniedScreen` with `ownerName="Ann"` and `placeName="garden"`. New: the default `placeName`; no `bg-layer` without background props; the colour and the image; `refusalLine` with a sentence and with `null`; `readRefusal` on a 400 `WrongVaultRoot` (the path keeps `%2F` and drops the query), a 403, an empty 503 and a body whose `text()` rejects; `NoAccessError` default and custom message; `VaultBusyError.status`; twenty (status, body) pairs whose sentences are written as literals from the source app's reader. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units; it writes to the OS temp directory.
