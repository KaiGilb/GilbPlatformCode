import type { Caller } from "./auth";
import { hex, sha256, sha256Hex, stableStringify } from "./bytes";
import { badRequest, empty, failure, forbidden, json, notFound, schemaRefusal, type Core, type Req } from "./http";
import { endRecord, entityOf, makeRecord } from "./records";
import type { FakeFile, FakeRecord, Vault } from "./types";
import { reachOf, resolveVault } from "./vaults";

const BROWSE_PAGE_SIZE = 50;
const BROWSE_MAX_PAGE_SIZE = 200;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;

/** The Content-Type the upload keeps: bare lower-case type/subtype; absent is octet-stream; malformed is null. src/routes/files.ts:245-250. */
function mediaTypeOf(raw: string | null): string | null {
  if (raw === null || raw.trim() === "") return "application/octet-stream";
  const bare = raw.split(";", 1)[0]!.trim();
  return MEDIA_TYPE.test(bare) ? bare.toLowerCase() : null;
}

/** src/files/file-store.ts:237-260: NFC, no empty path, no empty segment, no `.`/`..`; deduped and sorted. Throws the platform's sentence. */
export function normalizeFolderPaths(paths: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of paths) {
    const p = raw.normalize("NFC");
    if (p === "") throw new Error("normalizeFolderPaths: empty path (unfiled = omit the attribute)");
    const segs = p.split("/");
    if (segs.some((x) => x === "")) throw new Error(`normalizeFolderPaths: '${raw}' violates the path grammar — segments are '/'-joined with no leading, trailing, or empty segment`);
    if (segs.some((x) => x === "." || x === "..")) throw new Error(`normalizeFolderPaths: '${raw}' carries a '.'/'..' segment — virtual paths are labels, never traversable filesystem paths`);
    out.add(p);
  }
  return [...out].sort();
}
const tagList = (tags: readonly string[]): string[] => [...new Set(tags.map((t) => t.normalize("NFC").trim()))].sort();

const FILE_TYPE = "File";
const entityUriOf = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (v !== null && typeof v === "object" && typeof (v as { "@id"?: unknown })["@id"] === "string") return (v as { "@id": string })["@id"];
  return null;
};
const tailOf = (uri: string): string => uri.slice(uri.lastIndexOf("/") + 1);

export interface StoreInput {
  name: string;
  bytes: Uint8Array;
  mediaType: string;
  type?: string;
  folders: string[];
  tags: string[];
  storedWith?: string;
  by: string;
  transcodedFrom?: string;
}

/**
 * Store bytes as a file of the vault. A file is the same file when the vault, the bytes' hash, the name, media type, folders, tags, stored-with and
 * uploader are the same (the platform's identity hash over the file facts, src/files/file-store.ts:342-398,444-454): then nothing changes (created:false).
 */
export function storeFile(core: Core, vault: Vault, i: StoreInput): { file: FakeFile; created: boolean } {
  const contentHash = hex(sha256(i.bytes));
  const identity = sha256Hex(stableStringify({ v: vault.id, h: contentHash, n: i.name, m: i.mediaType, f: i.folders, t: i.tags, w: i.storedWith ?? null, by: i.by }));
  for (const f of core.s.files.values()) if (f.vaultId === vault.id && f.endedSeq === null && f.identity === identity) return { file: f, created: false };
  const facts: Record<string, unknown> = {
    fileName: i.name,
    fileMediaType: i.mediaType,
    fileByteSize: i.bytes.length,
    fileContentHash: contentHash,
    fileStoredBy: { "@id": i.by },
  };
  if (i.folders.length > 0) facts.fileFolderPath = i.folders;
  if (i.tags.length > 0) facts.fileTag = i.tags;
  if (i.storedWith !== undefined) facts.fileStoredWith = i.storedWith;
  if (i.transcodedFrom !== undefined) facts.transcodedFrom = { "@id": i.transcodedFrom };
  const rec = makeRecord(core, vault.id, i.type ?? FILE_TYPE, facts);
  core.s.records.delete(rec.id); // a file is not in the record store: the record list never shows it (src/lws/records.ts:406)
  const file: FakeFile = { ...rec, bytes: i.bytes, identity };
  core.s.files.set(file.id, file);
  return { file, created: true };
}
/** A file by id, at the host that names its vault. */
function fileAt(core: Core, req: Req, id: string): FakeFile | null {
  const f = core.s.files.get(id);
  return f && core.s.vaults.get(f.vaultId)!.host === req.host ? f : null;
}
const nosniff = { "x-content-type-options": "nosniff" };
const noFile = (core: Core, req: Req): Response => failure(404, "NotFound", `No resource at https://${req.host}/files/${req.params.id}`);

/**
 * PUT and POST /lws/vault/:vault/files?name=&folder=&tag=&storedWith= — upload raw bytes into the vault.
 * Mirrors: src/routes/files.ts:1354-1363 (routes), uploadFileToVault :695-716 (write resolver before the body is read), streamStoreUpload :363-597
 * (415 multipart :376-382, Content-Type :383-387, one non-empty name :388-393, folders :394-403, thumbnail/face/fileType :405-480, no body :487-491,
 * answer :577-596); identity src/files/file-store.ts:342-398,444-454; folders :237-260.
 * Not faked: ?thumbnail=, ?face=, ?fileType= (answer 400 fake_platform_not_faked).
 */
export function uploadFile(core: Core, req: Req, caller: Caller | null): Response {
  const target = resolveVault(core, caller, req.params.vault!, "write");
  if (target instanceof Response) return target;
  const q = req.query;
  const ct = req.headers.get("content-type");
  if (ct !== null && ct.toLowerCase().startsWith("multipart/")) return failure(415, "UnsupportedMediaType", "PUT/POST takes the raw file bytes as the request body (not multipart) — metadata rides the query string");
  const mediaType = mediaTypeOf(ct);
  if (mediaType === null) return badRequest(`Malformed Content-Type '${ct}' — expected type/subtype`);
  const names = q.getAll("name");
  const name = names[0]?.trim() ?? "";
  if (names.length !== 1 || name === "") return badRequest("Exactly one non-empty ?name= is required (the stored a:fileName)");
  let folders: string[];
  try {
    folders = normalizeFolderPaths(q.getAll("folder"));
  } catch (e) {
    return badRequest((e as Error).message);
  }
  for (const k of ["thumbnail", "face", "fileType"]) {
    if (q.has(k)) return failure(400, "fake_platform_not_faked", `fake-platform does not answer ?${k}=; the platform does (src/routes/files.ts:405-480).`);
  }
  if (req.bodyBytes === null) return badRequest("Upload requires a request body (the raw file bytes)");
  const { file, created } = storeFile(core, target, { name, bytes: req.bodyBytes, mediaType, folders, tags: tagList(q.getAll("tag")), storedWith: q.getAll("storedWith")[0], by: caller!.principal });
  const body = { entity: entityOf(core, file), contentHash: file.facts.fileContentHash, byteSize: file.bytes.length, created };
  return json(created ? 201 : 200, body, { ...nosniff, ...(created ? { location: `/files/${file.id}` } : {}) });
}

/**
 * GET /files/:id — the bytes. An ended file still answers (ending keeps the bytes). 404 for absent, no read reach, or the wrong host (one body for all).
 * Mirrors: src/routes/files.ts:1321-1325; downloadFile :870-986 (404 :917, headers :952-954, 200 :982); src/routes/_http.ts:26 (the 404 body).
 * Not faked: Range (answers 400 fake_platform_not_faked).
 */
export function getFile(core: Core, req: Req, caller: Caller | null): Response {
  const f = fileAt(core, req, req.params.id!);
  if (!f || !reachOf(core, caller, core.s.vaults.get(f.vaultId)!).has("read")) return noFile(core, req);
  if (req.headers.has("range")) return failure(400, "fake_platform_not_faked", "fake-platform does not answer Range; the platform does (src/routes/files.ts:943-979).");
  return new Response(f.bytes as BodyInit, {
    status: 200,
    headers: { "content-type": String(f.facts.fileMediaType), etag: `"sha256:${f.facts.fileContentHash}"`, "accept-ranges": "bytes", "content-length": String(f.bytes.length), ...nosniff },
  });
}

/**
 * DELETE /files/:id — end the file: it leaves the `live` listing, its bytes stay. Idempotent (an already ended file is 204).
 * Mirrors: src/routes/files.ts:1385-1389; deleteFileRoute :749-809 (non-owner read gate 404 :774-780, 204 :807, absent 404 :797-801; a reader without write 403, doc :728-733).
 * Order: absent or no read (404), then write (403).
 */
export function endFileRoute(core: Core, req: Req, caller: Caller | null): Response {
  const f = fileAt(core, req, req.params.id!);
  const vault = f ? core.s.vaults.get(f.vaultId)! : null;
  if (!f || !vault || !reachOf(core, caller, vault).has("read")) return noFile(core, req);
  if (!reachOf(core, caller, vault).has("write")) return forbidden(`Principal ${caller?.principal ?? "<anon>"} is not authorized to end ${entityOf(core, f)} (no current write-grant)`);
  if (f.endedSeq === null) endRecord(core, f as FakeRecord);
  return empty(204);
}

// ── the listing ───────────────────────────────────────────────────────────────────────────────

const LISTING_KEYS = new Set(["folder", "tag", "unfiled", "unattached", "storedWith", "transcodedFrom", "limit", "offset", "as", "lifecycle"]);
const truthy = (v: string | null): boolean => v === "true" || v === "1";

/**
 * GET /lws/vault/:vault/files — `{ vault, scannedVaults, count, files }`, never a cursor.
 * Mirrors: src/routes/file-browse.ts:73-100 (query schema: unknown key, non-digit limit/offset, empty value, bad lifecycle are 400), :208-250 (route);
 * src/read/file-browse.ts:66-68 (page 50, max 200), :79-134 (the row), :283-499 (filters, order by fileName then entity, count = total, page).
 * `transcodedFrom` per file follows `listingCarriesTranscodedFrom` (GilbPlatform 78d1fb1d, #691).
 */
export function listFiles(core: Core, req: Req, caller: Caller | null): Response {
  const q = req.query;
  for (const k of new Set(q.keys())) if (!LISTING_KEYS.has(k)) return schemaRefusal("querystring must NOT have additional properties");
  for (const k of ["folder", "tag", "unfiled", "unattached", "storedWith", "transcodedFrom", "as"]) if (q.get(k) === "") return schemaRefusal(`querystring/${k} must NOT have fewer than 1 characters`);
  for (const k of ["limit", "offset"]) if (q.has(k) && !/^[0-9]+$/.test(q.get(k)!)) return schemaRefusal(`querystring/${k} must match pattern "^[0-9]+$"`);
  if (q.has("lifecycle") && !["live", "ended", "all"].includes(q.get("lifecycle")!)) return schemaRefusal("querystring/lifecycle must be equal to one of the allowed values");
  const target = resolveVault(core, caller, req.params.vault!, "read");
  if (target instanceof Response) return target;

  const lifecycle = q.get("lifecycle") ?? "live";
  const cap = Math.min(Math.max(1, q.has("limit") ? Number(q.get("limit")) : BROWSE_PAGE_SIZE), BROWSE_MAX_PAGE_SIZE);
  const offset = q.has("offset") ? Number(q.get("offset")) : 0;
  const folder = q.has("folder") ? q.get("folder")!.normalize("NFC") : truthy(q.get("unfiled")) ? null : undefined;
  const tag = q.has("tag") ? q.get("tag")!.normalize("NFC") : undefined;
  const storedWith = q.has("storedWith") ? q.get("storedWith")!.normalize("NFC") : truthy(q.get("unattached")) ? null : undefined;
  const from = q.get("transcodedFrom");

  const hits = [...core.s.files.values()].filter((f) => {
    if (f.vaultId !== target.id) return false;
    if (lifecycle === "live" && f.endedSeq !== null) return false;
    if (lifecycle === "ended" && f.endedSeq === null) return false;
    const folders = (f.facts.fileFolderPath as string[] | undefined) ?? [];
    if (folder === null ? folders.length > 0 : folder !== undefined && !folders.includes(folder)) return false;
    if (tag !== undefined && !((f.facts.fileTag as string[] | undefined) ?? []).includes(tag)) return false;
    const sw = typeof f.facts.fileStoredWith === "string" ? f.facts.fileStoredWith : null;
    if (storedWith === null ? sw !== null : storedWith !== undefined && sw !== storedWith) return false;
    if (from !== null) {
      const link = entityUriOf(f.facts.transcodedFrom);
      if (link === null || tailOf(link) !== tailOf(from)) return false;
    }
    return true;
  });
  hits.sort((a, b) => {
    const an = typeof a.facts.fileName === "string" ? a.facts.fileName : null;
    const bn = typeof b.facts.fileName === "string" ? b.facts.fileName : null;
    if (an !== bn) return an === null ? 1 : bn === null ? -1 : an < bn ? -1 : 1;
    const ae = entityOf(core, a);
    const be = entityOf(core, b);
    return ae < be ? -1 : ae > be ? 1 : 0;
  });
  const files = hits.slice(offset, offset + cap).map((f) => ({
    entity: entityOf(core, f),
    fileName: typeof f.facts.fileName === "string" ? f.facts.fileName : null,
    mediaType: typeof f.facts.fileMediaType === "string" ? f.facts.fileMediaType : null,
    typeUri: f.typeUri,
    contentHash: typeof f.facts.fileContentHash === "string" ? f.facts.fileContentHash : null,
    byteSize: typeof f.facts.fileByteSize === "number" ? f.facts.fileByteSize : null,
    folderPaths: Array.isArray(f.facts.fileFolderPath) ? f.facts.fileFolderPath : [],
    tags: Array.isArray(f.facts.fileTag) ? f.facts.fileTag : [],
    storedWith: typeof f.facts.fileStoredWith === "string" ? f.facts.fileStoredWith : null,
    updatedAt: f.updatedAt,
    ended: f.endedSeq !== null,
    ...(core.o.transcodedFromInListing ? { transcodedFrom: entityUriOf(f.facts.transcodedFrom) } : {}),
  }));
  return json(200, { vault: target.id, scannedVaults: [target.id], count: hits.length, files });
}
