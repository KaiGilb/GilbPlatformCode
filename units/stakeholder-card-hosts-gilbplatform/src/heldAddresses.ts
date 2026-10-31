// The four place members of the one card, for the app that holds the addresses (the held card's host): the holder's addresses of a linked person, as the
// merge compares them ("You have the same on your card"). They read the vault's ONE shared address read (`placeClaimsKey` of `place-claims`) that the Address
// group already makes through `use-place-claims`, so a card open adds no request of its own while that read is fresh.
//
// What the merge may rely on (CHANGED, F8): it is never handed half of the holder's addresses, or an address with half of its places.
//  - `listPlaceClaimsInVault` REJECTS, with the claims it did read (`PlaceClaimsIncompleteError`), when the read was not the whole vault. GilbApp resolved with
//    the subset, so a linked card could say "You have the same on your card" from a part of the list, or fail to fold an equal address and draw it twice.
//  - `loadPlaceNames` REJECTS (`PlaceNamesNotReadError`) when any place failed to read: an address whose places are not all known is not compared. A place the
//    catalogue answered 404 for is an absence and is left out, as it is gone.
//  The one card turns a rejection into "the holder's addresses are not known", which leaves the merge unfolded.
import type { QueryClient } from "@tanstack/react-query";
import type { OneCardHost } from "@kaigilb/gilbplatformcode-one-card";
import {
  PLACE_CLAIMS_STALE_MS,
  PlaceClaimsIncompleteError,
  claimFieldText,
  claimsAbout,
  placeClaimsKey,
  readPlaceClaimsInVault,
  type PlaceClaim,
  type PlaceClaimsRead,
} from "@kaigilb/gilbplatformcode-place-claims";
import { loadPlaceNames } from "@kaigilb/gilbplatformcode-place-names";

/**
 * The key the one card's own observer of the holder's addresses is held under. It is not the shared read's key: the shared read (`placeClaimsKey`) holds ONE
 * shape, the whole `PlaceClaimsRead`, and the one card's `useQuery` holds what its `queryFn` returns, the claims. Two shapes under one key would break whichever
 * read came second. The key starts with the shared read's, so a refresh of the vault's addresses by prefix reaches both.
 */
export const heldAddressesKey = (vaultId: string) => [...placeClaimsKey(vaultId), "held-addresses"] as const;

/**
 * A promise whose derived promises are marked handled. The one card asks `host.loadPlaceNames(ids).then(use)` with no `catch` (its source never had a member that could
 * reject), so a rejection would surface as an unhandled rejection in the page. The rejection is still the member's answer to anyone who awaits it or gives `then` a
 * second argument; only the derived promise of a `then` with no handler for it is not reported.
 */
class QuietPromise<T> extends Promise<T> {
  /** What `then` derives is a plain promise, so the `catch` below is not this `then` again. */
  static override get [Symbol.species](): PromiseConstructor {
    return Promise;
  }
  override then<A = T, B = never>(onFulfilled?: ((v: T) => A | PromiseLike<A>) | null, onRejected?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    const derived = super.then(onFulfilled, onRejected);
    derived.catch(() => undefined);
    return derived;
  }
}

type Members = Pick<OneCardHost, "listPlaceClaimsInVault" | "claimsAbout" | "claimFieldText" | "loadPlaceNames">;

export function createHeldAddressMembers(qc: QueryClient): Members {
  return {
    listPlaceClaimsInVault: async (vaultId) => {
      // The shared read, held up to its freshness: the Address group's read serves the card when it is fresh.
      const read = await qc.fetchQuery<PlaceClaimsRead>({
        queryKey: placeClaimsKey(vaultId),
        queryFn: () => readPlaceClaimsInVault(vaultId),
        staleTime: PLACE_CLAIMS_STALE_MS,
      });
      if (!read.complete) throw new PlaceClaimsIncompleteError(read.claims, read.reason);
      return read.claims;
    },
    claimsAbout: (claims, subject) => claimsAbout(claims as readonly PlaceClaim[], subject),
    claimFieldText: (claim, term) => claimFieldText(claim as PlaceClaim, term),
    loadPlaceNames: (ids) => {
      const p = loadPlaceNames(ids);
      return new QuietPromise<Awaited<typeof p>>((resolve, reject) => void p.then(resolve, reject));
    },
  };
}
