# history-events

Turns the raw rows of one term's history into one line per save.

## What this is

`groupHistoryDatoms(datoms, options?)`.

Each event has `txnId`, `at`, `agent`, `agentLabel`, `who`, `whoKind`, and `changes`.

## What this is not

- Not the history request. The app loads the rows. This unit only groups rows you already have.
- Not a person-name lookup. A person stays the word `Person`.
- Not a label fetch. Pass `options.labels` if you already have names. See `units/history-value`.
- The actor words and the value reading inside this unit are private copies of `units/history-actor` and `units/history-value`. Keep them in agreement. If you would rather have one copy, pass `options.describeAgent` and `options.valueSummary`.

## How to take it

Package: `@kaigilb/gilbplatformcode-history-events`

```ts
import { groupHistoryDatoms } from "@kaigilb/gilbplatformcode-history-events";
```

Path: `units/history-events/`.

Call it with the datom list. Omit `options` for the same words the app shows before it has fetched names.

## What you pass

Each datom may carry `txn_id`, `fact_id`, `attribute`, `value`, `tx_from`, `valid_from`, `op`, `op_label`, and `agent`. Missing fields are normal.

`options`:

| Field | Role |
|---|---|
| `describeAgent` | Replacement for the private actor copy. |
| `valueSummary` | Replacement for the private value copy. Called as `(value, labels)`. |
| `labels` | Handed to the value reading. The opaque id is tried before the full address. |

## What you get

An array of events, latest `at` first.

### Which rows share an event

- The same `txn_id` shares an event.
- An empty `txn_id` counts as missing. It is not an id.
- A missing `txn_id` uses `orphan-` plus `fact_id`. Two rows with the same `fact_id` and no transaction id share an event. The id is the string `orphan-f1`, not a random value.
- An empty `fact_id` also counts as missing. Each such row gets its own `orphan-` plus a random number. Those rows do not group. Do not persist that id. It changes every call.

### The time

`at` is the last `tx_from` in ordinary string order. Empty strings are dropped. If no `tx_from` remains, the same rule runs on `valid_from`. If neither remains, `at` is `""`.

This is not a date parse. `"2020-2"` sorts after `"2020-12"`, so a save that carries both keeps `"2020-2"`.

Events are then ordered with `localeCompare` on `at`, latest string first. An empty `at` sorts last. Equal strings keep the order the transactions were first seen.

### Who

The actor is the first row whose `agent` is truthy. A string of spaces is truthy. It wins over a later real address, and it then reads as an unknown actor. The event's `agent` field is that raw string, not the trimmed one. `who` is the trimmed reading.

### Which changes are shown

If any row in the save uses a priority attribute, **only those rows are shown**. The others are dropped, even if they came first.

Priority attributes are the human ones: `a:label`, `a:does`, `a:ontologyStatus`, `a:nodeKind`, `a:subTypeOf`, `a:measures`, `a:value-of`, `a:hasValue`, `a:providesFunction`, `a:capableOf`, `a:verb`, `a:example`, `a:module`, `a:confidence`, `a:premodVerdict`, `a:premodNote`, `a:replacedBy`, `a:justifiedBy`, `a:scale`, `a:hasMeter`, `a:unit`, plus the SKOS exact-match address and the OWL same-as address.

A language map is **not** priority. `a:labelByLang`, `a:doesByLang`, `a:altLabelByLang`, and the same names without `a:`, are dropped whenever the same save also has a priority attribute. A Norwegian edit that landed in the same save as `a:label` is not shown. Do not "fix" that by always mixing them in. The screen would then disagree with the app.

If nothing is priority, only the first 8 rows of that save are shown. Row 9 is dropped. It is the first 8, not the last 8.

### Language maps

When a language map is actually shown, retract and assert for the same attribute become one line per language code. Codes are sorted as strings. A code whose text did not change is omitted.

- Both sides present: `change`, and the summary is the old text, two spaces, `→`, two spaces, the new text.
- Only the new side: `assert`.
- Only the old side: `retract`.
- An empty string is a real value. It is not absence. A missing key is absence.
- A number or any other non-string is dropped from the map, so that code is missing. A list of strings is joined with `"; "`.
- `a:labelByLang` is labelled `name (<code>)`. `a:doesByLang` is `description (<code>)`. `a:altLabelByLang` is `alts (<code>)`.
- Long text is trimmed, then cut: over 100 characters on a change (99 plus `…`), over 160 on an assert or retract (159 plus `…`).

`op` 0 with no label is retract. Any other missing label is assert. `RETRACT` is lower-cased to `retract`. A label of `retract ` with a trailing space does not count as retract.

### The English master labels

On an ordinary row, not inside a language line:

- `a:does` and `does` are labelled `description (en master)`
- `a:label` and `label` are labelled `name (en master)`

`a:label ` with a trailing space is not that rename. A hash address is labelled by the part after `#`, so the exact-match address is labelled `exactMatch`. An `a:` name is labelled without the `a:`.

The value on an ordinary row is the history-value reading. Pass `labels` if `entity:<id>` should be a name.

## Examples

```ts
groupHistoryDatoms([
  {
    txn_id: "new",
    tx_from: "2020-01-02",
    attribute: "a:does",
    value: "B",
    op: 0,
  },
  {
    txn_id: "old",
    tx_from: "2020-01-01",
    attribute: "a:label",
    value: "A",
    agent: "http://example.test/base/p/abc",
  },
]);
// "new" first. Its change is a retract labelled "description (en master)".
// "old" is who: "Person".

groupHistoryDatoms([
  { txn_id: "t", attribute: "a:label", value: "Name" },
  { txn_id: "t", attribute: "a:labelByLang", op_label: "assert", value: { no: "Navn" } },
]);
// one change, the English name. The Norwegian line is dropped.
```

## What the host must supply

The datoms. Names and a person lookup, if the screen should show more than `entity:<id>` and `Person`.

## Do not

- Do not parse `at` with `Date`. The order is string order on purpose.
- Do not group rows that have neither a transaction id nor a fact id. They are separate events, and the orphan id is random.
- Do not show language lines from a save that also touched `a:label` or `a:does`.
- Do not show row 9 of a save that has no priority attribute.
- Do not skip a whitespace `agent` and use the next row. The whitespace row already won.
- Do not expect `who` to become a person's name. Pass nothing for that. Do it after this call, the way the app does.

## Wrong readings

- "One event per row." One event per transaction id, or per fact id when the transaction id is missing.
- "The newest date is chosen with a calendar." The last string in code-unit order is chosen. `"2020-2"` beats `"2020-12"`.
- "Every attribute in the save is listed." Priority attributes hide the rest. Otherwise the list stops at 8.
- "A language edit is always visible." It is visible only when that save has no priority attribute.

## Where it came from

GilbApp `src/lib/base/ontologyHistory.ts`, `groupHistoryDatoms`, the attribute sets, and the language-map expansion. The history request and the label fetch are not in this unit.
