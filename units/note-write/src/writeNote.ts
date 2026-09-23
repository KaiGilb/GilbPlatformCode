/**
 * Note WRITE unit — persist a short user-authored document (title + body).
 *
 * Act: W-MINT. Live door is POST /lws/vault/<vaultId>/c (GilbApp createRecord).
 * Type is prefixed (`t:NoteDocument`). Find-live of the same type uses the other
 * door: GET …/records?type=NoteDocument (bare). Host, vaultId, and Authorization
 * are injected. This module holds no store and bakes no vault host.
 *
 * Persist set (BVGATE_01 2026-09-23): t:NoteDocument + a:title + a:body.
 * a:label is refused for this persist. Dual-write of label is refused.
 */

export const NOTE_WRITE_TYPE_PREFIXED = "t:NoteDocument";
export const NOTE_FIND_TYPE_BARE = "NoteDocument";
export const NOTE_TITLE_ATTR = "a:title";
export const NOTE_BODY_ATTR = "a:body";

export type NoteWriteDeps = {
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

export type NoteWriteInput = {
  title: string;
  /** Omitted when empty. Title is required for a named note. */
  body?: string;
};

export type NoteWriteResult = {
  id: string;
  location: string;
};

export class NoteWriteError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "NoteWriteError";
    this.status = status;
  }
}

/**
 * Mint a NoteDocument on the named vault (W-MINT), then pair:
 * F-OPEN of the minted id, and F-LIVE of bare type NoteDocument.
 *
 * @param deps Injected host, vaultId, Authorization (and optional fetch)
 * @param input Title (required) and optional body
 * @returns Minted record id and Location
 */
export async function writeNote(
  deps: NoteWriteDeps,
  input: NoteWriteInput,
): Promise<NoteWriteResult> {
  const origin = originOf(deps.host);
  const vaultId = required(deps.vaultId, "vaultId");
  const authorization = bearer(deps.authorization);
  const title = required(input.title, "title");
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new NoteWriteError("fetch is not available; inject deps.fetch");
  }

  const facts: Record<string, string> = { [NOTE_TITLE_ATTR]: title };
  const body = input.body?.trim();
  if (body) facts[NOTE_BODY_ATTR] = body;
  // a:label is refused for this persist. Do not add it here.

  const createUrl = vaultCollectionUrl(origin, vaultId, "c");
  const createRes = await fetchImpl(createUrl, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      type: NOTE_WRITE_TYPE_PREFIXED,
      facts,
    }),
  });
  if (!createRes.ok) {
    throw new NoteWriteError(
      `W-MINT refused (${createRes.status})`,
      createRes.status,
    );
  }

  const location =
    createRes.headers.get("location") ??
    createRes.headers.get("Location") ??
    (await locationFromBody(createRes));
  if (!location) {
    throw new NoteWriteError("W-MINT returned no Location");
  }
  const id = idFromResourceUrl(location);
  if (!id) {
    throw new NoteWriteError(`W-MINT Location had no id: ${location}`);
  }

  // F-OPEN — same resource, order-independent. Path has no vault segment;
  // the opaque id already names its vault.
  const openUrl = `${origin}/lws/r/${encodeURIComponent(id)}`;
  const openRes = await fetchImpl(openUrl, {
    method: "GET",
    headers: { Authorization: authorization, Accept: "application/json" },
  });
  if (!openRes.ok) {
    throw new NoteWriteError(
      `F-OPEN of minted id refused (${openRes.status})`,
      openRes.status,
    );
  }

  // F-LIVE — find door of the pair. Bare type. First page only (list order is not time).
  const liveUrl = `${vaultCollectionUrl(origin, vaultId, "records")}?type=${encodeURIComponent(NOTE_FIND_TYPE_BARE)}`;
  const liveRes = await fetchImpl(liveUrl, {
    method: "GET",
    headers: { Authorization: authorization, Accept: "application/json" },
  });
  if (!liveRes.ok) {
    throw new NoteWriteError(
      `F-LIVE of NoteDocument refused (${liveRes.status})`,
      liveRes.status,
    );
  }

  return { id, location };
}

function originOf(host: string): string {
  const raw = required(host, "host");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new NoteWriteError("host must be an absolute URL (injected origin)");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new NoteWriteError("host must be http or https");
  }
  return url.origin;
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new NoteWriteError(`${name} is required`);
  return trimmed;
}

function bearer(value: string): string {
  const raw = required(value, "authorization");
  return raw.toLowerCase().startsWith("bearer ") ? raw : `Bearer ${raw}`;
}

function vaultCollectionUrl(origin: string, vaultId: string, leaf: "c" | "records"): string {
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

async function locationFromBody(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { "@id"?: unknown; id?: unknown };
    if (typeof body["@id"] === "string" && body["@id"]) return body["@id"];
    if (typeof body.id === "string" && body.id) return body.id;
  } catch {
    /* body was not JSON */
  }
  return null;
}
