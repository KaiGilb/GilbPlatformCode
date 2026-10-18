# section-menu

The section menu: a header button that says where you are, and a large panel that opens at once on hover or tap, with the sections on the left and the hovered section's options on the right. One column on a phone. The host passes its sections as data.

It is meant to be the default menu of an app built on GilbPlatform when the person asking for the app describes no menu of their own; the rule that makes it so is still to be written (handoff 2026-10-18 §4, held for Kai's go). GilbApp's branch `kai/section-menu-shared-unit` takes it (not yet on GilbApp main). The website counterpart is `web-units/section-menu`.

## What this is

`<SectionMenu sections current api sizeClass layers ...>` draws:

- **a header button** with the current section's icon and name and a ▾. It opens the panel on pointer enter where the pointer can hover finely (a mouse), and on click or tap everywhere. A click right after a hover-open (within 600 ms) keeps it open; a later click closes it.
- **a dimmed edge** below the host's header. A click on it closes the menu.
- **the panel**, always in the page, so opening it is a class change and nothing more. While closed it is `inert` and `aria-hidden`. It is a modal dialog named "Go to".
  - Left: the sections. The one you are in is marked "You are here". Resting the pointer on another section for 120 ms, or focusing it, previews its options; a quick pass does not. Each opening starts from the section you are in.
  - Next: "In <section>", that section's options. A coming entry the owner named is drawn greyed out and does nothing, even when it has an address. An option with an address opens it in a new tab.
  - Right: "Also useful here" (places that fit the previewed section) and "For you". Without either, there are two columns.
  - Footer: a hint ("Press Esc to close" unless the host passes its own) and one act of the host's, such as Sign out.
- **four ways to close**: Close, Esc, the dimmed edge, or any choice. Focus goes back to the button.
- **keyboard**: on open, focus lands on the section you are in. Tab stays inside the panel and visits Close, then every section, each followed (when it is previewed) by its options and places, then "For you", then the footer act, and wraps. Up, Down, Home and End move between sections; Right goes into the options; Left comes back.
- **phone** (`sizeClass="compact"`): one column, no hover preview; the options are those of the section you are in. Medium is two columns.
- Reduced motion: the transitions switch off under `prefers-reduced-motion`.

Also in the unit:

- `menuList`: the list's shape (`MenuSection`, `MenuOption`, `MenuList`) and the helpers that read it: `visibleSections`, `menuOptionsOf`, `placesFor`, `forYouFor`, and `menuCommands` / `toCommand`, so a command palette reads the same list and the two cannot drift apart. Every entry may carry a gate (`show`); each helper (`visibleSections`, `menuOptionsOf`, `placesFor`, `forYouFor`, `menuCommands`) and the menu leave out an entry whose gate is closed for the gate the host passes, and one that has a gate when none is passed or the gate is undefined: one rule, so the menu and a palette agree.
- `createIntentChannel()`: "act once the destination is mounted". A menu choice that must do something in the section it goes to (open a dialog, focus a search) leaves an intent; a component there runs it once it is on screen, and once only (also under React's StrictMode). A window event fired in the same tick would reach nobody.
- `MenuIcon`: the line icon set, in `currentColor`.
- `Kbd`: a key name as drawn in the footer hint.

## What this is not

- Not the app's sections, router or acts. What a section is, where it goes and what an option does stay in the host, passed in as data (`sections`) and as `api`.
- Not a fetch. Nothing here reads a vault; opening it reads only what the host already holds.
- Not a second overlay system. It is a header menu; the side regions of a narrow window are `drawer`, and the frame is `app-shell`.

## How to take it

Package: `@kaigilb/gilbplatformcode-section-menu`

```tsx
import { SectionMenu, placesFor, visibleSections, type MenuSection } from "@kaigilb/gilbplatformcode-section-menu";
import { LAYER } from "@kaigilb/gilbplatformcode-overlay-layers";
import { useWindowSizeClass } from "@kaigilb/gilbplatformcode-size-class";

type Place = "notes" | "files";
interface Api { go(p: Place): void; newNote(): void; signOut(): void }

const SECTIONS: MenuSection<Place, Api>[] = [
  { id: "notes", icon: "records", label: "Notes", description: "Your notes.", go: (a) => a.go("notes"),
    options: [{ id: "notes.new", icon: "plus", label: "New note", description: "A blank note.", run: (a) => a.newNote() }] },
  { id: "files", icon: "files", label: "Files", description: "Documents.", go: (a) => a.go("files"), options: [] },
];

<SectionMenu
  sections={visibleSections(SECTIONS, gate)}
  current={place}
  api={api}
  sizeClass={useWindowSizeClass()}
  layers={{ scrim: LAYER.menuBackdrop, panel: LAYER.menu }}
  footerAction={{ label: "Sign out", icon: "signout", run: (a) => a.signOut() }}
/>;
```

Put it in the header. With `app-shell`, pass it in `ShellFrame`'s `header` slot and take `sizeClass` from `useShellCore()`.

It has no dependency but React. The window width and the paint order are passed in, so take them from `size-class` (or `app-shell`) and `overlay-layers`.

### Installing it into your app

Install it as a copy, not a link, so your app has one copy of React. First put this line in your app's own `.npmrc`:

```
install-links=true
```

Then install it:

```sh
npm install <path-to-the-library>/units/section-menu
```

An app that already takes sibling checkouts by link and a Vite alias (GilbApp takes `gilb-signin` that way) may take this unit the same way: a `file:` dependency, an alias to `src/index.ts`, `resolve.dedupe: ["react", "react-dom"]`, and `server.fs.allow` for the folder.

## What you pass

| Prop | Meaning |
|---|---|
| `sections` | the sections this person sees, in order (apply the gates with `visibleSections`); none: nothing is drawn |
| `gate` | optional: what the options' gates (`MenuOption.show`) read; without it (or undefined) an option that has a gate is left out |
| `current` | the id of the section the person is in; an unknown id reads as the first section |
| `api` | what `go` and `run` are called with; while it is undefined a choice only closes the menu |
| `sizeClass` | `"compact"`, `"medium"` or `"expanded"` |
| `layers` | `{ scrim, panel }` paint order; take `LAYER.menuBackdrop` and `LAYER.menu` from `overlay-layers` |
| `places` | optional: a section's "Also useful here", for example `(s) => placesFor(s, PLACES, gate)` |
| `forYou` | optional: "For you", already gated (`forYouFor`) |
| `sectionStatus` | optional: `(section) => { warning, busy }`: a warning line under a section and `aria-busy` |
| `onChoose` | optional: called on every choice, after the menu closes and before the act runs, with the section it goes to |
| `dismissed` | optional: true closes the menu at once without taking focus back (a command palette opened over it) |
| `footerHint`, `footerAction` | optional: the footer's text (wide windows) and its one act |
| `labels` | optional: every word the menu draws, the footer hint included (`DEFAULT_LABELS` is English) |
| `scrimTop`, `panelTop` | optional CSS lengths below the host's header; default `3.5rem` and `4rem` |
| `renderIcon` | optional: draws the host's own icons; default `MenuIcon` |
| `ref` | optional: `SectionMenuHandle` with `openAt(id?)` and `close()` |

## What you get

The button, the dimmed edge and the panel, side by side in the page. Test hooks: `data-testid` `section-menu-trigger`, `-trigger-label`, `-scrim`, `-panel` (with `data-open`), `-close`, `-sections`, `-here`, `-here-tag`, `-places`, `-foryou`, `-<section id>-warning`, and the footer act's `testId` (default `section-menu-footer-action`); `data-section`, `data-option`, `data-current`, `data-previewing` on the rows.

## Host must supply

- Tailwind, scanning this unit's `src` (Tailwind v4: `@source "<path>/units/section-menu/src";`), and the `editorial-tokens` sheet (`--surface`, `--paper`, `--paper-2`, `--ink`, `--ink-soft`, `--ink-faint`, `--ink-ghost`, `--line`, `--accent`, `--accent-ink`, `--on-accent`, `--focus`, `--sel`, `--bad`, `--shadow-lg`, `--r-md`, `--mono`). A host with other tokens maps them onto these variables.
- A bundler that compiles TSX with the automatic JSX runtime for packages too (Vite with `@vitejs/plugin-react`).
- A header about 56 px high, or `scrimTop` and `panelTop` for its own.

## Do not

- Do not list a destination that is not built (Rule_Code_gilb-app-nav-truth). `coming` is only for an entry the owner names as coming.
- Do not fire a window event for an act in the destination; leave an intent (`createIntentChannel`).
- Do not pick private paint-order numbers in a new app; use `overlay-layers`.

## Wrong readings

- The panel is in the page while closed. "Not in the page" is not how to test that it is closed: read `data-open`, `aria-hidden` or `inert`.
- On a phone a section row goes to the section; it does not preview it.
- `dismissed` does not keep the menu closed: when it turns false again the menu can open again.

## Source

GilbApp `src/components/menu/` at `0f0f1b7` (2026-10-18): `SectionMenu.tsx`, the generic part of `sectionMenuList.ts`, `shellIntent.ts` / `useShellIntent.ts` and `MenuIcon.tsx`. GilbApp keeps its sections, its acts, its URL parameters, `useShell()`, the Stakeholders warning and its header offsets, and takes this unit for the rest.
