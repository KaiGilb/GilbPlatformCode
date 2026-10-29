# file-download-outcome

Downloads a vault file and says what happened, without throwing, or gives just its bytes.

## What this is

Downloads a vault file and says what happened, without throwing, or gives just its bytes.

GET `/files/<id>` from the vault that holds the file, and report what happened as a value, not as a thrown error.

- `downloadFileOutcome(id, at, opts = {})`: resolves with a `FileFetchOutcome` of `file-words`: `ok` (a blob, typed from the answer's content type, and the url), `gone` (the vault answered 404 at its own door), `unaddressed` (a 404 from the platform origin, which holds no vault's files: a statement about our reach, not about the vault), `forbidden` (401 or 403, or not signed in) or `failed` (a status or a transport error, with the reason the server sent when there is one).
  - `id` is a bare id, `files/<id>`, or an absolute URL; leading slashes, a `files/` prefix and a query or fragment are dropped. No id gives `failed` with `"no file id"` and nothing is asked. An absolute URL handed as the id with no `at` is itself the address (its origin is used, and its text is kept whole as the id, as in the app).
  - `at` is the file entity's own address; the bytes are asked at ITS origin. An `at` that names no vault (empty, a marker, a bare id, a relative path, or an address on the platform origin) is asked at the platform origin, so a 404 is `unaddressed`, never `gone`.
  - DPoP first (`dpopReadAuth("GET", url)`), then Bearer (`bearerHeaderFor(url)`), `credentials: "omit"`. If neither gives bytes, the MORE informative answer is returned: `forbidden` beats `gone`/`unaddressed`, which beat `failed`. If Bearer cannot sign in at all the answer is `forbidden` 401.
  - A 200 with no body is `failed` (`"empty body"`), never an absence.
  - `opts.maxBytes` bounds the read: an answer whose `content-length` is over the bound is refused before its body is read, and a body found over the bound is refused after it is read; both give `failed` with `detail` `FILE_TOO_LARGE` and the second credential is not tried.
- `downloadFile(id, at)`: the blob, or null for anything but `ok`. For previews (avatars, image pickers) that only paint a placeholder on failure. Do not use it where the person is told why.
- `FILE_RESOURCE_URL(id, at?)`: `<origin of at, else the platform origin>/files/<id>`.
- `FILE_TOO_LARGE`: `"too large"`, the `detail` of a refused bounded read. Equal to the copy in `org-mark`.

## What this is not

- Not an upload and not a delete.
- Not the words for an outcome: `fileFetchMessage` is in `file-words`.
- Not a cache and not a pool: `org-mark` bounds and shares its own downloads.

## How to take it

Package: `@kaigilb/gilbplatformcode-file-download-outcome`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/file-download-outcome` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/file-words <path-to-the-library>/units/record-types <path-to-the-library>/units/signin <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```ts
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { downloadFileOutcome } from "@kaigilb/gilbplatformcode-file-download-outcome";
import type { OrgMarkHost } from "@kaigilb/gilbplatformcode-org-mark";

setBaseOrigin("https://platform.example.test"); // once
setLwsAuth(myAuthHost); // once

// org-mark's host member is this function, as it is:
const orgMarkHost: OrgMarkHost = { downloadFileOutcome };

const out = await downloadFileOutcome("f1", "https://mona.platform.example.test/base/e/f1", { maxBytes: 262_144 });
if (out.kind === "ok") show(out.blob);
```

## What the host must supply

None. `downloadFileOutcome` and `downloadFile` are plain functions. The app sets, once, the platform origin (`setBaseOrigin`) and the auth host (`setLwsAuth`); this unit supplies nothing to a host. It IS a candidate for a host app to pass `downloadFileOutcome` as `OrgMarkHost.downloadFileOutcome`: the types are equal.

## Module state

None. The unit holds no state; the platform origin and the auth host it reads are the settings of `base-origin` and `lws-session-bridge`.

## Do not

- Do not call `downloadFile` where the person is told why a file is missing: it returns null for gone, forbidden and failed alike. Use `downloadFileOutcome`.
- Do not pass the platform origin as `at` to mean "unknown": pass null. Either way a 404 is `unaddressed`.
- Do not add a second "is this an address" test beside `vaultOriginOf`.

## Wrong readings

- "A 404 means the file is gone." Only a 404 at the vault's own door is `gone`.
- "`maxBytes` is checked after the download." It is checked on `content-length` first, before the body is read.
- "`downloadFileOutcome` rejects when the network is down." It does not: that is `failed` with `status: null`.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/base/files.ts` lines 150-152 (`authHeader`), 412 (`FILE_TOO_LARGE`), 414-507 (`downloadFileOutcome`) and 515-518 (`downloadFile`) to `src/fileDownloadOutcome.ts`.
- `src/lib/base/config.ts` lines 670-671 (`FILE_RESOURCE_URL`), an inline named copy, to the same file.

Cut at function level; nothing else of `files.ts` (upload, delete, thumbnails, the message words) is taken. The cut was made when `FILE_RESOURCE_URL` was found to be in no unit and not in the brief's list; it is two lines and is copied here, as ruled. `FILE_TOO_LARGE` is a second copy of `org-mark`'s `src/fileTooLarge.ts` (`"too large"`); the two are equal. To avoid two copies, `org-mark` may import this one in a later release.

**Merged units compared and taken.**

- `vault-origin-rule` `vaultOriginOf`: differs from the app's by `BASE_ORIGIN` becoming `baseOrigin()` in 6 places and nothing else. Taken.
- `base-origin` `baseOrigin()`: the setting.
- `lws-session-bridge` `NotSignedInError` (token-equal, 24 tokens), `bearerHeaderFor`, `dpopReadAuth` (the auth seam, same signatures).
- `lws-records` `serverReasonOrNull`: token-equal (87). The `server-error` unit's is a different, 63-token body and is not used.
- `file-words` `FileFetchOutcome`: token-equal (75).

Named changes, and only these:

1. the imports (see `unit.json`);
2. `vaultOriginOf(addressedAt) !== BASE_ORIGIN` is `... !== baseOrigin()`;
3. `FILE_RESOURCE_URL`, `authHeader`, `FILE_TOO_LARGE` and `downloadFile` are in the same file with `downloadFileOutcome`, and `FILE_RESOURCE_URL` is exported;
4. comments that name a cycle, an agent, a ticket, a ruling or a host are reworded; no code changed.

`src/index.ts` is new.

## Tests

46 tests in 3 files (`npx vitest run`):

- `fileDownloadOutcome.test.ts` 30. Ported 10 runs of the 11 of GilbApp `downloadFileOutcome.c161.test.ts` (the `gone`/`unaddressed` split, with the five addresses that fall back to the platform origin; a denial outranks an absence; an empty body) and all 4 of `files.s9fix.test.ts` (the bound on `content-length`, on the body, and no bound). `vi.mock("./dpop")` and `vi.mock("./token")` are a fake auth host set with `setLwsAuth`; the re-import with a stubbed `VITE_BASE_ORIGIN` is `setBaseOrigin`. New: the address and the id cleaning, no id, an absolute URL as the id, the two credentials in order, a mint failure, a sign-in failure, transport errors, 401/403 on both legs, the ranking, and `downloadFile`.
- `exports.test.ts` 3 (the four exports, `FILE_TOO_LARGE` equal to org-mark's, the fit with `OrgMarkHost.downloadFileOutcome`).
- `hostAgnostic.test.ts` 13.

Left out: the 11th run of the c161 file tests `fileFetchMessage`, which is `file-words`' (its own tests); `fileDownloadVaultDoor.c161.test.tsx` (7 cases) tests a component of the app; `orgLogo.s9fix.test.ts` is ported by `org-mark`. No wall-clock waits.
