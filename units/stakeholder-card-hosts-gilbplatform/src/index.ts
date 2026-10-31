export { StakeholderCardGilbPlatformProvider, STAKEHOLDER_CARD_QUERY_DEFAULTS } from "./provider";
export type { StakeholderCardGilbPlatformProviderProps } from "./provider";
export type { StakeholderCardSettings } from "./settings";
export type { PlatformShell, WriteGuard } from "./shell";
export { StakeholderCardPlatformContext, useStakeholderCardPlatform } from "./platform";
export type { StakeholderCardPlatform } from "./platform";
export { useRefLabel } from "./refLabel";
export {
  createAddedByHost,
  createAdderCardHost,
  createCardReferencesHost,
  createContactRowsHost,
  createCardVocabularyHost,
  createOneCardHost,
  createOnlineStakeholderCardHost,
  createOrgEmployeesHost,
  createOrgMarkHost,
  createOtherLinkedRecordsHost,
  createPersonCreateHost,
  createPickerQuery,
  createStakeholderContactHeaderHost,
  createStakeholderListDoorsHost,
} from "./hosts";
export type {
  CardVocabularyHostOptions,
  OneCardHostOptions,
  OnlineStakeholderCardHostOptions,
  OrgEmployeesHostOptions,
  StakeholderContactHeaderHostOptions,
} from "./hosts";
export { NO_OWN_VAULT_SAYS } from "@kaigilb/gilbplatformcode-adder-card";
