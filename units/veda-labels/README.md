# veda-labels

Reads the display labels of ontology terms and attributes, once per page, and offers them to a screen.

## What this is

Reads the display labels of ontology terms and attributes, once per page, and offers them to a screen.

A screen that shows a record's type or a field's name has a label of its own to fall back on (the registry's, or the field set's). This unit asks the platform origin for the term's own `a:label` and hands it to the screen to show instead, when the origin has one. It is an overlay, never a gate: a failed read gives no label, and the screen keeps its own.

- `fetchTermLabel(typeName)`: the label of a type term, or `null`. Takes `Person`, `t:Person` or a full address ending `/base/t/Person`; the bare name is what is asked.
- `fetchAttributeLabel(slug)`: the label of an attribute term, or `null`. Takes `status` or `a:status`.
- `prefetchVedaLabels({ types?, attrs? })`: asks for many at once; answers `{ types, attrs }`, two `Map`s from the name as given to its label. A term with no label is left out.
- `useVedaTypeLabel(typeUri)`: a React hook. `null` until the origin answers with a label, then the label. `typeUri` is a type address or a `t:` curie, as the vault served it. A `null`, empty or blank `typeUri` gives `null`.

Each term is asked once per page load. Callers asking at the same time share the one request. A definite answer is kept: a label, a document with no label, or a 4xx (the term has none to give). A failure to ask (a network error, a 5xx or other non-success answer, an answer that is not JSON) is not kept, so a later caller asks again.

## What this is not

- Not the labels a screen falls back on. Keep your own floor: `live ?? registry label ?? the type's tail`.
- Not the spelling of a term (which slug to write): that is `term-slots`, which reads the ontology master. This unit reads the label only, and from the platform origin (see "Requests and their servers").
- Not a writer. It only reads.
- Not a reset: the source has none, and neither has this unit (see "Module state").

## How to take it

Package: `@kaigilb/gilbplatformcode-veda-labels`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/veda-labels` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/veda-labels
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Examples

```tsx
import { useVedaTypeLabel, prefetchVedaLabels } from "@kaigilb/gilbplatformcode-veda-labels";

function TypeChip({ typeUri, floor }: { typeUri: string; floor: string }) {
  const live = useVedaTypeLabel(typeUri); // null until, and unless, the origin answers
  return <span>{live ?? floor}</span>;
}

const { types, attrs } = await prefetchVedaLabels({ types: ["t:Person"], attrs: ["status"] });
types.get("t:Person"); // "Person", or undefined when the origin has none
```

## What the host must supply

- `setBaseOrigin(...)` from `base-origin`, once at start-up. The addresses are built from it when a label is asked for. Asked before it is set, `fetchTermLabel` and `fetchAttributeLabel` reject with the error that names `setBaseOrigin` (and the hook's own request then ends as an unhandled rejection, since the source does not catch it).
- `setLwsAuth(...)` from `lws-session-bridge`, for a signed-in read. Without it, or if it cannot form a credential, the read goes out with only the `accept` header (a public read).

## Requests and their servers

One kind of request, a read:

| Request | To | Sent with | Answer used |
|---|---|---|---|
| `GET <platform origin>/base/t/<Name>` | the platform origin that `baseOrigin()` returns (the apex), not the ontology master | `authorization: Bearer ...` when `lws-session-bridge` forms one for that address; `accept: application/ld+json, application/json` | the term's `a:label` (or `label`, or `https://schema.org/name`), trimmed |
| `GET <platform origin>/base/a/<slug>` | the same | the same | the same |

Nothing is written.

The labels are an overlay. This unit asks the platform origin (as the app it was cut from does), where `term-slots` asks the ontology master. Whether the platform origin serves every term document is not known from here (nothing was run against a live server). A read that is refused, absent or fails gives no label, and the screen then shows the label its own field set or registry holds: that floor is the answer when the overlay is missing, by design.

## Module state

The unit holds four `Map`s in `vedaLabels.ts`, one copy per page. An app must have ONE copy of this unit, or each copy asks again.

- `typeCache`, `attrCache`: label by bare name. In the source, as here, they are written and read only by the module itself, as a fast path; no function exports a synchronous reader, so they change no answer.
- `typeAnswers`, `attrAnswers`: each term's one answer, or its request in flight, by bare name. A failed request is removed so a later caller asks again.

There is no reset (the source has none); the unit's tests load a fresh copy of the module for each case. The maps are keyed by the bare name only, not by origin: if the platform origin is changed after the first read, an answer already kept stays.

## Do not

- Do not use a label from here without a floor of your own: a `null` is normal.
- Do not call `fetchTermLabel` or `fetchAttributeLabel` before `setBaseOrigin`: they reject.
- Do not install a second copy of this unit.
- Do not use this to learn the spelling of a term to write: that is `term-slots`.

## Wrong readings

- "The hook clears its label when the type changes." It does not. If the new type has no label, the earlier label stays until a new one arrives. A screen that must not show it keeps its own state per type. This is the source's behaviour, pinned by a test.
- "A 5xx is kept as 'no label'." It is not: only a 4xx is. A 5xx, a network error or a non-JSON answer is asked again by the next caller.
- "`prefetchVedaLabels` keys by the bare name." It keys by the name as given (`t:Person` stays `t:Person`).
- "The label comes from the ontology master." It comes from the platform origin; `term-slots` is the one that reads the master.
- "The dynamic `import()` in the hook keeps the labels out of a first-paint bundle." In this package it loads a sibling file of the same package; whether your bundler splits it is yours to decide. The source used it for that purpose and it is kept as it was.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script, symbol by symbol:

- `src/lib/base/vedaLabels.ts` to `src/vedaLabels.ts`: lines 9-33, 35-40 and 42-94 (`typeCache`, `attrCache`, `typeAnswers`, `attrAnswers`, `authHeaders`, `pickLabel`, `fetchTermLabel`, `fetchAttributeLabel`, `onceForSession`, `prefetchVedaLabels`). Lines 34 and 41 are changed (named change 1); lines 1-8 (header comment and imports) are replaced.
- `src/lib/base/useVedaTypeLabel.ts` to `src/useVedaTypeLabel.ts`: lines 20-60 (`bareTermName`, `useVedaTypeLabel`). Lines 1-19 (the header comment) are replaced.

Named changes, and only these:

1. the three imports of `vedaLabels.ts` (`./config`, `./bearer`, `./termSlots`) are imports of `base-origin` (`baseOrigin`), `lws-session-bridge` (`bearerHeaderFor`) and `term-slots` (`termDocLabel`); the constant `BASE_ORIGIN` is read as `baseOrigin()` in the two request addresses, so it is read when the call is made, not when the module loads, and it throws, naming `setBaseOrigin`, when no origin is set (the app's constant was fixed at build). `bearerHeaderFor(url)` of `lws-session-bridge` is the app's `bearerHeaderFor(url)` with one added optional argument, not passed here;
2. comments that name a cycle, an agent, a rule file or a host app's screen are reworded in both files, and the header comment of `vedaLabels.ts` is shorter; no code changed.

With comments and imports removed, `useVedaTypeLabel.ts` is token-equal to the source (0 diff lines); `vedaLabels.ts` differs in the two lines of named change 1 and in no other.

`src/index.ts` is new. `test/support.ts` is new test support (a fake `fetch` and a fake auth host). Tests: none in the source; all new. `vedaLabels.test.ts` (32) covers the reads, the once-per-term rule, the Bearer, the failure cases and `prefetchVedaLabels`. `useVedaTypeLabel.test.tsx` (15) covers the hook. `exports.test.ts` (1) pins the export list. `hostAgnostic.test.ts` (13) is the same host-agnostic check test as the other units. 61 tests in all. Every test uses a fake `fetch`; none touches a network.
