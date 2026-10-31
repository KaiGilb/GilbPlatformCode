/**
 * The spellings an employment is read and written under, ASKED of the ontology master by term name, never typed. The
 * employment subset of a profile vocabulary: the field names are `org`, `jobTitle`, `claimSlotKey`, `name`, the four role
 * attributes, and the type.
 *
 * A term the master does not answer makes the whole vocabulary unavailable: an employment is never written under a guessed
 * key. `employment` (the edge on the person's record) is not asked here: the card hands in the key of the field it found by
 * term, the same key its save keeps.
 *
 * Importing this file registers `Employment` as a card-part type (`registerCardPartTypes`), so an employment never shows as
 * a row of a register grid, and registers the master's spelling of it once that is known.
 */
import { attributeSpelling, typeSpelling } from "@kaigilb/gilbplatformcode-term-slots";
import { registerCardPartTypes } from "@kaigilb/gilbplatformcode-lws-vault-sets";

/** The employment subset of MyNet's `ResolvedProfileVocab` (same names, same served `a:` spellings). */
export interface ResolvedEmploymentVocab {
  /** `a:employment` — the person's ordered reference edges (the record's field key, `a:`-prefixed). */
  employment: string;
  /** `a:org` — exactly ONE organisation's name. */
  org: string;
  /** `a:jobTitle` — one or more titles, scalar for one. */
  jobTitle: string;
  /** `a:claimSlotKey` — the employment's minted handle (`empx-…`). */
  claimSlotKey: string;
  /** `a:name` — READ ONLY: the handle an early MyNet build wrote here. */
  name: string;
  /** CREATE form of the employment type (`t:Employment`). */
  employmentType: string;
  /** QUERY form of the same (`Employment`). */
  employmentTypeQuery: string;
  startDate: string;
  endDate: string;
  ongoing: string;
  workLocation: string;
}

export class EmploymentVocabUnavailableError extends Error {
  constructor(missing: readonly string[]) {
    super(`The ontology did not name ${missing.join(", ")}, so no employment can be read or written right now.`);
    this.name = "EmploymentVocabUnavailableError";
  }
}

let cached: Promise<Omit<ResolvedEmploymentVocab, "employment">> | null = null;

/** Test seam — ⛔ never called by product code. */
export function __resetEmploymentVocab(): void {
  cached = null;
}

const ATTRS = ["org", "jobTitle", "claimSlotKey", "name", "startDate", "endDate", "ongoing", "workLocation"] as const;
const TYPE = "Employment";

// As it6 fix F20 for the address claims: an employment entity is a PART of a person card, not a register
// row (a grid delete of one would leave the person's edge pointing at nothing). Registered by the term
// name asked below, and again by the spelling the master answers.
registerCardPartTypes([TYPE]);

/**
 * The employment vocabulary, from the master (cached on success only, as MyNet's), with the edge key the
 * card found by term. `edgeKey` is the bare field key (`employment`); the served spelling adds one `a:`.
 */
export async function resolveEmploymentVocab(edgeKey: string): Promise<ResolvedEmploymentVocab> {
  cached ??= (async () => {
    const [attrs, type] = await Promise.all([Promise.all(ATTRS.map((n) => attributeSpelling(n))), typeSpelling(TYPE)]);
    const missing = [...ATTRS.filter((_, i) => !attrs[i]).map((n) => `a/${n}`), ...(type ? [] : [`t/${TYPE}`])];
    if (missing.length > 0) throw new EmploymentVocabUnavailableError(missing);
    registerCardPartTypes([type!]);
    const a = (i: number) => `a:${attrs[i]!}`;
    return {
      org: a(0),
      jobTitle: a(1),
      claimSlotKey: a(2),
      name: a(3),
      startDate: a(4),
      endDate: a(5),
      ongoing: a(6),
      workLocation: a(7),
      // CREATE / QUERY split, as MyNet's `employmentType` / `employmentTypeQuery`.
      employmentType: type!,
      employmentTypeQuery: type!.slice(2),
    };
  })().catch((e) => {
    cached = null;
    throw e;
  });
  const v = await cached;
  return { ...v, employment: edgeKey.startsWith("a:") ? edgeKey : `a:${edgeKey}` };
}
