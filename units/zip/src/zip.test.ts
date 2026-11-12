import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, unzipStore, zipStore } from "./index";

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe("crc32", () => {
  it("matches the known vectors", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });
});

describe("round trip", () => {
  it("0 entries", () => {
    const z = zipStore([]);
    expect(z.length).toBe(22);
    expect(unzipStore(z)).toEqual([]);
  });
  it("1 entry", () => {
    expect(unzipStore(zipStore([{ name: "a.txt", bytes: bytes("hello") }]))).toEqual([{ name: "a.txt", bytes: bytes("hello") }]);
  });
  it("3 entries, an empty file and a UTF-8 name, in order", () => {
    const files = [
      { name: "tepøt/ü.json", bytes: bytes('{"navn":"tepøt"}') },
      { name: "empty.bin", bytes: new Uint8Array(0) },
      { name: "data.bin", bytes: Uint8Array.from({ length: 300 }, (_, i) => i % 256) },
    ];
    const back = unzipStore(zipStore(files));
    expect(back.map((f) => f.name)).toEqual(files.map((f) => f.name));
    back.forEach((f, i) => expect(Array.from(f.bytes)).toEqual(Array.from(files[i]!.bytes)));
  });
  it("sets the UTF-8 flag (bit 11) and the store method on every header", () => {
    const z = zipStore([{ name: "ü", bytes: bytes("x") }]);
    const v = new DataView(z.buffer);
    expect(v.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(v.getUint16(8, true)).toBe(0);
  });
  it("returns copies, not views of the zip", () => {
    const z = zipStore([{ name: "a", bytes: bytes("abc") }]);
    const [f] = unzipStore(z);
    f!.bytes[0] = 0;
    expect(text(unzipStore(z)[0]!.bytes)).toBe("abc");
  });
  it("reads a zip held in a view that does not start at byte 0", () => {
    const z = zipStore([{ name: "a", bytes: bytes("abc") }]);
    const padded = new Uint8Array(z.length + 10);
    padded.set(z, 7);
    expect(text(unzipStore(padded.subarray(7, 7 + z.length))[0]!.bytes)).toBe("abc");
  });
});

describe("determinism and dates", () => {
  const files = [{ name: "a", bytes: bytes("1") }, { name: "b", bytes: bytes("2") }];
  it("gives the same bytes on every call", () => {
    expect(Array.from(zipStore(files))).toEqual(Array.from(zipStore(files)));
  });
  it("defaults to 1980-01-01 00:00", () => {
    const v = new DataView(zipStore(files).buffer);
    expect(v.getUint16(10, true)).toBe(0);
    expect(v.getUint16(12, true)).toBe((0 << 9) | (1 << 5) | 1);
  });
  it("stores a given date as UTC, to two seconds", () => {
    const v = new DataView(zipStore([{ name: "a", bytes: bytes("1"), date: new Date(Date.UTC(2026, 10, 12, 13, 14, 15)) }]).buffer);
    expect(v.getUint16(10, true)).toBe((13 << 11) | (14 << 5) | 7);
    expect(v.getUint16(12, true)).toBe((46 << 9) | (11 << 5) | 12);
  });
  it("clamps a date before 1980 and refuses an invalid date", () => {
    const v = new DataView(zipStore([{ name: "a", bytes: bytes("1"), date: new Date(Date.UTC(1970, 0, 1)) }]).buffer);
    expect(v.getUint16(12, true)).toBe(0x21);
    expect(() => zipStore([{ name: "a", bytes: bytes("1"), date: new Date(NaN) }])).toThrow("not a valid date");
  });
});

describe("zipStore refuses", () => {
  const one = (name: string) => [{ name, bytes: bytes("x") }];
  it("an empty name", () => expect(() => zipStore(one(""))).toThrow("has no name"));
  it("a name that starts with /", () => expect(() => zipStore(one("/etc/passwd"))).toThrow('starts with "/"'));
  it("a ../ part", () => {
    expect(() => zipStore(one("a/../b"))).toThrow('".." part');
    expect(() => zipStore(one("../b"))).toThrow('".." part');
  });
  it("a ..\\ part", () => expect(() => zipStore(one("a\\..\\b"))).toThrow('".." part'));
  it("a name that only contains dots in a longer part", () => {
    expect(() => zipStore(one("a..b/..c"))).not.toThrow();
  });
  it("a repeated name", () => expect(() => zipStore([...one("a"), ...one("a")])).toThrow('Two files in the zip are called "a"'));
  it("more than 65535 entries", () => {
    const many = Array.from({ length: 65536 }, (_, i) => ({ name: `f${i}`, bytes: new Uint8Array(0) }));
    expect(() => zipStore(many)).toThrow("at most 65535");
  });
  it("65535 entries are fine", () => {
    const many = Array.from({ length: 65535 }, (_, i) => ({ name: `f${i}`, bytes: new Uint8Array(0) }));
    expect(unzipStore(zipStore(many))).toHaveLength(65535);
  });
  it("one file over 4 GiB - 1", () => {
    const big = { length: 0x100000000 } as unknown as Uint8Array;
    expect(() => zipStore([{ name: "big", bytes: big }])).toThrow("over 4 GiB");
  });
  it("a whole zip over 4 GiB - 1", () => {
    const half = { length: 0x80000000 } as unknown as Uint8Array;
    expect(() => zipStore([{ name: "a", bytes: half }, { name: "b", bytes: half }])).toThrow("over 4 GiB");
  });
  it("a name too long for a zip", () => expect(() => zipStore(one("a".repeat(70000)))).toThrow("too long"));
});

describe("unzipStore refuses", () => {
  const good = () => zipStore([{ name: "a.txt", bytes: bytes("hello world") }]);
  it("a flipped data byte (checksum mismatch)", () => {
    const z = good();
    z[30 + "a.txt".length]! ^= 1;
    expect(() => unzipStore(z)).toThrow('The file "a.txt" is damaged');
  });
  it("a truncated zip, at every length", () => {
    const z = zipStore([{ name: "a.txt", bytes: bytes("hello") }, { name: "b", bytes: bytes("x") }]);
    for (let n = 0; n < z.length; n++) expect(() => unzipStore(z.subarray(0, n))).toThrow();
  });
  it("garbage and empty input", () => {
    expect(() => unzipStore(new Uint8Array(0))).toThrow("not a zip");
    expect(() => unzipStore(bytes("this is plainly not a zip file, just text"))).toThrow("not a zip");
    expect(() => unzipStore(Uint8Array.from({ length: 500 }, (_, i) => (i * 7) % 256))).toThrow();
  });
  it("a method 8 (deflate) entry, naming the method", () => {
    const z = good();
    const v = new DataView(z.buffer);
    const central = z.length - 22 - (46 + "a.txt".length);
    v.setUint16(central + 10, 8, true);
    expect(() => unzipStore(z)).toThrow(/method 8 \(deflate\)/);
  });
  it("an unknown method, by number", () => {
    const z = good();
    new DataView(z.buffer).setUint16(z.length - 22 - 46 - 5 + 10, 99, true);
    expect(() => unzipStore(z)).toThrow(/method 99;/);
  });
  it("a file list that points outside the zip", () => {
    const z = good();
    new DataView(z.buffer).setUint32(z.length - 22 + 16, 0xfffffff0, true);
    expect(() => unzipStore(z)).toThrow();
  });
  it("a local header offset outside the zip", () => {
    const z = good();
    new DataView(z.buffer).setUint32(z.length - 22 - 46 - 5 + 42, 0x7fffffff, true);
    expect(() => unzipStore(z)).toThrow("missing");
  });
  it("an encrypted file", () => {
    const z = good();
    new DataView(z.buffer).setUint16(z.length - 22 - 46 - 5 + 8, 0x0801, true);
    expect(() => unzipStore(z)).toThrow("encrypted");
  });
});

const hasUnzip = spawnSync("unzip", ["-v"], { encoding: "utf8" }).error === undefined;
describe("interop with the system unzip", () => {
  it.skipIf(!hasUnzip)("`unzip -t` accepts the file and `unzip -p` gives the bytes back", () => {
    const dir = mkdtempSync(join(tmpdir(), "zip-interop-"));
    try {
      const payload = Uint8Array.from({ length: 1000 }, (_, i) => (i * 31) % 256);
      const file = join(dir, "t.zip");
      writeFileSync(file, zipStore([{ name: "tepøt/ü.json", bytes: bytes("{}") }, { name: "data.bin", bytes: payload }, { name: "empty", bytes: new Uint8Array(0) }]));
      const t = spawnSync("unzip", ["-t", file], { encoding: "utf8" });
      expect(t.status, t.stdout + t.stderr).toBe(0);
      expect(t.stdout).toContain("No errors detected");
      const p = spawnSync("unzip", ["-p", file, "data.bin"]);
      expect(Array.from(new Uint8Array(p.stdout))).toEqual(Array.from(payload));
      expect(readFileSync(file).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  if (!hasUnzip) it("(skipped: the `unzip` command is not on this machine)", () => undefined);
});
