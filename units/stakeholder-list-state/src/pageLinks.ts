// The links (`a:sameAs`) of the records a page was read with, kept for the session, with their listeners and revision.
// Taken from the app's page-links file: the links state, its writer, its readers and the reset (the screens and in-view state are not taken).

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
