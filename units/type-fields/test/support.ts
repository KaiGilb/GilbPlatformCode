// A stand-in for the ontology master's two carrier reads and its type dereference, for this unit's tests.
//
// What it copies: the live master veda.gilb.com (production, public read, no credential), measured 2026-11-25T01:07Z:
//   GET /base/vocab?status=all&carries=a:fieldOf&limit=1000      200, complete: true, 847 terms, 4,017,960 bytes, one page
//   GET /base/vocab?status=all&carries=a:requiredSlot&limit=100  200, complete: true, 6 terms, 27,946 bytes
//   GET /base/t/<Type>                                           200 with the term (TableViewColumn, Person); 404 for a name no term
//                                                                claims (NoSuchTypeHere, measured 2026-11-25T02:02Z)
// GUESSES, each labelled again at the test that uses it: `status` (the master answering 403, 404 or 500 to every request) and
// `noSelector` (a master that leaves `carries` off the answer) were never measured on the live master. `down` is no platform
// behaviour: the request never leaves (fetch rejects).
// The term documents are in fixtures/master-fields-2026-11-25.json: the keys the reader reads, each as served (its `_copiedFrom` says what was left out and that the host
// was rewritten to an example.test host). No test reaches a real host.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ORIGIN = "https://ontology.platform.example.test";
export const t = (name: string) => `${ORIGIN}/base/t/${name}`;

interface Fixture {
  context: unknown;
  carriesSpellings: { fieldOf: string[]; requiredSlot: string[] };
  fieldTerms: Record<string, unknown>[];
  requiredTerms: Record<string, unknown>[];
}

export const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/master-fields-2026-11-25.json", import.meta.url)), "utf8")) as Fixture;

export interface FakeMaster {
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  /** Every request made, in order: the path with its query, and the init it was sent with. */
  calls: { url: string; init: RequestInit | undefined }[];
}

export interface FakeMasterOptions {
  /** Answer every request with this status and no body. */
  status?: number;
  /** Reject every request, as a network that is down does. */
  down?: boolean;
  /** Serve the carrier reads without `carries` on their face, as a master without the selector does. */
  noSelector?: boolean;
  /** Extra or replaced required-slot terms, by address. */
  requiredTerms?: Record<string, unknown>[];
  /** The field terms served instead of the fixture's (a test's labelled stand-in, never a live answer). */
  fieldTerms?: Record<string, unknown>[];
  /** The type names `GET /base/t/<Name>` answers 200 for, besides every type the fixture's terms name. */
  knownTypes?: string[];
}

/** The master's answers from the fixture. */
export function fakeMaster(opts: FakeMasterOptions = {}): FakeMaster {
  const calls: FakeMaster["calls"] = [];
  const known = new Set<string>(opts.knownTypes ?? []);
  for (const doc of fixture.fieldTerms) {
    const of = doc["a:fieldOf"];
    for (const ref of Array.isArray(of) ? of : [of]) {
      const id = ref && typeof ref === "object" ? String((ref as { "@id"?: unknown })["@id"] ?? "") : "";
      if (id.startsWith(`${ORIGIN}/base/t/`)) known.add(id.slice(`${ORIGIN}/base/t/`.length));
    }
  }
  const page = (carries: string, spellings: string[], graph: Record<string, unknown>[], url: string) =>
    Response.json({
      "@context": fixture.context,
      "@id": url,
      ...(opts.noSelector ? {} : { carries, carriesSpellings: spellings }),
      limit: 1000,
      complete: true,
      "@graph": graph,
    });
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(url);
    calls.push({ url: u.pathname + u.search, init });
    if (opts.down) throw new TypeError("Failed to fetch");
    if (opts.status !== undefined) return new Response(null, { status: opts.status });
    if (u.pathname === "/base/vocab" && u.searchParams.get("status") === "all") {
      const carries = u.searchParams.get("carries");
      if (carries === "a:fieldOf") return page(carries, fixture.carriesSpellings.fieldOf, opts.fieldTerms ?? fixture.fieldTerms, url);
      if (carries === "a:requiredSlot") return page(carries, fixture.carriesSpellings.requiredSlot, opts.requiredTerms ?? fixture.requiredTerms, url);
    }
    const type = /^\/base\/t\/([^/]+)$/.exec(u.pathname)?.[1];
    if (type && known.has(type)) return Response.json({ "@context": fixture.context, "@id": t(type), "a:label": type });
    return Response.json({ error: "NotFound" }, { status: 404 });
  };
  return { fetchImpl, calls };
}
