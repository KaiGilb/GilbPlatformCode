// The grant key a held claim carries so the writer can read back what it wrote: `a:directReader` = the signed-in principal at mint.
// A NAMED COPY of the app's `DIRECT_READER` (a constant inside the place-claim module, `src/lib/mynet/place/placeClaim.ts` line 351),
// which is in no unit yet. When the place-claim unit is made it imports this constant from `held-notes`, and this file is its one home.
export const DIRECT_READER = "a:directReader";
