# tag-carrier

Which tag a record holds, and which field held it.

A record can hold the same idea under two field names: `unitTag` and `ruleId`. A display that looks at only one of them will say the record has no tag while the other field still has one. That is a false claim. This unit is the read that prevents it.

## What this is

| Function | You pass | You get |
|---|---|---|
| `resolveUnitTagCarriers` | The record's facts, or null. | One entry per field that holds text, `unitTag` first. |
| `resolveUnitTag` | The same. | The first entry, or null. |
| `TAG_CARRIER_SLUGS_IN_PRECEDENCE` | Nothing. | `["unitTag", "ruleId"]`. |
| `TAG_CARRIERS_DISPLAY` | Nothing. | The exact words `a:unitTag or a:ruleId`. |

Each entry is `{ tag, carrier }`. `tag` is trimmed. `carrier` is the bare slug, never `a:unitTag`.

## What this is not

- Not the tag on a condition. That is `condition-tag`. A condition also has a bare `tag` that counts only when the condition is manual, and it does not look at `ruleId`.
- Not the pill at the start of a sentence. That is `instruction-prefix` and `step-instruction`. Those read the sentence. This unit reads the stored fields.
- Not a writer. It does not choose which field a save should use. A save still writes one field.
- Not a merge. Two fields with the same text are still two entries. Do not keep only one and throw the other away.

## How to take it

Package: `@kaigilb/gilbplatformcode-tag-carrier`

```ts
import { resolveUnitTag, resolveUnitTagCarriers } from "@kaigilb/gilbplatformcode-tag-carrier";
```

Path: `units/tag-carrier/`.

## What you pass

A facts object keyed the way the app already holds the record. Both spellings of each field are read: `unitTag` and `a:unitTag`, then `ruleId` and `a:ruleId`.

Inside one field, the bare spelling wins when it has text. An empty string does not hide the `a:` spelling. That is the opposite of `stored-field`, where an empty camelCase value blocks the other spelling. Do not "correct" this one to match that one.

A value that is not a string is skipped. Whitespace only is skipped. A key named `tag` is ignored.

Null and undefined facts are an empty list, not an error.

## What you get

`resolveUnitTagCarriers` returns `[]` only when neither field holds text. That empty list is the only honest "no tag". A screen that checks one field and then prints "no tag" is wrong even if it uses this unit for the other field.

`resolveUnitTag` is for a chip that has room for one value. It is the first entry. It is not the absence test. Null means neither field held text. It does not mean the second field was checked and found empty by a caller who never asked.

## Examples

```ts
resolveUnitTagCarriers({ unitTag: "  Keep  " });
// [{ tag: "Keep", carrier: "unitTag" }]

resolveUnitTagCarriers({ unitTag: "", "a:unitTag": "FromRaw" });
// [{ tag: "FromRaw", carrier: "unitTag" }]

resolveUnitTagCarriers({ unitTag: "Same", "a:ruleId": "Same" });
// both entries, unitTag first

resolveUnitTag({ ruleId: "OnlyRule" });
// { tag: "OnlyRule", carrier: "ruleId" }

resolveUnitTagCarriers({ tag: "Quantify" });
// []
```

## What the host must supply

The facts. This unit does not load the record. If the host stripped `a:` already, pass the bare keys. If it did not, pass the `a:` keys. Passing both is safe.

## Do not

- Do not add a third slug to the list. The set is closed.
- Do not deduplicate the two entries because the text matches.
- Do not trim the value before you store it by copying the display result back without meaning to. The display trim is not a save.
- Do not use the single-chip function as the test for an absence sentence.

## Wrong readings

- "Empty string on `unitTag` means the record has no unit tag." The `a:unitTag` spelling is still read.
- "ruleId is a different idea, so I can ignore it when unitTag is empty." They are read as one idea, in that order. Ignoring the second field is how a row shows a tag and then says it has none.
- "I should collapse two values into the first." The list exists so a surface that must not hide the second value can show both.

## Where it came from

GilbApp `src/lib/base/standardsFamilies.ts`, `resolveUnitTagCarriers` and `resolveUnitTag`.
