# copy-text

Copy a string, and tell the host whether it was copied, the clipboard is missing, or the write was refused. It does not throw.

## What this is

`copyText(text, clipboard)` writes one string through a clipboard you supply, and returns one of three words:

| Result | Meaning |
|---|---|
| `"copied"` | `writeText` finished. |
| `"unavailable"` | There is no clipboard object, or it has no `writeText` function. |
| `"denied"` | `writeText` threw, or its promise rejected. |

`browserClipboard()` returns `navigator.clipboard` when that object has `writeText`, otherwise `null`. Pass that into `copyText` in the browser. Pass a fake in a test.

The three words are the whole result. There is no fourth state, and a failure is not an exception.

## What this is not

- Not a button. The app's copy button uses that app's colour tokens and two sizes. Those stay in the app. If you copy the button markup from GilbApp, you are taking a styled control, not this package.
- Not a permission prompt. It does not ask the browser for permission. It only reports what the clipboard call did.
- Not a distinction between "the person clicked Block" and "the clipboard failed for another reason". Both are `"denied"`. Do not show a sentence that claims you know which one it was.
- Not a check that the text is an identifier, an email, or non-empty. An empty string is still sent to `writeText`.

## How to take it

Package: `@kaigilb/gilbplatformcode-copy-text`

```ts
import { browserClipboard, copyText } from "@kaigilb/gilbplatformcode-copy-text";

const result = await copyText(entityUri, browserClipboard());
```

Path: `units/copy-text/`.

## What you pass

- `text` — the exact string to write. It is not trimmed. It is not encoded.
- `clipboard` — an object that may have `writeText(text): Promise<void> | void`, or `null` / `undefined`. An object with no `writeText` is `"unavailable"`. Do not set `writeText` to `undefined` on the object. Leave the property off.

`writeText` may return a promise or return nothing. A non-promise return is `"copied"`. A thrown error is `"denied"`.

## What you get

The three words above, as a promise. `copyText` is async even when the writer is synchronous, so always `await` it (or handle the promise). If you ignore the promise, you are back to the old silence.

Suggested sentences, for a host that does not already have its own. These are examples, not exported constants, because "Copied the vault id" and "Copied the paragraph" are different sentences:

- `"copied"` — optional short confirmation, such as "Copied".
- `"unavailable"` — "Copy is not available in this browser."
- `"denied"` — "Copy was blocked. Select the text and copy it yourself."

The button's accessible name stays in the host. A good name names the thing, not the icon: `Copy vault id`, not `Copy`.

## Examples

```ts
await copyText("abc", { async writeText() { /* resolves */ } });
// "copied"

await copyText("abc", { writeText() { throw new Error("blocked"); } });
// "denied"

await copyText("abc", null);
// "unavailable"

await copyText("", { writeText() {} });
// "copied" — empty text is still a write
```

## What the host must supply

The clipboard. In a browser:

```ts
await copyText(value, browserClipboard());
```

Do not reach into `navigator` yourself and attach an empty `.catch`. That is the old helper. It swallows the rejection, so the screen cannot say the copy failed.

The host also supplies the button, the icon, the touch size, and the words it shows for each result.

## Do not

- Do not wrap `copyText` in try/catch expecting it to throw. It will not.
- Do not treat a resolved promise as `"copied"` without reading the word. `"denied"` and `"unavailable"` also resolve.
- Do not store the clipboard result as a grant or a permission. It is one write attempt.
- Do not import this package to style a button. It has no component and no CSS.

## Wrong readings

- "`unavailable` means the person refused." No. It means there was nothing to call. Refusal is `"denied"`.
- "`denied` means the string was secret or empty." No. It means the call failed. An empty string that the clipboard accepts is `"copied"`.
- "The app already copies, so this result can be ignored." The old button ignored it on purpose, and a denied permission looked like success. Ignoring the result repeats that.

## Where it came from

The silent helper was GilbApp `src/components/CopyIdButton.tsx`, function `copyToClipboard`. That function is `void` and swallows errors. This package keeps the "do not throw" rule and adds the three results so the host can say what happened. The styled button was not copied.
