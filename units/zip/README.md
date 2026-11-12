# zip

## What this is

Writes a zip file of stored (uncompressed) files with the same bytes every time, and reads one back with every checksum checked. It is plain TypeScript over `Uint8Array`: no peers, no React, no DOM, no Node API, so it runs in a browser, a worker or Node.

**Replaces in run 8:** `app/src/services/zip.ts` (94 lines): `zipStore`, `crc32` and `zipList`.

## What this is not

Not a compressor: method 0 (store) only, so a picture export is its true size. No zip64 (nothing over 4 GiB - 1, at most 65535 files), no encryption, no multi-part zips. Reading a zip made with deflate throws a sentence that names the method.

## API

```ts
zipStore(entries: { name: string; bytes: Uint8Array; date?: Date }[]): Uint8Array
unzipStore(zip: Uint8Array): { name: string; bytes: Uint8Array }[]
crc32(bytes: Uint8Array): number
```

- `zipStore` writes UTF-8 names with general-purpose flag bit 11 set. `date` is stored to two seconds, read as UTC; left out it is 1980-01-01 00:00, so two calls with the same input give identical bytes. It throws a plain sentence for an empty name, a name that starts with `/`, a name with a `..` part (split on `/` and `\`), a repeated name, more than 65535 files, or a file or a whole zip over 4 GiB - 1.
- `unzipStore` reads the central directory (the end record is searched from the back, so a zip comment is fine), returns copies of the bytes in directory order, and checks each file's CRC-32. It throws a plain sentence for bytes that are not a zip, a zip cut short, a file list or offset that points outside the buffer, an encrypted file, a method other than 0 (named, for example "method 8 (deflate)"), and a checksum that does not match. It never reads outside the buffer. Names come back as stored: check them before writing any file to disk.
- `crc32("123456789")` is `0xCBF43926`.

## Example

```ts
import { zipStore, unzipStore } from "@kaigilb/gilbplatformcode-zip";

const zip = zipStore([
  { name: "teapots.json", bytes: new TextEncoder().encode(JSON.stringify(rows)) },
  { name: "pictures/tepøt-1.jpg", bytes: masterBytes },
]);
download(new Blob([zip], { type: "application/zip" }), "export.zip");
const back = unzipStore(zip); // read-back check of an export
```

## How to take it

Package `@kaigilb/gilbplatformcode-zip`. No peers. Put `install-links=true` in your `.npmrc` so the unit is installed as a copy.

## Where it came from

New code, written for EESpeed Round 8 (batch CB3) from the run-8 app's `src/services/zip.ts` (`zipStore`, `crc32`, `zipList`), made general: bytes instead of `data`, the central directory read with every bound checked, the CRC verified, names and sizes refused when a zip could not hold them. Repository `KaiGilb/GilbPlatformCode`, commit `a5e8f8cd1ff677b5f1cb2645c4d49f44a6f1823c`.

## Tests

`npm test` (vitest): crc32 vectors; round trips of 0, 1 and 3 files (an empty file, the name `tepøt/ü.json`); identical bytes on two calls; every refusal; a flipped data byte; a zip cut at every length; a method 8 and a method 99 entry; offsets outside the buffer; an encrypted flag; and one test that runs the system `unzip -t` and `unzip -p` on the output (skipped with a message when `unzip` is not installed).
