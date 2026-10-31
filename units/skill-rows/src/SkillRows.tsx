/**
 * A person card's Skills section with the held note under each picked skill. The section is `ContactRows`, unchanged; this only loads the person's
 * skill notes (`useHeldNotes("skill", …)`, in the vault that holds the record) and hands them in. Kept apart so the hook's query is made only where a
 * person card shows its skills.
 */
import type { ComponentProps } from "react";
import { ContactRows } from "@kaigilb/gilbplatformcode-contact-rows";
import { useHeldNotes } from "@kaigilb/gilbplatformcode-held-notes";

export function SkillRows({
  vaultId,
  principal,
  recordEntityUri,
  ...rows
}: Omit<ComponentProps<typeof ContactRows>, "kind" | "skillNotes" | "recordEntityUri"> & {
  /** The vault that HOLDS the person's record — where its skill notes are written and read. */
  vaultId: string | null;
  /** The signed-in principal, granted read on each note at mint. */
  principal: string | null;
  /** The person's record: every note's `a:heldParty`. */
  recordEntityUri: string;
}) {
  const skillNotes = useHeldNotes("skill", vaultId, recordEntityUri, principal);
  return <ContactRows {...rows} kind="skill" recordEntityUri={recordEntityUri} skillNotes={vaultId ? skillNotes : undefined} />;
}
