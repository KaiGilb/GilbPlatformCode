# plan-type-level-version

Draws the one line every Plan card shows first, "Type: <type> · Level: <level> · Version: <date>", with the plain/constraint type switch and the level chooser.

## What this is

One component, `PlanTypeLevelVersion`, and its prop types (`PlanTypeLevelVersionProps`, `PlanTypeSwitch`, `PlanLevelOption`). It holds no data: the card passes in what to show and what to do.

- **Type.** `typeLabel` is the Plan word (Value, Function Constraint, ...). With `typeName` (the GilbVeda type behind the word) the type's picture is drawn at 20 px before the word (`TypePicture` of `type-picture`; nothing when there is no picture, no name, or an empty name).
  - With no `typeSwitch` the word is plain text (`aria-label="Type"`), and clicking it does nothing.
  - With `typeSwitch` `{ plainWord, constraintWord, constraint, onPick }` the word is a button (`aria-label="Type"`). A click opens it in place when `canEdit`; in Edit (`editing`) it is open at once. Open, it is a `role="radiogroup"` (`aria-label="Type"`) of two radios named `plan-type-<recordId>`, labelled `plainWord` and `constraintWord`, the one for `constraint` checked. Choosing the other side calls `onPick(true)` (constraint) or `onPick(false)`; choosing the side already chosen calls nothing. Outside Edit a pick also closes the radios and the word comes back.
- **Level.** Outside Edit it is a button (`aria-label="Level"`) showing `levelText`, or `levelDefaultText` in the faint colour when there is none; a click calls `setLevelOpen(true)` when `canEdit`. In Edit, or when `levelOpen`, it is a select (`aria-label="Level"`): the value is `levelSelected` (a blank first option when it is empty), one option per entry of `levelOptions` (`{ token, label }`) written by `optionLabel(node)` (the entry's own `label` is not shown), and a last option "+ Add level…" with the value `addLevelValue`.
  - Choosing a level calls `onChooseLevel(token)`; choosing "+ Add level…" calls `onAddLevel()` and not `onChooseLevel`; an option whose token is empty calls nothing.
  - Opened by a click (not in Edit) the select takes the focus; leaving it calls `setLevelOpen(false)` unless a level is being added (`addingLevel`); Escape does the same and stops there; Enter takes the focus out of it. In Edit it stays and Escape goes on to the layer around.
- **Version.** `version` (a `Date`, or null) is shown as the day in the local zone, YYYY-MM-DD (`aria-label="Version"`), with the full local date and time (`version.toLocaleString()`) as the `title`; null shows "—" and no title.
- `below` and `ask` are nodes drawn under the line, in that order (the out-of-tree warning and the add-level form; the type-change question).
- The group is `data-testid="card-group" data-group="plan-type-level" data-kind="plan-type-level"`.

## What this is not

- Not the Type field of the card (that chooses a GilbVeda type from the ontology): see `plan-type-field`.
- Not the level list, the add-level form, the out-of-tree warning or the type-change question: the card makes them and passes them in (`levelOptions`, `below`, `ask`).
- Not a date formatter: the day is the local calendar day, and `title` is the browser's own `toLocaleString`.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-type-level-version`

Take it together with its peer `type-picture` (which itself needs `type-name`). Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit):

```
install-links=true
```

Then install them:

```sh
npm install <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/plan-type-level-version
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

```tsx
import { PlanTypeLevelVersion } from "@kaigilb/gilbplatformcode-plan-type-level-version";

<PlanTypeLevelVersion
  recordId="fn1"
  typeLabel="Function"
  typeName="Function"
  typeSwitch={{ plainWord: "Function", constraintWord: "Function Constraint", constraint: false, onPick: (constraint) => setConstraint(constraint) }}
  editing={false}
  canEdit
  levelOpen={levelOpen}
  setLevelOpen={setLevelOpen}
  levelText="Plan"
  levelDefaultText="Not set"
  levelSelected="plan"
  levelOptions={[{ token: "now", label: "Now" }, { token: "plan", label: "Plan" }]}
  optionLabel={((node: { label: string }) => node.label) as (node: never) => string}
  addLevelValue="__add__"
  addingLevel={false}
  onAddLevel={() => setAdding(true)}
  onChooseLevel={(token) => save(token)}
  version={new Date()}
  below={null}
  ask={null}
/>;
```

## What the host must supply

- The picture source of `type-picture` in its context if the type's picture is wanted (`TypePictureSourceContext`); without it no type has a picture and nothing is drawn.
- All the state: `levelOpen` and `setLevelOpen`, `editing`, `canEdit`, and the level data. The component only keeps whether the type radios are open.
- Tailwind scanning this unit's `src`, so its classes are generated (they include arbitrary values such as `text-[14px]`, `text-[12px]`, `text-[var(--ink)]`).
- These CSS variables: `--ink`, `--ink-soft`, `--ink-faint`, `--line`.
- React 19.

## Do not

- Do not pass the same `recordId` for two cards on one page: the radio group name is built from it, and two groups of one name act as one.
- Do not read `version.toLocaleString()` in `title` as a stable string: it follows the viewer's locale and zone.
- Do not install a second copy of `type-picture`: a second copy has its own context and the picture never sees the host's source.

## Wrong readings

- "`optionLabel` takes a level option." It is typed `(node: never) => string` and called with each entry of `levelOptions` cast to `never`, as in the source; give it a function of your own node type and cast it as in the example. The entry's `label` field is not used by the select.
- "The select closes when a level is chosen." Not by itself: `onChooseLevel` is the card's, and the card decides whether to set `levelOpen` false. Leaving the select (blur, Enter, Escape) closes it.
- "Escape closes the level chooser in Edit." Only when it was opened by a click; in Edit the key goes on.
- "The Type word always opens the switch." Only with a `typeSwitch` and `canEdit` (or in Edit).
- "The version is UTC." It is the local calendar day of the `Date` given.
- "A year before 1000 is padded." It is not (`999-01-01`).

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/PlanTypeLevelVersion.tsx` lines 1-169 (whole) to `src/PlanTypeLevelVersion.tsx`. Code verbatim; the imports are the unit's own. Named changes:
  1. `import { localDay } from "../../lib/base/planValue"` is `import { localDay } from "./localDay"`.
  2. `TypePicture` (was `./TypePicture`) is from `@kaigilb/gilbplatformcode-type-picture`.
- `src/lib/base/planValue.ts` lines 2089-2093 (`localDay`, with its comment) to `src/localDay.ts`, verbatim. It is not exported from the package index; the rest of `planValue.ts` is not taken.
- `src/index.ts` is new (exports the component and its three prop types).

Tests:

| Source | Ported / left out |
|---|---|
| None: the source has no test of this component alone (`src/components/records/PlanType.qa4.v36.test.tsx` goes through the whole card) | `src/PlanTypeLevelVersion.test.tsx` and `src/localDay.test.ts` are new and pin the behaviour read from the source: the three parts and their labels, the type switch (button, radios, `onPick(true | false)`, the radio names), the level button and select (options, `optionLabel`, "+ Add level…", focus, blur, Escape, Enter), the version (local day, `title`, dash), the `below` and `ask` slots, and the test id, group and kind of the group. `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults. |
