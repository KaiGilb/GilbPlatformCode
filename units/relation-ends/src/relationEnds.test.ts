import { describe, expect, it } from "vitest";
import { relationEndsFromDocument } from "./relationEnds";

const VAULT = "https://holder.example.test/base";

describe("relationEndsFromDocument", () => {
  it("expands base: against this document's own id", () => {
    const ends = relationEndsFromDocument("rel-1", {
      "@id": `${VAULT}/r/rel-1`,
      "@type": "t:ConnectedTo",
      "role:source": { "@id": "base:e/person-1" },
      "role:target": { "@id": "base:e/note-1" },
      "a:note": "kept",
    });
    expect(ends.id).toBe("rel-1");
    expect(ends.uri).toBe(`${VAULT}/r/rel-1`);
    expect(ends.typeCurie).toBe("t:ConnectedTo");
    expect(ends.sourceUri).toBe(`${VAULT}/e/person-1`);
    expect(ends.targetUri).toBe(`${VAULT}/e/note-1`);
    expect(ends.sourceUri).not.toContain("/e/base:");
    expect(ends.extras).toEqual({ "a:note": "kept" });
  });

  it("does not invent an address when the document id is not a vault entity or relation", () => {
    const ends = relationEndsFromDocument("x", {
      "@id": "urn:uuid:not-a-vault-uri",
      "role:source": { "@id": "base:e/person-1" },
    });
    expect(ends.uri).toBe("urn:uuid:not-a-vault-uri");
    expect(ends.sourceUri).toBeNull();
    expect(ends.targetUri).toBeNull();
  });

  it("leaves an unknown prefix unresolved, and keeps a string that merely starts with http", () => {
    const other = relationEndsFromDocument("y", {
      "@id": `${VAULT}/r/y`,
      "role:source": { "@id": "veda:t/ConnectedTo" },
    });
    expect(other.sourceUri).toBeNull();

    const prefixed = relationEndsFromDocument("z", {
      "@id": `${VAULT}/r/z`,
      "role:source": "httpfoo",
    });
    expect(prefixed.sourceUri).toBe("httpfoo");
  });

  it("prefers role:source, uses source when that does not resolve, and reads only the first list entry", () => {
    const preferred = relationEndsFromDocument("p", {
      "@id": `${VAULT}/e/p`,
      "role:source": `${VAULT}/e/from-role`,
      source: `${VAULT}/e/from-bare`,
    });
    expect(preferred.sourceUri).toBe(`${VAULT}/e/from-role`);

    const fallen = relationEndsFromDocument("q", {
      "@id": `${VAULT}/r/q`,
      "role:source": "not-an-address",
      source: ["base:e/first", "base:e/ignored"],
    });
    expect(fallen.sourceUri).toBe(`${VAULT}/e/first`);
  });

  it("does not invent a host when @id is missing, and does not drop an ended fact", () => {
    const ends = relationEndsFromDocument("bare", {
      type: "t:PartOf",
      "a:relationLifecycleState": "ended",
      Member: "stays",
      member: "dropped-key",
    });
    expect(ends.uri).toBeNull();
    expect(ends.typeCurie).toBe("t:PartOf");
    expect(ends.extras).toEqual({
      type: "t:PartOf",
      "a:relationLifecycleState": "ended",
      Member: "stays",
    });
  });
});
