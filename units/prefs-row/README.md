# prefs-row

Which preferences row to write, and the device key that remembers that row's id.

## What this is

- `canonicalPrefsRow(rows)` — the row whose `id` sorts first.
- `prefsRecordIdKey(vaultId)` — `baseapp.uiPrefsId:` plus the vault id.

## What this is not

- Not the theme merge. Which of two saved themes wins is `units/prefs-choice`.
- Not a search, and not a mint. The host lists the rows. If the list cannot be loaded, do not call this with `[]` and then create a row. An empty list means "the vault holds none", which is the signal to create one. A failed load is not an empty list.
- Not "the newest row". `updatedAt` is ignored even when it is on the object.

## How to take it

Package: `@kaigilb/gilbplatformcode-prefs-row`

```ts
import { canonicalPrefsRow, prefsRecordIdKey } from "@kaigilb/gilbplatformcode-prefs-row";
```

Path: `units/prefs-row/`.

## What you pass

`canonicalPrefsRow` takes the rows you already listed. Each row needs an `id` string. Other fields are kept on the object you get back. They are not used to choose.

`prefsRecordIdKey` takes the vault id string.

## What you get

`canonicalPrefsRow`:

- `[]` → `null`
- otherwise the row with the smallest `id`
- comparison is ordinary code-unit order, the same as `<` on strings. It is not `localeCompare`. `"B"` comes before `"a"`. An empty id comes before a letter.
- ids are not trimmed. `" a"` and `"a"` are different.
- the input array is not mutated
- when two ids are equal, the earlier row in the input is returned. The sort is stable.
- a newer `updatedAt` does not win

`prefsRecordIdKey` joins with no trim and no lower-casing.

```ts
prefsRecordIdKey("Vault"); // "baseapp.uiPrefsId:Vault"
prefsRecordIdKey(" Vault "); // "baseapp.uiPrefsId: Vault "
prefsRecordIdKey(""); // "baseapp.uiPrefsId:"
```

## Examples

```ts
canonicalPrefsRow([
  { id: "m", updatedAt: 1 },
  { id: "z", updatedAt: 99 },
  { id: "a", updatedAt: 0 },
]);
// { id: "a", updatedAt: 0 }

canonicalPrefsRow([{ id: "a" }, { id: "B" }]);
// { id: "B" }

canonicalPrefsRow([]); // null
```

## What the host must supply

Every preferences row the vault holds, not the first page. A page that is only the newest twenty will hide the oldest id, and two devices will then pick different rows. Walk the pages first. Then call this.

The device key is only a cache of the id this function chose. Do not treat the cached id as the answer without checking it against the vault's list. The list decides.

## Do not

- Do not sort by `updatedAt`. The bug this function exists to avoid is picking the newest row.
- Do not use locale order. `"B"` before `"a"` is the rule.
- Do not trim the ids unless you trim them before they are stored, on every device, the same way.
- Do not mutate the array you pass. The function copies it. Your array stays in the order you had.
- Do not create a row because this function returned `null` unless you know the list was complete. `null` means the array was empty. It does not mean the request failed.

## Wrong readings

- "The smallest id means the shortest id." It means the one that sorts first. `"b"` comes after `"a"`, and `"B"` comes before `"a"`.
- "Equal ids are an error." They are not. The earlier input row is kept.
- "The key function cleans the vault id." It does not. A space in the id is a space in the key.

## Where it came from

GilbApp `src/lib/base/uiPrefs.ts`, `canonicalPrefsRow` and `prefsRecordIdKey`. The page walk and the write are not in this unit.
