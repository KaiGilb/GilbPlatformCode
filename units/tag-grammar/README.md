# tag-grammar

Parses, formats and checks record tags against the ontology's grammar and write rule.

## What this is

Parses, formats and checks record tags against the ontology's grammar and write rule.

Plain functions and types, no React, no credential. A record's tag is a short name, and its full form is `@<tag>@<vault name>`; inside the holder's own vault it may be written `@<tag>`. Neither the grammar nor the limits are in the code. Both are records on the GilbVeda master: the TagStandard record (a separator and an ordered list of segments, each with a pattern) and the write rule that `a:tagString` points to with `a:writeRule` (a character-class pattern, a maximum length, a one-script flag). This unit reads those records through a `VocabularySource` and walks them, so a change on the master changes what parses and what is refused with no release.

**The grammar** (`tag.ts`)

- `readTagGrammar(source, { standardTerm? }?)`: reads the TagStandard record (default `TAG_STANDARD_TERM`, `e/tag-standard-full-tag-at-vault`) and the spellings of its two facts, and answers a `TagGrammar` (`standard`, `separator`, `segments` sorted by position, `tag`, `vaultName`). A record this reader cannot walk is a `TagGrammarUnreadableError`, never a built-in grammar. `grammarFromRecord(record, spellings, fallbackIri)` is the same build from a record you already hold.
- `parseFullTag(text, grammar)`: the full form (`@ann@home`). Answers `{ ok: true, form: "full", tag, vaultName }` or `{ ok: false, reason }`; the reasons (`TagRefusal`) are `empty`, `surplus-token`, `missing-token`, `pattern`, `short-form-outside-own-vault` and `not-text`. An email address is refused.
- `parseTag(text, grammar, { ownVaultName })`: the full form anywhere, and the short form (`@ann`) only when `ownVaultName` names the holder's own vault. A caller that does not know passes `null`.
- `formatFullTag({ tag, vaultName }, grammar)`, `formatShortTag(tag, grammar)`, `formatTag(parts, grammar, context)`: the text for a tag. `formatTag` is short inside the holder's own vault and full everywhere else. Each throws `TagRefusedError` rather than emit text that would not parse back to the same tag and vault.
- `assertTagString(raw, grammar)`: the write-side gate on a tag string: NFC, then trim; refuses empty text, text holding the separator, and text the tag segment's pattern does not match. Answers the clean string.
- `normalizeTag(raw)`: NFC, then trim, as the platform does before it stores or looks up a tag. No case fold.
- `TAG_STANDARD_TERM`, `TAG_GRAMMAR_TERMS` (`a/segments`, `a/separator`), `TAG_SEGMENT_LABEL` (`tag`), `VAULT_NAME_SEGMENT_LABEL` (`vault-name`).
- Errors: `TagGrammarUnreadableError` (a `VocabularyUnavailableError` of the peer), `TagRefusedError` (`reason`).
- Types: `TagSegment`, `TagGrammar`, `TagRefusal`, `ParsedTag`, `TagContext`.

**The write rule** (`tagWriteRule.ts`)

- `readTagWriteRule(source)`: follows `a:writeRule` from `a:tagString` and reads the rule record. Answers a `TagWriteRule` (`iri`, `pattern` compiled with `u`, `maxCharacters`, `singleScript`, `statement`). A record that is not exactly `^[<one character class>]{m,n}$` with `maxCharacters` equal to `n`, or that states a value twice, is a `VocabularyUnavailableError`.
- `checkNewTagString(raw, rule)`: whether `raw` may be written as a NEW tag string. Answers `{ ok: true, tag }` or `{ ok: false, reason }`. The checks run in this order: empty, `@`, white space, invisible or control character, too long, the record's pattern, one script. The record may tighten the first five and may not loosen them.
- `effectiveTagMax(maxCharacters)`: `min(64, maxCharacters)`.
- `tagRefusalSentence(reason, max?)`: one plain sentence for each reason. `max` is a rule (shows `min(64, its number)`), a number (shown as given) or nothing (64).
- `TagStringRefusedError(reason, rule, maxCharacters?)`: a new tag string the rule does not allow; its message is the sentence. `isTagWriteRefusal(value)` tells a reason from anything else.
- Types: `TagWriteRefusal`, `TagWriteVerdict`, `TagWriteRule`.

**The resolver** (`tagResolve.ts`)

- `resolveTag(platform, grammar, { text, vaults, context })`: parses the text, finds the vault id for the vault name in the list the caller hands it, and asks `GET /base/tag/resolve?tagString=<tag>&vault=<vault id>`. Answers `resolved` (with the record and tag handle), `miss`, `refused` (the text is not a tag in this context) or `unknown-vault` (the vault name is not in the list; nothing was asked).
- `lookupTagString(platform, { tag, vaultId })`: the route call alone. Answers `resolved` or `miss`.
- Types: `NamedVault`, `TagLookup`, `TagResolution`.

## What this is not

- Not the typed clients of the platform's tag routes (read a record's tags, add, remove, make main): that is `tag-client`, which takes this unit as a peer for the check of a new tag string.
- Not a place that names a grammar: no separator, segment, pattern or length is in the code except the platform's ceiling of 64 characters.
- Not a vault-name directory: the platform has no route that gives an app the short names of the vaults it can reach, so `resolveTag` is handed the pairs the caller knows. It never works a vault name out of a vault id's host, or the reverse.
- Not a writer of tags: `assertTagString` and `checkNewTagString` only judge a string. The platform is the gate on a write.
- Not the master reader: reading term documents, and bounding every request, is `vocabulary-source`, a peer. Calling the platform is `record-sync`, a peer.

## How to take it

Package: `@kaigilb/gilbplatformcode-tag-grammar`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/tag-grammar` prints:

```sh
npm install <path-to-the-library>/units/tag-grammar
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. `vocabulary-source` (`^0.1.0`) and `record-sync` (`^0.3.0`) are peers. An app must have ONE copy of each: `TagGrammarUnreadableError` is a `VocabularyUnavailableError` of `vocabulary-source` and `resolveTag` calls `PlatformError` of `record-sync`, so `instanceof` answers the same everywhere only with one copy.

## Examples

```ts
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { checkNewTagString, formatTag, parseTag, readTagGrammar, readTagWriteRule, resolveTag, tagRefusalSentence } from "@kaigilb/gilbplatformcode-tag-grammar";

const source = masterSource({ vedaOrigin: "https://ontology.platform.example.test" });
const grammar = await readTagGrammar(source);

parseTag("@ann@home", grammar, { ownVaultName: null }); // { ok: true, form: "full", tag: "ann", vaultName: "home" }
parseTag("@ann", grammar, { ownVaultName: "home" }); // { ok: true, form: "short", tag: "ann", vaultName: "home" }
parseTag("@ann", grammar, { ownVaultName: null }); // { ok: false, reason: "short-form-outside-own-vault" }
formatTag({ tag: "ann", vaultName: "home" }, grammar, { ownVaultName: "home" }); // "@ann"

const rule = await readTagWriteRule(source);
const verdict = checkNewTagString("Ann Lee", rule);
if (!verdict.ok) show(tagRefusalSentence(verdict.reason, rule)); // "A tag cannot contain spaces."

const found = await resolveTag(platform, grammar, {
  text: "@ann@away",
  vaults: [{ vaultId: "https://away.example.test/vault", vaultName: "away" }],
  context: { ownVaultName: "home" },
});
if (found.status === "resolved") open(found.record);
```

## What the host must supply

- A `VocabularySource` of the master (`masterSource` of `vocabulary-source`, or any object with the same members) for `readTagGrammar` and `readTagWriteRule`. Its origin is the app's; nothing here names one.
- For `resolveTag` and `lookupTagString`: a `PlatformClient` (`{ origin, fetch }` of `record-sync`) whose `fetch` is the host's AUTHENTICATED fetch, and the list of `{ vaultId, vaultName }` pairs the caller knows.
- Nothing else. No setting and no start-up call.

## Module state

The unit holds one piece of module state.

- `scriptTable` (`tagWriteRule.ts`): the list of compiled script expressions the one-script check tries in turn. It is built on the first call of `checkNewTagString` that reaches the one-script check, with the script names this JavaScript engine accepts, and kept. It is a cache of values that depend only on the engine: two installed copies would each build their own and answer the same. Nothing runs at import.

Keep one copy of the unit anyway: its errors (`TagRefusedError`, `TagStringRefusedError`, `TagGrammarUnreadableError`) are tested with `instanceof`.

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not read the grammar from a copy in your app. If the separator, a segment or a length is wrong, it is wrong on the master.
- Do not catch `TagGrammarUnreadableError` or a `VocabularyUnavailableError` from `readTagWriteRule` as "no rule". The record could not be read; a caller that is about to write does not block on it, because the platform is the gate.
- Do not call `checkNewTagString` on a tag that is already stored. It judges a NEW string. A stored tag such as `Ann Lee` still formats and still resolves.
- Do not pass `ownVaultName` unless the text is typed or shown inside the holder's own vault. The short form is accepted and produced only then.
- Do not turn a vault id into a vault name, or the reverse, by looking at a host.
- Do not read a `miss` from `resolveTag` as "this tag is free". The route folds "no such tag in that vault" and "one the caller may not read" into one answer on purpose.

## Wrong readings

- "`checkNewTagString` honours `singleScript: false`." It does not: one script is a floor, so a record that stores `false` still refuses a Latin and Cyrillic mix. Japanese (Han with Hiragana or Katakana), Korean (Han with Hangul) and Chinese with Bopomofo count as one script.
- "A looser record pattern loosens the check." It cannot: the floor (no `@`, no white space, no invisible or control character) and the 64 ceiling run first. A record whose pattern allows spaces still has spaces refused (`white-space`).
- "`maxCharacters: 100` allows 100." It allows 64: the effective maximum is `min(64, maxCharacters)`, and the `too-long` sentence says 64. A record with `maxCharacters: 40` says 40.
- "A pattern `{0,64}` is refused." It is read (the lower bound is not checked against 1), and the empty string is still refused as `empty` before the pattern runs.
- "`{ ok: true, tag }` is the string you gave." It is the string after NFC and trim.
- "`parseTag` of a bad full form says why the short form failed." It does not: when the short walk also fails, the reason of the FULL walk is answered.
- "`parseTag` of `@ann` with `ownVaultName: null` is a parse error of the text." It is `short-form-outside-own-vault`: the text is a tag, in a context where it cannot be used.
- "`assertTagString` applies the write rule." It applies the grammar's tag segment (its pattern, and no separator). The write rule is `checkNewTagString`; `tag-client`'s `addTag` runs the rule first, then the grammar.
- "`formatFullTag` returns what you gave it." It returns the text after `assertTagString`, and throws if that text does not parse back to the same tag and vault.
- "`resolveTag` with two vault ids under one vault name picks one." It throws: picking one would resolve in a vault nobody chose. Nothing is asked.
- "A `200` from the resolve route that is neither a hit nor a miss is a miss." It throws: a miss means "free".
- "`readTagGrammar` falls back to `@tag@vault` when the master is unreachable." It never does: it rejects with a `VocabularyUnavailableError`.
- The constant `KAI_TAG_MAX_CHARACTERS` (64, private, `tagWriteRule.ts`) keeps the name it has in the app. It is not exported.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, three whole files copied by script:

- `src/tag.ts` to `src/tag.ts`: lines 37-305 (the file after its header and imports);
- `src/tagWriteRule.ts` to `src/tagWriteRule.ts`: lines 29-411;
- `src/tagResolve.ts` to `src/tagResolve.ts`: lines 19-74.

Nothing of these three files is left out. Blank separator lines between a header, the imports and the code are not listed.

**Merged units compared and taken or not.** `vocabulary-source` holds the reads these files make of the master: `spellingOfTermDoc`, `valuesUnder`, `refsUnder`, `VocabularyUnavailableError`, `TermDoc` and `VocabularySource`. It is a peer, and the imports of `./terms.ts` and `./source.ts` are one import of it. `record-sync` (0.3.0) holds `expectStatus`, `request`, `routeUrl` and `PlatformClient` that `tagResolve.ts` calls through; it is a peer. No other merged unit holds a symbol of these files (searched by name over every `units/*/src`).

Named changes, and only these:

1. the imports of the source's own files lose `.ts` (`./tag`); the imports of `./terms.ts` and `./source.ts` are one import of the peer `@kaigilb/gilbplatformcode-vocabulary-source`, and the import of `./platform.ts` is an import of the peer `@kaigilb/gilbplatformcode-record-sync`;
2. the header comment of each file is a new, shorter one, and comments that name a person, an agent, a cycle or a ticket are reworded; no code changed.

`src/index.ts` is new and exports every symbol of the three files. Tests (`src/*.test.ts`; shared set-up in `test/`, not shipped; a fake master and a fake platform, no network; the hosts are `example.test` hosts, the people Ann and Ben): ported from `gilb-stakeholders` `test/` at the same commit, by test: `tag.test.ts` 20 of 20, `tagResolve.test.ts` 10 of 10, `tagWriteRule.test.ts` 13 of 30 (two of its blocks run row by row; as `tagWriteRule.test.ts`), the one test of `tagWriteRule.s156gap.test.ts` (as `tagWriteRule.storedPattern.test.ts`), `tagWriteRule.s160.test.ts` (51 rows, as `tagWriteRule.records.test.ts`), the 3 of `tagWriteRule.s163gap.test.ts` (as `tagWriteRule.unreadable.test.ts`) and the 15 of `tagWriteRule.s167.test.ts` (as `tagWriteRule.literals.test.ts`). The 54 known answers are `test/tagWriteRule.cases.json`, taken from the source's `test/tagWriteRule.cases.json` (one line of 1,738 bytes with no final newline, so a line count reads 0) with the names `tom`, `Tom Gilb`, `Alice`, `Kai-Zen` and `BVGATE` changed to `ann`, `Ann Lee`, `Ann`, `Zen` and `GATE`; every verdict is the same. The fake platform `test/platformFixture.ts` is the source's `test/fixturePlatform.ts` with the routes this unit does not call left out. New: `tagGrammarUnit.test.ts` (1: the export list) and `tagGrammarPins.test.ts` (21: the constants, `grammarFromRecord`, `standardTerm`, the refusal vocabulary, `effectiveTagMax`, the errors, the script mixes, NFC, the round-trip guard of `formatFullTag`). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: from `tagWriteRule.test.ts` the blocks that run `addTag` (they are in `tag-client`), and the blocks that run `pickOrCreate`, `pickByTag`, `readPickerVocabulary` and `resolveFieldSets` (not in this unit); `tagWriteRule.s160gap.test.ts` (runs `addTag`, in `tag-client`); `tagRefusals.test.ts` (runs the typed clients, in `tag-client`).
