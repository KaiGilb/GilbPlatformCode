# vault-switcher

A chip that shows the open vault and, on a tap, lists the vaults the person reaches, own first and shared ones labelled, and hands back the one they pick.

## What this is

A chip that shows the open vault and, on a tap, lists the vaults the person reaches, own first and shared ones labelled, and hands back the one they pick.

`VaultSwitcher({ current, load, isYours, onPick, icon?, words? })`:

- **The chip** is a button with `icon` and `current.label`, `aria-haspopup="dialog"`, `aria-expanded`, and `words.changeVault(label)` as its accessible name.
- **The sheet** is a `modal-sheet` titled `words.title`. It calls `load()` **every time it opens** (never cached) and shows: the loading text; on a failed load the `couldNotList` sentence and a Try again button that calls `load` again; the `none` sentence for an empty list; else the rows.
- **The rows** are `vaultChoices(vaults, isYours)` from `vault-list`: own first, then the rest, in the order given. Each row is a button with the vault's label and, as its second line, `choiceLine` ("Yours", "Shared with you", plus " · View only" when the vault lists no write mode). A vault with no name shows its host label (`vaultLabel`), never "vault". The row of `current.vaultId` has `aria-current="true"` (the address is compared exactly).
- **Picking** a row calls `onPick` with the vault object exactly as `load` gave it (not the choice row), then closes. Picking the open vault only closes. Escape, a backdrop click and Close also close; focus goes back to the chip (that is `modal-sheet`'s doing).
- **A slow answer never wins over a newer state.** Each load takes a number and closing takes one; only the newest may write. A load that answers after the sheet closed, or an older load that answers after a newer one (open, close, open quickly), is dropped.
- `words`: `title`, `loading`, `couldNotList`, `none`, `close`, `changeVault(label)`, `yours`, `shared`, `viewOnly`, `tryAgain`. English defaults are run 7's (each line of `src/words.ts` names where it came from). `defaultWords` is exported.

## What this is not

- **Not shown only when there are two or more vaults.** Run 6's chooser hid itself for one vault; this chip always draws. The app decides whether to render it at all.
- Not a loader: `load` is yours (`reachable-vaults`, or `signin`'s `listVaults` filtered to the app's type). It does not decide what "yours" means: `isYours` does, because the list carries no owner.
- Not a sign-in or a vault switch: `onPick` gets the vault and the app does the switching.
- Not the app's art: pass it as `icon`.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-switcher`

Install the unit's folder from a clone of this repository; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/vault-switcher` prints. Put `install-links=true` in your app's `.npmrc` so the units are installed as copies.

Peers: `react` (^19), `vault-list` (^0.1.4), `modal-sheet` (^0.1.0). Nothing else. The package ships TypeScript source and one stylesheet, `vaultSwitcher.css` (also exported as `@kaigilb/gilbplatformcode-vault-switcher/vaultSwitcher.css`), which the component module imports itself.

## Several vaults: let the person switch

Use `useVaultChoice` (since 0.1.1) when an app can open more than one vault of its kind: its own, and the ones other people shared with the person. It holds the state, `VaultSwitcher` draws it.

```tsx
import { useVaultChoice, VaultSwitcher } from "@kaigilb/gilbplatformcode-vault-switcher";

const vaults = useVaultChoice({ listed, ownVaultId, principal, appKey: "teapots", represents: TEAPOT_TYPE });
const rows = vaults.options.map((o) => ({ vaultId: o.vaultId, name: o.label, modes: o.viewOnly ? ["read"] : ["read", "write"] }));

{vaults.options.length > 1 ? (
  <VaultSwitcher current={vaults.current} load={async () => rows} isYours={(v) => v.vaultId === ownVaultId} onPick={(v) => vaults.switchTo(v.vaultId)} />
) : null}
{vaults.canWrite ? <AddButton /> : <span>View only</span>}
<Screens key={vaults.current.vaultId} />   {/* each vault starts with fresh state */}
```

- `listed`: everything `GET /lws/vaults` lists for the person (`vaultId`, `modes`, `name`, `shortName`, `represents`). `ownVaultId`: their own vault for this app; it is always offered, listed or not, and is never dropped. `principal` and `appKey`: the choice is kept under `<appKey>:<principal>:current` (vault-list's `rememberVault`), so two people on one browser never share it and a browser that refuses storage just opens the own vault. `store` replaces `localStorage`.
- `represents` (a type address) keeps only the vaults of that type, compared by its bare name because the platform answers a type under its own host; a vault that says nothing about itself (a landing vault) is left out. Omit it to offer every listed vault.
- `options` are vault-list's `vaultChoices`: `{ vaultId, label, yours, viewOnly }`, the own vault first. `current` is the last one chosen, else the own vault. `switchTo(id)` opens one of `options` and keeps it (an id that is not offered is ignored). `canWrite` is true for the own vault and for a vault that lists `write`.
- `markGone(id)`: call it when the platform refuses the open vault (403) so the person no longer sees it; it leaves `options` until the page loads again and the kept choice is forgotten. The own vault is never dropped. After it `current` is the own vault.
- A real row is a `VaultListItem`, so the `rows` above are the three fields the sheet reads. Run in `src/recipe.test.tsx`.

## Styling

`vsw-*` class names. Colours come from the `style-runtime` variables with fallbacks: `--lines`, `--accent`, `--bad`, `--r-lg`. The dialog is `modal-sheet`'s.

## Example (the app after, about 3 lines)

```tsx
import { VaultSwitcher } from "@kaigilb/gilbplatformcode-vault-switcher";

<VaultSwitcher current={{ vaultId, label }} load={listMyHouseplantVaults} isYours={(v) => v.vaultId === own?.vaultId}
  onPick={switchTo} icon={<Pot />} />
```

## What the host must supply

`current`, a `load`, `isYours`, `onPick`. No origin and no credential: the unit never calls the platform itself.

## Module state

None. The component keeps its state per mount.

## Do not

- Do not cache the list in `load` to save a call: the sheet is meant to re-list each time it opens, so a vault shared a minute ago shows.
- Do not compare vault addresses yourself with a slash or case fix-up in `isYours` unless your app has one rule for it: `current` is compared exactly.

## Where it came from

Written for this repository in EESpeed round 7 (batch U3b) from PictureRecords run 7 `app/src/components/VaultChip.tsx` and `app/src/platform/vaultChoices.ts`, and run 6 `app/src/VaultChooser.tsx`. Base commit `19fb34ba7195055fbd0ef13e376d789756e2c9f6` of `KaiGilb/GilbPlatformCode`. Changes from run 7: the rows come from `vault-list`'s `vaultChoices` and `choiceLine`; `onPick` gets the vault as listed; the open vault is marked and picking it does not call `onPick`; a failed load shows a fixed sentence and Try again, not the raw error message; slow loads are numbered; the dialog is `modal-sheet` (focus kept, Tab trapped, scroll locked).

## Changes in 0.1.1

Additive: `useVaultChoice` and the types `ListedVaultRow`, `UseVaultChoiceOptions`, `VaultChoiceState`. The peer `vault-list` is now ^0.1.4 (the hook uses `vaultsOfType`, `rememberVault`, `rememberedVault` and `forgetVault`). No new peer. The run-9 PictureRecords app wrote this by hand in `vaults.ts` and `VaultHost.tsx` (135 lines) and never found the switcher.

## Tests

`npm test` runs `useVaultChoice.test.tsx` and `recipe.test.tsx` (the hook, and the README recipe run), `VaultSwitcher.test.tsx` (jsdom: load per open, order and second lines, loading, error and retry, empty, pick, aria-current, Escape and focus, stale and late loads, words), `stylesheet.test.ts`, `exports.test.ts` and `hostAgnostic.test.ts`.
