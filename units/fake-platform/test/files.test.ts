import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { body, idOf, recUrl, vaultUrl, world, type Who, type World } from "./support";

const bytes = (n: number, seed = 1): Uint8Array<ArrayBuffer> => {
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = (i * 7 + seed) % 251;
  return u;
};
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const up = (w: World, a: Who, name: string, data: Uint8Array<ArrayBuffer>, q = "", init: RequestInit = {}) =>
  a.fetch(vaultUrl(w.annV, `/files?name=${encodeURIComponent(name)}${q}`), { method: "PUT", headers: { "content-type": "image/jpeg" }, body: data, ...init });
const list = (w: World, a: Who, q = "") => a.fetch(vaultUrl(w.annV, `/files${q}`));
const fileUrl = (w: World, id: string): string => `https://ann.fake.test/files/${id}`;

describe("upload: PUT and POST /lws/vault/:vault/files (row 13)", () => {
  it("201 { entity, contentHash, byteSize, created:true } with Location /files/<id>; contentHash is the bare SHA-256 hex of the bytes", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const data = bytes(1000);
    const res = await up(w, a, "boat.jpg", data, "&folder=pictures");
    expect(res.status).toBe(201);
    const d = await body(res);
    expect(Object.keys(d).sort()).toEqual(["byteSize", "contentHash", "created", "entity"]);
    expect(d).toMatchObject({ byteSize: 1000, created: true, contentHash: sha(data) });
    expect(d.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.headers.get("location")).toBe(`/files/${idOf(d.entity)}`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(d.entity).toBe(`https://ann.fake.test/vault/e/${idOf(d.entity)}`);
    const f = w.fake.state.files.get(idOf(d.entity))!;
    expect(f.facts).toMatchObject({ fileName: "boat.jpg", fileMediaType: "image/jpeg", fileByteSize: 1000, fileFolderPath: ["pictures"], fileStoredBy: { "@id": w.ann.principal } });
    expect(w.fake.state.records.size).toBe(0);
  });
  it("POST is the same door", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const res = await up(w, a, "x.jpg", bytes(5), "", { method: "POST" });
    expect(res.status).toBe(201);
  });
  it("identical bytes, name and metadata by the same person again: 200 created:false, the same entity, no Location, nothing new stored", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const first = await body(await up(w, a, "boat.jpg", bytes(50), "&folder=p&tag=t"));
    const again = await up(w, a, "boat.jpg", bytes(50), "&folder=p&tag=t");
    expect(again.status).toBe(200);
    expect(again.headers.get("location")).toBeNull();
    expect(await body(again)).toEqual({ ...first, created: false });
    expect(w.fake.state.files.size).toBe(1);
  });
  it("the same bytes under another name, folder, tag, or by another person are a new file (201)", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "write");
    const a = await w.as(w.ann);
    const b = await w.as(w.ben);
    expect((await up(w, a, "a.jpg", bytes(9))).status).toBe(201);
    expect((await up(w, a, "b.jpg", bytes(9))).status).toBe(201);
    expect((await up(w, a, "a.jpg", bytes(9), "&folder=f")).status).toBe(201);
    expect((await up(w, a, "a.jpg", bytes(9), "&tag=t")).status).toBe(201);
    expect((await up(w, b, "a.jpg", bytes(9))).status).toBe(201);
    expect((await up(w, a, "a.jpg", bytes(9))).status).toBe(200);
    expect(w.fake.state.files.size).toBe(5);
  });
  it("a file that was ended is not the same file: the identical upload is 201 again", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const d = await body(await up(w, a, "a.jpg", bytes(9)));
    await a.fetch(fileUrl(w, idOf(d.entity)), { method: "DELETE" });
    expect((await up(w, a, "a.jpg", bytes(9))).status).toBe(201);
  });
  it("the Content-Type is kept bare and lower case; an absent one is application/octet-stream", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const d1 = await body(await up(w, a, "a.bin", bytes(3), "", { headers: { "content-type": "Image/JPEG; charset=x" } }));
    expect(w.fake.state.files.get(idOf(d1.entity))!.facts.fileMediaType).toBe("image/jpeg");
    const d2 = await body(await up(w, a, "b.bin", bytes(3), "", { headers: {} }));
    expect(w.fake.state.files.get(idOf(d2.entity))!.facts.fileMediaType).toBe("application/octet-stream");
  });
  it("400 for no name, two names, a blank name, a folder that is empty or breaks the grammar, a malformed Content-Type, no body", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const bad = async (res: Response, re: RegExp) => {
      expect(res.status).toBe(400);
      expect((await body(res)).message).toMatch(re);
    };
    await bad(await a.fetch(vaultUrl(w.annV, "/files"), { method: "PUT", body: bytes(2) }), /Exactly one non-empty \?name=/);
    await bad(await a.fetch(vaultUrl(w.annV, "/files?name=a&name=b"), { method: "PUT", body: bytes(2) }), /Exactly one non-empty \?name=/);
    await bad(await a.fetch(vaultUrl(w.annV, "/files?name=%20"), { method: "PUT", body: bytes(2) }), /Exactly one non-empty \?name=/);
    await bad(await up(w, a, "a", bytes(2), "&folder="), /empty path/);
    await bad(await up(w, a, "a", bytes(2), "&folder=a//b"), /path grammar/);
    await bad(await up(w, a, "a", bytes(2), "&folder=a/../b"), /'\.'\/'\.\.' segment/);
    await bad(await up(w, a, "a", bytes(2), "", { headers: { "content-type": "not a type" } }), /Malformed Content-Type/);
    await bad(await a.fetch(vaultUrl(w.annV, "/files?name=a"), { method: "PUT" }), /requires a request body/);
    expect(w.fake.state.files.size).toBe(0);
  });
  it("415 for a multipart body; 400 fake_platform_not_faked for ?thumbnail=, ?face=, ?fileType=", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    expect((await up(w, a, "a", bytes(2), "", { headers: { "content-type": "multipart/form-data; boundary=x" } })).status).toBe(415);
    for (const k of ["thumbnail=whole", "face=whole", "fileType=ImageFile"]) {
      const res = await up(w, a, "a", bytes(2), `&${k}`);
      expect(res.status, k).toBe(400);
      expect((await body(res)).error).toBe("fake_platform_not_faked");
    }
  });
  it("403 for a reader and a stranger before any byte is stored; 400 for a vault id that is not https", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "read");
    for (const who of [w.ben, w.cat]) {
      const x = await w.as(who);
      const res = await up(w, x, "a.jpg", bytes(4));
      expect(res.status).toBe(403);
      expect((await body(res)).message).toBe(`vault target denied: the principal holds no write reach on vault ${w.annV.id}`);
    }
    const a = await w.as(w.ann);
    const h = await a.fetch(`https://ann.fake.test/lws/vault/${encodeURIComponent("http://ann.fake.test/vault")}/files?name=a`, { method: "PUT", body: bytes(1) });
    expect(h.status).toBe(400);
    expect(w.fake.state.files.size).toBe(0);
  });
  it("a write grant lets another person upload", async () => {
    const w = await world();
    w.fake.grant(w.annV, w.ben, "write");
    expect((await up(w, await w.as(w.ben), "a.jpg", bytes(4))).status).toBe(201);
  });
});

describe("upload body forms", () => {
  it("a Blob without arrayBuffer() (jsdom's) is read through FileReader, byte for byte; a File, a typed array and an ArrayBuffer are read as they are", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const data = bytes(40, 5);
    const weak = new Blob([data], { type: "image/jpeg" });
    Object.defineProperty(weak, "arrayBuffer", { value: undefined });
    const real = Blob.prototype.arrayBuffer;
    const NativeResponse = Response;
    // jsdom's Blob is foreign to node's Response, which then reads it as the text "[object Blob]": say so here
    vi.stubGlobal("Response", class extends NativeResponse {
      constructor(b?: BodyInit | null, init?: ResponseInit) {
        super(b instanceof Blob ? String(b) : b, init);
      }
    });
    vi.stubGlobal("FileReader", class {
      result: ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      error = null;
      readAsArrayBuffer(b: Blob): void {
        void real.call(b).then((r) => {
          this.result = r;
          this.onload?.();
        });
      }
    });
    try {
      const d = await body(await up(w, a, "w.jpg", weak as never));
      expect(d.byteSize).toBe(40);
      expect(d.contentHash).toBe(sha(data));
    } finally {
      vi.unstubAllGlobals();
    }
    const viaFile = await body(await up(w, a, "f.jpg", new File([data], "f.jpg") as never));
    expect(viaFile.contentHash).toBe(sha(data));
    const viaBuffer = await body(await up(w, a, "b.jpg", data.buffer.slice(0) as never));
    expect(viaBuffer.contentHash).toBe(sha(data));
  });
});

describe("GET /files/:id (row 15)", () => {
  it("200 with the bytes, the media type, a sha256 ETag, Accept-Ranges, Content-Length and nosniff", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const data = bytes(300, 9);
    const d = await body(await up(w, a, "a.jpg", data));
    const res = await a.fetch(fileUrl(w, idOf(d.entity)));
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(data);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("etag")).toBe(`"sha256:${sha(data)}"`);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("300");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("a reader reads; a stranger, a missing id and the wrong host are one 404", async () => {
    const w = await world();
    const f = w.fake.seedFile(w.annV, { name: "a.jpg", bytes: bytes(4), mediaType: "image/jpeg" });
    w.fake.grant(w.annV, w.ben, "read");
    expect((await (await w.as(w.ben)).fetch(fileUrl(w, f.id))).status).toBe(200);
    const bodies = [];
    for (const res of [await (await w.as(w.cat)).fetch(fileUrl(w, f.id)), await (await w.as(w.ann)).fetch(fileUrl(w, "nope")), await (await w.as(w.ann)).fetch(`https://fake.test/files/${f.id}`)]) {
      expect(res.status).toBe(404);
      bodies.push((await body(res)).error);
    }
    expect(new Set(bodies)).toEqual(new Set(["NotFound"]));
  });
  it("an ended file still serves its bytes", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const data = bytes(8);
    const f = w.fake.seedFile(w.annV, { name: "a.jpg", bytes: data, mediaType: "image/jpeg" });
    expect((await a.fetch(fileUrl(w, f.id), { method: "DELETE" })).status).toBe(204);
    const res = await a.fetch(fileUrl(w, f.id));
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(data);
  });
  it("Range is not faked (400 fake_platform_not_faked), never ignored", async () => {
    const w = await world();
    const f = w.fake.seedFile(w.annV, { name: "a", bytes: bytes(8) });
    const res = await (await w.as(w.ann)).fetch(fileUrl(w, f.id), { headers: { range: "bytes=0-1" } });
    expect((await body(res)).error).toBe("fake_platform_not_faked");
  });
});

describe("GET /lws/vault/:vault/files (row 14)", () => {
  it("answers { vault, scannedVaults, count, files } and each file has the twelve fields", async () => {
    const w = await world();
    const f = w.fake.seedFile(w.annV, { name: "a.jpg", bytes: bytes(10), mediaType: "image/jpeg", type: "ImageFile", folders: ["z", "a"], tags: ["t"], storedWith: "https://ann.fake.test/vault/e/rec" });
    const a = await w.as(w.ann);
    const res = await list(w, a);
    expect(res.status).toBe(200);
    const d = await body(res);
    expect(Object.keys(d).sort()).toEqual(["count", "files", "scannedVaults", "vault"]);
    expect(d).toMatchObject({ vault: w.annV.id, scannedVaults: [w.annV.id], count: 1 });
    expect(d.files[0]).toEqual({
      entity: `https://ann.fake.test/vault/e/${f.id}`,
      fileName: "a.jpg",
      mediaType: "image/jpeg",
      typeUri: "https://veda.gilb.com/base/t/ImageFile",
      contentHash: sha(bytes(10)),
      byteSize: 10,
      folderPaths: ["a", "z"],
      tags: ["t"],
      storedWith: "https://ann.fake.test/vault/e/rec",
      updatedAt: f.updatedAt,
      ended: false,
      transcodedFrom: null,
    });
  });
  it("without listingCarriesTranscodedFrom the key is not there at all", async () => {
    const w = await world({ listingCarriesTranscodedFrom: false });
    w.fake.seedFile(w.annV, { name: "a", bytes: bytes(1) });
    const d = await body(await list(w, await w.as(w.ann)));
    expect("transcodedFrom" in d.files[0]).toBe(false);
  });
  it("a file with no metadata shows [] folders, [] tags, storedWith null", async () => {
    const w = await world();
    w.fake.seedFile(w.annV, { name: "a", bytes: bytes(1) });
    const f = (await body(await list(w, await w.as(w.ann)))).files[0];
    expect(f).toMatchObject({ folderPaths: [], tags: [], storedWith: null, mediaType: "application/octet-stream", typeUri: "https://veda.gilb.com/base/t/File" });
  });
  it("ordered by fileName then entity; count is the total, not the page", async () => {
    const w = await world();
    ["b", "a", "c", "a"].forEach((n, i) => w.fake.seedFile(w.annV, { name: n, bytes: bytes(2, i + 1), mediaType: "x/y" }));
    const d = await body(await list(w, await w.as(w.ann), "?limit=3"));
    expect(d.files.map((f: { fileName: string }) => f.fileName)).toEqual(["a", "a", "b"]);
    expect(d.count).toBe(4);
    const [x, y] = d.files;
    expect(x.entity < y.entity).toBe(true);
  });
  it("50 a page by default and 200 at most; limit and offset page it; count stays the total; offset past the end is an empty page", async () => {
    const w = await world();
    for (let i = 0; i < 250; i++) w.fake.seedFile(w.annV, { name: `f${String(i).padStart(3, "0")}`, bytes: bytes(1, i) });
    const a = await w.as(w.ann);
    const page = async (q: string) => body(await list(w, a, q));
    const d0 = await page("");
    expect(d0.files).toHaveLength(50);
    expect(d0.count).toBe(250);
    expect(d0.files[0].fileName).toBe("f000");
    expect((await page("?limit=999")).files).toHaveLength(200);
    expect((await page("?limit=200")).files).toHaveLength(200);
    expect((await page("?limit=0")).files).toHaveLength(1);
    const p2 = await page("?limit=100&offset=200");
    expect(p2.files.map((f: { fileName: string }) => f.fileName)[0]).toBe("f200");
    expect(p2.files).toHaveLength(50);
    expect(p2.count).toBe(250);
    expect((await page("?offset=999")).files).toEqual([]);
    expect((await page("?offset=999")).count).toBe(250);
  });
  it("NO cursor of any kind on any page of a full walk: the keys are always exactly vault, scannedVaults, count, files", async () => {
    const w = await world();
    for (let i = 0; i < 120; i++) w.fake.seedFile(w.annV, { name: `f${i}`, bytes: bytes(1, i) });
    const a = await w.as(w.ann);
    let seen = 0;
    for (let offset = 0; offset < 130; offset += 50) {
      const d = await body(await list(w, a, `?limit=50&offset=${offset}`));
      expect(Object.keys(d).sort()).toEqual(["count", "files", "scannedVaults", "vault"]);
      expect(JSON.stringify(d)).not.toMatch(/nextCursor|nextOffset|next|cursor|complete/i);
      seen += d.files.length;
    }
    expect(seen).toBe(120);
  });
  it("filters: folder, unfiled, tag, storedWith, unattached", async () => {
    const w = await world();
    w.fake.seedFile(w.annV, { name: "a", bytes: bytes(1, 1), folders: ["x"], tags: ["t1"], storedWith: "R1" });
    w.fake.seedFile(w.annV, { name: "b", bytes: bytes(1, 2), folders: ["x", "y"] });
    w.fake.seedFile(w.annV, { name: "c", bytes: bytes(1, 3), tags: ["t1", "t2"] });
    const a = await w.as(w.ann);
    const names = async (q: string) => (await body(await list(w, a, q))).files.map((f: { fileName: string }) => f.fileName);
    expect(await names("?folder=x")).toEqual(["a", "b"]);
    expect(await names("?folder=y")).toEqual(["b"]);
    expect(await names("?unfiled=true")).toEqual(["c"]);
    expect(await names("?unfiled=1")).toEqual(["c"]);
    expect(await names("?tag=t1")).toEqual(["a", "c"]);
    expect(await names("?storedWith=R1")).toEqual(["a"]);
    expect(await names("?unattached=true")).toEqual(["b", "c"]);
  });
  it("lifecycle: live by default, ended, all; each file says ended", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const f1 = w.fake.seedFile(w.annV, { name: "a", bytes: bytes(1, 1) });
    w.fake.seedFile(w.annV, { name: "b", bytes: bytes(1, 2) });
    await a.fetch(fileUrl(w, f1.id), { method: "DELETE" });
    const get = async (q: string) => (await body(await list(w, a, q))).files.map((f: { fileName: string; ended: boolean }) => `${f.fileName}:${f.ended}`);
    expect(await get("")).toEqual(["b:false"]);
    expect(await get("?lifecycle=live")).toEqual(["b:false"]);
    expect(await get("?lifecycle=ended")).toEqual(["a:true"]);
    expect(await get("?lifecycle=all")).toEqual(["a:true", "b:false"]);
  });
  it("transcodedFrom=<master> lists only the copies of that master; each copy carries the link", async () => {
    const w = await world();
    const { master, thumb } = w.fake.seedPicture(w.annV, { name: "boat", master: bytes(40, 1), thumb: bytes(10, 2) });
    w.fake.seedPicture(w.annV, { name: "other", master: bytes(40, 3), thumb: bytes(10, 4) });
    const a = await w.as(w.ann);
    const d = await body(await list(w, a, `?transcodedFrom=${encodeURIComponent(`https://ann.fake.test/vault/e/${master.id}`)}`));
    expect(d.count).toBe(1);
    expect(d.files[0]).toMatchObject({ fileName: "boat-320.jpg", entity: `https://ann.fake.test/vault/e/${thumb.id}`, transcodedFrom: `https://ann.fake.test/vault/e/${master.id}` });
  });
  it("400 for a query key the platform's schema does not have, a non-digit limit or offset, an empty value, a bad lifecycle; `as` is accepted", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    for (const q of ["?cursor=x", "?next=1", "?limit=abc", "?offset=-1", "?limit=", "?folder=", "?lifecycle=gone"]) {
      const res = await list(w, a, q);
      expect(res.status, q).toBe(400);
    }
    expect((await body(await list(w, a, "?cursor=x"))).message).toMatch(/additional properties/);
    expect((await list(w, a, "?as=x")).status).toBe(200);
  });
  it("403 vault target denied for a stranger and after revokeAccess; a reader lists", async () => {
    const w = await world();
    w.fake.seedFile(w.annV, { name: "a", bytes: bytes(1) });
    w.fake.grant(w.annV, w.ben, "read");
    const b = await w.as(w.ben);
    expect((await list(w, b)).status).toBe(200);
    const denied = await list(w, await w.as(w.cat));
    expect(denied.status).toBe(403);
    expect((await body(denied)).message).toBe(`vault target denied: the principal holds no read reach on vault ${w.annV.id}`);
    w.fake.revokeAccess(w.ben, w.annV);
    expect((await list(w, b)).status).toBe(403);
  });
  it("a file is not a record: the record list never shows it", async () => {
    const w = await world();
    w.fake.seedFile(w.annV, { name: "a", bytes: bytes(1) });
    const a = await w.as(w.ann);
    expect((await body(await a.fetch(vaultUrl(w.annV, "/records")))).records).toEqual([]);
  });
});

describe("DELETE /files/:id (row 16)", () => {
  it("204 empty; the file leaves the live listing, is ended in the ended one, its bytes stay; a second DELETE is 204", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const f = w.fake.seedFile(w.annV, { name: "a", bytes: bytes(4) });
    const del = await a.fetch(fileUrl(w, f.id), { method: "DELETE" });
    expect(del.status).toBe(204);
    expect(await del.text()).toBe("");
    expect((await body(await list(w, a))).files).toEqual([]);
    expect((await body(await list(w, a, "?lifecycle=ended"))).files).toHaveLength(1);
    expect((await a.fetch(fileUrl(w, f.id), { method: "DELETE" })).status).toBe(204);
    expect(w.fake.state.files.get(f.id)!.bytes).toHaveLength(4);
  });
  it("403 for a reader without write (the file stays); 404 for a stranger, an absent id and the wrong host", async () => {
    const w = await world();
    const f = w.fake.seedFile(w.annV, { name: "a", bytes: bytes(4) });
    w.fake.grant(w.annV, w.ben, "read");
    const r = await (await w.as(w.ben)).fetch(fileUrl(w, f.id), { method: "DELETE" });
    expect(r.status).toBe(403);
    expect(w.fake.state.files.get(f.id)!.endedSeq).toBeNull();
    expect((await (await w.as(w.cat)).fetch(fileUrl(w, f.id), { method: "DELETE" })).status).toBe(404);
    const a = await w.as(w.ann);
    expect((await a.fetch(fileUrl(w, "nope"), { method: "DELETE" })).status).toBe(404);
    expect((await a.fetch(`https://fake.test/files/${f.id}`, { method: "DELETE" })).status).toBe(404);
    expect(w.fake.state.files.get(f.id)!.endedSeq).toBeNull();
  });
  it("a writer who is not the owner can end it", async () => {
    const w = await world();
    const f = w.fake.seedFile(w.annV, { name: "a", bytes: bytes(4) });
    w.fake.grant(w.annV, w.ben, "write");
    expect((await (await w.as(w.ben)).fetch(fileUrl(w, f.id), { method: "DELETE" })).status).toBe(204);
  });
});

describe("PATCH /lws/r/<file id> (row 17, row 9's route): the transcodedFrom link", () => {
  it("links a copy to its master the way picture-set sends it; the listing then carries it and the filter finds it", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const master = w.fake.seedFile(w.annV, { name: "m.jpg", bytes: bytes(20, 1), mediaType: "image/jpeg" });
    const thumb = w.fake.seedFile(w.annV, { name: "m-320.jpg", bytes: bytes(5, 2), mediaType: "image/jpeg" });
    const masterEntity = `https://ann.fake.test/vault/e/${master.id}`;
    const p = await a.fetch(recUrl(w.annV, thumb.id), { method: "PATCH", headers: { "content-type": "application/merge-patch+json" }, body: JSON.stringify({ "a:transcodedFrom": { "@id": masterEntity } }) });
    expect(p.status).toBe(200);
    expect(p.headers.get("etag")).toMatch(/^"sha256:/);
    const d = await body(await list(w, a));
    expect(d.files.find((f: { fileName: string }) => f.fileName === "m-320.jpg").transcodedFrom).toBe(masterEntity);
    expect((await body(await list(w, a, `?transcodedFrom=${encodeURIComponent(masterEntity)}`))).count).toBe(1);
    const doc = await body(await a.fetch(recUrl(w.annV, thumb.id)));
    expect(doc).toMatchObject({ "@type": "t:File", transcodedFrom: { "@id": masterEntity }, fileName: "m-320.jpg" });
  });
  it("null removes the link; a reader's patch is 403, a stranger's 404, an ended file's 404", async () => {
    const w = await world();
    const a = await w.as(w.ann);
    const m = w.fake.seedFile(w.annV, { name: "m", bytes: bytes(2, 1) });
    const t = w.fake.seedFile(w.annV, { name: "t", bytes: bytes(2, 2), transcodedFrom: m });
    const patch = (who: Who, b: unknown) => who.fetch(recUrl(w.annV, t.id), { method: "PATCH", body: JSON.stringify(b) });
    w.fake.grant(w.annV, w.ben, "read");
    expect((await patch(await w.as(w.ben), { transcodedFrom: null })).status).toBe(403);
    expect((await patch(await w.as(w.cat), { transcodedFrom: null })).status).toBe(404);
    expect((await patch(a, { transcodedFrom: null })).status).toBe(200);
    expect((await body(await list(w, a))).files.every((f: { transcodedFrom: unknown }) => f.transcodedFrom === null)).toBe(true);
    w.fake.state.files.get(t.id)!.endedSeq = 99;
    expect((await patch(a, { x: 1 })).status).toBe(404);
  });
});

describe("seedFile and seedPicture", () => {
  it("seedPicture makes <name>.jpg and <name>-320.jpg, ImageFile, the copy linked to the master; no request is made", async () => {
    const w = await world();
    const { master, thumb } = w.fake.seedPicture(w.annV, { name: "heron", master: bytes(100, 1), thumb: bytes(10, 2) });
    expect(master.facts).toMatchObject({ fileName: "heron.jpg", fileMediaType: "image/jpeg", fileByteSize: 100 });
    expect(thumb.facts).toMatchObject({ fileName: "heron-320.jpg", fileByteSize: 10, transcodedFrom: { "@id": `https://ann.fake.test/vault/e/${master.id}` } });
    expect(master.typeUri).toBe("https://veda.gilb.com/base/t/ImageFile");
    expect(w.fake.calls.all).toEqual([]);
  });
  it("seedFile takes a master as a file or as its entity URI, and reset empties the files", async () => {
    const w = await world();
    const m = w.fake.seedFile(w.annV, { name: "m", bytes: bytes(2) });
    const t = w.fake.seedFile(w.annV, { name: "t", bytes: bytes(3), transcodedFrom: `https://ann.fake.test/vault/e/${m.id}` });
    expect(t.facts.transcodedFrom).toEqual({ "@id": `https://ann.fake.test/vault/e/${m.id}` });
    w.fake.reset();
    expect(w.fake.state.files.size).toBe(0);
  });
  it("platform mode: anonymous uploads are 403 and anonymous file reads are 404", async () => {
    const w = await world({ dpop: "platform" });
    const f = w.fake.seedFile(w.annV, { name: "a", bytes: bytes(2) });
    expect((await w.fake.fetch(vaultUrl(w.annV, "/files?name=a"), { method: "PUT", body: bytes(2) })).status).toBe(403);
    expect((await w.fake.fetch(fileUrl(w, f.id))).status).toBe(404);
    expect((await w.fake.fetch(vaultUrl(w.annV, "/files"))).status).toBe(403);
  });
});
