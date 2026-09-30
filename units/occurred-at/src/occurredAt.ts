/**
 * When and where a relation happened.
 * The list is stored as one text fact, a JSON array of plain objects.
 * Do not write an object that contains @value. That shape is not this unit's output.
 * Scale levels are a different unit (scale-facts). The local date format below
 * must stay the same as nowDateTimeLocal there.
 */

export interface TimeSpacePoint {
  id: string;
  /** Local `YYYY-MM-DDTHH:mm`, or "" when no time was stored. */
  when: string;
  where: string;
  status?: string;
  tag?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local date and minute. No seconds and no zone suffix. */
export function nowDateTimeLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function pointId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A value that is already YYYY-MM-DDTHH:mm is returned unchanged.
 * Anything else is parsed as a Date and rewritten in local minutes.
 * A value that does not parse is cut to 16 characters. It is not rejected.
 */
export function toDateTimeLocal(isoOrLocal: string): string {
  const raw = isoOrLocal.trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 16);
  return nowDateTimeLocal(parsed);
}

/**
 * Local text becomes an ISO instant. A value that does not parse is returned trimmed, not rejected.
 * The instant depends on the machine's zone, because a zone-less input is read as local time.
 */
export function toIsoDateTime(datetimeLocal: string): string {
  const raw = datetimeLocal.trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

export function newTimeSpacePoint(now: Date = new Date()): TimeSpacePoint {
  return { id: pointId(), when: nowDateTimeLocal(now), where: "" };
}

function pointTimeMs(point: TimeSpacePoint): number {
  if (!point.when.trim()) return Number.POSITIVE_INFINITY;
  const time = Date.parse(point.when);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/**
 * A new array, earliest first.
 * A blank or unparseable time sorts last, not first. Equal times break ties by id.
 * An undated point is therefore after every dated point.
 */
export function sortPointsChronologically(points: readonly TimeSpacePoint[]): TimeSpacePoint[] {
  return [...points].sort((a, b) => {
    const delta = pointTimeMs(a) - pointTimeMs(b);
    if (delta !== 0) return delta;
    return a.id.localeCompare(b.id);
  });
}

function extraString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (value && typeof value === "object" && !Array.isArray(value) && "@value" in value) {
      const inner = (value as { "@value": unknown })["@value"];
      if (typeof inner === "string") return inner;
      if (typeof inner === "number" && Number.isFinite(inner)) return String(inner);
    }
  }
  return "";
}

function pointFromUnknown(raw: unknown): TimeSpacePoint | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const when = raw.trim();
    if (!when) return null;
    if (when.startsWith("[")) {
      try {
        const parsed = JSON.parse(when) as unknown;
        if (Array.isArray(parsed)) return null;
      } catch {
        /* not a JSON array — keep it as one timestamp */
      }
    }
    return { id: pointId(), when: toDateTimeLocal(when), where: "" };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const when = extraString(obj, "when", "@value", "a:occurredAt", "occurredAt");
  const where = extraString(obj, "where", "a:location", "location", "space");
  const status = extraString(obj, "status", "a:status");
  const tag = extraString(obj, "tag", "a:tag");
  if (!when && !where && !status) return null;
  return {
    id: pointId(),
    when: when ? toDateTimeLocal(when) : "",
    where,
    ...(status ? { status } : {}),
    ...(tag ? { tag } : {}),
  };
}

function parsePointList(raw: unknown): TimeSpacePoint[] {
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map(pointFromUnknown).filter((point): point is TimeSpacePoint => point !== null);
      }
    } catch {
      /* not JSON — one timestamp below */
    }
  }
  if (Array.isArray(raw)) {
    return raw.map(pointFromUnknown).filter((point): point is TimeSpacePoint => point !== null);
  }
  const one = pointFromUnknown(raw);
  return one ? [one] : [];
}

/**
 * Read points from a:occurredAt, or occurredAt.
 * A JSON array string is expanded. One string that is not an array is one point.
 * A separate location is copied onto the single point only when that point's where is empty.
 * A whitespace where is not empty, so the separate location is then ignored.
 * When there are no points and there is a location, one point is returned with a blank when.
 */
export function pointsFromExtras(extras: Record<string, unknown>): TimeSpacePoint[] {
  const raw = extras["a:occurredAt"] ?? extras.occurredAt;
  const whereFallback = extraString(extras, "a:location", "location");
  const points = parsePointList(raw);
  const first = points[0];
  if (points.length === 1 && first && !first.where && whereFallback) first.where = whereFallback;
  if (points.length > 0) return sortPointsChronologically(points);
  if (whereFallback) return [{ id: pointId(), when: "", where: whereFallback }];
  return [];
}

/**
 * Write points as a JSON string on a:occurredAt, plus a:location for the where
 * that sorts last. Undated points sort last, so an undated where wins over a dated one.
 * A point with only a tag is dropped. A point is kept when when, where, or status has text.
 * The string is an array of plain objects. It never contains @value.
 */
export function extrasFromPoints(points: readonly TimeSpacePoint[]): Record<string, unknown> {
  const cleaned = sortPointsChronologically(
    points.filter((point) => point.when.trim() || point.where.trim() || (point.status ?? "").trim()),
  );
  if (cleaned.length === 0) return {};
  const payload = cleaned.map((point) => {
    const row: Record<string, string> = {};
    if (point.when.trim()) row.when = toIsoDateTime(point.when);
    if (point.where.trim()) row.where = point.where.trim();
    if (point.status?.trim()) row.status = point.status.trim();
    if (point.tag?.trim()) row.tag = point.tag.trim();
    return row;
  });
  const latestWhere = [...cleaned].reverse().find((point) => point.where.trim())?.where.trim();
  const out: Record<string, unknown> = {
    "a:occurredAt": JSON.stringify(payload),
  };
  if (latestWhere) out["a:location"] = latestWhere;
  return out;
}

/** The earliest dated point, as an ISO instant. Undefined when every point lacks a time. */
export function earliestValidFrom(points: readonly TimeSpacePoint[]): string | undefined {
  const dated = sortPointsChronologically(points).find((point) => point.when.trim());
  return dated ? toIsoDateTime(dated.when) : undefined;
}
