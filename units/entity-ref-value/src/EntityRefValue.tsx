// Human label for a `/base/e/` fact (member-of parent, etc.). The URI stays
// visible as a subline so the stored pointer is not hidden.

import { createContext, useContext } from "react";
import { entityRefFromFact } from "@kaigilb/gilbplatformcode-entity-ref";

export type UseRefLabel = (ref: { id: string; uri: string } | null, vaultId: string) => string | null;
export const RefLabelContext = createContext<UseRefLabel | null>(null);

export function EntityRefValue({
  value,
  vaultId,
  onOpen,
  quiet = false,
}: {
  value: string;
  vaultId: string;
  onOpen?: (id: string) => void;
  /** Card look: the stored address is not drawn under the name (presentation reads the name only). */
  quiet?: boolean;
}) {
  const parsed = entityRefFromFact(value);
  const useRefLabel = useContext(RefLabelContext);
  if (!useRefLabel) throw new Error("entity-ref-value: wrap the app in <RefLabelContext.Provider value={useRefLabel}>");
  const label = useRefLabel(parsed, vaultId);
  if (!parsed) return <span className="break-words">{value}</span>;
  const shown = label ?? "…";
  return (
    <span className="flex flex-col gap-0.5 min-w-0">
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(parsed.id)}
          className="text-left text-[14px] font-medium text-[var(--ink)] hover:text-[var(--accent)] truncate"
          title={value}
        >
          {shown}
        </button>
      ) : (
        <span className="text-[14px] font-medium text-[var(--ink)] truncate" title={value}>
          {shown}
        </span>
      )}
      {quiet ? null : (
        <span className="text-[11px] text-[var(--ink-ghost)] truncate" title={value}>
          {value}
        </span>
      )}
    </span>
  );
}

export function isEntityRefValue(value: string): boolean {
  return entityRefFromFact(value) !== null;
}
