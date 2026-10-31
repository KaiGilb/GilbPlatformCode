export {
  FLAG_BACKOFF_MAX_MS,
  FLAG_BACKOFF_MS,
  FLAG_TTL_MS,
  FlagReadError,
  __resetFlags,
  flagSvgIsComplete,
  flagSvgIsSafe,
  flagSvgStarts,
  geoFlagSource,
  readFlag,
  setFlagSource,
  setFlagStore,
} from "./flagSource";
export type { CountryFlag, FlagSource, FlagStore } from "./flagSource";
