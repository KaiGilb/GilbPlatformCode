/**
 * Dates and place on one employment role, as GilbApp's employment code keeps them.
 *
 * A missing end is not "current". `current` has THREE states: true (said current), false (said ended), null (never
 * said). A role whose state was never given leaves `ongoing` untouched on the way out. An end month and ongoing-true
 * are never written together: the end wins.
 *
 * `roleWire` is the whole role as the form holds it. `roleChangeWire` is the wire of an EDIT: only the attributes whose
 * read value the edit changed, so a value the person did not touch, or that did not read, is neither written nor cleared.
 *
 * The attribute names are passed in. This file does not name them.
 */

/** A fact value of the wire (the part of GilbApp's `FactValue` a role uses). */
type FactValue = string | boolean | { "@id": string };
export interface RoleAttrs {
  startDate: string;
  endDate: string;
  ongoing: string;
  workLocation: string;
}

/** What the holder said about one employment. Empty strings mean "cleared". */
export interface EmploymentRoleFacts {
  start: string;
  end: string;
  /** true: said current. false: said ended. null: never said. */
  current: boolean | null;
  /** Full https IRI of a catalogue place, or "". */
  placeId: string;
}

export interface RoleWire {
  set: Record<string, FactValue>;
  clear: string[];
}

const MONTH = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/;

export function roleMonth(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  return MONTH.test(value) ? value : "";
}

/**
 * Expand a place reference to a full IRI.
 * A compact `base:e/…` is rewritten with the catalogue origin this app is pointed at.
 * Anything else is refused, so a short form is never written back.
 */
export function fullPlaceIri(raw: unknown, catalogueOrigin: string): string {
  const value =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object" && typeof (raw as { "@id"?: unknown })["@id"] === "string"
        ? (raw as { "@id": string })["@id"]
        : "";
  if (!value) return "";
  if (value.startsWith("https://") || value.startsWith("http://")) return value;
  const compact = /^base:e\/([^/\s]+)$/.exec(value);
  if (!compact) return "";
  const origin = catalogueOrigin.replace(/\/+$/, "");
  return `${origin}/base/e/${compact[1]}`;
}

/** The patch for one role. Every attribute is either set or named in `clear`. */
export function roleWire(role: EmploymentRoleFacts, attrs: RoleAttrs): RoleWire {
  const start = roleMonth(role.start);
  const end = roleMonth(role.end);
  const set: Record<string, FactValue> = {};
  const clear: string[] = [];
  const put = (key: string, value: FactValue | null) => {
    if (value === null) clear.push(key);
    else set[key] = value;
  };

  put(attrs.startDate, start || null);
  // An end month means the role has ended. Never also write ongoing true.
  if (end) {
    put(attrs.endDate, end);
    put(attrs.ongoing, null);
  } else if (role.current === true) {
    put(attrs.ongoing, true);
    put(attrs.endDate, null);
  } else if (role.current === false) {
    // Not current, and the end month was not given.
    put(attrs.ongoing, false);
    put(attrs.endDate, null);
  } else {
    // Never said. Leave ongoing untouched. Clear the end month.
    put(attrs.endDate, null);
  }

  // A compact id is not written. The read expands it first; the write sends only a full IRI.
  const storedPlace = /^https?:\/\/\S+$/.test(role.placeId.trim()) ? role.placeId.trim() : "";
  put(attrs.workLocation, storedPlace ? { "@id": storedPlace } : null);
  return { set, clear };
}

export function readRole(
  raw: { start: unknown; end: unknown; ongoing: unknown; place: unknown },
  catalogueOrigin: string,
): EmploymentRoleFacts {
  const start = roleMonth(raw.start);
  const end = roleMonth(raw.end);
  // Only an explicit true, and only when no end was stored. A contradiction reads as ended.
  const current: boolean | null =
    end !== "" || raw.ongoing === false ? false : raw.ongoing === true ? true : null;
  return {
    start,
    end,
    current,
    placeId: fullPlaceIri(raw.place, catalogueOrigin),
  };
}

const EMPTY_ROLE: EmploymentRoleFacts = { start: "", end: "", current: null, placeId: "" };

/**
 * The patch of one EDIT of a role: `before` is the role as it was last read (none: an employment with no role yet),
 * `after` is the role as the form holds it now. An attribute is named only when what the person sees of it changed:
 *   - `startDate` when the start month changed;
 *   - `endDate` when the end month changed (a cleared month is a null; Present clearing a stored end is a null);
 *   - `ongoing` when the end month or the current state changed, with `roleWire`'s rules (an end month clears it, true
 *     and false are written, never-said leaves it alone);
 *   - `workLocation` when the place changed.
 * A stored value that did not read (a full date, a place that is not an address) reads as "" before and after, so an
 * edit of another attribute does not clear it.
 */
export function roleChangeWire(before: EmploymentRoleFacts | undefined, after: EmploymentRoleFacts, attrs: RoleAttrs): RoleWire {
  const b = before ?? EMPTY_ROLE;
  const full = roleWire(after, attrs);
  const startChanged = roleMonth(b.start) !== roleMonth(after.start);
  const endChanged = roleMonth(b.end) !== roleMonth(after.end);
  const currentChanged = b.current !== after.current;
  const placeChanged = b.placeId.trim() !== after.placeId.trim();
  const keep = new Set<string>();
  if (startChanged) keep.add(attrs.startDate);
  if (endChanged) keep.add(attrs.endDate);
  if (endChanged || currentChanged) keep.add(attrs.ongoing);
  if (placeChanged) keep.add(attrs.workLocation);
  const set: Record<string, FactValue> = {};
  for (const [key, value] of Object.entries(full.set)) if (keep.has(key)) set[key] = value;
  return { set, clear: full.clear.filter((key) => keep.has(key)) };
}
