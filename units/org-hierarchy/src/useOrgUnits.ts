// ONE read of the organization's units, shared by the card's short list and the full-list sheet
// (same query key, same cache). The FIRST page asks for 10 units, every later page is the reader's own page of 50; a page is the unit records only
// (a unit's count is its own lazy read, `readUnitEmployments`, for the ten rows of the card). Units are kept in the order read (page by page).
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { INLINE_EMPLOYEES, groupCountText } from "@kaigilb/gilbplatformcode-org-employees";
import { readOrgUnitsPage, type OrgUnit } from "./orgUnits";
import { orgKey } from "./orgHierarchy";

type PageParam = { offset: number; limit?: number; counts?: readonly number[] };

export function useOrgUnits(orgUri: string, vaultId: string) {
  const q = useInfiniteQuery({
    queryKey: ["mynet", "org-units", vaultId, orgUri] as const,
    queryFn: ({ pageParam }) => readOrgUnitsPage(orgUri, vaultId, pageParam),
    initialPageParam: { offset: 0, limit: INLINE_EMPLOYEES } as PageParam,
    getNextPageParam: (last): PageParam | undefined => (last.nextOffset === null ? undefined : { offset: last.nextOffset, counts: last.counts }),
    staleTime: 30_000,
    retry: false,
  });
  const pages = q.data?.pages;
  const units = useMemo(() => {
    const all: OrgUnit[] = (pages ?? []).flatMap((p) => p.units);
    return all.filter((u, i) => all.findIndex((x) => orgKey(x.uri) === orgKey(u.uri)) === i);
  }, [pages]);
  // The first page's total, never fewer than the units shown.
  const total = Math.max(pages?.[0]?.total ?? 0, units.length);
  // 🔴 A first page of units this reader may not read must not hide the group while later pages exist.
  // Clicked through to the end with no readable unit: the group stays and says so.
  const clickedThrough = (pages?.length ?? 0) > 1 && units.length === 0 && !q.hasNextPage;
  const shown = units.length > 0 || !!q.hasNextPage || clickedThrough;
  const count = groupCountText({ shown: units.length, loaded: units.length, hasMore: !!q.hasNextPage, total, noun: "units" });
  return { q, units, total, clickedThrough, shown, count, hasMore: !!q.hasNextPage };
}
