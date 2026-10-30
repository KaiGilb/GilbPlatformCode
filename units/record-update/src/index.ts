export {
  CARRIER_ONLY_SLUGS,
  CARRIER_PRESERVE_SLUGS,
  CarrierRenameRefusedError,
  OWN_SAVE_WAIT_MS,
  RECORD_UPDATE_KEY,
  TAG_CARRIER_SLUGS,
  TAG_QUALIFIER_SLUGS,
  factsAfterPatch,
  latestCachedRecord,
  recordSavesSettled,
  useUpdateRecord,
} from "./recordUpdate";
export type { UpdateRecordVars } from "./recordUpdate";
export { rebaseOnStored } from "./rebaseOnStored";
