import { NO_CONTROL } from "@kaigilb/gilbplatformcode-vault-access";

/** Every sentence the sheet shows that is not the platform's. English; pass `words` to the sheet to change any of them. */
export interface ShareWords {
  /** The dialog's heading, unless the host passes `title`. */
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  accessLegend: string;
  canEdit: string;
  canView: string;
  share: string;
  shared(name: string): string;
  whoHasAccess: string;
  loading: string;
  nobody: string;
  /** Shown instead of the form when the signed-in person does not hold Control. */
  notControlled: string;
  /** The line under the owner's name. */
  ownerLine: string;
  remove: string;
  removeLabel(who: string): string;
  confirmRemove(who: string): string;
  no: string;
  yes: string;
  close: string;
}

// Defaults copied from PictureRecords run 7, app/src/share/ShareSheet.tsx, except where a line says otherwise.
export const defaultWords: ShareWords = {
  title: "Share this vault", // :66 (its aria-label; the visible heading there, "Share your plants", is the app's)
  nameLabel: "Their vault name", // :73
  namePlaceholder: "e.g. anna", // run 6 app/src/ui/ShareSheet.tsx, the placeholder "anna" (run 7's "e.g. annasplants" is the plant app's)
  accessLegend: "Access", // :78
  canEdit: "Can edit", // :79, :98
  canView: "Can view", // :80, :98
  share: "Share", // :84
  shared: (name) => `Shared with ${name}`, // :39
  whoHasAccess: "Who has access", // :88
  loading: "Reading who has access…", // :89
  nobody: "Nobody else has access yet.", // :91
  notControlled: NO_CONTROL, // the unit's own sentence; run 7 :69 said "You can't manage sharing for this vault."
  ownerLine: "Owns this vault", // run 6 app/src/ui/ShareSheet.tsx, "owns this vault"
  remove: "Remove", // :107
  removeLabel: (who) => `Remove ${who}`, // :107 (aria-label)
  confirmRemove: (who) => `Remove ${who}?`, // :102
  no: "No", // :103
  yes: "Yes", // :104
  close: "Close", // :114
};
