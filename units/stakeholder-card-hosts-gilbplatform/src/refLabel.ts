// The label of an entity address shown in a field of the held card: the name of the record it points at, from the loaded list, else one read.
// This is the hook of the `entity-ref-value` README example (GilbApp: `useResolvedRefLabel`, components/records/EntityRefValue.tsx:18-46), over the
// units' `useRecords`, `readRecord`, `vaultOriginOf`, `needsMainTag` and `useMainTag`. The rules are the example's.

import { useQuery } from "@tanstack/react-query";
import { refDisplayName, type UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { needsMainTag, useMainTag } from "@kaigilb/gilbplatformcode-main-tag";
import { useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

/** A HOOK: the name of the record an address points at; null while it is being read. A hit in the loaded list wins; a read that fails is named by the address itself. */
export const useRefLabel: UseRefLabel = (ref, vaultId) => {
  const list = useRecords(vaultId);
  const fromList = ref ? (list.data ?? []).find((r) => r.id === ref.id || r.entityUri === ref.uri) : undefined;
  const cached = fromList ? refDisplayName(fromList.facts, fromList.entityUri) : null;

  const q = useQuery({
    queryKey: ["base", "record", ref?.id ?? "", vaultOriginOf(ref?.uri ?? null)],
    queryFn: () => readRecord(ref!.id, ref!.uri),
    enabled: !!ref && !cached,
    staleTime: 30_000,
  });

  // A record with no label, name or `unitTag`/`tag` is named by its MAIN tag. Only such a record asks; a named one costs no request.
  const facts = fromList?.facts ?? q.data?.facts;
  const main = useMainTag(ref && facts && needsMainTag(facts) ? ref.uri : null);
  const mainTag = main.data?.known ? main.data.tag : null;

  if (fromList) return refDisplayName(fromList.facts, fromList.entityUri, mainTag);
  if (q.isPending) return null;
  if (q.data) return refDisplayName(q.data.facts, q.data.entityUri || ref?.uri, mainTag);
  return ref ? refDisplayName(null, ref.uri) : null;
};
