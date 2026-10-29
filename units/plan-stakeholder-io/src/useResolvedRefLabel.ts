// The name a link to a record shows: from the vault's loaded list when it holds the record, else from one read of the record.

import { useQuery } from "@tanstack/react-query";
import { refDisplayName } from "@kaigilb/gilbplatformcode-entity-ref-value";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { needsMainTag, useMainTag } from "@kaigilb/gilbplatformcode-main-tag";
import { useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

export function useResolvedRefLabel(ref: { id: string; uri: string } | null, vaultId: string) {
  const list = useRecords(vaultId);
  const fromList = ref
    ? (list.data ?? []).find(
        (r) => r.id === ref.id || r.entityUri === ref.uri,
      )
    : undefined;
  const cached = fromList ? refDisplayName(fromList.facts, fromList.entityUri) : null;

  const q = useQuery({
    queryKey: ["base", "record", ref?.id ?? "", vaultOriginOf(ref?.uri ?? null)],
    queryFn: () => readRecord(ref!.id, ref!.uri),
    enabled: !!ref && !cached,
    staleTime: 30_000,
  });

  // A record with no label, name or `unitTag`/`tag` is named by its MAIN tag (the same cache entry the Tags section
  // changes). Only such a record asks; a named one costs no request.
  const facts = fromList?.facts ?? q.data?.facts;
  const main = useMainTag(ref && facts && needsMainTag(facts) ? ref.uri : null);
  const mainTag = main.data?.known ? main.data.tag : null;

  // A hit in the loaded list wins even when the follow-up read is still pending (a disabled
  // query stays pending). An empty read still names the link's own address, not "Untitled".
  if (fromList) return refDisplayName(fromList.facts, fromList.entityUri, mainTag);
  if (q.isPending) return null;
  if (q.data) return refDisplayName(q.data.facts, q.data.entityUri || ref?.uri, mainTag);
  return ref ? refDisplayName(null, ref.uri) : null;
}
