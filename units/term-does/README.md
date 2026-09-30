# term-does

The definition on a term document you have already read.

## What this is

`termDoesFromDocument(doc)` returns `{ state: "defined", does }` or `{ state: "none" }`.

Call it only with the object the server returned for that term. A failed request, a 404, and a body that did not parse are not documents. Passing null throws `termDoesFromDocument: pass the document that was read. A failed read has no definition to report.` Do not catch that and show "no definition". Show that the read failed.

On a real document:

- `a:does` is read first. `??` does not skip `""`, `"   "`, or `0`. Those hide a bare `does`, and the result is none.
- Null or a missing `a:does` falls through to `does`.
- A string is trimmed. A trim that is empty is not a definition.
- An object with `@value` uses that inner value when it is a non-empty string after trim. One level only. A number `@value` is none.
- A list of strings is none. It is not joined.
- An empty object is none. That is "this document was read and states no definition", which is a fact about the term.

## What this is not

- Not a request, and not a host. You already have the document.
- Not the three-state result the screen needs. The third state, "could not read", is the host's, from the failed request. This unit has no value that means both "unreachable" and "none". That collapse is the bug.
- Not the label of the term. A label is a different field.
- Not a language map. It does not pick a language.

## How to take it

Package: `@kaigilb/gilbplatformcode-term-does`

```ts
import { termDoesFromDocument } from "@kaigilb/gilbplatformcode-term-does";

let doc: Record<string, unknown>;
try {
  const res = await fetch(termUrl, { headers: { accept: "application/json" } });
  if (!res.ok) return { state: "unreachable", reason: String(res.status) };
  doc = await res.json();
} catch {
  return { state: "unreachable", reason: "could not reach the host" };
}
return termDoesFromDocument(doc);
```

Path: `units/term-does/`.

The sample above is the shape. The address you fetch is the host's. Do not build a default ontology host in the caller from a constant hidden in a library.

## Examples

```ts
termDoesFromDocument({ "a:does": "  Says what it does.  " });
// { state: "defined", does: "Says what it does." }

termDoesFromDocument({ "a:does": { "@value": "  Wrapped  " } });
// { state: "defined", does: "Wrapped" }

termDoesFromDocument({ "a:does": "", does: "Bare" }); // { state: "none" }
termDoesFromDocument({ "a:does": null, does: "Bare" }); // { state: "defined", does: "Bare" }
termDoesFromDocument({}); // { state: "none" }
```

## What the host must supply

A document object from a response you have already accepted. If the response was not ok, or the body was not JSON, do not call this.

## Do not

- Do not map a thrown error, a 404, or a network failure to `{ state: "none" }`.
- Do not fall through to `does` when `a:does` is `""`. The empty string is present.
- Do not join an array of definitions. The app does not.
- Do not trim into the document you keep. Only the returned `does` string is trimmed.

## Wrong readings

- "`none` means we could not load the term." It means the document you passed has no usable definition. If you did not have a document, you should not have called.
- "A blank `a:does` lets the bare field speak." It hides it.
- "`@value` inside `@value` is unwrapped." One level only.

## Where it came from

GilbApp `doesOf` inside `readTermDefinition` in `src/lib/base/termDefinition.ts`. The fetch, the host, and the unreachable state stay in the app. Null is refused here so a missing document cannot be reported as none.
