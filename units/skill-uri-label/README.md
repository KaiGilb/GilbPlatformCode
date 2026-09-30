# skill-uri-label

A short label from a skill address when the catalogue gave no name.

## What this is

`skillUriDisplayLabel(skillUri)` returns a string.

Parse with `new URL`. Take the last non-empty path segment. Remove one leading `t:` from that segment only. Split a lower-case letter followed by an upper-case letter. Do not lower the result and do not capitalise it.

`https://vocab.example.test/base/t/StreetLine` becomes `Street Line`.

## What this is not

- Not a catalogue lookup. If you have a name, use the name. This is the fallback.
- Not `predicate-heading`. That unit lower-cases and capitalises the first letter, and it cuts at the first colon. This unit does neither. `streetLine` as a path segment stays `street Line`, with a lower first letter.
- Not a meaning. The last segment is not a definition.

## How to take it

Package: `@kaigilb/gilbplatformcode-skill-uri-label`

```ts
import { skillUriDisplayLabel } from "@kaigilb/gilbplatformcode-skill-uri-label";

const label = catalogueLabel ?? skillUriDisplayLabel(skillUri);
```

## What you pass

One absolute skill address.

## What you get

The split segment, or the original string when it is not an absolute address.

A relative word is returned unchanged, including its spaces. `StreetLine` stays `StreetLine`. `  not a uri  ` stays `  not a uri  `. Do not trim the fallback, and do not run the camel split on it.

`HTMLParser` has no lower-then-upper pair, so it stays `HTMLParser`.

A segment that is `t:StreetLine` loses the leading `t:` and then splits, so it becomes `Street Line`. Only one leading `t:` is removed.

## Examples

```ts
skillUriDisplayLabel("https://vocab.example.test/base/t/StreetLine") === "Street Line";
skillUriDisplayLabel("https://vocab.example.test/base/t/HTMLParser") === "HTMLParser";
skillUriDisplayLabel("StreetLine") === "StreetLine";
```

## The host must supply

The address. The catalogue name, when there is one, should win before this is called.

## Do not

- Do not lower-case this result to match `predicate-heading`.
- Do not fetch a label from the address.
- Do not treat a parse failure as an empty label. The original string is the label.

## Wrong readings

- "A bare `StreetLine` should become `Street Line`." It is not an address, so it is unchanged.
- "The first letter should be upper case." Not in this unit.
- "Percent-encoding should be decoded by hand." The URL parser's path is what is split. Do not add a second decode.

## Where it was taken from

MyNetBase `src/lib/card/entitledCard.ts`, `skillUriDisplayLabel` only.
