/**
 * What a standing-instructions report means, in one sentence.
 *
 * Three failures share one opening and then say different things. An empty
 * group is not an unread vault, and an unread vault is not a missing title.
 * `loaded` is not a sentence. Silence there means the instructions arrived.
 */

export type StandingOutcome = "loaded" | "group-empty" | "group-absent" | "unreadable";

export interface StandingReport {
  outcome: StandingOutcome;
  group: string;
  vault: string;
  /** Present only when the payload had an array. An empty array is present. */
  groupsSeen?: string[];
  /** Present only when a non-empty string was given, or an unknown outcome made one. */
  reason?: string;
}

const STANDING_OUTCOMES: readonly StandingOutcome[] = [
  "loaded",
  "group-empty",
  "group-absent",
  "unreadable",
];

/**
 * The report inside one event payload, or null when there is no outcome string.
 *
 * An outcome this build does not know becomes `unreadable`. It is not dropped.
 * `group` and `vault` that are not strings become `""`.
 * `groupsSeen` is copied only when the field is an array. Non-strings are
 * dropped. Strings are not trimmed. An empty array is kept, and it is not the
 * same as a missing field.
 * `reason` is copied only when it is a non-empty string. A string of spaces is
 * kept. `""` is not. When the outcome was unknown and no reason was copied,
 * `reason` becomes `the host reported an outcome this app does not know: `
 * plus the raw word.
 */
export function asStandingReport(data: unknown): StandingReport | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const raw = typeof row.outcome === "string" ? row.outcome : "";
  if (!raw) return null;
  const outcome = (STANDING_OUTCOMES as readonly string[]).includes(raw)
    ? (raw as StandingOutcome)
    : "unreadable";
  const report: StandingReport = {
    outcome,
    group: typeof row.group === "string" ? row.group : "",
    vault: typeof row.vault === "string" ? row.vault : "",
  };
  if (Array.isArray(row.groupsSeen)) {
    report.groupsSeen = row.groupsSeen.filter((g): g is string => typeof g === "string");
  }
  if (typeof row.reason === "string" && row.reason) report.reason = row.reason;
  else if (outcome === "unreadable" && raw !== "unreadable") {
    report.reason = `the host reported an outcome this app does not know: ${raw}`;
  }
  return report;
}

/**
 * One sentence, or null when the outcome is `loaded`.
 *
 * A blank group is spoken as `the default group`. A blank vault, in the
 * missing-group sentence only, is spoken as `the standards vault`.
 * The empty-group sentence is the fallback. Anything that is not `loaded`,
 * `unreadable`, or `group-absent` gets that sentence. The parser does not
 * emit a fifth outcome. Do not build a report by hand with another word and
 * expect a different sentence.
 */
export function standingNotice(report: StandingReport): string | null {
  if (report.outcome === "loaded") return null;
  const group = report.group || "the default group";
  if (report.outcome === "unreadable") {
    return `The agent is answering WITHOUT its standing instructions: the standards vault could not be read${
      report.reason ? ` (${report.reason})` : ""
    }. This is not an empty group.`;
  }
  if (report.outcome === "group-absent") {
    const seen = report.groupsSeen?.filter((g) => g.trim()) ?? [];
    return `The agent is answering WITHOUT its standing instructions: no group called "${group}" is on ${
      report.vault || "the standards vault"
    }.${seen.length > 0 ? ` That vault offers: ${seen.join(", ")}.` : ""}`;
  }
  return `The agent is answering WITHOUT its standing instructions: the group "${group}" exists and holds no steps.`;
}
