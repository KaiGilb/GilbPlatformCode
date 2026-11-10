# fake-platform

## What this is

A fetch stand-in for the GilbPlatform that answers the platform's real routes with the platform's real shapes, holding its state in memory, for an app's tests.

An app's tests use it in place of the live platform: `vi.stubGlobal("fetch", fake.fetch)`, seed a person, a vault and some records, and run the app's real code (`lws-records`, `record-sync`, `signin` and the rest) against it. The route table, the state model and the reasons are in `DESIGN.md`; every route cites the GilbPlatform line it mirrors.

**Version 0.1.0 is part 1.** It answers the vault list (`GET /lws/vaults`) and the record routes (create, read, patch, replace, delete, and the list by type with `since`, `after`, `include=body`, `limit`, `offset` and `lifecycle=ended`). Sign-in, `check-name`, `create-named`, files and grants are rows of `DESIGN.md` section 2 that come in later parts; until then the fake answers them `404 fake_platform_no_such_route`.

## Use

```ts
import { createFakePlatform } from "@kaigilb/gilbplatformcode-fake-platform";

const fake = createFakePlatform();                       // origin https://fake.test, vault hosts <name>.fake.test
const ann = fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
const vault = fake.state.vaults.get(ann.landingVaultId!)!;
fake.seedRecord(vault, { type: "Sailboat", facts: { "a:name": "Heron" } });
const { token } = fake.signInAs(ann, { jwk: publicJwkOfYourDpopKey });   // the token is bound to that key
vi.stubGlobal("fetch", fake.fetch);                      // the app now talks to the fake
fake.failNext("PATCH /lws/r/:id", { status: 503 });      // the next PATCH answers 503
fake.calls.of("POST /lws/vault/:vault/c").at(-1)?.body;  // what the app sent
fake.assertClean();                                      // throws if any request reached no route
```

- `fetch`, `client(origin?)` (a `{ origin, fetch }` for `record-sync`), `state`, `calls` (`all`, `of`, `last`, `count`, `clear`), `violations`, `reset()`, `offline`.
- Seeds, no request made: `seedPerson`, `seedVault`, `seedRecord`, `grant`, `signInAs`.
- Another device or person acts: `edit`, `remove`, `bump` (the ETag moves, the facts do not), `revokeAccess`.
- Failures: `failNext(match, { status, body?, message?, times?, skip? })`, `dropNext(match)` (a lost network), `hold(match)` (waits until the returned function is called). `match` is `"GET /lws/vault/:vault/records"` or a RegExp on `"METHOD /path"`.

## Auth

`dpop: "strict"` (the default) answers 401 `{ error: "Unauthorized", … }` on every route unless the call carries `Authorization: DPoP <token>` and a `DPoP` header. The token must be one `signInAs` issued; the principal is the one the token names. The proof's `htm`, `htu` (`https://` + host + path, even over http), `ath`, `iat`, `jti` (not used before) and key (the token's `cnf.jkt`) are checked. Signatures are not: there is no real crypto.

`dpop: "platform"` copies the platform: on `/lws` no header is an anonymous caller (the vault list is 200 and empty, a vault list of records 403, a record read 404, a write 403), a `DPoP` token without a proof and a `Bearer` token are accepted, and a bad token or proof is 401. Strict is stricter than the platform on purpose, so a call that forgot to sign fails in the test.

## What it never does

A request no route row answers, or to a host that is not this platform's, is recorded in `violations`; the first is answered `404 fake_platform_no_such_route`, the second makes `fetch` reject. It never accepts a request the platform would refuse (`t:Sailboat` as a list `type` is 400, an `http://` vault id is 400, an extra body key is 400). `filter=` on the record list answers `400 fake_platform_not_faked` in this part.

## How to take it

Package: `@kaigilb/gilbplatformcode-fake-platform`. It has no dependencies of its own; it ships TypeScript source (`src/`) that your bundler compiles. Its tests run against `lws-records`, `record-sync` and `signin`, which are dev dependencies.

## Where it came from

New code, written for the next app-building AI in EESpeed Round 5 (R5-C3). Repository `KaiGilb/GilbPlatformCode`, commit `73cc3dcf821ed0e80ffaf6a75bbd04491c5ecea7` (the main that holds `lws-records`, `record-sync`, `signin` and `vault-access` as the tests import them). No source file was copied. The routes mirror GilbPlatform at commit `619aca557597b1bc50dd6e1340ebc274039be9c2`.
