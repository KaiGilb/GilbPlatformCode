// The fake host of the tests: the real sheet-history behaviour (a copy of the app's), a face that draws its fallback, and reads that either
// answer from a small in-memory world or fail loudly.
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import type { OrgEmployeesHost, ReadResource } from "../src/orgEmployeesHost";
import { dropStaleSheetEntry, useSheetHistory } from "./sheetHistory";

// The platform origin is a setting every unit reads; the tests name the example host.
setBaseOrigin("https://example.test");

const NOT_USED = (name: string) => () => {
  throw new Error(`host.${name} was not expected to be called`);
};

/** A host whose data members fail when called: for tests that inject every read and so must never reach the host. */
export function strictHost(over: Partial<OrgEmployeesHost> = {}): OrgEmployeesHost {
  return {
    readResources: NOT_USED("readResources") as OrgEmployeesHost["readResources"],
    photoReadKeys: NOT_USED("photoReadKeys") as OrgEmployeesHost["photoReadKeys"],
    resolveEmploymentLinkVocab: NOT_USED("resolveEmploymentLinkVocab") as OrgEmployeesHost["resolveEmploymentLinkVocab"],
    useSheetHistory,
    dropStaleSheetEntry,
    ...over,
  };
}

/** A host for the component tests: the face draws only its fallback (no photo is fetched), the sheet history is the real one. */
export function fakeHost(over: Partial<OrgEmployeesHost> = {}): OrgEmployeesHost {
  return strictHost({ RecordFace: ({ fallback }) => <>{fallback}</>, ...over });
}

/** An in-memory store of served documents, for the host's `readResources`: a missing address comes back gone, as a 404 does. */
export function memoryResources(docs: Record<string, Record<string, unknown>>, log: string[][] = []): OrgEmployeesHost["readResources"] {
  return async (uris, _vaultId): Promise<ReadResource[]> => {
    log.push([...uris]);
    return uris.map((uri) => {
      const id = uri.split("/").pop()!;
      const doc = docs[uri];
      return doc ? { id, uri, doc, gone: false } : { id, uri, doc: {}, gone: true };
    });
  };
}
