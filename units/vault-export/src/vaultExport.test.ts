import { describe, expect, it } from "vitest";
import { differences, exportVault, slug, type ArchiveFile, type ExportDeps } from "./index";

type Pot = { id: string; name: string; cups?: number; picture?: string };
const enc = new TextEncoder();
const dec = new TextDecoder();

/** A fake zip: JSON of the files. It is lossless, so a round trip works; tests break it on purpose. */
const fakeZip = (files: ArchiveFile[]) => enc.encode(JSON.stringify(files.map((f) => ({ n: f.name, b: Array.from(f.bytes) }))));
const fakeUnzip = (z: Uint8Array): ArchiveFile[] => (JSON.parse(dec.decode(z)) as { n: string; b: number[] }[]).map((f) => ({ name: f.n, bytes: Uint8Array.from(f.b) }));

const POTS: Pot[] = [
  { id: "p1", name: "Blue", cups: 4, picture: "u/blue" },
  { id: "p2", name: "Green", cups: 2 },
  { id: "p3", name: "Red", cups: 6, picture: "u/red" },
];
const PICS: Record<string, { bytes: Uint8Array; type: string }> = {
  "u/blue": { bytes: Uint8Array.from([1, 2, 3]), type: "image/jpeg" },
  "u/red": { bytes: Uint8Array.from([9, 9]), type: "image/webp; charset=x" },
};

function deps(over: Partial<ExportDeps<Pot>> = {}): ExportDeps<Pot> {
  return {
    list: async () => ({ records: POTS, complete: true }),
    toJson: (r, file) => ({ "@id": r.id, name: r.name, ...(file ? { associatedMedia: file } : {}) }),
    pictureOf: (r) => r.picture,
    bytes: async (uri) => {
      const p = PICS[uri];
      if (!p) throw new Error("HTTP 404");
      return p;
    },
    zip: fakeZip,
    unzip: fakeUnzip,
    label: (r) => r.name,
    ...over,
  };
}
const FIELDS = [{ key: "name", label: "Name" }, { key: "cups", label: "Cups" }] as const;

describe("exportVault", () => {
  it("packs the records file first, then each picture, and reads the archive back clean", async () => {
    const r = await exportVault(deps());
    expect(r.count).toBe(3);
    expect(r.pictures).toBe(2);
    expect(r.files).toEqual(["records.json", "pictures/p1.jpg", "pictures/p3.webp"]);
    expect(r.differences).toEqual([]);
    const back = fakeUnzip(r.zipBytes);
    expect(back.map((f) => f.name)).toEqual(r.files);
    expect(JSON.parse(dec.decode(back[0]!.bytes))).toEqual([
      { "@id": "p1", name: "Blue", associatedMedia: "pictures/p1.jpg" },
      { "@id": "p2", name: "Green" },
      { "@id": "p3", name: "Red", associatedMedia: "pictures/p3.webp" },
    ]);
    expect(Array.from(back[1]!.bytes)).toEqual([1, 2, 3]);
  });

  it("an empty list is an archive with the records file only", async () => {
    const r = await exportVault(deps({ list: async () => ({ records: [], complete: true }) }));
    expect(r.count).toBe(0);
    expect(r.files).toEqual(["records.json"]);
    expect(r.differences).toEqual([]);
  });

  it("a missing picture is reported, not thrown, and the record is still exported without a file", async () => {
    const r = await exportVault(deps({ pictureOf: (p) => (p.id === "p1" ? "u/gone" : p.picture) }));
    expect(r.differences).toEqual(["Blue: the picture could not be read: HTTP 404, so it is not in the export"]);
    expect(r.pictures).toBe(1);
    expect(r.count).toBe(3);
    const records = JSON.parse(dec.decode(fakeUnzip(r.zipBytes)[0]!.bytes));
    expect(records[0]).toEqual({ "@id": "p1", name: "Blue" });
  });

  it("a picture that reads as 0 bytes is reported as missing", async () => {
    const r = await exportVault(deps({ bytes: async () => ({ bytes: new Uint8Array(0), type: "image/png" }) }));
    expect(r.pictures).toBe(0);
    expect(r.differences).toEqual(["Blue: the picture is empty, so it is not in the export", "Red: the picture is empty, so it is not in the export"]);
  });

  it("an incomplete list is reported first", async () => {
    const r = await exportVault(deps({ list: async () => ({ records: POTS, complete: false }) }));
    expect(r.differences[0]).toBe("The list was incomplete: some records may be missing from the export.");
    expect(r.count).toBe(3);
  });

  it("a difference between what was sent and what reads back is reported", async () => {
    const r = await exportVault(
      deps({
        reread: async (p) => (p.id === "p2" ? { ...p, cups: 3 } : p.id === "p3" ? null : p),
        compare: (sent, now) => differences(sent.name, sent, now, FIELDS),
      }),
    );
    expect(r.differences).toEqual(["Green: Cups was 2, reads back 3", "Red: could not be read back"]);
  });

  it("no differences are looked for when reread or compare is missing", async () => {
    expect((await exportVault(deps({ reread: async () => null }))).differences).toEqual([]);
    expect((await exportVault(deps({ compare: () => ["x"] }))).differences).toEqual([]);
  });

  it("a reread that throws counts as could-not-be-read-back", async () => {
    const r = await exportVault(deps({ reread: async () => { throw new Error("offline"); }, compare: (s, n) => differences(s.name, s, n, FIELDS) }));
    expect(r.differences).toEqual(["Blue: could not be read back", "Green: could not be read back", "Red: could not be read back"]);
  });

  it("an archive that reads back with a file missing, short, or not at all is reported", async () => {
    const dropLast = await exportVault(deps({ unzip: (z) => fakeUnzip(z).slice(0, -1) }));
    expect(dropLast.differences).toEqual(["The archive lists 2 files, expected 3.", "The archive has no file pictures/p3.webp."]);
    const short = await exportVault(deps({ unzip: (z) => fakeUnzip(z).map((f) => (f.name === "pictures/p1.jpg" ? { ...f, bytes: f.bytes.slice(1) } : f)) }));
    expect(short.differences).toEqual(["The file pictures/p1.jpg is 2 bytes in the archive, expected 3."]);
    const broken = await exportVault(deps({ unzip: () => { throw new Error("bad"); } }));
    expect(broken.differences).toEqual(["The archive could not be read back."]);
  });

  it("uses the given file and records names", async () => {
    const r = await exportVault(deps({ recordsFile: "teapots.jsonld", fileName: (p, type) => `pics/${slug(p.name)}-${p.id}.${type.includes("jpeg") ? "jpg" : "img"}` }));
    expect(r.files).toEqual(["teapots.jsonld", "pics/blue-p1.jpg", "pics/red-p3.img"]);
  });

  it("two pictures that would get the same name: the second is reported, not overwritten", async () => {
    const r = await exportVault(deps({ fileName: () => "pictures/same.jpg" }));
    expect(r.files).toEqual(["records.json", "pictures/same.jpg"]);
    expect(r.differences).toEqual(["Red: its file name pictures/same.jpg is used twice, so the picture is not in the export"]);
  });

  it("an unknown type gets .bin, and the label defaults to the id", async () => {
    const noLabel = (over: Partial<ExportDeps<Pot>>) => {
      const d = deps(over);
      delete d.label;
      return d;
    };
    const r = await exportVault(noLabel({ bytes: async () => ({ bytes: Uint8Array.from([1]), type: "" }), pictureOf: (p) => (p.id === "p1" ? "u/blue" : null) }));
    expect(r.files).toEqual(["records.json", "pictures/p1.bin"]);
    const bad = await exportVault(noLabel({ pictureOf: () => "u/none" }));
    expect(bad.differences[0]).toBe("p1: the picture could not be read: HTTP 404, so it is not in the export");
  });

  it("each reason is in its own words: a read error with its message, empty, a repeated name, a name that cannot be made", async () => {
    const r = await exportVault(
      deps({
        pictureOf: (p) => `u/${p.id}`,
        bytes: async (uri) => {
          if (uri === "u/p1") throw new TypeError("offline");
          if (uri === "u/p2") return { bytes: new Uint8Array(0), type: "image/png" };
          return { bytes: Uint8Array.from([1]), type: "image/png" };
        },
        fileName: () => "pictures/one.png",
      }),
    );
    expect(r.differences).toEqual(["Blue: the picture could not be read: offline, so it is not in the export", "Green: the picture is empty, so it is not in the export"]);
    expect(r.files).toEqual(["records.json", "pictures/one.png"]);
    const twice = await exportVault(deps({ pictureOf: () => "u/blue", fileName: () => "pictures/one.png" }));
    expect(twice.differences).toEqual([
      "Green: its file name pictures/one.png is used twice, so the picture is not in the export",
      "Red: its file name pictures/one.png is used twice, so the picture is not in the export",
    ]);
    const nameFails = await exportVault(deps({ fileName: () => { throw new Error("no such type"); } }));
    expect(nameFails.differences[0]).toBe("Blue: the picture's file name could not be made: no such type, so it is not in the export");
    expect(nameFails.pictures).toBe(0);
  });

  it("a read that throws something that is not an Error still gives its text", async () => {
    const r = await exportVault(deps({ bytes: async () => Promise.reject("plain text") }));
    expect(r.differences[0]).toBe("Blue: the picture could not be read: plain text, so it is not in the export");
  });

  it("does not change the list it was given", async () => {
    const before = JSON.stringify(POTS);
    await exportVault(deps());
    expect(JSON.stringify(POTS)).toBe(before);
  });
});

describe("differences", () => {
  it("lists each field that changed, with empty for a missing value", () => {
    expect(differences("A", { id: "1", name: "x", cups: 1 } as Pot, { id: "1", name: "y" } as Pot, FIELDS)).toEqual(["A: Name was x, reads back y", "A: Cups was 1, reads back empty"]);
  });
  it("is empty when nothing changed and says could not be read back for null", () => {
    expect(differences("A", { id: "1", name: "x" } as Pot, { id: "1", name: "x" } as Pot, FIELDS)).toEqual([]);
    expect(differences("A", { id: "1", name: "x" } as Pot, null, FIELDS)).toEqual(["A: could not be read back"]);
  });
});

describe("slug", () => {
  it("is lower case, hyphenated, accent-free, 40 characters at most, and never empty", () => {
    expect(slug("Tepøt Número 1!")).toBe("tep-t-numero-1");
    expect(slug("a".repeat(60))).toHaveLength(40);
    expect(slug("***")).toBe("item");
  });
});
