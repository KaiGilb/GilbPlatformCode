# display-friendly

A short label from an email or an address.

## What this is

`displayFriendly(raw, hostPaths?)`

- Blank stays blank.
- If the text contains `@` and does not contain `://`, it is returned trimmed. An email takes this path. So does any other `@` text that is not a URL. `not-an-email @ x` is returned as itself. It is not parsed.
- A URL with an empty path, or a single path segment that is in `hostPaths`, returns the host. The host includes a port when there is one.
- Otherwise the last path segment is returned, unless that segment is itself in `hostPaths`, in which case the host is returned.
- If it is not a URL: the text after the last slash. A trailing slash returns the whole string. No slash returns the whole string.

`hostPaths` defaults to `["base"]` only.

## The /vault trap

`https://name.example.test/vault` returns `vault`, not the host. Only `/base` (and an empty path) shows the host, because that is the default list. A user-vault root ends in `/vault`. If you want that root to show the host, pass `["base", "vault"]`. Do not change the default and expect the app's current labels to stay the same. The app passes nothing, so it uses `["base"]`.

## What this is not

- Not the full card name. The card looks at label, then a tag, then a few identity fields, and only then calls this. Those field names stay in the app. This function formats one string.
- Not a privacy filter. It will show the last segment of whatever URL you pass, including an id.

## How to take it

Package: `@kaigilb/gilbplatformcode-display-friendly`

```ts
import { displayFriendly } from "@kaigilb/gilbplatformcode-display-friendly";
```

Path: `units/display-friendly/`.

## Examples

```ts
displayFriendly("person@example.test");
// "person@example.test"

displayFriendly("https://connect.example.test/base");
// "connect.example.test"

displayFriendly("https://id.example.test/base/p/8b0d8f48");
// "8b0d8f48"

displayFriendly("https://name.example.test/vault");
// "vault"

displayFriendly("https://name.example.test/vault", ["base", "vault"]);
// "name.example.test"

displayFriendly("folder/note-x");
// "note-x"

displayFriendly("note-x/");
// "note-x/"
```

## Do not

- Do not assume every vault root shows the host. `/base` does. `/vault` does not, unless you pass it in `hostPaths`.
- Do not run this on a label you already have. It is for an email or an address that is standing in as a name.

## Where it came from

GilbApp `src/lib/base/entityDisplayName.ts`, `displayFriendly`. The optional `hostPaths` argument is new. Omit it and the result matches the app.
