// The held card of a person, in the Card view's centre. The entry: it reads the record at its own door, then draws `StakeholderRecordBody`.
// The record id and the door come in as props (the source read them from the shell's selection). With no door the card does not read.
import { useQueryClient } from "@tanstack/react-query";
import { RefLabelContext } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { CardSlots } from "@kaigilb/gilbplatformcode-card-group";
import { sessionIdentityKeys } from "@kaigilb/gilbplatformcode-record-write";
import { createdInVaultOf, useCachedRecord, useKnownRecordDoor, useRecord } from "@kaigilb/gilbplatformcode-record-detail-reads";
import { recordDoor, vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { vaultLabel } from "@kaigilb/gilbplatformcode-vault-list";
import { StakeholderRecordBody } from "./StakeholderRecordBody";
import { useStakeholderRecordCardHost } from "./stakeholderRecordCardHost";

export interface StakeholderRecordCardProps {
  /** The record to draw. */
  recordId: string;
  /**
   * The record's door: the id of the vault that holds it. The read is addressed at that vault's node, unless the caches already know the record's own
   * address (a search hit, the vault a create wrote it into this session), which then decides. Absent: the vault a create wrote this record into (`createdInVaultOf`).
   * With neither (and no cached copy that names one) the card does not read and says so; it never reads the platform's base address.
   */
  vaultId?: string | null;
  /** The places for the cards at the very top of the person card (My Note, Where / How we met, the contact-kind chips). */
  slots?: CardSlots;
}

function Header({ title }: { title: string }) {
  return (
    <div className="flex-none flex items-center h-9">
      <h2 className="font-[var(--serif)] text-[16px] font-semibold text-[var(--ink)]">{title}</h2>
    </div>
  );
}

export function StakeholderRecordCard({ recordId, vaultId: vaultIdProp, slots }: StakeholderRecordCardProps) {
  const host = useStakeholderRecordCardHost();
  const { writeGuard, session, vaults } = host.useShell();
  const qc = useQueryClient();
  const vaultId = vaultIdProp || createdInVaultOf(qc, recordId) || "";

  const cached = useCachedRecord(vaultId, recordId);
  const listLabelOnly = (cached as { hydrated?: boolean } | null)?.hydrated === false;
  const knownDoor = useKnownRecordDoor(cached && !listLabelOnly ? null : recordId);
  // No door: not the vault asked for, not one a create wrote into, not one any cached copy names. A read would go to the base address, which answers
  // for one vault only; the card says it does not know and asks nothing.
  const noDoor = !vaultId && !knownDoor && !cached;
  // An address the caches know for the record (a search hit, a create, the list's own row) is the record's door; the vault named by the host is the door when none is known.
  const fallbackQ = useRecord(noDoor ? null : !cached || listLabelOnly ? recordId : null, recordDoor(knownDoor ?? cached?.entityUri ?? null, vaultId));
  const record = fallbackQ.data ?? cached ?? null;

  if (noDoor) {
    return (
      <div className="h-full flex flex-col p-4" data-testid="stakeholder-record-card-no-door">
        <Header title="Record" />
        <p className="mt-3 text-[13px] text-[var(--ink-faint)]">Which vault holds this card is not known, so it was not read.</p>
      </div>
    );
  }

  if (!record) {
    // What the vault answers here is a deliberate non-disclosure 404: absent, unreadable and deleted look the same, so the sentence names the vault
    // that was asked and asserts nothing more. The door decides the sentence, not the vault on screen.
    const askedOrigin = vaultOriginOf(recordDoor(knownDoor, vaultId));
    const askedVaultEntry = (vaults ?? []).find((p) => vaultOriginOf(p.vaultId) === askedOrigin);
    const askedVault = askedVaultEntry ? vaultLabel(askedVaultEntry) : null;
    return (
      <div className="h-full flex flex-col p-4">
        <Header title="Record" />
        <p className="mt-3 text-[13px] text-[var(--ink-faint)]">
          {fallbackQ.isPending
            ? "Loading record…"
            : `${askedVault ?? "This vault"} didn’t return this record. It may have been deleted, or your access may not reach it.`}
        </p>
      </div>
    );
  }

  const identityKeys = sessionIdentityKeys(session?.principal, session?.vault?.shortWebId);

  return (
    <RefLabelContext.Provider value={host.useRefLabel}>
      <StakeholderRecordBody key={record.id} record={record} vaultId={vaultId} writeGuard={writeGuard} identityKeys={identityKeys} slots={slots} />
    </RefLabelContext.Provider>
  );
}
