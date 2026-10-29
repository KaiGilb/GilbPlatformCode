// Pins every export of the unit and the behaviours the ported tests leave open. A fake fetch, fake timers, no network, no wall clock.
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformError, type PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import * as unit from "./index";
import {
  DEFAULT_BUSY_WAIT_MS,
  FIND_BY_NAME_PATH,
  LINK_SLUG,
  LinkRefusedError,
  MAX_BUSY_WAIT_MS,
  MAX_CANDIDATES,
  MIN_BUSY_WAIT_MS,
  ONLINE_CARD_READ_PATH,
  ONLINE_CARD_REQUEST_TIMEOUT_MS,
  WORDS,
  cardName,
  contactPointsOf,
  createOnlineCardController,
  findOnlineCardCandidates,
  findOnlineCardResult,
  isConnected,
  linkWrite,
  parseOnlineCard,
  readOnlineCard,
  rungChipWords,
  rungWords,
  unlinkWrite,
  type ControllerDeps,
} from "./index";

afterEach(() => vi.useRealTimers());

const ORIGIN = "https://id.example.test";
const ANN = "https://ann.example.test/vault";
const BEN = "https://ben.example.test/vault";
const RECORD = "https://holder.example.test/base/e/rec1";
const HOLDER = "https://holder.example.test/vault";

function platformOf(handler: (url: URL, init: RequestInit | undefined) => Response | Promise<Response>, log: { url: string; init: RequestInit | undefined }[] = []): PlatformClient {
  return {
    origin: ORIGIN,
    fetch: async (url, init) => {
      log.push({ url, init });
      return handler(new URL(url), init);
    },
  };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const field = (principal: string, f: string, value: string, extra: Record<string, unknown> = {}) => ({ principal, field: f, value, sourceEntity: `${principal}/e/${f}`, rung: "public", ...extra });
const tick = () => vi.advanceTimersByTimeAsync(0);

describe("the exports", () => {
  it("are exactly these names at run time", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "DEFAULT_BUSY_WAIT_MS", "FIND_BY_NAME_PATH", "LINK_SLUG", "LinkRefusedError", "MAX_BUSY_WAIT_MS", "MAX_CANDIDATES", "MIN_BUSY_WAIT_MS",
        "ONLINE_CARD_READ_PATH", "ONLINE_CARD_REQUEST_TIMEOUT_MS", "WORDS", "cardName", "contactPointsOf", "createOnlineCardController",
        "findOnlineCardCandidates", "findOnlineCardResult", "isConnected", "linkWrite", "parseOnlineCard", "readOnlineCard", "rungChipWords", "rungWords",
        "unlinkWrite",
      ].sort(),
    );
  });
  it("the constants", () => {
    expect(ONLINE_CARD_REQUEST_TIMEOUT_MS).toBe(10_000);
    expect(MIN_BUSY_WAIT_MS).toBe(1_000);
    expect(MAX_BUSY_WAIT_MS).toBe(60_000);
    expect(DEFAULT_BUSY_WAIT_MS).toBe(5_000);
    expect(MAX_CANDIDATES).toBe(5);
    expect(FIND_BY_NAME_PATH).toBe("/base/connect/find-by-name");
    expect(ONLINE_CARD_READ_PATH).toBe("/base/connect/public-card");
    expect(LINK_SLUG).toBe("sameAs");
  });
  it("the words", () => {
    expect(WORDS).toEqual({
      online: "Their online card",
      local: "My card of them",
      onlineHelp: "What they publish on their own vault, shown at the level that admits you. You cannot change it.",
      localHelp: "Your own record of them. Only you see it.",
      linkedMarker: "Connected",
      findTitle: "Find their online card",
      noGrant: "Connecting grants nobody anything, and they are not told.",
    });
  });
});

describe("linkWrite and unlinkWrite", () => {
  it("LinkRefusedError is an Error with its own name", () => {
    const e = new LinkRefusedError("x");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("LinkRefusedError");
    expect(e.message).toBe("x");
  });
  it("each refusal says why", () => {
    expect(() => linkWrite({ record: "", target: ANN })).toThrow("Refusing to link: no record is named.");
    expect(() => linkWrite({ record: RECORD, target: "ann" })).toThrow("Refusing to link: the card to link to is not an address.");
    expect(() => linkWrite({ record: RECORD, target: RECORD })).toThrow("Refusing to link a record to itself.");
    expect(() => unlinkWrite({ record: "  " })).toThrow("Refusing to unlink: no record is named.");
  });
  it("trims the record and the target; http and https are addresses, other schemes and a missing host are not", () => {
    expect(linkWrite({ record: ` ${RECORD} `, target: ` ${ANN} ` })).toEqual({ record: RECORD, patch: { sameAs: { "@id": ANN } } });
    expect(linkWrite({ record: RECORD, target: "http://ann.example.test/vault" }).patch).toEqual({ sameAs: { "@id": "http://ann.example.test/vault" } });
    for (const bad of ["ftp://ann.example.test/vault", "https://", "file:///x", "//ann.example.test"]) {
      expect(() => linkWrite({ record: RECORD, target: bad }), bad).toThrow(LinkRefusedError);
    }
  });
  it("a record and a target that differ only by spaces are the same record", () => {
    expect(() => linkWrite({ record: ` ${ANN}`, target: ANN })).toThrow(/itself/);
  });
  it("unlinkWrite trims the record and writes null in the one slot", () => {
    expect(unlinkWrite({ record: ` ${RECORD} ` })).toEqual({ record: RECORD, patch: { sameAs: null } });
  });
  it("an absent argument is a missing record, not a crash", () => {
    expect(() => linkWrite({ record: undefined as unknown as string, target: ANN })).toThrow(LinkRefusedError);
    expect(() => unlinkWrite({ record: undefined as unknown as string })).toThrow(LinkRefusedError);
  });
});

describe("rungWords and rungChipWords", () => {
  it("rungWords", () => {
    expect(rungWords("  ")).toBe("");
    expect(rungWords(undefined as unknown as string)).toBe("");
    expect(rungWords("t:Some_Odd-RungGrantee")).toBe("Some odd rung");
    expect(rungWords("private")).toBe("Private");
  });
  it("rungChipWords of the ten values, and an unknown value is unchanged", () => {
    expect(rungChipWords("t:EitherContextCloseCircleGrantee")).toBe("Pers & Pro Inner Circle");
    expect(rungChipWords("t:SignedInGrantee")).toBe("Signed in");
    expect(rungChipWords("")).toBe("");
  });
});

describe("parseOnlineCard, cardName, contactPointsOf", () => {
  it("keeps the fields of the principal asked for, with text, once each, the name first", () => {
    const card = parseOnlineCard(ANN, {
      fields: [
        null,
        "text",
        field(ANN, "a:email", "ann@example.test", { kind: "email", slot: "work" }),
        field(BEN, "a:email", "ben@example.test"),
        field(ANN, "a:familyName", "Lund"),
        field(ANN, "a:givenName", "Ann"),
        field(ANN, "", "no predicate"),
        field(ANN, "a:phone", "   "),
        field(ANN, "a:email", "ann@example.test"),
        { ...field(ANN, "a:note", "n"), sourceEntity: "" },
      ],
      skills: [],
      photoUrl: "/p.jpg",
    });
    expect(card.principal).toBe(ANN);
    expect(card.photoUrl).toBe("/p.jpg");
    expect(card.fields.map((f) => f.predicate)).toEqual(["a:givenName", "a:familyName", "a:email", "a:note"]);
    expect(card.fields[2]).toEqual({ predicate: "a:email", value: "ann@example.test", rung: "public", sourceEntity: `${ANN}/e/a:email`, slot: "work", kind: "email" });
    expect(card.fields[3]!.sourceEntity).toBeNull();
    expect("slot" in card.fields[0]!).toBe(false);
    expect("kind" in card.fields[0]!).toBe(false);
  });
  it("a non-string slot or kind is not copied; a missing rung is an empty string", () => {
    const card = parseOnlineCard(ANN, { fields: [{ principal: ANN, field: "a:x", value: "v", slot: 3, kind: {} }] });
    expect(card.fields[0]).toEqual({ predicate: "a:x", value: "v", rung: "", sourceEntity: null });
  });
  it("skills: a skill with no address is dropped; a note is kept only when it has text; photoUrl is null unless a string", () => {
    const card = parseOnlineCard(ANN, {
      fields: "not a list",
      skills: [null, {}, { skillUri: "t:Skill1", rung: "public", note: "  " }, { skillUri: "t:Skill2", note: "ok" }, { skillUri: 3 }],
      photoUrl: 7,
    });
    expect(card.fields).toEqual([]);
    expect(card.skills).toEqual([{ skillUri: "t:Skill1", rung: "public" }, { skillUri: "t:Skill2", rung: "", note: "ok" }]);
    expect(card.photoUrl).toBeNull();
    expect(parseOnlineCard(ANN, {}).skills).toEqual([]);
  });
  it("cardName: given and family, trimmed; one of them; neither", () => {
    const f = (predicate: string, value: string) => ({ predicate, value, rung: "public", sourceEntity: null });
    expect(cardName({ fields: [f("a:familyName", " Lund "), f("a:givenName", " Ann ")] })).toBe("Ann Lund");
    expect(cardName({ fields: [f("a:familyName", "Lund")] })).toBe("Lund");
    expect(cardName({ fields: [f("a:givenName", "  ")] })).toBeNull();
    expect(cardName({ fields: [f("a:email", "x")] })).toBeNull();
  });
  it("contactPointsOf: email, phone and account only, in the card's order, with their rung", () => {
    const f = (predicate: string, value: string, rung = "public") => ({ predicate, value, rung, sourceEntity: null });
    expect(contactPointsOf({ fields: [f("a:account", "@ann", "t:SignedInGrantee"), f("a:jobTitle", "CTO"), f("a:phone", "1"), f("a:email", "e")] })).toEqual([
      { predicate: "a:account", value: "@ann", rung: "t:SignedInGrantee" },
      { predicate: "a:phone", value: "1", rung: "public" },
      { predicate: "a:email", value: "e", rung: "public" },
    ]);
  });
});

describe("readOnlineCard", () => {
  it("a blank principal is none and asks nothing", async () => {
    const log: { url: string; init: RequestInit | undefined }[] = [];
    expect(await readOnlineCard(platformOf(() => json({}), log), "   ")).toEqual({ kind: "none" });
    expect(await readOnlineCard(platformOf(() => json({}), log), undefined as unknown as string)).toEqual({ kind: "none" });
    expect(log).toEqual([]);
  });
  it("is one GET with the json accept header and no-store, the principal trimmed and encoded", async () => {
    const log: { url: string; init: RequestInit | undefined }[] = [];
    await readOnlineCard(platformOf(() => json({ fields: [] }), log), ` ${ANN} `);
    expect(log).toHaveLength(1);
    expect(log[0]!.url).toBe(`${ORIGIN}${ONLINE_CARD_READ_PATH}?principal=${encodeURIComponent(ANN)}`);
    expect(log[0]!.init).toEqual({ method: "GET", cache: "no-store", headers: { accept: "application/json" } });
  });
  it("the card is the one of the trimmed principal", async () => {
    const out = await readOnlineCard(platformOf(() => json({ fields: [field(ANN, "a:email", "e")] })), ` ${ANN} `);
    expect(out.kind === "card" && out.card.principal).toBe(ANN);
    expect(out.kind === "card" && out.card.fields).toHaveLength(1);
  });
  it("429 is busy with the Retry-After in ms, or null when the platform names none", async () => {
    expect(await readOnlineCard(platformOf(() => json({}, 429, { "retry-after": "7" })), ANN)).toEqual({ kind: "busy", retryAfterMs: 7000 });
    expect(await readOnlineCard(platformOf(() => json({}, 429)), ANN)).toEqual({ kind: "busy", retryAfterMs: null });
  });
  it("a 200 with no readable body is unavailable with the status", async () => {
    expect(await readOnlineCard(platformOf(() => new Response("", { status: 200 })), ANN)).toEqual({ kind: "unavailable", status: 200 });
    expect(await readOnlineCard(platformOf(() => new Response("not json", { status: 200 })), ANN)).toEqual({ kind: "unavailable", status: 200 });
    expect(await readOnlineCard(platformOf(() => new Response("[]", { status: 200 })), ANN)).toEqual({ kind: "unavailable", status: 200 });
  });
  it("a bound is passed through: a read the host never answers ends as unavailable after the timeout", async () => {
    vi.useFakeTimers();
    const hung = platformOf(() => new Promise<Response>(() => {}));
    const run = readOnlineCard(hung, ANN, { timeoutMs: 250 });
    await vi.advanceTimersByTimeAsync(249);
    let done = false;
    void run.then(() => (done = true));
    await tick();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await run).toEqual({ kind: "unavailable", status: 0 });
  });
});

describe("findOnlineCardCandidates and findOnlineCardResult", () => {
  const findBody = (people: string[]) => ({ matches: people.map((p) => ({ principal: p, field: "a:givenName", value: "Ann" })) });
  it("one GET with the trimmed, encoded name and limit 50; an empty or missing name asks nothing", async () => {
    const log: { url: string; init: RequestInit | undefined }[] = [];
    const p = platformOf((u) => (u.pathname === FIND_BY_NAME_PATH ? json({ matches: [] }) : json({})), log);
    await findOnlineCardResult(p, "  Ann & Co ");
    expect(log).toHaveLength(1);
    expect(log[0]!.url).toBe(`${ORIGIN}${FIND_BY_NAME_PATH}?name=${encodeURIComponent("Ann & Co")}&limit=50`);
    expect(log[0]!.init).toEqual({ method: "GET", cache: "no-store", headers: { accept: "application/json" } });
    log.length = 0;
    expect(await findOnlineCardResult(p, "")).toEqual({ candidates: [], total: 0 });
    expect(await findOnlineCardResult(p, undefined as unknown as string)).toEqual({ candidates: [], total: 0 });
    expect(log).toEqual([]);
  });
  it("a refused find says what was asked; a find that could not be reached is reworded", async () => {
    await expect(findOnlineCardResult(platformOf(() => json({ error: "x" }, 503)), "ann")).rejects.toThrow(/answered 503/);
    const err = await findOnlineCardResult({ origin: ORIGIN, fetch: async () => { throw new TypeError("offline"); } }, "ann").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlatformError);
    expect((err as PlatformError).message).toMatch(/^The search could not be made: /);
    expect((err as PlatformError).status).toBe(0);
  });
  it("hits with no principal or a blank value are skipped; names come from the hits when the card cannot be read; a 404 card is 'none'", async () => {
    const p = platformOf((u) => {
      if (u.pathname === FIND_BY_NAME_PATH)
        return json({
          matches: [
            { principal: ANN, value: "Ann" },
            { principal: ANN, value: "Ann" },
            { principal: ANN, value: "  " },
            { principal: ANN, value: "Lund" },
            { value: "nobody" },
            { principal: 3, value: "no" },
            { principal: BEN },
          ],
        });
      return u.searchParams.get("principal") === ANN ? json({}, 500) : json({}, 404);
    });
    const out = await findOnlineCardResult(p, "ann");
    expect(out.total).toBe(2);
    expect(out.candidates).toEqual([
      { principal: ANN, name: "Ann Lund", contactPoints: [], cardRead: "unavailable" },
      { principal: BEN, name: null, contactPoints: [], cardRead: "none" },
    ]);
  });
  it("a card's own name wins over the hits' names", async () => {
    const p = platformOf((u) => (u.pathname === FIND_BY_NAME_PATH ? json(findBody([ANN])) : json({ fields: [field(ANN, "a:givenName", "Annabel")] })));
    expect((await findOnlineCardCandidates(p, "ann"))[0]!.name).toBe("Annabel");
  });
  it("the people come in the server's order and `max` cuts them; a max of 0 or less reads no card", async () => {
    const people = [ANN, BEN, "https://cy.example.test/vault"];
    const log: { url: string; init: RequestInit | undefined }[] = [];
    const p = platformOf((u) => (u.pathname === FIND_BY_NAME_PATH ? json(findBody(people)) : json({ fields: [] })), log);
    expect((await findOnlineCardCandidates(p, "x", 2)).map((c) => c.principal)).toEqual([ANN, BEN]);
    log.length = 0;
    const none = await findOnlineCardResult(p, "x", 0);
    expect(none).toEqual({ candidates: [], total: 3 });
    expect(log.filter((l) => l.url.includes(ONLINE_CARD_READ_PATH))).toEqual([]);
  });
  it("no more than three cards are read at once", async () => {
    vi.useFakeTimers();
    const people = Array.from({ length: 5 }, (_, i) => `https://p${i}.example.test/vault`);
    let open = 0;
    let peak = 0;
    const gates: (() => void)[] = [];
    const p = platformOf(async (u) => {
      if (u.pathname === FIND_BY_NAME_PATH) return json(findBody(people));
      open++;
      peak = Math.max(peak, open);
      await new Promise<void>((r) => gates.push(r));
      open--;
      return json({ fields: [] });
    });
    const run = findOnlineCardResult(p, "x");
    await tick();
    expect(open).toBe(3);
    while (gates.length) {
      gates.shift()!();
      await tick();
    }
    expect((await run).candidates).toHaveLength(5);
    expect(peak).toBe(3);
  });
});

describe("the controller", () => {
  function make(over: Partial<ControllerDeps> = {}, handler?: (u: URL) => Response | Promise<Response>) {
    const log: string[] = [];
    const writes: unknown[] = [];
    const platform = platformOf(
      (u) => {
        log.push(u.pathname);
        if (handler) return handler(u);
        if (u.pathname.endsWith("online-card-anchor")) return json({ kind: "person", principal: ANN, entity: "" });
        if (u.pathname === ONLINE_CARD_READ_PATH) return json({ fields: [field(ANN, "a:givenName", "Ann")] });
        if (u.pathname === FIND_BY_NAME_PATH) return json({ matches: [{ principal: ANN, value: "Ann" }] });
        return json({}, 404);
      },
    );
    const deps: ControllerDeps = {
      platform,
      subject: { uri: RECORD, holder: HOLDER, link: { state: "linked", target: ANN } },
      canWrite: true,
      writeLink: async (w) => void writes.push(w),
      ...over,
    };
    return { deps, log, writes };
  }

  it("starts idle, closed, not busy and with no error, carrying the subject's link", () => {
    const m = make();
    expect(createOnlineCardController(m.deps).getState()).toEqual({ link: { state: "linked", target: ANN }, online: { status: "idle" }, find: { status: "closed" }, busy: null, error: null });
  });
  it("an ambiguous or malformed link is not loaded", async () => {
    for (const link of [{ state: "ambiguous" }, { state: "malformed" }, { state: "none" }] as const) {
      const m = make({ subject: { uri: RECORD, holder: HOLDER, link } });
      const c = createOnlineCardController(m.deps);
      await c.load();
      expect(c.getState().online).toEqual({ status: "idle" });
      expect(m.log).toEqual([]);
    }
  });
  it("the party falls back to the principal when the resolver names no entity", async () => {
    const c = createOnlineCardController(make().deps);
    await c.load();
    const s = c.getState().online;
    expect(s.status === "ready" && s.party).toBe(ANN);
  });
  it("the party is the entity when the resolver names one", async () => {
    const c = createOnlineCardController(make({}, (u) => (u.pathname.endsWith("online-card-anchor") ? json({ kind: "person", principal: ANN, entity: "https://ann.example.test/e/1" }) : json({ fields: [] }))).deps);
    await c.load();
    const s = c.getState().online;
    expect(s.status === "ready" && s.party).toBe("https://ann.example.test/e/1");
  });
  it("a card read that answers 404 is 'none', 429 is 'busy'", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    const resolved = (u: URL) => u.pathname.endsWith("online-card-anchor");
    const a = createOnlineCardController(make({}, (u) => (resolved(u) ? json({ kind: "person", principal: ANN, entity: ANN }) : json({}, 404))).deps);
    await a.load();
    expect(a.getState().online).toEqual({ status: "none" });
    const b = createOnlineCardController(make({}, (u) => (resolved(u) ? json({ kind: "person", principal: ANN, entity: ANN }) : json({}, 429, { "retry-after": "2" }))).deps);
    await b.load();
    expect(b.getState().online).toEqual({ status: "busy", retryAt: 7_000 });
    a.dispose();
    b.dispose();
  });
  it("an app-supplied resolve or readCard that rejects is 'unavailable'; resolve's outcomes are all honoured", async () => {
    const m = make();
    const a = createOnlineCardController({ ...m.deps, resolve: () => Promise.reject(new Error("x")) });
    await a.load();
    expect(a.getState().online).toEqual({ status: "unavailable" });
    const b = createOnlineCardController({ ...m.deps, resolve: async () => ({ kind: "person", principal: ANN, entity: ANN }), readCard: () => Promise.reject(new Error("x")) });
    await b.load();
    expect(b.getState().online).toEqual({ status: "unavailable" });
    for (const kind of ["none", "organization", "unauthenticated"] as const) {
      const c = createOnlineCardController({ ...m.deps, resolve: async () => (kind === "organization" ? { kind, vaultId: "v", entity: "e" } : ({ kind } as never)) });
      await c.load();
      expect(c.getState().online).toEqual({ status: kind });
    }
    const busy = createOnlineCardController({ ...m.deps, resolve: async () => ({ kind: "busy", retryAfterMs: null }) });
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    await busy.load();
    expect(busy.getState().online).toEqual({ status: "busy", retryAt: 1_000 + DEFAULT_BUSY_WAIT_MS });
    busy.dispose();
    expect(m.log).toEqual([]);
  });
  it("the default timeout is 10 s: not before, and then 'unavailable'", async () => {
    vi.useFakeTimers();
    const c = createOnlineCardController(make({}, () => new Promise<Response>(() => {})).deps);
    const run = c.load();
    await vi.advanceTimersByTimeAsync(ONLINE_CARD_REQUEST_TIMEOUT_MS - 1);
    expect(c.getState().online.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(2);
    await run;
    expect(c.getState().online.status).toBe("unavailable");
  });
  it("the busy wait is the Retry-After clamped to 1 s and 60 s", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const wait = async (ms: number | null) => {
      const c = createOnlineCardController(make({ resolve: async () => ({ kind: "busy", retryAfterMs: ms }) }).deps);
      await c.load();
      const o = c.getState().online;
      c.dispose();
      return o.status === "busy" ? o.retryAt - 10_000 : -1;
    };
    expect(await wait(0)).toBe(1_000);
    expect(await wait(999)).toBe(1_000);
    expect(await wait(1_000)).toBe(1_000);
    expect(await wait(1_001)).toBe(1_001);
    expect(await wait(59_999)).toBe(59_999);
    expect(await wait(60_000)).toBe(60_000);
    expect(await wait(60_001)).toBe(60_000);
    expect(await wait(null)).toBe(5_000);
  });
  it("a load asked for during a busy wait asks nothing; after the wait it asks again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let calls = 0;
    const c = createOnlineCardController(make({ resolve: async () => (calls++ === 0 ? { kind: "busy", retryAfterMs: 2_000 } : { kind: "person", principal: ANN, entity: ANN }) }).deps);
    await c.load();
    await c.load();
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await c.load();
    expect(calls).toBe(2);
    expect(c.getState().online.status).toBe("ready");
  });
  it("subscribe returns an unsubscribe; dispose drops every listener and stops state changes", async () => {
    const m = make();
    const c = createOnlineCardController(m.deps);
    let a = 0;
    let b = 0;
    const off = c.subscribe(() => a++);
    c.subscribe(() => b++);
    c.openFind("x");
    expect([a, b]).toEqual([0, 0]);
    c.closeFind();
    expect([a, b]).toEqual([1, 1]);
    c.dispose();
    c.openFind("y");
    await c.load();
    expect([a, b]).toEqual([1, 1]);
    expect(c.getState().find).toEqual({ status: "closed" });
    off();
  });
  it("openFind does nothing without the right to write; with it, it clears an error and opens with the prefill as given", async () => {
    const m = make({ subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } }, writeLink: async () => { throw new Error("no"); } });
    const c = createOnlineCardController(m.deps);
    await c.confirmLink({ principal: ANN });
    expect(c.getState().error).toBe("no");
    c.openFind("  Ann ");
    expect(c.getState().find).toEqual({ status: "idle", query: "  Ann " });
    expect(c.getState().error).toBeNull();
    const ro = createOnlineCardController({ ...m.deps, canWrite: false });
    ro.openFind("x");
    expect(ro.getState().find).toEqual({ status: "closed" });
  });
  it("a blank search goes back to idle with the text as typed, and asks nothing", async () => {
    const m = make({ subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } } });
    const c = createOnlineCardController(m.deps);
    c.openFind("x");
    await c.search("   ");
    expect(c.getState().find).toEqual({ status: "idle", query: "   " });
    expect(m.log).toEqual([]);
  });
  it("a search trims its text, says 'searching', then lists; a failed search carries the message", async () => {
    const m = make({ subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } } });
    const c = createOnlineCardController(m.deps);
    c.openFind("x");
    const run = c.search("  Ann ");
    expect(c.getState().find).toEqual({ status: "searching", query: "Ann" });
    await run;
    const f = c.getState().find;
    expect(f.status === "results" && f.query).toBe("Ann");
    const bad = createOnlineCardController(make({ subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } } }, () => json({}, 500)).deps);
    bad.openFind("x");
    await bad.search("Ann");
    const e = bad.getState().find;
    expect(e.status === "error" && e.message).toMatch(/answered 500/);
  });
  it("a search that answers after the find box was opened afresh does not overwrite it (a result or an error)", async () => {
    vi.useFakeTimers();
    for (const answer of [() => json({ matches: [{ principal: ANN, value: "Ann" }] }), () => json({}, 500)]) {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const m = make({ subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } } }, async (u) => {
        if (u.pathname === FIND_BY_NAME_PATH) await gate;
        return u.pathname === FIND_BY_NAME_PATH ? answer() : json({ fields: [] });
      });
      const c = createOnlineCardController(m.deps);
      c.openFind("a");
      const run = c.search("a");
      await tick();
      c.openFind("b");
      release();
      await run;
      expect(c.getState().find).toEqual({ status: "idle", query: "b" });
    }
  });
  it("busy is set while a link or an unlink is written, and a second act in that moment is refused", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const m = make({ subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } }, writeLink: async (w) => { await gate; void w; } });
    const c = createOnlineCardController(m.deps);
    const run = c.confirmLink({ principal: ANN });
    expect(c.getState().busy).toEqual({ act: "link" });
    await c.unlink();
    expect(c.getState().busy).toEqual({ act: "link" });
    release();
    await run;
    expect(c.getState().busy).toBeNull();
    const writes: unknown[] = [];
    let release2!: () => void;
    const gate2 = new Promise<void>((r) => (release2 = r));
    const u = createOnlineCardController({ ...m.deps, writeLink: async (w) => { await gate2; writes.push(w); } });
    const un = u.unlink();
    expect(u.getState().busy).toEqual({ act: "unlink" });
    release2();
    await un;
    expect(u.getState().busy).toBeNull();
    expect(writes).toHaveLength(1);
  });
  it("a refused write (a thrown value that is not an Error) says it as text, and clears busy", async () => {
    const m = make({ subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } }, writeLink: () => Promise.reject("plain text") });
    const c = createOnlineCardController(m.deps);
    await c.confirmLink({ principal: ANN });
    expect(c.getState().error).toBe("plain text");
    expect(c.getState().busy).toBeNull();
  });
  it("a link the platform's address rules refuse is never written", async () => {
    const m = make({ subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } } });
    const c = createOnlineCardController(m.deps);
    await c.confirmLink({ principal: "not an address" });
    expect(m.writes).toEqual([]);
    expect(c.getState().error).toMatch(/not an address/);
  });
  it("unlink on a record with no uri is refused before any write", async () => {
    const m = make({ subject: { uri: "", holder: HOLDER, link: { state: "linked", target: ANN } } });
    const c = createOnlineCardController(m.deps);
    await c.unlink();
    expect(m.writes).toEqual([]);
    expect(c.getState().error).toMatch(/no record is named/);
    expect(c.getState().link).toEqual({ state: "linked", target: ANN });
  });
  it("isConnected is true only for one reference", () => {
    expect(isConnected(null)).toBe(false);
    expect(isConnected({ sameAs: "https://ann.example.test/vault" })).toBe(false);
    expect(isConnected({ sameAs: [{ "@id": ANN }] })).toBe(true);
  });
});
