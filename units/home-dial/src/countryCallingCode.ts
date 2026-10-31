// The calling code is a fact on the country, read from the catalogue.
// One code is served as a string (JSON-LD compaction). Two codes stay an array. A code is never turned back into a country.
// The reader of a country document's codes (`callingCodesOf`) is `phone-text`'s; this file is the request.

import { callingCodesOf } from "@kaigilb/gilbplatformcode-phone-text";

export async function readCountryCallingCodes(
  countryEntityUrl: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await fetch(countryEntityUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`Country read ${res.status}`);
  }
  const doc = (await res.json()) as { countryCallingCode?: unknown };
  return callingCodesOf(doc.countryCallingCode);
}
