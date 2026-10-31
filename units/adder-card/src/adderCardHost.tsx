/**
 * What the adder's card needs from the app that is in no unit: the session the app already holds, read PASSIVELY.
 *
 *   - `useSession` is REQUIRED. `useAdderCard` calls it as `useSession({ enabled: false })`: it must see whatever session query the
 *     shell already holds and NEVER fetch or mint one (a card that is not under the shell asks for nothing). It answers the query result
 *     as React Query shapes it: `data?.principal` is the signed-in principal, `undefined` while there is none.
 *
 * The host reaches the hook through `AdderCardHostProvider`. Without one, `useAdderCard` throws an error that names it. The pure half
 * (`adderCardOf`, `landingVaultOf`, `nameFromEmail`) needs no host.
 *
 * Module state: `AdderCardHostContext` is one React context. A provider from another installed copy of this unit is not seen.
 */
import { createContext, useContext } from "react";

/** The passive session read, as much of the query result as `useAdderCard` reads. */
export interface AdderCardHost {
  useSession: (opts: { enabled: false }) => { data?: { principal?: string } | undefined };
}

export const AdderCardHostContext = createContext<AdderCardHost | null>(null);
export const AdderCardHostProvider = AdderCardHostContext.Provider;

export function useAdderCardHost(): AdderCardHost {
  const host = useContext(AdderCardHostContext);
  if (!host) throw new Error("useAdderCard needs an AdderCardHostProvider above it: the host supplies the session it reads.");
  return host;
}
