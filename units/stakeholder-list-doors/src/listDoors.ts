/**
 * The doors for the ONE list of all stakeholders.
 *
 * The rules are the list reader's (`createStakeholderListReader` → `mergeStakeholderRows` of `stakeholder-list-reader`): one row per
 * person, the holder's own card first, a record joins a placed person only through its resolved link, ⛔ never by name. This file
 * only says WHICH of this app's reads do the reader's I/O:
 *
 *   listRecords     one records page per held vault for EVERY stakeholder kind the master names (`?type=` × the type set), with the
 *                   records' bodies (`?include=body`), so the links come with the page: 1 request per vault per page, no find and
 *                   no per-record read. Each record carries its type as the master's full term address.
 *   connections     `sessionConnections` (read once per holder per session, shared with the cards).
 *   canonical       `canonicaliserFor(holder)` (bounded and cached in the package).
 *   resolve         the O1 resolver (`online-card-anchor`) for one record, bounded in time.
 *   readName        `public-card` at the viewer's rung, for a placed-only row in the list's window only.
 *   readLink        the whole record (`GET /lws/r/<id>`), used only if a page ever comes without bodies.
 *   linkedRecordsOf the records linked to the placed people, read UP FRONT once per draw: one
 *                   `find-by-attribute a:sameAs = {"@id": member}` per member per STORE of the held vaults (not per vault
 *                   host), then one read of each record found; at most the reader's budget, each member's answer kept for
 *                   the session (`linkedAnswers.ts`), forgotten on a link write; a record deleted in the session is skipped,
 *                   and so is a kept record whose resolve answered 404 and that no page of this reader listed.
 *   requestsSoFar   the screen's request count (`requestMeter`) from the screen's start, so the reader can give the up-front read
 *                   only what the first screen has left of 40.
 *   (the screen's links) the up-front read's finds are answered from the links of the records the SCREEN has loaded (the grid's own
 *                   full-row pages, `pageLinks.ts`) when the screen holds every held vault's list whole, and a found record's read
 *                   from the document its page carried; otherwise it asks as above. ⛔ No list of its own, no preload.
 *
 * READ ONLY. ⛔ Nothing here writes a record, a link, a placement or a claim.
 */
import type { QueryClient } from "@tanstack/react-query";
import { cardName, readOnlineCard, type OnlineCardRead } from "@kaigilb/gilbplatformcode-online-card";
import { resolveOnlineCard } from "@kaigilb/gilbplatformcode-person-connections";
import { readLink } from "@kaigilb/gilbplatformcode-online-card-link";
import {
  pageLimitOfVault,
  type ListedRecord,
  type NameAnswer,
  type RecordsPage,
  type StakeholderListDeps,
} from "@kaigilb/gilbplatformcode-stakeholder-list-reader";
import { findByAttribute, idFromUri, listVaultRecordsPage, type VaultRecordRef, type VaultRecordsPage } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { readRecord, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { storeOfOrigin, vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { heldVaultIds, type ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { canonicaliserFor, personCardPlatform, sessionConnections } from "./personCard";
import {
  forgetEndedLinkedRecord,
  forgetLinkedRecords,
  isDeletedLinkedRecord,
  isKeptLinkedRecord,
  keptResolve,
  memberAnswers,
  noteJoinedLinkedRecord,
  notePageLinks,
  recordReads,
  relistLinkedRecord,
  screenAnswerLapsed,
  screenAnswerUntil,
  wasJoinedLinkedRecord,
  type LinkedFound,
} from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import type { StakeholderListDoorsHost } from "./doorsHost";

export { forgetLinkedRecords };

/** The link's term as the store keeps it (`LINK_SLUG` of `online-card`: the EXISTING `a:sameAs`). */
const LINK_ATTR = "a:sameAs";

/** The most records one find answers for one member (a person is linked from few records; a longer answer is cut, ⛔ never paged). */
const LINK_FIND_LIMIT = 20;

/** How long one name or resolver read may take before it counts as "could not be read" (as the card's own reads). */
const READ_TIMEOUT_MS = 10_000;

/**
 * The master's full term address of a record's type, whichever spelling the vault served (`t:Person`, a vault-host
 * `…/base/t/Person`, a bare name). The list asks its kind word and its picture shape with this address, the same one the type set's
 * words are found by (`kindWordOf`).
 *
 * @param typeUri the type as the records door gave it
 * @returns `<the ontology origin>/base/t/<Name>`, or null for no type
 */
export function masterTypeAddress(typeUri: string | null | undefined): string | null {
  const raw = (typeUri ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/\/base\/t\/([^/#?]+)$/);
  const name = m?.[1] ? decodeURIComponent(m[1]) : raw.replace(/^t:/, "");
  return name ? `${termOrigin()}/base/t/${name}` : null;
}

/** One door row as the reader takes it. ⚠ `type` is ALWAYS set here (a door that forgets it gives null rows silently). */
function listedRecordOf(r: VaultRecordRef): ListedRecord {
  return {
    recordId: r.entityUri,
    title: r.label ?? null,
    type: masterTypeAddress(r.typeUri),
    // With bodies the link is known for every record on the page, so the reader sends no find and no record read.
    ...(r.body ? { link: readLink(r.body) } : {}),
    updatedAt: r.updatedAt || null,
  };
}

/**
 * A records page of this app's door, as the list reader takes it.
 *
 * @param page `listVaultRecordsPage(…, { includeBody: true, limit })`
 * @returns the records (each with its type, title and link) and where the next page starts, or null when this was the last
 */
export function listedRecordsPage(page: VaultRecordsPage): RecordsPage {
  // The door names the next offset with bodies (a page can end early at its byte budget); without it, the door's own offset
  // counts the rows it SENT (`served`), ⛔ not the rows this app kept.
  const next = page.complete ? null : (page.nextOffset ?? page.offset + (page.served ?? page.records.length));
  return { records: page.records.map(listedRecordOf), next };
}

/** The query-cache head of the list's pages: the record pane finds a listed record's own address here (`findKnownRecordInCache`). */
const LIST_PAGE_HEAD = ["base", "stakeholder-list", "page"] as const;

/**
 * Note where each listed record lives, so a click opens its card from ITS vault: the record pane reads a record that is not in the
 * open vault's list by the address a loaded surface knows (`findKnownRecordInCache`). Only the id, the address and the type are
 * kept: ⛔ no facts, so nothing here can stand in for the record's own read. Kept for the session; gone on reload.
 */
function noteListedRecords(
  qc: QueryClient,
  vaultId: string,
  offset: number,
  records: readonly Pick<VaultRecordRef, "id" | "entityUri" | "typeUri">[],
): void {
  qc.setQueryDefaults(LIST_PAGE_HEAD, { gcTime: Infinity, staleTime: Infinity });
  qc.setQueryData([...LIST_PAGE_HEAD, vaultId, offset], {
    records: records.map((r) => ({ id: r.id, entityUri: r.entityUri, typeUri: r.typeUri, sourceVaultId: vaultId })),
  });
}

/** A sign-in failure on the names door, named so the list says "You are signed out — …" (`isCredentialSurfaceError`). */
export class CredentialRefusedError extends Error {
  override name = "CredentialRefusedError";
  constructor() {
    super("The platform did not accept this sign-in for the names of the people you placed.");
  }
}

/**
 * One placed person's name as the list may draw it, from their `public-card` at this viewer's rung.
 *
 * @param read the card read's answer
 * @returns the name (null when the card shows none), `none` when there is no person card, `unavailable` when it could not be asked
 * @throws CredentialRefusedError on a 401: the viewer is signed out, which the list says in its own words, ⛔ never as a missing name
 */
export function nameAnswerOf(read: OnlineCardRead): NameAnswer {
  // The photo address comes with the name, in the same read (0 requests more); the row reads the bytes lazily.
  if (read.kind === "card")
    return { kind: "name", name: cardName(read.card), ...(read.card.photoUrl !== undefined ? { photoUrl: read.card.photoUrl } : {}) };
  if (read.kind === "none") return { kind: "none" };
  if (read.kind === "unavailable" && read.status === 401) throw new CredentialRefusedError();
  return { kind: "unavailable" };
}

/**
 * The vaults the list reads, each once, the holder's own first (the reader's order, and the page limits' order).
 *
 * @param vaults the session's reachable vaults
 * @param ownVaultId the holder's own vault (`ownVaultIdOf`), or null
 * @returns the held vault ids
 */
export function heldVaultsOwnFirst(vaults: readonly ReachableVault[], ownVaultId: string | null): string[] {
  // "Held" is the same test the old Stakeholders entry used for "every vault the person holds" (`heldVaultIds`: read mode, once each).
  const out = heldVaultIds(vaults);
  if (ownVaultId && out.includes(ownVaultId)) return [ownVaultId, ...out.filter((x) => x !== ownVaultId)];
  return out;
}

/** What the list's doors need from the app. */
export interface StakeholderListDoorsArgs {
  qc: QueryClient;
  /** The signed-in holder's principal. */
  holder: string;
  /** The held vaults, the holder's own first ({@link heldVaultsOwnFirst}). */
  vaults: readonly string[];
  /** The holder's own vault: the circles are read there. Null: the circles cannot be read, and the list says so. */
  ownVaultId: string | null;
  /** The stakeholder kinds' bare names, read from the master (`STAKEHOLDER_TYPE_SET_QUERY`). ⛔ Never a list in code. */
  typeNames: readonly string[];
  /** The holder's own card ids (`findOwnCard`: the card, then the other own cards). */
  ownCardIds: readonly string[];
  /** `requestsSent()` when the screen opened: the screen's requests are counted from here. Absent: from 0. */
  screenStartedAt?: number;
  /**
   * The records the screen has ALREADY loaded for a vault, each with its link (the grid's own pages,
   * read with bodies in the Stakeholders view), or null when the screen did not load that vault this way. Given: the records door
   * sends no request: it answers the screen's records (the first page; nothing after), and an empty page for a vault the screen did
   * not load. Absent: the door reads its own page, as before.
   */
  screenPages?: (vaultId: string) => RecordsPage | null;
  /**
   * The links of the records the screen has loaded, by the person they link to, when the
   * screen holds the list of EVERY given vault whole (the grid's own full-row pages read to their end); null otherwise. Given and not
   * null: the up-front linked read sends no find. Absent or null: it asks as before.
   */
  screenLinks?: (vaults: readonly string[]) => { byPerson: ReadonlyMap<string, readonly string[]>; partial: ReadonlySet<string>; readAt?: number } | null;
  /** A record as the screen's full-row page carried it (the record reads' cache), or null: a found record is then not read. */
  held?: (id: string, entityUri: string) => BaseRecord | null;
}

/**
 * The reader's doors for one holder. Pure construction: nothing is requested until the reader reads.
 *
 * @param a the holder, the held vaults, the kinds, the own card ids and the query client
 * @returns the `StakeholderListDeps` of `createStakeholderListReader`
 */
export function stakeholderListDeps(host: StakeholderListDoorsHost, a: StakeholderListDoorsArgs): StakeholderListDeps {
  const platform = personCardPlatform();
  // THE REACH CAP (until GilbPlatform P5): one reach brings at most 20 records across all held vaults. The cap, its reason and its
  // split live once, in `stakeholder-list-reader` (`STAKEHOLDER_LIST_REACH_CAP`, `pageLimitFor`).
  const limitOf = pageLimitOfVault(a.vaults);
  // What THIS reader has seen (one set of doors per reader, `useStakeholderListReader`). The ids its pages listed (a page
  // is a fresh read: a 404 on such a record's resolve does not take it as ended), and what its up-front reads gave it.
  const listedHere = new Set<string>();
  const seenHere: ReaderSeen = { given: new Set(), members: new Set() };
  return {
    holder: a.holder,
    vaults: [...a.vaults],
    ...(a.ownVaultId ? { holderVault: a.ownVaultId } : {}),
    ownCardIds: [...a.ownCardIds],
    connections: () =>
      a.ownVaultId ? sessionConnections(a.qc, a.holder, a.ownVaultId) : Promise.reject(new Error("your own vault is not known")),
    // The reader passes this vault's share of the reach; the static split only without one.
    listRecords: async (vaultId, offset, limit) => {
      if (a.screenPages) {
        // The screen's own pages, read once, with their links: ⛔ no request here.
        const screen = offset === 0 ? a.screenPages(vaultId) : null;
        if (!screen) return { records: [], next: null };
        for (const r of screen.records) {
          const id = idFromUri(r.recordId);
          listedHere.add(id);
          relistLinkedRecord(id);
        }
        return screen;
      }
      const page = await listVaultRecordsPage(vaultId, a.typeNames, offset, { includeBody: true, limit: limit ?? limitOf(vaultId) });
      // The links on this page are kept for the list's one-row-per-person join (`pageLinks.ts`).
      notePageLinks(page.records);
      noteListedRecords(a.qc, vaultId, offset, page.records);
      for (const r of page.records) {
        const id = idFromUri(r.entityUri);
        listedHere.add(id);
        // A page lists only live records: one taken as ended on a 404 comes back.
        relistLinkedRecord(id);
      }
      return listedRecordsPage(page);
    },
    readLink: async (recordId) => {
      const rec = await readRecord(idFromUri(recordId), recordId);
      return readLink(rec?.served?.facts ?? null);
    },
    linkedRecordsOf: async (members, budget) => {
      // Only records of the list's own kinds (the records door asks for exactly these); a Note that carries a
      // link is not a stakeholder and never becomes a person's row.
      const found = (await linkedRecordsOf(host, a.holder, a.vaults, members, budget, seenHere, { screenLinks: a.screenLinks, held: a.held })).filter((f) =>
        isListedKind(f.record.type, a.typeNames),
      );
      // Say where each found record lives, as the records door does for its pages, so its card opens from ITS vault
      // from the first screen (the pane finds the address by `findKnownRecordInCache`).
      for (const [vaultId, recs] of groupByVault(found)) noteListedRecords(a.qc, vaultId, LINKED_PAGE, recs);
      return found;
    },
    requestsSoFar: () => host.requestsSent() - (a.screenStartedAt ?? 0),
    resolve: async (recordId) => {
      // An anchor ask in flight is shared by every overlapping draw and reader (`keptResolve`).
      const answer = await keptResolve(`${a.holder}\u0000${recordId}`, () => resolveOnlineCard(platform, recordId, { timeoutMs: READ_TIMEOUT_MS }));
      const id = idFromUri(recordId);
      // The platform answers 404 `no_online_card` for an ended record. A record kept as read by the
      // up-front read, that this reader's pages never listed, is then taken as ended: no draw brings it back and the list hides
      // its row. No request is added: the reader sends this resolve anyway. ⚠ The same 404 means "no link / not a card" too, so
      // a page that lists the record takes it back (`relistLinkedRecord` above).
      // Only for a record this session saw joined before AND that is on
      // the holder's own vault. The platform's anchor route answers the same 404 for a record off the caller's own vault
      // ("record-not-on-callers-vault"), so there a 404 says nothing about an end. A record that has only ever answered 404 (no card
      // behind its link) stays a record row, as before.
      if (answer.kind === "person" || answer.kind === "organization") noteJoinedLinkedRecord(id);
      else if (
        answer.kind === "none" &&
        !listedHere.has(id) &&
        isKeptLinkedRecord(id) &&
        wasJoinedLinkedRecord(id) &&
        !!a.ownVaultId &&
        hostOf(recordId) === hostOf(a.ownVaultId)
      )
        forgetEndedLinkedRecord(id);
      // P1: an answer the reader did not keep ("could not ask") is asked again by it, so the record costs its resolve again.
      if (answer.kind !== "person" && answer.kind !== "organization" && answer.kind !== "none") seenHere.given.delete(id);
      return answer;
    },
    canonical: canonicaliserFor(a.holder),
    readName: async (principal) => nameAnswerOf(await readOnlineCard(platform, principal, { timeoutMs: READ_TIMEOUT_MS })),
  };
}

/** The host of an address, lower case, or null. */
function hostOf(uri: string): string | null {
  try {
    return new URL(uri).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * What one reader's up-front reads gave it: the ids of the records given (the reader resolves each, and keeps the answer
 * in its `resolveCache`), and the members whose answer it was given.
 */
export interface ReaderSeen {
  given: Set<string>;
  members: Set<string>;
}

/** The cache "offset" the up-front read's records are noted under, beside the records door's pages. */
const LINKED_PAGE = -1;

/**
 * Whether a record's type is one of the list's kinds.
 *
 * @param type the record's type as the master's full term address (`masterTypeAddress`)
 * @param typeNames the list's kinds, bare names
 */
function isListedKind(type: string | null | undefined, typeNames: readonly string[]): boolean {
  const name = type?.match(/\/base\/t\/([^/#?]+)$/)?.[1];
  return !!name && typeNames.includes(decodeURIComponent(name));
}

/** The found records per vault, as `noteListedRecords` takes them (id, address, type). */
function groupByVault(found: readonly LinkedFound[]): Map<string, Pick<VaultRecordRef, "id" | "entityUri" | "typeUri">[]> {
  const out = new Map<string, Pick<VaultRecordRef, "id" | "entityUri" | "typeUri">[]>();
  for (const { vaultId, record } of found) {
    const list = out.get(vaultId) ?? [];
    list.push({ id: idFromUri(record.recordId), entityUri: record.recordId, typeUri: record.type ?? "" });
    out.set(vaultId, list);
  }
  return out;
}

/**
 * One origin per STORE of the held vaults: the first held vault's origin in each store, the holder's
 * own first. The platform's find scans the holder's whole reach in the store of the host asked, whatever the host (measured on
 * the rig: the same find at three vault hosts gave the same ids), so asking at every vault host only repeated it.
 */
function storeOrigins(vaults: readonly string[]): string[] {
  const byStore = new Map<string, string>();
  for (const v of vaults) {
    const origin = vaultOriginOf(v);
    const store = storeOfOrigin(origin);
    if (!byStore.has(store)) byStore.set(store, origin);
  }
  return [...byStore.values()];
}

/**
 * The records in the held vaults linked to any of these placed people, each with its vault and as the records door lists it
 * (title, the master's type address, the link). The list joins a linked record to its person
 * from the first draw, whatever page the record is on.
 *
 * ⚠ The platform's `find-by-attribute` needs a VALUE (no value answers 400, measured on 2026-10-20), so there is no "which records carry a link" find: this asks one find per member, with the member's address exactly
 * as the circles store it (the link the apps write is that address: the link writer of the card unit writes the found principal).
 * A link written with another spelling joins when its record's page comes, as before. The find is asked once per STORE of the
 * held vaults, at the first held vault of that store. A found record is listed in the held vault on its host; a record on a
 * host no held vault has is not listed (it is not the list's). Then each record found is read once (its title, type and link).
 *
 * THE BUDGET: with `budget`, at most that many NEW requests: a new member costs one find per store plus a read and a
 * resolve per new record (the reader resolves what it is given), so `budget / (stores + 2)` new members are asked, in the
 * reader's order; a new record that no longer fits is not read and joins with its page (its member is kept as cut short: what
 * was read is returned at 0 cost, and the member is asked again when the budget allows). An answer
 * kept from before in this session costs no find and no read. Its resolve costs 0 when this
 * reader was given the record before (its `resolveCache` has it), and 1 when not (a new reader); a
 * kept record whose resolve does not fit is not given this draw (it joins with its page), and its member stays whole.
 *
 * ASKED AGAIN: on the same reader's later draw (a create's refresh, a delete's redraw), a member whose
 * answer this reader was given and that still names a record is asked its find again, with what the budget has left after the
 * new members, so a record ended in another tab is not drawn again (a store's find does not name an ended record); the new
 * find's records win over the kept ones. A reader's first draw asks no kept member again (the first screen's rule). ⚠ At
 * budget 0 nothing is asked again, and the kept record stays until the next new reader (whose resolve answers 404) or a reload.
 *
 * @param holder the signed-in holder (the kept answers are this holder's)
 * @param vaults the held vaults, the holder's own first
 * @param members the placed people to ask about, the most valuable first
 * @param budget the requests this may cost; absent: no bound but the reader's member cap
 * @param seen what this reader's earlier up-front reads gave it; absent: a reader that resolves nothing it is given again
 * @returns the linked records found
 * @throws when a find or a read fails: the reader then keeps page order for this draw (⛔ never "nobody is linked")
 */
export async function linkedRecordsOf(
  host: StakeholderListDoorsHost,
  holder: string,
  vaults: readonly string[],
  members: readonly string[],
  budget?: number,
  seen?: ReaderSeen,
  /** The screen's loaded links (when it holds every vault whole) and the documents its pages carried. Absent: as before. */
  fromScreen?: { screenLinks?: StakeholderListDoorsArgs["screenLinks"]; held?: StakeholderListDoorsArgs["held"] },
): Promise<LinkedFound[]> {
  const origins = storeOrigins(vaults);
  const keyOf = (member: string) => `${holder}\u0000${origins.join(" ")}\u0000${vaults.join(" ")}\u0000${member}`;
  let left = budget ?? Number.POSITIVE_INFINITY;
  // An answer the screen gave (its loaded links) lapses with the list it came from, as the
  // screen's own links do: past it the member is asked again, as main asks.
  const now = Date.now();
  for (const m of members) {
    if (!screenAnswerLapsed(keyOf(m), now)) continue;
    memberAnswers.delete(keyOf(m));
    screenAnswerUntil.delete(keyOf(m));
  }
  // A member never asked, or cut short by the budget last time (its records already read are still returned below, at 0 cost).
  const uncached = members.filter((m) => !memberAnswers.get(keyOf(m))?.complete);
  const perMember = origins.length + 2;
  const toAsk = budget === undefined ? [...uncached] : uncached.slice(0, Math.max(0, Math.floor(left / perMember)));
  // The members this reader was given before, asked again with what is left (one find per store each).
  const given = (m: string) => !!seen?.members.has(keyOf(m));
  const namesALiveRecord = (m: string) => (memberAnswers.get(keyOf(m))?.ids ?? []).some((id) => !isDeletedLinkedRecord(id));
  const again = members.filter((m) => !uncached.includes(m) && given(m) && namesALiveRecord(m));
  const reAsk = again.slice(0, Math.max(0, Math.floor((left - toAsk.length * perMember) / origins.length)));
  toAsk.push(...reAsk);
  left -= toAsk.length * origins.length;
  // When the screen holds every held vault's list whole (its own full-row pages, read to their end), each member's linked
  // records are the loaded records whose link names them: the same exact `a:sameAs` = {"@id": member} test the find makes, with no
  // find sent. The budget above is charged as before, so the same members are asked.
  const local = toAsk.length > 0 ? (fromScreen?.screenLinks?.(vaults) ?? null) : null;
  // What the screen answers is kept no longer than the app's own record read would be (from the list's read, else now).
  const screenUntil = (local?.readAt ?? now) + host.heldRecordFreshMs;
  const asked = new Map<string, string[]>();
  await Promise.all(
    toAsk.map(async (member) => {
      const ids = new Set<string>();
      if (local) {
        for (const id of local.byPerson.get(member) ?? []) ids.add(id);
        // In the find's own order (by address).
        asked.set(member, [...ids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
        return;
      }
      let answers;
      try {
        answers = await Promise.all(origins.map((o) => findByAttribute(LINK_ATTR, { "@id": member }, { limit: LINK_FIND_LIMIT }, o)));
      } catch (e) {
        // A kept member asked again that could not be asked keeps its kept answer; ⛔ never the whole draw's joins lost.
        if (reAsk.includes(member)) return;
        throw e;
      }
      for (const r of answers) for (const id of r.ids) ids.add(id);
      asked.set(member, [...ids]);
    }),
  );
  // In the reader's order: each member's records (a new find's win over the kept ones). A kept one while the budget holds its
  // resolve if this reader still has to send it, a new one while the budget holds its read and its resolve.
  const out: LinkedFound[] = [];
  const seenIds = new Set<string>();
  const toRead: { id: string; vaultId: string }[] = [];
  const answered: { member: string; ids: readonly string[]; complete: boolean }[] = [];
  for (const member of members) {
    const ids = asked.get(member) ?? memberAnswers.get(keyOf(member))?.ids;
    if (!ids) continue;
    let whole = true;
    for (const id of ids) {
      // A record deleted in the session is never returned, even by a find that was out before the
      // delete landed.
      if (seenIds.has(id) || isDeletedLinkedRecord(id)) continue;
      const host = hostOf(id);
      const vaultId = vaults.find((v) => hostOf(v) === host);
      if (!vaultId) {
        seenIds.add(id);
        continue;
      }
      // A record taken from a document the screen's page carried lapses as that answer does; then it is read.
      if (screenAnswerLapsed(id, now)) {
        recordReads.delete(id);
        screenAnswerUntil.delete(id);
      }
      const kept = recordReads.get(id);
      // A new record costs its read and the resolve the reader sends for it (2). A kept one costs no read: its resolve (1) when
      // this reader was not given it before, else 0 (it is in the reader's `resolveCache`); a kept "gone" costs 0.
      const resolvePaid = !seen || seen.given.has(idFromUri(id));
      const cost = kept === undefined ? 2 : kept && !resolvePaid ? 1 : 0;
      if (cost > left) {
        // A new read that does not fit cuts the member short (asked again later); a kept record does not: its answer is whole.
        if (kept === undefined) whole = false;
        continue;
      }
      seenIds.add(id);
      left -= cost;
      if (kept) out.push(kept);
      else if (kept === undefined) toRead.push({ id, vaultId });
    }
    // A person with a linked record whose row was not in view yet is asked again on a later draw.
    if (local?.partial.has(member)) whole = false;
    answered.push({ member, ids, complete: whole });
  }
  const read = await Promise.all(
    toRead.map(async ({ id, vaultId }) => {
      // The record's document as the screen's full-row page carried it (the same document `GET /lws/r/<id>` serves); else one read.
      const held = fromScreen?.held?.(idFromUri(id), id) ?? null;
      const rec = held ?? (await readRecord(idFromUri(id), id));
      // A record answered by a page's document is kept only while that page would be fresh; a read is kept as before.
      if (held) screenAnswerUntil.set(id, screenUntil);
      else screenAnswerUntil.delete(id);
      if (!rec) return { id, found: null };
      const facts = rec.served?.facts ?? null;
      const title = (rec.facts.name ?? rec.facts.label ?? rec.facts.title ?? "").trim() || null;
      const record: ListedRecord = {
        recordId: rec.entityUri ?? id,
        title,
        type: masterTypeAddress(rec.typeUri),
        link: readLink(facts),
        updatedAt: null,
      };
      return { id, found: { vaultId, record } };
    }),
  );
  for (const { id, found } of read) {
    // A delete that landed while this read was out wins: the record is kept as gone.
    const gone = isDeletedLinkedRecord(id);
    recordReads.set(id, gone ? null : found);
    if (found && !gone) out.push(found);
  }
  // Every member with an answer is kept, with whether every record of it was read (or kept). One cut short by the budget is asked
  // again when the budget allows; its records already read come back meanwhile at 0 cost.
  for (const { member, ids, complete } of answered) {
    memberAnswers.set(keyOf(member), { ids, complete });
    // An answer from the screen's links lapses (above); one from a find is kept for the session, as before.
    if (local && asked.has(member)) screenAnswerUntil.set(keyOf(member), screenUntil);
    else if (asked.has(member)) screenAnswerUntil.delete(keyOf(member));
  }
  // What this reader is given now (it resolves each record), so its later draws neither charge those resolves again
  // nor skip asking these members again.
  if (seen) {
    for (const f of out) seen.given.add(idFromUri(f.record.recordId));
    for (const { member } of answered) seen.members.add(keyOf(member));
  }
  return out;
}
