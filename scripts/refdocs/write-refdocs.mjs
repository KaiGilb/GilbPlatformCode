#!/usr/bin/env node
// Writes GilbPlatformCode reference documents (+ one exhibit each) to the appbuilder vault.
// Stance: converging. It reads References first; a tag already present is read, never re-created.
// Credential: a file path (--token-file). The file is deleted on EVERY exit path, including refusals.
// Usage: node write-refdocs.mjs --token-file <path> [--dry-run]
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = "https://appbuilder.gilb.com";
const VAULT = `${HOST}/base`;
const CREATE = `${HOST}/lws/vault/${encodeURIComponent(VAULT)}/c`;
const LIB = `${HOST}/base/e/gilbplatformcode-library-06gjdp49a9sm10t4hgdme4agwm`;
const LICENCE = "https://jackfruit.gilb.com/base/e/06gj9wh899wc7cbn72ek2q8pgc";
const PUBLIC = "https://veda.gilb.com/base/t/PublicGrantee";
const arg = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const tokenFile = arg("--token-file");
const dry = process.argv.includes("--dry-run");

console.log("Stance: converging — reads References first; an existing tag is read, not re-created.");

const EXITING = Symbol("exiting"); // thrown by exitFlushed to unwind the caller
let deleted = false;
function destroyKey() {
  if (deleted || !tokenFile) return;
  deleted = true;
  try { if (existsSync(tokenFile)) unlinkSync(tokenFile); console.log("key file deleted"); }
  catch (e) { console.log("KEY FILE NOT DELETED: " + e.code); }
}
process.on("exit", destroyKey);
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => { destroyKey(); process.exit(130); });
process.on("uncaughtException", (e) => { if (e === EXITING) return; console.log("crash: " + String(e.message).slice(0, 200)); destroyKey(); process.exit(1); });

// Input is read AFTER the handlers above, so a missing or malformed input still deletes the key file.
const inputPath = arg("--input") || join(HERE, "out", "refdocs-input.json");
const { notice, units } = JSON.parse(readFileSync(inputPath, "utf8"));

const receipt = { stance: "converging", vault: VAULT, items: {}, counts: { created: 0, "not-created": 0, unknown: 0, "never-sent": 0 } };
const state = (k, s, extra = {}) => { receipt.items[k] = { state: s, ...extra }; };
// Exit only after stdout has flushed (a pipe is written asynchronously; process.exit could drop the tail).
// The 'exit' handler (destroyKey) still runs. The thrown sentinel unwinds the caller, so no later code runs while the
// flush is pending; the uncaughtException handler ignores it.
function exitFlushed(code) {
  process.stdout.write("", () => process.exit(code));
  throw EXITING;
}
function finish(code) {
  for (const v of Object.values(receipt.items)) receipt.counts[v.state]++;
  console.log(JSON.stringify(receipt, null, 1));
  destroyKey();
  exitFlushed(code);
}
function neverSent(msg, code = 2) {
  for (const u of units) { state(u.tag + " doc", "never-sent"); state(u.tag + " exhibit", "never-sent"); }
  console.log("REFUSED before any request: " + msg + " (nothing sent; a re-run is safe with respect to the vault)");
  finish(code);
}

function docFacts(u) {
  return {
    "a:label": u.title, "a:name": u.title, "a:title": u.title,
    "a:unitTag": u.tag, "a:appliesTo": u.note,
    "a:attribution": notice, "a:license": "GilbPlatform.Licence",
    "a:handsOffTo": { "@id": LICENCE },
    "a:partOf": { "@id": LIB },
    "a:directReader": PUBLIC,
  };
}
function exhibitFacts(u, docId) {
  return {
    "a:title": u.title, "a:referenceOf": { "@id": docId },
    "a:referenceOrder": 1, "a:referenceExhibit": u.exhibit, "a:directReader": PUBLIC,
  };
}

if (dry) {
  for (const u of units) {
    console.log(JSON.stringify({ POST: CREATE, body: { type: "t:ReferenceDocument", facts: docFacts(u) } }, null, 1));
    console.log(JSON.stringify({ POST: CREATE, body: { type: "t:ReferenceExhibit", facts: exhibitFacts(u, "<document address from the create>") } }, null, 1));
  }
  console.log("dry-run: nothing sent, no key read");
  exitFlushed(0);
}

// ---- preflight: credential shape (Rule_Code_gilb-vault-write-run, RuleBasewrunPreflightCredentialShape)
if (!tokenFile) neverSent("--token-file is required");
if (!existsSync(tokenFile)) neverSent("token file missing");
let token;
try {
  const raw = readFileSync(tokenFile, "utf8").trim();
  token = raw.startsWith("{") ? String(JSON.parse(raw).access_token || JSON.parse(raw).token || "").trim() : raw;
} catch { neverSent("token file unreadable"); }
if (!token) neverSent("token empty after trim");
if (/[^\x21-\x7e]/.test(token)) neverSent("token is not a single header-legal line");
if (token.length < 40 || token.length > 8000) neverSent(`token length ${token.length} not plausible for a bridge Bearer (40..8000)`);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
let issued = false; // set immediately before any send
async function lws(method, url, body) {
  const headers = { Accept: "application/ld+json, application/json", "User-Agent": UA, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  issued = true;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json, location: res.headers.get("location") };
}
const tailOf = (s) => String(s || "").split("?")[0].replace(/\/$/, "").split("/").pop();
const idOf = (r) => (r && (r["@id"] || (r.entity && (r.entity["@id"] || r.entity)) || r.id)) || "";
const items = (j) => (Array.isArray(j?.items) ? j.items : Array.isArray(j?.records) ? j.records : Array.isArray(j?.["@graph"]) ? j["@graph"] : Array.isArray(j) ? j : []);

async function allDocs() {
  const out = []; let offset = 0;
  for (;;) {
    const r = await lws("GET", `${HOST}/lws/vault/${encodeURIComponent(VAULT)}/records?type=ReferenceDocument&offset=${offset}&limit=200`);
    if (r.status !== 200) return { status: r.status, docs: out };
    const page = items(r.json); out.push(...page);
    if (r.json?.complete === true || page.length === 0) return { status: 200, docs: out };
    offset += page.length;
  }
}
async function readDoc(row) {
  const r = await lws("GET", `${HOST}/lws/r/${tailOf(idOf(row))}`);
  return r.status === 200 ? (r.json?.entity && typeof r.json.entity === "object" ? r.json.entity : r.json) : null;
}
const unitTagOf = (d) => String(d?.unitTag ?? d?.["a:unitTag"] ?? "");

// ---- read before create
const listed = await allDocs();
if (listed.status === 401 || listed.status === 403) {
  console.log(`listing References answered ${listed.status}: the key was read by the server and refused (expired or no reach)`);
  for (const u of units) { state(u.tag + " doc", "not-created", { reason: `listing ${listed.status}, no write attempted` }); state(u.tag + " exhibit", "not-created"); }
  finish(1);
}
if (listed.status !== 200) {
  for (const u of units) { state(u.tag + " doc", "not-created", { reason: `listing ${listed.status}, no write attempted` }); state(u.tag + " exhibit", "not-created"); }
  finish(1);
}
const existing = new Map();
for (const row of listed.docs) {
  const d = await readDoc(row);
  const t = unitTagOf(d);
  if (t) existing.set(t, { id: idOf(d) || idOf(row), d });
}
console.log(`read ${listed.docs.length} reference documents before creating`);

let failed = false;
const made = []; // units whose document create answered 2xx; read back after the loop
for (const u of units) {
  const bare = u.tag.includes(".") ? u.tag.split(".")[0] : "";
  if (bare && existing.has(bare)) console.log(`info: a document with the bare type tag ${bare} exists (${existing.get(bare).id}); creating ${u.tag} regardless`);
  const hit = existing.has(u.tag) ? [u.tag] : [];
  if (hit.length) {
    state(u.tag + " doc", "not-created", { reason: "tag already present: " + hit.join(","), entity: existing.get(hit[0]).id });
    state(u.tag + " exhibit", "not-created", { reason: "document already present; not overwritten" });
    failed = true; continue;
  }
  let facts = docFacts(u);
  let r = await lws("POST", CREATE, { type: "t:ReferenceDocument", facts });
  if (r.status === 400 && /directReader/i.test(JSON.stringify(r.json))) {
    delete facts["a:directReader"]; // a 400 changed nothing
    console.log("note: directReader refused on create; retried without it");
    r = await lws("POST", CREATE, { type: "t:ReferenceDocument", facts });
  }
  if (r.status < 200 || r.status >= 300) {
    state(u.tag + " doc", r.status >= 500 ? "unknown" : "not-created", { status: r.status, body: JSON.stringify(r.json).slice(0, 300) });
    state(u.tag + " exhibit", "not-created", { reason: "no document" }); failed = true; continue;
  }
  const docId = `${HOST}/base/e/${tailOf(r.location || idOf(r.json))}`;
  let ex = await lws("POST", CREATE, { type: "t:ReferenceExhibit", facts: exhibitFacts(u, docId) });
  if (ex.status === 400 && /directReader/i.test(JSON.stringify(ex.json))) {
    const f = exhibitFacts(u, docId); delete f["a:directReader"];
    ex = await lws("POST", CREATE, { type: "t:ReferenceExhibit", facts: f });
  }
  const exId = ex.status >= 200 && ex.status < 300 ? `${HOST}/base/e/${tailOf(ex.location || idOf(ex.json))}` : null;
  state(u.tag + " exhibit", exId ? "created" : ex.status >= 500 ? "unknown" : "not-created", { status: ex.status, entity: exId });
  made.push({ u, docId, postStatus: r.status, exOk: !!exId });
}

// ---- readback, once, after all creates: one listing, each document read once.
if (made.length) {
  const back = await allDocs();
  if (back.status !== 200) {
    for (const m of made) state(m.u.tag + " doc", "unknown", { status: m.postStatus, entity: m.docId, reason: `readback listing ${back.status}; created but not read back` });
    finish(1);
  }
  const byTag = new Map(); // exact unitTag -> [{ id, d }]
  for (const row of back.docs) {
    const d = await readDoc(row);
    const t = unitTagOf(d);
    if (!t) continue;
    if (!byTag.has(t)) byTag.set(t, []);
    byTag.get(t).push({ id: idOf(d) || idOf(row), d });
  }
  const idCore = (v) => tailOf(typeof v === "string" ? v : v && v["@id"]).split("-").pop();
  const partOfIds = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).map(idCore).filter(Boolean);
  for (const m of made) {
    const { u, docId } = m;
    const match = (byTag.get(u.tag) || []).map((x) => x.id);
    const exs = await lws("GET", `${HOST}/lws/referencedocument/${tailOf(docId)}/exhibits`);
    const exRows = exs.json?.exhibits || [];
    const line1 = String(exRows[0]?.referenceExhibit ?? exRows[0]?.["a:referenceExhibit"] ?? "").split("\n")[0];
    const mine = (byTag.get(u.tag) || []).find((x) => tailOf(x.id) === tailOf(docId));
    const partOf = [...partOfIds(mine?.d?.partOf ?? mine?.d?.["a:partOf"]), ...partOfIds(exs.json?.reference?.partOf)];
    const partOfOk = partOf.length > 0 && partOf.every((p) => p === idCore(LIB));
    const ok = match.length === 1 && !!mine && exRows.length === 1 && line1.startsWith("**What it does:**") && partOfOk;
    state(u.tag + " doc", ok ? "created" : "unknown", { status: m.postStatus, entity: docId, readback: { tagMatches: match.length, exhibits: exRows.length, line1: line1.slice(0, 40), partOf: JSON.stringify(partOf), partOfIsLibrary: partOfOk } });
    if (!ok) failed = true;
  }
}
finish(failed ? 1 : 0);
