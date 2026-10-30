/**
 * What `discoverVaultProfilePhoto` asks of its host. Passed as its FIRST ARGUMENT.
 */
export interface VaultProfilePhotoHost {
  /**
   * Every spelling a stored photo fact may carry, resolved from the photo term. The app shares one ask of the term at a time and does
   * not ask again for 60 s after an answer that did not resolve; that sharing is the host's.
   * GilbApp: `photoReadKeys()`, `src/lib/base/photoTerm.ts:37` (called at `vaultProfilePhoto.ts:278`).
   */
  photoReadKeys(): Promise<readonly string[]>;
  /**
   * OPTIONAL. Tell the app that a vault has (`true`) or has not (`false`) a profile picture, as this discovery last found. Absent:
   * nothing is noted.
   * GilbApp: `knownVaultPicture.note(vaultId, has)`, `src/lib/knownFact.ts:55` (called at `vaultProfilePhoto.ts:171` and `:195`).
   */
  noteVaultPicture?(vaultId: string, has: boolean): void;
}
