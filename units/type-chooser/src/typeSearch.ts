import type { CreatePlane, TypeOptionKind } from "./types";

/** How many hits to ask for: a ceiling on what a person is asked to read, not a page size to be paged through. There is no paging. */
/** Ceiling the live search asks for — the “keep typing” note is about THIS number. */
export const LIVE_TERM_LIMIT = 20;

export function optionMatchesPlane(kind: TypeOptionKind, plane: CreatePlane): boolean {
  if (plane === "all") return true;
  if (plane === "things") return kind === "type";
  return kind === plane;
}
