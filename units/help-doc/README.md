# help-doc

The building blocks of an in-app help page: a layout with a contents list, sections, steps, lists, examples, keys, notes and in-page links.

## What this is

The building blocks of an in-app help page: a layout with a contents list, sections, steps, lists, examples, keys, notes and in-page links.

Eight small React components that a help page is made of. They hold no state and read no data; they draw what they are given.

- `HelpLayout({ contents, children })`: the page frame. A `nav` named "Contents" (`aria-label="Contents"`) with the word "Contents" and one button per entry of `contents` (`{ id, title }[]`), in order; beside it (below it on a narrow screen) the children, in a column no wider than 72 characters. Pressing an entry scrolls the element with that `id` to the top, smoothly: `document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" })`. An id that is not in the page does nothing.
- `HelpSection({ id, title, children })`: a `section` with that `id`, `aria-labelledby` its heading, and an `h2` (id = `id` plus `-h`) with the title. The section is `scroll-mt-4`, so it stops a little below the top when scrolled to.
- `HelpLink({ to, children })`: a button that scrolls the element with id `to` into view the same way as a contents entry.
- `HelpExample({ label, text })`: a `figure` with the label as its `figcaption` and the text in a `pre` that keeps line breaks (`whitespace-pre-wrap`).
- `HelpSteps({ children })`: a numbered list (`ol`). `HelpList({ children })`: a bulleted list (`ul`). The children are the `li` items.
- `HelpNote({ children })`: a call-out, a `div` with `role="note"` and a bar on its left.
- `HelpKeys({ children })`: a key name in a `kbd`, in the mono face.

## What this is not

- Not a help page: no text, no sections of its own. The page is written by the host or by a unit such as `description-help`.
- Not a dialog or a help button; the host draws the panel these sit in.
- Not a router: the links scroll inside the current page and change no address.
- Not a theme: it names colours and radii by CSS variable and sizes by Tailwind class; it defines none.

## How to take it

Package: `@kaigilb/gilbplatformcode-help-doc`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/help-doc
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/help-doc/src";`.

## Examples

```tsx
import { HelpLayout, HelpSection, HelpLink, HelpSteps, HelpList, HelpExample, HelpNote, HelpKeys } from "@kaigilb/gilbplatformcode-help-doc";

const sections = [
  { id: "start", title: "Getting started" },
  { id: "keys", title: "Keys" },
];

<HelpLayout contents={sections}>
  <HelpSection id="start" title="Getting started">
    <HelpSteps>
      <li>Press Edit.</li>
      <li>
        Press <HelpKeys>Enter</HelpKeys> to save.
      </li>
    </HelpSteps>
    <HelpExample label="Example: you type" text={"Name:  Ada\nRole:  Author"} />
    <HelpNote>Nothing is saved until you press Enter.</HelpNote>
    <HelpLink to="keys">See the keys</HelpLink>
  </HelpSection>
  <HelpSection id="keys" title="Keys">
    <HelpList>
      <li>
        <HelpKeys>Esc</HelpKeys> closes the panel.
      </li>
    </HelpList>
  </HelpSection>
</HelpLayout>;
```

## What the host must supply

- React 19.
- Tailwind, scanning this unit's `src`, so its classes are generated: `flex`, `flex-col`, `md:flex-row`, `md:gap-10`, `md:w-56`, `md:shrink-0`, `md:sticky`, `md:top-0`, `md:self-start`, `min-w-0`, `flex-1`, `max-w-[72ch]`, `min-h-11`, `scroll-mt-4`, `text-[12px]`, `text-[13px]`, `text-[14px]`, `text-[15px]`, `text-[16px]`, `text-[20px]`, `uppercase`, `tracking-wide`, `list-decimal`, `list-disc`, `whitespace-pre-wrap`, `border-l-4`, and the rest the source names.
- These CSS variables: `--ink`, `--ink-soft`, `--accent`, `--line`, `--sel`, `--r-md`, `--r-sm`.
- Nothing else: no context, no provider, no host object. The scrolling uses the page's `document` and `Element.scrollIntoView`.

## Do not

- Do not give two elements on one page the same `id`: the contents and `HelpLink` scroll to the first match. Two help pages on one screen need ids of their own.
- Do not put a `HelpSection` outside a `HelpLayout` and expect a contents list; the contents come only from the `contents` prop of `HelpLayout`.
- Do not render the same section id with a different title in `contents` and in `HelpSection` and expect them to agree; the unit does not check.

## Wrong readings

- "A link to a missing section shows an error." It does nothing: the lookup is `?.scrollIntoView`.
- "`HelpLayout` makes the sections." It draws the contents and the children; each `HelpSection` is the caller's.
- "`HelpSection`'s heading id is the section id." It is the section id plus `-h`; the section itself carries the id the contents scroll to.
- "`HelpNote` is an alert." It is `role="note"`, not `alert` or `status`; a screen reader does not announce it when it appears.
- "The scroll is instant." It is `behavior: "smooth"`; a test that checks the position at once must stub `scrollIntoView` (jsdom has none).

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`: `src/components/help/HelpDoc.tsx` lines 1-85 (the whole file) to `src/HelpDoc.tsx`. The code is the source's, copied by script, with no change; the file has no comments.

`src/index.ts` is new: it re-exports the eight components the source exports. The tests are new: GilbApp has no test of `HelpDoc.tsx` alone (its components are drawn only inside the Description help panel, whose test is part of the `description-help` unit). `src/helpDoc.test.tsx` renders each component and pins its DOM, and the scroll calls with a stubbed `Element.prototype.scrollIntoView`; `src/exports.test.ts` pins the exports; `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.
