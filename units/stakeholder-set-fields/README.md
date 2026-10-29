# stakeholder-set-fields

Draws and edits the Relations and Contact-preferences fields of a stakeholder card from the ontology's field set.

## What this is

Draws and edits the Relations and Contact-preferences fields of a stakeholder card from the ontology's field set.

The fields of a stakeholder kind's set that the card's own edit path does not write, each as its own framed group (`card-group`):

- `StakeholderSetFields({ fields, facts, fieldSets, canEdit, holdingVault, agent, carrier, vaultId, onOpenRef?, recordId?, carrierKind?, only? })`: draws the fields. `only="relations"` draws the links to other records (Represents, Member of, ...), `only="preferences"` the preferred channel alone, so the card can set each under its own heading; without `only` both. It draws nothing when no field is left.
- `SetField(props)`: one field. A relation shows under the words of `relationCopyOf` (a human label and a one-line meaning) or the master's label; its stored values are shown by name (`EntityRefValue`) or as text. In edit, a field the package writes (`mode: "reference-add"`) offers an add:
  - a relation: a record finder (a box; the matching records of the carrier's own vault are listed under it; tap one). What may be chosen is the rule of `card-references` (`admittedTargetNames`, `findLinkTargets`, `matchingTargets`); the add goes through `useAddCardReference`, the checked write of `holder-reference`, which checks the choice again;
  - a preferred channel (rule `contact-term`): not a record but one of the record's own contact fields that hold a value, as chips to pick (`channelChoices`); the chosen one is a selected chip named by `channelLabelOf`;
  - each stored link has a remove control at the left of its row, in edit only, when the host can write (see below);
  - why the add is withheld is said, never silent: the vault is not known yet, the record has no address yet, or not signed in;
  - a field the card only shows says why it is not edited ("Not edited on this card: ...").
- `isChannelField(f)`, `setFieldKind(f)` (the group kind `relation-<term>` or `channel-<term>`) and `setFieldHasContent(f, facts)`: the pure helpers.
- `StakeholderSetFieldsHostProvider` and `useStakeholderSetFieldsHost()`: the host's one optional member (see below).

In presentation the card shows the stored values and hides everything that edits; a field with nothing stored is not drawn, and an "Added." or "Removed." answer is gone once the card is back in presentation.

## What this is not

- Not the checked write or the rules of what a link may point at: those are `holder-reference` and `card-references`. The component calls them.
- Not the card's own fields (name, email, phone ...) and not the "Add information" chooser: the chooser is the app's (the group registers itself with `card-mode` and the chooser opens it).
- Not the record writer. A link's remove asks the host for it.

## How to take it

Package: `@kaigilb/gilbplatformcode-stakeholder-set-fields`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/stakeholder-set-fields` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/addressable-slug <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/card-mode <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/stakeholder-card-model <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/card-references <path-to-the-library>/units/stakeholder-set-fields
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. `@tanstack/react-query` (`^5.101.2`) and `react` (`^19`) are third-party peers. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess` and `noImplicitOverride`, as `card-references` does, because the peers' source is type-checked with it.

## Examples

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { RefLabelContext } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { StakeholderSetFields, StakeholderSetFieldsHostProvider } from "@kaigilb/gilbplatformcode-stakeholder-set-fields";

setTermOrigin("https://ontology.example.test"); // once at start-up (and base-origin, and the session of lws-session-bridge)

<QueryClientProvider client={queryClient}>
  <RefLabelContext.Provider value={useRefLabel}>
    <CardModeProvider canEdit>
      <CardModeBar />
      <StakeholderSetFieldsHostProvider host={{ changeRecordFactItems }}>
        <StakeholderSetFields
          only="relations"
          fields={fields} // the card's fields: CardField & { shownBecause } from stakeholder-card-model
          facts={record.facts}
          fieldSets={fieldSets}
          canEdit
          holdingVault={vaultId}
          agent={agentIri}
          carrier={recordAddress}
          vaultId={vaultId}
          recordId={record.id}
          carrierKind={fieldSets.byKind[kindIri]}
        />
      </StakeholderSetFieldsHostProvider>
    </CardModeProvider>
  </RefLabelContext.Provider>
</QueryClientProvider>;
```

## What the host must supply

- `StakeholderSetFieldsHost`, given with `StakeholderSetFieldsHostProvider`. One member, optional (a writer, so a host without it gets the fields read-only):
  - `changeRecordFactItems(recordId, recordEntityUri, factKey, change, notChanged): Promise<unknown[]>`: the one-key writer of a record's fact, as in `card-references`. Replaces `changeRecordFactItems(...)` of GilbApp `src/lib/base/recordFactItems.ts` line 55, which `useRemoveCardReference` called (`src/lib/base/useAddCardReference.ts` line 60; the hook is called at `src/components/records/StakeholderSetFields.tsx` line 138). Looked up and called when a remove runs, once per spelling, awaited. **Absent: no remove control is drawn** (see "Changes from production").
  - Without a provider the host is the empty object (the fields are read-only). This differs from the host contexts of the library that have a required member and throw without a provider.
- The react-query options the component uses: the link-target walk (`useQuery`, `staleTime: 60_000`, enabled once the box has been focused and the admitted types are known), and the reference reading (`referenceReadingQuery`, enabled once the box has been focused; the preferred-channel picker reads it at once). A `QueryClient` in the tree.
- A `RefLabelContext.Provider` (`entity-ref-value`) when a stored value is a record address, and one `CardModeProvider` (`card-mode`) above the card.
- Settings, set once at start-up: `term-origin` and `base-origin` (the readings and the find), and the session of `lws-session-bridge`.
- Tailwind v4 scanning this unit's `src`, and the `editorial-tokens` variables (`--ink`, `--ink-faint`, `--accent`, `--accent-soft`, `--line`, `--bad`, `--warn`, `--r-md`, `--surface`).

## Module state

`StakeholderSetFieldsHostContext` is one React context. A provider from another installed copy of this unit is not seen: the fields would be read-only. Install the unit once.

## Changes from production

One named change is a behaviour, not a rename (all others are in "Where it came from"):

1. **A host without `changeRecordFactItems` gets the fields read-only: no remove control is drawn.** In the app the writer is always there. Added line in `SetField`: `if (!host.changeRecordFactItems) recordId = null;`. Before (source): `recordId` is what the caller passes. After: with the writer, `recordId` is what the caller passes (no change); without it `recordId` is `null`, and every remove control and the `remove` function already require a `recordId`. The add of a reference does not use the host and is unchanged.

## Do not

- Do not install a second copy of `card-group`, `card-mode` or this unit: a group or provider of another copy is not seen.
- Do not put `StakeholderSetFields` outside a `QueryClientProvider`: `SetField` calls `useAddCardReference` and `useRemoveCardReference` (`useQueryClient`, `useMutation`) on every render.
- Do not write a reference any other way than the add of this component: the checked write checks again and refuses what the finder should not have offered.
- Do not read an empty list as "no such record" when the finder says the vault's list was not read to its end.

## Wrong readings

- "The finder lists every record." It lists the first 20 matches of the vault's typed list that the field may point at, never the record itself and never one already stored.
- "`staleTime: 60_000` is the freshness of the reference reading." It is the freshness of the link targets only; the reference reading has its own (from `stakeholder-card-vocabulary`).
- "Escape in the finder leaves edit." In a card with a `CardModeProvider` the card-mode handler also sees the key; the finder's own handler clears its box and closes its list.
- "An empty relation is drawn in edit." It is not, until the chooser opens it (`card-group` hides an empty group).
- "A channel chip shows the stored address." It shows the label of the kind's field when the address ends in `/base/a/<name>`, else the stored text as it is.
- `recordId` that the caller passes is ignored when the host has no writer (named change 1).

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/components/records/StakeholderSetFields.tsx` lines 37-426 to `src/StakeholderSetFields.tsx` (the header comment, lines 1-15, and the imports, 16-35, are replaced).

**Merged units compared and taken.** `card-group` (`CardGroup`, `CardIcon`, `CardIconName`), `card-mode` (`useCardMode`), `entity-ref-value` (`EntityRefValue`, `isEntityRefValue`), `remove-control` (`RemoveControl`), `card-references` (`linkTargets`, `useAddCardReference`, `useRemoveCardReference`, `relationCopyOf`), `stakeholder-card-model` (`storedValuesOf`, `CardField`, and `termName`: the app imports it from `termSlots.ts`, whose lines 10-36 `stakeholder-card-model` holds as `termFields.ts`; the unit `term-slots` holds lines 38-194 and has no `termName`), `stakeholder-card-vocabulary` (`referenceReadingQuery`), `stakeholder-field-sets` (`KindFieldSet`, `StakeholderFieldSets`) and `lws-records` (the type `RecordFacts`, `Record<string, string>`, the same declaration as `records.ts` in the app). `node scripts/drift.mjs --app-repo <GilbApp clone> --to 9a602ea7` reports `remove-control`, `card-mode`, `entity-ref-value`, `term-slots`, `stakeholder-card-model`, `stakeholder-card-vocabulary` and `card-group` unchanged at that commit.

Named changes, and only these (a token diff of the unit file against the source, comments and imports excluded, shows only the two additions of change 2):

1. the imports are the peers' (see above) and `./setFieldsHost`;
2. in `SetField`, two added lines before the first hook of the source, and one changed: `const host = useStakeholderSetFieldsHost();` and `if (!host.changeRecordFactItems) recordId = null;`; `useRemoveCardReference()` is `useRemoveCardReference(host as CardReferencesHost)`;
3. comments that name a cycle, a ticket, an agent, a person, a ruling or the other app are reworded; no code changed.

`src/index.ts` and `src/setFieldsHost.tsx` are new.

Tests (hosts are `example.test`, people Ann and Ben):

| Source | Ported / left out |
|---|---|
| `StakeholderSetFields.s8cardlook.test.tsx` (6 cases) | 5 ported as `StakeholderSetFields.look.test.tsx`; the 6th (`relationCopy`) is in `card-references`. The app's "Add information" sheet is not in this unit: `test/chooser.tsx` is a stand-in that lists the groups not shown and opens the one picked (`mode.openGroup`), as the app's sheet does. The ontology origin is set around each test (the app read a constant). |
| `StakeholderSetFields.s10iter1focus.test.tsx` (1 case) | Ported as `StakeholderSetFields.focus.test.tsx`, same set-up. |
| `src/components/records/AddInformation*.test.tsx`, whole-page tests | Not for this unit (the sheet and the page are not in it). |

`StakeholderSetFieldsPinned.test.tsx` is new (59): every export; the pure helpers; which fields are drawn; the withheld-add words in order; the remove through the host (arguments, order, once per spelling, errors, looked up when it runs, controls disabled while under way, the answer gone in presentation); the read-only host (no provider, an empty host, no record id, no vault, presentation); the channel chips and choices; the link finder over a seeded query cache (listing, filters, the 20 limit, the typed name, "not read to its end", Escape, a pick, `staleTime` 60 s tested with data 30 s and 90 s old, nothing read before focus). `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.
