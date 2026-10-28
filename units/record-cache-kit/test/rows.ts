// Row builders and a fake record door for the tests. Not shipped (the package files are `src` only).
import { vi } from "vitest";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";

export const HOST = "https://plan.platform.example.test";
export const VAULT = `${HOST}/vault`;

export function entityUri(id: string, host = HOST): string {
  return `${host}/base/e/${id}`;
}

export function baseRow(id: string, facts: Record<string, string> = {}, etag: string | null = '"e1"', host = HOST): BaseRecord {
  return {
    id,
    entityUri: entityUri(id, host),
    typeUri: "t:SpecificationElement",
    facts,
    opaqueFacts: [],
    etag,
    servedKeys: Object.keys(facts),
    served: { facts, context: undefined, etag },
  } as BaseRecord;
}

export function gridRow(id: string, facts: Record<string, string> = {}, etag: string | null = '"e1"', updatedAt = 1, host = HOST): GridRecord {
  return { ...baseRow(id, facts, etag, host), updatedAt } as GridRecord;
}

/** A fake record door: `GET /lws/r/<id>` answers the stored document of `docs[id]` (404 when none, 500 when in `failing`), and counts reads. */
export function fakeDoor(docs: Record<string, { body: Record<string, unknown>; etag?: string | null }>, failing: Set<string> = new Set()) {
  const reads: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const m = /\/lws\/r\/([^?#]+)/.exec(url);
    if (!m) return new Response("unexpected", { status: 500 });
    const id = decodeURIComponent(m[1]!);
    reads.push(id);
    if (failing.has(id)) return new Response("no", { status: 500 });
    const doc = docs[id];
    if (!doc) return new Response("gone", { status: 404 });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (doc.etag) headers.etag = doc.etag;
    return new Response(JSON.stringify({ "@id": entityUri(id), "@type": "t:SpecificationElement", ...doc.body }), { status: 200, headers });
  });
  return { fetchMock, reads };
}
