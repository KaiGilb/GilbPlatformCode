// @vitest-environment jsdom
// Ported (16 cases) from the source's `entityRefChildren.test.ts` (2 of 3; the third tests `findByAttribute`, which is `lws-vault-sets`'),
// `entityRefChildren.c150qa.test.ts` (7 of 10; the 3 older-Base fallback cases test `findByAttribute`, which is `lws-vault-sets`') and
// `entityRefChildren.twoHost.d9.test.ts` (7 of 7; the proof-signature assertions are `lws-session-bridge`'s). Re-based on the real
// `lws-vault-sets`, `lws-records` and `vault-origin-rule` over a fake platform (test/support.ts) in place of `vi.mock` of the record
// client and the token store. The new cases (the cap, the parent's node, the skip set) are in the other files.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { MEMBER_OF_ATTR, MEMBER_OF_FIND_PAGE, MEMBER_OF_HYDRATE_CAP, cachedRecordsPointingAt, findAllMemberOfIds, loadMemberOfChildren } from "./index";
import { APEX, NORWAY, SYSTEM, VAULT_A, VAULT_B, fakePlatform, kids, setUp, tearDown } from "../test/support";

beforeEach(() => setUp());
afterEach(() => tearDown());

const OSLO = `${SYSTEM}/base/e/osm-r-406091`;
const VESTLAND = `${SYSTEM}/base/e/osm-r-vestland`;

describe("loadMemberOfChildren (source entityRefChildren.test)", () => {
  it("hydrates each reverse-lookup id at its own door", async () => {
    const w = fakePlatform({ stores: { [SYSTEM]: { [NORWAY]: [OSLO, VESTLAND] } } });
    const out = await loadMemberOfChildren(NORWAY);
    expect(out.records.map((k) => k.id)).toEqual(["osm-r-406091", "osm-r-vestland"]);
    expect(out.total).toBe(2);
    expect(w.finds[0]!.limit).toBe("200");
    expect(w.reads.map((r) => r.url)).toEqual([`${SYSTEM}/lws/r/osm-r-406091`, `${SYSTEM}/lws/r/osm-r-vestland`]);
    expect(out.records.map((k) => k.entityUri)).toEqual([OSLO, VESTLAND]);
  });

  it("keeps a child already in cache even when the reverse page omits it", () => {
    const qc = new QueryClient();
    qc.setQueryData(["base", "record", "nordre-follo", "https://geo.example.test"], {
      id: "nordre-follo",
      entityUri: `${SYSTEM}/base/e/nordre-follo`,
      typeUri: "t:Municipality",
      facts: { title: "Nordre Follo", memberOf: NORWAY },
      etag: null,
    });
    expect(cachedRecordsPointingAt(qc, NORWAY).map((r) => r.id)).toEqual(["nordre-follo"]);
  });
});

describe("findAllMemberOfIds: paging the reverse index (source c150qa E12)", () => {
  it("pages until the authorized count is reached, advancing offset each time", async () => {
    const w = fakePlatform({ stores: { [SYSTEM]: { [NORWAY]: kids(SYSTEM, 0, 450) } } });
    const found = await findAllMemberOfIds(NORWAY);
    expect(found.count).toBe(450);
    expect(found.ids).toHaveLength(450);
    expect(w.finds.map((f) => f.offset)).toEqual([null, "200", "400"]);
  });

  it("stops at the 600-id cap but still reports the true authorized total", async () => {
    fakePlatform({ stores: { [SYSTEM]: { [NORWAY]: kids(SYSTEM, 0, 2000) } }, counts: { [NORWAY]: 5000 } });
    const found = await findAllMemberOfIds(NORWAY);
    expect(found.ids).toHaveLength(600);
    expect(found.count).toBe(5000);
  });

  it("stops on a short page without asking again", async () => {
    const w = fakePlatform({ stores: { [SYSTEM]: { [NORWAY]: kids(SYSTEM, 0, 12) } }, counts: { [NORWAY]: 999 } });
    const found = await findAllMemberOfIds(NORWAY);
    expect(found.ids).toHaveLength(12);
    expect(w.finds).toHaveLength(1);
  });

  it("asks find-by-attribute with the write-shaped @id, never the search route", async () => {
    const w = fakePlatform({ stores: { [SYSTEM]: { [NORWAY]: kids(SYSTEM, 0, 1) } } });
    await findAllMemberOfIds(NORWAY);
    const url = w.all()[0]!;
    expect(url).toContain("/base/find-by-attribute?");
    expect(url).not.toContain("/base/search");
    expect(w.finds[0]).toMatchObject({ attr: MEMBER_OF_ATTR, value: { "@id": NORWAY }, limit: String(MEMBER_OF_FIND_PAGE) });
  });
});

describe("loadMemberOfChildren: the honest N of M (source c150qa E13, E14)", () => {
  it("hydrates at most the cap and keeps total at the reverse-index count", async () => {
    const w = fakePlatform({ stores: { [SYSTEM]: { [NORWAY]: kids(SYSTEM, 0, 300) } } });
    const out = await loadMemberOfChildren(NORWAY);
    expect(out.records).toHaveLength(MEMBER_OF_HYDRATE_CAP);
    expect(out.total).toBe(300);
    expect(w.reads).toHaveLength(MEMBER_OF_HYDRATE_CAP);
  });

  it("reports total === hydrated when nothing is withheld", async () => {
    fakePlatform({ stores: { [SYSTEM]: { [NORWAY]: kids(SYSTEM, 0, 3) } } });
    const out = await loadMemberOfChildren(NORWAY);
    expect(out.records).toHaveLength(3);
    expect(out.total).toBe(3);
  });

  it("an unreadable child lowers the hydrated set but never the disclosed total", async () => {
    fakePlatform({ stores: { [SYSTEM]: { [NORWAY]: kids(SYSTEM, 0, 3) } }, unreadable: ["kommune-0"] });
    const out = await loadMemberOfChildren(NORWAY);
    expect(out.records.map((r) => r.id)).toEqual(["kommune-1", "kommune-2"]);
    expect(out.total).toBe(3);
  });
});

// Source twoHost.d9: a parent kept in a vault on a second store showed NO children, with no error, because the find went to the apex.
describe("a parent's children are found at the parent's own host (source twoHost.d9)", () => {
  const stores = (origin: string, parent: string, n: number, seg: string) => ({ [origin]: { [parent]: kids(origin, 0, n, seg) } });

  it("control: the fake discriminates, the apex does not see a vault-B child", async () => {
    const parent = `${VAULT_B}/vault/e/parent`;
    fakePlatform({ stores: stores(VAULT_B, parent, 1, "vault") });
    const { findByAttribute } = await import("@kaigilb/gilbplatformcode-lws-vault-sets");
    expect((await findByAttribute(MEMBER_OF_ATTR, { "@id": parent }, { limit: 200 })).count).toBe(0);
    expect((await findByAttribute(MEMBER_OF_ATTR, { "@id": parent }, { limit: 200 }, VAULT_B)).count).toBe(1);
  });

  it("a parent in a vault on the second store: all 3 children found; every find at B, none at the apex", async () => {
    const parent = `${VAULT_B}/vault/e/parent`;
    const w = fakePlatform({ stores: stores(VAULT_B, parent, 3, "vault") });
    const got = await findAllMemberOfIds(parent);
    expect(got.count).toBe(3);
    expect([...got.ids].sort()).toEqual(kids(VAULT_B, 0, 3, "vault").sort());
    expect(w.finds.map((f) => f.origin)).toEqual([VAULT_B]);
  });

  it("the record view's loader shows them, hydrated at their own door, with no find at the apex", async () => {
    const parent = `${VAULT_B}/vault/e/parent`;
    const w = fakePlatform({ stores: stores(VAULT_B, parent, 2, "vault") });
    const out = await loadMemberOfChildren(parent);
    expect(out.records.map((r) => r.id).sort()).toEqual(["kommune-0", "kommune-1"]);
    expect(out.total).toBe(2);
    expect(w.finds.filter((f) => f.origin === APEX)).toHaveLength(0);
    expect(w.reads.every((r) => r.origin === VAULT_B)).toBe(true);
  });

  it("a system-vault parent is asked at its own host, and its children are found", async () => {
    const w = fakePlatform({ stores: stores(SYSTEM, NORWAY, 2, "base") });
    expect((await findAllMemberOfIds(NORWAY)).count).toBe(2);
    expect(w.finds.map((f) => f.origin)).toEqual([SYSTEM]);
  });

  it("a parent in a first-store vault is asked at its own host", async () => {
    const parent = `${VAULT_A}/vault/e/parent`;
    const w = fakePlatform({ stores: stores(VAULT_A, parent, 1, "vault") });
    expect((await findAllMemberOfIds(parent)).count).toBe(1);
    expect(w.finds.map((f) => f.origin)).toEqual([VAULT_A]);
  });

  it("a parent named by a bare id (no host to route by) is still asked at the base address", async () => {
    const w = fakePlatform();
    await findAllMemberOfIds("osm-r-2978650");
    expect(w.finds.map((f) => f.origin)).toEqual([APEX]);
  });

  it("an older platform that refuses paging (400): the retry stays on the parent's host", async () => {
    const parent = `${VAULT_B}/vault/e/parent`;
    const w = fakePlatform({ stores: stores(VAULT_B, parent, 2, "vault"), refusePaging: true });
    expect((await findAllMemberOfIds(parent)).count).toBe(2);
    expect(w.finds.map((f) => [f.origin, f.limit])).toEqual([[VAULT_B, "200"], [VAULT_B, null]]);
  });
});
