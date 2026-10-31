# own-card-state

Tells a record card whether the record is the signed-in person's own card, and draws the band that says so.

## What this is

Tells a record card whether the record is the signed-in person's own card, and draws the band that says so.

A person's own card is edited in the profile app (MyNet), not on a record card: an edit made on the card would reach the record and never the claim that the person's circles read. So a record card asks this unit first, and while the answer is "not yet" or "yes" the card is read only.

- `useOwnCard(record, vaultId, vaults)` is the state of one record: `{ pending, own, standing }`. A record that cannot be his own card (its id is not owner-shaped: not `vsc-...` and not `mnb-profile...`), or that is not held in his seat, answers "not own" on the first render and reads nothing. For a candidate it runs the test of the `own-card` unit: the seat's derived ids (one digest per seat per session); his derived card is his at once; any other candidate is his only when the finding for his landing vault names it (`plan-self-source`'s `ownCardFindingQuery`: the pointer, the pointed record and the derived card, 2 or 3 reads, once per session, shared by every card through the page's query cache). `standing` is how the open card stands to the card MyNet shows: `mynet` (with the other own cards seen), `other` (naming the card MyNet shows) or `unknown`.
- **It is a guard.** While the test is pending (`pending: true`) the card must stay read only: the digest is out, or the record can only be made his by the finding and the finding is out. A failed finding makes a pointer-only candidate an ordinary record (never "his" by its id); his derived card stays his whatever the finding does.
- `mayBeOwnCard(record)`: the synchronous gate, a necessary condition only (owner-shaped id). `isOwnSeat(vault, vaults)`: his landing vault, held, typed Person or untyped; never an organisation's vault nested under his, never a vault shared with him. `ownCardCandidacy(recordId, vault, vaults)`: `"no"`, `"derived"` or `"finding"`, with no request but the digest. `isOwnCardIn(recordId, vault, vaults, finding?)`: the whole decision, for a caller that already holds the finding.
- `OwnCardBand({ state, onOpen })`: draws only for `own`. It says "Your own card", whether it is the card MyNet shows, offers to open the card MyNet shows (`other`) or the second own card (`mynet` with more), says what is only here, and has one link, "Edit in MyNet", in a new tab. `ownCardRowWords(state)` is the words for a grid row of the own card, else null. `OWN_CARD_WORDS` holds every sentence.
- `setMyNetProfileUrl(url)`, `myNetProfileUrl()`, `resetMyNetProfileUrl()`: the unit's one setting (see "What the host must supply").

## What this is not

- Not the finding. `ownCardFindingQuery`, `ownCardDeps` and `ownCardFindingKey` are `plan-self-source`'s; this unit takes the query and does not copy it. Not the decision itself either: `isHoldersOwnCard`, `ownCardCaseOf` and `ownCardIds` are `own-card`'s.
- Not a writer. Nothing here writes, repoints or deletes a card; the only requests are reads (below).
- Not the card. The composition that makes the card read only (`canWrite = entityCanWrite && !own`) is the card's.

## How to take it

Package: `@kaigilb/gilbplatformcode-own-card-state`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/own-card-state` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/own-card <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/result-total <path-to-the-library>/units/self-card <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/pick-or-create <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/person-create <path-to-the-library>/units/own-card-state
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Tailwind utility classes over CSS variables, no stylesheet of its own. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/own-card-state/src";`. The page must define these variables (all eight are read):

`--r-md` (the corner radius of the band and the link), `--line` (their border), `--surface-hi` (the band's background), `--surface` (the link's background), `--sel` (the link under the pointer), `--ink` (the band's text), `--ink-soft` (the small text: it must reach 4.5:1 on `--surface-hi`), `--accent-ink` (the buttons and the link: it must reach 4.5:1 on `--surface-hi` and on `--surface`).

## Requests and their servers

The state itself asks for nothing but the digest (Web Crypto, in the browser) and, for a candidate in his seat that is not his derived card, the finding. The finding is `plan-self-source`'s, made with `readRecord` of `lws-records` (`GET /lws/r/<id>`), all of it at the holder's OWN vault node: the authority of his landing vault's entity address (the vault entity, for `a:mnbProfile`), then the pointed card and the derived card at the address the pointer or the vault root gives. The platform answers a record only at the node that holds it; with the platform's apex set as the base origin, every vault's subdomain resolves to its own node. Once per session, shared through the page's query cache (`["own-card", "finding", <landing vault id>]`, `staleTime` infinite). A record whose id is not owner-shaped makes no request.

It writes nothing: no PATCH, no POST. The band's link leaves the app (a new tab).

## Examples

```tsx
import { OwnCardBand, setMyNetProfileUrl, useOwnCard } from "@kaigilb/gilbplatformcode-own-card-state";

setMyNetProfileUrl("https://profile.example.test/profile"); // once, at start-up

function Card({ record, vaultId, vaults, onOpen }: Props) {
  const own = useOwnCard(record, vaultId, vaults); // { pending, own, standing }
  const canWrite = entityCanWrite && !own.pending && !own.own; // read only while it is not yet known, and for his own card
  return (
    <>
      <OwnCardBand state={own} onOpen={onOpen} />
      {/* ... */}
    </>
  );
}
```

## What the host must supply

- `setMyNetProfileUrl(<address>)`, once at start-up: the address of the profile editor, an absolute http or https address with no user name or password. **This setting is new in this unit**: the source built it at module load from the profile app's base address. `OwnCardBand` reads it when it draws and throws, naming the setter, when it is not set. It is not read for a band that does not draw.
- One `QueryClientProvider` above the hooks (the unit makes no client).
- The settings the peers need, once at start-up: `setBaseOrigin(...)` (and `setSystemVaultHosts([...])`) from `base-origin`, the auth seam `setLwsAuth(...)` from `lws-session-bridge`, and `setSystemHostLabels([...])` from `own-card` (the finding reads it).
- The session's reachable vaults (`vaults`) and the vault the record is held in (`vaultId`). With no vault list there is no seat and nothing is his.
- Tailwind scanning this unit's `src` and the CSS variables above.

## Module state

One piece of its own: the profile address (`myNetProfileUrl.ts`), `null` until `setMyNetProfileUrl` is called. An app must have ONE copy of this unit, or each copy keeps its own address. The query client holds the rest (`["own-card", "ids", <vault id>]` and the finding), for the session.

## Do not

- Do not open a card for edit while `pending` is true, and do not read `own: false` as "editable" without reading `pending`: a candidate answers `{ pending: true, own: false }` until the digest and, for a pointer-only candidate, the finding are in.
- Do not decide by the id: `mayBeOwnCard` is a gate, not the decision. A record merely named "MNB Profile ..." has an `mnb-profile...` id and is an ordinary record unless the vault's pointer names it.
- Do not treat a vault that merely holds a person's derived card as his seat: an organisation's vault nested under his has a derived card too, and it is the organisation's.
- Do not add a listing road or a name road to find the card.
- Do not install a second copy of this unit, of `own-card` or of `plan-self-source`.

## Wrong readings

- "A failed digest keeps the card read only." Not in full. `own-card`'s `ownCardIds` swallows a digest that fails (no Web Crypto): the seat then has no derived id and the derived card is not recognised as his by id. While the finding is out the card is pending (read only); once the finding is in, the derived card is his only if the pointer names it, else it is an ordinary record. A digest that never answers keeps the card pending, read only, for good (tested). The source's comment says a failed digest "leaves `data` undefined"; that holds only for a query that rejects, which `ownCardIds` does not.
- "His derived card waits for the finding." It does not: it is his as soon as the digest is in; only `standing` waits (`unknown` until the finding is in).
- "`/base` and `/vault` are two vaults." On one origin they are one: the sibling root's derived id counts too.
- "The band can be drawn before the address is set." It cannot: it throws.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script:

- `src/lib/base/ownCard.ts` to `src/ownCardState.ts`: lines 38-119 (`mayBeOwnCard`, `representsPerson`, `isOwnSeat`, `OwnCardCandidacy`, `ownCardCandidacy`, `isOwnCardIn`) and 215-271 (`OwnCardState`, `NOT_OWN`, `PENDING`, `useOwnCard`).
- `src/components/records/OwnCardBand.tsx` to `src/OwnCardBand.tsx`: the whole file (`OWN_CARD_WORDS`, `OwnCardBand`, `ownCardRowWords`).

Named changes, and only these:

1. **the host literal becomes a setting** (the one change in what the code does). `MYNET_PROFILE_URL` (`ownCard.ts` line 36, `${MYNET_BASE}/profile`, a constant built when the module loads) is not copied. The band's `href={MYNET_PROFILE_URL}` is `href={myNetProfileUrl()}`, read when the band draws. The setting is in the new file `src/myNetProfileUrl.ts` (`setMyNetProfileUrl`, `myNetProfileUrl`, `resetMyNetProfileUrl`). The source's `mayBeOwnCard`, `isOwnSeat` and the rest do not use it.
2. The imports are imports of units: `SELF_CARD_ID_PREFIX`, `VAULT_PATH_SEGMENTS`, `selfCardIdForVault` from `vault-origin-rule` (`gilb-photo`'s in the source); `OWN_CARD_SLUG_PREFIX`, `isHoldersOwnCard`, `ownCardCaseOf`, `ownCardIds` and the types `OwnCardCase`, `OwnCardFinding` from `own-card` (`gilb-stakeholders`'s); `isHeldVault` from `person-create`; `typeLocalName` from `lws-vault-sets`; `vaultRootOf` from `plan-self-source` (the same function as `vault-profile-photo`'s, 0 diff; taken here because that peer is needed anyway, and `PROFILE_POINTER_ATTR`, the only other reason for `vault-profile-photo`, is not reached by the cut ranges); `ReachableVault` from `plan-record-hooks`; `ownCardFindingQuery` from `plan-self-source`. `OwnCardBand` imports `OwnCardState` from the new file name.
3. The header comments are new and shorter, and the comments that name a cycle, a ruling, an agent or a ticket are reworded with the same facts. No code changed.

The comment-stripped, import-free `ownCardState.ts` equals the source's lines 38-119 and 215-271 (0 diff, 345 words each). `OwnCardBand.tsx` equals the source file but for the one `href` (304 words each). `src/index.ts` and `src/myNetProfileUrl.ts` are new.

Not taken, because `plan-self-source` already holds it: lines 120-214 of the source (`pointerOf`, `ownCardDeps`, `apiHostOf`, `cardNameOf`, `OwnCardFindingNamed`, `ownCardFindingKey`, `ownCardFindingQuery`; compared for this unit against the source, comments stripped: all 0 diff but `apiHostOf`, whose 2 lines are `BASE_ORIGIN` read as `baseOrigin()`, that unit's named change). `findOwnCard` and `PROFILE_POINTER_ATTR` are not reached by the cut ranges.

**Which unit holds `selfCardIdForVault`.** Three units hold a copy of the derivation, and they are not equal. `vault-origin-rule` compares 0 with the `gilb-photo` the source pins (`~/Developer/gilb-photo`, read at commit `bf56ec7`, `src/selfCard.ts` and `src/photoRef.ts`: `selfCardIdForVault` 50 words, 0 diff; `SELF_CARD_ID_PREFIX` and `VAULT_PATH_SEGMENTS` 0 diff). `self-card` (and `photo-ref`'s) differs: its `selfCardIdForVault` also REFUSES a vault root that ends in a slash (3 diff lines). The input here is always `vaultRootOf(...)`, which never ends in a slash, so the two would answer the same; the unit takes the one that equals the source's. `vaultRootOf` (`plan-self-source` and `vault-profile-photo`) and `typeLocalName` (`lws-vault-sets`) and `isHeldVault` compare 0 with the source's.

## Tests

94 tests in 7 files (`npx vitest run`):

- `ownCardState.tester.test.ts` 9: ported from the source's `ownCard.tester-delta.test.ts` (7) and `ownCard.tester-s63.test.ts` (2): records he named "MNB Profile ..." are not his, his derived card is, a legacy card is his only when a finding names it, a nested person vault's and a shared vault's cards are not, an organisation vault's derived card is not. Hosts are example hosts; the derived id is `vault-origin-rule`'s.
- `OwnCardBand.axe.test.tsx` 5: ported from `OwnCardBand.axe.tester-s63.test.tsx` (4 states and the control that axe can fail), with `axe-core` as a dev dependency.
- `ownCardState.test.tsx` 37 (new), over the real `own-card`, `plan-self-source`, `lws-records` and `vault-origin-rule` and a fake platform that answers a record only at the host that holds it (`test/support.ts`, a fake `fetch` and a fake auth host, no timers): `mayBeOwnCard`, `isOwnSeat` (landing, untyped, other type, local name, nested, shared, read only, none), `ownCardCandidacy` and `isOwnCardIn`, and `useOwnCard`: nothing read for a contact or outside his seat; the guard (pending on the first render, pending while the finding is out, his derived card own before the finding is in, a digest that never answers stays pending and the finding is never asked); hard identity (pointer as object, string or list; a pointer at another card or another vault; a record merely named "MNB Profile ..."; `other` standing); a finding that fails; a digest that rejects; one finding read for the session; the reads go to the holder's own node; only GETs.
- `OwnCardBand.test.tsx` 20 (new): when it draws, the caption per case, opening the other and the second card, the link (setting, new tab, no opener, read at draw, throws when unset), the colour classes and touch targets, `ownCardRowWords`, every sentence pinned.
- `myNetProfileUrl.test.ts` 7, `exports.test.ts` 3, `hostAgnostic.test.ts` 13 (the same host-agnostic check test as the other units; it writes to the OS temp directory).

Mutation checks: 36 mutants of `ownCardState.ts`, `OwnCardBand.tsx` and `myNetProfileUrl.ts`: 12 aimed at the read-only guard (each pending return, the pending constant, the finding's failure, the pointer check, the order of the digest and the finding, the non-candidate answer, the digest query for every record), 10 at the seat and the gate, 9 at the band and the row words, 5 at the setting. 35 killed, 1 equivalent: not trimming the text in `setMyNetProfileUrl` changes nothing, because the URL parser strips leading and trailing spaces itself.

Left out, with reasons: `OwnCardBand.contrast.o1.test.tsx` (2): it reads the host app's token file (`src/styles/tokens.css`) and derives the colours from it; this unit has no tokens. What it measured is pinned as the classes (the small text on `--ink-soft`, the link on `--accent-ink` over `--surface`) and listed in "Styling". `RecordDetail.ownCard.o1.test.tsx` (38): the card-level pin; it renders the whole `RecordDetail`, so it belongs to the composition.
