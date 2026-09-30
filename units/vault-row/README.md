# vault-row

The row for one vault id, and the vault a session starts in. An id has no first-row fallback.

## What this is

`vaultById(vaults, vaultId)` returns the first row whose `vaultId` is exactly `vaultId`, or null.

`landingVaultId(vaults)` returns the vault id a session starts in: the first row whose `isLandingVault` is truthy, otherwise the first row's id, otherwise null.

Neither function reorders the list. Neither function asks the server.

## What this is not

- Not the tree order, the write filter, or the writable default. Those are `vault-list`.
- Not a search by entity address. `vaultById` reads `vaultId` only. An entity URI does not match.
- Not a guess. A missing id is null. It is not "the first vault" and it is not "the landing vault".

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-row`

```ts
import { landingVaultId, vaultById } from "@kaigilb/gilbplatformcode-vault-row";

const row = vaultById(vaults, selectedId);
const start = landingVaultId(vaults);
```

The row type is whatever you pass, as long as each row has `vaultId: string`. Landing also reads `isLandingVault`.

## What you pass

`vaults` is the reachable list you already have, or null while that list is loading. `vaultId` is the id you are looking up, or null.

## What you get

`vaultById`:

- The same row object, not a copy. The first exact match. Later duplicates are ignored.
- `null` when the id is missing, blank, or not in the list, and when the list itself is missing.
- The id is not trimmed. `" home "` does not match `"home"`.

`landingVaultId`:

- A string id. A landing row wins over an earlier row.
- The first row's id when no row is flagged.
- `null` for a missing list or an empty list.
- `""` when the chosen row's id is `""`. Empty is not turned into null.

`isLandingVault` is truthy, not `=== true`, for this function. The group-vault unit is stricter. Do not mix the two tests.

## Examples

```ts
const vaults = [
  { vaultId: "first", isLandingVault: false },
  { vaultId: "home", isLandingVault: true },
];
vaultById(vaults, "home")?.vaultId === "home";
vaultById(vaults, "https://example.test/base/e/home") === null;
landingVaultId(vaults) === "home";
landingVaultId([{ vaultId: "only", isLandingVault: false }]) === "only";
landingVaultId([{ vaultId: "", isLandingVault: true }]) === "";
```

## The host must supply

The reachable rows. This unit does not know which row can be written. A start vault that is read-only is still the start.

## Do not

- Do not fall back from a missing id to `vaults[0]`. That fallback is the landing function, and only when you asked for the start.
- Do not trim ids to make a match.
- Do not skip a read-only landing vault. The writable default lives in `vault-list` and it does skip vaults that cannot be written. This function must not.

## Wrong readings

- "No landing flag means there is no start." It means the first row is the start.
- "Empty id means null." Only a missing list, an empty list, or a missing id property means null. A stored `""` is returned.
- "This picks where a new record is written." It does not. A create target is a different choice.

## Where it was taken from

GilbApp `src/lib/base/writableVaults.ts`, `vaultById`. GilbApp `src/lib/base/vaultManageAccess.ts`, the private `landingVaultOf`. The grant question that uses the start vault stays in the app.
