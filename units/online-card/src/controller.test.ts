// The online card controller. Every guard of it has a test here.
import { describe, expect, it } from "vitest";
import { createOnlineCardController, isConnected, type ControllerDeps } from "./controller";
import { ONLINE_CARD_ANCHOR_PATH } from "@kaigilb/gilbplatformcode-person-connections";
import { ONLINE_CARD_READ_PATH } from "./publicCard";
import { FIND_BY_NAME_PATH } from "./find";
import type { LinkReading } from "@kaigilb/gilbplatformcode-online-card-link";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

const RECORD = "https://holder.example.test/base/e/rec1";
const HOLDER = "https://holder.example.test/vault";
const ANN = "https://ann.example.test/vault";

interface World {
  deps: ControllerDeps;
  http: string[];
  writes: { link: unknown[] };
  /** Every request that was not a GET: the controller may write nothing to the platform. */
  nonGet: string[];
  setResolve(status: number, body?: unknown): void;
  setCard(status: number, body?: unknown): void;
  linkChanged: LinkReading[];
}

function world(opts: { link?: LinkReading; canWrite?: boolean } = {}): World {
  const http: string[] = [];
  const nonGet: string[] = [];
  let resolve: { status: number; body: unknown } = { status: 200, body: { kind: "person", principal: ANN, entity: ANN } };
  let card: { status: number; body: unknown } = {
    status: 200,
    body: {
      principal: ANN,
      fields: [
        { principal: ANN, field: "a:givenName", value: "Ann", sourceEntity: "https://ann.example.test/base/e/gn", claimVaultId: ANN, rung: "public" },
        { principal: ANN, field: "a:email", value: "ann@example.org", sourceEntity: "https://ann.example.test/base/e/em", claimVaultId: ANN, rung: "public", kind: "email" },
      ],
      skills: [],
    },
  };
  const platform: PlatformClient = {
    origin: "https://id.example.test",
    fetch: async (url, init) => {
      const u = new URL(url);
      if (init?.method && init.method !== "GET") nonGet.push(`${init.method} ${u.pathname}`);
      http.push(`${u.pathname}${u.search}`);
      if (u.pathname === ONLINE_CARD_ANCHOR_PATH) return new Response(JSON.stringify(resolve.body), { status: resolve.status });
      if (u.pathname === ONLINE_CARD_READ_PATH) return new Response(JSON.stringify(card.body), { status: card.status });
      if (u.pathname === FIND_BY_NAME_PATH)
        return new Response(JSON.stringify({ total: 1, connectVaultId: "x", matches: [{ principal: ANN, field: "a:givenName", value: "Ann", sourceEntity: "e", claimVaultId: ANN, rung: "public" }] }), { status: 200 });
      return new Response("{}", { status: 404 });
    },
  };
  const w: World = {
    http,
    writes: { link: [] },
    nonGet,
    linkChanged: [],
    setResolve: (status, body) => (resolve = { status, body: body ?? {} }),
    setCard: (status, body) => (card = { status, body: body ?? {} }),
    deps: undefined as unknown as ControllerDeps,
  };
  w.deps = {
    platform,
    subject: { uri: RECORD, holder: HOLDER, link: opts.link ?? { state: "none" } },
    canWrite: opts.canWrite ?? true,
    writeLink: async (l) => void w.writes.link.push(l),
    onLinkChanged: (l) => w.linkChanged.push(l),
  };
  return w;
}
const linked = (): LinkReading => ({ state: "linked", target: ANN });
const emailField = { predicate: "a:email", value: "ann@example.org", rung: "public", sourceEntity: "https://ann.example.test/base/e/em" };

describe("opening a card is lazy and bounded", () => {
  it("nothing is requested until load(), and an unlinked record asks neither the resolver nor a card", async () => {
    const w = world();
    const c = createOnlineCardController(w.deps);
    expect(w.http).toEqual([]);
    await c.load();
    expect(w.http).toEqual([]);
    expect(c.getState().online).toEqual({ status: "idle" });
  });
  it("a linked record costs ONE resolve and ONE card read per open", async () => {
    const w = world({ link: linked() });
    const c = createOnlineCardController(w.deps);
    await c.load();
    expect(w.http.filter((h) => h.startsWith(ONLINE_CARD_ANCHOR_PATH)).length).toBe(1);
    expect(w.http.filter((h) => h.startsWith(ONLINE_CARD_READ_PATH)).length).toBe(1);
    expect(w.http.length).toBe(2);
    const s = c.getState().online;
    expect(s.status).toBe("ready");
    if (s.status === "ready") expect(s.party).toBe(ANN);
  });
  it("the resolver gets the record only; the card read is keyed by the principal the resolver named", async () => {
    const w = world({ link: linked() });
    await createOnlineCardController(w.deps).load();
    expect(w.http[0]).toBe(`${ONLINE_CARD_ANCHOR_PATH}?record=${encodeURIComponent(RECORD)}`);
    expect(w.http[1]).toBe(`${ONLINE_CARD_READ_PATH}?principal=${encodeURIComponent(ANN)}`);
  });
});

describe("what the online side says", () => {
  it("the platform's one refusal is 'none'; an organization answer is 'organization'; 401 is 'unauthenticated'", async () => {
    const w = world({ link: linked() });
    w.setResolve(404, { code: "no_online_card" });
    const c = createOnlineCardController(w.deps);
    await c.load();
    expect(c.getState().online).toEqual({ status: "none" });
    w.setResolve(200, { kind: "organization", vaultId: "https://o.example.test/base", entity: "e" });
    await c.load();
    expect(c.getState().online).toEqual({ status: "organization" });
    w.setResolve(401, {});
    await c.load();
    expect(c.getState().online).toEqual({ status: "unauthenticated" });
  });
  it("a failure to ask is 'unavailable', never 'none'", async () => {
    const w = world({ link: linked() });
    w.setResolve(503, {});
    const c = createOnlineCardController(w.deps);
    await c.load();
    expect(c.getState().online).toEqual({ status: "unavailable" });
    w.setResolve(200, { kind: "person", principal: ANN, entity: ANN });
    w.setCard(500, {});
    await c.load();
    expect(c.getState().online).toEqual({ status: "unavailable" });
  });
});

describe("No copy: the source is the source", () => {
  it("copies nothing: loading the card writes no claim and no request but reads", async () => {
    const w = world({ link: linked() });
    await createOnlineCardController(w.deps).load();
    expect(w.nonGet).toEqual([]);
    expect(w.writes.link).toEqual([]);
  });
  it("the controller offers no way to copy a field or list copies", async () => {
    const w = world({ link: linked() });
    const c = createOnlineCardController(w.deps) as unknown as Record<string, unknown>;
    await (c as unknown as { load(): Promise<void> }).load();
    for (const gone of ["useField", "removeUsed", "isUsed", "changedSinceCopied", "isCopyable"]) expect(c[gone], gone).toBeUndefined();
    const state = (c as unknown as { getState(): Record<string, unknown> }).getState();
    expect(state.used).toBeUndefined();
    const online = state.online as Record<string, unknown>;
    expect(online.status).toBe("ready");
    expect(online.references).toBeUndefined();
  });
  it("the deps carry no copy path, and opening, linking and unlinking write no held claim", async () => {
    const w = world({ link: linked() });
    for (const gone of ["listUsed", "heldSpellings", "isReference", "createUsed", "deleteUsed"]) expect((w.deps as unknown as Record<string, unknown>)[gone], gone).toBeUndefined();
    const c = createOnlineCardController(w.deps);
    await c.load();
    await c.unlink();
    c.openFind("Ann");
    await c.confirmLink({ principal: ANN });
    expect(w.nonGet).toEqual([]);
    expect(JSON.stringify(w.writes.link)).not.toMatch(/HeldPartyFieldClaim|sourceRecordId|onlinecard/);
  });
  it("a reader who cannot write the record can link nothing, unlink nothing", async () => {
    const w = world({ link: linked(), canWrite: false });
    const c = createOnlineCardController(w.deps);
    await c.load();
    await c.unlink();
    c.openFind("Ann");
    await c.confirmLink({ principal: ANN });
    expect(w.writes).toEqual({ link: [] });
    expect(c.getState().link).toEqual(linked());
  });
});

describe("Find and connect", () => {
  it("only an unlinked record opens it, and searching writes nothing", async () => {
    const w = world();
    const c = createOnlineCardController(w.deps);
    c.openFind("Ann N");
    expect(c.getState().find).toEqual({ status: "idle", query: "Ann N" });
    await c.search("Ann N");
    expect(w.writes).toEqual({ link: [] });
    const f = c.getState().find;
    expect(f.status).toBe("results");
    const l = createOnlineCardController(world({ link: linked() }).deps);
    l.openFind("x");
    expect(l.getState().find).toEqual({ status: "closed" });
  });
  it("the link is written only when the holder confirms a candidate, and it is the link alone", async () => {
    const w = world();
    const c = createOnlineCardController(w.deps);
    c.openFind("Ann");
    await c.search("Ann");
    expect(w.writes.link).toEqual([]);
    await c.confirmLink({ principal: ANN });
    expect(w.writes.link).toEqual([{ record: RECORD, patch: { sameAs: { "@id": ANN } } }]);
    expect(w.nonGet).toEqual([]);
    expect(c.getState().link).toEqual({ state: "linked", target: ANN });
    expect(w.linkChanged).toEqual([{ state: "linked", target: ANN }]);
    expect(c.getState().find).toEqual({ status: "closed" });
    expect(c.getState().online.status).toBe("ready");
  });
  it("a search cut at the limit says how many there are: total beside the shown count", async () => {
    const w = world();
    const many = Array.from({ length: 9 }, (_, i) => `https://p${i}.example.test/vault`);
    const inner = w.deps.platform.fetch;
    w.deps.platform = { ...w.deps.platform, fetch: async (url, init) => (new URL(url).pathname === FIND_BY_NAME_PATH ? new Response(JSON.stringify({ total: 9, matches: many.map((p) => ({ principal: p, field: "a:givenName", value: "Ann" })) }), { status: 200 }) : inner(url, init)) };
    const c = createOnlineCardController(w.deps);
    c.openFind("Ann");
    await c.search("Ann");
    const f = c.getState().find;
    expect(f.status === "results" && f.candidates.length).toBe(5);
    expect(f.status === "results" && f.total).toBe(9);
    expect(f.status === "results" && f.cutAt).toBe(5);
  });
  it("an answer that was not cut has no cut notice", async () => {
    const w = world();
    const c = createOnlineCardController(w.deps);
    c.openFind("Ann");
    await c.search("Ann");
    const f = c.getState().find;
    expect(f.status === "results" && f.total).toBe(1);
    expect(f.status === "results" && f.cutAt).toBe(null);
  });
  it("a failed link write leaves the record unlinked and says so", async () => {
    const w = world();
    w.deps.writeLink = async () => {
      throw new Error("412 changed elsewhere");
    };
    const c = createOnlineCardController(w.deps);
    await c.confirmLink({ principal: ANN });
    expect(c.getState().link).toEqual({ state: "none" });
    expect(c.getState().error).toMatch(/412/);
    expect(w.linkChanged).toEqual([]);
  });
  it("a failed search is an error, never an empty list", async () => {
    const w = world();
    const c = createOnlineCardController({ ...w.deps, platform: { origin: "https://id.example.test", fetch: async () => new Response("{}", { status: 500 }) } });
    c.openFind("Ann");
    await c.search("Ann");
    expect(c.getState().find.status).toBe("error");
  });
});

describe("Unlink changes nothing else", () => {
  it("retracts the link alone: no claim deleted, the local side not re-read, no rung touched", async () => {
    const w = world({ link: linked() });
    const c = createOnlineCardController(w.deps);
    await c.load();
    await c.unlink();
    expect(w.writes.link).toEqual([{ record: RECORD, patch: { sameAs: null } }]);
    expect(w.nonGet).toEqual([]);
    expect(c.getState().online).toEqual({ status: "idle" });
    expect(c.getState().link).toEqual({ state: "none" });
    expect(w.linkChanged).toEqual([{ state: "none" }]);
  });
  it("a read still in flight when the holder unlinks is dropped, not drawn", async () => {
    const w = world({ link: linked() });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = w.deps.platform.fetch;
    w.deps.platform = { ...w.deps.platform, fetch: async (u, i) => (await gate, inner(u, i)) };
    const c = createOnlineCardController(w.deps);
    const loading = c.load();
    await c.unlink();
    release();
    await loading;
    expect(c.getState().online).toEqual({ status: "idle" });
    // the dropped load stops at the resolver's answer: it does not go on to read a card nobody will see
    expect(w.http.filter((h) => h.startsWith("/base/connect/public-card"))).toEqual([]);
  });
  it("a failed unlink leaves the link", async () => {
    const w = world({ link: linked() });
    w.deps.writeLink = async () => {
      throw new Error("403");
    };
    const c = createOnlineCardController(w.deps);
    await c.load();
    await c.unlink();
    expect(c.getState().link).toEqual(linked());
    expect(c.getState().online.status).toBe("ready");
    expect(c.getState().error).toMatch(/403/);
  });
});

describe("the list marker", () => {
  it("is derived from the link the list already read, with no request", () => {
    expect(isConnected({ sameAs: { "@id": ANN } })).toBe(true);
    expect(isConnected({ "a:sameAs": { "@id": ANN } })).toBe(true);
    expect(isConnected({ "owl:sameAs": { "@id": ANN } })).toBe(false);
    expect(isConnected({})).toBe(false);
    expect(isConnected(undefined)).toBe(false);
    expect(isConnected({ sameAs: [{ "@id": ANN }, { "@id": "https://x.example.test/vault" }] })).toBe(false);
  });
});

describe("a card open is shared, not doubled", () => {
  it("two load() calls at once (a StrictMode remount) cost one resolve and one card read", async () => {
    const w = world({ link: linked() });
    const c = createOnlineCardController(w.deps);
    await Promise.all([c.load(), c.load()]);
    expect(w.http.length).toBe(2);
  });
  it("load(true) after a failure asks again", async () => {
    const w = world({ link: linked() });
    w.setResolve(503, {});
    const c = createOnlineCardController(w.deps);
    await c.load();
    expect(c.getState().online.status).toBe("unavailable");
    w.setResolve(200, { kind: "person", principal: ANN, entity: ANN });
    await c.load(true);
    expect(c.getState().online.status).toBe("ready");
  });
});

describe("an app whose card is its connection hands the party and the card over", () => {
  it("resolve and readCard replace the two requests: a card open then asks the platform nothing", async () => {
    const w = world({ link: linked() });
    const cards: string[] = [];
    const c = createOnlineCardController({
      ...w.deps,
      resolve: async () => ({ kind: "person", principal: ANN, entity: ANN }),
      readCard: async (p) => {
        cards.push(p);
        return { kind: "card", card: { principal: p, fields: [{ predicate: "a:email", value: "ann@example.org", rung: "public", sourceEntity: null }], skills: [], photoUrl: null } };
      },
    });
    await c.load();
    expect(w.http).toEqual([]);
    expect(cards).toEqual([ANN]);
    const s = c.getState().online;
    expect(s.status).toBe("ready");
    if (s.status === "ready") expect(s.party).toBe(ANN);
  });
});
