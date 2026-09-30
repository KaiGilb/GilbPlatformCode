# step-instruction

Turns one step's instruction string into the tag pill, the body sentence, and that body split into text and reference spans.

The pill is the tag the caller already holds. This function will not invent a pill from the words at the front of the sentence.

## What this is

```ts
formatStepInstruction(instruction, handsOffToIds?, unitTagCarrier?): StepInstructionDisplay
```

| Field | Meaning |
|---|---|
| `tag` | The carrier you passed, or null. |
| `text` | The sentence after a matching prefix is removed and handoff wikilinks are removed. |
| `segments` | The same shaped sentence, with a non-handoff `[[Name]]` still marked as a ref. Always set by this function. |

`handsOffToIds` may be one string, a list, null, or omitted. Empty strings in the list are ignored.

`unitTagCarrier` blank or only whitespace means "no tag". A real carrier is used as written. It is not trimmed. `" Tag "` is the pill `" Tag "`, and it does not equal a prefix `Tag`.

## What this is not

- Not a save, and not the editor prefill. The editor keeps the brackets in the text box. This function is what the viewer shows.
- Not a resolver. A remaining ref is a name or an address. Opening it is the screen's job (`statement-refs` states the same limit).
- Not `slashTail` for every id in the app. Only the handoff match uses a last-slash cut. See below.

## How to take it

Package: `@kaigilb/gilbplatformcode-step-instruction`

```ts
import { formatStepInstruction } from "@kaigilb/gilbplatformcode-step-instruction";
```

Path: `units/step-instruction/`.

If you only need "does this sentence start with Token — ?", take `instruction-prefix` instead. If you only need the bracket split, take `statement-refs`.

## The pill

The separator is space, em dash (U+2014), space. A hyphen does not count. An en dash (U+2013) does not count. That en dash is the role date line, not this separator.

| Carrier you pass | Prefix in the sentence | Pill | Body |
|---|---|---|---|
| omitted, null, or blank | `Token — rest` | null | the whole sentence, then handoff cleanup |
| `Token` | `Token — rest` | `Token` | `rest`, then handoff cleanup |
| `Other` | `Token — rest` | `Other` | the whole sentence, prefix included |

No carrier and no prefix: pill null, body is the instruction.

## Handoff wikilinks

Each handoff address is cut with the last slash only (`slashTail` in `id-tail`, not `uriTail`).

- The query is kept. `…/proc-alpha?x=1` does not match a wikilink `proc-alpha`.
- Percent-encoding is not decoded.
- A trailing slash yields an empty cut, which was already dropped because empty ids are ignored.

The wikilink inner is lowercased, and `_` is turned into `-`. Dots stay dots. `Proc_v_IdeaCapture` matches a tail `proc-v-ideacapture`. `Proc.V` does not match `proc-v`. The inner is not trimmed.

A matching wikilink is deleted, and a ` — ` stuck to that deletion is deleted with it, so you do not get a doubled separator or a separator at the edge. A non-matching `[[Other]]` loses its brackets in `text` and stays a ref in `segments`. The space before it stays on the text span: `body [[Other]]` becomes text `"body "` plus ref `"Other"`.

## When the body would become empty

If cleanup deletes everything, the function returns the original instruction as `text`, `tag: null`, and segments parsed from that original string. The pill you passed is dropped. This is so a step that is only a handoff wikilink still shows something. Do not "restore" the pill in that case.

```ts
formatStepInstruction("[[Proc_Alpha]]", "https://example.test/base/e/proc-alpha", "Kept");
// tag null, text "[[Proc_Alpha]]"
```

## Marker bytes

The segment pass uses U+0000 and U+0001 as private markers. If the instruction already contains either byte, the segment pass stops trusting itself and parses the body with the bracket splitter only. `text` is still cleaned. So `text` and the concatenation of `segments` can disagree in that one case. Do not pick different marker bytes; stored text that already contains them is the reason for the fallback.

## What the host must supply

- The carrier from the step: framed `unitTag`, otherwise raw `a:unitTag`. Not the bare `tag` field. Not the result of `liftInstructionPrefix` alone.
- The handoff addresses, in stored order. One string is fine. This function does not read the record.

An empty instruction returns `{ tag: null, text: "", segments: [] }`. That is the only case where `text` is empty.

## Do not

- Do not lift a prefix when you did not pass a carrier. The whole point of the null pill is that an untagged step must not grow a tag from its sentence.
- Do not match handoffs with `uriTail`. A query on the address is supposed to miss.
- Do not render a handoff name again inside the sentence. It was removed because the chip is already there.

## Wrong readings

- "`tag: null` means the sentence had no token." It means you did not pass a carrier, or the cleanup erased the body.
- "`segments` is optional, so it may be missing." The type allows a hand-built object without it. `formatStepInstruction` always sets it.
- "Two separators in a row are collapsed only for handoffs." Doubled ` — ` left by a deletion are collapsed to one. A doubled separator the writer typed, with no deletion, is also collapsed. That is the same cleanup.

## Where it came from

GilbApp `src/lib/base/processTypes.ts`, `formatStepInstruction`, plus the private helpers it uses (`statementSegmentsOf`, the wikilink slug, the last-slash cut). The bracket split matches `parseStatementRefs` in that same file.
