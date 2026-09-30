# vcard-line

Escapes one vCard text value, and folds one long line.

It does not build a card. It does not choose EMAIL, TEL, ADR, or PHOTO. It does not decide WORK or HOME. The purpose token is `units/contact-purpose`.

## What this is

`escapeVCardText` escapes four characters, in this order:

1. Backslash `\` becomes two backslashes.
2. A real newline (U+000A) becomes a backslash and the letter n.
3. Comma.
4. Semicolon.

A backslash inserted by step 1 is not escaped again. A carriage return (U+000D) is left as a carriage return. The two characters backslash and n that were already in the text are not a newline; the backslash is escaped and the n stays.

`foldVCardLine` cuts a line at 75 JavaScript string units. That is UTF-16 code units, which is what `.length` counts. It is not UTF-8 octets, and it is not graphemes. The app comment said "75 octets". The code uses `.length`. Do not switch it.

A line of 75 or fewer is returned unchanged. No CR LF is added.

A longer line: the first piece is 75 units. Each continuation is one space plus the next 74 units. The pieces are joined with CR LF (`\r\n`).

## What this is not

- Not a vCard document. The host writes `BEGIN:VCARD`, the property name, and `END:VCARD`.
- Not a downloader.
- Not a decision about which fields a stranger may see. The host passes only text the card view already holds.

## How to take it

Package: `@kaigilb/gilbplatformcode-vcard-line`

```ts
import { escapeVCardText, foldVCardLine } from "@kaigilb/gilbplatformcode-vcard-line";
```

Path: `units/vcard-line/`.

Escape the value first, then build the line (`TEL;TYPE=CELL:…`), then fold the line. Folding before escaping can split an escape sequence.

## What you pass

A string. Empty is a legal value. It is not trimmed.

## What you get

A string. The folded form may contain CR LF and a leading space on the continuation. That space is the fold marker. It is not part of the value. Do not trim it off.

## Examples

```ts
escapeVCardText("a\\b,c;d"); // a\\b\,c\;d
escapeVCardText("a\nb"); // a\nb   — a real newline
escapeVCardText("already\\n"); // already\\n — the letters were already escaped-looking

foldVCardLine("a".repeat(75)); // unchanged
foldVCardLine("a".repeat(76)); // 75 a's, CR LF, space, one a
```

`é` is one code unit, so 76 of them fold. An emoji that is two code units counts as two toward the 75. Do not count it as one character.

## What the host must supply

The property line, and the decision of which fields are already on the card view.

## Do not

- Do not fold on UTF-8 bytes. A line that is 75 code units and more than 75 bytes stays one line.
- Do not escape comma before backslash. The order is what keeps a backslash in the original text from being double-processed against the escapes this function inserts.
- Do not treat `\r` as a newline to escape.

## Wrong readings

- "75 means 75 letters a person sees." It means 75 UTF-16 code units.
- "This builder emits ORG and TITLE." It emits nothing but an escaped string and a folded line. The card builder stays in the app.

## Where it came from

MyNetBase `src/lib/card/vcard.ts`, the functions `escapeVCardText` and `foldVCardLine` only. The card assembly in that file stays in the app. It hardcodes a host when it builds a homepage URL, so it is not in this unit.
