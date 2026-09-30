# vault-purpose

Which type a person may assign when creating another vault, and which type is the sign-in seat.

The four buttons are shortcuts. They are not the list of every type that exists. The search that asks which types currently resolve stays in the app. This unit does not fetch.

## What this is

`READY_VAULT_PURPOSE_PICKS` is exactly these four:

| Button | Type that gets stored |
|---|---|
| Organization | Organization |
| Group | CollectiveAgent |
| Building | Building |
| Project | Project |

There is no Business button. Group does not store the type name Group.

`isSignInSeatType` is true for the seat a person must not assign.

`isChoosableVaultPurposeType` is true when `kind` is exactly `type` and the option is not the seat.

## What this is not

- Not the live type search. A short query must not fall back to these four. If the search is down, these four are still not a substitute answer. The app's own sentence says the catalogue could not be reached. Do not fill the gap from this list.
- Not a vault mint. Nothing is created here.
- Not `type-name` or `type-curie`. Those read a type address. This unit does not build one.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-purpose`

```ts
import {
  READY_VAULT_PURPOSE_PICKS,
  isChoosableVaultPurposeType,
  isSignInSeatType,
} from "@kaigilb/gilbplatformcode-vault-purpose";
```

Path: `units/vault-purpose/`.

## What you pass

For the seat test, `{ typeName, id }`.

- `typeName` is trimmed, lowercased, and one leading `a:` is removed. It is then compared to the word `signinpod`. A `t:` prefix is not removed, so `t:SignInPod` does not match on the name. `a:a:SignInPod` only loses the first `a:`, so the name does not match either.
- `id` is trimmed, lowercased, and searched for the letters `signinpod` anywhere. `https://…/base/t/SignInPod` matches even when the type name is Organization. `sign-in-pod` does not match, because of the hyphens. `notsigninpodx` does match. This is a substring, not a path segment. Do not tighten it.

For the chooser, also pass `kind`. The string must be exactly `type`. `Type` is false.

## What you get

The four shortcuts, as data. And two booleans.

A choosable option is one the person may assign. The seat is never choosable, even when its kind is `type`. A function or a value is not choosable, even when the name is Organization.

The button label and the stored type are allowed to differ. Group is the label. CollectiveAgent is the type. Do not write Group because the button says Group.

## What the host must supply

A type catalogue the host already loaded, if it is filtering search hits. The four shortcuts are not that catalogue. The host still has to confirm a shortcut against the live type before it writes, the same way the app does. This unit will not do that confirmation, because that confirmation fetches.

## Do not

- Do not offer the sign-in seat as a vault purpose. Uniqueness of the seat is stamped at registration, not chosen in this dialog.
- Do not add Business. Do not point Group at Group.
- Do not treat the four rows as "every vault kind".
- Do not lowercase a stored type name because the seat test lowercases for comparison. The comparison fold is not the spelling you write.

## Wrong readings

- "If the name is not SignInPod, it is safe." The id can still contain those letters.
- "kind Type is close enough." Only `type`.
- "The shortcuts are a valid empty-search result." They are buttons. An empty search returns nothing.

## Where it came from

GilbApp `src/lib/base/vaultPurposeType.ts`, `READY_VAULT_PURPOSE_PICKS`, `isSignInSeatType`, and `isChoosableVaultPurposeType`. `searchVaultPurposeTypes` and `resolveReadyVaultPurposeTypes` stay in the app.
