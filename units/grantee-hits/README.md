# grantee-hits

Which reachable vaults match a typed name, and which of those the registry already offered. An address is not a match.

## What this is

`localLookupHits` filters vaults you already hold, by the display name, or by the one alias the session gave you for your own vault.

`mergeHits` keeps a local row only when the registry already returned that vault. The registry's name and alias win.

## What this is not

- Not the registry call. `GET` of the lookup stays in the app. You pass the rows it returned.
- Not `vault-list`'s `vaultLabel`. That function turns a vault into the words you show. Pass those words in as `label`. If you pass the address as the label, this unit will match the address, which is the bug.
- Not a gate on what may be typed. A person can still paste an address and submit it. The server decides. When the box already holds a full vault address, the app skips this list. That test is `vault-address` (`vaultIdProblem` returns null). It is not repeated here.
- Not a composer of an alias. A vault with no alias gets `webId: null`. Nothing is built from the host plus a path.

## How to take it

Package: `@kaigilb/gilbplatformcode-grantee-hits`

```ts
import { localLookupHits, mergeHits } from "@kaigilb/gilbplatformcode-grantee-hits";

const local = localLookupHits(
  vaults.map((vault) => ({ vaultId: vault.vaultId, label: vaultLabel(vault) })),
  query,
  excludeVaultId,
  sessionAlias,
);
const shown = mergeHits(registryRows, local);
```

`vaultLabel` is `@kaigilb/gilbplatformcode-vault-list`.

## What you pass

`localLookupHits`

- `vaults` — `{ vaultId, label }`. `label` is the name on the row. It is not trimmed here.
- `query` — what was typed. It is trimmed, then lowercased with `toLowerCase()` and no locale.
- `excludeVaultId` — a vault to leave out, compared with `===` and no trim. `null` or `""` leaves nobody out.
- `sessionAlias` — `{ vaultId, shortWebId }` for the caller's own vault, or null. The alias is used only for the row with that same vault id, and only when the trimmed alias is not empty.

`mergeHits`

- `remote` — the registry rows, `{ name, vaultId, webId? }`.
- `local` — the array `localLookupHits` returned. Passing a local list without a remote list does not show those vaults.

## What you get

`localLookupHits` returns a new array, input order, of `{ name, vaultId, webId }`.

- Blank after trim → `[]`.
- `name` is the label you passed, not a lowercased copy and not a trimmed copy.
- `webId` is the trimmed session alias in its original case, or null.
- The vault id is never consulted for the match. A query of `example` does not hit `https://pelle.example/base` when the label is `Pelle`.

`mergeHits` returns a new array.

- Order is the registry order.
- A repeated registry id stays in the first position and takes the later name and webId.
- `webId` blank, missing, or null becomes null. Otherwise it is trimmed, original case.
- A local-only vault is absent. The local name does not replace the registry name.

## Examples

```ts
localLookupHits(
  [{ vaultId: "https://pelle.example/base", label: "Pelle" }],
  "example",
  null,
  null,
);
// []

localLookupHits(
  [{ vaultId: "https://ada.example/vault", label: "Ada" }],
  "ka",
  null,
  { vaultId: "https://ada.example/vault", shortWebId: "  Kaizen  " },
);
// [{ name: "Ada", vaultId: "https://ada.example/vault", webId: "Kaizen" }]

mergeHits(
  [],
  [{ name: "Pelle", vaultId: "https://pelle.example/base", webId: null }],
);
// []
```

## The host must supply

The reachable vaults, the display label (from `vault-list`), the registry rows, and the session alias if the session has one. Do not invent the alias when the session has none.

## Do not

- Do not match on `vaultId`, the host, or a path segment. That offers every vault for a host fragment.
- Do not union the local list on top of the registry. `mergeHits` exists so that union cannot come back. A group, a project, or a vault with no declared kind can be reachable and still be refused by the registry. Reachable is not the same as offerable.
- Do not fill `webId` from the vault address when it is null.
- Do not treat `[]` from the registry plus a non-empty local list as "show the local list." The result is empty.

## Wrong readings

- "Exclude `\"\"` removes blank ids." No. A blank exclude removes nothing.
- "The local alias wins when both sides have a name." No. The registry row is copied through. The local row cannot change it.
- "A second registry row for the same id moves to the end." No. It stays where the id was first seen. The text updates.

## Where it was taken from

GilbApp `src/components/GranteeLookupField.tsx`, `localLookupHits` and `mergeHits`. In the app the label is `vaultLabel` of a reachable vault, called inside the function. Here the label is an argument, so this unit does not depend on the vault row shape. The lookup request stays in the app.
