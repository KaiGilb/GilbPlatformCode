/**
 * C210 GPLAT210.5 round 3 — VATester: the add-later hook reads the member at the member's OWN door
 * (BVedanta N6, fixed in edf8743).
 *
 * Gap: the fix builds the door as `memberEntityUri ?? (memberId is a URI ? memberId : null) ?? vault`.
 * The middle arm (a caller that passes the member's full URI as `memberId` and no `memberEntityUri`)
 * had no test: removing it turned 0 of 31 folder-public tests red (mutant N6-M3). The control pins
 * the old door for a bare id, so the fix did not move the ordinary case.
 * Spec: [[3P.F.Share.FolderPublicReachesContents.GilbPlatform]] SC1 (items added later).
 * Harness trimmed from folderPublic.c210.test.ts (the record read and the grant acts are stubbed).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const share = vi.hoisted(() => ({
  shareEntity: vi.fn(async (..._a: unknown[]) => ({ granted: true, mode: "read" as const })),
  revokeEntityShare: vi.fn(async (..._a: unknown[]) => undefined),
  grantPublicOnRelation: vi.fn(async (..._a: unknown[]) => undefined),
  revokePublicOnRelation: vi.fn(async (..._a: unknown[]) => undefined),
}));
vi.mock("./entityShare", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  shareEntity: share.shareEntity,
  revokeEntityShare: share.revokeEntityShare,
  grantPublicOnRelation: share.grantPublicOnRelation,
  revokePublicOnRelation: share.revokePublicOnRelation,
}));
const rec = vi.hoisted(() => ({ readRecord: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readRecord: rec.readRecord,
}));

import { inheritFolderPublic } from "./folderPublic";
import { publicGrantee } from "./publicAccess";
import { setUp, tearDown } from "../test/support";

const H = "https://t.platform.example.test";
const V = `${H}/vault`;
const e = (id: string) => `${H}/vault/e/${id}`;
const r = (id: string) => `${H}/vault/r/${id}`;
const OTHER = "https://other.platform.example.test/vault/e/late";
const NOTE_TYPE = "https://platform.example.test/base/t/NoteDocument";
const FOLDER_TYPE = "https://platform.example.test/base/t/VirtualFolder";

beforeEach(() => {
  setUp().tokenManager.getSession.mockResolvedValue(null as never);
  vi.clearAllMocks();
  share.shareEntity.mockImplementation(async () => ({ granted: true, mode: "read" as const }));
  share.grantPublicOnRelation.mockImplementation(async () => undefined);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" })));
  // The folder "top" is public; the member is a plain note.
  rec.readRecord.mockImplementation(async (id: string) => ({
    id,
    typeUri: id === "top" ? FOLDER_TYPE : NOTE_TYPE,
    facts: id === "top" ? { directReader: publicGrantee() } : {},
  }));
});

const memberReadDoor = () => rec.readRecord.mock.calls.find((c) => c[0] === "late")?.[1];

afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("VATester r3 — N6: the member's door when the caller gives only its full URI", () => {
  it("memberId is the member's full URI and no memberEntityUri → read at that URI, not the pane's vault", async () => {
    const failed = await inheritFolderPublic({
      folderId: "top", folderDoor: e("top"), memberId: OTHER, relationId: "r9", relationUri: r("r9"), vaultNamespace: V,
    });
    expect(memberReadDoor()).toBe(OTHER);
    expect(failed).toEqual([]);
    expect(share.grantPublicOnRelation).toHaveBeenCalledWith(r("r9"));
  });

  it("CONTROL — a bare member id and no memberEntityUri → read at the pane's vault (unchanged)", async () => {
    await inheritFolderPublic({
      folderId: "top", folderDoor: e("top"), memberId: "late", relationId: "r9", relationUri: r("r9"), vaultNamespace: V,
    });
    expect(memberReadDoor()).toBe(V);
  });
});
