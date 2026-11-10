import { describe, expect, it } from "vitest";
import { body, vaultUrl, world, type World } from "./support";

type Who = Awaited<ReturnType<World["as"]>>;
const list = (w: World, a: Who, q: string) => a.fetch(vaultUrl(w.annV, `/records${q}`));

/** n boats named Boat1..Boatn (Boat<n> is the newest). */
function boats(w: World, n: number, type = "Sailboat") {
  return Array.from({ length: n }, (_, i) => w.fake.seedRecord(w.annV, { type, facts: { "a:name": `Boat${i + 1}` } }));
}

describe("GET /lws/vault/:vault/records (row 12): the answer", () => {
  it("200: the document keys, one row shape, newest first", async () => {
    const w = await world();
    const rs = boats(w, 3);
    const a = await w.as(w.ann);
    const res = await list(w, a, "?type=Sailboat");
    expect(res.status).toBe(200);
    const d = await body(res);
    expect(Object.keys(d).sort()).toEqual(["@context", "@id", "complete", "offset", "pageSize", "records", "returnedRecords", "scannedVaults", "total", "totalItemsKind", "types", "vault"]);
    expect(d["@id"]).toBe(`https://fake.test/lws/vault/${encodeURIComponent(w.annV.id)}/records`);
    expect(d).toMatchObject({ total: 3, totalItemsKind: "exact", returnedRecords: 3, complete: true, pageSize: 20, offset: 0, vault: w.annV.id, scannedVaults: [w.annV.id] });
    expect(d.records.map((r: { label: string }) => r.label)).toEqual(["Boat3", "Boat2", "Boat1"]);
    expect(d.records[0]).toEqual({
      entity: `https://ann.fake.test/vault/e/${rs[2]!.id}`,
      typeUri: "https://veda.gilb.com/base/t/Sailboat",
      updatedAt: rs[2]!.updatedAt,
      label: "Boat3",
      vault: w.annV.id,
      vaultAmbiguous: false,
    });
    expect(d.types).toEqual([{ typeUri: "https://veda.gilb.com/base/t/Sailboat", count: 3 }]);
  });
  it("no type= lists every record; type= narrows; two types union; an unknown bare type is 200 with no records", async () => {
    const w = await world();
    boats(w, 2);
    boats(w, 1, "Note");
    const a = await w.as(w.ann);
    expect((await body(await list(w, a, ""))).records).toHaveLength(3);
    expect((await body(await list(w, a, "?type=Note"))).records).toHaveLength(1);
    expect((await body(await list(w, a, "?type=Note&type=Sailboat"))).records).toHaveLength(3);
    const none = await list(w, a, "?type=Ghost");
    expect(none.status).toBe(200);
    expect(await body(none)).toMatchObject({ records: [], total: 0, complete: true, totalItemsKind: "exact" });
  });
  it("label is a:label, then a:title, then a:name; null when none", async () => {
    const w = await world();
    w.fake.seedRecord(w.annV, { type: "N", facts: { name: "n", title: "t" } });
    w.fake.seedRecord(w.annV, { type: "N", facts: { name: "n", title: "t", label: "l" } });
    w.fake.seedRecord(w.annV, { type: "N", facts: { x: 1 } });
    const a = await w.as(w.ann);
    expect((await body(await list(w, a, "?type=N"))).records.map((r: { label: string | null }) => r.label)).toEqual([null, "l", "t"]);
  });
  it("t:Sailboat (prefix) or a type URI is 400 type_token_unresolved with accepted and rejected", async () => {
    const w = await world();
    boats(w, 1);
    const a = await w.as(w.ann);
    for (const t of ["t:Sailboat", "https://veda.gilb.com/base/t/Sailboat", "Sail boat", ""]) {
      const res = await list(w, a, `?type=${encodeURIComponent(t)}`);
      expect(res.status, t).toBe(400);
      const d = await body(res);
      expect(d.error).toBe("type_token_unresolved");
      expect(d.rejected).toEqual([t]);
      expect(d.accepted).toMatch(/bare local name/);
    }
    expect((await body(await list(w, a, "?type=Sailboat&type=t:X"))).error).toBe("type_token_unresolved");
  });
  it("more than 100 distinct types is 400 type_filter_too_large", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const q = Array.from({ length: 101 }, (_, i) => `type=T${i}`).join("&");
    expect((await body(await list(w, a, `?${q}`))).error).toBe("type_filter_too_large");
  });
  it("lifecycle: an unknown value is 400; include other than body is 400; filter= is not faked (400 fake_platform_not_faked)", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    expect(await body(await list(w, a, "?lifecycle=all"))).toEqual({ error: "lifecycle must be live (default) or ended", accepted: ["live", "ended"] });
    expect(await body(await list(w, a, "?include=full"))).toEqual({ error: "include must be body, or be left out", accepted: ["body"] });
    const f = await list(w, a, "?type=Sailboat&include=body&filter=a:name=x");
    expect(f.status).toBe(400);
    expect((await body(f)).error).toBe("fake_platform_not_faked");
  });
});

describe("access", () => {
  it("403 vault target denied (with the read-reach sentence) for a stranger, a person whose access was revoked, and an unknown vault", async () => {
    const w = await world();
    boats(w, 1);
    w.fake.grant(w.annV, w.ben, "read");
    const c = await w.as(w.cat);
    const denied = await list(w, c, "?type=Sailboat");
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({ error: "Forbidden", message: `vault target denied: the principal holds no read reach on vault ${w.annV.id}` });
    const b = await w.as(w.ben);
    expect((await list(w, b, "?type=Sailboat")).status).toBe(200);
    w.fake.revokeAccess(w.ben, w.annV);
    expect((await list(w, b, "?type=Sailboat")).status).toBe(403);
    const ghost = await b.fetch(`https://ann.fake.test/lws/vault/${encodeURIComponent("https://ghost.fake.test/vault")}/records`);
    expect(ghost.status).toBe(403);
  });
  it("the list of one vault never shows another vault's records", async () => {
    const w = await world();
    boats(w, 2);
    w.fake.seedRecord(w.fake.state.vaults.get(w.ben.landingVaultId!)!, { type: "Sailboat", facts: { name: "Benboat" } });
    const a = await w.as(w.ann);
    expect((await body(await list(w, a, "?type=Sailboat"))).records).toHaveLength(2);
  });
});

describe("paging rules: nextOffset and nextCursor presence, both ways", () => {
  it("without include=body the page is 20 and limit is ignored; no nextOffset; nextCursor on an incomplete one-type page", async () => {
    const w = await world();
    boats(w, 25);
    const a = await w.as(w.ann);
    const d = await body(await list(w, a, "?type=Sailboat&limit=3"));
    expect(d.records).toHaveLength(20);
    expect(d).toMatchObject({ complete: false, pageSize: 20, totalItemsKind: "atLeast", total: 20 });
    expect("nextOffset" in d).toBe(false);
    expect(typeof d.nextCursor).toBe("string");
  });
  it("include=body: limit applies (clamped to 200), rows carry body and etag, nextOffset is offset + rows, even on the last page", async () => {
    const w = await world();
    boats(w, 5);
    const a = await w.as(w.ann);
    const first = await body(await list(w, a, "?type=Sailboat&include=body&limit=2"));
    expect(first).toMatchObject({ complete: false, pageSize: 2, nextOffset: 2, returnedRecords: 2 });
    expect(first.records[0].body).toMatchObject({ "@type": "t:Sailboat", name: "Boat5" });
    expect(first.records[0].etag).toMatch(/^"sha256:[0-9a-f]{64}"$/);
    const last = await body(await list(w, a, "?type=Sailboat&include=body&limit=2&offset=4"));
    expect(last).toMatchObject({ complete: true, nextOffset: 5, offset: 4, total: 5, totalItemsKind: "exact" });
    expect((await body(await list(w, a, "?type=Sailboat&include=body&limit=9999"))).pageSize).toBe(200);
    expect((await body(await list(w, a, "?type=Sailboat&include=body&limit=abc"))).pageSize).toBe(200);
  });
  it("without include=body a row has no body and no etag", async () => {
    const w = await world();
    boats(w, 1);
    const a = await w.as(w.ann);
    const r = (await body(await list(w, a, "?type=Sailboat"))).records[0];
    expect("body" in r).toBe(false);
    expect("etag" in r).toBe(false);
  });
  it("nextCursor is absent on a complete page, with no type, and with two types; present only for one type", async () => {
    const w = await world();
    boats(w, 3);
    boats(w, 30, "Note");
    const a = await w.as(w.ann);
    expect("nextCursor" in (await body(await list(w, a, "?type=Sailboat")))).toBe(false); // complete
    expect("nextCursor" in (await body(await list(w, a, "?type=Note")))).toBe(true); // incomplete, one type
    expect("nextCursor" in (await body(await list(w, a, "")))).toBe(false); // no type: no bookmark
    expect("nextCursor" in (await body(await list(w, a, "?type=Note&type=Sailboat")))).toBe(false); // two types
    expect("nextCursor" in (await body(await list(w, a, "?type=Note&lifecycle=ended")))).toBe(false); // ended list
  });
  it("walking by after= visits every record once, newest first, and the walk ends complete; the after page has no nextOffset", async () => {
    const w = await world();
    boats(w, 45);
    const a = await w.as(w.ann);
    const seen: string[] = [];
    let q = "?type=Sailboat&include=body&limit=20";
    for (let i = 0; i < 10; i++) {
      const d = await body(await list(w, a, q));
      seen.push(...d.records.map((r: { label: string }) => r.label));
      if (i > 0) expect("nextOffset" in d).toBe(false);
      if (i > 0) expect(d.totalItemsKind).toBe("atLeast");
      if (d.complete) {
        expect("nextCursor" in d).toBe(false);
        break;
      }
      q = `?type=Sailboat&include=body&limit=20&after=${encodeURIComponent(d.nextCursor)}`;
    }
    expect(seen).toHaveLength(45);
    expect(new Set(seen).size).toBe(45);
    expect(seen[0]).toBe("Boat45");
    expect(seen[44]).toBe("Boat1");
  });
  it("a row written during an after= walk is not repeated (it lands above the bookmark)", async () => {
    const w = await world();
    boats(w, 30);
    const a = await w.as(w.ann);
    const p1 = await body(await list(w, a, "?type=Sailboat"));
    w.fake.seedRecord(w.annV, { type: "Sailboat", facts: { name: "Late" } });
    const p2 = await body(await list(w, a, `?type=Sailboat&after=${encodeURIComponent(p1.nextCursor)}`));
    expect(p2.records.map((r: { label: string }) => r.label)).not.toContain("Late");
    expect(p2.records).toHaveLength(10);
  });
  it("the after rules: offset, since, ended, no type, two types, a cursor from another vault, a made-up cursor: each 400 with its name", async () => {
    const w = await world();
    boats(w, 30);
    const a = await w.as(w.ann);
    const cur = encodeURIComponent((await body(await list(w, a, "?type=Sailboat"))).nextCursor);
    const err = async (q: string) => (await body(await list(w, a, q))).error;
    expect(await err(`?type=Sailboat&after=${cur}&offset=1`)).toBe("after_with_offset");
    expect(await err(`?type=Sailboat&after=${cur}&since=start`)).toBe("after_with_since");
    expect(await err(`?type=Sailboat&after=${cur}&lifecycle=ended`)).toBe("after_with_lifecycle");
    expect(await err(`?after=${cur}`)).toBe("after_requires_one_type");
    expect(await err(`?type=Sailboat&type=Note&after=${cur}`)).toBe("after_requires_one_type");
    expect(await err(`?type=Note&after=${cur}`)).toBe("after_cursor_invalid");
    expect(await err(`?type=Sailboat&after=made-up`)).toBe("after_cursor_invalid");
    // another caller's cursor
    const b = await w.as(w.ben);
    w.fake.grant(w.annV, w.ben, "read");
    expect((await body(await list(w, b, `?type=Sailboat&after=${cur}`))).error).toBe("after_cursor_invalid");
  });
  it("offset paging: skips, a bad offset is 0, an offset past the end gives an empty page with the real total", async () => {
    const w = await world();
    boats(w, 5);
    const a = await w.as(w.ann);
    expect((await body(await list(w, a, "?type=Sailboat&offset=3"))).records.map((r: { label: string }) => r.label)).toEqual(["Boat2", "Boat1"]);
    expect((await body(await list(w, a, "?type=Sailboat&offset=-4"))).offset).toBe(0);
    expect(await body(await list(w, a, "?type=Sailboat&offset=99"))).toMatchObject({ records: [], total: 5, complete: true });
  });
});

describe("since (the change feed)", () => {
  it("since=head: no rows, complete, a nextCursor naming now; nextOffset absent even with include=body", async () => {
    const w = await world();
    boats(w, 3);
    const a = await w.as(w.ann);
    const d = await body(await list(w, a, "?type=Sailboat&since=head&include=body"));
    expect(d).toMatchObject({ records: [], complete: true, total: 0 });
    expect(typeof d.nextCursor).toBe("string");
    expect("nextOffset" in d).toBe(false);
  });
  it("since=start returns every live row oldest first and always names a nextCursor, complete or not", async () => {
    const w = await world();
    boats(w, 3);
    const a = await w.as(w.ann);
    const d = await body(await list(w, a, "?type=Sailboat&since=start&include=body"));
    expect(d.records.map((r: { label: string }) => r.label)).toEqual(["Boat1", "Boat2", "Boat3"]);
    expect(d.complete).toBe(true);
    expect(typeof d.nextCursor).toBe("string");
  });
  it("head, then a write, then since=<head>: exactly the changed rows; then since=<next> is empty", async () => {
    const w = await world();
    const rs = boats(w, 3);
    const a = await w.as(w.ann);
    const head = (await body(await list(w, a, "?type=Sailboat&since=head"))).nextCursor;
    w.fake.edit(rs[0]!.id, { name: "Renamed" });
    const created = w.fake.seedRecord(w.annV, { type: "Sailboat", facts: { name: "New" } });
    const d = await body(await list(w, a, `?type=Sailboat&since=${encodeURIComponent(head)}&include=body`));
    expect(d.records.map((r: { label: string }) => r.label)).toEqual(["Renamed", "New"]);
    expect(d.records[1].entity).toBe(`https://ann.fake.test/vault/e/${created.id}`);
    const d2 = await body(await list(w, a, `?type=Sailboat&since=${encodeURIComponent(d.nextCursor)}`));
    expect(d2.records).toEqual([]);
  });
  it("a since page that is not complete carries the cursor of its last row; following it finishes the feed", async () => {
    const w = await world();
    boats(w, 45);
    const a = await w.as(w.ann);
    const got: string[] = [];
    let since = "start";
    for (let i = 0; i < 5; i++) {
      const d = await body(await list(w, a, `?type=Sailboat&since=${encodeURIComponent(since)}`));
      got.push(...d.records.map((r: { label: string }) => r.label));
      since = d.nextCursor;
      if (d.complete) break;
    }
    expect(got).toHaveLength(45);
    expect(got[0]).toBe("Boat1");
  });
  it("an ended record leaves the live feed; the ended feed names it", async () => {
    const w = await world();
    const rs = boats(w, 2);
    const a = await w.as(w.ann);
    const head = (await body(await list(w, a, "?type=Sailboat&since=head&lifecycle=ended"))).nextCursor;
    w.fake.remove(rs[0]!.id);
    const ended = await body(await list(w, a, `?type=Sailboat&lifecycle=ended&since=${encodeURIComponent(head)}`));
    expect(ended.records.map((r: { entity: string }) => r.entity)).toEqual([`https://ann.fake.test/vault/e/${rs[0]!.id}`]);
    expect((await body(await list(w, a, "?type=Sailboat&since=start"))).records).toHaveLength(1);
  });
  it("400s: since with offset, a made-up cursor, a cursor of another vault or lifecycle", async () => {
    const w = await world();
    boats(w, 2);
    const a = await w.as(w.ann);
    expect((await body(await list(w, a, "?type=Sailboat&since=start&offset=1"))).error).toBe("since_with_offset");
    const bad = await list(w, a, "?type=Sailboat&since=nonsense");
    expect(bad.status).toBe(400);
    expect((await body(bad)).error).toBe("since_cursor_invalid");
    const head = encodeURIComponent((await body(await list(w, a, "?type=Sailboat&since=head"))).nextCursor);
    expect((await body(await list(w, a, `?type=Sailboat&lifecycle=ended&since=${head}`))).error).toBe("since_cursor_invalid");
    const benV = w.fake.state.vaults.get(w.ben.landingVaultId!)!;
    w.fake.grant(benV, w.ann, "read");
    expect((await body(await a.fetch(vaultUrl(benV, `/records?type=Sailboat&since=${head}`)))).error).toBe("since_cursor_invalid");
  });
});

describe("lifecycle=ended", () => {
  it("rows are the ended records, newest ended first, with endingActorKind and no label; their body is the type-only document", async () => {
    const w = await world();
    const rs = boats(w, 3);
    const a = await w.as(w.ann);
    w.fake.remove(rs[0]!.id);
    w.fake.remove(rs[2]!.id);
    const d = await body(await list(w, a, "?type=Sailboat&lifecycle=ended&include=body"));
    expect(d.records.map((r: { entity: string }) => r.entity.slice(-26))).toEqual([rs[2]!.id, rs[0]!.id]);
    expect(d.records[0]).toMatchObject({ endingActorKind: "holder", label: null, vaultAmbiguous: false });
    expect(d.records[0].body).toMatchObject({ "a:entityLifecycleState": "ended" });
    expect(d.nextOffset).toBe(2);
  });
});
