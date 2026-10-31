# place-claims-card

The Address group of a card: the list of a person's addresses, the add form, and what is said when the addresses were not all read.

## What this is

The Address group of a card: the list of a person's addresses, the add form, and what is said when the addresses were not all read.

`<PlaceClaimsCard title legacyText? claims busy? error? readState? canAdd? editMode onSave onAmend onRemove fieldLabels? addInPlace? />`. A framed group (`card-group`, kind `address`) that lists each stored address as a `SavedAddress` (`address-card-parts`), shows a plain-text address the record already holds as it is stored, and offers "Add <title>": the add form (Location, Street.., Address 1, Address 2, Postal Code, City, Region/State, Country, in that order), which has no Save button and saves as the person chooses a place, presses Enter in a text box, or leaves the form. It does not write: `onSave`, `onAmend` and `onRemove` do, and answer whether the store kept the change.

- A save that was not confirmed keeps the form and what was typed; a confirmed save clears it. What was typed while the first save was in flight is handed to the address the save named (its id), never to a guess; if that address never appears in the read, the typing is put back in the form and said.
- Close writes nothing more. Closing while the first save is in flight and then not being able to confirm it says the address may be stored, and not to type it again.
- On the one card, while it is presented and the holder may write, the group offers "+ Add your own" which opens this same form in the group (Esc closes it, and the focus returns to the button); an address of yours that the merge folded into a row of theirs ("You have the same on your card") is not drawn twice.

**It says what the read came to** (`readState`, from `use-place-claims`' `status`): no vault is "Addresses are stored in a vault that is not known here, so they are not shown. This is not a statement that there are none."; a first read not yet answered, with nothing listed, is "Reading addresses…" (polite); a read that stopped is "Not every address in <vault name> was read." (or, when the door would not go on, "... could not be read: the read could not go on."), with the addresses that were read drawn; a failed read is the sentence of the `error` prop (or the same fixed one). The group is never hidden while it is in any of these states, and `canAdd={false}` withholds "Add" and "+ Add your own".

## What this is not

- Not the reading or the writing of addresses (`place-claims`, `place-claim-write`, `use-place-claims`): the caller hands the claims in and the three callbacks.
- Not the Address section of a record (`address-rows`), which wires this card to the hook.
- Not the parts of one address (`address-card-parts`), the picker (`place-picker`) or the draft (`place-draft`).

## How to take it

Package: `@kaigilb/gilbplatformcode-place-claims-card`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/place-claims-card` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/base-origin <path-to-the-library>/units/card-mode <path-to-the-library>/units/class-merge <path-to-the-library>/units/button <path-to-the-library>/units/flag-choice <path-to-the-library>/units/geo-origin <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/place-clear <path-to-the-library>/units/place-line <path-to-the-library>/units/place-lines <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/role-label <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/term-origin <path-to-the-library>/units/geo-catalogue <path-to-the-library>/units/place-hit-details <path-to-the-library>/units/place-names <path-to-the-library>/units/place-picker <path-to-the-library>/units/term-slots <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/place-vocab <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-records-of-type <path-to-the-library>/units/place-claims <path-to-the-library>/units/place-draft <path-to-the-library>/units/address-card-parts <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/place-claims-card
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing: it hands the draft to `onSave`, `onAmend` and `onRemove`. No storage of its own.

## Requests and their servers

None of its own. Through the units it uses: the catalogue's reads for the picker, the parts and the cascade (`GET` only, credentials omitted), and the flag files.

## What the host must supply

The two origins, set once through `geo-origin` and `term-origin`, and `fetch`; a `CardModeProvider` above it when the card has modes. Styling: GilbApp's `var(--...)` tokens.

## Module state

None of its own.

## Do not

- Do not draw this group as empty because a read has not answered, failed or stopped early: hand it `readState`.
- Do not offer an address to be added when no read of the vault has answered and the last one failed (`canAdd={false}`).
- Do not give `onSave` a function that resolves `true` for a save the store did not keep: a form is cleared on `true`.

## Changes from GilbApp

Everything else is GilbApp's code. Each change is marked `CHANGED` in the source where it is made.

1. The imports: the parts are `address-card-parts`, the picker `place-picker`, the draft `place-draft`, the clearing `place-clear`, the group `card-group`, the add button `add-your-own`, the card's mode `card-mode`, the one card's marks `one-card-context` (`useAddInPlace`, `useFoldedClaims`), `Button` `button`.
2. **What the read came to is said** (F1-F4). New props `readState` and `canAdd`. GilbApp's group knew nothing of a read: with no vault it drew nothing, while reading it drew nothing, after a failed read it drew an empty group that reads as "no address", and after a read that stopped early it drew the addresses read as if they were all. Now each state has its sentence (above), the group is never hidden while it is not `ready`, and a failed read with no sentence given draws the fixed one.
3. `LABEL_SUGGESTIONS` and `PlaceClaimsCardProps` are exported; `AddressReadState` is new. The module comments are reworded with the same facts. No other code changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`: `src/components/mynet/PlaceClaimsCard.tsx` lines 89-89 to `src/PlaceClaimsCard.tsx`, `src/components/mynet/PlaceClaimsCard.tsx` lines 291-369 to `src/PlaceClaimsCard.tsx`, `src/components/mynet/PlaceClaimsCard.tsx` lines 496-969 to `src/PlaceClaimsCard.tsx`.

## Tests

`npx vitest run`, 36 tests in 5 files:

- `PlaceClaimsCard.cycle168.test.tsx` 6: the 6 of `PlacePicker.cycle168` that render the add form (Kai's order, a refused save keeps the draft and says why, an accepted save clears it, a refused save is told from an accepted one and from never opening, no Save button, the add mark).
- `PlaceClaimsCard.group.test.tsx` 13: `PlaceClaimsCard.s8cardlook` (2 of 4: the framed group and axe; the empty group and the chooser), `.s10iter1focus` (2), the legacy address (from `flags.s130`, 1), and new: each read state's line and no other, a failed read draws one alert, `canAdd` (also for "+ Add your own"), the group in every state, a stalled read's wording, and a folded address not drawn again while presented.
- `exports.test.ts` 1, `noNetwork.test.ts` 3 (new); `hostAgnostic.test.ts` 13. `test/` holds the fake platform (an in-memory vault behind `fetch`, a catalogue with a search over the live shapes).
- A world-level check closes every file: no request to the catalogue was anything but a `GET`.
- The Address section's saves (the cases of A's `AddressRows.*` tests that go through the hook) are `address-rows`'.
