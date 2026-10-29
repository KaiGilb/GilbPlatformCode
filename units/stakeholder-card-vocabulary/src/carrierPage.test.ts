/**
 * The card's carrier read (`carries=a:fieldOf`) is one request, not four.
 *
 * The package pages the carrier read at 100 by default; the master held 320 carriers of `a:fieldOf`
 * on 2026-10-22, so the app sent 4 dependent requests every app session. The card
 * asks `limit=400` (`CARD_CARRIER_PAGE_SIZE`) and the package still follows `next` past it.
 *
 * The carrier master here serves `n` nodes behind the selector's face, paged by `limit` exactly as
 * the fixture master (and GilbPlatform) page it. Its nodes are the existing term `t/Person` and
 * carry no `a:fieldOf` fact, so the package keeps none of them: only the paging is measured, and no
 * term is invented. The field sets themselves are checked on the package's own fixture master.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { resetTermOrigin, setTermOrigin, termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { fixtureMaster, RIG, ID } from "../test/support";
import { withReferenceTerms } from "../test/fixtureReference";
import { CARD_CARRIER_PAGE_SIZE, cardMasterSource, readStakeholderCardVocabulary } from "./stakeholderCardVocabulary";

beforeEach(() => {
  resetTermOrigin();
  setTermOrigin(ID);
});

/** A master whose carrier read holds `n` nodes, paged by the `limit` it is asked for. */
function carrierMaster(n: number) {
  const requested: string[] = [];
  const fetch = async (url: string): Promise<Response> => {
    requested.push(url);
    const u = new URL(url);
    const name = u.searchParams.get("carries");
    if (u.pathname !== "/base/vocab" || !name) return new Response("{}", { status: 404 });
    const limit = Number(u.searchParams.get("limit") ?? "2000");
    const offset = Number((u.searchParams.get("cursor") ?? "k0").slice(1));
    const count = Math.max(0, Math.min(limit, n - offset));
    const complete = offset + limit >= n;
    return Response.json({
      "@id": url,
      carries: name,
      carriesSpellings: [name],
      limit,
      complete,
      next: complete ? null : `${termOrigin()}/base/vocab?status=all&carries=${encodeURIComponent(name)}&limit=${limit}&cursor=k${offset + limit}`,
      "@graph": Array.from({ length: count }, () => ({ "@id": `${termOrigin()}/base/t/Person` })),
    });
  };
  return { requested, fetch, carrierReads: () => requested.filter((r) => r.includes("carries=")) };
}

describe("cardMasterSource — the carrier read", () => {
  it("reads the 320 carriers the live master held on 2026-10-22 in ONE request (it was 4)", async () => {
    const m = carrierMaster(320);
    const read = await cardMasterSource(m.fetch).carriersOf(["a:fieldOf"]);
    expect(m.carrierReads()).toHaveLength(1);
    expect(m.carrierReads()[0]).toContain(`limit=${CARD_CARRIER_PAGE_SIZE}`);
    expect(read.complete).toBe(true);
    expect(read.incompleteAt).toEqual([]);
  });

  it("asks a page of 400, within the master's cap of 2,000 (GilbPlatform VOCAB_PAGE_MAX)", () => {
    expect(CARD_CARRIER_PAGE_SIZE).toBe(400);
    expect(CARD_CARRIER_PAGE_SIZE).toBeLessThanOrEqual(2000);
  });

  it("keeps paging past 400 carriers: 401 → 2 requests, 1,200 → 3, and the read is complete", async () => {
    for (const [n, reads] of [[401, 2], [1200, 3], [400, 1], [0, 1]] as const) {
      const m = carrierMaster(n);
      const read = await cardMasterSource(m.fetch).carriersOf(["a:fieldOf"]);
      expect(m.carrierReads(), `n=${n}`).toHaveLength(reads);
      expect(read.complete, `n=${n}`).toBe(true);
    }
  });

  it("a read that fails part-way rejects; it never returns a short list as the whole one", async () => {
    const m = carrierMaster(900);
    const fetch = async (url: string) => (url.includes("cursor=k800") ? new Response("{}", { status: 503 }) : m.fetch(url));
    await expect(cardMasterSource(fetch).carriersOf(["a:fieldOf"])).rejects.toThrow(/answered 503/);
  });
});

describe("the card's field sets are unchanged by the page size", () => {
  function master() {
    const m = withReferenceTerms(fixtureMaster());
    // The card reads the master at its identity origin; the fixture answers at the rig.
    const hostFetch = (url: string, init?: RequestInit) => m.fetch(url.replace(ID, RIG), init);
    return { m, hostFetch };
  }

  it("the field sets the card reads equal resolveFieldSets at the package's own page size, on the same master", async () => {
    const { m } = master();
    const direct = await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
    const { m: m2, hostFetch } = master();
    const card = await readStakeholderCardVocabulary(cardMasterSource(hostFetch));
    expect(card.fieldSetsRefusal).toBeNull();
    expect(JSON.stringify(card.fieldSets!.byKind)).toBe(JSON.stringify(direct.byKind));
    expect(card.fieldSets!.complete).toBe(direct.complete);
    const carrier = m2.requested.filter((u) => u.includes("carries="));
    expect(carrier).toHaveLength(1);
    expect(carrier[0]).toContain(`limit=${CARD_CARRIER_PAGE_SIZE}`);
    // Every read still checks back with the master.
    expect(m2.inits.every((i) => i?.cache === "no-cache")).toBe(true);
  });

  it("on a master without the carrier selector the card still says 'not known yet', never an empty set", async () => {
    const { m, hostFetch } = master();
    m.selector = false;
    const card = await readStakeholderCardVocabulary(cardMasterSource(hostFetch));
    expect(card.fieldSets).toBeNull();
    expect(card.fieldSetsRefusal).toMatch(/^not known yet: /);
  });
});
