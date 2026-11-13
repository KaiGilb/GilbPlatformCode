/** One file to put in a zip. `date` is stored to the nearest two seconds, read as UTC; left out, it is 1980-01-01 00:00 so the same input gives the same bytes. */
export interface ZipFile {
  name: string;
  bytes: Uint8Array;
  date?: Date;
}

const MAX = 0xffffffff; // 4 GiB - 1: the largest size and offset a zip without zip64 can hold
const MAX_ENTRIES = 0xffff;
const UTF8 = 0x0800; // general purpose flag bit 11: names are UTF-8
const ENCRYPTED = 0x0001;
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const DEFAULT_DATE = (1 << 5) | 1; // 1980-01-01
const METHOD_NAMES: Record<number, string> = { 1: "shrink", 6: "implode", 8: "deflate", 9: "deflate64", 12: "bzip2", 14: "lzma", 93: "zstd", 95: "xz", 98: "ppmd" };

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** The CRC-32 (the one zip uses) of the bytes, as an unsigned number. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS time and date words for a Date, read as UTC. Before 1980 is 1980-01-01 00:00; after 2107 is the last second a zip can hold. */
function dosStamp(d: Date | undefined): { time: number; date: number } {
  if (d === undefined) return { time: 0, date: DEFAULT_DATE };
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new Error("A file's date is not a valid date.");
  const year = d.getUTCFullYear();
  if (year < 1980) return { time: 0, date: DEFAULT_DATE };
  if (year > 2107) return { time: (23 << 11) | (59 << 5) | 29, date: (127 << 9) | (12 << 5) | 31 };
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/** The rules for a name, shared by writing and reading. Returns the sentence for a bad name, or null. */
function nameProblem(name: string): string | null {
  if (name === "") return "A file in the zip has no name.";
  if (name.includes("\0")) return `The name "${name.replace(/\0/g, "\\0")}" has a NUL character.`;
  if (name.startsWith("/") || name.startsWith("\\")) return `The name "${name}" starts with a slash; a zip name must be a relative path.`;
  if (/^[A-Za-z]:/.test(name)) return `The name "${name}" starts with a drive letter; a zip name must be a relative path.`;
  if (name.split(/[\\/]/).includes("..")) return `The name "${name}" has a ".." part; a zip name must stay inside the zip.`;
  return null;
}

function checkName(name: string, seen: Set<string>): void {
  if (typeof name !== "string") throw new Error("A file in the zip has no name.");
  const problem = nameProblem(name);
  if (problem) throw new Error(problem);
  if (seen.has(name)) throw new Error(`Two files in the zip are called "${name}".`);
  seen.add(name);
}

/**
 * One zip holding every file, stored (not compressed). Names are UTF-8 (flag bit 11). The same input gives the same bytes.
 * Throws a plain sentence for an empty name, a name that starts with "/" or has a ".." part, a repeated name, more than 65535
 * files, or a file or a whole zip over 4 GiB - 1 (there is no zip64).
 */
export function zipStore(entries: readonly ZipFile[]): Uint8Array {
  if (entries.length > MAX_ENTRIES) throw new Error(`A zip holds at most ${MAX_ENTRIES} files; ${entries.length} were given.`);
  const enc = new TextEncoder();
  const seen = new Set<string>();
  const names: Uint8Array[] = [];
  let total = 22;
  for (const e of entries) {
    checkName(e.name, seen);
    const name = enc.encode(e.name);
    if (name.length > 0xffff) throw new Error(`The name "${e.name.slice(0, 40)}..." is too long for a zip.`);
    if (e.bytes.length > MAX) throw new Error(`The file "${e.name}" is over 4 GiB; a zip without zip64 cannot hold it.`);
    names.push(name);
    total += 30 + name.length + e.bytes.length + 46 + name.length;
    if (total > MAX) throw new Error("The zip would be over 4 GiB; a zip without zip64 cannot hold it.");
  }

  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  const central: { at: number; size: number }[] = [];
  let at = 0;
  entries.forEach((e, i) => {
    const name = names[i]!;
    const { time, date } = dosStamp(e.date);
    const crc = crc32(e.bytes);
    central.push({ at, size: e.bytes.length });
    v.setUint32(at, SIG_LOCAL, true);
    v.setUint16(at + 4, 20, true); // version needed
    v.setUint16(at + 6, UTF8, true);
    v.setUint16(at + 8, 0, true); // method: store
    v.setUint16(at + 10, time, true);
    v.setUint16(at + 12, date, true);
    v.setUint32(at + 14, crc, true);
    v.setUint32(at + 18, e.bytes.length, true); // compressed size
    v.setUint32(at + 22, e.bytes.length, true); // size
    v.setUint16(at + 26, name.length, true);
    out.set(name, at + 30);
    out.set(e.bytes, at + 30 + name.length);
    at += 30 + name.length + e.bytes.length;
  });
  const cdStart = at;
  entries.forEach((e, i) => {
    const name = names[i]!;
    const { time, date } = dosStamp(e.date);
    v.setUint32(at, SIG_CENTRAL, true);
    v.setUint16(at + 4, 20, true); // version made by
    v.setUint16(at + 6, 20, true); // version needed
    v.setUint16(at + 8, UTF8, true);
    v.setUint16(at + 10, 0, true); // method: store
    v.setUint16(at + 12, time, true);
    v.setUint16(at + 14, date, true);
    v.setUint32(at + 16, crc32(e.bytes), true);
    v.setUint32(at + 20, e.bytes.length, true);
    v.setUint32(at + 24, e.bytes.length, true);
    v.setUint16(at + 28, name.length, true);
    v.setUint32(at + 42, central[i]!.at, true); // offset of the local header
    out.set(name, at + 46);
    at += 46 + name.length;
  });
  v.setUint32(at, SIG_END, true);
  v.setUint16(at + 8, entries.length, true);
  v.setUint16(at + 10, entries.length, true);
  v.setUint32(at + 12, at - cdStart, true);
  v.setUint32(at + 16, cdStart, true);
  return out;
}

const bad = (why: string): Error => new Error(`This is not a zip file I can read (${why}).`);

/**
 * The files of a zip made by `zipStore` (or any zip that stores without compression), read from its central directory. Each file's
 * CRC-32 is checked. Throws a plain sentence for bytes that are not a zip, a zip cut short, a CRC that does not match, a file
 * that is encrypted, or a method other than 0 (store), which it names. It also refuses an unsafe name, by the rules of `zipStore`
 * plus a leading `\\`, a drive letter and a NUL character, so a name that comes back is safe to join to a folder (zip slip). A
 * directory entry (a name ending in `/`, no bytes) is returned like any other file. It never reads outside `zip`.
 */
export function unzipStore(zip: Uint8Array): { name: string; bytes: Uint8Array }[] {
  const len = zip.length;
  if (len < 22) throw bad("too short");
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = -1;
  for (let i = len - 22; i >= Math.max(0, len - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === SIG_END && i + 22 + v.getUint16(i + 20, true) <= len) {
      end = i;
      break;
    }
  }
  if (end < 0) throw bad("no end of the file list; it may be cut short");
  if (v.getUint16(end + 4, true) !== 0 || v.getUint16(end + 6, true) !== 0) throw bad("a zip in several parts");
  const count = v.getUint16(end + 10, true);
  const cdSize = v.getUint32(end + 12, true);
  const cdStart = v.getUint32(end + 16, true);
  // 65535 files is a real count (the most zipStore writes); it means zip64 only when a zip64 locator sits before the end record.
  const zip64 = end >= 20 && v.getUint32(end - 20, true) === 0x07064b50;
  if ((count === 0xffff && zip64) || cdSize === MAX || cdStart === MAX) throw bad("zip64 is not supported");
  if (cdStart + cdSize > end) throw bad("the file list lies outside the file");

  const out: { name: string; bytes: Uint8Array }[] = [];
  const dec = new TextDecoder();
  const seen = new Set<string>();
  let at = cdStart;
  for (let i = 0; i < count; i++) {
    if (at + 46 > cdStart + cdSize || v.getUint32(at, true) !== SIG_CENTRAL) throw bad("a damaged file list");
    const flags = v.getUint16(at + 8, true);
    const method = v.getUint16(at + 10, true);
    const crc = v.getUint32(at + 16, true);
    const csize = v.getUint32(at + 20, true);
    const size = v.getUint32(at + 24, true);
    const nlen = v.getUint16(at + 28, true);
    const xlen = v.getUint16(at + 30, true);
    const clen = v.getUint16(at + 32, true);
    const local = v.getUint32(at + 42, true);
    if (at + 46 + nlen + xlen + clen > cdStart + cdSize) throw bad("a damaged file list");
    const name = dec.decode(zip.subarray(at + 46, at + 46 + nlen));
    at += 46 + nlen + xlen + clen;
    checkName(name, seen);
    if (flags & ENCRYPTED) throw new Error(`The file "${name}" is encrypted; encrypted zips are not supported.`);
    if (method !== 0) {
      const how = METHOD_NAMES[method];
      throw new Error(`The file "${name}" uses zip compression method ${method}${how ? ` (${how})` : ""}; only stored files (method 0) are supported.`);
    }
    if (csize !== size) throw bad(`the sizes of "${name}" disagree`);
    if (local + 30 > cdStart || v.getUint32(local, true) !== SIG_LOCAL) throw bad(`the entry for "${name}" is missing`);
    const dataAt = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (dataAt + size > cdStart) throw bad(`the data of "${name}" is cut short`);
    const bytes = zip.slice(dataAt, dataAt + size);
    if (crc32(bytes) !== crc) throw new Error(`The file "${name}" is damaged: its checksum does not match.`);
    out.push({ name, bytes });
  }
  return out;
}
