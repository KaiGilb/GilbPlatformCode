// Test only (scripts/refdocs/test): replaces global fetch with an in-memory vault so write-refdocs.mjs runs offline (no network, no key).
// Response shapes are this file's GUESS at the live ones; it proves control flow, not the live wire.
const LIB = "https://appbuilder.gilb.com/base/e/gilbplatformcode-library-06gjdp49a9sm10t4hgdme4agwm";
const docs = new Map(), exhibits = new Map(); let n = 0;
const seed = (tag) => { const id = "seed" + (++n); docs.set(id, { "@id": `https://appbuilder.gilb.com/base/e/${id}`, unitTag: tag, partOf: { "@id": LIB } }); exhibits.set(id, []); };
seed("t:ScreenCard");          // bare type of t:ScreenCard.group, t:ScreenCard.plan -> informational line only
seed("t:Level.dat");           // a prefix of t:Level.date -> must NOT count as present
seed("t:Level.dateX");         // an extension of t:Level.date -> must NOT count as present
seed("t:Value.graph");         // exact -> must be skipped, not re-created
const mode = process.env.MOCK_MODE || "ok";
const reply = (status, json, headers = {}) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json", ...headers } });
globalThis.fetch = async (url, o = {}) => {
  const u = String(url), m = o.method || "GET";
  if (!/^Bearer \S{40,}$/.test(o.headers?.Authorization || "")) return reply(401, {});
  if (m === "GET" && u.includes("/records?type=ReferenceDocument")) return reply(200, { items: [...docs.values()].map((d) => ({ "@id": d["@id"] })), complete: true });
  if (m === "GET" && u.includes("/lws/r/")) { const d = docs.get(u.split("/lws/r/")[1]); return d ? reply(200, { entity: d }) : reply(404, {}); }
  if (m === "POST") {
    const b = JSON.parse(o.body), id = "new" + (++n);
    if (b.type === "t:ReferenceDocument") {
      docs.set(id, { "@id": `https://appbuilder.gilb.com/base/e/${id}`, unitTag: b.facts["a:unitTag"], partOf: mode === "badpartof" ? { "@id": "https://x/base/e/other" } : b.facts["a:partOf"] });
      exhibits.set(id, []);
    } else {
      const doc = b.facts["a:referenceOf"]["@id"].split("/").pop();
      if (mode !== "noexhibit") exhibits.get(doc).push({ referenceExhibit: b.facts["a:referenceExhibit"] });
    }
    return reply(201, {}, { location: `https://appbuilder.gilb.com/base/e/${id}` });
  }
  if (m === "GET" && u.includes("/exhibits")) { const id = u.split("/referencedocument/")[1].split("/")[0]; return reply(200, { exhibits: exhibits.get(id), reference: { partOf: docs.get(id).partOf } }); }
  return reply(404, { raw: u });
};
