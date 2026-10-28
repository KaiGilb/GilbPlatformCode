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
