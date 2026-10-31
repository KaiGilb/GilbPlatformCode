# employment-link

The two links of an employment to an organization record and to the person, written together or not at all.

## What this is

The two links of an employment to an organization record and to the person, written together or not at all.

One function, `employmentLinkFacts(vocab, { employer, employee })`.

An employment that names an organization RECORD carries `a:employer` (the organization) and `a:employee` (the person) beside its name. The function returns the two facts as references, under the spellings the master named (`vocab`, which `resolveEmploymentLinkVocab` of `org-terms` gives). It returns `{}` when neither address is given (a text-only employment). It throws when only one is given, when either is not an entity address (`<host>/base/e/<id>`, `<host>/vault/e/<id>` or `<host>/lws/r/<id>`, no trailing slash, no space), or when employer and employee end in the same id. Both addresses are trimmed first.

## What this is not

- Not the vocabulary: the spellings are asked by `org-terms`; this unit types none.
- Not a write: it builds facts and sends nothing.
- Not a rung or a claim: it never names a find key, a visibility tier or a claim subject.

## How to take it

Package: `@kaigilb/gilbplatformcode-employment-link`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/employment-link` prints:

```sh
npm install <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/org-terms <path-to-the-library>/units/employment-link
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

Nothing. It returns the two facts for `employment-store` to put in a create or a patch.

## Requests and their servers

None.

## Examples

```ts
import { employmentLinkFacts } from "@kaigilb/gilbplatformcode-employment-link";

const facts = employmentLinkFacts({ employer: "a:employer", employee: "a:employee" }, { employer: orgAddress, employee: personAddress });
```

## What the host must supply

Nothing.

## Module state

None.

## Do not

- Do not pass a guessed spelling; ask `org-terms`.
- Do not catch the throw and write the employer alone.

## Wrong readings

- "A name-only employment needs empty links." It needs none: the function returns `{}`.
- "The same record may be both." It is refused.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`) `src/lib/mynet/org/employmentLink.ts` lines 21-37; lines 14-19, the type, are in `org-terms`.

## Tests

24 tests in 4 files (`npx vitest run`): `employmentLink.test.ts` 7 (ported from `employmentLink.s8org.test.ts`, unchanged), `employmentLink.spellings.test.ts` 3, `exports.test.ts` 1, `hostAgnostic.test.ts` 13.

Mutation checks: 6 mutants of `src/employmentLink.ts` (one link alone written, employer may be the person, a typed key, the employer address not checked, no trim, a link written for nothing), 6 killed.
