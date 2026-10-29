// Compile-time check, test-only (not in the package `files`; `npm run typecheck` includes it).
// The source app's real shared/vault.ts types, read from the frozen copy of the app, must be assignable to this unit's structural types,
// and what the unit hands back from `hydrate` must be assignable to the app's store seed and vault-list seed.
import type { ListedRecord as AppListedRecord, ReachableVault as AppReachableVault, RecordDoc as AppRecordDoc, StoreEvent as AppStoreEvent, TypeStore } from "../../../../../.grok-runs/sharespeed/freeze-a1f65a5b/shared/vault";
import type { Hydrated } from "../src/persist";
import type { ListedRecord, ReachableVault, RecordDoc, StoreEvent } from "../src/types";

type Assignable<From, To> = [From] extends [To] ? true : false;
const yes = <T extends true>(): T | undefined => undefined;

yes<Assignable<AppListedRecord, ListedRecord>>();
yes<Assignable<AppRecordDoc, RecordDoc>>();
yes<Assignable<AppReachableVault, ReachableVault>>();
yes<Assignable<AppStoreEvent, StoreEvent>>();
// and back: a hydrated store snapshot seeds the app's store, a hydrated vault list is the app's list
yes<Assignable<Hydrated["stores"][number]["snap"], Parameters<TypeStore["seed"]>[0]>>();
yes<Assignable<NonNullable<Hydrated["vaults"]>, AppReachableVault[]>>();
yes<Assignable<ReachableVault, AppReachableVault>>();
yes<Assignable<ListedRecord, AppListedRecord>>();

// A negative control: the check can fail. A record without `entity` is not a ListedRecord.
yes<Assignable<{ typeUri: string }, ListedRecord> extends true ? false : true>();
