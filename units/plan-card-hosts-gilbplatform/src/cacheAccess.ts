// The cache calls the hosts share, written inline at the call sites of the source (GilbApp dcfc18b3, src/components/records/ and
// src/lib/base/). Each is one expression on the query client with the key helper of the cache kit. They are click-time reads and
// writes: they take the client from the factory and read it again on every call.

import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { idFromEntityUri } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import {
  planFindKey,
  planFindVaultKey,
  planRecordKey,
  recordsKey,
  STAKEHOLDER_SEARCH_AUTHORITY_KEY,
  type PlanFind,
  type RecordsPage,
} from "@kaigilb/gilbplatformcode-record-cache-kit";
import { relationsKey } from "@kaigilb/gilbplatformcode-lws-relations";
import { stakeholderTypeSetQueryKey } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { StakeholderTypeSet } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";

type RelationsNext = RecordRelation[] | ((prev: RecordRelation[] | undefined) => RecordRelation[]);

export function cacheAccess(qc: QueryClient) {
  return {
    /** PlanFunctionForm.tsx:624, :631 */
    getRelations: (id: string, at: string | null): RecordRelation[] | undefined =>
      qc.getQueryData<RecordRelation[]>(relationsKey(id, at)),
    /** PlanFunctionForm.tsx:632, :876 */
    setRelations: (id: string, at: string | null, next: RelationsNext): void => {
      qc.setQueryData<RecordRelation[]>(relationsKey(id, at), next);
    },
    /** PlanFunctionForm.tsx:846, :1418 */
    getKindSet: (): StakeholderTypeSet | undefined => qc.getQueryData<StakeholderTypeSet>(stakeholderTypeSetQueryKey()),
    /** PlanFunctionForm.tsx:645 */
    setRecordRead: (id: string, at: string, row: BaseRecord): void => {
      qc.setQueryData(planRecordKey(id, at), row);
    },
    /** PlanFunctionForm.tsx:1468 */
    invalidateAuthoritySearch: (): Promise<void> =>
      qc.invalidateQueries({ queryKey: STAKEHOLDER_SEARCH_AUTHORITY_KEY, refetchType: "active" }),
    /** PlanTagLinks.tsx:116 */
    invalidateSearch: (queryKey: readonly unknown[]): Promise<void> => qc.invalidateQueries({ queryKey }),
    /** PlanStakeholders.tsx:198 */
    invalidateFilters: (filters: { queryKey: readonly unknown[]; refetchType?: "active" }): Promise<void> =>
      qc.invalidateQueries(filters),
    /** PlanImpacts.tsx:81, :84 */
    getRecordPages: (vaultId: string): InfiniteData<RecordsPage> | undefined =>
      qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId)),
    /** PlanImpacts.tsx:88 */
    setRecordPages: (vaultId: string, pages: InfiniteData<RecordsPage>): void => {
      qc.setQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId), pages);
    },
    /** PlanDescriptionParts.tsx:377 */
    cachedRecords: (vaultId: string): BaseRecord[] =>
      qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId))?.pages.flatMap((p) => p.records) ?? [],
    /** valueChildRecords.ts:102, PlanDescriptionParts.tsx:488 */
    getFind: (vaultId: string, attr: string, id: string): PlanFind | undefined =>
      qc.getQueryData<PlanFind>(planFindKey(vaultId, attr, id)),
    /** PlanDescriptionParts.tsx:997 */
    getFinds: (vaultId: string): readonly (PlanFind | undefined)[] =>
      qc.getQueriesData<PlanFind>({ queryKey: planFindVaultKey(vaultId) }).map(([, data]) => data),
    /** PlanDescriptionParts.tsx:489 */
    setFind: (vaultId: string, attr: string, id: string, value: PlanFind): void => {
      qc.setQueryData<PlanFind>(planFindKey(vaultId, attr, id), value);
    },
    /** planLevelRead.ts:53 */
    markStale: (entity: string): Promise<void> =>
      qc.invalidateQueries({ queryKey: planRecordKey(idFromEntityUri(entity), entity), refetchType: "none" }),
  };
}
