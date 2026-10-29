# org-mark

Draws an organization's logo from a bounded file fetch.

## What this is

Draws an organization's logo from a bounded file fetch.

A small mark for a LIST (a unit row, a chain entry): the organization's logo when the record has one, else its initial. A list mark is not a header logo; it must stay cheap however many marks the page draws and whatever file a record points at.

- `OrgMark({ logo, vaultId, name, size = 32 })`: a square `span` (`data-testid="org-mark"`, `data-has-logo="true"` or `"false"`, `aria-hidden`) holding the logo as an `img` once it has been read, else the first letter of the trimmed name in capitals (`?` for a name with no letters). With no `logo` or no `vaultId` nothing is read. When `logo` or `vaultId` changes the mark goes back to the initial and reads the new file; the object address it made is revoked when it goes away or changes.
- `loadOrgLogoBlob(host, logo, door, deps?)`: the logo's bytes, or null (no file named, too large, or not readable). `door` is the vault the mark is drawn in; it is where a reference without a scheme is read.
  - BOUNDED: it asks for at most `ORG_LOGO_MAX_BYTES` (256 KB). Over that, the mark shows the initial, and the file is not asked for again this session. A body that comes back larger than the bound is refused in the same way.
  - SHARED: one download per file, however many marks name it (a promise per file, keyed by where it is read and its id).
  - POOLED: at most `ORG_LOGO_POOL` (4) downloads in flight; the rest wait and start in order as places free.
  - Only a successful read and an over-the-bound answer are remembered; a failed read, a gone, forbidden or unaddressed file, or a host that throws is asked for again by the next mark. The cache holds at most 200 files and drops the oldest by insertion first.
  - `deps.download` replaces the host's download (a test seam; the host is then not asked).
- `ORG_LOGO_MAX_BYTES`, `ORG_LOGO_POOL`, `FILE_TOO_LARGE` (the `detail` of a `failed` outcome for a bounded read whose answer was larger than the bound, `"too large"`), `__resetOrgLogos()` (a test seam: empties the cache and the pool, never called by product code), `fileIdFromPhotoRef(ref)` (which file a stored photo reference names; see "Where it came from"), and for the host: `OrgMarkHost`, `OrgMarkHostContext`, `useOrgMarkHost()`.

## What this is not

- Not the header logo of an organization, and not a person's picture.
- Not a file download: the bytes come from the host's `downloadFileOutcome`, which owns the address, the credential and the answer kinds.
- Not an upload and not a writer: it only reads.

## How to take it

Package: `@kaigilb/gilbplatformcode-org-mark`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/org-mark` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/file-words <path-to-the-library>/units/org-mark
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of React):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer, and `file-words` is a peer for the type `FileFetchOutcome`. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/org-mark/src";`.

## Examples

```tsx
import { OrgMark, OrgMarkHostContext } from "@kaigilb/gilbplatformcode-org-mark";
import type { OrgMarkHost } from "@kaigilb/gilbplatformcode-org-mark";

// Once, above every mark: your app's one bounded file read.
const host: OrgMarkHost = {
  downloadFileOutcome: async (id, at, opts) => myFileRead(id, at, opts), // -> { kind: "ok", blob, url } | { kind: "failed", ... } | ...
};

<OrgMarkHostContext.Provider value={host}>
  <OrgMark logo="https://vault.example.test/base/e/logo0001" vaultId="https://vault.example.test/base" name="Nordlys Holding" size={36} />
</OrgMarkHostContext.Provider>;
```

## What the host must supply

- `OrgMarkHostContext.Provider` above every `OrgMark`, with an `OrgMarkHost`. With none, `OrgMark` throws an error naming `OrgMarkHostContext.Provider`. `loadOrgLogoBlob` takes the host as its first argument.
  - `downloadFileOutcome(id: string, at: string | null, opts: { maxBytes?: number }): Promise<FileFetchOutcome>`: one byte-read of a file, reporting what happened. Replaces `downloadFileOutcome(id, at, opts)` of GilbApp `src/lib/base/files.ts` line 414, called at `src/lib/base/orgCard/orgLogo.ts` line 48 as `downloadFileOutcome(fid, where, opts)` with `opts = { maxBytes: ORG_LOGO_MAX_BYTES }`. It is looked up and called when a logo is loaded, once per file that is not held, never read once at render. `at` is the file entity's own address when the reference carries one, else the door the mark is drawn in, else null. When the answer is larger than `opts.maxBytes` the host answers `{ kind: "failed", status, url, detail: FILE_TOO_LARGE }`.
  - `FileFetchOutcome` is the type of `file-words` (`ok` with a blob and url, `gone`, `unaddressed`, `forbidden`, `failed`).
  - The members are not optional: the unit only reads, so there is no writer to leave out.
- Tailwind scanning this unit's `src`, so its classes are generated (`rounded-md`, `border-[var(--line)]`, `bg-[var(--surface-sunken)]`, `text-[var(--ink-soft)]` and a few more).
- These CSS variables: `--line`, `--surface-sunken`, `--ink-soft`.
- React 19, and a browser `URL.createObjectURL` / `URL.revokeObjectURL` (the mark makes and revokes an object address).

## Module state

`orgLogo.ts` holds three pieces of module state: the cache of promises (`cache`, a `Map` keyed by `<where>\u0000<id>`, at most 200 entries), the count of downloads in flight (`active`) and the list of waiting starts (`waiting`). Two installed copies of this unit would each hold their own cache and pool: a page would download a file twice and the pool bound would be 8. Install it once; it is a singleton peer of every unit or app that draws marks. `__resetOrgLogos()` empties all three, for a test.

## Do not

- Do not install a second copy of this unit beside another one (see "Module state").
- Do not call a hook of this unit conditionally: `OrgMark` calls `useOrgMarkHost`, `useState`, `useEffect` in that order, every render.
- Do not make the host's download unbounded: pass `opts.maxBytes` on. A record whose logo points at a full-size file was measured at 55 MB for one page of 50 units in the source app.
- Do not call `__resetOrgLogos` from product code.

## Wrong readings

- "The unit imports `photo-ref`." It does not. `photo-ref`'s `fileIdFromPhotoRef` is not equal to the one the app uses (`gilb-photo`): on a reference with a malformed percent-encoding (`/files/%`, `/vault/e/%E0%A4%A`) `gilb-photo` throws a `URIError` and `photo-ref` answers null. Measured over 1,460 references (1,236 found in the three frozen sources and 229 constructed): 33 differ, every one of them that case, and nothing else. This unit keeps what the app does: `loadOrgLogoBlob` throws a `URIError` at once for such a reference (not a rejected promise), and `OrgMark` would throw out of its effect. Kept as in the app and listed for the owner; the fix is to catch it or to take `photo-ref`.
- "A cache hit renews the entry." It does not: the oldest entry by insertion goes first when the 201st is added, however recently it was read.
- "A failed read is remembered for the session." Only a successful read and an over-the-bound answer are. A file the host could not read is asked for again by the next mark that names it.
- "The mark depends on `vaultId` only to draw." It also decides where a reference without a scheme is read, and two doors are two cache keys for such a reference.
- "The effect re-runs when the host changes." It re-runs only when `logo` or `vaultId` changes, as in the source; the host of the render that started the effect is the one asked.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/base/orgCard/orgLogo.ts` (whole, 62 lines) to `src/orgLogo.ts`.
- `src/components/records/orgCard/OrgMark.tsx` (whole, 38 lines) to `src/OrgMark.tsx`.
- `src/lib/base/files.ts` lines 411-412 (`FILE_TOO_LARGE` and its doc line) to `src/fileTooLarge.ts`.

The private package `gilb-photo` (the app depends on `file:../gilb-photo`, a sibling checkout with no commit recorded; `src/photoRef.ts` was last changed by commit `8b5c74d8570e78f0686258164b9f4f4f8b6a595a`), copied by script as the rule for a private package asks: `src/photoRef.ts` lines 17-27 and 33-58 (`VAULT_PATH_SEGMENTS`, `VAULT_SEGMENT_PATTERN`, the two regexes `fileIdFromPhotoRef` reads, `isMediatedPhotoRef`, `fileIdFromPhotoRef`) to `src/fileIdFromPhotoRef.ts`. That file is a new file of this unit and is not in `unit.json` `source.files`, whose single repo is GilbApp. The rest of `photoRef.ts` (`ENTITY_OR_RECORD_RE`, `entityIdTail` and the others) is not taken.

**Merged units compared and taken or not.**

- `file-words` (`FileFetchOutcome`): the union of GilbApp `files.ts` lines 356-368 and the type in `file-words` have the same 75 tokens (comments excluded). Taken as a type import.
- `photo-ref` (`fileIdFromPhotoRef`): compared and NOT taken; see "Wrong readings".
- `downloadFileOutcome` (`files.ts` line 414): in no unit; it fetches with the app's credentials. A host member.
- `FILE_TOO_LARGE`: a constant of `files.ts`, in no unit; copied (two lines).

Named changes, and only these:

1. the imports: `downloadFileOutcome, FILE_TOO_LARGE, type FileFetchOutcome` from `../files` and `fileIdFromPhotoRef` from `gilb-photo` are `type FileFetchOutcome` from `@kaigilb/gilbplatformcode-file-words`, `./fileTooLarge`, `./fileIdFromPhotoRef` and the type `OrgMarkHost` from `./orgMarkHost`; in `OrgMark.tsx` `loadOrgLogoBlob` is imported from `./orgLogo` and `useOrgMarkHost` from `./orgMarkHost`;
2. `loadOrgLogoBlob(logo, door, deps = {})` is `loadOrgLogoBlob(host: OrgMarkHost, logo, door, deps = {})`, and the default download `downloadFileOutcome(fid, where, opts)` is `host.downloadFileOutcome(fid, where, opts)`;
3. in `OrgMark`, `const host = useOrgMarkHost();` is added as the first line, and `loadOrgLogoBlob(logo, vaultId)` is `loadOrgLogoBlob(host, logo, vaultId)`; the effect's dependency list stays `[logo, vaultId]`;
4. `OrgMarkHost`, `OrgMarkHostContext` and `useOrgMarkHost` are added (`src/orgMarkHost.ts`);
5. comments that name a cycle, an agent, a ticket or a ruling are reworded; no code changed.

`src/index.ts` is new. Tests (`src/*.test.ts`, `src/*.test.tsx`): `orgLogo.test.ts` is `lib/base/orgCard/orgLogo.s9fix.test.ts`, all 7 tests, with the same inputs and expectations (the host is `example.test`, the first argument of each call is a host that is never asked because `deps.download` is given, as the app's tests gave `download`). `orgLogoPinned.test.ts` (30), `OrgMark.test.tsx` (12), `fileIdFromPhotoRef.test.ts` (27) and `hostAgnostic.test.ts` (10) are new.

Left out: no test of the app that renders `OrgMark` alone exists; `OrgMark` is drawn inside the hierarchy and employees sections, whose tests mock `orgLogo` and belong to those units.
