# own-card

Finding the record that is the holder's own card in a vault, by hard identity: the id derived for that vault, or the record the vault's profile pointer names.

## What this is

Finding the record that is the holder's own card in a vault, by hard identity: the id derived for that vault, or the record the vault's profile pointer names.

Plain functions and types, no React. A record in the holder's seat is his own card only by identity: its id is the seat's derived self-card id, or it is the record his vault's `a:mnbProfile` pointer names, accepted only where the profile app's own pointer check accepts it. No listing road, no name, no id prefix: a contact merely named "MNB Profile ..." is an ordinary record. Every read is a transport the caller injects; nothing is written, repointed or deleted.

- `findOwnCard(deps, vault)`: reads the pointer (1), the pointed record (0-1) and the derived card (0-1), and answers an `OwnCardFinding`: `cardId`, `cardUri`, `road` (`"pointer"`, `"derived"` or `"none"`), `otherOwnerCards` (a second own card seen on the way: reported, never repaired), `otherOwnerCardsKnown`, `ignoredPointer` (a pointer the check refuses: named, not followed). It throws when a read fails with anything but "absent", and when the vault root is empty.
- `ownCardIds(vaultRoot, deps)`: the vault's derived id, every derived id that counts (the root's and its sibling root's), and the test `isOwnerCardId(id)`.
- `isSeatOwnerCard(id, atId, isOwnerCardId, seat)`: the pointer validation, shared: the id is minted for the owner AND the card sits in the seat.
- `cardBelongsToVault(cardAtId, seat)`: false only for a card that provably sits in another vault.
- `siblingVaultRoot(value, segments)`, `cardIdOf(ref)`, `OWN_CARD_SLUG_PREFIX` (`mnb-profile`).
- `setSystemHostLabels(labels)`, `systemHostLabels()`, `resetSystemHostLabels()`: the one setting this unit adds (see "What the host must supply").
- `isHoldersOwnCard(recordId, derivedIds, finding)`: whether a record in the holder's seat is his own card: `true` for a derived id, `true` for the card the finding names, `false` for an empty id or a failed finding (`null`), and `undefined` while the finding is not in (`undefined`). Pure. (Added in 0.1.1.)
- `ownCardCaseOf(recordId, finding)`: how an open own card stands to the card the profile app shows: `mynet` (with `alsoCards`: the other own cards, the open one left out), `other` (naming the card the profile app shows) or `unknown` (no finding, or one with no card id or no address). Pure. (Added in 0.1.1.)
- `isPersonCardType(type)`: whether a served `@type` (a string, a list, or nothing) is a Person in any spelling (`Person`, `t:Person`, an address ending `/Person` or `#Person`); an absent type is not. (Added in 0.1.1.)
- Types: `FindOwnCardDeps`, `OwnCardFinding`, `OwnCardIdDeps`, `OwnCardIds`, `CardSeat`, `OwnCardRoad`, `OwnCardRead`, `OwnCardCase` (added in 0.1.1).

## What this is not

- Not the whole of `gilb-stakeholders`' `ownCard/ownCard.ts`: only the symbols the card readers reach. Since 0.1.1 that includes `isHoldersOwnCard`, `ownCardCaseOf`, `OwnCardCase` and `isPersonCardType`; the only part of the file not here is the host constant `SYSTEM_HOST_LABELS`, which is the setting.
- Not the derivation of the self-card id, nor the vault path segments: they come in through `deps` (`selfCardIdForVault`, `vaultPathSegments`), so this unit takes no dependency. In an app on this library the segments are `photoSegments` of `vault-origin-rule`.
- Not a reader: it does not know how to fetch a card. `readProfilePointer` and `readCard` are yours.
- Not a writer.

## How to take it

Package: `@kaigilb/gilbplatformcode-own-card`

From a clone of this repository, install the unit's folder; no peer comes first:

```sh
npm install <path-to-the-library>/units/own-card
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do.

## Examples

```ts
import { findOwnCard, setSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";

setSystemHostLabels(["id", "ontology"]); // once, at start-up

const finding = await findOwnCard(
  {
    selfCardIdForVault: deriveSelfCardId, // yours: the derived id of a vault root
    vaultPathSegments: ["base", "vault"],
    readProfilePointer: async () => pointerOrNull(),
    readCard: async (id, uri) => (await readOrNull(uri)) ?? false, // false or null on a 404; THROW on any other failure
  },
  { vaultRoot: "https://alice.platform.example.test/base", apiHost: "platform.example.test" },
);
if (finding.cardId) console.log(`the holder's own card is ${finding.cardUri}, found by the ${finding.road} road`);
```

## What the host must supply

- `setSystemHostLabels([...])`, once at start-up: the first labels of the platform's own hosts on a person vault's apex (for `id.example.test`, the label `id`). A card whose address is on one of those hosts, under the same apex as the vault, says nothing about which vault holds it. It throws, naming the setter, when it is asked before it is set. **This setting is new in this unit**: the source held the eight labels `id veda geo kaizen www skills connect gilb` as a constant in the code.
- `deps`: `selfCardIdForVault`, `vaultPathSegments`, `readProfilePointer`, `readCard` (each read THROWS on any failure that is not "absent").
- The vault root, and optionally the seat's `entity` and the API origin's host (`apiHost`).

## Module state

The unit holds one piece of module state. An app must have ONE copy of this unit, or each copy keeps its own labels.

- `labels` (`systemHostLabels.ts`): the set `setSystemHostLabels` was given, `null` until then. Read by `cardBelongsToVault` (and so by `isSeatOwnerCard` and `findOwnCard`) only when no earlier rule has decided (the card is on another host, under the same apex as the seat, and is not the API host).

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not add a listing road or a name road. A contact whose name makes an `mnb-profile-...` id would be adopted as the holder's card.
- Do not treat a failed read as "absent". `readCard` answers `false` or `null` on a 404 and THROWS on anything else; a failure is never taken for absence.
- Do not call `isSeatOwnerCard` to pick a candidate. It validates a record a road has named.
- Do not install a second copy of this unit.

## Wrong readings

- "The derived card is checked even when the pointer won." It is, but only to report a SECOND own card in `otherOwnerCards`, and its failure does not hide the card found (`otherOwnerCardsKnown` is then `false`).
- "A pointer at a record with a minted id is followed." It is ignored (`ignoredPointer`): the id must be minted for the owner (`mnb-profile*`, or a derived id), and the card must sit in the seat.
- "A card on another host is always foreign." A card on the seat's own host, on the API host, or on a system host of the seat's apex belongs; a shape that says nothing (no `@id`, a short form, no seat host) belongs; only a card that provably sits in another vault does not.
- "`/base` and `/vault` are two vaults." On one origin they are one vault: the root's sibling root's derived id counts too.
- "No digest means no own card." A root with no digest (no WebCrypto) adds no derived id; the `mnb-profile` slug test still stands.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `27fe0cef35857c070354c0439c6e4e4ebcc62815`, copied by script, symbol by symbol (the reached ones only, found with a symbol tracer from the Plan card's host code in GilbApp at `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, which pins this package at that commit):

- `src/ownCard/ownCard.ts` to `src/ownCard.ts`: lines 14-100, 108-154, 171-299 (`OWN_CARD_SLUG_PREFIX`, `OwnCardIdDeps`, `OwnCardIds`, `siblingVaultRoot`, `cardIdOf`, `ownCardIds`, `CardSeat`, `hostOf`, `cardBelongsToVault`, `OwnCardRoad`, `OwnCardRead`, `FindOwnCardDeps`, `OwnCardFinding`, `isSeatOwnerCard`, `findOwnCard`).

(`OWN_CARD_SLUG_PREFIX`, `OwnCardIdDeps`, `OwnCardIds`, `siblingVaultRoot`, `cardIdOf`, `ownCardIds` are 14-100; `CardSeat`, `hostOf`, `cardBelongsToVault`, `OwnCardRoad` are 108-154; `OwnCardRead`, `FindOwnCardDeps`, `OwnCardFinding`, `isSeatOwnerCard`, `findOwnCard` are 171-299.) Not taken: `SYSTEM_HOST_LABELS` (lines 102-106, now the setting).

**0.1.1 adds four symbols** from the same file at `gilb-stakeholders` commit `0a261488be7c98d1ac5d79887c966a445b8928bd` (the pin of GilbApp `a703b3ed`): `isPersonCardType` (lines 156-169), `isHoldersOwnCard`, `OwnCardCase` and `ownCardCaseOf` (lines 301-350). The cut above (commit `27fe0cef`) and this pin were compared: with comments and imports removed, the whole file at the pin differs from `src/ownCard.ts` in the two places of named change 1 and in nothing else, so the 0.1.0 symbols are unchanged between the two commits; the four added symbols are token-equal to the pin. The lines before 155 and after 170 are at the same numbers in both commits. The change is purely additive, so it is a patch version. The one change in the added code is in a doc comment: the phrase naming an agent and a ruling is removed.

**Merged units compared and taken or not.** No merged unit holds a reached symbol of this file (searched by name over every `units/*/src`): nothing to import. (`owned-claim` is a different unit.)

Named changes, and only these:

1. **the host constant becomes a setting** (RuleGhsSettingUnit; the one change in what the code does): `SYSTEM_HOST_LABELS = new Set([...])` (lines 102-106, a constant evaluated when the module loads and holding the platform's own host labels) is not copied. The one use, `ownCard.ts` line 150 of the source, `SYSTEM_HOST_LABELS.has(hostParts[0]!.toLowerCase())`, is `systemHostLabels().has(hostParts[0]!.toLowerCase())`, read when the function runs. `systemHostLabels()` is in the new file `src/systemHostLabels.ts` and throws until `setSystemHostLabels` is called. The labels are not hosts (so `base-origin`'s `systemVaultHosts()`, which holds whole hosts, would answer something else); the setting is kept inside this unit and not added to `base-origin`;
2. the new import `./systemHostLabels` is the only import of the file (the source has none);
3. the header comment of the file is a new, shorter one, and comments that name a host, a person, an agent or a ticket are reworded; no code changed.

`src/index.ts` and `src/systemHostLabels.ts` are new. Tests (`src/*.test.ts`; counts are those of the 0.1.1 run; no shared set-up; the hosts are `example.test` hosts; each ported file sets the eight labels the source held, in a `beforeEach`): ported from `gilb-stakeholders` `test/ownCard/` (0.1.0 at the cut commit, 0.1.1 at the pin `0a261488`; the files were compared and the cases already ported are unchanged), by test block: `cardBelongsToVault.test.ts` 5 of 5, `isSeatOwnerCard.d5b.test.ts` 2 of 2, `ownCard.tester-s63.test.ts` 1 of 1, `ownCard.test.ts` 24 of 25 (the 4 of `ownCardCaseOf` added at 0.1.1), `ownCard.d5.test.ts` 10 of 10 (9 added at 0.1.1), `ownCard.d4.test.ts` 10 of 10 (new file at 0.1.1), `ownCard.tester-d5.test.ts` 3 of 3 (new file at 0.1.1). New: `systemHostLabels.test.ts` (17: the setting, what `cardBelongsToVault` reads from it, the export list, now with the three added functions), `ownCardPinned.test.ts` (18: what the ported blocks left unpinned, found by mutation checks; 9 added at 0.1.1 for `isPersonCardType`, `isHoldersOwnCard` and `ownCardCaseOf`). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: one of `ownCard.test.ts`, "is the production address (aitester, measured 2026-09-16)": it pins the hash of one production vault root, which the `example.test` hosts of the port change. In the files added at 0.1.1 the header comment is replaced, a few inline comments that name a person, agent or ticket are reworded, and the served-type address `veda.gilb.com` reads `veda.example.test`.
