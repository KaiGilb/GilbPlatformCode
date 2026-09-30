# search-tokens

The words in a search box, for display and for ordering. Not the match that keeps or drops a person.

## What this is

| Export | Job |
|---|---|
| `MAX_SEARCH_TOKENS` | `8`. The cap inside `searchTokens`. |
| `searchTokens` | Distinct non-empty words, first spelling kept, at most 8. |
| `wordPrefixMatch` | Whether any word of a value starts with a token. |
| `labelWordPrefixMatchesQuery` | Whether every kept token is a prefix of some word in a label. |
| `labelFromSkillUri` | A readable label from the last segment of an address. |

`searchTokens` applies Unicode NFC, then splits on whitespace. JavaScript's `\s` is the split, so a non-breaking space splits. Blank pieces are dropped. Duplicates are dropped by `toLocaleLowerCase()` with no locale argument, so the machine's locale decides pairs such as dotted and dotless i. The stored token keeps the first spelling. It is not the lower-cased form. The ninth distinct token is ignored. Later duplicates of an earlier token are not seen once the list is full, and they do not need to be: they were already kept.

`wordPrefixMatch` lowers both sides with `toLocaleLowerCase()` and no locale. It does not apply NFC. An empty token is false. `"uild"` does not match `"building"`. `"build"` does. Do not use it to remove a server hit. The server already decided the hit. This is an ordering signal.

`labelWordPrefixMatchesQuery` is not a wrapper that calls `wordPrefixMatch` once per token. It uses `searchTokens`, so the query is NFC'd and capped at 8. The label is NFC'd, lowered, split, and empty words are dropped. Every remaining token must match. An empty query is false, not true. A ninth query word is not required to match, because it was never kept. Do not "fix" that by raising the cap inside this function only. The cap is `MAX_SEARCH_TOKENS`.

`labelFromSkillUri` takes the last slash-separated piece. A trailing slash yields `""`. It inserts a space at a lower-to-upper boundary, then at an acronym-to-word boundary (`HTMLParser` becomes `html parser`, `URLValue` becomes `url value`), then lowers with `toLocaleLowerCase()`. The host is not special. Digits are not given spaces. This does not build an address from words. Guessing an address from a typed label stays in the app, because that guess contains a host.

## What this is not

- Not the search. The server tokenises and matches. These functions let the screen show which words were considered, order rows, and choose which labels are worth asking about.
- Not a person filter. A false result from `labelWordPrefixMatchesQuery` must not delete a person the server returned.
- Not `label-hyphen`. That one lowercases with `toLowerCase()` and turns spaces into hyphens. This one does not.
- Not a locale argument. Do not add `"en"` to make tests stable. The app does not pass a locale.

## How to take it

Package: `@kaigilb/gilbplatformcode-search-tokens`

```ts
import {
  labelFromSkillUri,
  labelWordPrefixMatchesQuery,
  searchTokens,
  wordPrefixMatch,
} from "@kaigilb/gilbplatformcode-search-tokens";
```

Path: `units/search-tokens/`.

## Examples

```ts
searchTokens("  Foo   foo\nbar "); // ["Foo", "bar"]
searchTokens("1 2 3 4 5 6 7 8 9"); // ["1","2","3","4","5","6","7","8"]

wordPrefixMatch("Handle Building", "han"); // true
wordPrefixMatch("Handle Building", "uild"); // false
wordPrefixMatch("Handle Building", ""); // false

labelWordPrefixMatchesQuery("Handle building materials", "han mat"); // true
labelWordPrefixMatchesQuery("Handle", ""); // false
labelWordPrefixMatchesQuery("1 2 3 4 5 6 7 8 9", "1 2 3 4 5 6 7 8 no"); // true
// "no" is the ninth token and is not required.

labelFromSkillUri("https://example.test/base/t/HandleBuildingMaterials");
// "handle building materials"
labelFromSkillUri("https://example.test/base/t/Foo/");
// ""
```

## What the host must supply

The raw box text, and labels you already have. The find request itself. Do not fan out one request per token. One request carries the whole box. The server is the match.

## Do not

- Do not drop a person because `wordPrefixMatch` is false.
- Do not treat an empty query as "match everything".
- Do not NFC inside `wordPrefixMatch` to make it match the other function. They differ on purpose.
- Do not turn `labelFromSkillUri` around and invent an address. A trailing slash already shows the last segment can be empty.

## Wrong readings

- "The tokens are lower-cased." The dedupe key is. The token you show is the first spelling.
- "Nine words are all matched." The ninth is discarded before the every-token check.
- "`HTMLParser` stays one word." It becomes `html parser`.
- "This package searches people." It does not.

## Where it came from

MyNetBase `searchTokens`, `wordPrefixMatch`, `labelWordPrefixMatchesQuery`, and `labelFromSkillUri` in `src/lib/base/findPeople.ts`. `wordPrefixMatch` was private there. It is exported here so the ordering signal is not copied again. The URI guess next to them in that file is not included.
