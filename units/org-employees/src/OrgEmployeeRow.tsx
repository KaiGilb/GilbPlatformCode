// One row, shared by the card's short list and the full-list sheet so both draw it the same way: one person of the Employees list,
// with picture, name and title; a tap opens that person.
import type { OrgEmployee } from "./orgEmployees";
import { useOrgEmployeesHost } from "./orgEmployeesHost";

export const EMPLOYEE_FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export function OrgEmployeeRow({ p, vaultId, onOpen }: { p: OrgEmployee; vaultId: string; onOpen: (personId: string) => void }) {
  const { RecordFace } = useOrgEmployeesHost();
  return (
    <button type="button" className={`flex min-h-12 w-full items-center gap-3 py-2 text-left ${EMPLOYEE_FOCUS}`} data-testid="org-employee" onClick={() => onOpen(p.id)}>
      {RecordFace ? (
      <RecordFace
        photoRef={p.photoRef}
        readRecordFor={null}
        vaultId={vaultId}
        name={p.name ?? ""}
        className="size-9 shrink-0"
        fallback={
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-sunken)] text-[13px] font-semibold text-[var(--ink-soft)]">
            {(p.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
          </span>
        }
      />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-[var(--ink)]" data-testid="org-employee-name">
          {p.name ?? "(no name)"}
        </span>
        {p.titles.length > 0 ? (
          <span className="block truncate text-[12.5px] text-[var(--ink-soft)]" data-testid="org-employee-title">
            {p.titles.join(" · ")}
          </span>
        ) : null}
      </span>
    </button>
  );
}
