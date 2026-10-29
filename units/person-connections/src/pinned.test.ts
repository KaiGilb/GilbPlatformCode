// What the ported tests leave unpinned: every exported constant, the small canonical helpers, the request bound, the limits of the
// canonicaliser, the resolver's busy answer, and the read of the rung-membership route. Fake fetch only; no wall clock (fake timers).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import * as api from "./index";
import {
  AUDIENCE_RUNG_MEMBERS_PATH,
  AudienceRungMembershipError,
  CANONICAL_CONCURRENCY,
  CANONICAL_REQUEST_TIMEOUT_MS,
  CONTEXT_WORDS,
  DEPTH_WORDS,
  MAX_CANONICAL_LOOKUPS,
  ONLINE_CARD_ANCHOR_PATH,
  RESOLVE_PERSON_PATH,
  atomicRungTerm,
  composeConnectionsFromSets,
  createPrincipalCanonicaliser,
  heldNoteKey,
  isOldWebIdMember,
  membersToAsk,
  opaqueSelf,
  placementLabel,
  readConnections,
  resolveOnlineCard,
  resolvePersonCard,
  type AtomicPlacement,
  type AudienceRungSetRecord,
  type ConnectionsReading,
} from "./index";

afterEach(() => vi.useRealTimers());

const IDENTITY = "https://id.example.test";
const PF = { context: "personal", depth: "first-degree" } as const;
const XF = { context: "professional", depth: "first-degree" } as const;
const uuid = "00000000-0000-4000-8000-000000000001";

function set(p: AtomicPlacement, members: string[]): AudienceRungSetRecord {
  return { ...p, rungTerm: atomicRungTerm(p), setUri: `https://x/e/${p.context}-${p.depth}`, members };
}

describe("the unit's export list", () => {
  it("is exactly these runtime names", () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        "ATOMIC_PLACEMENTS",
        "AUDIENCE_RUNG_MEMBERS_PATH",
        "AudienceRungMembershipError",
        "CANONICAL_CONCURRENCY",
        "CANONICAL_REQUEST_TIMEOUT_MS",
        "CONTEXT_WORDS",
        "DEPTH_WORDS",
        "DERIVED_UNIONS",
        "MAX_CANONICAL_LOOKUPS",
        "ONLINE_CARD_ANCHOR_PATH",
        "RESOLVE_PERSON_PATH",
        "atomicRungTerm",
        "composeConnectionsFromSets",
        "createPrincipalCanonicaliser",
        "displayPlacements",
        "heldNoteKey",
        "isOldWebIdMember",
        "membersToAsk",
        "opaqueSelf",
        "placementKey",
        "placementLabel",
        "placementOf",
        "placementsEqual",
        "qualifiesForDerivedUnion",
        "readConnections",
        "resolveOnlineCard",
        "resolvePersonCard",
      ].sort(),
    );
  });
});

describe("constants", () => {
  it("name the routes and the limits", () => {
    expect(RESOLVE_PERSON_PATH).toBe("/base/connect/resolve-person");
    expect(ONLINE_CARD_ANCHOR_PATH).toBe("/base/connect/online-card-anchor");
    expect(AUDIENCE_RUNG_MEMBERS_PATH).toBe("/base/connect/audience-rung/members");
    expect(MAX_CANONICAL_LOOKUPS).toBe(50);
    expect(CANONICAL_CONCURRENCY).toBe(4);
    expect(CANONICAL_REQUEST_TIMEOUT_MS).toBe(10_000);
  });
  it("the words of the contexts and depths are as shown to a person", () => {
    expect(CONTEXT_WORDS).toEqual({ personal: "Personal", professional: "Professional", either: "Pers & Pro" });
    expect(DEPTH_WORDS).toEqual({ "close-circle": "Inner Circle", "first-degree": "1st Connection" });
    expect(Object.isFrozen(CONTEXT_WORDS)).toBe(true);
    expect(Object.isFrozen(DEPTH_WORDS)).toBe(true);
    expect(placementLabel({ context: "professional", depth: "close-circle" })).toBe("Professional · Inner Circle");
  });
});

describe("opaqueSelf, isOldWebIdMember, membersToAsk", () => {
  it("an opaque principal answers itself, trimmed and without one trailing slash", () => {
    const p = `${IDENTITY}/base/p/${uuid}`;
    expect(opaqueSelf(p)).toBe(p);
    expect(opaqueSelf(`${p}/`)).toBe(p);
    expect(opaqueSelf(`  ${p}/  `)).toBe(p);
    expect(opaqueSelf(`https://other.example.test/base/p/${uuid.toUpperCase()}`)).toBe(`https://other.example.test/base/p/${uuid.toUpperCase()}`);
  });
  it("anything else is not opaque: a short id, a longer path, a vault root, a bare name, a fragment", () => {
    expect(opaqueSelf(`${IDENTITY}/base/p/${uuid.slice(1)}`)).toBeNull();
    expect(opaqueSelf(`${IDENTITY}/base/p/${uuid}/x`)).toBeNull();
    expect(opaqueSelf(`${IDENTITY}/base/q/${uuid}`)).toBeNull();
    expect(opaqueSelf(`${IDENTITY}/base/p/${uuid}#me`)).toBe(`${IDENTITY}/base/p/${uuid}#me`);
    expect(opaqueSelf("https://ann.example.test/vault")).toBeNull();
    expect(opaqueSelf("ann")).toBeNull();
    expect(opaqueSelf("")).toBeNull();
  });
  it("the old WebID form is the path /i, with or without a trailing slash, on any host", () => {
    expect(isOldWebIdMember("https://ann.example.test/i")).toBe(true);
    expect(isOldWebIdMember("https://ann.example.test/i/")).toBe(true);
    expect(isOldWebIdMember(" https://ann.example.test/i ")).toBe(true);
    expect(isOldWebIdMember("https://ann.example.test/id")).toBe(false);
    expect(isOldWebIdMember("https://ann.example.test/x/i")).toBe(false);
    expect(isOldWebIdMember("https://ann.example.test/vault")).toBe(false);
    expect(isOldWebIdMember("not a url")).toBe(false);
  });
  it("members to ask: opaque ones dropped, /i first, the rest in their given order", () => {
    const o = `${IDENTITY}/base/p/${uuid}`;
    const members = ["https://c.example.test/vault", o, "https://b.example.test/i", "https://a.example.test/vault", "not a url", "https://a.example.test/i"];
    expect(membersToAsk(members)).toEqual([
      "https://b.example.test/i",
      "https://a.example.test/i",
      "https://c.example.test/vault",
      "https://a.example.test/vault",
      "not a url",
    ]);
    expect(membersToAsk([])).toEqual([]);
  });
});

describe("createPrincipalCanonicaliser", () => {
  function recording(answer: (input: string) => Response) {
    const asked: string[] = [];
    const inits: (RequestInit | undefined)[] = [];
    const platform: PlatformClient = {
      origin: `${IDENTITY}/`,
      fetch: async (url, init) => {
        asked.push(new URL(url).searchParams.get("input") ?? "");
        inits.push(init);
        return answer(asked[asked.length - 1]!);
      },
    };
    return { platform, asked, inits };
  }
  const person = (principal: unknown) => new Response(JSON.stringify({ principal }), { status: 200 });

  it("asks GET resolve-person with the member as `input`, accept JSON, on the client's origin", async () => {
    const r = recording(() => person("https://ann.example.test/vault"));
    const c = createPrincipalCanonicaliser(r.platform);
    expect(await c("https://ann.example.test/i")).toBe("https://ann.example.test/vault");
    expect(r.inits[0]).toMatchObject({ method: "GET", headers: { accept: "application/json" } });
    expect(r.inits[0]?.signal).toBeInstanceOf(AbortSignal);
  });
  it("an empty or blank member is null with no request; the member is trimmed before it is asked", async () => {
    const r = recording(() => person("P"));
    const c = createPrincipalCanonicaliser(r.platform);
    expect(await c("")).toBeNull();
    expect(await c("   ")).toBeNull();
    expect(await c("  https://ann.example.test/i  ")).toBe("P");
    expect(r.asked).toEqual(["https://ann.example.test/i"]);
    expect(c.answered("  https://ann.example.test/i ")).toBe(true);
  });
  it("a principal is trimmed; a blank or non-string principal is an answer of null", async () => {
    const r = recording((m) => (m.endsWith("/a") ? person("  P  ") : m.endsWith("/b") ? person("   ") : person(7)));
    const c = createPrincipalCanonicaliser(r.platform);
    expect(await c("https://x.example.test/a")).toBe("P");
    expect(await c("https://x.example.test/b")).toBeNull();
    expect(await c("https://x.example.test/c")).toBeNull();
    expect(c.answered("https://x.example.test/b")).toBe(true);
    expect(c.answered("https://x.example.test/c")).toBe(true);
  });
  it("400 and 404 are kept answers of null; 500, 429 and a thrown fetch are not answers and are asked again", async () => {
    let status = 400;
    const asked: string[] = [];
    const platform: PlatformClient = { origin: IDENTITY, fetch: async (url) => (asked.push(url), new Response("{}", { status })) };
    const c = createPrincipalCanonicaliser(platform);
    expect(await c("https://x.example.test/a")).toBeNull();
    expect(await c("https://x.example.test/a")).toBeNull();
    expect(asked).toHaveLength(1);
    status = 404;
    expect(await c("https://x.example.test/b")).toBeNull();
    expect(c.answered("https://x.example.test/b")).toBe(true);
    for (const s of [500, 429, 403]) {
      status = s;
      const m = `https://x.example.test/s${s}`;
      expect(await c(m)).toBeNull();
      expect(c.answered(m)).toBe(false);
      const before = asked.length;
      await c(m);
      expect(asked.length).toBe(before + 1);
    }
  });
  it("a non-answer is not kept, but it still counts against the bound once it was sent", async () => {
    let up = false;
    const asked: string[] = [];
    const platform: PlatformClient = {
      origin: IDENTITY,
      fetch: async (url) => {
        asked.push(url);
        if (!up) throw new TypeError("offline");
        return new Response(JSON.stringify({ principal: "P" }), { status: 200 });
      },
    };
    const c = createPrincipalCanonicaliser(platform, { maxLookups: 2 });
    expect(await c("https://x.example.test/a")).toBeNull();
    expect(await c("https://x.example.test/a")).toBeNull();
    expect(asked).toHaveLength(2);
    up = true;
    expect(await c("https://x.example.test/a")).toBeNull(); // past the bound
    expect(asked).toHaveLength(2);
    expect(c.answered("https://x.example.test/a")).toBe(false);
  });
  it("the default bound is MAX_CANONICAL_LOOKUPS requests", async () => {
    const r = recording(() => person("P"));
    const c = createPrincipalCanonicaliser(r.platform);
    for (let i = 0; i < MAX_CANONICAL_LOOKUPS + 5; i++) await c(`https://m${i}.example.test/vault`);
    expect(r.asked).toHaveLength(MAX_CANONICAL_LOOKUPS);
  });
  it("two calls for one member at the same time send one request", async () => {
    const r = recording(() => person("P"));
    const c = createPrincipalCanonicaliser(r.platform);
    const [a, b] = await Promise.all([c("https://x.example.test/a"), c("https://x.example.test/a")]);
    expect([a, b]).toEqual(["P", "P"]);
    expect(r.asked).toHaveLength(1);
  });
  it("an opaque member sends nothing, is answered, and is not counted toward the bound", async () => {
    const r = recording(() => person("P"));
    const c = createPrincipalCanonicaliser(r.platform, { maxLookups: 1 });
    const o = `${IDENTITY}/base/p/${uuid}`;
    expect(await c(`  ${o}/ `)).toBe(o);
    expect(c.answered(`${o}/`)).toBe(true);
    expect(c.answered(o)).toBe(false); // answered is keyed by the member as given (trimmed), not by the principal it names
    expect(await c("https://x.example.test/a")).toBe("P");
    expect(r.asked).toHaveLength(1);
  });
  it("the request ends as 'could not be asked' after CANONICAL_REQUEST_TIMEOUT_MS (fake timers), and is not an answer", async () => {
    vi.useFakeTimers();
    const platform: PlatformClient = { origin: IDENTITY, fetch: () => new Promise<Response>(() => undefined) };
    const c = createPrincipalCanonicaliser(platform);
    let settled: string | null | undefined;
    const p = c("https://x.example.test/a").then((v) => (settled = v));
    await vi.advanceTimersByTimeAsync(CANONICAL_REQUEST_TIMEOUT_MS - 1);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBeNull();
    expect(c.answered("https://x.example.test/a")).toBe(false);
  });
});

describe("resolvePersonCard: the rest of the contract", () => {
  const conn = (sets: AudienceRungSetRecord[]): ConnectionsReading => ({ holder: "H", vaultId: "H", sets, people: composeConnectionsFromSets(sets) });
  const quiet: PlatformClient = { origin: IDENTITY, fetch: async () => new Response("{}", { status: 404 }) };

  it("a blank principal is no party and reads nothing", async () => {
    let read = 0;
    const got = await resolvePersonCard({ platform: quiet, connections: async () => (read++, conn([])), canonical: async () => null }, { principal: "   " });
    expect(got).toEqual({ party: null, how: "none", placements: [], link: { state: "none" }, anchor: null, connections: "not-read" });
    expect(read).toBe(0);
  });
  it("a principal is trimmed; one the holder placed is a placement, one not placed is 'none'; a failed read is 'failed'", async () => {
    const d = { platform: quiet, connections: async () => conn([set(PF, ["P1"])]), canonical: async () => null };
    expect(await resolvePersonCard(d, { principal: " P1 " })).toMatchObject({ party: "P1", how: "placement", placements: [PF], connections: "read" });
    expect(await resolvePersonCard(d, { principal: "P2" })).toMatchObject({ party: "P2", how: "none", placements: [], connections: "read" });
    const failing = { ...d, connections: async () => Promise.reject(new Error("down")) };
    expect(await resolvePersonCard(failing, { principal: "P1" })).toMatchObject({ party: "P1", how: "none", placements: [], connections: "failed" });
  });
  it("a record whose link is not 'linked' asks nothing and is not matched", async () => {
    let asked = 0;
    const d = { platform: quiet, connections: async () => conn([]), canonical: async () => null, resolve: async () => (asked++, { kind: "none" as const }) };
    for (const link of [{ state: "none" }, { state: "ambiguous" }, { state: "malformed" }] as const) {
      const got = await resolvePersonCard(d, { record: { uri: "https://h.example.test/vault/e/r", link } });
      expect(got).toEqual({ party: null, how: "none", placements: [], link, anchor: null, connections: "not-read" });
    }
    expect(asked).toBe(0);
  });
  it("the resolver seam is called with the record's address; a throw is 'unavailable' status 0; a non-person answer is not matched", async () => {
    const link = { state: "linked", target: "T" } as const;
    const seen: string[] = [];
    const d = { platform: quiet, connections: async () => conn([]), canonical: async () => null };
    const thrown = await resolvePersonCard({ ...d, resolve: async (r) => (seen.push(r), Promise.reject(new Error("x"))) }, { record: { uri: "R", link } });
    expect(seen).toEqual(["R"]);
    expect(thrown).toMatchObject({ party: null, how: "none", anchor: { kind: "unavailable", status: 0 }, connections: "not-read" });
    const org = await resolvePersonCard({ ...d, resolve: async () => ({ kind: "organization" as const, vaultId: "V", entity: "E" }) }, { record: { uri: "R", link } });
    expect(org).toMatchObject({ party: null, how: "none", anchor: { kind: "organization" }, connections: "not-read" });
  });
  it("without a resolver seam, the platform's own anchor route is asked once with the record", async () => {
    const seen: string[] = [];
    const platform: PlatformClient = {
      origin: IDENTITY,
      fetch: async (url) => (seen.push(url), new Response(JSON.stringify({ kind: "person", principal: "P1", entity: "E" }), { status: 200 })),
    };
    const got = await resolvePersonCard(
      { platform, connections: async () => conn([set(XF, ["P1"])]), canonical: async () => null },
      { record: { uri: "https://h.example.test/vault/e/r", link: { state: "linked", target: "T" } } },
    );
    expect(seen).toEqual([`${IDENTITY}${ONLINE_CARD_ANCHOR_PATH}?record=${encodeURIComponent("https://h.example.test/vault/e/r")}`]);
    expect(got).toMatchObject({ party: "P1", how: "placement", placements: [XF] });
  });
  it("members are asked at most CANONICAL_CONCURRENCY at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    const canonical = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      await Promise.resolve();
      inFlight--;
      return null;
    };
    const members = Array.from({ length: 10 }, (_, i) => `https://m${i}.example.test/vault`);
    await resolvePersonCard({ platform: quiet, connections: async () => conn([set(PF, members)]), canonical }, { principal: "P" });
    expect(peak).toBe(CANONICAL_CONCURRENCY);
  });
  it("a canonicaliser that throws for a member is 'no answer' for it, and the card still works", async () => {
    const d = {
      platform: quiet,
      connections: async () => conn([set(PF, ["https://a.example.test/vault", "https://b.example.test/vault"])]),
      canonical: async (m: string) => {
        if (m.startsWith("https://a.")) throw new Error("boom");
        return "P";
      },
    };
    expect(await resolvePersonCard(d, { principal: "P" })).toMatchObject({ how: "placement", placements: [PF] });
  });
  it("an opaque member that names another principal is never taken for the party, and sends no request", async () => {
    const asked: string[] = [];
    const platform: PlatformClient = { origin: IDENTITY, fetch: async (url) => (asked.push(url), new Response("{}", { status: 404 })) };
    const other = `${IDENTITY}/base/p/${uuid}`;
    const d = { platform, connections: async () => conn([set(PF, [other])]), canonical: createPrincipalCanonicaliser(platform) };
    expect(await resolvePersonCard(d, { principal: "https://ann.example.test/vault" })).toMatchObject({ how: "none", placements: [] });
    expect(asked).toEqual([]);
  });
  it("two cards on one canonicaliser at the same time ask each member once", async () => {
    const asked: string[] = [];
    const platform: PlatformClient = {
      origin: IDENTITY,
      fetch: async (url) => (asked.push(new URL(url).searchParams.get("input") ?? ""), new Response(JSON.stringify({ principal: "https://ann.example.test/vault" }), { status: 200 })),
    };
    const members = ["https://m0.example.test/i", "https://m1.example.test/vault"];
    const d = { platform, connections: async () => conn([set(PF, members)]), canonical: createPrincipalCanonicaliser(platform) };
    const [a, b] = await Promise.all([resolvePersonCard(d, { principal: "https://ann.example.test/vault" }), resolvePersonCard(d, { principal: "https://ben.example.test/vault" })]);
    expect(a.placements).toEqual([PF]);
    expect(b.placements).toEqual([]);
    expect([...asked].sort()).toEqual([...members].sort());
  });
  it("two spellings of one person joined: the union in display order, as copies", async () => {
    const d = {
      platform: quiet,
      connections: async () => conn([set(XF, ["https://a.example.test/i"]), set(PF, ["P"])]),
      canonical: async () => "P",
    };
    const got = await resolvePersonCard(d, { principal: "P" });
    expect(got.placements).toEqual([PF, XF]);
    expect(got.placements[0]).not.toBe(api.ATOMIC_PLACEMENTS[0]);
  });
  it("the union has each circle once, even when both spellings sit in the same circle, whatever order the circles were stored in", async () => {
    const d = {
      platform: quiet,
      connections: async () => conn([set(XF, ["P", "https://a.example.test/i"]), set(PF, ["https://a.example.test/i"])]),
      canonical: async () => "P",
    };
    expect((await resolvePersonCard(d, { principal: "P" })).placements).toEqual([PF, XF]);
  });
});

describe("resolveOnlineCard: what the ported tests leave out", () => {
  const answering = (status: number, body: unknown, headers: Record<string, string> = {}): PlatformClient => ({
    origin: IDENTITY,
    fetch: async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers }),
  });
  it("429 is 'busy' with Retry-After in milliseconds, or null when it names no time", async () => {
    expect(await resolveOnlineCard(answering(429, {}, { "retry-after": "3" }), "R")).toEqual({ kind: "busy", retryAfterMs: 3000 });
    expect(await resolveOnlineCard(answering(429, {}), "R")).toEqual({ kind: "busy", retryAfterMs: null });
  });
  it("the record is trimmed before it is sent; a blank one is 'none' with no request", async () => {
    const seen: string[] = [];
    const platform: PlatformClient = { origin: IDENTITY, fetch: async (url) => (seen.push(url), new Response("{}", { status: 404 })) };
    await resolveOnlineCard(platform, "  R1  ");
    expect(seen).toEqual([`${IDENTITY}${ONLINE_CARD_ANCHOR_PATH}?record=R1`]);
    expect(await resolveOnlineCard(platform, "   ")).toEqual({ kind: "none" });
    expect(seen).toHaveLength(1);
  });
  it("sends a GET that accepts JSON and is not cached", async () => {
    let init: RequestInit | undefined;
    const platform: PlatformClient = { origin: IDENTITY, fetch: async (_u, i) => ((init = i), new Response("{}", { status: 404 })) };
    await resolveOnlineCard(platform, "R");
    expect(init).toMatchObject({ method: "GET", headers: { accept: "application/json" }, cache: "no-store" });
  });
  it("the bound is passed through: an already-cancelled signal is 'unavailable', status 0", async () => {
    const ac = new AbortController();
    ac.abort();
    const never: PlatformClient = { origin: IDENTITY, fetch: () => new Promise<Response>(() => undefined) };
    expect(await resolveOnlineCard(never, "R", { signal: ac.signal })).toEqual({ kind: "unavailable", status: 0 });
  });
  it("the vault's own type word decides before the kind word; the kind word is the fallback; entity and principal are trimmed", async () => {
    const out = await resolveOnlineCard(answering(200, { kind: "organization", vaultRepresents: "x/Person", principal: " P ", entity: " E " }), "R");
    expect(out).toEqual({ kind: "person", principal: "P", entity: "E" });
    expect(await resolveOnlineCard(answering(200, { kind: "person", principal: "P" }), "R")).toEqual({ kind: "person", principal: "P", entity: "" });
    expect(await resolveOnlineCard(answering(200, { vaultRepresents: "x/Organization", vaultId: " V " }), "R")).toEqual({ kind: "organization", vaultId: "V", entity: "" });
    expect(await resolveOnlineCard(answering(200, { vaultRepresents: "x/Organization" }), "R")).toEqual({ kind: "unavailable", status: 200 });
  });
  it("any other status is 'unavailable' with that status", async () => {
    expect(await resolveOnlineCard(answering(500, {}), "R")).toEqual({ kind: "unavailable", status: 500 });
    expect(await resolveOnlineCard(answering(403, {}), "R")).toEqual({ kind: "unavailable", status: 403 });
  });
});

describe("readConnections: the rest of the contract", () => {
  const sets = [set(PF, ["P1"])];
  it("with no vault named, it asks the client's origin, without a query, and never calls vaultOrigin", async () => {
    const seen: string[] = [];
    const client: PlatformClient = { origin: `${IDENTITY}///`, fetch: async (url, init) => (seen.push(`${init?.method} ${url}`), new Response(JSON.stringify({ holder: "H", sets }), { status: 200 })) };
    let called = 0;
    for (const vaultId of [undefined, "", "   "]) {
      const got = await readConnections(client, { vaultId, vaultOrigin: () => (called++, "https://never.example.test") });
      expect(got).toEqual({ holder: "H", vaultId: undefined, sets, people: [{ principal: "P1", placements: [PF] }] });
    }
    expect(called).toBe(0);
    expect(seen).toEqual(Array(3).fill(`GET ${IDENTITY}${AUDIENCE_RUNG_MEMBERS_PATH}`));
  });
  it("with a vault named, it is trimmed, sent in the query, and the (maybe async) origin has its trailing slashes removed", async () => {
    const seen: string[] = [];
    const client: PlatformClient = { origin: "https://unused.example.test", fetch: async (url) => (seen.push(url), new Response(JSON.stringify({ holder: "H", vaultId: "V", sets: [] }), { status: 200 })) };
    await readConnections(client, { vaultId: "  https://h.example.test/base  ", vaultOrigin: async (v) => (expect(v).toBe("https://h.example.test/base"), "https://node.example.test//") });
    expect(seen).toEqual([`https://node.example.test${AUDIENCE_RUNG_MEMBERS_PATH}?vaultId=${encodeURIComponent("https://h.example.test/base")}`]);
  });
  it("a missing `sets` is an empty list, not an error", async () => {
    const client: PlatformClient = { origin: IDENTITY, fetch: async () => new Response(JSON.stringify({ holder: "H" }), { status: 200 }) };
    expect(await readConnections(client, { vaultOrigin: () => IDENTITY })).toEqual({ holder: "H", vaultId: undefined, sets: [], people: [] });
  });
  it("`admit` is passed to the composition", async () => {
    const client: PlatformClient = { origin: IDENTITY, fetch: async () => new Response(JSON.stringify({ holder: "H", sets: [set(PF, ["P1", "P2"])] }), { status: 200 }) };
    const got = await readConnections(client, { vaultOrigin: () => IDENTITY, admit: (m) => m === "P2" });
    expect(got.people).toEqual([{ principal: "P2", placements: [PF] }]);
  });
  it("a refused read is an AudienceRungMembershipError with the status and the body as detail; an unreadable body gives no detail", async () => {
    const client: PlatformClient = { origin: IDENTITY, fetch: async () => new Response("nope", { status: 403 }) };
    const e = await readConnections(client, { vaultOrigin: () => IDENTITY }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AudienceRungMembershipError);
    expect(e).toBeInstanceOf(Error);
    expect(e).toMatchObject({ name: "AudienceRungMembershipError", status: 403, message: "AudienceRungMembership 403 — nope" });
    const bare = new AudienceRungMembershipError(500, "");
    expect(bare.message).toBe("AudienceRungMembership 500");
    const broken: PlatformClient = { origin: IDENTITY, fetch: async () => ({ ok: false, status: 502, text: () => Promise.reject(new Error("x")) }) as unknown as Response };
    expect(await readConnections(broken, { vaultOrigin: () => IDENTITY }).catch((x: unknown) => x)).toMatchObject({ status: 502, message: "AudienceRungMembership 502" });
  });
});

describe("heldNoteKey: trimming", () => {
  it("a linked principal wins over everything and is trimmed; a record is trimmed", () => {
    expect(heldNoteKey({ linkedPrincipal: "  P ", linked: true, linkAnswer: "organization", record: "R" })).toBe("P");
    expect(heldNoteKey({ record: "  R  " })).toBe("R");
    expect(heldNoteKey({ record: "   " })).toBeNull();
    expect(heldNoteKey({ record: null })).toBeNull();
  });
});
