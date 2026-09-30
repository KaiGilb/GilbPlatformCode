# vault-children

Which vaults to load when the person may include the children of the vault they picked. An empty choice loads the open vault only. It does not load every vault.

## What this is

Pure helpers over a list of vaults you already have. Each vault needs three facts:

- `vaultId` — the id you load by.
- `parent` — `{ vaultId }` of the direct parent, or `null`, or leave it off for a root.
- `parentAmbiguous` — `true` when the store could not say which parent. That vault is not treated as a child of anyone, even if `parent` happens to be filled in.

You can pass the app's reachable-vault objects straight in. Extra fields (`name`, `entity`, `modes`) are ignored. This package does not decide who may read or write. That is the vault-list unit.

The switch is a query flag. The app's key is `wsc`. The value `1` means on. Anything else, including a missing value, means off. Off is the default: a parent shows its own records only.

## What this is not

- Not a fetch, and not a list of every vault the person can reach. You pass the list.
- Not the chip that draws the vault picker. It does not read `?vault=`.
- Not permission. A child is included because of the parent link, not because of a mode.
- Not a repair for an ambiguous parent. Ambiguous stays out of the child walk. The package will not pick the first parent.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-children`

```ts
import {
  INCLUDE_CHILDREN_PARAM,
  contentVaultIds,
  filterWorkingSetVaultIds,
  parseIncludeChildren,
  writeIncludeChildren,
} from "@kaigilb/gilbplatformcode-vault-children";
```

Path: `units/vault-children/`.

## What you pass

`parseIncludeChildren(get, param?)` — `get` reads one query key and returns the string or `null`. The default key is `INCLUDE_CHILDREN_PARAM` (`"wsc"`). Pass another key if your app does not use that name. Only the exact string `"1"` is on. `"true"`, `"yes"`, `"0"`, and `"1 "` are off.

`writeIncludeChildren(on, set, param?)` — when `on` is true, `set(key, "1")`. When `on` is false, `set(key, null)`. `null` means delete the key. Do not write `"0"` unless you want the key to sit in the URL. Both `"0"` and a missing key parse as off.

`contentVaultIds(workingSet, shellVaultId, vaults, includeChildren)`

- `workingSet` — any object with `vaultIds: readonly string[]`. A fuller working-set object is fine. Only `vaultIds` is read. Type filters are not.
- `shellVaultId` — the vault the shell already has open. `null`, `undefined`, and `""` all mean there is no shell vault.
- `vaults` — the reachable list.
- `includeChildren` — the boolean from `parseIncludeChildren`.

`filterWorkingSetVaultIds(vaultIds, vaults, includeChildren)` — the ids to keep after you have merged rows from several vaults. When children are off, or `vaultIds` is empty, you get the same array back. When children are on, you get a new array that also contains descendants.

`expandWithDescendants(vaultIds, vaults)` — the walk itself. Empty input returns `[]`, not every vault.

`isDirectChildOf`, `directChildVaults`, `selectionHasChildren` — the one-step questions. `directChildVaults` keeps the order of `vaults`.

## What you get

`contentVaultIds` returns a new string array:

| Selection | Children | Result |
|---|---|---|
| One or more ids | off | Those ids, de-duplicated, first wins. Descendants are not added. |
| One or more ids | on | Those ids, then descendants, breadth-first. |
| Empty, and a shell id | off | `[shellId]` only. |
| Empty, and a shell id | on | The shell id, then its descendants. |
| Empty, and no shell id | either | `[]`. |

An id you named is kept even if it is not in `vaults`. Its children are added only when those children are in `vaults` and their parent link is unambiguous.

Order when children are on: the ids you passed, in that order, then each one's children in the order those children appear in `vaults`. A vault is listed once, the first time it is reached. A parent/child loop stops.

`selectionHasChildren`:

- With ids: true when any of those ids has a direct unambiguous child in `vaults`.
- With an empty id list: true when any vault's parent id is also a vault in the list. A parent id that points outside the list does not count.

## Examples

```ts
const vaults = [
  { vaultId: "parent", parent: null, parentAmbiguous: false },
  { vaultId: "child", parent: { vaultId: "parent" }, parentAmbiguous: false },
  { vaultId: "grand", parent: { vaultId: "child" }, parentAmbiguous: false },
  { vaultId: "ambiguous", parent: { vaultId: "parent" }, parentAmbiguous: true },
];

contentVaultIds({ vaultIds: ["parent"] }, "other", vaults, false);
// ["parent"]

contentVaultIds({ vaultIds: ["parent"] }, "other", vaults, true);
// ["parent", "child", "grand"]
// "ambiguous" is not included.

contentVaultIds({ vaultIds: [] }, "parent", vaults, false);
// ["parent"]
// Not every vault. The empty choice is the open shell vault.

contentVaultIds({ vaultIds: [] }, null, vaults, true);
// []

expandWithDescendants([], vaults);
// []

const vaultIds = filterWorkingSetVaultIds(workingSet.vaultIds, vaults, includeChildren);
const next = vaultIds === workingSet.vaultIds ? workingSet : { ...workingSet, vaultIds };
```

## What the host must supply

The reachable vaults, the shell's open vault id, and the query reader/writer. This package does not know how you store the query. `get` and `set` are functions you write.

After `contentVaultIds`, you fetch those vaults yourself. After a multi-vault fetch, run `filterWorkingSetVaultIds` so a child row is not thrown out of the merged list. If you expand the load and forget the filter, the child rows come back and then disappear.

## Do not

- Do not treat an empty `vaultIds` as "load all". The type comment in the app says an empty list means all vaults for a filter. The loader does not do that. Loading every reachable vault is a search, and it is not this function. An empty selection loads the shell vault only.
- Do not drop a vault because `parentAmbiguous` is true when the person selected that vault itself. Ambiguous only blocks the parent link. The vault is still loaded when its id is in the selection or is the shell.
- Do not walk parents that are not in the list and invent them. If a child names a parent you do not have, you do not create that parent. If you ask for an id that is not in the list, you keep that id and add no children.
- Do not mutate the array from `filterWorkingSetVaultIds` when children are off. It may be the same array the caller still holds.

## Wrong readings

- "Children on means the parent chip shows the child's name." No. This only decides which ids to load and which ids survive a filter. The chip is separate. The bug this prevents is the opposite: the chip says one vault while the list still shows another's records, or a child is loaded and then filtered away.
- "`wsc=true` turns children on." No. Only `wsc=1`.
- "A vault with two parents is placed under the first one." No. `parentAmbiguous: true` means it is under neither. It is not a child in this walk.

## Where it came from

GilbApp `src/lib/base/workingSetLoadVaults.ts`. The walk is the same. The app's `filterWorkingSetParams` returned the whole working-set object. This package returns the id array only, so it does not need the app's type. The snippet above is the one-line merge. The app's `ReachableVault` type is not imported. Pass the objects. Only `vaultId`, `parent.vaultId`, and `parentAmbiguous` are read.
