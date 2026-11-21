// Every sentence the starter shows that is not the platform's own and not another unit's. Pass `words` to change any of them.
import type { AppVaultStep } from "@kaigilb/gilbplatformcode-signin";

export interface StarterWords {
  /** While the stored sign-in is checked, before any vault is read. */
  checkingSignIn: string;
  /** While the person's vault is found or made, by step. */
  opening: Record<AppVaultStep, string>;
  signingOut: string;
  /** Above the sentence of a failed start. */
  couldNotOpen: string;
  retry: string;
  signOut: string;
  share: string;
  /** The share sheet's heading. */
  shareTitle(vaultLabel: string): string;
  /** The line under the share sheet's heading. */
  shareHelp: string;
  /** The label of the section list. */
  sections: string;
  /** The bottom-bar button that opens the section list on a narrow window. */
  menu: string;
  /** Shown when the open vault can be read but not changed. */
  viewOnly: string;
  /** Shown above the account buttons in the menu of a narrow window. */
  account: string;
}

export const defaultWords: StarterWords = {
  checkingSignIn: "Checking your sign-in…",
  opening: {
    listing: "Opening your vault: reading the vaults you can reach…",
    creating: "Opening your vault: making your vault for this app…",
    finishing: "Opening your vault: the platform is finishing your new vault…",
  },
  signingOut: "Signing out…",
  couldNotOpen: "Your vault could not be opened.",
  retry: "Try again",
  signOut: "Sign out",
  share: "Share",
  shareTitle: (vaultLabel) => `Share ${vaultLabel}`,
  shareHelp: "People you add can see the records in this vault (View) or also add and change them (Edit).",
  sections: "Sections",
  menu: "Menu",
  viewOnly: "View only",
  account: "Account",
};
