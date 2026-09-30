export interface ScaleLevel {
  code: string;
  /** Empty when the scale named the level and did not say what it includes. */
  includes: string;
}

type ScaleDoc = {
  "a:valueSet"?: unknown;
  "a:example"?: unknown;
};

/** Levels from a scale document the host already holds. Throws when the set is missing or empty. */
export function levelsFromScaleDoc(doc: ScaleDoc): ScaleLevel[] {
  const raw = doc["a:valueSet"];
  if (!Array.isArray(raw)) throw new Error("Scale did not carry a value set");
  const codes = raw.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  if (codes.length === 0) throw new Error("Scale value set was empty");
  const examples = Array.isArray(doc["a:example"])
    ? doc["a:example"].filter((item): item is string => typeof item === "string")
    : [];
  return codes.map((code) => ({ code, includes: anchorFor(code, examples) }));
}

function anchorFor(code: string, examples: string[]): string {
  const line = examples.find(
    (item) => item === code || item.startsWith(`${code} `) || item.startsWith(`${code}—`) || item.startsWith(`${code}-`),
  );
  if (!line || line === code) return "";
  return line.replace(new RegExp(`^${escapeRegExp(code)}\\s*[—–-]?\\s*`), "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
