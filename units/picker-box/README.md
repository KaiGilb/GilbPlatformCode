# picker-box

A search box with a list to pick one value from; only a picked match is ever handed on.

## What this is

A search box with a list to pick one value from; only a picked match is ever handed on.

One React component, `PickerBox({ label, placeholder?, current, search, onChoose, onCancel, onClear?, minChars?, debounceMs? })`.

The person types; after `debounceMs` the caller's `search(query, signal)` is asked (not below `minChars`: the box says "Keep typing…" and sends nothing); the matches are listed under the box; a tap, or Enter on the highlighted one (arrow keys move it), calls `onChoose(option)`. Escape and the Cancel button call `onCancel`. A thrown error from `onChoose` is shown and the box stays open. The latest search wins: an older, slower answer does not replace a newer one, and the older search is aborted. Clear is offered only when `current` is not empty and `onClear` is given.

What was typed is never handed on: only an option the person picked.

## What this is not

- Not a search: the caller supplies `search`.
- Not a form field that saves: it holds no value but the picked option, which it hands to `onChoose`.
- Not a combobox that accepts free text.

## How to take it

Package: `@kaigilb/gilbplatformcode-picker-box`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/picker-box` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/picker-box
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Nothing. What `onChoose` does is the caller's.

## Requests and their servers

None of its own. The caller's `search` may make requests.

## Examples

```tsx
import { PickerBox } from "@kaigilb/gilbplatformcode-picker-box";

<PickerBox
  label="Add a language"
  current=""
  search={async (q, signal) => (await find(q, { signal })).map((h) => ({ id: h.entity, label: h.label }))}
  minChars={2}
  debounceMs={140}
  onChoose={(o) => add(o.id)}
  onCancel={close}
/>
```

## What the host must supply

React 19; Tailwind scanning this unit's `src`; the CSS variables `--ink`, `--ink-faint`, `--line`, `--surface`, `--sel` and `--bad` (the colour of the text, quiet text, the border, the field, the highlighted match and an error).

## Module state

None.

## Do not

- Do not store what was typed: store `option.id` of a picked match.
- Do not pass a new `search` function on every render: the box searches again each time `search` changes (wrap it in `useCallback`).

## Wrong readings

- "Enter saves the text." Enter picks the highlighted match; with no match it does nothing.
- "`minChars` 1 means one letter is searched at once." The search waits `debounceMs`.

## Where it came from

Ported from the source (GilbApp, private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`): `src/components/mynet/PickerBox.tsx`, lines 13-191 (a new header comment in place of the source's). Compared with the comments and imports stripped: 0 differing lines.

## Tests

24 tests in 3 files (`npx vitest run`): `PickerBox.test.tsx` 10, all new (the source has no test of this component of its own), `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Mutation checks: 11 mutants of `src/PickerBox.tsx` (the minimum not applied, a stale answer accepted, the old search not aborted, Enter picking nothing, the highlight running past the list, Escape not cancelling, a second pick while choosing, a failed choice's message swallowed, Clear with nothing stored, no keep-typing line, a failed search silent), 11 killed.
