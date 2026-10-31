# company-search

The company box of an employment: type a name, choose an organization record, or use the name as typed.

## What this is

The company box of an employment: type a name, choose an organization record, or use the name as typed.

`CompanySearch({ value, onUseName, onUseRecord?, recordsVaultId, vaultName?, find, startEditing?, disabled?, ariaLabel? })` is the company line of one employment. Closed, it shows the company (or "Add company"); tapped, it is a box. After a short pause in typing it asks `find(recordsVaultId, text)` once and lists the organization records that match. A pick calls `onUseRecord({ uri, name })` (the caller writes the record and the name in one act); the typed name can always be used with "Use “X” as typed" (`onUseName`).

**The box searches ONE vault and says so.** It searches the vault it is given and names it with `vaultName`, else "this vault"; never by its address. Records of other vaults and any directory of organizations are not asked, and nothing here claims they were.

**A miss is said only when the answer is complete.** The sentence "No organization record named “X” in <vault>." is drawn only for an answer with `complete: true`. An answer that is not `complete: true` says "Not every record in <vault> was searched. This is not a statement that there is no such company." with **Try again**. A search that failed says "The search of <vault> could not be made. This is not a statement that there is no such company." With no vault, nothing is searched and the box says no vault is known. In all of these the typed name can still be used: that is a statement about the name, not about the world.

## What this is not

- Not the finder: `find` is given to it (the organization records of one vault are found by `org-hierarchy`).
- Not a search of organization vaults (groups): there is no call to a directory, and no prop for one.
- Not the employment: it writes nothing itself; it calls `onUseName` and `onUseRecord` and the caller writes.
- Not a way to create an organization.

## How to take it

Package: `@kaigilb/gilbplatformcode-company-search`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/company-search` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/company-search
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Nothing. It calls `onUseName(name)` or `onUseRecord({ uri, name })` only on the person's act: a click on a hit, a click on "Use “X” as typed", or Enter on a name that matches a hit exactly. Opening the box, typing, leaving the box (blur) and Escape call neither.

## Requests and their servers

None of its own. It calls `find(vaultId, text)` once for each text the person typed and paused on (250 ms), only while the box is open and the text is not empty, and again on "Try again". The answer is cached for 10 seconds per vault and text, and a failure is not retried automatically.

## Examples

```tsx
import { CompanySearch } from "@kaigilb/gilbplatformcode-company-search";
import { findOrganizationRecords } from "@kaigilb/gilbplatformcode-org-hierarchy";

<CompanySearch
  value={company}
  recordsVaultId={vaultId}
  vaultName="Hytta"
  find={findOrganizationRecords}
  onUseName={(name) => save({ company: name })}
  onUseRecord={(hit) => save({ company: hit.name, employer: hit.uri })}
/>
```

## What the host must supply

A `QueryClientProvider` above it (it uses `useQuery`), and the finder as the `find` prop. Nothing else: it reads no origin and holds no session.

## Module state

None.

## Do not

- Do not draw "No company named …" for an answer that is not complete or for a failed search.
- Do not pass a finder that searches organization vaults and call it the records of this vault.
- Do not show a hit by its address.
- Do not call `onUseName` from a blur or an effect.

## Wrong readings

- "An empty list means there is no such company." Only a `complete: true` answer says that.
- "A failed search is a miss." It is neither a miss nor a hit.
- "The box asks every vault." It asks the one it names.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`) `src/components/mynet/CompanySearch.tsx` lines 38-194, the organization-records branch only.

## Tests

32 tests in 2 files (`npx vitest run`): `CompanySearch.test.tsx` 19 (2 ported from GilbApp `CompanySearch.test.tsx`, 17 new) and `hostAgnostic.test.ts` 13.

Mutation checks: 17 mutants of `src/CompanySearch.tsx` (a miss on a failed search, `complete` ignored or read the wrong way, the vault missing from each of the three sentences, a blur or Escape that uses the typed name, the typed name withheld after an incomplete or failed answer, a hit drawn by its address, empty text asked, a call to a directory, no vault not said, Try again that does not ask, a pick that drops the record, the address as the vault word), 17 killed.
