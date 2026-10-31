// What the held card needs of the platform beyond `test/world.ts`: the annotations route of the holder-only notes (read and written at the holder's vault
// node), the master's contact catalogue (copied from `contact-labels`, with the master's host replaced by this world's), and a vault list whose rows
// say what the vault represents (a Person), so a relationship kind with a predicate is offered. Every write the card makes is logged by `world.calls`;
// the annotations PUTs are also kept in `puts`.
import catalogue from "./contactCatalogue.master.json";
import { ID } from "./support";
import { P, type World } from "./world";

const SOURCE = "https://ontology.example.test";
const swap = <T>(v: T): T => JSON.parse(JSON.stringify(v).replaceAll(SOURCE, ID)) as T;
const docs = swap(catalogue.docs) as Record<string, unknown>;
const searches = swap(catalogue.search) as Record<string, { body: unknown }>;

export interface HeldWorld {
  /** The `fetch` to stub: the world's, plus the routes above. */
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  /** The bodies of the annotations PUTs, with the URL each arrived on. */
  puts: { url: string; body: Record<string, unknown> }[];
  /** The notes the annotations route answers, by held party. */
  notes: Map<string, string>;
  /** The "Where / How we met" lines the annotations route answers, by held party. */
  origins: Map<string, string>;
}

export function heldWorld(world: World, opts: { catalogue?: boolean; /** The principal every held record is linked to, as the platform's resolver names it (`online-card-anchor`). Default: none, the resolver answers 404. */ anchor?: string } = {}): HeldWorld {
  const puts: HeldWorld["puts"] = [];
  const notes = new Map<string, string>();
  const origins = new Map<string, string>();
  async function handle(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url);
    if (u.pathname === "/base/connect/annotations") {
      if ((init?.method ?? "GET").toUpperCase() === "PUT") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        world.calls.push({ method: "PUT", url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: String(init?.body) });
        puts.push({ url, body });
        if (typeof body.note === "string") notes.set(String(body.heldParty), body.note);
        if (typeof body.origin === "string") origins.set(String(body.heldParty), body.origin);
        return Response.json({ heldParty: body.heldParty, changed: true });
      }
      const party = u.searchParams.get("heldParty") ?? "";
      const text = notes.get(party) ?? "";
      const origin = origins.get(party) ?? "";
      world.calls.push({ method: "GET", url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: null });
      return Response.json({ me: "p", heldParty: party, note: text || null, origin: origin || null, notes: text ? [{ entity: `${P}/e/n`, text }] : [], origins: origin ? [{ entity: `${P}/e/o`, text: origin }] : [], noteLoad: text ? "ok" : "empty", originLoad: origin ? "ok" : "empty", vault: P });
    }
    if (opts.anchor && u.pathname === "/base/connect/online-card-anchor") {
      world.calls.push({ method: "GET", url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: null });
      return Response.json({ kind: "person", vaultRepresents: `${ID}/base/t/Person`, principal: opts.anchor, entity: opts.anchor });
    }
    // The user-plane link catalogue the relation write checks its predicate against: the terms of the contact kinds that name a predicate.
    if (opts.catalogue !== false && u.pathname === "/base/vocab" && u.searchParams.get("linkPlane") === "user") {
      const term = (tail: string, label: string) => ({ "@id": `${ID}/base/t/${tail}`, "a:linkPlane": "user", "a:typeAttribute": `t:${tail}`, "a:label": label, "a:symmetric": true, "a:directed": false });
      return Response.json({ "@graph": [term("FriendOf", "friend-of"), term("FamilyOf", "family-of"), term("ColleagueOf", "colleague-of")] });
    }
    if (opts.catalogue !== false && url.startsWith(ID)) {
      const s = /\/base\/search\?(.*)$/.exec(url);
      if (s) {
        const hit = searches[new URLSearchParams(s[1]).get("type") ?? ""];
        if (hit) return Response.json(hit.body);
      }
      if (docs[url]) return Response.json(docs[url]);
    }
    const res = await world.fetch(input, init);
    if (new URL(url).pathname === "/lws/vaults" && res.ok) {
      const body = (await res.json()) as { vaults: Record<string, unknown>[] };
      return Response.json({ ...body, vaults: body.vaults.map((v) => ({ ...v, represents: `${ID}/base/t/Person` })) });
    }
    return res;
  }
  return { fetch: handle, puts, notes, origins };
}
