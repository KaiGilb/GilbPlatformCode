/** What a picture read gives back: the file's bytes and its content type. */
export interface PictureBytes {
  bytes: Uint8Array;
  type: string;
}

/** One file in the archive. */
export interface ArchiveFile {
  name: string;
  bytes: Uint8Array;
}

/** What the listing answers: the records, and whether the list is the whole list. */
export interface RecordList<T> {
  records: readonly T[];
  /** false when the listing stopped early (a page limit, an error after some pages): the export then says so. */
  complete: boolean;
}

export interface ExportDeps<T extends { id: string }> {
  /** The records to export, in the order they go in the file. */
  list(): Promise<RecordList<T>>;
  /** The record as the app writes it (JSON-LD or anything JSON). `file` is the picture's name inside the archive, when it has one. */
  toJson(record: T, file?: string): unknown;
  /** The record's picture (the master file's address), or null when it has none. */
  pictureOf(record: T): string | null | undefined;
  /** Reads a picture's bytes (for example `pictureBytes` of signed-picture, bound to the vault's origin). */
  bytes(pictureUri: string): Promise<PictureBytes>;
  /** Packs files into an archive (for example `zipStore` of zip). */
  zip(files: ArchiveFile[]): Uint8Array;
  /** Reads an archive back (for example `unzipStore` of zip). */
  unzip(archive: Uint8Array): ArchiveFile[];
  /** A name to show for a record in a message. Default: its id. */
  label?(record: T): string;
  /** The name of a picture inside the archive. Default `pictures/<id>.<extension of the type>`. */
  fileName?(record: T, type: string): string;
  /** The name of the records file inside the archive. Default `records.json`. */
  recordsFile?: string;
  /** Reads one record again from the vault, to compare with what was exported. Without it the records are not compared. */
  reread?(record: T): Promise<T | null>;
  /** The differences between what was sent and what reads back (see {@link differences}). Default: none are looked for. */
  compare?(sent: T, now: T | null): string[];
}

export interface ExportResult {
  /** The archive. */
  zipBytes: Uint8Array;
  /** How many records are in it. */
  count: number;
  /** The names of the files in the archive, the records file first. */
  files: string[];
  /** How many pictures are in it. */
  pictures: number;
  /** Everything that did not check out, each as one plain sentence. Empty means the export is whole and read back. */
  differences: string[];
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
const extensionOf = (type: string): string => EXTENSIONS[type.split(";")[0]!.trim().toLowerCase()] ?? "bin";
/** A file-name-safe piece of a name: letters, digits and hyphens, lower case, accents dropped, at most 40 characters; "item" when nothing is left. */
export function slug(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).toLowerCase() || "item";
}

/**
 * Field by field: what was sent against what reads back now. `now` null means the record could not be read back. `fields` names each
 * field to compare (`key` of the record and the `label` to show). Values are compared with `!==`.
 */
export function differences<T>(label: string, sent: T, now: T | null, fields: readonly { key: keyof T; label: string }[]): string[] {
  if (now === null || now === undefined) return [`${label}: could not be read back`];
  return fields
    .filter((f) => sent[f.key] !== now[f.key])
    .map((f) => `${label}: ${f.label} was ${show(sent[f.key])}, reads back ${show(now[f.key])}`);
}
const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const show = (v: unknown): string => (v === undefined || v === null || v === "" ? "empty" : String(v));

/**
 * Exports every record of a type: the records as one file, each record's picture beside it, in one archive; then reads the archive back
 * and, when `reread` and `compare` are given, each record from the vault, and lists everything that does not match. A picture that cannot
 * be read, is empty, or would get a file name already used is left out and named in `differences`, each in its own words; it never stops the export. The pieces (listing, bytes, zip, mapping) are all passed in.
 */
export async function exportVault<T extends { id: string }>(deps: ExportDeps<T>): Promise<ExportResult> {
  const label = deps.label ?? ((r: T) => r.id);
  const recordsFile = deps.recordsFile ?? "records.json";
  const diffs: string[] = [];
  const { records, complete } = await deps.list();
  if (!complete) diffs.push("The list was incomplete: some records may be missing from the export.");

  const files: ArchiveFile[] = [];
  const json: unknown[] = [];
  const used = new Set<string>([recordsFile]);
  let pictures = 0;
  for (const record of records) {
    let file: string | undefined;
    const uri = deps.pictureOf(record);
    if (uri) {
      const left = (why: string) => diffs.push(`${label(record)}: ${why}`);
      let got: PictureBytes | null = null;
      try {
        got = await deps.bytes(uri);
      } catch (e) {
        left(`the picture could not be read: ${reason(e)}, so it is not in the export`);
      }
      if (got) {
        if (got.bytes.length === 0) left("the picture is empty, so it is not in the export");
        else {
          let wanted: string | null = null;
          try {
            wanted = deps.fileName ? deps.fileName(record, got.type) : `pictures/${slug(record.id)}.${extensionOf(got.type)}`;
          } catch (e) {
            left(`the picture's file name could not be made: ${reason(e)}, so it is not in the export`);
          }
          if (wanted !== null) {
            if (used.has(wanted)) left(`its file name ${wanted} is used twice, so the picture is not in the export`);
            else {
              used.add(wanted);
              file = wanted;
              files.push({ name: wanted, bytes: got.bytes });
              pictures++;
            }
          }
        }
      }
    }
    json.push(deps.toJson(record, file));
  }
  const recordsBytes = new TextEncoder().encode(JSON.stringify(json, null, 2));
  const all: ArchiveFile[] = [{ name: recordsFile, bytes: recordsBytes }, ...files];
  const zipBytes = deps.zip(all);

  // Read back: the archive's own contents, then each record from the vault.
  try {
    const back = deps.unzip(zipBytes);
    if (back.length !== all.length) diffs.push(`The archive lists ${back.length} files, expected ${all.length}.`);
    const byName = new Map(back.map((f) => [f.name, f.bytes]));
    for (const f of all) {
      const got = byName.get(f.name);
      if (!got) diffs.push(`The archive has no file ${f.name}.`);
      else if (got.length !== f.bytes.length) diffs.push(`The file ${f.name} is ${got.length} bytes in the archive, expected ${f.bytes.length}.`);
    }
  } catch {
    diffs.push("The archive could not be read back.");
  }
  if (deps.reread && deps.compare) {
    for (const record of records) diffs.push(...deps.compare(record, await deps.reread(record).catch(() => null)));
  }
  return { zipBytes, count: records.length, files: all.map((f) => f.name), pictures, differences: diffs };
}
