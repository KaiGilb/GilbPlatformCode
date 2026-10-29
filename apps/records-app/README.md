# records-app

## What it is

This is the cold-coder test app of GitHubStandard.
A person signs in and has a profile card: name, email, phone and picture.
They also keep records (`t:CatalogEntry`: a name and a description).
The app has a list, search, open-on-a-card, and dark, light or system mode.

## Units it uses

All are `@kaigilb/gilbplatformcode-*` packages, installed from the folder named on the line.

- `@kaigilb/gilbplatformcode-base-origin`: `units/base-origin`
- `@kaigilb/gilbplatformcode-base-record`: `units/base-record`
- `@kaigilb/gilbplatformcode-color-scheme`: `units/color-scheme`
- `@kaigilb/gilbplatformcode-contact-actions`: `units/contact-actions`
- `@kaigilb/gilbplatformcode-description-parts-model`: `units/description-parts-model`
- `@kaigilb/gilbplatformcode-direct-shares`: `units/direct-shares`
- `@kaigilb/gilbplatformcode-entity-ref`: `units/entity-ref`
- `@kaigilb/gilbplatformcode-face-crop`: `units/face-crop`
- `@kaigilb/gilbplatformcode-folder-part`: `units/folder-part`
- `@kaigilb/gilbplatformcode-id-tail`: `units/id-tail`
- `@kaigilb/gilbplatformcode-lws-records`: `units/lws-records`
- `@kaigilb/gilbplatformcode-lws-relations`: `units/lws-relations`
- `@kaigilb/gilbplatformcode-lws-session-bridge`: `units/lws-session-bridge`
- `@kaigilb/gilbplatformcode-lws-vault-sets`: `units/lws-vault-sets`
- `@kaigilb/gilbplatformcode-main-tag`: `units/main-tag`
- `@kaigilb/gilbplatformcode-narrow-total`: `units/narrow-total`
- `@kaigilb/gilbplatformcode-online-card-link`: `units/online-card-link`
- `@kaigilb/gilbplatformcode-ontology-reads`: `units/ontology-reads`
- `@kaigilb/gilbplatformcode-own-card`: `units/own-card`
- `@kaigilb/gilbplatformcode-photo-ref`: `units/photo-ref`
- `@kaigilb/gilbplatformcode-photo-term`: `units/photo-term`
- `@kaigilb/gilbplatformcode-plan-card-facts`: `units/plan-card-facts`
- `@kaigilb/gilbplatformcode-plan-kinds`: `units/plan-kinds`
- `@kaigilb/gilbplatformcode-plan-links-model`: `units/plan-links-model`
- `@kaigilb/gilbplatformcode-plan-record-hooks`: `units/plan-record-hooks`
- `@kaigilb/gilbplatformcode-plan-self-source`: `units/plan-self-source`
- `@kaigilb/gilbplatformcode-platform-fetch`: `units/platform-fetch`
- `@kaigilb/gilbplatformcode-record-cache-kit`: `units/record-cache-kit`
- `@kaigilb/gilbplatformcode-record-sync`: `units/record-sync`
- `@kaigilb/gilbplatformcode-record-types`: `units/record-types`
- `@kaigilb/gilbplatformcode-relation-role`: `units/relation-role`
- `@kaigilb/gilbplatformcode-result-total`: `units/result-total`
- `@kaigilb/gilbplatformcode-self-card`: `units/self-card`
- `@kaigilb/gilbplatformcode-share-refusal`: `units/share-refusal`
- `@kaigilb/gilbplatformcode-signin`: `units/signin`
- `@kaigilb/gilbplatformcode-stakeholder-list-state`: `units/stakeholder-list-state`
- `@kaigilb/gilbplatformcode-tag-client`: `units/tag-client`
- `@kaigilb/gilbplatformcode-term-origin`: `units/term-origin`
- `@kaigilb/gilbplatformcode-text-filter`: `units/text-filter`
- `@kaigilb/gilbplatformcode-type-curie`: `units/type-curie`
- `@kaigilb/gilbplatformcode-type-key`: `units/type-key`
- `@kaigilb/gilbplatformcode-vault-origin-rule`: `units/vault-origin-rule`
- `@kaigilb/gilbplatformcode-vault-type-census`: `units/vault-type-census`
- `@kaigilb/gilbplatformcode-working-set-store`: `units/working-set-store`

## Host objects the app writes itself

These are the places where no unit does the job yet (the library gap). Each lives in `src/`.

- `signInAuth` (`platform.ts`): the object the sign-in card needs. The sign-in unit lists the interface but gives no ready-made one.
- `signInApp` and `initPlatform()` (`platform.ts`): start-up wiring of the origins, the system vault hosts and the session.
- `findMyVault` and `pickVault` (`platform.ts`): read the vault list and choose the writable one. No unit does this.
- `uploadPhoto` (`data.ts`): the picture upload. No unit does the file route.
- `ensureSelfCard` (`data.ts`): creates the person's own card through the self-card door. There is no `ensureSelfCardRecord` in lws-records, which has `createRecord` only. The URL is built here because vault-origin-rule has no constant for it.
- Wire-fact spelling (`data.ts`): lws-records does not export its wire-fact and create-status helpers, so the app spells the facts itself with `storedSpellings`.
- Theme storage (`theme.ts`): the color-scheme unit leaves storage to the host.
- `signOut` (`signOut.ts`): the server sign-out call. The signin unit only clears the key in memory.
- Expiry check on the vault list (`platform.ts`): no unit has an expiry error, so the app reads the 401 body itself.

## GilbVeda terms

- `t:CatalogEntry` (Suggested, minted 2026-10-29)
- `t:Person`
- `a:name`
- `a:description`
- `a:email`
- `a:phone`
- `a:profilePhoto`

## Run it

```
npm install
npm test
npm run build
```

To try it live against production, use `scripts/live-check.sh` only.
It pins one test vault and allows creates only there.
A person signs in with their own email code.
A reload signs out. This is by design: the local sign-in is cookieless.

## Status

Proven by tests.
Sign-in, vault reach and the empty list were proven live on 2026-10-29.
Creates (own card, records, picture) are not yet proven live.
