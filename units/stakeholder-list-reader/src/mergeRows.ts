/**
 * One list of all stakeholders: the people the holder placed and the holder's local records, one row per person.
 *
 * JOINING, ⛔ NEVER BY NAME. A record joins a placed person only through hard identity: its `a:sameAs`, already resolved by the
 * caller through the resolver (`online-card-anchor`, redirects followed) to a principal, equal in canonical form to the
 * principal of a member of the four sets. The canonical form is the caller's answer (the reader's kept answers: an opaque
 * member's own, else `createPrincipalCanonicaliser`'s); this module only trims a principal string, never rewrites it.
 * A record's title is carried, never compared.
 *
 * ROWS.
 *   self    the holder's own card: one row, first, keyed to the holder's principal. The card `findOwnCard` named is its record;
 *           any other owner card id, or a record that links the holder, joins it ("also N more"). Never listed as a contact.
 *   both    a placed person with at least one record linked to them.
 *   record  a record with no placed person: unlinked (keyed to its record id) or linked to someone not placed (keyed to them).
 *   placed  a placed person with no record. Group vaults in the sets are passed through here; the ruling on who is a person comes from the
 *           name read, never from a URL shape.
 * Two records linked to one person are one row; the others count in `alsoRecords`. Nothing is merged on disk.
 * One record id given twice: the copy shown is the first by (vaultId, title, link, type); copies naming DIFFERENT people join nobody.
 * A canonicaliser that throws reads that principal as "not known" (its own string); the rest of the list is kept.
 *
 * KINDS. Every stakeholder kind comes in as a record with its type, as the door lists it
 * (a type the master's `t/Stakeholder` `a:playableBy` names, or one below it: read by the caller, ⛔ never listed here). The type is
 * carried to the row (`recordType`) for its picture shape and its kind word. ⛔ It is never compared to join rows: a company or a
 * system joins nobody by its title or its type, and a record whose link resolves to an organization stays a record row.
 *
 * ORDER (for now): self, both, record, placed; within a group by key (code-unit order, not locale). A sort by name is not done here.
 *
 * Pure: no request, no React, no app import. O(n log n) in people + records.
 */
import { ATOMIC_PLACEMENTS, placementKey, type AtomicPlacement, type ConnectedPerson } from "@kaigilb/gilbplatformcode-person-connections";

/** One of the holder's local records, as the list reader has it. */
export interface StakeholderRecordInput {
  /** The record's absolute entity address. */
  recordId: string;
  /** The vault that holds it. */
  vaultId: string;
  /** The record's title as stored, or null. Shown, ⛔ never compared. */
  title: string | null;
  /**
   * The record's type as the door lists it: a stakeholder kind, e.g. Person, Organization, Software System or a type
   * below one. Absent or blank: not known (null on the row, ⛔ never guessed). Shown and decides the picture shape; ⛔ never joins.
   */
  type?: string | null;
  /**
   * The principal the record's `a:sameAs` names today, as the resolver answered (a PERSON answer only), or null:
   * no link, an organization or group, or not resolved.
   */
  link: string | null;
}

/**
 * The holder: their principal (`ConnectionsReading.holder`) and their owner card ids (`findOwnCard`'s card first, then the others).
 * A card id may be the entity address or the `/lws/r/<id>` form: both name one card ({@link entityKey}).
 */
export interface StakeholderSelf {
  principal: string;
  cardIds: string[];
}

export interface MergeRowsInput {
  /** The people the holder placed (`readConnections(...).people`). */
  people: readonly ConnectedPerson[];
  /** The holder's local records, each with its resolved link. */
  records: readonly StakeholderRecordInput[];
  self: StakeholderSelf;
  /**
   * A principal -> today's canonical principal, synchronous (the caller's kept canonicaliser answers). An empty answer means
   * "not known" and the stored string is used as it is.
   */
  canonical: (principal: string) => string;
}

export type StakeholderRowKind = "self" | "both" | "record" | "placed";

export interface StakeholderRow {
  /** The canonical principal when the row has one, else the record id. ⛔ Never a name. */
  key: string;
  kind: StakeholderRowKind;
  principal: string | null;
  /** The row's record (for several, the first by record id; for self, the card `findOwnCard` named), or null. */
  recordId: string | null;
  /** The vault of `recordId`, or null when that record was not among the records given. */
  vaultId: string | null;
  /** Every atomic placement the holder made for this person, in display order; `[]` when not placed. */
  placements: AtomicPlacement[];
  /** The title of `recordId`, or null. */
  title: string | null;
  /** The type of `recordId`, or null: no record (a placed-only row is always a person) or a record with no type. */
  recordType: string | null;
  /** How many more records (or owner cards, on the self row) belong to this person besides `recordId`. */
  alsoRecords: number;
}

const KIND_RANK: Record<StakeholderRowKind, number> = { self: 0, both: 1, record: 2, placed: 3 };

interface PersonGroup {
  principal: string;
  placements: Set<string>;
  records: StakeholderRecordInput[];
}

/**
 * Merge the placed people and the local records into one list, one row per person.
 *
 * @param input the people, the records with their resolved links, the holder, and the canonical form
 * @returns the rows, the holder's own row first, in the stable order above
 */
export function mergeStakeholderRows(input: MergeRowsInput): StakeholderRow[] {
  const canon = (p: string): string => {
    const raw = p.trim();
    // A canonicaliser that throws is a failure to ask about THIS member, never a reason to lose the
    // list. The member is read as "unknown" (its own string, exact matches still join) and every other row is kept.
    let c: unknown;
    try {
      c = input.canonical(raw);
    } catch {
      c = "";
    }
    return typeof c === "string" && c.trim() ? c.trim() : raw;
  };

  const selfKey = input.self.principal.trim() ? canon(input.self.principal) : "";
  // An owner card id may come in the `/lws/r/<id>` form (a create's Location) or as the entity
  // address; both name one card. They are compared by `entityKey` (host + id), so either form is the self row's card.
  const ownerIds = [...new Set(input.self.cardIds.map((id) => id.trim()).filter(Boolean))];
  const ownerKeys = new Set(ownerIds.map(entityKey));

  const groups = new Map<string, PersonGroup>();
  const group = (key: string): PersonGroup => {
    let g = groups.get(key);
    if (!g) {
      g = { principal: key, placements: new Set(), records: [] };
      groups.set(key, g);
    }
    return g;
  };

  for (const p of input.people) {
    if (typeof p.principal !== "string" || !p.principal.trim()) continue;
    const g = group(canon(p.principal));
    for (const pl of p.placements) g.placements.add(placementKey(pl));
  }

  const selfRecords: StakeholderRecordInput[] = [];
  const unlinked: StakeholderRecordInput[] = [];
  const seen = new Map<string, StakeholderRecordInput>();
  for (const [id, copies] of copiesById(input.records)) {
    // One record id given more than once is decided by a rule, never by input order.
    // The copy shown is the first by (vaultId, title, link, type). The link is the one person all copies that name someone agree
    // on; copies naming DIFFERENT people contradict each other (the link is single-valued), so no person is chosen and the
    // record stays an unlinked record row, as `readLink` answers "ambiguous" for two references.
    const r = copies[0]!;
    seen.set(id, r);
    if (ownerKeys.has(entityKey(id))) {
      selfRecords.push(r);
      continue;
    }
    const links = new Set(copies.map((c) => (typeof c.link === "string" && c.link.trim() ? canon(c.link) : "")).filter(Boolean));
    const link = links.size === 1 ? [...links][0]! : "";
    if (!link) unlinked.push(r);
    else if (selfKey && link === selfKey) selfRecords.push(r);
    else group(link).records.push(r);
  }

  const rows: StakeholderRow[] = [];

  // The holder's own row: always there, first.
  const selfGroup = selfKey ? groups.get(selfKey) : undefined;
  if (selfKey) groups.delete(selfKey);
  // An owner card id is replaced by the record id it names when that record is in the list: the entity address wins.
  const recordByKey = new Map([...seen.keys()].map((id) => [entityKey(id), id]));
  const selfIds: string[] = [];
  for (const id of ownerIds) {
    const asRecord = recordByKey.get(entityKey(id)) ?? id;
    if (!selfIds.some((s) => entityKey(s) === entityKey(asRecord))) selfIds.push(asRecord);
  }
  for (const r of [...selfRecords].sort(byRecord)) if (!selfIds.some((s) => entityKey(s) === entityKey(r.recordId))) selfIds.push(r.recordId.trim());
  const selfPrimary = selfIds[0] ? (seen.get(selfIds[0]) ?? null) : null;
  rows.push({
    key: selfKey || selfIds[0] || "",
    kind: "self",
    principal: selfKey || null,
    recordId: selfIds[0] ?? null,
    vaultId: selfPrimary?.vaultId ?? null,
    placements: displayOrder(selfGroup?.placements),
    title: selfPrimary?.title ?? null,
    recordType: typeOf(selfPrimary),
    alsoRecords: Math.max(0, selfIds.length - 1),
  });

  for (const [key, g] of groups) {
    const recs = [...g.records].sort(byRecord);
    const primary = recs[0] ?? null;
    rows.push({
      key,
      kind: primary ? (g.placements.size ? "both" : "record") : "placed",
      principal: g.principal,
      recordId: primary?.recordId.trim() ?? null,
      vaultId: primary?.vaultId ?? null,
      placements: displayOrder(g.placements),
      title: primary?.title ?? null,
      recordType: typeOf(primary),
      alsoRecords: Math.max(0, recs.length - 1),
    });
  }

  for (const r of unlinked) {
    const id = r.recordId.trim();
    rows.push({ key: id, kind: "record", principal: null, recordId: id, vaultId: r.vaultId, placements: [], title: r.title, recordType: typeOf(r), alsoRecords: 0 });
  }

  rows.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || compareCodeUnits(a.key, b.key));
  return rows;
}

/** The records grouped by trimmed record id, each group's copies in a fixed order (vaultId, title, link, type), groups in first-seen order. */
function copiesById(records: readonly StakeholderRecordInput[]): Map<string, StakeholderRecordInput[]> {
  const byId = new Map<string, StakeholderRecordInput[]>();
  for (const r of records) {
    const id = typeof r.recordId === "string" ? r.recordId.trim() : "";
    if (!id) continue;
    const list = byId.get(id);
    if (list) list.push(r);
    else byId.set(id, [r]);
  }
  for (const list of byId.values()) {
    list.sort(
      (a, b) =>
        compareCodeUnits(a.vaultId ?? "", b.vaultId ?? "") ||
        compareCodeUnits(a.title ?? "", b.title ?? "") ||
        compareCodeUnits(a.link ?? "", b.link ?? "") ||
        compareCodeUnits(typeOf(a) ?? "", typeOf(b) ?? ""),
    );
  }
  return byId;
}

/**
 * The key that names one entity whichever address form it is given in: `https://<host>/lws/r/<id>` (the form a create's
 * `Location` and the LWS read use) and `https://<host>/<segment>/e/<id>` (the entity address) give `<host>|<id>`.
 * Anything else (not an address, another path shape) is its own trimmed string. ⛔ Never a name; ⛔ the host is kept, so the same
 * id on another host is another entity.
 *
 * @param id a record id or owner card id
 * @returns the comparison key
 */
export function entityKey(id: string): string {
  const raw = id.trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const m = /^\/(?:lws\/r|[^/]+\/e)\/([^/]+)\/?$/.exec(u.pathname);
  if (!m || u.search || u.hash) return raw;
  let local: string;
  try {
    local = decodeURIComponent(m[1]!);
  } catch {
    local = m[1]!;
  }
  return `${u.protocol}//${u.host}|${local}`;
}

/** A record's type, trimmed, or null when it has none: ⛔ never guessed from its title or its link. */
function typeOf(r: StakeholderRecordInput | null | undefined): string | null {
  return typeof r?.type === "string" && r.type.trim() ? r.type.trim() : null;
}

function displayOrder(keys: Set<string> | undefined): AtomicPlacement[] {
  if (!keys?.size) return [];
  return ATOMIC_PLACEMENTS.filter((p) => keys.has(placementKey(p))).map((p) => ({ ...p }));
}

function byRecord(a: StakeholderRecordInput, b: StakeholderRecordInput): number {
  return compareCodeUnits(a.recordId.trim(), b.recordId.trim()) || compareCodeUnits(a.vaultId, b.vaultId);
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
