// Stakeholders on a Plan card, read from the record's relations and its text. A linked stakeholder is one
// GilbPlatform relation per (record, stakeholder). Names that are not records yet stay text on a:stakeholders.
// The pure readers only: finding stakeholder records and writing the relations are the host's.

import { entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";
import { memberValue } from "@kaigilb/gilbplatformcode-plan-card-facts";
import { typeLocalName } from "@kaigilb/gilbplatformcode-type-curie";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { roleIs } from "@kaigilb/gilbplatformcode-relation-role";
import type { RelationDoc } from "./relationDoc";

/** stakeholder-of / has stakeholder. Not a link-plane type. */
export const STAKEHOLDER_RELATION_TYPE = "t:StakeholderOf";

/** authority-of / has authority. A kind of stakeholder-of. One per person per record. */
export const AUTHORITY_RELATION_TYPE = "t:AuthorityOf";

/** Resource-owner-of / has resource owner: the Authority relation's shape, on a Development Resource. */
export const RESOURCE_OWNER_RELATION_TYPE = "t:ResourceOwnerOf";

/** The two role keys, in place of role:source / role:target. */
export const STAKEHOLDER_ROLES = {
  source: "role:referenced-by",
  target: "role:stakeholder",
} as const;

export const STAKEHOLDER_RELATION_FACT = "stakeholder";

export interface LinkedStakeholder {
  relation: string;
  uri: string;
}

function asData(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return null;
    }
  }
  return raw;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function addressTail(id: string): string {
  const s = id.trim();
  const i = s.lastIndexOf("/");
  return i >= 0 && i < s.length - 1 ? s.slice(i + 1) : s;
}

function itemsOf(raw: unknown): unknown[] {
  const data = asData(raw);
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

/** One not-yet-recorded name, the same words the Plan card already shows for a:stakeholders. */
export function stakeholderTagText(item: unknown): string | null {
  if (typeof item === "string") return item.trim() || null;
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  return (
    str(memberValue(o, "unitTag")) ??
    str(memberValue(o, "label")) ??
    str(memberValue(o, "tag")) ??
    (typeof o["@id"] === "string" ? addressTail(o["@id"]) : null)
  );
}

/** Text tags on a:stakeholders. A bare string is one tag. An embedded @id is not a relation. */
export function stakeholderTagTexts(raw: unknown): string[] {
  const data = asData(raw);
  if (typeof data === "string") return data.trim() ? [data.trim()] : [];
  const parts: string[] = [];
  for (const item of itemsOf(raw)) {
    const text = stakeholderTagText(item);
    if (text) parts.push(text);
  }
  return parts;
}

/** The same list, without one tag. Null when nothing remains. Remaining names are text. */
export function stakeholdersWithoutTag(raw: unknown, tag: string): string[] | null {
  const kept = stakeholderTagTexts(raw).filter((t) => t !== tag);
  return kept.length ? kept : null;
}

function isRole(role: string, slug: "referenced-by" | "stakeholder"): boolean {
  return roleIs(role, slug);
}

function sameType(row: RecordRelation, curie: string): boolean {
  return typeLocalName(row.type ?? "") === typeLocalName(curie);
}

/** Rows of `type` where this record is role:referenced-by, and the role:stakeholder member. */
function linksOfType(rows: readonly RecordRelation[] | null | undefined, curie: string): LinkedStakeholder[] {
  const out: LinkedStakeholder[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    if (!sameType(row, curie)) continue;
    if (!isRole(row.role, "referenced-by")) continue;
    const member = row.members?.find((m) => isRole(m.role, "stakeholder"));
    if (!member?.member || seen.has(member.member)) continue;
    seen.add(member.member);
    out.push({ relation: row.relation, uri: member.member });
  }
  return out;
}

/** Plain stakeholder relations. An authority is not in this list. */
export function stakeholdersOf(rows: readonly RecordRelation[] | null | undefined): LinkedStakeholder[] {
  return linksOfType(rows, STAKEHOLDER_RELATION_TYPE);
}

/** Authority relations. The Stakeholder line shows these too, marked. */
export function authoritiesOf(rows: readonly RecordRelation[] | null | undefined): LinkedStakeholder[] {
  return linksOfType(rows, AUTHORITY_RELATION_TYPE);
}

/** Resource Owner relations. Not in the plain stakeholder list. */
export function resourceOwnersOf(rows: readonly RecordRelation[] | null | undefined): LinkedStakeholder[] {
  return linksOfType(rows, RESOURCE_OWNER_RELATION_TYPE);
}

/** Rows where this record is role:referenced-by, and the role:stakeholder member. Plain stakeholders only. */
export function linkedStakeholders(rows: readonly RecordRelation[] | null | undefined): LinkedStakeholder[] {
  return stakeholdersOf(rows);
}

export function sameRecord(a: string, b: string): boolean {
  if (a === b) return true;
  const left = entityRefFromFact(a);
  const right = entityRefFromFact(b);
  return !!left && !!right && left.uri === right.uri;
}

export function alreadyLinked(rows: readonly RecordRelation[] | null | undefined, uri: string): boolean {
  const want = uri.trim();
  return stakeholdersOf(rows).some((s) => sameRecord(s.uri, want));
}

function refId(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    return entityRefFromFact(s)?.uri ?? (s.startsWith("http") ? s : null);
  }
  if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as { "@id"?: unknown })["@id"] === "string") {
    return refId((v as { "@id": string })["@id"]);
  }
  return null;
}

function factRef(facts: Record<string, unknown>, slug: string): string | null {
  if (Object.prototype.hasOwnProperty.call(facts, slug)) {
    const id = refId(facts[slug]);
    if (id) return id;
  }
  const prefixed = `a:${slug}`;
  if (Object.prototype.hasOwnProperty.call(facts, prefixed)) {
    const id = refId(facts[prefixed]);
    if (id) return id;
  }
  if (!Object.prototype.hasOwnProperty.call(facts, slug) && !Object.prototype.hasOwnProperty.call(facts, prefixed)) {
    return refId(memberValue(facts, slug));
  }
  return null;
}

/**
 * The older `a:authorityHolder` (and record-level `a:authorityActsFor`) read as one authority.
 * Absent when the record has no holder.
 */
export function legacyAuthorityOf(
  facts: Record<string, unknown> | null | undefined,
): { holder: string; actsFor: string | null } | null {
  if (!facts) return null;
  const holder = factRef(facts, "authorityHolder");
  if (!holder) return null;
  return { holder, actsFor: factRef(facts, "authorityActsFor") };
}

/** `a:authorityActsFor` on a relation document. Compacted `base:` refs expand from the relation's own URI. */
export function actsForOnRelation(doc: RelationDoc | null | undefined): string | null {
  if (!doc) return null;
  const raw = memberValue(doc.extras, "authorityActsFor");
  const direct = refId(raw);
  if (direct) return direct;
  const compact =
    typeof raw === "string"
      ? raw.trim()
      : raw && typeof raw === "object" && typeof (raw as { "@id"?: unknown })["@id"] === "string"
        ? (raw as { "@id": string })["@id"].trim()
        : "";
  const base = /^(https?:\/\/[^/]+\/(?:base|vault))\/r\//.exec(doc.uri);
  if (base && compact.startsWith("base:")) return `${base[1]}/${compact.slice("base:".length)}`;
  return null;
}

export interface AuthorityWrite {
  recordId: string;
  recordUri: string | null;
  stakeholderUri: string;
  vaultId: string;
  actsFor?: string | null;
  /** The relation type to write. Omitted: `t:AuthorityOf`. A Resource Owner passes {@link RESOURCE_OWNER_RELATION_TYPE}. */
  relationType?: string;
}

/** `@handle` when the loaded record already carries a:tagString. No tag-resolve request. */
export function handleFromFacts(facts: Record<string, unknown> | null | undefined): string | null {
  if (!facts) return null;
  const raw = typeof facts.tagString === "string" ? facts.tagString : memberValue(facts, "tagString");
  if (typeof raw !== "string") return null;
  const tag = raw.trim().replace(/^@+/, "");
  return tag ? `@${tag}` : null;
}
