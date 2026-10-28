/**
 * C210 N7 — the ONE door every folder link passes through (`writePairRelation`) runs the
 * "folder is public → make the new link and member public" hook, whichever call site linked it
 * (add-to-folder, folder members, upload into a folder, connected create, graph, relation edit).
 *
 * Measured M1 2026-09-26: two members linked into a public folder 14–16 min after it went public
 * were never granted. `writePairRelation` is REAL; `inheritFolderPublic` is mocked as a collaborator
 * (its own behaviour is pinned in folderPublic.c210.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => ({ inheritFolderPublic: vi.fn(async (..._a: unknown[]) => [] as string[]) }));
vi.mock("./folderPublic", () => ({ inheritFolderPublic: hook.inheritFolderPublic }));
vi.mock("./relations", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readRelations: vi.fn(async () => []),
}));

import { writePairRelation } from "./relationWrite";
import { __setCatalogForTest, catalogFromGraph } from "./linkPlaneCatalog";
import { setUp, tearDown, type FakeHost } from "../test/support";

const VAULT = "https://t.platform.example.test/vault";
const MEMBER = "https://t.platform.example.test/vault/e/member1";
const FOLDER = "https://t.platform.example.test/vault/e/folder1";

beforeEach(() => {
  setUp().tokenManager.getSession.mockResolvedValue({ principal: "https://t.platform.example.test/vault", vault: null, vaults: [] });
  hook.inheritFolderPublic.mockClear();
  hook.inheritFolderPublic.mockResolvedValue([]);
  __setCatalogForTest(
    catalogFromGraph(
      [
        { "@id": "https://ontology.example.test/base/t/PartOf", "a:label": "part-of", "a:linkPlane": "user", "a:typeAttribute": "t:PartOf", "a:symmetric": false },
        { "@id": "https://ontology.example.test/base/t/Reference", "a:label": "references", "a:linkPlane": "user", "a:typeAttribute": "t:Reference", "a:symmetric": false },
      ],
      "user",
    ),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ changed: true }),
      text: async () => "",
      headers: { get: () => null },
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  __setCatalogForTest(null);
  tearDown();
});

describe("writePairRelation — the folder-public hook", () => {
  it("a NEW t:PartOf link asks the hook, naming the folder, the member, and the new relation id", async () => {
    const out = await writePairRelation({
      sourceId: "member1",
      targetId: "folder1",
      typeCurie: "t:PartOf",
      vaultNamespace: VAULT,
      sourceEntityUri: MEMBER,
      targetEntityUri: FOLDER,
    });
    expect(hook.inheritFolderPublic).toHaveBeenCalledTimes(1);
    expect(hook.inheritFolderPublic).toHaveBeenCalledWith({
      folderId: "folder1",
      folderDoor: FOLDER,
      memberId: "member1",
      relationId: out.id,
      relationUri: null,
      memberEntityUri: MEMBER,
      vaultNamespace: VAULT,
    });
    expect(out.notMadePublic).toEqual([]);
  });

  it("VAScaling S1 — the vault-issued link URI from the write answer is handed to the hook (no re-list)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 201,
        json: async () => ({ changed: true, entity: "https://t.platform.example.test/vault/r/issued1" }),
        text: async () => "",
        headers: { get: () => null },
      })),
    );
    const out = await writePairRelation({
      sourceId: "member1",
      targetId: "folder1",
      typeCurie: "t:PartOf",
      vaultNamespace: VAULT,
      sourceEntityUri: MEMBER,
      targetEntityUri: FOLDER,
    });
    expect(out.uri).toBe("https://t.platform.example.test/vault/r/issued1");
    expect(hook.inheritFolderPublic.mock.calls[0]![0]).toMatchObject({ relationUri: "https://t.platform.example.test/vault/r/issued1" });
  });

  it("what the hook could not make public is RETURNED, and the link still counts as written", async () => {
    hook.inheritFolderPublic.mockResolvedValueOnce(["The item added to the public folder is not public: refused"]);
    const out = await writePairRelation({
      sourceId: "member1",
      targetId: "folder1",
      typeCurie: "t:PartOf",
      vaultNamespace: VAULT,
      sourceEntityUri: MEMBER,
      targetEntityUri: FOLDER,
    });
    expect(out.changed).toBe(true);
    expect(out.notMadePublic).toEqual(["The item added to the public folder is not public: refused"]);
  });

  it("a link of any OTHER kind never asks", async () => {
    await writePairRelation({
      sourceId: "member1",
      targetId: "folder1",
      typeCurie: "t:Reference",
      vaultNamespace: VAULT,
      sourceEntityUri: MEMBER,
      targetEntityUri: FOLDER,
    });
    expect(hook.inheritFolderPublic).not.toHaveBeenCalled();
  });

  it("UPDATING an existing link never asks (it was granted when it was made)", async () => {
    await writePairRelation({
      relationId: "https://t.platform.example.test/vault/r/existing1",
      sourceId: "member1",
      targetId: "folder1",
      typeCurie: "t:PartOf",
      vaultNamespace: VAULT,
      sourceEntityUri: MEMBER,
      targetEntityUri: FOLDER,
    });
    expect(hook.inheritFolderPublic).not.toHaveBeenCalled();
  });
});
