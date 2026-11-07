# picture-errors

Turns any failure in adding, storing or showing a picture into one sentence that names the cause and what the person can do next.

## What this is

Turns any failure in adding, storing or showing a picture into one sentence that names the cause and what the person can do next.

`pictureFailure(e, words?)` takes whatever was thrown and answers `{ kind, sentence, next, detail }`: `sentence` says what went wrong, `next` says what the person can do, `detail` is the text to keep for a report (or null). `PictureFailureNote({ failure })` shows it. The first kind that fits wins, in this order:

| # | kind | fits | sentence | next | detail |
|---|---|---|---|---|---|
| 1 | `no-access` | `NoAccessError` (`refusal-detail`) | You can not add pictures here. | Ask the owner for write access. | `refusalLine(e.detail)` when present, else `e.serverSentence` |
| 2 | `not-signed-in` | `NotSignedInError` (`lws-session-bridge`) | You are signed out. | Sign in again; your picture waits on this device. | null |
| 3 | `vault-busy` | `VaultBusyError` (`refusal-detail`) | The vault is busy. | Your picture waits on this device and is sent again soon. | null |
| 4 | `wrong-vault-root` | `PictureUploadError` (`picture-upload`), status 400, body contains `WrongVaultRoot` | This app is pointed at the wrong vault address. | Tell the app's maker: the vault root must come from the vault list. | the body's `message` (JSON), else the body |
| 5 | `wrong-sign-in-host` | the same, body contains `WrongSignInHost` | This app signs in at the wrong place. | Tell the app's maker: the sign-in host is wrong. | the body's `message`, which names the right host |
| 6 | `too-big` | `PictureUploadError` 413 | The picture is too big for the vault. | Pick a smaller picture. | null |
| 7 | `storage-full` | `PictureUploadError` 507 | The vault is full. | Ask the owner to make room. | null |
| 8 | `unreadable` | `PictureUnreadableError` (`picture-shrink`) | the error's own message (it already names the cause) | Pick a JPEG or PNG. | null |
| 9 | `changed-elsewhere` | `RecordConflictError` (`lws-records`) | Someone else changed this just now. | Reload and try again. | null |
| 10 | `offline` | a `TypeError`, or `navigator.onLine === false`, or a message matching `/failed to fetch\|fetch failed\|network\|offline\|load failed/i` | You are offline. | Your picture waits on this device and is sent when you are back online. | null |
| 11 | `unknown` | anything else | The picture could not be saved. | Try again; if it keeps failing, tell the app's maker. | the error's message (for a value that is not an `Error`, its text); never hidden |

- `words`: `Partial<{ [kind]: { sentence, next } }>`. For each kind the app gives, its `sentence` and `next` replace ours, field by field, so an app can translate. `DEFAULT_PICTURE_FAILURE_WORDS` holds the English table. For `unreadable` the sentence is the error's message unless the app gives its own.
- `PictureFailureNote({ failure })`: `<p role="alert" class="picture-failure">sentence <span class="picture-failure-next">next</span></p>`, then, when `detail` is not null, `<details class="picture-failure-details"><summary>Details</summary><p>detail</p></details>`.
- Types: `PictureFailure`, `PictureFailureKind`, `PictureFailureWords`.

## What this is not

- Not a logger and not a retrier: it only says what happened. The queue (`save-queue`) retries.
- Not a translator: it holds English words and takes yours through `words`.
- Not a catcher: you catch, and hand the thrown value to `pictureFailure`.
- Not the access-denied screen (see `refusal-detail`).

## How to take it

Package: `@kaigilb/gilbplatformcode-picture-errors`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/picture-errors` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/picture-shrink <path-to-the-library>/units/record-types <path-to-the-library>/units/server-error <path-to-the-library>/units/refusal-detail <path-to-the-library>/units/signin <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/picture-upload <path-to-the-library>/units/picture-errors
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Plain CSS, class-name styling, no variables, no `@import`, no `url(`: `import "@kaigilb/gilbplatformcode-picture-errors/pictureErrors.css";`. Rules for `.picture-failure`, `.picture-failure-next`, `.picture-failure-details` (with its `summary` and `p`).

## Examples

```tsx
import { PictureFailureNote, pictureFailure } from "@kaigilb/gilbplatformcode-picture-errors";

try {
  await uploadPicture(blob, "a.jpg", target);
} catch (e) {
  setFailure(pictureFailure(e));
}
// ...
{failure ? <PictureFailureNote failure={failure} /> : null}
```

## What the host must supply

Nothing is required. Optional: `words` (your language). The peers `refusal-detail`, `lws-session-bridge`, `lws-records`, `picture-upload` and `picture-shrink` must be the same copies your app throws from, because the kinds are found with `instanceof`.

## Do not

- Do not pass `e.message` instead of `e`: the kind comes from the error's class and, for upload errors, its status and body.
- Do not hide `detail`; it is what you need when the person reports the failure. `PictureFailureNote` keeps it in a collapsed block.
- Do not put a host name in `words` for `wrong-sign-in-host`: the right host is in `detail`, from the vault's own message.

## Wrong readings

- "A `TypeError` is always the network." It is read that way here, because a failed `fetch` throws a `TypeError`; a `TypeError` from your own code is also answered as `offline`. Catch around the picture call only.
- "Offline wins over everything." It is checked tenth: a `NoAccessError` while the device is offline is still `no-access`.
- "`unknown` has no detail." It always has: the message is shown in the Details block.
- "The `wrong-sign-in-host` sentence names the host." It does not (this unit names no host); the vault's message in `detail` does.
- "A 400 is `wrong-vault-root`." Only a 400 whose body contains `WrongVaultRoot`; any other 400 is `unknown`.

## Where it came from

New code, written for GitHubStandardPictures. Repository `KaiGilb/GilbPlatformCode`, commit `a59cafc9e48b8f20575ad554554c08215845a500` (the main that holds `refusal-detail`, `picture-upload` and `picture-shrink` as they are imported here). No source file was copied.

The kinds follow the failures the Clarity.Error Value names: no access, wrong vault root, offline, vault busy, file too big, format unreadable, changed elsewhere, not signed in, storage full, unknown (the wrong sign-in host is a separate, eleventh kind). The `offline` message pattern is the one `save-queue` uses.

Changes in 0.1.1, and only these:

- The peer ranges of `picture-shrink` and `picture-upload` are `^0.1.0 || ^0.2.0`. Main holds 0.2.0 of both, and `^0.1.0` excludes it, so `npm install` stopped with ERESOLVE. The devDependency links are unchanged.
- `src/peerRanges.test.ts` is new: it reads `package.json` and checks that each `@kaigilb` peer range holds the version in `../<peer>/package.json`.

No code changed.

## Tests

The 0.1.1 count is in the commit message; 0.1.0 had 61 tests in 4 files. One per kind, the detail of each, the order of the checks (a `NoAccessError` while offline is still `no-access`), the `offline` messages, `words` (field by field), the note (alert, next step, Details only when there is a detail, axe clean), and a test that walks the ten failures of the Clarity.Error Value and checks that each gets its own kind and a non-empty next step: that is the Value's Meter. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units; it writes to the OS temp directory.
