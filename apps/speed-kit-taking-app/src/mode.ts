// Chosen at build time: `VITE_PLATFORM=live` is the live mode, anything else is the stand-in.
export const isLive = (): boolean => import.meta.env.VITE_PLATFORM === "live";
/** Live mode: the one vault this build reads, `https://<host>/vault`, the identity origin, and the platform apex. */
export const pinnedVault = (): string => String(import.meta.env.VITE_PINNED_VAULT ?? "");
/** Live mode: the identity host. Sign-in and `GET /lws/vaults` go here (RuleRigdevDpopHtuReceivedHost: never to the apex). */
export const idOrigin = (): string => String(import.meta.env.VITE_ID_ORIGIN ?? "");
/** Live mode: the apex the units treat as the platform (`setBaseOrigin`); no request of ours goes to it. */
export const platformOrigin = (): string => String(import.meta.env.VITE_PLATFORM_ORIGIN ?? "");
