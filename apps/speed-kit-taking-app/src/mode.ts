// Chosen at build time: `VITE_PLATFORM=live` is the live mode, anything else is the stand-in.
export const isLive = (): boolean => import.meta.env.VITE_PLATFORM === "live";
/** Live mode: the one vault this build reads, `https://<host>/vault`, and the platform origin that signs the person in. */
export const pinnedVault = (): string => String(import.meta.env.VITE_PINNED_VAULT ?? "");
export const platformOrigin = (): string => String(import.meta.env.VITE_PLATFORM_ORIGIN ?? "");
