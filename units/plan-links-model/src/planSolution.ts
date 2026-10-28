// Solution of Function is one t:SolutionOf relation per Function.
// The Function card reads that relation back. Nothing is stored on the Function.
// Part of System is one a:partOf link. An older {"a:label"} is words, not a link.

import { entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";
import { memberValue, rowServedFact } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { roleIs } from "@kaigilb/gilbplatformcode-relation-role";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { typeLocalName } from "@kaigilb/gilbplatformcode-type-curie";

export const SOLUTION_OF_TYPE = "t:SolutionOf";
export const SOLUTION_OF_ROLES = { source: "role:source", target: "role:target" } as const;

function isSolutionOf(row: RecordRelation): boolean {
  return typeLocalName(row.type ?? "") === "SolutionOf";
}

/** Functions this Solution names: t:SolutionOf where this record is role:source. */
export function solutionOfFunctions(
  rows: readonly RecordRelation[] | null | undefined,
): { relation: string; uri: string }[] {
  const out: { relation: string; uri: string }[] = [];
  for (const row of rows ?? []) {
    if (!isSolutionOf(row) || !roleIs(row.role, "source")) continue;
    for (const member of row.members ?? []) {
      if (roleIs(member.role, "target") && member.member.trim()) {
        out.push({ relation: row.relation, uri: member.member });
      }
    }
  }
  return out;
}

/** Solutions whose t:SolutionOf names this Function as role:target. */
export function solutionsTargeting(
  rows: readonly RecordRelation[] | null | undefined,
): { relation: string; uri: string }[] {
  const out: { relation: string; uri: string }[] = [];
  for (const row of rows ?? []) {
    if (!isSolutionOf(row) || !roleIs(row.role, "target")) continue;
    for (const member of row.members ?? []) {
      if (roleIs(member.role, "source") && member.member.trim()) {
        out.push({ relation: row.relation, uri: member.member });
      }
    }
  }
  return out;
}

/** The row the open card caches after it writes one t:SolutionOf. */
export function solutionOfCacheRow(args: {
  relation: string;
  view: "source" | "target";
  otherUri: string;
}): RecordRelation {
  const asSource = args.view === "source";
  return {
    relation: args.relation,
    role: asSource ? SOLUTION_OF_ROLES.source : SOLUTION_OF_ROLES.target,
    type: SOLUTION_OF_TYPE,
    members: [
      {
        member: args.otherUri,
        role: asSource ? SOLUTION_OF_ROLES.target : SOLUTION_OF_ROLES.source,
      },
    ],
  };
}

export function relationMemberIds(uris: readonly string[]): Set<string> {
  const excluded = new Set<string>();
  for (const uri of uris) {
    excluded.add(uri);
    const ref = entityRefFromFact(uri);
    if (ref) {
      excluded.add(ref.id);
      excluded.add(ref.uri);
    }
  }
  return excluded;
}

export type PartOfReading =
  | { kind: "link"; uri: string }
  | { kind: "label"; label: string }
  | { kind: "empty" };

/** A part-of value. {"@id"} is the link. {"a:label"} is older words, not a link. */
export function readPartOf(raw: unknown): PartOfReading {
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return { kind: "empty" };
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return readPartOf(JSON.parse(text) as unknown);
      } catch {
        return { kind: "empty" };
      }
    }
    if (entityRefFromFact(text) || text.startsWith("urn:")) return { kind: "link", uri: text };
    return { kind: "empty" };
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const read = readPartOf(item);
      if (read.kind !== "empty") return read;
    }
    return { kind: "empty" };
  }
  if (!raw || typeof raw !== "object") return { kind: "empty" };
  const obj = raw as Record<string, unknown>;
  const id = obj["@id"];
  if (typeof id === "string" && id.trim()) return { kind: "link", uri: id.trim() };
  const label = memberValue(obj, "label");
  if (typeof label === "string" && label.trim()) return { kind: "label", label: label.trim() };
  return { kind: "empty" };
}

export function readPartOfFact(record: {
  facts: Record<string, string>;
  served?: { facts?: Readonly<Record<string, unknown>> } | null;
}): PartOfReading {
  return readPartOf(rowServedFact(record, "partOf"));
}
