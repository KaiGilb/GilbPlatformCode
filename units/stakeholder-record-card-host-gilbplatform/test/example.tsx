// The one complete wiring of both Stakeholder cards on GilbPlatform: the provider (its required props, the profile address and `onOpenRecord`), the online card of a
// person from the holder's circles, and after "+ Add your own" the held card of the record that was made, with a button back. It is type-checked with the unit
// and rendered by `src/example.test.tsx`. Every value that names a place is a placeholder; yours are your own.
import { useState } from "react";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { OnlineStakeholderCard } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { StakeholderCardGilbPlatformProvider } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { HeldStakeholderCard } from "@kaigilb/gilbplatformcode-stakeholder-record-card-host-gilbplatform";

export function StakeholderScreens({ session, principal }: {
  session: SessionCredential; // after sign-in: the SessionCredential of the sign-in unit
  principal: string; //          the person whose online card to draw (their principal)
}) {
  // Your page's own state: which record it shows. The provider tells it the record and, when it knows, the vault the record was made in (its door).
  const [held, setHeld] = useState<{ id: string; door: string | undefined } | null>(null);
  return (
    <StakeholderCardGilbPlatformProvider
      origin="https://example.test" //                                       required: the platform's vault origin
      ontologyOrigin="https://ontology.platform.example.test" //             required: the origin that serves the ontology's terms
      systemVaultHosts={["ontology.platform.example.test"]} //               required: hosts besides the origin's family that may be read at their own address
      systemHostLabels={["id", "ontology"]} //                               required: first labels of the platform's own hosts
      session={session} //                                                   required: signs every request
      geoOrigin="https://geo.example.test" //                                required: the origin of the shared world catalogue
      onOpenRecord={(id, door) => setHeld({ id, door })} //                  the page opens the record; door is the vault a create of this session wrote it into, when known
      settings={{ mynetProfileUrl: "https://mynet.example.test/profile" }} // REQUIRED for the held card: its own-card band links to it (absent: the card is not drawn, a sentence says why)
    >
      {held ? (
        <>
          <button type="button" onClick={() => setHeld(null)}>Back to the online card</button>
          <HeldStakeholderCard recordId={held.id} {...(held.door ? { vaultId: held.door } : {})} />
        </>
      ) : (
        <OnlineStakeholderCard principal={principal} placementMode="content" />
      )}
    </StakeholderCardGilbPlatformProvider>
  );
}
