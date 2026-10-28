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

`build-input.mjs` fetches origin first (`--no-fetch` skips it; `--repo <path>` names another checkout). Generated files go to `scripts/refdocs/out/`, which git ignores.

The live run needs the vault owner's key, handed over as a file path. The key file is deleted on every exit path, including refusals and crashes.

The key file is deleted on every exit, including --dry-run: never pass --token-file to a dry run.

Exit 1 also when a tag was already present and skipped; read the receipt's counts, not only the exit code.

## Stance

Converging: it reads References first, never re-creates an exact tag, never overwrites an exhibit, and reads back once after all creates.

## Test

```
node --test "scripts/refdocs/test/**/*.test.mjs"
```

Node 25 does not take a directory here.
