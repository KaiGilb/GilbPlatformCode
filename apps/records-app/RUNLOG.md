# Run log: records-app (cold run, no spec)

Start: 2026-10-29 00:34:33 UTC (first command). End: Thu Oct 29 00:40:21 UTC 2026. About 40 tool calls, about 14 of them reading before the first line of code.

## Searches for existing code
1. `node scripts/kz-std/kz-std.mjs get Rule_Code_gilbplatformcode-chooser-search` -> exit 4 (not in the Kai-Zen pack). Agent.Coder points at it by name; I did not run `find` on it. The library README says "search References in the App Builder vault" and that "if none matches, stop". I had no way to search References from a terminal, so I did the next best thing:
2. `ls units` (277 folders) and read the README of the units whose names matched the words of the task: signin, color-scheme, lws-records, lws-session-bridge, record-write, lws-vault-sets, photo-ref, photo-term, photo-location, face-crop, vcard-line, contact-actions, search-words, text-filter. Chosen and used: signin (card + SessionCredential), lws-session-bridge, lws-records (create/read/patch), lws-vault-sets (list), color-scheme, text-filter (search), contact-actions (call/email links on the profile), face-crop (only appendFaceQuery and faceLocationFor), plus their peers base-origin, vault-origin-rule, record-types, narrow-total, result-total. Not used: record-write (no sharing in this app), photo-term (profilePhoto read as a plain slug; the term serves "a:profilePhoto|a:hasPhoto", write spelling a:profilePhoto), FaceCropper (skipped for speed; upload sends face=whole), vcard-line, search-words.
3. `node scripts/peers.mjs units/<unit>` for the install line of each. It lists peers but is silent about `install-links=true`; the README says it. I used it as the README says.
4. grep for an upload helper in units: none. The face-crop README says "The upload ... transport stays in the app".

## Stuck or unsure
- Dev.Guide.Overview / Dev.Guide.Files / Dev.Guide.Upload: `kz-std find` returned 0 hits each (about 18 s each, 9 packs). The chapters that do exist (GetStarted, SignIn, Reading, Writing) were found only by following hand-offs from Dev.Guide.AppAccess. About 4 min lost. Gap: Agent.Coder names Dev.Guide.Overview but it is not findable by that tag.
- File upload route: no Dev Guide chapter that I could find. I found "POST /files" and "/lws/vault/:vaultId/files" only by grepping this vault's project notes (Capability-Developer-GilbSupport.md, Cycle188 report). The query word for the file name (I send `name=`) is a guess. About 5 min lost. NOT proven.
- Third-party origin registration (Agent.Coder.GilbStack item 14): a browser app on its own origin must POST /base/client/register and the owner must approve the origin. I did not do this (it needs a live vault). Without it the app will be refused on CORS from a non-platform origin. Not done, not proven.
- Which apex is "base origin": the units want an apex whose subdomains are vault hosts. I defaulted to https://gilb.com with sign-in at https://id.gilb.com (from Dev.Guide.GetStarted). Env overrides VITE_PLATFORM_ORIGIN and VITE_ID_ORIGIN. Unproven.
- Node 25 + jsdom: global localStorage is broken (`localStorage.clear is not a function`). Used an in-memory stub in the theme test. About 2 min.
- The "records" type: no obvious type for "a record of things" with name and description. Used t:Thing (see terms).

## Host objects / adapters I wrote to wire units
- `signInAuth` (src/platform.ts): the SignInAuth object for SignInCard, from requestSignInCode, prepareVaultName, checkVaultName and credential.signInWithCode. The README lists the interface; no ready-made object. completeNamedVault is a no-op because verifyCode with a name makes the vault.
- `signInApp` (SignInApp) and `initPlatform()` (setBaseOrigin, setSystemVaultHosts, setLwsAuth(lwsAuthFromSession(credential))).
- `findMyVault` / `pickVault`: GET {id}/lws/vaults and choose the writable landing vault. No unit does this.
- `uploadPhoto`: the picture upload (see above). No unit.
- `photoObjectUrl`: fetch /files/<id> with the credential and show a blob address.
- Theme storage wrapper (src/theme.ts) over color-scheme: the unit leaves storage to the host.

## GilbVeda terms
Searched read-only with `GET https://jackfruit.gilb.com/base/terms?q=...` and read `GET https://veda.gilb.com/base/t/<Type>` and `/base/a/<slug>`. Nothing minted or sent.
- Found: t:Thing (Approved: "Anything whatsoever that can be identified, described, or referred to"), t:Person (Approved), a:name (Approved), a:description (Approved, free text ABOUT the record), a:email (Approved), a:phone (Suggested), a:profilePhoto (Approved; deprecated spelling a:hasPhoto).
- Not found / request for Agent.Concept: (1) a purpose-fit type for "a user's record of a thing with a name and a description" (t:Thing is the universal root, so it is only a loose fit; a type such as an item or catalogue entry may be wanted; t:VaultRecord is about the storage unit, not the content; t:Record is a Planguage benchmark and not usable). (2) I did not check that a:name, a:description, a:email, a:phone are declared as fields of t:Thing (a:name and a:phone list t:Person, t:Organization among fieldOf). Agent.Concept should confirm the typing gate (BVGATE_03) for t:Thing with a:name and a:description. I did not run the gate: it needs Agent.Concept.

## Not proven
Anything against a live vault: sign-in, vault lookup, create, list, patch, upload, photo display. Tests mock the unit seams.

## Batch 2 (directed by Kai-Zen)
Start 2026-10-29 00:41:42 UTC. End 2026-10-29 00:45:16 UTC. About 30 tool calls.

### Searches and reading
- `kz-std get Kai-Zen.Return`: read (batch 1 skipped it). GilbPlatform.SignOff not read by me this batch (see handback).
- Read in full: units/self-card, units/own-card, units/plan-self-source READMEs, and plan-self-source/src/ownCardFinding.ts. Chose `ownCardFindingQuery(vault).queryFn()` from plan-self-source: it is a plain async function (no hook), wires `ownCardDeps` + `findOwnCard` + the API host. I did not write the two reads myself. The vault object it needs (ReachableVault) is a HOST OBJECT: `pickVault` in src/platform.ts builds it from a /lws/vaults row (only vaultId, entity, name, isLandingVault, modes are real; cast). Whether /lws/vaults rows carry an `entity` (the vault entity the pointer lives on) is UNKNOWN: if not, the pointer road reads nothing and only the derived road works.
- `node scripts/peers.mjs` for plan-self-source printed a 40-unit line (plan-record-hooks, for ONE type). Installed it as printed plus own-card, self-card, photo-term. About 3 min.
- `setSystemHostLabels([...])` (own-card) must be called at start-up; it throws if not. I used id, veda, geo, kaizen, connect, maintain, www, skills, gilb (the source's eight plus maintain). Host wiring in `initPlatform`.
- GilbApp 9a602ea7 read through `git show` / `git ls-tree` / `git grep` only.

### 2.1e GilbApp terms (file:line at 9a602ea7)
- email and phone: terms `a/email` and `a/phone`, multi-valued; MyNet sidecar keys email, emailPrivate, email2, phone, phone2 (src/lib/base/contactRows.ts:6-18, 45-46); read by term in src/components/records/RecordDetail.tsx:644,646. A single value may be served as a plain string (contactRows.ts:9). Written here as bare slugs `email`, `phone` (patchRecord mints a:<slug>, vaultProfilePhoto.ts:57-60). I keep the first value editable and send back the other rows (`withFirst`); the MyNet sidecar term a/fieldMeta (work/private labels) is NOT touched or written, so a label could drift when the first row is replaced. OPEN QUESTION for the live check.
- name: the card's name is its one `name`, else given + family (src/lib/base/personName.ts:3-7, 18-20; ownCard.ts cardNameOf in plan-self-source). I write only `name`; a card that carries givenName/familyName is not kept in step with it (GilbApp does, personName.ts:7). OPEN QUESTION.
- photo: `a:profilePhoto`, written as the bare slug from photo-term `writeKeyBare` (vaultProfilePhoto.ts:32-33, 57-60, 504); value `/files/<id>` of the lean face else the master (vaultProfilePhoto.ts:891).

### 2.2 Photo route (file:line at 9a602ea7)
- NOT POST: **PUT** `/lws/vault/<vault>/files` (src/lib/base/files.ts:225; URL files.ts:223 via LWS_VAULT_FILES_URL, which vault-origin-rule already holds, vaultOriginRule.ts:312). Batch 1 used POST and the vault notes; that was wrong.
- Query: `name` (files.ts:189) and `face` (files.ts:198, appendFaceQuery of face-crop; `whole` when null).
- Body: the raw Blob, never multipart (files.ts:23, 230). Headers: `dpopWriteAuth("PUT", url)` plus `content-type` = media type (files.ts:229). No keepalive (files.ts:231-236).
- Response: 201 `{ entity, contentHash, byteSize, created, leanFace? }` (files.ts:130-138, 239). The card's photo ref: `/files/<face id>` (vaultProfilePhoto.ts:891); face-crop's `faceLocationFor(ack)` is that rule, so I use it. Card write: patchRecord on the card with the photo slug (vaultProfilePhoto.ts:504).
- Units checked: photo-ref (used: photoBytesUrl for display), photo-term (used: read/write spelling; it fetches the term from the master at run time, seed if unreachable), face-crop (used: appendFaceQuery, faceLocationFor), photo-location, image-displayable, type-picture, raw-files-path (not needed).
- Not copied: GilbApp falls back to an owner-path `POST /files` when the vault upload is refused 403 (files.ts:316-342 uploadFilePreferVault). I did not add the fallback. OPEN QUESTION for the live check.
- Photo write patches the own card only; with road none there is no upload (test "road none sends no create…").

### 2.3 / 2.4
- One slot: `RECORD_TYPE` in src/data.ts (list slug derived from it, `RECORD_LIST_TYPE`). Renamed Thing to Entry throughout.
- Kept contact-actions (Call/Email links under the contact fields, still used) and face-crop (appendFaceQuery and faceLocationFor are GilbApp's own rule for the photo ref and the face query). Dropped nothing.
- listEntries throws naming the cap (50 pages, 5000 records); one test.

### Stuck / open for the live check
- Road none: the app shows the message and disables the form. What the platform does for a vault with no own card is not known to me; Kai-Zen is finding out.
- Fixture for the pointer road: I wrote my own small fake of GET /lws/r/<id> in data.test.ts (plan-self-source keeps its own under test/, not shipped).
- Unproven: everything against a live vault, as in batch 1.

## Batch 3 (directed by Kai-Zen)
Start 2026-10-29 00:50:02 UTC. End 2026-10-29 00:54 UTC. About 25 tool calls.

### Method
Tests first, run against 60ff8bc's code (the only change before the red run: `Avatar` exported so a test can render it), 12 red; then the fixes; then 42 green. Mutants for the M items were run against the final code with /tmp/mut.py (a small replace-run-restore script, not kept): 12 mutants, all red.

### Searches and findings
- D3: `git grep -i -E "signOut|sign-out|logout|/auth/session" 9a602ea7`. Production GilbApp signs out with `POST {BASE_ORIGIN}/onboard/logout`, `credentials: "include"`, `redirect: "manual"` (a 303 is opaque), failure not fatal (src/lib/base/signOut.ts:16-24), then drops token and key (:25-26), then `queryClient.clear()` (:41). grep of units/signin: `SessionCredential.invalidate(true)` is sign-out of the in-memory key only; no unit does the server call. So `src/signOut.ts` is a HOST OBJECT I wrote, copied from GilbApp.
- The session mint URL: GilbApp uses `${BASE_ORIGIN}/base/auth/session/dpop-token` (src/lib/base/config.ts:321). Batch 1 had pointed it at the id host (my guess). Changed to PLATFORM_ORIGIN to match GilbApp. Unproven live.
- D4: signin.css names (grep `var(--` in units/signin/src/signin.css): --signin-ink, -card, -field, -sheet, -muted, -brand, -on-brand, -error-bg, -error-ink, -line. README has no "What the host must supply" list of colours; I read the CSS. Set all but -line in both themes, aliased to the app tokens. The test parses styles.css and fails below 4.5:1 for 16 pairs per theme.
- The old red for D4 first came from my own regex failing to read the light block (all "not set"); I fixed the test parser and re-ran (a real red: 8 sign-in pairs not set). Lost about 3 min.
- Node 25 localStorage again: in-memory stub in the new tests.

### Stuck / unsure
- `fireEvent.change` on a file input cannot show that `value` was reset (jsdom derives it from its own file list), so the reset test spies on the `value` setter.
- A `findByRole("list")` matched the empty list while loading: a test bug, fixed by waiting for the first row.

### Known and not done (as directed)
- URL routing (a reload returns to the list; a card has no address).
- Photo-orphan cleanup (an uploaded file whose card patch failed stays in the vault).
- Refetch-after-save message (the profile does not say it re-read the card).
- Still open from batch 2: vault `entity` on /lws/vaults rows; no-card behaviour; the owner-path POST /files fallback; fieldMeta labels; given/family name.
