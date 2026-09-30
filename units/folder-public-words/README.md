# folder-public-words

The sentence you append when a link into a public folder landed, and something in that folder did not become public.

## What this is

One function, `notMadePublicSentence`.

- Missing, or a list of length 0 → `""`.
- One failure → a sentence that says `1 thing` and quotes that failure.
- More than one → a sentence that says `N things` and quotes only the first failure.

The sentence always starts with a space, so it can be glued onto the end of the caller's own "added" sentence.

## What this is not

- Not the call that makes a folder public. That stays in the app. It fetches.
- Not `units/file-words`. That one is the sentence for a file download. A confirmed miss is the only case that says the file is gone. This sentence is about a public folder's members.
- Not a list of every failure. The count includes them. The words quote the first one only.

## How to take it

Package: `@kaigilb/gilbplatformcode-folder-public-words`

```ts
import { notMadePublicSentence } from "@kaigilb/gilbplatformcode-folder-public-words";
```

Path: `units/folder-public-words/`.

Append the return value. When it is `""`, the caller's sentence is unchanged. Do not add your own "all public" words in that case. The empty string is the success case.

## What you pass

The list of failure strings the public-folder call returned, or undefined when you did not run it.

## What you get

`""`, or a sentence with a leading space.

One item:

` The folder is public, but 1 thing in it could not be made public: ` plus the first string.

Two or more:

` The folder is public, but 2 things in it could not be made public: ` plus the first string. The `2` is the length. The second string is not in the sentence.

A hole in the list (a missing element) is quoted as the word `undefined`. That is what string assembly does with a missing element. Do not turn the hole into an empty quote.

## Examples

```ts
notMadePublicSentence(undefined); // ""
notMadePublicSentence([]); // ""
notMadePublicSentence(["the link stayed private"]);
// " The folder is public, but 1 thing in it could not be made public: the link stayed private"
notMadePublicSentence(["first", "second"]);
// quotes "first" only, and says 2 things
```

## What the host must supply

The failure list from its own public-folder call. This unit does not decide whether the folder is public.

## Do not

- Do not join the failures with commas. The screens that already use this sentence quote the first one.
- Do not trim the leading space. Without it, the sentence collides with the previous word.
- Do not say "1 things" or "2 thing". One is `1 thing`. Every other count is `N things`, including zero — but zero never reaches that branch, because an empty list returns `""`.

## Wrong readings

- "The sentence lists every failure." It counts them and quotes the first.
- "Empty means say that everything became public." Empty means append nothing.

## Where it came from

GilbApp `src/lib/base/folderPublic.ts`, `notMadePublicSentence` only.
