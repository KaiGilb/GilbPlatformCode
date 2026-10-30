import type { OrgMarkHost } from "@kaigilb/gilbplatformcode-org-mark";
import { downloadFileOutcome } from "@kaigilb/gilbplatformcode-file-download-outcome";

/** The host of `org-mark` (the value of its context): one byte-read of a file, bounded by `opts.maxBytes`, is `downloadFileOutcome` of `file-download-outcome` (GilbApp `lib/base/files.ts:414`). */
export function createOrgMarkHost(): OrgMarkHost {
  return { downloadFileOutcome };
}
