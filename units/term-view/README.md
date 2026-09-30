# term-view

Reads an ontology term the host already fetched, and turns the raw fact map into the fields a pane can show.

It does not search, fetch, or write. A missing field stays empty or null. Nothing is invented to fill a gap.

## What this is

Pure readers over one raw object:

- Sanskrit label (romanized, devanagari, gloss).
- Names, descriptions, and alternate labels by language code.
- Value-plane scale, meter, unit, endpoints, and who values it.
- Examples, the verb, and the two bind keys a pane must show.
- Reference lists (`hasValue`, `providesFunction`) and single refs (`exactMatch`, `isDefinedBy`).
- Provenance lines.
- A pole read off an is-a chain the host already built: Brahman, Maya, or Kalpana.
- A label and a "does" line for one language, falling back to the document's own label and does.
- A title for the kind: Function, Value, or Type.
- An English name for a language code.

## What this is not

- Not the ontology browser. The host fetches the term.
- Not `units/language-name`. That unit's `languageDisplayName` takes a document and a screen language. This unit's `languageDisplayName` takes a language code and returns an English name, or the code in upper case. The names collide. The arguments do not. Do not swap the imports.
- Not `units/scale-doc` and not `units/scale-facts`. Those read a scale document or a relation's scale fields. This reader is the value-plane block on a term.
- Not a writer. Bind keys are shown, not saved, by this unit.

## How to take it

Package: `@kaigilb/gilbplatformcode-term-view`

```ts
import {
  sanskritFromRaw,
  multilangFromRaw,
  valuePlanguageFromRaw,
  displayLabelForLang,
  languageDisplayName,
} from "@kaigilb/gilbplatformcode-term-view";
```

Path: `units/term-view/`.

## What a reference id is

Two shapes only:

- A string that starts with the four letters `http`. Case sensitive. `httpfoo` counts. `HTTP://…` does not. `urn:` does not.
- An object whose `@id` is a string. That string is kept even when it is not an address. `bare` is kept.

Anything else is not a reference.

## What you get, field by field

### Sanskrit

`a:sanskritLabel` or `sanskritLabel`. Both inner keys `a:romanized` / `romanized` (and the same for devanagari and gloss) are read. Values are trimmed.

Null when the value is not an object, or when both romanized and devanagari are blank. A gloss alone is not enough. Do not show a Sanskrit block for a gloss with no name.

### Languages

`a:labelByLang` / `labelByLang` and `a:doesByLang` / `doesByLang`. Alternate labels (`a:altLabelByLang`) are read only when at least one of those two maps is present and non-empty.

An empty object is skipped, so it does not block the next spelling.

Null when neither name map nor description map is usable. Alternate labels alone return null. Do not treat that as "no translations yet, show the alt list".

`en` is listed first. The other codes are sorted. The match is the exact code `en`, not `EN` and not `en-US`.

A string is trimmed. A blank string is dropped. A list contributes its first string only, trimmed. Later entries are ignored. A list whose first entry is not a non-blank string contributes nothing, even if a later entry is text.

Alternate labels keep every non-blank string, trimmed.

### Value plane

Null unless at least one of these is present: scale text, scale ref, an inline scale object, scale anchors, meter text, a meter list, unit, scale best, scale worst, measures, value-of, endpoint subject, valued-by iris, valued-by text, or qualifier aspect.

These do not, by themselves, make a view: rate, endpoint reference, same-as, confidence, qualifier reference, premoderation verdict, justified-by. They are returned when something else opened the view. Rate alone returns null. Do not show a rate block for a term whose only filled field is the rate.

Scale:

- A string is the scale text. If that string starts with `http`, it is also the scale ref.
- An object with `@id` is a ref, not an inline scale. The scale text then falls back to the anchors.
- An object without `@id` is inline. Its `a:does` / `does`, when non-blank, replaces the scale text. Its unit, rate, best, and worst replace the outer ones only when the inline value trims to something. A blank inline unit does not wipe the outer unit.

`scale` on the result is the scale text, or the anchors when the text is empty. Both can be set. They are not joined.

`valuedBy`: a string, even one that starts with `http`, is text, not an iri. A list or a single object contributes iris through the reference rule above. A plain word in a list is dropped. `{ "@id": "bare" }` is kept.

A meter list of empty objects still counts. Each becomes a meter whose label is the word `Meter`. Do not drop empty objects.

Confidence: a number becomes its decimal text, including `0` → `"0"`. Any other non-string is empty. This is not a percent.

### Examples, verb, bind keys

Examples: one string, or a list of strings. Trimmed. Blanks dropped. A non-string in the list is dropped. Missing → `[]`.

Verb: trimmed string, or `""`. Empty means the term did not state a verb. Do not substitute the name.

Bind keys: `a:predicateAttribute` and `a:typeAttribute` (bare spellings too). A string, or the first entry of a list. Trimmed. Missing → `""` for that key. The second list entry is ignored. These are the strings to show. Do not store the English label in their place.

### Reference lists

`hasValueIrisFromRaw` reads `a:hasValue` then `hasValue`. `providesFunctionIrisFromRaw` reads `a:providesFunction` then `providesFunction`. Duplicates are removed. Order of first appearance is kept. A word that does not start with `http` is dropped unless it is an `@id` object.

### Single refs

`exactMatchFromRaw` tries the SKOS exact-match address key, then `skos:exactMatch`, then `exactMatch`.

`isDefinedByFromRaw` tries the RDFS is-defined-by address key, then `rdfs:isDefinedBy`, then `isDefinedBy`.

An empty `@id` is falsy, so an earlier empty `@id` falls through to the next key. An empty `@id` on the last key returns `""`, not null. Do not treat `""` as null. Null means none of the keys produced a string. `""` means the last key produced an empty `@id`.

### Provenance

Always returns an object. Strings are trimmed. A numeric confidence becomes text, including 0. Authored-by and approved-by are refs or null. This function does not return null for an empty term. The value-plane reader is the one that returns null.

### Pole

Walks the chain in order. The first hit wins, and on one node the tests run in this order: the name `Brahman` or the text `unchanging`; then the name `Maya` or the text `the actual`; then the name `Kalpana` or the text `imagined`.

A label that contains both `the actual` and `imagined` is Maya. A node named `Brahman` is Brahman even if the label says imagined. The name test is case-sensitive. The phrase test is not, because the name and the label are lower-cased first. `Unchanging` in a label matches. `brahman` as a name does not match the name test, and matches only if the phrase is in the text.

### Label for a language

`displayLabelForLang(doc, null)` returns `doc.label` and does not look at the raw map. A null language is not "use English".

A language code uses the name map. A missing code, or a blank stored name, falls back to `doc.label`.

`displayDoesForLang` is the same for `doc.does` and the description map.

`doc` only needs `label`, `does`, and `raw`. The host's full term document has more fields. Pass it through.

### Kind title

`function` → `Function`. `value` → `Value`. `type` → `Type`. There is no fourth title.

### Language code name

`en` → `English`, and the same for the codes listed in the source (de, fr, es, and the rest of that map). Any other code, including `en-US` and `zh`, is the code with `toUpperCase()`. `en-US` becomes `EN-US`, not English. This map is not the screen-language helper in `units/language-name`. If that map gains a code, this one does not, unless you change it here on purpose.

## What the host must supply

The raw fact object from the term document, the is-a chain if a pole is needed, and the document label and does for the fallback. This unit does not load a term by name.

## Do not

- Do not treat a string that starts with `http` inside `valuedBy` as an iri. A string there is text.
- Do not drop `{ "@id": "bare" }` because it is not an address.
- Do not show Sanskrit for a gloss alone.
- Do not show alternate labels when the name map and the description map are both missing.
- Do not parse scale best and worst as numbers. They are trimmed text.

## Wrong readings

- "Null from the value reader means the term has no confidence." Confidence alone does not open the view. The term can still have a confidence in the raw map. Read `provenanceFromRaw` for that.
- "`languageDisplayName` from the language-name package will do." It will not. Different arguments, different result.
- "The latest language is English when lang is null." Null returns the document label, even when the raw map has an English name.

## Where it came from

GilbApp `src/lib/base/ontologyTermView.ts`. The host document type is the term document in `ontologyBrowse.ts`. Only `label`, `does`, and `raw` are read by the label helpers.
