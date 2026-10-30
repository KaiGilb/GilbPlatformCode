// The ONLY file of live mode that sends a write (PATCH, POST or DELETE), and every one goes through `send`, which asks `gate` first.
// Routes, headers and bodies are the proven pattern of records-app (lws-records: patchRecord, createRecord, deleteRecord) and the server's
// (GilbPlatform src/lws/routes.ts): PATCH /lws/r/<id>, POST /lws/vault/<vault>/c, DELETE /lws/r/<id>.
import type { TermFetch } from "@kaigilb/gilbplatformcode-platform-fetch";
import { TYPE } from "../catalog";

export const NAME_PREFIX = "speedkit-proof ";
export const DESCRIPTION = "Test entry made by speed-kit-taking-app; safe to end.";
export const SEED_COUNTS = [10, 50, 200, 500] as const;
/** RuleBasespeedBoundedFanOut: never more than this many writes in flight. */
export const MAX_IN_FLIGHT = 4;

/** A write that was refused before any request was sent. */
export class WriteRefused extends Error {
  constructor(why: string) { super(why); this.name = "WriteRefused"; }
}
/** The platform answered a write with a status that is not a success. */
export class WriteFailed extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = "WriteFailed"; this.status = status; }
}

const text = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return text(v[0]);
  if (v && typeof v === "object" && typeof (v as { "@value"?: unknown })["@value"] === "string") return (v as { "@value": string })["@value"];
  return "";
};
const idFromLocation = (url: string): string => {
  const i = url.indexOf("/lws/r/");
  return i === -1 ? url : url.slice(i + "/lws/r/".length);
};
async function reasonOf(res: Response): Promise<string> {
  try { const b = (await res.json()) as { message?: unknown; error?: unknown }; return String(b.message ?? b.error ?? "no reason given"); } catch { return "no reason given"; }
}

export interface Entity { id: string; name: string; description: string; etag: string | null }

export function createWriter(o: { fetch: TermFetch; vault: string; allow: boolean }) {
  const origin = new URL(o.vault).origin;
  const segment = encodeURIComponent(o.vault);

  /** The one gate. Every request of this file passes it: a write only when allowed, and every request only at the pinned vault's origin. */
  function gate(method: string, url: string): void {
    let u: URL;
    try { u = new URL(url); } catch { throw new WriteRefused(`not an address: ${url}`); }
    if (u.origin !== origin) throw new WriteRefused(`${method} ${u.origin} is not the pinned vault's origin ${origin}`);
    if (method !== "GET" && !o.allow) throw new WriteRefused("writes are off in this run (start it with --allow-write)");
  }
  async function send(method: string, url: string, init: { headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
    gate(method, url);
    return o.fetch(url, { method, ...init });
  }

  const resource = (id: string) => `${origin}/lws/r/${encodeURIComponent(id)}`;

  return {
    gate,
    send,
    /** GET /lws/r/<id>: the record as served (read keys), with its ETag; null when it is not live. */
    async read(id: string): Promise<Entity | null> {
      const res = await send("GET", resource(id), { headers: { accept: "application/json" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new WriteFailed(res.status, `read ${res.status}: ${await reasonOf(res)}`);
      const doc = (await res.json()) as Record<string, unknown>;
      return { id, name: text(doc.name ?? doc["a:name"]), description: text(doc.description ?? doc["a:description"]), etag: res.headers.get("etag") };
    },
    /** PATCH /lws/r/<id>, JSON merge patch, `If-Match` = the ETag of the read. The write key is `a:name`. */
    async rename(id: string, name: string, etag: string): Promise<void> {
      const res = await send("PATCH", resource(id), { headers: { "content-type": "application/merge-patch+json", "if-match": etag }, body: JSON.stringify({ "a:name": name }) });
      if (!res.ok) throw new WriteFailed(res.status, `${res.status}: ${await reasonOf(res)}`);
    },
    /** POST /lws/vault/<vault>/c with an `Idempotency-Key`. Answers the new record's id (the same id again on a replay of the same key). */
    async create(key: string, name: string): Promise<string> {
      const res = await send("POST", `${origin}/lws/vault/${segment}/c`, {
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ type: TYPE, facts: { "a:name": name, "a:description": DESCRIPTION } }),
      });
      if (!res.ok) throw new WriteFailed(res.status, `${res.status}: ${await reasonOf(res)}`);
      const location = res.headers.get("location");
      const id = idFromLocation(location ?? text(((await res.json().catch(() => ({}))) as Record<string, unknown>)["@id"]));
      if (!id) throw new WriteFailed(res.status, "the platform named no id for the new record");
      return id;
    },
    /** DELETE /lws/r/<id>, ending ONE record, `If-Match` = the ETag of the fresh read. Never a vault route. */
    async end(id: string, etag: string | null): Promise<void> {
      const res = await send("DELETE", resource(id), { headers: etag ? { "if-match": etag } : {} });
      if (!res.ok && res.status !== 204) throw new WriteFailed(res.status, `${res.status}: ${await reasonOf(res)}`);
    },
    /** Which of `ids` the vault lists as ended: GET …/records?type=…&lifecycle=ended&include=body, paged by `nextOffset`. */
    async endedAmong(ids: readonly string[]): Promise<Set<string>> {
      const want = new Set(ids);
      const found = new Set<string>();
      let offset = 0;
      for (let page = 0; page < 20 && found.size < want.size; page++) {
        const res = await send("GET", `${origin}/lws/vault/${segment}/records?type=${encodeURIComponent(TYPE.replace(/^t:/, ""))}&lifecycle=ended&include=body&limit=200${offset ? `&offset=${offset}` : ""}`);
        if (!res.ok) throw new WriteFailed(res.status, `ended list ${res.status}: ${await reasonOf(res)}`);
        const b = (await res.json()) as { records?: { entity?: string }[]; complete?: boolean; nextOffset?: number };
        for (const r of b.records ?? []) { const id = idFromLocation(String(r.entity ?? "").replace(/^.*\/e\//, "/lws/r/")); if (want.has(id)) found.add(id); }
        if (b.complete !== false || typeof b.nextOffset !== "number") break;
        offset = b.nextOffset;
      }
      return found;
    },
  };
}
export type Writer = ReturnType<typeof createWriter>;
