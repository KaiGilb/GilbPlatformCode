# tag-client

Reads the main tag of many records of one vault from the platform's batch route, fifty to a call, and says plainly when the platform has no tag routes.

## What this is

Reads the main tag of many records of one vault from the platform's batch route, fifty to a call, and says plainly when the platform has no tag routes.

Plain functions and types, no React, no credential. The platform makes a record's main tag itself, when the record is created. This unit reads it, asks the platform to make one when a record has none, lists a record's tags, adds one, makes one the main tag and removes one, each through a typed call of the platform's tag routes on the platform client's origin. A platform that has not shipped the tag routes answers Fastify's own 404 (`Route … not found`); that becomes a `NoTagRoutesError` with the plain sentence, never a quiet empty answer.

- `readMainTags(platform, vault, records)`: the main tags of `records` (record addresses), all of ONE vault (`vault` is its `vaultId`). Answers `Map<recordAddress, MainTagRead>`. An empty list makes no call. It asks `POST /base/tag/masters` with `{ vault, targetEntities }`, one call for every fifty records, one after the other, in the caller's order.
- `MainTagRead`: `{ tag: string; known: true }` when the platform names a main tag; `{ tag: null; known: boolean; reason?: string }` otherwise (`known: false` with the platform's reason, `none`, `anomaly` or `hidden`, when it gave one).
- `MASTERS_BATCH_MAX` (50): the most records one call carries.
- `NoTagRoutesError`: a `PlatformError` (name `NoTagRoutesError`, message `NO_TAG_ROUTES_SENTENCE`, and the answer's `status`, `url`, `body`). Its optional `created` field is for a caller that has just created a record and wants to say what exists; nothing in this unit sets it.
- `NO_TAG_ROUTES_SENTENCE`: "This platform does not make tags yet".
- `isRouteMissing(answer)`: true for Fastify's own 404 for a route that is not registered, false for an entity 404 (`NotFound`, "No resource at …"). It looks at the message, not at the status alone.

### Changes in 0.2.0

Taken from the same commit of `gilb-stakeholders`, `0a261488be7c98d1ac5d79887c966a445b8928bd`, because the Stakeholder card reads, adds and removes the tags of a person's record and needs the whole file. New code, copied by script from `src/tagClient.ts`: lines 39-73 (`TagTakenError`, `TagRoleDerivedError`, `TagRole`, `TagOrigin`, `RecordTag`, `MasterRead`) and 84-191 (`readMasterTag`, `ensureMasterTag`, `readTags`, `newTagString`, `addTag`, `makeMainTag`, `removeTag`). Nothing of 0.1.0 changed: the 0.1.0 lines 24-37, 75-82 and 193-223 are the same, and the file is now lines 24-223 of the source, whole. New named change: the source's two imports of `tag.ts` and `tagWriteRule.ts` are one import of the new peer `tag-grammar` (`^0.1.0`), because `addTag` checks a new tag string with `checkNewTagString` and `assertTagString` before it sends anything and throws `TagStringRefusedError`. New peer: `tag-grammar` (and through it `vocabulary-source`); `record-sync` stays a peer (`^0.3.0`). The unit's own code reads the ontology only through `tag-grammar`'s `TagGrammar` and `TagWriteRule` values that the caller hands `addTag`; it makes no read of the master itself.

Added calls and types:

- `readMasterTag(platform, record)`: `GET /base/tag/master?targetEntity=<record>`. Answers a `MasterRead`: `{ status: "master", tag, tagHandle }`, `{ status: "unknown", reason: "none" | "anomaly" | "hidden" }` (the platform's own reason; only `none` means the record has no tag) or `{ status: "unreadable" }` (the platform's non-disclosing 404 for a record the caller may not read, or an answer of neither shape).
- `ensureMasterTag(platform, record, agent)`: `POST /base/tag/ensure`. The platform gives the record its tag when it has none; a no-op when it has one. Answers `{ tagHandle, tagString, tagRole, changed }`. A 403 is the caller's and is thrown.
- `readTags(platform, record)`: `GET /base/tag/list?targetEntity=<record>`. Answers the `RecordTag[]` the caller may read (`tagHandle`, `tagString`, `tagRole` of `master | alt | hidden`, `tagOrigin` of `assigned | registered`); a row without a handle or a string, or with a role outside the three, is skipped.
- `addTag(platform, record, tagString, agent, { rule?, grammar? }?)`: `POST /base/tag/handle`, role `alt`. With a `rule` (a `TagWriteRule` of `tag-grammar`) the string is checked first and a bad one throws `TagStringRefusedError` with no request; the `grammar` (`TagGrammar`) after it, and alone without a rule; with neither the string is trimmed and normalised (NFC). The platform's 400 `tag-string-refused` is a `TagStringRefusedError` carrying the number the platform applied; a 409 `TagStringCollisionError` is `TagTakenError`. Answers `{ tag, changed }`.
- `makeMainTag(platform, record, tagString, agent)`: `POST /base/tag/reassign-master`. A 409 `TagRoleDerived` (the master is assigned) is `TagRoleDerivedError`. Answers `{ changed }`.
- `removeTag(platform, record, tagString, agent)`: `POST /base/tag/remove`. The platform refuses the master ("Make another tag main first.") and assigned tags with a 409, which is a `PlatformError` here. Answers `{ changed, tagString }`.
- `TagTakenError` (`tag`), `TagRoleDerivedError`, and the types `TagRole`, `TagOrigin`, `RecordTag`, `MasterRead`.

Tests: `src/tagClient.routes.test.ts` (17) is `test/tagClient.test.ts` of the source, whole, over a copy of the app's fake platform (`test/platformFixture.ts`); `src/tagRefusals.test.ts` (13) is `test/tagRefusals.test.ts`, whole; `src/addTag.rule.test.ts` (13) is the `addTag` tests of `test/tagWriteRule.test.ts` and `test/tagWriteRule.s160gap.test.ts`, with the rule and the grammar read from a fake master by `tag-grammar` as the app reads them. New: `src/tagClient.more.test.ts` (20: the edges of every added call and the two errors). The 30 tests of 0.1.0 (`src/tagClient.test.ts`) are unchanged.

## What this is not

- Not a cache: each call is a request. Where the answers are kept, and when they are read again, is the app's.
- Not a credential holder: it never sees a token or a proof. The fetch inside the platform client you give it adds them.
- Not the grammar or the write rule: reading them from the master and judging a string is `tag-grammar`, a peer. This unit only applies a rule and a grammar the caller hands `addTag`, and never reads the master.
- Not a maker of tags: the platform makes a record's main tag when the record is created, and `ensureMasterTag` asks it to when a record has none. Nothing here works a tag out of a name.
- Not the lookup of a tag to a record (`resolveTag`): that is `tag-grammar`.
- Not the step of "find this person, else make a card": that uses `addTag` and `readMasterTag` and is not in this unit.

## How to take it

Package: `@kaigilb/gilbplatformcode-tag-client`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/tag-client` prints:

```sh
npm install <path-to-the-library>/units/tag-client
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. `record-sync` (`^0.3.0`) and `tag-grammar` (`^0.1.0`) are peers: every call takes `record-sync`'s `PlatformClient`, a `NoTagRoutesError` is a `PlatformError` of that package, and `addTag` throws the `TagStringRefusedError` of `tag-grammar`, so an app must have ONE copy of each for `instanceof` to answer the same everywhere.

## Examples

```ts
import { addTag, readMainTags, readTags, removeTag, NoTagRoutesError, TagTakenError } from "@kaigilb/gilbplatformcode-tag-client";
import { readTagGrammar, readTagWriteRule, TagStringRefusedError, tagRefusalSentence } from "@kaigilb/gilbplatformcode-tag-grammar";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

const platform: PlatformClient = { origin: "https://holder.platform.example.test", fetch: authenticatedFetch };
const vault = "https://holder.platform.example.test/vault";
const records = ["https://holder.platform.example.test/vault/e/r1", "https://holder.platform.example.test/vault/e/r2"];

try {
  const tags = await readMainTags(platform, vault, records); // 120 records would be 3 calls
  const first = tags.get(records[0]!);
  if (first?.tag) show(first.tag); // known: true
  else if (first && !first.known) show(`no tag (${first.reason ?? "unknown"})`);

  const agent = "https://holder.platform.example.test/vault/e/app";
  try {
    await addTag(platform, records[0]!, "ann", agent, { rule: await readTagWriteRule(source), grammar: await readTagGrammar(source) });
  } catch (e) {
    if (e instanceof TagStringRefusedError) show(e.message); // "A tag cannot contain spaces."
    else if (e instanceof TagTakenError) show(`${e.tag} is used already`);
    else throw e;
  }
  const mine = await readTags(platform, records[0]!); // master, alts, hidden
  await removeTag(platform, records[0]!, "ann", agent);
} catch (e) {
  if (e instanceof NoTagRoutesError) show(e.message); // "This platform does not make tags yet"
  else throw e;
}
```

## What the host must supply

- `platform.fetch`: the host app's AUTHENTICATED fetch, at the platform origin (`platform.origin`). It adds the token and, where the app uses one, the DPoP proof. A read is a `GET` or, for the batch, a `POST` of a JSON body; a write is a `POST` of a JSON body.
- The vault id as `GET /lws/vaults` names it, and record addresses as the platform serves them. All the records of one batch call belong to that one vault.
- For `addTag`: optionally a `TagWriteRule` and a `TagGrammar` that the app read through `tag-grammar`, and the `agent` address the platform records as the writer.
- Nothing else. No setting and no start-up call.

## Module state

None. The unit holds only constants.

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not mix vaults in one batch call. The platform answers a record of another vault as unknown (`known: false`, reason `none`), exactly as it does for a record that does not exist.
- Do not read `known: false` as "the record has no tag". It is also what the platform says for a record the caller cannot read, and for a record of another vault; the reason is `none`, `anomaly` (more than one main tag) or `hidden`.
- Do not catch every error as "no tag". A `NoTagRoutesError` means the platform cannot make tags at all; any other `PlatformError` is a failed read.
- Do not fall back to working a tag out of a name. There is one rule: the platform's.
- Do not read `{ status: "unreadable" }` of `readMasterTag` as "the record has no tag". It is a record the caller may not read, or an answer of neither shape.
- Do not treat a `TagTakenError` as an error of the caller's tag alone: the tag is a tag of ANOTHER record of this vault.
- Do not send a new tag string without the rule when you hold one. `addTag` with the rule refuses a bad string before any request; without it the platform's 400 is the gate.

## Wrong readings

- "`readMainTags` refuses more than 50 records." It does not: it cuts the list into calls of 50 (`MASTERS_BATCH_MAX`) and joins the answers; 51 records are two calls (50 and 1). (The GilbApp reading function that calls it, `readMasterTags`, does throw above 50, so its callers cut the list first; that is the app's, not this unit's.)
- "A failed second call leaves the first call's tags." It does not: the read throws and answers nothing; the map of the earlier calls is dropped.
- "An answer for a record is matched to the request." It is not: every row the platform sends with a string `targetEntity` is put in the map under that address, whether it was asked for or not; a record the platform does not answer is simply not in the map. If a record is answered in two calls, the later answer wins.
- "A row with a tag string is a tag." Only when `tagKnown` is exactly `true` and the string is a non-empty string. A known row with a null or empty string is `{ tag: null, known: true }`; a row with any other `tagKnown` is `{ tag: null, known: false }` whatever its string.
- "A `NoTagRoutesError` is any 404." It is only the platform's route-missing 404 (`Route … not found`, in the JSON `message` or, when the body is not JSON, in the text). An entity 404 is a plain `PlatformError`.
- "The `created` field of `NoTagRoutesError` is set here." It is not: it is in the type for a caller that creates a record and then finds the routes missing.
- "`addTag`, `removeTag` and `makeMainTag` throw `NoTagRoutesError` on a missing route." They do not: only `readMasterTag`, `ensureMasterTag`, `readTags` and `readMainTags` look for the route-missing 404. `addTag`, `makeMainTag` and `removeTag` surface the `PlatformError` of the answer.
- "`addTag` adds a master." It adds an `alt`; the master is the platform's and changes only through `makeMainTag`. A 409 `entity-has-master` is not mapped: it is a `PlatformError`.
- "`addTag` sends the string you passed." It sends the string after the check: trimmed and NFC-normalised, in every case, and the answer's `tag` is that string. A string the check refuses is never sent.
- "`addTag` with only a `grammar` applies the write rule." It does not: the grammar refuses text holding the separator or not matching the tag segment's pattern, and nothing else; without a `rule` the platform's 400 is the gate on the floor and the length.
- "`makeMainTag` and `removeTag` normalise the tag string." They send it as given.
- "`ensureMasterTag` always answers `tagRole: master`." It answers the platform's `tagRole` when it is text and `master` when the answer has none.
- "`readTags` answers every row." It skips a row with no handle or string, or a role outside `master`, `alt`, `hidden`; a missing or unknown `tagOrigin` reads as `registered`.
- "A failed `readMasterTag` of a 404 means the record does not exist." The platform answers a missing record and an unreadable one with the same 404; it is `{ status: "unreadable" }` either way.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, file `src/tagClient.ts`, copied by script to `src/tagClient.ts`, the whole of it after its header and imports: lines 24-223. (0.1.0 held lines 24-25, 26-27, 29-37, 75-80, 82 and 193-223, found with a symbol tracer from the main-tag read in GilbApp at `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, which pins this package at that commit; 0.2.0 takes the rest.)

Nothing of the file is left out.

**Merged units compared and taken or not.** `record-sync` (0.3.0) holds the platform client this reads through: `PlatformClient`, `PlatformError`, `PlatformAnswer`, `request`, `routeUrl` and `expectStatus`. It is a peer. `tag-grammar` (0.1.0) holds the symbols of `tag.ts` and `tagWriteRule.ts` that `addTag` uses: `assertTagString`, `checkNewTagString`, `effectiveTagMax`, `isTagWriteRefusal`, `TagStringRefusedError`, `TagGrammar` and `TagWriteRule`. It is a peer. No other merged unit holds a symbol of this file (searched by name over every `units/*/src`).

Named changes, and only these:

1. the import line at the top: the source's `./platform.ts` (`expectStatus`, `PlatformError`, `request`, `routeUrl`, `PlatformAnswer`, `PlatformClient`) becomes the peer `@kaigilb/gilbplatformcode-record-sync`;
2. the source's two imports of `./tag.ts` and `./tagWriteRule.ts` become one import of the peer `@kaigilb/gilbplatformcode-tag-grammar` (`assertTagString`, `checkNewTagString`, `effectiveTagMax`, `isTagWriteRefusal`, `TagStringRefusedError`, `TagGrammar`, `TagWriteRule`);
3. the header comment of the file is a new, shorter one that names no cycle, ticket or branch; no code changed.

`src/index.ts` is new and exports every symbol of the file except `asObject` and `newTagString` (private). Tests (`src/*.test.ts`; shared set-up in `test/`, not shipped; a fake platform and a fake master, no network; the hosts are `example.test` hosts, the people Ann and Ben): ported from `gilb-stakeholders` `test/` at the same commit: `tagClient.test.ts` 17 of 17 (as `tagClient.routes.test.ts`), `tagRefusals.test.ts` 13 of 13, and from `tagWriteRule.test.ts` 12 of 30 (the `addTag` block, the test of `addTag` when the rule record cannot be read, the `addTag` rows of "the rule speaks before the grammar", and the `addTag` test of the 64 ceiling; the other 13 are in `tag-grammar`) and the one test of `tagWriteRule.s160gap.test.ts` (together `addTag.rule.test.ts`, 13). 0.1.0's `tagClient.test.ts` (30), `tagClientUnit.test.ts` and `hostAgnostic.test.ts` are kept; the export-list test lists the 13 values now. New: `tagClient.more.test.ts` (20). Left out, with reasons: from `tagWriteRule.test.ts` the five tests that run `pickOrCreate` and `pickByTag` (a create with the rule, the three `pickOrCreate` rows of "the rule speaks before the grammar", and "a stored tag the rule would refuse is still picked"), which are not in this unit.
