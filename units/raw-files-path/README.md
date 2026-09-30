# raw-files-path

Whether a value is a raw vault file path. That path is not a picture address.

## What this is

`isRawFilesPath(value)` returns true or false.

Trim, then true when either:

- the value starts with `/files/` — this arm is case-sensitive, or
- the value matches `http://<host>/files/` or `https://<host>/files/` — this arm is case-insensitive.

## What this is not

- Not a picture URL builder. True means "do not use this string as an image address". The host builds the replacement, on its own origin.
- Not an access check. A raw path is owner-only bytes. Hiding the path is not what grants access. The mediated address is still checked by the server.
- Not a general "contains the word files" test.

## How to take it

Package: `@kaigilb/gilbplatformcode-raw-files-path`

```ts
import { isRawFilesPath } from "@kaigilb/gilbplatformcode-raw-files-path";

if (isRawFilesPath(value)) {
  // ask the host for the mediated address
}
```

## What you pass

One string the server or a claim already gave you. A photo field and a `photoUrl` field are both this shape.

## What you get

True or false.

`/files/abc` is true. `  /files/abc  ` is true. `HTTPS://files.example.test/files/abc` is true.

`/Files/abc` is false. The relative arm does not ignore case. The absolute arm does. That split is shipped. Do not make the arms agree.

`/files` with nothing after `files` is false. `https://host/files` without the slash after `files` is false. `https://host/other/files/abc` is false. The absolute arm requires `/files/` directly after the host.

A connect path such as `/base/connect/profile-photo` is false. It is not a raw file path.

## Examples

```ts
isRawFilesPath("/files/abc") === true;
isRawFilesPath("/Files/abc") === false;
isRawFilesPath("HTTPS://files.example.test/files/abc") === true;
isRawFilesPath("https://files.example.test/other/files/abc") === false;
```

## The host must supply

What to use instead. This unit does not know the app origin, and it must not grow one.

## Do not

- Do not put a raw `/files/` value in an image `src`.
- Do not treat a false result as "safe to show". False only means this pattern did not match. The host still decides.
- Do not case-fold the relative arm. `/Files/abc` is not the pattern the app rejects.

## Wrong readings

- "Both arms should ignore case." They do not.
- "Any URL that mentions files is raw." Only `/files/` at the host root.
- "This function returns the safe URL." It returns a boolean.

## Where it was taken from

MyNetBase `src/lib/card/entitledCard.ts`, `isRawFilesPath` only. The function that turns a raw path into a mediated photo URL stays in the app, because it prefixes an origin.
