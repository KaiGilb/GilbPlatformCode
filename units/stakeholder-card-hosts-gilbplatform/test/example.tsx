// The one complete wiring of the Stakeholder cards on GilbPlatform: the provider with every prop, the online card of a person from the holder's circles,
// and the held card of the record the holder keeps once "+ Add your own" has made it. It is type-checked with the unit and rendered by
// `src/example.test.tsx`. Every value that names a place is a placeholder; yours are your own.
import { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { OnlineStakeholderCard } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { StakeholderRecordCard } from "@kaigilb/gilbplatformcode-stakeholder-record-card";
import { StakeholderCardGilbPlatformProvider } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";

export function StakeholderScreen({ session, principal }: {
  session: SessionCredential; // after sign-in: the SessionCredential of the sign-in unit
  principal: string; //          the person whose online card to draw (their principal)
}) {
  const [myClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } }));
  // Your page's own state: which record it shows. The provider tells it the record and, when it knows, the vault the record was made in (its door).
  const [held, setHeld] = useState<{ id: string; door: string | undefined } | null>(null);
  return (
    <StakeholderCardGilbPlatformProvider
      origin="https://example.test" //                                       required: the platform's vault origin
      ontologyOrigin="https://ontology.platform.example.test" //             required: the origin that serves the ontology's terms
      systemVaultHosts={["ontology.platform.example.test"]} //               required: hosts besides the origin's family that may be read at their own address (they never get your credential)
      systemHostLabels={["id", "ontology"]} //                               required: first labels of the platform's own hosts
      session={session} //                                                   required: signs every request
      geoOrigin="https://geo.example.test" //                                required: the origin of the shared world catalogue
      viewedVaultId={null} //                                                optional: the vault your screen shows; absent, the holder's landing vault
      refreshOnlineStakeholders={() => {}} //                                optional: draw your online list again (called before a record is opened)
      onOpenRecord={(id, door) => setHeld({ id, door })} //                  optional: open a record in your page; door is the vault a create of this session wrote it into, when known
      queryClient={myClient} //                                              optional: your own client (its defaults are yours); absent, the provider makes one
      persistVocabulary={() => true} //                                      optional: whether the card vocabulary is kept on this device
      discoverVaultProfilePhoto={async () => ({ photoRef: null })} //        optional: finds the photo of a vault's profile; absent, the unit's own
      loadPhotoObjectUrl={async () => null} //                               optional: loads a photo as an object URL; absent, the unit's own
      loadGranteeFace={async () => null} //                                  optional: loads the face of a person who shares one with the viewer; absent, the unit's own
      useHolderOriginLine={undefined} //                                     optional HOOK: absent, the one of contact-card-slots, which the held card's slots call too (keep it)
      useContactLabels={undefined} //                                        optional HOOK: absent, the one of contact-labels
      listPlaceClaimsInVault={async () => []} //                             optional: the four place members of the one card (the cards never call them)
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
        mynetProfileUrl: "https://mynet.example.test/profile", //            optional, but give it for the held card: the "Edit in MyNet" link of the holder's own card
      }}
    >
      {held ? (
        <>
          <button type="button" onClick={() => setHeld(null)}>Back to the online card</button>
          <StakeholderRecordCard recordId={held.id} {...(held.door ? { vaultId: held.door } : {})} />
        </>
      ) : (
        <OnlineStakeholderCard principal={principal} placementMode="content" />
      )}
    </StakeholderCardGilbPlatformProvider>
  );
}
