# search-words

Spaced words from a type name, and the short list of queries to try when a bare name misses.

## What this is

`pascalCaseToSearchWords(name)` inserts spaces into PascalCase or camelCase, and turns `_` and `-` into spaces.

`entityResolveSearchQueries(termName)` returns the queries to try, in order, with duplicates removed.

A label search often returns nothing for `AnchorDurability` and something for `Anchor Durability`. These functions only build the strings. They do not search, and they do not pick a hit.

## What this is not

- Not a ranker. The term-rank unit orders hits that are already in hand.
- Not a case fold. `FOO` stays `FOO`.
- Not a trim of the caller's name before the spaced form is compared. The spaced form is trimmed. The name is trimmed only when it is pushed as a query.

## How to take it

Package: `@kaigilb/gilbplatformcode-search-words`

```ts
import { pascalCaseToSearchWords, entityResolveSearchQueries } from "@kaigilb/gilbplatformcode-search-words";

const queries = entityResolveSearchQueries(typeName);
```

## What you pass

The type name, as the screen has it. Do not pre-split it.

## What you get

`pascalCaseToSearchWords`:

- `AnchorDurability` → `Anchor Durability`
- `SkillYearsOfExperienceScale` → `Skill Years Of Experience Scale`
- `XMLParser` → `XML Parser`
- `foo_bar--baz` → `foo bar baz`
- `a:Name` → `a:Name` (a colon is not a split)
- ends are trimmed, and runs of space become one space

`entityResolveSearchQueries`, in this order:

1. The name, trimmed. A blank is skipped.
2. The spaced form, only when it is not the same string as the untrimmed name.
3. Three or more spaced words: the first three, then the first two.
4. Exactly two spaced words: the first word only.

`FooBar` is `["FooBar", "Foo Bar", "Foo"]`.

`A B C` is `["A B C", "A B"]`. The full string is not repeated.

`Foo` is `["Foo"]`.

A string of spaces is `[]`.

Duplicates are removed by exact match, not by case fold.

## Host must supply

The search. Run the queries in the returned order and stop when the host's own exact-id rule has a hit. Do not take the first fuzzy hit just because a query returned rows.

## Do not

- Do not lowercase the words before searching if the search you are calling is case-sensitive and the app did not lowercase.
- Do not add the first word for a three-word name. Only the first three and the first two are added. A two-word name is the only case that adds the first word alone.
- Do not drop `FooBar` in favour of `Foo Bar`. Both are tried. The bare name is first.

## Wrong readings

- Step 2 compares the spaced form to the name before trim. `"  Foo  "` spaces to `Foo`, which is not equal to `"  Foo  "`, but the pushed query `Foo` is already in the list, so the result is still `["Foo"]`.
- `a:Name` is not split. Do not expect `a Name`.

## Source

GilbApp `src/lib/base/ontologyWrite.ts`, `pascalCaseToSearchWords` and `entityResolveSearchQueries`. The search that uses them stays in the app.
