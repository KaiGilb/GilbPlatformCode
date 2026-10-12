// The term resolver is the reason this package exists, so its tests are about ONE question:
// does the answer come from the master, or from a list someone typed?
//
// Every fixture below is a served DOCUMENT. If the resolver were reading a hardcoded list, the
// "master changed" cases would still return the old answer and go red.
import { describe, it, expect, vi } from "vitest";
import {
  resolvePhotoTerm,
  createPhotoTermResolver,
  photoRefFromFacts,
  PhotoTermUnavailableError,
} from "./photoTerm";

/** The photo term EXACTLY as the GilbVeda master served it 2026-09-16 (control a/zzqqnotaterm -> 404). */
const LIVE_DOC = {
  "@id": "https://ontology.example.test/base/a/profilePhoto",
  "a:ontologyStatus": "Approved",
  "a:predicateAttribute": "a:profilePhoto|a:hasPhoto",
  "a:deprecatedNotation": "a:hasPhoto",
  "a:encoding": "inline-literal:text",
};

const serve = (doc: unknown, status = 200) =>
  vi.fn(async () =>
    new Response(JSON.stringify(doc), { status, headers: { "content-type": "application/json" } }),
  );

describe("resolvePhotoTerm — the answer comes from the served document", () => {
  it("reads BOTH spellings and writes only the survivor", async () => {
    const term = await resolvePhotoTerm({
      vedaOrigin: "https://ontology.example.test",
      fetchImpl: serve(LIVE_DOC),
    });
    expect(term.writeKey).toBe("a:profilePhoto");
    expect(term.writeKeyBare).toBe("profilePhoto");
    // The retired spelling is READ — deprecation retires the write, never the read.
    expect(term.readKeys).toEqual(
      expect.arrayContaining(["a:profilePhoto", "a:hasPhoto", "profilePhoto", "hasPhoto"]),
    );
  });

  it("asks the term's own address", async () => {
    const f = serve(LIVE_DOC);
    await resolvePhotoTerm({ vedaOrigin: "https://ontology.example.test/", fetchImpl: f });
    expect(f).toHaveBeenCalledWith("https://ontology.example.test/base/a/profilePhoto");
  });

  // 🔴 THE DISCRIMINATOR between "resolved" and "hardcoded". A hand-kept list cannot produce
  // this answer: the master names a spelling no app has ever heard of, and the reader picks it
  // up with no code change. If this package ever regresses to a literal list, this goes red.
  it("picks up a spelling the apps have never heard of, because the master named it", async () => {
    const term = await resolvePhotoTerm({
      vedaOrigin: "https://ontology.example.test",
      fetchImpl: serve({
        ...LIVE_DOC,
        "a:predicateAttribute": "a:faceImage|a:profilePhoto|a:hasPhoto",
        "a:deprecatedNotation": "a:profilePhoto|a:hasPhoto",
      }),
    });
    expect(term.writeKey).toBe("a:faceImage");
    expect(term.readKeys).toEqual(expect.arrayContaining(["a:faceImage", "faceImage"]));
    // and the now-retired old spellings are still READ, so existing photos stay visible
    expect(term.readKeys).toEqual(expect.arrayContaining(["a:profilePhoto", "a:hasPhoto"]));
  });

  it("refuses to guess when several spellings are current and none retired", async () => {
    await expect(
      resolvePhotoTerm({
        vedaOrigin: "https://ontology.example.test",
        fetchImpl: serve({ ...LIVE_DOC, "a:predicateAttribute": "a:one|a:two", "a:deprecatedNotation": undefined }),
      }),
    ).rejects.toBeInstanceOf(PhotoTermUnavailableError);
  });

  it("refuses to write a retired spelling when every spelling is retired", async () => {
    await expect(
      resolvePhotoTerm({
        vedaOrigin: "https://ontology.example.test",
        fetchImpl: serve({ ...LIVE_DOC, "a:predicateAttribute": "a:gone", "a:deprecatedNotation": "a:gone" }),
      }),
    ).rejects.toBeInstanceOf(PhotoTermUnavailableError);
  });

  it("a non-200 from the master is an unavailability, not an empty term", async () => {
    await expect(
      resolvePhotoTerm({ vedaOrigin: "https://ontology.example.test", fetchImpl: serve({}, 503) }),
    ).rejects.toBeInstanceOf(PhotoTermUnavailableError);
  });
});

describe("createPhotoTermResolver — a cold master never becomes 'no photo'", () => {
  it("resolves once and reuses the answer", async () => {
    const f = serve(LIVE_DOC);
    const r = createPhotoTermResolver({ vedaOrigin: "https://ontology.example.test", fetchImpl: f });
    await r.get();
    await r.get();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("serves the last good answer when a later refresh fails", async () => {
    const store = new Map<string, string>();
    const backing = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const good = createPhotoTermResolver({ vedaOrigin: "https://v", fetchImpl: serve(LIVE_DOC), store: backing });
    await good.get();

    // A NEW resolver (fresh page load) whose network is dead still answers from the store.
    const dead = createPhotoTermResolver({
      vedaOrigin: "https://v",
      fetchImpl: vi.fn(async () => { throw new Error("offline"); }),
      store: backing,
    });
    const term = await dead.get();
    expect(term.writeKey).toBe("a:profilePhoto");
  });

  // 🔴 The rule the seed exists to satisfy: a cold master must never present itself as
  // "this person has no photo". With no cache and no network, the reader still has a read set,
  // so an existing face still paints.
  it("falls back to the dated seed when there is no cache and no network", async () => {
    const r = createPhotoTermResolver({
      vedaOrigin: "https://v",
      fetchImpl: vi.fn(async () => { throw new Error("offline"); }),
    });
    const term = await r.get();
    expect(term.readKeys).toEqual(expect.arrayContaining(["a:profilePhoto", "hasPhoto"]));
    expect(term.writeKey).toBe("a:profilePhoto");
  });

  // ...and the seed is only ever a FLOOR. A live read that disagrees with it wins outright,
  // which is what keeps the seed from quietly becoming the operative truth.
  it("a live read overrides the seed", async () => {
    const r = createPhotoTermResolver({
      vedaOrigin: "https://v",
      fetchImpl: serve({ ...LIVE_DOC, "a:predicateAttribute": "a:faceImage", "a:deprecatedNotation": undefined }),
    });
    const term = await r.get();
    expect(term.writeKey).toBe("a:faceImage");
  });

  it("with the seed refused, a resolver that never succeeded fails loudly rather than guessing", async () => {
    const r = createPhotoTermResolver({
      vedaOrigin: "https://v",
      useSeed: false,
      fetchImpl: vi.fn(async () => { throw new Error("offline"); }),
    });
    await expect(r.get()).rejects.toBeInstanceOf(Error);
    expect(r.peek()).toBeNull();
  });
});

describe("photoRefFromFacts — reads a stored fact under any live spelling", () => {
  const term = { readKeys: ["a:profilePhoto", "a:hasPhoto", "profilePhoto", "hasPhoto"] };

  it("finds the photo under the approved spelling", () => {
    expect(photoRefFromFacts({ "a:profilePhoto": "/files/abc" }, term)).toBe("/files/abc");
  });

  // This is the cross-app case: a photo one app could see and another could not.
  it("finds the photo under the RETIRED spelling", () => {
    expect(photoRefFromFacts({ hasPhoto: "/files/old" }, term)).toBe("/files/old");
  });

  it("accepts the reference-node shape as well as a plain string", () => {
    expect(photoRefFromFacts({ profilePhoto: { "@id": "/files/node" } }, term)).toBe("/files/node");
  });

  it("returns null when no spelling is present — and does not scan unrelated keys", () => {
    expect(photoRefFromFacts({ "a:personalNote": "/files/nope" }, term)).toBeNull();
  });
});

describe("the seed — a reading of one term, on the host's own origin", () => {
  const offline = () => vi.fn(async (): Promise<Response> => { throw new Error("offline"); });

  it("names the term on the injected origin, not on a host baked into the unit", () => {
    const r = createPhotoTermResolver({ vedaOrigin: "https://ontology.example.test/", fetchImpl: offline() });
    expect(r.peek()?.termUrl).toBe("https://ontology.example.test/base/a/profilePhoto");
    expect(r.peek()?.writeKeyBare).toBe("profilePhoto");
  });

  it("is not used for another slug: a reading of profilePhoto is no answer about another term", async () => {
    const r = createPhotoTermResolver({ vedaOrigin: "https://ontology.example.test", slug: "coverImage", fetchImpl: offline() });
    expect(r.peek()).toBeNull();
    await expect(r.get()).rejects.toBeInstanceOf(PhotoTermUnavailableError);
  });
});
