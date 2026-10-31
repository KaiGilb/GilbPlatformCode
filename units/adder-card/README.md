# adder-card

Finds or makes the signed-in person's own card, the source of what they add.

## What this is

Finds or makes the signed-in person's own card, the source of what they add.

The source (`a:statedBy`) of anything a person adds, in ANY vault they may write, is THEIR OWN card in THEIR personal (landing) vault; never the card of the vault being written to, nor of its holder, even when that vault has one. `a:statedBy` may point at a card in another vault and grants no access. This unit is the one place that finds that card.

- `adderCardOf(vaults, queryClient, { email? })` answers the card's address (what to write under `a:statedBy`): the card found by the own-card finding (`plan-self-source`) in the landing vault of `vaults`, read once per session through the query client's cache under the finding's own key; its served `@id` when it has one, else its address. A person with NO card yet gets a BASIC one made in the landing vault (`vault-profile-photo`'s idempotent self-card door), named from the sign-in email when one is given (`nameFromEmail`), else with the vault's label, and read back at the landing vault's own address. Three asks at once are one ask (the same promise) and make ONE card. With no landing vault in `vaults` it rejects with `NoOwnVaultError` before any request.
- `useAdderCard(enabled = true)` is the same for a component or hook: `{ card, pending, noOwnVault, error, resolve, find }`. `card` is the card as far as it is known (a READ; null while unread or when there is none); `pending` is true while the vault list or the finding is out; `noOwnVault` is true only when the list is read, the person is signed in, and it holds no landing vault (say `NO_OWN_VAULT_SAYS`); `error` is a finding that could not be read. `resolve()` is for WRITE paths: the card to state, making the basic one when there is none, rejecting with the sentence to show. `find()` is read-only: the card, or null; it makes nothing.
- `landingVaultOf(vaults)` is the vault flagged as the landing vault (never the first). `nameFromEmail(email)` guesses a name from a sign-in email (`petter.hansen@example.test` is "Petter Hansen"; the part before a `+tag` and before the `@`, split on `.`, `_`, `-`). `NO_OWN_VAULT_SAYS` and `NoOwnVaultError` are the refusal.
- The host seam: `AdderCardHostProvider`, `AdderCardHostContext`, `useAdderCardHost`, type `AdderCardHost` (see "What the host must supply").

## What this is not

- Not the own-card finding itself (`plan-self-source` and `own-card` decide which record is the card) and not the self-card door (`vault-profile-photo`).
- Not a fetch of the vault list: `useAdderCard` reads the list through the SAME query key the shell holds (`vaultsKey`, `reachable-vaults`), so no second request is made when the shell has it.
- Not the session: the session is the host's (one member, `useSession`).
- Not a write of a claim. It writes only the basic card, and only from `adderCardOf` / `resolve()`; `useAdderCard`'s `card`, `pending`, `find()` never write.

## How to take it

Package: `@kaigilb/gilbplatformcode-adder-card`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/adder-card` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/own-card <path-to-the-library>/units/photo-term <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## What it writes

It WRITES one thing, rarely: when the signed-in person has no card of their own in the landing vault, `adderCardOf` (and `resolve()`) make the basic one: `POST /lws/vault/<landing vault>/selfcard` (the platform's idempotent door, which answers the existing card untouched with 200 when there is one), with the card's name and nothing else, then reads it back (`GET /lws/r/<id>`). Three adds at once make ONE card (one making per query client and landing vault). It never makes a card in any other vault, never through the record-create door, and never from a read (`card`, `pending`, `find()`).

## Requests and their servers

- `GET /lws/vaults`: through `reachable-vaults` (`listReachableVaults`), only when the query client does not already hold the list under the principal's key (60 s fresh). Answered by the base address, as the shell's own read is.
- The own-card finding (`plan-self-source`): `GET /lws/r/<id>` of the vault's profile pointer, of the pointed card and of the derived card, each at the landing vault's OWN node (the platform answers a record only from the vault that holds it). Once per session per landing vault.
- `POST /lws/vault/<landing vault>/selfcard`: the landing vault's own node, only when there is no card. `GET /lws/r/<id>` once after it, at the same node.
- Credentials are signed for the host each request names, through the auth seam of `lws-records` and `vault-profile-photo` (`lws-session-bridge`), as for every unit.

## Examples

```tsx
import { AdderCardHostProvider, useAdderCard } from "@kaigilb/gilbplatformcode-adder-card";

// Once, above the cards: the passive session read the app already has.
<AdderCardHostProvider value={{ useSession: (opts) => useMySession(opts) }}>{children}</AdderCardHostProvider>;

const adder = useAdderCard();
// a read:  adder.card, adder.pending, adder.noOwnVault
// a write: const stater = await adder.resolve(); // makes the basic card if there is none
```

## What the host must supply

- `AdderCardHost.useSession({ enabled: false })`: the app's session hook, called PASSIVELY (`enabled: false`). It must see whatever session query the shell already holds and NEVER fetch or mint one; `data?.principal` is the signed-in principal (`undefined` while there is none). `useAdderCard` throws, naming `AdderCardHostProvider`, when there is no provider. The pure half (`adderCardOf`, `landingVaultOf`, `nameFromEmail`) needs no host.
- One `QueryClientProvider` above the hook.
- The platform settings the peers need, once at start-up: `setBaseOrigin(...)`, `setSystemVaultHosts([...])` (`base-origin`), `setSystemHostLabels(...)` (`own-card`) and the auth seam `setLwsAuth(...)` (`lws-session-bridge`).

## Module state

One `WeakMap` keyed by query client (`making`): the card being made, per landing vault, so that asks at once are one ask. It holds a promise only while it runs and is dropped when it settles. `AdderCardHostContext` is one React context; a provider from another installed copy of this unit is not seen.

## Do not

- Do not state a vault's own card as the source of what a person adds there; the source is the PERSON's card in THEIR landing vault.
- Do not make the card from a read: only a write path calls `resolve()` / `adderCardOf`.
- Do not hand `useSession` a hook that fetches or mints the session: this unit asks it not to.
- Do not keep a second copy of these functions in another unit (the provider `stakeholder-card-hosts-gilbplatform` holds a copy of the pure half; it is untouched, and imports from here when it is next re-versioned).

## Wrong readings

- "`card` is null, so the person has no card." It is null while unread, while the vault list is out, with no principal, and when there is none; `pending` and `noOwnVault` say which.
- "`find()` makes the basic card." It never does.
- "`noOwnVault` is true while the list loads." It is true only once the list is read (or failed) and holds no landing vault.
- "The card is stated by its address." By its served `@id` when the finding has one, else its address.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/lib/base/adderCard.ts` to `src/adderCard.ts`, the whole file (169 lines: `NO_OWN_VAULT_SAYS`, `NoOwnVaultError`, `landingVaultOf`, `nameFromEmail`, `making`, `readFinding`, `findOrMake`, `adderCardOf`, `AdderCardState`, `listOptions`, `useAdderCard`).

Imports: `readRecord` from `lws-records`; `NotSignedInError` from `lws-session-bridge`; `ReachableVault` from `plan-record-hooks`; `ownCardFindingKey`, `ownCardFindingQuery` from `plan-self-source`; `listReachableVaults`, `vaultsKey` from `reachable-vaults`; `vaultLabel` from `vault-list`; `ensureVaultSelfCard`, `vaultRootOf` from `vault-profile-photo`.

Named changes, and only these: the imports; `useSession` of the app's `hooks.ts` (a hook over the app's session key, in no unit) is now `host.useSession` of `useAdderCardHost()`: the two lines `const host = useAdderCardHost(); const session = host.useSession({ enabled: false });` replace `const session = useSession({ enabled: false });`, and `src/adderCardHost.tsx` is new; the comments that name a cycle, a ticket, a ruling, a person or a host are reworded with the same facts (the two example emails use the library's example host). The comment-stripped file, imports excluded, equals the source but for those lines (3 diff lines, 568 and 572 words). Each of the eight pure declarations (`NO_OWN_VAULT_SAYS`, `NoOwnVaultError`, `landingVaultOf`, `nameFromEmail`, `making`, `readFinding`, `findOrMake`, `adderCardOf`) is token-equal to the source's AND to the provider's copy in `stakeholder-card-hosts-gilbplatform/src/adderCard.ts` (0 diff lines each).

## Tests

49 tests in 3 files (`npx vitest run`):

- `adderCard.test.tsx` 33: the pure half and `adderCardOf` are ported from the provider's `adderCard.test.ts` (16 cases, re-based on `test/support.ts`: the real `lws-records`, `plan-self-source`, `own-card`, `vault-profile-photo` and `vault-origin-rule` over a fake `fetch` with one landing vault and the self-card door) and from the app's `sourceIsAdder.sb1a.test.ts` (the `nameFromEmail` case); the source's other `sb1a` cases go through `recordPerson` and the held-claim hooks (not units here) and are left out. The `useAdderCard` and host-seam cases (13 + 4) are new: the source exercises the hook only through the held-claim hooks.
- `exports.test.ts` 3: the nine exports and their arities, and that `making`, `findOrMake`, `readFinding` stay private.
- `hostAgnostic.test.ts` 13: the same host-agnostic check test as the other units (it writes to the OS temp directory).
- `test/adderCardMock.ts`: the app's `adderCard.testkit.ts` copied unchanged under a header that names it (a test seam that stands in for this module in a test of a consumer, as `held-notes` does); it is not run here.

Mutation checks: 29 mutants of `src/adderCard.ts` and `src/adderCardHost.tsx` (the landing vault choice, the sentence, the three name rules, the one-making rules, the served `@id`, the invalidation after a make, the root check, the name source, the read-back address and the unreadable read-back, the swallowed read and make failures, the refusal, the passive session, the list and finding enablement, `card`, `noOwnVault`, `pending`, `error`, `find`, and the missing provider), 28 killed, 1 equivalent (the read-back path: the request is addressed by the id and the origin of the address, so a changed path before the id changes nothing). Five first survived (the list enabled without a principal, the finding read without a landing vault, `noOwnVault` while the list is out, `pending` ignoring the finding); a test was added for each.
