# person-connections

Reads which of a holder's circles each person is placed in, and resolves a person's public card.

## What this is

Reads which of a holder's circles each person is placed in, and resolves a person's public card.

Plain functions and types, no React, no credential. The platform keeps four rung sets for a holder (personal and professional, each as Inner Circle or 1st Connection) and answers sets, not people. This unit reads those sets, composes them into one entry per person, and, for a held record or a principal, says which person a card is about and which circles the holder placed that person in. Every request goes through the `PlatformClient` of `record-sync` (its `fetch` is yours and adds the credential); nothing is written.

- `readConnections(client, { vaultId?, vaultOrigin, admit? })`: `GET /base/connect/audience-rung/members[?vaultId=...]`; answers `{ holder, vaultId?, sets, people }`. A refused read throws `AudienceRungMembershipError` (`status`). `AUDIENCE_RUNG_MEMBERS_PATH`.
- `composeConnectionsFromSets(sets, { admit? })`: one `ConnectedPerson` (`principal`, `placements`) per distinct member, more placements first, then by principal. `placementOf(people, principal)`: that member's placements (a copy), or `[]`.
- The placements: `ATOMIC_PLACEMENTS` (the four storable ones, broader rung first), `DERIVED_UNIONS` (the two either-context unions: reach, never stored), `atomicRungTerm`, `placementKey`, `placementsEqual`, `placementLabel`, `displayPlacements` (Inner Circle only, when both depths are stored), `qualifiesForDerivedUnion`, `CONTEXT_WORDS`, `DEPTH_WORDS`; types `AudienceContext`, `AudienceDepth`, `AtomicPlacement`, `AudienceRungSetRecord`.
- `createPrincipalCanonicaliser(platform, { maxLookups? })`: member to the principal it names today, through `GET /base/connect/resolve-person?input=`; cached, bounded (`MAX_CANONICAL_LOOKUPS` = 50 requests), each request ends after `CANONICAL_REQUEST_TIMEOUT_MS` (10 000). `answered(member)` tells "no person" (an answer) from "could not ask". Helpers: `opaqueSelf`, `isOldWebIdMember`, `membersToAsk`, `CANONICAL_CONCURRENCY` (4), `RESOLVE_PERSON_PATH`; types `PrincipalCanonicaliser`, `AnsweringCanonicaliser`.
- `resolveOnlineCard(platform, record, bound?)`: `GET /base/connect/online-card-anchor?record=`, one request; answers a `ResolveOutcome` (`person`, `organization`, `none`, `unauthenticated`, `unavailable`, `busy`). `ONLINE_CARD_ANCHOR_PATH`.
- `resolvePersonCard(deps, subject)`: `{ record: { uri, link } }` or `{ principal }` in; `{ party, how, placements, link, anchor, connections }` out. Never throws for a failed read. Types `PersonCardSubject`, `PersonCardDeps`, `PersonCard`, `ConnectionsReading`, `ReadConnectionsOptions`, `ConnectedPerson`, `ComposeOptions`.
- `heldNoteKey({ linkedPrincipal?, linked?, linkAnswer?, record? })`: the one key (`a:heldParty`) a person's note is read and written under: the principal for a linked person, the record's address for a local one, `null` while a link is unknown.

## What this is not

- Not a writer: placing and removing people is the app's. Nothing here writes a placement, a link or a note.
- Not a cache of the connections: `readConnections` is a request each time. `resolvePersonCard` takes `connections()` from you, so the app reads them once per holder per session and shares the answer.
- Not the reader of one record's link (`readLink`, in `online-card-link`), nor the card controller, the public-card finder or the rung words of the online card.
- Not a matcher by name or by address shape. A person is matched only on the platform's answer; no spelling is rewritten here.

## How to take it

Package: `@kaigilb/gilbplatformcode-person-connections`

From a clone of this repository, install the peers first, then the unit's folder:

```sh
npm install <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. `record-sync` (`^0.3.0`) is a peer: the unit takes its `PlatformClient`, and a failure to reach the platform is its `PlatformError`, so an app must have ONE copy of `record-sync` for `instanceof` to answer the same everywhere. `online-card-link` (`^0.1.0`) is a peer for the `LinkReading` type only.

## Examples

```ts
import {
  createPrincipalCanonicaliser,
  displayPlacements,
  placementLabel,
  readConnections,
  resolvePersonCard,
} from "@kaigilb/gilbplatformcode-person-connections";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

const identity: PlatformClient = { origin: "https://id.platform.example.test", fetch: authenticatedFetch }; // yours
const canonical = createPrincipalCanonicaliser(identity); // one per holder per session

let reading: ReturnType<typeof readConnections> | undefined;
const connections = () =>
  (reading ??= readConnections(identity, {
    vaultId: "https://ann.platform.example.test/base",
    vaultOrigin: (vaultId) => originOf(vaultId), // yours: which node holds that vault
  }));

const card = await resolvePersonCard(
  { platform: identity, connections, canonical },
  { record: { uri: recordAddress, link: linkReadFromTheRecord } }, // `readLink` of online-card-link
);
if (card.how === "placement") {
  for (const p of displayPlacements(card.placements)) show(placementLabel(p)); // "Personal · Inner Circle"
}
```

## What the host must supply

- `platform.fetch` (a `PlatformClient`): the app's AUTHENTICATED fetch, at the identity node's origin for `resolve-person` and the anchor route. The unit never sees a token or a proof.
- `readConnections`: `vaultOrigin(vaultId)` (sync or async), the origin of the node that holds that vault; and, optionally, `admit(member)`, the app's ruling on which members are people (only the platform can tell a person from a group; never decide by address shape).
- `resolvePersonCard`: `connections()` (the app's one session read), `canonical` (the session's canonicaliser), and optionally `resolve(record)` (the app's own seam for the anchor route; the default is `resolveOnlineCard`).
- Nothing else. No setting and no start-up call.

## Module state

The unit holds no module state that changes. Its module-level values are constants built once and never written: the opaque-principal pattern, the placement order and the set of answers that mean "not a person". Each `createPrincipalCanonicaliser` call holds its OWN cache (a map of members to the answer in flight or kept), its own set of answered members and its own request counter, in the closure it returns: those live as long as you keep that canonicaliser, and two canonicalisers do not share a bound.

The app's own per-holder canonicaliser (one per holder per session) and the per-card controller's shared anchor are kept by the app, not here. Nothing in this unit needs a single installed copy, except that `PlatformError` comes from `record-sync` (see above).

Dynamic imports in the files taken: none. The tracer does not follow `import()`, so every file taken was also searched for it with `grep "import("`, which found none.

## Do not

- Do not read `connections: "failed"` as "the holder placed nobody": it means the read failed. `"not-read"` means there was nobody to look up.
- Do not match a person by name, or by rewriting `/i` to `/vault`. The platform's alias registry answers what an old spelling means today; ask it through the canonicaliser.
- Do not give `resolvePersonCard` a `connections()` that reads the platform on every call. Read once per holder per session and share it.
- Do not draw `DERIVED_UNIONS` as a placement. They are reach, not something the holder placed.
- Do not create a canonicaliser per card: its cache and its bound of 50 requests are per canonicaliser, so one per card sends 50 requests per card.

## Wrong readings

These behaviours are as the source has them, kept on purpose and pinned by tests (nothing is fixed in the extraction).

- "`c.answered(member)` is true for the principal an opaque member names." It is keyed by the member as given, trimmed: a member written with a trailing slash is recorded WITH the slash, so `answered("<p>/")` is true and `answered("<p>")` is false, though the canonicaliser answers `<p>` for both.
- "An opaque member with `#me` is turned into the bare principal." It is returned as given, `#me` included, and does not match the bare principal.
- "A request that could not be asked is free." It is not kept, so it is asked again later, but each send counts against the bound of 50.
- "A member in the sets is a person." Group vaults the holder placed are in the sets too; the unit keeps every member unless the app passes `admit`.
- "`displayPlacements` shows what is stored." When both depths are stored for a context, only Inner Circle is drawn; the 1st is stored for reach and not drawn twice.
- "A 404 from the anchor route says the record is not linked, or not yours." The platform makes the reasons one answer on purpose (`none`); the unit cannot tell them apart and does not try. `heldNoteKey` therefore treats `none` as unknown.
- "A failed lookup of the record's party means the person is not linked." It is `unavailable`; the card says it in its own words.
- "`readConnections` with a wrong vault errors." A read at the wrong node finds four sets nobody wrote and answers `sets: []` (no error), which reads as "no circles".

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, whole files copied by script:

- `src/connections/canonical.ts` (lines 1-140) to `src/canonical.ts`
- `src/connections/compose.ts` (1-119) to `src/compose.ts`
- `src/connections/placements.ts` (1-183) to `src/placements.ts`
- `src/connections/read.ts` (1-101) to `src/read.ts`
- `src/connections/personCard.ts` (1-129) to `src/personCard.ts`
- `src/connections/heldNotes.ts` (1-52) to `src/heldNotes.ts`
- `src/onlineCard/anchorResolver.ts` (1-59) to `src/anchorResolver.ts`

**Merged units compared and taken or not.** `record-sync` (0.3.0) holds `request`, `routeUrl`, `retryAfterMs`, `PlatformError`, `PlatformClient` and `RequestBound` that these files import from `platform.ts`; it is a peer (`retryAfterMs` is new in 0.3.0). `online-card-link` (0.1.0) holds `LinkReading` (`link.ts`, unit-equal to the source's type), imported as a type; it is a peer. Not taken: the other files of `onlineCard/` (`controller.ts`, `find.ts`, `publicCard.ts`, `rungs.ts`), which no file taken imports.

Named changes, and only these:

1. the imports of the source's own files lose `.ts`; `./platform.ts` is the peer `@kaigilb/gilbplatformcode-record-sync`; the type import `LinkReading` from `../onlineCard/link.ts` is the peer `@kaigilb/gilbplatformcode-online-card-link`; `../onlineCard/anchorResolver.ts` is `./anchorResolver` (a file of this unit);
2. comments only: person names, cycle, round, batch and ticket tags, agent names, app names, branch and commit names and a legacy host name are removed or reworded, and the technical meaning is kept; `heldNotes.ts` has a new, shorter header comment. Checked token by token with comments and imports left out: the code is the source's. No string literal carried a tag, so none was changed.

`src/index.ts` is new. Tests (`src/*.test.ts`; a fake `fetch` and fake timers, no network, no wall clock; hosts are `example.test` hosts, people are Ann and Ben; a fresh canonicaliser per test): ported from `gilb-stakeholders` `test/connections/` and `test/onlineCard/resolver.test.ts` at the same commit, by test block: `connections.test.ts` 28 of 28, `personCard.test.ts` 16 of 16, `heldNotes.test.ts` 6 of 6, `canonicalAnswered.test.ts` 2 of 2, `oldSpellings.test.ts` 6 of 10, `requestBudget.test.ts` 4 of 14, `anchorResolver.test.ts` 8 of 8. New: `pinned.test.ts` (39: the export list, every constant, the canonical helpers, the canonicaliser's bound, timeout and cache, the rest of the person card, the resolver's busy answer, the read of the route), found by mutation checks. `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.

Left out, with reasons: 4 of `oldSpellings-s4b.test.ts` (tests 4, 5, 6b and 7 call `readStakeholderList`, the merged list reader, which is another unit) and 10 of `qa-s4b-s74.test.ts` (T1 to T7, T11, T12 and T14 call `readStakeholderList`). The card halves of T11 and T14 are pinned again, without the list, in `pinned.test.ts`.
