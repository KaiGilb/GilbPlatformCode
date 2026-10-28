// Person-only Authority search for a constraint being made or retyped.
// The card's picker is PlanAuthority: it still lists every stakeholder and refuses on the pick.
// This file does not import the create dialog. The caller opens "+ New stakeholder".
import { useCallback } from "react";
import { personTypeNames, CONSTRAINT_AVOID } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import { OrgRecordPicker, type OrgRecordHit } from "@kaigilb/gilbplatformcode-record-picker";
import { usePlanCardHost } from "./host";

export function PersonAuthoritySearch({
  vaultId,
  onPick,
  onNew,
  testId,
}: {
  vaultId: string;
  onPick: (hit: OrgRecordHit) => void;
  /** Omitted: no "+ New stakeholder". The caller opens the Stakeholders dialog. */
  onNew?: () => void;
  testId?: string;
}) {
  const host = usePlanCardHost();
  const shell = host.useShell();
  const vaults = host.heldVaultIds(shell.vaults ?? []);
  const kinds = host.useStakeholderKindSet();
  const names = personTypeNames(kinds.data);
  const find = useCallback((q: string) => host.findStakeholderRecords(vaults, names, q), [vaults, names]);
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <OrgRecordPicker
        vaultId={vaultId}
        label="Authority"
        placeholder="Search people"
        find={find}
        findKey={`person-authority:${names.join("|")}:${vaults.join("|")}`}
        pendingText="Searching people…"
        errorText="Could not search people. That is not a statement that there are none."
        noneText="No person record matches."
        partialText="No match among the person records read; the list may not be whole."
        autoFocus={false}
        untilEngaged
        onPick={onPick}
      />
      {onNew ? (
        <button type="button" className="min-h-11 self-start text-left text-sm text-[var(--accent)]" onClick={onNew}>
          + New stakeholder
        </button>
      ) : null}
    </div>
  );
}

/** The avoid line and the required Authority field on Plan's create form. */
export function ConstraintCreateAuthority({
  vaultId,
  picked,
  onPick,
  onNew,
}: {
  vaultId: string;
  picked: OrgRecordHit | null;
  onPick: (hit: OrgRecordHit | null) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="plan-constraint-create-authority">
      <p className="text-[12px] leading-snug text-[var(--ink-soft)]">{CONSTRAINT_AVOID}</p>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-faint)]">
          Authority <span className="font-normal normal-case tracking-normal">required</span>
        </span>
        {picked ? (
          <span className="inline-flex min-w-0 items-center gap-2 text-[14px] text-[var(--ink)]">
            <span>{picked.label}</span>
            <button type="button" className="min-h-11 px-1 text-sm text-[var(--accent)]" onClick={() => onPick(null)}>
              {`Remove ${picked.label}`}
            </button>
          </span>
        ) : (
          <PersonAuthoritySearch vaultId={vaultId} onPick={onPick} onNew={onNew} />
        )}
      </div>
    </div>
  );
}
