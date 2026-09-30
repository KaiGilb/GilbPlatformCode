import { describe, expect, it } from "vitest";
import { memberIdsFromRelationDoc, memberUrisFromRelationDoc } from "./relationMembers";

describe("memberUrisFromRelationDoc", () => {
  it("reads source, target, member, and role keys, and skips a label", () => {
    const uris = memberUrisFromRelationDoc({
      "@id": "https://example.test/base/r/rel",
      "a:label": "https://example.test/base/e/not-a-member",
      source: { "@id": "https://example.test/base/e/left" },
      "role:target": "https://example.test/base/e/right",
      member: ["https://example.test/base/e/left", { "@id": "bare" }],
    });
    expect(uris).toEqual([
      "https://example.test/base/e/left",
      "https://example.test/base/e/right",
      "bare",
    ]);
  });

  it("drops a bare string and keeps a bare @id", () => {
    expect(memberUrisFromRelationDoc({ source: "bare-word" })).toEqual([]);
    expect(memberUrisFromRelationDoc({ source: { "@id": "bare-word" } })).toEqual(["bare-word"]);
  });

  it("drops an empty @id and a null", () => {
    expect(memberUrisFromRelationDoc({ source: { "@id": "" } })).toEqual([]);
    expect(memberUrisFromRelationDoc({ source: null })).toEqual([]);
  });
});

describe("memberIdsFromRelationDoc", () => {
  it("cuts a query off and decodes, which slashTail would not", () => {
    expect(
      memberIdsFromRelationDoc({
        source: "https://example.test/base/e/a%20b?x=1",
      }),
    ).toEqual(["a b"]);
  });
});
