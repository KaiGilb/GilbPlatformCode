// Every record of one type in a vault, with each record's document as the listing served it. Taken from GilbApp `src/lib/mynet/place/lws.ts`
// (`RecordRef`, `getListedResource`, `listRecordsOfType`, and the private `resourceOf` they use; commit in the README). The one change is named in the
// README under "Changes from GilbApp" and marked `CHANGED` below.
//
//   MyNet                                 GilbApp                         this unit
//   listRecords(<vault>/records?type=T)   listVaultRecordsPage(vault, [T])  (every page)
import { listVaultRecordsPage } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { recordFromServed, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { getResource } from "@kaigilb/gilbplatformcode-vault-resources";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";

type Doc = { doc: Record<string, unknown>; etag: string | null; gone: boolean; typeUri?: string };

function resourceOf(rec: BaseRecord | null): Doc {
  if (!rec) return { doc: {}, etag: null, gone: true };
  return { doc: rec.served?.facts ?? rec.facts, etag: rec.etag ?? null, gone: false, ...(rec.typeUri ? { typeUri: rec.typeUri } : {}) };
}

/** One record reference, as MyNet's `listRecords` returns it. */
export interface RecordRef {
  entity: string;
  typeUri: string;
  /**
   * The record's document and ETag as the listing served them (`?include=body`: the very document and ETag `GET /lws/r/<id>` serves), in
   * `getResource`'s shape. Absent when the listing carried none: then read it.
   */
  read?: Doc;
}

/**
 * A listed record's document: the one the listing carried, no request; else `getResource` reads it.
 *
 * @param ref the listed record
 * @param vaultId the vault it was listed from
 */
export async function getListedResource(ref: RecordRef, vaultId: string): Promise<Doc> {
  return ref.read ?? getResource(idFromResourceUri(ref.entity), vaultId, ref.entity);
}

/** Page ceiling on one type listing, so a server that never says `complete` cannot loop the card. CHANGED: exported (GilbApp: private). */
export const MAX_LIST_PAGES = 50;

/**
 * CHANGED (new, F4): the listing was cut off at {@link MAX_LIST_PAGES} pages with the door still saying there was more. GilbApp ended the loop
 * there and returned what it had, so some records were never shown and nothing said so. The records read are on the error, so a caller that can
 * say "not every one was read" may still show them; one that cannot must not show them as the whole answer.
 */
export class VaultListingCappedError extends Error {
  readonly vaultId: string;
  readonly pages: number;
  readonly read: readonly RecordRef[];
  constructor(vaultId: string, pages: number, read: readonly RecordRef[]) {
    super(`Not every record in this vault was read: the listing stopped after ${pages} pages.`);
    this.name = "VaultListingCappedError";
    this.vaultId = vaultId;
    this.pages = pages;
    this.read = read;
  }
}

/** Every record of one type in the vault (MyNet's `GET …/records?type=<bare name>`), every page —
 *  walked as `uiPrefs.listUiPrefsRowsOnVault` walks them. Throws {@link VaultListingCappedError} when the page ceiling cut it short. */
export async function listRecordsOfType(vaultId: string, typeQuery: string): Promise<RecordRef[]> {
  const out: RecordRef[] = [];
  let offset = 0;
  for (let n = 0; n < MAX_LIST_PAGES; n++) {
    // F20: the register filter hides the card's part types (`recordPlane.registerCardPartTypes`); this
    // typed read is their owner's, so it turns that filter off, as `uiPrefs` lists its own rows.
    // M3f r5 (V4-1): with each record's document (`?include=body`), so the card does not read every listed record once more.
    const page = await listVaultRecordsPage(vaultId, [typeQuery], offset, { includePresentationState: true, includeBody: true });
    for (const r of page.records) {
      const entity = r.entityUri ?? r.id;
      const read = r.body ? resourceOf(recordFromServed(r.id, r.body, r.etag ?? null)) : undefined;
      out.push({ entity, typeUri: r.typeUri, ...(read ? { read } : {}) });
    }
    if (page.complete) break;
    // With bodies the door may end a page early at its byte budget, and a page whose rows were all dropped can be empty: it names where
    // the next page starts (`nextOffset`, a number only with `include=body`; null when it names none). M3f r6 (Agent.Scaling delta 5
    // N23): while the page is not complete and a next offset is named, read on, even past an empty page. A door that names none (it
    // does not take `include=body`) pages as before.
    if (typeof page.nextOffset === "number") {
      if (page.nextOffset <= offset) break;
      offset = page.nextOffset;
      if (n === MAX_LIST_PAGES - 1) throw new VaultListingCappedError(vaultId, MAX_LIST_PAGES, out);
      continue;
    }
    if (page.nextOffset === null && page.records.some((r) => !!r.body)) break;
    if (page.records.length === 0) break;
    offset += page.records.length;
    // CHANGED (F4): the ceiling was reached and the door has not said `complete`: say so.
    if (n === MAX_LIST_PAGES - 1) throw new VaultListingCappedError(vaultId, MAX_LIST_PAGES, out);
  }
  return out;
}
