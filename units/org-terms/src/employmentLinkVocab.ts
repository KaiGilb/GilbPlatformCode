// The master's spellings of `a:employer` and `a:employee`, asked by term name
// (`term-slots` `attributeSpelling`), as every other spelling of the employment is.
// 🔴 ITS OWN GATE, ⛔ not part of the employment vocabulary: a master that stops serving a link term stops the LINK
// only, never an employment save. Fails CLOSED
// (⛔ never a guessed key); cached on success only.
import { attributeSpelling } from "@kaigilb/gilbplatformcode-term-slots";
import type { EmploymentLinkVocab } from "./employmentLinkVocabType";

export class EmploymentLinkVocabUnavailableError extends Error {
  constructor(missing: readonly string[]) {
    super(`The ontology did not name ${missing.join(", ")}, so an employer cannot be linked right now.`);
    this.name = "EmploymentLinkVocabUnavailableError";
  }
}

let cached: Promise<EmploymentLinkVocab> | null = null;

/** Test seam: ⛔ never called by product code. */
export function __resetEmploymentLinkVocab(): void {
  cached = null;
}

export function resolveEmploymentLinkVocab(): Promise<EmploymentLinkVocab> {
  cached ??= (async () => {
    const terms = ["employer", "employee"] as const;
    const answers = await Promise.all(terms.map((t) => attributeSpelling(t)));
    const missing = terms.filter((_, i) => !answers[i]);
    if (missing.length > 0) throw new EmploymentLinkVocabUnavailableError(missing.map((t) => `a/${t}`));
    return { employer: `a:${answers[0]!}`, employee: `a:${answers[1]!}` };
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}
