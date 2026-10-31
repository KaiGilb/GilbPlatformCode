# employment-rows

A person record's Employment section: the employments over the record's edges, in the card's modes.

## What this is

A person record's Employment section: the employments over the record's edges, in the card's modes.

`EmploymentRows({ title, recordId, recordEntityUri, vaultId, edgeKey, servedEdges, servedReady?, canEdit, onSaved?, find, vaultName?, renderWorkLocation?, renderPlaceName?, catalogueOrigin? })` is the whole Employment section of a person card: it mounts `useEmployments` (`employments-state`) over the record's `a:employment` edges and draws them with `EmploymentCard` (`employment-card`). Each employment is its own `t:Employment` entity in the vault that holds the record; the record carries the ordered edges, written by the state and never by the record card's own save.

The add and remove controls show only while the card is being edited: `canEdit`, a vault to write into, and the card's edit mode. The company box offers the organization records of the holding vault through `find`.

**Unknown is not empty.** If the record names employments but no vault is known (`vaultId` null), nothing can be read, and the card says so ("Employment is stored in a vault that is not known here, so it is not shown. This is not a statement that there is none.") instead of drawing an empty list. A record that names none says nothing. A failed read is said by the state, and the card then offers no add box.

**The work place is a slot**, absent unless given (`renderWorkLocation`, `renderPlaceName`, with `catalogueOrigin` so a compact place reads as an address). Absent, no place is drawn and a stored place is carried unchanged by every save.

**Nothing is written on mount, render, idle or a change of `canEdit`.** An entity is minted on the first real edit; a remove drops the edge and never deletes the entity; a null goes on the wire only for a value the person removed (company edit on an employment with no title names no title; an end month picked names the end and clears the ongoing mark; a date edit never names the place).

## What this is not

- Not the host slot: `stakeholder-record-card-host-gilbplatform` supplies `renderEmployment` and mounts this.
- Not the state (`employments-state`), the card (`employment-card`) or the company box (`company-search`).
- Not a place picker or a place name: those are the two slots.
- Not a delete of an employment entity, and not a search of organization vaults.

## How to take it

Package: `@kaigilb/gilbplatformcode-employment-rows`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/employment-rows` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/card-mode <path-to-the-library>/units/claim-handle <path-to-the-library>/units/company-search <path-to-the-library>/units/employment-role <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/record-sync <path-to-the-library>/units/person-connections <path-to-the-library>/units/online-card <path-to-the-library>/units/record-types <path-to-the-library>/units/remove-control <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/role-when <path-to-the-library>/units/signin <path-to-the-library>/units/stakeholder-ui-kit <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/org-terms <path-to-the-library>/units/employment-link <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/employment-vocab <path-to-the-library>/units/vault-resources <path-to-the-library>/units/employment-store <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/one-card-merge <path-to-the-library>/units/one-card-rows <path-to-the-library>/units/one-card-context <path-to-the-library>/units/card-group <path-to-the-library>/units/record-fact-items <path-to-the-library>/units/employment-edges <path-to-the-library>/units/employments-state <path-to-the-library>/units/employment-card <path-to-the-library>/units/employment-rows
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Through the state and the edge writer, only on the person's act: `POST` a `t:Employment` on its first real edit, `PATCH /lws/r/<id>` of that entity (only the keys the act changed), and `PATCH /lws/r/<record id>` of the one edge key, conditional on the version read. No DELETE of an entity, ever.

## Requests and their servers

On mount: the employment vocabulary and the employer/employee spellings (once per session), then `GET /lws/r/<id>` once per edge, one after another; nothing when `vaultId` is null. The company box asks `find(vaultId, text)` for typed text.

## Examples

```tsx
import { EmploymentRows } from "@kaigilb/gilbplatformcode-employment-rows";
import { findOrganizationRecords } from "@kaigilb/gilbplatformcode-org-hierarchy";

<EmploymentRows
  title="Employment"
  recordId={record.id}
  recordEntityUri={record.entityUri}
  vaultId={holdingVaultId}
  edgeKey="employment"
  servedEdges={record.facts.employment}
  canEdit={canEdit}
  onSaved={refreshRecord}
  find={findOrganizationRecords}
/>
```

## What the host must supply

A `QueryClientProvider`; the auth seam and origins of the peers (set once at start-up); `onSaved`, which the record card gives so it reads the record again after an edge write; and the finder. Inside a record card it reads the card's modes.

## Module state

A module counter for new row keys in `employments-state`; nothing else of its own. The peers keep the vocabulary and the per-record write queue (install one copy of each).

## Do not

- Do not write from an effect that runs on mount or when `canEdit` changes.
- Do not draw an empty list for a record whose employments were not read.
- Do not give it a finder that searches organization vaults.
- Do not call a delete on the entity.

## Wrong readings

- "No vault means no employments." It means they were not read.
- "Removing an employment deletes it." It removes the edge only.
- "A failed read leaves the add box." The add box is withheld.
- "A save of the dates clears the place." The place is carried as stored.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`) `src/components/records/EmploymentRows.tsx` lines 20-53.

## Tests

85 tests in 5 files (`npx vitest run`): `EmploymentRows.test.tsx` 17 and `EmploymentRows.org.test.tsx` 7 (24 ported from GilbApp `EmploymentRows.c214e7` 12, `EmploymentRows.b4.c214e7fix` 5 and `EmploymentRows.s8org` 7), `EmploymentRows.wire.test.tsx` 20 and `EmploymentRows.states.test.tsx` 28 (new), and `hostAgnostic.test.ts` 13. They drive the real card, state, store and edges against an in-memory vault behind `fetch` (`test/vault.ts`).

Mutation checks: 17 mutants (15 of `src/EmploymentRows.tsx`: the unknown vault never said, said too early or for a record with none or not told to the card, editable with no vault, in presentation or when the record may not be written, the finder, vault name, vault or catalogue origin not handed on, a slot always supplied, a placeholder read as served, no re-read; and 3 on the installed peers: a no-change edge write, a null title added to a patch, a remove that deletes the entity). 16 killed; 1 is equivalent (the card guards presentation mode itself, so the same guard here cannot be seen).
