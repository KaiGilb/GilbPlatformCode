# statement-href

Which statement text may be opened as a link. Only `http` and `https`. The stored spelling is what opens.

## What this is

`statementRefHref(value)` returns a string or null.

1. Trim the value.
2. Parse it with `new URL` and no base. A string that does not parse is null.
3. Allow only the protocols `http:` and `https:`.
4. Return the trimmed text. Not `url.href`.

`https://example.test` stays `https://example.test`. `url.href` would add a slash and make `https://example.test/`. The address that opens must be the characters the vault holds.

A scheme check on the raw prefix is the wrong check. `java` plus a newline plus `script:` is hostile, and a prefix check can miss it. The parser folds the break. The result is null.

## What this is not

- Not the splitter that finds `[[...]]` in a paragraph. That is `statement-refs`. This only decides whether one already-found reference may be a link.
- Not a lookup. A bare name such as `Some.Target` is null. Nothing is searched.
- Not a rewrite. Letter case in the host is kept. A default port is not stripped, because the trimmed text is returned whole.
- Not an error. Null means draw inert text. Do not throw.

## How to take it

Package: `@kaigilb/gilbplatformcode-statement-href`

```ts
import { statementRefHref } from "@kaigilb/gilbplatformcode-statement-href";

const href = statementRefHref(referenceText);
```

There is no React component here. The screen decides how a null looks.

## What you pass

`value` is one reference string. Pass the inside of the brackets, or the whole token, the same way the screen already isolates it. Do not pass the surrounding sentence.

## What you get

- The trimmed string, when it is an `http` or `https` address.
- `null` for everything else: `javascript:`, `data:`, `vbscript:`, `file:`, `ftp:`, a scheme-relative `//host/...`, a bare word, `httpfoo`, and a blank.

Leading and trailing spaces are removed before the parse, and they are not put back. `  https://Example.TEST/A  ` returns `https://Example.TEST/A`.

## Examples

```ts
statementRefHref("https://example.test") === "https://example.test";
statementRefHref("  https://Example.TEST/A  ") === "https://Example.TEST/A";
statementRefHref("javascript:alert(1)") === null;
statementRefHref("java\nscript:alert(1)") === null;
statementRefHref("Some.Target") === null;
```

## The host must supply

The text of one reference. The screen that paints a link when this returns a string, and inert text when it returns null.

## Do not

- Do not return `url.href`.
- Do not allow a scheme because the string starts with `http`. `httpfoo` is null. The relation expander in `compact-id` does keep a string that starts with `http`. That rule is not this one.
- Do not open a bare name by searching the vault.
- Do not trim only for the check and then return the untrimmed original. The return value is the trimmed text.

## Wrong readings

- "Null means the reference is broken." It means this text is not an allowed address. The words can still be shown.
- "The parser's address is safer." It is a different address. The slash it adds is a change the steward did not write.
- "`httpfoo` should be kept, because another unit keeps it." That other unit is not a link allow-list.

## Where it was taken from

GilbApp `src/components/process/StatementText.tsx`, the function `statementRefHref` only. The chip that paints the link stays in the app.
