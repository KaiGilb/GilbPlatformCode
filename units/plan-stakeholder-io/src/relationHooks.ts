// The relations a record takes part in, as a cached query over the reverse-lookup read. The vault is the one source of truth; this holds nothing of its own.

import { useQuery } from "@tanstack/react-query";
import { readRelations, relationsKey } from "@kaigilb/gilbplatformcode-lws-relations";
import { isTempId } from "@kaigilb/gilbplatformcode-record-cache-kit";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";

/** The relations a record participates in (reverse lookup), for the detail read pane. */
export function useRelations(id: string | null, at: string | null) {
  return useQuery<RecordRelation[], Error>({
    // The door is in the key (`relationsKey`). The pane and the graph must build it the same way or they stop sharing one cache;
    // keyed on the id alone they shared an entry that could not tell an apex 404 from a vault answer.
    queryKey: relationsKey(id, at),
    queryFn: () => readRelations(id!, at),
    enabled: !!id && !isTempId(id),
    staleTime: 15_000,
  });
}
