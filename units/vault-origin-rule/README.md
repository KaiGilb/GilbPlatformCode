# vault-origin-rule

The one rule for which origin a vault address names and which URL may receive the app's credential, so every address and credential check answers the same way.

## What this is

The one rule for which origin a vault address names and which URL may receive the app's credential, so every address and credential check answers the same way.

A vault is served by the host its address names, and an app sends its token to a host only if the platform's rule allows it. This unit holds that rule and the URL builders that follow it. A URI that data names (a fact, a served `@id`) is never trusted to choose the host the token goes to: only the platform origin, its subdomains over `https` on the default port, and the system vault hosts are answered at their own origin; every other host is asked at the platform origin. The platform origin and the system host list are not in this unit; it reads them from `base-origin` when a function is called. Plain functions, no React, no network.

- `vaultOriginOf(entityUri)`: the origin to ask for an entity or vault URI. The platform origin for a missing, unreadable or foreign URI (the security rule: a foreign host is answered with the platform origin, never its own); the platform origin verbatim for its own host (the scheme is never flipped); the URI's own origin for a platform subdomain over `https` on the default port and for a system vault host.
- `atVaultOrigin(url)`: a whole URL that data names, re-addressed by `vaultOriginOf`, path and query kept. The URL is first resolved against the platform origin, so a protocol-relative or odd URL is judged by the host the browser would send it to. A URL with a scheme other than `http` or `https` is returned as given.
- `credentialAllowedAt(url)`: true only when the URL may carry a credential: the platform origin itself, or a platform subdomain at exactly the origin the rule would ask it at. A system vault host outside the platform family gets none. A URL the parser cannot read gets none.
- `storeOfOrigin(origin)`: `"identity"` for the platform origin and the system hosts, `"user"` for any other host.
- `recordDoor(entityUri, vaultId)`: the entity's own URI if held, else the vault's, else `null`.
- The builders: `BASE_RELATION_URL(id, at?)`, `BASE_ENTITY_RELATIONS_URL(id, at?)` (host and vault segment of `at`), `LWS_RESOURCE_URL(id, at?)` (no vault segment), and `LWS_VAULT_RECORDS_URL`, `LWS_VAULT_TYPES_URL`, `LWS_VAULT_CONTAINER_URL`, `LWS_VAULT_FILES_URL` (vault id → the vault's own host plus the vault id as one percent-encoded path segment).
- `sessionTokenUrl()`, `sessionDpopTokenUrl()`: the sign-in bridge addresses on the platform origin.
- From the inlined gilb-photo part (`src/photoSegments.ts`): `VAULT_PATH_SEGMENTS` (`["base", "vault"]`), `vaultSegmentOf(uri)` (the first path segment of a URI if it is one of those, else `/base`), `selfCardIdForVault(vaultRoot)` (`vsc-` plus the first 24 hex digits of the SHA-256 of the root) and `SELF_CARD_ID_PREFIX`.

Old name to new name (a later batch renames call sites by script):

| In the app | In this unit |
|---|---|
| `BASE_ORIGIN` | `baseOrigin()` from `base-origin` |
| `SYSTEM_VAULT_HOSTS` | `systemVaultHosts()` from `base-origin` |
| `SESSION_TOKEN_URL` | `sessionTokenUrl()` |
| `SESSION_DPOP_TOKEN_URL` | `sessionDpopTokenUrl()` |
| the local-name test `base.hostname === "localhost"` | `localRigHosts().has(base.hostname)` from `base-origin` |
| the other taken names (`vaultOriginOf`, `LWS_VAULT_RECORDS_URL`, ...) | unchanged |

The unit reads module state of `base-origin` and holds none itself. An app must have ONE copy of `base-origin`; this unit takes it as a peer dependency (`^0.1.0`).

## What this is not

- Not a credential. It decides who may receive one; it forms no header and signs nothing.
- Not the DPoP `htu` rule. The host the proof names (`DPOP_HTU_HOST` in the app) is not here; it belongs to the unit that signs.
- Not the whole address module of the app. Only the symbols the Plan-card readers reach are taken; the other builders of the app's `config.ts` are not in this unit.
- Not a default. With no origin set, the functions that need it throw (see Wrong readings for the exceptions).

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-origin-rule`

From a clone of this repository, install the unit's folder, and its peer first:

```sh
npm install <path-to-the-library>/units/base-origin
npm install <path-to-the-library>/units/vault-origin-rule
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. `selfCardIdForVault` uses Web Crypto (`crypto.subtle`), which a browser and Node both have.

## Examples

```ts
import { setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { credentialAllowedAt, vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

// Once at start-up:
setBaseOrigin("https://platform.example.test");
setSystemVaultHosts(["ontology.platform.example.test"]);

vaultOriginOf("https://kai.platform.example.test/vault/e/x"); // "https://kai.platform.example.test"
vaultOriginOf("https://evil.example/vault/e/x"); // "https://platform.example.test"  (a foreign host is never asked)
credentialAllowedAt("https://evil.example/x"); // false
```

## What the host must supply

- `setBaseOrigin(...)` and `setSystemVaultHosts([...])` from `base-origin`, once at start-up.
- On a local development rig only: `setLocalRigHosts([...])` from `base-origin`. A rig serves plain `http` on one port while its vaults mint as `https://<name>.<rig host>:<port>`; with the rig host named, that vault is fetched over `http` at its own host. With none named (the default) the rule is off and such a vault is asked at the platform origin. A production build leaves it empty.

## Do not

- Do not ask a host of your own choosing for a vault. Let `vaultOriginOf` choose; a data-named host is exactly what the rule keeps the token from.
- Do not add a second host check beside `credentialAllowedAt`. One rule, one place.
- Do not call a getter-form name as a constant: `sessionTokenUrl` is a function, because the origin is set at start-up and not at load.
- Do not rely on `selfCardIdForVault` with a guessed or trimmed root: pass the vault root exactly as the platform stores it (`.../base` and `.../vault` give different ids).

## Wrong readings

- "A foreign host is asked at its own origin." It is not: `vaultOriginOf` answers the platform origin for any host outside the platform family, except a system vault host. This is the security rule, not a defect.
- "A system vault host may receive the credential." Not unless it is in the platform family: `credentialAllowedAt` is false for a system host of another family (a development build reads such a host without a credential).
- "An unset system host list throws." It does not. `vaultOriginOf` and `storeOfOrigin` catch every error the way the app did, so before `setSystemVaultHosts` a host outside the platform family is asked at the platform origin, and `storeOfOrigin` answers `"identity"` for it. `credentialAllowedAt` never reads the list. With no platform origin set, `vaultOriginOf(null)` and the builders throw, and `credentialAllowedAt` answers false.
- "The rig rule works without setting." It does not: see "What the host must supply". Even with a rig host named, `credentialAllowedAt` is true for the `http` form of a rig vault URL and false for its `https` form, because it asks the origin the rule would ask at.
- "`vaultSegmentOf` reads the vault segment anywhere in the URI." Only the FIRST path segment: `/lws/r/x` gives `/base`.
- "gilb-photo is pinned." The app installs that package as `file:../gilb-photo` with no pinned commit, so production used an unpinned local copy. This unit inlines the package at commit `bf56ec7d8bfeb573b338d7248f953fe8e0fdd827` (version 0.2.1).

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, file `src/lib/base/config.ts`, copied by script to `src/vaultOriginRule.ts`: lines 19-72 (`vaultOriginOf`), 74-98 (`atVaultOrigin`), 100-140 (`platformOriginOf`), 169-175 (`systemOriginOf`), 177-194 (`storeOfOrigin`), 196-220 (`credentialAllowedAt`), 222-235 (`isSubdomainOf`), 237-277 (`recordDoor`), 279-281 (`SESSION_TOKEN_URL`), 316-321 (`SESSION_DPOP_TOKEN_URL`), 384-390 (`BASE_RELATION_URL`), 402-408 (`LWS_RESOURCE_URL`), 413-421 (`BASE_ENTITY_RELATIONS_URL`), 467-468 (`vaultSeg`), 470-474 (`LWS_VAULT_RECORDS_URL`), 476-484 (`LWS_VAULT_TYPES_URL`), 486-497 (`LWS_VAULT_CONTAINER_URL`), 521-527 (`LWS_VAULT_FILES_URL`). Lines 1-18 (the file header and `BASE_ORIGIN`), 142-168 (`SYSTEM_VAULT_HOSTS` and its note) and every other builder are not taken. `boundAwait.ts` and `DPOP_HTU_HOST` are not taken (a later batch).

Named changes, and only these:

1. every read of `BASE_ORIGIN` becomes `baseOrigin()` (peer `base-origin`);
2. `SYSTEM_VAULT_HOSTS.has(...)` becomes `systemVaultHosts().has(...)` (the constant, lines 161-167, is not copied);
3. `SESSION_TOKEN_URL` and `SESSION_DPOP_TOKEN_URL`, the only taken constants built from `BASE_ORIGIN` at load, become the functions `sessionTokenUrl()` and `sessionDpopTokenUrl()`;
4. the local-rig test `base.hostname === "localhost"` (line 138) becomes `localRigHosts().has(base.hostname)`;
5. comments that name a host (`gilb.com`, `localhost` and example hosts) are reworded, no code changed.

`src/photoSegments.ts` is the photo package (private repo KaiGilb/gilb-photo, commit `bf56ec7d8bfeb573b338d7248f953fe8e0fdd827`) inlined verbatim: `src/photoRef.ts` lines 17-20 (`VAULT_PATH_SEGMENTS`) and 79-93 (`vaultSegmentOf`), `src/selfCard.ts` lines 38-49 (`SELF_CARD_ID_PREFIX`, `SELF_CARD_HASH_LEN`, `toHex`) and 51-74 (`selfCardIdForVault`). No change; `VAULT_SEGMENT_PATTERN` is not reached and is not taken.

`src/index.ts` is new. Tests: `vaultOriginRule.devLoopback.test.ts` is `vaultOriginDevLoopback.c214.test.ts` (all 11 tests); `vaultOriginRule.d10.test.ts` is the table block and the `atVaultOrigin` control of `credentialHost.d10.test.ts`; `vaultOriginRule.systemHost.test.ts` is the two blocks of `credentialSystemHost.f3.test.ts` that call the rule alone; `vaultOriginRule.addressing.test.ts` is four tests of `vaultHostAddressing.test.ts`. They are ported with the hosts changed to `example.test` hosts, the settings set in place of the environment, and the rig host set to `localhost` where the app ran on a local rig. Left out: `attributeFind.origin.d8.test.ts` and `fanoutDpopHtu.c161c3.qa.test.ts` (they need `attributeFind`, the fan-out and `DPOP_HTU_HOST`), `credentialSeam.f3.test.ts` (it walks the source tree), the other blocks of `credentialHost.d10.test.ts` and `credentialSystemHost.f3.test.ts` (they call the record, relation and photo clients), and the tests of `vaultHostAddressing.test.ts` for builders not taken here. `vaultOriginRule.test.ts` is new and pins every export. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
