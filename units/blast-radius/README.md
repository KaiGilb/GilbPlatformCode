# blast-radius

Who depends on one term, from a hierarchy index you already loaded. A missing index is not an empty neighbourhood.

## What this is

`blastRadiusFromIndex(termName, index, kindHint)` returns the four lists, a total, and a note.

Pass null when the load failed. Pass the index object when the load succeeded, even if every list is empty. Those are different notes.

## What this is not

- Not a fetch. The index file and the request stay in the app.
- Not a live edge read. The note says so when the index was read and listed nobody. Live edges may still exist.
- Not a display of the ontology columns. The index is a reverse map for this count. It is not the column source.

## How to take it

Package: `@kaigilb/gilbplatformcode-blast-radius`

```ts
import { blastRadiusFromIndex } from "@kaigilb/gilbplatformcode-blast-radius";

const radius = blastRadiusFromIndex(termName, index, kindHint);
```

`kindHint` may be omitted or null.

## What you pass

`termName` is the focus, untrimmed. The index is read with that exact key. `" Cook"` does not find `"Cook"`.

`index` has `terms`, `children`, `measures`, `valuesByFunction`, `typesByFunction`, and `capableOfByFunction`. A term's `k` is `f` for function, `v` for value, and anything else (including missing) for type. `l` is the label.

`kindHint` is `type`, `function`, `value`, null, or omitted.

## What you get

A failed load (`null` or `undefined`):

- empty lists, total 0,
- note `Hierarchy index unavailable — blast radius incomplete.` The dash is an em dash, U+2014.

An index that names nobody:

- note `No reverse dependents in the hierarchy index (live edges may still exist).`

The shorter sentence `No reverse dependents in the hierarchy index.` is not a result. The app writes it and then throws away. Do not return it. Do not pass `{}` for a failed load or you will not get the unavailable sentence, and a partial object is the wrong type.

Lists:

- Is-a children, from `children[termName]`, in that order. Not sorted. Not capped.
- Values that measure this function. From `measures` first (object order), then `valuesByFunction`, skipping a name already kept. One name, one hit, role `measures this function`.
- Types that provide it. Role `providesFunction`. Not capped.
- Types that list capableOf. Role `capableOf`. Cut to the first 80 before the hits are built.

`total` is the sum of the four lists after that cut. You cannot recover a dropped capableOf row from `total`.

A blank or missing label becomes the term name.

The values list is the only one that looks at kind. It is filled when the kind is function, or when no hint was passed. A hint of `type` or `value` leaves it empty even if the index names this term. The other three lists are filled for every kind. Do not add a gate to them.

A passed hint wins over the term's own `k`, because a non-empty hint is truthy. Null and omitted both read `k`.

The note joins the non-zero counts with a middle dot, U+00B7, spaces on both sides. The words are not pluralised. One child is `1 is-a children`. The capableOf clause says `capped display` whenever that list is non-empty, including when the index had fewer than 80. Do not say it only past 80.

## Examples

```ts
blastRadiusFromIndex("Focus", null).note
  === "Hierarchy index unavailable \u2014 blast radius incomplete.";

blastRadiusFromIndex("Cook", index, "type").valuesMeasuring; // [] when a hint of type is passed
blastRadiusFromIndex("Cook", index).valuesMeasuring; // filled, because no hint was passed
```

## The host must supply

The loaded index, or null if the load failed. The focus name. The kind hint only when the screen already knows the kind. Omitting it is a different result from passing `type`.

## Do not

- Do not treat an empty index object as a failed load.
- Do not cap the is-a list or the providing list.
- Do not pluralise the note.
- Do not drop the words `capped display` just because the list was short.
- Do not pairwise-expand these hits into edges. A dependent is not a graph edge.

## Wrong readings

- "No rows means the term has no dependents." It means this index listed none. The note says live edges may still exist.
- "The unavailable sentence and the empty sentence are the same fact." They are not. One means the index was not read.
- "`total` includes the capableOf rows past 80." It includes 80 at most.

## Where it was taken from

GilbApp `src/lib/base/ontologyBlast.ts`, the shape of `computeOntologyBlastRadius` once the index is in hand. The load stays in the app. `blastHitNameFromIri` is not here. It only forwards to the type-name helper.
