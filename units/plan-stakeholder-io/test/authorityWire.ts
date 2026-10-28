// A fake platform for the Authority writes: the master's relation terms, the relation write (PUT) and end (POST), and the relations read.
// Not shipped (the package files are `src` only).
import { vi } from "vitest";
import { ONTOLOGY } from "./support";

export const P = "https://p.platform.example.test/vault";
export const H = "https://h.platform.example.test";

export type Call = { method: string; url: string; body: Record<string, unknown> | null };

export function installAuthorityWire(opts: { endFails?: boolean } = {}): { calls: Call[]; puts: () => Call[]; ends: () => Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();
      let body: Record<string, unknown> | null = null;
      if (method !== "GET" && typeof init?.body === "string") body = JSON.parse(init.body) as Record<string, unknown>;
      calls.push({ method, url, body });
      for (const [name, sub] of [["AuthorityOf", "StakeholderOf"], ["ResourceOwnerOf", "StakeholderOf"]] as const) {
        if (url.endsWith(`/base/t/${name}`)) return Response.json({ "@id": `${ONTOLOGY}/base/t/${name}`, "a:label": name, "a:subTypeOf": { "@id": `${ONTOLOGY}/base/t/${sub}` } });
      }
      if (url.endsWith("/base/t/StakeholderOf")) return Response.json({ "@id": `${ONTOLOGY}/base/t/StakeholderOf`, "a:label": "stakeholder-of", "a:nodeKind": "relation", "a:subTypeOf": { "@id": `${ONTOLOGY}/base/t/Relation` } });
      if (method === "POST" && url.includes("/end")) {
        if (opts.endFails) return new Response("no", { status: 500 });
        return Response.json({ relation: url.replace(/\/end$/, ""), changed: true });
      }
      if (method === "PUT") {
        const id = url.split("/r/")[1] ?? "minted";
        return Response.json({ changed: true, entity: `${P}/r/${id}` });
      }
      return Response.json(url.includes("/relations") ? { relations: [] } : {});
    }),
  );
  return {
    calls,
    puts: () => calls.filter((c) => c.method === "PUT" && c.url.includes("/vault/r/")),
    ends: () => calls.filter((c) => c.method === "POST" && c.url.includes("/end")),
  };
}
