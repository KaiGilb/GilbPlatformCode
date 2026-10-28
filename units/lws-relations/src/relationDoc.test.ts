import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { relationDocFromJson, readRelationDoc } from "./relationDoc";
import { setUp, tearDown, type FakeHost } from "../test/support";

let host: FakeHost;
beforeEach(() => {
  host = setUp();
});
afterEach(() => tearDown());

describe("relationDocFromJson", () => {
  it("lifts type, ends, and steered facts — never invents a missing member", () => {
    const doc = relationDocFromJson("rel1", {
      "@id": "https://pod.example/base/r/rel1",
      "@type": "t:SisterOf",
      "role:source": { "@id": "https://vault.example/base/e/ann" },
      "role:target": { "@id": "https://vault.example/base/e/ben" },
      "a:status": "80",
      "a:location": "Oslo",
      "a:occurredAt": "2020-06-01T12:00",
    });
    expect(doc.typeCurie).toBe("t:SisterOf");
    expect(doc.sourceUri).toContain("ann");
    expect(doc.targetUri).toContain("ben");
    expect(doc.extras["a:status"]).toBe("80");
    expect(doc.extras["a:location"]).toBe("Oslo");
    expect(doc.extras).not.toHaveProperty("@type");
    expect(doc.extras).not.toHaveProperty("role:source");
  });

  it("reads compacted source/target keys and an array-valued @type", () => {
    const doc = relationDocFromJson("rel1", {
      "@type": ["https://ontology.example.test/base/t/BrotherOf"],
      source: { "@id": "https://vault.example/base/e/a" },
      target: { "@id": "https://vault.example/base/e/b" },
    });
    expect(doc.typeCurie).toBe("t:BrotherOf");
    expect(doc.sourceUri).toContain("/e/a");
    expect(doc.targetUri).toContain("/e/b");
  });

  it("returns null ends when the relation has no members (ended)", () => {
    const doc = relationDocFromJson("rel1", { "@type": "t:FriendOf" });
    expect(doc.sourceUri).toBeNull();
    expect(doc.targetUri).toBeNull();
  });
});

describe("readRelationDoc", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs with DPoP — Bearer on /base/r/:id is a silent 404", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          "@type": "t:BrotherOf",
          "role:source": { "@id": "https://vault.example/base/e/a" },
          "role:target": { "@id": "https://vault.example/base/e/b" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const doc = await readRelationDoc("rel-1");
    expect(doc?.typeCurie).toBe("t:BrotherOf");
    expect(host.dpopReadAuth).toHaveBeenCalledWith("GET", "https://platform.example.test/base/r/rel-1");
    const headers = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^DPoP /);
    expect(headers.authorization).not.toMatch(/^Bearer /);
    expect(host.bearerHeaderFor).not.toHaveBeenCalled();
  });
});
