# plan-self-source

The signed-in person's own card as the source of what they write: the finding of that card in their landing vault, read once and kept by the page's query cache, and the hook that answers the card's address or nothing.

## What this is

The signed-in person's own card as the source of what they write: the finding of that card in their landing vault, read once and kept by the page's query cache, and the hook that answers the card's address or nothing.

A Plan line stamps what a person writes with a link to their own stakeholder card (`a:statedBy`). The card is found by hard identity only (the card derived for the vault, or the record the vault's profile pointer names, as `own-card` decides) and never by the email, the display name or a token. This unit wires that decision to the record read and to the shell's vault list. It is a separate unit from `plan-stakeholder-io` because it answers a different question (who the writer is, not which records are linked), has a different set of peers (`own-card`, `vault-origin-rule`, `base-origin`), and is optional for a host: the Plan card's provider takes the source as a prop and defaults it to nothing; this unit is how a host can offer the app's own default.

- `useSelfSource(shell)`: a hook; `{ "@id": <the card's address> }` or `null`. `null` while the finding is out, with no landing vault, with no card, and when the read failed: write the value with no source, and say nothing about it. `shell` is what the app's shell holds, as an argument: `vaults` (each with `vaultId`, `entity` and `isLandingVault`), `contentScope.reach` (the session vault's row among them) and `session.vault.entity`. The landing vault is the one flagged `isLandingVault`; else the vault `ownVaultIdOf` names. The object keeps its identity while the address does not change.
- `ownCardFindingQuery(vault)` and `ownCardFindingKey(landingVaultId)`: the one set of query options for the finding of a landing vault (`["own-card", "finding", <vault id>]`, kept for the session, never retried, off for no vault). The finding carries the card's name (`cardName`), read by the finding's own read of the card; `OwnCardFindingNamed` is its type. A page's other readers of the same finding (the Stakeholders list's self row, the own-card test) share this entry, so it is read once per session.
- `ownCardDeps(landing, onCardRead?)`: the two reads `findOwnCard` of `own-card` needs: the vault entity's `a:mnbProfile` pointer (read at the entity's own address; a string, an `{ "@id" }`, or a list of either; none for a blank one or a vault with no entity) and a card by id and address (`{ atId, type }`; `null` on a 404; any other failure throws).
- `ownVaultIdOf({ reach, vaults, sessionVaultEntity })`: the person's own vault, in the order the shell trusts: the session vault's row, else the vault flagged as the landing vault, else the root of the session vault's entity. Never `vaults[0]`, never a name.
- `vaultRootOf(vaultNamespace)` (the vault root exactly as the platform stores and hashes it: origin and the segment the address carries), `PROFILE_POINTER_ATTR` (`mnbProfile`), `joinPersonName(given, family)`.

## What this is not

- Not the decision: `own-card` decides which record is the holder's card; this unit reads for it.
- Not the shell: `useShell` and `ShellContext` stay in the app. Every shell value the source's hook read is an argument here; the app (or the provider of the host unit) passes them.
- Not the vault list: `isLandingVault` is set only on a row decorated by the platform's `GET /lws/vaults` (the app's `useVaults`, which also needs the session). A host whose vault rows come from the session alone has no landing flag; the hook then finds no landing vault unless `contentScope.reach` or the session vault's entity names the person's vault, and answers `null`.
- Not the own-card state of a record (`useOwnCard`, `isOwnCardIn`, `mayBeOwnCard`) and not the Stakeholders list's self row: they use the same finding; they are not reached by a Plan line.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-self-source`

From a clone of this repository, install the unit's folder; `npm install` takes its peers in the order `node scripts/peers.mjs units/plan-self-source` prints:

```sh
npm install <path-to-the-library>/units/plan-self-source
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. `@tanstack/react-query` and `react` are peers at run time. `plan-record-hooks` is a peer for the type `ReachableVault` only.

## Examples

```tsx
import { useSelfSource } from "@kaigilb/gilbplatformcode-plan-self-source";

// In the host's `self` member: the shell is the app's own.
export function useSelf() {
  const shell = useMyShell(); // { vaults, contentScope: { reach }, session: { vault: { entity } } }
  return useSelfSource(shell); // { "@id": "https://…/e/vsc-…" } or null
}
```

## What the host must supply

- The settings the peers need, once at start-up: `setBaseOrigin(...)`, `setSystemVaultHosts([...])` (`base-origin`; the API host named by `baseOrigin()` is the seat's mint host), `setSystemHostLabels([...])` (`own-card`: the first labels of the platform's own hosts), `setLwsAuth(host)` (`lws-session-bridge`).
- One `QueryClient` per app, given to a `QueryClientProvider`.
- The shell's values as the `shell` argument, with `isLandingVault` on the vaults (see "What this is not").

## Module state

None of its own. `own-card` holds the system host labels: an app must have ONE copy of it.

## Do not

- Do not take the email, the display name or a decoded token for the source: it is a card by identity or nothing.
- Do not pass a new `shell` object with new arrays on every render and expect the finding to be read again: it is read once per landing vault id for the session.
- Do not write, repoint or delete a card from the finding.

## Wrong readings

- "`useSelfSource` reads the shell." In the app it called `useShell()`. Here it is given the three values it read, in the shape the shell has them; the body after that is the source's.
- "The landing vault is the first vault." It is the vault flagged as landing, else the person's own vault; never `vaults[0]`.
- "A pointer at any record is followed." It is followed only where `own-card`'s check accepts it (an owner id, in the seat's vault); a pointer at a contact is ignored.
- "A card on another host of the platform is the holder's." The seat's host and the API host decide; a card elsewhere is not.
- "The finding is re-read on a focus or a remount." It is kept for the session (`staleTime: Infinity`) and never retried: a failed read leaves the source null for the session.
- "`ownCardDeps` lists to find a card." There is no listing road: the pointer, the pointed card, the derived card.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`, copied by script:

- `src/lib/base/vaultProfilePhoto.ts` to `src/vaultRoot.ts`: lines 47-48, 106-118 (`PROFILE_POINTER_ATTR` and `vaultRootOf`);
- `src/lib/base/personName.ts` to `src/personName.ts`: lines 23-26 (`joinPersonName`);
- `src/lib/contact/ownVault.ts` to `src/ownVault.ts`: lines 12-23 (`ownVaultIdOf`);
- `src/lib/base/ownCard.ts` to `src/ownCardFinding.ts`: lines 120-211 (`pointerOf`, `ownCardDeps`, `apiHostOf`, `cardNameOf`, `OwnCardFindingNamed`, `ownCardFindingKey`, `ownCardFindingQuery`; not taken: `MYNET_PROFILE_URL`, `mayBeOwnCard`, `isOwnSeat`, `ownCardCandidacy`, `isOwnCardIn`, `OwnCardState` and `useOwnCard`);
- `src/components/records/useSelfSource.ts` to `src/useSelfSource.ts`: lines 13-32 (`SelfSource` and `useSelfSource`).

Named changes, and only these:

1. the imports are replaced by imports of the peers `base-origin` (`baseOrigin`), `lws-records` (`readRecord`), `own-card` (`findOwnCard`, `FindOwnCardDeps`, `OwnCardFinding`), `plan-record-hooks` (the type `ReachableVault`), `vault-origin-rule` (`selfCardIdForVault`, `VAULT_PATH_SEGMENTS` for `gilb-photo`'s, and `vaultSegmentOf`), `@tanstack/react-query` and `react`, and of this unit's own files; the names the code taken does not use are dropped from the import lists;
2. `BASE_ORIGIN` (`ownCard.ts` line 163) is `baseOrigin()`;
3. `useSelfSource()` (`useSelfSource.ts` line 20) is `useSelfSource(shell: SelfSourceShell)`, and the line `const shell = useShell();` (line 21) is gone: the shell is an argument, of the type `SelfSourceShell` (new: `vaults`, `contentScope.reach` and `session.vault.entity`, the three things the body read). `useShell` and `ShellContext` stay in the app; the rest of the body is the source's, line for line;
4. comments are made generic: the header comments are new and shorter; a ticket, a ruling and an agent name in the others are removed; `{@link useOwnCard}` (not taken) is removed; the comment on `vaultRootOf` no longer names the app's `personEntityUri`; no code changed.

`src/index.ts` is new. **Non-GET `bearerHeaderFor` calls in the files taken: none** (the only requests are `readRecord` of `lws-records`, a GET). **Dynamic imports in the files taken: none** (`grep "import("` of `ownCard.ts`, `useSelfSource.ts`, `ownVault.ts`, `personName.ts` and `vaultProfilePhoto.ts`).

**Merged units compared with the app's functions (each reached symbol, comments stripped).** `own-card`: `findOwnCard` and the types are that unit's (inlined from the private package at the pin it cites); the app's own `isHoldersOwnCard` and `ownCardCaseOf` are not reached. `vault-origin-rule`: `selfCardIdForVault`, `VAULT_PATH_SEGMENTS` and `vaultSegmentOf` are the inlined `gilb-photo` symbols at the pin that unit cites (`bf56ec7`). `lws-records` (0.3.0): `readRecord` is equal. `base-origin`: `baseOrigin()` is the setting that stands for `BASE_ORIGIN`. `plan-record-hooks`: `ReachableVault` is the app's type (`lib/base/types.ts`, taken there for `heldVaultIds`).

Tests (`src/*.test.ts` and `.tsx`; shared set-up in `test/support.ts` and `test/cardWire.ts`, not shipped):

| Source | Ported / left out |
|---|---|
| `lib/contact/ownVault.test.ts` (4 cases) | Ported to `src/ownVault.test.ts`: the same inputs and expectations; the hosts are example.test hosts. |
| `lib/base/ownCard.tester-s63.test.ts` (2 cases) and `ownCard.tester-delta.test.ts` (7 cases) | Left out: they test `isOwnCardIn`, which is not reached by a Plan line and not taken. |
| The tests that render the app's cards through `useSelfSource` | Left out: they go through the app's shell. |

New: `src/ownCardFinding.test.ts` (the key, the options, the reads handed to the finder, the finding over a served card: derived, by pointer, none, foreign host, failure), `src/useSelfSource.test.tsx` (the hook against a fake platform: the address, null in each case, the choice of the landing vault, the identity of the answer), `src/small.test.ts` (`vaultRootOf`, `joinPersonName`, more of `ownVaultIdOf`, the index) and `src/hostAgnostic.test.ts` (the same host-agnostic check test as the other units). Mutation checks: 47 mutants of the five source files (`pilot/b3c/tools/specs/m11-plan-self-source.result.txt`): 45 killed. The two that survive are not observable from outside: reading the profile pointer from the served facts only (the read of `lws-records` always carries the served facts, so the fallback to the flat facts is never taken) and handing the finder the vault's entity (it is used for the host only when there is no root, and the root is never empty)..
