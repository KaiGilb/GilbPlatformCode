# secret-check

One check for whether a piece of text holds a secret, and one function that masks it.

## What this is

One check for whether a piece of text holds a secret, and one function that masks it.

`textHasSecret(text)` tells whether a piece of text holds a secret: an API key, a token, a password or other credential assignment, a private key block, or a long mixed run that looks like one. It returns `true` when the check would change the text.

`maskSecrets(text)` returns the text with each secret replaced by `[masked]`. `textHasSecret` is `maskSecrets` compared with the text, so the two cannot disagree.

`normalise(text)` is the step both start with: format characters are dropped and every horizontal space becomes a plain space. It is exported because the app's own text rules start with the same step.

## What this is not

- Not a proof that text is safe. `false` means this check found nothing, not that nothing is there. Known limits, kept on purpose: a password made only of ordinary words, and a plain number, are not found.
- Not a store, a query or a record writer. It reads a string and answers. It touches nothing.
- Not a rule about what to do next. Refuse, cut or mask is the host's choice. On a write path, refuse: a quiet cut stores something the writer did not mean.
- Not the app's "ordinary words only" rule (`decisionTextOrdinary`). That stays in the app.

## How to take it

Package: `@kaigilb/gilbplatformcode-secret-check`

```ts
import { maskSecrets, textHasSecret } from "@kaigilb/gilbplatformcode-secret-check";

if (textHasSecret(answer)) refuse();
```

Path: `units/secret-check/`. Pack it from a clone at a commit (`npm pack`) and keep the packed file in the host's repository.

The packed file carries compiled JavaScript and type declarations (`dist/`, built by `prepack`), so a Node back end that compiles with `tsc` and runs plain `node` can load it, and so can an app bundler. The `src/` folder is in the pack for reading.

## Examples

```ts
textHasSecret("password=hunter2");                 // true
textHasSecret("use sk-proj-abc123DEF456ghi789JKL012mno345"); // true
textHasSecret("Next: open the pull request.");     // false
maskSecrets("the key is sk-proj-abc123DEF456ghi789JKL012mno345 ok");
// "the key is [masked] ok"
```

## What the host must supply

Nothing. There is no option, host name, store or key. The host decides what a `true` costs.

## Do not

- Do not log, store or show the text that made the answer `true`. Name the field, never the value.
- Do not use `maskSecrets` on a write path to make a refused value acceptable.
- Do not add patterns here to fit one app. A new kind of secret is a change to this unit, with a known-answer test.

## Wrong readings

- "`false` means safe." It means this check found nothing.
- "`maskSecrets` makes any text safe to store." It masks what the patterns find. A secret of ordinary words stays.
- "An http(s) URL with a user name and password is covered." At 1.0.0 it is not: the test pins that gap. From 1.0.1 it is refused.

## Where it came from

GilbApp (`KaiGilb/GilbApp`), `src/lib/base/projectDecisions.ts`, at commit `602ebf2eeb4f0d1a377911b1425c8283d9596e94` on origin/main: the secret check (`maskSecrets`, `textHasSecret`) and every private helper and pattern they use, as they are. The app's own text rules, question saving and decision records were not copied. `normalise` is exported; in the source it was not a separate surface.
