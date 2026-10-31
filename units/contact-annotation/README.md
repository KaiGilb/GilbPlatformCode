# contact-annotation

Keeps the holder's private My Note and Where / How we met about a person, saved as they type.

## What this is

Keeps the holder's private My Note and Where / How we met about a person, saved as they type.

A held card (a person the holder keeps a record of) has two private groups at the top: "My Note" (`t:ContactPrivateNote` / `a:contactPrivateNote`) and "Where / How we met" (`t:ConnectionOrigin` / `a:connectionOrigin`), each marked "Private". They are the holder's own words about one contact. The contact cannot read what is written about them: the route stores the typed record private and reads it back only for (caller, held party).

- `loadHolderAnnotations(heldParty, vaultId)`: reads both fields in one round trip, from the vault the card is held in. A failed read throws; a read that cannot be tied to the card's vault throws `AnnotationVaultMismatchError`. Never an empty note.
- `saveHolderAnnotations({ heldParty, vaultId, note?, origin?, keepalive? })`: writes the fields given (an empty string clears).
- `annotationsFit(cardVaultId, ownVaultId)`: a note is offered only on a card held in the signed-in holder's own vault (the route reads from there).
- `useAnnotationDraft(options)`: the state machine of ONE field: what the server holds, what the person typed, when it reaches the vault (a 400 ms quiet-typing debounce, blur, and a page-hide / unmount flush with `keepalive`), and whether it got there (`idle | pending | saving | saved | error`). `ANNOTATION_AUTOSAVE_MS` = 400.
- `HolderNoteGroup({ field: "note" | "origin", vaultId, heldParty, initialText, initialLoad, onReload?, onSaved?, errorCopy? })`: the group, drawn in the card frame (`card-group`) and the card's two modes (`card-mode`). With nothing in it, on a card the holder can write, it is ONE line with the box ready to type in.
- `AnnotationSaveState` (the line "Not saved yet…" / "Saving…" / "Saved" / the failure's words, silent at idle) and `PrivateMarker` (the one "Private" tag).
- `ANNOTATIONS_PATH`, `ANNOTATIONS_VAULT_PARAM`, `NOTES_VAULT_UNTIED_COPY`, `AnnotationError`, `AnnotationVaultMismatchError`, `sameVault`, `growBox`, `HINT`, and the test seam `__resetAnnotationCapability`. The type of the save state is exported as `AnnotationSaveStateName` because the component has the source's name `AnnotationSaveState`.

Privacy: the notes are written only to the holder's own vault, through the annotations door, never to the person's card. The person's card address is data (the `heldParty` key of the note), not a place a request goes.

## What this is not

- Not a held-claim field, a note document, a marker or a find key. The route owns the typed record.
- Not a Save button. The fields are open boxes; the save is made reliable, not manual.
- Not a local draft store. The vault, not the browser, is the data of record: a draft is never kept locally longer; it is written sooner.
- Not for a card held in another vault: the route reads from the signed-in holder's own vault and writes to the vault the body names, and the two agree only there, so such a card is offered no note (`annotationsFit`).
- Not the "Where / How we met" line in the card's header; that line is read by the header from the same route.
- Not the favourite half of the route.

## How to take it

Package: `@kaigilb/gilbplatformcode-contact-annotation`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/contact-annotation` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/card-mode <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/contact-annotation
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Tailwind utility classes over CSS variables, no stylesheet of its own. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/contact-annotation/src";`. The page must define these variables: `--ink` (the text and the box), `--ink-soft` (the hint of an empty box, 4.5:1 on the card), `--ink-faint` (the "Private" tag, "Loading…", the saved line), `--line` (the box's border), `--surface` (the box's ground), `--accent` (the focus outline, "Try again"), `--accent-ink` (the not-yet-saved and saving lines) and `--bad` (a failure). The group's frame (`card-group`) has its own variables.

## Requests and their servers

The route is `/base/connect/annotations`. Its two requests are ADDRESSED differently, and that is deliberate (the measured route table of the MyNet app). Both go to the node of the vault the card is held in (`vaultOriginOf(vaultId)`, `vault-origin-rule`), never to the person's card and never to the platform's base address:

| Request | Addressed at | Names the vault in | Signed with |
|---|---|---|---|
| `GET /base/connect/annotations?heldParty=<party>` | the vault's node | nowhere: the query is the held party ONLY (`?vaultId=` is refused with a 400 by the route's query schema) | `dpopReadAuth("GET", url)` |
| `PUT /base/connect/annotations` (JSON body `{ heldParty, vaultId, note?, origin? }`) | the vault's node | the BODY (`vaultId`) | `dpopWriteAuth("PUT", url)` |

- The GET's answer echoes the vault that answered (`vault`). A holder who manages more than one vault gets the route's own pick, which may not be the card's vault, with empty notes; the PUT names the vault, so showing that read as "no note" would let the next keystroke overwrite the stored note. So the echo must be the card's vault (compared by host, `sameVault`), else the read is refused (`AnnotationVaultMismatchError`, said as `NOTES_VAULT_UNTIED_COPY`).
- Only after such an untied read is the GET asked again WITH `&vaultId=<vault>`, because a platform that takes the parameter answers from the named vault. A 400 / 404 / 422 on that is learned as "this platform does not take it" (`vaultParamSupport = "no"`) and the read fails safe. A platform that took it is remembered (`"yes"`): later reads name the vault at once, and the echo is still the proof.
- A 401 on either calls `invalidateDpop()` and throws `NotSignedInError` (`lws-session-bridge`).
- The PUT may carry `keepalive` (the page-hide flush). It is best effort by construction: the credential is minted asynchronously.
- These are the only requests the unit makes. Writes: the PUT only.

## Examples

```tsx
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { HolderNoteGroup, annotationsFit, loadHolderAnnotations } from "@kaigilb/gilbplatformcode-contact-annotation";

// once, at start-up: setBaseOrigin(...) and setLwsAuth(...) (see "What the host must supply")
function HeldCardTop({ cardVaultId, ownVaultId, heldParty, canEdit, read }: Props) {
  if (!annotationsFit(cardVaultId, ownVaultId)) return null; // the route reads from the holder's own vault only
  // `read` is the result of ONE loadHolderAnnotations(heldParty, cardVaultId) for both fields (or "error" with the words to say)
  return (
    <CardModeProvider canEdit={canEdit}>
      <HolderNoteGroup field="note" vaultId={cardVaultId} heldParty={heldParty} initialText={read.note} initialLoad={read.noteLoad} />
      <HolderNoteGroup field="origin" vaultId={cardVaultId} heldParty={heldParty} initialText={read.origin} initialLoad={read.originLoad} />
    </CardModeProvider>
  );
}
```

## What the host must supply

- `setBaseOrigin(...)` (and `setSystemVaultHosts([...])`) from `base-origin`, and the auth seam `setLwsAuth(...)` from `lws-session-bridge`, once at start-up. The credential's `dpopReadAuth` / `dpopWriteAuth` / `invalidateDpop` are what this unit calls.
- Tailwind scanning this unit's `src` and the CSS variables above.
- The card's frame: a `CardModeProvider` above the group (without one the group is always in edit mode).
- The decision that a note is offered at all: call `annotationsFit(cardVaultId, ownVaultId)` before drawing the groups.
- Nothing else: the unit takes no React context of its own and makes no query client.

## Module state

One: `vaultParamSupport` (`"unknown" | "yes" | "no"`) in `contactAnnotation.ts`: whether this platform takes `vaultId` on the read. Learned, not assumed; kept per page session (per module copy); reset only by the test seam `__resetAnnotationCapability()`, which product code never calls. An app must have ONE copy of this unit. Each hook instance also holds refs of its own (the last server text, the text in flight, the timer); they live and die with the component.

## Do not

- Do not add `?vaultId=` to the first GET. The route refuses it (400). The unit asks for it by itself, once, only when it must.
- Do not send the PUT without `vaultId` in the body, and do not address it at the base address: the write goes to the node of the vault named.
- Do not render a failed or untied read as an empty note, and do not let the box be typed in over a value that was not seen.
- Do not dedupe or hide the other values (`others`): another app's writing of the same typed fact is shown read-only beside the holder's.
- Do not "simplify" the two guards in the save (the no-op guard, and never retract what was not read): they are different cases and each has a test.
- Do not call `__resetAnnotationCapability` from product code.
- Do not offer a note on a card held in another vault (`annotationsFit`).

## Wrong readings

- "Blur is the save." It is one of three: the debounce while typing, blur, and the page-hide / unmount flush. None is redundant.
- "Typing during a save waits for it." It does not: the newer text is written when its own quiet time is up, so two writes can be in flight. The same bytes are never sent twice at once.
- "An empty box on a card the holder cannot write is shown." It is not drawn at all. On a card the holder can write, it is always drawn, as one line.
- "The GET and the PUT are symmetric." They are not; see "Requests and their servers".
- "Private means encrypted." It means the route stores the record private to the holder; the unit sends the text in a signed request over the platform's transport.
- "The `seedText` option keeps what a link put in the box." As in the source, a server read that lands after the seed can clear it (a known, pre-existing residual of the source). Left as it is.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script, whole files:

- `src/lib/contact/contactAnnotation.ts` (239 lines) to `src/contactAnnotation.ts`.
- `src/lib/contact/useAnnotationDraft.ts` (459) to `src/useAnnotationDraft.ts`.
- `src/components/records/HolderNoteGroup.tsx` (241) to `src/HolderNoteGroup.tsx`.
- `src/components/mynet/AnnotationSaveState.tsx` (72) to `src/AnnotationSaveState.tsx`.
- `src/components/mynet/PrivateMarker.tsx` (20) to `src/PrivateMarker.tsx`.

(The first three were themselves copied from the MyNet app into GilbApp; the code is MyNet's, line for line, except the transport and the naming of the vault.)

Named changes, and only these:

1. The imports are imports of units: `dpopReadAuth`, `dpopWriteAuth`, `invalidateDpop`, `NotSignedInError` from `lws-session-bridge`; `vaultOriginOf` from `vault-origin-rule`; `CardGroup` from `card-group`; `useCardMode` from `card-mode`; the five files import one another by their new names.
2. The header comments are new and shorter; the comments that name a cycle, a ruling, an agent, a date, a ticket or a wiki rule are reworded with the same facts. The comment on the two requests' addressing in `contactAnnotation.ts` is new. No code changed.
3. `src/index.ts` is new and exports by name. The source has two symbols called `AnnotationSaveState` (the state's type in `useAnnotationDraft`, the component in its own file); the index exports the type as `AnnotationSaveStateName`.

With comments and imports removed, all five files are token-equal to the source (797, 710, 554, 88 and 24 words, 0 diff lines each). `annotationsFit` is also a private copy in `stakeholder-contact-header` (`useHeaderRelations.ts`); the two are token-equal (38 words, 0 diff). That unit is not changed here; it should import this one's when it is next versioned.

## Tests

106 tests in 8 files (`npx vitest run`):

- `contactAnnotation.s8labels.test.ts` 8 and `contactAnnotation.s10labels.test.ts` 9: PORTED, all 17 of the source's. Re-based on the real `lws-session-bridge`, `vault-origin-rule` and `base-origin` over a recording credential, in place of the source's `vi.mock` of the app's `dpop`, `config` and `token` modules; hosts are `example.test` hosts under a test base origin (the source's `localhost:8881` hosts have a port).
- `requests.test.ts` 26 (new): the GET's URL, host, method, signature and query (`heldParty` alone, never `vaultId` on the first read); the PUT's URL, host, method, signature and body (`vaultId` in the body, no query); that the two differ on purpose; the named read (asked only after an untied read, a 400/404/422 learned as "no", a 500 not learned); privacy (a write about a person whose card is in another vault goes to the holder's vault node and to no other host, the person's card address is only the `heldParty` key, every request of a read-then-write is the annotations route at the holder's node, the note's text is never in a URL); `annotationsFit`; the strict reading of answers.
- `useAnnotationDraft.test.tsx` 27 (new, fake timers): the autosave fires once after `ANNOTATION_AUTOSAVE_MS` and not before, each keystroke restarts the wait, blur writes at once, the no-op guard, clearing, `onSaved`; a failed save shows the error state, keeps the text and stays retryable; typing during a save queues exactly one more save, of the newer text, and the same bytes are not sent twice; never clear what was not read; a failed or untied read is an error surface; `reload`; the unmount, `pagehide` and `visibilitychange` flushes with `keepalive`.
- `HolderNoteGroup.test.tsx` 14 (new): what is drawn on a writable and on a read-only card, the compact one-line shape and its holding while focused, the text and the click into edit mode, the other apps' values, Loading…, the failed read with Try again and `errorCopy`, typing to saving to Saved, a refused write.
- `small.test.tsx` 7 (new): `AnnotationSaveState` (silent at idle, the three words, the failure verbatim, colours) and `PrivateMarker`.
- `exports.test.ts` 2, `hostAgnostic.test.ts` 13 (the same host-agnostic check test as the other units; it writes to the OS temp directory).

No `vi.mock`. No wall-clock waits (fake timers, `act`).

Mutation checks: 48 mutants of the five files, 12 aimed at the GET/PUT addressing (the base address for either request, the first GET naming the vault, the PUT without `vaultId` in the body, the PUT also naming it in the query, the request addressed at the person's card host, the credential swapped, the method, the encoding, `keepalive`), 9 at the tie and the capability, 19 at the save machine, 5 at the group, 3 at the two small components. 47 killed (4 survived the first run: three real gaps, each now killed by a test added, and one equivalent: in `reload` the branch `if (load === "error")` is dead, because `fromWire` throws on any failed load first, so setting `serverText` there changes nothing; the same assignment in the `catch` is pinned and killed).

Left out: `ContactCardSlots.*` (54, the composition `contact-card-slots`, a later unit) and the card-level tests that reach these groups through `RecordDetail`.
