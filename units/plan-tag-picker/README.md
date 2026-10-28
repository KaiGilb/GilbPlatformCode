# plan-tag-picker

Lets a Plan card link to another Plan record by its tag: it searches the plan vault, shows the hits, and offers to create a tagged record when the tag is free, with the host doing the search and the tag check.

## What this is

One component, `PlanTagPicker`, and the pieces the card's other link views share with it.

- `PlanTagPicker` draws a record picker (`OrgRecordPicker` of the `record-picker` unit) with `data-testid="plan-link-picker"` around it and the hits under `plan-link-hits`. It searches the plan vault (`planVault`, which is `vaultId` unless given) for records of `typeNames` (or of `typeName`) by the host's search; nothing is searched until the box is clicked, focused or typed in (`searchOnMount` is off), and the answer is kept 30 s. Hits are named by their label; `excluded` addresses are not offered. A failed search says "Could not search — try again" (`SEARCH_ERROR`). No hit and no answer say nothing (the none and partial words are empty).
- A hit that is picked is passed to `onChoose` as the pool row with that address, id or read id (`pool` is the card's live rows), else as the row the search read, stamped with `updatedAt: Date.now()`.
- Create has two modes. A tag-shaped text (every dot part is one capital-led word of letters: `Door`, `Door.Close`) that no hit already has (by label, or by the hit row's tag) asks the host `tagUsed(planVault, text)` and offers `Create <kindLabel> "<text>"` (`data-testid="plan-link-create"`) when the answer is "free"; the search need not have been whole. A tag that is used offers nothing and says nothing; a tag check that fails says "Could not search — try again" (`role="alert"`). Any other text is offered only when the search saw every record (`complete`); when it did not, the picker says "Not every record could be searched, so Create is not offered. Try again." (`SEARCH_INCOMPLETE_CREATE`) with a Try again button (`data-picker-keep=""`, so a press does not close the drop-down) that asks the host to invalidate the search under its key. Nothing is offered for empty or blank text, or before the search for the text on screen has answered.
- `busy` disables the Create button. `creates` (when not empty) replaces the one button with one per entry (`{ label, onCreate }`); the entry's `onCreate` gets the trimmed text.
- `TagLink`: a record by its live name (`EntityRefValue` of the `entity-ref-value` unit, no address line) when it has an address; else a button with its tag, or its display name, that calls `onOpen(id)`.
- Shared with the card's other link views (named exports): `usePlanPickerFind(planVault, typeNames, draft)` (the find, the create and incomplete rules, `retry`, `rowFor`), `tagShaped`, `planSearchKey` (the key the search is cached under, `["plan-search", vault, typeNamesKey, text]`), `rowOnHit`, `chosenRow`, `httpStatus`, `noticeFor(error, tag)` (a 409 is the duplicate-tag sentence "The tag "<tag>" is already used in this vault. Pick another."; another `Error` is its message; anything else is "Couldn't save — your change was rolled back. Try again."), `SEARCH_ERROR` and `SEARCH_INCOMPLETE_CREATE`.
- `PlanTagPickerHostContext`, `PlanTagPickerHost`, `PlanTagHit`, `PlanTagPage`: how the host gives the picker its three calls.

## What this is not

- Not a writer: it calls `onChoose(row)` and `onCreate(tag)`; the card writes the link and creates the record.
- Not the card's link views (Part of, Sub-functions, Function of Value, Value of Function, Solution of, Solutions, Part of System): those are the next unit.
- Not a search or a cache: the host's `findPlanRecords` searches, and the host's query hook (`PickerQueryContext` of `record-picker`) holds the answer.
- Not a rule about which tags are valid beyond the shape: whether a tag is taken is the host's answer.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-tag-picker`

Take it together with its four peers: `base-record`, `entity-ref-value`, `plan-links-model` and `record-picker`. `entity-ref-value` has `entity-ref` and `id-tail` as its own peers, and `plan-links-model` has `entity-ref`, `id-tail`, `plan-card-facts`, `relation-role`, `type-curie` and `type-key`; install those too. Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each, so one picker context, one label context and one type function):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/base-record <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/relation-role <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/record-picker <path-to-the-library>/units/plan-tag-picker
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

The three providers the picker needs (the picker's query hook, the label hook of `EntityRefValue`, and this unit's host) and one picker; the same code runs in `src/example.test.tsx`.

```tsx
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { PlanTagPicker, PlanTagPickerHostContext, type PlanTagPickerHost } from "./index";

const client = new QueryClient();
const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};
const useRefLabel: UseRefLabel = (ref) => ref?.id ?? null;

// The plan vault, here a list in memory; a real host searches its vault.
const planVault = "https://plan.example.test/vault";
const records: BaseRecord[] = ["Door.Open", "Door.Close"].map((tag) => ({
  id: tag.toLowerCase(),
  entityUri: `${planVault}/e/${tag.toLowerCase()}`,
  typeUri: "t:Function",
  facts: { unitTag: tag },
  opaqueFacts: [],
  etag: null,
}));

const host: PlanTagPickerHost = {
  findPlanRecords: async (_vault, text, _typeNames) => ({
    hits: records
      .filter((r) => r.facts.unitTag!.toLowerCase().includes(text.trim().toLowerCase()))
      .map((r) => ({ uri: r.entityUri!, label: r.facts.unitTag!, row: r })),
    complete: true,
  }),
  tagUsed: async (_vault, tag) => records.some((r) => r.facts.unitTag === tag),
  invalidateSearch: (key) => client.invalidateQueries({ queryKey: key }),
};

function Card({ onChoose, onCreate }: { onChoose: (row: unknown) => void; onCreate: (tag: string) => void }) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanTagPickerHostContext.Provider value={host}>
            <PlanTagPicker
              vaultId={planVault}
              ariaLabel="Part of"
              placeholder="Search by tag"
              kindLabel="Function"
              pool={[]}
              typeName="Function"
              excluded={new Set()}
              busy={false}
              onChoose={onChoose}
              onCreate={onCreate}
            />
          </PlanTagPickerHostContext.Provider>
        </RefLabelContext.Provider>
      </PickerQueryContext.Provider>
    </QueryClientProvider>
  );
}
```

## What the host must supply

- The `PlanTagPickerHostContext` provider, above every picker, with the same object for as long as it is mounted. With none, the picker (and `usePlanPickerFind`) throws an error that names it. Its three members are each the call the source made, with the same arguments, at the same place (the app's `src/components/records/PlanTagLinks.tsx` is "PT" below). The source's query client `qc` is not passed; the host holds it:
  - `findPlanRecords(planVault, text, typeNames): Promise<{ hits: { uri, label, row }[]; complete }>`: the records of those types in the plan vault matching `text`, each hit with the row the search already read. `complete` is false when the search did not see every record (a failed or unreadable read, a result cut off); a vault that cannot be searched rejects. GilbApp: `searchPlanRecords(planVault, q, names, { qc })`, PT:70 (`lib/base/planSearch.ts` 214).
  - `tagUsed(planVault, tag): Promise<boolean>`: whether a record in the plan vault already uses the tag; a rejection is read as "could not check". GilbApp: `tagUsedInVault(planVault, text)`, PT:98 (`lib/base/planLinks.ts`).
  - `invalidateSearch(key)`: mark the finished search under `key` (the `["plan-search", planVault, namesKey, text]` key the picker gives its query hook) stale and ask for it again. GilbApp: `qc.invalidateQueries({ queryKey })`, PT:115.
- The provider of `PickerQueryContext` (`record-picker`), whose cache is the one `invalidateSearch` invalidates; and the provider of `RefLabelContext` (`entity-ref-value`).
- No member is optional: the picker has no writer of its own (`onCreate` and `onChoose` are the card's).
- Tailwind scanning this unit's `src`, and the CSS variables `--ink`, `--ink-faint`, `--line`, `--accent` and `--bad` (and those of the picker and the label).
- React 19.

## Do not

- Do not give the host a new object on every render: the find callback depends on it and is rebuilt when it changes.
- Do not make `invalidateSearch` a different key from the one it is given: the picker's query is cached under it.
- Do not answer `complete: true` from `findPlanRecords` for a search that was cut off: Create for a non-tag text would be offered on a partial answer.
- Do not install a second copy of `record-picker` or `entity-ref-value`: each holds its own context.

## Wrong readings

- "Create is offered when the search found nothing." For a tag-shaped text it is offered when the host says the tag is free, whether or not the search was whole; for any other text, only when the search was whole.
- "The Try again button is part of the picker." It is outside it, under it, and carries `data-picker-keep` so the picker's mouse-press rule leaves the drop-down open.
- "The host's whole hit reaches the picker." The picker is given the address, the label and the row of each hit; any other field of the host's hit is dropped.
- "`noticeFor` reads the HTTP status of any error." It reads a numeric `status` property; `409` is the duplicate-tag sentence, whatever the error class.
- "`TagLink` always opens by address." With an address it shows the record by its live name; without one it shows the record's tag.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/PlanTagLinks.tsx` lines 48-49 (`SEARCH_ERROR`, `TAG_PART`), 51-145 (`tagShaped`, `planSearchKey`, `usePlanPickerFind`, `rowOnHit`, `chosenRow`, `httpStatus`, `noticeFor`) and 179-295 (`TagLink`, `PlanTagPicker`) to `src/planTagPicker.tsx`; and `src/lib/base/planSearch.ts` lines 29-31 (`SEARCH_INCOMPLETE_CREATE`, a sentence) to the same file. Code verbatim except the named changes below. Imports: `../mynet/RemoveControl`, `./ConnectedCreateDialog`, `./cardMode` and the many `lib/base` imports of the file are not needed by these ranges and are not imported; `./EntityRefValue` (`EntityRefValue`) and `refDisplayName` are `@kaigilb/gilbplatformcode-entity-ref-value` (the app's `refDisplayName`, not the `entity-ref` unit's); `./orgCard/OrgRecordPicker` (`OrgRecordPicker`, the type `PickerFind`) is `@kaigilb/gilbplatformcode-record-picker`; `recordTag` and `duplicateTagSentence` of `planLinks` are `@kaigilb/gilbplatformcode-plan-links-model`; the types `BaseRecord` and `GridRecord` are `@kaigilb/gilbplatformcode-base-record`.
  1. `useQueryClient()` (line 65) is the private `usePlanTagPickerHost()`, which reads `PlanTagPickerHostContext` and throws an error that names the provider when there is none. `searchPlanRecords(planVault, q, names, { qc })` (70) is `host.findPlanRecords(planVault, q, names)` (member 1); `tagUsedInVault(planVault, text)` (98) is `host.tagUsed(planVault, text)` (member 2); `qc.invalidateQueries({ queryKey })` (115) is `host.invalidateSearch(queryKey)` (member 3). In the two dependency arrays (77, 116) `qc` is `host`.
  2. `SEARCH_ERROR`, `tagShaped`, `planSearchKey`, `usePlanPickerFind`, `rowOnHit`, `chosenRow`, `httpStatus`, `noticeFor` and `TagLink` are exported (private in the source), and `SEARCH_INCOMPLETE_CREATE`, which the source imported from `planSearch`, is copied here and exported, for the next unit's link views. `PlanTagPicker` was exported.
  3. Two type assertions: `rowOnHit(hit: { uri: string; row?: BaseRecord })` takes `row?: PickerRow` (the record-picker's structural row type, which is what a hit carries) and returns `(hit.row as BaseRecord | undefined) ?? null`; in `rowFor` the found row is read as `as BaseRecord | undefined`. The row is the `BaseRecord` the host put in the hit; the picker passes it through unread.
- Left in the app for the next unit (`plan-tag-links`): `MISSING_ADDRESS` (line 47), `VERSION_UNREAD` and `LINK_CONFLICT` (147-148), `writeLink` (150-177), and everything from line 297 (`PlanPartOf`, `PlanSubFunctions`, `PlanFunctionOfValue`, `PlanValueOfFunction`, `PlanSolutionOf`, `PlanSolutions`, `SolutionChips`, `PlanPartOfSystem`).

`src/planTagPickerHost.ts` (the host interface, the hit and page types, and the context) and `src/index.ts` are new. `test/fakeHost.tsx` is new: a fake host that logs its calls and answers what the test sets.

Tests:

| Source | Ported / left out |
|---|---|
| `lib/base/planTagVault.vaultit.test.ts` (`tagUsedInVault`, 6 cases) | Left out: they test the app's tag check in the vault, which is the host's. |
| `RecordDetail.planLinks`, `planSolution`, `planImpacts`, `planSourceDefaults` card tests that drive `plan-link-picker`, `plan-link-create`, `plan-link-hits` | Left out: they render whole cards over a stubbed `fetch`; what they say of this picker is pinned in `src/planTagPicker.test.tsx`. |

The source had no test of the picker alone. `src/planTagPicker.test.tsx` is new and pins: the hits for a typed tag and the arguments of the search, no search before the box is engaged, `canCreate` in its two modes, the used tag and the failed tag check, the incomplete answer with Try again (`data-picker-keep=""`, the key it invalidates, and the search asked again through a real cache), `busy`, `creates`, the 409 notice, `httpStatus`, `tagShaped`, `planSearchKey`, `rowOnHit`, `chosenRow`, `TagLink` (with an address, with its live label changing, and without), the query hook's arguments and the missing provider. `src/example.test.tsx` runs the README example, `src/exports.test.ts` pins the export list and `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.
