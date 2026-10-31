# flag-chooser

The choice of a flag for one language: the countries the language's entry names, or no flag.

## What this is

The choice of a flag for one language: the countries the language's entry names, or no flag.

One React component, `FlagChooser({ languageName, info, current, onPick, onClose, renderCountrySearch? })`.

- The few: the countries the language's catalogue entry names (`info.countries`) when there are one to twelve (`flagChoices`), each a button with its flag and its name; the one in `current` is marked pressed. A pick hands the country (an address) to `onPick`.
- "No flag (globe)" hands `null` to `onPick`; Cancel calls `onClose`.
- A name is the flag file's ISO code in the reader's language, else the country's local id. The country entity is never read (it holds a polygon and is 0.5 to 3.1 MB); only the small flag file is.
- **The country search is a slot.** `renderCountrySearch({ onPick })` is the host's search over all countries. It is shown at once when the entry has read and names none (or more than twelve), and otherwise behind an "Another country…" button; its `onPick(country)` is the chooser's pick. **Absent, there is no "Another country…" button and no search**: the short list and "No flag (globe)" stay.

## What this is not

- Not a country search: the host supplies one through `renderCountrySearch`, or there is none.
- Not a writer: `onPick` is the caller's, and saves the flag with the language.
- Not the languages section.

## How to take it

Package: `@kaigilb/gilbplatformcode-flag-chooser`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/flag-chooser` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/flag-choice <path-to-the-library>/units/language-fetch-pool <path-to-the-library>/units/flag-source <path-to-the-library>/units/flag-image <path-to-the-library>/units/language-entry <path-to-the-library>/units/flag-chooser
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Nothing.

## Requests and their servers

None of its own. `flag-image` reads the flag file of each listed country (see `flag-source`), never the country entity.

## Examples

```tsx
import { FlagChooser } from "@kaigilb/gilbplatformcode-flag-chooser";

<FlagChooser
  languageName="Swedish"
  info={info}
  current={flag}
  onPick={saveFlag}
  onClose={close}
  renderCountrySearch={({ onPick }) => <CountrySearch onPick={onPick} />}
/>
```

## What the host must supply

React 19; Tailwind scanning this unit's `src` and the flag image's; the CSS variables `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--surface` and `--sel`. Optionally `renderCountrySearch`.

## Module state

None of its own (the flags are kept by `flag-source`).

## Do not

- Do not read a country entity to name a country.
- Do not draw a stand-in search when you have none: pass nothing, and the chooser offers the short list and "No flag" only.

## Wrong readings

- "A language in more than twelve countries can be given any flag." Without `renderCountrySearch` it can only be given no flag (the globe).
- "`renderCountrySearch` is mounted at once." With a short list it is mounted when "Another country…" is pressed.

## Where it came from

Ported from the source (GilbApp, private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`): `src/components/mynet/FlagChooser.tsx`, lines 3-101. Compared by symbol with the comments stripped: `useCountryName` and `CandidateRow` 0 differing lines; `FlagChooser` differs in 11 lines, all the one named change below.

## Tests

27 tests in 3 files (`npx vitest run`): `FlagChooser.test.tsx` 13, all new (the source has no test of the chooser alone, and none reaches its country search): the short list, the names, the pressed flag, "No flag" and Cancel, the slot absent (no button, no search, for one to two countries, none, more than twelve, and an unread entry) and present (the button first, the search on request, its pick, at once for none or more than twelve, the button for an unread entry), and what is read. `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Mutation checks: 10 mutants of `src/FlagChooser.tsx` (the button drawn with no slot, the slot's pick ignored, the search never at once, the search while the entry is read, "No flag" with an empty country, the search before it is asked for, a country named by its whole address, the current flag not marked, only the first country, Cancel doing nothing), 10 killed.
