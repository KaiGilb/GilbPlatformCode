// New tests: the exports of source.ts, pinned over a fake fetch.
import { describe, expect, it } from "vitest";
import { CarrierSelectorMissingError, MASTER_READ_CAP_MS, MASTER_REQUEST_TIMEOUT_MS, NAMED_READ_MAX, masterSource } from "./source";
import { MasterTimeoutError, VocabularyUnavailableError } from "./terms";

const ORIGIN = "https://ontology.platform.example.test";
type Handler = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;
function master(handler: Handler) {
  const sent: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    sent.push({ url, init });
    const r = await handler(url, init);
    return r ?? new Response("{}", { status: 404 });
  };
  return { sent, fetchImpl };
}
const json = (body: unknown, status = 200) => Response.json(body, { status });

describe("the constants", () => {
  it("a request may take 10 s, a whole reading 20 s, a named read names at most 100 types", () => {
    expect(MASTER_REQUEST_TIMEOUT_MS).toBe(10_000);
    expect(MASTER_READ_CAP_MS).toBe(20_000);
    expect(NAMED_READ_MAX).toBe(100);
  });
});

describe("CarrierSelectorMissingError", () => {
  it("is a VocabularyUnavailableError that says what to do and keeps the url", () => {
    const e = new CarrierSelectorMissingError("https://h.example.test/x", "answered without `carries`");
    expect(e).toBeInstanceOf(VocabularyUnavailableError);
    expect(e.name).toBe("CarrierSelectorMissingError");
    expect(e.url).toBe("https://h.example.test/x");
    expect(e.message).toContain("not known yet");
    expect(e.message).toContain('carriers: "walk"');
  });
});

describe("masterSource: addresses and single reads", () => {
  it("termIri puts the path under /base/ on the origin, whatever the slashes", () => {
    const s = masterSource({ vedaOrigin: ORIGIN + "///", fetchImpl: master(() => undefined).fetchImpl });
    expect(s.termIri("t/Person")).toBe(`${ORIGIN}/base/t/Person`);
    expect(s.termIri("/a/label")).toBe(`${ORIGIN}/base/a/label`);
  });
  it("term reads the IRI's path and query at the origin, with cache no-cache and a signal, and returns the document", async () => {
    const m = master(() => json({ "@id": "x" }));
    const doc = await masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl }).term("https://other.example.test/base/t/Person?q=1");
    expect(doc).toEqual({ "@id": "x" });
    expect(m.sent[0]!.url).toBe(`${ORIGIN}/base/t/Person?q=1`);
    expect(m.sent[0]!.init?.cache).toBe("no-cache");
    expect(m.sent[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });
  it("each request gets an init of its own, so a fetch that writes onto it changes nothing another read sends", async () => {
    const inits: RequestInit[] = [];
    const fetchImpl = async (_u: string, init?: RequestInit) => { inits.push(init!); (init as { cache?: string }).cache = "reload"; return json({}); };
    const s = masterSource({ vedaOrigin: ORIGIN, fetchImpl });
    await s.term("/base/t/A");
    await s.term("/base/t/B");
    expect(inits[0]).not.toBe(inits[1]);
    expect(inits[1]!.cache).toBe("reload");
  });
  it("a relative IRI is read against the origin", async () => {
    const m = master(() => json({}));
    await masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl }).term("/base/a/label");
    expect(m.sent[0]!.url).toBe(`${ORIGIN}/base/a/label`);
  });
  it("an answer that is not 2xx, a fetch that fails, and a body that is not JSON are each a VocabularyUnavailableError", async () => {
    await expect(masterSource({ vedaOrigin: ORIGIN, fetchImpl: master(() => new Response("", { status: 503 })).fetchImpl }).term("/base/t/A")).rejects.toThrow(/answered 503/);
    await expect(masterSource({ vedaOrigin: ORIGIN, fetchImpl: async () => { throw new TypeError("offline"); } }).term("/base/t/A")).rejects.toThrow(/could not be reached: TypeError: offline/);
    await expect(masterSource({ vedaOrigin: ORIGIN, fetchImpl: master(() => new Response("<html>", { status: 200 })).fetchImpl }).term("/base/t/A")).rejects.toThrow(/served unparseable JSON/);
  });
  it("something that is not an address is a VocabularyUnavailableError, never a raw TypeError", async () => {
    const s = masterSource({ vedaOrigin: ORIGIN, fetchImpl: master(() => json({})).fetchImpl });
    await expect(s.term("http://[bad")).rejects.toThrow(VocabularyUnavailableError);
    await expect(s.term("http://[bad")).rejects.toThrow(/is not an address/);
  });
  it("a request that gets no answer within timeoutMs ends as a MasterTimeoutError", async () => {
    const s = masterSource({ vedaOrigin: ORIGIN, timeoutMs: 20, fetchImpl: () => new Promise<Response>(() => {}) });
    await expect(s.term("/base/t/A")).rejects.toBeInstanceOf(MasterTimeoutError);
  });
  it("a bound that is not a finite number above 0 is refused with a RangeError when the source is made", () => {
    for (const timeoutMs of [0, -5, NaN, Infinity]) expect(() => masterSource({ vedaOrigin: ORIGIN, timeoutMs })).toThrow(RangeError);
  });
  it("the global fetch is the default", async () => {
    const real = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (u: string) => { urls.push(String(u)); return json({ ok: 1 }); }) as typeof fetch;
    try {
      expect(await masterSource({ vedaOrigin: ORIGIN }).term("/base/t/A")).toEqual({ ok: 1 });
      expect(urls).toEqual([`${ORIGIN}/base/t/A`]);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("masterSource: children", () => {
  it("reads <type>/children, keeps entries with a term, and is complete only on an explicit true", async () => {
    const m = master((u) => (u === `${ORIGIN}/base/t/Person/children` ? json({ children: [{ term: "a", name: "A", label: "Al" }, { name: "no term" }, null, 5, { term: "b" }], complete: true }) : undefined));
    const page = await masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl }).children(`${ORIGIN}/base/t/Person/`);
    expect(page).toEqual({ children: [{ term: "a", name: "A", label: "Al" }, { term: "b", name: undefined, label: undefined }], complete: true });
  });
  it("an absent or false flag is not complete", async () => {
    const m = master(() => json({ children: [] }));
    expect((await masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl }).children("/base/t/X")).complete).toBe(false);
    const m2 = master(() => json({ children: [], complete: "true" }));
    expect((await masterSource({ vedaOrigin: ORIGIN, fetchImpl: m2.fetchImpl }).children("/base/t/X")).complete).toBe(false);
  });
  it("an answer with no children list is a VocabularyUnavailableError", async () => {
    const m = master(() => json({ complete: true }));
    await expect(masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl }).children("/base/t/X")).rejects.toThrow(/served no children list/);
  });
});

describe("masterSource: terms (the named read)", () => {
  it("reads several type terms in one request and matches each node to the IRI by its /base/t/<Name> path", async () => {
    const m = master((u) => (u.startsWith(`${ORIGIN}/base/vocab?`) ? json({ "@context": { t: "x" }, "@graph": [{ "@id": `${ORIGIN}/base/t/A`, v: 1 }, { "@id": `${ORIGIN}/base/t/B`, v: 2 }, { "@id": `${ORIGIN}/base/t/A`, v: 9 }, null, { v: 3 }] }) : undefined));
    const s = masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl });
    const out = await Promise.all(s.terms!([`${ORIGIN}/base/t/A`, `${ORIGIN}/base/t/B`, `${ORIGIN}/base/t/A`]));
    expect(m.sent.map((x) => x.url)).toEqual([`${ORIGIN}/base/vocab?status=all&type=A&type=B`]);
    expect(out[0]).toEqual({ "@id": `${ORIGIN}/base/t/A`, v: 1, "@context": { t: "x" } });
    expect(out[1]).toEqual({ "@id": `${ORIGIN}/base/t/B`, v: 2, "@context": { t: "x" } });
    expect(out[2]).toEqual(out[0]);
  });
  it("a term the named read does not carry is read on its own", async () => {
    const m = master((u) => (u.includes("/vocab?") ? json({ "@graph": [] }) : u === `${ORIGIN}/base/t/A` ? json({ own: true }) : undefined));
    const s = masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl });
    expect(await s.terms!([`${ORIGIN}/base/t/A`])[0]).toEqual({ own: true });
  });
  it("an IRI that is not a /base/t/<Name> path is read on its own, with no named read", async () => {
    const m = master(() => json({ one: 1 }));
    const s = masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl });
    expect(await s.terms!([`${ORIGIN}/base/a/label`])[0]).toEqual({ one: 1 });
    expect(m.sent.map((x) => x.url)).toEqual([`${ORIGIN}/base/a/label`]);
  });
  it("a refused named read sends each term to its own read", async () => {
    const m = master((u) => (u.includes("/vocab?") ? new Response("", { status: 500 }) : json({ own: u })));
    const s = masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl });
    const out = await Promise.all(s.terms!([`${ORIGIN}/base/t/A`, `${ORIGIN}/base/t/B`]));
    expect(out).toEqual([{ own: `${ORIGIN}/base/t/A` }, { own: `${ORIGIN}/base/t/B` }]);
  });
  it("more than NAMED_READ_MAX names go in chunks of that many", async () => {
    const m = master((u) => (u.includes("/vocab?") ? json({ "@graph": [] }) : json({})));
    const s = masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl });
    const iris = Array.from({ length: NAMED_READ_MAX + 1 }, (_, i) => `${ORIGIN}/base/t/T${i}`);
    await Promise.all(s.terms!(iris));
    const named = m.sent.filter((x) => x.url.includes("/vocab?"));
    expect(named).toHaveLength(2);
    expect(named[0]!.url.split("&type=").length - 1).toBe(NAMED_READ_MAX);
    expect(named[1]!.url.split("&type=").length - 1).toBe(1);
  });
  it("a named read that ran out of time is the same MasterTimeoutError for every term, not one read per term", async () => {
    const m = master((u) => (u.includes("/vocab?") ? new Promise<Response>(() => {}) : json({})));
    const s = masterSource({ vedaOrigin: ORIGIN, timeoutMs: 20, fetchImpl: m.fetchImpl });
    const out = s.terms!([`${ORIGIN}/base/t/A`, `${ORIGIN}/base/t/B`]);
    await expect(out[0]).rejects.toBeInstanceOf(MasterTimeoutError);
    await expect(out[1]).rejects.toBeInstanceOf(MasterTimeoutError);
    expect(m.sent).toHaveLength(1);
  });
});

describe("masterSource: carriersOf", () => {
  const page = (extra: Record<string, unknown>) => ({ carries: "label", carriesSpellings: ["label"], "@graph": [{ "@id": "n1", label: "x" }, { "@id": "n2" }, null], complete: true, ...extra });
  it("selector mode (the default) asks for the first spelling, keeps nodes that carry a fact under a key, lends the page's @context", async () => {
    const m = master((u) => (u.startsWith(`${ORIGIN}/base/vocab?`) ? json(page({ "@context": { c: 1 } })) : undefined));
    const list = await masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl }).carriersOf(["label", "a:label"]);
    expect(m.sent[0]!.url).toBe(`${ORIGIN}/base/vocab?status=all&carries=label&limit=100`);
    expect(list).toEqual({ terms: [{ "@id": "n1", label: "x", "@context": { c: 1 } }], complete: true, incompleteAt: [], read: "selector" });
  });
  it("a master that did not narrow the read is refused: no carries, another carries, or no carriesSpellings", async () => {
    for (const body of [page({ carries: undefined }), page({ carries: "other" }), page({ carriesSpellings: undefined })]) {
      const m = master(() => json(body));
      await expect(masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl }).carriersOf(["label"])).rejects.toBeInstanceOf(CarrierSelectorMissingError);
    }
  });
  it("the selector with no spelling to ask for is refused before anything is sent", async () => {
    const m = master(() => json(page({})));
    await expect(masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl }).carriersOf([])).rejects.toThrow(/was given no spelling/);
    expect(m.sent).toHaveLength(0);
  });
  it("follows next (a relative one against the origin) until complete, and stops with a stated gap when there is no next", async () => {
    const m = master((u) =>
      u.includes("cursor=k3") ? json(page({ complete: false })) : u.includes("limit=3") ? json(page({ complete: false, next: "/base/vocab?status=all&carries=label&limit=3&cursor=k3" })) : undefined,
    );
    const list = await masterSource({ vedaOrigin: ORIGIN, carrierPageSize: 3, fetchImpl: m.fetchImpl }).carriersOf(["label"]);
    expect(m.sent.map((x) => x.url)).toEqual([`${ORIGIN}/base/vocab?status=all&carries=label&limit=3`, `${ORIGIN}/base/vocab?status=all&carries=label&limit=3&cursor=k3`]);
    expect(list.complete).toBe(false);
    expect(list.incompleteAt).toEqual([`${ORIGIN}/base/vocab?status=all&carries=label&limit=3&cursor=k3 said complete=false and gave no next page`]);
  });
  it("maxPages stops a server that never says complete, and says so", async () => {
    // Each page brings a new term, so only the page ceiling can end this read (a page of terms already held ends it sooner: below).
    let n = 0;
    const m = master(() => json(page({ complete: false, next: "/base/vocab?again", "@graph": [{ "@id": `more${(n += 1)}`, label: "x" }] })));
    const list = await masterSource({ vedaOrigin: ORIGIN, maxPages: 2, fetchImpl: m.fetchImpl }).carriersOf(["label"]);
    expect(m.sent).toHaveLength(2);
    expect(list.complete).toBe(false);
    expect(list.incompleteAt[0]).toMatch(/^stopped after 2 pages at /);
  });

  // Spec: fix pass 1b item 7 (Agent.Scaling, Kai-Zen 2026-11-25): "The field list must never be cut silently ... If an answer holds
  // exactly `limit` items or says it is not complete, read the next page (the door gives `next` and `complete`). Test with a fake of
  // 1,200 terms: every column is present."
  // The fake copies the door's paging as GilbPlatform origin/main 82e7177d codes it (`src/routes/vocab.ts`, `buildVocabPageDocument` in
  // `src/vocab/document.ts`, read 2026-11-25): a keyset page of at most `limit` terms, `complete`, and `next` only when not complete.
  // ⚠ A GUESS, not measured live: a master holding more terms than one page (the live one held 847 on 2026-11-25, one page of 1000).
  describe("a list longer than one page (fix pass 1b, items 7 and 9)", () => {
    const TERMS = Array.from({ length: 1200 }, (_, i) => ({ "@id": `${ORIGIN}/base/t/Field${i}`, label: `field ${i}` }));
    /** The door: `limit` terms from the cursor on; `complete` and `next` as the platform's code sets them, unless `lie` changes them. */
    const paged = (lie: (page: Record<string, unknown>, from: number) => Record<string, unknown> = (p) => p) =>
      master((u) => {
        const q = new URL(u).searchParams;
        const limit = Number(q.get("limit"));
        const from = Number(q.get("cursor") ?? 0);
        const graph = TERMS.slice(from, from + limit);
        const complete = from + graph.length >= TERMS.length;
        const face: Record<string, unknown> = { carries: "label", carriesSpellings: ["label"], limit, complete, "@graph": graph };
        if (!complete) face["next"] = `/base/vocab?status=all&carries=label&limit=${limit}&cursor=${from + graph.length}`;
        return json(lie(face, from));
      });

    it("1,200 terms asked for 1000 at a time: every term is read, in 2 requests, and the list is complete", async () => {
      const m = paged();
      const list = await masterSource({ vedaOrigin: ORIGIN, carrierPageSize: 1000, fetchImpl: m.fetchImpl }).carriersOf(["label"]);
      expect(list.terms).toHaveLength(1200);
      expect(new Set(list.terms.map((t) => t["@id"])).size).toBe(1200);
      expect(m.sent).toHaveLength(2);
      expect(list.complete).toBe(true);
      expect(list.incompleteAt).toEqual([]);
    });

    it("a page that holds exactly `limit` terms and names a next page is read on, even when it says complete", async () => {
      // The first page is full (1000 of 1000) and wrongly says it is the whole list, while still naming the next page.
      const m = paged((p, from) => (from === 0 ? { ...p, complete: true } : p));
      const list = await masterSource({ vedaOrigin: ORIGIN, carrierPageSize: 1000, fetchImpl: m.fetchImpl }).carriersOf(["label"]);
      expect(list.terms).toHaveLength(1200);
      expect(m.sent).toHaveLength(2);
      expect(list.complete).toBe(true);
    });

    it("a full page that says complete and names no next page is taken at its word (there is nowhere to read on)", async () => {
      const m = master(() => json({ carries: "label", carriesSpellings: ["label"], limit: 3, complete: true, "@graph": TERMS.slice(0, 3) }));
      const list = await masterSource({ vedaOrigin: ORIGIN, carrierPageSize: 3, fetchImpl: m.fetchImpl }).carriersOf(["label"]);
      expect(list.terms).toHaveLength(3);
      expect(m.sent).toHaveLength(1);
      expect(list.complete).toBe(true);
    });

    // Spec: fix pass 1b item 9: "a page that returns only ids already held ends the read, like the empty-page guard."
    it("a page that serves only terms already held ends the read, and the list is said to be not complete", async () => {
      // The door answers the first 3 terms on every page and always names a next page: before this guard it was asked 200 times.
      const m = master(() => json({ carries: "label", carriesSpellings: ["label"], limit: 3, complete: false, next: "/base/vocab?status=all&carries=label&limit=3&cursor=same", "@graph": TERMS.slice(0, 3) }));
      const list = await masterSource({ vedaOrigin: ORIGIN, carrierPageSize: 3, fetchImpl: m.fetchImpl }).carriersOf(["label"]);
      expect(m.sent).toHaveLength(2);
      expect(list.terms).toHaveLength(3);
      expect(list.complete).toBe(false);
      expect(list.incompleteAt).toEqual([`${ORIGIN}/base/vocab?status=all&carries=label&limit=3&cursor=same served no term this read did not already hold, and still named a next page`]);
    });

    it("an empty page that names a next page ends the read too, and is not the end of the list", async () => {
      const m = master((u) =>
        u.includes("cursor=") ? json({ carries: "label", carriesSpellings: ["label"], limit: 3, complete: false, next: "/base/vocab?status=all&carries=label&limit=3&cursor=on", "@graph": [] }) : json({ carries: "label", carriesSpellings: ["label"], limit: 3, complete: false, next: "/base/vocab?status=all&carries=label&limit=3&cursor=on", "@graph": TERMS.slice(0, 3) }),
      );
      const list = await masterSource({ vedaOrigin: ORIGIN, carrierPageSize: 3, fetchImpl: m.fetchImpl }).carriersOf(["label"]);
      expect(m.sent).toHaveLength(2);
      expect(list.complete).toBe(false);
    });

    it("a term served on two pages is kept once", async () => {
      // Page 2 repeats the last term of page 1 and adds one new: 4 distinct terms.
      const m = master((u) =>
        u.includes("cursor=") ? json({ carries: "label", carriesSpellings: ["label"], limit: 3, complete: true, "@graph": [TERMS[2], TERMS[3]] }) : json({ carries: "label", carriesSpellings: ["label"], limit: 3, complete: false, next: "/base/vocab?status=all&carries=label&limit=3&cursor=3", "@graph": TERMS.slice(0, 3) }),
      );
      const list = await masterSource({ vedaOrigin: ORIGIN, carrierPageSize: 3, fetchImpl: m.fetchImpl }).carriersOf(["label"]);
      expect(list.terms.map((t) => t["@id"])).toEqual([0, 1, 2, 3].map((i) => `${ORIGIN}/base/t/Field${i}`));
      expect(list.complete).toBe(true);
    });
  });
  it("a page with no @graph is a VocabularyUnavailableError", async () => {
    const m = master(() => json({ carries: "label", carriesSpellings: [] }));
    await expect(masterSource({ vedaOrigin: ORIGIN, fetchImpl: m.fetchImpl }).carriersOf(["label"])).rejects.toThrow(/served no @graph/);
  });
  it("walk mode reads the whole listing at pageSize, needs no selector face, and says whole-walk", async () => {
    const m = master(() => json({ "@graph": [{ label: "x" }, { other: 1 }], complete: true }));
    const list = await masterSource({ vedaOrigin: ORIGIN, carriers: "walk", pageSize: 50, fetchImpl: m.fetchImpl }).carriersOf(["label"]);
    expect(m.sent[0]!.url).toBe(`${ORIGIN}/base/vocab?status=all&limit=50`);
    expect(list).toEqual({ terms: [{ label: "x" }], complete: true, incompleteAt: [], read: "whole-walk" });
  });
  it("walk mode ignores an empty readKeys list and reads anyway, finding no carriers", async () => {
    const m = master(() => json({ "@graph": [{ label: "x" }], complete: true }));
    const list = await masterSource({ vedaOrigin: ORIGIN, carriers: "walk", fetchImpl: m.fetchImpl }).carriersOf([]);
    expect(list.terms).toEqual([]);
    expect(m.sent[0]!.url).toBe(`${ORIGIN}/base/vocab?status=all&limit=2000`);
  });
});
