// ONE read of the organization's people, shared by the card's short list and the full-list sheet (same query key, same
// cache: the 10 people the card read are the first 10 of the sheet, nothing is read twice).
// The FIRST page asks for 10 records (the short list), every later page is the reader's own page of 50 (`pageParam` carries no limit).
// The people are kept in the order they were read (page by page, each page by name), so a row never jumps when "Show more" adds a page.
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { readOrgEmployeesPage, type OrgEmployee } from "./orgEmployees";
import { INLINE_EMPLOYEES, groupCountText } from "./orgEmployeeSearch";
import { useOrgEmployeesHost } from "./orgEmployeesHost";

type PageParam = { limit?: number; offset?: number | null; memberOffset?: number | null; employmentCounts?: readonly number[]; memberCounts?: readonly number[] };

export function useOrgEmployees(orgUri: string, vaultId: string) {
  const host = useOrgEmployeesHost();
  const q = useInfiniteQuery({
    queryKey: ["mynet", "org-employees", vaultId, orgUri] as const,
    queryFn: ({ pageParam }) => readOrgEmployeesPage(host, orgUri, vaultId, pageParam),
    // The two sources (employments, member-of) page on their own offsets; `null` is "that source is finished".
    initialPageParam: { limit: INLINE_EMPLOYEES } as PageParam,
    getNextPageParam: (last): PageParam | undefined =>
      (last.nextOffset ?? null) === null && (last.nextMemberOffset ?? null) === null
        ? undefined
        : { offset: last.nextOffset ?? null, memberOffset: last.nextMemberOffset ?? null, employmentCounts: last.employmentCounts, memberCounts: last.memberCounts },
    staleTime: 30_000,
    retry: false,
  });
  const pages = q.data?.pages;
  const people = useMemo(() => {
    const byId = new Map<string, OrgEmployee>();
    for (const page of pages ?? []) {
      for (const p of page.employees) {
        const had = byId.get(p.id);
        byId.set(p.id, had ? { ...had, titles: [...new Set([...had.titles, ...p.titles])] } : p);
      }
    }
    return [...byId.values()];
  }, [pages]);
  // The total is the FIRST page's (a source that has finished is not asked again and answers 0, so the last page's total contradicts
  // itself: "1,850 shown of 1,200"); never fewer than the people shown.
  const first = pages?.[0];
  const total = Math.max((first?.total ?? 0) + (first?.memberTotal ?? 0), people.length);
  const leftOut = (pages ?? []).some((p) => p.notListed > 0);
  // A first page of employments naming only people this reader may not read must not hide the group while later
  // pages exist (the readable people may be on page 6). Nothing is hidden silently, and no number of the left-out is given.
  // Clicked through to the end with nobody readable: the group stays and says so, it does not vanish at the last click.
  const clickedThrough = (pages?.length ?? 0) > 1 && people.length === 0 && !q.hasNextPage;
  const shown = people.length > 0 || !!q.hasNextPage || clickedThrough;
  // The sheet draws everything loaded; the card draws its short list (`OrgEmployeesSection` counts that with the same function).
  const count = groupCountText({ shown: people.length, loaded: people.length, hasMore: !!q.hasNextPage, total, noun: "people" });
  return { q, people, total, leftOut, clickedThrough, shown, count, hasMore: !!q.hasNextPage };
}
export type OrgEmployeesRead = ReturnType<typeof useOrgEmployees>;
