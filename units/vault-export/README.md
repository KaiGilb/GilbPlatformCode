# vault-export

## What this is

Exports every record of a type from a vault as one archive of the records file and each record's picture, then reads the archive back and lists everything that does not check out. The records, the picture bytes and the zip come in as functions, so the unit has no peers and no React, and it holds no type name or field name.

**Replaces in run 8:** most of `app/src/services/exportService.ts` (71 lines): `slug`, the picture-name logic, the pack, the read-back and `differences`, about 36 lines. What stays in the app is the JSON-LD mapping, the record listing and the file name of the download.

## API

```ts
exportVault<T extends { id: string }>(deps: {
  list(): Promise<{ records: readonly T[]; complete: boolean }>;
  toJson(record: T, file?: string): unknown;           // the app's mapping; `file` is the picture's name in the archive
  pictureOf(record: T): string | null | undefined;     // the master picture's address
  bytes(uri: string): Promise<{ bytes: Uint8Array; type: string }>;
  zip(files: { name: string; bytes: Uint8Array }[]): Uint8Array;
  unzip(archive: Uint8Array): { name: string; bytes: Uint8Array }[];
  label?(record: T): string;                           // default: the id
  fileName?(record: T, type: string): string;         // default pictures/<id>.<jpg|png|webp|gif|avif|bin>
  recordsFile?: string;                                // default records.json
  reread?(record: T): Promise<T | null>;               // read one record again from the vault
  compare?(sent: T, now: T | null): string[];          // what differs; see differences()
}): Promise<{ zipBytes: Uint8Array; count: number; files: string[]; pictures: number; differences: string[] }>

differences<T>(label: string, sent: T, now: T | null, fields: { key: keyof T; label: string }[]): string[]
slug(text: string): string
```

- The archive holds the records file first, then each picture. A record with no picture, or whose picture could not be read, is still in the records file, without a file name.
- `differences` in the answer is empty when everything checked out. It names: an incomplete list; a picture left out, each in its own words (`the picture could not be read: <the error's message>`, `the picture is empty`, `its file name <x> is used twice`, `the picture's file name could not be made: <message>`); an archive that reads back with a different number of files, a missing file or a different size; an archive that cannot be read back; and, when `reread` and `compare` are given, every field that reads back different.
- Nothing is thrown for a picture. An error from `list`, `toJson`, `zip` or `compare` is the caller's and is thrown.

## Example

```ts
import { exportVault, differences, slug } from "@kaigilb/gilbplatformcode-vault-export";
import { pictureBytes } from "@kaigilb/gilbplatformcode-signed-picture";
import { zipStore, unzipStore } from "@kaigilb/gilbplatformcode-zip";

const r = await exportVault<Teapot>({
  list: () => listTeapots(vaultId),                                    // was exportTeapots' first lines
  toJson: toJsonLd,                                                    // the app's own mapping stays
  pictureOf: (t) => t.pictureId,
  bytes: (uri) => pictureBytes(uri, vaultOrigin(vaultId)),             // was masterBytes
  zip: zipStore, unzip: unzipStore,                                    // was zipStore and zipList
  label: (t) => t.name,
  fileName: (t, type) => `pictures/${slug(t.name)}-${t.id}.${EXT[type] ?? "bin"}`,
  recordsFile: "teapots.jsonld",
  reread: (t) => getTeapot(t.entity),
  compare: (sent, now) => differences(sent.name, sent, now, TEAPOT_FIELDS),
});
download(new Blob([r.zipBytes], { type: "application/zip" }), "teapots.zip");
```

## How to take it

Package `@kaigilb/gilbplatformcode-vault-export`. No peers. The functions you pass in come from other units (`vault-records-of-type` or `lws-records` for the listing, `signed-picture` `pictureBytes`, `zip`), but none is imported here. Put `install-links=true` in your `.npmrc` so the unit is installed as a copy.

## Where it came from

New code, written for EESpeed Round 8 (batch CB4) from the run-8 app's `src/services/exportService.ts` (`exportTeapots`, `differences`, `slug`), made general: the listing, the mapping, the picture read and the zip are passed in; the archive is checked by file name and size; a name used twice is reported instead of overwritten. Repository `KaiGilb/GilbPlatformCode`, commit `a5e8f8cd1ff677b5f1cb2645c4d49f44a6f1823c`.

## Tests

`npm test` (vitest), with fakes for the listing, the mapping, the pictures and a lossless zip: the whole export and its order; an empty list; a missing picture reported and not thrown, with the reason; a 0-byte picture; a name used twice; a file name that cannot be made; an incomplete list; a field that differs on read-back, a record that cannot be read back, a reread that throws; an archive that reads back short, with a file missing or not at all; the given file and records names; a name used twice; the default `.bin` and the default label; the input not changed; `differences` and `slug`.
