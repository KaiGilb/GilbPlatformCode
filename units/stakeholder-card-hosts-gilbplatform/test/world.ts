// The world the card is drawn in: a platform behind one fake `fetch`. Three hosts answer:
//   - the ontology host: the fixture master (`support.ts` and its layers), fetched at a rig origin as the package tests do;
//   - the vault host: the fixture platform of `person-create` (records, create, patch, tags), plus the connect routes of the card;
//   - the platform's apex: the list of reachable vaults, the online card of a person, the person resolver.
// Every request is logged with its headers, so a test reads which one carried a credential. A request nothing answers is logged in `unserved`.
import { selfCardEntityUri } from "@kaigilb/gilbplatformcode-self-card";
import type { GilbSession } from "@kaigilb/gilbplatformcode-signin/session";
import { vaultRootOf } from "@kaigilb/gilbplatformcode-plan-self-source";
import { CONTEXT, a, fixtureMaster, ID, RIG, t, type FixtureMaster } from "./support";
import { withTagStandard } from "./fixtureTag";
import { withWritableFieldsAdjudicated } from "./writableFields";
import { fixturePlatform, type FixturePlatform } from "./fixturePlatform";
import { fakeSession } from "./fakeSession";

/** The platform's base origin: credentials go to this host and its subdomains only. */
export const BASE = "https://example.test";
export const HOST = "https://holder.example.test";
/** Ann's own (landing) vault, and the entity of it. */
export const P = `${HOST}/base/pann`;
export const P_ENTITY = `${HOST}/base/e/annvault`;
/** A vault outside the platform's family, which Ann can read: the card must never send it a credential. */
export const FOREIGN_HOST = "https://elsewhere.example.org";
export const FOREIGN = `${FOREIGN_HOST}/base/pelsewhere`;
/** The ontology's origin as the app sets it; the fixture master is served at the rig. */
export const ONTOLOGY = ID;
export const GEO = "https://geo.example.test";
export const SYSTEM_HOSTS = ["ontology.platform.example.test"];
export const ANN = "https://id.example.test/base/p/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const BEN = "https://id.example.test/base/p/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const STRANGER = "https://id.example.test/base/p/cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export interface LoggedCall {
  method: string;
  url: string;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  body: string | null;
}

export interface WorldOptions {
  /** Ben's online card fields (predicate → value). Default: given name, family name and an email. */
  ben?: Record<string, string>;
  /** Whether Ann has made her own card in her vault. Default: true. */
  ownCard?: boolean;
  /** Whether Ben is in Ann's circles. Default: true. */
  benPlaced?: boolean;
  /** The answer of `GET /lws/vaults`: a status other than 200 fails it. Default: 200. */
  vaultsStatus?: number;
  /** The photo term the platform's origin serves at `/base/a/profilePhoto` (its `a:predicateAttribute`). Absent: it answers 404, so the seed stands. */
  photoTerm?: string;
  /** Whether Ann's own card carries a profile photo (`/files/annface`, served by her vault) and the vault serves its bytes. Default: false. */
  ownPhoto?: boolean;
  /** Whether Ben's online card shares a photo: the card names the platform's profile-photo route and that route serves bytes. Default: false. */
  benPhoto?: boolean;
  /** Other files Ann's vault serves at `/files/<id>`: the id and the bytes. Default: none. */
  files?: Record<string, string>;
  /** The vaults the session reaches. Default: Ann's own vault, read and write. */
  sessionVaults?: GilbSession["vaults"];
}

/** The bytes of the two photos the fake platform serves (a stand-in for an image). */
export const PHOTO_BYTES = { ann: "ann-face-bytes", ben: "ben-face-bytes-longer" } as const;

export const BEN_FIELDS = { "a:givenName": "Ben", "a:familyName": "Larsen", "a:email": "ben@example.test" };

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** The fixture master with the writable fields, and the two name fields of a person added to its listing. */
export function masterWithNames(): FixtureMaster {
  const m = withWritableFieldsAdjudicated(withTagStandard(fixtureMaster()));
  const pages: Record<string, unknown>[][] = [];
  for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
    const page = m.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(page["@graph"]);
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  const person = [{ "@id": t("Person") }];
  pages[pages.length - 1]!.push(
    { "@id": t("GivenName"), "a:predicateAttribute": "a:givenName", "a:label": "Given name", "a:encoding": "inline-literal:text", "a:fieldOf": person },
    { "@id": t("FamilyName"), "a:predicateAttribute": "a:familyName", "a:label": "Family name", "a:encoding": "inline-literal:text", "a:fieldOf": person },
  );
  m.listing(pages as never);
  for (const slug of ["givenName", "familyName", "logo", "parentOrganization", "employer", "employee", "jobTitle", "memberOf"]) m.put(`a/${slug}`, { "@context": CONTEXT, "@id": a(slug), "a:predicateAttribute": `a:${slug}` });
  return m;
}

export async function createWorld(options: WorldOptions = {}) {
  const master = masterWithNames();
  const platform: FixturePlatform = fixturePlatform({ origin: HOST });
  platform.reach.add(P);
  const calls: LoggedCall[] = [];
  const unserved: string[] = [];
  const benFields = options.ben ?? BEN_FIELDS;

  // Ann's own card in her vault, at its derived address, as the platform's ensure door mints it.
  let ownCardUri: string | null = null;
  async function makeOwnCard(facts: Record<string, unknown> = { "a:name": "Ann Ward" }): Promise<string> {
    const derived = await selfCardEntityUri(vaultRootOf(P)!);
    const probe = platform.seed(P, "t:Person", { "a:name": "probe" });
    platform.entities.delete(probe);
    const prefix = probe.slice(0, probe.lastIndexOf("/") + 1);
    ownCardUri = platform.seed(P, "t:Person", facts, { id: prefix + derived.slice(derived.lastIndexOf("/") + 1) });
    return ownCardUri;
  }
  if (options.ownCard !== false) await makeOwnCard(options.ownPhoto ? { "a:name": "Ann Ward", "a:profilePhoto": "/files/annface" } : undefined);

  const session: GilbSession = {
    principal: ANN,
    vault: { entity: P_ENTITY, id: "annvault", name: "Ann" },
    vaults: options.sessionVaults ?? [{ vaultId: P, modes: ["read", "write"] }],
  };

  async function handle(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k.toLowerCase()] = v));
    const body = typeof init?.body === "string" ? init.body : null;
    calls.push({ method, url, headers, body });
    const u = new URL(url);

    if (url.startsWith(ONTOLOGY)) return master.fetch(url.replace(ONTOLOGY, RIG), init);
    if (u.pathname === "/base/a/profilePhoto" && method === "GET" && options.photoTerm) {
      return json(200, { "@context": { "@vocab": `${ONTOLOGY}/base/a/` }, "@id": `${ONTOLOGY}/base/a/profilePhoto`, "a:predicateAttribute": options.photoTerm });
    }
    if (u.pathname === "/lws/vaults" && method === "GET") {
      if ((options.vaultsStatus ?? 200) !== 200) return json(options.vaultsStatus!, { error: "Unavailable" });
      return json(200, { total: 1, vaults: [{ "@id": P_ENTITY, vaultId: P, name: "Ann", partOf: null, parentAmbiguous: false, modes: ["read", "write"], isLandingVault: true }] });
    }
    if (u.pathname === "/base/connect/audience-rung/members" && method === "GET") {
      const members = options.benPlaced === false ? [] : [BEN];
      return json(200, { holder: ANN, vaultId: P, sets: [{ context: "personal", depth: "close-circle", rungTerm: "t:x", setUri: "https://x.example.test/personal-close-circle", members }] });
    }
    if (u.pathname === "/base/connect/public-card" && method === "GET") {
      const who = u.searchParams.get("principal") ?? "";
      if (who !== BEN) return json(404, { error: "not_a_person" });
      const fields = Object.entries(benFields).map(([field, value]) => ({ principal: BEN, field, value, rung: "public" }));
      return json(200, { principal: BEN, fields, skills: [], photoUrl: options.benPhoto ? `/base/connect/profile-photo?principal=${encodeURIComponent(BEN)}` : null });
    }
    // The platform's rung-gated profile-photo route: the bytes of Ben's photo, or 404 when he shares none.
    if (u.pathname === "/base/connect/profile-photo" && method === "GET") {
      if (!options.benPhoto || u.searchParams.get("principal") !== BEN) return json(404, { error: "no_photo" });
      return new Response(PHOTO_BYTES.ben, { status: 200, headers: { "content-type": "image/png" } });
    }
    // A file of Ann's vault: her profile photo, or one the test gave.
    const file = /^\/files\/([^/]+)$/.exec(u.pathname);
    if (u.origin === HOST && file && method === "GET") {
      const bytes = file[1] === "annface" && options.ownPhoto ? PHOTO_BYTES.ann : options.files?.[file[1]!];
      if (bytes === undefined) return json(404, { error: "NotFound" });
      return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } });
    }
    // The platform's idempotent door for a vault's own card: it makes the card at its derived address (201), or answers the card that is there (200).
    const selfcard = /^\/lws\/vault\/([^/]+)\/selfcard$/.exec(u.pathname);
    if (u.origin === HOST && selfcard && method === "POST") {
      if (decodeURIComponent(selfcard[1]!) !== P) return json(403, { error: "Forbidden" });
      const adopted = ownCardUri !== null;
      const sent = JSON.parse(body ?? "{}") as { facts?: Record<string, unknown> };
      const card = ownCardUri ?? (await makeOwnCard(sent.facts ?? {}));
      const loc = card.replace("/base/e/", "/lws/r/");
      return json(adopted ? 200 : 201, { "@id": loc }, { location: loc });
    }
    if (u.pathname === "/base/find-by-attribute" && method === "GET") {
      const attr = u.searchParams.get("attr") ?? "";
      const value = u.searchParams.get("value") ?? "";
      const slug = attr.replace(/^a:/, "");
      const ids = [...platform.entities.values()].filter((e) => JSON.stringify(e.facts[`a:${slug}`] ?? null).includes(value)).map((e) => e.id);
      return json(200, { count: ids.length, ids });
    }
    if (u.origin === HOST) return platform.fetch(url, init);
    unserved.push(`${method} ${url}`);
    return json(404, { error: "not served here" });
  }

  const sess = fakeSession(session);
  return {
    master,
    platform,
    calls,
    unserved,
    fetch: handle,
    session: sess.session,
    signed: sess.signed,
    get ownCardUri() {
      return ownCardUri;
    },
    /** Ann makes her own card in her vault now. */
    makeOwnCard,
    /** The calls with this method whose URL matches. */
    requests: (method: string, url: RegExp) => calls.filter((c) => c.method === method && url.test(c.url)),
  };
}

export type World = Awaited<ReturnType<typeof createWorld>>;
