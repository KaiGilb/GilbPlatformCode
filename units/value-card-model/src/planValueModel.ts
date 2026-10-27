/**
 * The Value card's data model: the shared contract for the card lines and the graphic view.
 *
 * Every write goes through VALUE_TERMS (terms minted in GilbVeda); the old stored names
 * are read-only (LEGACY_VALUE_SLUGS, bare slugs) and are never written again.
 */
import type { PlanSourceValue } from "@kaigilb/gilbplatformcode-plan-card-facts";

/** The names the Value record is written under. */
export const VALUE_TERMS = {
  scale: "a:hasScale",
  endpoint: "a:endpoint",
} as const;

/** The older stored names (bare slugs). Read-only: when a record that holds them is edited, the patch nulls them. */
export const LEGACY_VALUE_SLUGS = {
  scale: "valueScale",
  endpoint: "valueEndpoint",
  scaleVariables: "scaleQualifierDefinitions",
  meters: "valueMeters",
  levels: "valueLevels",
} as const;

/** Which end of the Scale is better. "target" = a range in the middle is best (bipolar). */
export type ScaleDirection = "lower" | "higher" | "target";

export interface ValueScale {
  /** The Scale sentence. Variables are written in brackets: "minutes for a defined [User type] to learn …". */
  text: string;
  unit: string;
  rate: string;
  /** For a duration: "from: …; until: …". */
  context: string;
  direction: ScaleDirection;
  source: PlanSourceValue;
}

/** One choice of a Scale variable, e.g. Country = Sweden. */
export interface ScaleVariableOption {
  name: string;
  definition: string;
}

/** A Scale variable, e.g. [Country]. Its options are what a level's qualifier may pick. */
export interface ScaleVariable {
  name: string;
  definition: string;
  /** The option name used when a level does not set this variable. "" = none. */
  defaultOption: string;
  options: ScaleVariableOption[];
  source: PlanSourceValue;
}

export type MeterKind = "human" | "ai" | "instrument";

export interface ValueMeterLine {
  kind: MeterKind;
  method: string;
  source: PlanSourceValue;
}

/** A named Meter, e.g. Meter [During Development]. `qualifier` "" = the one plain Meter. */
export interface ValueMeter {
  qualifier: string;
  lines: ValueMeterLine[];
}

/** The standard points, in Scale order from worst to best. Any other word is a custom point. */
export const STANDARD_LEVEL_KINDS = ["Fail", "Survival", "Past", "Status", "Tolerable", "Goal", "Wish"] as const;
export type StandardLevelKind = (typeof STANDARD_LEVEL_KINDS)[number];

/** The qualifier in Goal [qualifier] 42. */
export interface LevelQualifier {
  /** ISO date YYYY-MM-DD, or "" when none. */
  when: string;
  /** Scale variable name → chosen option name (one pick), or the picked names (2+). "ALL" = every value. A variable not named here takes its default. */
  variables: Record<string, string | string[]>;
  /** Any free conditions, in order: "If Russia Ukraine war is ended", "in Stockholm", "Release 3.0". */
  conditions: string[];
  /** Bipolar Scales only: which side this limit guards. "" = one-sided. */
  side: "" | "low" | "high";
}

/** One level line: Goal [2027-06-30, Release 3.0, User type = Senior 70+] 5 <- Ann. */
export interface ValueLevel {
  /** A standard kind or a custom word (e.g. "Budget", "Record", "Trend"). */
  kind: string;
  /**
   * The number on the Scale for drawing and sorting. null = not yet set, or the author's text is not a number (a range is drawn at
   * its midpoint). the author's TEXT is what is stored (a:scaleNumber), see `valueText`.
   */
  value: number | null;
  /**
   * The author's text of a:scaleNumber, kept exactly ("5-10", "approx. 5", "1,5", "5.50"). Left out when the text is just the
   * plain decimal of `value`. It is only the level's text while `value` is still what it draws (see levelNumberText).
   */
  valueText?: string | undefined;
  qualifier: LevelQualifier;
  source: PlanSourceValue;
  /** Optional note shown after the source, e.g. "estimate", "requester to confirm". */
  note: string;
}

/** One side of an Endpoint: a GilbVeda type (IRI + label) and free words. ⚠ PROTOTYPE storage names. */
export interface EndpointPart {
  typeIri: string;
  typeLabel: string;
  words: string;
}

/** Everything the Value card adds to the Solution card's lines. */
export interface ValueCardData {
  scale: ValueScale;
  variables: ScaleVariable[];
  endpoint: { subject: EndpointPart; reference: EndpointPart; text: string; source: PlanSourceValue };
  meters: ValueMeter[];
  levels: ValueLevel[];
}
