// The few members that no extracted unit holds as a function. Each is written here from the call site the host interface names
// (GilbApp dcfc18b3, KaiGilb/GilbApp), with the same arguments and the same keys, and composed only of functions the pilot units export.

import { useQuery } from "@tanstack/react-query";
import { readRecord, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { readRelationDoc } from "@kaigilb/gilbplatformcode-lws-relations";
import { pageAttributeIds } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";
import { refDisplayName } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { PickerQueryArgs, PickerQueryResult } from "@kaigilb/gilbplatformcode-record-picker";

/** The vault an entity IRI belongs to (`https://h/base/e/x` is `https://h/base`), or null. Copied from `src/lib/base/picture.ts:73-76` (`vaultIdOfEntity`). */
function vaultIdOfEntity(entity: string): string | null {
  const i = entity.lastIndexOf("/e/");
  return i > 0 ? entity.slice(0, i) : null;
}

/**
 * Whether any record in this vault already holds `tag`. The find is asked at the vault's host, which can hold more than one vault, so
 * only the ids whose vault is this one count. A failed find throws: it is not "free".
 * Copied from `src/lib/base/planLinks.ts:222-230` (`tagUsedInVault`), where it is the one call behind PlanTagLinks.tsx:99 and
 * PlanDescriptionParts.tsx:706.
 */
export async function tagUsedInVault(vaultId: string, tag: string): Promise<boolean> {
  const want = vaultId.replace(/\/+$/, "");
  const inThisVault = (id: string): boolean => {
    const home = vaultIdOfEntity(id);
    return home !== null && home.replace(/\/+$/, "") === want;
  };
  const page = await pageAttributeIds("a:unitTag", tag, vaultOriginOf(vaultId), { until: inThisVault });
  return page.ids.some(inThisVault);
}

/**
 * The live label of a linked record: its a:unitTag, else its name; null while it is being read.
 * Copied from `src/components/records/PlanValueLines.tsx:448-466` (`useLinkLabel`; its comment is line 447), the member `useLinkLabel` of the Value lines host.
 */
export function useLinkLabel(uri: string | undefined, vaultId: string): string | null {
  const ref = uri ? entityRefFromFact(uri) : null;
  const list = useRecords(vaultId);
  const hit = ref ? (list.data ?? []).find((r) => r.id === ref.id || r.entityUri === ref.uri) : undefined;
  const named = (facts: Record<string, string> | null | undefined, u: string | null | undefined) =>
    facts?.unitTag?.trim() || refDisplayName(facts, u);
  const cached = hit ? named(hit.facts, hit.entityUri) : null;
  const q = useQuery({
    queryKey: ["base", "record", ref?.id ?? "", vaultOriginOf(ref?.uri ?? null)],
    queryFn: () => readRecord(ref!.id, ref!.uri),
    enabled: !!ref && !cached,
    staleTime: 30_000,
  });
  if (!ref) return uri ?? null;
  if (cached) return cached;
  if (q.isPending) return null;
  if (q.data) return named(q.data.facts, q.data.entityUri || ref.uri);
  return refDisplayName(null, ref.uri);
}

/**
 * The cached read of one record that the record-name hook fills; it never fetches on its own (`enabled: false`).
 * Copied from `PlanStakeholders.tsx:134-139`, the member `useRecordRead` of the Stakeholder lines host.
 */
export function useRecordRead(
  ref: { id: string; uri: string } | null,
  uri: string,
): { data?: BaseRecord | null } {
  return useQuery({
    queryKey: ["base", "record", ref?.id ?? "", vaultOriginOf(ref?.uri ?? uri)],
    queryFn: () => readRecord(ref!.id, ref!.uri),
    enabled: false,
    staleTime: 30_000,
  });
}

/** The relation document of one Authority relation. Copied from `PlanStakeholders.tsx:537-543`, the member `useRelationDoc` of the Stakeholder lines host. */
export function useAuthorityRelationDoc(relation: string | null, planVault: string) {
  return useQuery({
    queryKey: ["plan", "authority-relation", relation ?? ""],
    queryFn: () => readRelationDoc(relation!, planVault),
    enabled: !!relation,
    staleTime: 15_000,
    retry: false,
  });
}

/** The relation document of one Impact. Copied from `PlanImpacts.tsx:397-402`, the member `useRelationDoc` of the Impacts host. */
export function useImpactRelationDoc(relation: string, planVault: string) {
  return useQuery({
    queryKey: ["plan-impact", relation],
    queryFn: () => readRelationDoc(relation, planVault),
    staleTime: 15_000,
    retry: false,
  });
}

/** The pickers' query hook. Copied from `orgCard/OrgRecordPicker.tsx:144-150`, the member `usePickerQuery`. */
export function usePickerQuery(a: PickerQueryArgs): PickerQueryResult {
  return useQuery({
    queryKey: a.key,
    queryFn: a.run,
    enabled: a.enabled,
    staleTime: a.staleTime,
    retry: false,
  });
}
