// @vitest-environment node
// The catalogue of the planes the type chooser creates, over the opt-in listing: Things, Functions and Values; relation-plane types stay out.
// Ported from vocabCatalog.nodeTypeNames.test.ts; the entity-only read (`catalogEntityTypeNames`) is not taken. The fetch of the vocabulary is the collaborator.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORIGIN, tearDown } from "../test/support";


beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!String(url).includes("/base/vocab")) {
        throw new Error(`unexpected fetch ${url}`);
      }
      return {
        ok: true,
        json: async () => ({
          "@graph": [
            { "@id": "https://ontology.platform.example.test/base/t/Person", "a:label": "Person" },
            {
              "@id": "https://ontology.platform.example.test/base/t/WritingPlanguage",
              "a:label": "Writing Planguage",
              "a:verb": "write",
            },
            {
              "@id": "https://ontology.platform.example.test/base/t/SomeValue",
              "a:label": "Some Value",
              "a:scale": "1",
            },
            {
              "@id": "https://ontology.platform.example.test/base/t/CapableOf",
              "a:label": "capable-of",
              "a:isRelationPredicate": true,
            },
          ],
        }),
        text: async (): Promise<string> => "",
      };
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("catalogNodeTypeNames — real F-CAT of TypeChooser planes", () => {
  it("real catalog includes Function and Value planes; excludes relation", async () => {
    // the module registry was reset, so the origin is set on the fresh copy of base-origin that vocabCatalog will read
    (await import("@kaigilb/gilbplatformcode-base-origin")).setBaseOrigin(ORIGIN);
    const { catalogNodeTypeNames } = await import("./vocabCatalog");
    const nodes = await catalogNodeTypeNames();
    expect(nodes).toEqual(expect.arrayContaining(["Person", "WritingPlanguage", "SomeValue"]));
    expect(nodes).not.toContain("CapableOf");
  });
});
