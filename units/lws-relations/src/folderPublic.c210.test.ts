/**
 * A PUBLIC folder reaches its contents: links, members, inner folders, and items added later.
 *
 * Spec: [[3P.F.Share.FolderPublicReachesContents.GilbPlatform]] SC1–SC4.
 * Measured M1 2026-09-26: folder public, 3 of 5 members public, 0 of 5 links public; the two
 * non-public members were linked 14–16 min after the folder went public.
 *
 * 🔴 BVGATE_03 FAIL F1/F2 (2026-09-26) — the first version of this file MOCKED the folder
 * listing, so it could not see that the listing it used returns every co-member of every relation
 * the folder is in. Here the membership reader (`listFolderPartMembers`), the relation listing
 * (`readRelations`) and the relation-document parser (`readRelationDoc`) are REAL; only the network
 * (fetch), the auth headers, the record read and the four grant ACTS are stubbed. The fixture carries
 * the shapes that must NOT be published: the folder's PARENT and the parent's other member, a note
 * that only REFERENCES the folder, an ENDED part-of link, and a part-of link into a NON-folder.
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

import { inheritFolderPublic, listFolderPartMembers, setFolderTreePublic } from "./folderPublic";
import { publicGrantee } from "./publicAccess";
import { setUp, tearDown } from "../test/support";

const H = "https://t.platform.example.test";
const V = `${H}/vault`;
const e = (id: string) => `${H}/vault/e/${id}`;
const r = (id: string) => `${H}/vault/r/${id}`;
const FOLDER_TYPE = "https://platform.example.test/base/t/VirtualFolder";
const NOTE_TYPE = "https://platform.example.test/base/t/NoteDocument";

interface Link { id: string; type: string; source: string; target: string; ended?: boolean }
let links: Link[];
let folders: Set<string>;
let publicSet: Set<string>;
/** When true the listing carries `type` + `members` (GilbPlatform `06eb1c5`+); false = an older platform. */
let typedListing: boolean;

function relationsOf(id: string) {
  return links
    .filter((l) => (l.source === id || l.target === id) && !(typedListing && l.ended))
    .map((l) => ({
      relation: r(l.id),
      role: l.target === id ? "role:target" : "role:source",
      ...(typedListing
        ? {
            type: `https://ontology.example.test/base/t/${l.type.slice(2)}`,
            members: [
              { member: e(l.source), role: "role:source" },
              { member: e(l.target), role: "role:target" },
            ],
          }
        : {}),
    }));
}
const fetchedUrls = () => vi.mocked(fetch).mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  setUp().tokenManager.getSession.mockResolvedValue(null as never);
  vi.clearAllMocks();
  // clearAllMocks keeps an earlier test's mockImplementation — reset the four acts to "succeeds".
  share.shareEntity.mockImplementation(async () => ({ granted: true, mode: "read" as const }));
  share.revokeEntityShare.mockImplementation(async () => undefined);
  share.grantPublicOnRelation.mockImplementation(async () => undefined);
  share.revokePublicOnRelation.mockImplementation(async () => undefined);
  folders = new Set(["parent", "top", "inner"]);
  publicSet = new Set();
  typedListing = false;
  links = [
    { id: "rP", type: "t:PartOf", source: "top", target: "parent" }, // top is INSIDE parent
    { id: "rS", type: "t:PartOf", source: "sibling", target: "parent" }, // parent's other member
    { id: "r1", type: "t:PartOf", source: "a", target: "top" },
    { id: "r2", type: "t:PartOf", source: "inner", target: "top" },
    { id: "r3", type: "t:PartOf", source: "b", target: "inner" },
    { id: "rRef", type: "t:Reference", source: "note", target: "top" }, // only REFERENCES top
    { id: "rEnd", type: "t:PartOf", source: "gone", target: "top", ended: true }, // an ENDED filing
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const rel = u.match(/\/e\/([^/]+)\/relations$/);
      if (rel) {
        return { ok: true, status: 200, json: async () => ({ member: e(rel[1]!), relations: relationsOf(rel[1]!) }), text: async () => "" };
      }
      const doc = u.match(/\/r\/([^/?]+)$/);
      const l = doc ? links.find((x) => x.id === doc[1]) : undefined;
      if (l) {
        const body: Record<string, unknown> = { "@id": r(l.id), "@type": l.type };
        if (l.ended) body["relationLifecycleState"] = "ended";
        else {
          body["role:source"] = { "@id": e(l.source) };
          body["role:target"] = { "@id": e(l.target) };
        }
        return { ok: true, status: 200, json: async () => body, text: async () => "" };
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    }),
  );
  rec.readRecord.mockImplementation(async (id: string) => ({
    id,
    typeUri: folders.has(id) ? FOLDER_TYPE : NOTE_TYPE,
    facts: publicSet.has(id) ? { directReader: publicGrantee() } : {},
  }));
});

const granted = () => share.shareEntity.mock.calls.map((c) => c[0]);
const revoked = () => share.revokeEntityShare.mock.calls.map((c) => c[0]);
const linksGranted = () => share.grantPublicOnRelation.mock.calls.map((c) => c[0]);
const linksRevoked = () => share.revokePublicOnRelation.mock.calls.map((c) => c[0]);

afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("listFolderPartMembers — who IS a member (BVedanta F1)", () => {
  it("only the SOURCE of a live t:PartOf link whose TARGET is this folder", async () => {
    const { parts } = await listFolderPartMembers("top", V);
    expect(parts.map((p) => p.memberId).sort()).toEqual(["a", "inner"]);
    expect(parts.map((p) => p.relationUri).sort()).toEqual([r("r1"), r("r2")]);
  });

  it("never the folder's PARENT, a note that references it, or an ENDED filing", async () => {
    const ids = (await listFolderPartMembers("top", V)).parts.map((p) => p.memberId);
    for (const not of ["parent", "sibling", "note", "gone"]) expect(ids).not.toContain(not);
  });
});

describe("setFolderTreePublic — make public", () => {
  it("SC1+SC2 — folder, every part-of link and every member, inner folders included; nothing else", async () => {
    const out = await setFolderTreePublic("top", true, V, e("top"));
    expect(out.folder).toBe(true);
    expect(granted().sort()).toEqual(["a", "b", "inner", "top"]);
    expect(linksGranted().sort()).toEqual([r("r1"), r("r2"), r("r3")]);
    for (const c of share.shareEntity.mock.calls) {
      expect(c[1]).toBe(publicGrantee());
      expect(c[2]).toBe("read");
    }
    expect(out).toMatchObject({ members: 3, links: 3, failed: [] });
  });

  it("making a NESTED folder public does not publish its parent, the parent's other member, or their links", async () => {
    await setFolderTreePublic("inner", true, V, e("inner"));
    expect(granted().sort()).toEqual(["b", "inner"]);
    expect(linksGranted()).toEqual([r("r3")]);
  });

  it("a cycle of folders ends (each member once)", async () => {
    links.push({ id: "r4", type: "t:PartOf", source: "top", target: "inner" });
    await setFolderTreePublic("top", true, V, e("top"));
    expect(granted().filter((id) => id === "top")).toHaveLength(1);
    expect(linksGranted().sort()).toEqual([r("r1"), r("r2"), r("r3"), r("r4")]);
  });

  it("a REFUSED member keeps its link private (a public link would show the member's address)", async () => {
    share.shareEntity.mockImplementation(async (...a: unknown[]) => {
      if (a[0] === "a") throw new Error("GilbPlatform refused this share");
      return { granted: true, mode: "read" as const };
    });
    const out = await setFolderTreePublic("top", true, V, e("top"));
    expect(linksGranted()).not.toContain(r("r1"));
    expect(linksGranted()).toContain(r("r2"));
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0]).toContain("refused");
  });

  it("a refused member filed in TWO folders of the tree keeps BOTH links private (BVedanta re-gate)", async () => {
    links.push({ id: "rA2", type: "t:PartOf", source: "a", target: "inner" });
    share.shareEntity.mockImplementation(async (...a: unknown[]) => {
      if (a[0] === "a") throw new Error("GilbPlatform refused this share");
      return { granted: true, mode: "read" as const };
    });
    await setFolderTreePublic("top", true, V, e("top"));
    expect(linksGranted()).not.toContain(r("r1"));
    expect(linksGranted()).not.toContain(r("rA2"));
    expect(granted().filter((id) => id === "a")).toHaveLength(1);
  });

  it("SC4 — a link that could not be made public is COUNTED, and the rest still happens", async () => {
    share.grantPublicOnRelation.mockImplementation(async (...a: unknown[]) => {
      if (a[0] === r("r1")) throw new Error("refused");
    });
    const out = await setFolderTreePublic("top", true, V, e("top"));
    expect(out.failed).toHaveLength(1);
    expect(granted()).toContain("a");
  });

  it("a refused FOLDER stops everything below it", async () => {
    share.shareEntity.mockImplementationOnce(async () => {
      throw new Error("GilbPlatform refused this share");
    });
    const out = await setFolderTreePublic("top", true, V, e("top"));
    expect(out.folder).toBe(false);
    expect(linksGranted()).toEqual([]);
    expect(granted()).toEqual(["top"]);
  });
});

describe("setFolderTreePublic — make private", () => {
  it("SC3 — takes back the folder, every part-of link and every member, at every depth; nothing else", async () => {
    const out = await setFolderTreePublic("top", false, V, e("top"));
    expect(out.folder).toBe(true);
    expect(revoked().sort()).toEqual(["a", "b", "inner", "top"]);
    expect(linksRevoked().sort()).toEqual([r("r1"), r("r2"), r("r3")]);
    expect(share.shareEntity).not.toHaveBeenCalled();
    expect(share.grantPublicOnRelation).not.toHaveBeenCalled();
  });
});

describe("inheritFolderPublic — an item linked INTO a public folder later", () => {
  it("the folder is public → the new member, then its link, become public", async () => {
    publicSet.add("top");
    links.push({ id: "r9", type: "t:PartOf", source: "late", target: "top" });
    const failed = await inheritFolderPublic({ folderId: "top", folderDoor: e("top"), memberId: "late", relationId: "r9", vaultNamespace: V });
    expect(failed).toEqual([]);
    expect(granted()).toEqual(["late"]);
    expect(linksGranted()).toEqual([r("r9")]);
  });

  it("BVedanta F2 — a part-of link into a public NON-folder (impeller part-of pump) publishes nothing", async () => {
    publicSet.add("pump");
    links.push({ id: "rImp", type: "t:PartOf", source: "impeller", target: "pump" });
    const failed = await inheritFolderPublic({ folderId: "pump", folderDoor: e("pump"), memberId: "impeller", relationId: "rImp", vaultNamespace: V });
    expect(failed).toEqual([]);
    expect(share.shareEntity).not.toHaveBeenCalled();
    expect(share.grantPublicOnRelation).not.toHaveBeenCalled();
  });

  it("the folder is NOT public → nothing is granted", async () => {
    links.push({ id: "r9", type: "t:PartOf", source: "late", target: "top" });
    const failed = await inheritFolderPublic({ folderId: "top", folderDoor: e("top"), memberId: "late", relationId: "r9", vaultNamespace: V });
    expect(failed).toEqual([]);
    expect(share.shareEntity).not.toHaveBeenCalled();
    expect(share.grantPublicOnRelation).not.toHaveBeenCalled();
  });

  it("a FOLDER linked into a public folder carries its own tree (and not its other parents)", async () => {
    publicSet.add("outer");
    folders.add("outer");
    links.push({ id: "r7", type: "t:PartOf", source: "inner", target: "outer" });
    await inheritFolderPublic({ folderId: "outer", folderDoor: e("outer"), memberId: "inner", relationId: "r7", vaultNamespace: V });
    expect(granted().sort()).toEqual(["b", "inner"]);
    expect(linksGranted().sort()).toEqual([r("r3"), r("r7")]);
  });

  it("a refused member is RETURNED in words, and its link is NOT made public", async () => {
    publicSet.add("top");
    links.push({ id: "r9", type: "t:PartOf", source: "late", target: "top" });
    share.shareEntity.mockRejectedValueOnce(new Error("GilbPlatform refused this share: not yours"));
    const failed = await inheritFolderPublic({ folderId: "top", folderDoor: e("top"), memberId: "late", relationId: "r9", vaultNamespace: V });
    expect(failed).toHaveLength(1);
    expect(failed[0]).toContain("not yours");
    expect(share.grantPublicOnRelation).not.toHaveBeenCalled();
  });
});

describe("C210 VAScaling GPLAT210.6 — request counts", () => {
  it("S3b — with a TYPED listing, the whole tree is walked with ZERO relation-document reads, same result", async () => {
    typedListing = true;
    const out = await setFolderTreePublic("top", true, V, e("top"));
    expect(granted().sort()).toEqual(["a", "b", "inner", "top"]);
    expect(linksGranted().sort()).toEqual([r("r1"), r("r2"), r("r3")]);
    expect(out.failed).toEqual([]);
    expect(fetchedUrls().filter((u) => /\/r\/[^/]+$/.test(u))).toEqual([]);
  });

  it("S3b — a typed listing still refuses the parent, the reference and the non-part-of links", async () => {
    typedListing = true;
    await setFolderTreePublic("inner", true, V, e("inner"));
    expect(granted().sort()).toEqual(["b", "inner"]);
  });

  it("S2 — each member's record is read ONCE in a tree publish", async () => {
    await setFolderTreePublic("top", true, V, e("top"));
    const reads = rec.readRecord.mock.calls.map((c) => c[0]);
    expect(reads.sort()).toEqual(["a", "b", "inner"]);
    // …and the share act is HANDED that record, so it does not read it a second time.
    const memberShares = share.shareEntity.mock.calls.filter((c) => c[0] !== "top");
    expect(memberShares).toHaveLength(3);
    for (const c of memberShares) expect(c[5]).toMatchObject({ rec: expect.objectContaining({ id: c[0] }) });
  });

  it("S2 — make private hands each member the record already read, and skips the per-item list read", async () => {
    await setFolderTreePublic("top", false, V, e("top"));
    const memberCalls = share.revokeEntityShare.mock.calls.filter((c) => c[0] !== "top");
    expect(memberCalls).toHaveLength(3);
    for (const c of memberCalls) expect(c[4]).toMatchObject({ skipListRefresh: true, rec: expect.anything() });
  });

  it("S1 — with the link's URI from the write, adding to a public folder does NOT re-list the folder", async () => {
    publicSet.add("top");
    links.push({ id: "r9", type: "t:PartOf", source: "late", target: "top" });
    await inheritFolderPublic({ folderId: "top", folderDoor: e("top"), memberId: "late", relationId: "r9", relationUri: r("r9"), vaultNamespace: V });
    expect(linksGranted()).toEqual([r("r9")]);
    expect(fetchedUrls().filter((u) => u.endsWith("/relations"))).toEqual([]);
  });

  it("R4 — an inner folder whose own publish is refused is not descended (its links would name it)", async () => {
    share.shareEntity.mockImplementation(async (...a: unknown[]) => {
      if (a[0] === "inner") throw new Error("GilbPlatform refused this share");
      return { granted: true, mode: "read" as const };
    });
    await setFolderTreePublic("top", true, V, e("top"));
    expect(granted()).not.toContain("b");
    expect(linksGranted()).not.toContain(r("r3"));
    expect(linksGranted()).not.toContain(r("r2"));
  });
});

describe("C210 BVedanta N6 — the added member is read at its OWN door", () => {
  it("memberEntityUri given → the member record is read there, not at the pane's vault", async () => {
    publicSet.add("top");
    links.push({ id: "r9", type: "t:PartOf", source: "late", target: "top" });
    const other = "https://other.platform.example.test/vault/e/late";
    await inheritFolderPublic({ folderId: "top", folderDoor: e("top"), memberId: "late", relationId: "r9", relationUri: r("r9"), memberEntityUri: other, vaultNamespace: V });
    const memberRead = rec.readRecord.mock.calls.find((c) => c[0] === "late");
    expect(memberRead?.[1]).toBe(other);
  });
});

