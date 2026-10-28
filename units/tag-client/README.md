# tag-client

Reads the main tag of many records of one vault from the platform's batch route, fifty to a call, and says plainly when the platform has no tag routes.

## What this is

Reads the main tag of many records of one vault from the platform's batch route, fifty to a call, and says plainly when the platform has no tag routes.

Plain functions and types, no React, no credential. The platform makes a record's main tag itself, when the record is created; this unit only reads it. It asks `POST /base/tag/masters` on the platform client's origin with `{ vault, targetEntities }`, one call for every fifty records, and answers a map from each record's address to what the platform said about its tag. A platform that has not shipped the tag routes answers Fastify's own 404 (`Route … not found`); that becomes a `NoTagRoutesError` with the plain sentence, never a quiet empty answer.

- `readMainTags(platform, vault, records)`: the main tags of `records` (record addresses), all of ONE vault (`vault` is its `vaultId`). Answers `Map<recordAddress, MainTagRead>`. An empty list makes no call. The calls are made one after the other, in the caller's order.
- `MainTagRead`: `{ tag: string; known: true }` when the platform names a main tag; `{ tag: null; known: boolean; reason?: string }` otherwise (`known: false` with the platform's reason, `none`, `anomaly` or `hidden`, when it gave one).
- `MASTERS_BATCH_MAX` (50): the most records one call carries.
- `NoTagRoutesError`: a `PlatformError` (name `NoTagRoutesError`, message `NO_TAG_ROUTES_SENTENCE`, and the answer's `status`, `url`, `body`). Its optional `created` field is for a caller that has just created a record and wants to say what exists; nothing in this unit sets it.
- `NO_TAG_ROUTES_SENTENCE`: "This platform does not make tags yet".
- `isRouteMissing(answer)`: true for Fastify's own 404 for a route that is not registered, false for an entity 404 (`NotFound`, "No resource at …"). It looks at the message, not at the status alone.

## What this is not

- Not the whole of `gilb-stakeholders`' `tagClient.ts`: only the batch read of main tags. Not here: reading one record's main tag, asking the platform to make a tag (`ensure`), listing a record's tags, adding a tag, making one the main tag, removing one, the write rule for a new tag string, and the types of those calls. A later unit version takes them when an app that writes tags is taken.
- Not a cache: each call is a request. Where the answers are kept, and when they are read again, is the app's.
- Not a credential holder: it never sees a token or a proof. The fetch inside the platform client you give it adds them.
- Not a writer: nothing here changes a tag. (The route is a `POST` because it carries a list; it only reads.)

## How to take it

Package: `@kaigilb/gilbplatformcode-tag-client`

From a clone of this repository, install the unit's peer first, then the unit's folder:

```sh
npm install <path-to-the-library>/units/record-sync
npm install <path-to-the-library>/units/tag-client
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. `record-sync` (`^0.2.0`) is a peer: `readMainTags` takes its `PlatformClient`, and a `NoTagRoutesError` is a `PlatformError` of that package, so an app must have ONE copy of `record-sync` for `instanceof` to answer the same everywhere.

## Examples

```ts
import { readMainTags, NoTagRoutesError } from "@kaigilb/gilbplatformcode-tag-client";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

const platform: PlatformClient = { origin: "https://holder.platform.example.test", fetch: authenticatedFetch };
const vault = "https://holder.platform.example.test/vault";
const records = ["https://holder.platform.example.test/vault/e/r1", "https://holder.platform.example.test/vault/e/r2"];

try {
  const tags = await readMainTags(platform, vault, records); // 120 records would be 3 calls
  const first = tags.get(records[0]!);
  if (first?.tag) show(first.tag); // known: true
  else if (first && !first.known) show(`no tag (${first.reason ?? "unknown"})`);
} catch (e) {
  if (e instanceof NoTagRoutesError) show(e.message); // "This platform does not make tags yet"
  else throw e;
}
```

## What the host must supply

- `platform.fetch`: the host app's AUTHENTICATED fetch, at the platform origin (`platform.origin`). It adds the token and, where the app uses one, the DPoP proof. Every request here is a `POST` of a JSON body.
- The vault id as `GET /lws/vaults` names it, and record addresses as the platform serves them. All the records of one call belong to that one vault.
- Nothing else. No setting and no start-up call.

## Module state

None. The unit holds only constants.

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not mix vaults in one call. The platform answers a record of another vault as unknown (`known: false`, reason `none`), exactly as it does for a record that does not exist.
- Do not read `known: false` as "the record has no tag". It is also what the platform says for a record the caller cannot read, and for a record of another vault; the reason is `none`, `anomaly` (more than one main tag) or `hidden`.
- Do not catch every error as "no tag". A `NoTagRoutesError` means the platform cannot make tags at all; any other `PlatformError` is a failed read.
- Do not fall back to working a tag out of a name. There is one rule: the platform's.

## Wrong readings

- "`readMainTags` refuses more than 50 records." It does not: it cuts the list into calls of 50 (`MASTERS_BATCH_MAX`) and joins the answers; 51 records are two calls (50 and 1). (The GilbApp reading function that calls it, `readMasterTags`, does throw above 50, so its callers cut the list first; that is the app's, not this unit's.)
- "A failed second call leaves the first call's tags." It does not: the read throws and answers nothing; the map of the earlier calls is dropped.
- "An answer for a record is matched to the request." It is not: every row the platform sends with a string `targetEntity` is put in the map under that address, whether it was asked for or not; a record the platform does not answer is simply not in the map. If a record is answered in two calls, the later answer wins.
- "A row with a tag string is a tag." Only when `tagKnown` is exactly `true` and the string is a non-empty string. A known row with a null or empty string is `{ tag: null, known: true }`; a row with any other `tagKnown` is `{ tag: null, known: false }` whatever its string.
- "A `NoTagRoutesError` is any 404." It is only the platform's route-missing 404 (`Route … not found`, in the JSON `message` or, when the body is not JSON, in the text). An entity 404 is a plain `PlatformError`.
- "The `created` field of `NoTagRoutesError` is set here." It is not: it is in the type for a caller that creates a record and then finds the routes missing.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, file `src/tagClient.ts`, copied by script to `src/tagClient.ts`, symbol by symbol (the reached ones only, found with a symbol tracer from the main-tag read in GilbApp at `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, which pins this package at that commit): lines 24-25 (`NO_TAG_ROUTES_SENTENCE`), 26-27 (`MASTERS_BATCH_MAX`), 29-37 (`NoTagRoutesError`), 75-80 (`isRouteMissing`), 82 (`asObject`, private) and 193-223 (`MainTagRead`, `readMainTags`).

Not taken: in `tagClient.ts` the typed clients of the other tag routes (`readMasterTag`, `ensureMasterTag`, `readTags`, `addTag`, `makeMainTag`, `removeTag`), their error classes, and the imports of `tag.ts` and `tagWriteRule.ts` (lines 1-23, 28, 38-74, 81, 83-192).

**Merged units compared and taken or not.** `record-sync` (0.2.0) holds the platform client this reads through: `PlatformClient`, `PlatformError`, `PlatformAnswer`, `request`, `routeUrl` and `expectStatus` (the last added in 0.2.0 for this unit; `platform.ts` is byte-identical in the two commits). It is a peer. No other merged unit holds a symbol of these ranges (searched by name over every `units/*/src`).

Named changes, and only these:

1. the import line at the top: the source's `./platform.ts` (`expectStatus`, `PlatformError`, `request`, `routeUrl`, `PlatformAnswer`, `PlatformClient`) becomes the peer `@kaigilb/gilbplatformcode-record-sync`;
2. the header comment of the file is a new, shorter one; no code changed.

`src/index.ts` is new and exports the symbols above except `asObject`. Tests (`src/*.test.ts`; no shared set-up; a fake `fetch`, no network; the hosts are `example.test` hosts): ported from `gilb-stakeholders` `test/tagClient.test.ts` at the same commit, by test: "Fastify's own 404 is told from an entity 404 by the message, not by the status" (verbatim), "120 records are 3 calls (50, 50, 20), each with {vault, targetEntities}; the answers are joined" and "tagKnown:false carries its reason; an empty list makes no call; a platform without the route is a NoTagRoutesError" (both rewritten over a fake fetch, because the source runs them on the package's fixture platform; the last one is split into the tests of the row mapping, the empty list and the missing route). New: `tagClient.test.ts` (30 tests in all, of which 3 are the ported ones), `tagClientUnit.test.ts` (1: the export list). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: the tests of `readMasterTag` (1 of "a platform without the route is a NoTagRoutesError…" runs `readMasterTag`), `ensureMasterTag`, `readTags`, `addTag`, `makeMainTag` and `removeTag` (not taken).
