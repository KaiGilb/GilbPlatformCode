# occurred-at

When and where a relation happened, stored as one text fact.

The text is a JSON array of plain objects. It is not an object with `@value`. A value object is the shape that makes a later read of the relation fail. This unit will not emit one. Do not "simplify" the writer into one.

Scale levels, units, and the from/until window are `scale-facts`. This unit is only the points.

## What this is

| Function | You pass | You get |
|---|---|---|
| `pointsFromExtras` | Facts that may contain `a:occurredAt` or `occurredAt`, and a location. | Points, earliest first. |
| `extrasFromPoints` | Points. | `{ "a:occurredAt": "<json>" }` and, when a where exists, `a:location`. |
| `sortPointsChronologically` | Points. | A new array. The input is not reordered in place. |
| `toDateTimeLocal` | A string. | `YYYY-MM-DDTHH:mm`, or a 16-character cut of an unparseable value. |
| `toIsoDateTime` | A string. | An ISO instant, or the trimmed input when it does not parse. |
| `earliestValidFrom` | Points. | The earliest dated point as an ISO instant, or undefined. |
| `newTimeSpacePoint` | A `Date`, or nothing. | One point with a new id, local minutes, and an empty where. |
| `nowDateTimeLocal` | A `Date`, or nothing. | Local `YYYY-MM-DDTHH:mm`. No seconds. No zone. |

A point is `{ id, when, where, status?, tag? }`. `id` is not stored in the JSON. A read mints a new id. Do not use the id as a saved identity.

## What this is not

- Not `scale-facts`.
- Not a clock control. The host draws the field.
- Not a fetch.

## How to take it

Package: `@kaigilb/gilbplatformcode-occurred-at`

```ts
import { extrasFromPoints, pointsFromExtras } from "@kaigilb/gilbplatformcode-occurred-at";
```

Path: `units/occurred-at/`.

`nowDateTimeLocal` must stay the same shape as in `scale-facts`.

## What you pass

`pointsFromExtras` reads `a:occurredAt`, and if that key is missing, `occurredAt`. A present key whose value is null does not fall through, because null is present. Only a missing `a:occurredAt` uses `occurredAt`.

The value may be:

- a JSON array string, which is expanded
- an array already
- one string, which becomes one point
- one object with `when`, `where`, `status`, and `tag`, or the `a:` names, or `@value`

A string that starts with `[` but is not JSON is one timestamp, not an error. A JSON array is not also kept as one timestamp.

`a:location` or `location` is copied onto the single point only when that point's `where` is empty. A where of one space is not empty, so the separate location is ignored. When there are no points and there is a location, you get one point with a blank `when` and that location. The location text is not trimmed on the way in.

## What you get

On the way out, points with no time, no where, and no status are dropped. A point that has only a tag is dropped. A status of spaces does not keep a point, because it is trimmed for that test. A where of spaces does not keep a point either.

Survivors are sorted, then written. `when` is stored as an ISO instant via `toIsoDateTime`. A zone-less `YYYY-MM-DDTHH:mm` is read as local time, so the instant depends on the machine's zone. `where`, `status`, and `tag` are trimmed. Empty ones are omitted from that object.

`a:location` is the where that sorts last, trimmed. Blank and unparseable times sort last, not first. An undated point is after every dated point. So an undated where wins `a:location` over a dated where. "Latest" here means last in that sort, not "latest clock time". Do not sort blanks first.

Equal times break the tie by `id`, with `localeCompare`.

`toDateTimeLocal("2020-01-05T15:04")` returns that string unchanged. Seconds do not match that shape, so `2020-01-05T15:04:00` is parsed and rewritten without seconds. An unparseable value is cut to 16 characters. `not-a-date-really` becomes `not-a-date-reall`. It is not rejected.

`toIsoDateTime("not-a-date")` returns `not-a-date`. Empty is `""`.

`earliestValidFrom` skips points with a blank when. If every point is undated, the result is `undefined`, not an empty string.

The JSON never contains `@value`. The keys on each object are only the ones that had text, in the order when, where, status, tag.

## Examples

```ts
extrasFromPoints([
  { id: "a", when: "2020-01-05T15:04", where: "Oslo" },
  { id: "b", when: "", where: "  Bergen  " },
]);
// a:occurredAt is a JSON string
// a:location is "Bergen"  — the undated point sorts last

pointsFromExtras({
  "a:occurredAt": JSON.stringify([{ when: "2020-01-05T15:04", where: " " }]),
  "a:location": "Oslo",
});
// one point, where is " "  — the space blocks Oslo
```

## What the host must supply

The facts, and a zone it can live with. Two machines in two zones will turn the same zone-less minute into two ISO instants. That is the current behaviour. Do not switch the parser to `Date.UTC` inside this unit.

Ids from `pointsFromExtras` and `newTimeSpacePoint` come from `crypto.randomUUID` when it exists. They will not round-trip. Match on when and where, not on id.

## Do not

- Do not write `{ "@value": time, "a:location": place }`.
- Do not store the point id.
- Do not treat a tag-only point as a point that should be saved.
- Do not assume `a:location` is the newest clock time. An undated where sorts later.

## Wrong readings

- "A space in where means empty, so the separate location applies." A space is not empty.
- "Unparseable times sort first, as if they were zero." They sort last.
- "The JSON is pretty-printed or wrapped in @value." It is `JSON.stringify` of plain objects, one string.

## Where it came from

GilbApp `src/lib/base/relationPlanguage.ts`, `pointsFromExtras`, `extrasFromPoints`, `sortPointsChronologically`, `toDateTimeLocal`, `toIsoDateTime`, `earliestValidFrom`, and `newTimeSpacePoint`.
