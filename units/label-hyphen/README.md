# label-hyphen

Turns one stored label into one lower-case hyphenated word. It is not a list of relation verbs.

## What this is

`normalizeLabel` trims the ends, lowers with `toLowerCase()` (not `toLocaleLowerCase()`), and turns each run of whitespace into one hyphen.

- `"  Depends On  "` becomes `"depends-on"`.
- A tab or a newline is whitespace, so `"a\tb\nc"` becomes `"a-b-c"`.
- Punctuation stays. `"Depends On!"` becomes `"depends-on!"`.
- A hyphen that was already there stays. `"a- b"` becomes `"a--b"`, because the space becomes a hyphen beside the one that was already written. Existing hyphens are not collapsed.
- A blank string stays `""`.
- `"I"` becomes `"i"` even on a machine whose locale would lower a capital i differently. That is `toLowerCase()`. `search-tokens` uses `toLocaleLowerCase()` and does follow the machine. Do not make these two agree.

## What this is not

- Not the catalogue of predicates, and not a decision that a relation is directed. The app holds a cold list of labels and a live catalogue. Neither is in this unit. Pass a label you already read. If you have no label, do not invent a verb here. Return nothing at the call site.
- Not a trim of internal punctuation.
- Not `search-tokens`, and not `labelFromSkillUri`. Those space camel-case and keep words apart. This joins words with hyphens.

## How to take it

Package: `@kaigilb/gilbplatformcode-label-hyphen`

```ts
import { normalizeLabel } from "@kaigilb/gilbplatformcode-label-hyphen";
```

Path: `units/label-hyphen/`.

## What you pass

The label string. One label. Not a type name, unless what you have is already the label text.

## What you get

One string. It can contain `--`. It can contain punctuation. It can be empty.

## Examples

```ts
normalizeLabel("  Depends On  "); // "depends-on"
normalizeLabel("already-hyphen"); // "already-hyphen"
normalizeLabel("a- b"); // "a--b"
normalizeLabel("Depends On!"); // "depends-on!"
normalizeLabel("   "); // ""
normalizeLabel("I"); // "i"
```

## What the host must supply

The label. The decision to show no verb when you have no label. The directed-or-not flag, from the catalogue, not from this string.

## Do not

- Do not collapse `--` to `-`. `"a- b"` is supposed to become `"a--b"`.
- Do not strip `!` or other punctuation.
- Do not switch this to `toLocaleLowerCase()`.
- Do not paste a table of verbs into this package. The table goes stale, and the live catalogue is the offer set.

## Wrong readings

- "The result is a safe HTML id or a URL slug." It is not. Punctuation and `--` remain. It is the display normalisation of a label, nothing else.
- "Whitespace in the middle is trimmed away." It becomes a hyphen. It is not deleted.
- "This knows which relations exist." It does not.

## Where it came from

GilbApp `normalizeLabel` in `src/lib/base/relationPredicates.ts`. The label table and the directed set in that file are not included.
