# type-chooser

Lets a person search for a GilbVeda type and pick one from a short list with planes, definitions, a detail view and a note when more terms match than are shown.

## What this is

Lets a person search for a GilbVeda type and pick one from a short list with planes, definitions, a detail view and a note when more terms match than are shown.

One component, `TypeChooser`, and the types of what it is given and hands back.

- `TypeChooser({ search, blankReach, onPick, value?, pinned?, label?, autoFocus?, disabled?, idPrefix?, maxListHeight?, fill?, planes?, blankEmptyLabel?, showSpecHint?, searchPlaceholder?, searchClassName?, extraOptions?, renderTypeIcon? })`.
  - **Search.** The chooser asks `search(text)` once per settled query: the text as typed (untrimmed), 140 ms after the last change, once for the blank box at mount, and again when the `search` function itself changes. It draws ONLY what the last answer returned, a stale answer (for an older query) is dropped, and a `search` that throws shows nothing and says "The type search failed, so nothing could be looked up. This is not a statement that the type does not exist." Until the first answer it says "Searching…".
  - **Answer.** `search` returns `{ options: TypeOption[], reach: string, degraded: boolean }`. An option is `{ id, label, typeName, spec: { id: string } | null, kind: "type" | "function" | "value", definition?: string | null }`. The chooser reads `spec` only to know whether it is there (the "name only" hint). `degraded: true` means the ontology could not be asked: an empty list then says "GilbVeda could not be searched just now, so nothing can be shown." and never "no type matches".
  - **Planes.** Tabs Things / Functions / Values / All (`role="tablist"`, `aria-label="What to create"`), always in that order; `planes` limits them (a single plane hides the tabs) and the first plane GIVEN is the one it starts on. The list shows the options whose `kind` fits the plane (Things = `type`; All = every kind, with a "Functions" or "Values" heading before each run of that kind).
  - **Rows.** Each row is a `role="option"` button (min 44 px) with the label, `t:<typeName>` when the name is not the label with its spaces removed and lower-cased, and "name only" when there is no `spec` (unless `showSpecHint={false}`); beside it an arrow button (`↗`, `aria-label="About t:<typeName>"`) that opens the definition popover of the `type-term-popover` unit and never picks the row. `value` marks the selected row; `pinned` is shown first when the search did not return it; `extraOptions` (the host's own acts) are listed after the search rows on a blank query or when their label contains the query.
  - **Detail.** A pick calls `onPick(option)`, then shows the option alone with its definition: `option.definition` if it has one (a non-empty string), else "Loading definition…" while the host's reader is asked for `typeName`, then the definition, "No definition on this term." (the term was read and has none) or "Definition could not be loaded — this says nothing about the term." (with the reason as the `title`). `×` (or any change to the box) returns to the list.
  - **Reach note.** The answer's `reach` is shown under the list (`type-chooser-scope`), muted when `degraded`. Before the first answer it is `blankReach`. It is hidden in the detail view, and hidden when the answer says "More than N GilbVeda terms match" and fewer than 20 rows (`LIVE_TERM_LIMIT`) are shown. The hidden contract: see "What the host must supply".
  - Test ids: `type-chooser`, `type-chooser-search`, `type-chooser-list`, `type-chooser-plane`, `type-chooser-plane-<things|function|value|all>`, `type-chooser-option-<id>`, `type-chooser-empty`, `type-chooser-scope`, `type-chooser-detail`, `type-chooser-detail-back`, `type-chooser-definition`, `type-chooser-definition-absent`, `type-chooser-definition-unreachable`, `type-chooser-term-<id>` (the arrow), `type-chooser-term-popover`. The ids of the search box and the list come from `idPrefix`, or from `useId`.
  - The search box carries the accent border at rest (`border-2 border-[var(--accent)] bg-[var(--surface)]`) and a focus ring (`focus:shadow-[...]`); `searchClassName` replaces the whole class string. Keys and clicks in the box do not reach a menu around it.
  - Other props: `label` (default "Type"), `autoFocus`, `disabled`, `maxListHeight` (default 176 px), `fill` (the list takes the host's room), `blankEmptyLabel`, `searchPlaceholder`.
- `renderTypeIcon(option, className)`: draws an option's icon in its row and in the detail view; `className` is the size and colour the chooser wants. Absent: nothing is drawn where the icon was.
- `LIVE_TERM_LIMIT` (20) and `optionMatchesPlane(kind, plane)`; the types `TypeChooserProps`, `TypeOption`, `TypeOptionKind`, `TypeSearchResult`, `TypeSearchFn`, `CreatePlane`.

## What this is not

- Not a search: it asks the `search` you give it and draws the answer. What is searched, how hits are ranked and named, and the cap on a page are the caller's.
- Not a creator: it mints nothing, and there is no "create this type" row or free-typed name path. A name that matches nothing is an honest empty list.
- Not a cache: a pick reads the definition from the host's reader each time (the once-per-session cache of `typeDefinitionOnce` is the popover's).
- Not the record-type registry or its icons: the host draws the icons through `renderTypeIcon`.

## How to take it

Package: `@kaigilb/gilbplatformcode-type-chooser`

Take it together with its peer `type-term-popover` and that unit's own peers (`open-popups`, `term-origin`, `type-picture`, which itself needs `type-name`). Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit):

```
install-links=true
```

Then install them:

```sh
npm install <path-to-the-library>/units/open-popups <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

```tsx
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { TermDefinitionContext } from "@kaigilb/gilbplatformcode-type-term-popover";
import { TypeChooser } from "@kaigilb/gilbplatformcode-type-chooser";
import type { TypeSearchFn } from "@kaigilb/gilbplatformcode-type-chooser";

// Once, at start-up, and once above the chooser (the same reader the popover uses).
setTermOrigin("https://ontology.example.test");
// <TermDefinitionContext.Provider value={readTermDefinition}> ... </TermDefinitionContext.Provider>

const search: TypeSearchFn = async (text) => {
  const hits = await findTerms(text.trim()); // the host's own search
  return {
    options: hits.map((h) => ({ id: `ex:${h.name}`, label: h.label, typeName: h.name, spec: null, kind: "type" as const })),
    reach: hits.length === 20 ? `More than 20 GilbVeda terms match “${text.trim()}” — keep typing to narrow it.` : "Searching all of GilbVeda.",
    degraded: false,
  };
};

<TypeChooser
  search={search}
  blankReach="The types this app ships. Type to search all of GilbVeda."
  onPick={(option) => console.log(option.typeName)}
  renderTypeIcon={(option, className) => <MyIcon type={option.typeName} className={className} />}
/>;
```

## What the host must supply

- `search`: required. A function from the text typed to `{ options, reach, degraded }`. An empty text means "nothing typed yet": answer with a short default list, never a long one, because the chooser draws what it is given.
- `blankReach`: required. The sentence under the list before the first answer comes back; it is shown whatever its text.
- The `TermDefinitionContext` provider of `type-term-popover`, above the chooser (the same reader the popover uses). With none, `TypeChooser` throws an error naming it (`type-chooser: wrap the app in <TermDefinitionContext.Provider value={readTermDefinition}>`). The term origin must be set (`setTermOrigin`) for the popover's link.
- **The hidden contract on `reach`.** The chooser tests the answer's `reach` text against the regular expression `/More than \d+ GilbVeda terms match/`. When it matches, and the answer is not `degraded`, and fewer than 20 rows (`LIVE_TERM_LIMIT`) are shown in the current plane, the note is NOT drawn. So a host whose search is cut at its page size must return a `reach` that contains exactly `More than <digits> GilbVeda terms match` (for example `More than 20 GilbVeda terms match “term” — keep typing to narrow it.`) for the chooser to treat it as a truncated answer; any other wording is always shown. The number in the text is not read, only that digits are there.
- `renderTypeIcon` if icons are wanted.
- Tailwind scanning this unit's `src`, so its classes are generated (they include arbitrary values such as `min-h-[44px]`, `text-[13px]`, `rounded-[var(--r-md)]`).
- These CSS variables: `--accent`, `--surface`, `--ink`, `--ink-soft`, `--ink-faint`, `--ink-ghost`, `--line`, `--line-2`, `--sel`, `--focus`, `--r-sm`, `--r-md` (and those of `type-term-popover`).
- React 19.

## Do not

- Do not answer a failed request with an empty list and `degraded: false`: that reads as "no such type". Throw, or return `degraded: true`.
- Do not hard-code a `reach` that says the whole ontology was searched when it was not: the sentence is shown to the person.
- Do not make `search` a new function on every render: a new function (by identity) restarts the search for the current text.
- Do not install a second copy of this unit or of `type-term-popover`: a second copy has its own context and the chooser throws below a provider from the other copy.

## Wrong readings

- "`search` is optional and defaults to a live term search." In the source it was optional and defaulted to a search of the ontology server inside the app; that default is not in this unit, and `search` is required.
- "`blankReach` has a default sentence." In the source it was a text built from an environment setting (a minimum query length); here the host says it.
- "The icon is drawn by the chooser." It is drawn by `renderTypeIcon`; without it nothing is drawn. The source drew the app's record-type icon from `spec.id` and the type name; the chooser no longer reads `spec.id`.
- "`planes` is sorted." The tabs are in the fixed order Things, Functions, Values, All; only the plane the chooser starts on follows the order GIVEN (`planes={["value", "things"]}` starts on Values).
- "A pick is final." The pick calls `onPick` and shows the detail; the host decides what picking means, and `×` goes back to the list.
- "The definition is cached." The chooser asks the reader on every pick of an option with no `definition`; it also does not guard against a slow answer for an earlier pick landing on a later one.
- "The note appears for any long answer." Only for a `reach` that matches the contract above, and only while 20 or more rows are shown in the current plane.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/TypeChooser.tsx` lines 50-541 (`TypeChooser`, `TypeChooserProps`, the plane tables and constants) to `src/TypeChooser.tsx`; the header comment and the imports (lines 1-48) are the unit's own. Comments made generic. Named changes:
  1. The default `search = searchLiveTerms` (line 151) is removed: `search: TypeSearchFn` is required.
  2. `BLANK_QUERY_REACH` (line 176, the first value of the `reach` state; in the source it comes from `src/lib/base/typeSearch.ts` line 553, built from the environment setting `VITE_MIN_ONTOLOGY_QUERY`) is the new required prop `blankReach: string`. It is always shown until the first answer, so it is required, with no fallback text.
  3. `readTermDefinition` (line 48 import, line 257 call) is the reader from `TermDefinitionContext` of the `type-term-popover` unit; `TypeTermPopover` and the `TermDefinition` type come from that unit too. A missing provider throws.
  4. `TypeIcon` (`./recordIcons`; lines 364-368 in the detail view and 483-489 in a row) is the new optional prop `renderTypeIcon(option, className)`, called with the same class strings; when absent nothing is drawn. The wrapper elements around it are unchanged. (`typeId={o.spec?.id ?? "note"}` and `typeName` are the host's to derive from the option.)
- `src/lib/base/typeSearch.ts` to `src/types.ts` and `src/typeSearch.ts`:
  - lines 102-103 (`CreatePlane`), 105 (`TypeOptionKind`), 126-179 (`TypeOption`, `TypeSearchResult`, `TypeSearchFn`) to `src/types.ts`, verbatim except: `spec: RecordTypeSpec | null` is `spec: { id: string } | null` (structural, so the unit needs no record model; the chooser no longer reads `spec.id`, only whether `spec` is there); comments made generic.
  - lines 484-488 (`LIVE_TERM_LIMIT`) and 120-124 (`optionMatchesPlane`, which the chooser imports with them) to `src/typeSearch.ts`, verbatim.
  - Not taken: `searchLiveTerms`, the registry search, `kindFromNodeKind`, `BLANK_QUERY_REACH` and the rest of the file.
- `src/index.ts` is new.

Tests:

| Source | Ported / left out |
|---|---|
| `src/components/records/TypeChooser.test.tsx` (8 cases: the accent at rest, `searchPlaceholder`, `planes={["things"]}` hides the tabs, defaults to Things, Functions shows only functions and All goes wider, the more-than-20 note hidden below 20 rows, kept at 20 rows, a pick shows the definition and × returns) | Ported to `src/TypeChooser.test.tsx` with the same inputs and expectations. The unit has no jest-dom, so `toHaveAttribute(name, value)` is `getAttribute(name)` compared with `toBe`. The chooser is rendered inside a `TermDefinitionContext` provider and given `blankReach`. |
| `src/components/records/TypeTermPopover.vaultit.test.tsx`, `describe("TypeChooser t: link")` (1 case: the arrow opens the popover and does not pick the row; the t: name stays in the row; Person has an arrow too) | Ported to `src/TypeChooser.test.tsx` with the same inputs and expectations; `readTermDefinition` was mocked, here the reader is passed through the context; the link `https://veda.gilb.com/base/t/NoteDocument` is `https://ontology.example.test/base/t/NoteDocument` with `setTermOrigin` in the setup. The other cases of that file are ported with `type-term-popover`. |
| Every other case in `src/TypeChooser.test.tsx`, `src/TypeChooser.states.test.tsx` and `src/typeSearch.test.ts` | New: debounce and stale answers, failure and degraded wording, the reach contract, the empty-list wording by plane, headings, `t:` rule, spec hint, selected, pinned, extras, icons, detail states, ids, tabs and planes, layout, focus and disabled, `LIVE_TERM_LIMIT` and `optionMatchesPlane`. `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults. |
