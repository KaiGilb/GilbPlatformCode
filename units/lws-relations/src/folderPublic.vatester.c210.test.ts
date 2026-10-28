/**
 * C210 GPLAT210.5 — VATester gap tests for the folder-public cascade (independent QA, not the builder's).
 * Spec: [[3P.F.Share.FolderPublicReachesContents.GilbPlatform]] SC1.
 *
 * Gap: every builder arm calls `inheritFolderPublic` with bare ids. One shipped caller does not:
 * `RelationEditPane` "change join kind" mints the successor with `sourceId: doc.sourceUri` and
 * `targetId: doc.targetUri` — FULL URIs — and `writePairRelation` hands those straight to the hook.
 * Retyping a link into `t:PartOf` of a PUBLIC folder is "an item linked into a public folder later".
 *
 * Same stubs as folderPublic.c210.test.ts: the membership reader, the relation listing and the
 * relation-document parser are REAL; only fetch, auth, the record read and the four grant acts are stubbed.
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
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<Record<string, unknown>>()), readRecord: rec.readRecord }));

import { inheritFolderPublic } from "./folderPublic";
import { publicGrantee } from "./publicAccess";
import { setUp, tearDown } from "../test/support";
import { uriTail } from "./relations";

const H = "https://t.platform.example.test";
const V = `${H}/vault`;
const e = (id: string) => `${H}/vault/e/${id}`;
const r = (id: string) => `${H}/vault/r/${id}`;
const FOLDER_TYPE = "https://platform.example.test/base/t/VirtualFolder";
const NOTE_TYPE = "https://platform.example.test/base/t/NoteDocument";

const links = [{ id: "r9", type: "t:PartOf", source: "late", target: "top" }];

beforeEach(() => {
  setUp().tokenManager.getSession.mockResolvedValue(null as never);
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const rel = u.match(/\/e\/([^/]+)\/relations$/);
      if (rel) {
        const id = rel[1]!;
        const relations = links
          .filter((l) => l.source === id || l.target === id)
          .map((l) => ({ relation: r(l.id), role: l.target === id ? "role:target" : "role:source" }));
        return { ok: true, status: 200, json: async () => ({ member: e(id), relations }), text: async () => "" };
      }
      const doc = u.match(/\/r\/([^/?]+)$/);
      const l = doc ? links.find((x) => x.id === doc[1]) : undefined;
      if (l) {
        const body = { "@id": r(l.id), "@type": l.type, "role:source": { "@id": e(l.source) }, "role:target": { "@id": e(l.target) } };
        return { ok: true, status: 200, json: async () => body, text: async () => "" };
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    }),
  );
  // The record read accepts an id OR a full URI (the app's readRecord does), so the fixture keys on the tail.
  rec.readRecord.mockImplementation(async (idOrUri: string) => {
    const id = uriTail(idOrUri);
    return { id, typeUri: id === "top" ? FOLDER_TYPE : NOTE_TYPE, facts: id === "top" ? { directReader: publicGrantee() } : {} };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("inheritFolderPublic — the RelationEditPane retype caller (full URIs)", () => {
  it("CONTROL — bare ids (the form the builder tested): member and link both made public", async () => {
    const failed = await inheritFolderPublic({ folderId: "top", folderDoor: e("top"), memberId: "late", relationId: "r9", vaultNamespace: V });
    expect(failed).toEqual([]);
    expect(share.grantPublicOnRelation).toHaveBeenCalledWith(r("r9"));
  });

  it("SC1 — full URIs, as RelationEditPane passes them: the new LINK is made public too, nothing left unsaid", async () => {
    const failed = await inheritFolderPublic({ folderId: e("top"), folderDoor: e("top"), memberId: e("late"), relationId: "r9", vaultNamespace: V });
    expect(share.shareEntity).toHaveBeenCalledTimes(1);
    expect(failed).toEqual([]);
    expect(share.grantPublicOnRelation).toHaveBeenCalledWith(r("r9"));
  });
});
