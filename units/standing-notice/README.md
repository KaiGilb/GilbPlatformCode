# standing-notice

The sentence when standing instructions did not load. An empty group, a missing title, and an unread vault are three different sentences. Loaded is not a sentence.

## What this is

`asStandingReport(data)` reads one event payload.

`standingNotice(report)` turns that report into the sentence a person can act on, or null when the instructions loaded.

All three failure sentences start with the same words: `The agent is answering WITHOUT its standing instructions`. The ending is the part that must not be shared. Showing "no standing instructions" for all three is the bug.

## What this is not

- Not the chat request, and not a fetch of the standards vault. The host already has the event.
- Not a decision to stop the answer. The agent already answered. The sentence says the answer was given without the instructions. It does not retract the answer.
- Not a trim of group titles inside the report. The sentence drops blank titles from the "offers" list. The report keeps them.

## How to take it

Package: `@kaigilb/gilbplatformcode-standing-notice`

```ts
import { asStandingReport, standingNotice } from "@kaigilb/gilbplatformcode-standing-notice";

const report = asStandingReport(event.data);
const sentence = report ? standingNotice(report) : null;
```

Null from the parser means the payload had no outcome string. Do not invent `unreadable` for that. Null from the notice means `loaded`. Those nulls are different.

## What you pass

`asStandingReport` takes `unknown`.

`standingNotice` takes a report: `outcome`, `group`, `vault`, and optionally `groupsSeen` and `reason`.

## What you get

From the parser, a report or null.

| Payload | Report |
|---|---|
| null, a list, `{}`, `{ outcome: 1 }` | `null` |
| `{ outcome: "loaded" }` | outcome `loaded`, group `""`, vault `""`. No `groupsSeen`. No `reason`. |
| `{ outcome: "unreadable", reason: "" }` | no `reason` key. An empty string is not a reason. |
| `{ outcome: "nope" }` | outcome `unreadable`, and `reason` is `the host reported an outcome this app does not know: nope` |
| `{ outcome: "unreadable", reason: "  x" }` | `reason` is `  x`. Spaces are kept. |
| `groupsSeen` not an array | the key is absent |
| `groupsSeen: []` | the key is present and empty |
| `groupsSeen: [" A ", "", 1]` | `[" A ", ""]`. Numbers are dropped. Strings are not trimmed. |

An unknown outcome is not dropped. A host that says a word this build does not know is reported as `unreadable`, with the raw word in `reason`, unless the payload already had a non-empty reason. The payload reason wins.

From the notice:

| Outcome | Sentence |
|---|---|
| `loaded` | `null` |
| `unreadable`, no reason | `... could not be read. This is not an empty group.` |
| `unreadable`, reason `timed out` | `... could not be read (timed out). This is not an empty group.` |
| `group-absent`, blank group, blank vault | `... no group called "the default group" is on the standards vault.` |
| `group-absent` with titles whose trim is non-empty | the same sentence, then ` That vault offers: ` and the titles joined by a comma. The titles are not trimmed in the join. `" A "` stays `" A "`. A title that is empty after trim is left out of this list only. |
| `group-empty` | `... the group "<group>" exists and holds no steps.` |

A blank `group` is spoken as `the default group` in every failure sentence. A blank `vault` is spoken as `the standards vault` only in the missing-group sentence. The empty-group sentence does not mention the vault.

The empty-group sentence is also the fallback. An outcome that is not `loaded`, `unreadable`, or `group-absent` gets it. The parser never emits a fifth outcome. Do not build a report by hand with another word.

## Examples

```ts
standingNotice({ outcome: "loaded", group: "G", vault: "V" });
// null

standingNotice({ outcome: "group-empty", group: "G", vault: "V" });
// The agent is answering WITHOUT its standing instructions: the group "G" exists and holds no steps.
```

## Host must supply

The event data. Group and vault strings are whatever the host put on the payload. This function does not look up the real title.

## Do not

- Do not collapse the three endings into one "no instructions" line.
- Do not show the unreadable sentence for an empty group. The unreadable sentence says `This is not an empty group.` Using it for an empty group is the lie it names.
- Do not trim `groupsSeen` before the parser and also expect the notice to trim. The notice drops blanks. It does not trim the titles it keeps.
- Do not treat parser null as `unreadable`. A payload with no outcome was not a standing event.

## Wrong readings

- `loaded` does not produce "instructions loaded". It produces null. The host shows nothing.
- A spaces-only reason is a reason. It will appear in the parentheses.
- `""` as a reason is not a reason. An unknown outcome can still add the "does not know" reason when the string was empty.
- The offered titles in the sentence can have leading spaces. That is the stored spelling, not a layout bug to trim away in this function.

## Source

GilbApp `src/lib/base/agentChat.ts`, `asStandingReport` and `standingNotice`. The chat request was not copied.
