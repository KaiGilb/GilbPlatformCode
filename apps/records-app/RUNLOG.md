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
