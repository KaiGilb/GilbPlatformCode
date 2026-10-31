// The live skill search client. The first ten cases are the source's own (`searchSkillsRemote.test.ts`: 9 + 1), with the
// source's `vi.mock`-free structure kept; the catalogue host is the test origin the host sets (`setTermOrigin`), not a
// load-time constant. The rest are new: the request, the filtering, the errors and the origin read at call time.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { skillReferentUri } from "@kaigilb/gilbplatformcode-contact-rows";
import {
  SKILL_SEARCH_DEBOUNCE_MS,
  SKILL_SEARCH_LIST_CHARS,
  SKILL_SEARCH_MIN_CHARS,
  SKILL_SEARCH_RESULT_CAP,
  SkillSearchError,
  searchSkillsRemote,
  vedaVaultId,
} from "./searchSkillsRemote";
import { NURSING, ORIGIN, body, clearOrigin, hit, stubSearch, useOrigin } from "../test/support";

beforeEach(() => useOrigin());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearOrigin();
});

describe("searchSkillsRemote (the source's cases)", () => {
  test("maps enriched hits into ThinSkill and preserves typeUri for skillReferentUri", async () => {
    stubSearch((url) => {
      expect(url).toContain("/base/search?");
      expect(url).toContain("match=prefix");
      expect(url).toContain(`vault=${encodeURIComponent(vedaVaultId())}`);
      expect(url).toContain("q=sykepleie");
      return body({
        count: 2,
        ids: [`${ORIGIN}/base/e/aaa`, `${ORIGIN}/base/e/bbb`],
        hits: [
          { entity: `${ORIGIN}/base/e/aaa`, label: "nursing", typeUri: NURSING, does: "care for patients" },
          { entity: `${ORIGIN}/base/e/bbb`, label: "bad", typeUri: "https://evil.example/base/t/Nope", does: null },
        ],
        complete: true,
        pageSize: 20,
      });
    });
    const res = await searchSkillsRemote("sykepleie");
    expect(res.source).toBe("live-corpus");
    expect(res.skills).toHaveLength(1);
    expect(res.skills[0]!.tag).toBe("nursing");
    expect(skillReferentUri(res.skills[0]!)).toBe(NURSING);
    expect(res.complete).toBe(true);
  });

  test("empty / short query does not hit the network", async () => {
    const seen = stubSearch(() => body({}));
    const res = await searchSkillsRemote(" ");
    expect(seen).toHaveLength(0);
    expect(res.skills).toEqual([]);
    expect(res.complete).toBe(true);
    expect(res.total).toEqual({ kind: "exact", value: 0 });
    expect(res.source).toBe("live-corpus");
  });

  test("caps results at SKILL_SEARCH_RESULT_CAP", async () => {
    const hits = Array.from({ length: 40 }, (_, i) => hit(`skill${i}`, `${ORIGIN}/base/t/Skill${i}`, null, i));
    stubSearch(() => body({ count: 40, ids: hits.map((h) => h.entity), hits, complete: false }));
    const res = await searchSkillsRemote("sk");
    expect(res.skills.length).toBeLessThanOrEqual(SKILL_SEARCH_RESULT_CAP);
  });

  test("throws SkillSearchError on non-OK", async () => {
    stubSearch(() => new Response("nope", { status: 503 }));
    await expect(searchSkillsRemote("phon")).rejects.toMatchObject({ status: 503 });
  });

  const wire = (b: unknown) => stubSearch(() => body(b));
  const oneHit = [hit("nursing", NURSING, null, 1)];

  test("post-C144 exact total: a census, and complete when it fits the page", async () => {
    wire({ total: { kind: "exact", value: 1 }, count: 1, ids: [oneHit[0]!.entity], hits: oneHit });
    const res = await searchSkillsRemote("nurs");
    expect(res.total).toEqual({ kind: "exact", value: 1 });
    expect(res.complete).toBe(true);
  });

  test("a BOUND (count ABSENT) is carried as atLeast, never as a census, and is not completeness", async () => {
    wire({ total: { kind: "atLeast", value: 200 }, ids: [oneHit[0]!.entity], hits: oneHit });
    const res = await searchSkillsRemote("s");
    expect(res.total).toEqual({ kind: "atLeast", value: 200 });
    expect(res.complete).toBe(false);
  });

  test("total:null (mode none): no total, and not a zero", async () => {
    wire({ total: null, ids: [oneHit[0]!.entity], hits: oneHit });
    const res = await searchSkillsRemote("s");
    expect(res.total).toBeNull();
    expect(res.complete).toBe(false);
  });

  test("an older server (count only, no total key) still reads as an exact census", async () => {
    wire({ count: 7266, ids: [oneHit[0]!.entity], hits: oneHit });
    const res = await searchSkillsRemote("s");
    expect(res.total).toEqual({ kind: "exact", value: 7266 });
  });

  test("people-search preferHeld adds prefer=held; the picker omits it", async () => {
    const seen = stubSearch(() => body({ count: 0, ids: [], hits: [] }));
    await searchSkillsRemote("materials");
    expect(seen[0]!.url).not.toContain("prefer=held");
    await searchSkillsRemote("materials", { preferHeld: true });
    expect(seen[1]!.url).toContain("prefer=held");
    expect(seen[1]!.url).toContain("match=prefix");
  });

  test("asks the term origin the host set, with vault= built from it", async () => {
    const seen = stubSearch(() => body({ count: 0, ids: [], hits: [] }));
    await searchSkillsRemote("nurs");
    expect(seen[0]!.url.startsWith(`${ORIGIN}/base/search?`)).toBe(true);
    expect(vedaVaultId()).toBe(`${ORIGIN}/base`);
  });
});

describe("the request", () => {
  test("is one anonymous GET: JSON accepted, no credential, no other header, the caller's abort signal", async () => {
    const seen = stubSearch(() => body({ ids: [], hits: [] }));
    const ac = new AbortController();
    await searchSkillsRemote("nurs", { signal: ac.signal });
    expect(seen).toHaveLength(1);
    const { url, init } = seen[0]!;
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(init.signal).toBe(ac.signal);
    expect(init.credentials).toBeUndefined();
    const u = new URL(url);
    expect(u.origin).toBe(ORIGIN);
    expect(u.pathname).toBe("/base/search");
    expect([...u.searchParams.keys()].sort()).toEqual(["match", "q", "vault"]);
    expect(u.searchParams.get("q")).toBe("nurs");
    expect(u.searchParams.get("match")).toBe("prefix");
    expect(u.searchParams.get("vault")).toBe(`${ORIGIN}/base`);
  });
  test("the query is trimmed and encoded", async () => {
    const seen = stubSearch(() => body({ ids: [], hits: [] }));
    await searchSkillsRemote("  sykepleie & co  ");
    expect(new URL(seen[0]!.url).searchParams.get("q")).toBe("sykepleie & co");
    expect(seen[0]!.url).toContain("q=sykepleie+%26+co");
  });
  test("the origin is read at the time of the call, not at load: a later setTermOrigin is the one used", async () => {
    const seen = stubSearch(() => body({ ids: [], hits: [] }));
    setTermOrigin("https://other.example.test");
    await searchSkillsRemote("nurs");
    expect(seen[0]!.url.startsWith("https://other.example.test/base/search?")).toBe(true);
    expect(new URL(seen[0]!.url).searchParams.get("vault")).toBe("https://other.example.test/base");
    expect(vedaVaultId()).toBe("https://other.example.test/base");
  });
  test("a referent under the OLD origin is then refused, one under the new one is kept", async () => {
    stubSearch(() =>
      body({
        ids: [],
        hits: [hit("old", `${ORIGIN}/base/t/Old`), hit("new", "https://other.example.test/base/t/New")],
      }),
    );
    setTermOrigin("https://other.example.test");
    const res = await searchSkillsRemote("ne");
    expect(res.skills.map((s) => s.tag)).toEqual(["new"]);
  });
  test("with no origin set, a real query throws the setting's error and makes no request; a blank query needs none", async () => {
    const seen = stubSearch(() => body({}));
    resetTermOrigin();
    await expect(searchSkillsRemote("nurs")).rejects.toThrow(/term-origin/);
    expect(seen).toHaveLength(0);
    await expect(searchSkillsRemote("")).resolves.toMatchObject({ skills: [] });
  });
  test("the constants", () => {
    expect([SKILL_SEARCH_DEBOUNCE_MS, SKILL_SEARCH_MIN_CHARS, SKILL_SEARCH_LIST_CHARS, SKILL_SEARCH_RESULT_CAP]).toEqual([140, 1, 2, 20]);
  });
});

describe("mapping the hits", () => {
  const run = async (hits: unknown[], opts?: Parameters<typeof searchSkillsRemote>[1], extra: object = {}) => {
    stubSearch(() => body({ ids: [], hits, ...extra }));
    return searchSkillsRemote("ab", opts);
  };
  test("a hit becomes a skill: tag from the label, entity as uri, typeUri, trimmed does, no path or hierarchy", async () => {
    const res = await run([{ entity: `${ORIGIN}/base/e/9`, label: " nursing ", typeUri: ` ${NURSING} `, does: "  care  " }]);
    expect(res.skills).toEqual([{ tag: "nursing", uri: `${ORIGIN}/base/e/9`, typeUri: NURSING, does: "care", escoUri: null, harnessRole: null }]);
  });
  test("no label: the tag is the tail of the type address; no does: the empty string", async () => {
    const res = await run([{ entity: "e1", label: null, typeUri: NURSING, does: null }]);
    expect(res.skills[0]!.tag).toBe("Nursing");
    expect(res.skills[0]!.does).toBe("");
  });
  test("a blank label falls back to the tail too", async () => {
    const res = await run([{ entity: "e1", label: "   ", typeUri: NURSING, does: null }]);
    expect(res.skills[0]!.tag).toBe("Nursing");
  });
  test("a hit with no type address, a blank one, or one of another origin or shape is dropped", async () => {
    const res = await run([
      { entity: "1", label: "a", typeUri: null, does: null },
      { entity: "2", label: "b", typeUri: "  ", does: null },
      { entity: "3", label: "c", typeUri: `${ORIGIN}/base/e/xyz`, does: null },
      { entity: "4", label: "d", typeUri: `${ORIGIN}/base/t/lower`, does: null },
      { entity: "5", label: "e", typeUri: `${ORIGIN}/base/t/Has-Dash`, does: null },
      { entity: "6", label: "f", typeUri: `${ORIGIN}/base/t/Ok/More`, does: null },
      { entity: "7", label: "g", typeUri: `https://sub.${ORIGIN.slice(8)}/base/t/Good`, does: null },
      { entity: "8", label: "h", typeUri: `${ORIGIN}/base/t/Fine2`, does: null },
    ]);
    expect(res.skills.map((s) => s.tag)).toEqual(["h"]);
  });
  test("the origin is matched as text, not as a pattern: a dot is a dot", async () => {
    const res = await run([{ entity: "1", label: "x", typeUri: `https://catalogueXexample.test/base/t/Good`, does: null }]);
    expect(res.skills).toEqual([]);
  });
  test("the limit option cuts the list; the default is the cap", async () => {
    const hits = Array.from({ length: 30 }, (_, i) => hit(`s${i}`, `${ORIGIN}/base/t/S${i}`, null, i));
    expect((await run(hits, { limit: 3 })).skills).toHaveLength(3);
    expect((await run(hits)).skills).toHaveLength(SKILL_SEARCH_RESULT_CAP);
  });
  test("no hits array, or one that is not a list, is an empty result", async () => {
    expect((await run([])).skills).toEqual([]);
    stubSearch(() => body({ ids: [] }));
    expect((await searchSkillsRemote("ab")).skills).toEqual([]);
    stubSearch(() => body({ ids: [], hits: "none" }));
    expect((await searchSkillsRemote("ab")).skills).toEqual([]);
    stubSearch(() => body({ ids: [], hits: { 0: hit("a", NURSING) } }));
    expect((await searchSkillsRemote("ab")).skills).toEqual([]);
  });
  test("complete: the server's flag wins; a census that fits the page is complete; a census larger than the page is not", async () => {
    const hits = [hit("a", `${ORIGIN}/base/t/A`, null, 1), hit("b", `${ORIGIN}/base/t/B`, null, 2)];
    expect((await run(hits, undefined, { complete: true, total: { kind: "atLeast", value: 900 } })).complete).toBe(true);
    expect((await run(hits, undefined, { total: { kind: "exact", value: 2 } })).complete).toBe(true);
    expect((await run(hits, undefined, { total: { kind: "exact", value: 3 } })).complete).toBe(false);
    expect((await run(hits, undefined, { complete: "yes", total: { kind: "exact", value: 3 } })).complete).toBe(false);
    expect((await run(hits, undefined, {})).complete).toBe(false);
  });
  test("a malformed total is none, not the count", async () => {
    const res = await run([hit("a", `${ORIGIN}/base/t/A`)], undefined, { total: { kind: "exact", value: "many" }, count: 5 });
    expect(res.total).toBeNull();
  });
});

describe("a refusal", () => {
  test("is a SkillSearchError with the status and the first 200 characters of the answer", async () => {
    stubSearch(() => new Response("x".repeat(500), { status: 502 }));
    const err = await searchSkillsRemote("ab").catch((e) => e);
    expect(err).toBeInstanceOf(SkillSearchError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SkillSearchError");
    expect(err.status).toBe(502);
    expect(err.message).toBe(`SkillSearch 502 — ${"x".repeat(200)}`);
  });
  test("with no answer text the message is only the status", async () => {
    stubSearch(() => new Response("", { status: 404 }));
    const err = await searchSkillsRemote("ab").catch((e) => e);
    expect(err.message).toBe("SkillSearch 404");
  });
  test("a network failure is thrown as it is", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    await expect(searchSkillsRemote("ab")).rejects.toThrow("offline");
  });
});
