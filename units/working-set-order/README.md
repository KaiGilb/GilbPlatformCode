# working-set-order

The display order of a working set, the address parameters that name the set, and the path from a vault up to its root.

## What this is

This sorts rows you already have. It does not search, and it does not drop a row.

`sortWorkingSetItems(items, sort, typeLabel)` returns a new array. The input order is not changed.

- `date` compares `updatedAt` as a number. Descending puts the larger number first.
- `name` compares the trimmed, `toLowerCase()` name, with `localeCompare` and `sensitivity: "base"`. The locale is the runtime's default locale, not a fixed one. `toLowerCase` is not `toLocaleLowerCase`.
- A name that trims to `""` sorts as U+FFFF. Ascending, those names are last. Descending, they are first.
- `type` compares `typeLabel(typeUri)` the same way. If you omit `typeLabel`, the raw `typeUri` is the label. That is not the register's label.
- When the primary comparison ties, the name is compared again, A to Z. That secondary comparison is not reversed when the primary direction is descending.
- A remaining tie compares `id` with `localeCompare` and no options. That is not reversed either.
- `typeLabel` is not called for a date sort or a name sort.

`DEFAULT_SORT` is `{ key: "date", dir: "desc" }`. Do not mutate it.

`nextSortState(current, column)` returns a new object. The same column flips `asc` and `desc`. A different column starts at `desc` for `date` and at `asc` for `name` and `type`. It does not keep the old direction.

`parseSortParam(raw)`:

- Null or `""` is a new `{ key: "date", dir: "desc" }`. Mutating the result does not change `DEFAULT_SORT`.
- `"date"` is oldest-first (`asc`). `"date-"` is newest-first (`desc`).
- `"name"` is A to Z. `"name-"` is Z to A. `"type"` and `"type-"` are the same pattern.
- An unknown key, including `"date--"`, is the default newest-first.
- The text is not trimmed. `" date"` is unknown, so it is the default.

`serializeSortParam(sort)` returns null for newest-first date. That is the default, so it is omitted from the address. `"date"` is oldest-first. `"name-"` is Z to A. `"type"` is A to Z. There is no text `"date-"` in the output. Parsing `"date-"` and serializing it again returns null.

`parseWorkingSetParams(get)` reads `wsp` and `wst`. Each value is split on a comma, trimmed, and empty pieces are dropped. `"a, b"` is two ids. A comma inside an id will split it. Nothing is encoded. A missing value is an empty list.

`writeWorkingSetParams(params, set)` writes `wsp` and `wst` only. An empty list is null, not `""`. Ids are joined with a comma and no spaces. The sort is not written. `WORKING_SET_URL` is `{ vaults: "wsp", types: "wst", sort: "sort" }`.

`isAllVaults` is true when `vaultIds.length === 0`. A list that contains `""` is not all. `isAllTypes` is the same test for `typeIds`. `EMPTY_WORKING_SET` is the shared empty object. Do not push onto its arrays.

`vaultPathTowardRoot(vaultId, vaults)` walks parents and returns root first, the open vault last.

- A missing or blank vault id is `[]`.
- An id that is not in the list is `[]`. It does not invent a one-step path with that id.
- A parent that is not in the list stops the walk. The nodes already visited stay.
- A repeated id is not added again. The open vault is still last.
- `parentVaultId` of null or undefined stops after the current node. `""` also stops.

## What this is not

- Not the type registry. Frequency lists, the File option, and "which type id a URI maps to" stay in the app, because they call `resolveType`. For a type sort, pass the same label the register shows: the registry label, or the facet key the app already computes. If you pass the raw URI, the order will not match the screen.
- Not a find. Do not take `sorted[0]` as the identity of a search.
- Not the intersection of selected vaults and types. That filter uses the type registry too, and it stays in the app.
- Not a network request.

## How to take it

Package: `@kaigilb/gilbplatformcode-working-set-order`

```ts
import {
  DEFAULT_SORT,
  nextSortState,
  parseSortParam,
  parseWorkingSetParams,
  serializeSortParam,
  sortWorkingSetItems,
  vaultPathTowardRoot,
  writeWorkingSetParams,
} from "@kaigilb/gilbplatformcode-working-set-order";

const params = parseWorkingSetParams((key) => searchParams.get(key));
const sort = parseSortParam(searchParams.get("sort"));
const shown = sortWorkingSetItems(items, sort, typeLabel);
const next = nextSortState(sort, "name");
writeWorkingSetParams(params, (key, value) => searchParams.setOrDelete(key, value));
const crumbs = vaultPathTowardRoot(openVaultId, vaults);
```

Path: `units/working-set-order/`.

When you serialize the default sort, write nothing. Do not write `date-`.

## Examples

```ts
sortWorkingSetItems(
  [
    { id: "b", vaultId: "v", typeUri: "t:Note", name: "Zed", updatedAt: 1 },
    { id: "c", vaultId: "v", typeUri: "t:Note", name: "   ", updatedAt: 2 },
    { id: "a", vaultId: "v", typeUri: "t:Note", name: "Ann", updatedAt: 2 },
  ],
  DEFAULT_SORT,
).map((row) => row.id);
// ["a", "c", "b"]
// Ann before the blank name, even though the date direction is descending.

serializeSortParam({ key: "date", dir: "desc" }); // null
parseSortParam("date"); // { key: "date", dir: "asc" }
nextSortState({ key: "name", dir: "desc" }, "date"); // { key: "date", dir: "desc" }
```

## What the host must supply

The rows, with `updatedAt` as a number. A missing date should already be a number you chose, or the subtraction will not order them. The type label function, if the person is sorting by type. The vault list for the crumb path, each node with `vaultId`, `label`, and `parentVaultId`.

## Do not

- Do not reverse the name tie-break when the date sort is descending. The app does not.
- Do not omit a row because its name is blank. It sorts to one end. It stays.
- Do not encode vault ids. A comma is a separator.
- Do not treat `[]` from the path walk as "the vault has no parent". It also means the id was not in the list you passed.
- Do not mutate `DEFAULT_SORT` or `EMPTY_WORKING_SET`.

## Wrong readings

- "`date-` is what gets written for the default." Parsing accepts it. Writing the default returns null.
- "`"date"` means newest first." It means oldest first. The suffix is what marks descending for name and type. Date is the exception: the bare word is ascending.
- "The type order matches the register without a label function." It orders the raw type address. Pass the label.
- "A cycle throws." The repeated id is skipped. You get the nodes visited, root-side first.

## Where it came from

GilbApp `sortWorkingSetItems`, `nextSortState`, `parseSortParam`, `serializeSortParam`, `parseWorkingSetParams`, `writeWorkingSetParams`, `isAllVaults`, `isAllTypes`, and `vaultPathTowardRoot` in `src/lib/base/workingSetFacets.ts`. The type-registry helpers in that file are not included. `typeLabel` is the argument that stands in for them on a type sort only.
