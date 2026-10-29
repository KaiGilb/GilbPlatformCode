// The fake host of the tests: the providers the hierarchy groups need from the app. The sheet history is a copy of the app's (as in org-employees),
// the logo download answers "gone" (no logo file is fetched), and the picker's query hook is the one the source's own query call was.
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { OrgEmployeesHostContext, type OrgEmployeesHost } from "@kaigilb/gilbplatformcode-org-employees";
import { OrgMarkHostContext, type OrgMarkHost } from "@kaigilb/gilbplatformcode-org-mark";
import { PickerQueryContext, type UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import "./origins";
import { dropStaleSheetEntry, useSheetHistory } from "./sheetHistory";

const NOT_USED = (name: string) => () => {
  throw new Error(`host.${name} was not expected to be called`);
};

/** The OrgEmployeesHost that `OrgShortList` reads: the real sheet history; the employees data members are never reached by the hierarchy groups. */
export const employeesHost: OrgEmployeesHost = {
  readResources: NOT_USED("readResources") as OrgEmployeesHost["readResources"],
  photoReadKeys: NOT_USED("photoReadKeys") as OrgEmployeesHost["photoReadKeys"],
  useSheetHistory,
  dropStaleSheetEntry,
};

/** The logo download answers "gone", so a mark draws its initial. `calls` records what was asked. */
export function markHost(calls: { id: string; at: string | null }[] = []): OrgMarkHost {
  return {
    downloadFileOutcome: async (id, at) => {
      calls.push({ id, at });
      return { kind: "gone", url: "" };
    },
  };
}

/** The picker's query hook: the five options the source passed to its query call, `retry: false` included. */
export const usePickerQuery: UsePickerQuery = ({ key, run, enabled, staleTime }) => {
  const q = useQuery({ queryKey: key, queryFn: run, enabled, staleTime, retry: false });
  return { data: q.data, isFetching: q.isFetching, isError: q.isError, isSuccess: q.isSuccess };
};

/** Every provider the hierarchy groups need besides the QueryClient and the card mode. */
export function Hosts({ children, mark = markHost() }: { children: ReactNode; mark?: OrgMarkHost }) {
  return (
    <OrgEmployeesHostContext.Provider value={employeesHost}>
      <OrgMarkHostContext.Provider value={mark}>
        <PickerQueryContext.Provider value={usePickerQuery}>{children}</PickerQueryContext.Provider>
      </OrgMarkHostContext.Provider>
    </OrgEmployeesHostContext.Provider>
  );
}
