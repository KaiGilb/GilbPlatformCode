# prefs-signature

The wire signature of one preference payload. The same facts match. Key order does not.

## What this is

`prefsWireSignature(payload)` returns one string. If two payloads return the same string, writing the second one changes nothing. Do not send it.

## What this is not

- Not `prefs-choice`. That unit decides which of two payloads wins when they disagree. This unit only detects a no-op.
- Not `prefs-row`. That unit finds the preference record. This unit does not.
- Not a validator. `themeMode` is copied as you passed it. `light`, `dark`, `cvd`, and `custom` are the app's modes. A different word still gets a signature.
- Not the write. Comparing signatures is how the app avoids a second save. The save stays in the app.

## How to take it

Package: `@kaigilb/gilbplatformcode-prefs-signature`

```ts
import { prefsWireSignature } from "@kaigilb/gilbplatformcode-prefs-signature";

if (prefsWireSignature(next) === prefsWireSignature(alreadyWritten)) return;
```

## What you pass

`themeMode` — the mode string.

`themeCustom` — null when there is no custom palette. Otherwise `base` and `vars`. `vars` values that are not strings are dropped. Missing `base` becomes null.

`preferredLang` — optional. Trimmed. Missing or blank becomes an empty string in the signature.

`updatedAt` — optional milliseconds. Missing becomes `0`. `0` stays `0`.

A version number on your wider payload is not read. Do not expect it to change the signature.

## What you get

`JSON.stringify` of an object with these keys, in this order: `mode`, `base`, `vars`, `lang`, `ts`.

When `themeCustom` is null, `base` is null and `vars` is null.

When `themeCustom` is present, `vars` is an object. Its keys are sorted with the ordinary string sort (`Array.prototype.sort`), not a dictionary sort and not a locale sort. Uppercase sorts before lowercase. An empty palette is `{}`, not null.

`lang` is the trimmed language, or `""`.

`ts` is `updatedAt`, or `0`.

## Examples

```ts
prefsWireSignature({ themeMode: "light", themeCustom: null, updatedAt: 5 });
// {"mode":"light","base":null,"vars":null,"lang":"","ts":5}

prefsWireSignature({
  themeMode: "custom",
  themeCustom: { base: "dark", vars: { "--ink": "#222", "--accent": "#111" } },
  preferredLang: "  no  ",
  updatedAt: 0,
});
// vars keys come out "--accent" then "--ink". lang is "no". ts is 0.
```

The same colours with a different `updatedAt` are a different signature. That is intentional. A person's action stamps a new time.

## The host must supply

The payload, including the timestamp of the action. This unit does not read the clock and does not read storage.

## Do not

- Do not delete `ts` from the comparison so that a repeat of the same colours collapses. A new action is a new signature even when the colours match.
- Do not sort the keys yourself with `localeCompare` and expect the same string. The sort is the default UTF-16 sort.
- Do not treat a present empty `vars` object as "no custom theme." Null theme and empty vars are different signatures.
- Do not use this as the merge. Two different signatures still need `prefs-choice` to decide which one wins.

## Wrong readings

- "Missing time and time 0 are different." No. Both sign as `0`.
- "Language spaces matter." No. They are trimmed. `"  no  "` signs as `no`. A missing language signs as `""`.
- "A number stored in a colour variable is kept." No. Only strings are kept.

## Where it was taken from

GilbApp `src/hooks/useTheme.ts`, `prefsWireSignature`. The payload shape is the one in `src/lib/base/uiPrefs.ts`. The hook that writes the vault stays in the app.
