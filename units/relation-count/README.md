# relation-count

Which record ids stay on screen when the graph is limited to 1, 2, or 3 hops from the selected record.

The control looks like a count. It is not. It does not mean "show records that have exactly N relations". It means "show records within N hops of the one that is selected".

## What this is

A pure filter over relation rows the host already loaded.

- The values are the strings `"1"`, `"2"`, `"3"`, and `"all"`.
- The query key is `grc`. Do not rename it. Existing share links use that key.
- An empty or unknown `grc` means hop 2, not the whole graph. `"2"` is the default, and it is omitted when you write the query back.
- Two records that name the same relation URI are one hop apart. A picture that draws that link through a hub is still one hop, not two.
- A hard cap helper keeps at most 100 ids, and moves the selected id to the front when it is already in the list.

## What this is not

- Not a fetch. The host loads the reverse-lookup rows and passes them in.
- Not the card layout. `graph-layout` places cards. `graph-point` is the centre of a card. `graph-contract` is what a click does.
- Not `countDistinctRelationUris` used as the display rule. That function is a diagnostic. The display rule is `visibleRecordIdsForRelationCountFilter`.
- Not a promise that the neighbour list is symmetric. See below.

## How to take it

Package: `@kaigilb/gilbplatformcode-relation-count`

```ts
import {
  parseRelationCountFilter,
  serializeRelationCountFilter,
  visibleRecordIdsForRelationCountFilter,
  capVisibleRecordIds,
  RELATION_COUNT_URL_PARAM,
} from "@kaigilb/gilbplatformcode-relation-count";
```

Path: `units/relation-count/`.

## What you pass

`parseRelationCountFilter` takes the raw query value, or null.

`visibleRecordIdsForRelationCountFilter` takes:

- `candidateIds` — ids that already passed the text filter. When there is no text, this is the full set.
- `allRecordIds` — every record in the set. The hop graph is built from these, so a record that failed the text filter can still be a bridge. It is not shown unless it is also a candidate.
- `relationsByRecord` — a map of record id to the rows the host loaded. A missing key means the lookup has not arrived. An empty list means it arrived and named nothing.
- `filter` — one of the four strings.
- `countsAvailable` — false when the host did not load rows because the assembly was already capped. Pass false. Do not pass an empty map and pretend the hops were measured.
- `selectedRecordId` — the selected record, or null.

Each row is `{ relation, role, members?, type? }`. `relation` is the relation URI. `members`, when present, are `{ member, role }`. `member` may be a full address. This unit takes the last segment itself. That cut is the same as `uriTail` in `units/id-tail`: strip the query and the hash, strip trailing slashes, decode once. A failed decode keeps the encoded segment. Do not pre-cut with the other id function (`slashTail`), which keeps the query glued on.

## What you get

From the parser: one of the four strings. Never null.

From the serializer: the string to write, or null when the value is the hop-2 default. Null means omit the key. Do not write `grc=2`.

From the visible-id function:

- `"all"`, or counts unavailable, or no selection → a copy of `candidateIds`, in the same order. Not sorted.
- The selection is not in `candidateIds` → a sorted copy of `candidateIds`. The selection is not put back. Text already removed it.
- Otherwise → the candidates whose hop distance is within the limit, sorted. The selection is kept when it is a candidate.

From the cap: a new array. The selected id is first only when it was already in the list. A selected id that is absent is not invented.

From `countDistinctRelationsForRecord`: a number, or null. Null means the id is not in the map. Zero means the lookup arrived and the list was empty. Do not draw null as zero.

## Examples

```ts
parseRelationCountFilter(null); // "2"
parseRelationCountFilter("All"); // "2"  — case matters, and it is not trimmed
parseRelationCountFilter("all"); // "all"
serializeRelationCountFilter("2"); // null
serializeRelationCountFilter("all"); // "all"
```

A chain A—B—C—D where each dash is one shared relation URI, selection A, filter `"1"`, counts available: `["A", "B"]`. Filter `"2"`: `["A", "B", "C"]`.

Text left only A and C. Filter `"1"` from A returns `["A"]`, because B is the bridge and B failed the text filter. Filter `"2"` returns `["A", "C"]`.

## One-sided members

If A's row names B in `members`, B is a partner of A even when B's own list does not mention the relation. B's list, if empty, does not name A back.

`buildRecordAdjacency` does not repair that. A hop walk from A reaches B. A hop walk from B does not reach A. Do not "make it undirected". The shared-URI scan is the part that requires both sides. The member list on this side does not.

## The cap is not a clamp of zero

The length check happens after an id is pushed. `capVisibleRecordIds(["a", "b"], null, 0)` returns `["a"]`. Callers pass 100. Do not change the check to "stop before the push" or a max of 0 starts returning a different list.

A list that is already short enough is copied. It is not the same array.

## What the host must supply

The reverse-lookup rows, the text-filter result, the selection, and whether those rows were actually loaded. This unit does not know why a map entry is missing.

## Do not

- Do not treat `"2"` as "show everything". Empty means the near neighbourhood.
- Do not sort the candidate list yourself before the `"all"` path and expect this unit to sort it. That path keeps your order. The path where the selection failed the text filter does sort.
- Do not pass `[]` for a record whose lookup has not returned. That is a resolved empty. Use a missing key.
- Do not add an id in the cap helper because it is selected. If it is not in the list, it stays out.

## Wrong readings

- "Hop 1 means records with one relation." It means distance ≤ 1 from the selection.
- "No selection plus filter 1 shows only isolated records." No selection turns the hop filter off. You get the candidates.
- "Both ends must always report the relation." That is true for the scan across other records. It is not true for a member already named on this record's own row.

## Where it came from

GilbApp `src/lib/base/graphRelationCount.ts`. The member-id cut matches GilbApp `src/lib/base/relations.ts` `opaqueIdFromUri`, which is `uriTail`.
