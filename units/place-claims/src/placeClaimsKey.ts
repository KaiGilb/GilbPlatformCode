// The query key and the freshness of the vault's one shared address read. Taken from GilbApp `src/lib/mynet/place/usePlaceClaims.ts` lines 50-52 (the
// hook is the unit `use-place-claims`'s). The Address group and the one card's merge read the SAME key, so one read serves both and a write's fresh
// read-back updates both.

/** The key of the vault's address read. */
export const placeClaimsKey = (vaultId: string) => ["mynet", "place-claims", vaultId] as const;

/** How long that read is fresh, in milliseconds. */
export const PLACE_CLAIMS_STALE_MS = 60_000;
