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
