/** Every sentence the switcher shows. English; pass `words` to the switcher to change any of them. */
export interface VaultSwitcherWords {
  /** The dialog's heading. */
  title: string;
  loading: string;
  couldNotList: string;
  /** Shown when the list is empty. */
  none: string;
  close: string;
  /** The chip's accessible name, given the open vault's label. */
  changeVault: (label: string) => string;
  /** Second line of the person's own vaults. */
  yours: string;
  /** Second line of a vault that is not theirs. */
  shared: string;
  /** Added to the second line of a vault that cannot be written. */
  viewOnly: string;
  /** The retry button after a failed list. */
  tryAgain: string;
}

// Defaults copied from PictureRecords run 7, app/src/components/VaultChip.tsx, except where a line says otherwise.
export const defaultWords: VaultSwitcherWords = {
  title: "Choose a vault", // :64 (the dialog's aria-label; the visible heading there, "Your plant vaults", is the plant app's)
  loading: "Looking for your vaults…", // :66
  couldNotList: "Could not list your vaults.", // :50 (its fallback; the unit never shows a raw error message)
  none: "Vaults shared with you will appear here.", // :82 (run 7 showed it for one vault or none; here, only for none)
  close: "Close", // :83
  changeVault: (label) => `Vault ${label}. Change vault`, // :26
  yours: "Yours", // :75
  shared: "Shared with you", // :75
  viewOnly: "View only", // :75
  tryAgain: "Try again", // not in run 7 (it had no retry); the unit's own
};
