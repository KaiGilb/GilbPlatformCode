# vault-address

Whether a string is a vault address. A person, a WebID, and a record are not a vault.

## What this is

A vault address is exactly:

```text
https://<host>/base
https://<host>/vault
```

An optional port is allowed (`https://<host>:8787/base`). Nothing may follow the segment. A trailing slash fails. `http://` fails. The match is case-insensitive, so `/VAULT` matches. The host characters are letters, digits, dots, and hyphens.

`base` and `vault` are both admitted. One vault has one of them. This check does not know which one a given host uses. A user vault uses `vault`. A platform vault uses `base`. Refusing one of them refuses a whole class of vault.

`vaultIdProblem(value)` returns `null` when the value is a vault address. Otherwise it returns one of these sentences:

| Input | Sentence |
|---|---|
| Blank | `Enter a vault address.` |
| Ends in `/i` or `/i/` | `That is a WebID, not a vault. Use the vault itself — e.g. https://<that host>/vault` |
| Ends in `/base/p/<id>` or `/vault/p/<id>` | `That is a principal (a person), not a vault. A reach edge is granted VAULT → VAULT; use the vault address itself — nothing after /vault.` |
| Other `https://` | `A vault address looks like https://<host>/vault — nothing after it. Platform vaults end in /base instead.` |
| Anything else | `A vault address must start with https:// and end in /vault (or /base for a platform vault).` |

The WebID sentence uses the host of the pasted value, then `/vault`. It does not keep `/i`.

`principalGranteeProblem(value, example?)` is a different, weaker check. Blank is rejected. A value that does not start with `https://` is rejected. Any other `https://` value is accepted, including a bad path. `https://not-a-vault` returns `null`. Do not use this function to decide that an address is a vault. Use `vaultIdProblem` for that.

The rejection sentence names `example`. The default example is `https://<host>/vault`. Pass the app's own example if the sentence must name a real host. This package does not contain one.

`vaultNameProblem(name)` is `null` for a bare vault name (one DNS label: letters, digits, hyphens, no leading or trailing hyphen, at most 63 characters; trimmed, any case), otherwise a sentence: `Enter a vault name.`, `Type their GilbPlatform vault name or address (not an email)`, or `A vault name uses only letters, digits and hyphens, does not start or end with a hyphen, and has at most 63 characters.`

`vaultAddressFromName(name, apex)` (since 0.1.1) composes `https://<name>.<apex>/vault`, with the name lower-cased and the apex a bare host (optionally with a port), for example `vaultAddressFromName("Anna", "platform.example.test")` is `https://anna.platform.example.test/vault`. It answers `null` when the name fails `vaultNameProblem`, when the apex is not a bare host, or when the result fails `vaultIdProblem`. It composes only; it does not know which segment a host uses (user vaults use `vault`). It is not a grantee rule: `vault-access` still refuses a bare-host grantee on purpose, and a host that passes a typed value on must decide itself what is a name and what is an address.

## What this is not

- Not a lookup. A string can match and still not be a vault that exists.
- Not a choice of `base` versus `vault` for a host. Both shapes pass.
- Not the grant itself. It only checks the shape of an address before you send it.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-address`

```ts
import { vaultIdProblem, vaultNameProblem, vaultAddressFromName, principalGranteeProblem, VAULT_ID_RE } from "@kaigilb/gilbplatformcode-vault-address";

const problem = vaultIdProblem(text);
if (problem) show(problem);
```

Path: `units/vault-address/`.

## Examples

```ts
vaultIdProblem("https://name.example.test/vault"); // null
vaultIdProblem("https://name.example.test/base");  // null
vaultIdProblem("https://name.example.test/vault/"); // a sentence, not null
vaultIdProblem("https://name.example.test/i");
// "That is a WebID, not a vault. Use the vault itself — e.g. https://name.example.test/vault"
vaultIdProblem("https://name.example.test/base/p/8b0d8f48");
// the principal sentence
vaultIdProblem("https://name.example.test/base/e/abc");
// the "nothing after it" sentence

principalGranteeProblem("https://not-a-vault"); // null — plausible enough, not a vault check
principalGranteeProblem("name");
// "Use a full https:// vault address — e.g. https://<host>/vault."
```

## Do not

- Do not narrow the pattern back to only `/base` or only `/vault`.
- Do not treat a principal (`/p/…`) or a record (`/e/…`) as a vault because it starts with the right host.
- Do not use `principalGranteeProblem` where you needed `vaultIdProblem`. The grantee check lets a bad path through on purpose.

## Where it came from

GilbApp `src/lib/base/vaultIdentity.ts`. The grantee sentence used to name a fixed host. That host is now the `example` argument. Omit it and the sentence names `https://<host>/vault`. Pass the old example only if a screen must keep the previous words.
