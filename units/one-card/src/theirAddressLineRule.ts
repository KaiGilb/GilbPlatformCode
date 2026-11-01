// Line order and joins follow address-card-parts `compactLines`. The two sentences follow its `unreadNotes`.
// Copied, not imported: address-card-parts would make place-picker and its peers required for every app that takes one-card.
// Beyond the source (Kai, 2026-11-01).
import type { OwnAddress } from "@kaigilb/gilbplatformcode-one-card-merge";

export interface TheirLine {
  key: "street" | "line1" | "line2" | "postal-city" | "region-country";
  text: string;
  countryId?: string;
}

const trim = (x: string | null | undefined): string => (x ?? "").trim();

/** Filled parts only, in `compactLines` order. `countryId` is on the region-country line only, and only when the country name is non-empty. */
export function theirAddressLines(parts: OwnAddress, countryId: string | null): TheirLine[] {
  const out: TheirLine[] = [];
  const add = (key: TheirLine["key"], bits: (string | null | undefined)[], sep: string, id?: string | null) => {
    const text = bits.map(trim).filter((x) => x !== "").join(sep);
    if (!text) return;
    if (id) out.push({ key, text, countryId: id });
    else out.push({ key, text });
  };
  add("street", [parts.street], "");
  add("line1", [parts.line1], "");
  add("line2", [parts.line2], "");
  add("postal-city", [parts.postalCode, parts.city], " ");
  add("region-country", [parts.region, parts.country], ", ", trim(parts.country) !== "" ? countryId : undefined);
  return out;
}

/** `namedAny` is true when the address has at least one of city, region or country. Words are `unreadNotes`. */
export function theirUnreadNotes(unread: number, gone: number, namedAny: boolean): string[] {
  const notes: string[] = [];
  if (unread > 0) notes.push(`${unread} ${namedAny ? "more " : ""}place${unread === 1 ? "" : "s"} not read right now`);
  if (gone > 0) notes.push(`${gone} place${gone === 1 ? "" : "s"} no longer in the catalogue`);
  return notes;
}
