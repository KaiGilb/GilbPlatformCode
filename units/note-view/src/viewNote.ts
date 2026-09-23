/**
 * Note VIEW unit — read a short user-authored document (title + body).
 *
 * Acts: F-LIVE then F-OPEN. Live doors:
 *   GET /lws/vault/<vaultId>/records?type=NoteDocument  (bare — never t: prefixed)
 *   GET /lws/r/<id>                                     (id from F-LIVE or a stored link)
 *
 * Host, vaultId, and Authorization are injected. This module holds no store,
 * bakes no vault host, and has no write path (no POST / PUT / PATCH / DELETE).
 *
 * Persist set this unit *reads* (BVGATE_01 2026-09-23, reused — no new term):
 * t:NoteDocument + a:title + a:body. a:label is TermLabel, not a document title.
 * List chrome `label` is not the persist title; F-OPEN reads a:title.
 */

export const NOTE_TYPE_PREFIXED = "t:NoteDocument";
export const NOTE_FIND_TYPE_BARE = "NoteDocument";
/** F-LIVE negative control. A populated grid here means the type filter was dropped. */
export const NOTE_SENTINEL_TYPE_BARE = "NoSuchTypeHere";
export const NOTE_TITLE_ATTR = "a:title";
export const NOTE_BODY_ATTR = "a:body";

export type NoteViewDeps = {
  /** Origin of the node that holds the named vault. Injected. Never baked. */
  host: string;
  /** Named vault namespace (path segment). Injected. */
  vaultId: string;
  /** Bearer token, with or without the "Bearer " prefix. Injected. */
  authorization: string;
  /**
   * Optional fetch. Taking apps that need DPoP (or any extra header) inject
   * their own. Default is global fetch. This unit does not mint credentials.
   */
  fetch?: typeof fetch;
};

export type NoteLiveRef = {
  id: string;
  entity: string;
  typeUri: string | null;
  /**
   * Grid chrome from the list page (`label` on the wire). Not a:title.
   * Open the id to read the persist title.
   */
  listLabel: string | null;
};

export type NoteLivePage = {
  records: NoteLiveRef[];
  complete: boolean;
  nextOffset: number | null;
};

export type NoteView = {
  id: string;
  entity: string;
  title: string;
  body: string | null;
};

export class NoteViewError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "NoteViewError";
    this.status = status;
  }
}

/**
 * F-LIVE of bare type NoteDocument on the named vault. First page only
 * (a listing is a page, not the vault; list order is not time).
 *
 * Keep every live row on the page. Empty 200 is a state, not a throw —
 * denied and "none" look the same on this door.
 *
 * @param deps Injected host, vaultId, Authorization (and optional fetch)
 */
export async function findLiveNotes(deps: NoteViewDeps): Promise<NoteLivePage> {
  return findLiveOfType(deps, NOTE_FIND_TYPE_BARE);
}

/**
 * F-LIVE sentinel. Template pair: `?type=NoSuchTypeHere` must return 0 rows,
 * not the unfiltered grid. Not called by {@link findLiveNotes}; taking apps
 * and tests pair it when they need the negative control.
 *
 * @param deps Injected host, vaultId, Authorization
 */
export async function findLiveSentinel(deps: NoteViewDeps): Promise<NoteLivePage> {
  return findLiveOfType(deps, NOTE_SENTINEL_TYPE_BARE);
}

/**
 * F-OPEN a known id. `<ID>` from F-LIVE or a stored `{ "@id" }`.
 * Never a computed address. Reads a:title and a:body. Does not read a:label
 * as the document title.
 *
 * @param deps Injected host, vaultId, Authorization
 * @param id Opaque record id from a prior find or stored link
 */
export async function openNote(deps: NoteViewDeps, id: string): Promise<NoteView> {
  const origin = originOf(deps.host);
  const authorization = bearer(deps.authorization);
  const recordId = required(id, "id");
  const fetchImpl = fetchOf(deps);

  const openUrl = `${origin}/lws/r/${encodeURIComponent(recordId)}`;
  const openRes = await fetchImpl(openUrl, {
    method: "GET",
    headers: { Authorization: authorization, Accept: "application/json" },
  });
  if (!openRes.ok) {
    throw new NoteViewError(
      `F-OPEN of id refused (${openRes.status})`,
      openRes.status,
    );
  }

  const body = await readJson(openRes);
  const entity = entityFromOpen(body, origin, recordId);
  return {
    id: recordId,
    entity,
    title: factText(body, NOTE_TITLE_ATTR) ?? "",
    body: factText(body, NOTE_BODY_ATTR),
  };
}

async function findLiveOfType(
  deps: NoteViewDeps,
  typeBare: string,
): Promise<NoteLivePage> {
  const origin = originOf(deps.host);
  const vaultId = required(deps.vaultId, "vaultId");
  const authorization = bearer(deps.authorization);
  const fetchImpl = fetchOf(deps);

  const liveUrl = `${vaultCollectionUrl(origin, vaultId, "records")}?type=${encodeURIComponent(typeBare)}`;
  const liveRes = await fetchImpl(liveUrl, {
    method: "GET",
    headers: { Authorization: authorization, Accept: "application/json" },
  });
  if (!liveRes.ok) {
    throw new NoteViewError(
      `F-LIVE of ${typeBare} refused (${liveRes.status})`,
      liveRes.status,
    );
  }

  const payload = await readJson(liveRes);
  const rows = recordsArray(payload);
  const complete = payload.complete === true;
  const offset = typeof payload.offset === "number" ? payload.offset : 0;
  const pageSize =
    typeof payload.pageSize === "number" ? payload.pageSize : rows.length;
  const records: NoteLiveRef[] = [];
  for (const row of rows) {
    const ref = liveRefFromRow(row);
    if (ref) records.push(ref);
  }
  return {
    records,
    complete,
    nextOffset: complete ? null : offset + pageSize,
  };
}

function liveRefFromRow(row: unknown): NoteLiveRef | null {
  if (!row || typeof row !== "object") return null;
  const rec = row as Record<string, unknown>;
  const entity =
    typeof rec.entity === "string"
      ? rec.entity
      : typeof rec["@id"] === "string"
        ? rec["@id"]
        : "";
  if (!entity) return null;
  const id = idFromResourceUrl(entity);
  if (!id) return null;
  const typeUri =
    typeof rec.typeUri === "string"
      ? rec.typeUri
      : typeof rec.type === "string"
        ? rec.type
        : null;
  const listLabel = typeof rec.label === "string" ? rec.label : null;
  return { id, entity, typeUri, listLabel };
}

function factText(doc: Record<string, unknown>, attr: string): string | null {
  const fromFacts = factsMap(doc);
  const raw = fromFacts[attr] ?? doc[attr];
  return literalText(raw);
}

function factsMap(doc: Record<string, unknown>): Record<string, unknown> {
  const facts = doc.facts;
  if (facts && typeof facts === "object" && !Array.isArray(facts)) {
    return facts as Record<string, unknown>;
  }
  return {};
}

/**
 * Read an inline-literal. Do not join a `{text}` object to `""` (lossy).
 * Do not treat a:label as a title spelling — callers pass a:title / a:body.
 */
function literalText(raw: unknown): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.text === "string") {
      const trimmed = obj.text.trim();
      return trimmed ? trimmed : null;
    }
    if (typeof obj["@value"] === "string") {
      const trimmed = obj["@value"].trim();
      return trimmed ? trimmed : null;
    }
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const text = literalText(item);
      if (text) return text;
    }
  }
  return null;
}

function entityFromOpen(
  body: Record<string, unknown>,
  origin: string,
  id: string,
): string {
  if (typeof body["@id"] === "string" && body["@id"]) return body["@id"];
  if (typeof body.id === "string" && body.id.includes("/")) return body.id;
  if (typeof body.entity === "string" && body.entity) return body.entity;
  return `${origin}/lws/r/${encodeURIComponent(id)}`;
}

function recordsArray(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await res.json()) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    /* body was not JSON */
  }
  throw new NoteViewError("response was not a JSON object", res.status);
}

function fetchOf(deps: NoteViewDeps): typeof fetch {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new NoteViewError("fetch is not available; inject deps.fetch");
  }
  return fetchImpl;
}

function originOf(host: string): string {
  const raw = required(host, "host");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NoteViewError("host must be an absolute URL (injected origin)");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new NoteViewError("host must be http or https");
  }
  return url.origin;
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new NoteViewError(`${name} is required`);
  return trimmed;
}

function bearer(value: string): string {
  const raw = required(value, "authorization");
  return raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
}

function vaultCollectionUrl(origin: string, vaultId: string, leaf: "records"): string {
  return `${origin}/lws/vault/${encodeURIComponent(vaultId)}/${leaf}`;
}

function idFromResourceUrl(location: string): string {
  try {
    const path = location.includes("://") ? new URL(location).pathname : location;
    const parts = path.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  } catch {
    const parts = location.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  }
}
