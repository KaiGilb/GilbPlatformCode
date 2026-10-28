export {
  useMainTag,
  useMainTags,
  useMainTagsForRows,
  fetchMainTagsForRows,
  readMasterTags,
  tagPlatformFor,
  vaultOfEntity,
  rowsNeedingMainTag,
  mainTagKey,
  mainTagsKey,
  TAG_READ_BOUND_MS,
  MASTERS_BATCH_MAX,
} from "./mainTag";
export type { MainTag, MainTagRow } from "./mainTag";
export { needsMainTag } from "./needsMainTag";
