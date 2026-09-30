import { describe, expect, it } from "vitest";
import { folderPartFromDocument, folderPartsFromListing } from "./folderPart";

const folder = "https://vault.example/base/e/folder1";
const note = "https://vault.example/base/e/note1";
const link = "https://vault.example/base/r/link1?x=1";

describe("folderPartsFromListing", () => {
  it("takes the source of a part-of whose target is the folder", () => {
    const decision = folderPartsFromListing(
      {
        relation: link,
        role: "role:target",
        type: "t:PartOf",
        members: [
          { member: note, role: "role:source" },
          { member: folder, role: "role:target" },
          { member: folder, role: "role:source" },
        ],
      },
      folder,
    );
    expect(decision).toEqual({
      needDocument: false,
      parts: [{ memberId: "note1", relationId: "link1", relationUri: link }],
    });
  });

  it("does not treat a parent link, a bare PartOf, or a present wrong type as unread", () => {
    expect(
      folderPartsFromListing(
        { relation: link, role: "role:source", type: "t:PartOf", members: [{ member: note, role: "role:source" }] },
        "folder1",
      ),
    ).toEqual({ needDocument: false, parts: [] });
    expect(
      folderPartsFromListing(
        { relation: link, role: "role:target", type: "PartOf", members: [{ member: note, role: "role:source" }] },
        "folder1",
      ),
    ).toEqual({ needDocument: false, parts: [] });
    expect(
      folderPartsFromListing(
        { relation: link, role: "role:target", type: "t:References", members: [] },
        "folder1",
      ),
    ).toEqual({ needDocument: false, parts: [] });
  });

  it("asks for the document only when the role is target and type or members is absent", () => {
    expect(folderPartsFromListing({ relation: link, role: "role:target" }, "folder1")).toEqual({
      needDocument: true,
    });
    expect(
      folderPartsFromListing({ relation: link, role: "role:target", type: "t:PartOf" }, "folder1"),
    ).toEqual({ needDocument: true });
    expect(
      folderPartsFromListing(
        { relation: link, role: "role:source", members: [{ member: note, role: "role:source" }] },
        "folder1",
      ),
    ).toEqual({ needDocument: false, parts: [] });
  });

  it("accepts an address type and does not drop a member for a lifecycle the listing does not carry", () => {
    const decision = folderPartsFromListing(
      {
        relation: link,
        role: "role:target",
        type: { "@id": "https://types.example/base/t/PartOf" },
        members: [{ member: note, role: "role:source" }],
      },
      "folder1",
    );
    expect(decision).toEqual({
      needDocument: false,
      parts: [{ memberId: "note1", relationId: "link1", relationUri: link }],
    });
  });
});

describe("folderPartFromDocument", () => {
  const rel = { relation: link, role: "role:target" as const };
  const live = {
    typeCurie: "t:PartOf",
    sourceUri: note,
    targetUri: folder,
    extras: {},
  };

  it("returns the source when the document agrees", () => {
    expect(folderPartFromDocument(rel, live, "folder1")).toEqual({
      memberId: "note1",
      relationId: "link1",
      relationUri: link,
    });
  });

  it("drops an ended link, a wrong curie, a source-role call, and the folder itself", () => {
    expect(folderPartFromDocument(rel, { ...live, extras: { relationLifecycleState: "ended" } }, "folder1")).toBeNull();
    expect(
      folderPartFromDocument(rel, { ...live, extras: { relationLifecycleState: ["ended", "live"] } }, "folder1"),
    ).toBeNull();
    expect(
      folderPartFromDocument(
        rel,
        { ...live, extras: { relationLifecycleState: "live", "a:relationLifecycleState": "ended" } },
        "folder1",
      ),
    ).not.toBeNull();
    expect(
      folderPartFromDocument(rel, { ...live, extras: { "a:relationLifecycleState": "ended" } }, "folder1"),
    ).toBeNull();
    expect(folderPartFromDocument(rel, { ...live, typeCurie: "https://types.example/base/t/PartOf" }, "folder1")).toBeNull();
    expect(folderPartFromDocument({ relation: link, role: "role:source" }, live, "folder1")).toBeNull();
    expect(folderPartFromDocument(rel, { ...live, sourceUri: folder }, "folder1")).toBeNull();
    expect(folderPartFromDocument(rel, { ...live, targetUri: note }, "folder1")).toBeNull();
  });
});
