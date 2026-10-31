# language-fetch-pool

Reads language and flag data with at most eight requests at once and a time limit on each.

## What this is

Reads language and flag data with at most eight requests at once and a time limit on each.

The one pool that language-entry reads and flag reads go through. `pooledGet(url, init, read, opts)` makes one GET through the pool and bounds it by a timeout that starts when the read starts (a read waiting its turn is not slow) and covers the answer and the reading of its body. At most `LANGUAGE_FETCH_PARALLEL` (8) are in flight; a read that does not finish in `LANGUAGE_FETCH_TIMEOUT_MS` (8000 ms, or `opts.timeoutMs`) throws `FetchTimeoutError`. `pooled(task)` is the pool alone; `__poolActive` and `__resetFetchPool` are for tests.

## What this is not

- Not a cache: it keeps no answer. Its callers (`flag-source`, `language-entry`) keep theirs.
- Not a retry: a failed read is the caller's to ask again.
- Not a fetch of its own: it calls the `fetch` of the page, or `opts.fetchFn`.

## How to take it

Package: `@kaigilb/gilbplatformcode-language-fetch-pool`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/language-fetch-pool` prints:

```sh
npm install <path-to-the-library>/units/language-fetch-pool
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing. It wraps a GET; the callers make only GETs.

## Requests and their servers

None of its own. Each call makes the one GET it is given, with the init it is given.

## Examples

```ts
import { pooledGet } from "@kaigilb/gilbplatformcode-language-fetch-pool";

const text = await pooledGet(url, { headers: { Accept: "application/json" } }, (res) => res.text(), { timeoutMs: 8000 });
```

## What the host must supply

A `fetch` (the page's, or `opts.fetchFn` in a test).

## Module state

`active` (reads in flight) and `waiting` (the queue), one pool for the page. Install the unit once. `__resetFetchPool()` clears both, for tests.

## Do not

- Do not make a second pool in another unit: the cap of eight is across entries and flags together.
- Do not hand it a write.

## Wrong readings

- "The timeout counts the wait in the queue." It starts when the read starts.
- "A timed-out read is retried." It throws `FetchTimeoutError`; the caller decides.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/lib/mynet/languages/fetchPool.ts`, the whole file (110 lines), to `src/fetchPool.ts`.

Named changes, and only these: the file header is new and the comments that name a cycle, an agent or a ruling are reworded; no code changed. The comment-stripped file equals the source (0 diff, 274 words).

## Tests

22 tests in 3 files (`npx vitest run`):

- `fetchPool.test.ts` 7: the 6 cases of the source's `fetchPool.s8fix.test.ts`, whole, and 1 new (an aborted signal makes no request).
- `exports.test.ts` 2: the seven exports and the two numbers.
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units.

Mutation checks: 7 mutants of `src/fetchPool.ts`, 6 killed, 1 equivalent (FP5: the `catch` rethrows the `FetchTimeoutError` the timer already rejected the race with).
