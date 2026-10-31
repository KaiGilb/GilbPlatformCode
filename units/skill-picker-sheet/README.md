# skill-picker-sheet

Lets the holder pick a skill from the catalogue, with its depth, in a sheet.

## What this is

Lets the holder pick a skill from the catalogue, with its depth, in a sheet.

Three pieces that a Skills (or Interests) section draws, and the search they stand on:

- `SkillPickerSheet({ onPick, onClose, excludeUris?, noun? })`: a bottom sheet with a search box over the live skill catalogue (about 16,000 concepts in 29 languages). Nothing is listed until the person types. One character says "Keep typing"; from two characters it searches (after a 140 ms quiet time) and lists up to 20 matches with what each skill does, under a head that says how many ("2 matches", "Top 20 of 7,266 matches", "Top 20 of more than 200 matches", "Top 20 matches" when the read gave no total), whether the page is complete, and "live corpus". A skill the section already holds (`excludeUris`: matched against the match's storage address `uri` AND its type address `typeUri`) is not offered again. A pick calls `onPick(skill)` and leaves the sheet open; closing is the caller's (`onClose`, from the backdrop and from the Close button). `noun="interest"` changes only the words and the box's name; it is the same search and the same catalogue. A failed search says so and that this is not a statement that the skill does not exist. An older search is aborted and its late answer, or late failure, is never shown over a newer one.
- `SkillDepthNote({ skillName, note, readOnly, saving, error, onCommit, noun? })`: the "About this skill" block under a picked skill: the holder's own words about the skill's level, context or examples, edited in place. `note` is the stored text (`""` for none) or `null` while it is not read (nothing is drawn). Blur commits only a changed, trimmed text; Escape reverts; `onCommit` resolves TRUE only when the store kept the note; a note the store did not confirm stays on screen in place of the stored one (never lost), and only the LATEST commit's answer may clear it. `readOnly` shows the text only (nothing at all when empty).
- `searchSkillsRemote(q, { signal?, limit?, preferHeld? })` and its `SKILL_SEARCH_*` constants, `SkillSearchError` (with `.status`), `vedaVaultId()`: the catalogue client. Hits whose type address is not a canonical `<origin>/base/t/<PascalName>` are dropped. The total is read from `total` (never `count` when `total` is present) through `result-total`, so a bound is never shown as a census.

The skill's own type (`ThinSkill`) and the one function that chooses the canonical referent a claim is keyed on (`skillReferentUri`) are `contact-rows`': imported, not copied. The sheet calls `skillReferentUri` on a pick to keep the `{tag, typeUri}` contract; a hit that is not canonical never reaches the list.

## What this is not

- Not the section that lists the picked skills and saves them (`contact-rows`; and the interests section, later). Not where a note is saved: `onCommit` is the caller's.
- Not a portal. The sheet is `fixed inset-0` and is drawn where it is placed; the section that opens it puts it into the document body (`contact-rows` does: `createPortal(<SkillPickerSheet/>, document.body)`). A caller that places it inside a transformed or clipped parent must portal it too.
- Not a hierarchy browser and not an offline catalogue: both are retired in the source. `skill-browse` (groups and ranking over skills already in hand) and `skill-uri-label` are not used here.
- Not a place to key a claim on the match's storage address: use the type address (`skillReferentUri`).

## How to take it

Package: `@kaigilb/gilbplatformcode-skill-picker-sheet`

This unit peers on `contact-rows` (for `ThinSkill` and `skillReferentUri`), so its install line is `contact-rows`' with the other peers in front. From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/skill-picker-sheet` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/add-your-own <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/card-mode <path-to-the-library>/units/class-merge <path-to-the-library>/units/button <path-to-the-library>/units/contact-actions <path-to-the-library>/units/contact-rows-model <path-to-the-library>/units/credential-surface <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/file-words <path-to-the-library>/units/folder-part <path-to-the-library>/units/id-tail <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/own-card <path-to-the-library>/units/phone-text <path-to-the-library>/units/home-dial <path-to-the-library>/units/photo-term <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/skill-uri-label <path-to-the-library>/units/stakeholder-list-reader <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/contact-header <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-name-text <path-to-the-library>/units/term-slots <path-to-the-library>/units/type-curie <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/vault-list <path-to-the-library>/units/vault-modes <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/file-download-outcome <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/platform-fetch <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-profile-photo <path-to-the-library>/units/vault-resources <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/stakeholder-card-vocabulary <path-to-the-library>/units/contact-kind-model <path-to-the-library>/units/contact-kind-catalogue <path-to-the-library>/units/tag-grammar <path-to-the-library>/units/tag-client <path-to-the-library>/units/main-tag <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/kind-relation <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/reachable-vaults <path-to-the-library>/units/adder-card <path-to-the-library>/units/stated-by <path-to-the-library>/units/held-notes <path-to-the-library>/units/contact-rows <path-to-the-library>/units/skill-picker-sheet
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it.

## Styling

Tailwind utility classes over CSS variables, no stylesheet of its own. With Tailwind v4, add the unit's source to the scan: `@source "<path>/units/skill-picker-sheet/src";`. The page must define these variables: `--surface` (the sheet and the note box), `--surface-sunken` (the search box; the pressed row), `--line` (borders), `--ink` (text), `--ink-faint` (secondary text), `--ink-soft` (the note's title), `--ink-ghost` (the empty note's prompt), `--bad` (a failure), `--accent` (the search box's focus border), `--sel` (a row on hover) and `--serif` (headings and names). The Close button is the `button` unit's and reads that unit's variables.

## Requests and their servers

One request, made by `searchSkillsRemote` for the picker: `GET <termOrigin()>/base/search?q=<query>&match=prefix&vault=<termOrigin()>/base` (plus `&prefer=held` only for a caller that asks for `preferHeld`; the picker never does), `Accept: application/json`, **no credential and no other header**, with the picker's abort signal. It is sent to **the ontology origin the host set once with `setTermOrigin`** (unit `term-origin`), read at the time of the call. The source sends it to the same place: its GilbVeda master origin constant, with the same `vault=` built from it and no typed URL; here the constant is the getter. Public vocabulary Find: anonymous on purpose (a token would force a preflight the public surface does not need). Made only after the quiet time, for a query of at least two characters; aborted when the query changes or the sheet closes. The unit makes no other request and writes nothing.

## Examples

```tsx
import { createPortal } from "react-dom";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { SkillPickerSheet, SkillDepthNote } from "@kaigilb/gilbplatformcode-skill-picker-sheet";

setTermOrigin("https://<your ontology origin>"); // once, at start-up

{picking &&
  createPortal(
    <SkillPickerSheet excludeUris={held.map((s) => s.typeUri)} onPick={(skill) => addSkill(skill)} onClose={() => setPicking(false)} />,
    document.body,
  )}

<SkillDepthNote skillName="nursing" note={note} readOnly={!canEdit} saving={saving} error={error} onCommit={async (next) => (await saveNote(next)).kept} />
```

## What the host must supply

- `setTermOrigin(...)` from `term-origin`, once at start-up. Without it a search throws the setting's error (a blank query needs none).
- A global `fetch`; Tailwind scanning this unit's `src` and the CSS variables above.
- The portal into the document body, if the page needs one (above).
- Nothing else: no provider, no context.

## Module state

None of its own. (`term-origin` holds the origin; `contact-rows` is an imported peer.) The sheet keeps the query, the load state, one abort controller and the exclusions in `useState`/`useRef`; the note keeps its draft, an unconfirmed text and a commit counter.

## Do not

- Do not offer a hit under another origin: the canonical referent check is the contract with the claim path.
- Do not read `count` for a total, and do not print a total's value without its kind: use `formatResultTotal`.
- Do not send a credential with the search.
- Do not let an older answer replace a newer one.
- Do not drop a note the store did not confirm.

## Wrong readings

- "The sheet portals itself." It does not; the caller does.
- "A pick closes the sheet." It does not; the caller closes it (the section does so in `onPick`).
- "`excludeUris` is a list of storage addresses." A skill is excluded by either address: its `uri` or its `typeUri`. The section passes the referents it holds.
- "No total means no matches." A read with no total prints no total (not a zero); "No skills match" is shown only when the list is empty.
- "`VEDA_VAULT_ID` is a constant." In the source it was a load-time constant; here it is `vedaVaultId()`, read at call time from the origin the host set.
- "`SkillDepthNote` saves." It hands the trimmed text to `onCommit` and shows the answer.

## Changes in 0.1.2

- Peer range only: `contact-rows` 0.2.0 (a skill is named, not addressed) is the release it is installed with; `ThinSkill` and `skillReferentUri` are unchanged. Peers: `contact-rows` is now `^0.2.0`. devDependencies gained `skill-uri-label`, `term-name-text`, so the installed units resolve in the tests. The install line is the output of `peers.mjs` again. No source or test of this unit changed.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`, copied by script, whole files:

- `src/components/mynet/SkillPickerSheet.tsx` (297 lines) to `src/SkillPickerSheet.tsx`.
- `src/components/mynet/SkillDepthNote.tsx` (125) to `src/SkillDepthNote.tsx`.
- `src/lib/mynet/skills/searchSkillsRemote.ts` (173) to `src/searchSkillsRemote.ts`.

Of `src/lib/mynet/skills/thinSkills.ts` (148) nothing is copied: `ThinSkill` (lines 19-46) and `skillReferentUri` (60-81) are in `contact-rows`; lines 82-148 (`skillParentLabel`, `searchSkills`, `groupSkillsByParent`) are `skill-browse`'s and are not reached by these files; lines 1-18 and 47-59 are the header, the import and the private pattern.

(The files were themselves copied from the MyNet app.)

Named changes, and only these:

1. The imports are imports of units: `Button` from `button`; `formatResultTotal`, `readResultTotal`, `exactCount` and `ResultTotal` from `result-total`; `termOrigin` from `term-origin`; `ThinSkill` and `skillReferentUri` from `contact-rows`; the three files import one another by their new names.
2. `GILBVEDA_MASTER_ORIGIN` (a load-time constant) is `termOrigin()` at its three uses in `searchSkillsRemote.ts`: the request's address, the `vault=` and the canonical-referent pattern. So `VEDA_VAULT_ID` (a constant) is `vedaVaultId()` (a function), and the private `MASTER` and `CANONICAL_REFERENT` are built inside the call, after the blank-query return.
3. The header comments are new and shorter; the comments that name a cycle, a ruling, an agent, a date, a ticket or a MyNet commit are reworded with the same facts. No code changed.
4. `src/index.ts` is new and exports by name.

With comments and imports removed, `SkillPickerSheet.tsx` (784 words) and `SkillDepthNote.tsx` (266) are token-equal to the source (0 diff lines each). `searchSkillsRemote.ts` is 323 words in the source and 326 here, and differs in exactly the lines of named change 2 (a constant replaced by a function, two pattern lines moved into the call, two uses changed). `Button` (135 words) and `result-total`'s `resultTotal.ts` (365) were compared with the source's and are token-equal, so the peers are the app's.

## Changes in 0.1.1

A patch release: no source change. `contact-rows` 0.1.2 gained the peer `home-dial` (and, through it, `phone-text`), so this unit's installed copy of `contact-rows` needs them: both are added to its devDependencies (lock refreshed) and to the install line above.

## Tests

101 tests in 5 files (`npx vitest run`):

- `searchSkillsRemote.test.ts` 28: PORTED the source's 10 (9 + the origin case), the catalogue host now the test origin set with `setTermOrigin` instead of fixed host names; NEW 18: the request (method, headers, no credential, the signal, the exact parameters, the query trimmed and encoded), the origin read at call time and a referent under the old origin refused, no origin set, every hit mapping rule, the limit, `complete` in five cases, a malformed total, the refusal's message and truncation.
- `SkillDepthNote.test.tsx` 22: PORTED the source's 2 (`SkillDepthNote.p4.c214.test.tsx`); NEW 20: when it draws nothing, what is shown, editing (commit trimmed, no change, Escape, a note arriving while closed and while typing), the unconfirmed text in three states, the interest wording.
- `SkillPickerSheet.test.tsx` 36: PORTED the one picker-level scenario of `ContactRows.c214e5.test.tsx` (the dialog, a search, the held skill not offered again, a pick handed over), driven on a recording `fetch` instead of a mocked search module; NEW 35: the sheet, the states before a list, the request, the list and its head in all total shapes, exclusions, empty, failures, typing on (a burst is one request, an older answer or failure is never shown, abort on change and on close).
- `exports.test.ts` 2, `hostAgnostic.test.ts` 13.

Left out (they drive the row, not the sheet; the row is `contact-rows` / HC19a): `SkillRows.c214.test.tsx` (19 cases, the Skills row), `InterestRows.c214.test.tsx` and `InterestRows.s8cardlook.test.tsx` (which replace the sheet by a double), the other 7 cases of `ContactRows.c214e5.test.tsx` and the saving half of the eighth (the stored pick, removing it, the notes), and `thinSkills.referent.test.ts` / `thinSkills.search.test.ts` (the functions that are `contact-rows`' and `skill-browse`'s). No `vi.mock`; fake timers for the quiet time.

Mutation checks: 67 mutants (the constants; the request's address, method, mode, signal, `prefer`; the referent pattern and its anchors; the mapping of tag, does, total and `complete`; the refusal's message and length; the blank query; the note's six rules; the sheet's exclusions, aborts, stale answers, states, head words, close paths, pick, interest words), 63 killed and 4 equivalent: the note's draft is reset when the box opens, so resetting it on Escape or while closed adds nothing visible (2); the previous search is aborted both at the top of the effect and in its cleanup (1); the picker's page size passed as `limit` equals the client's default (1). The first run had 12 survivors, 8 of them real gaps (a blank query's total, a non-list `hits`, the unconfirmed text on reopening, a late answer and a late failure from a request that cannot be cancelled, the page note when complete, a row with no description, the row key); tests added.
