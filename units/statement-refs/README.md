# statement-refs

Splits one statement string into plain spans and reference spans. It does not open a reference, and it does not decide that a reference can be opened.

## What this is

`parseStatementRefs(raw)` returns `{ kind: "text" | "ref", value: string }[]`.

Two shapes become a ref:

| Written | `value` |
|---|---|
| `[[Some.Target]]` | `Some.Target` (brackets removed, inner kept as written, including a period) |
| `https://example.test/x.` | `https://example.test/x` (the final period stays in the next text span) |

An empty `[[]]` produces no span at all. Text on either side is still returned.

The characters stripped from the end of a bare address, and only from the end, are `. , ; : ! ? ) ] }`. They stay in the text that follows.

## What this is not

- Not a link checker. `kind: "ref"` means "the writer marked this". It does not mean the target exists, and it does not mean the screen may navigate.
- Not a scheme allowlist. A bare `javascript:`, `data:`, or `vbscript:` string is text, because it is not `http://` or `https://`. The same string inside `[[ ]]` is a ref, because the brackets matched. Do not navigate to it just because the kind is `ref`. The screen that draws the span refuses the scheme.
- Not the step pill, and not the handoff-chip removal. That is `step-instruction`. This function leaves `[[Name]]` as a ref even when that name is also a handoff.

## How to take it

Package: `@kaigilb/gilbplatformcode-statement-refs`

```ts
import { parseStatementRefs } from "@kaigilb/gilbplatformcode-statement-refs";
```

Path: `units/statement-refs/`.

## What you pass

The statement string, already chosen. Empty string returns `[]`, not a text span of `""`.

This function does not read a record. The app calls it on instruction text after the family's own field has been projected onto `instruction`. If you still have several field names, pick the field first, then call this.

## What you get

Spans in order. Concatenating every `value` is not always the original string: the `[[ ]]` brackets are removed, and trailing punctuation of a bare address is split into its own text span (so the characters are still there, just in the next span).

```ts
parseStatementRefs("see [[Some.Target]] now");
// text "see ", ref "Some.Target", text " now"

parseStatementRefs("see https://example.test/x.");
// text "see ", ref "https://example.test/x", text "."

parseStatementRefs("javascript:alert(1)");
// one text span, the whole string

parseStatementRefs("[[javascript:alert(1)]]");
// one ref, value "javascript:alert(1)"  — still do not open it
```

## What the host must supply

The decision to navigate. This unit has no opinion. A ref whose value is an `http(s)` address can be opened as itself. A ref whose value is a name has to be resolved by the host. A ref whose value is `javascript:` must not be opened.

## Do not

- Do not add a third pattern (markdown links, bare `www.`, angle brackets). The app has two forms so every family agrees.
- Do not fold the trailing period into the address. The sentence ended. The address did not.
- Do not drop a text span that is only punctuation. That period is the sentence.

## Wrong readings

- "No refs means the statement cites nothing." It means this splitter saw neither brackets nor an http address. A name written in plain words is text.
- "A ref is safe to put in an href." No. Check the scheme in the screen that opens it.

## Where it came from

GilbApp `src/lib/base/processTypes.ts`, `parseStatementRefs`. The same body is copied inside `step-instruction` so that folder stands alone. If you change one, change the other; the punctuation examples are pinned in both tests.
