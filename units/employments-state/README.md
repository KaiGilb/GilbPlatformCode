# employments-state

The state of a person's employments: load, add, edit and remove one at a time, each write queued.

## What this is

The state of a person's employments: load, add, edit and remove one at a time, each write queued.

`useEmployments({ recordId, recordEntityUri, vaultId, edgeKey, servedEdges, onSaved, servedReady, catalogueOrigin? })` is a React hook that reads the record's employment edges (each one a `t:Employment` entity), keeps one row per employment, and writes the person's edits. It answers `{ employments, unresolved, legacyText, loading, error, status, ... }` and the acts `addEmployment`, `editEmploymentCompany`, `deleteEmployment`, `addJobTitle`, `editJobTitle`, `deleteJobTitle`, `editEmploymentRole`, `retryOutbox`.

An employment's entity is minted on its first real edit (company, title or role), not on "add employment", which writes nothing. After that the entity is patched in place. Removing an employment drops the **edge** from the record and never deletes the entity. Writes run one at a time; each row has a save status and a failed write can be retried. An edge that did not read is **unresolved**, carried and never dropped, and the edge list is always changed as stored now.

**Mount, render and idle write nothing.** The only effect that calls anything is the load, and it reads. **A null goes on the wire only for a value the person removed:** each row remembers the titles and the role as last read or written (`titlesStored`, `roleStored`) and hands them to `employment-store`, so a company edit never clears a title or a date. A place the form cannot show is carried as stored. A read that fails says one fixed sentence (`EMPLOYMENT_READ_FAILED_TEXT`); the detail goes to the console.

## What this is not

- Not a view: it draws nothing.
- Not the reads and writes of one entity: that is `employment-store`; nor the edges: `employment-edges`.
- Not a place picker: the place is carried as stored.
- Not a delete of an employment entity.

## How to take it

Package: `@kaigilb/gilbplatformcode-employments-state`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/employments-state` prints:

```sh
npm install @tanstack/react-query@^5.101.2 react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/claim-handle <path-to-the-library>/units/employment-role <path-to-the-library>/units/narrow-total <path-to-the-library>/units/record-sync <path-to-the-library>/units/record-types <path-to-the-library>/units/resource-id <path-to-the-library>/units/result-total <path-to-the-library>/units/signin <path-to-the-library>/units/term-origin <path-to-the-library>/units/term-slots <path-to-the-library>/units/org-terms <path-to-the-library>/units/employment-link <path-to-the-library>/units/vault-namespace <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/employment-vocab <path-to-the-library>/units/vault-resources <path-to-the-library>/units/employment-store <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/stakeholder-field-sets <path-to-the-library>/units/holder-reference <path-to-the-library>/units/record-fact-items <path-to-the-library>/units/employment-edges <path-to-the-library>/units/employments-state
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links (one copy of each peer):

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## What it writes

Through the peers: `POST` a `t:Employment` on its first real edit, `PATCH /lws/r/<id>` of that entity, and `PATCH /lws/r/<record id>` of the one edge key. No DELETE of an entity, ever.

## Requests and their servers

On mount: the employment vocabulary and the employer/employee spellings (once per session), then `GET /lws/r/<id>` once per edge, one after another. Nothing is read again after the section's own write.

## Examples

```tsx
import { useEmployments } from "@kaigilb/gilbplatformcode-employments-state";

function Section(p: { recordId: string; recordEntityUri: string; vaultId: string | null; servedEdges: unknown }) {
  const ed = useEmployments({ ...p, edgeKey: "employment", onSaved: () => {} });
  return <ul>{ed.employments.map((e) => <li key={e.key}>{e.company}</li>)}</ul>;
}
```

## What the host must supply

The auth seam and origins of the peers (set once at start-up) and `onSaved`, which the card calls so the record is read again after an edge write.

## Module state

A module counter for new row keys; nothing else of its own. The peers keep the vocabulary and the per-record write queue (install one copy of each).

## Do not

- Do not write from an effect that runs on mount or when `canEdit` changes.
- Do not drop an unresolved edge from the list you write.
- Do not show `error` as anything but its fixed sentence.
- Do not call a delete on the entity.

## Wrong readings

- "Adding an employment mints it." It mints on the first real edit.
- "Removing an employment deletes it." It removes the edge only.
- "A company edit rewrites the whole role." Only what changed is named.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`) `src/lib/mynet/employment/useEmployments.ts` lines 38-417.

## Tests

55 tests in 3 files (`npx vitest run`): `useEmployments.test.tsx` 41 (new, driving the hook against an in-memory vault over the real peers), `exports.test.ts` 1, `hostAgnostic.test.ts` 13. The ported GilbApp cases of this section drive the whole card and belong to the unit that draws it.

Mutation checks: 18 mutants of `src/useEmployments.ts` (a load that writes, an add or a title that writes, the stored titles or role not remembered or not handed on, the read error with its detail, a remove that deletes, a failed remove not restored, a mint not linked on retry, writes at once, a re-read adopted, a text read as an edge, a placeholder read, unresolved edges dropped, a retyped company keeping its links, a read with no vault), 18 killed.
