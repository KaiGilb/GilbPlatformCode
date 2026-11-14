/**
 * The vault-share-sheet unit: share a whole vault. The React sheet and hook are here; the headless model is also at
 * `./model`, which imports no React.
 */
export * from "./model";
export { useVaultShare } from "./useVaultShare";
export type { ShareState } from "./useVaultShare";
export { VaultShareSheet } from "./VaultShareSheet";
export type { VaultShareSheetProps } from "./VaultShareSheet";
export { defaultWords } from "./words";
export type { ShareWords } from "./words";
export type { KeyValueStore } from "./rememberNames";
