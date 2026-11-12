# fake-platform

## What this is

A fetch stand-in for the GilbPlatform that answers the platform's real routes with the platform's real shapes, holding its state in memory, for an app's tests.

An app's tests use it in place of the live platform: seed a person, a vault and some records, point `fetch` at it, and run the app's real code (`lws-records`, `record-sync`, `signin`, `picture-set` and the rest). `DESIGN.md` holds the route table, the state model and the reasons; every route cites the GilbPlatform line it mirrors.

## Use it

```ts
import { createFakePlatform } from "@kaigilb/gilbplatformcode-fake-platform";
import { generateDpopKeyPair } from "@kaigilb/gilbplatformcode-signin";
import { expect, test, vi } from "vitest";

test("the app lists Ann's boats", async () => {
  const fake = createFakePlatform();                                       // origin https://fake.test, vaults at https://<name>.fake.test/vault
  const ann = fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
  const key = await generateDpopKeyPair();                                 // the app's own DPoP key
  const { token } = fake.signInAs(ann, { jwk: key.publicJwk });            // a token bound to that key
  vi.stubGlobal("fetch", fake.fetch);                                      // the app's fetch is the fake
  fake.seedRecord(ann.landingVaultId!, { type: "Sailboat", facts: { "a:name": "Heron" } });
  const boats = await listBoats(token, key);                               // the app's own code
  expect(boats).toHaveLength(1);
  expect(fake.calls.of("GET /lws/vault/:vault/records")).toHaveLength(1);  // what the app sent
  expect(fake.violations).toEqual([]);                                     // and nothing the platform does not have
});
```

- The fake: `fetch`, `client(origin?)` (a `{ origin, fetch }` for `record-sync`), `transport` (for `signin`), `authHost(person)` (for `setLwsAuth`), `state`, `calls` (`all`, `of`, `last`, `count`, `clear`), `violations`, `assertClean()`, `offline`, `reset()`.
- Seeds, no request made: `seedPerson`, `seedVault`, `seedRecord`, `seedFile`, `seedPicture` (`<name>.jpg` and `<name>-320.jpg`, the copy linked to the master), `seedStyle(url, { colors, fonts })` (what the website reader answers for that address), `grant`, `takeName`, `signInAs`, `pendingCode(email)` (the one-time code request-code issued).
- Another device or person acts: `edit`, `remove`, `bump` (the ETag moves, the facts do not), `revokeAccess`.
- Failures: `failNext(match, { status, body?, message?, times?, skip? })`, `dropNext(match)` (a lost network), `hold(match, { skip? })` (waits until the returned function is called), `partialNextCreateNamed()` (the next create-named answers 202). `match` is `"GET /lws/vault/:vault/records"` or a RegExp on `"METHOD /path"`.

What it answers: sign-in (`request-code`, `verify-code`, `name-prep`, `check-name`), `create-named` (a `parentVault` must be a vault the caller MINTED through create-named: the sign-up landing vault, a seeded vault and another person's vault are 403 `You do not own parent vault <entity> — nest only under vaults you have minted`, GilbPlatform `src/auth/create-named-vault.ts:312` and `:571`; `Vault.mintedBy` is the email of the minter, null for a landing or seeded vault), `GET /lws/vaults`, records (create, read, patch, replace, delete, the list by type with `since`, `after`, `include=body`, `limit`, `offset`, `lifecycle=ended`), files (upload by PUT or POST, the listing, get, end, the `transcodedFrom` link by `PATCH /lws/r/<file id>`) grants (`grant-vault`, `revoke-vault`, `vault-acl`) and the website style reader `POST /base/style/extract` (row 21: the credential is checked before the body, a body over 4096 bytes is 413, 10 calls per 60 s per principal then 429 `rate_limited`, an address that is not https is 400 `bad_url`, a private or local one is 400 `address_not_allowed`, GilbPlatform `src/routes/style-extract.ts:29`, `:33-36`, `:38-80`; it reads no site, it answers what `seedStyle` set or a stub of the address).

## Options

| Option | Default | What it does |
|---|---|---|
| `origin` | `https://fake.test` | the platform origin; its host and every host under `domain` are this platform |
| `domain` | the origin's host | vault hosts are `<name>.<domain>` |
| `hosts` | none | extra hosts answered as this platform (a dev rig) |
| `dpop` | `"strict"` | `"strict"`: a call without `Authorization: DPoP <token>` and a `DPoP` header is 401 on every route. `"platform"`: the platform's own postures (no header on `/lws` is an anonymous caller; a `DPoP` token without a proof is accepted) |
| `code` | `"000000"` | the one-time code, or a function of the email (the real one is random and emailed) |
| `createNamedVaultSegment` | `"vault"` | the segment of the vault address sign-in answers; source-derived, not measured on the wire (`DESIGN.md` section 14) |
| `nameCollision` | `"refuse"` | a taken name on create-named: `"refuse"` 409 (the production mint) or `"suffix"` (`name2`, the local mint) |
| `knownTypes` | any `https://…/base/t/<Name>` | the type IRIs create-named accepts as `represents` |
| `undefinedTerms` | none | fact keys the vaults refuse with 409 |
| `listingCarriesTranscodedFrom` | `true` | the file listing carries `transcodedFrom` per file (GilbPlatform `78d1fb1d`) |
| `proofWindowSeconds` | `60` | how far a proof's `iat` may be from now |
| `now`, `latencyMs` | the clock, none | the clock, and a delay for every request |

## Auth

In `"strict"` mode the token must be one the fake issued (`signInAs`, or `verify-code`); the principal is the one the token names. The proof's `htm`, `htu` (`https://` + the request's host + its path as sent, percent-escapes kept, query dropped, even over http; a mismatch is 401 `{"error":"Unauthorized","message":"DPoP proof htu does not match the request URI"}`, verify.ts:319), `ath`, `iat`, `jti` (not used before) and key (the token's `cnf.jkt`) are checked. Signatures are not: there is no real crypto. Strict is stricter than the platform on `/lws` and `/files` on purpose, so a call that forgot to sign fails in the test.

## Not faked

- Real signature checking, token issuer keys, email delivery, the send guard and its caps, the failed-code lockout, the session cookie.
- The first-day mint limit on create-named; machine, AI and review credentials; the `WrongSignInHost` refusal.
- The ontology: `represents` is judged by a pattern or `knownTypes`; fact keys are open unless `undefinedTerms` lists them.
- `?filter=` on the record list, `?thumbnail=`, `?face=` and `?fileType=` on an upload, `Range` on a download: each answers `400 fake_platform_not_faked`, never a silent pass.
- Nested vaults (`scannedVaults` is the one vault), vault-to-vault reach, public and group grants, per-record shares, idempotency keys, the 8 MiB `include=body` budget.
- Routes of the platform the code bank does not call (types, notes, selfcard, help, `/base/files`, `set-represents`, `dpop-token`): the table is closed until a client needs one.

## The honesty rule

`ROUTES` is the only route source, and every row cites the GilbPlatform line it mirrors (`PLATFORM_SHA` is the commit it was read at). A request no row answers is recorded in `violations` and answered `404 fake_platform_no_such_route`; a request to a host that is not this platform's makes `fetch` reject and is recorded too. The fake never accepts what the platform refuses (`t:Sailboat` as a list `type` is 400, an `http://` vault id is 400, an extra body key is 400) and never invents a field the platform does not send (the file listing has no `nextCursor`). A behaviour stricter than the platform's (strict DPoP) is stated here and marked in the answer. `fake.assertClean()` throws when `violations` is not empty.

## How to take it

Package: `@kaigilb/gilbplatformcode-fake-platform`. It has no dependencies of its own and ships TypeScript source (`src/`) that your bundler compiles; it runs in node, jsdom and a browser (an app's `dev:fake` mode can use it). Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link: `install-links=true`. Its own tests run against `lws-records`, `record-sync`, `signin`, `picture-set` and `vault-access`, which are dev dependencies.

## Where it came from

New code, written for the next app-building AI in EESpeed Round 5 (R5-C3). Repository `KaiGilb/GilbPlatformCode`, commit `73cc3dcf821ed0e80ffaf6a75bbd04491c5ecea7` (the main that holds `lws-records`, `record-sync`, `signin` and `vault-access` as the tests import them). No source file was copied. The routes mirror GilbPlatform at commit `619aca557597b1bc50dd6e1340ebc274039be9c2`.

## Changes in 0.1.2

- Row 21, `POST /base/style/extract`, for `style-studio`'s `makeExtractFromUrl`: see `DESIGN.md` row 21. The platform's 415, 502 and 504 are not faked (`failNext` makes them). The `address_not_allowed` answer is decided by the form of the name (the platform decides after DNS). This row was read at GilbPlatform `0d602ce8995dc672f241aff5e276f03b98dbad1b`, newer than the commit the other rows were read at.

## Changes in 0.1.1

- create-named: `parentVault` must be a vault the caller minted through create-named (`Vault.mintedBy`). The landing vault of a sign-up and a seeded vault are refused with the platform's 403 sentence (it used to accept any vault the caller owned, so an app's tests passed and its first live sign-in failed).
- The DPoP `htu` check was already there; it now has a test for the encoded vault path with a query and for the exact 401 body.
- Four tests that asserted client behaviour fixed in `signin` 0.2.4/0.2.5, `picture-set` 0.1.4 and `picture-upload` 0.2.1 (`CLIENT FINDING` and `CLIENT CAVEAT`) were failing on main; they now assert the fixed behaviour.
