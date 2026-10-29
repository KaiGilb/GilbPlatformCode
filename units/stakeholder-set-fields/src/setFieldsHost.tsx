/**
 * What the Relations and Contact-preferences fields need from the app that is in no unit: the one-key writer of a record's fact,
 * used by a link's remove control. It is optional (a writer): a host without it gets the fields read-only, and no remove control is drawn.
 * The add of a reference needs no member (it goes through the checked write of `holder-reference`).
 *
 * Without a provider the answer is the empty host, so the fields are read-only (this differs from the host contexts of the library
 * that have a required member and throw without a provider).
 *
 * Module state: `StakeholderSetFieldsHostContext` is one React context. Two installed copies of this unit would not see each other's provider.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { CardReferencesHost } from "@kaigilb/gilbplatformcode-card-references";

/** The host's members. Each is optional. */
export interface StakeholderSetFieldsHost {
  /**
   * The one-key writer of a record's fact. Used by a link's remove, looked up and called when the remove runs, once per spelling, awaited.
   * Replaces `changeRecordFactItems(recordId, recordEntityUri, factKey, change, notChanged)` (GilbApp `src/lib/base/recordFactItems.ts` line 55),
   * which `useRemoveCardReference` called at `src/lib/base/useAddCardReference.ts` line 60 (used at `src/components/records/StakeholderSetFields.tsx` line 138).
   * Absent: no remove control is drawn.
   */
  changeRecordFactItems?: CardReferencesHost["changeRecordFactItems"];
}

const NO_HOST: StakeholderSetFieldsHost = {};
const StakeholderSetFieldsHostContext = createContext<StakeholderSetFieldsHost>(NO_HOST);

export function StakeholderSetFieldsHostProvider({ host, children }: { host: StakeholderSetFieldsHost; children: ReactNode }) {
  return <StakeholderSetFieldsHostContext.Provider value={host}>{children}</StakeholderSetFieldsHostContext.Provider>;
}

/** The host's members, or none (an empty object) when no provider is above. */
export function useStakeholderSetFieldsHost(): StakeholderSetFieldsHost {
  return useContext(StakeholderSetFieldsHostContext);
}
