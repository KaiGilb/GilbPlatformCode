# type-term-popover

Shows a GilbVeda type's name or picture as a button that opens a small popover with the type's definition and a link to its page in the ontology.

## What this is

Shows a GilbVeda type's name or picture as a button that opens a small popover with the type's definition and a link to its page in the ontology.

Two components, the reader of definitions they share, and the context the host gives that reader through.

- `TypeTermPopover({ typeName, label?, children, className?, triggerTestId?, popoverTestId?, ariaLabel?, onOpenOntology? })`: `children` is drawn inside a `<button type="button">` (`aria-haspopup="dialog"`, `aria-expanded`). A click (and so Enter or Space on the focused button) opens the popover and a second click closes it. The click does not reach a parent's click handler.
  - The popover is a `<span role="dialog" tabindex="-1">` labelled `<label or bare name> definition`, carrying the attribute `data-type-term-popover` (`TYPE_POPOVER_ATTR`) and the test id `popoverTestId` (default `type-term-popover`). It takes the focus when it opens. It is portalled with `createPortal` into `useModalPortalTarget()` of `open-popups` (the open dialog's root, else `document.body`), `position: fixed` at the trigger's left edge and 4 px under its bottom edge, with an inline `z-index` of `MODAL_LAYER_Z` (never a `z-[N]` class).
  - It says "Reading the definition…" until the answer; then the definition (`state: "defined"`), "This type has no definition." (`"none"`) or "The definition could not be reached." (`"unreachable"`).
  - A link "Open in GilbVeda ↗" (new tab, `rel="noopener noreferrer"`) to `<term origin>/base/t/<encodeURIComponent(bare name)>` shows only when the term was READ (defined or none). An unreachable read says nothing about the term, so it gets no link. While reading there is none.
  - A button "Open in Ontology" shows when the caller gives `onOpenOntology`, in every state; it calls it with the bare name.
  - The bare name is `typeName` with a leading `t:` removed, then trimmed. (Order matters: ` t:Thing` with a leading space keeps its `t:`.) With an empty bare name nothing is asked and the popover stays on "Reading the definition…".
  - Closing: Escape inside the popover closes it and hands the focus back to the trigger (the key does not reach a parent). A pointer press outside the popover and the trigger, or a scroll anywhere outside the popover (capture phase, so a scrolling list counts), closes it and leaves the focus where the person put it.
  - While open it is registered in the open stack of `open-popups` (`registerOpen`, `exclusive: true`; its element, `close` = close with the focus hand-back, `dismiss` = close without moving the focus). So `topOpen()` returns it, the layers that own Escape and Tab leave those keys to it, and opening another exclusive popover closes it.
- `TypePictureButton({ typeName, label, ariaLabel, px = 20, triggerTestId?, popoverTestId?, onOpenOntology? })`: the type's picture (from `type-picture`) as the button of a `TypeTermPopover`, with a 44 px hit area (`min-h-11 min-w-11`, `-my-3`) around an image of `px`. With no picture, and while the picture loads, it renders nothing at all; an image that fails to load removes the whole button. The image's `data-type-picture` is `typeName` as given.
- `TermDefinitionContext`, `ReadTermDefinition` (`(typeName: string) => Promise<TermDefinition>`): how the host gives the popover its reader.
- `typeDefinitionOnce(read, typeName)`: the once-per-session read. It calls `read(typeName)` once per name for each reader (a second card opened in the same session makes no second read) and hands every caller the same promise. Only an answer that was READ (`defined`, `none`) is held; an `unreachable` one is forgotten, so the next ask goes to the reader again. The name is the cache key as given (`t:Person` and `Person` are two names). One cache per reader function: a new reader is a new session.
- `TermDefinition`: `{ state: "defined"; does: string } | { state: "none" } | { state: "unreachable"; reason: string }`. `none` is a claim about the term and may only be made when the term was read; `unreachable` is a claim about the request and says nothing about the term.

## What this is not

- Not a definition reader: the host's `ReadTermDefinition` fetches (this unit makes no request of its own).
- Not the type description paragraph (`TypeDescription`) or the type's display name: only `typeDefinitionOnce` is here.
- Not a type picker: see `type-chooser`.
- Not the in-app ontology page: "Open in Ontology" only calls `onOpenOntology`; the link is the term's public page on the term origin.

## How to take it

Package: `@kaigilb/gilbplatformcode-type-term-popover`

Take it together with its peers `open-popups`, `term-origin` and `type-picture` (which itself needs `type-name`). Put this line in your app's own `.npmrc` so all are installed as copies and not links (one copy of React, one copy of each unit, and so one open stack, one term origin, one picture context):

```
install-links=true
```

Then install them:

```sh
npm install <path-to-the-library>/units/open-popups <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/type-term-popover
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 and `react-dom` are peers.

## Examples

```tsx
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { TermDefinitionContext, TypeTermPopover } from "@kaigilb/gilbplatformcode-type-term-popover";
import type { ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";

// Once, at start-up.
setTermOrigin("https://ontology.example.test");

// Once, above every popover. Never return null for "unreachable": say it.
const readTermDefinition: ReadTermDefinition = async (typeName) => {
  try {
    const res = await fetch(`https://ontology.example.test/base/t/${encodeURIComponent(typeName.replace(/^t:/, ""))}`, {
      headers: { accept: "application/ld+json, application/json" },
    });
    if (!res.ok) return { state: "unreachable", reason: `HTTP ${res.status}` };
    const doc = await res.json();
    return typeof doc.does === "string" && doc.does.trim() ? { state: "defined", does: doc.does.trim() } : { state: "none" };
  } catch (e) {
    return { state: "unreachable", reason: String(e) };
  }
};

<TermDefinitionContext.Provider value={readTermDefinition}>
  <App />
</TermDefinitionContext.Provider>;

// Anywhere below it.
<TypeTermPopover typeName="t:Person" onOpenOntology={(name) => console.log(name)}>
  Person
</TypeTermPopover>;
```

## What the host must supply

- The `TermDefinitionContext` provider, above every popover, with a `ReadTermDefinition`. With none, `TypeTermPopover` throws an error naming it (`type-term-popover: wrap the app in <TermDefinitionContext.Provider value={readTermDefinition}>`), as soon as it is rendered. The reader should answer all three states honestly. The popover always calls it with the bare name.
- The term origin, set once with `setTermOrigin` from `term-origin`; without it the link cannot be drawn and `termOrigin()` throws.
- For `TypePictureButton`, the picture source of `type-picture` (`TypePictureSourceContext`); with none no type has a picture and the button draws nothing.
- Tailwind scanning this unit's `src`, so its classes are generated (they include arbitrary values such as `rounded-[var(--r-md)]`, `text-[13px]`, `min-h-11`, `w-64`).
- These CSS variables: `--r-md`, `--line`, `--surface`, `--ink`, `--accent`.
- React 19 and `react-dom`.

## Do not

- Do not provide a reader that returns `none` for a failed request: `none` says the term has no definition, and the popover will show "This type has no definition." and a link. A failed read is `unreachable`.
- Do not make a new reader function on every render: the held answers are kept per reader function, so a new function asks again every time. Make it once.
- Do not install a second copy of this unit or of `open-popups`: a second copy of `open-popups` has its own stack, so Escape and Tab no longer go to the top-most popover.

## Wrong readings

- "`typeDefinitionOnce` skips the cache when there is no session." The source did (it read every time when no query client was in context). Here the reader is always provided (a missing provider throws), so every read is cached per reader.
- "The `t:` prefix is always removed." Only at the very start of the text: ` t:Thing` (leading space) keeps it, and then the name is `t:Thing`.
- "An unreachable answer is remembered." It is not: closing and reopening on a fresh popover asks again. (The same popover keeps the answer it already holds in its own state until it is unmounted.)
- "The link shows while reading." It does not; it appears with a `defined` or `none` answer.
- "A press inside the trigger closes the popover." It does not; the click toggles it.
- "`TypePictureButton` draws a stand-in." With no picture it draws nothing; there is no stand-in glyph.
- "`onOpenOntology` closes the popover." It only calls the function.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/TypeTermPopover.tsx` lines 20-167 (`TYPE_POPOVER_ATTR`, `TypeTermPopover`) to `src/TypeTermPopover.tsx`; the header comment and the imports (lines 1-19) are the unit's own. Comments made generic. Named changes:
  1. `useContext(QueryClientContext)` (line 50) is `useContext(TermDefinitionContext)`, and a missing provider throws; `typeDefinitionOnce(session, bare)` is `typeDefinitionOnce(read, bare)` and the effect's dependency `session` is `read`.
  2. The link `defaultTermIri(bare)` (line 144) is `` `${termOrigin()}/base/t/${encodeURIComponent(bare)}` ``: the body of `defaultTermIri` (`src/lib/base/ontologyBrowse.ts` line 1644, `` `https://${host}/base/t/${encodeURIComponent(name)}` `` with `host` defaulting to the GilbVeda host) with `https://${host}` replaced by the term origin. The `ontology-ref` unit's `ontologyRefIri` is NOT the same function (it also trims, passes `http(s)://` through, reads CURIEs and picks the `e` plane for store ids), so it is not used.
  3. `MODAL_LAYER_Z`, `useModalPortalTarget` (`../ui/layers`) and `registerOpen` (`../ui/openStack`) come from `@kaigilb/gilbplatformcode-open-popups`.
  4. `onOpenOntology` was already a prop in the source (not read from the shell); no change.
- `src/components/records/TypeDescription.tsx` lines 33-34 and 37-47 (`typeDefinitionOnce`; the rest of the file is not taken) to `src/termDefinition.ts`. Named changes: the `WeakMap` key is the reader function (`WeakMap<ReadTermDefinition, ...>`) and the first parameter is `read: ReadTermDefinition` instead of `session: object | undefined`; the call is `read(typeName)`; the two lines `const read = () => import(...)...` (line 35, the lazy import of `readTermDefinition`) and `if (!session) return read();` (line 36, a read that is never held when there is no query client) are removed, since the reader is always provided. New in that file: `ReadTermDefinition` and `TermDefinitionContext`.
- `src/lib/base/termDefinition.ts` lines 51-64 (the `TermDefinition` type with its comment) to `src/types.ts`. Verbatim. `readTermDefinition` itself (the fetch) is not taken.
- `src/components/records/TypePicture.tsx` lines 39-86 (`TypePictureButton`) to `src/TypePictureButton.tsx`. Verbatim; `useTypePicture` comes from `@kaigilb/gilbplatformcode-type-picture` and `TypeTermPopover` from `./TypeTermPopover`.
- `src/index.ts` is new.

Tests:

| Source | Ported / left out |
|---|---|
| `src/components/records/TypeTermPopover.vaultit.test.tsx`, `describe("TypeTermPopover")` (3 cases: the definition and the new-tab link, an unreachable term gets no link, Escape closes and returns the focus) | Ported to `src/TypeTermPopover.test.tsx` with the same inputs and expectations. `readTermDefinition` was mocked with `vi.mock`; here the reader is passed through `TermDefinitionContext`. The expected link `https://veda.gilb.com/base/t/Person` is `https://ontology.example.test/base/t/Person`, with `setTermOrigin("https://ontology.example.test")` in the setup. |
| Same file, `describe("TypeChooser t: link")` (1 case) | Left out here: it renders the type chooser, so it is ported with the `type-chooser` unit. |
| Everything else in `src/TypeTermPopover.test.tsx`, `src/TypePictureButton.test.tsx` and `src/termDefinition.test.ts` | New: they pin the behaviour in "What this is" (opening by click, Enter and Space; closing by Escape, press and scroll; the open stack; the portal target; the inline z-index; the three states; the link and its encoding; the `t:` rule; the missing provider; the picture button) and `typeDefinitionOnce` (once per name per reader). `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults. |
