// The UNITS directly below an organization ("address hierarchy from headquarters, to subs"): "Setting the parent writes to the child's side only;
// seeing the children is a read of 'who points here' and widens nobody's rung."
//   `GET /base/find-by-attribute?attr=a:parentOrganization&value={"@id":<this organization>}`: the child records THIS
//   viewer may read, at the vault host. One find per level. ⛔ Never a find key (the term declares none), nothing is
//   copied to the parent. A child the viewer may not read is not listed.
// Each unit shows its name, its logo and its employment count WHERE VISIBLE: the count is the employer find's own `total`
// for that unit (the employment records this viewer may read); a failed count is "not known", never 0.
//
// THE PAGE DOES NOT COUNT. A page is the unit records only (one parent find, and one record read per unit); a unit's count is its own read, `readUnitEmployments`, asked LAZILY and ONLY
// for the ten rows the card shows (two finds a unit: both address spellings), never for the rows of the full list. A 200-unit organization used to pay 50 units
// x (1 record read + 2 count finds) on its first page.
//
// The count asks BOTH address spellings of the unit (an employment naming the unit under the
// other spelling was listed in the unit's own Employees group but not counted here), the two spellings are asked TOGETHER, and
// the count is of EMPLOYMENT RECORDS, so the row says "N employments", not "N employees" (counting distinct people would
// read every employment and every person of every unit, about five times the requests of this page). Every find is asked at the
// vault's own host.
import { findByAttribute, type AttributeFindResult, mapWithConcurrency, MAX_PARALLEL_DEREFERENCES } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { subjectSpellings, pagedFindBothSpellings } from "@kaigilb/gilbplatformcode-org-employees";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import { resolveEmploymentLinkVocab, resolveOrgTerms } from "@kaigilb/gilbplatformcode-org-terms";
import { readOrganization, type OrgRead } from "./orgRecords";

export const UNITS_PAGE = 50;

export interface OrgUnit {
  uri: string;
  id: string;
  name: string | null;
  /** The logo's address (a `t:ImageFile` in the unit's vault), or null. */
  logo: string | null;
}

export interface OrgUnitsPage {
  units: OrgUnit[];
  total: number;
  /** The platform's parent-find counts per address spelling: hand them to the next page's `counts`. */
  counts: number[];
  nextOffset: number | null;
  /** Records the find named that did not read for this viewer (not listed). */
  notListed: number;
}

export interface UnitsDeps {
  find: (attr: string, value: unknown, page: { limit: number; offset: number }, origin: string) => Promise<AttributeFindResult>;
  readOrg: (uri: string) => Promise<OrgRead>;
  parentAttr: () => Promise<string>;
  employerAttr: () => Promise<string>;
}

const defaultDeps: UnitsDeps = {
  find: (attr, value, page, origin) => findByAttribute(attr, value, page, origin),
  readOrg: (uri) => readOrganization(uri),
  parentAttr: async () => `a:${(await resolveOrgTerms()).parentOrganization}`,
  employerAttr: async () => (await resolveEmploymentLinkVocab()).employer,
};

export async function readOrgUnitsPage(
  org: string,
  vaultId: string,
  page: { offset?: number; limit?: number; counts?: readonly number[] } = {},
  deps: UnitsDeps = defaultDeps,
): Promise<OrgUnitsPage> {
  const offset = page.offset ?? 0;
  const limit = page.limit ?? UNITS_PAGE;
  const parentAttr = await deps.parentAttr();
  const origin = vaultOriginOf(vaultId);
  // One page holds at most `limit` units over the two address spellings (`pagedFindBothSpellings`).
  const found = await pagedFindBothSpellings(deps.find, parentAttr, org, { offset, limit, counts: page.counts }, origin);
  const ids = found.ids;
  let notListed = 0;
  const rows = await mapWithConcurrency(ids, MAX_PARALLEL_DEREFERENCES, async (uri): Promise<OrgUnit | null> => {
    const read = await deps.readOrg(uri);
    if (read.state !== "ok") return null;
    return { uri, id: idFromResourceUri(uri), name: read.name, logo: read.logo };
  });
  const units = rows.filter((r): r is OrgUnit => r !== null);
  notListed = rows.length - units.length;
  units.sort((a, b) => (a.name ?? "~").localeCompare(b.name ?? "~"));
  return { units, total: found.total, counts: found.counts, nextOffset: found.next, notListed };
}

/**
 * The employment records the viewer may read at ONE unit, under either address spelling (asked together); null when either find failed (not 0).
 * Asked lazily by the card for the rows it shows, ⛔ never by `readOrgUnitsPage`.
 */
export async function readUnitEmployments(uri: string, vaultId: string, deps: UnitsDeps = defaultDeps): Promise<number | null> {
  try {
    const employerAttr = await deps.employerAttr();
    const origin = vaultOriginOf(vaultId);
    const counts = await Promise.all(subjectSpellings(uri).map((spelling) => deps.find(employerAttr, { "@id": spelling }, { limit: 1, offset: 0 }, origin)));
    return counts.reduce((n, r) => n + r.count, 0);
  } catch {
    return null;
  }
}
