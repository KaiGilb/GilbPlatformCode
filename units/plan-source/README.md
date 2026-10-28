# plan-source

One source control for every Plan line: who said it (a person, organization or AI agent record), the document or decision it came from, or words for someone with no record yet.

## What this is

One source control for every Plan line: who said it (a person, organization or AI agent record), the document or decision it came from, or words for someone with no record yet.

One component, `PlanSource`, and two constants.

- A person, organization or AI agent that said a line is `a:statedBy`. A document it was taken from (a file the Files section lists) or a decision is `a:derivedFrom`. Words are only for someone with no record yet. The value is `PlanSourceValue` (`{ text?, statedBy?, derivedFrom? }`) of the `plan-card-facts` unit; a bare string is read as `{ text }`.
- Reading (`editing` false): "Source: <name> · from <document>" and nothing else; names are `EntityRefValue`s (the record's name as a button that opens it, no address line). When nothing was said and the line is not being edited, it draws nothing.
- Editing: a picker (`OrgRecordPicker` of the `record-picker` unit, a drop-down that opens on focus, a click or typing) with the placeholder `Source`, the accessible name `inputLabel`, a "Remove source" control when something is said, and "+ New stakeholder" (unless `offerNewStakeholder` is false). A pick from the group `Documents` is `a:derivedFrom` and keeps the person and the words; any other pick is `a:statedBy` and drops the words, and keeps a document. "Use "<typed>" as text" appears when nothing matches and commits the words, keeping the links. "Remove source" commits `{}`. After each commit the picker starts afresh (its typed text is cleared).
- The search: the host's stakeholder search over the held vaults, then the files of those vaults that match by name or type, under the heading `Documents` (a file with no address is left out, an address is offered once, an empty search offers none). The answer is whole only when the people search is whole and the files are neither pending nor failed. The picker's key carries the kind names, the vaults and the files' state (count, pending, failed), so the search is asked again when one of them changes; the file list itself is read at the moment of the search.
- While the stakeholder kinds are still being read, the kind names are empty and the search is asked with `[]`.
- Clicking a name opens the record: in its own vault, pushed, when the shell can (`openRecordInVault`, with the vault namespace worked out from the address: the `/vault` or `/base` segment it carries); else through `onOpen(id)`.
- "+ New stakeholder" opens the host's create dialog on the Stakeholders form; the record it makes becomes this line's source (a bare id is read for its address; if that fails the address is composed from the vault).
- Attributes: `data-plan-source={inputLabel}` and `data-editing` ("true" or "false") on the box.
- `PLAN_SOURCE_PLACEHOLDER` (`"Source"`), `PLAN_SOURCE_DOCUMENTS` (`"Documents"`), `PlanSourceHostContext` and the host types.

## What this is not

- Not a writer: it calls `onCommit(next)` and nothing else. The card writes the value.
- Not a search: the host's `findStakeholderRecords` and `matchWorkingSetQuery` do the finding.
- Not the create dialog: the host draws it.
- Not `vault-namespace`: the namespace helper inside is the app's own `vaultNamespaceOfEntityUri`, which answers the segment the address carries (a `/vault` entity is paired with `/vault`), and differs from that unit.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-source`

Take it together with its seven peers: `base-record`, `entity-ref`, `entity-ref-value`, `plan-card-facts`, `record-picker`, `remove-control` and `type-curie` (`entity-ref-value` has `entity-ref` and `id-tail` as its own peers; install `id-tail` too). Put this line in your app's own `.npmrc` so all of them are installed as copies and not links (one copy of each, so one picker context and one label context):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/base-record <path-to-the-library>/units/entity-ref <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/record-picker <path-to-the-library>/units/remove-control <path-to-the-library>/units/type-curie <path-to-the-library>/units/plan-source
```

The package ships TypeScript source (`src/`); your bundler compiles it. React 19 is a peer.

## Examples

The three providers the control needs (the picker's query hook, the label hook of `EntityRefValue`, and this unit's host) and one control; the same code runs in `src/example.test.tsx`.

```tsx
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import { RefLabelContext, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { PlanSource, PlanSourceHostContext, type PlanSourceHost } from "./index";

const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};
const client = new QueryClient();
const useRefLabel: UseRefLabel = (ref) => (ref ? "Ann Co" : null);

const host: PlanSourceHost = {
  useShell: () => ({ vaults: [{ vaultId: "https://plan.example.test/vault" }] }),
  heldVaultIds: (vaults) => (vaults as { vaultId: string }[]).map((v) => v.vaultId),
  useStakeholderTypes: () => ({ data: { names: ["Person", "Organization"] } }),
  useVaultFilesMulti: () => ({ data: [], isPending: false, error: null }),
  matchWorkingSetQuery: (items, query) => items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase())),
  findStakeholderRecords: async (_vaults, _names, text) => ({
    hits: text.trim() ? [{ uri: "https://people.example.test/base/e/ann", label: "Ann Co" }] : [],
    complete: true,
    vaultsMissed: false,
  }),
  readRecord: async () => null,
  memberEntityUri: (id, _preferred, namespace) => (id.startsWith("http") ? id : `${namespace}/e/${id}`),
  ConnectedCreateDialog: () => null,
};

function Source({ onCommit }: { onCommit: (next: unknown) => void }) {
  return (
    <QueryClientProvider client={client}>
      <PickerQueryContext.Provider value={usePickerQuery}>
        <RefLabelContext.Provider value={useRefLabel}>
          <PlanSourceHostContext.Provider value={host}>
            <PlanSource
              value={{}}
              editing
              vaultId="https://plan.example.test/vault"
              record={{ id: "fn1", typeUri: "t:Function", facts: {}, opaqueFacts: [], etag: null }}
              inputLabel="Function source"
              onOpen={(id) => console.log("open", id)}
              onCommit={onCommit}
            />
          </PlanSourceHostContext.Provider>
        </RefLabelContext.Provider>
      </PickerQueryContext.Provider>
    </QueryClientProvider>
  );
}

// Anywhere below the providers, once the host and the three providers are in place.
<Source onCommit={(next) => console.log(next)} />;
```

## What the host must supply

- The `PlanSourceHostContext` provider, above every control, with the same object for as long as it is mounted. With none, the control throws an error that names it. Its members are each the call the source made, with the same arguments, at the same place (the app's `src/components/records/PlanSource.tsx` is "PS" below):
  - `useShell(): { vaults?, openRecordInVault? }`, a hook called twice a render (once to open a record, once for the vaults). GilbApp: `useShell()`, PS:64 and PS:105 (`ShellContext`).
  - `heldVaultIds(vaults): string[]`: the ids of the vaults the person holds, from the shell's `vaults` (`[]` when the shell has none). GilbApp: `heldVaultIds(shell.vaults ?? [])`, PS:106 (`lib/base/workingSetLoadVaults.ts` 44-53).
  - `useStakeholderTypes(enabled): { data?: { names } }`, a hook: the stakeholder kind names, read only while `enabled` (the control passes `editing`). GilbApp: `useQuery({ ...STAKEHOLDER_TYPE_SET_QUERY, enabled: editing })`, PS:107.
  - `useVaultFilesMulti(vaultIds, "live"): { data, isPending, error }`, a hook: the files of those vaults, merged; called with `[]` while not editing. GilbApp: `useVaultFilesMulti(editing ? vaults : [], "live")`, PS:109 (`lib/base/fileHooks.ts` 144-176).
  - `matchWorkingSetQuery(items, query)`: the items the Files section's own search matches (name, then type); an empty query matches nothing. GilbApp: `matchWorkingSetQuery(items, text)`, PS:55 (`lib/base/workingSetFacets.ts` 87-101).
  - `findStakeholderRecords(vaultIds, typeNames, text): Promise<{ hits, complete, vaultsMissed }>`: the stakeholder records matching `text`. With an empty `typeNames` it must answer `complete: false` (not "none exist"). GilbApp: `findStakeholderRecords(vaults, names, text)`, PS:115 (`lib/base/planStakeholders.ts` 322).
  - `readRecord(id, at): Promise<BaseRecord | null>`: one record read. A rejection is caught by the control. GilbApp: `readRecord(id, record.entityUri ?? vaultId)`, PS:221 (`lib/base/records.ts` 645).
  - `memberEntityUri(idOrUri, preferredUri?, vaultNamespace?): string`: the address of a record. GilbApp: `memberEntityUri(id, null, vaultId)`, PS:222 (`lib/base/relationWrite.ts` 99).
  - `ConnectedCreateDialog`: a component with props `{ open, stakeholders, source: null, drawnVaultIds, onClose, onCreated(id) }`, drawn after "+ New stakeholder" is pressed. GilbApp: `<ConnectedCreateDialog open stakeholders source={null} drawnVaultIds={[vaultId]} onClose onCreated />`, PS:210-228.
- The two other providers: `PickerQueryContext` of the `record-picker` unit (a hook over a query cache; the picker's key and `staleTime` are the picker's), and `RefLabelContext` of the `entity-ref-value` unit (the label hook).
- No member is optional. `ConnectedCreateDialog` makes a record; a host that cannot create passes `offerNewStakeholder={false}` (and a component that renders nothing). The control has no read-only flag of its own: it is read-only by `editing={false}`.
- Tailwind scanning this unit's `src`, and the CSS variables `--ink-soft` and `--accent` (and those of the picker, the label and the remove control).
- React 19.

## Do not

- Do not give the host a new object on every render: the control reads it once a render and the picker's search callback keeps the host it first saw.
- Do not make `findStakeholderRecords` answer `complete: true` with no hit while the kinds are still being read (`names` is `[]`): the control would say "No stakeholder or document matches." for a search that was never made.
- Do not count on the host's `matchWorkingSetQuery` for an empty search: the control offers no document for one and does not ask.
- Do not install a second copy of `record-picker` or `entity-ref-value`: each holds its own context, and a control below a provider from the other copy throws.
- Do not store `{ "@id" }` under the text: `text` is words; an address belongs in `statedBy` or `derivedFrom`.

## Wrong readings

- "Picking a hit always sets `statedBy`." Only a hit that is not in the `Documents` group; a document sets `derivedFrom`.
- "A pick replaces the whole source." A person drops the words and keeps the document; a document keeps the person and the words; "Use as text" keeps both links.
- "The control writes the record." It calls `onCommit`; the card writes.
- "Reading shows the picker." Only a name, "Source:" and the links; nothing at all when empty.
- "`vaultNamespaceOfEntityUri` is the `vault-namespace` unit." It is the app's own function, copied here as a private helper; the units differ.
- "The files list is a prop." The control reads it from the host while editing; with `editing` false it asks for `[]`.
- "The search is asked again on every file change." Only when the count, the pending state or the failed state changes.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/components/records/PlanSource.tsx` lines 1-6 and 35-231 (`PLAN_SOURCE_PLACEHOLDER`, `PLAN_SOURCE_DOCUMENTS`, `documentHits`, `useOpen`, `PlanSource`) to `src/PlanSource.tsx`. Code verbatim except the named changes below. Imports: `../mynet/RemoveControl` is `@kaigilb/gilbplatformcode-remove-control`; `./EntityRefValue` is `@kaigilb/gilbplatformcode-entity-ref-value`; `./orgCard/OrgRecordPicker` (`OrgRecordPicker`) and the type `OrgRecordHit` of `../../lib/base/orgCard/orgRecords` are `@kaigilb/gilbplatformcode-record-picker`; `entityRefFromFact` of `entityRefFacts` is `@kaigilb/gilbplatformcode-entity-ref`; `asPlanSource`, `planSourceEmpty`, `sourceWith*` and the type `PlanSourceValue` of `planCard` are `@kaigilb/gilbplatformcode-plan-card-facts`; `typeLocalName` of `recordPlane` is `@kaigilb/gilbplatformcode-type-curie` (the bodies were compared: the same function); the type `BaseRecord` of `records` is `@kaigilb/gilbplatformcode-base-record`. The imports of `@tanstack/react-query`, `../ShellContext`, `./ConnectedCreateDialog`, `fileHooks`, `planStakeholders`, `workingSetFacets`, `relationWrite`, `records` (`readRecord`), `stakeholderKinds` and `workingSetLoadVaults` are removed with the calls that used them.
  1. `useShell()` (lines 64 and 105) is `host.useShell()`; `heldVaultIds(...)` (106) is `host.heldVaultIds(...)`; `useQuery({ ...STAKEHOLDER_TYPE_SET_QUERY, enabled: editing })` (107) is `host.useStakeholderTypes(editing)`; `useVaultFilesMulti(...)` (109) is `host.useVaultFilesMulti(...)`; `matchWorkingSetQuery(items, text)` (55) is `host.matchWorkingSetQuery(items, text)`; `findStakeholderRecords(...)` (115) is `host.findStakeholderRecords(...)`; `readRecord(...)` (221) is `host.readRecord(...)`; `memberEntityUri(...)` (222) is `host.memberEntityUri(...)`; `<ConnectedCreateDialog ...>` (210) is `<host.ConnectedCreateDialog ...>` with the same props. Nine host members, each in the source's place and order. The host reaches the component by `PlanSourceHostContext`: a private hook `usePlanSourceHost()` reads it (twice a render: in `useOpen` and in `PlanSource`) and throws an error that names the provider when there is none.
  2. `documentHits(files, text)` (line 43) takes the host first, `documentHits(host, files, text)`, and its call (117) passes `host`, so that it can call `host.matchWorkingSetQuery`; the file type `VaultFileWithSource` is `PlanSourceFile`, declared beside the host (`id`, `sourceVaultId`, `typeUri?`, `name`, `updatedAt`, `entityUri?`).
  3. The dependency arrays of `useMemo` and `useCallback` are unchanged: they do not list the host, which must be the same object for as long as the provider is mounted.
- `src/lib/base/ruleHooks.ts` lines 195-215 (`vaultNamespaceOfEntityUri`) to `src/PlanSource.tsx`, as a private function (the source exported it), code verbatim, its long comment replaced by a shorter one that says what it does. It is the app's version, not the `vault-namespace` unit's.
- Not in this unit: the stakeholder search itself, the Files list hook, the working-set matcher, the kind query, the record read, the address composer and the create dialog (host members).

`src/planSourceHost.ts` (the host interface, the types and the context) and `src/index.ts` are new. `test/fakeHost.tsx` is new: a fake host that logs its hook calls and answers what the test sets.

Tests:

| Source | Ported / left out |
|---|---|
| `src/components/records/PlanSource.vaultsMissed.vaultit.test.tsx` (2 cases) | Both ported to `src/PlanSource.test.tsx`, same inputs and expectations; the app's mocked stakeholder search is the fake host's `findStakeholderRecords`, its mocked shell is the fake host's `useShell` (no vaults), its pre-filled kind cache is the fake host's `useStakeholderTypes` (`["Person"]`); the hosts are example.test. |
| `RecordDetail.planSources.vaultit.test.tsx` (5), `RecordDetail.planSourceDefaults.vaultit.test.tsx` (15) | Left out: they render whole cards over a stubbed `fetch`; what they say of this control (the placeholder, the `statedBy` and `derivedFrom` commits, the reading line, "+ New stakeholder") is pinned in `src/PlanSource.test.tsx`. |
| `RecordDetail.planSolutionParts.vaultit.test.tsx`, `RecordDetail.planStakeholders` and the other card tests that draw the control | Left out: they test the cards. |

`src/PlanSource.test.tsx` is new and pins the rest: the placeholder and the documents heading, nothing drawn when empty, `data-plan-source` and `data-editing`, the reading lines, a person, a document and "Use as text" each committing its value, Remove source, the buttons' mouse press, the search (held vaults, kind names, the people before the documents, a file once, none without an address, none for an empty search, whole only when the people and the files are, a failed search, empty kind names while they load, a new search when the files, the kinds or the vaults change, the file list read at search time), what it asks the host while it renders, opening a record, "+ New stakeholder" and the created record's address, and the missing provider. `src/example.test.tsx` runs the README example, `src/exports.test.ts` pins the export list and `src/hostAgnostic.test.ts` runs the host-agnostic check against planted faults.
