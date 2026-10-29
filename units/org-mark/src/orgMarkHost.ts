import { createContext, useContext } from "react";
import type { FileFetchOutcome } from "@kaigilb/gilbplatformcode-file-words";

/**
 * What the host answers for an organization's mark. The member replaces one call of the app and is made when a logo is
 * loaded, never read once at render.
 */
export interface OrgMarkHost {
  /**
   * One byte-read of a file, reporting what happened (a union, never a nullable blob). `opts.maxBytes` bounds the read: when
   * the answer is larger than the bound the host answers `{ kind: "failed", status, url, detail: FILE_TOO_LARGE }` (a body
   * over the bound is also refused by this unit). Replaces `downloadFileOutcome(id, at, opts)` (GilbApp
   * `src/lib/base/files.ts` line 414), called at `src/lib/base/orgCard/orgLogo.ts` line 48.
   */
  downloadFileOutcome(id: string, at: string | null, opts: { maxBytes?: number }): Promise<FileFetchOutcome>;
}

export const OrgMarkHostContext = createContext<OrgMarkHost | null>(null);

/** The host of the mark above this component. Throws, naming the provider, when there is none. */
export function useOrgMarkHost(): OrgMarkHost {
  const host = useContext(OrgMarkHostContext);
  if (!host) throw new Error("OrgMark needs an OrgMarkHostContext.Provider above it (the host's downloadFileOutcome).");
  return host;
}
