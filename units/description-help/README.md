# description-help

The help panel for writing a Solution's or Function's Description in Keyword parts: what a Keyword is, the Assumption part, sub-parts, moving parts, pasting many parts at once and naming a source, each with an example that uses the card's own tag.

## What this is

One React component and three constants. It draws seven help sections beside a contents list, using the building blocks of `help-doc`.

- `DescriptionHelp({ tag, kind? })`: the panel. `kind` is `"Solution"` (the default) or `"Function"`. `tag` is the tag of the card's record; every example uses it (`Ben.Bones`, `Ben.Bones.Hip`, `Ben.Assumption.Weight`), and an empty `tag` (`""` exactly; a space is a tag) falls back to `MySolution` or `MyFunction`. `kind` changes the wording ("The Description of a Function", "what this Function takes as true", "the Function's tag") and the examples (Bones, Hip and Knee for a Solution; Step, Lift, Land and Swing for a Function).
- The seven sections, in order, with ids: `desc-overview` ("The Description of a Solution"), `desc-part` ("+ Part: add one part"), `desc-subpart` ("Sub-parts: a part under a part"), `desc-move` ("Moving parts (in Edit)"), `desc-assumption` ("+ Assumption: what this Solution takes as true"), `desc-paste` ("Paste parts: add many at once"), `desc-source` ("Sources: who said it"). The contents list has one button for each; two links inside the text scroll to `desc-move` (from the sub-parts and the overview) and one to `desc-source` (from the paste table).
- What the sections say: the three ways the card shows the Description (reading, one part open, Edit); the steps to add a part and the Keyword rule (one word, letters only, starting with a capital; the Keyword Assumption is kept); sub-parts (added under a part, or moved in with the arrow); the five buttons of Edit (up and down among the same level, in, out, remove with its sub-parts and when remove refuses, the grip to drag); assumptions and the assumption warning; the paste format (a seven-row table, an example and what it gives); sources.
- `DESCRIPTION_HELP_SECTIONS`: the `{ id, title }` list of the seven sections with the Solution titles.
- `PASTE_HELP_EXAMPLE`, `PASTE_HELP_EXAMPLE_FUNCTION`: the text of the paste example for each kind, as a string. Each is a valid paste: `previewPaste` of `description-parts-model` reads every line of it, with no line marked bad.

## What this is not

- Not the Description itself: it edits and saves nothing. The card that shows the parts is `description-parts-view`.
- Not a dialog: the host puts the panel in its own help dialog or page, and draws the button that opens it.
- Not the part rules: the Keyword rule and the assumption warning come from `description-parts-model`; the sentences about them here are the panel's own text.
- Not translated: the text is English.

## How to take it

Package: `@kaigilb/gilbplatformcode-description-help`

Take it together with its peers `description-parts-model` and `help-doc`, and their own peers (`base-record`, `id-tail`, `plan-card-facts` and `plan-links-model` for `description-parts-model`; `entity-ref`, `relation-role`, `type-curie` and `type-key` for `plan-links-model`). Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit):

```
install-links=true
```

Then install them:

```sh
npm install <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref <path-to-the-library>/units/relation-role <path-to-the-library>/units/base-record <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/help-doc <path-to-the-library>/units/description-help
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. With Tailwind v4, add the source to the scan: `@source "<path>/units/description-help/src";`.

## Examples

```tsx
import { DescriptionHelp } from "@kaigilb/gilbplatformcode-description-help";

// Inside your own help dialog. `tag` is the tag of the Solution or Function being edited.
<MyHelpDialog title="Writing the Description">
  <DescriptionHelp tag={record.tag ?? ""} kind={isFunction ? "Function" : "Solution"} />
</MyHelpDialog>;
```

## What the host must supply

- React 19 and the peers installed beside this one.
- Tailwind scanning this unit's `src` and the `src` of `help-doc`, so the classes are generated (the paste table uses `w-full`, `border-collapse`, `text-[15px]`, `border-b`, `py-2`, `pr-4`, `align-top`, `font-mono`).
- These CSS variables: `--line` (the paste table) and those of `help-doc` (`--ink`, `--ink-soft`, `--accent`, `--sel`, `--r-md`, `--r-sm`).
- A place for the panel to sit. It scrolls with the page of the host (`scrollIntoView`), so a dialog that has its own scroll area works as long as the section ids are unique in the document.
- No host object and no context.

## Do not

- Do not show two panels at once: the section ids (`desc-overview` and the rest) are fixed, so the contents buttons of the second panel scroll to the first.
- Do not pass the Keyword of a part as `tag`. It is the tag of the Solution or Function the parts hang from.
- Do not assume the examples change with the host's rules. The example texts are fixed strings; only the tag in them is the caller's.

## Wrong readings

- "`DESCRIPTION_HELP_SECTIONS` follows `kind`." It is built for `"Solution"` only; the panel builds its own list for the kind it is given. Use the panel's contents, not this constant, for a Function.
- "A blank tag falls back." Only `""` does. A tag of one space is printed as given.
- "The help prints the Keyword message." It does not: it says "The Keyword is one word: letters only, starting with a capital, e.g. Sync." in its own words, because printing `KEYWORD_MESSAGE` as well would give "Keyword: Keyword:".
- "The in-page links are anchors." They are buttons that call `scrollIntoView`; the panel has no `a` with a `#` address and changes no URL.
- "A Function panel has Function wording everywhere." The word "Solution" does not appear in a Function panel (a test pins this); the two kinds differ in wording and examples only, not in rules.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/help/DescriptionHelp.tsx` lines 1-282 (the whole file) to `src/DescriptionHelp.tsx`; the exports are the source's (`DescriptionHelp`, `DESCRIPTION_HELP_SECTIONS`, `PASTE_HELP_EXAMPLE`, `PASTE_HELP_EXAMPLE_FUNCTION`). The code is copied by script and changed only as listed. The file has no comments. Named changes:
  1. Line 1: `ASSUMPTION_WARNING` is imported from `description-parts-model` instead of `../../lib/base/planParts`.
  2. Line 2: the eight help components are imported from `help-doc` instead of `./HelpDoc` (`src/components/help/HelpDoc.tsx`, the whole file, which is that unit).
- `src/index.ts` is new: it re-exports the four exports.

Tests:

| Source | Ported / left out |
|---|---|
| `src/components/help/DescriptionHelp.test.tsx` (10 tests) | Ported to `src/DescriptionHelp.test.tsx`. Changes: the imports (`planParts` to `description-parts-model`, `./DescriptionHelp` to `./index`), and one assertion: `expect(regions[index]).toHaveAccessibleName(section.title)` (a matcher of `jest-dom`, which the unit does not need) is `expect(screen.getByRole("region", { name: section.title })).toBe(regions[index])`. |
| none | New: `src/descriptionHelp.sections.test.tsx` pins the text, the lists, the table, the notes and the examples of every section, the in-page links' targets, the `tag` fallback and the `kind` wording. `src/exports.test.ts` the exports, `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults. |
