# document-rename

The title a standards document shows in the rename box, and the patch that writes a changed title.

## What this is

`prefillDocumentRename(doc)` returns `{ title }`.

- A missing document is `{ title: "" }`.
- A bare `title` that is a string wins, including `""` and a string of spaces. It hides `a:title`.
- A bare `title` that is missing, null, or any non-string falls through to `a:title` when that is a string.
- If neither spelling is a string, the title is `""`.
- Nothing is trimmed.

`buildDocumentRenamePatch(original, edited)` returns `{ title: edited.title }` when the two strings are not exactly equal. The same text, spaces included, returns `{}`. An edited title of `""` is the string `""` in the patch. It is not null, and it is not a deleted field.

The only key is the bare slug `title`, exported as `DOCUMENT_TITLE_CARRIER`. There is no `body` key. There is no `a:title` key. The writer you call is expected to prefix `a:` itself. Sending `a:title` would store `a:a:title`.

## What this is not

- Not the stored-string unit. That one treats a blank as nothing. A blank title here is a real title of `""`, and it hides the `a:title` spelling.
- Not the condition title. A non-string bare title there blocks the wire spelling. Here a non-string bare title falls through.
- Not the process name. A process name is a machine handle and is returned untrimmed for a different reason. This patch is the document's display title.
- Not a request. `{}` means send nothing. The host makes that choice. This unit does not call the server.
- Not the steward's note. Clearing that note sends null. Clearing this title sends `""`.

## How to take it

Package: `@kaigilb/gilbplatformcode-document-rename`

```ts
import {
  buildDocumentRenamePatch,
  prefillDocumentRename,
} from "@kaigilb/gilbplatformcode-document-rename";

const original = prefillDocumentRename(doc);
const patch = buildDocumentRenamePatch(original, edited);
if (Object.keys(patch).length === 0) return; // send nothing
await patchRecord(documentId, patch, at);
```

Path: `units/document-rename/`.

## Examples

```ts
prefillDocumentRename({ title: "", "a:title": "Hidden" }); // { title: "" }
prefillDocumentRename({ title: null, "a:title": "Wire" }); // { title: "Wire" }
prefillDocumentRename({ title: 1, "a:title": "Wire" }); // { title: "Wire" }
prefillDocumentRename({ title: "  Hello  " }); // { title: "  Hello  " }

buildDocumentRenamePatch({ title: "A" }, { title: "A" }); // {}
buildDocumentRenamePatch({ title: " A " }, { title: "A" }); // { title: "A" }
buildDocumentRenamePatch({ title: "A" }, { title: "" }); // { title: "" }
```

## What the host must supply

The document you already read, and the edited title string from the form. The patch goes to the same writer the app uses, which prefixes `a:` onto bare slugs. Do not prefix it first.

## Do not

- Do not trim the prefill so the form looks tidy. A later save would then see a change the person did not make, or would miss a change that was only spaces.
- Do not treat `{}` as "write the same title again". It means send no request.
- Do not turn `""` into null. That is the steward-note rule, not this one.
- Do not add `body`. The body is not writable on this increment.
- Do not read `label` or `processName` as a fallback. They are other jobs.

## Wrong readings

- "Empty title means the wire title." Only when the bare title is not a string. A bare `""` hides the wire title.
- "The patch key is `a:title` because that is what is stored." The patch key is `title`. The writer adds the prefix.
- "Equal after trim means no change." The comparison is exact. `" A "` to `"A"` is a change.

## Where it came from

GilbApp `prefillDocumentRename` and `buildDocumentRenamePatch` in `src/lib/base/standardsDocumentEdit.ts`. The save functions that call the server stay in the app. The private title reader here does not use the served-string unit, and it must not be switched over to it.
