import type { ComponentType } from "react";
import type { OrgEmployeesHost, RecordFaceProps } from "@kaigilb/gilbplatformcode-org-employees";
import { dropStaleSheetEntry, useSheetHistory } from "@kaigilb/gilbplatformcode-sheet-history";
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { readResources } from "@kaigilb/gilbplatformcode-vault-resources";
import { photoReadKeysOf, photoTermResolverFor } from "../photoTerm";

export interface OrgEmployeesHostOptions {
  /** The photo term's read keys. Default: the term's resolver for the base origin as it is when asked (GilbApp `photoReadKeys`, photoTerm.ts:37). */
  photoReadKeys?: () => Promise<readonly string[]>;
  /** The face of a record (its photo, else the fallback). Default: none, so a row draws no face and still shows the person's name and titles. */
  RecordFace?: ComponentType<RecordFaceProps>;
}

/**
 * The host of the Employees group (`org-employees`; the value of its context, which `org-hierarchy` also reads): `readResources` is the one of
 * `vault-resources`, `useSheetHistory` and `dropStaleSheetEntry` are those of `sheet-history`, `photoReadKeys` is the photo term's. `RecordFace` is
 * given by the developer or absent.
 */
export function createOrgEmployeesHost(options: OrgEmployeesHostOptions = {}): OrgEmployeesHost {
  return {
    readResources,
    photoReadKeys: options.photoReadKeys ?? (() => photoReadKeysOf(photoTermResolverFor(baseOrigin()))()),
    useSheetHistory,
    dropStaleSheetEntry,
    ...(options.RecordFace ? { RecordFace: options.RecordFace } : {}),
  };
}
