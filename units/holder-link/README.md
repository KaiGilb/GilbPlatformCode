# holder-link

Whether a stored link may be read on the holder's host.

## What this is

`handoffReadableAtHolder(link, holderUri)` returns true or false. Nothing is fetched.

The link is trimmed. A blank is false.

If the trimmed link does not start with `http://` or `https://` (the prefix match ignores case):

- True when it has no `:` and no `/`. That is a bare id. A holder is not required. Spaces do not matter: `not a url` is true.
- False when it contains `:` or `/`. `a:b`, `a/b`, and `//host/a` are false. They are not parsed as addresses.

If it is an absolute http(s) address:

- A missing holder (null, undefined, or `""`) is false.
- True when `new URL(link).host` equals `new URL(holderUri).host`.
- The scheme is not compared. `http` on the link and `https` on the holder still match.
- The path is not compared.
- The host comparison includes a non-default port. `host:8443` does not match `host`. A default port written out (`:443` on https, `:80` on http) is dropped by the parser, so those match the host without a port.
- The letter case of the host does not matter. The parser lowercases it.
- An address that cannot be parsed is false.

## What this is not

- Not the chip that says which standard a link opens. That resolver needs the standards catalogue and the lists the screen already loaded. Those stay in the app.
- Not permission to send a credential anywhere. True only means "this host is the holder's host, or this is a bare id". The read itself is still the host's request, on the holder's vault.
- Not `bridge-host`. That one is about a session cookie between the app and the vault server. This one is about a link stored on a record.

## How to take it

Package: `@kaigilb/gilbplatformcode-holder-link`

```ts
import { handoffReadableAtHolder } from "@kaigilb/gilbplatformcode-holder-link";

if (!handoffReadableAtHolder(link, holderUri)) {
  // do not request this address
}
```

Path: `units/holder-link/`.

## Examples

```ts
handoffReadableAtHolder("abc", null); // true
handoffReadableAtHolder("a:b", "https://holder.example.test/vault"); // false
handoffReadableAtHolder(
  "http://holder.example.test/base/e/1",
  "https://holder.example.test/vault",
); // true
handoffReadableAtHolder(
  "https://holder.example.test:8443/base/e/1",
  "https://holder.example.test/vault",
); // false
handoffReadableAtHolder("https://holder.example.test/base/e/1", null); // false
```

## What the host must supply

The stored link, and the holder record's own address when the link is absolute. A bare id does not need the holder. An absolute link does. Do not pass some other vault's address as the holder or a link on the real holder will be refused, and a link elsewhere may be allowed.

## Do not

- Do not read an absolute link on another host because you are signed in. The sign-in must not be sent where the stored link points.
- Do not treat a colon name such as `t:Person` as a bare id. It is false.
- Do not require the schemes to match. The app does not.
- Do not use this as the connect-target parser. A vault root is readable here when the host matches. It is not a connect target. That is `principal-key`.

## Wrong readings

- "False means the record is not in the vault." False means do not ask. The record may still be there under a bare id.
- "True means open it." True means a read is allowed at this host. What it opens is a different decision.
- "`//host/a` is an address on that host." It is not parsed. The slash makes it false.

## Where it came from

GilbApp `handoffReadableAtHolder` in `src/components/process/handoffTargets.tsx`. The chip resolver, the family tables, and the record read stay in the app.
