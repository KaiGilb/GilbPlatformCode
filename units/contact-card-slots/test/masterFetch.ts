// Test-only: the ontology master as a fake `fetch`, serving the documents in contactCatalogue.master.json (the master's own, read
// 2026-10-16T02:45Z) and a few is-a chains (Person under Animal, Organization under CollectiveAgent; ILLUSTRATIVE above the types
// that matter here). Every request is recorded.
import fixture from "./contactCatalogue.master.json";

const M = "https://ontology.example.test/base";
const docs = { ...(fixture.docs as Record<string, unknown>) } as Record<string, unknown>;
const searches = fixture.search as Record<string, { q: string; body: unknown }>;
const up = (name: string, parent?: string) => ({ "a:label": name, ...(parent ? { "a:subTypeOf": { "@id": `${M}/t/${parent}` } } : {}) });
Object.assign(docs, {
  [`${M}/t/Person`]: up("Person", "Animal"),
  [`${M}/t/Animal`]: up("Animal", "Organism"),
  [`${M}/t/Organism`]: up("Organism"),
  [`${M}/t/Passenger`]: up("Passenger", "Person"),
  [`${M}/t/Organization`]: up("Organization", "CollectiveAgent"),
  [`${M}/t/CollectiveAgent`]: up("Collective Agent"),
  [`${M}/t/Project`]: up("Project", "Intent"),
  [`${M}/t/Intent`]: up("Intent"),
  [`${M}/t/AiAgent`]: up("AI agent"),
});

export interface MasterOver {
  search?: Record<string, unknown>;
  fail?: Set<string>;
  extra?: Record<string, unknown>;
}

export function masterFetch(over: MasterOver = {}) {
  const log: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    log.push(url);
    if (over.fail?.has(url)) return new Response("{}", { status: 500 });
    const s = /\/base\/search\?(.*)$/.exec(url);
    if (s) {
      const type = new URLSearchParams(s[1]).get("type") ?? "";
      const body = over.search?.[type] ?? searches[type]?.body;
      return body ? Response.json(body) : new Response("{}", { status: 404 });
    }
    const d = over.extra?.[url] ?? docs[url];
    return d ? Response.json(d) : new Response(JSON.stringify({ error: "NotFound" }), { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, log };
}
