# place-display

The heading and the text for one card line whose value may be a catalogue place.

## What this is

`placeDisplayFor(value, unresolvedHeading, hit)` returns `{ heading, text, resolved }`.

No hit (null or undefined):

- `heading` is `unresolvedHeading`, even when that is `""`.
- `text` is `value`, not trimmed.
- `resolved` is false.

A hit:

- `resolved` is true, even when the label is blank.
- `heading` is `City`, `Region/State`, or `Country` when `hit.rung` is `city`, `region`, or `country`. Those words are `RUNG_HEADING`. When `hit.rung` is null, the heading stays `unresolvedHeading`. The unit does not guess a rung.
- `text` is `hit.label` trimmed. When that trim is `""`, `text` is the raw `value`, still not trimmed.

`PlaceRung` is only those three words. `Region/State` is the heading for `region`, with the slash. It is not the word Region alone.

## What this is not

- Not a fetch, and not a test of which strings are catalogue ids. The host resolves the row and passes the hit, or passes null when it has no hit yet.
- Not the predicate's own label table. Pass the heading you would have shown anyway as `unresolvedHeading`. The app uses its predicate label. This unit does not know predicate names.
- Not the place line. Several resolved names joined with a middle dot are `place-line`.
- Not permission to hide the row. A missing hit still returns the raw value. Do not paint an empty row instead. An empty row looks like the person shared nothing.

## How to take it

Package: `@kaigilb/gilbplatformcode-place-display`

```ts
import { placeDisplayFor } from "@kaigilb/gilbplatformcode-place-display";

const hit = resolved.get(value) ?? null;
const line = placeDisplayFor(value, headingFor(field), hit);
```

Path: `units/place-display/`.

The hit is one row, not the map. A missing map entry is null. Do not pass the map.

## Examples

```ts
placeDisplayFor("https://geo.example.test/base/e/1", "Place", null);
// { heading: "Place", text: "https://geo.example.test/base/e/1", resolved: false }

placeDisplayFor("raw", "Place", { label: "  Oslo  ", rung: "city" });
// { heading: "City", text: "Oslo", resolved: true }

placeDisplayFor("raw", "Place", { label: "Somewhere", rung: null });
// { heading: "Place", text: "Somewhere", resolved: true }

placeDisplayFor("  raw  ", "Place", { label: "   ", rung: "region" });
// { heading: "Region/State", text: "  raw  ", resolved: true }
```

## What the host must supply

The served value, the heading you show for an ordinary field, and the catalogue hit if you have one. The hit's `label` is the catalogue's label. The hit's `rung` is the ontology's rung, or null when the row was not classified. Do not collapse that null into `city`.

## Do not

- Do not hide the line while the catalogue read is in flight. Pass null and show the raw value. Replace the line when the hit arrives.
- Do not show an empty string when the label is blank. The raw value is the fallback, and `resolved` stays true so you can mark the row.
- Do not trim `value` before calling if you need the unresolved text unchanged.
- Do not rename `Region/State`. The editor uses that heading.

## Wrong readings

- "`resolved: false` means the value is not a place." It means you do not have a hit yet, or you will never have one. The text is still the value.
- "`resolved: true` means the text is the catalogue label." A blank label falls back to the raw value and is still resolved.
- "A null rung means City." It means the caller's heading.

## Where it came from

MyNetBase `placeDisplayFor` and `RUNG_HEADING` in `src/lib/card/placeDisplay.ts`. The hook that fetches places stays in the app. The predicate-label argument is `unresolvedHeading` so this unit does not import that table.
