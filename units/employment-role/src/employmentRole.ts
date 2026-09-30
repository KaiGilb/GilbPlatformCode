/**
 * Dates and place on one employment role.
 *
 * A missing end is not "current". Only `current: true` on the way in, or a
 * stored `ongoing: true` with no readable end on the way out, means current.
 * An end month and ongoing-true are never written together. The end wins.
 *
 * The attribute names are passed in. This file does not name them.
 */

const MONTH = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/;

export interface RoleAttrs {
  startDate: string;
  endDate: string;
  ongoing: string;
  workLocation: string;
}

export interface EmploymentRoleFacts {
  start: string;
  end: string;
  /** True only when the holder said the role is current. */
  current: boolean;
  /** Full http(s) address of a catalogue place, or "". */
  placeId: string;
}

export interface RoleWire {
  set: Record<string, string | boolean | { "@id": string }>;
  clear: string[];
}

/**
 * A year `YYYY`, or a year-month `YYYY-MM`. Anything else, including a full
 * date `YYYY-MM-DD`, is `""`.
 *
 * The month must be `01`–`12`. `2019-3` is not a month. `2011` with no month
 * is kept. Non-strings are `""`. The result is the trimmed input, not a
 * rebuilt string.
 */
export function roleMonth(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  return MONTH.test(value) ? value : "";
}

/**
 * A place reference as a full address.
 *
 * A string that already starts with `http://` or `https://` is returned
 * unchanged. It is not trimmed. A leading space fails the check.
 *
 * `{ "@id": string }` is read the same way.
 *
 * `base:e/<id>` is rewritten as `<catalogueOrigin>/base/e/<id>`. Trailing
 * slashes on the origin are removed first. One slash is then inserted.
 * Pass the origin only, not an origin that already ends in `/base`.
 *
 * Anything else, including a bare place name and `base:e/` with extra path,
 * is `""`. A short form is never returned. The write path refuses `""`.
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
  const id = compact?.[1];
  if (!id) return "";
  const origin = catalogueOrigin.replace(/\/+$/, "");
  return `${origin}/base/e/${id}`;
}

/**
 * The patch for one role. Every attribute is either in `set` or named in `clear`.
 *
 * An end month that `roleMonth` accepts is written, and ongoing is cleared,
 * even when `current` is true. Ongoing true is written only when there is no
 * such end. Otherwise ongoing is false and the end is cleared.
 *
 * A start that is not a month is cleared, not written as the bad text.
 *
 * `placeId` is written only when, after trim, it is `http://` or `https://`
 * with no whitespace. A compact `base:e/…` is cleared. Expand it with
 * `fullPlaceIri` before you call this. This function does not expand.
 */
export function roleWire(role: EmploymentRoleFacts, attrs: RoleAttrs): RoleWire {
  const start = roleMonth(role.start);
  const end = roleMonth(role.end);
  const set: RoleWire["set"] = {};
  const clear: string[] = [];
  const put = (key: string, value: string | boolean | { "@id": string } | null) => {
    if (value === null) clear.push(key);
    else set[key] = value;
  };

  put(attrs.startDate, start || null);
  if (end) {
    put(attrs.endDate, end);
    put(attrs.ongoing, null);
  } else if (role.current) {
    put(attrs.ongoing, true);
    put(attrs.endDate, null);
  } else {
    put(attrs.ongoing, false);
    put(attrs.endDate, null);
  }

  const storedPlace = /^https?:\/\/\S+$/.test(role.placeId.trim()) ? role.placeId.trim() : "";
  put(attrs.workLocation, storedPlace ? { "@id": storedPlace } : null);
  return { set, clear };
}

/**
 * Read one stored role.
 *
 * `current` is true only when `ongoing` is the boolean `true` and the end is
 * not a readable month. The string `"true"` is not current. A garbage end
 * (`"soon"`) is not an end, so ongoing true with that garbage still reads as
 * current. An ongoing true together with a real end reads as ended.
 *
 * `placeId` is `fullPlaceIri`. A name that does not expand is `""`.
 */
export function readRole(
  raw: { start: unknown; end: unknown; ongoing: unknown; place: unknown },
  catalogueOrigin: string,
): EmploymentRoleFacts {
  const start = roleMonth(raw.start);
  const end = roleMonth(raw.end);
  const current = raw.ongoing === true && end === "";
  return {
    start,
    end,
    current,
    placeId: fullPlaceIri(raw.place, catalogueOrigin),
  };
}
