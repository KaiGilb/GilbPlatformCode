# one-card-merge

Merges a person's published rows with the holder's own rows into one list of groups, each row marked theirs, yours or both.

## What this is

Merges a person's published rows with the holder's own rows into one list of groups, each row marked theirs, yours or both.

Pure functions and types: no fetch, no write, no React, no markup, no clock. An app shows one card per person. What the person publishes (their online card, read live) is "theirs"; the holder's own record, held claims and addresses are "yours". This unit puts the two into the groups of rows the card draws, in the order of the kind's field set, and gives the header its name and photo.

- `mergeOneCard({ online, own, fieldOrder, rungWords?, skillPredicate?, addressPredicate?, theirAddresses? })`: the merge. Answers `{ header, groups, marks }`.
  - `online`: their card as `parseOnlineCard` (`online-card`) made it, or `null` when no card is linked. `own`: `{ name?, photo?, facts?, heldClaims?, addresses? }`. `fieldOrder`: the kind's field set in display order (a `StakeholderField` fits).
  - `rungWords(rung)`: the words for a rung; default `rungChipWords` (`online-card`). `skillPredicate`: the predicate their skills are matched under; without it (also when empty) their skills are shown under the card route's key `skills`, matched with nothing. `addressPredicate`: the field the holder's `own.addresses` and `theirAddresses` belong to; without it neither `own.addresses` nor `theirAddresses` is read.
  - `groups`: one per field with at least one row, in the set's order, then predicates the set does not know (`known: false`, `many: true`) in the order first met. Each group has `field` (the write spelling), `term`, `label`, `known`, `many`, `bothKept` and `rows`. Rows: theirs first, then yours.
  - A row: `field`, `value`, `source` (`"theirs"` or `"yours"`), `editable` (yours only), and as they apply `rung` and `rungWords` (theirs), `label` and `labels`, `sameAsTheirs` (their row, and the holder holds an equal value), `notes`, `ownNotes`, `ownLabels`, `claims`, and `address` (only a theirs row made from a `TheirAddressInput`).
  - `header`: `name`, `nameSource`, `photo`, `photoSource` (each `"theirs"`, `"yours"` or `"none"`) and `linked`. `marks` is true only when an online card is linked.
- `compareRuleOf(spellings)`: `"email"`, `"phone"`, `"address"` or `"text"` from a field's spellings. `normalizeForCompare(rule, value)`: the form two values are compared in (NFC first; email lower-cased; phone as its international or `national:` key, or `""` when no digit is left; address trimmed, collapsed and case-folded; text trimmed).
- `addressLine(address)`: the non-empty parts joined by `", "`. `sameAddress(a, b)`: two structured addresses part by part, or one string against the other as lines; an address with nothing in it is never the same as anything.
- `slotLabel(slot, kind?)`: the purpose a value's slot states, or `null`. `SLOT_PURPOSES`: the five known purposes (`work`, `private`, `personal`, `home`, `mobile`) and their words.
- Types `OneCardField`, `OwnHeldClaim`, `OwnAddress`, `TheirAddressInput`, `OwnCard`, `MergeOneCardInput`, `RowSource`, `OneCardRow`, `OneCardGroup`, `IdentitySource`, `OneCardHeader`, `OneCard`, `CompareRule`.

## Their address

- `theirAddressesOf(fields, spellings)`: groups the address fields of their online card (`OnlineCardField[]`) into `{ addresses, loose }`. `spellings` (`AddressSpellings`: `label`, `streetLine`, `addressLine1`, `addressLine2`, `postalCode`, `claimPlace`) are passed IN by the app; the unit types none.
  - A part joins the address whose id equals the part's `composite`; the address's id is its label row's `sourceEntity`. Never by position, by "only one label", or by an id prefix.
  - A part whose label row was not served still forms an address (`label: null`). An address part with no `composite`, and a label row with no `sourceEntity`, go to `loose` unchanged. Other fields are in neither.
  - A `TheirAddress` is `{ composite, label, street, line1, line2, postalCode, placeIds, rungs, partPredicates }`. Of two parts with one predicate the first is kept. `placeIds` are place ids (not names), in server order, no duplicates; `rungs` the distinct rungs of the parts drawn, first-seen order. `addresses` are in the order any of their fields first appears.
- `theirAddressLine(address)`: the comparable line `addressLine` builds, over street, the two lines and the postal code. The place parts are not in it: only ids are held here and `sameAddress` compares names, so an address of yours with a city, region or country is not equal to this line until the app has read the names.
- Types `AddressSpellings`, `TheirAddress`.

## Their address as a row (beyond the source)

Beyond the source (Kai, 2026-11-01). `theirAddresses` (`TheirAddressInput[]`) is read only when `addressPredicate` is set. Each entry becomes one theirs row of that field, in input order, before values are matched:

- `value` is `addressLine` of `parts` (city, region and country are place names). When that line is empty, the value is `label`. When both are empty, the address is skipped.
- `label` and `labels` are `[label]` when the label is non-empty, so the row reads their name for it ("home").
- `rung` is the parts' rungs joined with `" · "`. `rungWords` is the distinct `rungWords` of each rung, joined the same way.
- `address` is `{ composite, parts, countryId, unread, gone }`.
- The row is keyed by `composite`, not by the line, so two addresses with the same line stay two rows.
- An equal address of yours folds as for any other value (`sameAsTheirs`, claims kept), except a half address (`unread > 0` or `gone > 0`) is never marked `sameAsTheirs` and the own row stays.
- Without `addressPredicate`, `theirAddresses` is ignored and the merge is the one the caller had.

## What this is not

- Not a reader: it fetches nothing. The online card, the record's facts, the held claims and the field set are what the app already read.
- Not a writer, and not a component. A row says `editable`; which editor opens is the app's.
- Not a source of truth about who said a value. Theirs comes only from the `online` card passed in; a held claim is always yours, whatever it says about who stated it.
- Not the online card parser or the rung words (`online-card`) nor the field sets (`stakeholder-field-sets`). This unit uses them.

## How to take it

Package: `@kaigilb/gilbplatformcode-one-card-merge`

From a clone of this repository, install the peers first, then the unit's folder (this is the line `node scripts/peers.mjs units/one-card-merge` prints):

```sh
npm install <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/one-card-merge
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. `online-card` (`^0.1.0`), `stakeholder-field-sets` (`^0.1.0`) and `vocabulary-source` (`^0.2.0`) are peers. The merge imports `bareForm` from `vocabulary-source`, the type `StakeholderField` from `stakeholder-field-sets`, and `cardName`, `rungChipWords` and the type `OnlineCard` from `online-card`.

## Examples

```ts
import { mergeOneCard } from "@kaigilb/gilbplatformcode-one-card-merge";
import { parseOnlineCard } from "@kaigilb/gilbplatformcode-online-card";

const principal = "https://ann.example.test/";
const online = parseOnlineCard(principal, {
  fields: [{ principal, field: "a:email", value: "ann@example.test", rung: "public" }],
});

const card = mergeOneCard({
  online,
  own: { name: "Ann Lund", facts: { email: "ANN@example.test", title: "Engineer" } },
  fieldOrder: emailAndTitleFields, // yours: the kind's fields, in display order
});

card.marks; // true: an online card is linked
card.groups[0].rows; // [ { source: "theirs", value: "ann@example.test", sameAsTheirs: true, editable: false, ... } ]
card.groups[1].rows; // [ { source: "yours", value: "Engineer", editable: true } ]
```

## What the host must supply

- The inputs of `mergeOneCard`: `online` (their card, or `null`), `own` (the holder's side; every part optional), `fieldOrder` (the kind's fields in display order).
- Optionally `rungWords`, `skillPredicate`, `addressPredicate` and `theirAddresses` (see above). `theirAddresses` is read only together with `addressPredicate`.
- Nothing else. No setting, no start-up call, no network, no CSS.

## Module state

None. The module-level values are constants and are never written: the compare keys, the address parts, the purposes table (`SLOT_PURPOSES`, frozen), the email-slot map and the label separator. Every call of `mergeOneCard` builds its own buckets and maps and returns new objects; the inputs are not changed (a test pins it). Two installed copies would not clash.

Dynamic imports in the files taken: none.

## Do not

- Do not put a held claim in `online`. A claim is always yours; only the live online card is theirs.
- Do not draw the marks when `marks` is false: there is one source and nothing to tell apart.
- Do not read `sameAsTheirs` as "the holder has nothing": it means the holder's equal value is shown once, as theirs, and its notes and labels are on the row as `ownNotes` and `ownLabels`.
- Do not guess a label for a field with `label: null`. The merge never does.

## Wrong readings

These behaviours are as the source has them, kept on purpose and pinned by tests (nothing is fixed in the extraction).

- "Their name is the first name they share." Their name is used only when their card shares a complete name: a `name` field, or both a given and a family name. Otherwise the record's own name; only when the record has none, whatever name part they share.
- "Equal values are two rows." Values equal under the field's rule (NFC; email case; phone key; address line) are one row, theirs, marked `sameAsTheirs`. Their same value served at two rungs stays two rows of theirs, and only the first is marked.
- "A national phone number equals the international one." A number without `+`, `00+` or `00` and a country digit gets a `national:` key, because its country cannot be guessed. `0047 900 12 345` equals `+47 900 12 345`; `0 900 12 345` equals neither.
- "A fact the record serves is a row." Only a key that a field of the set reads. The record's type, link and the like are not rows.
- "An unknown predicate is dropped." It is shown, after the known groups, as a field that may hold several values, so no "both kept" is claimed for it.
- "Both kept appears whenever both sides have a value." It is claimed only for a one-value field that holds a value of theirs and a different value of yours.
- "A `same` row shows my label." It shows THEIR labels; the holder's are in `ownLabels`.
- "A label is the slot's name." Only a known purpose is a label: one app's own email slots, or `<kind>-<purpose>` with a purpose in `SLOT_PURPOSES`. `email-long` has none.
- "`own.addresses` is always read." Only when `addressPredicate` is named. `theirAddresses` is the same: ignored unless that field is named. A half address of theirs is never "the same" as one of yours.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, copied by script:

- `src/onlineCard/mergeOneCard.ts` (lines 1-559, whole) to `src/mergeOneCard.ts`

**Merged units compared and taken.** Their declarations were compared with the pinned source token by token, comments excluded, and are equal: `vocabulary-source` (`bareForm`), `stakeholder-field-sets` (the type `StakeholderField`), `online-card` (`cardName`, the type `OnlineCard`, `rungChipWords`).

Named changes, and only these:

1. the four imports (`../terms.ts`, `../fieldSets.ts`, `./publicCard.ts`, `./rungs.ts`) are the three peer imports above;
2. comments made generic (cycle, ticket, tester and spec tags, dates of rulings, person and app names removed). Checked token by token with comments and imports left out: the code is the source's. No string literal carried a tag, so none was changed.

`src/index.ts` is new: it re-exports the file. Tests (`src/*.test.ts`): ported from `gilb-stakeholders` `test/onlineCard/`: `mergeOneCard.test.ts` 66, `mergeOneCard.labels.test.ts` 16 and `mergeOneCard.address.s5e.test.ts` 18 (as `mergeOneCard.address.test.ts`); people are Ann and Ben, hosts `example.test`. The two "under 200 ms" tests of the source are kept as they are: they measure, they do not wait. New: `mergeOneCardPinned.test.ts` (22: the export list and the edges of every export). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
