// A skill or an interest is shown by its name. When the catalogue gave no name, the name is the term's own catalogue name taken from its address
// (`<ontology origin>/base/t/<PascalName>`, split into words by `skill-uri-label`), or, for any other text, one word. Never the address, never an id tail.
import { skillUriDisplayLabel } from "@kaigilb/gilbplatformcode-skill-uri-label";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";

export type TermNoun = "skill" | "interest";

export const SKILL_UNNAMED_TEXT = "A skill";
export const INTEREST_UNNAMED_TEXT = "An interest";

/** Escape a text for use inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The catalogue name of a term address, or null. Only an address of the form `<ontology origin>/base/t/<Name>` has one; the origin is read at each call.
 * A storage address (`/base/e/<opaque id>`), another origin, another scheme and free text give null.
 */
export function referentNameOf(iri: string): string | null {
  const address = iri.trim();
  if (!new RegExp(`^${escapeRegExp(termOrigin())}/base/t/[A-Za-z0-9]+$`).test(address)) return null;
  return skillUriDisplayLabel(address);
}

/** The one word shown when there is no name at all: "A skill" or "An interest". */
export function termNameWord(noun: TermNoun): string {
  return noun === "skill" ? SKILL_UNNAMED_TEXT : INTEREST_UNNAMED_TEXT;
}
