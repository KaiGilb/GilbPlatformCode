/**
 * C210 GPLAT210.5 RE-GATE — VATester round-2 gap test for the TYPED listing path (VAScaling S3b).
 * Spec: [[3P.F.Share.FolderPublicReachesContents.GilbPlatform]] SC1 (what the folder's act makes public).
 *
 * Gap: `listFolderPartMembers` now takes a typed `/relations` row's members as they come and keeps a
 * member only when its role is `role:source`. Every fixture (builder's and mine) gives a part-of link
 * exactly two members — source and target — so that filter is masked by the `memberId !== folderId`
 * check (mutation A-M9 survived). A relation with a THIRD role member would have that member made
 * PUBLIC by "make this folder public" if the filter were lost. This arm pins it.
 *
 * Same stubs as folderPublic.vatester.c210.test.ts: listing reader and parser REAL; fetch, auth, the
 * record read and the four grant acts stubbed.
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

import { setFolderTreePublic } from "./folderPublic";
import { uriTail } from "./relations";
import { setUp, tearDown } from "../test/support";

const H = "https://t.platform.example.test";
const V = `${H}/vault`;
const e = (id: string) => `${H}/vault/e/${id}`;
const r = (id: string) => `${H}/vault/r/${id}`;
const FOLDER_TYPE = "https://platform.example.test/base/t/VirtualFolder";
const NOTE_TYPE = "https://platform.example.test/base/t/NoteDocument";
const PART_OF_IRI = "https://ontology.example.test/base/t/PartOf";

/** The folder's typed listing: one part-of link whose row ALSO names a third-role member. */
let extraRole: string;

beforeEach(() => {
  setUp().tokenManager.getSession.mockResolvedValue(null as never);
  vi.clearAllMocks();
  extraRole = "role:agent";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const m = u.match(/\/e\/([^/]+)\/relations$/);
      if (m && m[1] === "top") {
        const relations = [
          {
            relation: r("rX"),
            role: "role:target",
            type: PART_OF_IRI,
            members: [
              { member: e("item"), role: "role:source" },
              { member: e("top"), role: "role:target" },
              { member: e("bystander"), role: extraRole },
            ],
          },
        ];
        return { ok: true, status: 200, json: async () => ({ member: e("top"), relations }), text: async () => "" };
      }
      if (m) return { ok: true, status: 200, json: async () => ({ member: e(m[1]!), relations: [] }), text: async () => "" };
      // A relation-document read here means the typed path was NOT taken — the arm would be vacuous.
      if (/\/r\/[^/]+$/.test(u)) throw new Error(`unexpected relation dereference ${u}`);
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    }),
  );
  rec.readRecord.mockImplementation(async (idOrUri: string) => {
    const id = uriTail(idOrUri);
    return { id, typeUri: id === "top" ? FOLDER_TYPE : NOTE_TYPE, facts: {} };
  });
});

const granted = () => share.shareEntity.mock.calls.map((c) => String(c[0]));

afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("typed listing — only the SOURCE of a part-of link is the folder's member", () => {
  it("CONTROL — the source member IS made public through the typed row (no dereference)", async () => {
    const out = await setFolderTreePublic("top", true, V, e("top"));
    expect(out.failed).toEqual([]);
    expect(granted()).toContain("item");
    expect(share.grantPublicOnRelation).toHaveBeenCalledWith(r("rX"));
  });

  it("a member the link names in ANOTHER role is NOT made public by the folder's act", async () => {
    await setFolderTreePublic("top", true, V, e("top"));
    expect(granted()).not.toContain("bystander");
    expect(granted().sort()).toEqual(["item", "top"]);
  });
});
