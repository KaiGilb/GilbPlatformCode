// A person record's Address section: reads the addresses, shows them as a card group, and saves, changes and removes them in the holder's vault.
// Taken from GilbApp `src/components/records/AddressRows.tsx` (commit in the README). Changes are marked CHANGED.
//
// Each address is its own `t:PlaceClaim` (with one `t:SelfAssertedFieldClaim` per field) in the vault that holds the person's record, `a:claimSubject` the
// record. They are not written through the card's save or the record's sidecar save: the addresses are their own entities, so the record is not touched.
import { useRef } from "react";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { PlaceClaimsCard } from "@kaigilb/gilbplatformcode-place-claims-card";
import { draftToInput } from "@kaigilb/gilbplatformcode-place-draft";
import { usePlaceClaims } from "@kaigilb/gilbplatformcode-use-place-claims";

export function AddressRows({
  title,
  legacyText,
  vaultId,
  recordEntityUri,
  principal,
  canEdit,
  vaultName,
}: {
  /** The address term's label, from the master. */
  title: string;
  /** The record's plain-text value under the address term, if any (shown, never dropped). */
  legacyText: string;
  /** The vault that HOLDS the record: the record's, never the viewer's. */
  vaultId: string | null;
  /** The record's entity IRI: every address's `a:claimSubject`. */
  recordEntityUri: string;
  /** The signed-in principal (granted read on each row at mint). */
  principal: string | null;
  canEdit: boolean;
  /** CHANGED (new): the name of the vault that holds the record, for "Not every address in <name> was read." Absent: "this vault". */
  vaultName?: string | null;
}) {
  const places = usePlaceClaims(vaultId, recordEntityUri, principal);
  const mode = useCardMode();
  const present = mode.managed && mode.presentation;
  // CHANGED (F3): no way to add while no read of this vault has answered and the last one failed: the person could not see what is already there (a second
  // address saved on top of an unread first one). GilbApp had no failed state. Once a read has answered, a later failed re-read keeps the addresses it has and the
  // add (the list on screen is the last one read, and the error says the latest read failed).
  // The status the hook holds is not keyed by vault: for one render after the vault changes it is still the old vault's. So an answer is only counted once the new vault's own
  // read has been seen to start (a status that is not an answer), and the mark is kept per vault.
  const answered = useRef<{ vault: string | null; armed: boolean; yes: boolean }>({ vault: null, armed: false, yes: false });
  if (answered.current.vault !== (vaultId ?? null)) answered.current = { vault: vaultId ?? null, armed: false, yes: false };
  const isAnswer = places.status === "ready" || places.status === "incomplete";
  if (!isAnswer) answered.current.armed = true;
  else if (answered.current.armed) answered.current.yes = true;
  const canAdd = !(places.status === "failed" && !answered.current.yes);
  return (
    <PlaceClaimsCard
      title={title}
      legacyText={legacyText}
      claims={places.claims}
      busy={places.busy || places.loading}
      error={places.error}
      // CHANGED (F1-F4): what the read came to is handed on, so the card says it.
      readState={{ status: places.status, reason: places.reason, vaultName: vaultName ?? null }}
      canAdd={canAdd}
      // CHANGED: `ownerHome` (GilbApp's owner-home lock and its line) is not taken: the held card has no owner-home address.
      editMode={canEdit && !!vaultId && !present}
      addInPlace={canEdit && !!vaultId}
      fieldLabels={places.fieldLabels}
      onSave={(d) => places.save(draftToInput(d))}
      onAmend={(c, d) => places.amend(c, draftToInput(d))}
      onRemove={(c) => places.remove(c)}
    />
  );
}
