# plan-type-field

Shows the Type line of a Plan card: one GilbVeda type chosen with the type chooser, shown as a chip that opens the type's definition, stored as the term address ("No GilbVeda type" stores `none`), with a question before an earlier concept is replaced.

## What this is

Shows the Type line of a Plan card: one GilbVeda type chosen with the type chooser, shown as a chip that opens the type's definition, stored as the term address ("No GilbVeda type" stores `none`), with a question before an earlier concept is replaced.

Two components that belong together (the field looks for the question in the page to decide who gets the focus), and the constants around them.

- `PlanTypeField({ term, canEdit, editing, onChoose, search, blankReach, onOpenChange?, onOpenOntology?, renderTypeIcon? })`:
  - `term` is what is stored: the term address (`<term origin>/base/t/<Name>`), `none`, or "" for nothing chosen. It is trimmed. The type's name is the last part of the address, decoded (`Big%20Chair` is `Big Chair`; a trailing `/` or `#` is ignored; a bad escape is kept as it is).
  - A stored address (`http://` or `https://`, any case) shows, in this order: the type's picture (only if it has one; `TypePictureButton` of `type-term-popover`, 20 px, test id `plan-type-picture`, popover `plan-type-picture-popover`, label `Type picture: <name>`), the name as a chip button (`plan-type-chip`, popover `plan-type-popover`, label `Type <name>`), and an arrow button (`↗`, `plan-type-about`, popover `plan-type-about-popover`, label `About type <name>`). Each opens the type's definition (see `type-term-popover`). A stored value that is NOT an address shows as plain text in a chip (a `span` with the same test id and no popover, picture or arrow).
  - `none` shows "No GilbVeda type". Nothing stored shows nothing, except in Edit with `canEdit`, where it offers "Choose a type" (a card add control: it carries the `CARD_ADD_ATTR` attribute of `card-group`).
  - With `canEdit`, a chip or "No GilbVeda type" has a "Change" button (`aria-label="Edit Type"`) while the picker is closed. "Change" and "Choose a type" carry the attribute `data-plan-type-trigger` (`TYPE_TRIGGER_ATTR`): the trigger, where the focus returns.
  - The picker (`plan-type-picker`) holds a `TypeChooser` (label "Type", ids from `plan-type`, all planes in one list without tabs, no "name only" hint, placeholder "Search GilbVeda types…", focus in the box) and two buttons, "No GilbVeda type" and "Cancel". A pick calls `onChoose(termUrlOf(option.typeName))`; "No GilbVeda type" calls `onChoose("none")`; Cancel chooses nothing. Each closes the picker. `onOpenChange(true | false)` is called when it opens and closes. Escape on a control in the picker (not in the search box, which keeps its keys) closes it.
  - When the picker closes the focus goes back to the trigger. If the Replace question (`plan-type-replace-ask`) is in the page at that moment the field leaves the focus to it. If there is no trigger yet (the card left Edit, the term has not arrived), the field waits and takes the focus when the "Change" button appears.
  - `search`, `blankReach` and `renderTypeIcon` are given straight to the `TypeChooser`; `onOpenOntology(name)` to the three definition popovers (their "Open in Ontology" button).
- `PlanTypeReplaceAsk({ what, onKeep, onReplace })`: the Replace question, a modal alert dialog (`role="alertdialog"`, `aria-modal`, `aria-label="Replace the earlier concept"`, test id `plan-type-replace-ask`): "Replace the earlier concept `<what>`?" with Keep and Replace. The focus moves to Keep when it opens; Tab stays inside it (wrapping at both ends; the key does not leave it); Escape means Keep (nothing is lost). It is on the open stack of `open-popups` while it is on screen, so a layer around it (a dialog, a full-screen graph) leaves Escape and Tab to it; the stack's close is Keep. The form around the field decides WHEN to ask and what Keep and Replace write; it also returns the focus to the trigger when the question closes.
- `termUrlOf(typeName)`: `<term origin>/base/t/<typeName>`, the name as given (not encoded). Needs `setTermOrigin` to have been called.
- `NO_TYPE` (`"none"`), `TYPE_TRIGGER_ATTR` (`"data-plan-type-trigger"`).

## What this is not

- Not the form: it does not store anything, decide whether to ask before replacing an earlier concept, show the "Earlier note" line, or clear the earlier concept. `onChoose` says what was chosen; the form writes it.
- Not a search: the GilbVeda search is the host's `search`.
- Not the Type, Level and Version line at the top of a Plan card: see `plan-type-level-version`.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-type-field`

Take it together with its peers `type-chooser`, `type-term-popover`, `type-picture`, `card-group`, `open-popups` and `term-origin`, and their own peers (`type-name` for `type-picture`, `card-mode` for `card-group`). Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit):

```
install-links=true
```

Then install them:

```sh
npm install <path-to-the-library>/units/card-mode <path-to-the-library>/units/card-group <path-to-the-library>/units/open-popups <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser <path-to-the-library>/units/plan-type-field
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 and `react-dom` are peers.

## Examples

```tsx
import { PlanTypeField, PlanTypeReplaceAsk } from "@kaigilb/gilbplatformcode-plan-type-field";

// Above the card, once (see the peers): setTermOrigin(...), <TermDefinitionContext.Provider value={read}>,
// and, for pictures, <TypePictureSourceContext.Provider value={source}>.

<PlanTypeField
  term={stored}
  canEdit
  editing
  search={searchGilbVeda}
  blankReach="The types this app ships. Type to search all of GilbVeda."
  onOpenOntology={(name) => openOntologyPage(name)}
  onChoose={(term) => {
    // `term` is an address, or "none". Ask first if an earlier concept would be replaced.
    if (earlierConceptId && earlierConceptId !== term) setAsk({ term });
    else write(term);
  }}
/>;

{ask ? <PlanTypeReplaceAsk what={earlierLabel} onKeep={() => { write(ask.term); setAsk(null); }} onReplace={() => { writeAndClearEarlier(ask.term); setAsk(null); }} /> : null}
```

## What the host must supply

- `search` and `blankReach` (required): see `type-chooser`.
- The `TermDefinitionContext` provider of `type-term-popover` above the field (the chip, the arrow and the chooser read the definition through it); without it the field throws an error naming it.
- The term origin, set once with `setTermOrigin` (`term-origin`): `termUrlOf` and the popovers' links use it. For pictures, the picture source of `type-picture` in its context; without it no type has a picture.
- The form around the field: what is stored, the question before an earlier concept is replaced, the hand-back of the focus when that question closes (the field gives way while it is on screen; it does not take the focus back afterwards).
- Tailwind scanning this unit's `src`, so its classes are generated (they include arbitrary values such as `text-[14px]` and `text-[var(--accent)]`).
- These CSS variables: `--accent`, `--line`, `--ink-soft` (and those of `type-chooser` and `type-term-popover`).
- React 19 and `react-dom`.

## Do not

- Do not store the address with a different origin from `termUrlOf`'s: a stored address shows the last part of whatever origin it has, but a link is built from the term origin set.
- Do not render the Replace question outside the page's DOM (a portal into another document, a closed shadow root): the field finds it with `document.querySelector`.
- Do not render two fields with the Replace question of one of them on screen: the field looks for any `plan-type-replace-ask` in the page.
- Do not install a second copy of this unit or of its peers: a second copy has its own contexts, stack and term origin.

## Wrong readings

- "`onOpenOntology` is always drawn as a button." In the source it was read from the app's shell and a button was drawn in every popover, even when the shell had none (it then did nothing). Here the button is drawn only when `onOpenOntology` is given.
- "Escape closes the picker from anywhere in it." Not from the chooser's search box: the box stops its keys, so Escape typed there does nothing; Escape on Cancel, on No GilbVeda type, or on a row does.
- "The name in the chip is the stored text." It is the last part of the address, decoded. Only a stored value that is not an address is shown as it is (trimmed).
- "A pick stores the label." It stores `termUrlOf(option.typeName)`; the label may differ.
- "The field returns the focus after the Replace question." The form does; the field only keeps out of the question's way while it is on screen.
- "Keep and Replace are named for what they write." The ask only calls `onKeep` or `onReplace`; Escape calls `onKeep`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/PlanTypeField.tsx` lines 12-186 (`NO_TYPE`, `TYPE_TRIGGER_ATTR`, `termUrlOf`, `PlanTypeField`) to `src/PlanTypeField.tsx`; the header comment and the imports (lines 1-10) are the unit's own. Comments made generic. Named changes:
  1. `GILBVEDA_MASTER_ORIGIN` (from `src/lib/base/stakeholderKinds.ts`) is `termOrigin()` from `term-origin`, in `termUrlOf` (line 32): `` `${termOrigin()}/base/t/${typeName}` ``. The export is kept.
  2. `ShellContext.openOntologyConcept` is the new optional prop `onOpenOntology?: (typeName: string) => void`. The source read `shell` at line 51 (`useContext(ShellContext)`) and passed `(n) => shell?.openOntologyConcept?.(n)` at three call sites: the picture button (line 90), the chip popover (line 101) and the arrow popover (line 118). Each now receives `onOpenOntology` as it is. (A difference: the source always passed a function, so every popover had an "Open in Ontology" button; now it has one only when the prop is given.)
  3. The props `search`, `blankReach` and `renderTypeIcon` are new, and are passed to the `TypeChooser` (line 155) as `search={search} blankReach={blankReach} renderTypeIcon={renderTypeIcon}`: in the source the chooser got its search, reach and icons from its defaults. `search` and `blankReach` are required.
  4. `CARD_ADD_ATTR` is from `card-group`; `TypeChooser` from `type-chooser`; `TypeTermPopover` and `TypePictureButton` from `type-term-popover`.
- `src/components/records/PlanTypeReplaceAsk.tsx` lines 7-55 (whole component) to `src/PlanTypeReplaceAsk.tsx`; the header comment and the imports (lines 1-5) are the unit's own. `registerOpen` and `tabInside` are from `open-popups` (were `../ui/openStack`). No code change.
- `src/index.ts` is new.

Tests:

| Source | Ported / left out |
|---|---|
| `src/components/records/PlanType.qa4.v36.test.tsx`, "after a pick with no question, focus returns to the Type control (Change)", "after a pick that raises the Replace question, keyboard focus is on the question", "Escape in the Replace question dismisses it without writing", "Tab inside the Replace question stays inside it, and Replace returns the focus to the trigger" | Ported to `src/PlanTypeField.test.tsx` (describe "focus after the picker closes") with the same inputs and expectations, except that the card (`RecordDetail`) is replaced by a small stand-in form written for the test, which holds the stored term, the earlier concept and the question with the source form's rules and hands the focus to the trigger when the question closes. The picks are made on the real `TypeChooser` (the source mocked it with two buttons, "pick-Person" and "pick-Door"); the writes are the stand-in's, not patches to a vault. |
| Same file, "a label-only earlier note is not erased by choosing a Type without asking" and "the x on the Earlier note clears it only when clicked" | Left out: they test the form (the "Earlier note" line and the patches), not the field. |
| `src/components/records/RecordDetail.planType.v31.test.tsx`, "'No GilbVeda type' stores none", "an old typed URL in a:ontologyTerm still shows as the Type" | Ported to `src/PlanTypeField.test.tsx` with the same expectations (`onChoose("none")` instead of a patch; the chip named "Type Open"). |
| Same file, the describe about the GilbVeda picture on the Type of every Plan card, first and second cases (the picture shows at 20 px before the label, the arrow follows, the picture opens the popover; a type with no picture draws no image) | Ported to `src/PlanTypeField.test.tsx` for the field alone. The third case (the "Type:" line under the card header) is left out: it is the header, not the field. |
| Same file, the other cases (card titles, Ambition Level, "+ Add information", the read fallbacks, the clear rule, Keep writes) | Left out: they render the whole card. |
| `src/PlanTypeField.test.tsx` (the rest) and `src/PlanTypeReplaceAsk.test.tsx` | New: the line's states, the name from the address, the picker, the testids, the popovers and `onOpenOntology`, `termUrlOf`, the focus rules, the question's dialog, Escape, Tab and stack behaviour. `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults. |
