// Who already requires a record: person Authorities, once their types are known.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { authoritiesOf, personAuthorities, sameRecord } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import { useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { useRelations } from "./relationHooks";
import { STAKEHOLDER_TYPE_SET_QUERY } from "./stakeholderKinds";

function listedType(
  rows: readonly { id: string; entityUri?: string | null; typeUri?: string | null }[],
  uri: string,
): string | null {
  const ref = entityRefFromFact(uri);
  for (const row of rows) {
    if (!row.typeUri) continue;
    if (row.entityUri && (row.entityUri === uri || row.entityUri === ref?.uri || sameRecord(row.entityUri, uri))) {
      return row.typeUri;
    }
    if (ref && row.id === ref.id) return row.typeUri;
    if (row.id === uri) return row.typeUri;
  }
  return null;
}

/**
 * The type of each authority URI. The open vault's list answers first.
 * A URI the list does not hold is read. A disabled read (nothing missing) is not "still loading".
 */
export function useAuthorityTypes(vaultId: string, uris: readonly string[]) {
  const list = useRecords(vaultId || null);
  const rows = list.data ?? [];
  const known = useMemo(() => {
    const map = new Map<string, string>();
    for (const uri of uris) {
      const type = listedType(rows, uri);
      if (type) map.set(uri, type);
    }
    return map;
  }, [rows, uris]);
  const missingKey = useMemo(
    () => uris.filter((uri) => !known.has(uri)).slice().sort().join("\n"),
    [uris, known],
  );
  const missing = missingKey ? missingKey.split("\n") : [];
  const q = useQuery({
    queryKey: ["plan", "stakeholder-type", vaultId, missingKey],
    enabled: missing.length > 0,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const out: Record<string, string> = {};
      await Promise.all(
        missing.map(async (uri) => {
          const ref = entityRefFromFact(uri);
          const rec = await readRecord(ref?.id ?? uri, uri).catch(() => null);
          if (rec?.typeUri) out[uri] = rec.typeUri;
        }),
      );
      return out;
    },
  });
  // A disabled query is isPending with nothing in flight. That is not loading.
  const pending = missing.length > 0 && !q.isSuccess && !q.isError;
  function typeOf(uri: string): string | null {
    return known.get(uri) ?? q.data?.[uri] ?? null;
  }
  return { typeOf, pending, error: q.isError };
}

/** Person Authorities on this record. Pending or error: the caller does not yet know. */
export function usePersonAuthorities(record: { id: string; entityUri?: string | null }, vaultId: string) {
  const relations = useRelations(record.id, record.entityUri ?? null);
  const kinds = useQuery(STAKEHOLDER_TYPE_SET_QUERY);
  const auths = useMemo(() => authoritiesOf(relations.data), [relations.data]);
  const uris = useMemo(() => auths.map((a) => a.uri), [auths]);
  const types = useAuthorityTypes(vaultId, uris);
  const people = useMemo(
    () => personAuthorities(relations.data, types.typeOf, kinds.data),
    [relations.data, types.typeOf, kinds.data],
  );
  return {
    people,
    pending: relations.isPending || types.pending || kinds.isPending,
    error: relations.isError || types.error,
  };
}
