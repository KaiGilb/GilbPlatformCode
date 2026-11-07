# picture-upload

Uploads picture bytes to a vault's file door with a request signed for that vault, and answers the stored file's address, or an error that keeps what the vault said.

## What this is

Uploads picture bytes to a vault's file door with a request signed for that vault, and answers the stored file's address, or an error that keeps what the vault said.

- `UploadTarget`: `{ vaultOrigin, vaultRoot, folder }`.
- `uploadUrl(filename, target)`: `<vaultOrigin>/lws/vault/<encoded vaultRoot>/files?name=<encoded filename>&folder=<encoded folder>`. For `vaultOrigin` `https://example.test`, `vaultRoot` `https://example.test/vault`, folder `a b` and filename `x y.jpg` it is `https://example.test/lws/vault/https%3A%2F%2Fexample.test%2Fvault/files?name=x%20y.jpg&folder=a%20b`.
- `uploadPicture(blob, filename, target)`: `PUT` to that address with the headers of `dpopWriteAuth("PUT", url)` (peer `lws-session-bridge`), `content-type: image/jpeg`, the blob as the body, and `credentials: "omit"`. It answers the `entity` the vault names. 201 (new) and 200 (identical re-upload) are both success.
- What it throws, by status. The body is read once, right after the 401 check, for every status other than 200 and 201.
  - 401: `invalidateDpop()` and `NotSignedInError` (from `lws-session-bridge`); no body read.
  - 403: `NoAccessError` (from `refusal-detail`) with the server's sentence (`serverReasonOrNull`, peer `lws-records`) and a `RefusalDetail` `{ method: "PUT", path, status: 403, sentence }`.
  - 502, 503, 504: `VaultBusyError` with the status and `The picture could not be saved (HTTP <status>).`; before it is thrown one `console.warn` writes the refusal line and the first 300 characters of the body (`PUT <path> -> HTTP 503 - <sentence or "no sentence was sent"> | body: <text>`), so a platform busy answer can be told from the edge's.
  - any other status: `PictureUploadError` with `status`, `body` (the first 2000 characters of what the vault said) and the message `The picture could not be saved (HTTP <status>).`
  - a 200 or 201 whose JSON names no `entity` (missing, empty or not a string): `Error("The vault did not name the saved picture.")`.

## What this is not

- Not a shrinker (see `picture-shrink`) and not a viewer (see `signed-picture`).
- Not a retrier or a queue: a `VaultBusyError` is for the caller's queue (`save-queue`) to retry.
- Not a sign-in or a session. The proof comes from `lws-session-bridge`, which you import and set up; this unit never changes it.
- Not a reader of the vault list. You give it the vault's root.

## How to take it

Package: `@kaigilb/gilbplatformcode-picture-upload`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/picture-upload` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/record-types <path-to-the-library>/units/server-error <path-to-the-library>/units/refusal-detail <path-to-the-library>/units/signin <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/picture-upload
```

(`react` is a peer of `refusal-detail`, which draws a screen this unit does not use.) Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```ts
import { uploadPicture, PictureUploadError } from "@kaigilb/gilbplatformcode-picture-upload";

const target = { vaultOrigin: vault.origin, vaultRoot: vault.root, folder: "pictures" };
try {
  const entity = await uploadPicture(master, "ann-1.jpg", target);
} catch (e) {
  if (e instanceof PictureUploadError) report(e.status, e.body);
  else throw e;
}
```

## What the host must supply

| Member | Replaces (source app TestFlowerPower, `e39e1732551d9d5e6abf681546b97a3a30311e30`) |
|---|---|
| `UploadTarget.vaultOrigin` | `VAULT_ORIGIN` from the app's config, `src/config.ts:6`, used at `src/data/pictures.ts:84` |
| `UploadTarget.vaultRoot` | `vaultNamespace()`, `src/config.ts:14`, used at `pictures.ts:84`. Read it from the vault list, never compose it. A user vault's root is `https://<host>/vault` |
| `UploadTarget.folder` | the literal `plant-pictures`, `pictures.ts:84` (now percent-encoded) |

Also: the peers `lws-session-bridge` (set up so `dpopWriteAuth` can sign), `lws-records` and `refusal-detail` (with its peers).

## Do not

- Do not compose `vaultRoot` from the host name: read it from the vault list.
- Do not read the response yourself: `uploadPicture` has read the body of every refusal by the time it throws; the typed error carries what it needs.
- Do not log `PictureUploadError.body` to a place the person cannot see; it is the vault's own words, cut at 2000 characters.

## Wrong readings

- "The content type follows the blob." It is always `image/jpeg`, whatever the blob is. Re-encode with `picture-shrink` first.
- "A 200 means something went wrong." A 200 for an identical re-upload is success: the vault de-duplicates, and answers the existing entity.
- "`vaultRoot` can be derived." It must come from the vault list. A wrong root is refused by the platform (a 400 that names the right root), and arrives here as a `PictureUploadError`.
- "A 503 is always the platform." The edge in front of the vault also answers 503 with an HTML page; that is why the warning keeps the first 300 characters of the body.
- "The 403 message is mine to set." The unit throws `NoAccessError` with its default message, `You have no write access here yet. Ask the owner.`; show your own words and keep `detail` for the report.
- "`console.warn` runs for every refusal." Only for 502, 503 and 504.

## Where it came from

TestFlowerPower (local repo `KaiGilb/TestFlowerPower`, not published), commit `e39e1732551d9d5e6abf681546b97a3a30311e30`. Copied by script, then only the named changes.

- `src/data/pictures.ts` lines 82-107 (`uploadUrl`, `uploadPicture`) to `src/upload.ts`.

Named changes, and only these:

- U1. `UploadTarget = { vaultOrigin, vaultRoot, folder }` replaces the app's settings. `uploadUrl(filename, target)` and `uploadPicture(blob, filename, target)`; the literal `plant-pictures` is `target.folder`, now encoded.
- U2. Imports: `dpopWriteAuth`, `NotSignedInError`, `invalidateDpop` from `lws-session-bridge`; `serverReasonOrNull` from `lws-records`; `NoAccessError`, `VaultBusyError` and `refusalLine` from `refusal-detail` (the symbols the app imported, pictures.ts:2,3,7).
- U3. The body is read once after the 401 check, for every status other than 200 and 201. 403 throws `NoAccessError(sentence, { method: "PUT", path, status: 403, sentence })`. 502, 503 and 504 write one `console.warn` with the refusal line and `body.slice(0, 300)` and then throw the source's `VaultBusyError`. Any other status throws `PictureUploadError(status, text)`, whose message is the source's message byte for byte (the source threw a plain `Error`).
- Comment edits: the "plant-pictures" in the address comment is "the folder".

`src/index.ts` is new. Everything else is as in the source: method `PUT`, the headers, `credentials: "omit"`, the keepalive comment, 401 giving `invalidateDpop()` and `NotSignedInError`, 200 and 201 accepted, the `entity` check and its message.

## Tests

41 tests in 3 files. The source app's `test/plants.test.ts:259` (a 200 as well as a 201 answers the entity) runs on its own fake vault and is re-expressed here, not ported. New, written for this unit: the exact address; 201 and 200 answering the entity; 200 with no, empty or non-string entity; the request (method, headers, content type, body, `credentials: "omit"`); 401 (one `invalidateDpop`, no body read); 403 (sentence and detail, an unreadable body); 502, 503 and 504 (status, the warning line, the 300-character cut, an unreadable body); 500 with `boom`; a 5000-character body kept to 2000; the body read at most once. `lws-session-bridge`'s signing is replaced by a fake; `lws-records` and `refusal-detail` are the real ones. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units; it writes to the OS temp directory.
