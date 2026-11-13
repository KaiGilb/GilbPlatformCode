# vault-share-sheet

Share a whole vault with another person: the model that reads who has access and turns what was typed into a grantee, and a React sheet to give access, see who has it and take it away.

## What this is

Share a whole vault with another person: the model that reads who has access and turns what was typed into a grantee, and a React sheet to give access, see who has it and take it away.

Two entries.

**`./model`** (headless, imports no React and no dialog):

- `granteeFromInput(text, { apex? })`: what the person typed to `{ grantee, name }`, or `{ problem }` (a sentence to show; no request has been made). The text is trimmed. An empty entry or an email gets `vault-address`'s own sentence (`vaultNameProblem`, "not an email"). A full address (`https://…`) goes through `vaultIdProblem` and is kept as typed; its `name` is the first host label. A bare name goes through `vaultNameProblem`, and its grantee is exactly what `vaultAddressFromName(name, apex)` answers; `apex` defaults to the host of `baseOrigin()`. The unit composes no `/vault` path and holds no host. A bare host (`ann.example.test`, `https://ann.example.test`) is neither a name nor an address and is refused with the sentence of the check it fails.
- `accessRows(acl)`: `{ owner, rows }` from the `VaultAclEntry` list. **The owner is the entry that holds `control`**, not the entry of kind `owner-inferred`: the live owner row has kind `grant` (run 7, F14). The owner is returned apart and is not in `rows`. Another holder of Control (a delegate) stays in `rows` with `owner: true`, so a screen shows them and offers no Remove (`unshareVault` does not take Control away). Level: write is `"edit"`; otherwise read is `"view"`; an entry with neither (append only) is left out. Only `acl` is read: public grants are in `edges`, not `acl`, so there is no `/public/` filter.
- `AccessRow`: `{ principal, label, note, level, owner }`. `principal` is the key exactly as the platform gave it, for `unshare`. `label` and `note` are `principal-row`'s title and provenance sentence for the key (the note is null for an owner).
- `loadAccessView(vaultId)`: `{ controlled: false }` for a person without Control (the platform answers 404), else `{ controlled: true, owner, rows }`. Any other error throws.
- `accessFailure(e)`: the sentence for an error. A `VaultAccessError` with status 403, or 404, is `NO_CONTROL` (the constant `vault-access` exports, not a copy); another `VaultAccessError` is its own message; an `Error` is its message; anything else is "Something went wrong. Try again."
- `ShareApi` (`load`, `share`, `unshare`) and `defaultShareApi` (`loadAccessView`, `shareVault`, `unshareVault`).

**`.`** (React; the model's exports too):

- `useVaultShare(vaultId, api?)`: `{ state, submit(text, level), remove(principal), reread(), clearMessages() }`. It reads when it mounts and when `vaultId` changes, and again after every share or remove that worked. **While a request is in flight a second `submit` or `remove` is ignored: no second request**, even in the same tick (a ref guards it, not the disabled button). An input problem from `granteeFromInput` is put in `state.submitProblem` and nothing is sent. A failed share puts its sentence in `submitProblem`; a failed remove puts it in `removeProblem` with the principal, so it shows on that row only.
- `VaultShareSheet({ vaultId, title?, onClose, showOwner?, defaultLevel?, words?, api? })`: built on `modal-sheet`. States: reading; not controlled (shows the Control sentence and no form); the list, with "Nobody else has access yet." when there are no rows; an inline Yes or No on each row before a remove (never `window.confirm`); two radios (edit, view; `defaultLevel` is `"view"` unless told); one `busy` flag that turns off the field, the radios, Share and every row button while any request is in flight; one error line under the form and one on the row. `showOwner` (default true) draws the owner, and any other holder of Control, at the top with "Owns this vault" and no Remove. Closing is always allowed (Escape, backdrop, Close), also while busy; run 7's sheet refused to close while busy.
- `ShareWords` and `defaultWords`: every sentence the sheet shows that is not the platform's. Defaults are run 7's (each line in `src/words.ts` names the line it came from); pass `words` to change any of them.

## What this is not

- Not a per-record share (that is `lws-relations`), and not vault-to-vault reach.
- Not who may be asked: the platform decides who holds Control. The sheet never hides the form from the owner and shows the Control sentence to everyone else.
- Not a lookup of people by email: an email is refused.
- Not the place the platform's origin lives: it reads `baseOrigin()`, which the app sets once.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-share-sheet`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/vault-share-sheet` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/vault-share-sheet
```

(use the peers.mjs line for the full list.) Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

Peers: `vault-access`, `vault-address`, `principal-row`, `base-origin` always. `react` and `modal-sheet` only for the `.` entry; `./model` alone needs neither. The package ships TypeScript source and one stylesheet, `vaultShareSheet.css`, which the sheet module imports itself (the dialog's own stylesheet is imported by `modal-sheet`).

## Styling

`vss-*` class names on the dialog's panel (`className="vss"`). Colours come from the `style-runtime` variables with fallbacks: `--ink`, `--lines`, `--accent`, `--on-accent`, `--bad`, `--r-lg`.

## Examples

```tsx
import { VaultShareSheet } from "@kaigilb/gilbplatformcode-vault-share-sheet";

{sharing ? <VaultShareSheet vaultId={session.vaultId} title="Share your plants" onClose={() => setSharing(false)} /> : null}
```

Headless:

```ts
import { granteeFromInput, loadAccessView } from "@kaigilb/gilbplatformcode-vault-share-sheet/model";

const g = granteeFromInput("ben");            // { grantee: "https://ben.<apex>/vault", name: "ben" }
const view = await loadAccessView(vaultId);   // { controlled: true, owner, rows } or { controlled: false }
```

## What the host must supply

The base origin (`setBaseOrigin`) and the signed-in credential (`setLwsAuth`), as for `vault-access`. The vault to share. Nothing else.

## Module state

None of its own. The hook keeps its state per mount.

## Do not

- Do not call the owner "the row of kind `owner-inferred`". The live owner row is kind `grant`; hold Control is the rule.
- Do not build a grantee by hand (`https://${name}.<host>/vault`). Ask `granteeFromInput`.
- Do not filter `/public/` out of the rows: public is in `edges`, which this unit does not read.
- Do not rely on the disabled Share button to stop a double submit: call `submit` of the hook, which guards.

## Wrong readings

- "Two people shared at once race." Different people: both are there after the re-read. The same person shared edit and view at once ends as edit, whichever lands first (on the fake platform; grants only add). Another sheet's request is not seen until the next read.
- "A refused share half-works." It changes nothing (the list is the same before and after).

## Changes in 0.1.1

`accessRows` passes `labelSource`, `registered` and `viewer` to `principal-row`, so a registered key with no name reads "Registered principal" and a named one shows its name, not "Principal key". Needs `vault-access` 0.1.3, which keeps those fields.

## Where it came from

Written for this repository in EESpeed round 7 (batch U2c) from PictureRecords run 7 `app/src/share/ShareSheet.tsx` and `shareApi.ts` (the sheet and the model) and run 6 `app/src/sharing.ts` and `app/src/ui/ShareSheet.tsx` (the owner row with `principal-row` labels and the apex read from `baseOrigin()`). Base commit `19fb34ba7195055fbd0ef13e376d789756e2c9f6` of `KaiGilb/GilbPlatformCode`. Changes from run 7: the owner is found by Control, not by kind; the public filter is gone; the apex is not `gilb.com`; a thrown 404 reads as the Control sentence; Close works while busy; the placeholder is run 6's.

## Tests

`npm test` runs every test file: `model.test.ts` (against `fake-platform`, signed as a person it knows), `VaultShareSheet.test.tsx` (jsdom, injected api, including stale-read ordering), `boundaries.test.ts`, `exports.test.ts` and `hostAgnostic.test.ts`.
