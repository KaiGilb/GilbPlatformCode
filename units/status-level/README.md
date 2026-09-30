# status-level

Suggested, Approved, and Deprecated. The colour, the default selection, and which rows stay listed.

## What this is

- `STATUS_SEED` — the three levels used when the store has not answered.
- `SEED_STATUS_VALUES` — `Suggested`, `Approved`, `Deprecated`, in that order.
- `bindableValues` — every level that admits new binding.
- `statusTone` — the CSS variable for a status, or `null` for ordinary ink.
- `keepLifecycleStatus` — whether one row stays visible.
- `describeLifecycle` — the sentence next to that cut.
- `reconcileLifecycleSelection` — rewrite a selection when the live list arrives.

## What this is not

- Not the vocabulary request. The app fetches the live levels. This unit does not.
- Not the column cut itself. Register a filter with `units/column-narrowing` and call `keepLifecycleStatus` from that filter's `keep`.
- Not a fourth level. The seed has three values. A word the seed does not know is not given a colour and is not hidden.
- Not a place to write the word the app was told to stop using for Deprecated. The Deprecated help does not contain it. Do not put it back.

## How to take it

Package: `@kaigilb/gilbplatformcode-status-level`

```ts
import {
  STATUS_SEED,
  SEED_STATUS_VALUES,
  bindableValues,
  statusTone,
  keepLifecycleStatus,
  describeLifecycle,
  reconcileLifecycleSelection,
} from "@kaigilb/gilbplatformcode-status-level";
```

Path: `units/status-level/`.

## What you pass

A level is `{ value, label, admitsNewBinding, tone?, help? }`.

`statusTone(status, levels?)`. Omit `levels` to use the seed. Pass `[]` only when you mean an empty vocabulary. An empty list is not the seed. Every status is then `null`.

`keepLifecycleStatus(status, selected, knownValues)`.

- `status` is the row's status. It is trimmed.
- `selected` is what the person picked. Those strings are not trimmed.
- `knownValues` is the live list, or the seed. Pass `SEED_STATUS_VALUES` until the store answers. Do not pass `[]` to mean "use the seed". An empty known list recognises nothing, so every row is shown.

`describeLifecycle(selected, knownValues)`. `selected` is printed as given. `knownValues` supplies the hidden names, in that order.

`reconcileLifecycleSelection(state, levels, seedValues?, filterId?)`.

- `state` is a record of filter id to a list of strings.
- `levels` is the live list.
- `seedValues` defaults to the seed. This is the list of values the app already knew. Do not pass the live list here. If you do, nothing counts as new, and a new level is not added.
- `filterId` defaults to `lifecycle`.

## What you get

### Colour

| Status | Result |
|---|---|
| `Suggested`, any case, surrounding spaces ignored | `var(--ok)` |
| `Approved`, any case | `null`. Approved is known and chooses no colour. |
| `Deprecated`, any case | `var(--bad)` |
| blank, `null`, or a word the list does not have | `null` |
| a level whose `tone` is `""` | `null`. A blank tone is ordinary ink. |

The match is case-insensitive. The level's `value` is not trimmed. A value of `Suggested ` with a trailing space does not match `Suggested`.

### Binding

`bindableValues` keeps each level with `admitsNewBinding: true`, in the order given. It does not unique them and it does not change case. On the seed that is `Suggested` then `Approved`. Deprecated is not included. That pair is the default selection for a lifecycle filter. It is derived from the flags. Do not type the two names by hand and then drift from the flags.

### Whether a row stays

1. Blank or whitespace status: shown.
2. A status that is not in `knownValues`, compared case-insensitively: shown.
3. Otherwise shown only when `selected` contains it, case-insensitively.

A selection of ` deprecated ` does not match a row status of `Deprecated`, because the selection is not trimmed and the row is.

An unrecognised word stays shown even when the person has deselected every known level. Hiding it would be a guess.

### The sentence

- Nothing hidden: `Lifecycle: showing every standing (<selected>).` It does not mention unrecorded standing.
- One hidden: `… is hidden. Terms with no recorded standing are still listed.`
- More than one: `are hidden`, same ending.
- An empty selection prints the word `none`, not an empty pair of parentheses.
- Hidden names stay in `knownValues` order. There is no Oxford comma. The selected spellings are printed as given, not rewritten to the known spelling.

### Folding the live list into the selection

- A missing key means the filter is off. The same state object is returned. This function does not switch the filter on.
- An empty list is not a missing key. Levels the seed has not heard of are appended to it.
- A spelling is rewritten to the live level's `value`. The first live level that matches case-insensitively wins. A selection the live list does not know is kept as written. Nothing is removed.
- A live value that is not in `seedValues` (case-insensitive), and not already in the rewritten selection, is appended. This is why a level the seed has never heard of stays shown. The function does not read `admitsNewBinding` for that decision.
- When the rewritten list is byte-for-byte the same, the same state object is returned. Other keys are copied only when the list changes.

## Examples

```ts
statusTone(" Suggested "); // "var(--ok)"
statusTone("Approved"); // null
statusTone("Retired"); // null

bindableValues(STATUS_SEED); // ["Suggested", "Approved"]

keepLifecycleStatus("Deprecated", ["Suggested", "Approved"], SEED_STATUS_VALUES); // false
keepLifecycleStatus("", ["Deprecated"], SEED_STATUS_VALUES); // true
keepLifecycleStatus("Retired", [], SEED_STATUS_VALUES); // true

describeLifecycle(["Suggested", "Approved"], SEED_STATUS_VALUES);
// "Lifecycle: showing Suggested, Approved. Deprecated is hidden. Terms with no recorded standing are still listed."

const state = { lifecycle: ["suggested"] };
reconcileLifecycleSelection(state, STATUS_SEED).lifecycle; // ["Suggested"]

const off = { other: ["x"] };
reconcileLifecycleSelection(off, STATUS_SEED) === off; // true
```

## What the host must supply

The live levels, once the store has answered. Until then, pass the seed. The CSS variables `--ok` and `--bad` are the host's. This unit only returns the `var(--…)` string.

Wire `keepLifecycleStatus` and `describeLifecycle` into a filter whose id is `lifecycle`, offered only where a cut can succeed. Call `reconcileLifecycleSelection` once, when the live list arrives, before the next cut. If you cut against the live list and you skip the reconcile, a level the seed did not know flips from shown to hidden.

## Do not

- Do not colour an unknown status. `null` means ordinary ink.
- Do not treat Approved's missing tone as "unrecognised". It is a known level with no colour.
- Do not hide a blank status. Placeholder rows carry one.
- Do not hide an unrecognised status.
- Do not trim the selection inside `keepLifecycleStatus`. Trim before you store it, if you trim at all.
- Do not pass the live values as `seedValues`. New levels would not be appended.
- Do not remove a person's own choice inside reconcile. The function does not, and a wrapper must not.
- Do not switch the filter on when the key is missing.

## Wrong readings

- "No colour means the status is unknown." Approved has no colour and is known.
- "The default is the two names Suggested and Approved, written out." The default is every level whose flag admits binding. On this seed that happens to be those two.
- "An empty selection and a missing key are the same." A missing key is off and is left alone. An empty list is present, and unknown live levels are appended to it.
- "Reconcile drops Deprecated if the person had not picked it." It never drops. Hiding is `keepLifecycleStatus`.

## Where it came from

GilbApp `src/lib/base/ontologyStatusVocab.ts` (`STATUS_SEED`, `bindableValues`, `statusTone`) and `src/lib/base/ontologyNarrowing.ts` (`keep` and `describe` of the lifecycle filter, and `reconcileLifecycleSelection`). The fetch of the live vocabulary is not in this unit.
