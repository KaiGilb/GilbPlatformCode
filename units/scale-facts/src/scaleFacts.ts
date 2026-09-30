/**
 * The scale fields on a relation the host already holds.
 * Dates use the machine's local calendar. Nothing is fetched.
 * Time-and-place points are a different unit (occurred-at).
 */

export interface DatedLevel {
  when: string;
  value: string;
}

export interface RelationScale {
  tag: string;
  unit: string;
  rate: string;
  endpoints: string;
  context: string;
  from: string;
  until: string;
  status: DatedLevel;
  tolerable: DatedLevel;
  goal: DatedLevel;
}

const PLANGUAGE_LEVEL = /^\[(\d{4}-\d{2}-\d{2})\]\s*(.*)$/;

function extraString(extras: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = extras[key];
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

/** Local calendar date, YYYY-MM-DD. Not UTC. A missing clock is not filled in. */
export function todayIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Local date and minute, YYYY-MM-DDTHH:mm. No seconds and no zone suffix. */
export function nowDateTimeLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function emptyDatedLevel(now: Date = new Date()): DatedLevel {
  return { when: todayIsoDate(now), value: "" };
}

export function emptyScale(now: Date = new Date()): RelationScale {
  return {
    tag: "",
    unit: "",
    rate: "",
    endpoints: "",
    context: "",
    from: "",
    until: "",
    status: emptyDatedLevel(now),
    tolerable: emptyDatedLevel(now),
    goal: emptyDatedLevel(now),
  };
}

/**
 * True for a time word: second, minute, hour, day, week, month, year, and the short forms
 * including ms and the single word time.
 * False for blank, %, percent, $, and any unit whose text contains kilo or gram.
 * "kilosecond" is therefore false. "kg" is false because it is not in the time list.
 */
export function isTimeUnit(unit: string): boolean {
  const text = unit.trim().toLowerCase();
  if (!text || text === "%" || text === "percent" || text === "$" || text.includes("kilo") || text.includes("gram")) {
    return false;
  }
  return /^(s|sec|secs|second|seconds|ms|min|mins|minute|minutes|h|hr|hrs|hour|hours|day|days|week|weeks|month|months|year|years|time)$/i.test(
    text,
  );
}

/**
 * Pull From: and Until: lines out of a context block.
 * The match is case-insensitive. The last From line wins. The last Until line wins.
 * Those lines are not copied into the body. The body is joined with newlines and trimmed as a whole.
 */
export function parseContextWindow(context: string): { from: string; until: string; body: string } {
  let from = "";
  let until = "";
  const lines = context.split(/\r?\n/);
  const body: string[] = [];
  for (const line of lines) {
    const fromMatch = line.match(/^From:\s*(.*)$/i);
    const untilMatch = line.match(/^Until:\s*(.*)$/i);
    if (fromMatch) {
      from = (fromMatch[1] ?? "").trim();
      continue;
    }
    if (untilMatch) {
      until = (untilMatch[1] ?? "").trim();
      continue;
    }
    body.push(line);
  }
  return { from, until, body: body.join("\n").trim() };
}

/**
 * Write From, then Until, then the context body. Blank parts are left out.
 * This does not look inside the body for an older From line. A body that already
 * contains one will be written again.
 */
export function formatContextWindow(context: string, from: string, until: string): string {
  const parts: string[] = [];
  if (from.trim()) parts.push(`From: ${from.trim()}`);
  if (until.trim()) parts.push(`Until: ${until.trim()}`);
  if (context.trim()) parts.push(context.trim());
  return parts.join("\n");
}

/**
 * True when some scale field has text.
 * Endpoints are not counted. A scale whose only text is endpoints is empty by this test.
 */
export function scaleHasContent(scale: RelationScale): boolean {
  return !!(
    scale.tag.trim() ||
    scale.unit.trim() ||
    scale.rate.trim() ||
    scale.context.trim() ||
    scale.from.trim() ||
    scale.until.trim() ||
    scale.status.value.trim() ||
    scale.tolerable.value.trim() ||
    scale.goal.value.trim()
  );
}

/**
 * Read one dated level.
 * "[YYYY-MM-DD] rest" wins, and the rest is trimmed. The date is not checked beyond that shape.
 * Otherwise the value is kept as read, and when is the first 10 characters of the separate when,
 * even when those characters are not a date.
 */
export function parseDatedLevel(raw: unknown, whenRaw?: unknown): DatedLevel {
  const value = typeof raw === "string" ? raw : extraString({ v: raw }, "v");
  const match = value.match(PLANGUAGE_LEVEL);
  if (match) {
    return { when: match[1] ?? "", value: (match[2] ?? "").trim() };
  }
  const when =
    (typeof whenRaw === "string" && whenRaw.slice(0, 10)) ||
    extraString({ v: whenRaw }, "v").slice(0, 10) ||
    "";
  return { when, value };
}

function levelFacts(attr: string, whenAttr: string, level: DatedLevel): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (level.value.trim()) out[attr] = level.value.trim();
  if (level.value.trim() && level.when.trim()) out[whenAttr] = level.when.trim();
  return out;
}

/**
 * Read a scale from facts already on the relation.
 * For each field the first key that holds a string is used, including an empty string.
 * An empty string does not fall through to the next spelling of that same field.
 * A finite number is turned into text. 0 is kept.
 * Context is read from paramSlot before context, then split with parseContextWindow.
 */
export function scaleFromExtras(extras: Record<string, unknown>): RelationScale {
  const rawContext = extraString(extras, "a:paramSlot", "a:context", "paramSlot", "context");
  const window = parseContextWindow(rawContext);
  return {
    tag: extraString(extras, "a:tag", "tag"),
    unit: extraString(extras, "a:unit", "unit"),
    rate: extraString(extras, "a:rate", "rate"),
    endpoints: extraString(extras, "a:endpoint", "a:endpoints", "endpoint", "endpoints"),
    context: window.body,
    from: window.from,
    until: window.until,
    status: parseDatedLevel(extras["a:status"] ?? extras.status, extras["a:statusWhen"] ?? extras.statusWhen),
    tolerable: parseDatedLevel(
      extras["a:tolerable"] ?? extras.tolerable,
      extras["a:tolerableWhen"] ?? extras.tolerableWhen,
    ),
    goal: parseDatedLevel(extras["a:goal"] ?? extras.goal, extras["a:goalWhen"] ?? extras.goalWhen),
  };
}

/**
 * Write a scale back to fact names.
 * Endpoints are written as a:endpoint, singular, even though the read also accepts a:endpoints.
 * The window is written as a:paramSlot, not a:context.
 * A level with no value writes nothing, even when it has a date.
 * A level with a value and no date writes the value only.
 */
export function extrasFromScale(scale: RelationScale): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (scale.tag.trim()) extras["a:tag"] = scale.tag.trim();
  if (scale.unit.trim()) extras["a:unit"] = scale.unit.trim();
  if (scale.rate.trim()) extras["a:rate"] = scale.rate.trim();
  if (scale.endpoints.trim()) extras["a:endpoint"] = scale.endpoints.trim();
  const packed = formatContextWindow(scale.context, scale.from, scale.until);
  if (packed.trim()) extras["a:paramSlot"] = packed;
  Object.assign(extras, levelFacts("a:status", "a:statusWhen", scale.status));
  Object.assign(extras, levelFacts("a:tolerable", "a:tolerableWhen", scale.tolerable));
  Object.assign(extras, levelFacts("a:goal", "a:goalWhen", scale.goal));
  return extras;
}
