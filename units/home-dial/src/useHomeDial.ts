// The hook reads two things the holder's own data and the catalogue decide: the holder's home address (a place claim)
// and the country that address sits in.
//   - `HomeDialClaim` stands for a place claim (only the fields the hook reads), and `claimPlaceIds` reads its place ids;
//   - `resolveAncestry` is a parameter: the host says which country a place sits in. The DEFAULT knows no place's
//     country, so the hook answers "" and the code box starts at "+": what a person with no home address gets.
//     A card that has no place claims passes none.
import { useEffect, useState } from "react";
import { claimForPhonePrefill } from "@kaigilb/gilbplatformcode-phone-text";
import { readCountryCallingCodes } from "./countryCallingCode";

/** A home-address claim, as the hook reads a place claim. */
export interface HomeDialClaim {
  label: string;
  uri: string;
  placeIds: readonly string[];
}

/** The host's `resolveAncestry`, as this hook reads it: the country a place sits in. */
export type ResolveAncestry = (id: string) => Promise<{ country?: { id: string } | null }>;

/** Default: no place's country is known (see the header). */
export const noAncestry: ResolveAncestry = async () => ({ country: null });

function claimPlaceIds(claim: HomeDialClaim): string[] {
  return [...claim.placeIds];
}

/** Digits of the home address country's calling code, or "". */
export function useHomeDial(claims: readonly HomeDialClaim[], resolveAncestry: ResolveAncestry = noAncestry): string {
  const home = claimForPhonePrefill(claims);
  const key = home ? `${home.uri}|${claimPlaceIds(home).join(",")}` : "";
  const [dial, setDial] = useState("");

  useEffect(() => {
    if (!home) {
      setDial("");
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        let countryId = "";
        for (const id of claimPlaceIds(home)) {
          const walked = await resolveAncestry(id);
          if (walked.country?.id) {
            countryId = walked.country.id;
            break;
          }
        }
        if (cancel) return;
        if (!countryId) {
          setDial("");
          return;
        }
        const codes = await readCountryCallingCodes(countryId);
        if (cancel) return;
        // One code prefills the box. Two codes do not pick one.
        // A code is never turned back into a country.
        setDial(codes.length === 1 ? codes[0]!.replace(/^\+/, "") : "");
      } catch {
        if (!cancel) setDial("");
      }
    })();
    return () => {
      cancel = true;
    };
    // `home` is read from `key`. A new claims array with the same address must not restart the walk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return dial;
}
