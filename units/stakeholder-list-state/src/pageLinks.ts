/**
 * The links (`a:sameAs`) of the records the grid has loaded, read from its own pages.
 *
 * In the Stakeholders view the grid asks its records pages with the records' bodies (`?include=body`), so each loaded record's link is
 * known with no request more. The list uses them to draw a placed person as the ONE row of the record linked to them, whatever the
 * first-screen budget left for the reader's finds and resolves (at about 12 records a linked person showed twice), and the reader takes
 * its records from the same pages instead of reading them again.
 *
 * Kept for the session, in memory: ⛔ nothing here is written anywhere. A record read again replaces its entry.
 */
import { readLink, type LinkReading } from "@kaigilb/gilbplatformcode-online-card-link";
import type { VaultRecordRef } from "@kaigilb/gilbplatformcode-lws-vault-sets";

const links = new Map<string, LinkReading>();
const listeners = new Set<() => void>();
let revision = 0;

function tell(): void {
  revision += 1;
  for (const l of listeners) l();
}

/**
 * Keep the links of the records on a page read with bodies. Rows without a body (a page read without `include=body`) are skipped.
 *
 * @param refs the page's rows
 */
export function notePageLinks(refs: readonly Pick<VaultRecordRef, "id" | "body">[]): void {
  let changed = false;
  for (const r of refs) {
    if (!r.body) continue;
    const next = readLink(r.body);
    const was = links.get(r.id);
    if (was && JSON.stringify(was) === JSON.stringify(next)) continue;
    links.set(r.id, next);
    changed = true;
  }
  if (changed) tell();
}

/** The link of a loaded record (by its id), or undefined when its page carried no body. */
export function pageLinkOf(id: string): LinkReading | undefined {
  return links.get(id);
}

/**
 * A record that was deleted: its link is forgotten (the one delete door calls this once the DELETE has landed).
 *
 * @param id the record's id
 */
export function forgetPageLink(id: string): void {
  if (links.delete(id)) tell();
}

/**
 * THE SCREEN'S links, per holder: for each person, the record that is their one row on the signed-in holder's Stakeholders grid NOW
 * (the newest linked record), and every loaded record linked to them (reached from the person's card). Set by the grid on every change
 * (replaced, ⛔ never added to), so a record that left the grid (deleted, another vault filtered out) is not in it; kept per holder, so
 * another holder in the same tab never sees it; cleared on sign-out.
 */
export interface ScreenLinkedRecord {
  id: string;
  title: string;
  /** The vault that holds it (same-named cards are told apart by vault and date). */
  vaultId?: string;
  /** When it last changed (ms), as the grid's list gives it. */
  updatedAt?: number;
}
const screens = new Map<string, { owners: ReadonlyMap<string, string>; groups: ReadonlyMap<string, readonly ScreenLinkedRecord[]> }>();
const screenListeners = new Set<() => void>();
let screenRevision = 0;

/**
 * Which of a person's linked records is their ONE row: the most recently MADE (the platform's record ids are time-ordered, so the
 * latest id). The grid's row and "+ Add your own"'s choice on a cold deep link use this one rule, and editing an older record does not
 * move the row.
 *
 * @param ids the person's linked record ids
 * @returns the newest one, or null for none
 */
export function newestLinkedId(ids: readonly string[]): string | null {
  let best: string | null = null;
  for (const id of ids) if (best === null || id > best) best = id;
  return best;
}

/** Subscribe to the screens' changes (the card's "other cards" list follows the grid). */
export function onScreenLinks(listener: () => void): () => void {
  screenListeners.add(listener);
  return () => screenListeners.delete(listener);
}

/** A number that changes whenever a holder's screen is set (for `useSyncExternalStore`). */
export function screenLinksRevision(): number {
  return screenRevision;
}

function tellScreens(): void {
  screenRevision += 1;
  for (const l of screenListeners) l();
}

/**
 * The holder's screen now (the grid calls this whenever its loaded records or their links change).
 *
 * @param holder the signed-in holder
 * @param owners the person's one row (record id) by the person
 * @param groups every loaded record linked to each person, the row's first
 */
export function setScreenLinks(
  holder: string,
  owners: ReadonlyMap<string, string>,
  groups: ReadonlyMap<string, readonly ScreenLinkedRecord[]> = new Map(),
): void {
  screens.set(holder, { owners: new Map(owners), groups: new Map(groups) });
  tellScreens();
}

/** The record that is this person's row on the holder's screen now, or null. */
export function screenRecordLinkedTo(holder: string, principal: string): string | null {
  return screens.get(holder)?.owners.get(principal) ?? null;
}

/** Every record on the holder's screen now that is linked to this person (the row's first), or none. */
export function screenLinkedRecordsOf(holder: string, principal: string): readonly ScreenLinkedRecord[] {
  return screens.get(holder)?.groups.get(principal) ?? [];
}

/** Forget every holder's screen (a sign-out). */
export function forgetScreenLinks(): void {
  screens.clear();
  tellScreens();
}

/** Subscribe to changes (for `useSyncExternalStore`). */
export function onPageLinks(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A number that changes whenever a link is added or changed (for `useSyncExternalStore`). */
export function pageLinksRevision(): number {
  return revision;
}

/** Forget every kept link (a test's fresh page; a sign-out). */
export function forgetPageLinks(): void {
  if (links.size === 0) return;
  links.clear();
  tell();
}

/**
 * The linked records whose rows have been IN VIEW in this session (a row counts once it stayed in view, `RecordGrid` `rowInView`). The
 * reader's up-front linked read answers only these from the screen's links, so the anchor asks for the people they link to go out on
 * the screens where those rows are drawn, ⛔ not all at once when the list becomes whole. Kept for the session, in memory; forgotten
 * on sign-out.
 */
const inView = new Set<string>();
const inViewListeners = new Set<() => void>();

/** A linked record's row came into view (its address). */
export function noteRecordInView(entityUri: string): void {
  if (inView.has(entityUri)) return;
  inView.add(entityUri);
  for (const l of inViewListeners) l();
}

/** The linked records whose rows have been in view. */
export function recordsInView(): ReadonlySet<string> {
  return inView;
}

/** Subscribe to a linked record's row coming into view. */
export function onRecordsInView(listener: () => void): () => void {
  inViewListeners.add(listener);
  return () => inViewListeners.delete(listener);
}

/** Forget which rows were in view (a sign-out; a test). */
export function forgetRecordsInView(): void {
  inView.clear();
}
