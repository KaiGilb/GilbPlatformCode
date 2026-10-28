# agent-identity

Gives a program its own identity on GilbPlatform, so it signs in with its own key instead of a person's token.

It follows the machine-client route in the public guide Dev.Guide.AppAccess: the program makes a P-256 key pair and keeps the private half, registers the public half at `POST <id origin>/base/client/register`, asks for one token straight away, and sends one signed `GET <id origin>/base/connect/skill-claims` (the platform makes the client's principal at its first verified request, not at the token call). The owner then binds and grants it in GilbApp (below). From then on the program mints its own 5-minute tokens (no refresh: it mints again) and sends `Authorization: DPoP <token>` plus a fresh `DPoP` proof per request. The sign-in code is reused from `units/signin/src` (`machine.ts`, `dpop.ts`, `transport.ts`); nothing is copied.

## Run

Node 22.7 or later. The units are TypeScript, so plain node needs the flag and the resolve hook:

```
node --experimental-transform-types --no-warnings --import ./scripts/lib/ts-resolve.mjs \
  scripts/agent-identity/identity.mjs <command> --key-file <path> [flags]
```

Common flags: `--key-file <path>` (required); `--id-origin <https origin>` (default `https://id.gilb.com`; anything but `https://` plus a host is refused, and `https://gilb.com` draws a warning because the apex is not the token host).
Exit codes: 0 ok or clean dry run, 1 called wrong, 2 refused (nothing sent), 4 the platform answered an error.

## Commands

- `init --name "<display name>" --declared-origin <https url> [--write]`. Without `--write` it is a dry run: it sends and writes nothing, and prints the body it would POST. With `--write` it makes the key if the file is absent (never regenerates an existing one), registers it, writes `<key-file>.client.json` (mode 0600), mints one token at scope `base.read`, sends that one signed GET (non-2xx is exit 4; re-running is safe), and prints `clientId: ...` and `principal: made (verified GET → <status>)`. Re-running is safe: the same key gives the same clientId.
- `check [--scope base.read|base.write]` (default `base.write`). Mints a token and prints `token: ok (scope ..., expires_in ...)`. Prints no token.
- `get --url <https url>`. One signed GET with `Accept: application/ld+json`; prints `GET <url> → <status> <content-type>` and nothing of the body. A client that is bound and granted reads 200 where an unbound one reads 404.

It never prints the private key, a token or an assertion. The clientId is not a secret.

## Where to keep the key

In a folder with mode 0700 that is outside every git work tree (init refuses otherwise). Never commit the key, never share it. If it leaks: cut the grant in GilbApp and make a new key (a new key file registers as a new client).

## The owner's three GilbApp steps

The client is ready to bind once `init --write` prints `principal: made`. Then:

1. Mint AI vault.
2. Bind AI: paste the printed clientId.
3. Grant access, Vault, Write, on the content vault.

Then `check` (scope `base.write`) and `get --url <a vault resource>` prove it.

## Tests

```
node --experimental-transform-types --no-warnings --import ./scripts/lib/ts-resolve.mjs \
  --test scripts/agent-identity/test/identity.test.mjs
```

They use a fake transport and make no network call. CI's plain `node --test "scripts/**/*.test.mjs"` cannot parse the units' TypeScript, so the test file skips itself with a message there; to run them in CI, add the flags above to the test step. Scratch key folders are created under `scripts/agent-identity/test/.tmp-*/` (git-ignored) and removed at the end.
