/**
 * The session's ONE read of the ontology's user-plane vocabulary (`GET /base/vocab?status=all&linkPlane=user`, `readUserLinkPlaneCatalog`), shared by
 * the contact header's relation chips and the kind chips (the default tie's words, and which predicates are symmetric). One React Query key, so a hook
 * of any layer shares the one read.
 */
import { readUserLinkPlaneCatalog, type LinkPlaneCatalog } from "@kaigilb/gilbplatformcode-lws-relations";

/** The session's one read of the user-plane vocabulary (React Query key). */
export const USER_VOCAB_KEY = ["s5c-user-link-plane"] as const;

export class VocabUnreadableError extends Error {
  constructor() {
    super("The GilbVeda vocabulary could not be read.");
    this.name = "VocabUnreadableError";
  }
}

/** The catalog, or a thrown error when it could not be read (an empty stale answer is a failure, ⛔ never "no terms"). */
export async function readHeaderVocab(): Promise<LinkPlaneCatalog> {
  const cat = await readUserLinkPlaneCatalog();
  if (cat.stale && cat.terms.length === 0) throw new VocabUnreadableError();
  return cat;
}
