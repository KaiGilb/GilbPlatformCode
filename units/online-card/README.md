# online-card

Controls the link between a holder's record of a person and that person's own online card: find, link, unlink, refresh.

## What this is

Controls the link between a holder's record of a person and that person's own online card: find, link, unlink, refresh.

Plain functions and types, no React, no markup. An app draws one component over a small store, and this unit is the store: a headless controller with the acts the holder can do, and the reads and the one write it needs. Every request goes through the `PlatformClient` of `record-sync` (its `fetch` is yours and adds the credential). The only write is the link patch, which the app performs through `writeLink`; the online card is never written.

- `createOnlineCardController(deps)`: the store. `getState()`, `subscribe(listener)` (returns the unsubscribe), `dispose()` and the acts:
  - `load(force?)`: the card was opened: resolve the record to a party, then read that party's card. Lazy (nothing is asked before it), and a load in flight is shared, so two calls at once cost one resolve and one card read. `load(true)` starts a new one (Try again; after a link).
  - `openFind(prefill)`, `closeFind()`, `search(name)`: the search box for an unlinked record, only for a holder who can write.
  - `confirmLink({ principal })`: the holder confirmed this candidate: writes the link and loads the card. `unlink()`: retracts the link and clears the online side. Neither runs without `canWrite`, or while another act is in flight.
  - State: `{ link, online, find, busy, error }`. `online` is one of `idle`, `loading`, `ready` (`card`, `party`), `none` (the platform's one refusal), `organization`, `unauthenticated`, `unavailable` and `busy` (`retryAt`). `find` is one of `closed`, `idle`, `searching`, `results` (`candidates`, `total`, `cutAt`) and `error`. A failure to ask is `unavailable`, never `none`.
  - `deps`: `platform`, `subject` (`{ uri, holder, link }`), `canWrite`, `writeLink(w)`, and optionally `resolve()`, `readCard(principal)`, `requestTimeoutMs`, `onLinkChanged(link)`.
- `isConnected(served)`: the list-row marker, derived from the link the list already read. No request.
- `WORDS`: the screen's words. `ONLINE_CARD_REQUEST_TIMEOUT_MS` (10 000), `MIN_BUSY_WAIT_MS` (1 000), `MAX_BUSY_WAIT_MS` (60 000), `DEFAULT_BUSY_WAIT_MS` (5 000).
- `readOnlineCard(platform, principal, bound?)`: `GET /base/connect/public-card?principal=`, one request, at the viewer's rung (`ONLINE_CARD_READ_PATH`). `parseOnlineCard(principal, body)`: the card from a card-route body the app already read. `cardName(card)`, `contactPointsOf(card)`. Types `OnlineCard`, `OnlineCardField`, `OnlineCardSkill`, `OnlineCardRead`, `ContactPoint`.
  - A field is `{ predicate, value, rung, sourceEntity, slot?, kind?, composite? }`. `composite` is the id of the address (`t:PlaceClaim`) the part belongs to, as the server serves it; the key is absent when the server named none (an older server, or not an address part), and it is never guessed. A value named twice is one line, except that two lines of different `composite` are two (two addresses naming one place at one rung keep one line each).
- `findOnlineCardCandidates(platform, name, max?)` and `findOnlineCardResult(platform, name, max?, bound?)`: `GET /base/connect/find-by-name`, then one card read per person shown (at most `MAX_CANDIDATES` = 5, three at once), so the holder can tell a stranger from the right person before confirming. `FIND_BY_NAME_PATH`. Types `OnlineCardCandidate`, `OnlineCardFindResult`.
- `rungWords(rung)` and `rungChipWords(rung)`: the words for the rung a field travelled with ("Personal Inner Circle", "Public"). An unknown rung is returned unchanged, never blank.
- `linkWrite({ record, target })` and `unlinkWrite({ record })`: the merge patch (`{ sameAs: { "@id": target } }` or `{ sameAs: null }`) for the holder's own record, and nothing else. `LinkRefusedError` is thrown before anything is sent. `LINK_SLUG` is `"sameAs"`. Type `LinkWrite`.

## What this is not

- Not a component, and not a style. There is no markup here.
- Not a copy of the online card. The card is shown live at the viewer's rung and is never stored in the holder's record; there is no "use this" and no code that writes one.
- Not a writer of the online card, of a rung, of a grant or of any claim. The one write is the link of the holder's own record.
- Not the reader of a record's link (`readLink`, in `online-card-link`) nor the resolver of a record to a party (`resolveOnlineCard`, in `person-connections`). This unit uses both.
- Not the merge of the online card with the holder's card. That is another unit.

## How to take it

Package: `@kaigilb/gilbplatformcode-online-card`

From a clone of this repository, install the peers first, then the unit's folder (this is the line `node scripts/peers.mjs units/online-card` prints):

```sh
npm install <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency. `record-sync` (`^0.3.0`), `person-connections` (`^0.1.0`) and `online-card-link` (`^0.1.0`) are peers. An app must have ONE copy of `record-sync`, because a failure to reach the platform is its `PlatformError` and the unit tells it from other errors with `instanceof`.

## Examples

```ts
import { createOnlineCardController, isConnected } from "@kaigilb/gilbplatformcode-online-card";
import { readLink } from "@kaigilb/gilbplatformcode-online-card-link";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

const identity: PlatformClient = { origin: "https://id.platform.example.test", fetch: authenticatedFetch }; // yours

const controller = createOnlineCardController({
  platform: identity,
  subject: { uri: recordAddress, holder: holderVault, link: readLink(servedFacts) },
  canWrite: true,
  writeLink: (w) => patchRecord(w.record, w.patch), // yours: a merge patch of the holder's own record
  onLinkChanged: (link) => refreshRecordCache(link), // yours
});

const stop = controller.subscribe(() => render(controller.getState())); // yours
await controller.load(); // the card was opened
// ... controller.openFind("Ann"); await controller.search("Ann"); await controller.confirmLink(candidate);
controller.dispose(); // when the card closes
stop();
```

## What the host must supply

- `platform`: a `PlatformClient` at the identity node's origin, whose `fetch` is the app's AUTHENTICATED fetch. The unit never sees a token or a proof.
- `subject`: the record's address, the holder, and the link as the record's served facts carry it (`readLink`).
- `canWrite`: may the holder write this record? A reader sees the card and can link or unlink nothing.
- `writeLink(w)`: the app's merge patch of the holder's own record. It is called with the link's patch only.
- Optionally `resolve()` and `readCard(principal)`: an app whose card is its connection, or that already read the card route for its own screen, hands the party or the card over, so a card open asks the platform nothing more. `requestTimeoutMs`: how long one request may take (default 10 s). `onLinkChanged(link)`: the record's link changed after a write, so the app refreshes its record cache and the list marker follows.
- Nothing else. No setting and no start-up call. There is no CSS.

## Module state

The unit holds no module state that changes. The module-level values are constants built once and never written: the paths, the limits, `WORDS`, and the map of rung words (`CHIP_WORDS_BY_RUNG`, built when `rungs.ts` loads). Each `createOnlineCardController` call holds its own state, listeners, generation counter, in-flight load, abort controllers and busy timer in the closure it returns, and `dispose()` ends them. Two copies of the unit would not clash; they would only be two sets of constants. Nothing here needs a single installed copy, except that `PlatformError` comes from `record-sync` (see above).

Dynamic imports in the files taken: none (every file was also searched for `import(`).

## Do not

- Do not call `load()` per list row. A row's "connected" marker is `isConnected` of the link the list already read; no request.
- Do not copy a field of the online card into the holder's record. The card is read live.
- Do not give `writeLink` a wider patch than the one it is handed.
- Do not keep a controller after the card closes. Call `dispose()`: it cancels the requests in flight and the busy timer.
- Do not read `online: { status: "none" }` as "the request failed". It is the platform's one refusal answer; a failure is `unavailable`.

## Wrong readings

These behaviours are as the source has them, kept on purpose and pinned by tests (nothing is fixed in the extraction).

- "A 429 is retried by the controller." It is not. The controller says `busy` with `retryAt`, sets a timer that only tells the listeners the wait is over, and `load()` (also `load(true)`) asks nothing until then.
- "A missing Retry-After means the minimum wait." It means 5 s (`DEFAULT_BUSY_WAIT_MS`); a stated wait is kept between 1 s and 60 s.
- "A throwing `resolve` is an unavailable card." Only a rejected promise is. If the app's `resolve()` or `readCard()` THROWS instead of returning a promise, `load()` rejects, the state stays `loading`, and (because `load` also hangs a `finally` on the promise it returns) the rejection is reported a second time as an unhandled rejection. This is a defect for the owner; it is not pinned by a test, because it raises that unhandled rejection in the test run. Hand over a function that returns a promise.
- "A search answer always lands." An answer that arrives after the find box was closed, reopened or searched again is dropped.
- "`total` counts the people in the platform." It counts the distinct people among the (at most 50) hits the find route returned; `cutAt` is the number listed when `total` is larger.
- "`confirmLink` and `unlink` queue." A second act while one is in flight is ignored.
- "`unlink` reloads the local card." It does not: it retracts the link, clears the online side and nothing else.
- "`isConnected` is true for any `sameAs`." Only for exactly one reference under `sameAs` or `a:sameAs`; a plain string, two references and `owl:sameAs` are not a link.
- "A card with no field is `none`." It is a card with nothing to show; `none` is the platform's 404.

## Where it came from

`KaiGilb/gilb-stakeholders` (private repo), commit `0a261488be7c98d1ac5d79887c966a445b8928bd`, copied by script:

- `src/onlineCard/controller.ts` (lines 1-301, whole) to `src/controller.ts`
- `src/onlineCard/find.ts` (1-84, whole) to `src/find.ts`
- `src/onlineCard/publicCard.ts` (1-137, whole) to `src/publicCard.ts`
- `src/onlineCard/rungs.ts` (1-50, whole) to `src/rungs.ts`
- `src/onlineCard/link.ts` (13-14 and 56-100) to `src/linkWrite.ts`

**The split of `link.ts`** (a split file, so a developer can take one part). Lines 16-55 (`LinkReading`, `readLink`, and the private `LINK_SPELLINGS` and `referenceOf` they use) stay in `online-card-link`, a peer. Lines 56-100 are this unit's `src/linkWrite.ts`: `LinkRefusedError`, `LinkWrite`, `linkWrite`, `unlinkWrite` and the private `isAbsoluteHttp`. Lines 13-14 (`LINK_SLUG`, the slug the patch is built from) are also this unit's: it is used by lines 56-100 only, so by the placement rule it goes with them. The brief gave 56-100; lines 13-14 are added to it, because without them `linkWrite.ts` does not compile. Every code token of the source `link.ts` is in exactly one of the two units: the tokens of `online-card-link`'s `link.ts` placed between the first part and the rest of `linkWrite.ts` equal the source file's tokens, comments excluded.

**Merged units compared and taken.** Their declarations were compared with the pinned source token by token, comments excluded, and are equal:

- `record-sync` (0.3.0) holds everything of the source's `platform.ts` this unit imports: `request`, `routeUrl`, `retryAfterMs`, `expectStatus`, `PlatformError`, `PlatformClient`, `RequestBound`. It is a peer.
- `person-connections` (0.1.0) holds `resolveOnlineCard`, `ResolveOutcome` and `ONLINE_CARD_ANCHOR_PATH` (`anchorResolver.ts`) and `ATOMIC_PLACEMENTS`, `CONTEXT_WORDS`, `DEPTH_WORDS`, `atomicRungTerm`, `placementLabel`, `AudienceDepth` (`placements.ts`). It is a peer.
- `online-card-link` (0.1.0) holds `readLink` and `LinkReading`. It is a peer.

Named changes, and only these:

1. in `controller.ts`: the import from `./link.ts` is split into the peer (`readLink`, `LinkReading`) and `./linkWrite` (`linkWrite`, `unlinkWrite`, `LinkWrite`); `./anchorResolver.ts` is `person-connections`; `../platform.ts` is `record-sync`; the imports of the unit's own files lose `.ts`;
2. in `find.ts` and `publicCard.ts`: `../platform.ts` is `record-sync`; the imports of the unit's own files lose `.ts`;
3. in `rungs.ts`: `../connections/placements.ts` is `person-connections`;
4. comments made generic (person names, cycle and ticket tags, app names, a claim name and a platform file name removed). Checked token by token with comments and imports left out: the code is the source's. No string literal carried a tag, so none was changed.

`src/index.ts` is new: it re-exports the five files. Tests (`src/*.test.ts`; a fake `fetch`, fake timers, no network, no wall clock): ported from `gilb-stakeholders` `test/onlineCard/`: `controller.test.ts` 22 of 22, `busyAndTimeout.test.ts` 14 of 14, `controllerGaps.test.ts` 3 of 3 (from the file of controller gap tests), `card.test.ts` 14 of 14, `linkWrite.test.ts` 7 (the `linkWrite` and `unlinkWrite` tests of `link.test.ts`), `rungWords.test.ts` 1 of 1 and `rungChipWords.test.ts` 4 of 4. The source's wall-clock waits (`setTimeout` of 5 to 80 ms) are replaced: the three tests that waited for a request to start now use fake timers and `advanceTimersByTimeAsync(0)`, and the two that needed a slow write or a slow search now wait on a promise they release. New: `onlineCardPinned.test.ts` (47: every export, the constants and words, each refusal of `linkWrite`, the card parser, the find route's URL and limits, the three-at-once bound, and the controller's states, busy wait bounds and timeouts). Left out, by file: `resolver.test.ts` (its 8 tests are `resolveOnlineCard`, which is `person-connections`, where they are ported), the `readLink` tests of `link.test.ts` (they are `online-card-link`'s) and the three `mergeOneCard` files (the three `mergeOneCard*` test files: they belong to the later unit `one-card-merge`). `src/hostAgnostic.test.ts` is the same host-agnostic check test as the other units.
