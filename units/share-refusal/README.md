# share-refusal

The sentence shown when a share was refused. The server's own reason is kept. A stale guess about what the person should try is not added.

## What this is

`shareRefusalMessage(status, detail)` turns an HTTP status and the raw body text into one sentence.

Status `403` (the number) uses a fixed opening:

- Body has a string `message` that still has characters after trim: `GilbPlatform refused this share: ` plus that trimmed message.
- Otherwise: `GilbPlatform refused this share and sent no reason.`

Any other status, including `403.5`, uses `Share failed: ` plus the status, plus a reason. The reason is the trimmed `message` when the body parses as JSON and `message` is a string. When the body is not JSON, the reason is the trimmed body. When the body is JSON without a usable message, the reason is the raw body, and the whole sentence is then trimmed. A blank body therefore ends at the status, with no trailing space.

## What this is not

- Not a retry policy, and not a check that the share should have been allowed.
- Not a parser of an `error` code. Only `message` is read from JSON. A numeric `message` is ignored.
- Not a fetch. Pass the status and the body you already read.
- Not the 403 sentence for any other feature. The opening names a share.

## How to take it

Package: `@kaigilb/gilbplatformcode-share-refusal`

```ts
import { shareRefusalMessage } from "@kaigilb/gilbplatformcode-share-refusal";
```

Path: `units/share-refusal/`.

## What you pass

| Argument | Meaning |
|---|---|
| `status` | The response status as a number. The string `"403"` is not accepted by the type. `Number("403")` is 403 and does use the forbidden opening. |
| `detail` | The raw body text. Empty string is allowed. |

## What you get

One string. It always starts with either `GilbPlatform refused this share` or `Share failed:`.

## Examples

```ts
shareRefusalMessage(403, '{"message":"  not the owner  "}');
// "GilbPlatform refused this share: not the owner"

shareRefusalMessage(403, "");
// "GilbPlatform refused this share and sent no reason."

shareRefusalMessage(403, '{"error":"nope","message":1}');
// "GilbPlatform refused this share and sent no reason."

shareRefusalMessage(500, "  boom  ");
// "Share failed: 500 boom"

shareRefusalMessage(500, "");
// "Share failed: 500"
```

## What the host must supply

The status and the body text from the refused response. Do not pass a message you wrote yourself if the body had one. Do not replace the 403 sentence with advice to refresh.

## Do not

- Do not treat a whitespace-only `message` as a reason. It trims to nothing, and 403 then says no reason was sent.
- Do not read `error` and show that instead. The function does not.
- Do not special-case any status other than the number 403.

## Wrong readings

- "403 with a JSON body always shows the body." It shows `message` only, trimmed, and only when that value is a string.
- "A non-JSON 403 shows no reason." It shows the trimmed body. The no-reason sentence is for a body that is not a usable message: empty, not a string message, or a message that trims away.
- "The sentence should tell the person to hard-refresh." It should not. That advice was about a defect that is already gone, and it hid the server's sentence.

## Where it came from

GilbApp `shareRefusalMessage` in `src/lib/base/entityShare.ts`.
