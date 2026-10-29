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

## Batch 4 (directed by Kai-Zen)
Start 2026-10-29 01:06:43 UTC. End 2026-10-29 01:20 UTC. About 30 tool calls. Red first: 18 failed of 64 at the first run (platform, supersede, read-back, Connection); then green 65. I started no server and called nothing in production.

### Read
Rule_Code_dev-rig-discipline (rules 1, 8, 9, 10, 11, 13, 14, 15, 16) and Proc_v_i_c_LocalAppOnLiveVaults (entry conditions).

### What changed because of the rules
- RuleRigdevNoCrossSiteCookieBridge: the SessionCredential used `dpopMintUrl` (the cookie bridge). From localhost that is cross-site and answers 401 silently. Now the bridge is used only when `import.meta.env.DEV` is false; the dev server signs in cookieless. Consequence, stated for Kai: a page reload ENDS the session on the live check, by design (RuleRigdevCookielessMintForLocal). I did not persist the key.
- Bug found while reading GilbApp: the /lws/vaults row's vault entity is `@id` (vaultSets.ts:197-201: `entity: node["@id"]`), not `entity`. Batch 2 read `row.entity`, so the pointer road would never have been read live. Fixed (the pin test and the Connection test cover it). This answers the batch-2 open question about the entity on rows.
- `import.meta.env.VITE_*` must be written literally for Vite to replace it in a build; the cast form I used would have read nothing in `vite build`. Fixed in platform.ts and data.ts.
- queryFn passed the query context as the `pin` argument (a type error caught by tsc); fixed with an arrow.

### 4.1-4.6
- 4.1 vite.config.ts `server: { port: 5251, strictPort: true }`; test src/config.test.ts (red when the config is reverted).
- 4.2 `pickVault(rows, pin)`, `findMyVault(pin = VITE_VAULT_URL)`, `VaultNotReachableError`. Row fields (GilbApp 9a602ea7 vaultSets.ts:127-141,191-206): `@id` entity, `vaultId`, `modes`, `isLandingVault`. Match is on vaultId or the root of `@id`, as URLs with trailing slash ignored. No fallback.
- 4.3 `SupersedeOnlyError`; guards at the top of addEntry, uploadPhoto, setProfilePhoto (before any fetch); the form and picker are not rendered; one notice line. Listing, opening, searching and the profile save work.
- 4.4 `saveProfile` returns `{confirmed, failed}` after a `readRecord` read-back; "Saved" only when every edited value is under the bare slug (lists: contains it; removed: absent). Photo write has no read-back (it is off in the live run); noted, not done.
- 4.5 Connection section (region "Connection"): vaults reached, vault id and modes, own card road and id. Zero rows: "Signed in, but this credential reaches no vault: identity not proven." Expiry: no unit has an expiry error (signin/session has NotSignedInError and OriginNotAllowedError only; the bridge's NotSignedInError carries the 401 and drops the body). So `/lws/vaults` is read by the app: a 401 body naming expiry gives `CredentialExpiredError`, any other 401 gives the bridge's NotSignedInError. Other calls (record reads and writes) still map every 401 to NotSignedInError inside lws-records; expiry cannot be told there. Known gap.
- 4.6 scripts/live-check.sh; `bash -n` exit 0; not run. VITE_PLATFORM_ORIGIN=https://gilb.com is GilbApp's production value (config.ts:12).

### 4.7 Sign-in code path (GilbApp 9a602ea7, read-only)
- Production's sign-in card uses the same route: `EMAIL_REQUEST_CODE_URL = ${BASE_ORIGIN}/base/auth/email/request-code` (src/lib/base/config.ts:284), called by `requestSignInCode` (src/lib/base/emailSignIn.ts:44-56) with `{ email, return_to? }`; the same body as the signin unit (units/signin/src/http.ts:30-32).
- GilbApp's own comment on it says "Code is emailed, never in the body" (config.ts:283). That contradicts RuleRigdevOtcFromMailboxNotLog ("writes the code to the server log only"). I cannot tell which is true without calling production; I did not.
- One difference: GilbApp posts to BASE_ORIGIN (the apex https://gilb.com); our card posts to VITE_ID_ORIGIN (https://id.gilb.com), the host Dev.Guide.SignIn names. The run script sets ID_ORIGIN to id.gilb.com. If no mail arrives, the apex route is the one GilbApp uses; Kai-Zen may point Kai at https://gilb.com/onboard/start. No code changed.

### Stuck
- A stray `cat > file` in one command waited on stdin and hung that call (about 2 min); stopped it with TaskStop. The script file was then written with the Write tool.
- Other sessions' vitest processes (DATABASE_URL=...plancard...) are running on this machine; I left them alone.

## Batch 5 (directed by Kai-Zen)
Start 2026-10-29 01:13 UTC. End 01:15 UTC. About 6 tool calls.
- The list filter takes bare type names (`params.append("type", t)`, lws-vault-sets vaultSets.ts:209; doc comment :158-162, e.g. `Person`), so the slug is `CatalogEntry`, derived from the one slot (`RECORD_TYPE.replace(/^t:/, "")`).
- `curl https://veda.gilb.com/base/t/CatalogEntry` (read only) returns label "Catalogue Entry".
- Red first: M6 literals changed to `t:CatalogEntry` / `CatalogEntry`, run against the old slot: 3 failed (the wire test, the addEntry test, the listEntries test). Then the slot changed: 65 of 65 green.
- Type picture (RuleBvTypePicture): the app shows no type icon or picture anywhere (grep of App.tsx finds only the profile photo). Nothing changed.
- `grep -rn "Thing" src` returns nothing. VITE_SUPERSEDE_ONLY and scripts/live-check.sh untouched.

## Batch 6 (directed by Kai-Zen): own card, creates on for the pinned test vault, read-back on every write
- LIBRARY GAP: no ensureSelfCardRecord in lws-records (it has createRecord only). `ensureSelfCard` in src/data.ts is a HOST OBJECT. Behaviour copied from GilbApp bf1d681c `src/lib/base/records.ts:561-602` (`ensureSelfCardRecord`) and the server GilbPlatform `src/lws/routes.ts:772-807` (the route "POST /lws/vault/:vaultId/selfcard" is at line 783; 409 SelfCardIdentityUnknown at the catch). The URL is `LWS_VAULT_SELFCARD_URL` (GilbApp `src/lib/base/config.ts:440`): `vaultOriginOf(vaultId)` + `/lws/vault/` + `encodeURIComponent(vaultId)` + `/selfcard`; the unit vault-origin-rule has no such constant, so the app builds it with the same segment encoding as LWS_VAULT_FILES_URL.
- Wire facts: lws-records' `toWireFacts` and `throwForCreateStatus` are not exported. The app drops empty values and spells each slug with the exported `storedSpellings(slugs, undefined)` (= `a:` + slug), which is what toWireFacts does when no source is given. Type: `typeUriForVaultNamespace("Person", vaultId)` (= `t:Person`), as GilbApp does.
- Gate: `VITE_ALLOW_CREATE=1` AND the vault equals `VITE_VAULT_URL` (`sameUrl`, moved to src/sameUrl.ts, same compare as pickVault). The compare uses the vaultId only. A pinned vault that pickVault matched through its entity root while its vaultId differs from the pin would be refused (safe side). Not seen live.
- Not proven from source: that the selfcard door answers 201/200 with a `Location` of the form `…/lws/r/<id>` (the server's sendWriteResult was not read here; GilbApp reads it the same way, with the body's `@id` as fallback). Nothing was run against a live vault.
- Read-back on every write: record (by `<vault>/e/<id>`), own card (refetch + `cardHolds`), picture (card read again, photo fact equals the uploaded location).
