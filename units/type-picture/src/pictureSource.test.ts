import { afterEach, describe, expect, test, vi } from "vitest";
import { TYPE_PICTURE_ATTR, createTypePictureSource } from "./index";

const TERM = "https://ontology.example.test";
const sameHost = (iri: string) => new URL(iri).origin;
const make = (over: Partial<Parameters<typeof createTypePictureSource>[0]> = {}) =>
  createTypePictureSource({ termOrigin: TERM, originOf: sameHost, ...over });

afterEach(() => vi.unstubAllGlobals());

describe("typePictureSrc", () => {
  const { typePictureSrc } = make();

  test("File entity IRI → public /files URL on the same host", () => {
    expect(
      typePictureSrc({
        "a:typePicture": { "@id": "https://ontology.example.test/base/e/e79aevaafavc" },
      }),
    ).toBe("https://ontology.example.test/files/e79aevaafavc");
  });

  test("compact typePicture key also works", () => {
    expect(
      typePictureSrc({
        typePicture: { "@id": "https://ontology.example.test/base/e/e79aevaafavc" },
      }),
    ).toBe("https://ontology.example.test/files/e79aevaafavc");
  });

  test("absence is null — no 404 hunt", () => {
    expect(typePictureSrc({})).toBeNull();
    expect(typePictureSrc(null)).toBeNull();
    expect(typePictureSrc(undefined)).toBeNull();
  });

  test("never treats a .png serve path as the stored object", () => {
    expect(
      typePictureSrc({
        "a:typePicture": { "@id": "https://ontology.example.test/base/t/Chair.png" },
      }),
    ).toBeNull();
  });

  test("a bare string under the key is not an edge object: null (the flat-plane reader takes that shape)", () => {
    expect(typePictureSrc({ "a:typePicture": "https://ontology.example.test/base/e/abc123" })).toBeNull();
  });

  test("the a:-prefixed key wins over the compact one", () => {
    expect(
      typePictureSrc({
        "a:typePicture": { "@id": "https://ontology.example.test/base/e/first" },
        typePicture: { "@id": "https://ontology.example.test/base/e/second" },
      }),
    ).toBe("https://ontology.example.test/files/first");
    expect(TYPE_PICTURE_ATTR).toBe("a:typePicture");
  });
});

describe("typeTermUrl", () => {
  test("is on the term origin the host passed", () => {
    const s = make();
    expect(s.typeTermUrl("Chair")).toBe("https://ontology.example.test/base/t/Chair");
    expect(make({ termOrigin: "https://other.example.test" }).typeTermUrl("Chair")).toBe("https://other.example.test/base/t/Chair");
  });
  test("reads any spelling of the name and encodes it; no usable name is null", () => {
    const s = make();
    expect(s.typeTermUrl("t:Chair")).toBe("https://ontology.example.test/base/t/Chair");
    expect(s.typeTermUrl("https://vault.example.test/base/t/Chair.png")).toBe("https://ontology.example.test/base/t/Chair");
    expect(s.typeTermUrl("veda:Chair")).toBe("https://ontology.example.test/base/t/Chair");
    expect(s.typeTermUrl("A B")).toBe("https://ontology.example.test/base/t/A%20B");
    expect(s.typeTermUrl("")).toBeNull();
    expect(s.typeTermUrl("   ")).toBeNull();
    expect(s.typeTermUrl("a/b")).toBeNull();
  });
});

describe("recordTypePictureSrc — the flat fact plane", () => {
  const { recordTypePictureSrc, typePictureSrc } = make();

  test("bare entity-IRI string → the same /files URL the JSON-LD reader derives", () => {
    const iri = "https://ontology.example.test/base/e/y9gvj1mzk447";
    expect(recordTypePictureSrc({ typePicture: iri })).toBe("https://ontology.example.test/files/y9gvj1mzk447");
    // The two planes must never disagree about where one term's raster lives.
    expect(recordTypePictureSrc({ typePicture: iri })).toBe(typePictureSrc({ "a:typePicture": { "@id": iri } }));
  });

  test("the a:-prefixed spelling reads too", () => {
    expect(recordTypePictureSrc({ "a:typePicture": "https://ontology.example.test/base/e/abc123" })).toBe(
      "https://ontology.example.test/files/abc123",
    );
  });

  test("absence is null — an ordinary record keeps its kind glyph, unchanged", () => {
    expect(recordTypePictureSrc({ label: "A note" })).toBeNull();
    expect(recordTypePictureSrc({})).toBeNull();
    expect(recordTypePictureSrc(null)).toBeNull();
    expect(recordTypePictureSrc(undefined)).toBeNull();
  });

  test("never treats the /base/t/<Type>.png serve route as a stored object", () => {
    expect(recordTypePictureSrc({ typePicture: "https://ontology.example.test/base/t/Chair.png" })).toBeNull();
  });

  test("a real entity id CONTAINING `png` is a picture — not a serve route", () => {
    expect(recordTypePictureSrc({ typePicture: "https://ontology.example.test/base/e/fpngn43e70b4" })).toBe(
      "https://ontology.example.test/files/fpngn43e70b4",
    );
    expect(typePictureSrc({ "a:typePicture": { "@id": "https://ontology.example.test/base/e/fpngn43e70b4" } })).toBe(
      "https://ontology.example.test/files/fpngn43e70b4",
    );
  });

  test("an /base/e/ id that genuinely ENDS in an extension is still refused", () => {
    expect(recordTypePictureSrc({ typePicture: "https://ontology.example.test/base/e/thumb.png" })).toBeNull();
    expect(recordTypePictureSrc({ typePicture: "https://ontology.example.test/base/e/doc.jpeg" })).toBeNull();
  });

  test("a value that is undefined under both keys is null", () => {
    expect(recordTypePictureSrc({ typePicture: undefined })).toBeNull();
  });
});

describe("fileBytesUrl", () => {
  const originOf = vi.fn((_iri: string) => "https://files.example.test");
  const s = make({ originOf });

  test("accepts a /base/e/ entity IRI and asks originOf for the origin", () => {
    const id = "https://example.test/base/e/fpngn43e70b4";
    expect(s.fileBytesUrl(id)).toBe("https://files.example.test/files/fpngn43e70b4");
    expect(originOf).toHaveBeenLastCalledWith(id);
  });
  test("the origin is whatever the host's function says, scheme included", () => {
    const http = make({ originOf: () => "http://files.example.test:8080" });
    expect(http.fileBytesUrl("https://example.test/base/e/abc")).toBe("http://files.example.test:8080/files/abc");
  });
  test("rejects an id that is not a /base/e/ address", () => {
    for (const id of ["https://example.test/base/t/Chair", "https://example.test/files/abc", "abc", "", "/base/x/abc"]) expect(s.fileBytesUrl(id), id).toBeNull();
  });
  test("rejects an id whose last piece ends in an extension", () => {
    for (const id of ["https://example.test/base/e/x.png", "https://example.test/base/e/x.JPEG", "https://example.test/base/e/a.b1"]) expect(s.fileBytesUrl(id), id).toBeNull();
  });
  test("rejects an empty last piece and a malformed URL", () => {
    expect(s.fileBytesUrl("https://example.test/base/e/")).toBeNull();
    expect(s.fileBytesUrl("/base/e/abc")).toBeNull();
    expect(s.fileBytesUrl("not a url /base/e/abc")).toBeNull();
  });
  test("rejects a value that is not a string", () => {
    for (const v of [null, undefined, 5, {}, ["https://example.test/base/e/abc"]]) expect(s.fileBytesUrl(v)).toBeNull();
  });
  test("accepts an id that contains png but does not end with an extension", () => {
    expect(s.fileBytesUrl("https://example.test/base/e/fpngn43e70b4")).toBe("https://files.example.test/files/fpngn43e70b4");
  });
});

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const withPicture = { "a:typePicture": { "@id": "https://example.test/base/e/pic1" } };

describe("fetchTypePictureSrc and the cache", () => {
  test("one GET per name, to the term URL, asking for JSON; the answer is the picture's bytes URL", async () => {
    const fetchStub = vi.fn(async () => json(withPicture));
    const s = make({ fetch: fetchStub as unknown as typeof fetch });
    expect(await s.fetchTypePictureSrc("Chair")).toBe("https://example.test/files/pic1");
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub).toHaveBeenCalledWith("https://ontology.example.test/base/t/Chair", { headers: { accept: "application/json" } });
  });

  test("the same type under another spelling is the same name: still one GET, and the same promise", async () => {
    const fetchStub = vi.fn(async () => json(withPicture));
    const s = make({ fetch: fetchStub as unknown as typeof fetch });
    const a = s.fetchTypePictureSrc("Chair");
    const b = s.fetchTypePictureSrc("t:Chair");
    expect(a).toBe(b);
    await a;
    await s.fetchTypePictureSrc("https://vault.example.test/base/t/Chair");
    expect(fetchStub).toHaveBeenCalledTimes(1);
    await s.fetchTypePictureSrc("Table");
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  test("a document with no picture is null, and that answer is remembered", async () => {
    const fetchStub = vi.fn(async () => json({}));
    const s = make({ fetch: fetchStub as unknown as typeof fetch });
    expect(await s.fetchTypePictureSrc("Chair")).toBeNull();
    expect(await s.fetchTypePictureSrc("Chair")).toBeNull();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  test("a 404 is remembered as no picture: no second GET", async () => {
    const fetchStub = vi.fn(async () => json({}, 404));
    const s = make({ fetch: fetchStub as unknown as typeof fetch });
    expect(await s.fetchTypePictureSrc("Chair")).toBeNull();
    expect(await s.fetchTypePictureSrc("Chair")).toBeNull();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  test("a 500 is not remembered: the next ask goes to the server again", async () => {
    const fetchStub = vi.fn().mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json(withPicture));
    const s = make({ fetch: fetchStub as unknown as typeof fetch });
    expect(await s.fetchTypePictureSrc("Chair")).toBeNull();
    expect(await s.fetchTypePictureSrc("Chair")).toBe("https://example.test/files/pic1");
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  test("other failures (403, 429) are not remembered either", async () => {
    for (const status of [403, 429, 503]) {
      const fetchStub = vi.fn(async () => json({}, status));
      const s = make({ fetch: fetchStub as unknown as typeof fetch });
      await s.fetchTypePictureSrc("Chair");
      await s.fetchTypePictureSrc("Chair");
      expect(fetchStub, String(status)).toHaveBeenCalledTimes(2);
    }
  });

  test("a network error is null and is not remembered", async () => {
    const fetchStub = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(json(withPicture));
    const s = make({ fetch: fetchStub as unknown as typeof fetch });
    expect(await s.fetchTypePictureSrc("Chair")).toBeNull();
    expect(await s.fetchTypePictureSrc("Chair")).toBe("https://example.test/files/pic1");
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  test("a body that is not JSON is null and is not remembered", async () => {
    const bad = { ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } } as unknown as Response;
    const fetchStub = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(json(withPicture));
    const s = make({ fetch: fetchStub as unknown as typeof fetch });
    expect(await s.fetchTypePictureSrc("Chair")).toBeNull();
    expect(await s.fetchTypePictureSrc("Chair")).toBe("https://example.test/files/pic1");
  });

  test("clearTypePictureCache forgets every answer, a remembered 404 included", async () => {
    const fetchStub = vi.fn().mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json(withPicture));
    const s = make({ fetch: fetchStub as unknown as typeof fetch });
    expect(await s.fetchTypePictureSrc("Chair")).toBeNull();
    s.clearTypePictureCache();
    expect(await s.fetchTypePictureSrc("Chair")).toBe("https://example.test/files/pic1");
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  test("a name that is not a type name is null without a GET", async () => {
    const fetchStub = vi.fn(async () => json(withPicture));
    const s = make({ fetch: fetchStub as unknown as typeof fetch });
    for (const name of ["", "  ", "a/b"]) expect(await s.fetchTypePictureSrc(name), name).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  test("each source holds its own cache", async () => {
    const fetchStub = vi.fn(async () => json(withPicture));
    const a = make({ fetch: fetchStub as unknown as typeof fetch });
    const b = make({ fetch: fetchStub as unknown as typeof fetch });
    await a.fetchTypePictureSrc("Chair");
    await b.fetchTypePictureSrc("Chair");
    expect(fetchStub).toHaveBeenCalledTimes(2);
    a.clearTypePictureCache();
    await b.fetchTypePictureSrc("Chair");
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  test("without a fetch option it uses globalThis.fetch, looked up at call time", async () => {
    const s = make();
    const first = vi.fn(async () => json(withPicture));
    vi.stubGlobal("fetch", first);
    expect(await s.fetchTypePictureSrc("Chair")).toBe("https://example.test/files/pic1");
    expect(first).toHaveBeenCalledTimes(1);
    const second = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", second);
    expect(await s.fetchTypePictureSrc("Table")).toBeNull();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("the fetch option wins over globalThis.fetch", async () => {
    const global = vi.fn(async () => json(withPicture));
    vi.stubGlobal("fetch", global);
    const own = vi.fn(async () => json({}));
    await make({ fetch: own as unknown as typeof fetch }).fetchTypePictureSrc("Chair");
    expect(own).toHaveBeenCalledTimes(1);
    expect(global).not.toHaveBeenCalled();
  });
});
