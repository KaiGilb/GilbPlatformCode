/**
 * The holder's OWN relationship kinds: entries of `t:RelationshipKind` in the holder's own vault, beside the master's
 * (no mint step: the type exists, instances are data). MEASURED on a scratch store (2026-10-16): an ordinary user write of such an entry (`POST /lws/vault/<v>/c`, `t:RelationshipKind`, `a:label`, `a:labelOrder`,
 * `a:playableBy` → a type address) is accepted (201), and the vault's typed list (`?type=RelationshipKind`) returns it.
 *
 * ⛔ Not shared and not found: it lives in the holder's vault with the vault's own grants and no rung. It carries no reader and no tier.
 */
import { listVaultRecordsPage, mapWithConcurrency } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { typeSpelling, attributeSpelling } from "@kaigilb/gilbplatformcode-term-slots";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { CatalogueEntry } from "@kaigilb/gilbplatformcode-contact-kind-model";
import { entryFromDoc, readEntryName } from "./contactKindCatalogue";

/**
 * What the host answers for the holder's own kinds: the two vault-record calls of the app's place library. Each member replaces one call of the app.
 */
export interface OwnKindsHost {
  /**
   * Replaces `createResource(vaultId, { type, facts })`, GilbApp `src/lib/contact/ownKinds.ts` line 140 (calling `src/lib/mynet/place/lws.ts` line 44):
   * writes one record in the vault. `location` is the new record's address; `id` and `etag` are as the store gave them.
   */
  createResource(vaultId: string, body: { type: string; facts: Record<string, { "@id": string } | string> }): Promise<{ id: string; location: string; etag: string | null }>;
  /**
   * Replaces `getResource(id, vaultId, entityUri?)`, GilbApp `src/lib/contact/ownKinds.ts` lines 77 and 91 (calling `src/lib/mynet/place/lws.ts` line 57):
   * reads one record's served document. `gone` is true when the store answered 404 (the document is then empty).
   */
  getResource(id: string, vaultId: string, entityUri?: string): Promise<{ doc: Record<string, unknown>; etag: string | null; gone: boolean; typeUri?: string }>;
}

/**
 * The most own kinds one read names. The holder's own kinds are read BY THE LIST'S TOTAL, every page, so no kind is cut quietly at a small number
 * (it was 50 with no sign); the ceiling is only what the app will fetch in one go, and when it is hit the answer SAYS so (`complete: false`,
 * `total`), so the card can say "showing N of M". Each kind is one small document (about 0.5 KB).
 */
export const MAX_OWN_KINDS = 500;
/** Own-kind documents in flight at once: the browser's own limit queues the rest, so this is a bound, not a promise (HTTP/2 serves them side by side). */
export const OWN_KIND_PARALLEL = 32;
/** List pages in flight at once, after the first page has said how many there are. */
const LIST_PARALLEL = 6;

export class OwnKindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnKindError";
  }
}

/** What a read of the holder's own kinds found, and whether that is all of them. */
export interface OwnKinds {
  entries: CatalogueEntry[];
  /** How many own kinds the vault's list names. When `totalIsFloor`, at least this many (the list was not walked to its end). */
  total: number;
  totalIsFloor: boolean;
  /** False when the ceiling was hit or a kind did not read: `entries` is then a floor, and `total` says by how much. */
  complete: boolean;
}

/** List pages walked at most (20 rows each): the true count is named up to this many kinds, beyond it "more than". */
const MAX_LIST_PAGES = 100;

/**
 * The holder's own relationship kinds in one vault (the bare type name is the question asked of the vault's typed list).
 * 🔴 MEASURED on a scratch store (200 kinds): the list's `total` is only the rows up to the page just served (20, 40, ... 200) and
 * `complete` is false until the last page, so page 1 cannot say how many there are. The pages are therefore asked side by side in WAVES of
 * {@link LIST_PARALLEL} offsets until one says `complete`; then the kinds' documents are read, in parallel and bounded. ⛔ Never one after
 * another, ⛔ never cut without saying.
 */
export async function readOwnKinds(host: OwnKindsHost, vaultId: string, fetchImpl: typeof fetch = (u, i) => fetch(u, i)): Promise<OwnKinds> {
  if (!vaultId) return { entries: [], total: 0, totalIsFloor: false, complete: true };
  const first = await listVaultRecordsPage(vaultId, ["RelationshipKind"], 0);
  const rows = new Map<string, string>();
  for (const r of first.records) rows.set(r.id, r.entityUri);
  const step = first.served ?? first.records.length;
  let exhausted = first.complete || step === 0;
  for (let pagesRead = 1, offset = step; !exhausted && pagesRead < MAX_LIST_PAGES; ) {
    const offsets: number[] = [];
    for (let k = 0; k < LIST_PARALLEL && pagesRead + k < MAX_LIST_PAGES; k++) offsets.push(offset + k * step);
    const pages = await Promise.all(offsets.map((o) => listVaultRecordsPage(vaultId, ["RelationshipKind"], o)));
    pagesRead += offsets.length;
    offset += offsets.length * step;
    for (const pg of pages) {
      for (const r of pg.records) rows.set(r.id, r.entityUri);
      if (pg.complete || pg.records.length === 0) exhausted = true;
    }
  }
  const wanted = [...rows.entries()].slice(0, MAX_OWN_KINDS);
  let complete = rows.size <= MAX_OWN_KINDS && exhausted;
  const read = await mapWithConcurrency(wanted, OWN_KIND_PARALLEL, async ([id, entityUri]) => {
    try {
      const { doc, gone } = await host.getResource(id, vaultId, entityUri);
      if (gone) return null;
      return await entryFromDoc(fetchImpl, "relationshipKind", entityUri, doc, true);
    } catch {
      complete = false;
      return null;
    }
  });
  return { entries: read.filter((e): e is CatalogueEntry => e !== null), total: rows.size, totalIsFloor: !exhausted, complete };
}

/** One own kind's name BY ITS ADDRESS, read from the holder's own vault (the chip of a kind the list did not carry). */
export function readOwnEntryName(host: OwnKindsHost, id: string, vaultId: string): ReturnType<typeof readEntryName> {
  return readEntryName(id, async () => {
    const { doc, gone } = await host.getResource(id.slice(id.lastIndexOf("/") + 1), vaultId, id);
    if (gone) throw new Error("gone");
    return doc;
  });
}

let kindTypeFromUri: Promise<string | null> | null = null;

/**
 * The record type an own kind is written under. The master's `t/RelationshipKind` carries `a:typeUri` but NO `a:typeAttribute` (read live
 * 2026-10-16: the term `t/HeldPartyFieldClaim` has both), so `typeSpelling` answers null and a kind of the holder's own could never be written. The type's
 * own address names it: `…/base/t/RelationshipKind` is the type `t:RelationshipKind`, the spelling the platform accepted for the entry (MEASURED, 201).
 * Asked of the master, ⛔ never typed here beyond the term NAME the other lookups use. A master that did not answer is `null` (nothing is written).
 */
function ownKindType(): Promise<string | null> {
  kindTypeFromUri ??= (async () => {
    const spelled = await typeSpelling("RelationshipKind");
    if (spelled) return spelled;
    try {
      const res = await fetch(`${termOrigin()}/base/t/RelationshipKind`, { headers: { accept: "application/ld+json, application/json" } });
      if (!res.ok) return null;
      const doc = (await res.json()) as Record<string, unknown>;
      const raw = doc["a:typeUri"] ?? doc["typeUri"] ?? doc["@id"];
      const m = typeof raw === "string" ? /\/t\/([^/#?]+)$/.exec(raw) : null;
      return m ? `t:${decodeURIComponent(m[1]!)}` : null;
    } catch {
      return null;
    }
  })().then((v) => {
    if (v === null) kindTypeFromUri = null; // not known: ask again next time
    return v;
  });
  return kindTypeFromUri;
}

/** Test seam, ⛔ never called by product code. */
export function __resetOwnKindType(): void {
  kindTypeFromUri = null;
}

/** Write one kind of the holder's own, applicable to one record type (or to none: every record). Returns the entry as written. */
export async function addOwnKind(host: OwnKindsHost, args: { vaultId: string; label: string; typeIri?: string | null }): Promise<CatalogueEntry> {
  const label = args.label.trim();
  if (!args.vaultId) throw new OwnKindError("Refusing to write a kind with no vault named.");
  if (!label) throw new OwnKindError("A kind needs a name.");
  const [type, labelKey, playableKey] = await Promise.all([ownKindType(), attributeSpelling("label"), attributeSpelling("playableBy")]);
  if (!type || !labelKey || !playableKey) throw new OwnKindError("The ontology did not name a relationship kind or its fields, so a kind of your own cannot be written right now.");
  const facts: Record<string, { "@id": string } | string> = { [`a:${labelKey}`]: label };
  if (args.typeIri) facts[`a:${playableKey}`] = { "@id": args.typeIri };
  const created = await host.createResource(args.vaultId, { type, facts });
  return { id: created.location, label, order: null, playableBy: args.typeIri ? [args.typeIri] : [], axis: "relationshipKind", own: true };
}
