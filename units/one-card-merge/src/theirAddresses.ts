// Their addresses, grouped from the fields of their online card. Pure: no fetch, no write, no React.
//
// A place claim arrives as separate fields: the address's own label row, and one row per part (street, lines, postal code, one
// per place). The server names, on each part, the address it belongs to (`composite`); the label row's own `sourceEntity` is that
// address's id. A part joins the address whose id is its `composite`, and nothing else joins it: ⛔ never by position, never
// because there is only one label, never by a prefix of an entity id. A part the server named no address for stays loose.
//
// ⛔ No predicate is typed here: the spellings are handed IN (the app asks the master for them).
import type { OnlineCardField } from "@kaigilb/gilbplatformcode-online-card";
import { addressLine } from "./mergeOneCard";

/** The spellings of an address's fields, passed in by the app (never typed in this unit). */
export interface AddressSpellings {
  label: string;
  streetLine: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  claimPlace: string;
}

/** One address of theirs, as far as this viewer was served it. */
export interface TheirAddress {
  /** The address's entity id. */
  composite: string;
  /** null when the viewer was not served the label row. */
  label: string | null;
  street: string | null;
  line1: string | null;
  line2: string | null;
  postalCode: string | null;
  /** The `claimPlace` values (place ids, not names), in server order, no duplicates. */
  placeIds: string[];
  /** The distinct rungs of all parts drawn, in first-seen order. */
  rungs: string[];
  /** The predicates that went into this address, in first-seen order (so a caller can skip their raw groups). */
  partPredicates: string[];
}

/**
 * Group the address fields of `fields` into addresses by `composite`.
 * - `addresses`: one per address id, in the order any of its fields first appears. A part whose address's label row was not served
 *   still forms an address (label null).
 * - `loose`: address-part fields with no `composite`, and a label row with no `sourceEntity`, unchanged and in server order.
 * - Fields that are not address parts are in neither.
 * - Two parts of one address with the same predicate (a place may repeat): the first is kept, the rest are ignored.
 */
export function theirAddressesOf(
  fields: readonly OnlineCardField[],
  spellings: AddressSpellings,
): { addresses: TheirAddress[]; loose: OnlineCardField[] } {
  const parts = new Set<string>([spellings.streetLine, spellings.addressLine1, spellings.addressLine2, spellings.postalCode, spellings.claimPlace]);
  const byId = new Map<string, TheirAddress>();
  const loose: OnlineCardField[] = [];
  for (const f of fields) {
    const isLabel = f.predicate === spellings.label;
    if (!isLabel && !parts.has(f.predicate)) continue;
    const id = isLabel ? f.sourceEntity : f.composite;
    if (!id) {
      loose.push(f);
      continue;
    }
    let a = byId.get(id);
    if (!a) {
      a = { composite: id, label: null, street: null, line1: null, line2: null, postalCode: null, placeIds: [], rungs: [], partPredicates: [] };
      byId.set(id, a);
    }
    if (f.predicate === spellings.claimPlace) {
      if (a.placeIds.includes(f.value)) continue;
      a.placeIds.push(f.value);
    } else {
      const slot = isLabel ? "label" : f.predicate === spellings.streetLine ? "street" : f.predicate === spellings.addressLine1 ? "line1" : f.predicate === spellings.addressLine2 ? "line2" : "postalCode";
      if (a[slot] !== null) continue;
      a[slot] = f.value;
    }
    if (!a.partPredicates.includes(f.predicate)) a.partPredicates.push(f.predicate);
    if (!a.rungs.includes(f.rung)) a.rungs.push(f.rung);
  }
  return { addresses: [...byId.values()], loose };
}

/**
 * The comparable line of an address of theirs: the same line `addressLine` builds for an address of yours, over the parts that
 * are honestly comparable here: street, the two lines and the postal code. ⛔ The place parts are NOT in it: we hold their ids,
 * not their names, and `sameAddress` compares names (city, region, country). Until the names are read, a line from here is equal
 * to an address of yours only when yours has no city, region or country; the app that reads the names builds the full
 * comparison itself.
 */
export function theirAddressLine(a: TheirAddress): string {
  return addressLine({ street: a.street, line1: a.line1, line2: a.line2, postalCode: a.postalCode });
}
