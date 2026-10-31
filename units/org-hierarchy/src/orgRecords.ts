// Reading ONE organization record (name, logo, parent) and finding organization
// RECORDS to choose from. The organization is a stakeholder record (`t:Organization`) the holder keeps in their own
// vault; this is ⛔ not the org-VAULT finder (`GET /base/connect/org-find`, which finds group vaults).
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { partyNameOf } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import { listVaultRecordsPage, searchEntities, mapWithConcurrency, MAX_PARALLEL_DEREFERENCES, typeLocalName } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { inVault } from "@kaigilb/gilbplatformcode-org-employees";
import type { OrgRecordHit } from "@kaigilb/gilbplatformcode-record-picker";
import { refsOf, resolveOrgTerms, servedValue } from "@kaigilb/gilbplatformcode-org-terms";
import type { ParentReader } from "./orgHierarchy";

/** The type of an organization record: the master's `t/Organization` (as `CompanySearch`'s own constant). */
export function organizationTypeUri(): string {
  return `${termOrigin().replace(/\/+$/, "")}/base/t/Organization`;
}
function organizationTypeName(): string {
  return typeLocalName(organizationTypeUri());
}

export type OrgRead =
  | { state: "ok"; uri: string; name: string | null; logo: string | null; parent: string | null; parentCount: number }
  | { state: "unreadable" };

/** Read one organization record as the viewer may read it. A record not served to the viewer is `unreadable`, ⛔ never "empty". */
export async function readOrganization(uri: string, read: (id: string, at: string | null) => Promise<{ facts: Record<string, string>; served?: { facts?: Record<string, unknown> } } | null> = readRecord): Promise<OrgRead> {
  let rec: Awaited<ReturnType<typeof read>>;
  try {
    rec = await read(idFromResourceUri(uri), uri);
  } catch {
    return { state: "unreadable" };
  }
  if (!rec) return { state: "unreadable" };
  const terms = await resolveOrgTerms();
  const doc = (rec.served?.facts as Record<string, unknown> | undefined) ?? (rec.facts as Record<string, unknown>);
  const parents = refsOf(servedValue(doc, terms.parentOrganization));
  const logos = refsOf(servedValue(doc, terms.logo));
  return {
    state: "ok",
    uri,
    name: partyNameOf(rec.facts, null),
    logo: logos[0] ?? null,
    parent: parents[0] ?? null,
    parentCount: parents.length,
  };
}

/**
 * The reader `walkUp` and `checkParentWrite` are handed. ⛔ A record that holds MORE THAN ONE parent is `unreadable` here
 * (the term is single; two values mean a writer broke it, and which one is "the" parent is not known): the chain shows
 * "not visible" and the writer refuses, ⛔ never one of them taken.
 */
export function organizationParentReader(read?: Parameters<typeof readOrganization>[1]): ParentReader {
  return async (uri) => {
    const r = await readOrganization(uri, read);
    if (r.state !== "ok" || r.parentCount > 1) return { state: "unreadable" };
    return { state: "ok", parent: r.parent, label: r.name };
  };
}

/**
 * The organization records the holder keeps in ONE vault, matched to `text`.
 *
 * TYPED text is matched by the SERVER, one typed search (`/base/search`, type Organization, prefix
 * match, asked at the vault): the old walk read the vault's whole organization list a page at a time on every keystroke (19 serial
 * requests, a hard stop at 400 records, so organization 401 onward could never be chosen). Now only the hits are read for their names.
 * The match is from the START of a word in the name ("nord" finds "Nordlys Holding", "lys" does not). `complete: false` when the
 * search said it has another page, or no more could be known: the hits are then a floor, ⛔ never "no such organization".
 * With NO text typed, ONE page of the list (the most recent records) is offered, and it says it is not the whole list.
 * Only the named vault's OWN records are offered (a reference to a record in another vault would not resolve here), as
 * `findCandidates` of the stakeholders package does.
 */
export async function findOrganizationRecords(
  vaultId: string,
  text: string,
  opts: {
    maxPages?: number;
    list?: typeof listVaultRecordsPage;
    search?: typeof searchEntities;
    read?: (id: string, at: string | null) => Promise<{ facts: Record<string, string>; typeUri?: string | null } | null>;
  } = {},
): Promise<{ hits: OrgRecordHit[]; complete: boolean }> {
  const needle = text.trim();
  if (needle !== "") return findByTypedSearch(vaultId, needle, opts.search ?? searchEntities, opts.read ?? readRecord);
  const list = opts.list ?? listVaultRecordsPage;
  const hits: OrgRecordHit[] = [];
  let offset = 0;
  let complete = false;
  for (let n = 0; n < (opts.maxPages ?? 1); n++) {
    const page = await list(vaultId, [organizationTypeName()], offset);
    for (const r of page.records) {
      const uri = r.entityUri ?? "";
      const label = (r.label ?? "").trim();
      if (!uri || !label || !inVault(uri, vaultId)) continue;
      if (typeLocalName(r.typeUri) !== organizationTypeName()) continue;
      hits.push({ uri, label });
    }
    if (page.complete) {
      complete = true;
      break;
    }
    const served = page.served ?? page.records.length;
    if (served === 0) break;
    offset += served;
  }
  hits.sort((a, b) => a.label.localeCompare(b.label));
  return { hits, complete };
}

async function findByTypedSearch(
  vaultId: string,
  needle: string,
  search: typeof searchEntities,
  read: (id: string, at: string | null) => Promise<{ facts: Record<string, string>; typeUri?: string | null } | null>,
): Promise<{ hits: OrgRecordHit[]; complete: boolean }> {
  const found = await search(needle, [organizationTypeName()], undefined, vaultId, "prefix");
  const uris = [...new Set(found.ids)].filter((u) => inVault(u, vaultId));
  // A hit the search named but the viewer could not read (a failed read, or a record not served) is not offered, and it is not
  // nothing: the answer then says it is not complete, ⛔ never "no such organization".
  const unread = Symbol("unread");
  const rows = await mapWithConcurrency(uris, MAX_PARALLEL_DEREFERENCES, async (uri) => {
    try {
      const rec = await read(idFromResourceUri(uri), uri);
      if (!rec) return unread;
      if (typeLocalName(rec.typeUri ?? "") !== organizationTypeName()) return null;
      const label = (partyNameOf(rec.facts, null) ?? "").trim();
      return label ? { uri, label } : null;
    } catch {
      return unread;
    }
  });
  const hits = rows.filter((r): r is OrgRecordHit => r !== null && r !== unread).sort((a, b) => a.label.localeCompare(b.label));
  return { hits, complete: found.next === null && !rows.includes(unread) };
}
