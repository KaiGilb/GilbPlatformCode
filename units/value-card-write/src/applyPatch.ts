// The row of a list with a patch applied to it. Copied from the app unchanged (see the README).

import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { isFactStringFaithful } from "@kaigilb/gilbplatformcode-fact-faithful";
import type { MergePatchValue } from "./writeSource";

export type PlanRowPatch = Record<string, MergePatchValue>;

function editorString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(editorString).join(", ");
  if (typeof value === "object" && "@id" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["@id"]);
  }
  return "";
}

export function applyPatch(
  row: GridRecord,
  patch: PlanRowPatch,
  etag: string | null,
  opts?: { keepOpaque?: boolean },
): GridRecord {
  const facts = { ...row.facts };
  const servedFacts = { ...(row.served?.facts ?? {}) };
  let opaque = [...(row.opaqueFacts ?? [])];
  for (const [slug, value] of Object.entries(patch)) {
    if (value === null) {
      delete facts[slug];
      delete servedFacts[slug];
      if (!opts?.keepOpaque) opaque = opaque.filter((k) => k !== slug);
      continue;
    }
    servedFacts[slug] = value;
    facts[slug] = editorString(value);
    if (opts?.keepOpaque) continue;
    if (!isFactStringFaithful(value)) {
      if (!opaque.includes(slug)) opaque.push(slug);
    } else opaque = opaque.filter((k) => k !== slug);
  }
  const servedKeys = [
    ...(row.servedKeys ?? []).filter((k) => patch[k] !== null),
    ...Object.keys(patch).filter((k) => patch[k] !== null && !(row.servedKeys ?? []).includes(k)),
  ];
  return {
    ...row,
    facts,
    opaqueFacts: opaque,
    servedKeys,
    etag,
    served: {
      facts: servedFacts,
      context: row.served?.context,
      etag,
      ...(row.served?.prefixedKeys ? { prefixedKeys: row.served.prefixedKeys } : {}),
    },
  };
}
