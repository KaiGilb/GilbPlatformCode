# prefs-choice

Decides which theme and which language to show when the device and the saved row disagree, and whether the device's choice should be written back.

A saved row that only changed the language often still says theme `light`, with a new timestamp. That must not turn a dark device back to light.

## What this is

`pickNewerPrefs(local, vault)` → `{ prefs, source, shouldWriteVault }`.

`local` is the device cache, or `null` when there is none. `vault` is the saved row. Both use:

| Field | Meaning |
|---|---|
| `themeMode` | `light`, `dark`, `cvd`, or `custom` |
| `themeCustom` | The custom palette, or `null` |
| `preferredLang` | A language tag. Omit it when unset. Do not pass `""`. |
| `updatedAt` | Milliseconds. Omit it when unknown. It is read as 0. |

`source` is `"local"` or `"pod"`, and it follows the theme only. The language may have come from the other side.

## What this is not

- Not storage. It does not know a key, a vault, or a record id. The app's key stays in the app.
- Not a theme painter. You get the mode. You apply it.
- Not a clock you can inject. When the device contributed, `updatedAt` uses `Date.now()`.

## How to take it

Package: `@kaigilb/gilbplatformcode-prefs-choice`

```ts
import { pickNewerPrefs } from "@kaigilb/gilbplatformcode-prefs-choice";
```

Path: `units/prefs-choice/`.

## Theme

When the modes differ:

1. Device `dark`, `cvd`, or `custom` beats saved `light`, even if the saved row is newer.
2. Saved `dark`, `cvd`, or `custom` beats device `light`.
3. Otherwise the newer `updatedAt` wins. A tie (`>=`) goes to the device.

When the modes are the same, a strictly newer device timestamp takes the device palette. A missing palette falls back to the other side. A tie keeps the saved palette.

`light` is the default. It loses to any of the other three on the other side.

## Language

Whitespace-only is absent. The value that wins is trimmed.

Both present: newer timestamp, tie to the device. One present: that one. If the device's language is the one kept, `shouldWriteVault` is true.

The result omits `preferredLang` when neither side had one. It is not `""`.

## Write-back

`shouldWriteVault` is true when the theme came from the device, or the language came from the device, or the saved row has no `updatedAt` and the result is a non-default theme or a language.

`null` local returns the saved row, `source: "pod"`, `shouldWriteVault: false`. The saved object is returned as you passed it, not copied.

## Do not

- Do not let a single timestamp pick both fields. That is the bug. Language can be newer while the theme stays the device's dark.
- Do not treat `source: "local"` as "the language is also local".
- Do not write the result when `shouldWriteVault` is false. You would mint or patch a row that already matches.

## Wrong readings

- "Newer always wins." Newer wins only after the dark-versus-light rules. A newer light row does not beat device dark.
- "No `updatedAt` means the row is older, so ignore it." A missing stamp is 0. The dark-versus-light rules still run before the numbers.

## Where it came from

GilbApp `src/lib/base/uiPrefs.ts`, `pickNewerPrefs`. The storage key, the vault read, and the legacy note body were not copied.
