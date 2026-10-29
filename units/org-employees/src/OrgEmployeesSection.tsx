/**
 * The EMPLOYEES group of an organization card: the people whose employment points to this organization, each with name, picture and title,
 * a count, and each entry opening that person. It lists ONLY what THIS viewer may read (`orgEmployees.ts`: the viewer's own
 * authorised read, never a find key, never a wider rung). It is a LIST: nothing is added or removed here (a person's
 * employment is made on the person's card), so the chooser does not offer it.
 * The count is what the viewer can see ("N people shown of M records" while more pages exist); ⛔ it is never a count of people the viewer
 * may not read.
 *
 * An organization with 1000 employees does not get a list of hundreds: the card shows a SHORT list, the first 10 people, with the total; once there are more than 10 it also has a SEARCH box
 * ("Search people") and "Show all N records", which opens the FULL list on its own sheet, 50 at a time. The card first READS 10 records (it used to
 * read 50). The short list, the search and the sheet are `OrgShortList` (shared with Units); this file is the group's frame, count and words.
 */
import { CardGroup } from "@kaigilb/gilbplatformcode-card-group";
import { OrgEmployeeRow } from "./OrgEmployeeRow";
import { OrgShortList } from "./OrgShortList";
import type { ListLabels } from "./OrgListSheet";
import { useOrgEmployees } from "./useOrgEmployees";
import { INLINE_EMPLOYEES, groupCountText } from "./orgEmployeeSearch";

const LABELS: ListLabels = {
  kind: "employees",
  title: "Employees",
  noun: "people",
  searchLabel: "Search people",
  truncated: "Nothing read so far could be shown to you. There are more records; Show all reads the next ones.",
  none: "None of the records could be shown to you.",
  leftOut: "Some entries name people you may not see; they are not listed.",
};

export function OrgEmployeesSection({ orgUri, vaultId, onOpen }: { orgUri: string; vaultId: string; onOpen: (personId: string) => void }) {
  const emp = useOrgEmployees(orgUri, vaultId);
  const { q, shown, count } = emp;
  // The card draws at most 10 rows, so its count is of the rows it draws (the sheet's count, `count`, is of everything loaded).
  const cardCount = groupCountText({ shown: Math.min(emp.people.length, INLINE_EMPLOYEES), loaded: emp.people.length, hasMore: emp.hasMore, total: emp.total, noun: "people" });
  return (
    <CardGroup
      kind="employees"
      testId="org-employees-section"
      title="Employees"
      icon="memberOf"
      addable={false}
      aside={shown ? <span className="text-[12.5px] text-[var(--ink-soft)]" data-testid="org-employees-count">{cardCount}</span> : null}
      empty={!shown && !q.isPending && !q.isError}
    >
      {q.isError ? (
        <p role="alert" className="py-1 text-[12.5px] text-[var(--bad)]" data-testid="org-employees-error">
          The employees could not be read ({q.error instanceof Error ? q.error.message : String(q.error)}). That is not a statement that there are none.
        </p>
      ) : q.isPending ? (
        <p className="py-1 text-[12.5px] text-[var(--ink-faint)]">Reading the employees…</p>
      ) : (
        <OrgShortList
          read={{ q, items: emp.people, hasMore: emp.hasMore, count, clickedThrough: emp.clickedThrough, leftOut: emp.leftOut }}
          labels={LABELS}
          total={emp.total}
          onOpenItem={onOpen}
          renderRow={(p, { open }) => <OrgEmployeeRow p={p} vaultId={vaultId} onOpen={open} />}
          notes={
            <p className="py-1 text-[12px] text-[var(--ink-faint)]" data-testid="org-employees-textonly">
              Lists people whose employment or membership is linked to this organization. An employment that only names the company in text is not linked and is not listed.
            </p>
          }
        />
      )}
    </CardGroup>
  );
}
