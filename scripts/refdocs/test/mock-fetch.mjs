import { appendFileSync } from "node:fs";
// Test only (scripts/refdocs/test): replaces global fetch with an in-memory vault so write-refdocs.mjs runs offline (no network, no key).
// Response shapes are this file's GUESS at the live ones; it proves control flow, not the live wire.
const LIB = "https://appbuilder.gilb.com/base/e/gilbplatformcode-library-06gjdp49a9sm10t4hgdme4agwm";
const docs = new Map(), exhibits = new Map(); let n = 0;
const seed = (tag) => { const id = "seed" + (++n); docs.set(id, { "@id": `https://appbuilder.gilb.com/base/e/${id}`, unitTag: tag, partOf: { "@id": LIB } }); exhibits.set(id, []); };
seed("t:ScreenCard");          // bare type of t:ScreenCard.group, t:ScreenCard.plan -> informational line only
seed("t:Level.dat");           // a prefix of t:Level.date -> must NOT count as present
seed("t:Level.dateX");         // an extension of t:Level.date -> must NOT count as present
seed("t:Value.graph");         // exact -> must be skipped, not re-created
// --refresh support. MOCK_SEEDS: JSON array of {tag, title, name, label, appliesTo, exhibits:[{text, title}]}, each seeded as a document
// (a: keys) with its exhibits as records of their own. MOCK_LOG: every request is appended there as one JSON line. MOCK_PATCH:
// "doc:<status>" or "ex:<status>" forces that answer to the first matching PATCH (nothing applied); MOCK_NOAPPLY=1 answers 200 but applies nothing.
const ver = new Map(), exRec = new Map();
const etagOf = (id) => `W/"sha256:${id}-${ver.get(id) || 0}"`;
for (const sd of JSON.parse(process.env.MOCK_SEEDS || "[]")) {
  const id = "seed" + (++n);
  docs.set(id, { "@id": `https://appbuilder.gilb.com/base/e/${id}`, unitTag: sd.tag, partOf: { "@id": LIB }, "a:title": sd.title, "a:name": sd.name, "a:label": sd.label, "a:appliesTo": sd.appliesTo });
  exhibits.set(id, (sd.exhibits || []).map((x) => {
    const eid = "exseed" + (++n);
    exRec.set(eid, { "a:referenceExhibit": x.text, "a:title": x.title });
    return { "@id": `https://appbuilder.gilb.com/base/e/${eid}`, referenceExhibit: x.text };
  }));
}
const mode = process.env.MOCK_MODE || "ok";
let forced = process.env.MOCK_PATCH || "";
const reply = (status, json, headers = {}) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json", ...headers } });
globalThis.fetch = async (url, o = {}) => {
  const u = String(url), m = o.method || "GET";
  if (process.env.MOCK_LOG) appendFileSync(process.env.MOCK_LOG, JSON.stringify({ method: m, url: u, headers: o.headers, body: o.body ? JSON.parse(o.body) : null }) + "\n");
  if (!/^Bearer \S{40,}$/.test(o.headers?.Authorization || "")) return reply(401, {});
  if (m === "GET" && u.includes("/records?type=ReferenceDocument")) return reply(200, { items: [...docs.values()].map((d) => ({ "@id": d["@id"] })), complete: true });
  if (m === "GET" && u.includes("/lws/r/")) { const id = u.split("/lws/r/")[1], d = docs.get(id) || exRec.get(id); return d ? reply(200, { entity: d }, { ETag: etagOf(id) }) : reply(404, {}); }
  if (m === "PATCH" && u.includes("/lws/r/")) {
    const id = u.split("/lws/r/")[1], rec = docs.get(id) || exRec.get(id), kind = docs.has(id) ? "doc" : "ex";
    if (!rec) return reply(404, {});
    if (forced.startsWith(kind + ":")) { const st = Number(forced.split(":")[1]); forced = ""; return reply(st, { raw: "forced" }); }
    if (o.headers["Content-Type"] !== "application/merge-patch+json") return reply(415, {});
    if (o.headers["If-Match"] !== etagOf(id)) return reply(412, {});
    if (process.env.MOCK_NOAPPLY !== "1") { Object.assign(rec, JSON.parse(o.body)); ver.set(id, (ver.get(id) || 0) + 1); }
    return reply(200, {}, { ETag: etagOf(id) });
  }
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
