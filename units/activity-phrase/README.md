# activity-phrase

One sentence from the language activities a person picked, and the four activities themselves.

The stored term and the words on the button are different. `t:WriteLanguage` is what you save. `Write` is what you show. This unit will not turn one into the other.

## What this is

`LANGUAGE_ACTIVITIES` is four rows, in this order:

| id | label |
|---|---|
| `t:SpeakOrSignLanguage` | Speak or sign |
| `t:UnderstandSpokenOrSignedLanguage` | Understand |
| `t:ReadLanguage` | Read |
| `t:WriteLanguage` | Write |

`activityPhrase` joins labels.

- Labels that are empty or only spaces are dropped.
- A label that is kept is not trimmed.
- One label is returned as it was. Its first letter is not lowered.
- Two or more: all but the last, joined with a comma and a space, then the word `and`, then the last label with only its first character lowercased.

`Speak or sign` and `Write` become `Speak or sign and write`.

## What this is not

- Not a language name. That is `language-name`.
- Not a search. The sheet that searches languages stays in the app.
- Not a claim writer. Which activity, level, and audience get stored is not decided here.
- Not a grammar engine. It does not know plurals. It lowercases one character.

## How to take it

Package: `@kaigilb/gilbplatformcode-activity-phrase`

```ts
import { LANGUAGE_ACTIVITIES, activityPhrase } from "@kaigilb/gilbplatformcode-activity-phrase";
```

Path: `units/activity-phrase/`.

## What you pass

The labels, in the order they should be spoken. Pass labels, not the `t:` ids. If you pass the ids, the sentence will contain the ids, and the first letter of the last id will be lowercased.

## What you get

A string. Empty input, or only blank labels, is `""`.

`XML` as the last label becomes `xML`, not `xml`. `Write` becomes `write`. A last label that starts with a space keeps the space, and the letter after it is not the character that is lowered.

Three labels use a comma between the first ones and `and` before the last. There is no comma before `and`.

## Examples

```ts
activityPhrase(["Speak or sign", "Write"]);
// "Speak or sign and write"

activityPhrase(["Read", "Write", "XML"]);
// "Read, Write and xML"

activityPhrase(["  Read  "]);
// "  Read  "

activityPhrase(["", "Write"]);
// "Write"
```

## What the host must supply

The labels the person selected, already in speak order. The four rows are here so a host does not invent a fifth activity or store the label as the term.

## Do not

- Do not add an activity to the list in the app and a different one here.
- Do not save `label` where the record wants `id`.
- Do not trim inside this function. A label with spaces is a label the caller chose to keep.
- Do not lowercase the whole last word. Only the first character.

## Wrong readings

- "One activity is lowercased too." A single label is returned untouched, so `Write` stays `Write`.
- "Blank labels become the word and." They are dropped. If nothing remains, the result is empty.
- "Understand is shortened." The label is the word Understand. The term is longer. The phrase uses the label.

## Where it came from

MyNetBase `src/components/profile/LanguagePickerSheet.tsx`, `LANGUAGE_ACTIVITIES` and `activityPhrase`.
