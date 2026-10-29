/**
 * The shape of an image the header shows, from the entity's type in the data.
 *
 * The rule: people/contacts as circles, everything else as squares. A person is a circle; everything else (organization, company, project, system, any
 * other or unknown type) is a rounded square.
 *
 * ⛔ Decided by the TYPE the data carries, never by a name. An unknown or missing type gives the
 * rounded square, because that shape claims no person.
 */

/** The two shapes an image can take. */
export type ImageShape = "circle" | "rounded-square";

// The ontology's person type, in the spellings a record may carry: the CURIE `t:Person`, the bare
// local name, or a full term IRI ending in `/t/Person` (any host, so a mirror's IRI matches too).
const PERSON_TYPE = /^(?:t:Person|Person|https?:\/\/[^\s]+\/t\/Person)$/;

/**
 * Picks the image shape for an entity's type.
 *
 * @param type the entity's type as the data states it (`t:Person`, a term IRI, or null)
 * @returns `"circle"` for a person, `"rounded-square"` for anything else or no type
 */
export function imageShapeOf(type: string | null | undefined): ImageShape {
  if (typeof type !== "string") return "rounded-square";
  return PERSON_TYPE.test(type.trim()) ? "circle" : "rounded-square";
}
