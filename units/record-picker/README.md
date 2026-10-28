# record-picker

A search-and-pick box for records: debounced search, grouped hits, "nothing found", an incomplete-answer note with Try again, and mouse picking; the caller decides what is searched.

## What this is

A search-and-pick box for records: debounced search, grouped hits, "nothing found", an incomplete-answer note with Try again, and mouse picking; the caller decides what is searched.

One component, `OrgRecordPicker` (also exported as `RecordPicker`, the same function under a neutral name), and the small hook it uses.

- The box searches by itself: the text you type is trimmed and settles after 250 ms of stillness; then the caller's `find(text)` is asked through the host's query hook (see "What the host must supply"). There is no minimum length: an empty box is searched on mount unless `searchOnMount={false}`.
- Two looks. Without `untilEngaged`, the hits are a list under the box that stays; with `untilEngaged`, they are a drop-down that opens on focus, a click or typing, shows at most 8 hits (with "Type to search all" when more or a partial page), and closes on a pick, on Escape, and on a mouse press outside the picker.
- Hits are `OrgRecordHit` (`{ uri, label, typeName?, note?, row?, group? }`). A heading is drawn above the first hit of each run of one `group`. `exclude` drops addresses that must not be offered.
- States it says in words: searching (`pendingText`), failed (`errorText`, with `role="alert"`), found nothing and the answer was whole (`noneText`), found nothing and the answer may not be whole (`partialText`), "Some vaults could not be searched." when the answer says `vaultsMissed`. An empty `noneText` or `partialText` says nothing.
- `whenIncomplete: { none, hits, onRetry }`: when the answer is not whole, with no hit it shows `none` and a Try again button that calls `onRetry`; with hits it shows every hit and `hits` under them.
- `whenNoMatch(text)`: a place for the caller's own "add this" control when the find finished with no hit.
- `onPick(hit)`, `onCancel` (Escape, and a Cancel button), `onTextChange(text)` (every change, untrimmed), `onAnswer(answer, text)` (a finished answer for the settled text), `initialText` (searched at once, not after the debounce), `enabled`, `autoFocus`, `placeholder`, `label`, `hitsTestId`, `staleTime` (default 10 000 ms), `queryKey`, `findKey`.
- The query key it builds is `["record-picker", findKey ?? label, vaultId, settledText]`; a caller's `queryKey` replaces it, and the search then waits until the settled text has caught up with the box.
- Test ids: `org-record-picker`, `org-record-hits` (or `hitsTestId`), `org-record-hit`, `org-record-group`, `org-record-none`. The picker also honours `data-picker-keep` on an element OUTSIDE it (a mouse press there does not close the drop-down, so a Try again button beside the picker can be pressed); it sets that attribute on none of its own elements.
- `PickerQueryContext`, `UsePickerQuery`, `PickerQueryArgs`, `PickerQueryResult`: how the host gives the picker its query hook.
- `PickerFind` (`{ hits, complete, vaultsMissed? }`), `PickerIncomplete`, `OrgRecordHit`, `PickerRow` (the row a hit may carry; the picker reads none of it) and `useDebouncedValue(value, ms)` (the value after it has been still for `ms`; starts equal to the value).

The default words (`Search organizations`, `Organization`, `No organization record matches.`, and so on) are the source's; pass your own for another kind of record.

## What this is not

- Not a search: it asks the `find` you give it and draws the answer. What is searched, how hits are named and grouped, and the cap on a page are the caller's.
- Not a cache: it does not hold answers. The host's query hook does.
- Not a keyboard list: there is no arrow-key or Enter handling. Escape is the only key it reads; hits are picked with the mouse (or by activating a hit button).
- Not `search-pick`: that has no groups, no incomplete-answer handling, no Try again and no debounce.

## How to take it

Package: `@kaigilb/gilbplatformcode-record-picker`

It has no peer unit. Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link (one copy of React):

```
install-links=true
```

Then install it:

```sh
npm install <path-to-the-library>/units/record-picker
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

```tsx
import { useQuery } from "@tanstack/react-query";
import { PickerQueryContext, RecordPicker } from "@kaigilb/gilbplatformcode-record-picker";
import type { PickerFind, UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";

// Once, above every picker. The options are the ones the source passed to its own query call.
const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};

<PickerQueryContext.Provider value={usePickerQuery}>
  <App />
</PickerQueryContext.Provider>;

// Anywhere below it.
const find = async (text: string): Promise<PickerFind> => ({
  hits: [{ uri: "https://example.test/base/e/ann", label: "Ann Co", note: "Oslo", group: "Companies" }],
  complete: true,
});

<RecordPicker vaultId="https://example.test/vault" label="Company" placeholder="Search companies" find={find} untilEngaged onPick={(hit) => console.log(hit.uri)} />;
```

## What the host must supply

- The `PickerQueryContext` provider, above every picker, with a hook `({ key, run, enabled, staleTime }) => { data?, isFetching, isError, isSuccess }`. With none, the picker throws an error naming the provider. The example above is the hook the source's own query call was: `useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false })`. The source passed those five options and read `data`, `isFetching`, `isError` and `isSuccess` from the result, and nothing else.
- Tailwind scanning this unit's `src`, so its classes are generated (the classes include arbitrary values such as `text-[var(--ink-faint)]`, `min-h-11`, `max-h-64`, `z-30`).
- These CSS variables: `--ink`, `--ink-faint`, `--line`, `--surface`, `--accent`, `--bad` and `--serif` (the Cancel button's italic).
- React 19.

## Do not

- Do not make the hook's `run` retry: pass `retry: false` (or the equivalent), or a failed find is asked again behind the user's back and "could not search" appears late.
- Do not draw your own "none found" beside the picker: set `noneText`, `partialText` and `whenIncomplete`, which know whether the answer was whole.
- Do not say "no such record" from a partial answer. `complete: false` is not an absence.
- Do not install a second copy of this unit: a second copy has its own context, and a picker below a provider from the other copy throws.
- Do not forget `data-picker-keep` on a control outside the picker that must work while the drop-down is open, such as Try again under it: without it, a press there closes the drop-down before the click lands.

## Wrong readings

- "Any query cache will do." The picker's behaviour depends on the cache deduping by key, reusing a finished answer for `staleTime`, and being invalidated by key: callers invalidate with the same keys they pass as `queryKey`. A hand-rolled cache that does not dedupe by key changes what is asked and when.
- "`enabled` is false below some length." There is no minimum length. It is false when the caller says so, while a caller's `queryKey` is waiting for the debounce, and for an empty box with `searchOnMount={false}` until it is focused, clicked or typed in.
- "`staleTime` is 30 s." It is 10 000 ms by default, and 0 is a value (a remount asks again). Callers set their own.
- "`find` is optional." It is required here. In the source it was optional and defaulted to an organization search inside the app; that default is not in this unit.
- "The arrow keys and Enter move and pick." They do nothing.
- "A hit's `row` is read." Nothing in the picker reads it; it travels with the hit to `onPick`.
- "`data-picker-keep` is set by the picker." It is only read by it, on the element a mouse press landed in.
- "Try again always shows." Only when `whenIncomplete` is given, the answer is not whole, and no hit is left after `exclude`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/orgCard/OrgRecordPicker.tsx` lines 1-334 (whole) to `src/RecordPicker.tsx`. Comments made generic. Named changes:
  1. The default `find` is removed (the source's lines 138-140 and 146 chose between the caller's `find` and `findOrganizationRecords` of the app's organization card): `find` is required in the props type; the default key `defaultKey` is the source's `find` branch alone, `["record-picker", findKey ?? label, vaultId, debounced]`; the `queryFn` is `find(debounced)`. For a caller who passes `find` (every caller of this unit) nothing differs.
  2. `useQuery` (lines 144-150: `queryKey`, `queryFn`, `enabled`, `staleTime`, `retry: false`) is a call to the host hook from `PickerQueryContext` with `{ key, run, enabled, staleTime }`, the same values; `retry: false` is the host hook's to pass. A missing provider throws. New exports `PickerQueryArgs`, `PickerQueryResult`, `UsePickerQuery`, `PickerQueryContext`. The result fields the component reads are `data`, `isFetching`, `isError`, `isSuccess`.
  3. `OrgRecordHit` is imported from `./types`; the `@tanstack/react-query` and `orgRecords` imports are removed.
  4. One new line at the end: `export const RecordPicker = OrgRecordPicker;`.
- `src/components/records/orgCard/useDebouncedValue.ts` lines 1-13 (whole) to `src/useDebouncedValue.ts`. Comment made generic; no code change.
- `src/lib/base/orgCard/orgRecords.ts` lines 60-72 (`OrgRecordHit`) to `src/types.ts`. Verbatim, except that `row?: BaseRecord` is `row?: PickerRow`, a structural type declared beside it (`{ id: string; entityUri?: string; typeUri?: string; facts?: Record<string, string> }`), so the unit needs no record model; the app's own record type is assignable to it. The picker reads no field of `row`.

`src/index.ts` is new.

Tests:

| Source | Ported / left out |
|---|---|
| `src/components/records/RecordDetail.planSearch.vaultit.test.tsx`, `describe("a newer keystroke wins")` (lines 426-467), two cases | Ported to `src/RecordPicker.test.tsx` with the same inputs and expectations; the host there is `@tanstack/react-query` as a dev dependency of the tests, through the hook of the example above; hosts in the test are example.test. |
| The other cases of that file (they render the card's own link pickers) | Left out. |
| `RecordDetail.planAuthority`, `planSearchComplete`, `planQaTester3`, `planResourceCard`, `planClickToType`, `planSources`, `planStakeholders` test files (use `org-record-hit` through a whole card) | Left out. |
| `src/components/records/orgCard/OrgHierarchySections.s10fix.test.tsx` (replaces the picker with a mock) | Left out. |

The source had no test of the picker alone, and none of `useDebouncedValue`. `src/RecordPicker.test.tsx` and `src/useDebouncedValue.test.ts` are new and pin the behaviour (the query key, `staleTime`, `enabled`, the debounce, grouped hits, the test ids, Try again, Escape and the mouse press outside, the missing provider). `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.
