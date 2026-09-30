# spec-card-facts

The facts a Value, Function, or Solution form stores, and the form fields read back from those facts.

The type name is a different unit. `units/spec-kind` decides Function versus FunctionConstraint, Solution versus Constraint, and that Value is always Value. This unit does not write a type. Pass the kind in. The word `constraint` inside the form still decides which facts are kept.

## What this is

- `composeSpecCard(kind, form)` builds the fact object to store. Empty fields are left out. Keys are bare slugs. The host adds `a:` once.
- `formatSpecCard(structured)` turns a stored object back into form fields.
- `specCardForm(facts, structured)` lays the flat facts under the formatted object, then fills three holes.
- `specCardWire(kind, form, structured, facts)` builds the next facts and the previous facts, and returns a patch plus whether they are the same.

## What this is not

- Not `units/spec-kind`. Do not re-decide the type name here.
- Not `units/scale-facts`. Levels on a relation use that unit. Levels on a spec card use this one, and the shape is different.
- Not the screen. The host owns the form.

## How to take it

Package: `@kaigilb/gilbplatformcode-spec-card-facts`

```ts
import { composeSpecCard, formatSpecCard, specCardForm, specCardWire } from "@kaigilb/gilbplatformcode-spec-card-facts";
```

Path: `units/spec-card-facts/`.

## What each kind keeps

After the fields are built, the kind deletes the ones that do not belong to it.

Value deletes: body, fvParent, hasValue, impactEstimates, meansFor, partOf, authority. A description typed into a Value form is not stored. An authority is not stored.

Function deletes: scale, endpointSubject, endpointReference, measures, impactEstimates, meansFor, partOf. Authority is kept only when `constraint` is exactly `yes` after trim. `Yes` and `true` do not count. Level rows that are not status or past are deleted. A tolerable row on a function is dropped. Past is kept, because a past row is stored under `a:status`.

Solution deletes: scale, endpointSubject, endpointReference, measures, fvParent, hasValue, ontologyTerm. The same authority rule and the same level-row rule as a function. An ontology term typed into a Solution form is not stored.

If a kind's level list becomes empty, the key is removed.

## Numbers

A level, an impact from, an impact to, and a resource amount become a number only when the trimmed text matches `^-?\d+(\.\d+)?$`.

- `"12"` → `12`
- `"0"` → `0`. Zero is stored. It is not treated as empty.
- `"In-Production"` stays the string, because it is not that pattern.
- `"1e2"` is not that pattern. It is not stored as a number, and it is not stored as the free-text move either, when a unit (or any other numeric piece) made the estimate object non-empty. The word is dropped. Do not "fix" scientific notation into the estimate.
- `"01"` becomes the number `1`. The leading zero is not kept.

An impact from is written only when it is a number. A sign and a unit are written as text.

## Authority

When `authorityUrl` is non-blank, the stored authority is `name (url)`, trimmed. A name of `"Kai"` and a url becomes `Kai (http://…)`. A url with no name becomes `(http://…)`, because the joined string is `" (url)"` and then trimmed. Do not drop the parentheses.

## Reading levels back

`formatSpecCard` looks at `levelStatements`.

A row with tolerable text or a tolerable date is the tolerable line. Else goal. Else wish. Else, if this row is the latest status row, the status line. Else the past line.

Status rows are those with `a:status` or `a:statusWhen`. The latest is the one whose `a:statusWhen` text is strictly greater as a string. This is not a date parse. `"9"` is greater than `"10"`. ISO dates `YYYY-MM-DD` sort in calendar order by accident of the format. Any other shape does not. Do not switch this to `Date.parse`.

Equal when-strings keep the first row as latest. The later row becomes past.

Only the first stakeholder is read. The second is ignored.

A meter is read only when `a:meterAgentKind` is exactly `human`, `ai`, or `instrument`. `Human` is skipped.

`textOf` turns a finite number into its decimal text, including `0`. It does not trim. A string of spaces is kept. Infinity is not finite, so it becomes empty and is not written.

Null or undefined structured data returns `{}`.

## specCardForm

Starts from the flat facts, then overlays `formatSpecCard`. The overlay wins on the same key.

Then, only if the overlay did not set them:

- `facts.ontologyTerm` is copied to `gilbVeda` when `gilbVeda` is still empty.
- `facts.body` is copied to `description` when `description` is still empty.
- `facts.endpointReference` is copied when that form key is still empty.

`formatSpecCard` does not read `unitTag`, `body`, or `ontologyTerm` off the structured object. Those stay in the flat facts. A line-source row whose predicate is `a:ontologyTerm` fills `gilbVedaSource`, not `gilbVeda`.

## specCardWire

`next` is `composeSpecCard(kind, form)`.

`previous` is `composeSpecCard(kind, specCardForm(facts, structured))`.

The patch starts as a copy of `next`. Every key that was in `previous` and is not in `next` is set to `null`. That null is a delete. Do not omit the key instead. An omitted key leaves the old fact in place.

`unchanged` is true when a stable print of `previous` equals a stable print of `next`. Object keys are sorted for that print, so key order does not matter. The patch is still returned when unchanged. The host must not send it. Sending it writes the same facts again.

`unchanged: false` with a null key means a fact was cleared. Check the nulls. Do not treat a null as "skip".

## Examples

A Value form with `statusLevel: "12"` stores `a:status: 12` (a number) and `a:statusWhen` from the date. The same form's `description` is not in the result.

A Function form with `constraint: "yes"` stores `authority`. `constraint: "Yes"` does not.

A Solution impact `impactFrom: "12"`, `impactTo: "3"` stores `{ from: 12, to: 3, unit }` under `a:valueEstimate`.

Two status rows dated `"10"` and `"9"`: the row dated `"9"` comes back as the status line, and `"10"` comes back as past.

## What the host must supply

The form strings, the kind from `units/spec-kind`, the structured object it already loaded, and the patch call. This unit does not write to a vault.

## Do not

- Do not put `a:` on the keys. `unitTag` is correct. `a:unitTag` inside this object is wrong.
- Do not store a Value's description by skipping the kind delete.
- Do not parse the level date yourself before `formatSpecCard`. The comparison is string order.
- Do not send the patch when `unchanged` is true.

## Wrong readings

- "constraint yes changes the type name." It changes which facts are kept. The type name is `spec-kind`.
- "The second stakeholder is stored because compose only had one slot, so format will show both." Compose stores one stakeholder. Format reads the first. A second object in a hand-built list is not shown.
- "1e2 is an impact of 100." It is dropped when the estimate object exists for another reason, and it is not a number.

## Where it came from

GilbApp `src/lib/base/specCards.ts`: `composeSpecCard`, `formatSpecCard`, `specCardForm`, `specCardWire`. The type-name helpers in that file are `units/spec-kind`.
