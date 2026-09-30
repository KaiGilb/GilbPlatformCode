# bridge-host

Whether the app's host and the vault server's host differ, so a session cookie may not be sent.

## What this is

`bridgeMayNotApply(appOrigin, baseOrigin)` returns true when the two hosts differ.

- Host means `new URL(...).host`. That is the hostname plus a non-default port.
- The scheme is ignored. `http://app.example.test` and `https://app.example.test` are the same host, so the result is false.
- Letter case of the host does not matter.
- A default port written out is dropped by the parser. `https://host:443` matches `https://host`. `http://host:80` matches `http://host`.
- Any other port counts. `http://host:8787` does not match `http://host`, so the result is true.
- The path is ignored.
- If either string cannot be parsed as an address, the result is false. This function will not claim the cookie may fail when it could not read the addresses.

True means the hosts differ, so a cookie that is not sent on a cross-site request may not apply. It does not prove the browser will drop the cookie. Two hosts inside one site can still differ as hosts. The wording to a person is "may not", not "will not".

## What this is not

- Not a sign-in screen, and not a classification of why a request failed. Expired, refused, and not-signed-in are app errors with their own sentences. Those classes stay in the app.
- Not `holder-link`. That one asks whether a stored link is on the holder's host.
- Not `canonical-host`. That one rewrites the address the app is served on. This one only compares two hosts you pass.
- Not a request.

## How to take it

Package: `@kaigilb/gilbplatformcode-bridge-host`

```ts
import { bridgeMayNotApply } from "@kaigilb/gilbplatformcode-bridge-host";

if (bridgeMayNotApply(window.location.origin, vaultOrigin)) {
  // say the cookie sign-in may not apply from this host; offer the code route
}
```

Path: `units/bridge-host/`.

Pass origins, or full addresses. Both work, because only the host is compared. Do not pass a hostname with no scheme (`app.example.test`). That cannot be parsed, and the result is false, which hides a real difference.

## Examples

```ts
bridgeMayNotApply("http://app.example.test", "https://app.example.test/base"); // false
bridgeMayNotApply("https://app.example.test:443", "https://App.Example.TEST"); // false
bridgeMayNotApply("http://app.example.test", "https://vault.example.test"); // true
bridgeMayNotApply("http://app.example.test:8787", "http://app.example.test"); // true
bridgeMayNotApply("", "https://app.example.test"); // false
```

## What the host must supply

The origin the app is served from, and the origin of the vault server the cookie would be sent to. Both are arguments. There is no built-in host.

## Do not

- Do not treat false as "the cookie will be sent". False is "the hosts match" or "one address could not be read".
- Do not treat true as "the person is signed out". It is a statement about the two hosts.
- Do not compare hostnames yourself and drop the port. `8787` is part of the answer.
- Do not pass a schemeless host.

## Wrong readings

- "Different schemes mean the bridge may not apply." Schemes are ignored.
- "An empty origin is a difference." It is false, because the address could not be read.
- "This chooses the sign-in method." It only answers the host question. The screen still decides what to show.

## Where it came from

MyNetBase `bridgeMayNotApply` in `src/lib/base/reachFailure.ts`. The error-class sentences in that file stay in the app. They depend on the app's own error types.
