// A small fake vault for the level tests: a list of CauseEffectLevel records that answers the typed list (paged), a record read, and a create.
// Not shipped (the package files are `src` only).
import { vi } from "vitest";

export const V = "https://projecttesting.platform.example.test/vault";

export type Level = {
  id: string;
  token: string;
  position: number;
  parent?: string;
  label?: string;
  bodiless?: boolean;
  /** The address the vault lists the row at, when it is not under `V`. */
  entity?: string;
  /** The `@type` the record's own document carries, when it differs from the list's. */
  docType?: string;
};

export function bodyOf(l: Level): Record<string, unknown> {
  return {
    "@id": l.entity ?? `${V}/e/${l.id}`,
    "@type": l.docType ?? "t:CauseEffectLevel",
    "a:unitTag": `Level.${l.token}`,
    "a:label": l.label ?? l.token,
    "a:levelPosition": l.position,
    ...(l.parent ? { "a:partOf": { "@id": `${V}/e/${l.parent}` } } : {}),
  };
}

function listedOf(l: Level) {
  return {
    entity: l.entity ?? `${V}/e/${l.id}`,
    typeUri: "t:CauseEffectLevel",
    updatedAt: "2026-01-01T00:00:00.000Z",
    etag: '"lvl"',
    ...(l.bodiless ? {} : { body: bodyOf(l) }),
  };
}

export interface Vault {
  levels: Level[];
  gets: string[];
  reads: string[];
  /** The most record reads that were out at once. */
  maxInFlight: number;
  posts: { url: string; body: { type: string; facts: Record<string, unknown> }; headers: Record<string, string> }[];
}

/** Installs the fake vault as `fetch`. `pageSize` rows per listed page (default: all); `listFails` makes the typed list answer 500. */
export function installVault(levels: Level[], opts: { pageSize?: number; listFails?: boolean; unreadable?: Set<string>; noLocation?: boolean; holdReads?: Promise<void> } = {}): Vault {
  const vault: Vault = { levels: [...levels], gets: [], reads: [], maxInFlight: 0, posts: [] };
  let inFlight = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    if (method === "GET" && url.includes("type=CauseEffectLevel")) {
      vault.gets.push(url);
      if (opts.listFails) return new Response("", { status: 500 });
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      const size = opts.pageSize ?? Math.max(vault.levels.length, 1);
      const slice = vault.levels.slice(offset, offset + size);
      const end = offset + slice.length;
      return Response.json({
        records: slice.map(listedOf),
        total: vault.levels.length,
        complete: end >= vault.levels.length,
        nextOffset: end >= vault.levels.length ? null : end,
      });
    }
    if (method === "GET" && url.includes("/lws/r/")) {
      vault.reads.push(url);
      inFlight++;
      vault.maxInFlight = Math.max(vault.maxInFlight, inFlight);
      if (opts.holdReads) await opts.holdReads;
      inFlight--;
      const id = decodeURIComponent(url.split("/lws/r/")[1]!.split("?")[0]!);
      const hit = vault.levels.find((l) => l.id === id);
      if (!hit || opts.unreadable?.has(id)) return new Response("", { status: 404 });
      return Response.json(bodyOf(hit), { headers: { etag: '"lvl"' } });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { type: string; facts: Record<string, unknown> };
      vault.posts.push({ url, body, headers: (init?.headers ?? {}) as Record<string, string> });
      const token = String(body.facts["a:unitTag"] ?? "").replace(/^Level\./, "");
      const id = `new-${vault.levels.length + 1}`;
      const parentRef = body.facts["a:partOf"] as { "@id"?: string } | undefined;
      vault.levels.push({
        id,
        token,
        position: Number(body.facts["a:levelPosition"] ?? 0),
        label: String(body.facts["a:label"] ?? token),
        ...(parentRef?.["@id"] ? { parent: parentRef["@id"].split("/e/")[1]! } : {}),
      });
      return new Response("{}", {
        status: 201,
        headers: { etag: '"sha256:level"', ...(opts.noLocation ? {} : { location: `https://projecttesting.platform.example.test/lws/r/${id}` }), "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json", etag: '"x"' } });
  });
  return vault;
}

export const DEFAULTS: Level[] = [
  { id: "biz", token: "Business", position: 1 },
  { id: "stk", token: "Stakeholder", position: 2 },
  { id: "prod", token: "Product", position: 3 },
  { id: "sol", token: "Solution", position: 4 },
];
