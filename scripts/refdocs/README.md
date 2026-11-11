# refdocs

## What this is

Writes one reference document and one exhibit per unit to the GilbPlatformCode Library on appbuilder, so Agent.Coder can find each unit through References.

`library.json` holds the tag, title and note per unit folder; `notice.txt` holds the attribution notice; `build-input.mjs` joins them with the merged repository to make the input; `write-refdocs.mjs` writes it.

## Run

```
node scripts/refdocs/build-input.mjs
node scripts/refdocs/write-refdocs.mjs --dry-run
node scripts/refdocs/check-dry-run.mjs
node scripts/refdocs/write-refdocs.mjs --token-file <path>
```

`build-input.mjs` fetches origin first (`--no-fetch` skips it; `--repo <path>` names another checkout; `--main <ref>` reads that ref instead of `origin/main`, which pins a test or a re-run to a known commit). Generated files go to `scripts/refdocs/out/`, which git ignores.

The live run needs the vault owner's key, handed over as a file path. The key file is deleted on every exit path, including refusals and crashes.

The key file is deleted on every exit, including --dry-run: never pass --token-file to a dry run.

Exit 1 also when a tag was already present and skipped; read the receipt's counts, not only the exit code.

## Stance

Converging: it reads References first, never re-creates an exact tag, never overwrites an exhibit, and reads back once after all creates.

## Refresh

`write-refdocs.mjs --token-file <path> --refresh` brings documents that are already live level with the input. Without the flag nothing present is ever touched (a present tag is skipped, as before).

For a tag held by exactly one document with exactly one exhibit whose text starts with `**What it does:**`, it compares the live document (`a:title`, `a:name`, `a:label`, `a:appliesTo`) and exhibit (`a:referenceExhibit`, `a:title`) with the input, and sends only the facts that differ: `PATCH ${HOST}/lws/r/<id>`, `Content-Type: application/merge-patch+json`, `If-Match` from a GET of that record just before. The document goes first, then the exhibit. After all units it reads each refreshed document and exhibit back once.

It never sends `a:unitTag`, `a:partOf`, `a:directReader`, `a:attribution`, `a:license` or `a:handsOffTo`, never sends null, never DELETEs, never creates a second document for a present tag.

States (in the receipt `counts` only under `--refresh`):

- `refreshed`: the PATCH answered 200 and the readback shows the wanted values.
- `unchanged`: live already equals the input; nothing sent.
- `not-refreshed`: nothing was overwritten, with the reason: more than one document for the tag, not exactly one exhibit, an exhibit not starting with `**What it does:**` (reported, never overwritten), 412 (changed meanwhile, re-run), or another status.
- `unknown`: a 5xx or network error, or a readback that does not show the wanted values.

Exit 0 only when no unit ended `not-refreshed`, `unknown`, `not-created` or `failed`; a refreshed or unchanged present tag is not a failure under `--refresh`. `--dry-run --refresh` prints the POSTs as usual plus a note that refresh decisions need the live listing; it sends nothing and reads no key.

## Test

```
node --test "scripts/refdocs/test/**/*.test.mjs"
```

Node 25 does not take a directory here.
