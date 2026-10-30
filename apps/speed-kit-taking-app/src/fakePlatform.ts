// STAND-IN, this batch only: a vault platform in memory. It answers the routes the app uses and nothing more:
//   GET   /lws/vault/<vault segment>/records?...   in the shape record-sync's completeCopy reads (type CatalogEntry)
//   PATCH /lws/vault/<vault segment>/records/<id>  one entry's `name` (the route form is this stand-in's own; the real platform's write differs)
// Any query parameter completeCopy does not send answers 400, so a mismatch is loud.
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { proof } from "./proof";

export const TYPE = "t:CatalogEntry";
export const PEOPLE = {
  ann: { label: "Ann", vault: "https://ann.example.test/vault", origin: "https://ann.example.test", count: 30 },
  ben: { label: "Ben", vault: "https://ben.example.test/vault", origin: "https://ben.example.test", count: 5 },
} as const;
export type PersonKey = keyof typeof PEOPLE;

interface Stored { id: string; name: string; description: string; seq: number; updatedAt: string }
interface VaultState { entries: Stored[]; seq: number }
const ACCEPTED = ["type", "since", "after", "include", "limit"] as const;

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createFakePlatform(options: { latencyMs?: () => number } = {}) {
  const vaults = new Map<string, VaultState>();
  const holds = new Map<string, Promise<void>>();
  let answeredRecords = 0;
  const api = {
    latencyMs: options.latencyMs ?? (() => 600),
    patchFailure: null as { status: number; message: string } | null,
    /** The count of records requests the stand-in has ANSWERED (the window counter counts those it RECEIVED). */
    answered: () => answeredRecords,
  };

  const seed = (): void => {
    for (const p of Object.values(PEOPLE)) {
      const entries: Stored[] = [];
      for (let n = 1; n <= p.count; n++) {
        // Entry 1 is the newest, so the list is served "Ann entry 1" first.
        entries.push({ id: `e${n}`, name: `${p.label} entry ${n}`, description: `${p.label}'s description ${n}`, seq: p.count - n + 1, updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, p.count - n)).toISOString() });
      }
      vaults.set(p.vault, { entries, seq: p.count });
    }
  };
  seed();

  const rowOf = (vault: string, e: Stored) => ({
    entity: `${vault}/e/${e.id}`,
    typeUri: TYPE,
    label: e.name,
    updatedAt: e.updatedAt,
    body: { "@type": TYPE, name: e.name, description: e.description },
    etag: `"${e.seq}"`,
  });

  function records(vault: string, q: URLSearchParams): Response {
    const state = vaults.get(vault);
    if (!state) return json(404, { error: "vault_not_found" });
    for (const k of new Set(q.keys())) if (!(ACCEPTED as readonly string[]).includes(k)) return json(400, { error: "unsupported_parameter", message: `the stand-in does not take ${k}=`, accepted: ACCEPTED });
    const type = (q.get("type") ?? "").replace(/^t:/, "");
    const typed = type === "CatalogEntry" ? state.entries : [];
    const head = `p${state.seq}`;
    const since = q.get("since");
    const after = q.get("after");
    const limit = Math.max(1, Math.min(200, Number(q.get("limit") ?? 100) || 100));
    const bodies = q.get("include") === "body";
    const row = (e: Stored) => { const r = rowOf(vault, e); if (!bodies) { const { body: _b, etag: _e, ...rest } = r; return rest; } return r; };
    if (since === "head") return json(200, { records: [], complete: true, nextCursor: head });
    if (since !== null) {
      const from = since === "start" ? 0 : /^p(\d+)$/.exec(since) ? Number(since.slice(1)) : NaN;
      if (Number.isNaN(from) || from > state.seq) return json(400, { error: "since_cursor_invalid", message: "unknown position" });
      const changed = typed.filter((e) => e.seq > from).sort((a, b) => a.seq - b.seq);
      const page = changed.slice(0, limit);
      const more = changed.length > page.length;
      return json(200, { records: page.map(row), complete: !more, nextCursor: more ? `p${page[page.length - 1]!.seq}` : head });
    }
    const newestFirst = [...typed].sort((a, b) => b.seq - a.seq);
    let start = 0;
    if (after !== null) {
      const m = /^c(\d+)$/.exec(after);
      if (!m) return json(400, { error: "after_invalid", message: "unknown bookmark" });
      start = Number(m[1]);
    }
    const page = newestFirst.slice(start, start + limit);
    const end = start + page.length;
    const complete = end >= newestFirst.length;
    return json(200, { records: page.map(row), complete, ...(complete ? {} : { nextCursor: `c${end}`, nextOffset: end }) });
  }

  function patch(vault: string, id: string, body: unknown): Response {
    if (api.patchFailure) return json(api.patchFailure.status, { error: "stand_in_failure", message: api.patchFailure.message });
    const state = vaults.get(vault);
    const e = state?.entries.find((x) => x.id === id);
    const name = (body as { name?: unknown } | null)?.name;
    if (!state || !e) return json(404, { error: "not_found" });
    if (typeof name !== "string" || name.trim() === "") return json(400, { error: "bad_name", message: "a name is needed" });
    e.name = name;
    e.seq = ++state.seq;
    e.updatedAt = new Date().toISOString();
    return json(200, { ok: true, etag: `"${e.seq}"` });
  }

  /** A client for one person's vault: its origin is the vault's own host. */
  function client(vault: string): PlatformClient {
    return {
      origin: new URL(vault).origin,
      fetch: async (url, init) => {
        const u = new URL(url);
        const method = init?.method ?? "GET";
        const m = /^\/lws\/vault\/([^/]+)\/records(?:\/([^/]+))?$/.exec(u.pathname);
        const route = m && method === "GET" && !m[2] ? "records" : m && method === "PATCH" && m[2] ? "patch" : "other";
        proof.requests[route] += 1;
        proof.log.push({ route, method, url });
        const vaultId = m ? decodeURIComponent(m[1]!) : "";
        await holds.get(vaultId);
        await sleep(api.latencyMs());
        if (route === "records") { const r = records(vaultId, u.searchParams); answeredRecords += 1; return r; }
        if (route === "patch") return patch(vaultId, m![2]!, init?.body ? JSON.parse(String(init.body)) : null);
        return json(404, { error: "no_such_route" });
      },
    };
  }

  return Object.assign(api, {
    client,
    /** Holds every records or patch request for that vault until the returned function is called. */
    hold(vault: string): () => void {
      let release!: () => void;
      holds.set(vault, new Promise<void>((r) => { release = () => { holds.delete(vault); r(); }; }));
      return release;
    },
    /** Another device renamed the entry (what a rename elsewhere looks like to this app). */
    renameBehindBack(vault: string, id: string, name: string): void {
      const state = vaults.get(vault)!;
      const e = state.entries.find((x) => x.id === id)!;
      e.name = name; e.seq = ++state.seq; e.updatedAt = new Date().toISOString();
    },
    nameOf: (vault: string, id: string): string | undefined => vaults.get(vault)?.entries.find((x) => x.id === id)?.name,
    reset: seed,
  });
}

function latencyFromUrl(): number {
  const raw = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("latency");
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 600;
}
export const platform = createFakePlatform({ latencyMs: latencyFromUrl });
