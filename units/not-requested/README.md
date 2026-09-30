# not-requested

One sentence. It says a list was never asked for, because no vault is selected.

It is not the sentence for a vault that answered and held nothing. Those two facts must not share words. "No rules were found" after a read is a different sentence, and this function will not produce it.

## What this is

```ts
noVaultNotRequestedSentence("rules");
// "No vault is selected, so no rules were requested. Nothing was invented."
```

The noun is inserted as you passed it. It is not translated, pluralised, or checked. `t:Rule` would be printed, which is wrong. Pass the plural noun the screen already shows ("rules", "procedures"), not a type name.

An empty string leaves a double space (`no  were requested`). Pass the noun.

## What this is not

- Not an emptiness test. Calling this does not mean the vault is empty. It means the app did not ask.
- Not a type lookup. There is no list of nouns inside.
- Not a substitute for an error sentence. A failed read is not "not requested".

## How to take it

Package: `@kaigilb/gilbplatformcode-not-requested`

```ts
import { noVaultNotRequestedSentence } from "@kaigilb/gilbplatformcode-not-requested";
```

Path: `units/not-requested/`.

## What the host must supply

The plural noun for that list, the same words the list heading uses. And the decision that no vault was selected. If a vault was selected, do not call this, even when the list is empty.

## Do not

- Do not reword the sentence at the call site. The point of one function is that every list says the same thing.
- Do not pass a type name, a field name, or a singular by accident. The function will not correct you.

## Wrong readings

- "Nothing was invented" means the vault has no records. It means this screen did not make any up to fill the gap.
- "I can use this whenever the list is empty." Only when the read was not issued.

## Where it came from

GilbApp `src/lib/base/standardsFamilies.ts`, `noVaultNotRequestedSentence`.
