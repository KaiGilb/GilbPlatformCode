// The photo term's resolver: one per origin, kept for the life of the module, as GilbApp kept one for the page
// (lib/base/photoTerm.ts:19-22, `createPhotoTermResolver({ vedaOrigin: BASE_ORIGIN, store: localStorage })`). The origin is the provider's
// `origin` prop, which is what the app passed (`BASE_ORIGIN`).

import { createPhotoTermResolver, type PhotoTermResolver, type PhotoTermStore } from "@kaigilb/gilbplatformcode-photo-term";

const resolvers = new Map<string, PhotoTermResolver>();

function deviceStore(): PhotoTermStore | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

/** The resolver for this origin: made the first time it is asked for, then the same one. */
export function photoTermResolverFor(origin: string): PhotoTermResolver {
  let r = resolvers.get(origin);
  if (!r) {
    const store = deviceStore();
    r = createPhotoTermResolver({ vedaOrigin: origin, ...(store ? { store } : {}) });
    resolvers.set(origin, r);
  }
  return r;
}

/** GilbApp: `photoReadKeysSync`, lib/base/photoTerm.ts:74: the resolver's read keys now, or none while they are not known. */
export function photoReadKeysSyncOf(resolver: PhotoTermResolver): () => readonly string[] {
  return () => resolver.peek()?.readKeys ?? [];
}

/** Test seam: forgets every resolver, so the next provider makes its own. Never called by product code. */
export function __resetPhotoTermResolvers(): void {
  resolvers.clear();
}

/** GilbApp: `PHOTO_TERM_RETRY_MS`, photoTerm.ts:30: one ask of the term is shared for this long. */
export const PHOTO_TERM_RETRY_MS = 60_000;

/** GilbApp: `askPhotoReadKeys`, photoTerm.ts:43-61 (without `tellIfKeysChanged`: this unit's sync read is `peek()`, which needs no tell). */
async function askPhotoReadKeys(resolver: PhotoTermResolver): Promise<readonly string[]> {
  try {
    return (await resolver.get()).readKeys;
  } catch (err) {
    const known = resolver.peek();
    if (known) return known.readKeys;
    console.warn(
      "[photo] the profile-photo term could not be resolved and has never been resolved on this " +
        "device; a photo that exists may not be found. This is NOT evidence that there is no photo.",
      err,
    );
    return [];
  }
}

const asks = new WeakMap<PhotoTermResolver, () => Promise<readonly string[]>>();

/**
 * GilbApp: `photoReadKeys`, photoTerm.ts:37-41: every spelling a stored photo fact may carry, from the resolver's term. One ask is shared for
 * {@link PHOTO_TERM_RETRY_MS}; on a failed resolve the last answer that worked, else none. One function per resolver, so the header, the Employees
 * group and the provider share one ask, as the app's module did.
 */
export function photoReadKeysOf(resolver: PhotoTermResolver): () => Promise<readonly string[]> {
  let ask = asks.get(resolver);
  if (!ask) {
    let shared: { at: number; keys: Promise<readonly string[]> } | null = null;
    ask = () => {
      if (shared && Date.now() - shared.at < PHOTO_TERM_RETRY_MS) return shared.keys;
      shared = { at: Date.now(), keys: askPhotoReadKeys(resolver) };
      return shared.keys;
    };
    asks.set(resolver, ask);
  }
  return ask;
}
