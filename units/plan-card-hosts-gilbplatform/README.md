# plan-card-hosts-gilbplatform

The ready-made GilbPlatform host for the four Plan cards: one provider that sets the platform's origins and the session and mounts the fourteen host contexts, so the Value, Function, Solution and Resource cards draw, read and save with no host object written.

## What this is

The ready-made GilbPlatform host for the four Plan cards: one provider that sets the platform's origins and the session and mounts the fourteen host contexts, so the Value, Function, Solution and Resource cards draw, read and save with no host object written.

The four whole Plan cards (`value-card`, `function-card`, `solution-card`, `resource-card`) are drawn by units that never fetch, never write and never cache: everything they read or write is a member of one of fourteen host contexts, 174 members in all. This unit is the host for GilbPlatform. It implements all 174 with the extracted GilbPlatform units (the record client, the vault reads, the relation client, the record cache, the record hooks, the levels and stakeholder readers, the ontology reads) and mounts them. A developer mounts one provider, gives it the platform's origin and a signed-in session, and puts a card inside; no host object is written.

- `PlanCardsGilbPlatformProvider(props)`: the provider. On its first render, before any child renders, it sets the platform's origin (`base-origin`), the ontology's origin (`term-origin`), the hosts that may be read at their own address, the own-card host labels (`own-card`), the optional settings, the session (`lws-session-bridge`, wrapping the `SessionCredential` of `signin`) and the type key (`type-key`, set to `typeFacetKey`). Then it mounts a `QueryClientProvider` (a client it makes, unless you give one), the fourteen contexts in the order the card READMEs nest them, and `CardModeProvider` with `canEdit`. The props are listed under "The props".
- `PLAN_CARDS_QUERY_DEFAULTS`: the defaults of the client the provider makes: `staleTime` 30 000 ms, no refetch on window focus, one retry. They are the defaults GilbApp's cards were tuned on.
- One factory per host, for a developer who mounts the contexts himself or wants one host alone: `createPlanCardHost(env)`, `createPlanSourceHost`, `createPlanImpactsHost`, `createPlanTagLinksHost`, `createPlanTagPickerHost`, `createProjectLevelsHost`, `createStakeholderLinesHost`, `createDescriptionPartsHost`, `createValueLinesHost`, `createValueWriteHost`, `createRefLabel`, `createPickerQuery`, `createTypePicture`, `createTermDefinition`, and `createPlanCardHosts(env)` for all fourteen. Each result satisfies the interface of the unit that owns the context (a test checks this at compile time). `env` (`HostEnv`) holds the query client, the shell hook, the source hook and the optional actions and components. Settings and the session are NOT set by a factory; the provider (or your own start-up) sets them first.
- The hosts are the same objects for as long as the provider is mounted with the same client and session, as the card units' dependency arrays assume.

## What this is not

- Not a card. It draws nothing; the card is inside it.
- Not a sign-in. The session comes from `signin` (`SessionCredential`) and is given as a prop.
- Not a dialog that creates a person. That dialog is GilbApp's `ConnectedCreateDialog`, 1,049 symbols across 113 files, and is not a unit: give your own as `createStakeholderDialog`, or the stakeholder lines are read-only.
- Not a type icon or a help button. Both are optional props and are drawn by nothing when absent.

## How to take it

Package: `@kaigilb/gilbplatformcode-plan-card-hosts-gilbplatform`

Put this line in your app's own `.npmrc` so all units are installed as copies and not links (one copy of React, one of each unit, so one copy of each context and of each module's state; a pair of copies breaks the settings and the caches):

```
install-links=true
```

Then install them. The line below is the output of `node scripts/peers.mjs units/plan-card-hosts-gilbplatform` (81 units, in an order that installs), followed by the four whole cards. Take only the card units you draw; every unit they need is already in the 81. Third-party: `@dnd-kit/core` 6.3.1, `@tanstack/react-query` 5, `react` 19 and `react-dom` 19.

```sh
npm install @dnd-kit/core@6.3.1 @tanstack/react-query@^5.101.2 react@^19.0.0 react-dom@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/base-record <path-to-the-library>/units/card-mode <path-to-the-library>/units/card-group <path-to-the-library>/units/date-rules <path-to-the-library>/units/direct-shares <path-to-the-library>/units/entity-ref <path-to-the-library>/units/fact-faithful <path-to-the-library>/units/folder-part <path-to-the-library>/units/help-doc <path-to-the-library>/units/id-tail <path-to-the-library>/units/entity-ref-value <path-to-the-library>/units/narrow-total <path-to-the-library>/units/online-card-link <path-to-the-library>/units/open-popups <path-to-the-library>/units/field-row <path-to-the-library>/units/own-card <path-to-the-library>/units/plan-button-row <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/qualifier-value-picker <path-to-the-library>/units/record-picker <path-to-the-library>/units/record-sync <path-to-the-library>/units/record-types <path-to-the-library>/units/relation-role <path-to-the-library>/units/remove-control <path-to-the-library>/units/result-total <path-to-the-library>/units/share-refusal <path-to-the-library>/units/signin <path-to-the-library>/units/sortable-tree <path-to-the-library>/units/term-origin <path-to-the-library>/units/type-curie <path-to-the-library>/units/plan-impacts-model <path-to-the-library>/units/plan-source <path-to-the-library>/units/type-key <path-to-the-library>/units/plan-kinds <path-to-the-library>/units/plan-links-model <path-to-the-library>/units/description-parts-model <path-to-the-library>/units/description-help <path-to-the-library>/units/description-parts-view <path-to-the-library>/units/plan-stakeholders-model <path-to-the-library>/units/plan-stakeholder-lines <path-to-the-library>/units/plan-tag-picker <path-to-the-library>/units/plan-impacts <path-to-the-library>/units/project-levels <path-to-the-library>/units/type-name <path-to-the-library>/units/type-picture <path-to-the-library>/units/plan-type-level-version <path-to-the-library>/units/type-term-popover <path-to-the-library>/units/type-chooser <path-to-the-library>/units/plan-tag-links <path-to-the-library>/units/plan-type-field <path-to-the-library>/units/value-card-model <path-to-the-library>/units/value-card-write <path-to-the-library>/units/value-graph-geometry <path-to-the-library>/units/value-graph <path-to-the-library>/units/value-line-kit <path-to-the-library>/units/value-endpoint-line <path-to-the-library>/units/value-illustration <path-to-the-library>/units/value-levels-line <path-to-the-library>/units/value-meters-line <path-to-the-library>/units/value-qualifiers-line <path-to-the-library>/units/value-scale-line <path-to-the-library>/units/plan-card <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/lws-records <path-to-the-library>/units/lws-vault-sets <path-to-the-library>/units/ontology-reads <path-to-the-library>/units/lws-relations <path-to-the-library>/units/record-cache-kit <path-to-the-library>/units/plan-levels-io <path-to-the-library>/units/stakeholder-list-state <path-to-the-library>/units/vault-type-census <path-to-the-library>/units/vocabulary-source <path-to-the-library>/units/stakeholder-kinds <path-to-the-library>/units/working-set-store <path-to-the-library>/units/plan-record-hooks <path-to-the-library>/units/plan-self-source <path-to-the-library>/units/plan-stakeholder-io <path-to-the-library>/units/plan-card-hosts-gilbplatform <path-to-the-library>/units/value-card <path-to-the-library>/units/function-card <path-to-the-library>/units/solution-card <path-to-the-library>/units/resource-card
```

The package ships TypeScript source (`src/`) and the test fakes (`test/`); your bundler compiles the source. If your compiler checks the source of the units, leave out `noImplicitOverride` and `noUncheckedIndexedAccess`, as this unit's `tsconfig.json` does, because the units it is built from do not use the `override` keyword and do not check indexed reads.

The units that keep module state exist once in an app: `base-origin`, `term-origin`, `type-key`, `own-card`, `lws-session-bridge`, `lws-records`, `working-set-store`, `plan-record-hooks` and the others the closure holds. This unit is the one that SETS the singletons; do not set them again.

## Examples

The one complete wiring: the provider with every prop, and a Value card inside it. The file is `test/example.tsx` of this unit; it is type-checked with the unit, `src/example.test.tsx` renders it, and it was compiled in a fresh consumer app that installed the units with the line above. Every value that names a place is a placeholder; yours are your own.

```tsx
// The one complete wiring of the four Plan cards on GilbPlatform: the provider with every prop, and a card inside it. It is type-checked with
// the unit and rendered by `src/example.test.tsx`. Every value that names a place is a placeholder; yours are your own.
import { useState, type ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { ValueCard } from "@kaigilb/gilbplatformcode-value-card";
import {
  PlanCardsGilbPlatformProvider,
  type PlanCardsCreateDialogProps,
} from "@kaigilb/gilbplatformcode-plan-card-hosts-gilbplatform";

/** Your dialog that makes a person (or another record) in a vault. Without one the stakeholder lines are read-only. */
function CreatePersonDialog(props: PlanCardsCreateDialogProps) {
  return (
    <div role="dialog" aria-label="New person">
      <button type="button" onClick={props.onClose}>Close</button>
      <button type="button" onClick={() => props.onCreated("the-new-person's-id")}>Create</button>
    </div>
  );
}

/** Your help button for the Description line. Without one none is drawn. */
function HelpButton({ label, title, children }: { label: string; title: string; startAt: string; children: ReactNode }) {
  return <button type="button" title={title} aria-label={label}>?{children}</button>;
}

export function PlanScreen({ session, record, vaultId, canEdit }: {
  session: SessionCredential; // after sign-in: the SessionCredential of the sign-in unit
  record: BaseRecord; //         the Value to draw
  vaultId: string; //            the vault the screen shows
  canEdit: boolean; //           whether the person may write
}) {
  const [myClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } }));
  return (
    <PlanCardsGilbPlatformProvider
      origin="https://platform.example.test" //                           required: the platform's vault origin
      ontologyOrigin="https://ontology.platform.example.test" //           required: the origin that serves the ontology's terms
      systemVaultHosts={["ontology.platform.example.test"]} //            required: hosts besides the origin's family that may be read at their own address (they never get your credential)
      systemHostLabels={["id", "ontology"]} //                            required: first labels of the platform's own hosts
      session={session} //                                                required: signs every request
      canEdit={canEdit} //                                                required: whether the person may write
      queryClient={myClient} //                                           optional: your own client (its defaults are yours); absent, the provider makes one
      self={null} //                                                      optional: the person's own card as `{ "@id": "<address>" }`; null writes no source
      ownCard={false} //                                                  optional: true finds the person's own card from the session and uses it as the source
      navigate={{
        openRecordInVault: (vault, id) => void [vault, id], //            optional: open a record in the vault it lives in
        openOntologyConcept: (typeName) => void typeName, //              optional: open a type's page in the ontology
      }}
      createStakeholderDialog={CreatePersonDialog} //                     optional: absent, nothing is created from a line and the stakeholder lines are read-only
      renderTypeIcon={(option) => <span aria-hidden>{option.label.slice(0, 1)}</span>} // optional: the icon of a type in the Type picker
      HelpButton={HelpButton} //                                          optional: the help button of the Description line
      settings={{
        localRigHosts: [], //                                             optional: bare host names of a local development rig
        ontologyApiOrigin: "https://ontology.platform.example.test", //   optional: the origin that answers the public term search
        minOntologyQuery: 3, //                                           optional: the shortest query that reaches the ontology
        vocabTypeBatchRevisions: "", //                                   optional: platform revisions that serve the batched vocabulary read
        publicCorpusOrigin: "https://corpus.example.test", //             optional: the public term corpus for a rig with no ontology
      }}
    >
      <ValueCard record={record} vaultId={vaultId} canEdit={canEdit} onOpen={() => {}} onNotice={() => {}} />
    </PlanCardsGilbPlatformProvider>
  );
}
```

`FunctionCard`, `SolutionCard` and `ResourceCard` go in the same place; each draws the lines its own README lists.

## The props

| Prop | Required | What it is |
|---|---|---|
| `origin` | yes | The platform's vault origin, `https://host`, no path. Every vault address and type URI derives from it. A malformed one throws a `TypeError` that starts `base-origin:`. |
| `ontologyOrigin` | yes | The origin that serves the ontology's terms (GilbVeda). No default names a host. |
| `systemVaultHosts` | yes | Bare host names, besides the origin's own family, that are read at their own address. They never receive the credential: only the origin and its subdomains do (`credentialAllowedAt`). |
| `systemHostLabels` | yes | The first labels of the platform's own hosts on a person vault's apex (`id` for `id.example.test`), for the own-card rule. |
| `session` | yes | A `SessionCredential` of the sign-in unit. Every request is signed with its DPoP pair: `Authorization: DPoP <token>` and `DPoP: <proof>` for the request's own method and URL. |
| `canEdit` | yes | Whether the person may write; read by the card mode. |
| `queryClient` | no | A client you own. Absent: the provider makes one with `PLAN_CARDS_QUERY_DEFAULTS`. A given one is used as it is, with its defaults: the cards' timing may change. |
| `self` | no | The person's own card as a source, `{ "@id": "<address>" }`, or `null` (the default): a value is then written with no `a:statedBy`. Read again on every render. |
| `ownCard` | no | `true`: the provider finds the person's own card from the session (`plan-self-source`) and uses it as the source, and `self` is ignored. Fixed at mount. Default false. See "Differences". |
| `navigate` | no | `{ openRecordInVault?, openOntologyConcept? }`. Each one present turns its feature on (a stakeholder chip opens a record in its vault; the Type popovers get "Open in Ontology"); which are present is fixed at mount, the function called is the latest. |
| `createStakeholderDialog` | no | A component that creates a person or another record (`PlanCardsCreateDialogProps`). Absent: nothing is drawn, "Create person" does nothing and the stakeholder lines are read-only. Fixed at mount whether present. |
| `renderTypeIcon` | no | Draws the icon of a type option in the Type picker. Absent: no icon. |
| `HelpButton` | no | The help button of the Description line. Absent: none is drawn. |
| `settings` | no | `{ localRigHosts?, ontologyApiOrigin?, ontologyApiOriginRaw?, minOntologyQuery?, vocabTypeBatchRevisions?, publicCorpusOrigin? }`. Each unset one keeps its unit's default. |
| `children` | yes | Your card or cards. |

Which member of which host each of these feeds, and what implements each of the 174 members, is the `host` list of `unit.json` (member, the GilbApp call site it replaces, the export that implements it).

## What the host must supply

Nothing but the props above. A developer writes no host object. The card units' own "What the host must supply" sections are answered by this unit.

## Differences from GilbApp (version 1)

- **No source stamp unless `ownCard`.** GilbApp stamped what a person writes with a link to their own stakeholder card (`a:statedBy`). The default here is `null`, so a card saves without it. With `ownCard`, the card is found by hard identity from the session; the session alone carries no landing-vault flag (GilbApp took it from `GET /lws/vaults`, which this unit does not call), so the finding succeeds only when the session names the person's own vault (`session.vault.entity`). Otherwise the source stays null.
- **Stakeholder lines are read-only without a dialog.** `plan-stakeholder-lines` turns editing off unless the host gives `renderCreateStakeholder` together with its writers. Without `createStakeholderDialog` the lines are read-only, "+ New stakeholder" in a source control opens nothing, and "Create person" in the card does nothing.
- **No type icons, no help button** unless you give them.
- **No cross-vault open** unless `navigate.openRecordInVault` is given; a chip then opens the record in place. No "Open in Ontology" unless `navigate.openOntologyConcept` is given.
- **The vault list is the session's.** GilbApp decorated each row (name, parent, landing flag) from `GET /lws/vaults`; here a row has its id and modes only. The cards read the id and the modes.
- **Every request is signed with the DPoP pair.** GilbApp signed reads, PATCH and DELETE with a Bearer token from a cookie bridge, which an app on its own origin cannot use. Here `bearerHeaderFor` answers the same DPoP pair as the other two calls (`lws-session-bridge`).
- **The working-set store keeps GilbApp's store name** (`baseapp-workingset`), so a second app on the same browser origin shares it.

## Not yet proven live

Everything above is proven against a fake `fetch`. Not yet proven against a live GilbPlatform: that `GET`, `PATCH` and `DELETE` on `/lws/r/<id>` accept the DPoP pair alone (a `GET` returned 200 in an earlier check; the others are the first thing the live check reads), that the server accepts the `ath` claim the sign-in unit adds, and what the signed `htu` is on the apex route. That is the live check of the taking app (P4).

## Do not

- Do not run two installed copies of this unit or of any unit it needs. The settings, the caches and the contexts live in modules; two copies are two sets.
- Do not mount a context of the fourteen yourself inside the provider: the card would see yours, not the provider's, and the settings and caches would not match.
- Do not give a new `session` on every render: the hosts are made again for a new session.
- Do not use a card outside the provider and expect it to draw: it throws an error that names the context it lacks.

## Wrong readings

- "The provider signs in." It does not; the session is a prop.
- "A system vault host gets the credential." It never does: it is read at its own address with no `Authorization` and no DPoP header. Only the origin and its subdomains receive the credential.
- "`canEdit` makes the stakeholder lines editable." Only with `createStakeholderDialog`.
- "The hosts are made on every render." They are made once for the client and session.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`. This is the one unit that is new code and not extraction: it composes the 21 extracted units of the pilot (`base-origin`, `working-set-store`, `vault-origin-rule`, `record-types`, `ontology-reads`, `lws-session-bridge`, `lws-records`, `lws-vault-sets`, `record-cache-kit`, `vocabulary-source`, `stakeholder-kinds`, `record-sync`, `own-card`, `online-card-link`, `lws-relations`, `vault-type-census`, `stakeholder-list-state`, `plan-record-hooks`, `plan-levels-io`, `plan-stakeholder-io`, `plan-self-source`) and the card units that own the contexts. The census (`CENSUS-2026-10-28-HostFamilies-GitHubStandard`) names for each of the 174 members the GilbApp call it replaces; `unit.json` `host` lists them.

Copied from GilbApp, as inline expressions where no extracted unit holds the call as a function, in `src/inline.ts`:

- `src/lib/base/planLinks.ts` lines 220-228 (`tagUsedInVault`) and `src/lib/base/picture.ts` lines 73-76 (`vaultIdOfEntity`);
- `src/components/records/PlanValueLines.tsx` lines 448-466 (`useLinkLabel`);
- `src/components/records/PlanStakeholders.tsx` lines 134-139 (`useRecordRead`) and 534-540 (`useRelationDoc`);
- `src/components/records/PlanImpacts.tsx` lines 395-400 (`useRelationDoc`);
- `src/components/records/orgCard/OrgRecordPicker.tsx` lines 144-150 (`usePickerQuery`).

Also from GilbApp: `src/lib/base/hooks.ts` lines 108-125 (the session's vault set as the rows the cards read, `src/shell.ts`) and `src/main.tsx` lines 72-76 (the query client's defaults). Every other member is a function a pilot unit exports, or one expression on the query client written from the call site its `host` entry names (`src/cacheAccess.ts`, `src/hosts/`).

New files: `src/` (the provider, the settings, the shell, the environment, the cache access, the inline copies, the fourteen factories) and `test/` (the fakes and the example). Tests (`src/*.test.ts` and `.tsx`; the fakes in `test/` are not shipped in `src`):

| Source | Ported / left out |
|---|---|
| `units/value-card/test/seed.ts` | Ported to `test/seed.ts`: the builders of a Value's level, qualifier, option definition, Scale and Meter records, with their addresses under this unit's test origin; `served` is new (a built row as the record the fake vault serves). The seed's `seedValueParts` and `seedLevels` write the query cache and are left out: here the records are served and read over `fetch`. |
| The card units' fakes (`test/app.tsx`, `server.ts`, `valueBrowser.tsx`) | Not used: they are hosts. These tests have no host. `test/fakeVault.ts` is a fake `fetch` that serves records, `find-by-attribute` and a merge-patch. |

New (38 tests): `src/cards.test.tsx` (11; each of the four cards drawn inside the provider alone and the groups its README lists; the Scale and the sub-function read from the vault; one edit is one signed PATCH with the version it was read at, and the next edit uses the version the first returned; a level is changed by a PATCH of its own record and a blank level is made by a POST to the vault; a card that may not write sends nothing; the credential gate; a context left out names itself), `src/provider.test.tsx` (16; the settings and the session are in place when the first child renders, the optional settings, a refused origin, the 14 contexts and the card mode, the query client, stable hosts, the 174 members counted per host, each optional prop on and off, the shell from the session), `src/example.test.tsx` (1; the wiring above) and `src/hostAgnostic.test.ts` (10; the host-agnostic check against planted faults). The type-level test is in `src/provider.test.tsx`: `expectTypeOf` of each factory's result against the owner's interface, checked by `tsc`.
