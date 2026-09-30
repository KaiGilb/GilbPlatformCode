# server-error

The sentence from a refused request. A machine token such as `BadRequest` is never shown on its own.

## What this is

A pure reader for a failure body. You already have the HTTP status and the response text, or the object you parsed from it. This package picks the sentence a person can act on.

Two real shapes exist, and both must work:

1. Token in `error`, sentence in `message`. Example: `{ "error": "BadRequest", "message": "parentVault is not a known vault entity: https://example.test/base" }`. Show the message.
2. Sentence in `error`, and no `message` at all. Example: `{ "error": "That vault name is reserved — choose another" }`. Show that sentence.

The package does not choose by field name alone. It chooses the field that reads as a sentence. A sentence is a string that still contains whitespace after trimming. `BadRequest` has no whitespace, so it is a token. `Bad Request` (with a space) is a sentence. That is deliberate. There is no list of forbidden tokens, because a new token would be missed the day the server adds one.

## What this is not

- Not a client. It does not fetch, retry, or know a host.
- Not a guess at the cause. If the server sent no sentence, the line says that, and names the status. It does not invent "the vault was missing" or "you lack permission".
- Not a check that the status is an error. Call it only for a response you are already treating as a refusal. If you pass `200` and a token, you still get the "no reason" line.
- Not a parser for every field in the body. Only `error` and `message` are read. Other fields are ignored.

## How to take it

Package: `@kaigilb/gilbplatformcode-server-error`

```ts
import { serverErrorText, serverReasonOrNull, parseServerErrorBody } from "@kaigilb/gilbplatformcode-server-error";
```

Path: `units/server-error/`. The repo root README says where the code home is. Search for the unit in the Code repositories table before copying. This file is the explanation that travels with the code. It is not the search.

## What you pass

`serverErrorText(status, source, fallbackLabel?)`

- `status` — the HTTP status number you received. It is shown only when no sentence arrived.
- `source` — either the raw response text, or an object that may have `error` and `message`.
- `fallbackLabel` — what to call the act when the body named nothing. Example: `"Create vault failed"`. Omit it and the label is `"Request failed"`. The label must not assert a cause.

`serverReasonOrNull(source)` — same body, but for a caller that already has its own sentence and only wants to append the server's sentence. A token returns `null`, so you do not glue `BadRequest` onto a sentence that was already clear.

`parseServerErrorBody(text)` — use this when you need the object. It never throws.

`carriesReason(value)` — the sentence test, exported so a host can use the same rule and not invent a second one.

## What you get

A sentence is returned trimmed, with no status glued on.

When there is no sentence, the line is exactly:

```text
<head> (HTTP <status>) — no reason was sent — copy this line if you report it
```

`<head>` is the token if one field held a non-empty string (`error` first, then `message`), otherwise `fallbackLabel`.

The constant `NO_REASON_TAIL` is the part after the em dash: `no reason was sent — copy this line if you report it`. Do not rephrase it in one app and not the other. The whole point of the tail is that the person can copy one stable line.

## Examples

```ts
serverErrorText(400, {
  error: "BadRequest",
  message: "parentVault is not a known vault entity: https://example.test/base",
}, "Create vault failed");
// "parentVault is not a known vault entity: https://example.test/base"

serverErrorText(400, { error: "That vault name is reserved — choose another" }, "Create vault failed");
// "That vault name is reserved — choose another"

serverErrorText(400, { error: "BadRequest" }, "Create vault failed");
// "BadRequest (HTTP 400) — no reason was sent — copy this line if you report it"

serverErrorText(503, {}, "Create vault failed");
// "Create vault failed (HTTP 503) — no reason was sent — copy this line if you report it"

serverErrorText(409, { message: "Conflict", error: "that host is already taken" }, "x");
// "that host is already taken"
// message was only a token, so the sentence in error is used.

serverReasonOrNull({ error: "BadRequest" });
// null
```

Raw text works. A JSON object text is parsed. Text that is not JSON becomes `message` (a proxy HTML page, a plain string). A JSON scalar is stringified into `message` (`42` becomes the token `"42"`). A JSON array is stringified by joining, so `[1,2]` becomes the token `"1,2"`, then the no-reason line.

## What the host must supply

The status and the body. Nothing else. No session, no origin, no vocabulary.

Only strings are reasons or tokens. If you pass an already-parsed object and `message` is the number `42`, it is ignored. If you pass the raw text `"42"`, it is parsed and becomes the token string `"42"`. Pass either the raw text or the parsed object, not a mix you have not looked at. Do not pass an array as `source`. An array is not a body. It is treated as "no fields", and you get the fallback line.

## Do not

- Do not read `error` first and stop. That shows `BadRequest` and throws away the only sentence.
- Do not always prefer `message` either. Some responses put the sentence in `error` and omit `message`. A token in `message` must fall through to a sentence in `error`.
- Do not treat a bare address as a reason. It names a thing. It does not say what is wrong with it. It stays on the token path, with the status and the tail.
- Do not catch `parseServerErrorBody`. It does not throw.
- Do not append `serverReasonOrNull` when it returns null.

## Wrong readings

- "If it says BadRequest, the person typed a bad field." No. `BadRequest` is the class name. The sentence, if any, is elsewhere in the body. If there is no sentence, say so. Do not explain the class name yourself.
- "Whitespace-only means an empty reason we should show." No. Spaces and newlines are absent. You get the fallback line.
- "A string with a space is always a real explanation." It is shown as the sentence. `Bad Request` with a space is shown as written. The package will not strip it back to a token.

## Where it came from

GilbApp `src/lib/base/serverError.ts`, including the tests that pin both body shapes. The preference order is unchanged. Comments that named a cycle were not copied. The behavior was.
