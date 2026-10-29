// The shapes of the records that persist.ts stores and hands back. They are structural: any app type with these members fits.
// Copied from the source app's shared/vault.ts at the pinned commit (see unit.json), keeping only what persist.ts reads or writes:
//   ListedRecord    shared/vault.ts:17-22   persist.ts reads `entity` (hydrate, line 164); the other members travel with the row so a hydrated row can go back to the app unchanged
//   RecordDoc       shared/vault.ts:25
//   StoreSnapshot   shared/vault.ts:130     persist.ts reads records, cursor, partial and reason (saveStore, hydrate); the source's `reloaded` is not read here, so it is left out
//   StoreEvent      shared/vault.ts:137     persist.ts reads vaultId, type, filterKey, snap and bytes (saveStore)
//   ReachableVault  shared/vault.ts:382     persist.ts reads `vaultId` (hydrate, line 157); the other members travel with the stored list

/** One row of a listing. */
export interface ListedRecord {
  entity: string;
  typeUri: string;
  label?: string;
  updatedAt?: string;
}

/** A dereferenced record. */
export type RecordDoc = Record<string, unknown>;

/** A per-type store's rows and the position they are current to. `reason`, when set on a partial copy, says a failure cut it short. */
export interface StoreSnapshot {
  records: Array<ListedRecord & { body?: RecordDoc }>;
  cursor: string;
  partial: boolean;
  reason?: string;
}

/** Told after a store's rows change, so the copy on the device can keep them. `bytes` is the size estimate the store already keeps. */
export interface StoreEvent {
  vaultId: string;
  type: string;
  filterKey: string;
  snap: StoreSnapshot;
  bytes: number;
}

/** One vault the person reaches. */
export interface ReachableVault {
  vaultId: string;
  modes?: string[];
  name?: string;
  represents?: string | null;
  isLandingVault?: boolean;
  "@id"?: string;
  partOf?: { "@id": string; podId?: string } | null;
}
