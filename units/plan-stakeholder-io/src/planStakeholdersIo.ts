// Stakeholders on a Plan card, the part that reads and writes: the finds that turn a name into records across the held vaults, and the writes
// of an Authority relation. The text of a stakeholder tag, the relation rows and the Authority rules are `plan-stakeholders-model`.

import { endRelation, memberEntityUri, writePairRelation } from "@kaigilb/gilbplatformcode-lws-relations";
import { readRecord, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { listVaultRecordsPage, searchEntities, typeLocalName } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import {
  AUTHORITY_RELATION_TYPE,
  STAKEHOLDER_RELATION_FACT,
  STAKEHOLDER_ROLES,
  authoritiesOf,
  legacyAuthorityOf,
  sameRecord,
  type AuthorityWrite,
} from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import { entityDisplayName, searchVaults, type PlanSearchHit } from "@kaigilb/gilbplatformcode-record-cache-kit";
import type { OrgRecordHit } from "@kaigilb/gilbplatformcode-record-picker";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";

function authorityFacts(actsFor?: string | null): Record<string, unknown> {
  const extra: Record<string, unknown> = { "a:relationType": STAKEHOLDER_RELATION_FACT };
  const id = actsFor?.trim();
  if (id) extra["a:authorityActsFor"] = { "@id": id };
  return extra;
}

/** One `t:AuthorityOf`. No `role:source` / `role:target`. Acts-for only when given. */
export async function writeAuthorityRelation(input: AuthorityWrite): Promise<RecordRelation> {
  const stakeholder = input.stakeholderUri.startsWith("http")
    ? input.stakeholderUri
    : memberEntityUri(input.stakeholderUri, null, input.vaultId);
  const recordUri =
    input.recordUri && (input.recordUri.startsWith("http://") || input.recordUri.startsWith("https://"))
      ? input.recordUri
      : memberEntityUri(input.recordId, input.recordUri, input.vaultId);
  const written = await writePairRelation({
    sourceId: input.recordId,
    targetId: stakeholder,
    sourceEntityUri: recordUri,
    targetEntityUri: stakeholder,
    typeCurie: input.relationType ?? AUTHORITY_RELATION_TYPE,
    roles: { source: STAKEHOLDER_ROLES.source, target: STAKEHOLDER_ROLES.target },
    extraFacts: authorityFacts(input.actsFor),
    vaultNamespace: input.vaultId,
  });
  return {
    relation: written.uri || written.id,
    role: STAKEHOLDER_ROLES.source,
    type: input.relationType ?? AUTHORITY_RELATION_TYPE,
    members: [{ member: stakeholder, role: STAKEHOLDER_ROLES.target }],
  };
}

/**
 * End `endId`, then write `t:AuthorityOf`. That order is the batch's: the writer can
 * also update a relation in place (`relationId` on `writePairRelation`), and this does not.
 */
export async function endThenWriteAuthority(endId: string, input: AuthorityWrite): Promise<RecordRelation> {
  await endRelation(endId, input.vaultId);
  return writeAuthorityRelation(input);
}

/**
 * The next save of a record that still has `a:authorityHolder`.
 * Writes the relation when this person is not already an authority, then the caller retracts both record keys.
 */
export async function migratedAuthorityRelation(
  row: { id: string; entityUri?: string | null; facts?: Record<string, string>; served?: { facts?: Record<string, unknown> } },
  vaultId: string,
  relations: readonly RecordRelation[] | null | undefined,
): Promise<{ relation: RecordRelation | null } | null> {
  const served = row.served?.facts;
  const legacy = legacyAuthorityOf(served ?? null) ?? legacyAuthorityOf((row.facts ?? null) as Record<string, unknown> | null);
  if (!legacy) return null;
  const already = authoritiesOf(relations).some((a) => sameRecord(a.uri, legacy.holder));
  if (already) return { relation: null };
  const relation = await writeAuthorityRelation({
    recordId: row.id,
    recordUri: row.entityUri ?? null,
    stakeholderUri: legacy.holder,
    vaultId,
    actsFor: legacy.actsFor,
  });
  return { relation };
}

type ReadFn = (id: string, at: string | null) => Promise<{ facts: Record<string, string>; entityUri?: string; typeUri?: string | null } | null>;

export type StakeholderFind = {
  hits: OrgRecordHit[];
  complete: boolean;
  /** A vault's search or list failed. The other vaults' hits are still returned. */
  vaultsMissed: boolean;
};

/** The stakeholder label: the display name, or nothing. A plan hit may fall back to its tag; this one does not. */
function orgHit(row: BaseRecord, uri: string, id: string): PlanSearchHit | null {
  const entityUri = row.entityUri || uri;
  const label = entityDisplayName(row.facts, { entityUri, fallback: "" }).trim();
  if (!entityUri || !label) return null;
  return { uri: entityUri, id: row.id || id, label, tag: "", typeName: typeLocalName(row.typeUri ?? ""), row };
}

function asOrgHits(hits: readonly PlanSearchHit[]): OrgRecordHit[] {
  return hits.map((hit) => ({ uri: hit.uri, label: hit.label, ...(hit.typeName ? { typeName: hit.typeName } : {}) }));
}

/**
 * Stakeholder records whose name matches `text`, across every held vault.
 * Typed by the master's stakeholder kind names (`STAKEHOLDER_TYPE_SET_QUERY`). An empty
 * kind list is not "none exist". A Note the search happens to return is dropped.
 * `complete` only when every vault's page said `next == null`, and the reads were whole (no id past the cap, none unread).
 */
export async function findStakeholderRecords(
  vaultIds: readonly string[],
  typeNames: readonly string[],
  text: string,
  opts: {
    search?: typeof searchEntities;
    read?: ReadFn;
    list?: typeof listVaultRecordsPage;
  } = {},
): Promise<StakeholderFind> {
  const names = [...new Set(typeNames.map((n) => n.trim()).filter(Boolean))];
  const vaults = [...new Set(vaultIds.map((v) => v.trim()).filter(Boolean))];
  if (names.length === 0 || vaults.length === 0) return { hits: [], complete: false, vaultsMissed: false };
  const search = opts.search ?? searchEntities;
  const read = opts.read ?? readRecord;
  const needle = text.trim();
  if (needle) {
    const page = await searchVaults(vaults, needle, names, { search, read: read as (id: string, at: string | null) => Promise<BaseRecord | null>, toHit: orgHit });
    return { hits: asOrgHits(page.hits), complete: page.complete, vaultsMissed: page.vaultsMissed };
  }
  const list = opts.list ?? listVaultRecordsPage;
  const pages = await Promise.all(
    vaults.map(async (vaultId) => {
      try {
        return { ok: true as const, page: await list(vaultId, names, 0) };
      } catch {
        return { ok: false as const };
      }
    }),
  );
  let complete = true;
  let vaultsMissed = false;
  const hits: OrgRecordHit[] = [];
  const seen = new Set<string>();
  for (const item of pages) {
    if (!item.ok) {
      vaultsMissed = true;
      complete = false;
      continue;
    }
    if (!item.page.complete) complete = false;
    for (const r of item.page.records) {
      const uri = r.entityUri ?? "";
      const label = (r.label ?? "").trim();
      if (!uri || !label || seen.has(uri)) continue;
      const typeName = typeLocalName(r.typeUri);
      if (!names.includes(typeName)) continue;
      seen.add(uri);
      hits.push({ uri, label, ...(typeName ? { typeName } : {}) });
    }
  }
  hits.sort((a, b) => a.label.localeCompare(b.label) || a.uri.localeCompare(b.uri));
  return { hits, complete, vaultsMissed };
}

/** Any record in the held vaults (authority acts-for). Untyped Find: an empty type list returns nothing. */
export async function findAnyRecords(
  vaultIds: readonly string[],
  text: string,
  opts: {
    search?: typeof searchEntities;
    read?: ReadFn;
    list?: typeof listVaultRecordsPage;
  } = {},
): Promise<StakeholderFind> {
  const vaults = [...new Set(vaultIds.map((v) => v.trim()).filter(Boolean))];
  if (vaults.length === 0) return { hits: [], complete: false, vaultsMissed: false };
  const search = opts.search ?? searchEntities;
  const read = opts.read ?? readRecord;
  const needle = text.trim();
  if (needle) {
    const page = await searchVaults(vaults, needle, null, { search, read: read as (id: string, at: string | null) => Promise<BaseRecord | null>, toHit: orgHit });
    return { hits: asOrgHits(page.hits), complete: page.complete, vaultsMissed: page.vaultsMissed };
  }
  const list = opts.list ?? listVaultRecordsPage;
  const pages = await Promise.all(
    vaults.map(async (vaultId) => {
      try {
        return { ok: true as const, page: await list(vaultId, [], 0) };
      } catch {
        return { ok: false as const };
      }
    }),
  );
  let complete = true;
  let vaultsMissed = false;
  const hits: OrgRecordHit[] = [];
  const seen = new Set<string>();
  for (const item of pages) {
    if (!item.ok) {
      vaultsMissed = true;
      complete = false;
      continue;
    }
    if (!item.page.complete) complete = false;
    for (const r of item.page.records) {
      const uri = r.entityUri ?? "";
      const label = (r.label ?? "").trim();
      if (!uri || !label || seen.has(uri)) continue;
      seen.add(uri);
      hits.push({ uri, label });
    }
  }
  hits.sort((a, b) => a.label.localeCompare(b.label) || a.uri.localeCompare(b.uri));
  return { hits, complete, vaultsMissed };
}
