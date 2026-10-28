// The link between a holder's record of a person and that person's own online card: the existing `sameAs` fact on the record.
// This file reads it from the record's served facts. It is pure.

/** The two spellings a served document may carry the link under. ⛔ `owl:sameAs` is not one of them, on purpose. */
const LINK_SPELLINGS = ["sameAs", "a:sameAs"] as const;

export type LinkReading =
  | { state: "none" }
  | { state: "linked"; target: string }
  | { state: "ambiguous" }
  | { state: "malformed" };

function referenceOf(v: unknown): string | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const id = (v as Record<string, unknown>)["@id"];
    if (typeof id === "string" && id.trim() !== "") return id.trim();
  }
  return null;
}

/**
 * The link as a record's served facts carry it. Only a REFERENCE counts (`{ "@id": <address> }`): a plain string in the
 * slot is `malformed`, never reinterpreted as a link. Two references are `ambiguous` (the term is single-valued): no
 * card is chosen for it, and the newest one is never taken.
 *
 * @param served the record's facts as the vault served them (bare keys, references kept as `{ "@id" }`)
 */
export function readLink(served: Readonly<Record<string, unknown>> | null | undefined): LinkReading {
  if (!served) return { state: "none" };
  const found: unknown[] = [];
  for (const key of LINK_SPELLINGS) {
    const v = served[key];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) found.push(...v);
    else found.push(v);
  }
  if (found.length === 0) return { state: "none" };
  const targets = found.map(referenceOf);
  if (targets.some((t) => t === null)) return { state: "malformed" };
  const distinct = [...new Set(targets as string[])];
  if (distinct.length > 1) return { state: "ambiguous" };
  return { state: "linked", target: distinct[0]! };
}
