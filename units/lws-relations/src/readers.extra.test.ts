// New. The arms of `readRelations`, `readRelationDoc` and `relationDocFromJson` the ported cases leave to chance.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { readRelationDoc, readRelations, relationDocFromJson } from "./index";
import { resp, setUp, tearDown, type FakeHost } from "../test/support";

const VAULT = "https://v.platform.example.test/base";
let host: FakeHost;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  host = setUp();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("readRelations", () => {
  it("is addressed at the origin of the record's own URI and sends accept: application/json", async () => {
    fetchMock.mockResolvedValue(resp(200, { body: { relations: [] } }));
    await readRelations("a", `${VAULT}/e/a`);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://v.platform.example.test/base/e/a/relations");
    expect(init.headers.accept).toBe("application/json");
  });
  it("with no URI it is addressed at the platform origin", async () => {
    fetchMock.mockResolvedValue(resp(200, { body: {} }));
    await expect(readRelations("a", null)).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://platform.example.test/base/e/a/relations");
  });
  it("carries the relation's type and its members when the vault returns them; a member with no URI is dropped; values are read as text", async () => {
    fetchMock.mockResolvedValue(
      resp(200, {
        body: {
          relations: [
            {
              relation: `${VAULT}/r/1`,
              role: "role:target",
              type: "t:PartOf",
              members: [{ member: `${VAULT}/e/m`, role: "role:source" }, { role: "role:source" }, { member: 7, role: null }],
            },
            { relation: `${VAULT}/r/2`, role: "role:source", type: "", members: [{ member: "" }] },
            { relation: `${VAULT}/r/3`, type: 5 },
          ],
        },
      }),
    );
    await expect(readRelations("a", null)).resolves.toEqual([
      { relation: `${VAULT}/r/1`, role: "role:target", type: "t:PartOf", members: [{ member: `${VAULT}/e/m`, role: "role:source" }, { member: "7", role: "" }] },
      { relation: `${VAULT}/r/2`, role: "role:source" },
      { relation: `${VAULT}/r/3`, role: "" },
    ]);
  });
  it("a body whose relations is not a list is no relations", async () => {
    fetchMock.mockResolvedValue(resp(200, { body: { relations: "none" } }));
    await expect(readRelations("a", null)).resolves.toEqual([]);
  });
  it("a 500 carries the body in the message", async () => {
    fetchMock.mockResolvedValue(resp(500, { body: "boom" }));
    await expect(readRelations("a", null)).rejects.toThrow("relations read failed: 500 boom");
  });
});

describe("readRelationDoc", () => {
  const doc = (extra: Record<string, unknown> = {}) => ({
    "@id": `${VAULT}/r/rel-1`,
    "@type": "t:PartOf",
    "role:source": { "@id": `${VAULT}/e/a` },
    "role:target": { "@id": `${VAULT}/e/b` },
    ...extra,
  });

  it("is a GET without a cache, with an accept header, signed for a GET", async () => {
    fetchMock.mockResolvedValue(resp(200, { body: doc() }));
    await readRelationDoc(`${VAULT}/r/rel-1`);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(`${VAULT}/r/rel-1`);
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(init.headers.accept).toBe("application/json");
    expect(host.dpopReadAuth).toHaveBeenCalledWith("GET", `${VAULT}/r/rel-1`);
  });
  it("a full URI wins over the vault named; a bare tail is addressed at the vault named, or the platform origin", async () => {
    fetchMock.mockResolvedValue(resp(200, { body: doc() }));
    await readRelationDoc(`${VAULT}/r/rel-1`, "https://elsewhere.platform.example.test/base");
    expect(fetchMock.mock.calls[0]![0]).toBe(`${VAULT}/r/rel-1`);
    await readRelationDoc("rel-1", VAULT);
    expect(fetchMock.mock.calls[1]![0]).toBe(`${VAULT}/r/rel-1`);
    await readRelationDoc("rel-1");
    expect(fetchMock.mock.calls[2]![0]).toBe("https://platform.example.test/base/r/rel-1");
    await readRelationDoc("rel-1", null);
    expect(fetchMock.mock.calls[3]![0]).toBe("https://platform.example.test/base/r/rel-1");
  });
  it("a 404 is no document, not an error", async () => {
    fetchMock.mockResolvedValue(resp(404, { body: "none" }));
    await expect(readRelationDoc("rel-1", VAULT)).resolves.toBeNull();
    expect(host.invalidateDpop).not.toHaveBeenCalled();
  });
  it("a 401 drops the token and asks once more; the second answer is used", async () => {
    fetchMock.mockResolvedValueOnce(resp(401, { body: "no" })).mockResolvedValueOnce(resp(200, { body: doc() }));
    const out = await readRelationDoc("rel-1", VAULT);
    expect(out?.sourceUri).toBe(`${VAULT}/e/a`);
    expect(host.invalidateDpop).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.dpopReadAuth).toHaveBeenCalledTimes(2);
  });
  it("a 401 twice is a person who is not signed in", async () => {
    fetchMock.mockResolvedValue(resp(401, { body: "no" }));
    await expect(readRelationDoc("rel-1", VAULT)).rejects.toBeInstanceOf(NotSignedInError);
    expect(host.invalidateDpop).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("any other refusal throws the status and the body", async () => {
    fetchMock.mockResolvedValue(resp(502, { body: "gateway" }));
    await expect(readRelationDoc("rel-1", VAULT)).rejects.toThrow("relation read failed: 502 gateway");
  });
  it("the document read keeps the id as the tail of what was asked for", async () => {
    fetchMock.mockResolvedValue(resp(200, { body: doc() }));
    const out = await readRelationDoc(`${VAULT}/r/rel-1/`, VAULT);
    expect(out?.id).toBe("rel-1");
    expect(out?.uri).toBe(`${VAULT}/r/rel-1`);
  });
});

describe("relationDocFromJson", () => {
  it("the uri is the document's @id, or the relation address at the platform origin when it has none", () => {
    expect(relationDocFromJson("r1", { "@id": `${VAULT}/r/r1` }).uri).toBe(`${VAULT}/r/r1`);
    expect(relationDocFromJson("r1", {}).uri).toBe("https://platform.example.test/base/r/r1");
  });
  it("the type is read from @type, or from type", () => {
    expect(relationDocFromJson("r1", { "@type": "t:A" }).typeCurie).toBe("t:A");
    expect(relationDocFromJson("r1", { type: "t:B" }).typeCurie).toBe("t:B");
  });
  it("every role other than source and target is kept as an absolute reference, a single one as an object and several as a list", () => {
    const d = relationDocFromJson("r1", {
      "@id": `${VAULT}/r/r1`,
      "role:source": { "@id": `${VAULT}/e/a` },
      "role:target": { "@id": `${VAULT}/e/b` },
      "role:agent": { "@id": "base:e/c" },
      "role:witness": [{ "@id": `${VAULT}/e/w1` }, "base:e/w2"],
    });
    expect(d.otherRoles).toEqual({
      "role:agent": { "@id": `${VAULT}/e/c` },
      "role:witness": [{ "@id": `${VAULT}/e/w1` }, { "@id": `${VAULT}/e/w2` }],
    });
  });
  it("a role this reader cannot resolve is kept as it was read, so a rewrite never drops it", () => {
    const d = relationDocFromJson("r1", { "@id": "urn:x", "role:agent": { "@id": "veda:t/X" } });
    expect(d.otherRoles).toEqual({ "role:agent": { "@id": "veda:t/X" } });
  });
  it("no other role means no otherRoles member at all", () => {
    expect("otherRoles" in relationDocFromJson("r1", { "role:source": { "@id": `${VAULT}/e/a` } })).toBe(false);
  });
  it("the plain facts are the extras; source, target, member and @-keys are not", () => {
    const d = relationDocFromJson("r1", { "@id": `${VAULT}/r/r1`, source: "x", target: "y", member: "z", "a:status": "80", "a:location": "Oslo", "@context": "c" });
    expect(d.extras).toEqual({ "a:status": "80", "a:location": "Oslo" });
  });
  it("the compacted source and target keys are read when the role keys are absent, and the role keys win when both are there", () => {
    const d = relationDocFromJson("r1", { source: { "@id": `${VAULT}/e/s` }, target: [{ "@id": `${VAULT}/e/t` }] });
    expect(d.sourceUri).toBe(`${VAULT}/e/s`);
    expect(d.targetUri).toBe(`${VAULT}/e/t`);
    const both = relationDocFromJson("r1", { source: `${VAULT}/e/s`, "role:source": `${VAULT}/e/rs` });
    expect(both.sourceUri).toBe(`${VAULT}/e/rs`);
  });
  it("an address in urn: form is kept; text that is neither an address nor a base: reference is not an end", () => {
    const d = relationDocFromJson("r1", { "role:source": "urn:uuid:1", "role:target": "just text" });
    expect(d.sourceUri).toBe("urn:uuid:1");
    expect(d.targetUri).toBeNull();
  });
});
