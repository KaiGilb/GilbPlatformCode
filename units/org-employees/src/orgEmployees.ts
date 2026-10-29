// THE EMPLOYEES LIST of an organization card.
//
// THE READ IS THE VIEWER'S OWN AUTHORISED READ, and nothing more:
//   1. `GET /base/find-by-attribute?attr=a:employer&value={"@id":<the organization record>}` with the viewer's own DPoP
//      credential, asked at the organization's vault host. The grant plane answers ONLY the employment records the
//      viewer may read; a rung (`a:visibilityTier`) can only take reach away there, it never gives any.
//   2. Each employment is read (its `a:employee`, its `a:jobTitle`), then each person's record (name, picture): a
//      person the viewer may not read is ⛔ not listed, ⛔ not counted, and ⛔ not named.
// ⛔ NEVER a find key: this file never calls `/base/connect/find-by-value` (the value plane), and neither `a:employer`
// nor `a:employee` declares `a:networkFindKey`, so nothing here can make an employment findable. ⛔ It never widens a
// rung: it asks no one's rung, it reads what the platform lets this viewer read.
// The trade-off, stated plainly: a stranger with no grant on a person's vault sees no one
// here even when that person marked their employment Public. Under-reach is survivable; the way to over-reach is a find
// key, which the owner has not asked for. This is an open question for the owner.
//
// One person may have two employments at one organization: the person is listed ONCE, with every title.
//
// What else the reader does, and why:
//   • THE PEOPLE COME FROM TWO SOURCES (the spec: "employment OR member-of"): the employments whose `a:employer` names
//     this record, and the people whose own `a:memberOf` names it. Each source pages on its own offset; a person in both is one row.
//   • AN EMPLOYMENT THAT NAMES THE COMPANY ONLY IN TEXT (every employment written before the organization card, and everything older apps
//     write) has no `a:employer` and is ⛔ not listed: matching on a company NAME would count another organization's staff. The card
//     says so (`OrgEmployeesSection`); nothing is written back (no back-fill).
//   • THE TWO ADDRESS SPELLINGS ARE ASKED TOGETHER, the employment source and the member source too.
//   • A PERSON IS READ ONCE, and the picture reference found in that read goes to the row (the row used to read the person
//     a second time for the picture).
//   • A MEMBER-OF HIT IS LISTED ONLY WHEN IT READS AS A PERSON (a Task, a Note and an Event whose
//     member-of named the organization were listed as "12 people"). The test is the card's own, `personKindNamesOf` (stakeholderCard.ts):
//     a stakeholder kind whose master field set has the given-name and family-name terms. What is not a person is not listed and is not
//     "left out" either; when the person kinds cannot be known, no member-of hit is listed and each is counted as left out.
//   • ONE PAGE HOLDS AT MOST `limit` employments: the two address spellings are one list (`pagedFind.ts`).
//   • EVERY FIND IS ASKED AT THE VAULT'S OWN HOST, never the apex (the apex answers "none" with no error for a vault in
//     `base_pods`, which would empty this list silently in production).
import { photoRefFromFacts } from "@kaigilb/gilbplatformcode-photo-term";
import { findByAttribute, type AttributeFindResult, mapWithConcurrency, MAX_PARALLEL_DEREFERENCES, typeLocalName } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { partyNameOf, personKindNamesOf } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import { cardMasterSource, readStakeholderCardVocabulary, readStoredCardVocabulary } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import { masterKindReader } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import { pagedFindBothSpellings } from "./pagedFind";
import { attributeSpelling } from "@kaigilb/gilbplatformcode-term-slots";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import type { OrgEmployeesHost, ReadResource } from "./orgEmployeesHost";
import { refsOf, servedValue } from "./servedValue";

/** Employments asked per page (the platform's cap is 200; a person-sized page keeps the people reads bounded). */
export const EMPLOYEES_PAGE = 50;

export interface OrgEmployee {
  /** The person's record address. */
  person: string;
  /** The person's record id (for the picture and for opening the card). */
  id: string;
  name: string | null;
  /** Every title across this person's employments here, in the order read, each once. */
  titles: string[];
  /** The picture reference found when the person was read (the row does not read the person again), or null. */
  photoRef: string | null;
}

export interface OrgEmployeesPage {
  employees: OrgEmployee[];
  /** The platform's own count of employment records the viewer may read for this organization (all pages). */
  total: number;
  /** The platform's own count of people the viewer may read whose member-of names this organization (all pages). */
  memberTotal: number;
  /** The next page's employment offset (one logical offset over both address spellings), or null when that source has no more. */
  nextOffset: number | null;
  /** The next page's member-of offset, or null when that source has no more. */
  nextMemberOffset: number | null;
  /** The platform's employment counts per address spelling: hand them to the next page's `employmentCounts`. */
  employmentCounts: number[];
  /** The platform's member-of counts per address spelling: hand them to the next page's `memberCounts`. */
  memberCounts: number[];
  /** Employment records of this page that did not read or named a person the viewer may not read: not listed. */
  notListed: number;
}

export interface EmployeesDeps {
  find: (attr: string, value: unknown, page: { limit: number; offset: number }, origin: string) => Promise<AttributeFindResult>;
  readEmployments: (uris: readonly string[], vaultId: string) => Promise<ReadResource[]>;
  readPerson: (id: string, at: string) => Promise<{ facts: Record<string, string>; typeUri?: string | null } | null>;
  /** The member-of attribute. Omitted: this reader asks for employments only (a test double). */
  memberAttr?: () => Promise<string>;
  /** The bare names of the kinds that read as a person (the card's own test), or null when not known. Omitted: every member-of hit counts as not known. */
  personKinds?: () => Promise<readonly string[] | null>;
  /** The spellings a person's picture fact may carry, asked ONCE per page (⛔ never once per person: a request each). Omitted: no picture. */
  photoKeys?: () => Promise<readonly string[]>;
  employerAttr: () => Promise<string>;
  employeeKey: () => Promise<string>;
  jobTitleKey: () => Promise<string>;
}

const defaultDepsOf = (host: OrgEmployeesHost): EmployeesDeps => ({
  find: (attr, value, page, origin) => findByAttribute(attr, value, page, origin),
  readEmployments: (uris, vaultId) => host.readResources(uris, vaultId),
  readPerson: (id, at) => readRecord(id, at),
  memberAttr: async () => {
    const k = await attributeSpelling("memberOf");
    if (!k) throw new Error("The ontology did not name a/memberOf, so the people who are members cannot be read right now.");
    return `a:${k.replace(/^a:/, "")}`;
  },
  photoKeys: () => host.photoReadKeys(),
  personKinds: () => sessionPersonKinds(),
  employerAttr: async () => (await host.resolveEmploymentLinkVocab()).employer,
  employeeKey: async () => (await host.resolveEmploymentLinkVocab()).employee.replace(/^a:/, ""),
  jobTitleKey: async () => {
    const k = await attributeSpelling("jobTitle");
    if (!k) throw new Error("The ontology did not name a/jobTitle, so titles cannot be read right now.");
    return k;
  },
});

let personKindsRead: Promise<readonly string[] | null> | null = null;
/** The person kinds of the session: the card's vocabulary reading kept on this device first, else read once from the master. */
function sessionPersonKinds(): Promise<readonly string[] | null> {
  personKindsRead ??= (async () => {
    const stored = readStoredCardVocabulary();
    const known = stored ? personKindNamesOf(stored) : null;
    if (known) return known;
    // The page's shared kind reader (M3c round 2): a warm device sends no kind read for this.
    return personKindNamesOf(await readStakeholderCardVocabulary(cardMasterSource(), masterKindReader()));
  })().catch(() => {
    personKindsRead = null;
    return null;
  });
  return personKindsRead;
}

/** Test seam — ⛔ never called by product code. */
export function __resetPersonKinds(): void {
  personKindsRead = null;
}

const sameEntity = (a: string, b: string) => idFromResourceUri(a) === idFromResourceUri(b);

const NONE = { ids: [] as string[], total: 0, counts: [] as number[], next: null as number | null };

/**
 * The employees of one organization record, one page, as THIS viewer may read them. Throws on a failed find (⛔ never "no employees").
 * `offset` pages the employments and `memberOffset` the member-of people, each ONE logical offset over the two address spellings;
 * `null` says that source is finished and is not asked; `employmentCounts` / `memberCounts` are the counts the previous page returned.
 */
export async function readOrgEmployeesPage(
  host: OrgEmployeesHost,
  org: string,
  vaultId: string,
  page: { offset?: number | null; memberOffset?: number | null; employmentCounts?: readonly number[]; memberCounts?: readonly number[]; limit?: number } = {},
  deps: EmployeesDeps = defaultDepsOf(host),
): Promise<OrgEmployeesPage> {
  const empOffset = page.offset === undefined ? 0 : page.offset;
  const memberOffset = page.memberOffset === undefined ? 0 : page.memberOffset;
  const limit = page.limit ?? EMPLOYEES_PAGE;
  // Started now, awaited only where they are needed: nothing waits for them before the finds go out.
  const photoKeysP: Promise<readonly string[] | null> = deps.photoKeys ? deps.photoKeys().catch(() => null) : Promise.resolve(null);
  const personKindsP: Promise<readonly string[] | null> = deps.personKinds ? deps.personKinds().catch(() => null) : Promise.resolve(null);
  const [attr, employeeKey, titleKey, memberAttr] = await Promise.all([
    deps.employerAttr(),
    deps.employeeKey(),
    deps.jobTitleKey(),
    deps.memberAttr && memberOffset !== null ? deps.memberAttr() : Promise.resolve(null),
  ]);
  const origin = vaultOriginOf(vaultId);
  const [emp, mem] = await Promise.all([
    empOffset === null ? Promise.resolve(NONE) : pagedFindBothSpellings(deps.find, attr, org, { offset: empOffset, limit, counts: page.employmentCounts }, origin),
    memberAttr === null || memberOffset === null ? Promise.resolve(NONE) : pagedFindBothSpellings(deps.find, memberAttr, org, { offset: memberOffset, limit, counts: page.memberCounts }, origin),
  ]);
  // ONE page holds at most `limit` records ACROSS BOTH SOURCES. Each source's ids come back with their own limit (ids
  // only, cheap), but only `limit` records are READ: the employments take at least half the page, the member-of people the rest, and either takes the whole
  // page when the other has run out. A source's next offset is what it consumed, so nothing is skipped or read twice, and the member-of people are not
  // starved behind a long run of employments (a page of 10 reads 5 and 5, a page of 50 reads 25 and 25).
  const half = Math.ceil(limit / 2);
  const takeEmp = Math.min(emp.ids.length, Math.max(half, limit - mem.ids.length));
  const takeMem = Math.min(mem.ids.length, limit - takeEmp);
  const empIds = emp.ids.slice(0, takeEmp);
  const memIds = mem.ids.slice(0, takeMem);
  const nextAfter = (offset: number | null, taken: number, src: { ids: string[]; total: number }): number | null =>
    offset === null || src.ids.length === 0 ? null : offset + taken < src.total ? offset + taken : null;
  const empNext = nextAfter(empOffset, takeEmp, emp);
  const memNext = nextAfter(memberOffset, takeMem, mem);
  const docs = await deps.readEmployments(empIds, vaultId);
  const byPerson = new Map<string, OrgEmployee & { read: boolean; viaMember: boolean }>();
  let notListed = 0;
  const wanted: { person: string; titles: string[] }[] = [];
  for (const d of docs) {
    // A record deleted since the find, or served with nothing: not listed (⛔ not a person).
    if (d.gone || Object.keys(d.doc).length === 0) {
      notListed++;
      continue;
    }
    // Defensive: the platform's find matched the employer; an employment that names another organization is not this list's.
    const employers = refsOf(servedValue(d.doc, attr.replace(/^a:/, "")));
    if (employers.length > 0 && !employers.some((e) => sameEntity(e, org))) {
      notListed++;
      continue;
    }
    const people = refsOf(servedValue(d.doc, employeeKey));
    if (people.length !== 1) {
      notListed++;
      continue;
    }
    const titles = refsOf(servedValue(d.doc, titleKey)).filter((t) => t !== "");
    wanted.push({ person: people[0]!, titles });
  }
  for (const w of wanted) {
    const key = idFromResourceUri(w.person);
    const had = byPerson.get(key);
    if (had) {
      for (const t of w.titles) if (!had.titles.includes(t)) had.titles.push(t);
    } else byPerson.set(key, { person: w.person, id: key, name: null, titles: [...new Set(w.titles)], photoRef: null, read: false, viaMember: false });
  }
  // The people whose own member-of names this organization: the find answered the person's record itself.
  for (const uri of memIds) {
    const key = idFromResourceUri(uri);
    if (!byPerson.has(key)) byPerson.set(key, { person: uri, id: key, name: null, titles: [], photoRef: null, read: false, viaMember: true });
  }
  const people = [...byPerson.values()];
  const photoKeys = await photoKeysP;
  const personKinds = await personKindsP;
  const notPeople = new Set<string>();
  await mapWithConcurrency(people, MAX_PARALLEL_DEREFERENCES, async (p) => {
    try {
      const rec = await deps.readPerson(p.id, p.person);
      if (rec) {
        // A member-of hit is listed only when it reads as a person. A Task, a Note, an Event, a sub-organization: not a person, not listed,
        // not "left out". When the person kinds are not known, nothing member-of is listed and each is left out (said, ⛔ not guessed).
        if (p.viaMember) {
          if (personKinds === null) return;
          if (!personKinds.includes(typeLocalName(rec.typeUri ?? ""))) {
            notPeople.add(p.id);
            return;
          }
        }
        p.read = true;
        p.name = partyNameOf(rec.facts, null) ?? (`${rec.facts.givenName ?? ""} ${rec.facts.familyName ?? ""}`.trim() || null);
        p.photoRef = photoKeys ? ((photoRefFromFacts(rec.facts, { readKeys: photoKeys }) as string | null) ?? null) : null;
      }
    } catch {
      /* not readable by this viewer: not listed */
    }
  });
  const listed = people.filter((p) => p.read);
  notListed += people.length - listed.length - notPeople.size;
  listed.sort((a, b) => (a.name ?? "~").localeCompare(b.name ?? "~"));
  return {
    employees: listed.map(({ read: _r, viaMember: _m, ...e }) => e),
    total: emp.total,
    memberTotal: mem.total,
    nextOffset: empNext,
    nextMemberOffset: memNext,
    employmentCounts: emp.counts,
    memberCounts: mem.counts,
    notListed,
  };
}
