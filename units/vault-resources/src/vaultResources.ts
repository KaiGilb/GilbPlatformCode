// The vault-write surface of the held-claim layer: one entity created, read, patched or deleted by its vault and address, over the
// record doors of `lws-records`. Fact keys arrive in the served spelling (`a:claimSubject`); the record door adds the one `a:` itself,
// so ONE `a:` is taken off here. Not a second client: every verb goes through the same door as every other record write.
import {
  createRecord,
  deleteRecord,
  patchRecord,
  readRecord,
  type MergePatchValue,
  type RecordFactValue,
} from "@kaigilb/gilbplatformcode-lws-records";
import { mapWithConcurrency, MAX_PARALLEL_DEREFERENCES } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import { entityUriInVault } from "@kaigilb/gilbplatformcode-vault-namespace";

/** A fact value as the held-claim composers build it. */
export type FactValue = RecordFactValue;

function bare(key: string): string {
  return key.startsWith("a:") ? key.slice(2) : key;
}

/** CREATE in the named vault. `location` is the new entity's URI in that vault (GilbApp's create
 *  answers the id; the vault namespace + id is the entity's address,). */
export async function createResource(
  vaultId: string,
  body: { type: string; facts: Record<string, FactValue> },
): Promise<{ id: string; location: string; etag: string | null }> {
  const facts: Record<string, RecordFactValue> = {};
  for (const [k, v] of Object.entries(body.facts)) facts[bare(k)] = v;
  const { id, etag } = await createRecord(vaultId, body.type, facts);
  return { id, location: entityUriInVault(vaultId, id), etag };
}

/** One entity's served document (keys as served, values verbatim) and its version. A 404 is an
 *  empty document: the entity is gone, and a reader of it finds none of its facts. `gone` says it was
 *  the 404, so a caller can tell "deleted" from "served with nothing". */
export async function getResource(
  id: string,
  vaultId: string,
  entityUri?: string,
): Promise<{ doc: Record<string, unknown>; etag: string | null; gone: boolean; typeUri?: string }> {
  return resourceOf(await readRecord(id, entityUri ?? entityUriInVault(vaultId, id)));
}

/** {@link getResource}'s answer for a record as read (null: the store answered 404). */
function resourceOf(rec: Awaited<ReturnType<typeof readRecord>>): { doc: Record<string, unknown>; etag: string | null; gone: boolean; typeUri?: string } {
  if (!rec) return { doc: {}, etag: null, gone: true };
  // `typeUri`: what the store says this entity IS (free: it is in the document just read). A card tells a chip's claim from the
  // note records that share its `a:heldParty` by it, without asking the master for a term first.
  return { doc: rec.served?.facts ?? rec.facts, etag: rec.etag ?? null, gone: false, ...(rec.typeUri ? { typeUri: rec.typeUri } : {}) };
}

/** JSON Merge Patch of only the keys given; `null` clears one. */
export async function patchResource(
  id: string,
  facts: Record<string, FactValue | null>,
  vaultId: string,
  entityUri?: string,
): Promise<{ etag: string | null }> {
  const patch: Record<string, MergePatchValue> = {};
  for (const [k, v] of Object.entries(facts)) patch[bare(k)] = v as MergePatchValue;
  return patchRecord(id, patch, entityUri ?? entityUriInVault(vaultId, id));
}

/** Retract one entity (404 = already gone). */
export async function deleteResource(id: string, vaultId: string, entityUri?: string): Promise<void> {
  await deleteRecord(id, entityUri ?? entityUriInVault(vaultId, id));
}

/** One record read by {@link readResources}: its id, its entity URI and its served document ({} when it
 *  did not read). */
export interface ReadResource {
  id: string;
  uri: string;
  doc: Record<string, unknown>;
  /** The store answered 404: the entity is gone (deleted since it was listed or found). */
  gone: boolean;
  /** The entity's type as the store served it, when it said. */
  typeUri?: string;
}

/**
 * Read MANY records, at most {@link MAX_PARALLEL_DEREFERENCES}
 * in flight (the one bounded fan-out, `mapWithConcurrency` of `lws-vault-sets`), ⛔ never one after
 * another. In input order. A record the store answered 404 for comes back `gone`, with an empty `doc`; any
 * other failed read REJECTS. The caller decides what `gone` means.
 */
export async function readResources(uris: readonly string[], vaultId: string): Promise<ReadResource[]> {
  return mapWithConcurrency(uris, MAX_PARALLEL_DEREFERENCES, async (uri) => {
    const id = idFromResourceUri(uri);
    const { doc, gone, typeUri } = await getResource(id, vaultId, uri);
    return { id, uri, doc, gone, ...(typeUri ? { typeUri } : {}) };
  });
}
