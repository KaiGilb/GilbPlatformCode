// The one complete wiring of the Stakeholder entry card on GilbPlatform: the provider with every prop, and the card inside it. It is
// type-checked with the unit and rendered by `src/example.test.tsx`. Every value that names a place is a placeholder; yours are your own.
import { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { OnlineStakeholderCard } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { StakeholderCardGilbPlatformProvider } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";

export function StakeholderScreen({ session, principal }: {
  session: SessionCredential; // after sign-in: the SessionCredential of the sign-in unit
  principal: string; //          the person whose online card to draw (their principal)
}) {
  const [myClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } }));
  return (
    <StakeholderCardGilbPlatformProvider
      origin="https://example.test" //                                       required: the platform's vault origin
      ontologyOrigin="https://ontology.platform.example.test" //             required: the origin that serves the ontology's terms
      systemVaultHosts={["ontology.platform.example.test"]} //               required: hosts besides the origin's family that may be read at their own address (they never get your credential)
      systemHostLabels={["id", "ontology"]} //                               required: first labels of the platform's own hosts
      session={session} //                                                   required: signs every request
      geoOrigin="https://geo.example.test" //                                required: the origin of the shared world catalogue
      viewedVaultId={null} //                                                optional: the vault your screen shows (the content scope's readVaultId)
      refreshOnlineStakeholders={() => {}} //                                optional: draw your online list again (called before a record is opened)
      onOpenRecord={(id) => void id} //                                      optional: open a record in your page; absent, the card stays in place after "+ Add your own"
      queryClient={myClient} //                                              optional: your own client (its defaults are yours); absent, the provider makes one
      persistVocabulary={() => true} //                                      optional: whether the card vocabulary is kept on this device
      discoverVaultProfilePhoto={async () => ({ photoRef: null })} //        optional: finds the photo of a vault's profile; absent, the unit's own
      loadPhotoObjectUrl={async () => null} //                               optional: loads a photo as an object URL; absent, the unit's own
      loadGranteeFace={async () => null} //                                  optional: loads the face of a person who shares one with the viewer; absent, the unit's own
      useHolderOriginLine={() => ({ origin: null, loading: false })} //      optional HOOK: the "Where / How we met" line; absent, none
      useContactLabels={() => ({ chips: null, offered: { circleLabel: [], relationshipKind: [] }, offersLoading: false, catalogueNote: null, actError: null, add: async () => false, entryPredicates: new Map() })} // optional HOOK: the kind chips; absent, none
      listPlaceClaimsInVault={async () => []} //                             optional: the four place members of the one card (the entry never calls them)
      claimsAbout={() => []}
      claimFieldText={() => ""}
      loadPlaceNames={async () => []}
      RecordFace={() => null} //                                             optional: the face of a record in the Employees group (org-employees); absent, no face
      settings={{
        localRigHosts: [], //                                                optional: bare host names of a local development rig
        ontologyApiOrigin: "https://ontology.platform.example.test", //      optional: the origin that answers the public term search
        minOntologyQuery: 3, //                                              optional: the shortest query that reaches the ontology
        vocabTypeBatchRevisions: "", //                                      optional: platform revisions that serve the batched vocabulary read
        publicCorpusOrigin: "https://corpus.example.test", //                optional: the public term corpus for a rig with no ontology
      }}
    >
      <OnlineStakeholderCard principal={principal} placementMode="content" />
    </StakeholderCardGilbPlatformProvider>
  );
}
