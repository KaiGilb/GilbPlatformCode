// @vitest-environment node
// New. Pins the entry point (the four exports; `vault-profile-photo` imports `downloadFile` from here) and the signatures the hosts name.
import { expect, it } from "vitest";
import * as unit from "./index";
import { downloadFile, downloadFileOutcome, FILE_RESOURCE_URL, FILE_TOO_LARGE } from "./index";
import type { FileFetchOutcome } from "@kaigilb/gilbplatformcode-file-words";

it("exports exactly downloadFile, downloadFileOutcome, FILE_RESOURCE_URL and FILE_TOO_LARGE", () => {
  expect(Object.keys(unit).sort()).toEqual(["FILE_RESOURCE_URL", "FILE_TOO_LARGE", "downloadFile", "downloadFileOutcome"]);
});
it("FILE_TOO_LARGE is 'too large', equal to org-mark's copy", () => {
  expect(FILE_TOO_LARGE).toBe("too large");
});
it("downloadFileOutcome fits org-mark's host member, downloadFile takes two arguments", () => {
  type Member = (id: string, at: string | null, opts: { maxBytes?: number }) => Promise<FileFetchOutcome>;
  const asMember: Member = downloadFileOutcome; // compile-time: assignable
  expect(asMember).toBe(downloadFileOutcome);
  expect(downloadFileOutcome.length).toBe(2); // the third parameter has a default
  expect(downloadFile.length).toBe(2);
  expect(FILE_RESOURCE_URL.length).toBe(2);
});
