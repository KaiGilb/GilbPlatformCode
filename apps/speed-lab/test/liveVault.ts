// A STATEFUL fake vault for the write tests: the only thing faked is the network. Answers carry the real shapes (see liveFixtures.ts).
//   POST   /lws/vault/<v>/c   201 + Location + ETag + { "@id" }; an Idempotency-Key replays (Idempotent-Replayed: true), a different request with the key is 422
//                             (GilbPlatform src/lws/routes.ts:849-870, :274-297 answerFromStored)
//   PATCH  /lws/r/<id>        If-Match compared with the ETag, 412 on a mismatch (src/lws/routes.ts:966-1013); body keys are WRITE keys (a:name)
//   DELETE /lws/r/<id>        204; the record is ended: it then READS as 200 with a:entityLifecycleState "ended" and no body (src/lws/resource-frame.ts:36-38) (src/lws/routes.ts:1015-1075)
//   GET    /lws/r/<id>        the document with READ keys (name) and an ETag
//   GET    …/records          what completeCopy reads, and lifecycle=ended
import { ID_ORIGIN, OTHER_VAULT, PLATFORM, VAULT, VAULT_ORIGIN, reachBody, recordDoc, recordEndedDoc, recordRow, vaultNode } from "./liveFixtures";

interface Row { id: string; name: string; description: string; v: number; seq: number; ended: boolean }
export interface VaultOptions {
  reach?: ReturnType<typeof reachBody>;
  /** From the Nth NEW create on, answer 500 at once. */
  failCreatesFrom?: number;
  /** Accept a PATCH but change nothing (a write stored under a key the read does not return). */
  ignorePatch?: boolean;
  /** After each GET /lws/r/<id> answers, move that record's version (someone else wrote). */
  versionMovesAfterRead?: boolean;
  /** How an ended record reads: the real shape (200 with the lifecycle mark and no body, the default) or a 404. */
  endedAs?: "200" | "404";
  /** Records requests after the Nth never answer (a list whose first page came and the rest did not). */
  stallRecordsAfter?: number;
}
export interface Call { method: string; url: string; headers: Headers; body: string | undefined }

export function fakeVault(opts: VaultOptions = {}) {
  const rows = new Map<string, Row>();
  let seq = 0;
  let minted = 0;
  const add = (id: string, name: string, description: string) => { rows.set(id, { id, name, description, v: 1, seq: ++seq, ended: false }); };
  add("k1", "Kanari fugler", "existing");
  add("k2", "Test it 2", "existing");
  add("k3", "Test it", "existing");
  const calls: Call[] = [];
  const signIn: string[] = [];
  const keys = new Map<string, { digest: string; id: string }>();
  const stats = { recordsSeen: 0, inflight: 0, peak: 0, replays: 0, newCreates: 0, createAttempts: 0 };
  const reach = opts.reach ?? reachBody([vaultNode(VAULT, "ann"), vaultNode(OTHER_VAULT, "zoe")]);
  const etagOf = (r: Row) => `"v${r.v}"`;
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  const page = (list: Row[], extra: Record<string, unknown> = {}) => ({
    "@context": "https://platform.example.test/lws/context", total: list.length, totalItemsKind: "exact", returnedRecords: list.length, complete: true, pageSize: 200, offset: 0,
    records: list.map((r) => recordRow(r.id, r.name, r.description, etagOf(r), r.ended)), types: [], vault: VAULT, scannedVaults: [VAULT], ...extra,
  });
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const inner = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ method, url, headers, body });
    const u = new URL(url);
    if (u.pathname === "/lws/vaults") return json(200, reach);

    let m = /^\/lws\/vault\/[^/]+\/records$/.exec(u.pathname);
    if (m && method === "GET") {
      if (opts.stallRecordsAfter !== undefined && ++stats.recordsSeen > opts.stallRecordsAfter) return new Promise<Response>(() => undefined);
      const q = u.searchParams;
      if (q.get("lifecycle") === "ended") return json(200, page([...rows.values()].filter((r) => r.ended)));
      const live = [...rows.values()].filter((r) => !r.ended);
      const since = q.get("since");
      if (since === "head") return json(200, page([], { nextCursor: `c${seq}` }));
      if (since) { const from = Number(since.slice(1)); return json(200, page(live.filter((r) => r.seq > from).sort((a, b) => a.seq - b.seq), { nextCursor: `c${seq}` })); }
      const ordered = live.sort((a, b) => b.seq - a.seq);
      const limit = Number(q.get("limit") ?? 100);
      const start = q.get("after") ? Number(q.get("after")!.slice(1)) : 0;
      const slice = ordered.slice(start, start + limit);
      const end = start + slice.length;
      const complete = end >= ordered.length;
      return json(200, page(slice, { complete, ...(complete ? {} : { nextCursor: `o${end}` }), nextOffset: end }));
    }

    m = /^\/lws\/vault\/[^/]+\/c$/.exec(u.pathname);
    if (m && method === "POST") {
      stats.createAttempts += 1;
      const payload = JSON.parse(body ?? "{}") as { type?: string; facts?: Record<string, string> };
      const key = headers.get("idempotency-key");
      const digest = `${headers.get("slug") ?? ""}|${body}`;
      if (key && keys.has(key)) {
        const known = keys.get(key)!;
        if (known.digest !== digest) return json(422, { error: "IdempotencyKeyReused", message: "This Idempotency-Key was already used for a different request. Nothing was created." });
        stats.replays += 1;
        const r = rows.get(known.id)!;
        return json(201, { "@id": `${VAULT_ORIGIN}/lws/r/${known.id}` }, { location: `${VAULT_ORIGIN}/lws/r/${known.id}`, etag: etagOf(r), "idempotent-replayed": "true" });
      }
      stats.newCreates += 1;
      if (opts.failCreatesFrom !== undefined && stats.newCreates >= opts.failCreatesFrom) return json(500, { error: "Internal", message: "the vault is busy" });
      stats.inflight += 1; stats.peak = Math.max(stats.peak, stats.inflight);
      await sleep(4);
      stats.inflight -= 1;
      const id = `m${++minted}`;
      add(id, String(payload.facts?.["a:name"] ?? ""), String(payload.facts?.["a:description"] ?? ""));
      if (key) keys.set(key, { digest, id });
      return json(201, { "@id": `${VAULT_ORIGIN}/lws/r/${id}` }, { location: `${VAULT_ORIGIN}/lws/r/${id}`, etag: etagOf(rows.get(id)!) });
    }

    m = /^\/lws\/r\/([^/]+)$/.exec(u.pathname);
    if (m) {
      const r = rows.get(decodeURIComponent(m[1]!));
      if (!r) return json(404, { error: "NotFound" });
      if (r.ended && method === "GET") {
        if (opts.endedAs === "404") return json(404, { error: "NotFound" });
        return json(200, recordEndedDoc(r.id), { etag: etagOf(r) });
      }
      if (r.ended) return json(404, { error: "NotFound" });
      if (method === "GET") {
        const res = json(200, recordDoc(r.id, r.name, r.description), { etag: etagOf(r) });
        if (opts.versionMovesAfterRead) r.v += 1;
        return res;
      }
      if (method === "PATCH") {
        const ifMatch = headers.get("if-match");
        if (ifMatch && ifMatch !== etagOf(r)) return json(412, { error: "PreconditionFailed", message: "The record changed." });
        const patch = JSON.parse(body ?? "{}") as Record<string, string>;
        if (!opts.ignorePatch && typeof patch["a:name"] === "string") { r.name = patch["a:name"]; r.v += 1; r.seq = ++seq; }
        return json(200, { "@id": `${VAULT_ORIGIN}/lws/r/${r.id}` }, { etag: etagOf(r) });
      }
      if (method === "DELETE") {
        const ifMatch = headers.get("if-match");
        if (ifMatch && ifMatch !== etagOf(r)) return json(412, { error: "PreconditionFailed", message: "The record changed." });
        r.ended = true; r.seq = ++seq;
        return json(204, null);
      }
    }
    return json(404, { error: "no_such_route", url, platform: PLATFORM, id: ID_ORIGIN });
  };

  return {
    inner: inner as never,
    transport: (async (url: string) => { signIn.push(url); return { status: 200, json: async () => ({}) }; }) as never,
    rows, calls, stats,
    get urls(): string[] { return calls.map((c) => c.url); },
    get signInUrls(): string[] { return signIn; },
    records: () => calls.filter((c) => /\/records(\?|$)/.test(c.url)).map((c) => c.url),
    live: () => [...rows.values()].filter((r) => !r.ended),
    writes: () => calls.filter((c) => c.method !== "GET"),
    add,
  };
}
