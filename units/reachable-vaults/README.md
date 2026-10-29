# reachable-vaults

Reads the vaults the signed-in person can reach, with their names, parents and landing flag, and decorates the session's vault set with them.

## What this is

Reads the vaults the signed-in person can reach, with their names, parents and landing flag, and decorates the session's vault set with them.

The sign-in gives only a lean set: each vault's id and the modes held. `GET /lws/vaults` gives the same vaults with their entity, name, parent, type, landing flag and short name. This unit asks the second and lays it over the first. The session's set is the membership: the answer can add no vault, remove none and change no mode. A slow or failed answer leaves lean rows, never fewer vaults.

- `listReachableVaults()`: one signed GET of `lwsVaultsUrl()`, answered as `ReachableVault[]` (the type of `plan-record-hooks`). A node with no `vaultId` is dropped. `partOf` gives the parent only when it names both the entity and the vault; `isLandingVault` and `parentAmbiguous` are true only for the value `true`; `represents` is trimmed and null when blank or not text; the short name is known only when the node says `podNameKnown: true`. Modes go through `narrowVaultModes` of `vault-modes`. The credential is the Bearer pair first, then the DPoP read pair when the first has no `authorization` or the seam throws. A 401 drops the DPoP token and rejects with `NotSignedInError`; another failure rejects with the server's sentence.
- `decorateSessionVaults(set, richList, enrichFailed)`: pure. The session set, in its order, each row decorated by the `richList` row with the same `vaultId`, else lean (`entity`, `name`, `parent`, `represents`, `shortName` null; `parentAmbiguous`, `isLandingVault` false; `shortNameKnown` false). Modes are the session's. One case differs: an empty session set with a non-empty `richList` and `enrichFailed` false returns the `richList` itself.
- `useVaults(session)`: the React Query hook GilbApp's shell used. It reads `listReachableVaults` under `vaultsKey(session.principal)` (`staleTime` 60 s, no retry of a `NotSignedInError`, at most two other retries), enabled when there is a principal, and returns `{ vaults, isPending, error, refetch }` with the vaults from `decorateSessionVaults`. `isPending` is true only while signed in with an empty session set and the first answer not in. `error` is shown only when the session set is empty and the answer failed.
- `vaultsKey(principal)`: `["base", "vaults", principal ?? "anonymous"]`, scoped to the person so another sign-in is never served this one's reach.
- `lwsVaultsUrl()`: the address, built from the base-origin setting at each call.
- The types `SessionVaultRow`, `ReachableVaultsSession` and `ReachableVaultsView`.

## What this is not

- Not the membership source: the session is. An app that has no session set gets the answer's own set only when the session set is empty.
- Not a store of the list: the hook keeps nothing but the React Query entry under `vaultsKey`.
- Not the vault tree, the vault labels or the write-vault choice (`vault-list`).

## How to take it

Package: `@kaigilb/gilbplatformcode-reachable-vaults`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/reachable-vaults` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/reachable-vaults
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. The closure is large (41 units) because the type `ReachableVault` is the one `plan-record-hooks` declares; an app that has the Plan-card or the Stakeholder units already has them all.

## Examples

```ts
import { useVaults } from "@kaigilb/gilbplatformcode-reachable-vaults";

function Shell({ session }: { session: GilbSession | undefined }) {
  const { vaults, isPending } = useVaults(session); // session: { principal, vaults: [{ vaultId, modes }] }
  const landing = vaults.find((v) => v.isLandingVault) ?? null;
  // ...
}
```

```ts
import { decorateSessionVaults, listReachableVaults } from "@kaigilb/gilbplatformcode-reachable-vaults";

const vaults = decorateSessionVaults(session.vaults, await listReachableVaults(), false);
```

## What the host must supply

Nothing as an object. The unit reads two settings that the app sets once at start-up:

- the base origin (`setBaseOrigin` of `base-origin`), which builds the address;
- the auth seam (`setLwsAuth` of `lws-session-bridge`), which forms the credential headers. It forms none for an address outside the platform's family.

`useVaults` needs a React Query `QueryClientProvider` above it.

## Module state

None. The unit holds no cache of its own.

## Do not

- Do not take the answer's set as the membership. Pass the session's set to `decorateSessionVaults`.
- Do not read the `isLandingVault` flag as "the person's vault" when no row carries it: none is substituted.
- Do not build the address yourself. It follows the base-origin setting.

## Wrong readings

- "The answer can add a vault the session does not list." It cannot, except when the session set is empty and the answer did not fail.
- "A failed decoration gives an error." Not while the session set has rows: the rows stay lean and `error` is null.
- "`enrichFailed` follows the hook's re-render." The memo in `useVaults` is keyed on the session's set and the answer's data only, as in the source, so a failure that arrives with no change of data does not recompute the list. The source has the same property (a quirk kept, not fixed).
- "The mode of a vault comes from `GET /lws/vaults`." It comes from the session.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `9a602ea7dfbbc1433f6cf566dae24eed0abfb8a6`, copied by script:

- `src/lib/base/vaultSets.ts` lines 62-83 (`lwsReadAuth`) and 111-120 (`throwForStatus`), both private functions of that file, to `src/reachableVaults.ts`. The unit `lws-vault-sets` holds the same two privately (not exported), so they are copied from it; the token comparison with the app is in the table below.
- `src/lib/base/vaultSets.ts` lines 122-209 (the wire types, `readVaultShortName`, `listReachableVaults`) to `src/reachableVaults.ts`.
- `src/lib/base/hooks.ts` lines 54-58 (`vaultsKey`), 60-67 (`ReachableVaultsView`) and 69-152 (`useVaults`) to `src/reachableVaults.ts`.
- `src/lib/base/config.ts` line 430 (`LWS_VAULTS_URL`) to `lwsVaultsUrl` in `src/reachableVaults.ts`.

Named changes, and only these:

1. `LWS_VAULTS_URL`, a constant built from the base origin when the module loaded, is the function `lwsVaultsUrl()`, built from the base-origin setting at each call (the setting unit's rule); `listReachableVaults` calls it at both places the source used the constant.
2. The imports: `NotSignedInError`, `bearerHeaderFor`, `dpopReadAuth`, `invalidateDpop` from `@kaigilb/gilbplatformcode-lws-session-bridge`; `serverErrorText` from `lws-records`; `narrowVaultModes` from `vault-modes`; the type `ReachableVault` from `plan-record-hooks`. In the source these are `./token`, `./bearer`, `./dpop`, `./serverError` and `./types`.
3. `lwsReadAuth` passes the method to `bearerHeaderFor(url, method)`, as `lws-vault-sets` does (the bridge's signature took the URL alone in the app).
4. The `useMemo` of `useVaults` is the function `decorateSessionVaults(set, richList, enrichFailed)`: its body is the memo's body (`hooks.ts` lines 100-131) with `enrich.isError` as the parameter `enrichFailed`; the hook calls it with `session?.vaults ?? []`, `enrich.data ?? []` and `enrich.isError`, and the same dependency list.
5. `useVaults` takes `ReachableVaultsSession | undefined` (`{ principal?, vaults? }`) in place of the app's `BaseSession`; the hook reads `principal` and `vaults` only.
6. Comments: cycle, ticket and person tags are removed; no code changed.

New file: `src/index.ts`.

Token comparisons (comment-stripped, the declaration against the app's, `tools/tokdiff.mjs` of the census): `ReachableVault` 58/58 equal, `ReachableVaultParent` 12/12 equal, `throwForStatus` 69/69 equal, `NotSignedInError` 22/22 equal. `lwsReadAuth` differs only at the method argument (change 3). `narrowVaultModes` of `vault-modes` differs from the app's in its parameter types only (`readonly string[] | null | undefined` against `string[] | undefined`); its body is the same.

Tests (`src/*.test.ts`, 55): `reachableVaults.test.ts` has the 5 tests of the app's `lib/base/reachableVaults.test.ts` (same inputs and expectations; the `./dpop` mock is a fake auth host of `lws-session-bridge`; the assertions about `vaultLabel`, `canWriteVault` and `modesLabel`, functions of the app's types file, are left out) and 15 added; `decorateSessionVaults.test.ts` 13 added; `useVaults.test.tsx` 8 added; `exports.test.ts` 1; `hostAgnostic.test.ts` 13 (copied). The app has no test of the merge alone: its other tests render the whole page.

Left out: the app's page tests that mock `listReachableVaults` (`AppShell.*`, `VaultsView`, `RecordGrid.*`, `VaultSectionButtons.*`, `ModeNav.*`); they belong to the app.
