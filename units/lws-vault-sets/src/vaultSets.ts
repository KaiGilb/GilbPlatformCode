import { LWS_VAULT_FILES_URL, LWS_VAULT_RECORDS_URL } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { NotSignedInError, bearerHeaderFor, dpopReadAuth, invalidateDpop } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { normalizeTypeUri } from "@kaigilb/gilbplatformcode-record-types";
import { narrowTotal } from "@kaigilb/gilbplatformcode-narrow-total";
import { serverErrorText } from "@kaigilb/gilbplatformcode-lws-records";
import { isNonRecordListEntry, isRelationEntityUri } from "./recordPlane";

// ── LWS vault-targeted reads (vaults / records / files) ─────────────────────────────────────
// /lws/* is the Bearer conformance floor (lwsPrincipal). DPoP is an optional upgrade.
// Apex multi-vault (example.test → Worker → kaizen Host) often 401s DPoP on long encoded
// `/lws/vault/<url-encoded-namespace>/…` paths when htu percent-encoding disagrees.
// Prefer Bearer first (same as reverse-lookup / entity hydrate); fall back to DPoP.

async function lwsReadAuth(method: string, url: string): Promise<Record<string, string>> {
  try {
    const bearer = await bearerHeaderFor(url, method);
    // 🔴 Cycle152 — A CREDENTIAL WE CANNOT FORM IS NOT A CREDENTIAL, SO TAKE THE FALLBACK.
    //
    // Measured: a bridge answering 2xx WITHOUT `access_token` made `getToken()` RESOLVE
    // `undefined`. Because nothing threw, this function composed the literal header
    // `Authorization: Bearer undefined`, the `catch` below never ran, and the documented
    // DPoP fallback sitting right there was never taken. Every vault read then 401'd, and
    // `throwForStatus` mapped that to `NotSignedInError` and invalidated the DPoP token —
    // which was never the credential at fault. The person got a "not signed in" dead end
    // and a re-sign-in that changed nothing, while a working DPoP path was available the
    // whole time. Falling back on a falsy token is what makes the documented fallback real.
    // s7 walk fix F-3: the header is formed by `bearer.ts` `bearerHeaderFor`, the one credential seam. It answers
    // `{}` for a credential we cannot form (the Cycle152 case above) AND for a host outside this build's platform
    // family; the DPoP seam answers `{}` for the second too, so the fallback is correct for both.
    if (!bearer.authorization) return dpopReadAuth(method, url);
    return bearer;
  } catch {
    return dpopReadAuth(method, url);
  }
}

/**
 * C214-SP1 — this app's authenticated fetch for the LWS vault reads, as a platform client's `fetch` (`gilb-stakeholders`
 * `walkRecordPages` / `syncRecordPages`): the same credential as {@link listVaultRecordsPage} (Bearer first, DPoP as the fallback),
 * and one DPoP retry on a 401, as that page does. The answer is returned as it came; the caller decides what a status means.
 *
 * @param url the request URL
 * @param init the request (GET only is used)
 */
export async function lwsReadFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const extra = (init.headers as Record<string, string> | undefined) ?? {};
  const res = await fetch(url, { ...init, method, headers: { ...extra, ...(await lwsReadAuth(method, url)), accept: "application/json" } });
  if (res.status !== 401) return res;
  try {
    return await fetch(url, { ...init, method, headers: { ...extra, ...(await dpopReadAuth(method, url)), accept: "application/json" } });
  } catch {
    return res;
  }
}

/** The `<id>` (trailing opaque segment) of any slashed URI. */
export function idFromUri(uri: string): string {
  const i = uri.lastIndexOf("/");
  return i === -1 ? uri : uri.slice(i + 1);
}

/** Maps a non-ok vault-set response to a typed error. A 401 drops the DPoP token so the next
 * call re-mints off the live Base cookie (a broken proof also surfaces here as a 401). */
async function throwForStatus(res: Response): Promise<never> {
  if (res.status === 401) {
    invalidateDpop();
    throw new NotSignedInError();
  }
  const detail = await res.text().catch(() => "");
  throw new Error(serverErrorText(res.status, detail, "Vault listing failed"));
}

/** One record the vault says exists — the id + what the grid needs to sort and icon it
 * BEFORE its content read resolves. Content still comes from `GET /lws/r/<id>`. */
export interface VaultRecordRef {
  /** The opaque record id (the `<id>` of both `/base/e/<id>` and `/lws/r/<id>`). */
  id: string;
  /** The record's entity URI (`https://<host>/base/e/<id>`) — the form
   * `a:fileStoredWith` uses, so an attachment matches its record without a lookup. */
  entityUri: string;
  /** The declared BaseVeda Type, NORMALIZED to the one absolute form the type registry
   * resolves by. The vault's own spelling is host-free (`t:Task`) once its ingest notation
   * normalizer has run; passing that through verbatim makes `resolveType()` return null.
   * See `normalizeTypeUri` in recordTypes.ts for the full account. */
  typeUri: string;
  /** Epoch ms of the vault's own last write to this record — the grid's recency order,
   * so ordering survives a change of browser. */
  updatedAt: number;
  /** Display label from the list door (`a:label` / title / name). Grid paints this
   * ⛔ without F-OPEN of the body (geo MULTIPOLYGON is 1–2 MB per row). */
  label?: string | null;
  /** Who ended this node. Present only on the ended list. */
  endingActorKind?: "holder" | "agent";
  /**
   * Cycle214 M3c — the record's whole document, exactly as `GET /lws/r/<id>` serves it to this caller. Present only when the page
   * was asked with `includeBody` (`?include=body`, GilbPlatform VDT 119 S5a). The stakeholder list reads the link (`a:sameAs`) from
   * it, so a page of 20 records costs 1 request instead of 1 + 20.
   */
  body?: Record<string, unknown>;
  /** Cycle214 M3f r5 — with `includeBody` only: the ETag `GET /lws/r/<id>` sends for this record (VDT 119 S5a). */
  etag?: string;
}

interface RecordsWire {
  total?: number;
  complete?: boolean;
  pageSize?: number;
  offset?: number;
  returnedRecords?: number;
  /** Only with `?include=body`: where the next page starts (the door may stop a page early at its byte budget). */
  nextOffset?: number | null;
  records?: {
    entity: string;
    typeUri: string;
    updatedAt: string | null;
    label?: string | null;
    endingActorKind?: "holder" | "agent";
    body?: Record<string, unknown>;
    etag?: string;
  }[];
  types?: { typeUri: string; count: number }[];
}

/** One page of the vault's record set — membership + paging metadata for infinite scroll. */
export interface VaultRecordsPage {
  records: VaultRecordRef[];
  /** True authorized count (not just this page). */
  total: number;
  /** True when this page is the last (offset + returned ≥ total). */
  complete: boolean;
  pageSize: number;
  /** 0-based offset this page was served for. */
  offset: number;
  /** Types used in the authorized set (not the recency page). Absent on older Base. */
  types?: { typeUri: string; count: number }[];
  /**
   * s7 walk fix F-2 — HOW MANY ROWS THE DOOR SENT for this page, before this function's register filter
   * (`isNonRecordListEntry`) dropped the ones that are not records (field claims, relations, control-plane rows).
   * The door's own offset counts THESE rows, so a reader that pages by `offset` must advance by this, ⛔ not by
   * `records.length`: a page of 20 field claims keeps 0 rows and the next page is still at offset 20, ⛔ not at 0
   * and ⛔ not "the end". Absent on a page a test or an older caller built by hand: then `records.length` stands.
   */
  served?: number;
  /**
   * Cycle214 M3c — only on a page asked with `includeBody`: the offset the door names for the next page (`nextOffset`), or null
   * when it names none. ⚠ With bodies the door may end a page early at its byte budget, so this, ⛔ not `offset + pageSize`, is
   * where the next page starts.
   */
  nextOffset?: number | null;
}

/** The NAMED vault's answer to "which records may I read?" — recent-first.
 *
 * `podId` is the vault NAMESPACE (`ReachableVault.vaultId`) and is REQUIRED — it becomes the path
 * segment Base resolves the read against. There is no default and none is invented here.
 *
 * `typeNames`:
 * - **empty / omitted** → type-agnostic list (all types used in the vault except File/Vault).
 *   ⛔ Not F-LIVE. Cycle165 C1: the grid/graph caller (`hydrateRecordsPage`) no longer
 *   passes `[]` — it F-CATs then F-LIVEs named types on `?type=`.
 * - **non-empty** bare BaseVeda CURIE-names (`NoteDocument`, `Person`, …) → faceted F-LIVE.
 *   An unknown name is simply absent from the answer, never an error.
 *
 * `offset` is the 0-based page start (default 0). Base returns at most `pageSize` rows;
 * when `complete` is false the client should request `offset + pageSize` for the next page.
 */
export async function listVaultRecordsPage(
  vaultId: string,
  typeNames: readonly string[] = [],
  offset = 0,
  opts: {
    includePresentationState?: boolean;
    lifecycle?: FileLifecycle;
    /**
     * Cycle214 GAPP214.26 — keep a relation-addressed row whose type this says was ASKED FOR.
     * The register filter below drops a row the app's relation test recognises
     * (`isRelationEntityUri`, recordPlane.ts), which is right for a list nobody narrowed. A person
     * who chose a relation kind (a role is a stakeholder) asked for exactly those rows. Measured on
     * the scratch rig (GilbPlatform `556c42c9`, 2026-09-30T12:43Z): the platform returned the three
     * seeded role records of a `/base/r/` vault, and this filter dropped all three.
     * ⚠ That relation test reads `/base/r/` only. A row addressed `/vault/r/` is not recognised as a
     * relation, so the relation-address arm keeps it with or without this rule, and this rule
     * decides nothing for it. The filter's type-name arms still apply: a `/vault/r/` `PartOf` link,
     * for example, is dropped by name. That gap predates this step (GilbPlatform's `records.ts`
     * reads both segments) and is carried, with the other sites that share the test, by the vault
     * finding FINDING-2026-09-30-AppRelationTestReadsBaseSegmentOnly-GilbApp.
     * ⛔ Only `hydrateRecordsPage` sets it, and only with a choice of types. The type-name arms of
     * the filter still apply to an admitted row.
     */
    admitRelationRow?: (typeUri: string) => boolean;
    /**
     * Cycle214 M3c — ask for each record's whole document on the page (`?include=body`), as `GET /lws/r/<id>` serves it. Used by the
     * stakeholder list, which needs every record's link and would otherwise read each record on the page once more.
     */
    includeBody?: boolean;
    /** Cycle214 M3c — the most rows the page may carry (`?limit=`). The door honours it ONLY with `includeBody`, and caps it at 100 (200 when `filter` is also sent). */
    limit?: number;
    /**
     * GilbPlatform `?filter=<attribute>=<value>` (BASE-DEVELOPER-GUIDE, "Filtered newest page"): only the records of the ONE
     * type asked for that hold this attribute value, newest first. The value is the RAW `attr=value` text (a link is
     * `a:partOf={"@id":"https://…"}`); it is URL-encoded once, as a whole, here. The door refuses it unless the request has exactly
     * one `type=` and `include=body` (400 filter_requires_*), so this is honoured ONLY with `includeBody`.
     */
    filter?: string;
  } = {},
): Promise<VaultRecordsPage> {
  const params = new URLSearchParams();
  for (const t of typeNames) params.append("type", t);
  if (offset > 0) params.set("offset", String(offset));
  if (opts.lifecycle === "ended") params.set("lifecycle", "ended");
  // `limit` is sent only with `include=body`: without it the door ignores `limit` and serves its own page size.
  if (opts.includeBody) {
    params.set("include", "body");
    if (opts.limit !== undefined && opts.limit > 0) params.set("limit", String(Math.floor(opts.limit)));
    if (opts.filter) params.set("filter", opts.filter);
  }
  const qs = params.toString();
  const url = qs ? `${LWS_VAULT_RECORDS_URL(vaultId)}?${qs}` : LWS_VAULT_RECORDS_URL(vaultId);
  // C214-SP1 r2 (Agent.Scaling N2): the one sign-in-then-retry read (Bearer, then DPoP once on a 401), ⛔ not a copy of it.
  const res = await lwsReadFetch(url);
  if (!res.ok) await throwForStatus(res);
  const body = (await res.json()) as RecordsWire;
  // Defense-in-depth: never surface control-plane or reified relations as grid/graph rows.
  // filectl:FileContent remints; /base/r/* PartOf/Reference/… relations mint on every graph
  // link and were flooding the register as Untitled. Base filters too; this covers older
  // Base builds and any leak path.
  // ⚠ `includePresentationState` EXISTS FOR ONE CALLER AND IS NOT A CONVENIENCE.
  // `isNonRecordListEntry` deliberately hides UI-preferences rows — they are presentation
  // state, not user content, and the register must never show them. But that makes this
  // function BLIND to them: `listVaultRecordsPage(vault, ["AppUiPreferences"])` returns an
  // EMPTY page against a vault holding 22 of them (measured on monalisatest.example.test,
  // 2026-08-21). A writer that asks "does a prefs row already exist?" through the register
  // predicate is told "no" every time and mints a duplicate — which is exactly the defect
  // `uiPrefs.saveUiPrefsToVault` had. The flag turns the REGISTER filter off so an OWNER of
  // the plane can enumerate its own rows. ⛔ Do not set it from a register/grid/graph
  // surface; those consumers are the reason the filter exists.
  const records = (body.records ?? [])
    .filter((r) => {
      if (opts.includePresentationState) return true;
      const admitted = isRelationEntityUri(r.entity) && opts.admitRelationRow?.(r.typeUri) === true;
      // An admitted row skips the relation-ADDRESS arm only: passing no address leaves the
      // type-name arms (control plane, non-record names, UI preferences) in force.
      return !isNonRecordListEntry(admitted ? null : r.entity, r.typeUri);
    })
    .map((r) => ({
      id: idFromUri(r.entity),
      entityUri: r.entity,
      // Normalized at the BOUNDARY, so exactly one spelling of a type ever enters the app
      // (RecordGrid's distinct-type count would double-count a mixed set otherwise).
      typeUri: normalizeTypeUri(r.typeUri),
      // A vault with no timestamp for a row sorts last rather than jumping to "now".
      updatedAt: r.updatedAt === null || r.updatedAt === undefined ? 0 : Date.parse(r.updatedAt),
      label: typeof r.label === "string" && r.label.trim() !== "" ? r.label : null,
      ...(r.endingActorKind === "holder" || r.endingActorKind === "agent"
        ? { endingActorKind: r.endingActorKind }
        : {}),
      ...(opts.includeBody && r.body && typeof r.body === "object" && !Array.isArray(r.body) ? { body: r.body } : {}),
      ...(opts.includeBody && typeof r.etag === "string" ? { etag: r.etag } : {}),
    }));
  // Prefer filtered length for this page when server still counts non-records.
  // Single-sourced in `recordPlane.narrowTotal` (Cycle060) — `seen` is rows the SERVER SENT, so a
  // row this client failed to keep is deducted whatever the reason. See that function's own note
  // on the page-vs-whole-result limitation this shares.
  const total = narrowTotal(
    typeof body.total === "number" ? body.total : undefined,
    body.records?.length ?? 0,
    records.length,
  );
  const pageSize = typeof body.pageSize === "number" ? body.pageSize : Math.max(records.length, 1);
  const pageOffset = typeof body.offset === "number" ? body.offset : offset;
  const complete =
    typeof body.complete === "boolean" ? body.complete : pageOffset + records.length >= total;
  const types = Array.isArray(body.types)
    ? body.types
        .filter(
          (t): t is { typeUri: string; count: number } =>
            !!t &&
            typeof t.typeUri === "string" &&
            t.typeUri.length > 0 &&
            typeof t.count === "number",
        )
        .map((t) => ({ typeUri: normalizeTypeUri(t.typeUri), count: t.count }))
    : undefined;
  return {
    records,
    total,
    complete,
    pageSize,
    offset: pageOffset,
    types,
    served: body.records?.length ?? 0,
    ...(opts.includeBody ? { nextOffset: typeof body.nextOffset === "number" ? body.nextOffset : null } : {}),
  };
}

/** The lifecycle population to list. `live` is the default everywhere; `ended` is the
 * trashcan (P2.2 — Kai's original 2026-07-19 request). WIRE-ONLY grammar. */
export type FileLifecycle = "live" | "ended" | "all";

/** One file the vault says exists — metadata only; the bytes are `GET /files/<id>`. */
export interface VaultFileRef {
  /** The file ENTITY id — the handle for `GET`/`DELETE /files/<id>`. */
  id: string;
  /** The file's entity URI. */
  entityUri: string;
  /** The stored display name (`a:fileName`); null when the vault holds none. */
  name: string | null;
  /** The stored media type (`a:fileMediaType`). */
  mediaType: string | null;
  /** entity_state.type_uri (`t:File`, `t:TypePicture`, …). MIME is mediaType. Absent on older browse payloads. */
  typeUri?: string | null;
  /** The committed byte size. */
  byteSize: number | null;
  /** The record this file is stored WITH (that record's `/base/e/<id>` URI), or null for
   * a STANDALONE file. This one field is what makes both "this record's attachments" and
   * "the standalone file register" vault answers instead of local-index answers. */
  storedWith: string | null;
  /** True when the vault marks this file ENDED. Always false under the `live` default —
   * an ended file can never be rendered as live by accident. */
  ended: boolean;
  /** Epoch ms of the VAULT's own last write to this file (max tx_from over its live facts).
   * The list's recency order therefore reads the same in any browser — an upload time
   * remembered on the device would be a device-local answer wearing a vault answer's
   * clothes. 0 when the vault holds none, so such a row sorts last rather than to "now". */
  updatedAt: number;
}

interface FilesWire {
  count?: number;
  files?: {
    entity: string;
    fileName: string | null;
    mediaType: string | null;
    typeUri?: string | null;
    byteSize: number | null;
    storedWith: string | null;
    ended: boolean;
    updatedAt: string | null;
  }[];
}

/** The NAMED vault's answer to "which files may I read?" — the whole authorized file set for
 * the requested lifecycle scope, in that vault's own stable browse order. `podId` is the vault
 * NAMESPACE and is REQUIRED (see the module header).
 *
 * THREE paged asks, ⛔ not one download partitioned in the browser:
 *   - a record's attachments  → `?storedWith=<recordUri>`
 *   - the file register       → `?unattached=true`
 *   - the trashcan            → `lifecycle=ended`
 * Client-side partition of the whole vault is how 11,822 Books files became a 60-request open.
 */
/**
 * SpeedGate page size ([[3P.V.Interaction.PageLatency.Base]] N, default 20).
 * Kai 2026-09-08: 36k files is nothing if open is a page; concatenating pages
 * until the vault is in the browser is the defect Cycle161 shipped as a "fix".
 */
export const OPEN_PAGE_SIZE = 20;

export type FileListFilter = {
  lifecycle?: FileLifecycle;
  /**
   * `null` = standalone register (`?unattached=true`).
   * A URI = that record's attachments (`?storedWith=`).
   * Omitted = every file (the Files view).
   */
  storedWith?: string | null;
};

export interface VaultFilesPage {
  files: VaultFileRef[];
  total: number;
  complete: boolean;
  pageSize: number;
  offset: number;
}

function mapWireFile(f: NonNullable<FilesWire["files"]>[number]): VaultFileRef {
  return {
    id: idFromUri(f.entity),
    entityUri: f.entity,
    name: f.fileName,
    mediaType: f.mediaType,
    typeUri: f.typeUri ?? null,
    byteSize: f.byteSize,
    storedWith: f.storedWith ?? null,
    ended: f.ended === true,
    updatedAt: f.updatedAt ? Date.parse(f.updatedAt) : 0,
  };
}

/**
 * ONE page of the named vault's files. The open path. Scroll asks `offset + pageSize`.
 * ⛔ Never concatenate pages here — that is what made 11,822 Books files a 60-request open.
 */
export async function listVaultFilesPage(
  vaultId: string,
  offset = 0,
  opts: FileListFilter = {},
): Promise<VaultFilesPage> {
  const lifecycle = opts.lifecycle ?? "live";
  const params = new URLSearchParams();
  if (lifecycle !== "live") params.set("lifecycle", lifecycle);
  params.set("limit", String(OPEN_PAGE_SIZE));
  if (offset > 0) params.set("offset", String(offset));
  if (opts.storedWith === null) params.set("unattached", "true");
  else if (typeof opts.storedWith === "string" && opts.storedWith.length > 0) {
    params.set("storedWith", opts.storedWith);
  }
  const qs = params.toString();
  const url = `${LWS_VAULT_FILES_URL(vaultId)}${qs ? `?${qs}` : ""}`;
  // C214-SP1 r2 (Agent.Scaling N2): the one sign-in-then-retry read (Bearer, then DPoP once on a 401), ⛔ not a copy of it.
  const res = await lwsReadFetch(url);
  if (!res.ok) await throwForStatus(res);
  const body = (await res.json()) as FilesWire;
  const files = (body.files ?? []).map(mapWireFile);
  const total = typeof body.count === "number" ? body.count : files.length;
  const pageSize = OPEN_PAGE_SIZE;
  const complete =
    files.length < pageSize || (typeof body.count === "number" && offset + files.length >= body.count);
  return { files, total, complete, pageSize, offset };
}

/**
 * ⛔ NOT the open path. Returns the FIRST page only. Callers that used this to
 * download a vault must switch to {@link listVaultFilesPage} + scroll.
 */
export async function listVaultFiles(vaultId: string, lifecycle: FileLifecycle = "live"): Promise<VaultFileRef[]> {
  const page = await listVaultFilesPage(vaultId, 0, { lifecycle });
  return page.files;
}
